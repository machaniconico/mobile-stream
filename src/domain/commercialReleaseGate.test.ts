import { describe, expect, it } from "vitest";
import {
  createCommercialReleaseGate,
  formatCommercialReleaseGate
} from "./commercialReleaseGate";
import type { SupportBundle } from "./supportBundle";

const now = new Date("2026-06-23T12:00:00.000Z");

describe("commercial release gate", () => {
  it("passes a fresh support bundle with complete release evidence", () => {
    const bundle = supportBundle();
    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("ready");
    expect(gate.canRelease).toBe(true);
    expect(gate.issueCounts).toEqual({ warningCount: 0, failureCount: 0 });
    expect(gate.evidenceFingerprint).toBe("sve1-ready");
    expect(gate.latestRunFingerprint).toBe("svr1-android");
    expect(formatCommercialReleaseGate(gate)).toContain("Can release: yes");
  });

  it("blocks stale bundles and incomplete physical validation proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        generatedAt: "2026-06-21T00:00:00.000Z",
        summary: {
          validationEvidenceStatus: "partial",
          validationEvidenceAndroidPass: false,
          validationEvidenceAudioAndroidPass: false,
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios" }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android", eligible: false, result: "warn" })
          ]
        }
      }),
      { now, maxBundleAgeHours: 24 }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "bundle-stale",
        "validation-evidence-not-ready",
        "validation-evidence-coverage",
        "validation-evidence-manifest-incomplete",
        "validation-evidence-feature-gap"
      ])
    );
  });

  it("blocks release when current platform publishing status is stale even if retained evidence is complete", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          platformPublishingFreshnessStatus: "stale",
          platformPublishingFreshnessAgeMinutes: 30,
          platformPublishingFreshnessSummary: "YouTube dashboard status is 30 minutes old.",
          platformPublishingFreshnessRecommendation: "Refresh YouTube status within 10 minutes of release approval."
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "platform-publishing-freshness",
          severity: "fail",
          label: "Platform publishing freshness",
          detail: "YouTube dashboard status is 30 minutes old."
        })
      ])
    );
    expect(formatCommercialReleaseGate(gate)).toContain("Refresh YouTube status within 10 minutes");
  });

  it("requires explicit approval before releasing with warnings", () => {
    const bundle = supportBundle({
      summary: {
        publicLaunchStatus: "warning",
        publicLaunchWarningCount: 1,
        validationEvidenceRunCount: 3,
        validationEvidenceStaleRunCount: 1,
        validationEvidenceRunManifest: [
          manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios" }),
          manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" }),
          manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios-stale", eligible: false, fresh: false })
        ]
      }
    });

    const warningGate = createCommercialReleaseGate(bundle, { now });
    expect(warningGate.status).toBe("warning");
    expect(warningGate.canRelease).toBe(false);
    expect(warningGate.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["public-launch-warning", "validation-evidence-stale-retained-runs"])
    );

    const approvedGate = createCommercialReleaseGate(bundle, { now, allowWarnings: true });
    expect(approvedGate.status).toBe("warning");
    expect(approvedGate.canRelease).toBe(true);
    expect(approvedGate.summary).toContain("accepted");
  });

  it("blocks old support bundle schema versions without retained-run manifests", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        app: {
          name: "MobileLiveCaster",
          reportVersion: 1,
          bundleVersion: 12
        },
        summary: {
          validationEvidenceRunManifest: []
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["bundle-version", "validation-evidence-manifest-missing"])
    );
  });

  it("blocks v17 support bundles that do not carry spoken chat readout manifest proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        app: {
          name: "MobileLiveCaster",
          reportVersion: 1,
          bundleVersion: 17
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues.map((issue) => issue.code)).toContain("bundle-version");
  });

  it("blocks avatar-motion summary claims when the manifest lacks fresh tracking runtime proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios", faceTrackingRuntimeFresh: false }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS avatar-motion proof")
      })
    );
  });

  it("blocks avatar-motion summary claims when the manifest retains still-image rig issues", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios", faceTrackingRigIssueCount: 1 }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS avatar-motion proof")
      })
    );
  });

  it("blocks avatar-motion summary claims when the manifest omits still-image rig quality proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRunWithoutRigIssueCount({ devicePlatform: "ios", fingerprint: "svr1-ios" }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS avatar-motion proof")
      })
    );
  });

  it("blocks chat-readout summary claims when the manifest has no spoken chat success", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios", chatReadoutSpokenMessageCount: 0 }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS spoken chat-readout proof")
      })
    );
  });

  it("blocks chat-readout summary claims when the manifest keeps speech failures", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios", chatReadoutSpeechFailureCount: 1 }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS spoken chat-readout proof")
      })
    );
  });

  it("blocks bundles whose retained runs are not physical-device evidence", () => {
    const bundle = supportBundle({
      summary: {
        validationEvidencePhysicalDeviceAndroidPass: false,
        validationEvidenceRunManifest: [
          manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios" }),
          manifestRun({
            devicePlatform: "android",
            fingerprint: "svr1-android-emulator",
            physicalDevice: false,
            physicalDeviceStatus: "fail"
          })
        ]
      }
    });

    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "validation-evidence-coverage",
        "validation-evidence-manifest-incomplete",
        "validation-evidence-feature-gap"
      ])
    );
    expect(formatCommercialReleaseGate(gate)).toContain("physical device identity");
  });

  it("blocks summary claims backed only by stale or out-of-scope manifest rows", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios-stale", eligible: true, fresh: false }),
            manifestRun({
              devicePlatform: "android",
              fingerprint: "svr1-android-out-of-scope",
              eligible: true,
              matchesScope: false
            })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["validation-evidence-manifest-incomplete", "validation-evidence-manifest-integrity"])
    );
    expect(formatCommercialReleaseGate(gate)).toContain("eligible run count summary=2 manifest=0");
  });

  it("blocks summary feature claims not backed by the latest manifest row", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios" }),
            manifestRun({
              devicePlatform: "android",
              fingerprint: "svr1-android-chat-warn",
              chatReadoutStatus: "warn"
            })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "validation-evidence-manifest-integrity",
          severity: "fail",
          detail: expect.stringContaining("Android spoken chat-readout proof is claimed by summary but not backed")
        })
      ])
    );
  });

  it("blocks hidden same-build summary claims when manifest app builds differ", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios", appBuild: "rc-1" }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android", appBuild: "rc-2" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "validation-evidence-manifest-integrity",
          severity: "fail",
          detail: expect.stringContaining("summary build rc-1 is not backed")
        })
      ])
    );
  });

  it("blocks support bundles that contain unredacted sensitive data", () => {
    const bundle = supportBundle();
    const mutableBundle = bundle as unknown as {
      diagnostics: {
        api: {
          lastError: string;
          streamKey: string;
          youtubeAccessToken: string;
          twitchOauthToken: string;
          serialized: string;
        };
      };
    };
    mutableBundle.diagnostics = {
      api: {
        lastError: "Authorization: Bearer youtube-access-token-secret failed after code=oauth-code-secret",
        streamKey: "rtmp-live-secret-key",
        youtubeAccessToken: "youtube-access-token-secret",
        twitchOauthToken: "twitch-oauth-token-secret",
        serialized: '{"apiKey":"platform-api-key-secret","nestedClientSecret":"client-secret-value"} customOauthToken=custom-oauth-token-secret'
      }
    };

    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues.map((issue) => issue.code)).toContain("support-bundle-sensitive-data");
    expect(formatCommercialReleaseGate(gate)).toContain("Support bundle privacy");
  });

  it("allows support bundles with redacted sensitive placeholders", () => {
    const bundle = supportBundle();
    const mutableBundle = bundle as unknown as {
      diagnostics: {
        api: {
          lastError: string;
          streamKey: string;
          youtubeAccessToken: string;
          twitchOauthToken: string;
          serialized: string;
        };
      };
    };
    mutableBundle.diagnostics = {
      api: {
        lastError: "Authorization: Bearer [redacted] failed after code=[redacted]",
        streamKey: "[redacted]",
        youtubeAccessToken: "[redacted]",
        twitchOauthToken: "[redacted]",
        serialized: '{"apiKey":"[redacted]","nestedClientSecret":"[redacted]"} customOauthToken=[redacted]'
      }
    };

    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("ready");
    expect(gate.canRelease).toBe(true);
    expect(gate.issues.map((issue) => issue.code)).not.toContain("support-bundle-sensitive-data");
  });
});

const supportBundle = ({
  app = {
    name: "MobileLiveCaster" as const,
    reportVersion: 1 as const,
    bundleVersion: 18 as const
  },
  generatedAt = "2026-06-23T11:30:00.000Z",
  summary = {}
}: {
  app?: {
    name: "MobileLiveCaster";
    reportVersion: 1;
    bundleVersion: number;
  };
  generatedAt?: string;
  summary?: Partial<SupportBundle["summary"]>;
} = {}): SupportBundle =>
  ({
    app,
    generatedAt,
    summary: {
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
      platformPublishingFreshnessStatus: "fresh",
      platformPublishingFreshnessAgeMinutes: 1,
      platformPublishingFreshnessSummary: "YouTube dashboard status was checked 1 minutes ago.",
      platformPublishingFreshnessRecommendation: "Keep this fresh dashboard snapshot with the release-candidate validation run.",
      validationEvidenceRunManifest: [
        manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios" }),
        manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
      ],
      ...summary
    }
  }) as SupportBundle;

type ValidationManifestRun = SupportBundle["summary"]["validationEvidenceRunManifest"][number];

const manifestRunWithoutRigIssueCount = (
  patch: Parameters<typeof manifestRun>[0]
): ValidationManifestRun => {
  const { faceTrackingRigIssueCount: _faceTrackingRigIssueCount, ...run } = manifestRun(patch);
  return run as ValidationManifestRun;
};

const manifestRun = ({
  devicePlatform,
  fingerprint,
  eligible = true,
  result = "pass",
  physicalDevice = true,
  physicalDeviceStatus = "pass",
  fresh = true,
  matchesScope = true,
  appBuild = "rc-1",
  nativeRuntimeStatus = "pass",
  monitorHoldStatus = "pass",
  faceTrackingStatus = "pass",
  faceTrackingRuntimeFresh = true,
  faceTrackingRuntimeAgeMs = 120,
  faceTrackingActiveMotionCount = 1,
  faceTrackingRigIssueCount = 0,
  audioStatus = "pass",
  chatReadoutStatus = "pass",
  chatReadoutSpokenMessageCount = 1,
  chatReadoutSpeechFailureCount = 0,
  qualityAutomationStatus = "pass",
  platformPublishingStatus = "pass",
  platformPublishingFreshnessStatus = "fresh"
}: {
  devicePlatform: "ios" | "android";
  fingerprint: string;
  eligible?: ValidationManifestRun["eligible"];
  result?: ValidationManifestRun["result"];
  physicalDevice?: ValidationManifestRun["physicalDevice"];
  physicalDeviceStatus?: ValidationManifestRun["physicalDeviceStatus"];
  fresh?: ValidationManifestRun["fresh"];
  matchesScope?: ValidationManifestRun["matchesScope"];
  appBuild?: ValidationManifestRun["appBuild"];
  nativeRuntimeStatus?: ValidationManifestRun["nativeRuntimeStatus"];
  monitorHoldStatus?: ValidationManifestRun["monitorHoldStatus"];
  faceTrackingStatus?: ValidationManifestRun["faceTrackingStatus"];
  faceTrackingRuntimeFresh?: ValidationManifestRun["faceTrackingRuntimeFresh"];
  faceTrackingRuntimeAgeMs?: ValidationManifestRun["faceTrackingRuntimeAgeMs"];
  faceTrackingActiveMotionCount?: ValidationManifestRun["faceTrackingActiveMotionCount"];
  faceTrackingRigIssueCount?: ValidationManifestRun["faceTrackingRigIssueCount"];
  audioStatus?: ValidationManifestRun["audioStatus"];
  chatReadoutStatus?: ValidationManifestRun["chatReadoutStatus"];
  chatReadoutSpokenMessageCount?: ValidationManifestRun["chatReadoutSpokenMessageCount"];
  chatReadoutSpeechFailureCount?: ValidationManifestRun["chatReadoutSpeechFailureCount"];
  qualityAutomationStatus?: ValidationManifestRun["qualityAutomationStatus"];
  platformPublishingStatus?: ValidationManifestRun["platformPublishingStatus"];
  platformPublishingFreshnessStatus?: ValidationManifestRun["platformPublishingFreshnessStatus"];
}): ValidationManifestRun => ({
  id: `validation-${devicePlatform}`,
  fingerprint,
  createdAt: "2026-06-23T11:00:00.000Z",
  ageDays: 0,
  fresh,
  matchesScope,
  eligible,
  devicePlatform,
  deviceName: devicePlatform === "ios" ? "iPhone 15 Pro" : "Pixel 8 Pro",
  osVersion: devicePlatform === "ios" ? "iOS 18.5" : "Android 15",
  physicalDevice,
  physicalDeviceStatus,
  appBuild,
  networkProfile: "private test",
  targetPlatform: "YouTube Live",
  transport: "rtmps",
  result,
  nativeRuntimeStatus,
  monitorHoldStatus,
  faceTrackingStatus,
  faceTrackingRuntimeFresh,
  faceTrackingRuntimeAgeMs,
  faceTrackingActiveMotionCount,
  faceTrackingRigIssueCount,
  audioStatus,
  chatReadoutStatus,
  chatReadoutSpokenMessageCount,
  chatReadoutSpeechFailureCount,
  qualityAutomationStatus,
  platformPublishingStatus,
  platformPublishingFreshnessStatus,
  summary: "Validation run retained.",
  recommendation: "Keep this run with release evidence."
});
