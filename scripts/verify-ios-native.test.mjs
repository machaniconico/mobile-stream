import { createHash } from "node:crypto";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectIosNativeVerificationArtifactRecords,
  createIosNativeVerificationReport,
  createIosSimulatorBuildArgs
} from "./verify-ios-native.mjs";

const fixtureRoot = ".artifacts/verify-ios-native-test";
const derivedDataPath = `${fixtureRoot}/DerivedData`;
const appPath = `${derivedDataPath}/Build/Products/Debug-iphonesimulator/MobileLiveCaster.app`;
const embeddedExtensionPath = `${appPath}/PlugIns/MobileLiveCasterBroadcastUpload.appex`;
const standaloneExtensionPath = `${derivedDataPath}/Build/Products/Debug-iphonesimulator/MobileLiveCasterBroadcastUpload.appex`;

describe("iOS native verifier", () => {
  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("creates stable xcodebuild simulator args with explicit derived data", () => {
    const args = createIosSimulatorBuildArgs({ derivedDataPath });

    expect(args).toEqual([
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
    ]);
  });

  it("records simulator app bundle evidence after a successful build", () => {
    writeBuiltAppFixture();

    const report = createIosNativeVerificationReport({
      derivedDataPath,
      reportPath: `${fixtureRoot}/ios-native-verification.json`,
      command: "xcodebuild ...",
      startedAt: "2026-07-01T00:00:00.000Z",
      finishedAt: "2026-07-01T00:00:03.000Z",
      xcodeVersion: "Xcode 26.5"
    });

    expect(report).toMatchObject({
      type: "ios-native-verification",
      appName: "MobileLiveCaster",
      platform: "ios-simulator",
      status: "passed",
      durationMs: 3000,
      derivedDataPath,
      appBundle: {
        path: appPath,
        infoPlist: {
          path: join(appPath, "Info.plist"),
          bytes: Buffer.byteLength(plistFixture("com.mobilelivecaster.app")),
          sha256: sha256(plistFixture("com.mobilelivecaster.app"))
        },
        executable: {
          path: join(appPath, "MobileLiveCaster"),
          bytes: machOFixture("executable-bytes\n").byteLength,
          sha256: sha256(machOFixture("executable-bytes\n"))
        }
      },
      broadcastUploadExtension: {
        embedded: {
          path: embeddedExtensionPath,
          infoPlist: {
            path: join(embeddedExtensionPath, "Info.plist"),
            bytes: Buffer.byteLength(plistFixture("com.mobilelivecaster.app.BroadcastUpload")),
            sha256: sha256(plistFixture("com.mobilelivecaster.app.BroadcastUpload"))
          },
          executable: {
            path: join(embeddedExtensionPath, "MobileLiveCasterBroadcastUpload"),
            bytes: machOFixture("extension-executable\n").byteLength,
            sha256: sha256(machOFixture("extension-executable\n"))
          }
        },
        standalone: {
          path: standaloneExtensionPath,
          infoPlist: {
            path: join(standaloneExtensionPath, "Info.plist"),
            bytes: Buffer.byteLength(plistFixture("com.mobilelivecaster.app.BroadcastUpload")),
            sha256: sha256(plistFixture("com.mobilelivecaster.app.BroadcastUpload"))
          },
          executable: {
            path: join(standaloneExtensionPath, "MobileLiveCasterBroadcastUpload"),
            bytes: machOFixture("extension-executable\n").byteLength,
            sha256: sha256(machOFixture("extension-executable\n"))
          }
        }
      }
    });
  });

  it("fails when the expected app executable is missing", () => {
    mkdirSync(appPath, { recursive: true });
    writeFileSync(join(appPath, "Info.plist"), "plist-bytes\n");

    expect(() =>
      createIosNativeVerificationReport({
        derivedDataPath,
        command: "xcodebuild ...",
        startedAt: "2026-07-01T00:00:00.000Z",
        finishedAt: "2026-07-01T00:00:03.000Z"
      })
    ).toThrow(`iOS simulator app executable was not created: ${resolve(join(appPath, "MobileLiveCaster"))}`);
  });

  it("fails when the embedded ReplayKit Broadcast Upload Extension is missing", () => {
    mkdirSync(appPath, { recursive: true });
    writeFileSync(join(appPath, "Info.plist"), "plist-bytes\n");
    writeFileSync(join(appPath, "MobileLiveCaster"), "executable-bytes\n");
    writeFileSync(join(appPath, "MobileLiveCaster.debug.dylib"), machOFixture("implementation-bytes\n"));
    writeBroadcastExtensionFixture(standaloneExtensionPath);

    expect(() =>
      createIosNativeVerificationReport({
        derivedDataPath,
        command: "xcodebuild ...",
        startedAt: "2026-07-01T00:00:00.000Z",
        finishedAt: "2026-07-01T00:00:03.000Z"
      })
    ).toThrow(`embedded ReplayKit Broadcast Upload Extension was not created: ${resolve(embeddedExtensionPath)}`);
  });

  it("rejects native artifact paths under a symlinked derived-data directory", () => {
    const realDerivedDataPath = `${fixtureRoot}/real-derived-data`;
    const linkedDerivedDataPath = `${fixtureRoot}/linked-derived-data`;
    const reportPath = `${fixtureRoot}/ios-native-verification.json`;
    writeBuiltAppFixtureAt(realDerivedDataPath);
    symlinkSync(resolve(realDerivedDataPath), linkedDerivedDataPath, "dir");
    const finishedAt = new Date().toISOString();
    const startedAt = new Date(Date.parse(finishedAt) - 3_000).toISOString();
    const report = createIosNativeVerificationReport({
      derivedDataPath: linkedDerivedDataPath,
      reportPath,
      command:
        "xcodebuild -workspace MobileLiveCaster.xcworkspace -scheme MobileLiveCaster -configuration Debug -sdk iphonesimulator -destination generic/platform=iOS Simulator build",
      startedAt,
      finishedAt,
      xcodeVersion: "Xcode 26.5"
    });
    Object.assign(report.broadcastUploadExtension, {
      bundleIdentifier: "com.mobilelivecaster.app.BroadcastUpload",
      extensionPointIdentifier: "com.apple.broadcast-services-upload",
      principalClass: "MobileLiveCasterBroadcastUpload.SampleHandler",
      processMode: "RPBroadcastProcessModeSampleBuffer"
    });
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    expect(() => collectIosNativeVerificationArtifactRecords({ reportPath })).toThrow(
      `iOS native artifact path parent must not be a symbolic link: ${linkedDerivedDataPath}`
    );
  });
});

function writeBuiltAppFixture() {
  writeBuiltAppFixtureAt(derivedDataPath);
}

function writeBuiltAppFixtureAt(baseDerivedDataPath) {
  const baseAppPath = `${baseDerivedDataPath}/Build/Products/Debug-iphonesimulator/MobileLiveCaster.app`;
  const baseEmbeddedExtensionPath = `${baseAppPath}/PlugIns/MobileLiveCasterBroadcastUpload.appex`;
  const baseStandaloneExtensionPath = `${baseDerivedDataPath}/Build/Products/Debug-iphonesimulator/MobileLiveCasterBroadcastUpload.appex`;
  mkdirSync(baseAppPath, { recursive: true });
  writeFileSync(join(baseAppPath, "Info.plist"), plistFixture("com.mobilelivecaster.app"));
  writeFileSync(join(baseAppPath, "MobileLiveCaster"), machOFixture("executable-bytes\n"));
  writeFileSync(join(baseAppPath, "MobileLiveCaster.debug.dylib"), machOFixture("implementation-bytes\n"));
  writeBroadcastExtensionFixture(baseEmbeddedExtensionPath);
  writeBroadcastExtensionFixture(baseStandaloneExtensionPath);
}

function writeBroadcastExtensionFixture(path) {
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "Info.plist"), plistFixture("com.mobilelivecaster.app.BroadcastUpload"));
  writeFileSync(join(path, "MobileLiveCasterBroadcastUpload"), machOFixture("extension-executable\n"));
  writeFileSync(
    join(path, "MobileLiveCasterBroadcastUpload.debug.dylib"),
    machOFixture("extension-implementation\n")
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function machOFixture(value) {
  return Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.from(value)]);
}

function plistFixture(bundleIdentifier) {
  return `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundleIdentifier}</string><key>NSExtension</key><dict><key>NSExtensionPointIdentifier</key><string>com.apple.broadcast-services-upload</string><key>NSExtensionPrincipalClass</key><string>MobileLiveCasterBroadcastUpload.SampleHandler</string><key>RPBroadcastProcessMode</key><string>RPBroadcastProcessModeSampleBuffer</string></dict></dict></plist>`;
}
