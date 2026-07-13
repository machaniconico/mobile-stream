import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  androidNativeDebugArtifactPath,
  androidNativeVerificationArtifactPath,
  iosNativeVerificationArtifactPath
} from "./release-artifact-policy.mjs";
import { inspectAndroidDebugApkFile, resolveAndroidApkSignerPath } from "./verify-distribution-artifacts.mjs";
import {
  rootEncoderAwaitedDisconnectContractId,
  rootEncoderAwaitedDisconnectSignature,
  rootEncoderAwaitedDisconnectSignatureSha256,
  rootEncoderR8SeedsPath
} from "./verify-android-native.mjs";

let cachedAndroidDebugApkFixture;

export function nativeBuildFixturePaths(fixtureRoot) {
  const derivedDataPath = `${fixtureRoot}/ios-derived`;
  const appPath = `${derivedDataPath}/Build/Products/Debug-iphonesimulator/MobileLiveCaster.app`;
  const embeddedExtensionPath = `${appPath}/PlugIns/MobileLiveCasterBroadcastUpload.appex`;
  const standaloneExtensionPath = `${derivedDataPath}/Build/Products/Debug-iphonesimulator/MobileLiveCasterBroadcastUpload.appex`;
  const filePaths = {
    appInfo: `${appPath}/Info.plist`,
    appExecutable: `${appPath}/MobileLiveCaster`,
    appImplementation: `${appPath}/MobileLiveCaster.debug.dylib`,
    embeddedInfo: `${embeddedExtensionPath}/Info.plist`,
    embeddedExecutable: `${embeddedExtensionPath}/MobileLiveCasterBroadcastUpload`,
    embeddedImplementation: `${embeddedExtensionPath}/MobileLiveCasterBroadcastUpload.debug.dylib`,
    standaloneInfo: `${standaloneExtensionPath}/Info.plist`,
    standaloneExecutable: `${standaloneExtensionPath}/MobileLiveCasterBroadcastUpload`,
    standaloneImplementation: `${standaloneExtensionPath}/MobileLiveCasterBroadcastUpload.debug.dylib`
  };
  return {
    derivedDataPath,
    appPath,
    embeddedExtensionPath,
    standaloneExtensionPath,
    filePaths,
    allPaths: [
      androidNativeDebugArtifactPath,
      androidNativeVerificationArtifactPath,
      rootEncoderR8SeedsPath,
      iosNativeVerificationArtifactPath,
      ...Object.values(filePaths)
    ]
  };
}

export function writeNativeBuildFixture(fixtureRoot) {
  const paths = nativeBuildFixturePaths(fixtureRoot);
  writeFile(androidNativeDebugArtifactPath, createAndroidDebugApkFixture());
  writeFile(rootEncoderR8SeedsPath, `${rootEncoderAwaitedDisconnectSignature}\n`);
  writeFile(
    paths.filePaths.appInfo,
    "<plist><dict><key>CFBundleIdentifier</key><string>com.mobilelivecaster.app</string></dict></plist>"
  );
  writeFile(paths.filePaths.appExecutable, machOFixture("ios-app-executable"));
  writeFile(paths.filePaths.appImplementation, machOFixture("ios-app-implementation"));
  writeFile(
    paths.filePaths.embeddedInfo,
    "<plist><dict><key>CFBundleIdentifier</key><string>com.mobilelivecaster.app.BroadcastUpload</string></dict></plist>"
  );
  writeFile(paths.filePaths.embeddedExecutable, machOFixture("ios-extension-executable"));
  writeFile(paths.filePaths.embeddedImplementation, machOFixture("ios-extension-implementation"));
  writeFile(
    paths.filePaths.standaloneInfo,
    "<plist><dict><key>CFBundleIdentifier</key><string>com.mobilelivecaster.app.BroadcastUpload</string></dict></plist>"
  );
  writeFile(paths.filePaths.standaloneExecutable, machOFixture("ios-extension-executable"));
  writeFile(paths.filePaths.standaloneImplementation, machOFixture("ios-extension-implementation"));

  const finishedAt = new Date().toISOString();
  const startedAt = new Date(Date.parse(finishedAt) - 3_000).toISOString();
  const gitCommit = currentCommit();
  const apkInspection = inspectAndroidDebugApkFile(androidNativeDebugArtifactPath, {
    displayPath: androidNativeDebugArtifactPath
  });
  writeFile(
    androidNativeVerificationArtifactPath,
    JSON.stringify(
      {
        type: "android-native-verification",
        appName: "MobileLiveCaster",
        platform: "android-debug",
        status: "passed",
        generatedAt: finishedAt,
        startedAt,
        finishedAt,
        durationMs: 3_000,
        command:
          "source scripts/rn-env.sh && cd android && ./gradlew assembleDebug testDebugUnitTest assembleContractMinified",
        gitCommit,
        gradleVersion: "Gradle 9.3.1",
        reportPath: androidNativeVerificationArtifactPath,
        r8Contract: {
          variant: "contractMinified",
          minified: true,
          verified: true,
          contractId: rootEncoderAwaitedDisconnectContractId,
          signatureSha256: rootEncoderAwaitedDisconnectSignatureSha256,
          seeds: fileRecord(rootEncoderR8SeedsPath)
        },
        apk: {
          ...fileRecord(androidNativeDebugArtifactPath),
          zipEntryCount: apkInspection.zipEntryCount,
          requiredZipEntries: apkInspection.requiredZipEntries,
          signature: apkInspection.signature
        }
      },
      null,
      2
    )
  );
  writeFile(
    iosNativeVerificationArtifactPath,
    JSON.stringify(
      {
        type: "ios-native-verification",
        appName: "MobileLiveCaster",
        platform: "ios-simulator",
        status: "passed",
        generatedAt: finishedAt,
        startedAt,
        finishedAt,
        durationMs: 3_000,
        command:
          "xcodebuild -workspace MobileLiveCaster.xcworkspace -scheme MobileLiveCaster -configuration Debug -sdk iphonesimulator -destination generic/platform=iOS Simulator build",
        xcodeVersion: "Xcode 26.5",
        gitCommit,
        reportPath: iosNativeVerificationArtifactPath,
        derivedDataPath: paths.derivedDataPath,
        appBundle: {
          path: paths.appPath,
          bytes: 1,
          infoPlist: fileRecord(paths.filePaths.appInfo),
          executable: fileRecord(paths.filePaths.appExecutable),
          implementation: fileRecord(paths.filePaths.appImplementation),
          files: [
            fileRecord(paths.filePaths.appInfo),
            fileRecord(paths.filePaths.appExecutable),
            fileRecord(paths.filePaths.appImplementation),
            fileRecord(paths.filePaths.embeddedInfo),
            fileRecord(paths.filePaths.embeddedExecutable),
            fileRecord(paths.filePaths.embeddedImplementation)
          ].sort((left, right) => left.path.localeCompare(right.path))
        },
        broadcastUploadExtension: {
          embedded: {
            path: paths.embeddedExtensionPath,
            bytes: 1,
            infoPlist: fileRecord(paths.filePaths.embeddedInfo),
            executable: fileRecord(paths.filePaths.embeddedExecutable),
            implementation: fileRecord(paths.filePaths.embeddedImplementation)
          },
          standalone: {
            path: paths.standaloneExtensionPath,
            bytes: 1,
            infoPlist: fileRecord(paths.filePaths.standaloneInfo),
            executable: fileRecord(paths.filePaths.standaloneExecutable),
            implementation: fileRecord(paths.filePaths.standaloneImplementation),
            files: [
              fileRecord(paths.filePaths.standaloneInfo),
              fileRecord(paths.filePaths.standaloneExecutable),
              fileRecord(paths.filePaths.standaloneImplementation)
            ].sort((left, right) => left.path.localeCompare(right.path))
          },
          bundleIdentifier: "com.mobilelivecaster.app.BroadcastUpload",
          extensionPointIdentifier: "com.apple.broadcast-services-upload",
          principalClass: "MobileLiveCasterBroadcastUpload.SampleHandler",
          processMode: "RPBroadcastProcessModeSampleBuffer"
        }
      },
      null,
      2
    )
  );
  return paths;
}

export function createAndroidDebugApkFixture() {
  if (cachedAndroidDebugApkFixture) {
    return cachedAndroidDebugApkFixture;
  }
  const root = mkdtempSync(join(tmpdir(), "mobile-live-caster-apk-fixture-"));
  try {
    const manifest = Buffer.alloc(8);
    manifest.writeUInt16LE(0x0003, 0);
    manifest.writeUInt16LE(8, 2);
    manifest.writeUInt32LE(manifest.length, 4);
    const dex = Buffer.alloc(1_048_576);
    dex.write("dex\n035\0", 0, "ascii");
    const manifestPath = join(root, "AndroidManifest.xml");
    const dexPath = join(root, "classes.dex");
    const apkPath = join(root, "app-debug.apk");
    writeFileSync(manifestPath, manifest);
    writeFileSync(dexPath, dex);
    runFixtureCommand("zip", ["-q", "-0", apkPath, "AndroidManifest.xml", "classes.dex"], root);
    const apkSignerPath = resolveAndroidApkSignerPath();
    if (!apkSignerPath) {
      throw new Error("Android SDK apksigner is required for native build fixtures");
    }
    runFixtureCommand(
      apkSignerPath,
      [
        "sign",
        "--ks",
        "android/app/debug.keystore",
        "--ks-key-alias",
        "androiddebugkey",
        "--ks-pass",
        "pass:android",
        "--key-pass",
        "pass:android",
        "--min-sdk-version",
        "24",
        apkPath
      ],
      process.cwd()
    );
    cachedAndroidDebugApkFixture = readFileSync(apkPath);
    return cachedAndroidDebugApkFixture;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function nativeBuildArtifactRecords(fixtureRoot, artifactRecord) {
  const paths = nativeBuildFixturePaths(fixtureRoot);
  return [
    artifactRecord("android", androidNativeVerificationArtifactPath),
    artifactRecord("android", androidNativeDebugArtifactPath),
    artifactRecord("android", rootEncoderR8SeedsPath),
    artifactRecord("ios", iosNativeVerificationArtifactPath),
    ...Object.values(paths.filePaths).map((path) => artifactRecord("ios", path))
  ];
}

function fileRecord(path) {
  const content = readFileSync(path);
  return {
    path,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
    modifiedAt: statSync(path).mtime.toISOString()
  };
}

function machOFixture(label) {
  return Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.from(label)]);
}

function currentCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function runFixtureCommand(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed while creating Android APK fixture: ${result.stderr || result.error?.message || "unknown"}`);
  }
}
