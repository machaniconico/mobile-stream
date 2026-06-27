import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const fixturePath = ".artifacts/verify-commercial-release-bundle-test/support-bundle.json";

describe("commercial release bundle verifier CLI", () => {
  afterEach(() => {
    rmSync(".artifacts/verify-commercial-release-bundle-test", { recursive: true, force: true });
  });

  it("passes a redacted commercial support bundle", () => {
    writeBundle({
      diagnostics: {
        api: {
          youtubeAccessToken: "[redacted]",
          twitchOauthToken: "[redacted]",
          serialized: '{"apiKey":"[redacted]","nestedClientSecret":"[redacted]"}'
        }
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Can release: yes");
  });

  it("blocks v17 support bundles without spoken chat readout manifest proof", () => {
    writeBundle({
      app: {
        name: "MobileLiveCaster",
        reportVersion: 1,
        bundleVersion: 17
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Support bundle v17 is older than the required v18.");
  });

  it("blocks prefix-named token and API key leaks", () => {
    writeBundle({
      diagnostics: {
        api: {
          youtubeAccessToken: "youtube-access-token-secret",
          twitchOauthToken: "twitch-oauth-token-secret",
          serialized: '{"apiKey":"platform-api-key-secret","nestedClientSecret":"client-secret-value"} customOauthToken=custom-oauth-token-secret'
        }
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Support bundle privacy");
    expect(result.stdout).toContain("unredacted sensitive value");
  });

  it("blocks retained validation runs without physical-device proof", () => {
    writeBundle({
      summary: {
        validationEvidencePhysicalDeviceAndroidPass: false,
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios"),
          manifestRun("android", "svr1-android-emulator", {
            physicalDevice: false,
            physicalDeviceStatus: "fail"
          })
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Physical validation coverage");
    expect(result.stdout).toContain("physical device identity");
  });

  it("blocks avatar-motion claims when retained manifests lack fresh tracking runtime proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { faceTrackingRuntimeFresh: false }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("fresh tracking runtime, active motion");
  });

  it("blocks avatar-motion claims when retained manifests keep still-image rig issues", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { faceTrackingRigIssueCount: 1 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("zero still-image rig issues");
  });

  it("blocks avatar-motion claims when retained manifests omit still-image rig quality proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          withoutRigIssueCount(manifestRun("ios", "svr1-ios")),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("zero still-image rig issues");
  });

  it("blocks chat readout claims when retained manifests have no spoken chat success", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { chatReadoutSpokenMessageCount: 0 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("spoken-message success and zero speech failures");
  });

  it("blocks chat readout claims when retained manifests keep speech failures", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { chatReadoutSpeechFailureCount: 1 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("spoken-message success and zero speech failures");
  });

  it("rejects symlinked support bundles before reading linked targets", () => {
    const outsideBundlePath = ".artifacts/verify-commercial-release-bundle-test/outside-support-bundle.json";
    mkdirSync(dirname(fixturePath), { recursive: true });
    writeFileSync(outsideBundlePath, JSON.stringify(createBundle(), null, 2));
    symlinkSync(resolve(outsideBundlePath), fixturePath);

    const result = runVerifier();

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`Support bundle must not be a symbolic link: ${fixturePath}`);
    expect(result.stdout).not.toContain("Can release: yes");
  });

  it("rejects dangling symlinked support bundles", () => {
    const missingBundlePath = ".artifacts/verify-commercial-release-bundle-test/missing-support-bundle.json";
    mkdirSync(dirname(fixturePath), { recursive: true });
    symlinkSync(resolve(missingBundlePath), fixturePath);

    const result = runVerifier();

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`Support bundle must not be a symbolic link: ${fixturePath}`);
  });

  it("rejects support bundles under symlinked workspace parents", () => {
    const realParent = ".artifacts/verify-commercial-release-bundle-test/real-parent";
    const linkParent = ".artifacts/verify-commercial-release-bundle-test/link-parent";
    const linkedBundlePath = `${linkParent}/support-bundle.json`;
    mkdirSync(realParent, { recursive: true });
    writeFileSync(`${realParent}/support-bundle.json`, JSON.stringify(createBundle(), null, 2));
    symlinkSync(resolve(realParent), linkParent, "dir");

    const result = runVerifier(linkedBundlePath);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`Support bundle path parent must not be a symbolic link: ${linkParent}`);
    expect(result.stdout).not.toContain("Can release: yes");
  });

  it("rejects support bundle paths that point to directories", () => {
    mkdirSync(fixturePath, { recursive: true });

    const result = runVerifier();

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`Support bundle must point to a file: ${fixturePath}`);
  });
});

const runVerifier = (path = fixturePath) =>
  spawnSync(process.execPath, ["scripts/verify-commercial-release-bundle.mjs", path, "--max-age-hours=24"], {
    encoding: "utf8"
  });

const writeBundle = (patch = {}) => {
  mkdirSync(dirname(fixturePath), { recursive: true });
  writeFileSync(fixturePath, JSON.stringify(createBundle(patch), null, 2));
};

const createBundle = (patch = {}) => {
  const summary = {
    preflightStatus: "ready",
    publicLaunchStatus: "ready",
    publicLaunchCanStart: true,
    publicLaunchWarningCount: 0,
    publicLaunchFailCount: 0,
    publicLaunchStartLockBlocked: false,
    publicLaunchStartLockSummary: "Public start lock is clear.",
    publicLaunchStartLockAction: "Go Live while dashboard freshness remains current.",
    launchBlockCount: 0,
    launchWarningCount: 0,
    validationStatus: "ready",
    validationWarningCount: 0,
    validationFailCount: 0,
    validationPendingCount: 0,
    validationRunbookStatus: "complete",
    validationRunbookNextAction: "Archive this support bundle.",
    validationEvidenceStatus: "ready",
    validationEvidenceFingerprint: "sve1-ready",
    validationEvidenceLatestRunFingerprint: "svr1-android",
    validationEvidenceRunCount: 2,
    validationEvidenceEligibleRunCount: 2,
    validationEvidenceStaleRunCount: 0,
    validationEvidenceIosPass: true,
    validationEvidenceAndroidPass: true,
    validationEvidencePhysicalDeviceIosPass: true,
    validationEvidencePhysicalDeviceAndroidPass: true,
    validationEvidenceAppBuildMismatch: false,
    validationEvidenceConsistentAppBuild: "rc-1",
    validationEvidenceNativeRuntimeIosPass: true,
    validationEvidenceNativeRuntimeAndroidPass: true,
    validationEvidenceMonitorHoldIosPass: true,
    validationEvidenceMonitorHoldAndroidPass: true,
    validationEvidenceFaceTrackingIosPass: true,
    validationEvidenceFaceTrackingAndroidPass: true,
    validationEvidenceAudioIosPass: true,
    validationEvidenceAudioAndroidPass: true,
    validationEvidenceChatReadoutIosPass: true,
    validationEvidenceChatReadoutAndroidPass: true,
    validationEvidencePlatformPublishingIosPass: true,
    validationEvidencePlatformPublishingAndroidPass: true,
    validationEvidenceRunManifest: [
      manifestRun("ios", "svr1-ios"),
      manifestRun("android", "svr1-android")
    ]
  };

  return {
    app: {
      name: "MobileLiveCaster",
      reportVersion: 1,
      bundleVersion: 18
    },
    generatedAt: new Date().toISOString(),
    ...patch,
    summary: {
      ...summary,
      ...(patch.summary ?? {})
    }
  };
};

const manifestRun = (devicePlatform, fingerprint, patch = {}) => ({
  id: `validation-${devicePlatform}`,
  fingerprint,
  createdAt: new Date().toISOString(),
  ageDays: 0,
  fresh: true,
  matchesScope: true,
  eligible: true,
  devicePlatform,
  deviceName: devicePlatform === "ios" ? "iPhone 15 Pro" : "Pixel 8 Pro",
  osVersion: devicePlatform === "ios" ? "iOS 18.5" : "Android 15",
  physicalDevice: true,
  physicalDeviceStatus: "pass",
  appBuild: "rc-1",
  networkProfile: "private test",
  targetPlatform: "YouTube Live",
  transport: "rtmps",
  result: "pass",
  nativeRuntimeStatus: "pass",
  monitorHoldStatus: "pass",
  faceTrackingStatus: "pass",
  faceTrackingRuntimeFresh: true,
  faceTrackingRuntimeAgeMs: 120,
  faceTrackingActiveMotionCount: 1,
  faceTrackingRigIssueCount: 0,
  audioStatus: "pass",
  chatReadoutStatus: "pass",
  chatReadoutSpokenMessageCount: 1,
  chatReadoutSpeechFailureCount: 0,
  qualityAutomationStatus: "pass",
  platformPublishingStatus: "pass",
  platformPublishingFreshnessStatus: "fresh",
  summary: "Validation run retained.",
  recommendation: "Keep this run with release evidence.",
  ...patch
});

const withoutRigIssueCount = (run) => {
  const { faceTrackingRigIssueCount: _faceTrackingRigIssueCount, ...rest } = run;
  return rest;
};
