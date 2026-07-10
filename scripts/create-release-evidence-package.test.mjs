import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  androidNativeDebugArtifactPath,
  gitleaksHistoryBaselinePath,
  gitleaksHistoryScanArtifactPath,
  iosNativeVerificationArtifactPath,
  releaseConfigArtifactPaths,
  sourceSecretScanArtifactGroup,
  sourceSecretScanArtifactPath,
  requiredReleaseGateLabels
} from "./release-artifact-policy.mjs";
import { distributionArtifactGroup, distributionArtifactManifestPath } from "./verify-distribution-artifacts.mjs";
import { dashboardEvidenceArtifactGroup, dashboardEvidenceManifestPath } from "./verify-platform-dashboard-evidence.mjs";
import { storeReleaseReportArtifactGroup, storeReleaseReportType } from "./release-store-build.mjs";
import { storeSubmissionArtifactGroup, storeSubmissionChecklistPath } from "./verify-store-submission-checklist.mjs";
import {
  createPhysicalDevicePreflightReport,
  physicalDevicePreflightArtifactGroup,
  writePhysicalDevicePreflightReport
} from "./verify-physical-devices.mjs";
import {
  createReleaseEvidencePackage,
  releaseEvidencePackageManifestName,
  releaseEvidencePackageType,
  validateReleaseEvidencePackage
} from "./create-release-evidence-package.mjs";
import { createRgbaPngFixture } from "./png-test-fixtures.mjs";
import { acquireReleaseTestLock } from "./release-test-lock.mjs";
import { requiredBrowserUiTextChecks } from "./browser-ui-required-text.mjs";
import {
  nativeBuildArtifactRecords,
  nativeBuildFixturePaths,
  writeNativeBuildFixture
} from "./native-build-test-fixtures.mjs";

const fixtureRoot = ".artifacts/release-evidence-package-test";
const webArtifactRoot = `${fixtureRoot}/web`;
const webIndexPath = "dist/index.html";
const webScriptPath = `${webArtifactRoot}/release-evidence-package-test.js`;
const webStylePath = `${webArtifactRoot}/release-evidence-package-test.css`;
const nativeBuildPaths = nativeBuildFixturePaths(fixtureRoot);
const packageDir = `${fixtureRoot}/package`;
const reportPath = `${fixtureRoot}/release-report.json`;
const supportBundlePath = `${fixtureRoot}/support-bundle.json`;
const storeReleaseReportPath = `${fixtureRoot}/store-release-report.json`;
const physicalDevicePreflightPath = `${fixtureRoot}/physical-device-preflight.json`;
const packagedArtifactPath = (sourcePath) => `${packageDir}/artifacts/${sourcePath}`;
const generatedFiles = [
  webIndexPath,
  webScriptPath,
  webStylePath,
  ".artifacts/rn/main.ios.jsbundle",
  ".artifacts/rn/index.android.bundle",
  gitleaksHistoryScanArtifactPath,
  sourceSecretScanArtifactPath,
  ".artifacts/mobile-live-caster-desktop.png",
  ".artifacts/mobile-live-caster-mobile.png",
  ".artifacts/ui-verification.json",
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
  ".artifacts/release-evidence-package-test/android-store.png",
  ".artifacts/release-evidence-package-test/physical-device-preflight.json",
  ...nativeBuildPaths.allPaths
];
const fileBackups = new Map();
let releaseTestUnlock = () => {};
const pngBytes = createRgbaPngFixture(1, 1);
const storePngBytes = pngWithDimensions(1179, 2556);
const dashboardPngBytes = pngWithDimensions(1440, 900);
const minimumDistributionArtifactBytes = 1_048_576;
const capturedAt = new Date().toISOString();

vi.setConfig({ testTimeout: 60_000 });

describe("release evidence package creator", () => {
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
    expect(existsSync(packagedArtifactPath(webIndexPath))).toBe(true);
    expect(validateReleaseEvidencePackage({ packageDir })).toEqual([]);
  });

  it("packages UI evidence JSON from in-process browser UI gates", () => {
    writeReportFixture({ skipUi: false, uiEvidencePath: ".artifacts/ui-verification.json" });

    const result = createReleaseEvidencePackage({
      reportPath,
      outputDir: packageDir,
      allowDirty: true
    });

    expect(result.manifest.uiEvidence).toMatchObject({
      role: "uiEvidence",
      sourcePath: ".artifacts/ui-verification.json",
      packagedPath: "ui-evidence/ui-verification.json"
    });
    expect(existsSync(`${packageDir}/ui-evidence/ui-verification.json`)).toBe(true);
    expect(validateReleaseEvidencePackage({ packageDir })).toEqual([]);
  });

  it("rejects symlinked release report inputs before reading linked reports", () => {
    writeReportFixture();
    const reportLink = `${fixtureRoot}/release-report-link.json`;
    const outsideReport = `${fixtureRoot}/outside-release-report.json`;
    writeFile(outsideReport, JSON.stringify({ secret: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456" }));
    symlinkSync(resolve(outsideReport), reportLink);

    expect(() =>
      createReleaseEvidencePackage({
        reportPath: reportLink,
        outputDir: `${fixtureRoot}/report-link-package`,
        allowDirty: true
      })
    ).toThrow(`release-candidate report must not be a symbolic link: ${reportLink}.`);
  });

  it("rejects symlinked output directories before writing linked package files", () => {
    writeReportFixture();
    const outsidePackageDir = `${fixtureRoot}/outside-package-target`;
    const outputLinkDir = `${fixtureRoot}/package-output-link`;
    mkdirSync(outsidePackageDir, { recursive: true });
    symlinkSync(resolve(outsidePackageDir), outputLinkDir, "dir");

    expect(() =>
      createReleaseEvidencePackage({
        reportPath,
        outputDir: outputLinkDir,
        allowDirty: true
      })
    ).toThrow(`Release evidence output directory must not be a symbolic link: ${outputLinkDir}.`);
    expect(existsSync(`${outsidePackageDir}/release-candidate-report.json`)).toBe(false);
  });

  it("rejects symlinked package directories before reading linked manifests", () => {
    writeReportFixture();
    const outsidePackageDir = `${fixtureRoot}/outside-package-for-validation`;
    createReleaseEvidencePackage({ reportPath, outputDir: outsidePackageDir, allowDirty: true });
    rmSync(packageDir, { recursive: true, force: true });
    symlinkSync(resolve(outsidePackageDir), packageDir, "dir");

    try {
      const failures = validateReleaseEvidencePackage({ packageDir });

      expect(failures).toContain(`Release evidence package directory must not be a symbolic link: ${packageDir}.`);
    } finally {
      rmSync(packageDir, { recursive: true, force: true });
    }
  });

  it("rejects unmanifested files inside the release evidence package", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    writeFileSync(`${packageDir}/artifacts/unmanifested-note.txt`, "operator note outside the package manifest");

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Release evidence package contains unmanifested file artifacts/unmanifested-note.txt.");
  });

  it("rejects packaged symlink entries without reading linked targets", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const manifest = JSON.parse(readFileSync(`${packageDir}/${releaseEvidencePackageManifestName}`, "utf8"));
    const outsideSecretPath = `${fixtureRoot}/outside-secret.json`;
    const packagedUiEvidencePath = `${packageDir}/${manifest.uiEvidence.packagedPath}`;
    writeFileSync(outsideSecretPath, JSON.stringify({ debug: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456" }));
    rmSync(packagedUiEvidencePath, { force: true });
    symlinkSync(resolve(outsideSecretPath), packagedUiEvidencePath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(`Package entry must not be a symbolic link: ${manifest.uiEvidence.packagedPath}.`);
    expect(failures.join("\n")).not.toContain("unredacted sensitive text finding");
  });

  it("rejects packaged source secret scan evidence with an invalid schema even when metadata hashes match", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedScanPath = packagedSourceSecretScanPath();
    const scan = JSON.parse(readFileSync(packagedScanPath, "utf8"));
    scan.type = "source-scan";
    writeFileSync(packagedScanPath, JSON.stringify(scan, null, 2));
    refreshPackagedArtifactEvidence(sourceSecretScanArtifactPath, packagedScanPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package source secret scan is not a MobileLiveCaster source-secret-scan reportVersion 1 file."
    );
  });

  it("rejects packaged gitleaks history scan evidence with retained findings even when metadata hashes match", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedScanPath = packagedGitleaksHistoryScanPath();
    const scan = JSON.parse(readFileSync(packagedScanPath, "utf8"));
    scan.status = "failed";
    scan.findingCount = 1;
    scan.findings = [{ RuleID: "generic-api-key", File: "src/main.ts", StartLine: 1, Fingerprint: "new" }];
    writeFileSync(packagedScanPath, JSON.stringify(scan, null, 2));
    refreshPackagedArtifactEvidence(gitleaksHistoryScanArtifactPath, packagedScanPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain('Package Gitleaks history scan artifact must be passed, got "failed".');
    expect(failures).toContain("Package Gitleaks history scan artifact must report zero unbaselined findings.");
  });

  it("rejects packaged gitleaks history scan evidence when the approved baseline artifact is missing", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    rmSync(packagedGitleaksBaselinePath(), { force: true });

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(`Package is missing gitleaks baseline artifact ${gitleaksHistoryBaselinePath}.`);
  });

  it("rejects packaged gitleaks history scan evidence from a different commit", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedScanPath = packagedGitleaksHistoryScanPath();
    const scan = JSON.parse(readFileSync(packagedScanPath, "utf8"));
    scan.git.commit = "0".repeat(40);
    writeFileSync(packagedScanPath, JSON.stringify(scan, null, 2));
    refreshPackagedArtifactEvidence(gitleaksHistoryScanArtifactPath, packagedScanPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      `Package Gitleaks history scan artifact commit ${"0".repeat(40)} does not match current commit ${currentCommit()}.`
    );
  });

  it("rejects packaged source secret scan evidence with retained findings even when metadata hashes match", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedScanPath = packagedSourceSecretScanPath();
    const scan = JSON.parse(readFileSync(packagedScanPath, "utf8"));
    scan.status = "failed";
    scan.findingCount = 1;
    scan.findings = [{ ruleId: "fixture-secret", file: "src/mobile/MobileApp.tsx", preview: "[redacted]" }];
    writeFileSync(packagedScanPath, JSON.stringify(scan, null, 2));
    refreshPackagedArtifactEvidence(sourceSecretScanArtifactPath, packagedScanPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain('Package source secret scan must be passed, got "failed".');
    expect(failures).toContain("Package source secret scan artifact must report zero findings.");
  });

  it("rejects packaged source secret scan evidence generated before the release report started", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedReport = JSON.parse(readFileSync(`${packageDir}/release-candidate-report.json`, "utf8"));
    const packagedScanPath = packagedSourceSecretScanPath();
    const scan = JSON.parse(readFileSync(packagedScanPath, "utf8"));
    scan.generatedAt = new Date(Date.parse(packagedReport.startedAt) - 1_000).toISOString();
    writeFileSync(packagedScanPath, JSON.stringify(scan, null, 2));
    refreshPackagedArtifactEvidence(sourceSecretScanArtifactPath, packagedScanPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Package source secret scan generatedAt is before the release report startedAt.");
  });

  it("rejects packaged source secret scan evidence from a different commit", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedScanPath = packagedSourceSecretScanPath();
    const scan = JSON.parse(readFileSync(packagedScanPath, "utf8"));
    scan.git.commit = "0".repeat(40);
    writeFileSync(packagedScanPath, JSON.stringify(scan, null, 2));
    refreshPackagedArtifactEvidence(sourceSecretScanArtifactPath, packagedScanPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      `Package source secret scan commit ${"0".repeat(40)} does not match current commit ${currentCommit()}.`
    );
  });

  it("rejects packaged distribution manifests from a different commit", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const sourceAabPath = ".artifacts/release-evidence-package-test/app-release.aab";
    const packagedAabPath = `${packageDir}/artifacts/${sourceAabPath}`;
    const packagedDistributionManifestPath = `${packageDir}/artifacts/${distributionArtifactManifestPath}`;
    const distributionManifest = JSON.parse(readFileSync(packagedDistributionManifestPath, "utf8"));
    distributionManifest.git.commit = "0".repeat(40);
    distributionManifest.git.dirty = false;
    distributionManifest.git.statusShort = "";
    writeFileSync(packagedDistributionManifestPath, JSON.stringify(distributionManifest, null, 2));
    refreshPackagedDistributionEvidence(packagedDistributionManifestPath, sourceAabPath, packagedAabPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      `Package distribution manifest commit ${"0".repeat(40)} does not match current commit ${currentCommit()}.`
    );
  });

  it("rejects packaged dashboard evidence manifests from a different commit", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedDashboardManifestPath = `${packageDir}/artifacts/${dashboardEvidenceManifestPath}`;
    const dashboardManifest = JSON.parse(readFileSync(packagedDashboardManifestPath, "utf8"));
    dashboardManifest.git.commit = "0".repeat(40);
    dashboardManifest.git.dirty = false;
    dashboardManifest.git.statusShort = "";
    writeFileSync(packagedDashboardManifestPath, JSON.stringify(dashboardManifest, null, 2));
    refreshPackagedDashboardEvidenceEntries({ packagedDashboardManifestPath });

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      `Package dashboard evidence manifest commit ${"0".repeat(40)} does not match current commit ${currentCommit()}.`
    );
  });

  it("rejects packaged store submission checklists from a different commit", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedChecklistPath = `${packageDir}/artifacts/${storeSubmissionChecklistPath}`;
    const checklist = JSON.parse(readFileSync(packagedChecklistPath, "utf8"));
    checklist.git.commit = "0".repeat(40);
    checklist.git.dirty = false;
    checklist.git.statusShort = "";
    writeFileSync(packagedChecklistPath, JSON.stringify(checklist, null, 2));
    refreshPackagedChecklistEvidence(packagedChecklistPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      `Package store submission checklist commit ${"0".repeat(40)} does not match current commit ${currentCommit()}.`
    );
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

  it("rejects release reports generated with warning approval", () => {
    writeReportFixture();
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    report.options.allowWarnings = true;
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    expect(() =>
      createReleaseEvidencePackage({
        reportPath,
        outputDir: `${fixtureRoot}/warning-package`,
        allowDirty: true
      })
    ).toThrow("--allow-warnings");
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

  it("rejects packaged release reports that were later marked warning-approved", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    packagedReport.options.allowWarnings = true;
    writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));
    refreshPackagedSourceReportEvidence();

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Packaged release report was generated with --allow-warnings and cannot be used as commercial package evidence."
    );
  });

  it("rejects packages whose manifest git dirty-state provenance is missing", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    delete manifest.git.dirty;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Package manifest git dirty state is missing.");
  });

  it("rejects packages whose manifest git commit provenance is missing", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.git.commit = "";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Package manifest git commit is missing.");
  });

  it("rejects packages whose manifest commit does not match the packaged release report", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.git.commit = "0".repeat(40);
    manifest.git.dirty = false;
    manifest.git.statusShort = "";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      `Package manifest commit ${"0".repeat(40)} does not match current commit ${currentCommit()}.`
    );
  });

  it("rejects packages whose manifest generatedAt timestamp is missing or invalid", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.generatedAt = "";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Package manifest generatedAt timestamp is missing or invalid.");
  });

  it("rejects packages whose manifest generatedAt timestamp is in the future", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.generatedAt = new Date(Date.now() + 60_000).toISOString();
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Package manifest generatedAt timestamp is in the future.");
  });

  it("rejects packages generated before the packaged release report finished", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.generatedAt = new Date(Date.parse(packagedReport.finishedAt) - 1_000).toISOString();
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Package manifest generatedAt is before the packaged release report finishedAt.");
  });

  it("rejects packaged release reports whose git dirty-state provenance is missing", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    delete packagedReport.git.dirty;
    writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));
    refreshPackagedSourceReportEvidence();

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Packaged release report git dirty state is missing.");
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

  it("rejects packaged stale retained validation runs", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedSupportBundlePath = `${packageDir}/support-bundle/support-bundle.json`;
    const supportBundle = JSON.parse(readFileSync(packagedSupportBundlePath, "utf8"));
    supportBundle.summary.validationEvidenceStaleRunCount = 1;
    writeFileSync(packagedSupportBundlePath, JSON.stringify(supportBundle, null, 2));
    refreshPackagedSupportBundleEvidence(packagedSupportBundlePath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures.join("\n")).toContain("Package support bundle commercial release gate must be ready, got blocked:");
    expect(failures.join("\n")).toContain("Package support bundle validation-evidence-stale-retained-runs");
  });

  it("keeps packaged stale retained validation runs blocking when the RC report accepted warnings", () => {
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

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures.join("\n")).toContain("Package support bundle commercial release gate must be ready, got blocked:");
    expect(failures.join("\n")).toContain("Package support bundle validation-evidence-stale-retained-runs");
  });

  it("rejects tampered packaged artifact files", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    writeFileSync(packagedArtifactPath(webScriptPath), "console.log('tampered');");
    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(`Release evidence package file metadata mismatch for artifacts/${webScriptPath}.`);
  });

  it("rejects packaged reports missing a required native build gate", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    packagedReport.gates = packagedReport.gates.filter((gate) => gate.label !== "Build iOS native simulator app");
    writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));
    refreshPackagedSourceReportEvidence();

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Packaged release report is missing required gate Build iOS native simulator app.");
  });

  it("rejects semantically tampered packaged iOS native verification metadata", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedVerificationPath = `${packageDir}/artifacts/${iosNativeVerificationArtifactPath}`;
    const verification = JSON.parse(readFileSync(packagedVerificationPath, "utf8"));
    verification.broadcastUploadExtension.processMode = "RPBroadcastProcessModeUserInitiated";
    writeFileSync(packagedVerificationPath, JSON.stringify(verification, null, 2));
    refreshPackagedArtifactEvidence(iosNativeVerificationArtifactPath, packagedVerificationPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Package iOS native verification ReplayKit process mode is invalid.");
  });

  it("rejects non-canonical iOS bundle record paths after outer hashes are refreshed", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedVerificationPath = `${packageDir}/artifacts/${iosNativeVerificationArtifactPath}`;
    const verification = JSON.parse(readFileSync(packagedVerificationPath, "utf8"));
    verification.appBundle.files[0].path = `./${verification.appBundle.files[0].path}`;
    writeFileSync(packagedVerificationPath, JSON.stringify(verification, null, 2));
    refreshPackagedArtifactEvidence(iosNativeVerificationArtifactPath, packagedVerificationPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures.join("\n")).toContain("contains a non-canonical or escaped file path");
    expect(failures.join("\n")).toContain("artifact path must be canonical and workspace-relative");
  });

  it("rejects coherent removal of the iOS implementation dylib from a package", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedVerificationPath = `${packageDir}/artifacts/${iosNativeVerificationArtifactPath}`;
    const verification = JSON.parse(readFileSync(packagedVerificationPath, "utf8"));
    const implementationPath = verification.appBundle.implementation.path;
    verification.appBundle.files = verification.appBundle.files.filter((record) => record.path !== implementationPath);
    delete verification.appBundle.implementation;
    writeFileSync(packagedVerificationPath, JSON.stringify(verification, null, 2));

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    const verificationArtifact = packagedReport.artifacts.files.find(
      (artifact) => artifact.path === iosNativeVerificationArtifactPath
    );
    verificationArtifact.bytes = readFileSync(packagedVerificationPath).byteLength;
    verificationArtifact.sha256 = fileSha256(packagedVerificationPath);
    packagedReport.artifacts.files = packagedReport.artifacts.files.filter(
      (artifact) => artifact.path !== implementationPath
    );
    writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
    manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
    refreshPackageArtifactEntry(manifest, iosNativeVerificationArtifactPath, packagedVerificationPath);
    manifest.artifacts = manifest.artifacts.filter((artifact) => artifact.sourcePath !== implementationPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    rmSync(`${packageDir}/artifacts/${implementationPath}`, { force: true });

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      `Package iOS native verification bundle manifest is missing required implementation file ${implementationPath}.`
    );
  });

  it("rejects a coherently rehashed packaged Android artifact that is not an APK", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedApkPath = `${packageDir}/artifacts/${androidNativeDebugArtifactPath}`;
    writeFileSync(packagedApkPath, "not-an-apk");
    refreshPackagedArtifactEvidence(androidNativeDebugArtifactPath, packagedApkPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      `Package Android native debug artifact ${androidNativeDebugArtifactPath} must be at least 1048576 bytes to prevent placeholder release binaries.`
    );
  });

  it("rejects a package manifest that retains artifacts removed from the packaged report", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    packagedReport.artifacts.files = packagedReport.artifacts.files.filter((artifact) => artifact.path !== webScriptPath);
    writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
    manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(`Package manifest contains artifact not present in the release report: web:${webScriptPath}.`);
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

  it("rejects packages missing physical-device preflight evidence", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts = manifest.artifacts.filter((artifact) => artifact.group !== physicalDevicePreflightArtifactGroup);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      `Package is missing physical-device preflight artifact group ${physicalDevicePreflightArtifactGroup}.`
    );
  });

  it("rejects packages whose report detaches the physical-device gate hash from its artifact", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    const gate = packagedReport.gates.find((entry) => entry.label === "Verify physical device preflight");
    gate.evidence.sha256 = "0".repeat(64);
    writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
    manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package Physical-device preflight gate evidence SHA-256 does not match the preflight artifact record."
    );
  });

  it("rejects packages whose physical-device preflight artifactPath points at another source", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedPreflightPath = `${packageDir}/artifacts/${physicalDevicePreflightPath}`;
    const preflight = JSON.parse(readFileSync(packagedPreflightPath, "utf8"));
    preflight.artifactPath = ".artifacts/release-evidence-package-test/other-physical-device-preflight.json";
    writeFileSync(packagedPreflightPath, JSON.stringify(preflight, null, 2));
    refreshPackagedPhysicalDevicePreflightEvidence(packagedPreflightPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      `Package physical device preflight artifactPath must match packaged source path ${physicalDevicePreflightPath}, got .artifacts/release-evidence-package-test/other-physical-device-preflight.json.`
    );
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

  it("rejects packaged store submission metadata content even when package hashes are refreshed", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const sourceMetadataPath = ".artifacts/release-evidence-package-test/submission-metadata.json";
    const packagedMetadataPath = `${packageDir}/artifacts/${sourceMetadataPath}`;
    const packagedChecklistPath = `${packageDir}/artifacts/${storeSubmissionChecklistPath}`;
    const metadata = JSON.parse(readFileSync(packagedMetadataPath, "utf8"));
    metadata.appStore.privacyPolicyUrl = "http://example.com/privacy";
    metadata.screenshots = [];
    writeFileSync(packagedMetadataPath, JSON.stringify(metadata, null, 2));

    const checklist = JSON.parse(readFileSync(packagedChecklistPath, "utf8"));
    const metadataContent = readFileSync(packagedMetadataPath);
    checklist.metadata.bytes = metadataContent.byteLength;
    checklist.metadata.sha256 = createHash("sha256").update(metadataContent).digest("hex");
    writeFileSync(packagedChecklistPath, JSON.stringify(checklist, null, 2));

    refreshPackagedChecklistEvidence(packagedChecklistPath);
    refreshPackagedStoreSubmissionArtifactEvidence(sourceMetadataPath, packagedMetadataPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Store submission metadata appStore.privacyPolicyUrl must be an https URL.");
    expect(failures).toContain("Store submission checklist is missing a ios screenshot.");
    expect(failures).toContain("Store submission checklist is missing a android screenshot.");
    expect(failures).toContain("Store submission checklist screenshots do not match the metadata screenshots list.");
  });

  it("rejects empty packaged store submission review documents even when package hashes are refreshed", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const sourceReviewPath = ".artifacts/release-evidence-package-test/submission-review.md";
    const packagedReviewPath = `${packageDir}/artifacts/${sourceReviewPath}`;
    const packagedChecklistPath = `${packageDir}/artifacts/${storeSubmissionChecklistPath}`;
    writeFileSync(packagedReviewPath, "   \n");

    const checklist = JSON.parse(readFileSync(packagedChecklistPath, "utf8"));
    const reviewDocument = checklist.reviewDocuments.find((document) => document.path === sourceReviewPath);
    const reviewContent = readFileSync(packagedReviewPath);
    reviewDocument.bytes = reviewContent.byteLength;
    reviewDocument.sha256 = createHash("sha256").update(reviewContent).digest("hex");
    writeFileSync(packagedChecklistPath, JSON.stringify(checklist, null, 2));

    refreshPackagedChecklistEvidence(packagedChecklistPath);
    refreshPackagedStoreSubmissionArtifactEvidence(sourceReviewPath, packagedReviewPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package store submission review document is empty: .artifacts/release-evidence-package-test/submission-review.md."
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

  it("rejects packaged store submission screenshots with virtual-device identity labels", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedChecklistPath = `${packageDir}/artifacts/${storeSubmissionChecklistPath}`;
    const checklist = JSON.parse(readFileSync(packagedChecklistPath, "utf8"));
    const iosScreenshot = checklist.screenshots.find((screenshot) => screenshot.platform === "ios");
    const androidScreenshot = checklist.screenshots.find((screenshot) => screenshot.platform === "android");
    iosScreenshot.device = "iPhone 15 Simulator";
    iosScreenshot.osVersion = "iOS 18.5 Simulator";
    androidScreenshot.device = "sdk_gphone64_arm64";
    androidScreenshot.osVersion = "Android 15";
    writeFileSync(packagedChecklistPath, JSON.stringify(checklist, null, 2));
    refreshPackagedChecklistEvidence(packagedChecklistPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package store submission screenshot .artifacts/release-evidence-package-test/ios-store.png must use a physical device label, not Simulator/Emulator/browser/test-device evidence."
    );
    expect(failures).toContain(
      "Package store submission screenshot .artifacts/release-evidence-package-test/android-store.png must use a physical device label, not Simulator/Emulator/browser/test-device evidence."
    );
  });

  it("rejects packaged store submission screenshots with generic device labels", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedChecklistPath = `${packageDir}/artifacts/${storeSubmissionChecklistPath}`;
    const checklist = JSON.parse(readFileSync(packagedChecklistPath, "utf8"));
    const iosScreenshot = checklist.screenshots.find((screenshot) => screenshot.platform === "ios");
    const androidScreenshot = checklist.screenshots.find((screenshot) => screenshot.platform === "android");
    iosScreenshot.device = "iPhone";
    androidScreenshot.device = "Phone";
    writeFileSync(packagedChecklistPath, JSON.stringify(checklist, null, 2));
    refreshPackagedChecklistEvidence(packagedChecklistPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package store submission screenshot .artifacts/release-evidence-package-test/ios-store.png must include a specific physical ios device label and OS version."
    );
    expect(failures).toContain(
      "Package store submission screenshot .artifacts/release-evidence-package-test/android-store.png must include a specific physical android device label and OS version."
    );
  });

  it("rejects packaged store submission screenshot PNG content that does not match checklist dimensions", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const sourceScreenshotPath = ".artifacts/release-evidence-package-test/ios-store.png";
    const packagedScreenshotPath = `${packageDir}/artifacts/${sourceScreenshotPath}`;
    const packagedChecklistPath = `${packageDir}/artifacts/${storeSubmissionChecklistPath}`;
    writeFileSync(packagedScreenshotPath, pngBytes);

    const checklist = JSON.parse(readFileSync(packagedChecklistPath, "utf8"));
    const iosScreenshot = checklist.screenshots.find((screenshot) => screenshot.path === sourceScreenshotPath);
    const screenshotContent = readFileSync(packagedScreenshotPath);
    iosScreenshot.bytes = screenshotContent.byteLength;
    iosScreenshot.sha256 = createHash("sha256").update(screenshotContent).digest("hex");
    writeFileSync(packagedChecklistPath, JSON.stringify(checklist, null, 2));

    refreshPackagedChecklistEvidence(packagedChecklistPath);
    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    refreshPackageArtifactEntry(manifest, sourceScreenshotPath, packagedScreenshotPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package store submission screenshot dimensions mismatch for .artifacts/release-evidence-package-test/ios-store.png."
    );
    expect(failures).toContain(
      "Package store submission screenshot .artifacts/release-evidence-package-test/ios-store.png actual PNG dimensions must be at least 1080px on the short edge and 1920px on the long edge."
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

  it("rejects packaged dashboard status JSON with non-release platform state after metadata is refreshed", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const sourceStatusPath = ".artifacts/release-evidence-package-test/youtube-dashboard.json";
    const packagedStatusPath = `${packageDir}/artifacts/${sourceStatusPath}`;
    const statusJson = JSON.parse(readFileSync(packagedStatusPath, "utf8"));
    statusJson.broadcastStatus = "complete";
    writeFileSync(packagedStatusPath, JSON.stringify(statusJson, null, 2));

    const packagedDashboardManifestPath = `${packageDir}/artifacts/${dashboardEvidenceManifestPath}`;
    const dashboardManifest = JSON.parse(readFileSync(packagedDashboardManifestPath, "utf8"));
    const statusRecord = dashboardManifest.artifacts.find((artifact) => artifact.path === sourceStatusPath);
    statusRecord.bytes = readFileSync(packagedStatusPath).byteLength;
    statusRecord.sha256 = fileSha256(packagedStatusPath);
    statusRecord.statusSummary = "broadcast:complete:ytBroadcast9xYz stream:active:ytStream8aBc channel:UCMobileLiveCaster";
    writeFileSync(packagedDashboardManifestPath, JSON.stringify(dashboardManifest, null, 2));
    refreshPackagedDashboardEvidenceEntries({
      sourceDashboardArtifactPath: sourceStatusPath,
      packagedDashboardArtifactPath: packagedStatusPath,
      packagedDashboardManifestPath
    });

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package dashboard evidence status JSON .artifacts/release-evidence-package-test/youtube-dashboard.json has non-release YouTube broadcastStatus complete."
    );
  });

  it("rejects packaged dashboard screenshot dimensions that do not match the packaged PNG", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedDashboardManifestPath = `${packageDir}/artifacts/${dashboardEvidenceManifestPath}`;
    const dashboardManifest = JSON.parse(readFileSync(packagedDashboardManifestPath, "utf8"));
    const screenshotRecord = dashboardManifest.artifacts.find(
      (artifact) => artifact.platform === "youtube" && artifact.kind === "screenshot"
    );
    screenshotRecord.width = 1;
    screenshotRecord.height = 1;
    writeFileSync(packagedDashboardManifestPath, JSON.stringify(dashboardManifest, null, 2));
    refreshPackagedDashboardEvidenceEntries({ packagedDashboardManifestPath });

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package dashboard evidence screenshot dimensions mismatch for .artifacts/release-evidence-package-test/youtube-dashboard.png."
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

  it("rejects packaged distribution binaries whose ZIP content no longer satisfies release requirements", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const sourceAabPath = ".artifacts/release-evidence-package-test/app-release.aab";
    const packagedAabPath = `${packageDir}/artifacts/${sourceAabPath}`;
    const packagedDistributionManifestPath = `${packageDir}/artifacts/${distributionArtifactManifestPath}`;
    writeFileSync(
      packagedAabPath,
      zipArtifactBytes([
        { name: "BundleConfig.pb", data: Buffer.from("bundle config") },
        { name: "base/dex/classes.dex", size: minimumDistributionArtifactBytes }
      ])
    );

    const distributionManifest = JSON.parse(readFileSync(packagedDistributionManifestPath, "utf8"));
    const aabRecord = distributionManifest.artifacts.find((artifact) => artifact.path === sourceAabPath);
    const aabContent = readFileSync(packagedAabPath);
    aabRecord.bytes = aabContent.byteLength;
    aabRecord.sha256 = createHash("sha256").update(aabContent).digest("hex");
    aabRecord.zipEntryCount = 2;
    writeFileSync(packagedDistributionManifestPath, JSON.stringify(distributionManifest, null, 2));

    refreshPackagedDistributionEvidence(packagedDistributionManifestPath, sourceAabPath, packagedAabPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package distribution artifact .artifacts/release-evidence-package-test/app-release.aab is missing required android ZIP entry base/manifest/AndroidManifest.xml."
    );
    expect(failures).toContain(
      "Package distribution artifact required ZIP entries mismatch for .artifacts/release-evidence-package-test/app-release.aab."
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

  it("rejects packaged store release reports whose git dirty-state provenance is missing", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedStoreReleaseReportPath = `${packageDir}/artifacts/${storeReleaseReportPath}`;
    const storeReleaseReport = JSON.parse(readFileSync(packagedStoreReleaseReportPath, "utf8"));
    delete storeReleaseReport.git.dirty;
    writeFileSync(packagedStoreReleaseReportPath, JSON.stringify(storeReleaseReport, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    refreshPackageArtifactEntry(manifest, storeReleaseReportPath, packagedStoreReleaseReportPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Package store release report git dirty state is missing.");
  });

  it("rejects packaged store release reports from a different commit", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedStoreReleaseReportPath = `${packageDir}/artifacts/${storeReleaseReportPath}`;
    const storeReleaseReport = JSON.parse(readFileSync(packagedStoreReleaseReportPath, "utf8"));
    storeReleaseReport.git.commit = "0".repeat(40);
    storeReleaseReport.git.dirty = false;
    storeReleaseReport.git.statusShort = "";
    writeFileSync(packagedStoreReleaseReportPath, JSON.stringify(storeReleaseReport, null, 2));
    refreshPackagedStoreReleaseReportEvidence(packagedStoreReleaseReportPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      `Package store release report commit ${"0".repeat(40)} does not match current commit ${currentCommit()}.`
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
    report.artifacts.files[0].path = `${webArtifactRoot}/../../outside-release-artifact.txt`;
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    expect(() =>
      createReleaseEvidencePackage({
        reportPath,
        outputDir: `${fixtureRoot}/unsafe-package`,
        allowDirty: true
      })
    ).toThrow("Release report contains unsafe package source paths:");
  });

  it("rejects non-canonical artifact paths before package creation normalizes sources", () => {
    writeReportFixture();
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    report.artifacts.files[0].path = `${webArtifactRoot}/../web/index.html`;
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    expect(() =>
      createReleaseEvidencePackage({
        reportPath,
        outputDir: `${fixtureRoot}/non-canonical-package`,
        allowDirty: true
      })
    ).toThrow("Release report contains unsafe package source paths:");
  });

  it("rejects packaged commercial manifests with traversal artifact paths", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedDistributionManifestPath = `${packageDir}/artifacts/${distributionArtifactManifestPath}`;
    const distributionTraversalPath = `${fixtureRoot}/nested/../../../../app-release.aab`;
    const distributionManifest = JSON.parse(readFileSync(packagedDistributionManifestPath, "utf8"));
    distributionManifest.artifacts[0].path = distributionTraversalPath;
    writeFileSync(packagedDistributionManifestPath, JSON.stringify(distributionManifest, null, 2));

    const packagedDashboardManifestPath = `${packageDir}/artifacts/${dashboardEvidenceManifestPath}`;
    const dashboardTraversalPath = `${fixtureRoot}/nested/../../../../youtube-dashboard.png`;
    const dashboardManifest = JSON.parse(readFileSync(packagedDashboardManifestPath, "utf8"));
    dashboardManifest.artifacts[0].path = dashboardTraversalPath;
    writeFileSync(packagedDashboardManifestPath, JSON.stringify(dashboardManifest, null, 2));

    const packagedChecklistPath = `${packageDir}/artifacts/${storeSubmissionChecklistPath}`;
    const checklistTraversalPath = `${fixtureRoot}/nested/../../../../submission-metadata.json`;
    const checklist = JSON.parse(readFileSync(packagedChecklistPath, "utf8"));
    checklist.metadata.path = checklistTraversalPath;
    writeFileSync(packagedChecklistPath, JSON.stringify(checklist, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    refreshPackageArtifactEntry(manifest, distributionArtifactManifestPath, packagedDistributionManifestPath);
    refreshPackageArtifactEntry(manifest, dashboardEvidenceManifestPath, packagedDashboardManifestPath);
    refreshPackageArtifactEntry(manifest, storeSubmissionChecklistPath, packagedChecklistPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(`Package distribution manifest artifact path must be workspace-relative: ${distributionTraversalPath}.`);
    expect(failures).toContain(`Package dashboard evidence manifest artifact path must be workspace-relative: ${dashboardTraversalPath}.`);
    expect(failures).toContain(`Package store submission checklist artifact path must be workspace-relative: ${checklistTraversalPath}.`);
  });

  it("rejects source drift when source verification is requested", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    writeFileSync(webScriptPath, "console.log('source drift');");
    const failures = validateReleaseEvidencePackage({ packageDir, verifySources: true });

    expect(failures).toContain(`Package source metadata mismatch for ${webScriptPath}.`);
  });

  it("rejects unsafe package source paths before source verification reads them", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const absoluteArtifactPath = resolve(webScriptPath);
    const absoluteUiEvidencePath = resolve(manifest.uiEvidence.sourcePath);
    manifest.sourceReport.sourcePath = `./${reportPath}`;
    manifest.uiEvidence.sourcePath = absoluteUiEvidencePath;
    manifest.artifacts.find((artifact) => artifact.sourcePath === webScriptPath).sourcePath = absoluteArtifactPath;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir, verifySources: true });

    expect(failures).toContain(`Package releaseReport source path must be canonical absolute or workspace-relative: ./${reportPath}.`);
    expect(failures).toContain(`Package uiEvidence source path must be workspace-relative: ${absoluteUiEvidencePath}.`);
    expect(failures).toContain(`Package artifact source path must be workspace-relative: ${absoluteArtifactPath}.`);
  });

  it("rejects unsupported source entry roles during source verification", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.sourceReport.role = "debugSource";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir, verifySources: true });

    expect(failures).toContain("Package source entry role is unsupported for source verification: debugSource.");
  });

  it("rejects package source paths that point to directories", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts.find((artifact) => artifact.sourcePath === webScriptPath).sourcePath = webArtifactRoot;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir, verifySources: true });

    expect(failures).toContain(`Package source must point to a file: ${webArtifactRoot}.`);
  });

  it("rejects symlinked package source paths before reading linked targets", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const outsideSecretPath = `${fixtureRoot}/outside-source-secret.txt`;
    const symlinkSourcePath = `${fixtureRoot}/source-link.txt`;
    writeFileSync(outsideSecretPath, "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456");
    symlinkSync(resolve(outsideSecretPath), symlinkSourcePath);
    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts.find((artifact) => artifact.sourcePath === webScriptPath).sourcePath = symlinkSourcePath;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir, verifySources: true });

    expect(failures).toContain(`Package source must not be a symbolic link: ${symlinkSourcePath}.`);
    expect(failures.join("\n")).not.toContain("Authorization");
  });

  it("rejects symlinked artifact sources before package creation copies linked targets", () => {
    writeReportFixture();
    const outsideArtifact = `${fixtureRoot}/outside-artifact-secret.html`;
    const originalScript = readFileSync(webScriptPath);
    writeFile(outsideArtifact, "<!doctype html><title>Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456</title>");
    rmSync(webScriptPath, { force: true });
    symlinkSync(resolve(outsideArtifact), webScriptPath);

    try {
      expect(() =>
        createReleaseEvidencePackage({
          reportPath,
          outputDir: `${fixtureRoot}/artifact-link-package`,
          allowDirty: true
        })
      ).toThrow(`Release report is not packageable:\n- Artifact must not be a symbolic link: ${webScriptPath}.`);
    } finally {
      rmSync(webScriptPath, { force: true });
      writeFile(webScriptPath, originalScript);
    }
  });

  it("rejects packaged browser UI evidence with an invalid schema even when metadata hashes match", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedUiEvidencePath = `${packageDir}/ui-evidence/ui-evidence.json`;
    const packagedUiEvidence = JSON.parse(readFileSync(packagedUiEvidencePath, "utf8"));
    packagedUiEvidence.type = "ui-verification";
    writeFileSync(packagedUiEvidencePath, JSON.stringify(packagedUiEvidence, null, 2));
    refreshPackagedUiEvidence(packagedUiEvidencePath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      "Package browser UI evidence is not a MobileLiveCaster browser-ui-verification reportVersion 1 file."
    );
  });

  it("rejects packaged browser UI evidence missing required text checks", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedUiEvidencePath = `${packageDir}/ui-evidence/ui-evidence.json`;
    const packagedUiEvidence = JSON.parse(readFileSync(packagedUiEvidencePath, "utf8"));
    const mobile = packagedUiEvidence.viewports.find((viewport) => viewport.name === "mobile");
    mobile.requiredTextChecks = mobile.requiredTextChecks.filter((check) => check.text !== "Go Live");
    writeFileSync(packagedUiEvidencePath, JSON.stringify(packagedUiEvidence, null, 2));
    refreshPackagedUiEvidence(packagedUiEvidencePath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain('Package browser UI evidence for mobile is missing text "Go Live".');
  });

  it("rejects packaged browser UI evidence missing Quick Text interaction proof", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedUiEvidencePath = `${packageDir}/ui-evidence/ui-evidence.json`;
    const packagedUiEvidence = JSON.parse(readFileSync(packagedUiEvidencePath, "utf8"));
    const mobile = packagedUiEvidence.viewports.find((viewport) => viewport.name === "mobile");
    delete mobile.quickTextInteraction.previewText;
    writeFileSync(packagedUiEvidencePath, JSON.stringify(packagedUiEvidence, null, 2));
    refreshPackagedUiEvidence(packagedUiEvidencePath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Package browser UI evidence for mobile is missing Quick Text interaction proof.");
  });

  it("rejects packaged browser UI evidence with stale Quick Text status preview proof", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedUiEvidencePath = `${packageDir}/ui-evidence/ui-evidence.json`;
    const packagedUiEvidence = JSON.parse(readFileSync(packagedUiEvidencePath, "utf8"));
    const mobile = packagedUiEvidence.viewports.find((viewport) => viewport.name === "mobile");
    mobile.quickTextInteraction.previewText = "MobileLiveCaster";
    writeFileSync(packagedUiEvidencePath, JSON.stringify(packagedUiEvidence, null, 2));
    refreshPackagedUiEvidence(packagedUiEvidencePath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Package browser UI evidence for mobile has invalid Quick Text interaction proof.");
  });

  it("rejects packaged browser UI evidence whose git dirty-state provenance is missing", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedUiEvidencePath = `${packageDir}/ui-evidence/ui-evidence.json`;
    const packagedUiEvidence = JSON.parse(readFileSync(packagedUiEvidencePath, "utf8"));
    delete packagedUiEvidence.git.dirty;
    writeFileSync(packagedUiEvidencePath, JSON.stringify(packagedUiEvidence, null, 2));
    refreshPackagedUiEvidence(packagedUiEvidencePath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Package browser UI evidence git dirty state is missing.");
  });

  it("rejects packaged browser UI evidence from a different commit", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedUiEvidencePath = `${packageDir}/ui-evidence/ui-evidence.json`;
    const packagedUiEvidence = JSON.parse(readFileSync(packagedUiEvidencePath, "utf8"));
    packagedUiEvidence.git.commit = "0".repeat(40);
    packagedUiEvidence.git.dirty = false;
    packagedUiEvidence.git.statusShort = "";
    writeFileSync(packagedUiEvidencePath, JSON.stringify(packagedUiEvidence, null, 2));
    refreshPackagedUiEvidence(packagedUiEvidencePath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain(
      `Package browser UI evidence commit ${"0".repeat(40)} does not match current commit ${currentCommit()}.`
    );
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

  it("rejects unredacted contact text and protocol-less links even when package metadata hashes match", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedUiEvidencePath = `${packageDir}/ui-evidence/ui-evidence.json`;
    const packagedUiEvidence = JSON.parse(readFileSync(packagedUiEvidencePath, "utf8"));
    packagedUiEvidence.debug =
      "email viewer@example.com phone 090-1234-5678 invite discord.gg/privateRoom link www.example.org/private example.tv/show";
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
    expect(failures.join("\n")).toContain("ui-evidence/ui-evidence.json contains an email address");
    expect(failures.join("\n")).toContain("ui-evidence/ui-evidence.json contains a phone number");
    expect(failures.join("\n")).toContain("ui-evidence/ui-evidence.json contains an invite link");
  });

  it("rejects unredacted protocol-less links even when package metadata hashes match", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedUiEvidencePath = `${packageDir}/ui-evidence/ui-evidence.json`;
    const packagedUiEvidence = JSON.parse(readFileSync(packagedUiEvidencePath, "utf8"));
    packagedUiEvidence.debug = "private links www.example.org/private example.tv/show";
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
    expect(failures.join("\n")).toContain("ui-evidence/ui-evidence.json contains a protocol-less link");
  });

  it("does not apply contact/link heuristics to generated React Native bundles", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const sourcePath = ".artifacts/rn/index.android.bundle";
    const packagedBundlePath = `${packageDir}/artifacts/${sourcePath}`;
    writeFileSync(
      packagedBundlePath,
      [
        "console.log('redaction fixture email viewer@example.com');",
        "console.log('phone 090-1234-5678 invite discord.gg/privateRoom');",
        "console.log('links www.example.org/private example.tv/show');"
      ].join("\n")
    );
    refreshPackagedArtifactEvidence(sourcePath, packagedBundlePath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures.join("\n")).not.toContain("index.android.bundle contains an email address");
    expect(failures.join("\n")).not.toContain("index.android.bundle contains a phone number");
    expect(failures.join("\n")).not.toContain("index.android.bundle contains an invite link");
    expect(failures.join("\n")).not.toContain("index.android.bundle contains a protocol-less link");
  });

  it("still scans generated React Native bundles for credentials and RTMP keys", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const sourcePath = ".artifacts/rn/index.android.bundle";
    const packagedBundlePath = `${packageDir}/artifacts/${sourcePath}`;
    writeFileSync(
      packagedBundlePath,
      [
        "const auth = 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456';",
        "const publishUrl = 'rtmps://a.rtmps.youtube.com/live2/abcd-efgh-ijkl-mnop-qrst';"
      ].join("\n")
    );
    refreshPackagedArtifactEvidence(sourcePath, packagedBundlePath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures.join("\n")).toContain("artifacts/.artifacts/rn/index.android.bundle contains a bearer/OAuth token");
    expect(failures.join("\n")).toContain("artifacts/.artifacts/rn/index.android.bundle contains a stream key in an RTMP URL");
  });

  it("still scans iOS native verification metadata for credentials", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedVerificationPath = `${packageDir}/artifacts/${iosNativeVerificationArtifactPath}`;
    const verification = JSON.parse(readFileSync(packagedVerificationPath, "utf8"));
    verification.debug = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456";
    writeFileSync(packagedVerificationPath, JSON.stringify(verification, null, 2));
    refreshPackagedArtifactEvidence(iosNativeVerificationArtifactPath, packagedVerificationPath);

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures.join("\n")).toContain(
      "artifacts/.artifacts/ios-native-verification.json contains a bearer/OAuth token"
    );
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
  writeFile(webIndexPath, "<!doctype html><title>MobileLiveCaster</title>");
  writeFile(webScriptPath, "console.log('release-evidence-package-test');");
  writeFile(webStylePath, "body { color: #111; }");
  writeFile(".artifacts/rn/main.ios.jsbundle", "ios bundle");
  writeFile(".artifacts/rn/index.android.bundle", "android bundle");
  writeGitleaksHistoryScanFixture();
  writeSourceSecretScanFixture();
  writeNativeBuildFixture(fixtureRoot);
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
  writePhysicalDevicePreflightFixture();
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
        baselineSha256: fileSha256(gitleaksHistoryBaselinePath),
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
        git: {
          commit: currentCommit(),
          dirty: false,
          statusShort: ""
        },
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

function commercialSupportBundleFixture() {
  return {
    app: {
      name: "MobileLiveCaster",
      reportVersion: 1,
      bundleVersion: 55
    },
    generatedAt: capturedAt,
    fixture: true,
    profile: {
      androidPublisherMode: "mediacodec"
    },
    scene: {
      fingerprint: "scene1-ready"
    },
    summary: {
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

function writeReportFixture({ skipUi = true, uiEvidencePath = ".artifacts/release-evidence-package-test/ui-evidence.json" } = {}) {
  writeFixtureFiles();
  writeUiEvidenceFile({ path: uiEvidencePath });
  const nowMs = Date.now();
  const reportStartedAt = new Date(nowMs - 1_000).toISOString();
  const scanGeneratedAt = new Date(nowMs - 500).toISOString();
  const reportFinishedAt = new Date(nowMs).toISOString();
  writeSourceSecretScanFixture({ generatedAt: scanGeneratedAt });
  writeGitleaksHistoryScanFixture({ generatedAt: scanGeneratedAt });
  const artifactFiles = [
    ...releaseConfigArtifactPaths.map((path) => artifactRecord("release-config", path)),
    artifactRecord("web", webIndexPath),
    artifactRecord("web", webScriptPath),
    artifactRecord("web", webStylePath),
    artifactRecord("react-native", ".artifacts/rn/main.ios.jsbundle"),
    artifactRecord("react-native", ".artifacts/rn/index.android.bundle"),
    artifactRecord(sourceSecretScanArtifactGroup, gitleaksHistoryScanArtifactPath),
    artifactRecord(sourceSecretScanArtifactGroup, sourceSecretScanArtifactPath),
    ...nativeBuildArtifactRecords(fixtureRoot, artifactRecord),
    artifactRecord("ui", ".artifacts/mobile-live-caster-desktop.png"),
    artifactRecord("ui", ".artifacts/mobile-live-caster-mobile.png"),
    ...(!skipUi ? [artifactRecord("ui", uiEvidencePath)] : []),
    ...distributionArtifactRecords(),
    ...storeReleaseRecords(),
    ...dashboardEvidenceRecords(),
    ...storeSubmissionRecords(),
    ...physicalDevicePreflightRecords()
  ];

  writeFile(
    reportPath,
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "release-candidate-verification",
        status: "passed",
        startedAt: reportStartedAt,
        finishedAt: reportFinishedAt,
        git: {
          commit: currentCommit(),
          branch: "main",
          dirty: false,
          statusShort: ""
        },
        options: {
          skipUi,
          physicalDevicePreflightJson: physicalDevicePreflightPath
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
            startedAt: reportStartedAt,
            finishedAt: reportFinishedAt,
            durationMs: 1,
            exitCode: 0,
            error: null
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
                  target: "http://127.0.0.1:5173/",
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
          },
          physicalDevicePreflightGateRecord()
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
          dirty: false,
          statusShort: ""
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
          dirty: false,
          statusShort: ""
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
          dirty: false,
          statusShort: ""
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

function writePhysicalDevicePreflightFixture(patch = {}) {
  const report = createPhysicalDevicePreflightReport(createPhysicalDevicePreflightFixtureInput());
  writePhysicalDevicePreflightReport(
    {
      ...report,
      git: {
        commit: currentCommit(),
        branch: "main",
        dirty: false,
        statusShort: ""
      },
      ...patch
    },
    physicalDevicePreflightPath
  );
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
  return distributionManifestSummaryFromManifest(path, manifest, content);
}

function distributionManifestSummaryFromManifest(path, manifest, content) {
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

function refreshPackageArtifactEntry(manifest, sourcePath, packagedPath) {
  const entry = manifest.artifacts.find((artifact) => artifact.sourcePath === sourcePath);
  const content = readFileSync(packagedPath);
  entry.bytes = content.byteLength;
  entry.sha256 = createHash("sha256").update(content).digest("hex");
}

function refreshPackagedArtifactEvidence(sourcePath, packagedPath) {
  const packagedReportPath = `${packageDir}/release-candidate-report.json`;
  const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
  const content = readFileSync(packagedPath);
  const sha256 = createHash("sha256").update(content).digest("hex");
  const reportArtifact = packagedReport.artifacts.files.find((artifact) => artifact.path === sourcePath);
  reportArtifact.bytes = content.byteLength;
  reportArtifact.sha256 = sha256;
  writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

  const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
  manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
  refreshPackageArtifactEntry(manifest, sourcePath, packagedPath);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function packagedSourceSecretScanPath() {
  const manifest = JSON.parse(readFileSync(`${packageDir}/${releaseEvidencePackageManifestName}`, "utf8"));
  const artifact = manifest.artifacts.find(
    (candidate) => candidate.group === sourceSecretScanArtifactGroup && candidate.sourcePath === sourceSecretScanArtifactPath
  );
  return `${packageDir}/${artifact.packagedPath}`;
}

function packagedGitleaksHistoryScanPath() {
  const manifest = JSON.parse(readFileSync(`${packageDir}/${releaseEvidencePackageManifestName}`, "utf8"));
  const artifact = manifest.artifacts.find(
    (candidate) => candidate.group === sourceSecretScanArtifactGroup && candidate.sourcePath === gitleaksHistoryScanArtifactPath
  );
  return `${packageDir}/${artifact.packagedPath}`;
}

function packagedGitleaksBaselinePath() {
  const manifest = JSON.parse(readFileSync(`${packageDir}/${releaseEvidencePackageManifestName}`, "utf8"));
  const artifact = manifest.artifacts.find(
    (candidate) => candidate.group === "release-config" && candidate.sourcePath === gitleaksHistoryBaselinePath
  );
  return `${packageDir}/${artifact.packagedPath}`;
}

function refreshPackagedUiEvidence(packagedUiEvidencePath) {
  const packagedReportPath = `${packageDir}/release-candidate-report.json`;
  const evidenceContent = readFileSync(packagedUiEvidencePath);
  const evidenceSha256 = createHash("sha256").update(evidenceContent).digest("hex");

  const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
  const evidenceGate = packagedReport.gates.find((gate) => gate.label === "Verify browser UI evidence");
  if (evidenceGate?.evidence) {
    evidenceGate.evidence.sha256 = evidenceSha256;
  }
  writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));
  refreshPackagedSourceReportEvidence();

  const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.uiEvidence.bytes = evidenceContent.byteLength;
  manifest.uiEvidence.sha256 = evidenceSha256;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function refreshPackagedStoreReleaseReportEvidence(packagedStoreReleaseReportPath) {
  const packagedReportPath = `${packageDir}/release-candidate-report.json`;
  const storeReportContent = readFileSync(packagedStoreReleaseReportPath);
  const storeReportSha256 = createHash("sha256").update(storeReportContent).digest("hex");

  const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
  const reportArtifact = packagedReport.artifacts.files.find(
    (artifact) => artifact.group === storeReleaseReportArtifactGroup && artifact.path === storeReleaseReportPath
  );
  reportArtifact.bytes = storeReportContent.byteLength;
  reportArtifact.sha256 = storeReportSha256;
  const storeReleaseGate = packagedReport.gates.find((gate) => gate.label === "Verify store release orchestration report");
  storeReleaseGate.evidence.sha256 = storeReportSha256;
  writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

  const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
  manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
  refreshPackageArtifactEntry(manifest, storeReleaseReportPath, packagedStoreReleaseReportPath);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function refreshPackagedPhysicalDevicePreflightEvidence(packagedPreflightPath) {
  const packagedReportPath = `${packageDir}/release-candidate-report.json`;
  const preflightContent = readFileSync(packagedPreflightPath);
  const preflightSha256 = createHash("sha256").update(preflightContent).digest("hex");

  const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
  const reportArtifact = packagedReport.artifacts.files.find(
    (artifact) => artifact.group === physicalDevicePreflightArtifactGroup && artifact.path === physicalDevicePreflightPath
  );
  reportArtifact.bytes = preflightContent.byteLength;
  reportArtifact.sha256 = preflightSha256;
  const gate = packagedReport.gates.find((entry) => entry.label === "Verify physical device preflight");
  gate.evidence.sha256 = preflightSha256;
  writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

  const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
  manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
  refreshPackageArtifactEntry(manifest, physicalDevicePreflightPath, packagedPreflightPath);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
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

function refreshPackagedDistributionEvidence(packagedDistributionManifestPath, sourceArtifactPath, packagedArtifactPath) {
  const packagedReportPath = `${packageDir}/release-candidate-report.json`;
  const packagedStoreReleaseReportPath = `${packageDir}/artifacts/${storeReleaseReportPath}`;
  const distributionManifestContent = readFileSync(packagedDistributionManifestPath);
  const distributionManifestSha256 = createHash("sha256").update(distributionManifestContent).digest("hex");
  const artifactContent = readFileSync(packagedArtifactPath);
  const artifactSha256 = createHash("sha256").update(artifactContent).digest("hex");
  const distributionManifest = JSON.parse(distributionManifestContent.toString("utf8"));
  const manifestArtifact = distributionManifest.artifacts.find((artifact) => artifact.path === sourceArtifactPath);

  const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
  const reportDistributionManifest = packagedReport.artifacts.files.find(
    (artifact) => artifact.group === distributionArtifactGroup && artifact.path === distributionArtifactManifestPath
  );
  reportDistributionManifest.bytes = distributionManifestContent.byteLength;
  reportDistributionManifest.sha256 = distributionManifestSha256;
  const reportDistributionArtifact = packagedReport.artifacts.files.find(
    (artifact) => artifact.group === distributionArtifactGroup && artifact.path === sourceArtifactPath
  );
  reportDistributionArtifact.bytes = artifactContent.byteLength;
  reportDistributionArtifact.sha256 = artifactSha256;
  writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

  const storeReleaseReport = JSON.parse(readFileSync(packagedStoreReleaseReportPath, "utf8"));
  storeReleaseReport.artifacts.distributionManifest = distributionManifestSummaryFromManifest(
    distributionArtifactManifestPath,
    distributionManifest,
    distributionManifestContent
  );
  const storeSummaryArtifact = storeReleaseReport.artifacts.distributionManifest.artifacts.find(
    (artifact) => artifact.path === sourceArtifactPath
  );
  storeSummaryArtifact.bytes = manifestArtifact.bytes;
  storeSummaryArtifact.sha256 = manifestArtifact.sha256;
  writeFileSync(packagedStoreReleaseReportPath, JSON.stringify(storeReleaseReport, null, 2));

  const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
  manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
  refreshPackageArtifactEntry(manifest, distributionArtifactManifestPath, packagedDistributionManifestPath);
  refreshPackageArtifactEntry(manifest, sourceArtifactPath, packagedArtifactPath);
  refreshPackageArtifactEntry(manifest, storeReleaseReportPath, packagedStoreReleaseReportPath);
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

function refreshPackagedStoreSubmissionArtifactEvidence(sourcePath, packagedPath) {
  const packagedReportPath = `${packageDir}/release-candidate-report.json`;
  const content = readFileSync(packagedPath);
  const sha256 = createHash("sha256").update(content).digest("hex");
  const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
  const reportArtifact = packagedReport.artifacts.files.find(
    (artifact) => artifact.group === storeSubmissionArtifactGroup && artifact.path === sourcePath
  );
  reportArtifact.bytes = content.byteLength;
  reportArtifact.sha256 = sha256;
  writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

  const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
  manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
  refreshPackageArtifactEntry(manifest, sourcePath, packagedPath);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function refreshPackagedDashboardEvidenceEntries({
  sourceDashboardArtifactPath = "",
  packagedDashboardArtifactPath = "",
  packagedDashboardManifestPath
}) {
  const packagedReportPath = `${packageDir}/release-candidate-report.json`;
  const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
  if (sourceDashboardArtifactPath && packagedDashboardArtifactPath) {
    const dashboardArtifactContent = readFileSync(packagedDashboardArtifactPath);
    const reportArtifact = packagedReport.artifacts.files.find(
      (artifact) => artifact.group === dashboardEvidenceArtifactGroup && artifact.path === sourceDashboardArtifactPath
    );
    reportArtifact.bytes = dashboardArtifactContent.byteLength;
    reportArtifact.sha256 = createHash("sha256").update(dashboardArtifactContent).digest("hex");
  }

  const dashboardManifestContent = readFileSync(packagedDashboardManifestPath);
  const reportManifestArtifact = packagedReport.artifacts.files.find(
    (artifact) => artifact.group === dashboardEvidenceArtifactGroup && artifact.path === dashboardEvidenceManifestPath
  );
  reportManifestArtifact.bytes = dashboardManifestContent.byteLength;
  reportManifestArtifact.sha256 = createHash("sha256").update(dashboardManifestContent).digest("hex");
  writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

  const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
  manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
  if (sourceDashboardArtifactPath && packagedDashboardArtifactPath) {
    refreshPackageArtifactEntry(manifest, sourceDashboardArtifactPath, packagedDashboardArtifactPath);
  }
  refreshPackageArtifactEntry(manifest, dashboardEvidenceManifestPath, packagedDashboardManifestPath);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function writeUiEvidenceFile({ path = ".artifacts/release-evidence-package-test/ui-evidence.json" } = {}) {
  writeFile(
    path,
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
          dirty: false,
          statusShort: ""
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
    requiredTextChecks: requiredBrowserUiTextChecks.map((text) => ({ text, count: 1 })),
    quickTextInteraction: quickTextInteraction(name),
    screenshot: {
      path: screenshotPath,
      bytes: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex")
    }
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
