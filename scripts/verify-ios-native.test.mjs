import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIosNativeVerificationReport, createIosSimulatorBuildArgs } from "./verify-ios-native.mjs";

const fixtureRoot = ".artifacts/verify-ios-native-test";
const derivedDataPath = `${fixtureRoot}/DerivedData`;
const appPath = `${derivedDataPath}/Build/Products/Debug-iphonesimulator/MobileLiveCaster.app`;

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
});

function writeBuiltAppFixture() {
  mkdirSync(appPath, { recursive: true });
  writeFileSync(join(appPath, "Info.plist"), "plist-bytes\n");
  writeFileSync(join(appPath, "MobileLiveCaster"), "executable-bytes\n");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
