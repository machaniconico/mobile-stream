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

  it("blocks v21 support bundles without platform dashboard manifest proof", () => {
    writeBundle({
      app: {
        name: "MobileLiveCaster",
        reportVersion: 1,
        bundleVersion: 21
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Support bundle v21 is older than the required v40.");
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
    expect(result.stdout).toContain("fresh tracking runtime, ready native face landmarks");
  });

  it("blocks native runtime claims when retained manifests lack native frame proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { nativeRuntimeSentVideoFrames: 0 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("platform-matched video/audio frames");
  });

  it("blocks native runtime claims when retained manifests have missing compositor assets", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeStillImageAssetLoadedCount: 0,
            nativeRuntimeStillImageAssetMissingCount: 1
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("loaded, decoded, and composited still-image assets");
  });

  it("blocks native runtime claims when retained manifests lack decoded still-image proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeStillImageAssetCount: 1,
            nativeRuntimeStillImageAssetLoadedCount: 1,
            nativeRuntimeStillImageAssetMissingCount: 0,
            nativeRuntimeStillImageAssetDecodedCount: 0,
            nativeRuntimeStillImageAssetDecodedPixelCount: 0,
            nativeRuntimeStillImageAssetCompositedCount: 0,
            nativeRuntimeStillImageAssetCompositedPixelCount: 0
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("loaded, decoded, and composited still-image assets");
  });

  it("blocks native runtime claims when retained manifests lack composited still-image proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeStillImageAssetCount: 1,
            nativeRuntimeStillImageAssetLoadedCount: 1,
            nativeRuntimeStillImageAssetMissingCount: 0,
            nativeRuntimeStillImageAssetDecodedCount: 1,
            nativeRuntimeStillImageAssetDecodedPixelCount: 921_600,
            nativeRuntimeStillImageAssetCompositedCount: 0,
            nativeRuntimeStillImageAssetCompositedPixelCount: 0
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("loaded, decoded, and composited still-image assets");
  });

  it("blocks native runtime claims when retained manifests lack applied overlay proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeCompositionAppliedCount: 0,
            nativeRuntimeCompositionSkippedCount: 0,
            nativeRuntimeStillImageAssetCount: 1,
            nativeRuntimeStillImageAssetLoadedCount: 1,
            nativeRuntimeStillImageAssetMissingCount: 0
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("applied/skipped native overlay proof");
  });

  it("blocks native runtime claims when retained VRM manifests lack renderer proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeVrmSourceCount: 1,
            nativeRuntimeVrmPosePayloadCount: 1,
            nativeRuntimeVrmActivePoseCount: 1,
            nativeRuntimeVrmRendererStatus: "unavailable",
            nativeRuntimeVrmModelLoadedCount: 1,
            nativeRuntimeVrmRenderedSourceCount: 0,
            nativeRuntimeVrmRenderMissingCount: 1
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("VRM renderer/model/pose proof");
  });

  it("blocks monitor-hold claims when retained manifests lack stable duration proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { monitorHoldDurationSeconds: 59 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("stable duration, sample count");
  });

  it("uses the latest eligible platform row for monitor-hold manifest proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunCount: 3,
        validationEvidenceEligibleRunCount: 3,
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios-older", { createdAt: "2026-06-23T09:00:00.000Z" }),
          manifestRun("ios", "svr1-ios-latest", {
            createdAt: "2026-06-23T10:00:00.000Z",
            monitorHoldDurationSeconds: 59
          }),
          manifestRun("android", "svr1-android", { createdAt: "2026-06-23T10:00:00.000Z" })
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("stable duration, sample count");
  });

  it("keeps monitor-hold manifest failures blocking when manifest count warnings are allowed", () => {
    writeBundle({
      summary: {
        validationEvidenceRunCount: 2,
        validationEvidenceEligibleRunCount: 3,
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios-older", { createdAt: "2026-06-23T09:00:00.000Z" }),
          manifestRun("ios", "svr1-ios-latest", {
            createdAt: "2026-06-23T10:00:00.000Z",
            monitorHoldDurationSeconds: 59
          }),
          manifestRun("android", "svr1-android", { createdAt: "2026-06-23T10:00:00.000Z" })
        ]
      }
    });

    const result = runVerifierAllowWarnings();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Can release: no");
    expect(result.stdout).toContain("stable duration, sample count");
    expect(result.stdout).not.toContain("release warning");
  });

  it("blocks monitor-hold claims when retained manifests keep drops or reconnects", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            monitorHoldDroppedFrameIncrease: 1,
            monitorHoldObservedReconnectAttempts: 1
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("zero dropped frames, and zero reconnects");
  });

  it("blocks audio claims when retained manifests lack native monitor write proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { audioNativeMonitorWrittenFrames: 0 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("native monitor write/drop proof");
  });

  it("blocks audio claims when retained manifests keep monitor drops or miss headphone proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            audioNativeMonitorHeadphonesConnected: false,
            audioNativeMonitorDroppedFrames: 1
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("headphone route proof");
  });

  it("blocks audio claims when Bluetooth monitor evidence lacks tuning review", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            audioBluetoothRoute: true,
            audioBluetoothTuningReviewed: false
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("mic/headphone evidence");
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
    expect(result.stdout).toContain("ready PNGTuber rig proof");
  });

  it("blocks avatar-motion claims when retained manifests keep low still-image rig quality", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            faceTrackingRigQualityScore: 72,
            faceTrackingRigQualityGrade: "review"
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("ready PNGTuber rig proof");
  });

  it("blocks avatar-motion claims when retained manifests omit still-image rig quality proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          withoutRigQuality(manifestRun("ios", "svr1-ios")),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("ready PNGTuber rig proof");
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

  it("blocks retained manifests without controlled weak-network quality automation proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            qualityAutomationLiveUpdateCount: 0,
            qualityAutomationNextTargetCount: 0
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("controlled weak-network quality automation evidence for iOS");
  });

  it("blocks platform dashboard claims when retained manifests lack destination identity proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { platformPublishingYoutubeHasBroadcastId: false }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("YouTube identity/state proof");
  });

  it("blocks Twitch platform dashboard claims when retained manifests lack channel metadata proof", () => {
    writeBundle({
      profile: {
        destination: {
          platform: "twitch",
          protocol: "rtmps"
        }
      },
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            targetPlatform: "Twitch",
            platformPublishingPlatform: "twitch",
            platformPublishingTwitchLiveStatus: "live",
            platformPublishingTwitchStartedAt: "2026-06-23T10:58:00.000Z",
            platformPublishingTwitchHasCategoryId: true,
            platformPublishingTwitchViewerCount: 1
          }),
          manifestRun("android", "svr1-android", {
            targetPlatform: "Twitch",
            platformPublishingPlatform: "twitch",
            platformPublishingTwitchLiveStatus: "live",
            platformPublishingTwitchStartedAt: "2026-06-23T10:58:00.000Z",
            platformPublishingTwitchHasCategoryId: true,
            platformPublishingTwitchViewerCount: 1
          })
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Twitch dashboard status and Twitch title/category/language metadata");
  });

  it("blocks platform dashboard claims when retained manifests keep unhealthy destination state", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { platformPublishingYoutubeHealthIssueCount: 1 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("fresh checked-at proof");
  });

  it("blocks platform dashboard claims when retained manifests keep stale freshness age", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { platformPublishingFreshnessAgeMinutes: 11 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("fresh checked-at proof");
  });

  it("blocks same-run platform ingest claims when retained manifests lack native send proof", () => {
    writeBundle({
      summary: {
        validationEvidenceNativeRuntimeIosPass: false,
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { nativeRuntimeSentVideoFrames: 0 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("same-run native send telemetry");
  });

  it("blocks release when the launch rehearsal is not ready", () => {
    writeBundle({
      summary: {
        rehearsalStatus: "needs-run",
        rehearsalCanPromoteToPublic: false,
        rehearsalSummary: "Rehearsal still needs 2 checks.",
        rehearsalPrimaryAction: "Start a private rehearsal stream.",
        rehearsalPendingCount: 2
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Launch rehearsal");
    expect(result.stdout).toContain("Rehearsal still needs 2 checks.");
  });

  it("blocks release when a ready launch rehearsal carries a low score", () => {
    writeBundle({
      summary: {
        rehearsalScore: 82,
        rehearsalGrade: "C",
        rehearsalWeakAreaCount: 1
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Launch rehearsal");
    expect(result.stdout).toContain("Launch rehearsal score is 82/100 grade C.");
  });


  it("blocks manifest rows marked in-scope for another destination", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { targetPlatform: "Twitch" }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("current destination scope YouTube Live/RTMPS");
  });

  it("blocks manifest rows marked in-scope for another RTMP transport", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { transport: "rtmp" }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("current destination scope YouTube Live/RTMPS");
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

const runVerifierAllowWarnings = (path = fixturePath) =>
  spawnSync(process.execPath, ["scripts/verify-commercial-release-bundle.mjs", path, "--max-age-hours=24", "--allow-warnings"], {
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
    rehearsalStatus: "ready",
    rehearsalCanPromoteToPublic: true,
    rehearsalScore: 100,
    rehearsalGrade: "A",
    rehearsalWeakAreaCount: 0,
    rehearsalSummary: "Rehearsal is ready to promote to a platform-visible launch.",
    rehearsalPrimaryAction: "Export a support bundle and keep the rehearsed profile unchanged.",
    rehearsalPendingCount: 0,
    rehearsalWarningCount: 0,
    rehearsalFailCount: 0,
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
    validationEvidencePlatformIngestIosPass: true,
    validationEvidencePlatformIngestAndroidPass: true,
    validationEvidenceRunManifest: [
      manifestRun("ios", "svr1-ios"),
      manifestRun("android", "svr1-android")
    ]
  };

  return {
    app: {
      name: "MobileLiveCaster",
      reportVersion: 1,
      bundleVersion: 40
    },
    generatedAt: new Date().toISOString(),
    profile: {
      destination: {
        platform: "youtube-live",
        protocol: "rtmps"
      }
    },
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
  nativeRuntimePlatform: devicePlatform,
  nativeRuntimeStatus: "pass",
  nativeRuntimeCompositionStatus: "applied",
  nativeRuntimeCompositionAppliedCount: 1,
  nativeRuntimeCompositionSkippedCount: 0,
  nativeRuntimeCompositionSkippedKinds: [],
  nativeRuntimeSentVideoFrames: 120,
  nativeRuntimeSentAudioFrames: 190,
  nativeRuntimeBytesWritten: 2_200_000,
  nativeRuntimeVideoFrameIntervalSampleCount: 119,
  nativeRuntimeVideoFrameIntervalAverageMs: 33.3,
  nativeRuntimeVideoFrameIntervalMaxMs: 42,
  nativeRuntimeVideoFrameIntervalJitterMs: 8.7,
  nativeRuntimeStillImageAssetCount: 1,
  nativeRuntimeStillImageAssetLoadedCount: 1,
  nativeRuntimeStillImageAssetMissingCount: 0,
  nativeRuntimeStillImageAssetDecodedCount: 1,
  nativeRuntimeStillImageAssetDecodedPixelCount: 921_600,
    nativeRuntimeStillImageAssetCompositedCount: 1,
    nativeRuntimeStillImageAssetCompositedPixelCount: 921_600,
  nativeRuntimeVrmSourceCount: 0,
  nativeRuntimeVrmPosePayloadCount: 0,
  nativeRuntimeVrmActivePoseCount: 0,
  nativeRuntimeVrmMissingPoseCount: 0,
  nativeRuntimeVrmRendererStatus: "not-required",
  nativeRuntimeVrmRendererBackend: "none",
  nativeRuntimeVrmModelLoadedCount: 0,
  nativeRuntimeVrmModelVersions: [],
  nativeRuntimeVrmHumanoidBoneCount: 0,
  nativeRuntimeVrmExpressionCount: 0,
  nativeRuntimeVrmMeshPrimitiveCount: 0,
  nativeRuntimeVrmSkinnedMeshPrimitiveCount: 0,
  nativeRuntimeVrmSkinJointCount: 0,
  nativeRuntimeVrmPositionAccessorCount: 0,
  nativeRuntimeVrmVertexCount: 0,
  nativeRuntimeVrmIndexCount: 0,
  nativeRuntimeVrmBoundsAccessorCount: 0,
  nativeRuntimeVrmSkinningAttributePrimitiveCount: 0,
  nativeRuntimeVrmTrianglePrimitiveCount: 0,
  nativeRuntimeVrmUnsupportedPrimitiveModeCount: 0,
  nativeRuntimeVrmNormalAccessorCount: 0,
  nativeRuntimeVrmTexcoordAccessorCount: 0,
  nativeRuntimeVrmMorphTargetCount: 0,
  nativeRuntimeVrmMaterialCount: 0,
  nativeRuntimeVrmTextureCount: 0,
  nativeRuntimeVrmImageCount: 0,
  nativeRuntimeVrmUnsupportedImageMimeCount: 0,
  nativeRuntimeVrmTransparentMaterialCount: 0,
  nativeRuntimeVrmPoseBoneCount: 0,
  nativeRuntimeVrmPoseBoneAppliedCount: 0,
  nativeRuntimeVrmPoseBoneUnsupportedCount: 0,
  nativeRuntimeVrmPoseExpressionCount: 0,
  nativeRuntimeVrmPoseExpressionAppliedCount: 0,
  nativeRuntimeVrmPoseExpressionUnsupportedCount: 0,
  nativeRuntimeVrmRenderedSourceCount: 0,
  nativeRuntimeVrmRenderMissingCount: 0,
  nativeRuntimeVrmRenderFailureCount: 0,
  monitorHoldStatus: "pass",
  monitorHoldSampleCount: 3,
  monitorHoldDurationSeconds: 65,
  monitorHoldStability: "stable",
  monitorHoldAverageBitrateKbps: 4_400,
  monitorHoldMinimumBitrateKbps: 4_100,
  monitorHoldAverageFps: 29.8,
  monitorHoldMinimumFps: 29.2,
  monitorHoldDroppedFrameIncrease: 0,
  monitorHoldObservedReconnectAttempts: 0,
  faceTrackingStatus: "pass",
  faceTrackingRuntimeFresh: true,
  faceTrackingRuntimeAgeMs: 120,
  faceTrackingFaceLandmarkConfidence: 0.82,
  faceTrackingFaceLandmarkReady: true,
  faceTrackingPreparedPngTuberCount: 1,
  faceTrackingVisibleVrmCount: 0,
  faceTrackingNativeVrmRendererReady: false,
  faceTrackingActiveMotionCount: 1,
  faceTrackingRigIssueCount: 0,
  faceTrackingRigQualityScore: 100,
  faceTrackingRigQualityGrade: "ready",
  audioStatus: "pass",
  audioMonitorHeadphonesOnly: true,
  audioNativeMonitorHeadphonesConnected: true,
  audioNativeMonitorWrittenFrames: 24576,
  audioNativeMonitorDroppedFrames: 0,
  audioNativeMonitorWrittenBuffers: 48,
  audioNativeMonitorDroppedBuffers: 0,
  audioMonitorLatencyStatus: "pass",
  audioMonitorLatencyMs: 92,
  audioBluetoothRoute: false,
  audioBluetoothTuningReviewed: false,
  chatReadoutStatus: "pass",
  chatReadoutSpokenMessageCount: 1,
  chatReadoutSpeechFailureCount: 0,
  qualityAutomationStatus: "pass",
  qualityAutomationLiveUpdateCount: 1,
  qualityAutomationNextTargetCount: 0,
  qualityAutomationFailureCount: 0,
  platformPublishingPlatform: "youtube-live",
  platformPublishingStatus: "pass",
  platformPublishingFreshnessStatus: "fresh",
  platformPublishingCheckedAt: "2026-06-23T10:59:00.000Z",
  platformPublishingFreshnessAgeMinutes: 1,
  platformPublishingYoutubeHasBroadcastId: true,
  platformPublishingYoutubeHasStreamId: true,
  platformPublishingYoutubeBroadcastStatus: "live",
  platformPublishingYoutubeStreamStatus: "active",
  platformPublishingYoutubeHealthStatus: "ok",
  platformPublishingYoutubeHealthIssueCount: 0,
  platformPublishingTwitchLiveStatus: "",
  platformPublishingTwitchStartedAt: "",
  platformPublishingTwitchHasCategoryId: false,
  platformPublishingTwitchChannelTitle: "",
  platformPublishingTwitchChannelCategory: "",
  platformPublishingTwitchChannelCategoryId: "",
  platformPublishingTwitchChannelLanguage: "",
  platformPublishingTwitchViewerCount: 0,
  summary: "Validation run retained.",
  recommendation: "Keep this run with release evidence.",
  ...patch
});

const withoutRigIssueCount = (run) => {
  const { faceTrackingRigIssueCount: _faceTrackingRigIssueCount, ...rest } = run;
  return rest;
};

const withoutRigQuality = (run) => {
  const {
    faceTrackingRigQualityScore: _faceTrackingRigQualityScore,
    faceTrackingRigQualityGrade: _faceTrackingRigQualityGrade,
    ...rest
  } = run;
  return rest;
};
