import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
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
});

const runVerifier = () =>
  spawnSync(process.execPath, ["scripts/verify-commercial-release-bundle.mjs", fixturePath, "--max-age-hours=24"], {
    encoding: "utf8"
  });

const writeBundle = (patch = {}) => {
  mkdirSync(dirname(fixturePath), { recursive: true });
  writeFileSync(fixturePath, JSON.stringify(createBundle(patch), null, 2));
};

const createBundle = (patch = {}) => ({
  app: {
    name: "MobileLiveCaster",
    reportVersion: 1,
    bundleVersion: 14
  },
  generatedAt: new Date().toISOString(),
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
      manifestRun("ios", "svr1-ios"),
      manifestRun("android", "svr1-android")
    ]
  },
  ...patch
});

const manifestRun = (devicePlatform, fingerprint) => ({
  id: `validation-${devicePlatform}`,
  fingerprint,
  createdAt: new Date().toISOString(),
  ageDays: 0,
  fresh: true,
  matchesScope: true,
  eligible: true,
  devicePlatform,
  deviceName: `${devicePlatform} device`,
  osVersion: "test",
  appBuild: "rc-1",
  networkProfile: "private test",
  targetPlatform: "YouTube Live",
  transport: "rtmps",
  result: "pass",
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
