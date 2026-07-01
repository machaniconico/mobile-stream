import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIosNativeVerificationReport, createIosSimulatorBuildArgs } from "./verify-ios-native.mjs";

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
          bytes: 12,
          sha256: sha256("plist-bytes\n")
        },
        executable: {
          path: join(appPath, "MobileLiveCaster"),
          bytes: 17,
          sha256: sha256("executable-bytes\n")
        }
      },
      broadcastUploadExtension: {
        embedded: {
          path: embeddedExtensionPath,
          infoPlist: {
            path: join(embeddedExtensionPath, "Info.plist"),
            bytes: 16,
            sha256: sha256("extension-plist\n")
          },
          executable: {
            path: join(embeddedExtensionPath, "MobileLiveCasterBroadcastUpload"),
            bytes: 21,
            sha256: sha256("extension-executable\n")
          }
        },
        standalone: {
          path: standaloneExtensionPath,
          infoPlist: {
            path: join(standaloneExtensionPath, "Info.plist"),
            bytes: 16,
            sha256: sha256("extension-plist\n")
          },
          executable: {
            path: join(standaloneExtensionPath, "MobileLiveCasterBroadcastUpload"),
            bytes: 21,
            sha256: sha256("extension-executable\n")
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
});

function writeBuiltAppFixture() {
  mkdirSync(appPath, { recursive: true });
  writeFileSync(join(appPath, "Info.plist"), "plist-bytes\n");
  writeFileSync(join(appPath, "MobileLiveCaster"), "executable-bytes\n");
  writeBroadcastExtensionFixture(embeddedExtensionPath);
  writeBroadcastExtensionFixture(standaloneExtensionPath);
}

function writeBroadcastExtensionFixture(path) {
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "Info.plist"), "extension-plist\n");
  writeFileSync(join(path, "MobileLiveCasterBroadcastUpload"), "extension-executable\n");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
