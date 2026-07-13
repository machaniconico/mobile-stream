import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { argv, cwd, exit } from "node:process";
import { pathToFileURL } from "node:url";
import {
  androidNativeDebugArtifactPath,
  androidNativeVerificationArtifactPath
} from "./release-artifact-policy.mjs";
import { inspectAndroidDebugApkFile } from "./verify-distribution-artifacts.mjs";

export const androidNativeVerificationArtifactGroup = "android";
export const rootEncoderR8SeedsPath =
  "android/app/build/outputs/mapping/contractMinified/seeds.txt";
export const rootEncoderAwaitedDisconnectSignature =
  "com.pedro.rtmp.rtmp.RtmpClient: java.lang.Object disconnect(boolean,kotlin.coroutines.Continuation)";
export const rootEncoderAwaitedDisconnectContractId = "rootencoder-rtmp-awaited-disconnect-v1";
export const rootEncoderAwaitedDisconnectSignatureSha256 = createHash("sha256")
  .update(rootEncoderAwaitedDisconnectSignature)
  .digest("hex");

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
    const apkPath = canonicalWorkspaceRelativePath(options.apkPath);
    const reportPath = canonicalWorkspaceRelativePath(options.reportJsonPath);
    if (!apkPath || !reportPath) {
      throw new Error("Android native verification paths must be canonical workspace-relative paths.");
    }
    assertNoSymlinkedParentDirectories(apkPath, "Android native debug artifact");
    assertNoSymlinkedParentDirectories(reportPath, "Android native verification report");
    assertNoSymlinkedParentDirectories(rootEncoderR8SeedsPath, "Android RootEncoder R8 contract seeds");

    const startedAt = new Date().toISOString();
    rmSync(resolve(apkPath), { force: true });
    rmSync(resolve(reportPath), { force: true });
    rmSync(resolve(rootEncoderR8SeedsPath), { force: true });
    const command =
      "source scripts/rn-env.sh && cd android && ./gradlew assembleDebug testDebugUnitTest assembleContractMinified";
    const result = spawnSync("bash", ["-lc", command], { cwd: cwd(), stdio: "inherit" });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`Android Gradle build failed with exit code ${result.status ?? "unknown"}.`);
    }
    verifyRootEncoderR8Contract();
    const finishedAt = new Date().toISOString();
    const report = createAndroidNativeVerificationReport({
      apkPath,
      reportPath,
      command,
      startedAt,
      finishedAt,
      gitCommit: commandOutput("git", ["rev-parse", "HEAD"]),
      gradleVersion: gradleVersion()
    });
    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    writeFileSync(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Android native verification passed for ${apkPath}.`);
    console.log(`Android native verification report written to ${reportPath}.`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export function verifyRootEncoderR8Contract(seedsPath = rootEncoderR8SeedsPath) {
  const canonicalSeedsPath = canonicalWorkspaceRelativePath(seedsPath);
  assertRegularArtifact(canonicalSeedsPath, "Android RootEncoder R8 contract seeds");
  const seeds = readFileSync(resolve(canonicalSeedsPath), "utf8");
  if (!seeds.includes(rootEncoderAwaitedDisconnectSignature)) {
    throw new Error("Minified Android artifact removed the awaited RootEncoder disconnect contract.");
  }
}

export function createAndroidNativeVerificationReport({
  apkPath = androidNativeDebugArtifactPath,
  reportPath = androidNativeVerificationArtifactPath,
  command,
  startedAt,
  finishedAt,
  gitCommit,
  gradleVersion,
  r8SeedsPath = rootEncoderR8SeedsPath
}) {
  const canonicalApkPath = canonicalWorkspaceRelativePath(apkPath);
  const canonicalReportPath = canonicalWorkspaceRelativePath(reportPath);
  const canonicalR8SeedsPath = canonicalWorkspaceRelativePath(r8SeedsPath);
  assertRegularArtifact(canonicalApkPath, "Android native debug artifact");
  assertRegularArtifact(canonicalR8SeedsPath, "Android RootEncoder R8 contract seeds");
  const inspection = inspectAndroidDebugApkFile(resolve(canonicalApkPath), { displayPath: canonicalApkPath });
  if (inspection.failures.length > 0) {
    throw new Error(inspection.failures.join("\n"));
  }
  const startedMs = Date.parse(startedAt);
  const finishedMs = Date.parse(finishedAt);
  const apk = fileRecord(canonicalApkPath);
  const r8Seeds = fileRecord(canonicalR8SeedsPath);
  const report = {
    type: "android-native-verification",
    appName: "MobileLiveCaster",
    platform: "android-debug",
    status: "passed",
    generatedAt: finishedAt,
    startedAt,
    finishedAt,
    durationMs: Number.isFinite(startedMs) && Number.isFinite(finishedMs) ? Math.max(0, finishedMs - startedMs) : null,
    command,
    gitCommit,
    gradleVersion,
    reportPath: canonicalReportPath,
    r8Contract: {
      variant: "contractMinified",
      minified: true,
      verified: true,
      contractId: rootEncoderAwaitedDisconnectContractId,
      signatureSha256: rootEncoderAwaitedDisconnectSignatureSha256,
      seeds: r8Seeds
    },
    apk: {
      ...apk,
      zipEntryCount: inspection.zipEntryCount,
      requiredZipEntries: inspection.requiredZipEntries,
      signature: inspection.signature
    }
  };
  const failures = validateAndroidNativeVerificationReport(report, { reportPath: canonicalReportPath });
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
  return report;
}

export function collectAndroidNativeVerificationArtifactRecords({
  reportPath = androidNativeVerificationArtifactPath,
  required = false
} = {}) {
  if (!existsSync(resolve(reportPath))) {
    if (required) {
      throw new Error(`Android native verification report does not exist: ${reportPath}`);
    }
    return [];
  }
  const canonicalReportPath = canonicalWorkspaceRelativePath(reportPath);
  assertRegularArtifact(canonicalReportPath, "Android native verification report");
  const report = JSON.parse(readFileSync(resolve(canonicalReportPath), "utf8"));
  const failures = validateAndroidNativeVerificationReport(report, { reportPath: canonicalReportPath });
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
  return [
    artifactRecord(canonicalReportPath),
    artifactRecord(report.apk.path),
    artifactRecord(report.r8Contract.seeds.path)
  ];
}

export function validateAndroidNativeVerificationArtifacts(
  artifacts,
  {
    reportPath = androidNativeVerificationArtifactPath,
    releaseFinishedAt = "",
    releaseGitCommit = "",
    maxAgeHours = 24
  } = {}
) {
  const failures = [];
  const reportArtifact = artifacts.find(
    (artifact) => artifact?.group === androidNativeVerificationArtifactGroup && artifact?.path === reportPath
  );
  if (!reportArtifact) {
    return [`Report is missing Android native verification artifact ${reportPath}.`];
  }
  let report;
  try {
    report = JSON.parse(readFileSync(resolve(reportPath), "utf8"));
  } catch (error) {
    return [`Android native verification report could not be read: ${error instanceof Error ? error.message : String(error)}`];
  }
  failures.push(
    ...validateAndroidNativeVerificationReport(report, {
      reportPath,
      releaseFinishedAt,
      releaseGitCommit,
      maxAgeHours
    })
  );
  const apkArtifact = artifacts.find(
    (artifact) => artifact?.group === androidNativeVerificationArtifactGroup && artifact?.path === report?.apk?.path
  );
  if (!apkArtifact) {
    failures.push(`Report is missing Android native debug artifact ${report?.apk?.path || "-"}.`);
    return failures;
  }
  if (apkArtifact.bytes !== report.apk.bytes || apkArtifact.sha256 !== report.apk.sha256) {
    failures.push("Android native debug artifact metadata does not match the native verification report.");
  }
  if (existsSync(resolve(report.apk.path))) {
    const inspection = inspectAndroidDebugApkFile(resolve(report.apk.path), { displayPath: report.apk.path });
    failures.push(...inspection.failures);
    if (
      inspection.zipEntryCount !== report.apk.zipEntryCount ||
      JSON.stringify(inspection.requiredZipEntries) !== JSON.stringify(report.apk.requiredZipEntries) ||
      JSON.stringify(inspection.signature) !== JSON.stringify(report.apk.signature)
    ) {
      failures.push("Android native debug APK inspection metadata does not match the native verification report.");
    }
  }
  const r8SeedsArtifact = artifacts.find(
    (artifact) =>
      artifact?.group === androidNativeVerificationArtifactGroup &&
      artifact?.path === report?.r8Contract?.seeds?.path
  );
  if (!r8SeedsArtifact) {
    failures.push(`Report is missing Android RootEncoder R8 contract artifact ${report?.r8Contract?.seeds?.path || "-"}.`);
    return failures;
  }
  if (
    r8SeedsArtifact.bytes !== report.r8Contract.seeds.bytes ||
    r8SeedsArtifact.sha256 !== report.r8Contract.seeds.sha256
  ) {
    failures.push("Android RootEncoder R8 contract artifact metadata does not match the native verification report.");
  }
  if (existsSync(resolve(report.r8Contract.seeds.path))) {
    try {
      verifyRootEncoderR8Contract(report.r8Contract.seeds.path);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return failures;
}

export function validateAndroidNativeVerificationReport(
  report,
  { reportPath = androidNativeVerificationArtifactPath, releaseFinishedAt = "", releaseGitCommit = "", maxAgeHours = 24 } = {}
) {
  const failures = [];
  const fail = (message) => failures.push(message);
  if (report?.type !== "android-native-verification" || report?.appName !== "MobileLiveCaster" || report?.platform !== "android-debug") {
    fail("Android native verification identity is invalid.");
  }
  if (report?.status !== "passed") {
    fail(`Android native verification status must be passed, got ${JSON.stringify(report?.status)}.`);
  }
  if (report?.reportPath !== canonicalWorkspaceRelativePath(reportPath)) {
    fail("Android native verification reportPath does not match its release artifact path.");
  }
  if (report?.apk?.path !== androidNativeDebugArtifactPath) {
    fail("Android native verification APK path is invalid.");
  }
  if (typeof report?.gitCommit !== "string" || !/^[a-f0-9]{40,64}$/u.test(report.gitCommit)) {
    fail("Android native verification git commit is missing or invalid.");
  } else if (releaseGitCommit && report.gitCommit !== releaseGitCommit) {
    fail("Android native verification git commit does not match the release candidate report.");
  }
  const startedAt = Date.parse(String(report?.startedAt || ""));
  const finishedAt = Date.parse(String(report?.finishedAt || ""));
  const modifiedAt = Date.parse(String(report?.apk?.modifiedAt || ""));
  const r8SeedsModifiedAt = Date.parse(String(report?.r8Contract?.seeds?.modifiedAt || ""));
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt) {
    fail("Android native verification timestamps are missing or invalid.");
  }
  if (report?.generatedAt !== report?.finishedAt) {
    fail("Android native verification generatedAt must match finishedAt.");
  }
  if (!Number.isFinite(report?.durationMs) || Math.abs(report.durationMs - (finishedAt - startedAt)) > 1_000) {
    fail("Android native verification durationMs does not match its timestamps.");
  }
  if (!Number.isFinite(modifiedAt) || modifiedAt < startedAt - 1_000 || modifiedAt > finishedAt + 1_000) {
    fail("Android native debug APK was not produced during this verification build.");
  }
  if (
    !Number.isFinite(r8SeedsModifiedAt) ||
    r8SeedsModifiedAt < startedAt - 1_000 ||
    r8SeedsModifiedAt > finishedAt + 1_000
  ) {
    fail("Android RootEncoder R8 contract seeds were not produced during this verification build.");
  }
  const releaseFinishedMs = Date.parse(String(releaseFinishedAt || ""));
  if (Number.isFinite(releaseFinishedMs) && Number.isFinite(finishedAt)) {
    const ageHours = (releaseFinishedMs - finishedAt) / 3_600_000;
    if (ageHours < -5 / 60) {
      fail("Android native verification finished after the release candidate report.");
    } else if (ageHours > maxAgeHours) {
      fail(`Android native verification is ${Math.round(ageHours * 100) / 100}h old, above the ${maxAgeHours}h release-report gate.`);
    }
  }
  if (
    typeof report?.command !== "string" ||
    !report.command.includes("./gradlew assembleDebug") ||
    !report.command.includes("assembleContractMinified")
  ) {
    fail("Android native verification command is invalid.");
  }
  if (typeof report?.gradleVersion !== "string" || !report.gradleVersion.startsWith("Gradle ")) {
    fail("Android native verification Gradle version is missing or invalid.");
  }
  if (
    report?.r8Contract?.variant !== "contractMinified" ||
    report?.r8Contract?.minified !== true ||
    report?.r8Contract?.verified !== true ||
    report?.r8Contract?.contractId !== rootEncoderAwaitedDisconnectContractId ||
    report?.r8Contract?.signatureSha256 !== rootEncoderAwaitedDisconnectSignatureSha256 ||
    report?.r8Contract?.seeds?.path !== rootEncoderR8SeedsPath ||
    !Number.isInteger(report?.r8Contract?.seeds?.bytes) ||
    report.r8Contract.seeds.bytes <= 0 ||
    !/^[a-f0-9]{64}$/u.test(report?.r8Contract?.seeds?.sha256 || "")
  ) {
    fail("Android RootEncoder minified disconnect contract evidence is invalid.");
  }
  if (!Number.isInteger(report?.apk?.bytes) || report.apk.bytes <= 1_048_576 || !/^[a-f0-9]{64}$/u.test(report?.apk?.sha256 || "")) {
    fail("Android native verification APK file metadata is invalid.");
  }
  if (
    !Number.isInteger(report?.apk?.zipEntryCount) ||
    report.apk.zipEntryCount <= 0 ||
    !Array.isArray(report?.apk?.requiredZipEntries) ||
    !report.apk.requiredZipEntries.includes("AndroidManifest.xml") ||
    !report.apk.requiredZipEntries.includes("classes.dex")
  ) {
    fail("Android native verification APK ZIP metadata is invalid.");
  }
  if (report?.apk?.signature?.verified !== true || report.apk.signature.signerCount < 1 || !report.apk.signature.schemes?.includes("v2")) {
    fail("Android native verification APK signature metadata is invalid.");
  }
  return failures;
}

function fileRecord(path) {
  const content = readFileSync(resolve(path));
  const stat = statSync(resolve(path));
  return {
    path,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
    modifiedAt: stat.mtime.toISOString()
  };
}

function artifactRecord(path) {
  const record = fileRecord(canonicalWorkspaceRelativePath(path));
  return { group: androidNativeVerificationArtifactGroup, path: record.path, bytes: record.bytes, sha256: record.sha256 };
}

function assertRegularArtifact(path, label) {
  if (!path) {
    throw new Error(`${label} path must be canonical and workspace-relative.`);
  }
  assertNoSymlinkedParentDirectories(path, label);
  const stat = lstatSync(resolve(path));
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${label} must be a regular non-symbolic-link file: ${path}`);
  }
}

function assertNoSymlinkedParentDirectories(path, label) {
  const parts = path.split("/").filter(Boolean);
  let currentPath = cwd();
  for (const part of parts.slice(0, -1)) {
    currentPath = join(currentPath, part);
    if (!existsSync(currentPath)) {
      return;
    }
    const stat = lstatSync(currentPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} path parent must not be a symbolic link: ${relative(cwd(), currentPath)}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`${label} path parent must point to a directory: ${relative(cwd(), currentPath)}`);
    }
  }
}

function canonicalWorkspaceRelativePath(path) {
  if (typeof path !== "string" || !path || isAbsolute(path)) {
    return "";
  }
  const normalized = relative(cwd(), resolve(path)).split(sep).join("/");
  if (!normalized || normalized === ".." || normalized.startsWith("../") || normalized !== path) {
    return "";
  }
  return normalized;
}

function gradleVersion() {
  const result = spawnSync("bash", ["-lc", "source scripts/rn-env.sh && cd android && ./gradlew --version"], {
    cwd: cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return result.status === 0 ? result.stdout.match(/Gradle\s+[^\s]+/u)?.[0] || "" : "";
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { cwd: cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return result.status === 0 ? result.stdout.trim() : "";
}

function parseArgs(args) {
  const options = { help: false, apkPath: androidNativeDebugArtifactPath, reportJsonPath: androidNativeVerificationArtifactPath };
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--apk=")) {
      options.apkPath = arg.slice("--apk=".length);
    } else if (arg.startsWith("--report-json=")) {
      options.reportJsonPath = arg.slice("--report-json=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printUsage() {
  console.log("Usage: npm run verify:android-native -- [--apk=path] [--report-json=path]");
}

function isDirectRun() {
  return Boolean(argv[1] && import.meta.url === pathToFileURL(argv[1]).href);
}
