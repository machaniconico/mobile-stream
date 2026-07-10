import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  androidNativeDebugArtifactPath,
  gitleaksHistoryScanArtifactPath,
  iosNativeVerificationArtifactPath,
  releaseConfigArtifactPaths,
  sourceSecretScanArtifactGroup,
  sourceSecretScanArtifactPath,
  requiredReleaseGateLabels
} from "./release-artifact-policy.mjs";
import { distributionArtifactManifestPath } from "./verify-distribution-artifacts.mjs";
import { dashboardEvidenceManifestPath } from "./verify-platform-dashboard-evidence.mjs";
import { storeSubmissionChecklistPath } from "./verify-store-submission-checklist.mjs";
import { storeReleaseReportArtifactGroup, storeReleaseReportType } from "./release-store-build.mjs";
import {
  createPhysicalDevicePreflightReport,
  physicalDevicePreflightArtifactGroup,
  writePhysicalDevicePreflightReport
} from "./verify-physical-devices.mjs";
import { validateReport } from "./verify-release-report.mjs";
import { createRgbaPngFixture } from "./png-test-fixtures.mjs";
import { acquireReleaseTestLock, releaseTestLockHookTimeoutMs } from "./release-test-lock.mjs";
import { requiredBrowserUiTextChecks } from "./browser-ui-required-text.mjs";
import {
  nativeBuildArtifactRecords,
  nativeBuildFixturePaths,
  writeNativeBuildFixture
} from "./native-build-test-fixtures.mjs";

const fixtureRoot = ".artifacts/release-report-test";
const nativeBuildPaths = nativeBuildFixturePaths(fixtureRoot);
const generatedFiles = [
  "dist/index.html",
  "dist/assets/release-report-test.js",
  "dist/assets/release-report-test.css",
  ".artifacts/rn/main.ios.jsbundle",
  ".artifacts/rn/index.android.bundle",
  gitleaksHistoryScanArtifactPath,
  sourceSecretScanArtifactPath,
  ...nativeBuildPaths.allPaths,
  ".artifacts/mobile-live-caster-desktop.png",
  ".artifacts/mobile-live-caster-mobile.png",
  ".artifacts/ui-verification.json",
  ".artifacts/distribution-artifacts.json",
  ".artifacts/release-report-test/app-release.aab",
  ".artifacts/release-report-test/MobileLiveCaster.ipa",
  ".artifacts/platform-dashboard-evidence.json",
  ".artifacts/release-report-test/youtube-dashboard.png",
  ".artifacts/release-report-test/twitch-dashboard.png",
  ".artifacts/release-report-test/youtube-dashboard.json",
  ".artifacts/release-report-test/twitch-dashboard.json",
  ".artifacts/store-submission-checklist.json",
  ".artifacts/release-report-test/store-release-report.json",
  ".artifacts/release-report-test/store-submission-metadata.json",
  ".artifacts/release-report-test/submission-review.md",
  ".artifacts/release-report-test/ios-store.png",
  ".artifacts/release-report-test/android-store.png",
  ".artifacts/release-report-test/physical-device-preflight.json",
  ".artifacts/release-report-test/support-bundle.json",
  ".artifacts/release-report-test/ui-evidence.json"
];
const fileBackups = new Map();
let releaseTestUnlock = () => {};
const tinyPngBytes = createRgbaPngFixture(1, 1);
const minimumDistributionArtifactBytes = 1_048_576;
const pngBytes = pngWithDimensions(1179, 2556);
const capturedAt = "2026-06-25T00:00:00.000Z";
const physicalDevicePreflightPath = ".artifacts/release-report-test/physical-device-preflight.json";

vi.setConfig({ hookTimeout: releaseTestLockHookTimeoutMs });

describe("release report verifier", () => {
  beforeAll(() => {
    releaseTestUnlock = acquireReleaseTestLock();
    snapshotFiles(generatedFiles);
    writeFixtureFiles();
  });

  afterAll(() => {
    try {
      restoreFiles();
    } finally {
      releaseTestUnlock();
      releaseTestUnlock = () => {};
    }
  });

  it("accepts a complete release report with matching support, UI, and artifact hashes", () => {
    const failures = validateReport(createReport(), reportOptions());

    expect(failures).toEqual([]);
  });

  it.each(["Build Android native debug app", "Build iOS native simulator app"])(
    "rejects release reports missing required native build gate %s",
    (label) => {
      const report = createReport();
      report.gates = report.gates.filter((gate) => gate.label !== label);

      expect(validateReport(report, reportOptions())).toContain(`Report is missing gate ${JSON.stringify(label)}.`);
    }
  );

  it.each([
    ["Android", androidNativeDebugArtifactPath],
    ["iOS", iosNativeVerificationArtifactPath]
  ])("rejects release reports missing the %s native artifact", (_platform, path) => {
    const report = createReport();
    report.artifacts.files = report.artifacts.files.filter((artifact) => artifact.path !== path);

    expect(validateReport(report, reportOptions()).join("\n")).toContain(path);
  });

  it("rejects release reports missing the source secret scan artifact", () => {
    const report = createReport();
    report.artifacts.files = report.artifacts.files.filter((artifact) => artifact.path !== sourceSecretScanArtifactPath);

    expect(validateReport(report, reportOptions())).toContain(
      `Report is missing source secret scan artifact ${sourceSecretScanArtifactPath}.`
    );
  });

  it("rejects release reports missing the gitleaks history scan artifact", () => {
    const report = createReport();
    report.artifacts.files = report.artifacts.files.filter((artifact) => artifact.path !== gitleaksHistoryScanArtifactPath);

    expect(validateReport(report, reportOptions())).toContain(
      `Report is missing gitleaks history scan artifact ${gitleaksHistoryScanArtifactPath}.`
    );
  });

  it("rejects release reports with stale gitleaks history scan timing", () => {
    const report = createReport();
    rewriteGitleaksHistoryScan(report, {
      generatedAt: new Date(Date.parse(report.startedAt) - 1_000).toISOString()
    });

    expect(validateReport(report, reportOptions())).toContain(
      "Gitleaks history scan artifact generatedAt is before the release report startedAt."
    );
  });

  it("rejects release reports with stale source secret scan timing", () => {
    const report = createReport();
    rewriteSourceSecretScan(report, {
      generatedAt: new Date(Date.parse(report.startedAt) - 1_000).toISOString()
    });

    expect(validateReport(report, reportOptions())).toContain(
      "Source secret scan artifact generatedAt is before the release report startedAt."
    );
  });

  it.each([
    ["status", (nativeReport) => { nativeReport.status = "failed"; }, "status must be passed"],
    [
      "ReplayKit process mode",
      (nativeReport) => { nativeReport.broadcastUploadExtension.processMode = "RPBroadcastProcessModeUserContext"; },
      "ReplayKit process mode is invalid"
    ],
    [
      "embedded executable SHA",
      (nativeReport) => { nativeReport.broadcastUploadExtension.embedded.executable.sha256 = "0".repeat(64); },
      "embedded ReplayKit executable does not match its full bundle manifest record"
    ]
  ])("rejects iOS native verification with a tampered %s after the outer hash is updated", (_label, mutate, message) => {
    const report = createReport();
    rewriteIosNativeVerification(report, mutate);

    expect(validateReport(report, reportOptions()).join("\n")).toContain(message);
  });

  it("rejects symlinked release report input paths before reading linked reports", () => {
    const sourceReportPath = ".artifacts/release-report-test/release-candidate-report.json";
    const reportSymlink = ".artifacts/release-report-test/release-candidate-report-link.json";
    writeFile(sourceReportPath, JSON.stringify(createReport(), null, 2));
    rmSync(reportSymlink, { force: true });
    symlinkSync(resolve(sourceReportPath), reportSymlink);

    try {
      const result = runVerifier([reportSymlink, "--allow-dirty", "--allow-commit-mismatch"]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`release-candidate report must not be a symbolic link: ${reportSymlink}`);
    } finally {
      rmSync(reportSymlink, { force: true });
      rmSync(sourceReportPath, { force: true });
    }
  });

  it("rejects release reports whose support bundle fails the commercial release gate", () => {
    const report = createReport({
      supportBundlePatch: {
        summary: {
          validationEvidenceStatus: "blocked"
        }
      }
    });

    const failures = validateReport(report, reportOptions());

    expect(failures.join("\n")).toContain("Release report support bundle commercial release gate must be ready, got blocked:");
    expect(failures.join("\n")).toContain("Release report support bundle validation-evidence-not-ready");
  });

  it("rejects symlinked support bundles before reading linked targets", () => {
    const report = createReport();
    const supportBundlePath = ".artifacts/release-report-test/support-bundle.json";
    const outsideSupportBundle = ".artifacts/release-report-test/outside-support-bundle.json";
    writeFile(outsideSupportBundle, readFileSync(supportBundlePath));
    rmSync(supportBundlePath, { force: true });
    symlinkSync(resolve(outsideSupportBundle), supportBundlePath);

    try {
      const failures = validateReport(report, reportOptions());

      expect(failures).toContain(`Support bundle must not be a symbolic link: ${report.supportBundle.absolutePath}.`);
    } finally {
      rmSync(supportBundlePath, { force: true });
      rmSync(outsideSupportBundle, { force: true });
      writeSupportBundleFixture();
    }
  });

  it("rejects stale retained validation runs in the support bundle", () => {
    const report = createReport({
      supportBundlePatch: {
        summary: {
          validationEvidenceStaleRunCount: 1
        }
      }
    });

    const failures = validateReport(report, reportOptions());

    expect(failures.join("\n")).toContain("Release report support bundle commercial release gate must be ready, got blocked:");
    expect(failures.join("\n")).toContain("Release report support bundle validation-evidence-stale-retained-runs");
  });

  it("keeps stale retained validation runs blocking when the RC report accepted warnings", () => {
    const failures = validateReport(
      createReport({
        allowWarnings: true,
        supportBundlePatch: {
          summary: {
            validationEvidenceStaleRunCount: 1
          }
        }
      }),
      reportOptions()
    );

    expect(failures.join("\n")).toContain("Release report support bundle commercial release gate must be ready, got blocked:");
    expect(failures.join("\n")).toContain("Release report support bundle validation-evidence-stale-retained-runs");
  });

  it("rejects release reports generated with warning approval", () => {
    const failures = validateReport(createReport({ allowWarnings: true }), reportOptions());

    expect(failures).toContain("Report was generated with --allow-warnings and cannot be used for commercial approval.");
  });

  it("rejects release reports when an artifact hash no longer matches the workspace file", () => {
    const report = createReport();
    report.artifacts.files[0].sha256 = "0".repeat(64);

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain(`Artifact metadata mismatch for ${report.artifacts.files[0].path}.`);
  });

  it("rejects release reports when git dirty-state provenance is missing", () => {
    const report = createReport();
    delete report.git.dirty;

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Report git dirty state is missing.");
  });

  it("rejects non-canonical artifact paths before reading release evidence", () => {
    const report = createReport();
    const artifact = report.artifacts.files.find((candidate) => candidate.path === "dist/index.html");
    artifact.path = "dist/../dist/index.html";

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Artifact path must be workspace-relative: dist/../dist/index.html.");
  });

  it("rejects dot-prefixed artifact paths before reading release evidence", () => {
    const report = createReport();
    const artifact = report.artifacts.files.find((candidate) => candidate.path === "dist/index.html");
    artifact.path = "./dist/index.html";

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Artifact path must be workspace-relative: ./dist/index.html.");
  });

  it("rejects symlinked artifact paths before reading linked release evidence", () => {
    const report = createReport();
    const artifact = report.artifacts.files.find((candidate) => candidate.path === "dist/index.html");
    const originalDistIndex = readFileSync("dist/index.html");
    const outsideArtifact = ".artifacts/release-report-test/outside-index.html";
    writeFile(outsideArtifact, "<!doctype html><title>Outside</title>");
    rmSync("dist/index.html", { force: true });
    symlinkSync(resolve(outsideArtifact), "dist/index.html");

    try {
      const failures = validateReport(report, reportOptions());

      expect(failures).toContain(`Artifact must not be a symbolic link: ${artifact.path}.`);
    } finally {
      rmSync("dist/index.html", { force: true });
      writeFile("dist/index.html", originalDistIndex);
      rmSync(outsideArtifact, { force: true });
    }
  });

  it("rejects artifact paths with symlinked parents before reading linked release evidence", () => {
    const report = createReport();
    const outsideArtifactDir = ".artifacts/release-report-test/outside-artifacts";
    const artifactLinkDir = ".artifacts/release-report-test/artifact-link";
    writeFile(`${outsideArtifactDir}/index.html`, "<!doctype html><title>Outside</title>");
    rmSync(artifactLinkDir, { recursive: true, force: true });
    symlinkSync(resolve(outsideArtifactDir), artifactLinkDir);
    const artifact = report.artifacts.files.find((candidate) => candidate.path === "dist/index.html");
    artifact.path = `${artifactLinkDir}/index.html`;

    try {
      const failures = validateReport(report, reportOptions());

      expect(failures).toContain(`Artifact path parent must not be a symbolic link: ${artifactLinkDir}.`);
    } finally {
      rmSync(artifactLinkDir, { force: true });
      rmSync(outsideArtifactDir, { recursive: true, force: true });
    }
  });

  it("rejects non-canonical browser UI evidence paths before reading evidence JSON", () => {
    const report = createReport();
    const evidenceGate = report.gates.find((gate) => gate.label === "Verify browser UI evidence");
    evidenceGate.evidence.path = ".artifacts/release-report-test/nested/../ui-evidence.json";

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain(
      "Browser UI evidence path must be workspace-relative: .artifacts/release-report-test/nested/../ui-evidence.json."
    );
  });

  it("rejects absolute browser UI evidence paths before reading evidence JSON", () => {
    const report = createReport();
    const evidenceGate = report.gates.find((gate) => gate.label === "Verify browser UI evidence");
    evidenceGate.evidence.path = resolve(evidenceGate.evidence.path);

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain(`Browser UI evidence path must be workspace-relative: ${evidenceGate.evidence.path}.`);
  });

  it("rejects symlinked browser UI evidence before reading linked JSON", () => {
    const report = createReport();
    const evidenceGate = report.gates.find((gate) => gate.label === "Verify browser UI evidence");
    const evidencePath = evidenceGate.evidence.path;
    const outsideEvidence = ".artifacts/release-report-test/outside-ui-evidence.json";
    writeFile(outsideEvidence, readFileSync(evidencePath));
    rmSync(evidencePath, { force: true });
    symlinkSync(resolve(outsideEvidence), evidencePath);

    try {
      const failures = validateReport(report, reportOptions());

      expect(failures).toContain(`Browser UI evidence must not be a symbolic link: ${evidencePath}.`);
    } finally {
      rmSync(evidencePath, { force: true });
      rmSync(outsideEvidence, { force: true });
      writeUiEvidenceFile();
    }
  });

  it("rejects browser UI evidence paths with symlinked parents before reading linked JSON", () => {
    const report = createReport();
    const outsideEvidenceDir = ".artifacts/release-report-test/outside-evidence";
    const evidenceLinkDir = ".artifacts/release-report-test/evidence-link";
    writeFile(`${outsideEvidenceDir}/ui-evidence.json`, readFileSync(uiEvidencePathForReport(report)));
    rmSync(evidenceLinkDir, { recursive: true, force: true });
    symlinkSync(resolve(outsideEvidenceDir), evidenceLinkDir);
    const evidenceGate = report.gates.find((gate) => gate.label === "Verify browser UI evidence");
    evidenceGate.evidence.path = `${evidenceLinkDir}/ui-evidence.json`;

    try {
      const failures = validateReport(report, reportOptions());

      expect(failures).toContain(`Browser UI evidence path parent must not be a symbolic link: ${evidenceLinkDir}.`);
    } finally {
      rmSync(evidenceLinkDir, { force: true });
      rmSync(outsideEvidenceDir, { recursive: true, force: true });
    }
  });

  it("rejects non-canonical browser UI screenshot evidence paths", () => {
    const report = createReport();
    rewriteUiEvidence(report, (evidence) => {
      const desktop = evidence.viewports.find((viewport) => viewport.name === "desktop");
      desktop.screenshot.path = ".artifacts/nested/../mobile-live-caster-desktop.png";
    });

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain(
      "Browser UI evidence screenshot path must be workspace-relative: .artifacts/nested/../mobile-live-caster-desktop.png."
    );
  });

  it("rejects UI evidence screenshots that are not PNG files", () => {
    const report = createReport();
    const badScreenshotPath = ".artifacts/release-report-test/bad-mobile.png";
    writeFile(badScreenshotPath, "not a png");
    writeUiEvidenceFile({ mobilePath: badScreenshotPath });
    const evidenceGate = report.gates.find((gate) => gate.label === "Verify browser UI evidence");
    evidenceGate.evidence.sha256 = fileSha256(evidenceGate.evidence.path);

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain(
      "Browser UI evidence screenshot is not a structurally valid PNG file: .artifacts/release-report-test/bad-mobile.png (missing PNG signature)."
    );
  });

  it("rejects UI evidence captured from a non-loopback target", () => {
    const report = createReport({ uiEvidenceTarget: "https://example.com/" });

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Browser UI evidence target must be a loopback http(s) URL.");
  });

  it("rejects UI evidence when git dirty-state provenance is missing", () => {
    const report = createReport();
    rewriteUiEvidence(report, (evidence) => {
      delete evidence.git.dirty;
    });

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Browser UI evidence git dirty state is missing.");
  });

  it("rejects UI evidence with a mismatched report schema", () => {
    const report = createReport();
    rewriteUiEvidence(report, (evidence) => {
      evidence.app = "OtherApp";
    });

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain(
      "Browser UI evidence is not a MobileLiveCaster browser-ui-verification reportVersion 1 file."
    );
  });

  it("rejects stale UI evidence even when the release report is fresh", () => {
    const report = createReport();
    rewriteUiEvidence(report, (evidence) => {
      evidence.finishedAt = new Date(Date.now() - 49 * 3_600_000).toISOString();
    });

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Browser UI evidence is 49h old, above the 24h release-report gate.");
  });

  it("rejects UI evidence missing required text checks", () => {
    const report = createReport();
    rewriteUiEvidence(report, (evidence) => {
      const mobile = evidence.viewports.find((viewport) => viewport.name === "mobile");
      mobile.requiredTextChecks = mobile.requiredTextChecks.filter((check) => check.text !== "Go Live");
    });

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain('Browser UI evidence for mobile is missing text "Go Live".');
  });

  it("rejects UI evidence missing Quick Text interaction proof", () => {
    const report = createReport();
    rewriteUiEvidence(report, (evidence) => {
      const mobile = evidence.viewports.find((viewport) => viewport.name === "mobile");
      delete mobile.quickTextInteraction;
    });

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Browser UI evidence for mobile is missing Quick Text interaction proof.");
  });

  it("rejects UI evidence missing only Quick Text status preview proof", () => {
    const report = createReport();
    rewriteUiEvidence(report, (evidence) => {
      const mobile = evidence.viewports.find((viewport) => viewport.name === "mobile");
      delete mobile.quickTextInteraction.previewText;
    });

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Browser UI evidence for mobile is missing Quick Text interaction proof.");
  });

  it("rejects UI evidence with stale Quick Text status preview proof", () => {
    const report = createReport();
    rewriteUiEvidence(report, (evidence) => {
      const mobile = evidence.viewports.find((viewport) => viewport.name === "mobile");
      mobile.quickTextInteraction.previewText = "MobileLiveCaster";
    });

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Browser UI evidence for mobile has invalid Quick Text interaction proof.");
  });

  it("audits UI evidence artifacts from in-process browser UI gates", () => {
    const report = createReport({ skipUi: false, uiEvidencePath: ".artifacts/ui-verification.json" });
    rewriteUiEvidence(report, (evidence) => {
      evidence.reportVersion = 0;
    });

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain(
      "Browser UI evidence is not a MobileLiveCaster browser-ui-verification reportVersion 1 file."
    );
  });

  it("accepts release reports with a matching distribution artifact manifest", () => {
    restoreUiScreenshots();
    const failures = validateReport(createReport({ includeDistribution: true }), reportOptions());

    expect(failures).toEqual([]);
  });

  it("rejects release reports missing an artifact referenced by the distribution manifest", () => {
    restoreUiScreenshots();
    const report = createReport({ includeDistribution: true });
    report.artifacts.files = report.artifacts.files.filter(
      (artifact) => artifact.path !== ".artifacts/release-report-test/MobileLiveCaster.ipa"
    );

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Report is missing distribution artifact .artifacts/release-report-test/MobileLiveCaster.ipa.");
  });

  it("accepts release reports with matching platform dashboard evidence artifacts", () => {
    restoreUiScreenshots();
    const failures = validateReport(createReport({ includeDashboardEvidence: true }), reportOptions());

    expect(failures).toEqual([]);
  });

  it("rejects release reports missing dashboard evidence referenced by the manifest", () => {
    restoreUiScreenshots();
    const report = createReport({ includeDashboardEvidence: true });
    report.artifacts.files = report.artifacts.files.filter(
      (artifact) => artifact.path !== ".artifacts/release-report-test/twitch-dashboard.png"
    );

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Report is missing dashboard evidence artifact .artifacts/release-report-test/twitch-dashboard.png.");
  });

  it("accepts release reports with matching store submission checklist artifacts", () => {
    restoreUiScreenshots();
    const failures = validateReport(createReport({ includeStoreSubmission: true }), reportOptions());

    expect(failures).toEqual([]);
  });

  it("rejects store-submission release reports without physical-device preflight evidence", () => {
    restoreUiScreenshots();
    const report = createReport({ includeStoreSubmission: true });
    report.artifacts.files = report.artifacts.files.filter(
      (artifact) => artifact.group !== physicalDevicePreflightArtifactGroup
    );

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Store-submission release reports must include physical-device preflight evidence.");
  });

  it("rejects release reports with mismatched physical-device preflight runbook gate evidence", () => {
    restoreUiScreenshots();
    const report = createReport({ includeStoreSubmission: true });
    const gate = report.gates.find((entry) => entry.label === "Verify physical device preflight");
    gate.evidence.runbook.stepIds = ["android-private-rtmps"];

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Physical-device preflight gate runbook step IDs do not match the preflight artifact.");
  });

  it("rejects release reports with tampered physical-device preflight gate evidence paths", () => {
    restoreUiScreenshots();
    const report = createReport({ includeStoreSubmission: true });
    const gate = report.gates.find((entry) => entry.label === "Verify physical device preflight");
    gate.evidence.path = ".artifacts/release-report-test/other-physical-device-preflight.json";

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain(
      "Physical-device preflight gate evidence path does not match the preflight artifact record."
    );
  });

  it("rejects release reports with tampered physical-device preflight gate evidence SHA-256 values", () => {
    restoreUiScreenshots();
    const report = createReport({ includeStoreSubmission: true });
    const gate = report.gates.find((entry) => entry.label === "Verify physical device preflight");
    gate.evidence.sha256 = "0".repeat(64);

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain(
      "Physical-device preflight gate evidence SHA-256 does not match the preflight artifact record."
    );
  });

  it("accepts equivalent normalized physical-device preflight gate evidence paths", () => {
    restoreUiScreenshots();
    const report = createReport({ includeStoreSubmission: true });
    const gate = report.gates.find((entry) => entry.label === "Verify physical device preflight");
    gate.evidence.path = `./${physicalDevicePreflightPath}`;

    const failures = validateReport(report, reportOptions());

    expect(failures).not.toContain(
      "Physical-device preflight gate evidence path does not match the preflight artifact record."
    );
  });

  it("rejects physical-device gate metadata that does not match the preflight artifact", () => {
    restoreUiScreenshots();
    const cases = [
      ["generatedAt", "2020-01-01T00:00:00.000Z", "Physical-device preflight gate generatedAt does not match the preflight artifact."],
      ["mode", "android", "Physical-device preflight gate mode does not match the preflight artifact."],
      ["androidDeviceCount", 0, "Physical-device preflight gate Android device count does not match the preflight artifact."],
      ["iosDeviceCount", 0, "Physical-device preflight gate iOS device count does not match the preflight artifact."]
    ];

    for (const [field, value, expectedFailure] of cases) {
      const report = createReport({ includeStoreSubmission: true });
      const gate = report.gates.find((entry) => entry.label === "Verify physical device preflight");
      gate.evidence[field] = value;

      expect(validateReport(report, reportOptions())).toContain(expectedFailure);
    }
  });

  it("rejects release reports missing store submission artifacts referenced by the checklist", () => {
    restoreUiScreenshots();
    const report = createReport({ includeStoreSubmission: true });
    report.artifacts.files = report.artifacts.files.filter(
      (artifact) => artifact.path !== ".artifacts/release-report-test/android-store.png"
    );

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Report is missing store submission artifact .artifacts/release-report-test/android-store.png.");
  });

  it("accepts release reports with matching store release orchestration evidence", () => {
    restoreUiScreenshots();
    const failures = validateReport(createReport({ includeStoreRelease: true }), reportOptions());

    expect(failures).toEqual([]);
  });

  it("rejects failed store release orchestration evidence in a release report", () => {
    restoreUiScreenshots();
    const report = createReport({ includeStoreRelease: true, storeReleaseStatus: "failed" });

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain('Store release report status must be passed, got "failed".');
  });

  it("rejects stale store release orchestration evidence in a release report", () => {
    restoreUiScreenshots();
    const report = createReport({
      includeStoreRelease: true,
      storeReleaseFinishedAt: new Date(Date.now() - 48 * 3_600_000).toISOString()
    });

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Store release report is 48h old, above the 24h commercial release gate.");
  });
});

function reportOptions() {
  return {
    maxAgeHours: 24,
    allowDirty: true,
    allowCommitMismatch: false
  };
}

function runVerifier(args) {
  return spawnSync(process.execPath, ["scripts/verify-release-report.mjs", ...args], {
    encoding: "utf8"
  });
}

function createReport({
  includeDistribution = false,
  includeDashboardEvidence = false,
  includeStoreSubmission = false,
  includeStoreRelease = false,
  storeReleaseStatus = "passed",
  storeReleaseFinishedAt,
  skipUi = true,
  uiEvidencePath = ".artifacts/release-report-test/ui-evidence.json",
  uiEvidenceTarget = "http://127.0.0.1:5173/",
  allowWarnings = false,
  supportBundlePatch = {}
} = {}) {
  const nowMs = Date.now();
  const reportStartedAt = new Date(nowMs - 1_000).toISOString();
  const scanGeneratedAt = new Date(nowMs - 500).toISOString();
  const reportFinishedAt = new Date(nowMs).toISOString();
  writeSupportBundleFixture(supportBundlePatch);
  writeUiEvidenceFile({ path: uiEvidencePath, target: uiEvidenceTarget });
  writeSourceSecretScanFixture({ generatedAt: scanGeneratedAt });
  writeGitleaksHistoryScanFixture({ generatedAt: scanGeneratedAt });
  writeNativeBuildFixture(fixtureRoot);
  const shouldIncludeDistribution = includeDistribution || includeStoreRelease;
  if (shouldIncludeDistribution) {
    writeDistributionFixture();
  }
  if (includeDashboardEvidence) {
    writeDashboardEvidenceFixture();
  }
  if (includeStoreSubmission) {
    writeStoreSubmissionFixture();
    writePhysicalDevicePreflightFixture();
  }
  if (includeStoreRelease) {
    writeStoreReleaseFixture({ status: storeReleaseStatus, finishedAt: storeReleaseFinishedAt });
  }
  const supportBundlePath = ".artifacts/release-report-test/support-bundle.json";
  const artifactFiles = [
    ...releaseConfigArtifactPaths.map((path) => artifactRecord("release-config", path)),
    artifactRecord("web", "dist/index.html"),
    artifactRecord("web", "dist/assets/release-report-test.js"),
    artifactRecord("web", "dist/assets/release-report-test.css"),
    artifactRecord("react-native", ".artifacts/rn/main.ios.jsbundle"),
    artifactRecord("react-native", ".artifacts/rn/index.android.bundle"),
    artifactRecord(sourceSecretScanArtifactGroup, gitleaksHistoryScanArtifactPath),
    artifactRecord(sourceSecretScanArtifactGroup, sourceSecretScanArtifactPath),
    ...nativeBuildArtifactRecords(fixtureRoot, artifactRecord),
    artifactRecord("ui", ".artifacts/mobile-live-caster-desktop.png"),
    artifactRecord("ui", ".artifacts/mobile-live-caster-mobile.png"),
    ...(!skipUi ? [artifactRecord("ui", uiEvidencePath)] : []),
    ...(shouldIncludeDistribution ? distributionArtifactRecords() : []),
    ...(includeDashboardEvidence ? dashboardEvidenceRecords() : []),
    ...(includeStoreSubmission ? storeSubmissionRecords() : []),
    ...(includeStoreSubmission ? physicalDevicePreflightRecords() : []),
    ...(includeStoreRelease ? storeReleaseArtifactRecords() : [])
  ];

  return {
    reportVersion: 1,
    app: "MobileLiveCaster",
    type: "release-candidate-verification",
    status: "passed",
    startedAt: reportStartedAt,
    finishedAt: reportFinishedAt,
    git: {
      commit: currentCommit(),
      branch: "main",
      dirty: true,
      statusShort: " M scripts/verify-release-report.test.mjs"
    },
    options: {
      allowDirty: true,
      allowWarnings,
      skipUi,
      physicalDevicePreflightJson: includeStoreSubmission ? physicalDevicePreflightPath : null
    },
    supportBundle: {
      path: supportBundlePath,
      absolutePath: resolve(supportBundlePath),
      basename: "support-bundle.json",
      sha256: fileSha256(supportBundlePath)
    },
    artifacts: {
      generatedAt: new Date().toISOString(),
      files: artifactFiles
    },
    gates: [
      ...requiredReleaseGateLabels.map((label) => ({
        label,
        command: "fixture",
        status: label === "Verify clean git worktree" ? "skipped" : "passed",
        startedAt: reportStartedAt,
        finishedAt: reportFinishedAt,
        durationMs: 1,
        exitCode: label === "Verify clean git worktree" ? null : 0,
        error: label === "Verify clean git worktree" ? "Allowed by --allow-dirty." : null
      })),
      skipUi
        ? {
            label: "Verify browser UI evidence",
            command: `read ${uiEvidencePath}`,
            status: "passed",
            startedAt: new Date(Date.now() - 1_000).toISOString(),
            finishedAt: new Date().toISOString(),
            durationMs: 1,
            exitCode: 0,
            error: null,
            evidence: {
              path: uiEvidencePath,
              sha256: fileSha256(uiEvidencePath),
              target: uiEvidenceTarget,
              finishedAt: new Date().toISOString(),
              viewports: []
            }
          }
        : {
            label: "Verify browser UI",
            command: "npm run verify:ui",
            status: "passed",
            startedAt: new Date(Date.now() - 1_000).toISOString(),
            finishedAt: new Date().toISOString(),
            durationMs: 1,
            exitCode: 0,
            error: null
          },
      ...(includeStoreSubmission ? [physicalDevicePreflightGateRecord()] : [])
    ],
    error: null
  };
}

function writeFixtureFiles() {
  writeFile("dist/index.html", "<!doctype html><title>MobileLiveCaster</title>");
  writeFile("dist/assets/release-report-test.js", "console.log('release-report-test');");
  writeFile("dist/assets/release-report-test.css", "body { color: #111; }");
  writeFile(".artifacts/rn/main.ios.jsbundle", "ios bundle");
  writeFile(".artifacts/rn/index.android.bundle", "android bundle");
  writeGitleaksHistoryScanFixture();
  writeSourceSecretScanFixture();
  writeNativeBuildFixture(fixtureRoot);
  writeFile(".artifacts/mobile-live-caster-desktop.png", pngBytes);
  writeFile(".artifacts/mobile-live-caster-mobile.png", pngBytes);
  writeSupportBundleFixture();
  writeUiEvidenceFile();
}

function writeGitleaksHistoryScanFixture(patch = {}) {
  writeFile(
    gitleaksHistoryScanArtifactPath,
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "gitleaks-history-scan",
        status: "passed",
        generatedAt: new Date().toISOString(),
        gitleaksVersion: "8.30.1",
        git: {
          commit: currentCommit(),
          dirty: false,
          statusShort: "",
          shallowRepository: false
        },
        scannedCommits: 484,
        baselinePath: ".gitleaks-baseline.json",
        baselineSha256: "a".repeat(64),
        baselineFingerprintCount: 4,
        baselineFingerprints: [
          "07acf4a10f14ed7491a9f97c71cb41a74c5a7c84:src/domain/readiness.test.ts:generic-api-key:19",
          "07acf4a10f14ed7491a9f97c71cb41a74c5a7c84:src/domain/readiness.test.ts:generic-api-key:50",
          "801c776904f1bcec9863e59924537f45d0bbc0e1:src/domain/readiness.test.ts:generic-api-key:21",
          "801c776904f1bcec9863e59924537f45d0bbc0e1:src/domain/readiness.test.ts:generic-api-key:38"
        ],
        rawReportPath: ".artifacts/gitleaks-history-raw.json",
        findingCount: 0,
        findings: [],
        ...patch
      },
      null,
      2
    )
  );
}

function rewriteGitleaksHistoryScan(report, patch) {
  const scan = JSON.parse(readFileSync(gitleaksHistoryScanArtifactPath, "utf8"));
  writeGitleaksHistoryScanFixture({ ...scan, ...patch });
  const artifact = report.artifacts.files.find((candidate) => candidate.path === gitleaksHistoryScanArtifactPath);
  artifact.bytes = readFileSync(gitleaksHistoryScanArtifactPath).byteLength;
  artifact.sha256 = fileSha256(gitleaksHistoryScanArtifactPath);
}

function writeSourceSecretScanFixture(patch = {}) {
  writeFile(
    sourceSecretScanArtifactPath,
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "source-secret-scan",
        status: "passed",
        generatedAt: new Date().toISOString(),
        scannedFiles: ["src/mobile/MobileApp.tsx"],
        scannedBytes: 1234,
        findingCount: 0,
        findings: [],
        ...patch
      },
      null,
      2
    )
  );
}

function rewriteSourceSecretScan(report, patch) {
  const scan = JSON.parse(readFileSync(sourceSecretScanArtifactPath, "utf8"));
  writeSourceSecretScanFixture({ ...scan, ...patch });
  const artifact = report.artifacts.files.find((candidate) => candidate.path === sourceSecretScanArtifactPath);
  artifact.bytes = readFileSync(sourceSecretScanArtifactPath).byteLength;
  artifact.sha256 = fileSha256(sourceSecretScanArtifactPath);
}

function rewriteIosNativeVerification(report, mutate) {
  const nativeReport = JSON.parse(readFileSync(iosNativeVerificationArtifactPath, "utf8"));
  mutate(nativeReport);
  writeFile(iosNativeVerificationArtifactPath, JSON.stringify(nativeReport, null, 2));
  const artifact = report.artifacts.files.find((candidate) => candidate.path === iosNativeVerificationArtifactPath);
  artifact.bytes = readFileSync(iosNativeVerificationArtifactPath).byteLength;
  artifact.sha256 = fileSha256(iosNativeVerificationArtifactPath);
}

function writeSupportBundleFixture(patch = {}) {
  writeFile(
    ".artifacts/release-report-test/support-bundle.json",
    JSON.stringify(commercialSupportBundleFixture(patch), null, 2)
  );
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
      supportBundleManifestRun("ios", "svr1-ios"),
      supportBundleManifestRun("android", "svr1-android")
    ]
  };

  return {
    app: {
      name: "MobileLiveCaster",
      reportVersion: 1,
      bundleVersion: 55
    },
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
    appBuild: "rc-1",
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

function restoreUiScreenshots() {
  writeFile(".artifacts/mobile-live-caster-desktop.png", pngBytes);
  writeFile(".artifacts/mobile-live-caster-mobile.png", pngBytes);
  writeUiEvidenceFile();
}

function writeDistributionFixture() {
  writeFile(".artifacts/release-report-test/app-release.aab", androidAabBytes());
  writeFile(".artifacts/release-report-test/MobileLiveCaster.ipa", iosIpaBytes());
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
          statusShort: " M scripts/verify-release-report.test.mjs"
        },
        artifacts: [
          distributionManifestRecord("android", "aab", ".artifacts/release-report-test/app-release.aab"),
          distributionManifestRecord("ios", "ipa", ".artifacts/release-report-test/MobileLiveCaster.ipa")
        ]
      },
      null,
      2
    )
  );
}

function writeDashboardEvidenceFixture() {
  writeFile(".artifacts/release-report-test/youtube-dashboard.png", pngBytes);
  writeFile(".artifacts/release-report-test/twitch-dashboard.png", pngBytes);
  writeFile(
    ".artifacts/release-report-test/youtube-dashboard.json",
    JSON.stringify({
      platform: "youtube",
      broadcastId: "ytBroadcast9xYz",
      streamId: "ytStream8aBc",
      channelId: "UCMobileLiveCaster",
      broadcastStatus: "live",
      streamStatus: "active",
      checkedAt: capturedAt
    })
  );
  writeFile(
    ".artifacts/release-report-test/twitch-dashboard.json",
    JSON.stringify({
      platform: "twitch",
      broadcasterId: "123456789",
      broadcasterLogin: "mobilelivecaster",
      streamId: "987654321",
      liveStatus: "live",
      checkedAt: capturedAt
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
          statusShort: " M scripts/verify-release-report.test.mjs"
        },
        artifacts: [
          dashboardManifestRecord("youtube", ".artifacts/release-report-test/youtube-dashboard.png"),
          dashboardManifestRecord("twitch", ".artifacts/release-report-test/twitch-dashboard.png"),
          dashboardStatusJsonRecord("youtube", ".artifacts/release-report-test/youtube-dashboard.json"),
          dashboardStatusJsonRecord("twitch", ".artifacts/release-report-test/twitch-dashboard.json")
        ]
      },
      null,
      2
    )
  );
}

function writeStoreSubmissionFixture() {
  writeFile(".artifacts/release-report-test/ios-store.png", pngBytes);
  writeFile(".artifacts/release-report-test/android-store.png", pngBytes);
  writeFile(
    ".artifacts/release-report-test/submission-review.md",
    "# MobileLiveCaster Store Submission Review\n\n- [ ] Listing copy reviewed.\n"
  );
  writeFile(
    ".artifacts/release-report-test/store-submission-metadata.json",
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
            path: ".artifacts/release-report-test/ios-store.png",
            source: "realDevice"
          },
          {
            platform: "android",
            device: "Pixel 8 Pro",
            path: ".artifacts/release-report-test/android-store.png",
            source: "realDevice"
          }
        ],
        reviewDocuments: [
          { kind: "submissionReview", path: ".artifacts/release-report-test/submission-review.md" }
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
          statusShort: " M scripts/verify-release-report.test.mjs"
        },
        metadata: storeSubmissionMetadataRecord(),
        screenshots: [
          storeScreenshotRecord("ios", "iPhone 15 Pro Max", ".artifacts/release-report-test/ios-store.png", "realDevice"),
          storeScreenshotRecord("android", "Pixel 8 Pro", ".artifacts/release-report-test/android-store.png", "realDevice")
        ],
        reviewDocuments: [storeReviewDocumentRecord()]
      },
      null,
      2
    )
  );
}

function writePhysicalDevicePreflightFixture(patch = {}) {
  const report = createPhysicalDevicePreflightReport(createPhysicalDevicePreflightFixtureInput());
  writePhysicalDevicePreflightReport({ ...report, ...patch }, physicalDevicePreflightPath);
}

function createPhysicalDevicePreflightFixtureInput() {
  return {
    androidAdbOutput: `List of devices attached
R58M123456B device product:r0q model:SM_S901B device:r0q transport_id:4
`,
    androidCommand: { ok: true, tool: "adb", stdout: "", detail: "command succeeded" },
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
`,
    iosCommand: { ok: true, tool: "xcrun", stdout: "", detail: "command succeeded" },
    toolEvidence: {
      android: {
        deviceList: {
          invocation: "adb devices -l",
          tool: "adb",
          ok: true,
          detail: "command succeeded"
        },
        version: {
          invocation: "adb version",
          tool: "adb",
          ok: true,
          detail: "command succeeded",
          version: "Android Debug Bridge version 1.0.41 / Version 35.0.2 (r12147458)"
        }
      },
      ios: {
        deviceList: {
          invocation: "xcrun xctrace list devices",
          tool: "xcrun",
          ok: true,
          detail: "command succeeded"
        },
        version: {
          invocation: "xcrun xctrace version",
          tool: "xcrun",
          ok: true,
          detail: "command succeeded",
          version: "xctrace version 16.4 (16F6)"
        }
      }
    }
  };
}

function writeStoreReleaseFixture({ status = "passed", finishedAt = new Date().toISOString() } = {}) {
  const startedAt = new Date(Date.parse(finishedAt) - 1_000).toISOString();
  writeFile(
    ".artifacts/release-report-test/store-release-report.json",
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: storeReleaseReportType,
        status,
        startedAt,
        finishedAt,
        durationMs: 1,
        git: {
          commit: currentCommit(),
          branch: "main",
          dirty: true,
          statusShort: " M scripts/verify-release-report.test.mjs"
        },
        mode: "execute",
        platforms: ["android", "ios"],
        options: {
          skipEnv: false,
          skipBuild: false,
          allowDirty: true,
          manifestPath: distributionArtifactManifestPath,
          androidAab: ".artifacts/release-report-test/app-release.aab",
          iosIpa: ".artifacts/release-report-test/MobileLiveCaster.ipa"
        },
        checks: [
          {
            label: "Verify clean git worktree",
            command: "git status --short",
            status: "skipped",
            startedAt: new Date(Date.now() - 1_000).toISOString(),
            finishedAt: new Date().toISOString(),
            durationMs: 0,
            exitCode: 0,
            error: "Allowed by --allow-dirty.",
            statusShort: " M scripts/verify-release-report.test.mjs"
          }
        ],
        steps: [
          storeReleaseStep("verify-env", "npm run android:verify-release-env"),
          storeReleaseStep("android", "npm run android:bundleRelease"),
          storeReleaseStep("verify-env", "npm run ios:verify-release-env"),
          storeReleaseStep("ios", "npm run ios:archive:release"),
          storeReleaseStep("ios", "npm run ios:export:release"),
          {
            type: "manifest",
            label: "Write distribution artifact manifest",
            command: `write ${distributionArtifactManifestPath}`,
            status,
            startedAt: new Date(Date.now() - 1_000).toISOString(),
            finishedAt: new Date().toISOString(),
            durationMs: 1,
            exitCode: status === "passed" ? 0 : 1,
            error: status === "passed" ? null : "fixture failure",
            inputs: {
              androidAab: ".artifacts/release-report-test/app-release.aab",
              iosIpa: ".artifacts/release-report-test/MobileLiveCaster.ipa",
              manifestPath: distributionArtifactManifestPath
            },
            result: distributionManifestSummary(distributionManifestArtifactRecord())
          }
        ],
        artifacts: {
          distributionManifest: distributionManifestSummary(distributionManifestArtifactRecord())
        },
        error: status === "passed" ? null : "fixture failure"
      },
      null,
      2
    )
  );
}

function storeReleaseStep(type, command) {
  return {
    type,
    label: command,
    command,
    status: "passed",
    startedAt: new Date(Date.now() - 1_000).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 1,
    exitCode: 0,
    error: null
  };
}

function distributionArtifactRecords() {
  return [
    artifactRecord("distribution", distributionArtifactManifestPath),
    artifactRecord("distribution", ".artifacts/release-report-test/app-release.aab"),
    artifactRecord("distribution", ".artifacts/release-report-test/MobileLiveCaster.ipa")
  ];
}

function storeReleaseArtifactRecords() {
  return [artifactRecord(storeReleaseReportArtifactGroup, ".artifacts/release-report-test/store-release-report.json")];
}

function distributionManifestArtifactRecord() {
  const content = readFileSync(distributionArtifactManifestPath);
  const manifest = JSON.parse(content.toString("utf8"));
  return {
    path: distributionArtifactManifestPath,
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

function distributionManifestSummary(record) {
  return {
    path: record.path,
    bytes: record.bytes,
    sha256: record.sha256,
    artifactCount: record.artifactCount,
    artifacts: record.artifacts
  };
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

function dashboardEvidenceRecords() {
  return [
    artifactRecord("dashboard", dashboardEvidenceManifestPath),
    artifactRecord("dashboard", ".artifacts/release-report-test/youtube-dashboard.png"),
    artifactRecord("dashboard", ".artifacts/release-report-test/twitch-dashboard.png"),
    artifactRecord("dashboard", ".artifacts/release-report-test/youtube-dashboard.json"),
    artifactRecord("dashboard", ".artifacts/release-report-test/twitch-dashboard.json")
  ];
}

function storeSubmissionRecords() {
  return [
    artifactRecord("store-submission", storeSubmissionChecklistPath),
    artifactRecord("store-submission", ".artifacts/release-report-test/store-submission-metadata.json"),
    artifactRecord("store-submission", ".artifacts/release-report-test/submission-review.md"),
    artifactRecord("store-submission", ".artifacts/release-report-test/ios-store.png"),
    artifactRecord("store-submission", ".artifacts/release-report-test/android-store.png")
  ];
}

function physicalDevicePreflightRecords() {
  return [artifactRecord(physicalDevicePreflightArtifactGroup, physicalDevicePreflightPath)];
}

function physicalDevicePreflightGateRecord() {
  const preflight = JSON.parse(readFileSync(physicalDevicePreflightPath, "utf8"));
  const steps = Array.isArray(preflight.runbook?.steps) ? preflight.runbook.steps : [];
  return {
    label: "Verify physical device preflight",
    command: `read ${physicalDevicePreflightPath}`,
    status: "passed",
    startedAt: new Date(Date.now() - 1_000).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 1,
    exitCode: 0,
    error: null,
    evidence: {
      path: physicalDevicePreflightPath,
      sha256: fileSha256(physicalDevicePreflightPath),
      generatedAt: preflight.generatedAt,
      mode: preflight.mode,
      androidDeviceCount: preflight.platforms?.android?.devices?.length || 0,
      iosDeviceCount: preflight.platforms?.ios?.devices?.length || 0,
      runbook: {
        summary: preflight.runbook?.summary || "",
        stepCount: steps.length,
        readyStepCount: steps.filter((step) => step?.status === "ready-to-run" && step?.deviceReady === true).length,
        waitingStepCount: steps.filter((step) => step?.status === "waiting-for-device" || step?.deviceReady !== true).length,
        stepIds: steps.map((step) => String(step?.id || "")).filter(Boolean)
      }
    }
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

function dashboardManifestRecord(platform, path) {
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

function storeSubmissionMetadataRecord() {
  const path = ".artifacts/release-report-test/store-submission-metadata.json";
  const content = readFileSync(path);
  return {
    kind: "store-submission-metadata",
    path,
    basename: path.split("/").at(-1),
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function storeScreenshotRecord(platform, device, path, source) {
  const content = readFileSync(path);
  const dimensions = pngDimensions(content);
  return {
    platform,
    kind: "screenshot",
    device,
    locale: "ja-JP",
    role: "store",
    source,
    path,
    basename: path.split("/").at(-1),
    width: dimensions.width,
    height: dimensions.height,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function storeReviewDocumentRecord() {
  const path = ".artifacts/release-report-test/submission-review.md";
  const content = readFileSync(path);
  return {
    kind: "submissionReview",
    path,
    basename: path.split("/").at(-1),
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function writeUiEvidenceFile({
  path = ".artifacts/release-report-test/ui-evidence.json",
  desktopPath = ".artifacts/mobile-live-caster-desktop.png",
  mobilePath = ".artifacts/mobile-live-caster-mobile.png",
  target = "http://127.0.0.1:5173/"
} = {}) {
  writeFile(
    path,
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
          viewportEvidence("desktop", desktopPath),
          viewportEvidence("mobile", mobilePath)
        ]
      },
      null,
      2
    )
  );
}

function viewportEvidence(name, path) {
  return {
    name,
    horizontalOverflow: false,
    requiredTextChecks: requiredBrowserUiTextChecks.map((text) => ({ text, count: 1 })),
    quickTextInteraction: quickTextInteraction(name),
    screenshot: artifactRecord("ui", path)
  };
}

function quickTextInteraction(viewportName) {
  const text = `ui-proof-${viewportName}`;
  return {
    text,
    programText: text,
    previewText: text
  };
}

function rewriteUiEvidence(report, mutate) {
  const evidencePath = uiEvidencePathForReport(report);
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  mutate(evidence);
  writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  const evidenceGate = report.gates.find((gate) => gate.label === "Verify browser UI evidence");
  if (evidenceGate) {
    evidenceGate.evidence.sha256 = fileSha256(evidencePath);
    evidenceGate.evidence.target = evidence.target;
    evidenceGate.evidence.finishedAt = evidence.finishedAt;
  }
  const artifact = report.artifacts.files.find((candidate) => candidate.path === evidencePath);
  if (artifact) {
    artifact.bytes = readFileSync(evidencePath).byteLength;
    artifact.sha256 = fileSha256(evidencePath);
  }
}

function uiEvidencePathForReport(report) {
  const evidenceGate = report.gates.find((gate) => gate.label === "Verify browser UI evidence");
  return evidenceGate?.evidence?.path || ".artifacts/ui-verification.json";
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

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function currentCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
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
    if (content === null) {
      rmSync(path, { force: true });
    } else {
      writeFile(path, content);
    }
  }
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
