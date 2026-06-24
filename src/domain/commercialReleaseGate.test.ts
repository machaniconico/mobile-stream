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

  it("requires explicit approval before releasing with warnings", () => {
    const bundle = supportBundle({
      summary: {
        publicLaunchStatus: "warning",
        publicLaunchWarningCount: 1,
        validationEvidenceStaleRunCount: 1
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
    bundleVersion: 14 as const
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
        manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios" }),
        manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
      ],
      ...summary
    }
  }) as SupportBundle;

const manifestRun = ({
  devicePlatform,
  fingerprint,
  eligible = true,
  result = "pass"
}: {
  devicePlatform: "ios" | "android";
  fingerprint: string;
  eligible?: boolean;
  result?: "pass" | "warn" | "fail";
}): SupportBundle["summary"]["validationEvidenceRunManifest"][number] => ({
  id: `validation-${devicePlatform}`,
  fingerprint,
  createdAt: "2026-06-23T11:00:00.000Z",
  ageDays: 0,
  fresh: true,
  matchesScope: true,
  eligible,
  devicePlatform,
  deviceName: `${devicePlatform} device`,
  osVersion: "test",
  appBuild: "rc-1",
  networkProfile: "private test",
  targetPlatform: "YouTube Live",
  transport: "rtmps",
  result,
  nativeRuntimeStatus: "pass",
  monitorHoldStatus: "pass",
  faceTrackingStatus: "pass",
  audioStatus: "pass",
  chatReadoutStatus: "pass",
  qualityAutomationStatus: "pass",
  platformPublishingStatus: "pass",
  platformPublishingFreshnessStatus: "fresh",
  summary: "Validation run retained.",
  recommendation: "Keep this run with release evidence."
});
