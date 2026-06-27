import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { releaseConfigArtifactPaths, requiredReleaseGateLabels } from "./release-artifact-policy.mjs";
import { distributionArtifactManifestPath } from "./verify-distribution-artifacts.mjs";
import { dashboardEvidenceArtifactGroup, dashboardEvidenceManifestPath } from "./verify-platform-dashboard-evidence.mjs";
import { storeReleaseReportArtifactGroup, storeReleaseReportType } from "./release-store-build.mjs";
import { storeSubmissionArtifactGroup, storeSubmissionChecklistPath } from "./verify-store-submission-checklist.mjs";
import {
  createReleaseEvidencePackage,
  releaseEvidencePackageManifestName,
  releaseEvidencePackageType,
  validateReleaseEvidencePackage
} from "./create-release-evidence-package.mjs";

const fixtureRoot = ".artifacts/release-evidence-package-test";
const packageDir = `${fixtureRoot}/package`;
const reportPath = `${fixtureRoot}/release-report.json`;
const supportBundlePath = `${fixtureRoot}/support-bundle.json`;
const storeReleaseReportPath = `${fixtureRoot}/store-release-report.json`;
const generatedFiles = [
  "dist/index.html",
  "dist/assets/release-evidence-package-test.js",
  "dist/assets/release-evidence-package-test.css",
  ".artifacts/rn/main.ios.jsbundle",
  ".artifacts/rn/index.android.bundle",
  ".artifacts/mobile-live-caster-desktop.png",
  ".artifacts/mobile-live-caster-mobile.png",
  ".artifacts/distribution-artifacts.json",
  ".artifacts/release-evidence-package-test/app-release.aab",
  ".artifacts/release-evidence-package-test/MobileLiveCaster.ipa",
  ".artifacts/platform-dashboard-evidence.json",
  ".artifacts/release-evidence-package-test/youtube-dashboard.png",
  ".artifacts/release-evidence-package-test/twitch-dashboard.png",
  ".artifacts/release-evidence-package-test/youtube-dashboard.json",
  ".artifacts/release-evidence-package-test/twitch-dashboard.json",
  ".artifacts/release-evidence-package-test/store-release-report.json",
  ".artifacts/store-submission-checklist.json",
  ".artifacts/release-evidence-package-test/submission-metadata.json",
  ".artifacts/release-evidence-package-test/submission-review.md",
  ".artifacts/release-evidence-package-test/ios-store.png",
  ".artifacts/release-evidence-package-test/android-store.png"
];
const fileBackups = new Map();
const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);
const storePngBytes = pngWithDimensions(1179, 2556);
const dashboardPngBytes = pngWithDimensions(1440, 900);
const minimumDistributionArtifactBytes = 1_048_576;
const capturedAt = new Date().toISOString();

describe("release evidence package creator", () => {
  beforeAll(() => {
    snapshotFiles(generatedFiles);
    writeFixtureFiles();
  });

  afterAll(() => {
    restoreFiles();
  });

  it("creates and verifies a standalone release evidence package from a passed RC report", () => {
    writeReportFixture();

    const result = createReleaseEvidencePackage({
      reportPath,
      outputDir: packageDir,
      allowDirty: true
    });

    expect(result.manifest.type).toBe(releaseEvidencePackageType);
    expect(existsSync(`${packageDir}/${releaseEvidencePackageManifestName}`)).toBe(true);
    expect(existsSync(`${packageDir}/release-candidate-report.json`)).toBe(true);
    expect(existsSync(`${packageDir}/support-bundle/support-bundle.json`)).toBe(true);
    expect(existsSync(`${packageDir}/ui-evidence/ui-evidence.json`)).toBe(true);
    expect(existsSync(`${packageDir}/artifacts/dist/index.html`)).toBe(true);
    expect(validateReleaseEvidencePackage({ packageDir })).toEqual([]);
  });

  it("rejects release reports generated with development-only dirty-worktree approval", () => {
    writeReportFixture();
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    report.git.dirty = true;
    report.git.statusShort = " M scripts/create-release-evidence-package.test.mjs";
    report.options.allowDirty = true;
    report.options.allowCommitMismatch = true;
    const cleanGitGate = report.gates.find((gate) => gate.label === "Verify clean git worktree");
    cleanGitGate.status = "skipped";
    cleanGitGate.exitCode = null;
    cleanGitGate.error = "Allowed by --allow-dirty.";
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    expect(() =>
      createReleaseEvidencePackage({
        reportPath,
        outputDir: `${fixtureRoot}/dirty-package`,
        allowDirty: true
      })
    ).toThrow("Release report cannot be used for a commercial evidence package:");
  });

  it("rejects packaged release reports that were later marked development-only", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    packagedReport.git.dirty = true;
    packagedReport.git.statusShort = " M scripts/create-release-evidence-package.test.mjs";
    packagedReport.options.allowDirty = true;
    packagedReport.options.allowCommitMismatch = true;
    const cleanGitGate = packagedReport.gates.find((gate) => gate.label === "Verify clean git worktree");
    cleanGitGate.status = "skipped";
    cleanGitGate.exitCode = null;
    cleanGitGate.error = "Allowed by --allow-dirty.";
    writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));
    refreshPackagedSourceReportEvidence();

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Packaged release report was generated with --allow-dirty and cannot be used as commercial package evidence."
    );
    expect(failures).toContain(
      "Packaged release report was generated with --allow-commit-mismatch and cannot be used as commercial package evidence."
    );
    expect(failures).toContain("Packaged release report clean git worktree gate must be passed for commercial package evidence.");
  });

  it("rejects packaged support bundles that fail the commercial release gate", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedSupportBundlePath = `${packageDir}/support-bundle/support-bundle.json`;
    const supportBundle = JSON.parse(readFileSync(packagedSupportBundlePath, "utf8"));
    supportBundle.summary.validationEvidenceStatus = "blocked";
    writeFileSync(packagedSupportBundlePath, JSON.stringify(supportBundle, null, 2));
    refreshPackagedSupportBundleEvidence(packagedSupportBundlePath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures.join("\n")).toContain("Package support bundle commercial release gate must be ready, got blocked:");
    expect(failures.join("\n")).toContain("Package support bundle validation-evidence-not-ready");
  });

  it("rejects packaged support bundle warnings unless the RC report accepted warnings", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedSupportBundlePath = `${packageDir}/support-bundle/support-bundle.json`;
    const supportBundle = JSON.parse(readFileSync(packagedSupportBundlePath, "utf8"));
    supportBundle.summary.validationEvidenceStaleRunCount = 1;
    writeFileSync(packagedSupportBundlePath, JSON.stringify(supportBundle, null, 2));
    refreshPackagedSupportBundleEvidence(packagedSupportBundlePath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures.join("\n")).toContain("Package support bundle commercial release gate must be ready, got warning:");
    expect(failures.join("\n")).toContain("Package support bundle validation-evidence-stale-retained-runs");
  });

  it("allows packaged support bundle warnings when the RC report accepted warnings", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedSupportBundlePath = `${packageDir}/support-bundle/support-bundle.json`;
    const supportBundle = JSON.parse(readFileSync(packagedSupportBundlePath, "utf8"));
    supportBundle.summary.validationEvidenceStaleRunCount = 1;
    writeFileSync(packagedSupportBundlePath, JSON.stringify(supportBundle, null, 2));
    refreshPackagedSupportBundleEvidence(packagedSupportBundlePath);

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const releaseReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    releaseReport.options.allowWarnings = true;
    writeFileSync(packagedReportPath, JSON.stringify(releaseReport, null, 2));
    refreshPackagedSourceReportEvidence();

    expect(validateReleaseEvidencePackage({ packageDir })).toEqual([]);
  });

  it("rejects tampered packaged artifact files", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    writeFileSync(`${packageDir}/artifacts/dist/index.html`, "<!doctype html><title>Tampered</title>");
    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Release evidence package file metadata mismatch for artifacts/dist/index.html.");
  });

  it("rejects a package manifest that retains artifacts removed from the packaged report", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    packagedReport.artifacts.files = packagedReport.artifacts.files.filter((artifact) => artifact.path !== "dist/index.html");
    writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
    manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Package manifest contains artifact not present in the release report: web:dist/index.html.");
  });

  it("rejects packages whose report omits final handoff evidence groups", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    packagedReport.artifacts.files = packagedReport.artifacts.files.filter((artifact) => artifact.group !== "dashboard");
    writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
    manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Packaged release report is missing required commercial artifact group dashboard.");
    expect(failures).toContain("Packaged release report is missing dashboard evidence manifest .artifacts/platform-dashboard-evidence.json.");
  });

  it("rejects packages missing artifacts referenced by a packaged commercial manifest", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts = manifest.artifacts.filter(
      (artifact) => artifact.sourcePath !== ".artifacts/release-evidence-package-test/twitch-dashboard.json"
    );
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package dashboard evidence manifest references artifact not present in package: .artifacts/release-evidence-package-test/twitch-dashboard.json."
    );
  });

  it("rejects stale metadata inside packaged commercial manifests", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedChecklistPath = `${packageDir}/artifacts/${storeSubmissionChecklistPath}`;
    const checklist = JSON.parse(readFileSync(packagedChecklistPath, "utf8"));
    checklist.metadata.sha256 = "0".repeat(64);
    writeFileSync(packagedChecklistPath, JSON.stringify(checklist, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    refreshPackageArtifactEntry(manifest, storeSubmissionChecklistPath, packagedChecklistPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package store submission checklist metadata mismatch for .artifacts/release-evidence-package-test/submission-metadata.json."
    );
  });

  it("rejects packaged store submission screenshots that are not final real-device evidence", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedChecklistPath = `${packageDir}/artifacts/${storeSubmissionChecklistPath}`;
    const checklist = JSON.parse(readFileSync(packagedChecklistPath, "utf8"));
    const iosScreenshot = checklist.screenshots.find((screenshot) => screenshot.platform === "ios");
    iosScreenshot.source = "uiEvidenceDraft";
    iosScreenshot.osVersion = "";
    iosScreenshot.appBuild = "";
    delete iosScreenshot.capturedAt;
    iosScreenshot.width = 320;
    iosScreenshot.height = 640;
    writeFileSync(packagedChecklistPath, JSON.stringify(checklist, null, 2));
    refreshPackagedChecklistEvidence(packagedChecklistPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package store submission screenshot .artifacts/release-evidence-package-test/ios-store.png must be marked realDevice."
    );
    expect(failures).toContain(
      "Package store submission screenshot .artifacts/release-evidence-package-test/ios-store.png must include a real device OS version."
    );
    expect(failures).toContain(
      "Package store submission screenshot .artifacts/release-evidence-package-test/ios-store.png must include an app build/version."
    );
    expect(failures).toContain(
      "Package store submission screenshot .artifacts/release-evidence-package-test/ios-store.png must include a valid capturedAt timestamp."
    );
    expect(failures).toContain(
      "Package store submission screenshot .artifacts/release-evidence-package-test/ios-store.png must be at least 1080px on the short edge and 1920px on the long edge."
    );
  });

  it("rejects packaged store submission screenshots older than the packaged release report", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const packagedChecklistPath = `${packageDir}/artifacts/${storeSubmissionChecklistPath}`;
    const releaseReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    const checklist = JSON.parse(readFileSync(packagedChecklistPath, "utf8"));
    const staleCapturedAt = new Date(Date.parse(releaseReport.finishedAt) - 48 * 3_600_000).toISOString();
    for (const screenshot of checklist.screenshots) {
      screenshot.capturedAt = staleCapturedAt;
    }
    writeFileSync(packagedChecklistPath, JSON.stringify(checklist, null, 2));
    refreshPackagedChecklistEvidence(packagedChecklistPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package store submission screenshot .artifacts/release-evidence-package-test/ios-store.png is 48h older than the release report, above the 24h commercial release gate."
    );
    expect(failures).toContain(
      "Package store submission screenshot .artifacts/release-evidence-package-test/android-store.png is 48h older than the release report, above the 24h commercial release gate."
    );
  });

  it("rejects packaged store submission screenshots from a different validation build", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedChecklistPath = `${packageDir}/artifacts/${storeSubmissionChecklistPath}`;
    const checklist = JSON.parse(readFileSync(packagedChecklistPath, "utf8"));
    for (const screenshot of checklist.screenshots) {
      screenshot.appBuild = "rc-2";
    }
    writeFileSync(packagedChecklistPath, JSON.stringify(checklist, null, 2));
    refreshPackagedChecklistEvidence(packagedChecklistPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package store submission screenshot .artifacts/release-evidence-package-test/ios-store.png app build rc-2 does not match validation evidence build rc-1."
    );
    expect(failures).toContain(
      "Package store submission screenshot .artifacts/release-evidence-package-test/android-store.png app build rc-2 does not match validation evidence build rc-1."
    );
  });

  it("rejects packaged dashboard evidence manifests without screenshot capture timestamps", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedDashboardManifestPath = `${packageDir}/artifacts/${dashboardEvidenceManifestPath}`;
    const dashboardManifest = JSON.parse(readFileSync(packagedDashboardManifestPath, "utf8"));
    delete dashboardManifest.artifacts.find(
      (artifact) => artifact.platform === "youtube" && artifact.kind === "screenshot"
    ).capturedAt;
    writeFileSync(packagedDashboardManifestPath, JSON.stringify(dashboardManifest, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    refreshPackageArtifactEntry(manifest, dashboardEvidenceManifestPath, packagedDashboardManifestPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package dashboard evidence screenshot .artifacts/release-evidence-package-test/youtube-dashboard.png must include a valid capturedAt timestamp."
    );
  });

  it("rejects packaged dashboard evidence manifests with stale screenshot/status timing", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedDashboardManifestPath = `${packageDir}/artifacts/${dashboardEvidenceManifestPath}`;
    const dashboardManifest = JSON.parse(readFileSync(packagedDashboardManifestPath, "utf8"));
    dashboardManifest.artifacts.find(
      (artifact) => artifact.platform === "twitch" && artifact.kind === "statusJson"
    ).checkedAt = "2026-06-25T00:30:01.000Z";
    writeFileSync(packagedDashboardManifestPath, JSON.stringify(dashboardManifest, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    refreshPackageArtifactEntry(manifest, dashboardEvidenceManifestPath, packagedDashboardManifestPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package dashboard evidence twitch screenshot capturedAt must be within 10 minutes of status JSON checkedAt."
    );
  });

  it("rejects packaged dashboard evidence older than the packaged release report", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const packagedDashboardManifestPath = `${packageDir}/artifacts/${dashboardEvidenceManifestPath}`;
    const releaseReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    const dashboardManifest = JSON.parse(readFileSync(packagedDashboardManifestPath, "utf8"));
    const staleCapturedAt = new Date(Date.parse(releaseReport.finishedAt) - 48 * 3_600_000).toISOString();
    for (const artifact of dashboardManifest.artifacts) {
      if (artifact.kind === "screenshot") {
        artifact.capturedAt = staleCapturedAt;
      }
      if (artifact.kind === "statusJson") {
        artifact.checkedAt = staleCapturedAt;
      }
    }
    writeFileSync(packagedDashboardManifestPath, JSON.stringify(dashboardManifest, null, 2));

    const dashboardManifestContent = readFileSync(packagedDashboardManifestPath);
    const dashboardManifestSha256 = createHash("sha256").update(dashboardManifestContent).digest("hex");
    const reportArtifact = releaseReport.artifacts.files.find(
      (artifact) => artifact.group === dashboardEvidenceArtifactGroup && artifact.path === dashboardEvidenceManifestPath
    );
    reportArtifact.bytes = dashboardManifestContent.byteLength;
    reportArtifact.sha256 = dashboardManifestSha256;
    writeFileSync(packagedReportPath, JSON.stringify(releaseReport, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
    manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
    refreshPackageArtifactEntry(manifest, dashboardEvidenceManifestPath, packagedDashboardManifestPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package dashboard evidence screenshot .artifacts/release-evidence-package-test/youtube-dashboard.png is 48h older than the release report, above the 24h commercial release gate."
    );
    expect(failures).toContain(
      "Package dashboard evidence statusJson .artifacts/release-evidence-package-test/twitch-dashboard.json is 48h older than the release report, above the 24h commercial release gate."
    );
  });

  it("rejects packages whose store release report artifact is missing from the package", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts = manifest.artifacts.filter((artifact) => artifact.sourcePath !== storeReleaseReportPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(`Package is missing store release orchestration report ${storeReleaseReportPath}.`);
  });

  it("rejects stale distribution manifest metadata inside the packaged store release report", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedStoreReleaseReportPath = `${packageDir}/artifacts/${storeReleaseReportPath}`;
    const storeReleaseReport = JSON.parse(readFileSync(packagedStoreReleaseReportPath, "utf8"));
    storeReleaseReport.artifacts.distributionManifest.sha256 = "0".repeat(64);
    writeFileSync(packagedStoreReleaseReportPath, JSON.stringify(storeReleaseReport, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    refreshPackageArtifactEntry(manifest, storeReleaseReportPath, packagedStoreReleaseReportPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      `Package store release report distribution manifest metadata mismatch for ${distributionArtifactManifestPath}.`
    );
  });

  it("rejects packaged store release reports generated with skipped env or build steps", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedStoreReleaseReportPath = `${packageDir}/artifacts/${storeReleaseReportPath}`;
    const storeReleaseReport = JSON.parse(readFileSync(packagedStoreReleaseReportPath, "utf8"));
    storeReleaseReport.options.skipEnv = true;
    storeReleaseReport.options.skipBuild = true;
    writeFileSync(packagedStoreReleaseReportPath, JSON.stringify(storeReleaseReport, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    refreshPackageArtifactEntry(manifest, storeReleaseReportPath, packagedStoreReleaseReportPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package store release report was generated with --skip-env and cannot be used as commercial release evidence."
    );
    expect(failures).toContain(
      "Package store release report was generated with --skip-build and cannot be used as commercial release evidence."
    );
  });

  it("rejects packaged store release reports older than the packaged release report", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const packagedStoreReleaseReportPath = `${packageDir}/artifacts/${storeReleaseReportPath}`;
    const releaseReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    const storeReleaseReport = JSON.parse(readFileSync(packagedStoreReleaseReportPath, "utf8"));
    const staleFinishedAt = new Date(Date.parse(releaseReport.finishedAt) - 48 * 3_600_000).toISOString();
    storeReleaseReport.startedAt = new Date(Date.parse(staleFinishedAt) - 1_000).toISOString();
    storeReleaseReport.finishedAt = staleFinishedAt;
    storeReleaseReport.durationMs = 1_000;
    writeFileSync(packagedStoreReleaseReportPath, JSON.stringify(storeReleaseReport, null, 2));

    const storeReportContent = readFileSync(packagedStoreReleaseReportPath);
    const storeReportSha256 = createHash("sha256").update(storeReportContent).digest("hex");
    const storeReportArtifact = releaseReport.artifacts.files.find(
      (artifact) => artifact.group === storeReleaseReportArtifactGroup && artifact.path === storeReleaseReportPath
    );
    storeReportArtifact.bytes = storeReportContent.byteLength;
    storeReportArtifact.sha256 = storeReportSha256;
    const storeReleaseGate = releaseReport.gates.find((gate) => gate.label === "Verify store release orchestration report");
    storeReleaseGate.evidence.sha256 = storeReportSha256;
    writeFileSync(packagedReportPath, JSON.stringify(releaseReport, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
    manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
    refreshPackageArtifactEntry(manifest, storeReleaseReportPath, packagedStoreReleaseReportPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package store release report is 48h older than the release report, above the 24h commercial release gate."
    );
  });

  it("rejects traversal-style artifact paths before report validation reads sources", () => {
    writeReportFixture();
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    report.artifacts.files[0].path = "dist/../../outside-release-artifact.txt";
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    expect(() =>
      createReleaseEvidencePackage({
        reportPath,
        outputDir: `${fixtureRoot}/unsafe-package`,
        allowDirty: true
      })
    ).toThrow("Release report contains unsafe package source paths:");
  });

  it("rejects source drift when source verification is requested", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    writeFileSync("dist/index.html", "<!doctype html><title>Source drift</title>");
    const failures = validateReleaseEvidencePackage({ packageDir, verifySources: true });

    expect(failures).toContain("Package source metadata mismatch for dist/index.html.");
  });

  it("rejects unredacted sensitive text even when package metadata hashes match", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedUiEvidencePath = `${packageDir}/ui-evidence/ui-evidence.json`;
    const packagedUiEvidence = JSON.parse(readFileSync(packagedUiEvidencePath, "utf8"));
    packagedUiEvidence.debug = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456";
    writeFileSync(packagedUiEvidencePath, JSON.stringify(packagedUiEvidence, null, 2));

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    const evidenceGate = packagedReport.gates.find((gate) => gate.label === "Verify browser UI evidence");
    evidenceGate.evidence.sha256 = fileSha256(packagedUiEvidencePath);
    writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
    manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
    manifest.uiEvidence.bytes = readFileSync(packagedUiEvidencePath).byteLength;
    manifest.uiEvidence.sha256 = fileSha256(packagedUiEvidencePath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures.join("\n")).toContain("Release evidence package contains");
    expect(failures.join("\n")).toContain("unredacted sensitive text finding(s)");
    expect(failures.join("\n")).toContain("ui-evidence/ui-evidence.json contains a bearer/OAuth token");
  });

  it("scans release text artifacts such as mjs files for oauth tokens and RTMP stream keys", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedScriptPath = `${packageDir}/artifacts/scripts/create-release-evidence-package.mjs`;
    writeFileSync(
      packagedScriptPath,
      [
        "const twitch = 'PASS oauth:abcdefghijklmnopqrstuvwxyz123456';",
        "const publishUrl = 'rtmps://a.rtmps.youtube.com/live2/abcd-efgh-ijkl-mnop-qrst';"
      ].join("\n")
    );

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    const reportArtifact = packagedReport.artifacts.files.find(
      (artifact) => artifact.path === "scripts/create-release-evidence-package.mjs"
    );
    reportArtifact.bytes = readFileSync(packagedScriptPath).byteLength;
    reportArtifact.sha256 = fileSha256(packagedScriptPath);
    writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
    manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
    const packageArtifact = manifest.artifacts.find(
      (artifact) => artifact.sourcePath === "scripts/create-release-evidence-package.mjs"
    );
    packageArtifact.bytes = readFileSync(packagedScriptPath).byteLength;
    packageArtifact.sha256 = fileSha256(packagedScriptPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures.join("\n")).toContain("artifacts/scripts/create-release-evidence-package.mjs contains a Twitch IRC oauth token");
    expect(failures.join("\n")).toContain("artifacts/scripts/create-release-evidence-package.mjs contains a stream key in an RTMP URL");
  });

  it("does not read package-escaped paths during the privacy scan", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    writeFile(`${fixtureRoot}/outside.json`, JSON.stringify({ debug: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456" }));
    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.uiEvidence.packagedPath = "../outside.json";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Package entry path must be package-relative: ../outside.json.");
    expect(failures.join("\n")).not.toContain("unredacted sensitive text finding");
  });
});

function writeFixtureFiles() {
  resetPackageDir();
  writeFile("dist/index.html", "<!doctype html><title>MobileLiveCaster</title>");
  writeFile("dist/assets/release-evidence-package-test.js", "console.log('release-evidence-package-test');");
  writeFile("dist/assets/release-evidence-package-test.css", "body { color: #111; }");
  writeFile(".artifacts/rn/main.ios.jsbundle", "ios bundle");
  writeFile(".artifacts/rn/index.android.bundle", "android bundle");
  writeFile(".artifacts/mobile-live-caster-desktop.png", pngBytes);
  writeFile(".artifacts/mobile-live-caster-mobile.png", pngBytes);
  writeFile(
    supportBundlePath,
    JSON.stringify(commercialSupportBundleFixture(), null, 2)
  );
  writeDistributionFixture();
  writeStoreReleaseFixture();
  writeDashboardEvidenceFixture();
  writeStoreSubmissionFixture();
  writeUiEvidenceFile();
}

function commercialSupportBundleFixture() {
  return {
    app: {
      name: "MobileLiveCaster",
      reportVersion: 1,
      bundleVersion: 15
    },
    generatedAt: capturedAt,
    fixture: true,
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
      validationEvidenceRunManifest: [
        supportBundleManifestRun("ios", "svr1-ios"),
        supportBundleManifestRun("android", "svr1-android")
      ]
    }
  };
}

function supportBundleManifestRun(devicePlatform, fingerprint) {
  return {
    id: `validation-${devicePlatform}`,
    fingerprint,
    createdAt: capturedAt,
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
    audioStatus: "pass",
    chatReadoutStatus: "pass",
    qualityAutomationStatus: "pass",
    platformPublishingStatus: "pass",
    platformPublishingFreshnessStatus: "fresh",
    summary: "Validation run retained.",
    recommendation: "Keep this run with release evidence."
  };
}

function writeReportFixture() {
  writeFixtureFiles();
  const artifactFiles = [
    ...releaseConfigArtifactPaths.map((path) => artifactRecord("release-config", path)),
    artifactRecord("web", "dist/index.html"),
    artifactRecord("web", "dist/assets/release-evidence-package-test.js"),
    artifactRecord("web", "dist/assets/release-evidence-package-test.css"),
    artifactRecord("react-native", ".artifacts/rn/main.ios.jsbundle"),
    artifactRecord("react-native", ".artifacts/rn/index.android.bundle"),
    artifactRecord("ui", ".artifacts/mobile-live-caster-desktop.png"),
    artifactRecord("ui", ".artifacts/mobile-live-caster-mobile.png"),
    ...distributionArtifactRecords(),
    ...storeReleaseRecords(),
    ...dashboardEvidenceRecords(),
    ...storeSubmissionRecords()
  ];

  writeFile(
    reportPath,
    JSON.stringify(
      {
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
          files: artifactFiles
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
            command: "read .artifacts/release-evidence-package-test/ui-evidence.json",
            status: "passed",
            startedAt: new Date(Date.now() - 1_000).toISOString(),
            finishedAt: new Date().toISOString(),
            durationMs: 1,
            exitCode: 0,
            error: null,
            evidence: {
              path: ".artifacts/release-evidence-package-test/ui-evidence.json",
              sha256: fileSha256(".artifacts/release-evidence-package-test/ui-evidence.json"),
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
      },
      null,
      2
    )
  );
}

function writeDistributionFixture() {
  writeFile(".artifacts/release-evidence-package-test/app-release.aab", androidAabBytes());
  writeFile(".artifacts/release-evidence-package-test/MobileLiveCaster.ipa", iosIpaBytes());
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
          statusShort: " M scripts/create-release-evidence-package.test.mjs"
        },
        artifacts: [
          distributionManifestRecord("android", "aab", ".artifacts/release-evidence-package-test/app-release.aab"),
          distributionManifestRecord("ios", "ipa", ".artifacts/release-evidence-package-test/MobileLiveCaster.ipa")
        ]
      },
      null,
      2
    )
  );
}

function writeStoreReleaseFixture({ status = "passed" } = {}) {
  const startedAt = new Date(Date.now() - 2_000).toISOString();
  const finishedAt = new Date().toISOString();
  writeFile(
    storeReleaseReportPath,
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: storeReleaseReportType,
        status,
        mode: "execute",
        startedAt,
        finishedAt,
        durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
        platforms: ["android", "ios"],
        git: {
          commit: currentCommit(),
          branch: "main",
          dirty: false,
          statusShort: ""
        },
        options: {
          allowDirty: false,
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

function writeDashboardEvidenceFixture() {
  writeFile(".artifacts/release-evidence-package-test/youtube-dashboard.png", dashboardPngBytes);
  writeFile(".artifacts/release-evidence-package-test/twitch-dashboard.png", dashboardPngBytes);
  writeFile(
    ".artifacts/release-evidence-package-test/youtube-dashboard.json",
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
    ".artifacts/release-evidence-package-test/twitch-dashboard.json",
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
          statusShort: " M scripts/create-release-evidence-package.test.mjs"
        },
        artifacts: [
          dashboardScreenshotRecord("youtube", ".artifacts/release-evidence-package-test/youtube-dashboard.png"),
          dashboardScreenshotRecord("twitch", ".artifacts/release-evidence-package-test/twitch-dashboard.png"),
          dashboardStatusJsonRecord("youtube", ".artifacts/release-evidence-package-test/youtube-dashboard.json"),
          dashboardStatusJsonRecord("twitch", ".artifacts/release-evidence-package-test/twitch-dashboard.json")
        ]
      },
      null,
      2
    )
  );
}

function writeStoreSubmissionFixture() {
  writeFile(".artifacts/release-evidence-package-test/ios-store.png", storePngBytes);
  writeFile(".artifacts/release-evidence-package-test/android-store.png", storePngBytes);
  writeFile(".artifacts/release-evidence-package-test/submission-review.md", "# Store Submission Review\n\n- [ ] Listing reviewed.\n");
  writeFile(
    ".artifacts/release-evidence-package-test/submission-metadata.json",
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
            path: ".artifacts/release-evidence-package-test/ios-store.png",
            source: "realDevice",
            osVersion: "iOS 18.5",
            appBuild: "rc-1",
            capturedAt
          },
          {
            platform: "android",
            device: "Pixel 8 Pro",
            path: ".artifacts/release-evidence-package-test/android-store.png",
            source: "realDevice",
            osVersion: "Android 15",
            appBuild: "rc-1",
            capturedAt
          }
        ],
        reviewDocuments: [
          { kind: "submissionReview", path: ".artifacts/release-evidence-package-test/submission-review.md" }
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
          statusShort: " M scripts/create-release-evidence-package.test.mjs"
        },
        metadata: storeMetadataRecord(),
        screenshots: [
          storeScreenshotRecord("ios", "iPhone 15 Pro Max", ".artifacts/release-evidence-package-test/ios-store.png"),
          storeScreenshotRecord("android", "Pixel 8 Pro", ".artifacts/release-evidence-package-test/android-store.png")
        ],
        reviewDocuments: [storeReviewDocumentRecord()]
      },
      null,
      2
    )
  );
}

function distributionArtifactRecords() {
  return [
    artifactRecord("distribution", distributionArtifactManifestPath),
    artifactRecord("distribution", ".artifacts/release-evidence-package-test/app-release.aab"),
    artifactRecord("distribution", ".artifacts/release-evidence-package-test/MobileLiveCaster.ipa")
  ];
}

function storeReleaseRecords() {
  return [artifactRecord(storeReleaseReportArtifactGroup, storeReleaseReportPath)];
}

function dashboardEvidenceRecords() {
  return [
    artifactRecord("dashboard", dashboardEvidenceManifestPath),
    artifactRecord("dashboard", ".artifacts/release-evidence-package-test/youtube-dashboard.png"),
    artifactRecord("dashboard", ".artifacts/release-evidence-package-test/twitch-dashboard.png"),
    artifactRecord("dashboard", ".artifacts/release-evidence-package-test/youtube-dashboard.json"),
    artifactRecord("dashboard", ".artifacts/release-evidence-package-test/twitch-dashboard.json")
  ];
}

function storeSubmissionRecords() {
  return [
    artifactRecord("store-submission", storeSubmissionChecklistPath),
    artifactRecord("store-submission", ".artifacts/release-evidence-package-test/submission-metadata.json"),
    artifactRecord("store-submission", ".artifacts/release-evidence-package-test/submission-review.md"),
    artifactRecord("store-submission", ".artifacts/release-evidence-package-test/ios-store.png"),
    artifactRecord("store-submission", ".artifacts/release-evidence-package-test/android-store.png")
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

function storeMetadataRecord() {
  return storeRecord("store-submission-metadata", ".artifacts/release-evidence-package-test/submission-metadata.json");
}

function storeReviewDocumentRecord() {
  return storeRecord("submissionReview", ".artifacts/release-evidence-package-test/submission-review.md");
}

function storeScreenshotRecord(platform, device, path) {
  const content = readFileSync(path);
  const dimensions = pngDimensions(content);
  return {
    platform,
    kind: "screenshot",
    device,
    locale: "ja-JP",
    role: "store",
    source: "realDevice",
    osVersion: platform === "ios" ? "iOS 18.5" : "Android 15",
    appBuild: "rc-1",
    capturedAt,
    path,
    basename: path.split("/").at(-1),
    width: dimensions.width,
    height: dimensions.height,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function storeRecord(kind, path) {
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
  const bytes = Buffer.from(pngBytes);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
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

function refreshPackageArtifactEntry(manifest, sourcePath, packagedPath) {
  const entry = manifest.artifacts.find((artifact) => artifact.sourcePath === sourcePath);
  const content = readFileSync(packagedPath);
  entry.bytes = content.byteLength;
  entry.sha256 = createHash("sha256").update(content).digest("hex");
}

function refreshPackagedSupportBundleEvidence(packagedSupportBundlePath) {
  const packagedReportPath = `${packageDir}/release-candidate-report.json`;
  const supportBundleContent = readFileSync(packagedSupportBundlePath);
  const supportBundleSha256 = createHash("sha256").update(supportBundleContent).digest("hex");

  const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
  packagedReport.supportBundle.sha256 = supportBundleSha256;
  writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

  refreshPackagedSourceReportEvidence();

  const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.supportBundle.bytes = supportBundleContent.byteLength;
  manifest.supportBundle.sha256 = supportBundleSha256;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function refreshPackagedSourceReportEvidence() {
  const packagedReportPath = `${packageDir}/release-candidate-report.json`;
  const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
  manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function refreshPackagedChecklistEvidence(packagedChecklistPath) {
  const packagedReportPath = `${packageDir}/release-candidate-report.json`;
  const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
  const checklistContent = readFileSync(packagedChecklistPath);
  const checklistSha256 = createHash("sha256").update(checklistContent).digest("hex");
  const reportArtifact = packagedReport.artifacts.files.find(
    (artifact) => artifact.group === storeSubmissionArtifactGroup && artifact.path === storeSubmissionChecklistPath
  );
  reportArtifact.bytes = checklistContent.byteLength;
  reportArtifact.sha256 = checklistSha256;
  writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

  const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
  manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
  refreshPackageArtifactEntry(manifest, storeSubmissionChecklistPath, packagedChecklistPath);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function writeUiEvidenceFile() {
  writeFile(
    ".artifacts/release-evidence-package-test/ui-evidence.json",
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "ui-verification",
        status: "passed",
        target: "http://127.0.0.1:5173/",
        finishedAt: new Date().toISOString(),
        git: {
          commit: currentCommit(),
          dirty: true,
          statusShort: " M scripts/create-release-evidence-package.test.mjs"
        },
        viewports: [
          uiViewport("desktop", ".artifacts/mobile-live-caster-desktop.png"),
          uiViewport("mobile", ".artifacts/mobile-live-caster-mobile.png")
        ]
      },
      null,
      2
    )
  );
}

function uiViewport(name, screenshotPath) {
  const content = readFileSync(screenshotPath);
  return {
    name,
    horizontalOverflow: false,
    screenshot: {
      path: screenshotPath,
      bytes: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex")
    }
  };
}

function writeFile(path, content) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function currentCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

function resetPackageDir() {
  rmSync(packageDir, { recursive: true, force: true });
}

function snapshotFiles(paths) {
  for (const path of paths) {
    fileBackups.set(path, existsSync(path) ? readFileSync(path) : null);
  }
}

function restoreFiles() {
  rmSync(fixtureRoot, { recursive: true, force: true });
  for (const [path, content] of fileBackups.entries()) {
    if (content === null) {
      rmSync(path, { force: true });
    } else {
      mkdirSync(resolve(path, ".."), { recursive: true });
      writeFileSync(path, content);
    }
  }
}
