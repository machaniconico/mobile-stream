import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { argv, cwd, exit, platform } from "node:process";
import { pathToFileURL } from "node:url";
import { assertWritableDirectoryPath, assertWritableRegularPath } from "./ios-release-path-safety.mjs";

const defaultDerivedDataPath = ".artifacts/ios/simulator-build/DerivedData";
const defaultReportPath = ".artifacts/ios-native-verification.json";
const appBundleName = "MobileLiveCaster.app";
const executableName = "MobileLiveCaster";

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
    mkdirSync(dirname(derivedDataPath), { recursive: true });
    mkdirSync(dirname(reportPath), { recursive: true });

    const startedAt = new Date().toISOString();
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
      xcodeVersion: commandOutput("xcodebuild", ["-version"])
    });
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
  reportPath = defaultReportPath,
  command,
  startedAt,
  finishedAt,
  xcodeVersion = ""
}) {
  const appPath = join(resolve(derivedDataPath), "Build/Products/Debug-iphonesimulator", appBundleName);
  const infoPlistPath = join(appPath, "Info.plist");
  const executablePath = join(appPath, executableName);
  assertBuiltAppArtifact(appPath, "iOS simulator app bundle", "directory");
  assertBuiltAppArtifact(infoPlistPath, "iOS simulator app Info.plist", "file");
  assertBuiltAppArtifact(executablePath, "iOS simulator app executable", "file");

  const startedMs = Date.parse(startedAt);
  const finishedMs = Date.parse(finishedAt);
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
    reportPath: relative(cwd(), resolve(reportPath)),
    derivedDataPath: relative(cwd(), resolve(derivedDataPath)),
    appBundle: {
      path: relative(cwd(), appPath),
      bytes: directoryEntrySize(appPath),
      infoPlist: fileRecord(infoPlistPath),
      executable: fileRecord(executablePath)
    }
  };
}

function parseArgs(args) {
  const options = {
    help: false,
    derivedDataPath: defaultDerivedDataPath,
    reportJsonPath: defaultReportPath
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

function directoryEntrySize(path) {
  return statSync(path).size;
}

function fileRecord(path) {
  const content = readFileSync(path);
  return {
    path: relative(cwd(), path),
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
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
