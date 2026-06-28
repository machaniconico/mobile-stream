import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  releaseConfigArtifactPaths,
  requiredReleaseGateLabels
} from "./release-artifact-policy.mjs";
import { distributionArtifactManifestPath } from "./verify-distribution-artifacts.mjs";
import { dashboardEvidenceManifestPath } from "./verify-platform-dashboard-evidence.mjs";
import { storeReleaseReportArtifactGroup, storeReleaseReportType } from "./release-store-build.mjs";
import { storeSubmissionChecklistPath } from "./verify-store-submission-checklist.mjs";
import { validateStoreSubmissionApproval } from "./verify-store-submission-approval.mjs";
import { createRgbaPngFixture } from "./png-test-fixtures.mjs";

const generatedFiles = [
  "dist/index.html",
  "dist/assets/store-approval-test.js",
  "dist/assets/store-approval-test.css",
  ".artifacts/rn/main.ios.jsbundle",
  ".artifacts/rn/index.android.bundle",
  ".artifacts/mobile-live-caster-desktop.png",
  ".artifacts/mobile-live-caster-mobile.png",
  ".artifacts/distribution-artifacts.json",
  ".artifacts/store-approval-test/app-release.aab",
  ".artifacts/store-approval-test/MobileLiveCaster.ipa",
  ".artifacts/platform-dashboard-evidence.json",
  ".artifacts/store-approval-test/youtube-dashboard.png",
  ".artifacts/store-approval-test/twitch-dashboard.png",
  ".artifacts/store-approval-test/youtube-dashboard.json",
  ".artifacts/store-approval-test/twitch-dashboard.json",
  ".artifacts/store-approval-test/store-release-report.json",
  ".artifacts/store-submission-checklist.json",
  ".artifacts/store-approval-test/submission-metadata.json",
  ".artifacts/store-approval-test/submission-review.md",
  ".artifacts/store-approval-test/ios-store.png",
  ".artifacts/store-approval-test/android-store.png",
  ".artifacts/store-approval-test/support-bundle.json",
  ".artifacts/store-approval-test/ui-evidence.json",
  ".artifacts/store-approval-test/release-report.json"
];
const fileBackups = new Map();
const tinyPngBytes = createRgbaPngFixture(1, 1);
const pngBytes = pngWithDimensions(1179, 2556);
const dashboardPngBytes = pngWithDimensions(1440, 900);
const minimumDistributionArtifactBytes = 1_048_576;
const capturedAt = new Date().toISOString();
const appBuild = "rc-1";
const storeReleaseReportPath = ".artifacts/store-approval-test/store-release-report.json";
const approvalReportPath = ".artifacts/store-approval-test/release-report.json";

describe("store submission approval verifier", () => {
  beforeAll(() => {
    snapshotFiles(generatedFiles);
    writeFixtureFiles();
  });

  afterAll(() => {
    restoreFiles();
  });

  it("accepts a passed RC report with final real-device store-submission evidence captured", () => {
    const failures = validateStoreSubmissionApproval(createReport(), readStoreManifest(), approvalOptions());

    expect(failures).toEqual([]);
  });

  it("rejects symlinked release report inputs before reading linked reports", () => {
    const outsideReport = ".artifacts/store-approval-test/outside-release-report.json";
    const reportLink = ".artifacts/store-approval-test/release-report-link.json";
    writeFile(outsideReport, JSON.stringify({ secret: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456" }));
    symlinkSync(resolve(outsideReport), reportLink);

    try {
      const result = runApproval([reportLink]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`release-candidate report must not be a symbolic link: ${reportLink}`);
      expect(result.stderr).not.toContain("Authorization");
    } finally {
      rmSync(reportLink, { force: true });
      rmSync(outsideReport, { force: true });
    }
  });

  it("rejects symlinked support bundles before reading linked bundle evidence", () => {
    writeReport(approvalReportPath, createReport());
    const supportBundlePath = ".artifacts/store-approval-test/support-bundle.json";
    const outsideSupportBundle = ".artifacts/store-approval-test/outside-support-bundle.json";
    writeFile(outsideSupportBundle, readFileSync(supportBundlePath));
    rmSync(supportBundlePath, { force: true });
    symlinkSync(resolve(outsideSupportBundle), supportBundlePath);

    try {
      const result = runApproval([approvalReportPath, "--allow-dirty"]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Support bundle must not be a symbolic link: ${resolve(supportBundlePath)}`);
    } finally {
      rmSync(supportBundlePath, { force: true });
      rmSync(outsideSupportBundle, { force: true });
      writeSupportBundleFixture();
    }
  });

  it("rejects development-only RC reports for final store submission approval", () => {
    const report = createReport();
    report.git.dirty = true;
    report.git.statusShort = " M scripts/verify-store-submission-approval.test.mjs";
    report.options.allowDirty = true;
    report.options.allowCommitMismatch = true;
    const cleanGitGate = report.gates.find((gate) => gate.label === "Verify clean git worktree");
    cleanGitGate.status = "skipped";
    cleanGitGate.exitCode = null;
    cleanGitGate.error = "Allowed by --allow-dirty.";

    const failures = validateStoreSubmissionApproval(report, readStoreManifest(), approvalOptions());

    expect(failures).toContain(
      "Release report was generated from a dirty worktree and cannot be used for store submission approval."
    );
    expect(failures).toContain("Release report was generated with --allow-dirty and cannot be used for store submission approval.");
    expect(failures).toContain(
      "Release report was generated with --allow-commit-mismatch and cannot be used for store submission approval."
    );
    expect(failures).toContain("Release report clean git worktree gate must be passed for store submission approval.");
  });

  it("rejects RC reports missing clean-git approval evidence", () => {
    const report = createReport();
    report.gates = report.gates.filter((gate) => gate.label !== "Verify clean git worktree");

    const failures = validateStoreSubmissionApproval(report, readStoreManifest(), approvalOptions());

    expect(failures).toContain("Release report clean git worktree gate is missing from store submission approval evidence.");
  });

  it("rejects approval when the RC report did not capture a referenced store artifact", () => {
    const report = createReport();
    report.artifacts.files = report.artifacts.files.filter(
      (artifact) => artifact.path !== ".artifacts/store-approval-test/submission-review.md"
    );

    const failures = validateStoreSubmissionApproval(report, readStoreManifest(), approvalOptions());

    expect(failures).toContain("Release report is missing store submission artifact .artifacts/store-approval-test/submission-review.md.");
  });

  it("rejects approval when distribution artifact evidence is missing from the RC report", () => {
    const report = createReport();
    report.artifacts.files = report.artifacts.files.filter((artifact) => artifact.path !== distributionArtifactManifestPath);

    const failures = validateStoreSubmissionApproval(report, readStoreManifest(), approvalOptions());

    expect(failures).toContain(
      "Store submission approval requires distribution manifest .artifacts/distribution-artifacts.json in the RC report."
    );
  });

  it("rejects approval when a referenced distribution payload is missing from the RC report", () => {
    const report = createReport();
    report.artifacts.files = report.artifacts.files.filter(
      (artifact) => artifact.path !== ".artifacts/store-approval-test/app-release.aab"
    );

    const failures = validateStoreSubmissionApproval(report, readStoreManifest(), approvalOptions());

    expect(failures).toContain("Release report is missing distribution artifact .artifacts/store-approval-test/app-release.aab.");
  });

  it("rejects approval when dashboard status JSON evidence is missing from the RC report", () => {
    const report = createReport();
    report.artifacts.files = report.artifacts.files.filter(
      (artifact) => artifact.path !== ".artifacts/store-approval-test/twitch-dashboard.json"
    );

    const failures = validateStoreSubmissionApproval(report, readStoreManifest(), approvalOptions());

    expect(failures).toContain("Release report is missing dashboard evidence artifact .artifacts/store-approval-test/twitch-dashboard.json.");
  });

  it("rejects approval when dashboard status JSON evidence is stale", () => {
    writeDashboardEvidenceFixture({ checkedAt: new Date(Date.now() - 48 * 3_600_000).toISOString() });

    const failures = validateStoreSubmissionApproval(createReport(), readStoreManifest(), approvalOptions());

    expect(failures).toContain(
      "Dashboard evidence status JSON .artifacts/store-approval-test/youtube-dashboard.json is 48h old, above the 24h store-submission approval gate."
    );
    expect(failures).toContain(
      "Dashboard evidence status JSON .artifacts/store-approval-test/twitch-dashboard.json is 48h old, above the 24h store-submission approval gate."
    );

    writeDashboardEvidenceFixture();
  });

  it("rejects approval when store-release orchestration evidence is missing from the RC report", () => {
    const report = createReport();
    report.artifacts.files = report.artifacts.files.filter((artifact) => artifact.group !== storeReleaseReportArtifactGroup);

    const failures = validateStoreSubmissionApproval(report, readStoreManifest(), approvalOptions());

    expect(failures).toContain("Store submission approval requires store-release orchestration report in the RC report.");
  });

  it("rejects approval when the store-release gate evidence does not match the artifact", () => {
    const report = createReport();
    const gate = report.gates.find((entry) => entry.label === "Verify store release orchestration report");
    gate.evidence.sha256 = "0".repeat(64);

    const failures = validateStoreSubmissionApproval(report, readStoreManifest(), approvalOptions());

    expect(failures).toContain("Store release orchestration gate evidence SHA-256 does not match the RC report store-release artifact.");
  });

  it("rejects UI-evidence draft screenshots for final store submission approval", () => {
    writeStoreSubmissionFixture({ screenshotSource: "uiEvidenceDraft" });
    const failures = validateStoreSubmissionApproval(createReport(), readStoreManifest(), approvalOptions());

    expect(failures).toContain(
      "Store submission screenshot .artifacts/store-approval-test/ios-store.png must be captured from a real device for final store submission."
    );
    expect(failures).toContain(
      "Store submission screenshot .artifacts/store-approval-test/android-store.png must be captured from a real device for final store submission."
    );

    writeStoreSubmissionFixture();
  });

  it("rejects approval when store screenshots were captured from a different app build", () => {
    writeStoreSubmissionFixture({ appBuild: "rc-2" });

    const failures = validateStoreSubmissionApproval(createReport(), readStoreManifest(), approvalOptions());

    expect(failures).toContain(
      "Store submission screenshot .artifacts/store-approval-test/ios-store.png app build rc-2 does not match validation evidence build rc-1."
    );
    expect(failures).toContain(
      "Store submission screenshot .artifacts/store-approval-test/android-store.png app build rc-2 does not match validation evidence build rc-1."
    );

    writeStoreSubmissionFixture();
  });

  it("rejects approval when store screenshots are stale against the release report", () => {
    writeStoreSubmissionFixture({ capturedAt: new Date(Date.now() - 48 * 3_600_000).toISOString() });

    const failures = validateStoreSubmissionApproval(createReport(), readStoreManifest(), approvalOptions());

    expect(failures).toContain(
      "Store submission screenshot .artifacts/store-approval-test/ios-store.png is 48h older than the release report, above the 24h store-submission approval gate."
    );
    expect(failures).toContain(
      "Store submission screenshot .artifacts/store-approval-test/android-store.png is 48h older than the release report, above the 24h store-submission approval gate."
    );

    writeStoreSubmissionFixture();
  });
});

function approvalOptions() {
  return {
    manifestPath: storeSubmissionChecklistPath,
    maxAgeHours: 24,
    allowDirty: true,
    allowCommitMismatch: false
  };
}

function createReport() {
  writeSupportBundleFixture();
  writeUiEvidenceFile();
  const supportBundlePath = ".artifacts/store-approval-test/support-bundle.json";
  return {
    reportVersion: 1,
    app: "MobileLiveCaster",
    type: "release-candidate-verification",
    status: "passed",
    startedAt: new Date(Date.now() - 1_000).toISOString(),
    finishedAt: new Date().toISOString(),
    git: {
      commit: currentCommit(),
      branch: "main",
      dirty: false,
      statusShort: ""
    },
    options: {
      skipUi: true
    },
    supportBundle: {
      path: supportBundlePath,
      absolutePath: resolve(supportBundlePath),
      basename: "support-bundle.json",
      sha256: fileSha256(supportBundlePath)
    },
    artifacts: {
      generatedAt: new Date().toISOString(),
      files: [
        ...releaseConfigArtifactPaths.map((path) => artifactRecord("release-config", path)),
        artifactRecord("web", "dist/index.html"),
        artifactRecord("web", "dist/assets/store-approval-test.js"),
        artifactRecord("web", "dist/assets/store-approval-test.css"),
        artifactRecord("react-native", ".artifacts/rn/main.ios.jsbundle"),
        artifactRecord("react-native", ".artifacts/rn/index.android.bundle"),
        artifactRecord("ui", ".artifacts/mobile-live-caster-desktop.png"),
        artifactRecord("ui", ".artifacts/mobile-live-caster-mobile.png"),
        ...distributionArtifactRecords(),
        artifactRecord(storeReleaseReportArtifactGroup, storeReleaseReportPath),
        ...dashboardEvidenceRecords(),
        artifactRecord("store-submission", storeSubmissionChecklistPath),
        artifactRecord("store-submission", ".artifacts/store-approval-test/submission-metadata.json"),
        artifactRecord("store-submission", ".artifacts/store-approval-test/submission-review.md"),
        artifactRecord("store-submission", ".artifacts/store-approval-test/ios-store.png"),
        artifactRecord("store-submission", ".artifacts/store-approval-test/android-store.png")
      ]
    },
    gates: [
      ...requiredReleaseGateLabels.map((label) => ({
        label,
        command: "fixture",
        status: "passed",
        startedAt: new Date(Date.now() - 1_000).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 1,
        exitCode: 0,
        error: null
      })),
      {
        label: "Verify browser UI evidence",
        command: "read .artifacts/store-approval-test/ui-evidence.json",
        status: "passed",
        startedAt: new Date(Date.now() - 1_000).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 1,
        exitCode: 0,
        error: null,
        evidence: {
          path: ".artifacts/store-approval-test/ui-evidence.json",
          sha256: fileSha256(".artifacts/store-approval-test/ui-evidence.json"),
          target: "http://127.0.0.1:5173/",
          finishedAt: new Date().toISOString(),
          viewports: []
        }
      },
      {
        label: "Verify store release orchestration report",
        command: `read ${storeReleaseReportPath}`,
        status: "passed",
        startedAt: new Date(Date.now() - 1_000).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 1,
        exitCode: 0,
        error: null,
        evidence: {
          path: storeReleaseReportPath,
          sha256: fileSha256(storeReleaseReportPath),
          status: "passed",
          mode: "execute",
          platforms: ["android", "ios"],
          distributionManifest: distributionManifestSummary(distributionArtifactManifestPath)
        }
      }
    ],
    error: null
  };
}

function writeFixtureFiles() {
  writeFile("dist/index.html", "<!doctype html><title>MobileLiveCaster</title>");
  writeFile("dist/assets/store-approval-test.js", "console.log('store-approval-test');");
  writeFile("dist/assets/store-approval-test.css", "body { color: #111; }");
  writeFile(".artifacts/rn/main.ios.jsbundle", "ios bundle");
  writeFile(".artifacts/rn/index.android.bundle", "android bundle");
  writeFile(".artifacts/mobile-live-caster-desktop.png", pngBytes);
  writeFile(".artifacts/mobile-live-caster-mobile.png", pngBytes);
  writeDistributionFixture();
  writeStoreReleaseFixture();
  writeDashboardEvidenceFixture();
  writeSupportBundleFixture();
  writeStoreSubmissionFixture();
  writeUiEvidenceFile();
}

function writeSupportBundleFixture() {
  writeFile(
    ".artifacts/store-approval-test/support-bundle.json",
    JSON.stringify(
      {
        app: { name: "MobileLiveCaster", reportVersion: 1, bundleVersion: 24 },
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
          rehearsalStatus: "ready",
          rehearsalCanPromoteToPublic: true,
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
          validationEvidenceConsistentAppBuild: appBuild,
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
            supportBundleManifestRun("ios", "svr1-ios"),
            supportBundleManifestRun("android", "svr1-android")
          ]
        }
      },
      null,
      2
    )
  );
}

function supportBundleManifestRun(devicePlatform, fingerprint) {
  return {
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
    appBuild,
    networkProfile: "private test",
    targetPlatform: "YouTube Live",
    transport: "rtmps",
    result: "pass",
    nativeRuntimePlatform: devicePlatform,
    nativeRuntimeStatus: "pass",
    nativeRuntimeCompositionStatus: "applied",
    nativeRuntimeSentVideoFrames: 120,
    nativeRuntimeSentAudioFrames: 190,
    nativeRuntimeBytesWritten: 2_200_000,
    nativeRuntimeStillImageAssetCount: 1,
    nativeRuntimeStillImageAssetLoadedCount: 1,
    nativeRuntimeStillImageAssetMissingCount: 0,
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
    faceTrackingActiveMotionCount: 1,
    faceTrackingRigIssueCount: 0,
    audioStatus: "pass",
    audioMonitorHeadphonesOnly: true,
    audioNativeMonitorHeadphonesConnected: true,
    audioNativeMonitorWrittenFrames: 24576,
    audioNativeMonitorDroppedFrames: 0,
    audioNativeMonitorWrittenBuffers: 48,
    audioNativeMonitorDroppedBuffers: 0,
    audioMonitorLatencyStatus: "pass",
    audioMonitorLatencyMs: 92,
    chatReadoutStatus: "pass",
    chatReadoutSpokenMessageCount: 1,
    chatReadoutSpeechFailureCount: 0,
    qualityAutomationStatus: "pass",
    platformPublishingPlatform: "youtube-live",
    platformPublishingStatus: "pass",
    platformPublishingFreshnessStatus: "fresh",
    platformPublishingCheckedAt: new Date().toISOString(),
    platformPublishingFreshnessAgeMinutes: 0,
    platformPublishingYoutubeHasBroadcastId: true,
    platformPublishingYoutubeHasStreamId: true,
    platformPublishingYoutubeBroadcastStatus: "live",
    platformPublishingYoutubeStreamStatus: "active",
    platformPublishingYoutubeHealthStatus: "ok",
    platformPublishingYoutubeHealthIssueCount: 0,
    platformPublishingTwitchLiveStatus: "",
    platformPublishingTwitchStartedAt: "",
    platformPublishingTwitchHasCategoryId: false,
    platformPublishingTwitchViewerCount: 0,
    summary: "Validation run retained.",
    recommendation: "Keep this run with release evidence."
  };
}

function writeStoreSubmissionFixture({
  screenshotSource = "realDevice",
  appBuild: screenshotAppBuild = appBuild,
  capturedAt: screenshotCapturedAt = capturedAt
} = {}) {
  writeFile(".artifacts/store-approval-test/ios-store.png", pngBytes);
  writeFile(".artifacts/store-approval-test/android-store.png", pngBytes);
  writeFile(".artifacts/store-approval-test/submission-review.md", "# Store Submission Review\n\n- [ ] Listing reviewed.\n");
  writeFile(
    ".artifacts/store-approval-test/submission-metadata.json",
    JSON.stringify(
      {
        app: "MobileLiveCaster",
        appStore: {
          name: "MobileLiveCaster",
          subtitle: "VTuber Live Studio",
          description:
            "MobileLiveCaster lets creators compose a mobile VTuber scene, prepare RTMPS output, monitor audio, and validate stream readiness before going live.",
          keywords: "VTuber,live,streaming,RTMP,avatar",
          supportUrl: "https://example.com/mobilelivecaster/support",
          privacyPolicyUrl: "https://example.com/mobilelivecaster/privacy",
          category: "Photo & Video",
          releaseNotes: "Initial public release candidate with mobile VTuber streaming tools.",
          reviewContactEmail: "support@example.com",
          ageRatingNotes: "No gambling, no mature content included.",
          appPrivacyNotes: "Collects only user-provided stream settings and local validation evidence."
        },
        playStore: {
          name: "MobileLiveCaster",
          shortDescription: "Mobile VTuber streaming studio",
          fullDescription:
            "MobileLiveCaster helps creators prepare mobile RTMPS streams with PNGTuber controls, mic processing, chat readout checks, and release validation evidence.",
          privacyPolicyUrl: "https://example.com/mobilelivecaster/privacy",
          supportEmail: "support@example.com",
          category: "Video Players & Editors",
          releaseNotes: "Initial public release candidate with mobile VTuber streaming tools.",
          dataSafetyNotes: "Stream keys stay in secure device storage and release evidence redacts sensitive values.",
          contentRatingNotes: "No gambling, no monetized loot, no mature content included."
        },
        screenshots: [
          {
            platform: "ios",
            device: "iPhone 15 Pro Max",
            path: ".artifacts/store-approval-test/ios-store.png",
            source: screenshotSource,
            ...(screenshotSource === "realDevice"
              ? { osVersion: "iOS 18.5", appBuild: screenshotAppBuild, capturedAt: screenshotCapturedAt }
              : {})
          },
          {
            platform: "android",
            device: "Pixel 8 Pro",
            path: ".artifacts/store-approval-test/android-store.png",
            source: screenshotSource,
            ...(screenshotSource === "realDevice"
              ? { osVersion: "Android 15", appBuild: screenshotAppBuild, capturedAt: screenshotCapturedAt }
              : {})
          }
        ],
        reviewDocuments: [
          { kind: "submissionReview", path: ".artifacts/store-approval-test/submission-review.md" }
        ]
      },
      null,
      2
    )
  );
  writeFile(
    storeSubmissionChecklistPath,
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "store-submission-checklist-manifest",
        generatedAt: new Date().toISOString(),
        git: {
          commit: currentCommit(),
          branch: "main",
          dirty: true,
          statusShort: " M scripts/verify-store-submission-approval.test.mjs"
        },
        metadata: metadataRecord(),
        screenshots: [
          screenshotRecord(
            "ios",
            "iPhone 15 Pro Max",
            ".artifacts/store-approval-test/ios-store.png",
            screenshotSource,
            screenshotAppBuild,
            screenshotCapturedAt
          ),
          screenshotRecord(
            "android",
            "Pixel 8 Pro",
            ".artifacts/store-approval-test/android-store.png",
            screenshotSource,
            screenshotAppBuild,
            screenshotCapturedAt
          )
        ],
        reviewDocuments: [reviewDocumentRecord()]
      },
      null,
      2
    )
  );
}

function writeDistributionFixture() {
  writeFile(".artifacts/store-approval-test/app-release.aab", androidAabBytes());
  writeFile(".artifacts/store-approval-test/MobileLiveCaster.ipa", iosIpaBytes());
  writeFile(
    distributionArtifactManifestPath,
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "distribution-artifact-manifest",
        generatedAt: new Date().toISOString(),
        git: {
          commit: currentCommit(),
          branch: "main",
          dirty: true,
          statusShort: " M scripts/verify-store-submission-approval.test.mjs"
        },
        artifacts: [
          distributionManifestRecord("android", "aab", ".artifacts/store-approval-test/app-release.aab"),
          distributionManifestRecord("ios", "ipa", ".artifacts/store-approval-test/MobileLiveCaster.ipa")
        ]
      },
      null,
      2
    )
  );
}

function writeStoreReleaseFixture() {
  const startedAt = new Date(Date.now() - 2_000).toISOString();
  const finishedAt = new Date().toISOString();
  writeFile(
    storeReleaseReportPath,
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: storeReleaseReportType,
        status: "passed",
        mode: "execute",
        startedAt,
        finishedAt,
        durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
        platforms: ["android", "ios"],
        git: {
          commit: currentCommit(),
          branch: "main",
          dirty: true,
          statusShort: " M scripts/verify-store-submission-approval.test.mjs"
        },
        options: {
          allowDirty: true,
          allowCommitMismatch: false,
          skipEnv: false,
          skipBuild: false
        },
        artifacts: {
          distributionManifest: distributionManifestSummary(distributionArtifactManifestPath)
        },
        steps: [
          storeReleaseStep("verify-env", "npm run android:verify-release-env"),
          storeReleaseStep("android", "npm run android:bundleRelease"),
          storeReleaseStep("verify-env", "npm run ios:verify-release-env"),
          storeReleaseStep("ios", "npm run ios:archive:release"),
          storeReleaseStep("ios", "npm run ios:export:release"),
          storeReleaseStep("distribution", "npm run release:distribution-manifest")
        ],
        error: null
      },
      null,
      2
    )
  );
}

function writeDashboardEvidenceFixture({ checkedAt = capturedAt } = {}) {
  writeFile(".artifacts/store-approval-test/youtube-dashboard.png", dashboardPngBytes);
  writeFile(".artifacts/store-approval-test/twitch-dashboard.png", dashboardPngBytes);
  writeFile(
    ".artifacts/store-approval-test/youtube-dashboard.json",
    JSON.stringify({
      platform: "youtube",
      broadcastId: "ytBroadcast9xYz",
      streamId: "ytStream8aBc",
      channelId: "UCMobileLiveCaster",
      broadcastStatus: "live",
      streamStatus: "active",
      checkedAt
    })
  );
  writeFile(
    ".artifacts/store-approval-test/twitch-dashboard.json",
    JSON.stringify({
      platform: "twitch",
      broadcasterId: "123456789",
      broadcasterLogin: "mobilelivecaster",
      streamId: "987654321",
      liveStatus: "live",
      checkedAt
    })
  );
  writeFile(
    dashboardEvidenceManifestPath,
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "platform-dashboard-evidence-manifest",
        generatedAt: new Date().toISOString(),
        git: {
          commit: currentCommit(),
          branch: "main",
          dirty: true,
          statusShort: " M scripts/verify-store-submission-approval.test.mjs"
        },
        artifacts: [
          dashboardScreenshotRecord("youtube", ".artifacts/store-approval-test/youtube-dashboard.png"),
          dashboardScreenshotRecord("twitch", ".artifacts/store-approval-test/twitch-dashboard.png"),
          dashboardStatusJsonRecord("youtube", ".artifacts/store-approval-test/youtube-dashboard.json"),
          dashboardStatusJsonRecord("twitch", ".artifacts/store-approval-test/twitch-dashboard.json")
        ]
      },
      null,
      2
    )
  );
}

function writeUiEvidenceFile() {
  writeFile(
    ".artifacts/store-approval-test/ui-evidence.json",
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "browser-ui-verification",
        status: "passed",
        target: "http://127.0.0.1:5173/",
        finishedAt: new Date().toISOString(),
        git: {
          commit: currentCommit(),
          dirty: true
        },
        viewports: [
          {
            name: "desktop",
            horizontalOverflow: false,
            screenshot: artifactRecord("ui", ".artifacts/mobile-live-caster-desktop.png"),
            requiredTextChecks: requiredTextChecks()
          },
          {
            name: "mobile",
            horizontalOverflow: false,
            screenshot: artifactRecord("ui", ".artifacts/mobile-live-caster-mobile.png"),
            requiredTextChecks: requiredTextChecks()
          }
        ]
      },
      null,
      2
    )
  );
}

function readStoreManifest() {
  return JSON.parse(readFileSync(storeSubmissionChecklistPath, "utf8"));
}

function distributionArtifactRecords() {
  return [
    artifactRecord("distribution", distributionArtifactManifestPath),
    artifactRecord("distribution", ".artifacts/store-approval-test/app-release.aab"),
    artifactRecord("distribution", ".artifacts/store-approval-test/MobileLiveCaster.ipa")
  ];
}

function dashboardEvidenceRecords() {
  return [
    artifactRecord("dashboard", dashboardEvidenceManifestPath),
    artifactRecord("dashboard", ".artifacts/store-approval-test/youtube-dashboard.png"),
    artifactRecord("dashboard", ".artifacts/store-approval-test/twitch-dashboard.png"),
    artifactRecord("dashboard", ".artifacts/store-approval-test/youtube-dashboard.json"),
    artifactRecord("dashboard", ".artifacts/store-approval-test/twitch-dashboard.json")
  ];
}

function distributionManifestRecord(platform, kind, path) {
  const content = readFileSync(path);
  const zipEntryInfo =
    platform === "android"
      ? { zipEntryCount: 3, requiredZipEntries: ["BundleConfig.pb", "base/manifest/AndroidManifest.xml"] }
      : { zipEntryCount: 2, requiredZipEntries: ["Payload/*.app/Info.plist"] };
  return {
    platform,
    kind,
    path,
    basename: path.split("/").at(-1),
    ...zipEntryInfo,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function distributionManifestSummary(path) {
  const content = readFileSync(path);
  const manifest = JSON.parse(content.toString("utf8"));
  return {
    path,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
    artifactCount: Array.isArray(manifest.artifacts) ? manifest.artifacts.length : 0,
    artifacts: (manifest.artifacts || []).map((artifact) => ({
      platform: artifact.platform,
      kind: artifact.kind,
      path: artifact.path,
      bytes: artifact.bytes,
      sha256: artifact.sha256
    }))
  };
}

function storeReleaseStep(type, command) {
  return {
    type,
    command,
    status: "passed",
    startedAt: new Date(Date.now() - 1_000).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 1,
    exitCode: 0,
    error: null
  };
}

function dashboardScreenshotRecord(platform, path) {
  const content = readFileSync(path);
  const dimensions = pngDimensions(content);
  return {
    platform,
    kind: "screenshot",
    path,
    basename: path.split("/").at(-1),
    width: dimensions.width,
    height: dimensions.height,
    capturedAt,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function dashboardStatusJsonRecord(platform, path) {
  const content = readFileSync(path);
  return {
    platform,
    kind: "statusJson",
    path,
    basename: path.split("/").at(-1),
    checkedAt: JSON.parse(content.toString("utf8")).checkedAt,
    statusSummary:
      platform === "youtube"
        ? "broadcast:live:ytBroadcast9xYz stream:active:ytStream8aBc channel:UCMobileLiveCaster"
        : "live:live channel:123456789/mobilelivecaster stream:987654321",
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function metadataRecord() {
  return record("store-submission-metadata", ".artifacts/store-approval-test/submission-metadata.json");
}

function reviewDocumentRecord() {
  return record("submissionReview", ".artifacts/store-approval-test/submission-review.md");
}

function screenshotRecord(platform, device, path, source, screenshotAppBuild = appBuild, screenshotCapturedAt = capturedAt) {
  const content = readFileSync(path);
  const dimensions = pngDimensions(content);
  return {
    platform,
    kind: "screenshot",
    device,
    locale: "ja-JP",
    role: "store",
    source,
    ...(source === "realDevice"
      ? {
          osVersion: platform === "ios" ? "iOS 18.5" : "Android 15",
          appBuild: screenshotAppBuild,
          capturedAt: screenshotCapturedAt
        }
      : {}),
    path,
    basename: path.split("/").at(-1),
    width: dimensions.width,
    height: dimensions.height,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function record(kind, path) {
  const content = readFileSync(path);
  return {
    kind,
    path,
    basename: path.split("/").at(-1),
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function pngWithDimensions(width, height) {
  return createRgbaPngFixture(width, height);
}

function pngDimensions(content) {
  return {
    width: content.readUInt32BE(16),
    height: content.readUInt32BE(20)
  };
}

function androidAabBytes({ marker = 0x5a } = {}) {
  return zipArtifactBytes([
    { name: "BundleConfig.pb", data: Buffer.from("bundle config") },
    { name: "base/manifest/AndroidManifest.xml", data: Buffer.from("<manifest />") },
    { name: "base/dex/classes.dex", size: minimumDistributionArtifactBytes, marker }
  ]);
}

function iosIpaBytes({ marker = 0x49 } = {}) {
  return zipArtifactBytes([
    { name: "Payload/MobileLiveCaster.app/Info.plist", data: Buffer.from("<plist />") },
    { name: "Payload/MobileLiveCaster.app/MobileLiveCaster", size: minimumDistributionArtifactBytes, marker }
  ]);
}

function zipArtifactBytes(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = entry.data || Buffer.alloc(entry.size || 0, entry.marker || 0x5a);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function artifactRecord(group, path) {
  const content = readFileSync(path);
  return {
    group,
    path,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function requiredTextChecks() {
  return ["MobileLiveCaster", "Sources", "Go Live", "Live Setup", "PNGTuber", "RTMPS", "Face input", "Head range"].map(
    (text) => ({ text, count: 1 })
  );
}

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function currentCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

function runApproval(args) {
  return spawnSync(process.execPath, ["scripts/verify-store-submission-approval.mjs", ...args], { encoding: "utf8" });
}

function writeReport(path, report) {
  writeFile(path, JSON.stringify(report, null, 2));
}

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function snapshotFiles(paths) {
  for (const path of paths) {
    fileBackups.set(path, existsSync(path) ? readFileSync(path) : null);
  }
}

function restoreFiles() {
  for (const [path, content] of fileBackups.entries()) {
    rmSync(path, { force: true });
    if (content === null) {
      continue;
    } else {
      writeFile(path, content);
    }
  }
}
