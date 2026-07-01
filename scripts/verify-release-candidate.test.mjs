import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDistributionManifest, distributionArtifactManifestPath } from "./verify-distribution-artifacts.mjs";
import { createDashboardEvidenceManifest, dashboardEvidenceManifestPath } from "./verify-platform-dashboard-evidence.mjs";
import { createStoreSubmissionChecklist, storeSubmissionChecklistPath } from "./verify-store-submission-checklist.mjs";
import { createPhysicalDevicePreflightReport, writePhysicalDevicePreflightReport } from "./verify-physical-devices.mjs";
import { createRgbaPngFixture } from "./png-test-fixtures.mjs";
import { acquireReleaseTestLock } from "./release-test-lock.mjs";
import { requiredBrowserUiTextChecks } from "./browser-ui-required-text.mjs";

const fixtureRoot = ".artifacts/verify-release-candidate-test";
const supportBundlePath = `${fixtureRoot}/support-bundle.json`;
const reportPath = `${fixtureRoot}/release-candidate-report.json`;
const physicalDevicePreflightPath = `${fixtureRoot}/physical-device-preflight.json`;
const managedArtifactPaths = [
  storeSubmissionChecklistPath,
  distributionArtifactManifestPath,
  dashboardEvidenceManifestPath,
  `${fixtureRoot}/app-release.aab`,
  `${fixtureRoot}/MobileLiveCaster.ipa`,
  `${fixtureRoot}/youtube-dashboard.png`,
  `${fixtureRoot}/twitch-dashboard.png`,
  `${fixtureRoot}/youtube-dashboard.json`,
  `${fixtureRoot}/twitch-dashboard.json`,
  `${fixtureRoot}/ios-store.png`,
  `${fixtureRoot}/android-store.png`,
  `${fixtureRoot}/submission-metadata.json`,
  `${fixtureRoot}/submission-review.md`,
  physicalDevicePreflightPath,
  ".artifacts/physical-device-preflight.json",
  ".artifacts/ui-verification.json"
];
let artifactBackups = new Map();
let releaseTestUnlock = () => {};
const tinyPngBytes = createRgbaPngFixture(1, 1);
const minimumDistributionArtifactBytes = 1_048_576;
const pngBytes = pngWithDimensions(1179, 2556);
const appBuild = "1.0.0 (1)";

vi.setConfig({ testTimeout: 45_000 });

describe("release candidate verifier", () => {
  beforeEach(() => {
    releaseTestUnlock = acquireReleaseTestLock();
    artifactBackups = new Map(
      managedArtifactPaths.map((path) => [path, existsSync(path) ? readFileSync(path) : null])
    );
    for (const path of managedArtifactPaths) {
      rmSync(path, { force: true });
    }
    rmSync(fixtureRoot, { recursive: true, force: true });
    writeSupportBundleFixture();
  });

  afterEach(() => {
    try {
      rmSync(fixtureRoot, { recursive: true, force: true });
      restoreManagedArtifacts();
    } finally {
      releaseTestUnlock();
      releaseTestUnlock = () => {};
    }
  });

  it("fails before expensive source gates when store-submission evidence exists without handoff evidence", () => {
    writeStoreSubmissionChecklist();

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Distribution artifact manifest is required when ${storeSubmissionChecklistPath} exists.`
    );
    expect(result.stderr).toContain(
      `Dashboard evidence manifest is required when ${storeSubmissionChecklistPath} exists.`
    );
    expect(result.stderr).toContain(
      `Store release orchestration report is required when ${storeSubmissionChecklistPath} exists.`
    );
    expect(result.stderr).toContain(
      `Physical device preflight report is required when ${storeSubmissionChecklistPath} exists.`
    );
    expect(result.stdout).not.toContain("==> Run unit tests");

    const gate = readRequirementGate();
    expect(gate).toMatchObject({
      status: "failed",
      exitCode: 1,
      evidence: {
        storeSubmissionChecklistPresent: true,
        distributionArtifactManifestPresent: false,
        dashboardEvidenceManifestPresent: false,
        storeReleaseReportRequired: true,
        storeReleaseReportSupplied: false,
        physicalDevicePreflightRequired: true,
        physicalDevicePreflightSupplied: false
      }
    });
  });

  it("rejects non-loopback preview URLs before running source gates", () => {
    const result = runVerifier(["--ui-url=https://example.com/"]);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain("Usage:");
    expect(result.stderr).toContain("--ui-url must be a loopback http(s) URL");
    expect(result.stdout).not.toContain("==> Run unit tests");
  });

  it("rejects warning-approved release candidate reports before running source gates", () => {
    const result = runVerifier(["--allow-warnings"]);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain("Usage:");
    expect(result.stderr).toContain("--allow-warnings is not supported for commercial release-candidate reports.");
    expect(result.stdout).not.toContain("==> Run unit tests");
    expect(existsSync(reportPath)).toBe(false);
  });

  it("rejects symlinked support bundles before creating release candidate reports", () => {
    const outsideSupportBundle = `${fixtureRoot}/outside-support-bundle.json`;
    writeFile(outsideSupportBundle, readFileSync(supportBundlePath));
    rmSync(supportBundlePath, { force: true });
    symlinkSync(resolve(outsideSupportBundle), supportBundlePath);

    const result = runVerifier();

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`Support bundle must not be a symbolic link: ${supportBundlePath}`);
    expect(existsSync(reportPath)).toBe(false);
  });

  it("rejects symlinked release candidate report output paths before writing linked targets", () => {
    writeSupportBundleFixture({ summary: { validationEvidenceStatus: "blocked" } });
    const outsideReport = `${fixtureRoot}/outside-release-candidate-report.json`;
    writeFile(outsideReport, "unchanged");
    symlinkSync(resolve(outsideReport), reportPath);

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Release candidate report output must not be a symbolic link: ${reportPath}`);
    expect(readFileSync(outsideReport, "utf8")).toBe("unchanged");
  });

  it("rejects release candidate report output paths with symlinked parents before writing linked targets", () => {
    writeSupportBundleFixture({ summary: { validationEvidenceStatus: "blocked" } });
    const outsideReportDir = `${fixtureRoot}/outside-reports`;
    const reportLinkDir = `${fixtureRoot}/report-link-dir`;
    mkdirSync(outsideReportDir, { recursive: true });
    symlinkSync(resolve(outsideReportDir), reportLinkDir);

    const result = runVerifier([`--report-json=${reportLinkDir}/release-candidate-report.json`]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Release candidate report path parent must not be a symbolic link: ${reportLinkDir}`);
    expect(existsSync(`${outsideReportDir}/release-candidate-report.json`)).toBe(false);
  });

  it("rejects symlinked release artifact files before hashing linked targets", () => {
    writeSupportBundleFixture({ summary: { validationEvidenceStatus: "blocked" } });
    const artifactPath = ".artifacts/ui-verification.json";
    const outsideArtifact = `${fixtureRoot}/outside-ui-verification.json`;
    writeFile(outsideArtifact, "unchanged");
    rmSync(artifactPath, { force: true });
    symlinkSync(resolve(outsideArtifact), artifactPath);

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Release artifact must not be a symbolic link: ${artifactPath}`);
    expect(readFileSync(outsideArtifact, "utf8")).toBe("unchanged");
  });

  it("rejects symlinked release artifact directories before collecting linked assets", () => {
    writeSupportBundleFixture({ summary: { validationEvidenceStatus: "blocked" } });
    const distAssets = "dist/assets";
    const distAssetsBackup = `${fixtureRoot}/dist-assets-backup`;
    const outsideAssets = `${fixtureRoot}/outside-dist-assets`;
    const hadDistAssets = existsSync(distAssets);
    rmSync(distAssetsBackup, { recursive: true, force: true });
    if (hadDistAssets) {
      renameSync(distAssets, distAssetsBackup);
    }

    try {
      writeFile(`${outsideAssets}/linked.css`, "body{}");
      mkdirSync(dirname(resolve(distAssets)), { recursive: true });
      symlinkSync(resolve(outsideAssets), distAssets, "dir");

      const result = runVerifier();

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Release artifact directory must not be a symbolic link: ${distAssets}`);
    } finally {
      rmSync(distAssets, { recursive: true, force: true });
      if (hadDistAssets) {
        mkdirSync(dirname(resolve(distAssets)), { recursive: true });
        renameSync(distAssetsBackup, distAssets);
      }
    }
  });

  it("rejects skipped UI evidence captured from a non-loopback target before source gates", () => {
    writeUiEvidenceFixture({ target: "https://example.com/" });

    const result = runVerifier(["--skip-ui", `--ui-evidence-json=${fixtureRoot}/ui-evidence.json`]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("UI evidence target must be a loopback http(s) URL.");
    expect(result.stdout).not.toContain("==> Verify commercial release support bundle");

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const uiGate = report.gates.find((entry) => entry.label === "Verify browser UI evidence");
    expect(uiGate).toMatchObject({
      status: "failed",
      exitCode: 1
    });
  });

  it("rejects symlinked skipped UI evidence before reading linked JSON", () => {
    writeUiEvidenceFixture();
    const evidencePath = `${fixtureRoot}/ui-evidence.json`;
    const outsideEvidence = `${fixtureRoot}/outside-ui-evidence.json`;
    writeFile(outsideEvidence, readFileSync(evidencePath));
    rmSync(evidencePath, { force: true });
    symlinkSync(resolve(outsideEvidence), evidencePath);

    const result = runVerifier(["--skip-ui", `--ui-evidence-json=${evidencePath}`]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`UI verification evidence must not be a symbolic link: ${evidencePath}`);
    expect(result.stdout).not.toContain("==> Verify commercial release support bundle");
  });

  it("rejects skipped UI evidence paths with symlinked parents before reading linked JSON", () => {
    writeUiEvidenceFixture();
    const outsideEvidenceDir = `${fixtureRoot}/outside-evidence`;
    const evidenceLinkDir = `${fixtureRoot}/evidence-link`;
    mkdirSync(outsideEvidenceDir, { recursive: true });
    writeFile(`${outsideEvidenceDir}/ui-evidence.json`, readFileSync(`${fixtureRoot}/ui-evidence.json`));
    symlinkSync(resolve(outsideEvidenceDir), evidenceLinkDir);

    const result = runVerifier(["--skip-ui", `--ui-evidence-json=${evidenceLinkDir}/ui-evidence.json`]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`UI verification evidence path parent must not be a symbolic link: ${evidenceLinkDir}`);
    expect(result.stdout).not.toContain("==> Verify commercial release support bundle");
  });

  it("rejects skipped UI screenshot symlinks before reading linked images", () => {
    writeUiEvidenceFixture();
    const desktopPath = `${fixtureRoot}/ui-desktop.png`;
    const outsideScreenshot = `${fixtureRoot}/outside-ui-desktop.png`;
    writeFile(outsideScreenshot, readFileSync(desktopPath));
    rmSync(desktopPath, { force: true });
    symlinkSync(resolve(outsideScreenshot), desktopPath);

    const result = runVerifier(["--skip-ui", `--ui-evidence-json=${fixtureRoot}/ui-evidence.json`]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`UI evidence screenshot must not be a symbolic link: ${desktopPath}`);
    expect(result.stdout).not.toContain("==> Verify commercial release support bundle");
  });

  it("rejects skipped UI evidence when git dirty-state provenance is missing", () => {
    writeUiEvidenceFixture();
    const evidencePath = `${fixtureRoot}/ui-evidence.json`;
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    delete evidence.git.dirty;
    writeFile(evidencePath, JSON.stringify(evidence, null, 2));

    const result = runVerifier(["--skip-ui", `--ui-evidence-json=${evidencePath}`]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("UI evidence git dirty state is missing.");
    expect(result.stdout).not.toContain("==> Verify commercial release support bundle");
  });

  it("fails only on the missing store-release report when distribution and dashboard manifests exist", () => {
    writeStoreSubmissionChecklist();
    writeFile(distributionArtifactManifestPath, JSON.stringify({ type: "distribution-artifact-manifest" }));
    writeFile(dashboardEvidenceManifestPath, JSON.stringify({ type: "platform-dashboard-evidence-manifest" }));
    writePhysicalDevicePreflightFixture();

    const result = runVerifier([`--physical-device-preflight-json=${physicalDevicePreflightPath}`]);

    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain("Distribution artifact manifest is required");
    expect(result.stderr).not.toContain("Dashboard evidence manifest is required");
    expect(result.stderr).toContain(
      `Store release orchestration report is required when ${storeSubmissionChecklistPath} exists.`
    );
    expect(result.stderr).not.toContain("Physical device preflight report is required");

    const gate = readRequirementGate();
    expect(gate).toMatchObject({
      status: "failed",
      exitCode: 1,
      evidence: {
        storeSubmissionChecklistPresent: true,
        distributionArtifactManifestPresent: true,
        dashboardEvidenceManifestPresent: true,
        storeReleaseReportRequired: true,
        storeReleaseReportSupplied: false,
        physicalDevicePreflightRequired: true,
        physicalDevicePreflightSupplied: true
      }
    });
  });

  it("fails before validating a supplied store-release report when required manifests are missing", () => {
    writeStoreSubmissionChecklist();

    const result = runVerifier([`--store-release-report-json=${fixtureRoot}/missing-store-release-report.json`]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Distribution artifact manifest is required when ${storeSubmissionChecklistPath} exists.`
    );
    expect(result.stderr).toContain(
      `Dashboard evidence manifest is required when ${storeSubmissionChecklistPath} exists.`
    );
    expect(result.stderr).not.toContain("Store release orchestration report is required");
    expect(result.stdout).not.toContain("==> Run unit tests");

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    expect(report.gates.some((entry) => entry.label === "Verify store release orchestration report")).toBe(false);
    const gate = readRequirementGate(report);
    expect(gate).toMatchObject({
      status: "failed",
      exitCode: 1,
      evidence: {
        storeSubmissionChecklistPresent: true,
        distributionArtifactManifestPresent: false,
        dashboardEvidenceManifestPresent: false,
        storeReleaseReportRequired: true,
        storeReleaseReportSupplied: true
      }
    });
  });

  it("fails before expensive source gates when dashboard handoff status evidence is stale", () => {
    writeValidHandoffEvidence({
      dashboardCheckedAt: new Date(Date.now() - 49 * 3_600_000).toISOString()
    });
    writePhysicalDevicePreflightFixture();

    const result = runVerifier([
      `--store-release-report-json=${fixtureRoot}/missing-store-release-report.json`,
      `--physical-device-preflight-json=${physicalDevicePreflightPath}`
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Dashboard evidence status JSON ${fixtureRoot}/youtube-dashboard.json is 49h old, above the 24h release gate.`
    );
    expect(result.stderr).toContain(
      `Dashboard evidence status JSON ${fixtureRoot}/twitch-dashboard.json is 49h old, above the 24h release gate.`
    );
    expect(result.stdout).not.toContain("==> Run unit tests");

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const gate = report.gates.find((entry) => entry.label === "Verify store submission handoff evidence integrity");
    expect(gate).toMatchObject({
      status: "failed",
      exitCode: 1
    });
    expect(report.gates.some((entry) => entry.label === "Verify store release orchestration report")).toBe(false);
  });

  it("passes handoff integrity before validating the supplied store-release report", () => {
    writeValidHandoffEvidence();
    writePhysicalDevicePreflightFixture();

    const result = runVerifier([
      `--store-release-report-json=${fixtureRoot}/missing-store-release-report.json`,
      `--physical-device-preflight-json=${physicalDevicePreflightPath}`
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`Could not read store release orchestration report at ${fixtureRoot}/missing-store-release-report.json`);
    expect(result.stdout).not.toContain("==> Run unit tests");

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const handoffGate = report.gates.find((entry) => entry.label === "Verify store submission handoff evidence integrity");
    expect(handoffGate).toMatchObject({
      status: "passed",
      exitCode: 0,
      evidence: {
        distributionManifest: {
          path: distributionArtifactManifestPath
        },
        dashboardEvidenceManifest: {
          path: dashboardEvidenceManifestPath
        },
        storeSubmissionChecklist: {
          path: storeSubmissionChecklistPath
        }
      }
    });

    const storeReleaseGate = report.gates.find((entry) => entry.label === "Verify store release orchestration report");
    expect(storeReleaseGate).toMatchObject({
      status: "failed",
      exitCode: 2
    });
  });

  it("rejects blocked physical-device preflight reports before expensive source gates", () => {
    writeSupportBundleFixture({ summary: { validationEvidenceStatus: "blocked" } });
    writePhysicalDevicePreflightFixture({ status: "blocked" });

    const result = runVerifier([`--physical-device-preflight-json=${physicalDevicePreflightPath}`]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Physical device preflight status must be ready");
    expect(result.stdout).not.toContain("==> Run unit tests");

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const gate = report.gates.find((entry) => entry.label === "Verify physical device preflight");
    expect(gate).toMatchObject({
      status: "failed",
      exitCode: 1
    });
  });

  it("records a passing physical-device preflight gate and artifact", () => {
    writeSupportBundleFixture({ summary: { validationEvidenceStatus: "blocked" } });
    writePhysicalDevicePreflightFixture();

    const result = runVerifier([`--physical-device-preflight-json=${physicalDevicePreflightPath}`]);

    expect(result.status).toBe(1);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const gate = report.gates.find((entry) => entry.label === "Verify physical device preflight");
    expect(gate).toMatchObject({
      status: "passed",
      exitCode: 0,
      evidence: {
        path: physicalDevicePreflightPath,
        mode: "all",
        androidDeviceCount: 1,
        iosDeviceCount: 1,
        runbook: {
          summary: "7 commercial physical-device validation step(s) are ready to execute for all mode.",
          stepCount: 7,
          readyStepCount: 7,
          waitingStepCount: 0,
          stepIds: [
            "android-private-rtmps",
            "android-mediacodec-compositor",
            "android-monitor-latency",
            "ios-private-rtmps",
            "ios-app-group-still-image",
            "ios-monitor-latency",
            "youtube-twitch-ingest"
          ]
        }
      }
    });
    expect(report.artifacts.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          group: "physical-device-preflight",
          path: physicalDevicePreflightPath
        })
      ])
    );
  });

  it("fails invalid support bundles before expensive source gates", () => {
    writeSupportBundleFixture({ summary: { validationEvidenceStatus: "blocked" } });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("==> Verify commercial release support bundle");
    expect(result.stdout).not.toContain("==> Run unit tests");
    expect(result.stdout).toContain("Physical validation evidence");

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const supportBundleGate = report.gates.find((entry) => entry.label === "Verify commercial release support bundle");
    expect(supportBundleGate).toMatchObject({
      status: "failed",
      exitCode: 1
    });
    expect(report.gates.some((entry) => entry.label === "Run unit tests")).toBe(false);
  });
});

function runVerifier(extraArgs = []) {
  return spawnSync(
    process.execPath,
    [
      "scripts/verify-release-candidate.mjs",
      supportBundlePath,
      "--allow-dirty",
      `--report-json=${reportPath}`,
      ...extraArgs
    ],
    { encoding: "utf8" }
  );
}

function readRequirementGate(report = JSON.parse(readFileSync(reportPath, "utf8"))) {
  return report.gates.find((entry) => entry.label === "Verify store submission evidence requirements");
}

function writeStoreSubmissionChecklist() {
  writeFile(
    storeSubmissionChecklistPath,
    JSON.stringify({
      reportVersion: 1,
      app: "MobileLiveCaster",
      type: "store-submission-checklist-manifest"
    })
  );
}

function writePhysicalDevicePreflightFixture(patch = {}) {
  const report = createPhysicalDevicePreflightReport({
    androidAdbOutput: `List of devices attached
R58M123456B device product:r0q model:SM_S901B device:r0q transport_id:4
`,
    androidRuntimeProperties: {
      R58M123456B: `[ro.kernel.qemu]: [0]
[ro.boot.qemu]: [0]
[ro.hardware]: [qcom]
`
    },
    androidRuntimeCommands: {
      R58M123456B: { ok: true, tool: "adb", stdout: "", detail: "command succeeded" }
    },
    iosXctraceOutput: `== Devices ==
Release iPhone (17.5.1) (00008110-001234560E91801E)
== Simulators ==
iPhone 16 Pro (18.0) (B50D8051-8C22-4E18-A95B-C3AFB39F9451)
`
  });
  writePhysicalDevicePreflightReport({ ...report, ...patch }, physicalDevicePreflightPath);
}

function writeSupportBundleFixture(patch = {}) {
  writeFile(supportBundlePath, JSON.stringify(commercialSupportBundleFixture(patch), null, 2));
}

function commercialSupportBundleFixture(patch = {}) {
  const summary = {
    preflightStatus: "ready",
    publicLaunchStatus: "ready",
    publicLaunchCanStart: true,
    publicLaunchWarningCount: 0,
    publicLaunchFailCount: 0,
    publicLaunchStartLockBlocked: false,
    publicLaunchStartLockSummary: "Public start lock is clear.",
    publicLaunchStartLockAction: "Go Live while dashboard freshness remains current.",
    publicLaunchConfirmationEventCount: 0,
    publicLaunchLastConfirmationStatus: "none",
    publicLaunchLastConfirmationAt: null,
    publicLaunchLastConfirmationMessage: "",
    sceneFingerprint: "scene1-ready",
    textOverlayStatus: "pass",
    textOverlaySourceCount: 2,
    textOverlayVisibleSourceCount: 2,
    textOverlayManualSourceCount: 2,
    textOverlayVisibleManualSourceCount: 2,
    textOverlayRuntimeCaptionSourceCount: 0,
    textOverlayVisibleRuntimeCaptionSourceCount: 0,
    textOverlayRenderVisibleSourceCount: 2,
    textOverlayActiveTimedManualSourceCount: 0,
    textOverlayQueuedTimedManualSourceCount: 0,
    textOverlayExpiredTimedManualSourceCount: 0,
    textOverlayPersistentManualSourceCount: 2,
    textOverlayEmptyVisibleManualSourceCount: 0,
    textOverlayTransparentVisibleSourceCount: 1,
    textOverlaySensitiveContentIssueCount: 0,
    textOverlayDominantBackdropIssueCount: 0,
    textOverlayLayoutRiskIssueCount: 0,
    textOverlaySafeAreaIssueCount: 0,
    textOverlayAvatarOverlapIssueCount: 0,
    textOverlaySummary: "2/2 text overlays on program output.",
    textOverlayRecommendation: "Keep text overlays unchanged.",
    chatOverlayStatus: "pass",
    chatOverlaySourceCount: 1,
    chatOverlayVisibleSourceCount: 1,
    chatOverlayTransparentVisibleSourceCount: 1,
    chatOverlayUrlRedactionDisabledCount: 0,
    chatOverlayOpaqueBackgroundIssueCount: 0,
    chatOverlayLayoutRiskIssueCount: 0,
    chatOverlaySafeAreaIssueCount: 0,
    chatOverlayAvatarOverlapIssueCount: 0,
    chatOverlaySummary: "1/1 chat overlay visible.",
    chatOverlayRecommendation: "Keep chat overlay settings unchanged.",
    nativeCompositionNativeOverlayCount: 4,
    nativeCompositionStillImageOverlayCount: 1,
    nativeCompositionTextOverlayCount: 2,
    nativeCompositionCaptionOverlayCount: 1,
    nativeCompositionChatOverlayCount: 1,
    liveCaptionStatus: "info",
    liveCaptionEnabled: false,
    liveCaptionRecognitionStatus: "unavailable",
    liveCaptionRuntimeSourceCount: 0,
    liveCaptionVisibleRuntimeSourceCount: 0,
    liveCaptionActiveCueCount: 0,
    liveCaptionFinalCueCount: 0,
    liveCaptionTranscriptCount: 0,
    liveCaptionSummary: "Live captions are disabled.",
    liveCaptionRecommendation: "Enable live captions when subtitles are part of the launch plan.",
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
    validationEvidencePlatformIngestIosPass: true,
    validationEvidencePlatformIngestAndroidPass: true,
    validationEvidenceRunManifest: [
      supportBundleManifestRun("ios", "svr1-ios"),
      supportBundleManifestRun("android", "svr1-android")
    ]
  };

  return {
    app: { name: "MobileLiveCaster", reportVersion: 1, bundleVersion: 55 },
    generatedAt: new Date().toISOString(),
    fixture: true,
    profile: {
      androidPublisherMode: "mediacodec"
    },
    scene: {
      fingerprint: "scene1-ready"
    },
    ...patch,
    summary: {
      ...summary,
      ...(patch.summary ?? {})
    }
  };
}

function supportBundleManifestRun(devicePlatform, fingerprint) {
  const capturedAt = new Date().toISOString();
  return {
    id: `validation-${devicePlatform}`,
    fingerprint,
    createdAt: capturedAt,
    ageDays: 0,
    fresh: true,
    matchesScope: true,
    eligible: true,
    devicePlatform,
    androidPublisherMode: devicePlatform === "android" ? "mediacodec" : null,
    deviceName: devicePlatform === "ios" ? "iPhone 15 Pro" : "Pixel 8 Pro",
    osVersion: devicePlatform === "ios" ? "iOS 18.5" : "Android 15",
    physicalDevice: true,
    physicalDeviceStatus: "pass",
    appBuild,
    networkProfile: "private test",
    sceneFingerprint: "scene1-ready",
    targetPlatform: "YouTube Live",
    transport: "rtmps",
    result: "pass",
    nativeRuntimePlatform: devicePlatform,
    nativeRuntimeStatus: "pass",
    nativeRuntimeVideoEncoderBackend: devicePlatform === "ios" ? "videotoolbox-h264" : "mediacodec-h264",
    nativeRuntimeAudioEncoderBackend: devicePlatform === "ios" ? "audiotoolbox-aac" : "mediacodec-aac",
    nativeRuntimeCongested: false,
    nativeRuntimeQueuedItems: 0,
    nativeRuntimeCacheSize: 0,
    nativeRuntimeDroppedVideoFrames: 0,
    nativeRuntimeDroppedAudioFrames: 0,
    nativeRuntimeCompositionStatus: "applied",
    nativeRuntimeCompositionAppliedCount: 4,
    nativeRuntimeCompositionAppliedKinds: ["caption", "chat", "pngtuber", "text"],
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
    nativeRuntimeCompositorBackend: devicePlatform === "android" ? "android-canvas-mediacodec" : "ios-replaykit-coregraphics",
    nativeRuntimeCompositedFrameCount: 120,
    nativeRuntimeDroppedFrameCount: 0,
    nativeRuntimeCompositionFailureCount: 0,
    nativeRuntimeLiveRenderGraphReloadCount: 0,
    nativeRuntimeLiveRenderGraphRejectedUpdateCount: 0,
    nativeRuntimeStillImageAssetAppGroupCount: devicePlatform === "ios" ? 1 : 0,
    nativeRuntimeStillImageAssetAppGroupLoadedCount: devicePlatform === "ios" ? 1 : 0,
    nativeRuntimeStillImageAssetAppGroupDecodedCount: devicePlatform === "ios" ? 1 : 0,
    nativeRuntimeStillImageAssetAppGroupDecodedPixelCount: devicePlatform === "ios" ? 921_600 : 0,
    nativeRuntimeStillImageAssetAppGroupCompositedCount: devicePlatform === "ios" ? 1 : 0,
    nativeRuntimeStillImageAssetAppGroupCompositedPixelCount: devicePlatform === "ios" ? 921_600 : 0,
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
    faceTrackingRigPartSeparationScore: 100,
    faceTrackingRigDepthContinuityScore: 100,
    faceTrackingRigSemanticSegmentScore: 100,
    faceTrackingRigEyeMouthSegmentScore: 100,
    faceTrackingRigHorizontalAnchorScore: 100,
    faceTrackingRigHighFidelityScore: 100,
    faceTrackingRigHighFidelityGrade: "ready",
    audioStatus: "pass",
    audioOutputRoute: "wired-headphones",
    audioMonitorHeadphonesOnly: true,
    audioNativeMonitorRoute: "wired-headphones",
    audioNativeMonitorRouteMatchesOutput: true,
    audioNativeMonitorHeadphonesConnected: true,
    audioNativeMonitorWrittenFrames: 24576,
    audioNativeMonitorDroppedFrames: 0,
    audioNativeMonitorWrittenBuffers: 48,
    audioNativeMonitorDroppedBuffers: 0,
    audioMonitorLatencyStatus: "pass",
    audioMonitorLatencyMs: 92,
    audioMonitorLatencyBudgetMs: 180,
    audioMonitorLatencySource: "native-route-monitor",
    audioMonitorTuningNote: "Wired monitor route measured under release load.",
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
    platformPublishingCheckedAt: capturedAt,
    platformPublishingFreshnessAgeMinutes: 0,
    platformPublishingObservedAgeMinutes: 0,
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

function writeValidHandoffEvidence({ dashboardCheckedAt = new Date().toISOString() } = {}) {
  writeFile(`${fixtureRoot}/app-release.aab`, androidAabBytes());
  writeFile(`${fixtureRoot}/MobileLiveCaster.ipa`, iosIpaBytes());
  createDistributionManifest({
    androidAab: `${fixtureRoot}/app-release.aab`,
    iosIpa: `${fixtureRoot}/MobileLiveCaster.ipa`
  });

  writeFile(`${fixtureRoot}/youtube-dashboard.png`, pngBytes);
  writeFile(`${fixtureRoot}/twitch-dashboard.png`, pngBytes);
  writeFile(
    `${fixtureRoot}/youtube-dashboard.json`,
    JSON.stringify({
      platform: "youtube",
      broadcastId: "ytBroadcast9xYz",
      streamId: "ytStream8aBc",
      channelId: "UCMobileLiveCaster",
      broadcastStatus: "live",
      streamStatus: "active",
      checkedAt: dashboardCheckedAt
    })
  );
  writeFile(
    `${fixtureRoot}/twitch-dashboard.json`,
    JSON.stringify({
      platform: "twitch",
      broadcasterId: "123456789",
      broadcasterLogin: "mobilelivecaster",
      streamId: "987654321",
      liveStatus: "live",
      checkedAt: dashboardCheckedAt
    })
  );
  createDashboardEvidenceManifest({
    youtubeScreenshot: `${fixtureRoot}/youtube-dashboard.png`,
    youtubeScreenshotCapturedAt: dashboardCheckedAt,
    twitchScreenshot: `${fixtureRoot}/twitch-dashboard.png`,
    twitchScreenshotCapturedAt: dashboardCheckedAt,
    youtubeJson: `${fixtureRoot}/youtube-dashboard.json`,
    twitchJson: `${fixtureRoot}/twitch-dashboard.json`
  });

  writeFile(`${fixtureRoot}/ios-store.png`, pngBytes);
  writeFile(`${fixtureRoot}/android-store.png`, pngBytes);
  writeFile(`${fixtureRoot}/submission-review.md`, "# MobileLiveCaster Store Submission Review\n\n- Listing copy reviewed.\n");
  writeFile(
    `${fixtureRoot}/submission-metadata.json`,
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
            path: `${fixtureRoot}/ios-store.png`,
            source: "realDevice",
            osVersion: "iOS 18.5",
            appBuild,
            capturedAt: new Date().toISOString()
          },
          {
            platform: "android",
            device: "Pixel 8 Pro",
            path: `${fixtureRoot}/android-store.png`,
            source: "realDevice",
            osVersion: "Android 15",
            appBuild,
            capturedAt: new Date().toISOString()
          }
        ],
        reviewDocuments: [{ kind: "submissionReview", path: `${fixtureRoot}/submission-review.md` }]
      },
      null,
      2
    )
  );
  createStoreSubmissionChecklist({ metadataPath: `${fixtureRoot}/submission-metadata.json` });
}

function writeUiEvidenceFixture({ target = "http://127.0.0.1:5173/" } = {}) {
  const desktopPath = `${fixtureRoot}/ui-desktop.png`;
  const mobilePath = `${fixtureRoot}/ui-mobile.png`;
  writeFile(desktopPath, pngBytes);
  writeFile(mobilePath, pngBytes);
  writeFile(
    `${fixtureRoot}/ui-evidence.json`,
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "browser-ui-verification",
        status: "passed",
        target,
        finishedAt: new Date().toISOString(),
        git: {
          commit: currentCommit(),
          dirty: true
        },
        viewports: [
          uiViewportEvidence("desktop", desktopPath),
          uiViewportEvidence("mobile", mobilePath)
        ]
      },
      null,
      2
    )
  );
}

function uiViewportEvidence(name, path) {
  return {
    name,
    horizontalOverflow: false,
    requiredTextChecks: requiredBrowserUiTextChecks.map((text) => ({ text, count: 1 })),
    screenshot: fileRecord(path)
  };
}

function fileRecord(path) {
  const content = readFileSync(path);
  return {
    path,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function currentCommit() {
  return spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
}

function restoreManagedArtifacts() {
  for (const [path, content] of artifactBackups.entries()) {
    rmSync(path, { force: true });
    if (content === null) {
      continue;
    } else {
      writeFile(path, content);
    }
  }
}

function writeFile(path, content) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, content);
}

function pngWithDimensions(width, height) {
  return createRgbaPngFixture(width, height);
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
