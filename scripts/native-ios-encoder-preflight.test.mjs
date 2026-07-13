import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sdkPath = (sdk) => {
  if (process.platform !== "darwin") return "";
  const result = spawnSync("xcrun", ["--sdk", sdk, "--show-sdk-path"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
};
const iosSimulatorSdk = sdkPath("iphonesimulator");
const iosDeviceSdk = sdkPath("iphoneos");

describe("iOS encoder configuration preflight", () => {
  it.skipIf(!iosSimulatorSdk || !iosDeviceSdk)("type-checks iOS 15.1 simulator and device targets", () => {
    const workspace = resolve(import.meta.dirname, "..");
    const source = resolve(workspace, "ios/MobileLiveCaster/LiveCasterEncoderPreflight.swift");
    const simulatorArchitecture = process.arch === "arm64" ? "arm64" : "x86_64";
    const targets = [
      { sdk: "iphonesimulator", path: iosSimulatorSdk, triple: `${simulatorArchitecture}-apple-ios15.1-simulator` },
      { sdk: "iphoneos", path: iosDeviceSdk, triple: "arm64-apple-ios15.1" },
    ];

    for (const target of targets) {
      const result = spawnSync(
        "xcrun",
        [
          "--sdk",
          target.sdk,
          "swiftc",
          "-typecheck",
          "-sdk",
          target.path,
          "-target",
          target.triple,
          source,
        ],
        { encoding: "utf8" },
      );
      expect(result.status, `${target.sdk}: ${result.stderr || result.stdout}`).toBe(0);
    }
  });

  it("keeps native preparation, fail-closed cleanup, and Xcode wiring together", () => {
    const source = readFileSync("ios/MobileLiveCaster/LiveCasterEncoderPreflight.swift", "utf8");
    const bridge = readFileSync("ios/MobileLiveCaster/LiveCasterBridge.swift", "utf8");
    const project = readFileSync("ios/MobileLiveCaster.xcodeproj/project.pbxproj", "utf8");

    expect(source).toContain("kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder");
    expect(source).toContain("kVTCompressionPropertyKey_UsingHardwareAcceleratedVideoEncoder");
    expect(source).toContain("if #available(iOS 17.4");
    expect(source).toContain("let hardwareVideoEncoderRequired: Bool");
    expect(source).toContain("let hardwareVideoEncoderVerified: Bool");
    expect(source).toContain("VTCompressionSessionPrepareToEncodeFrames");
    expect(source).toContain("AudioConverterNew");
    expect(source).toContain("kAudioConverterEncodeBitRate");
    expect(source).toContain("kAudioConverterPropertyMaximumOutputPacketSize");
    expect(bridge).toContain("let encoderPreflight = LiveCasterEncoderPreflight.inspect(");
    expect(bridge).toContain("guard encoderPreflight.passed else");
    expect(bridge).toContain("self.preparedConfiguration = nil");
    expect(bridge).toContain('return "encoder_preflight_failed"');
    expect(project).toContain("LiveCasterEncoderPreflight.swift in Sources");

    const inspectIndex = bridge.indexOf("let encoderPreflight = LiveCasterEncoderPreflight.inspect(");
    const assignmentIndex = bridge.indexOf("self.preparedConfiguration = configuration", inspectIndex);
    expect(inspectIndex).toBeGreaterThan(-1);
    expect(assignmentIndex).toBeGreaterThan(inspectIndex);
  });
});
