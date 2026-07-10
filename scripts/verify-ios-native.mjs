import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { argv, cwd, exit, platform } from "node:process";
import { pathToFileURL } from "node:url";
import { assertWritableDirectoryPath, assertWritableRegularPath } from "./ios-release-path-safety.mjs";

const defaultDerivedDataPath = ".artifacts/ios/simulator-build/DerivedData";
export const iosNativeVerificationArtifactGroup = "ios";
export const iosNativeVerificationDefaultPath = ".artifacts/ios-native-verification.json";
const appBundleName = "MobileLiveCaster.app";
const executableName = "MobileLiveCaster";
const appImplementationName = "MobileLiveCaster.debug.dylib";
const broadcastExtensionBundleName = "MobileLiveCasterBroadcastUpload.appex";
const broadcastExtensionExecutableName = "MobileLiveCasterBroadcastUpload";
const broadcastExtensionImplementationName = "MobileLiveCasterBroadcastUpload.debug.dylib";

if (isDirectRun()) {
  exit(run(argv.slice(2)));
}

export function run(args = []) {
  try {
    const options = parseArgs(args);
    if (options.help) {
      printUsage();
      return 0;
    }
    if (platform !== "darwin") {
      throw new Error("iOS native verification requires macOS with Xcode.");
    }

    const derivedDataPath = assertWritableDirectoryPath(options.derivedDataPath, "iOS simulator derived data");
    const reportPath = assertWritableRegularPath(options.reportJsonPath, "iOS native verification report");
    const startedAt = new Date().toISOString();
    rmSync(derivedDataPath, { recursive: true, force: true });
    rmSync(reportPath, { force: true });
    mkdirSync(dirname(derivedDataPath), { recursive: true });
    mkdirSync(dirname(reportPath), { recursive: true });

    const buildArgs = createIosSimulatorBuildArgs({ derivedDataPath });
    const result = spawnSync("xcodebuild", buildArgs, {
      cwd: resolve("ios"),
      stdio: "inherit"
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`xcodebuild failed with exit code ${result.status ?? "unknown"}.`);
    }

    const report = createIosNativeVerificationReport({
      derivedDataPath,
      reportPath,
      command: ["xcodebuild", ...buildArgs].join(" "),
      startedAt,
      finishedAt: new Date().toISOString(),
      xcodeVersion: commandOutput("xcodebuild", ["-version"]),
      gitCommit: commandOutput("git", ["rev-parse", "HEAD"])
    });
    const failures = validateIosNativeVerificationReport(report, {
      reportPath: relative(cwd(), reportPath),
      releaseGitCommit: report.gitCommit
    });
    if (failures.length > 0) {
      throw new Error(failures.join("\n"));
    }
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`iOS native verification passed for ${report.appBundle.path}.`);
    console.log(`iOS native verification report written to ${relative(cwd(), reportPath)}.`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export function createIosSimulatorBuildArgs({ derivedDataPath = defaultDerivedDataPath } = {}) {
  return [
    "-workspace",
    "MobileLiveCaster.xcworkspace",
    "-scheme",
    "MobileLiveCaster",
    "-configuration",
    "Debug",
    "-sdk",
    "iphonesimulator",
    "-destination",
    "generic/platform=iOS Simulator",
    "-derivedDataPath",
    resolve(derivedDataPath),
    "-quiet",
    "build"
  ];
}

export function createIosNativeVerificationReport({
  derivedDataPath,
  reportPath = iosNativeVerificationDefaultPath,
  command,
  startedAt,
  finishedAt,
  xcodeVersion = "",
  gitCommit = commandOutput("git", ["rev-parse", "HEAD"])
}) {
  const appPath = join(resolve(derivedDataPath), "Build/Products/Debug-iphonesimulator", appBundleName);
  const buildProductsPath = join(resolve(derivedDataPath), "Build/Products/Debug-iphonesimulator");
  const infoPlistPath = join(appPath, "Info.plist");
  const executablePath = join(appPath, executableName);
  const implementationPath = join(appPath, appImplementationName);
  const embeddedExtensionPath = join(appPath, "PlugIns", broadcastExtensionBundleName);
  const standaloneExtensionPath = join(buildProductsPath, broadcastExtensionBundleName);
  assertBuiltAppArtifact(appPath, "iOS simulator app bundle", "directory");
  assertBuiltAppArtifact(infoPlistPath, "iOS simulator app Info.plist", "file");
  assertBuiltAppArtifact(executablePath, "iOS simulator app executable", "file");
  assertBuiltAppArtifact(implementationPath, "iOS simulator app implementation dylib", "file");
  assertBroadcastExtensionBundle(embeddedExtensionPath, "embedded ReplayKit Broadcast Upload Extension");
  assertBroadcastExtensionBundle(standaloneExtensionPath, "standalone ReplayKit Broadcast Upload Extension build product");

  const startedMs = Date.parse(startedAt);
  const finishedMs = Date.parse(finishedAt);
  const embeddedExtensionInfoPlistPath = join(embeddedExtensionPath, "Info.plist");
  return {
    type: "ios-native-verification",
    appName: "MobileLiveCaster",
    platform: "ios-simulator",
    status: "passed",
    generatedAt: finishedAt,
    startedAt,
    finishedAt,
    durationMs: Number.isFinite(startedMs) && Number.isFinite(finishedMs) ? Math.max(0, finishedMs - startedMs) : null,
    command,
    xcodeVersion,
    gitCommit,
    reportPath: relative(cwd(), resolve(reportPath)),
    derivedDataPath: relative(cwd(), resolve(derivedDataPath)),
    appBundle: {
      path: relative(cwd(), appPath),
      bytes: directoryEntrySize(appPath),
      infoPlist: fileRecord(infoPlistPath),
      executable: fileRecord(executablePath),
      implementation: fileRecord(implementationPath),
      files: collectBundleFileRecords(appPath)
    },
    broadcastUploadExtension: {
      embedded: extensionBundleRecord(embeddedExtensionPath),
      standalone: {
        ...extensionBundleRecord(standaloneExtensionPath),
        files: collectBundleFileRecords(standaloneExtensionPath)
      },
      bundleIdentifier: readPlistValue(embeddedExtensionInfoPlistPath, "CFBundleIdentifier"),
      extensionPointIdentifier: readPlistValue(embeddedExtensionInfoPlistPath, "NSExtension.NSExtensionPointIdentifier"),
      principalClass: readPlistValue(embeddedExtensionInfoPlistPath, "NSExtension.NSExtensionPrincipalClass"),
      processMode: readPlistValue(embeddedExtensionInfoPlistPath, "NSExtension.RPBroadcastProcessMode")
    }
  };
}

export function collectIosNativeVerificationArtifactRecords({
  reportPath = iosNativeVerificationDefaultPath,
  required = false
} = {}) {
  if (!existsSync(resolve(reportPath))) {
    if (required) {
      throw new Error(`iOS native verification report does not exist: ${reportPath}`);
    }
    return [];
  }
  const normalizedReportPath = workspaceRelativePath(reportPath);
  if (!normalizedReportPath) {
    throw new Error(`iOS native verification report path must stay inside the repository: ${reportPath}`);
  }
  const reportArtifact = iosNativeArtifactRecord(normalizedReportPath);
  const report = JSON.parse(readFileSync(resolve(normalizedReportPath), "utf8"));
  const failures = validateIosNativeVerificationReport(report, { reportPath: normalizedReportPath });
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
  return [
    reportArtifact,
    ...iosNativeVerificationRecordedFiles(report).map((entry) => iosNativeArtifactRecord(entry.record.path))
  ];
}

export function validateIosNativeVerificationArtifacts(
  artifacts,
  { reportPath = iosNativeVerificationDefaultPath, releaseFinishedAt = "", releaseGitCommit = "", maxAgeHours = 24 } = {}
) {
  const failures = [];
  const normalizedReportPath = workspaceRelativePath(reportPath);
  const reportArtifact = artifacts.find(
    (artifact) => artifact?.group === iosNativeVerificationArtifactGroup && artifact?.path === normalizedReportPath
  );
  if (!reportArtifact) {
    failures.push(`Report is missing iOS native verification artifact ${reportPath}.`);
    return failures;
  }

  let report;
  try {
    report = JSON.parse(readFileSync(resolve(normalizedReportPath), "utf8"));
  } catch (error) {
    failures.push(`iOS native verification report could not be read: ${error instanceof Error ? error.message : String(error)}`);
    return failures;
  }
  failures.push(
    ...validateIosNativeVerificationReport(report, {
      reportPath: normalizedReportPath,
      releaseFinishedAt,
      releaseGitCommit,
      maxAgeHours
    })
  );

  for (const { label, record } of iosNativeVerificationRecordedFiles(report)) {
    const artifact = artifacts.find(
      (candidate) => candidate?.group === iosNativeVerificationArtifactGroup && candidate?.path === record?.path
    );
    if (!artifact) {
      failures.push(`Report is missing iOS native ${label} artifact ${record?.path || "-"}.`);
      continue;
    }
    if (artifact.bytes !== record.bytes) {
      failures.push(`iOS native ${label} artifact byte size does not match the native verification report.`);
    }
    if (artifact.sha256 !== record.sha256) {
      failures.push(`iOS native ${label} artifact SHA-256 does not match the native verification report.`);
    }
  }
  validateRecordedBundleFileSet(report, failures);
  failures.push(
    ...validateIosNativeArtifactContents(report, (path) =>
      existsSync(resolve(path)) ? readFileSync(resolve(path)) : null
    )
  );
  return failures;
}

export function validateIosNativeVerificationReport(
  report,
  { reportPath = iosNativeVerificationDefaultPath, releaseFinishedAt = "", releaseGitCommit = "", maxAgeHours = 24 } = {}
) {
  const failures = [];
  const fail = (message) => failures.push(message);
  if (report?.type !== "ios-native-verification") {
    fail("iOS native verification type must be ios-native-verification.");
  }
  if (report?.appName !== "MobileLiveCaster") {
    fail("iOS native verification appName must be MobileLiveCaster.");
  }
  if (report?.platform !== "ios-simulator") {
    fail("iOS native verification platform must be ios-simulator.");
  }
  if (report?.status !== "passed") {
    fail(`iOS native verification status must be passed, got ${JSON.stringify(report?.status)}.`);
  }
  const normalizedReportPath = workspaceRelativePath(reportPath);
  if (!normalizedReportPath || report?.reportPath !== normalizedReportPath) {
    fail("iOS native verification reportPath does not match its release artifact path.");
  }
  if (typeof report?.gitCommit !== "string" || !/^[a-f0-9]{40,64}$/u.test(report.gitCommit)) {
    fail("iOS native verification git commit is missing or invalid.");
  } else if (releaseGitCommit && report.gitCommit !== releaseGitCommit) {
    fail("iOS native verification git commit does not match the release candidate report.");
  }
  const startedAt = Date.parse(String(report?.startedAt || ""));
  const finishedAt = Date.parse(String(report?.finishedAt || ""));
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt) {
    fail("iOS native verification timestamps are missing or invalid.");
  }
  if (report?.generatedAt !== report?.finishedAt) {
    fail("iOS native verification generatedAt must match finishedAt.");
  }
  if (!Number.isFinite(report?.durationMs) || report.durationMs < 0 || Math.abs(report.durationMs - (finishedAt - startedAt)) > 1_000) {
    fail("iOS native verification durationMs does not match its timestamps.");
  }
  const releaseFinishedMs = Date.parse(String(releaseFinishedAt || ""));
  if (Number.isFinite(releaseFinishedMs) && Number.isFinite(finishedAt)) {
    const ageHours = (releaseFinishedMs - finishedAt) / 3_600_000;
    if (ageHours < -5 / 60) {
      fail("iOS native verification finished after the release candidate report.");
    } else if (ageHours > maxAgeHours) {
      fail(`iOS native verification is ${Math.round(ageHours * 100) / 100}h old, above the ${maxAgeHours}h release-report gate.`);
    }
  }
  for (const token of [
    "xcodebuild",
    "-workspace MobileLiveCaster.xcworkspace",
    "-scheme MobileLiveCaster",
    "-sdk iphonesimulator",
    "generic/platform=iOS Simulator"
  ]) {
    if (typeof report?.command !== "string" || !report.command.includes(token)) {
      fail(`iOS native verification command is missing ${JSON.stringify(token)}.`);
    }
  }
  if (typeof report?.xcodeVersion !== "string" || !/^Xcode\s+\S+/u.test(report.xcodeVersion)) {
    fail("iOS native verification Xcode version is missing or invalid.");
  }
  if (report?.broadcastUploadExtension?.bundleIdentifier !== "com.mobilelivecaster.app.BroadcastUpload") {
    fail("iOS native verification Broadcast Upload Extension bundle identifier is invalid.");
  }
  if (report?.broadcastUploadExtension?.extensionPointIdentifier !== "com.apple.broadcast-services-upload") {
    fail("iOS native verification ReplayKit extension point identifier is invalid.");
  }
  if (report?.broadcastUploadExtension?.principalClass !== "MobileLiveCasterBroadcastUpload.SampleHandler") {
    fail("iOS native verification ReplayKit principal class is invalid.");
  }
  if (report?.broadcastUploadExtension?.processMode !== "RPBroadcastProcessModeSampleBuffer") {
    fail("iOS native verification ReplayKit process mode is invalid.");
  }

  const appPath = canonicalWorkspaceRelativePath(report?.appBundle?.path);
  const derivedDataPath = canonicalWorkspaceRelativePath(report?.derivedDataPath);
  const embeddedPath = canonicalWorkspaceRelativePath(report?.broadcastUploadExtension?.embedded?.path);
  const standalonePath = canonicalWorkspaceRelativePath(report?.broadcastUploadExtension?.standalone?.path);
  if (!appPath || !derivedDataPath || !appPath.startsWith(`${derivedDataPath}/Build/Products/Debug-iphonesimulator/`)) {
    fail("iOS native verification app bundle path is outside its Debug simulator derived data.");
  }
  if (appPath && embeddedPath !== `${appPath}/PlugIns/${broadcastExtensionBundleName}`) {
    fail("iOS native verification embedded ReplayKit extension path is invalid.");
  }
  const expectedStandalonePath = derivedDataPath
    ? `${derivedDataPath}/Build/Products/Debug-iphonesimulator/${broadcastExtensionBundleName}`
    : "";
  if (!standalonePath || standalonePath !== expectedStandalonePath) {
    fail("iOS native verification standalone ReplayKit extension path is invalid.");
  }

  for (const { label, record, expectedPath } of iosNativeVerificationRecordedFiles(report)) {
    const normalizedPath = canonicalWorkspaceRelativePath(record?.path);
    if (!normalizedPath || normalizedPath !== expectedPath) {
      fail(`iOS native verification ${label} path is invalid.`);
    }
    if (!Number.isInteger(record?.bytes) || record.bytes < 0) {
      fail(`iOS native verification ${label} byte size is missing or invalid.`);
    }
    if (typeof record?.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(record.sha256)) {
      fail(`iOS native verification ${label} SHA-256 is missing or invalid.`);
    }
  }
  const embeddedExecutable = report?.broadcastUploadExtension?.embedded?.executable;
  const standaloneExecutable = report?.broadcastUploadExtension?.standalone?.executable;
  if (embeddedExecutable?.sha256 && standaloneExecutable?.sha256 && embeddedExecutable.sha256 !== standaloneExecutable.sha256) {
    fail("iOS native verification embedded and standalone ReplayKit executable hashes do not match.");
  }
  const embeddedImplementation = report?.broadcastUploadExtension?.embedded?.implementation;
  const standaloneImplementation = report?.broadcastUploadExtension?.standalone?.implementation;
  if (
    embeddedImplementation?.sha256 &&
    standaloneImplementation?.sha256 &&
    embeddedImplementation.sha256 !== standaloneImplementation.sha256
  ) {
    fail("iOS native verification embedded and standalone ReplayKit implementation dylib hashes do not match.");
  }
  validateBundleManifestShape(report?.appBundle?.files, appPath, "app bundle", fail);
  validateBundleManifestShape(
    report?.broadcastUploadExtension?.standalone?.files,
    standalonePath,
    "standalone ReplayKit extension",
    fail
  );
  for (const requiredPath of requiredIosImplementationPaths(appPath, embeddedPath, standalonePath)) {
    const entry = iosNativeVerificationRecordedFiles(report).find((candidate) => candidate.record?.path === requiredPath);
    if (!entry) {
      fail(`iOS native verification bundle manifest is missing required implementation file ${requiredPath}.`);
      continue;
    }
    if (!Number.isInteger(entry.record?.bytes) || entry.record.bytes <= 0) {
      fail(`iOS native verification required implementation file is empty: ${requiredPath}.`);
    }
    const modifiedAt = Date.parse(String(entry.record?.modifiedAt || ""));
    if (
      !requiredPath.endsWith("Info.plist") &&
      (!Number.isFinite(modifiedAt) || modifiedAt < startedAt - 1_000 || modifiedAt > finishedAt + 1_000)
    ) {
      fail(`iOS native verification implementation file was not produced during this build: ${requiredPath}.`);
    }
  }
  validateNamedRecordReferences(report, fail);
  return failures;
}

export function iosNativeVerificationRecordedFiles(report) {
  const records = [
    ...(Array.isArray(report?.appBundle?.files) ? report.appBundle.files : []),
    ...(Array.isArray(report?.broadcastUploadExtension?.standalone?.files)
      ? report.broadcastUploadExtension.standalone.files
      : [])
  ];
  const seen = new Set();
  return records.flatMap((record) => {
    if (!record?.path || seen.has(record.path)) {
      return [];
    }
    seen.add(record.path);
    return [{ label: `bundle file ${record.path}`, record, expectedPath: record.path }];
  });
}

function validateBundleManifestShape(records, bundlePath, label, fail) {
  if (!Array.isArray(records) || records.length === 0) {
    fail(`iOS native verification ${label} file manifest is missing or empty.`);
    return;
  }
  const seen = new Set();
  for (const record of records) {
    const path = canonicalWorkspaceRelativePath(record?.path);
    if (!path || !bundlePath || !path.startsWith(`${bundlePath}/`)) {
      fail(`iOS native verification ${label} contains a non-canonical or escaped file path.`);
      continue;
    }
    if (seen.has(path)) {
      fail(`iOS native verification ${label} contains duplicate file ${path}.`);
    }
    seen.add(path);
    if (!Number.isFinite(Date.parse(String(record?.modifiedAt || "")))) {
      fail(`iOS native verification ${label} file ${path} modifiedAt is missing or invalid.`);
    }
  }
}

function validateNamedRecordReferences(report, fail) {
  const manifest = new Map(iosNativeVerificationRecordedFiles(report).map((entry) => [entry.record?.path, entry.record]));
  for (const [label, record] of [
    ["app Info.plist", report?.appBundle?.infoPlist],
    ["app executable", report?.appBundle?.executable],
    ["app implementation dylib", report?.appBundle?.implementation],
    ["embedded ReplayKit Info.plist", report?.broadcastUploadExtension?.embedded?.infoPlist],
    ["embedded ReplayKit executable", report?.broadcastUploadExtension?.embedded?.executable],
    ["embedded ReplayKit implementation dylib", report?.broadcastUploadExtension?.embedded?.implementation],
    ["standalone ReplayKit Info.plist", report?.broadcastUploadExtension?.standalone?.infoPlist],
    ["standalone ReplayKit executable", report?.broadcastUploadExtension?.standalone?.executable],
    ["standalone ReplayKit implementation dylib", report?.broadcastUploadExtension?.standalone?.implementation]
  ]) {
    const manifestRecord = manifest.get(record?.path);
    if (
      !manifestRecord ||
      manifestRecord.bytes !== record?.bytes ||
      manifestRecord.sha256 !== record?.sha256 ||
      manifestRecord.modifiedAt !== record?.modifiedAt
    ) {
      fail(`iOS native verification ${label} does not match its full bundle manifest record.`);
    }
  }
}

function requiredIosImplementationPaths(appPath, embeddedPath, standalonePath) {
  return [
    appPath ? `${appPath}/Info.plist` : "",
    appPath ? `${appPath}/${executableName}` : "",
    appPath ? `${appPath}/${appImplementationName}` : "",
    embeddedPath ? `${embeddedPath}/Info.plist` : "",
    embeddedPath ? `${embeddedPath}/${broadcastExtensionExecutableName}` : "",
    embeddedPath ? `${embeddedPath}/${broadcastExtensionImplementationName}` : "",
    standalonePath ? `${standalonePath}/Info.plist` : "",
    standalonePath ? `${standalonePath}/${broadcastExtensionExecutableName}` : "",
    standalonePath ? `${standalonePath}/${broadcastExtensionImplementationName}` : ""
  ].filter(Boolean);
}

function validateRecordedBundleFileSet(report, failures) {
  const appPath = canonicalWorkspaceRelativePath(report?.appBundle?.path);
  const standalonePath = canonicalWorkspaceRelativePath(report?.broadcastUploadExtension?.standalone?.path);
  for (const [label, bundlePath, records] of [
    ["app bundle", appPath, report?.appBundle?.files],
    ["standalone ReplayKit extension", standalonePath, report?.broadcastUploadExtension?.standalone?.files]
  ]) {
    if (!bundlePath || !existsSync(resolve(bundlePath))) {
      continue;
    }
    const expectedPaths = new Set((Array.isArray(records) ? records : []).map((record) => record?.path));
    const actualPaths = collectBundleFileRecords(resolve(bundlePath)).map((record) => record.path);
    for (const path of actualPaths) {
      if (!expectedPaths.has(path)) {
        failures.push(`iOS native verification ${label} manifest is missing current bundle file ${path}.`);
      }
    }
    for (const path of expectedPaths) {
      if (!actualPaths.includes(path)) {
        failures.push(`iOS native verification ${label} manifest references missing bundle file ${path}.`);
      }
    }
  }
}

export function validateIosNativeArtifactContents(report, readContent) {
  const failures = [];
  const paths = requiredIosImplementationPaths(
    canonicalWorkspaceRelativePath(report?.appBundle?.path),
    canonicalWorkspaceRelativePath(report?.broadcastUploadExtension?.embedded?.path),
    canonicalWorkspaceRelativePath(report?.broadcastUploadExtension?.standalone?.path)
  );
  for (const path of paths) {
    const content = readContent(path);
    if (!content) {
      failures.push(`iOS native required bundle file cannot be read: ${path}.`);
    } else if (path.endsWith("Info.plist")) {
      if (!hasPlistHeader(content)) {
        failures.push(`iOS native Info.plist is not a binary or XML property list: ${path}.`);
      }
    } else if (!hasMachOMagic(content)) {
      failures.push(`iOS native implementation file is not a Mach-O binary: ${path}.`);
    }
  }
  return failures;
}

function hasMachOMagic(content) {
  if (content.length < 4) {
    return false;
  }
  const magic = content.subarray(0, 4).toString("hex");
  return new Set(["cafebabe", "bebafeca", "cafebabf", "bfbafeca", "feedface", "cefaedfe", "feedfacf", "cffaedfe"]).has(
    magic
  );
}

function hasPlistHeader(content) {
  if (content.subarray(0, 8).toString("ascii") === "bplist00") {
    return true;
  }
  const text = content.subarray(0, Math.min(content.length, 256)).toString("utf8").trimStart();
  return text.startsWith("<?xml") || text.startsWith("<plist");
}

function iosNativeArtifactRecord(path) {
  const normalizedPath = workspaceRelativePath(path);
  if (!normalizedPath) {
    throw new Error(`iOS native artifact path must stay inside the repository: ${path}`);
  }
  assertNoSymlinkedParentDirectories(normalizedPath, "iOS native artifact");
  const stat = lstatSync(resolve(normalizedPath));
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`iOS native artifact must be a regular non-symbolic-link file: ${normalizedPath}`);
  }
  const content = readFileSync(resolve(normalizedPath));
  return {
    group: iosNativeVerificationArtifactGroup,
    path: normalizedPath,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function assertNoSymlinkedParentDirectories(path, label) {
  const parts = path.split("/").filter(Boolean);
  let currentPath = cwd();
  for (const part of parts.slice(0, -1)) {
    currentPath = join(currentPath, part);
    let stat;
    try {
      stat = lstatSync(currentPath);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
    const displayPath = relative(cwd(), currentPath).split(sep).join("/");
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} path parent must not be a symbolic link: ${displayPath}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`${label} path parent must point to a directory: ${displayPath}`);
    }
  }
}

function workspaceRelativePath(path) {
  if (typeof path !== "string" || !path.trim() || isAbsolute(path)) {
    return "";
  }
  const normalized = relative(cwd(), resolve(path));
  if (!normalized || normalized === ".." || normalized.startsWith(`..${sep}`) || isAbsolute(normalized)) {
    return "";
  }
  return normalized.split(sep).join("/");
}

function canonicalWorkspaceRelativePath(path) {
  const normalized = workspaceRelativePath(path);
  return normalized && path === normalized ? normalized : "";
}

function parseArgs(args) {
  const options = {
    help: false,
    derivedDataPath: defaultDerivedDataPath,
    reportJsonPath: iosNativeVerificationDefaultPath
  };
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--derived-data-path=")) {
      options.derivedDataPath = arg.slice("--derived-data-path=".length);
    } else if (arg.startsWith("--report-json=")) {
      options.reportJsonPath = arg.slice("--report-json=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function assertBuiltAppArtifact(path, label, expectedType) {
  if (!existsSync(path)) {
    throw new Error(`${label} was not created: ${path}`);
  }
  const stat = statSync(path);
  if (expectedType === "directory" && !stat.isDirectory()) {
    throw new Error(`${label} must be a directory: ${path}`);
  }
  if (expectedType === "file" && !stat.isFile()) {
    throw new Error(`${label} must be a file: ${path}`);
  }
}

function assertBroadcastExtensionBundle(path, label) {
  const infoPlistPath = join(path, "Info.plist");
  const executablePath = join(path, broadcastExtensionExecutableName);
  const implementationPath = join(path, broadcastExtensionImplementationName);
  assertBuiltAppArtifact(path, label, "directory");
  assertBuiltAppArtifact(infoPlistPath, `${label} Info.plist`, "file");
  assertBuiltAppArtifact(executablePath, `${label} executable`, "file");
  assertBuiltAppArtifact(implementationPath, `${label} implementation dylib`, "file");
}

function directoryEntrySize(path) {
  return statSync(path).size;
}

function extensionBundleRecord(path) {
  return {
    path: relative(cwd(), path),
    bytes: directoryEntrySize(path),
    infoPlist: fileRecord(join(path, "Info.plist")),
    executable: fileRecord(join(path, broadcastExtensionExecutableName)),
    implementation: fileRecord(join(path, broadcastExtensionImplementationName))
  };
}

function fileRecord(path) {
  const content = readFileSync(path);
  const stat = statSync(path);
  return {
    path: relative(cwd(), path),
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
    modifiedAt: stat.mtime.toISOString()
  };
}

function collectBundleFileRecords(bundlePath) {
  const records = [];
  for (const entry of readdirSync(bundlePath, { withFileTypes: true })) {
    const path = join(bundlePath, entry.name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new Error(`iOS native bundle must not contain symbolic links: ${relative(cwd(), path)}`);
    }
    if (stat.isDirectory()) {
      records.push(...collectBundleFileRecords(path));
    } else if (stat.isFile()) {
      records.push(fileRecord(path));
    }
  }
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

function readPlistValue(plistPath, keyPath) {
  return commandOutput("plutil", ["-extract", keyPath, "raw", "-o", "-", plistPath]);
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.status !== 0 || result.error) {
    return "";
  }
  return result.stdout.trim();
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run verify:ios-native -- [--derived-data-path=.artifacts/ios/simulator-build/DerivedData] [--report-json=.artifacts/ios-native-verification.json]",
      "",
      "Builds the iOS simulator app with Xcode and writes a JSON evidence report."
    ].join("\n")
  );
}

function isDirectRun() {
  return Boolean(argv[1] && import.meta.url === pathToFileURL(argv[1]).href);
}
