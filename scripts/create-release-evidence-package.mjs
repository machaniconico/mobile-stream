import { createHash } from "node:crypto";
import { existsSync, copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { argv, cwd, exit } from "node:process";
import { pathToFileURL } from "node:url";
import { distributionArtifactGroup, distributionArtifactManifestPath } from "./verify-distribution-artifacts.mjs";
import {
  dashboardEvidenceArtifactGroup,
  dashboardEvidenceManifestPath,
  dashboardScreenshotStatusMaxSkewMinutes
} from "./verify-platform-dashboard-evidence.mjs";
import { validateReport } from "./verify-release-report.mjs";
import { storeReleaseReportArtifactGroup, storeReleaseReportType } from "./release-store-build.mjs";
import { storeSubmissionArtifactGroup, storeSubmissionChecklistPath } from "./verify-store-submission-checklist.mjs";
import { createCommercialReleaseGate } from "./verify-commercial-release-bundle.mjs";
import { isLoopbackHttpUrl } from "./release-url-policy.mjs";
import { readPngEvidence } from "./png-evidence.mjs";
import { validateManifestGitProvenance } from "./release-git-provenance.mjs";

export const releaseEvidencePackageManifestName = "release-evidence-package.json";
export const releaseEvidencePackageType = "release-evidence-package-manifest";
const storeReleaseReportGateLabel = "Verify store release orchestration report";
const finalStoreScreenshotMinimumShortEdge = 1080;
const finalStoreScreenshotMinimumLongEdge = 1920;
const virtualStoreDevicePattern =
  /(?:simulator|emulator|android\s*sdk|sdk[_\s-]*gphone|sdk[_\s-]*phone|aosp|generic|xcode|preview|browser|chrome|mock|test\s*device|unknown)/i;
const dashboardScreenshotMinimumShortEdge = 720;
const dashboardScreenshotMinimumLongEdge = 1280;
const requiredUiViewportNames = ["desktop", "mobile"];
const requiredUiTextChecks = ["MobileLiveCaster", "Sources", "Go Live", "Live Setup", "PNGTuber", "RTMPS", "Face input", "Head range"];
const badDashboardIdentityMarkers = new Set(["-", "mock", "n/a", "na", "none", "null", "placeholder", "test", "unknown"]);
const badYoutubeBroadcastStatuses = new Set(["complete", "failed", "revoked"]);
const badYoutubeStreamStatuses = new Set(["inactive", "error"]);
const requiredCommercialPackageArtifacts = [
  { group: distributionArtifactGroup, path: distributionArtifactManifestPath, label: "distribution artifact manifest" },
  { group: dashboardEvidenceArtifactGroup, path: dashboardEvidenceManifestPath, label: "dashboard evidence manifest" },
  { group: storeSubmissionArtifactGroup, path: storeSubmissionChecklistPath, label: "store submission checklist" }
];

export function createReleaseEvidencePackage({
  reportPath,
  outputDir,
  maxAgeHours = 24,
  allowDirty = false,
  allowCommitMismatch = false
} = {}) {
  if (!reportPath) {
    throw new Error("Missing release-candidate report path.");
  }

  const report = readJsonFile(reportPath, "release-candidate report");
  const pathFailures = validateReportSourcePathsForPackaging(report);
  if (pathFailures.length > 0) {
    throw new Error(["Release report contains unsafe package source paths:", ...pathFailures.map((failure) => `- ${failure}`)].join("\n"));
  }

  const failures = validateReport(report, { maxAgeHours, allowDirty, allowCommitMismatch });
  if (failures.length > 0) {
    throw new Error(["Release report is not packageable:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  }
  const packageableFailures = validateCommercialPackageableReleaseReport(report);
  if (packageableFailures.length > 0) {
    throw new Error(["Release report cannot be used for a commercial evidence package:", ...packageableFailures.map((failure) => `- ${failure}`)].join("\n"));
  }

  const packageDir = outputDir || defaultPackageDir(report);
  ensureNewOrEmptyDirectory(packageDir);

  const sourceReportEntry = copyEvidenceFile({
    role: "releaseReport",
    sourcePath: reportPath,
    packagedPath: "release-candidate-report.json",
    packageDir
  });

  const supportBundleSourcePath = report.supportBundle?.absolutePath || report.supportBundle?.path;
  if (!supportBundleSourcePath) {
    throw new Error("Release report is missing support bundle path.");
  }
  const supportBundleEntry = copyEvidenceFile({
    role: "supportBundle",
    sourcePath: supportBundleSourcePath,
    packagedPath: `support-bundle/${safeBasename(supportBundleSourcePath)}`,
    packageDir,
    expectedSha256: report.supportBundle.sha256
  });

  const uiEvidenceSource = uiEvidenceSourceFromReport(report);
  const uiEvidenceEntry = uiEvidenceSource?.path
    ? copyEvidenceFile({
        role: "uiEvidence",
        sourcePath: uiEvidenceSource.path,
        packagedPath: `ui-evidence/${safeBasename(uiEvidenceSource.path)}`,
        packageDir,
        expectedSha256: uiEvidenceSource.sha256
      })
    : null;

  const artifactEntries = [];
  const seenArtifacts = new Set();
  for (const artifact of report.artifacts?.files || []) {
    if (!artifact?.group || !artifact?.path) {
      throw new Error("Release report contains an artifact without group or path.");
    }
    const artifactPath = workspaceRecordPath(artifact.path);
    if (!artifactPath) {
      throw new Error(`Release artifact path must be workspace-relative: ${artifact.path}.`);
    }
    const duplicateKey = `${artifact.group}:${artifactPath}`;
    if (seenArtifacts.has(duplicateKey)) {
      throw new Error(`Release report contains duplicate artifact ${duplicateKey}.`);
    }
    seenArtifacts.add(duplicateKey);
    artifactEntries.push(
      copyEvidenceFile({
        role: "artifact",
        group: artifact.group,
        sourcePath: artifactPath,
        packagedPath: `artifacts/${artifactPath}`,
        packageDir,
        expectedBytes: artifact.bytes,
        expectedSha256: artifact.sha256
      })
    );
  }

  const manifest = {
    reportVersion: 1,
    app: "MobileLiveCaster",
    type: releaseEvidencePackageType,
    generatedAt: new Date().toISOString(),
    packageDir: workspaceRelativePath(packageDir) || resolve(packageDir),
    git: {
      commit: report.git?.commit || null,
      branch: report.git?.branch || null,
      dirty: Boolean(report.git?.dirty),
      statusShort: report.git?.statusShort || ""
    },
    sourceReport: sourceReportEntry,
    supportBundle: supportBundleEntry,
    ...(uiEvidenceEntry ? { uiEvidence: uiEvidenceEntry } : {}),
    artifacts: artifactEntries,
    privacyScan: {
      status: "passed",
      scannedTextEntries: countTextEvidenceEntries([sourceReportEntry, supportBundleEntry, uiEvidenceEntry, ...artifactEntries].filter(Boolean))
    }
  };

  const manifestPath = join(resolve(packageDir), releaseEvidencePackageManifestName);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const packageFailures = validateReleaseEvidencePackage({ packageDir, maxAgeHours });
  if (packageFailures.length > 0) {
    throw new Error(["Created release evidence package failed verification:", ...packageFailures.map((failure) => `- ${failure}`)].join("\n"));
  }

  return { manifest, packageDir: resolve(packageDir), manifestPath };
}

export function validateReleaseEvidencePackage({ packageDir, verifySources = false, maxAgeHours = 24 } = {}) {
  const failures = [];
  const resolvedPackageDir = resolve(packageDir || "");
  const manifestPath = join(resolvedPackageDir, releaseEvidencePackageManifestName);

  if (!packageDir) {
    return ["Missing release evidence package directory."];
  }
  const packageDirStat = lstatExisting(resolvedPackageDir);
  if (!packageDirStat) {
    return [`Release evidence package directory does not exist: ${packageDir}.`];
  }
  if (packageDirStat.isSymbolicLink()) {
    return [`Release evidence package directory must not be a symbolic link: ${packageDir}.`];
  }
  if (!packageDirStat.isDirectory()) {
    return [`Release evidence package path must point to a directory: ${packageDir}.`];
  }
  if (!existsSync(manifestPath)) {
    return [`Release evidence package manifest does not exist: ${manifestPath}.`];
  }

  let manifest;
  try {
    manifest = readJsonFile(manifestPath, "release evidence package manifest");
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  if (
    manifest?.app !== "MobileLiveCaster" ||
    manifest?.type !== releaseEvidencePackageType ||
    manifest?.reportVersion !== 1
  ) {
    failures.push("Package manifest is not a MobileLiveCaster release-evidence-package-manifest reportVersion 1 file.");
    return failures;
  }
  validateManifestGitProvenance(
    manifest.git,
    { label: "Package manifest", currentCommit: "", allowDirty: false, allowCommitMismatch: true },
    failures
  );
  validatePackageManifestGeneratedAt(manifest, failures);

  const entries = [
    manifest.sourceReport,
    manifest.supportBundle,
    ...(manifest.uiEvidence ? [manifest.uiEvidence] : []),
    ...(Array.isArray(manifest.artifacts) ? manifest.artifacts : [])
  ];
  if (!manifest.sourceReport || !manifest.supportBundle || !Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    failures.push("Package manifest must include sourceReport, supportBundle, and at least one artifact.");
    return failures;
  }

  validatePackageFileSet(manifest, resolvedPackageDir, failures);

  const seenPackagedPaths = new Set();
  for (const entry of entries) {
    validatePackageEntry(entry, resolvedPackageDir, failures);
    if (entry?.packagedPath) {
      if (seenPackagedPaths.has(entry.packagedPath)) {
        failures.push(`Package manifest contains duplicate packaged path ${entry.packagedPath}.`);
      }
      seenPackagedPaths.add(entry.packagedPath);
    }
    if (verifySources) {
      validateSourceEntry(entry, failures);
    }
  }

  validatePackagedReport(manifest, resolvedPackageDir, failures, { maxAgeHours });
  validatePackagePrivacy(manifest, resolvedPackageDir, failures);
  return failures;
}

function validatePackageFileSet(manifest, packageDir, failures) {
  const expectedFiles = new Set([
    releaseEvidencePackageManifestName,
    manifest.sourceReport?.packagedPath,
    manifest.supportBundle?.packagedPath,
    manifest.uiEvidence?.packagedPath,
    ...(Array.isArray(manifest.artifacts) ? manifest.artifacts.map((artifact) => artifact?.packagedPath) : [])
  ].filter(Boolean));

  for (const packagedPath of collectPackageFiles(packageDir)) {
    if (!expectedFiles.has(packagedPath)) {
      failures.push(`Release evidence package contains unmanifested file ${packagedPath}.`);
    }
  }
}

function validatePackagedReport(manifest, packageDir, failures, { maxAgeHours }) {
  const reportPath = join(packageDir, manifest.sourceReport.packagedPath);
  let report;
  try {
    report = readJsonFile(reportPath, "packaged release-candidate report");
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    return;
  }

  if (report?.app !== "MobileLiveCaster" || report?.type !== "release-candidate-verification" || report?.status !== "passed") {
    failures.push("Packaged release report must be a passed MobileLiveCaster release-candidate-verification report.");
  }
  validatePackageManifestGeneratedAfterReport(manifest, report, failures);
  failures.push(...validateCommercialPackageableReleaseReport(report, "Packaged release report"));
  if (report?.git?.commit && manifest.git?.commit && report.git.commit !== manifest.git.commit) {
    failures.push(`Packaged release report commit ${report.git.commit} does not match package commit ${manifest.git.commit}.`);
  }
  if (report?.supportBundle?.sha256 && report.supportBundle.sha256 !== manifest.supportBundle.sha256) {
    failures.push("Packaged support bundle SHA-256 does not match the release report support bundle SHA-256.");
  }
  const supportBundle = readPackagedSupportBundle(manifest, packageDir, failures);
  validatePackagedSupportBundleGate(supportBundle, report, maxAgeHours, failures);

  const uiEvidenceSource = uiEvidenceSourceFromReport(report);
  if (uiEvidenceSource?.sha256) {
    if (!manifest.uiEvidence) {
      failures.push("Package is missing browser UI evidence JSON referenced by the release report.");
    } else if (manifest.uiEvidence.sha256 !== uiEvidenceSource.sha256) {
      failures.push("Packaged browser UI evidence SHA-256 does not match the release report UI evidence SHA-256.");
    }
  } else if (hasBrowserUiGate(report)) {
    failures.push("Packaged release report is missing browser UI evidence JSON metadata.");
  }

  const reportArtifacts = new Map((report.artifacts?.files || []).map((artifact) => [`${artifact.group}:${artifact.path}`, artifact]));
  const packagedArtifacts = new Map(
    (manifest.artifacts || []).map((artifact) => [`${artifact.group}:${artifact.sourcePath}`, artifact])
  );
  validatePackagedUiEvidence(manifest, report, packagedArtifacts, packageDir, failures, { maxAgeHours });
  validateRequiredCommercialPackageArtifacts(report, manifest, reportArtifacts, packagedArtifacts, failures);
  validatePackagedCommercialManifests(packageDir, packagedArtifacts, failures, { releaseReport: report, maxAgeHours, supportBundle });
  validatePackagedStoreReleaseReport({ report, packageDir, packagedArtifacts, failures, maxAgeHours });
  for (const packagedArtifact of manifest.artifacts || []) {
    const key = `${packagedArtifact.group}:${packagedArtifact.sourcePath}`;
    if (!reportArtifacts.has(key)) {
      failures.push(`Package manifest contains artifact not present in the release report: ${key}.`);
    }
  }
  for (const reportArtifact of report.artifacts?.files || []) {
    const key = `${reportArtifact.group}:${reportArtifact.path}`;
    const packagedArtifact = packagedArtifacts.get(key);
    if (!packagedArtifact) {
      failures.push(`Package is missing release report artifact ${key}.`);
      continue;
    }
    if (packagedArtifact.bytes !== reportArtifact.bytes || packagedArtifact.sha256 !== reportArtifact.sha256) {
      failures.push(`Packaged artifact metadata mismatch for ${reportArtifact.path}.`);
    }
  }
}

function validatePackageManifestGeneratedAt(manifest, failures) {
  const generatedAt = Date.parse(String(manifest?.generatedAt || ""));
  if (!Number.isFinite(generatedAt)) {
    failures.push("Package manifest generatedAt timestamp is missing or invalid.");
    return;
  }
  if (generatedAt > Date.now()) {
    failures.push("Package manifest generatedAt timestamp is in the future.");
  }
}

function validatePackageManifestGeneratedAfterReport(manifest, report, failures) {
  const generatedAt = Date.parse(String(manifest?.generatedAt || ""));
  const reportFinishedAt = Date.parse(String(report?.finishedAt || ""));
  if (!Number.isFinite(generatedAt) || !Number.isFinite(reportFinishedAt)) {
    return;
  }
  if (generatedAt < reportFinishedAt) {
    failures.push("Package manifest generatedAt is before the packaged release report finishedAt.");
  }
}

function validateCommercialPackageableReleaseReport(report, label = "Release report") {
  const failures = [];
  validateManifestGitProvenance(
    report?.git,
    { label, currentCommit: "", allowDirty: false, allowCommitMismatch: true },
    failures
  );
  if (report?.git?.dirty) {
    failures.push(`${label} was generated from a dirty worktree and cannot be used as commercial package evidence.`);
  }
  if (report?.options?.allowDirty) {
    failures.push(`${label} was generated with --allow-dirty and cannot be used as commercial package evidence.`);
  }
  if (report?.options?.allowCommitMismatch) {
    failures.push(`${label} was generated with --allow-commit-mismatch and cannot be used as commercial package evidence.`);
  }
  const cleanGitGate = Array.isArray(report?.gates)
    ? report.gates.find((gate) => gate?.label === "Verify clean git worktree")
    : null;
  if (!cleanGitGate) {
    failures.push(`${label} clean git worktree gate is missing from commercial package evidence.`);
  } else if (cleanGitGate.status !== "passed") {
    failures.push(`${label} clean git worktree gate must be passed for commercial package evidence.`);
  }
  return failures;
}

function readPackagedSupportBundle(manifest, packageDir, failures) {
  if (!manifest.supportBundle?.packagedPath || !safeRelativePath(manifest.supportBundle.packagedPath)) {
    failures.push("Package support bundle path is missing or unsafe.");
    return null;
  }
  const path = resolve(packageDir, manifest.supportBundle.packagedPath);
  if (!isInsideDirectory(path, packageDir) || !existsSync(path) || !lstatSync(path).isFile()) {
    failures.push(`Package support bundle file does not exist: ${manifest.supportBundle.packagedPath}.`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    failures.push(`Package support bundle cannot be read: ${error instanceof Error ? error.message : String(error)}.`);
    return null;
  }
}

function validatePackagedSupportBundleGate(supportBundle, releaseReport, maxAgeHours, failures) {
  if (!supportBundle) {
    return;
  }
  const releaseFinishedAt = Date.parse(String(releaseReport?.finishedAt || ""));
  if (!Number.isFinite(releaseFinishedAt)) {
    failures.push("Packaged release report finishedAt timestamp is missing or invalid.");
    return;
  }

  const gate = createCommercialReleaseGate(supportBundle, {
    now: new Date(releaseFinishedAt),
    maxBundleAgeHours: maxAgeHours,
    allowWarnings: Boolean(releaseReport?.options?.allowWarnings)
  });
  if (gate.canRelease) {
    return;
  }

  failures.push(`Package support bundle commercial release gate must be ready, got ${gate.status}: ${gate.summary}`);
  const blockingIssues = gate.issues.filter((issue) => issue.severity === "fail");
  for (const issue of (blockingIssues.length > 0 ? blockingIssues : gate.issues).slice(0, 5)) {
    failures.push(`Package support bundle ${issue.code}: ${issue.detail}`);
  }
}

function validateRequiredCommercialPackageArtifacts(report, manifest, reportArtifacts, packagedArtifacts, failures) {
  const reportGroups = new Set((report.artifacts?.files || []).map((artifact) => artifact.group));
  const packageGroups = new Set((manifest.artifacts || []).map((artifact) => artifact.group));
  for (const group of [distributionArtifactGroup, dashboardEvidenceArtifactGroup, storeSubmissionArtifactGroup]) {
    if (!reportGroups.has(group)) {
      failures.push(`Packaged release report is missing required commercial artifact group ${group}.`);
    }
    if (!packageGroups.has(group)) {
      failures.push(`Package manifest is missing required commercial artifact group ${group}.`);
    }
  }

  for (const requirement of requiredCommercialPackageArtifacts) {
    const key = `${requirement.group}:${requirement.path}`;
    if (!reportArtifacts.has(key)) {
      failures.push(`Packaged release report is missing ${requirement.label} ${requirement.path}.`);
    }
    if (!packagedArtifacts.has(key)) {
      failures.push(`Package is missing ${requirement.label} ${requirement.path}.`);
    }
  }
}

function validatePackagedCommercialManifests(packageDir, packagedArtifacts, failures, { releaseReport, maxAgeHours, supportBundle }) {
  const distributionManifest = readPackagedJsonArtifact({
    packagedArtifacts,
    group: distributionArtifactGroup,
    sourcePath: distributionArtifactManifestPath,
    packageDir,
    label: "distribution manifest",
    failures
  });
  if (distributionManifest) {
    validatePackagedDistributionManifest(distributionManifest, packagedArtifacts, failures);
  }

  const dashboardManifest = readPackagedJsonArtifact({
    packagedArtifacts,
    group: dashboardEvidenceArtifactGroup,
    sourcePath: dashboardEvidenceManifestPath,
    packageDir,
    label: "dashboard evidence manifest",
    failures
  });
  if (dashboardManifest) {
    validatePackagedDashboardEvidenceManifest(dashboardManifest, packagedArtifacts, failures, {
      packageDir,
      releaseReport,
      maxAgeHours
    });
  }

  const storeSubmissionChecklist = readPackagedJsonArtifact({
    packagedArtifacts,
    group: storeSubmissionArtifactGroup,
    sourcePath: storeSubmissionChecklistPath,
    packageDir,
    label: "store submission checklist",
    failures
  });
  if (storeSubmissionChecklist) {
    validatePackagedStoreSubmissionChecklist(storeSubmissionChecklist, packagedArtifacts, failures, {
      packageDir,
      releaseReport,
      maxAgeHours,
      supportBundle
    });
  }
}

function readPackagedJsonArtifact({ packagedArtifacts, group, sourcePath, packageDir, label, failures }) {
  const artifact = packagedArtifactFor(packagedArtifacts, group, sourcePath);
  if (!artifact) {
    return null;
  }
  if (!safeRelativePath(artifact.packagedPath)) {
    return null;
  }
  const path = resolve(packageDir, artifact.packagedPath);
  if (!isInsideDirectory(path, packageDir) || !existsSync(path) || !lstatSync(path).isFile()) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    failures.push(`Package ${label} cannot be read: ${error instanceof Error ? error.message : String(error)}.`);
    return null;
  }
}

function readPackagedJsonEntry(entry, packageDir, label, failures) {
  if (!entry?.packagedPath || !safeRelativePath(entry.packagedPath)) {
    return null;
  }
  const path = resolve(packageDir, entry.packagedPath);
  if (!isInsideDirectory(path, packageDir) || !existsSync(path) || !lstatSync(path).isFile()) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    failures.push(`Package ${label} cannot be read: ${error instanceof Error ? error.message : String(error)}.`);
    return null;
  }
}

function validatePackagedUiEvidence(manifest, releaseReport, packagedArtifacts, packageDir, failures, { maxAgeHours }) {
  const uiEvidenceSource = uiEvidenceSourceFromReport(releaseReport);
  if (!uiEvidenceSource?.sha256 || !manifest.uiEvidence) {
    return;
  }

  const evidence = readPackagedJsonEntry(manifest.uiEvidence, packageDir, "browser UI evidence", failures);
  if (!evidence) {
    return;
  }
  if (evidence?.app !== "MobileLiveCaster" || evidence?.type !== "browser-ui-verification" || evidence?.reportVersion !== 1) {
    failures.push("Package browser UI evidence is not a MobileLiveCaster browser-ui-verification reportVersion 1 file.");
  }
  if (evidence.status !== "passed") {
    failures.push(`Package browser UI evidence status must be passed, got ${JSON.stringify(evidence.status)}.`);
  }
  if (!isLoopbackHttpUrl(evidence.target)) {
    failures.push("Package browser UI evidence target must be a loopback http(s) URL.");
  }

  validatePackagedUiEvidenceFreshness(evidence, releaseReport, maxAgeHours, failures);
  validatePackagedUiEvidenceGit(evidence, releaseReport, failures);
  validatePackagedUiEvidenceViewports(evidence, packagedArtifacts, packageDir, failures);
}

function validatePackagedUiEvidenceFreshness(evidence, releaseReport, maxAgeHours, failures) {
  const evidenceFinishedAt = Date.parse(String(evidence?.finishedAt || ""));
  const releaseFinishedAt = Date.parse(String(releaseReport?.finishedAt || ""));
  if (!Number.isFinite(evidenceFinishedAt)) {
    failures.push("Package browser UI evidence finishedAt timestamp is missing or invalid.");
    return;
  }
  if (!Number.isFinite(releaseFinishedAt)) {
    failures.push("Packaged release report finishedAt timestamp is missing or invalid.");
    return;
  }
  if (evidenceFinishedAt > releaseFinishedAt) {
    failures.push("Package browser UI evidence finishedAt is after the packaged release report finishedAt.");
    return;
  }
  const ageHours = Math.floor((releaseFinishedAt - evidenceFinishedAt) / 3_600_000);
  if (ageHours > maxAgeHours) {
    failures.push(
      `Package browser UI evidence is ${ageHours}h older than the release report, above the ${maxAgeHours}h commercial release gate.`
    );
  }
}

function validatePackagedUiEvidenceGit(evidence, releaseReport, failures) {
  const evidenceCommit = String(evidence?.git?.commit || "");
  const reportCommit = String(releaseReport?.git?.commit || "");
  validateManifestGitProvenance(
    evidence?.git,
    { label: "Package browser UI evidence", currentCommit: "", allowDirty: false, allowCommitMismatch: true },
    failures
  );
  if (evidenceCommit && reportCommit && evidenceCommit !== reportCommit) {
    failures.push(`Package browser UI evidence commit ${evidenceCommit} does not match release report commit ${reportCommit}.`);
  }
}

function validatePackagedUiEvidenceViewports(evidence, packagedArtifacts, packageDir, failures) {
  const viewports = Array.isArray(evidence?.viewports) ? evidence.viewports : [];
  for (const viewportName of requiredUiViewportNames) {
    const viewport = viewports.find((candidate) => candidate?.name === viewportName);
    if (!viewport) {
      failures.push(`Package browser UI evidence is missing ${viewportName} viewport results.`);
      continue;
    }
    if (viewport.horizontalOverflow !== false) {
      failures.push(`Package browser UI evidence reports horizontal overflow for ${viewportName}.`);
    }
    validatePackagedUiEvidenceTextChecks(viewport, failures);
    validatePackagedUiEvidenceScreenshot(viewport, packagedArtifacts, packageDir, failures);
  }
}

function validatePackagedUiEvidenceTextChecks(viewport, failures) {
  const checks = Array.isArray(viewport.requiredTextChecks) ? viewport.requiredTextChecks : [];
  for (const text of requiredUiTextChecks) {
    const check = checks.find((candidate) => candidate?.text === text);
    if (!check || !Number.isFinite(check.count) || check.count <= 0) {
      failures.push(`Package browser UI evidence for ${viewport.name} is missing text ${JSON.stringify(text)}.`);
    }
  }
}

function validatePackagedUiEvidenceScreenshot(viewport, packagedArtifacts, packageDir, failures) {
  const screenshot = viewport.screenshot;
  if (!screenshot?.path || !Number.isFinite(screenshot.bytes) || screenshot.bytes <= 0 || !isSha256(screenshot.sha256)) {
    failures.push(`Package browser UI evidence for ${viewport.name} is missing valid screenshot metadata.`);
    return;
  }
  const packagedArtifact = packagedArtifactFor(packagedArtifacts, "ui", screenshot.path);
  if (!packagedArtifact) {
    failures.push(`Package browser UI evidence screenshot is missing from package artifacts: ${screenshot.path}.`);
    return;
  }
  if (packagedArtifact.bytes !== screenshot.bytes || packagedArtifact.sha256 !== screenshot.sha256) {
    failures.push(`Package browser UI evidence screenshot metadata mismatch for ${screenshot.path}.`);
    return;
  }
  const screenshotPath = resolve(packageDir, packagedArtifact.packagedPath);
  if (!isInsideDirectory(screenshotPath, packageDir) || !existsSync(screenshotPath) || !lstatSync(screenshotPath).isFile()) {
    failures.push(`Package browser UI evidence screenshot file does not exist: ${packagedArtifact.packagedPath}.`);
    return;
  }
  const pngEvidence = readPngEvidence(readFileSync(screenshotPath));
  if (!pngEvidence.valid) {
    failures.push(`Package browser UI evidence screenshot is not a structurally valid PNG file: ${screenshot.path} (${pngEvidence.reason}).`);
  }
}

function validatePackagedDistributionManifest(distributionManifest, packagedArtifacts, failures) {
  if (
    distributionManifest?.app !== "MobileLiveCaster" ||
    distributionManifest?.type !== "distribution-artifact-manifest" ||
    distributionManifest?.reportVersion !== 1
  ) {
    failures.push("Package distribution manifest is not a MobileLiveCaster distribution-artifact-manifest reportVersion 1 file.");
    return;
  }

  const records = Array.isArray(distributionManifest.artifacts) ? distributionManifest.artifacts : [];
  if (records.length === 0) {
    failures.push("Package distribution manifest has no artifacts.");
    return;
  }
  validateRequiredRecordKinds(
    records,
    [
      { label: "android aab", test: (record) => record?.platform === "android" && record?.kind === "aab" },
      { label: "ios ipa", test: (record) => record?.platform === "ios" && record?.kind === "ipa" }
    ],
    "distribution manifest",
    failures
  );
  for (const record of records) {
    validatePackagedManifestRecord(packagedArtifacts, distributionArtifactGroup, record, "distribution manifest", failures);
  }
}

function validatePackagedDashboardEvidenceManifest(
  dashboardManifest,
  packagedArtifacts,
  failures,
  { packageDir, releaseReport, maxAgeHours }
) {
  if (
    dashboardManifest?.app !== "MobileLiveCaster" ||
    dashboardManifest?.type !== "platform-dashboard-evidence-manifest" ||
    dashboardManifest?.reportVersion !== 1
  ) {
    failures.push(
      "Package dashboard evidence manifest is not a MobileLiveCaster platform-dashboard-evidence-manifest reportVersion 1 file."
    );
    return;
  }

  const records = Array.isArray(dashboardManifest.artifacts) ? dashboardManifest.artifacts : [];
  if (records.length === 0) {
    failures.push("Package dashboard evidence manifest has no artifacts.");
    return;
  }
  validateRequiredRecordKinds(
    records,
    [
      { label: "youtube screenshot", test: (record) => record?.platform === "youtube" && record?.kind === "screenshot" },
      { label: "youtube statusJson", test: (record) => record?.platform === "youtube" && record?.kind === "statusJson" },
      { label: "twitch screenshot", test: (record) => record?.platform === "twitch" && record?.kind === "screenshot" },
      { label: "twitch statusJson", test: (record) => record?.platform === "twitch" && record?.kind === "statusJson" }
    ],
    "dashboard evidence manifest",
    failures
  );
  for (const record of records) {
    validatePackagedManifestRecord(packagedArtifacts, dashboardEvidenceArtifactGroup, record, "dashboard evidence manifest", failures);
    validatePackagedDashboardEvidenceArtifact(record, packagedArtifacts, packageDir, failures);
  }
  validatePackagedDashboardEvidenceTiming(records, failures);
  validatePackagedDashboardEvidenceFreshness(records, releaseReport, maxAgeHours, failures);
}

function validatePackagedDashboardEvidenceArtifact(record, packagedArtifacts, packageDir, failures) {
  const recordPath = workspaceRecordPath(record?.path || "");
  if (!recordPath) {
    return;
  }
  const packagedArtifact = packagedArtifactFor(packagedArtifacts, dashboardEvidenceArtifactGroup, recordPath);
  if (!packagedArtifact?.packagedPath || !safeRelativePath(packagedArtifact.packagedPath)) {
    return;
  }
  const packagedPath = resolve(packageDir, packagedArtifact.packagedPath);
  if (!isInsideDirectory(packagedPath, packageDir) || !existsSync(packagedPath) || !lstatSync(packagedPath).isFile()) {
    return;
  }
  const content = readFileSync(packagedPath);
  if (record.kind === "screenshot") {
    validatePackagedDashboardScreenshot(record, content, failures);
    return;
  }
  if (record.kind === "statusJson") {
    validatePackagedDashboardStatusJson(record, content, failures);
  }
}

function validatePackagedDashboardScreenshot(record, content, failures) {
  const pngEvidence = readPngEvidence(content);
  if (!pngEvidence.valid) {
    failures.push(`Package dashboard evidence screenshot is not a structurally valid PNG file: ${record.path} (${pngEvidence.reason}).`);
    return;
  }
  if (record.width !== pngEvidence.width || record.height !== pngEvidence.height) {
    failures.push(`Package dashboard evidence screenshot dimensions mismatch for ${record.path}.`);
  }
  const shortEdge = Math.min(pngEvidence.width, pngEvidence.height);
  const longEdge = Math.max(pngEvidence.width, pngEvidence.height);
  if (shortEdge < dashboardScreenshotMinimumShortEdge || longEdge < dashboardScreenshotMinimumLongEdge) {
    failures.push(
      `Package dashboard evidence screenshot ${record.path} must be at least ${dashboardScreenshotMinimumShortEdge}px on the short edge and ${dashboardScreenshotMinimumLongEdge}px on the long edge.`
    );
  }
}

function validatePackagedDashboardStatusJson(record, content, failures) {
  let parsed;
  try {
    parsed = JSON.parse(content.toString("utf8"));
  } catch {
    failures.push(`Package dashboard evidence status JSON is unreadable: ${record.path}.`);
    return;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    failures.push(`Package dashboard evidence status JSON must be an object: ${record.path}.`);
    return;
  }
  const platform = stringValue(parsed.platform);
  if (platform !== record.platform) {
    failures.push(`Package dashboard evidence status JSON ${record.path} platform must be ${record.platform}.`);
  }
  const checkedAt = stringValue(parsed.checkedAt);
  if (!validTimestamp(checkedAt)) {
    failures.push(`Package dashboard evidence status JSON ${record.path} must include a valid checkedAt timestamp.`);
  } else if (checkedAt !== record.checkedAt) {
    failures.push(`Package dashboard evidence status JSON checkedAt mismatch for ${record.path}.`);
  }

  const statusSummary = record.platform === "youtube"
    ? packagedYoutubeStatusSummary(parsed, record.path, failures)
    : record.platform === "twitch"
      ? packagedTwitchStatusSummary(parsed, record.path, failures)
      : "";
  if (statusSummary && record.statusSummary !== statusSummary) {
    failures.push(`Package dashboard evidence status JSON summary mismatch for ${record.path}.`);
  }
}

function packagedYoutubeStatusSummary(parsed, path, failures) {
  const broadcastStatus = stringValue(parsed.broadcastStatus).toLowerCase();
  const streamStatus = stringValue(parsed.streamStatus).toLowerCase();
  const broadcastId = requiredDashboardIdentity(parsed.broadcastId, "YouTube broadcastId", path, failures);
  const streamId = requiredDashboardIdentity(parsed.streamId, "YouTube streamId", path, failures);
  const channelId = requiredDashboardIdentity(parsed.channelId, "YouTube channelId", path, failures);
  if (!broadcastStatus) {
    failures.push(`Package dashboard evidence status JSON ${path} must include YouTube broadcastStatus.`);
  } else if (badYoutubeBroadcastStatuses.has(broadcastStatus)) {
    failures.push(`Package dashboard evidence status JSON ${path} has non-release YouTube broadcastStatus ${broadcastStatus}.`);
  }
  if (!streamStatus) {
    failures.push(`Package dashboard evidence status JSON ${path} must include YouTube streamStatus.`);
  } else if (badYoutubeStreamStatuses.has(streamStatus)) {
    failures.push(`Package dashboard evidence status JSON ${path} has non-release YouTube streamStatus ${streamStatus}.`);
  }
  return `broadcast:${broadcastStatus}:${broadcastId} stream:${streamStatus}:${streamId} channel:${channelId}`;
}

function packagedTwitchStatusSummary(parsed, path, failures) {
  const liveStatus = stringValue(parsed.liveStatus).toLowerCase();
  const broadcasterId = requiredDashboardIdentity(parsed.broadcasterId, "Twitch broadcasterId", path, failures);
  const broadcasterLogin = requiredDashboardIdentity(parsed.broadcasterLogin, "Twitch broadcasterLogin", path, failures);
  const streamId = requiredDashboardIdentity(parsed.streamId, "Twitch streamId", path, failures);
  if (!liveStatus) {
    failures.push(`Package dashboard evidence status JSON ${path} must include Twitch liveStatus.`);
  } else if (liveStatus !== "live") {
    failures.push(`Package dashboard evidence status JSON ${path} has non-release Twitch liveStatus ${liveStatus}.`);
  }
  return `live:${liveStatus} channel:${broadcasterId}/${broadcasterLogin} stream:${streamId}`;
}

function requiredDashboardIdentity(value, label, path, failures) {
  const identity = stringValue(value);
  if (!identity) {
    failures.push(`Package dashboard evidence status JSON ${path} must include ${label}.`);
    return "";
  }
  if (badDashboardIdentityMarkers.has(identity.toLowerCase())) {
    failures.push(`Package dashboard evidence status JSON ${path} has placeholder ${label} ${identity}.`);
  }
  if (identity.length > 128 || /[\s\u0000-\u001f\u007f]/.test(identity)) {
    failures.push(`Package dashboard evidence status JSON ${path} has invalid ${label} ${identity}.`);
  }
  return identity;
}

function validatePackagedDashboardEvidenceTiming(records, failures) {
  const platforms = new Set(records.map((record) => record?.platform).filter(Boolean));
  for (const record of records) {
    if (record?.kind === "screenshot" && !validTimestamp(record.capturedAt)) {
      failures.push(`Package dashboard evidence screenshot ${record.path || "-"} must include a valid capturedAt timestamp.`);
    }
    if (record?.kind === "statusJson" && !validTimestamp(record.checkedAt)) {
      failures.push(`Package dashboard evidence status JSON ${record.path || "-"} must include a valid checkedAt timestamp.`);
    }
  }

  for (const platform of platforms) {
    const screenshots = records.filter((record) => record?.platform === platform && record?.kind === "screenshot");
    const statusJsons = records.filter((record) => record?.platform === platform && record?.kind === "statusJson");
    for (const screenshot of screenshots) {
      if (!validTimestamp(screenshot.capturedAt)) {
        continue;
      }
      for (const statusJson of statusJsons) {
        if (!validTimestamp(statusJson.checkedAt)) {
          continue;
        }
        const skewMinutes = Math.abs(Date.parse(screenshot.capturedAt) - Date.parse(statusJson.checkedAt)) / 60_000;
        if (skewMinutes > dashboardScreenshotStatusMaxSkewMinutes) {
          failures.push(
            `Package dashboard evidence ${platform} screenshot capturedAt must be within ${dashboardScreenshotStatusMaxSkewMinutes} minutes of status JSON checkedAt.`
          );
        }
      }
    }
  }
}

function validatePackagedDashboardEvidenceFreshness(records, releaseReport, maxAgeHours, failures) {
  const releaseFinishedAt = Date.parse(String(releaseReport?.finishedAt || ""));
  if (!Number.isFinite(releaseFinishedAt)) {
    failures.push("Packaged release report finishedAt timestamp is missing or invalid.");
    return;
  }
  for (const record of records) {
    const timestamp = record?.kind === "screenshot" ? record.capturedAt : record?.kind === "statusJson" ? record.checkedAt : "";
    if (!validTimestamp(timestamp)) {
      continue;
    }
    const capturedAt = Date.parse(timestamp);
    if (capturedAt > releaseFinishedAt) {
      failures.push(`Package dashboard evidence ${record.kind} ${record.path} timestamp is after the packaged release report finishedAt.`);
      continue;
    }
    const ageHours = Math.floor((releaseFinishedAt - capturedAt) / 3_600_000);
    if (ageHours > maxAgeHours) {
      failures.push(
        `Package dashboard evidence ${record.kind} ${record.path} is ${ageHours}h older than the release report, above the ${maxAgeHours}h commercial release gate.`
      );
    }
  }
}

function validatePackagedStoreSubmissionChecklist(
  storeSubmissionChecklist,
  packagedArtifacts,
  failures,
  { packageDir, releaseReport, maxAgeHours, supportBundle }
) {
  if (
    storeSubmissionChecklist?.app !== "MobileLiveCaster" ||
    storeSubmissionChecklist?.type !== "store-submission-checklist-manifest" ||
    storeSubmissionChecklist?.reportVersion !== 1
  ) {
    failures.push("Package store submission checklist is not a MobileLiveCaster store-submission-checklist-manifest reportVersion 1 file.");
    return;
  }

  const records = [
    storeSubmissionChecklist.metadata,
    ...(Array.isArray(storeSubmissionChecklist.screenshots) ? storeSubmissionChecklist.screenshots : []),
    ...(Array.isArray(storeSubmissionChecklist.reviewDocuments) ? storeSubmissionChecklist.reviewDocuments : [])
  ].filter(Boolean);
  if (!storeSubmissionChecklist.metadata) {
    failures.push("Package store submission checklist is missing metadata.");
  }
  if (!Array.isArray(storeSubmissionChecklist.screenshots) || storeSubmissionChecklist.screenshots.length === 0) {
    failures.push("Package store submission checklist has no screenshots.");
  }
  if (!Array.isArray(storeSubmissionChecklist.reviewDocuments) || storeSubmissionChecklist.reviewDocuments.length === 0) {
    failures.push("Package store submission checklist has no review documents.");
  }
  validateRequiredRecordKinds(
    records,
    [
      { label: "ios screenshot", test: (record) => record?.platform === "ios" && record?.kind === "screenshot" },
      { label: "android screenshot", test: (record) => record?.platform === "android" && record?.kind === "screenshot" }
    ],
    "store submission checklist",
    failures
  );
  for (const record of records) {
    validatePackagedManifestRecord(packagedArtifacts, storeSubmissionArtifactGroup, record, "store submission checklist", failures);
  }
  validatePackagedStoreSubmissionScreenshots(
    storeSubmissionChecklist.screenshots || [],
    packagedArtifacts,
    packageDir,
    releaseReport,
    maxAgeHours,
    supportBundle,
    failures
  );
}

function validatePackagedStoreSubmissionScreenshots(
  screenshots,
  packagedArtifacts,
  packageDir,
  releaseReport,
  maxAgeHours,
  supportBundle,
  failures
) {
  const releaseFinishedAt = Date.parse(String(releaseReport?.finishedAt || ""));
  if (!Number.isFinite(releaseFinishedAt)) {
    failures.push("Packaged release report finishedAt timestamp is missing or invalid.");
    return;
  }
  const expectedBuild = stringValue(supportBundle?.summary?.validationEvidenceConsistentAppBuild);
  if (supportBundle?.summary?.validationEvidenceAppBuildMismatch === true) {
    failures.push("Package support bundle validation evidence has an app build mismatch; packaged store screenshots cannot be approved.");
  } else if (!expectedBuild) {
    failures.push("Package support bundle validation evidence consistent app build is missing for packaged store screenshot approval.");
  }
  for (const screenshot of screenshots) {
    if (screenshot?.kind !== "screenshot") {
      continue;
    }
    if (screenshot.source !== "realDevice") {
      failures.push(`Package store submission screenshot ${screenshot.path || "-"} must be marked realDevice.`);
    }
    validatePackagedStoreScreenshotDeviceIdentity(screenshot, failures);
    if (!stringValue(screenshot.osVersion)) {
      failures.push(`Package store submission screenshot ${screenshot.path || "-"} must include a real device OS version.`);
    }
    if (!stringValue(screenshot.appBuild)) {
      failures.push(`Package store submission screenshot ${screenshot.path || "-"} must include an app build/version.`);
    } else if (expectedBuild && normalizeBuildLabel(screenshot.appBuild) !== normalizeBuildLabel(expectedBuild)) {
      failures.push(
        `Package store submission screenshot ${screenshot.path || "-"} app build ${stringValue(screenshot.appBuild)} does not match validation evidence build ${expectedBuild}.`
      );
    }
    if (!validTimestamp(screenshot.capturedAt)) {
      failures.push(`Package store submission screenshot ${screenshot.path || "-"} must include a valid capturedAt timestamp.`);
    } else {
      const capturedAt = Date.parse(screenshot.capturedAt);
      if (capturedAt > releaseFinishedAt) {
        failures.push(`Package store submission screenshot ${screenshot.path} capturedAt is after the packaged release report finishedAt.`);
      } else {
        const ageHours = Math.floor((releaseFinishedAt - capturedAt) / 3_600_000);
        if (ageHours > maxAgeHours) {
          failures.push(
            `Package store submission screenshot ${screenshot.path} is ${ageHours}h older than the release report, above the ${maxAgeHours}h commercial release gate.`
          );
        }
      }
    }
    const shortEdge = Math.min(Number(screenshot.width), Number(screenshot.height));
    const longEdge = Math.max(Number(screenshot.width), Number(screenshot.height));
    if (
      !Number.isFinite(shortEdge) ||
      !Number.isFinite(longEdge) ||
      shortEdge < finalStoreScreenshotMinimumShortEdge ||
      longEdge < finalStoreScreenshotMinimumLongEdge
    ) {
      failures.push(
        `Package store submission screenshot ${screenshot.path || "-"} must be at least ${finalStoreScreenshotMinimumShortEdge}px on the short edge and ${finalStoreScreenshotMinimumLongEdge}px on the long edge.`
      );
    }
    validatePackagedStoreScreenshotArtifact(screenshot, packagedArtifacts, packageDir, failures);
  }
}

function validatePackagedStoreScreenshotArtifact(screenshot, packagedArtifacts, packageDir, failures) {
  const screenshotPath = workspaceRecordPath(screenshot?.path || "");
  if (!screenshotPath) {
    return;
  }
  const packagedArtifact = packagedArtifactFor(packagedArtifacts, storeSubmissionArtifactGroup, screenshotPath);
  if (!packagedArtifact?.packagedPath || !safeRelativePath(packagedArtifact.packagedPath)) {
    return;
  }
  const packagedPath = resolve(packageDir, packagedArtifact.packagedPath);
  if (!isInsideDirectory(packagedPath, packageDir) || !existsSync(packagedPath) || !lstatSync(packagedPath).isFile()) {
    return;
  }
  const content = readFileSync(packagedPath);
  const pngEvidence = readPngEvidence(content);
  if (!pngEvidence.valid) {
    failures.push(`Package store submission screenshot is not a structurally valid PNG file: ${screenshotPath} (${pngEvidence.reason}).`);
    return;
  }
  if (screenshot.width !== pngEvidence.width || screenshot.height !== pngEvidence.height) {
    failures.push(`Package store submission screenshot dimensions mismatch for ${screenshotPath}.`);
  }
  const shortEdge = Math.min(pngEvidence.width, pngEvidence.height);
  const longEdge = Math.max(pngEvidence.width, pngEvidence.height);
  if (shortEdge < finalStoreScreenshotMinimumShortEdge || longEdge < finalStoreScreenshotMinimumLongEdge) {
    failures.push(
      `Package store submission screenshot ${screenshotPath} actual PNG dimensions must be at least ${finalStoreScreenshotMinimumShortEdge}px on the short edge and ${finalStoreScreenshotMinimumLongEdge}px on the long edge.`
    );
  }
}

function validatePackagedStoreScreenshotDeviceIdentity(screenshot, failures) {
  const device = stringValue(screenshot.device);
  const osVersion = stringValue(screenshot.osVersion);
  if (!device) {
    failures.push(`Package store submission screenshot ${screenshot.path || "-"} must include a device label.`);
    return;
  }
  if (!osVersion) {
    return;
  }
  if (virtualStoreDevicePattern.test(`${device} ${osVersion}`)) {
    failures.push(
      `Package store submission screenshot ${screenshot.path || "-"} must use a physical device label, not Simulator/Emulator/browser/test-device evidence.`
    );
    return;
  }
  if (!hasSpecificStoreDeviceLabel(screenshot.platform, device, osVersion)) {
    failures.push(
      `Package store submission screenshot ${screenshot.path || "-"} must include a specific physical ${screenshot.platform} device label and OS version.`
    );
  }
}

function hasSpecificStoreDeviceLabel(platform, device, osVersion) {
  const normalizedDevice = device.trim().toLowerCase();
  const normalizedOs = osVersion.trim().toLowerCase();
  if (!normalizedDevice || !normalizedOs) {
    return false;
  }
  if (platform === "ios") {
    return /\bios|ipados\b/.test(normalizedOs) && /\b(iphone|ipad|ipod)\s+\S+/.test(normalizedDevice);
  }
  if (platform === "android") {
    return (
      /\bandroid\b/.test(normalizedOs) &&
      !/^(android\s*)?(device|phone|mobile|handset)$/.test(normalizedDevice) &&
      normalizedDevice.length >= 4 &&
      (/\d/.test(normalizedDevice) || /[\s_-]/.test(normalizedDevice))
    );
  }
  return false;
}

function validatePackagedStoreReleaseReport({ report, packageDir, packagedArtifacts, failures, maxAgeHours }) {
  const gate = storeReleaseReportGate(report);
  const reportPath = gate?.evidence?.path || firstStoreReleaseReportArtifactPath(report, packagedArtifacts);
  if (!gate && !reportPath) {
    return;
  }
  if (!reportPath) {
    failures.push("Packaged release report store-release gate is missing evidence path.");
    return;
  }

  const packagedStoreReleaseReport = packagedArtifactFor(packagedArtifacts, storeReleaseReportArtifactGroup, reportPath);
  if (!packagedStoreReleaseReport) {
    failures.push(`Package is missing store release orchestration report ${reportPath}.`);
    return;
  }
  if (gate?.evidence?.sha256 && packagedStoreReleaseReport.sha256 !== gate.evidence.sha256) {
    failures.push("Packaged store release report SHA-256 does not match the release report store-release evidence SHA-256.");
  }

  const storeReport = readPackagedJsonArtifact({
    packagedArtifacts,
    group: storeReleaseReportArtifactGroup,
    sourcePath: reportPath,
    packageDir,
    label: "store release report",
    failures
  });
  if (!storeReport) {
    return;
  }

  validatePackagedStoreReleaseReportContent(storeReport, report, packagedArtifacts, packageDir, failures, { maxAgeHours });
}

function firstStoreReleaseReportArtifactPath(report, packagedArtifacts) {
  const reportArtifact = (report.artifacts?.files || []).find(
    (artifact) => artifact?.group === storeReleaseReportArtifactGroup && artifact?.path
  );
  if (reportArtifact?.path) {
    return reportArtifact.path;
  }
  return Array.from(packagedArtifacts.values()).find((artifact) => artifact?.group === storeReleaseReportArtifactGroup)?.sourcePath || "";
}

function storeReleaseReportGate(report) {
  return (Array.isArray(report?.gates) ? report.gates : []).find((gate) => gate?.label === storeReleaseReportGateLabel);
}

function validatePackagedStoreReleaseReportContent(storeReport, releaseReport, packagedArtifacts, packageDir, failures, { maxAgeHours }) {
  if (storeReport?.app !== "MobileLiveCaster" || storeReport?.type !== storeReleaseReportType || storeReport?.reportVersion !== 1) {
    failures.push("Package store release report is not a MobileLiveCaster store-release-orchestration reportVersion 1 file.");
    return;
  }
  if (storeReport.status !== "passed") {
    failures.push(`Package store release report status must be passed, got ${JSON.stringify(storeReport.status)}.`);
  }
  if (storeReport.mode !== "execute") {
    failures.push(`Package store release report mode must be execute, got ${JSON.stringify(storeReport.mode)}.`);
  }
  if (!Number.isFinite(Date.parse(storeReport.finishedAt || ""))) {
    failures.push("Package store release report finishedAt timestamp is missing or invalid.");
  }
  validatePackagedStoreReleaseReportFreshness(storeReport, releaseReport, maxAgeHours, failures);
  if (!Number.isFinite(storeReport.durationMs) || storeReport.durationMs < 0) {
    failures.push("Package store release report durationMs is missing or invalid.");
  }

  const reportCommit = String(storeReport.git?.commit || "");
  const expectedCommit = String(releaseReport.git?.commit || "");
  const allowDirty = Boolean(releaseReport.options?.allowDirty);
  const allowCommitMismatch = Boolean(releaseReport.options?.allowCommitMismatch);
  validateManifestGitProvenance(
    storeReport?.git,
    { label: "Package store release report", currentCommit: "", allowDirty, allowCommitMismatch: true },
    failures
  );
  if (expectedCommit && reportCommit && expectedCommit !== reportCommit && !allowCommitMismatch) {
    failures.push(`Package store release report commit ${reportCommit} does not match release report commit ${expectedCommit}.`);
  }
  if (storeReport.options?.allowDirty && !allowDirty) {
    failures.push("Package store release report was generated with --allow-dirty.");
  }
  if (storeReport.options?.skipEnv) {
    failures.push("Package store release report was generated with --skip-env and cannot be used as commercial release evidence.");
  }
  if (storeReport.options?.skipBuild) {
    failures.push("Package store release report was generated with --skip-build and cannot be used as commercial release evidence.");
  }

  if (!Array.isArray(storeReport.platforms) || storeReport.platforms.length === 0) {
    failures.push("Package store release report has no platforms.");
  }
  const steps = Array.isArray(storeReport.steps) ? storeReport.steps : [];
  if (steps.length === 0) {
    failures.push("Package store release report has no steps.");
  }
  for (const step of steps) {
    if (!step?.type || !step?.command) {
      failures.push("Package store release report step is missing type or command.");
      continue;
    }
    if (step.status !== "passed") {
      failures.push(`Package store release report step ${JSON.stringify(step.command)} must be passed, got ${JSON.stringify(step.status)}.`);
    }
    if (step.status === "passed" && step.exitCode !== 0) {
      failures.push(`Package store release report step ${JSON.stringify(step.command)} has a non-zero exitCode.`);
    }
    if (!Number.isFinite(step.durationMs) || step.durationMs < 0) {
      failures.push(`Package store release report step ${JSON.stringify(step.command)} is missing a valid durationMs.`);
    }
  }
  validatePackagedRequiredStoreReleaseSteps(storeReport, steps, failures);

  validatePackagedStoreReleaseDistributionManifest(storeReport, packagedArtifacts, packageDir, failures);
}

function validatePackagedStoreReleaseReportFreshness(storeReport, releaseReport, maxAgeHours, failures) {
  const storeFinishedAt = Date.parse(String(storeReport?.finishedAt || ""));
  const releaseFinishedAt = Date.parse(String(releaseReport?.finishedAt || ""));
  if (!Number.isFinite(storeFinishedAt)) {
    return;
  }
  if (!Number.isFinite(releaseFinishedAt)) {
    failures.push("Packaged release report finishedAt timestamp is missing or invalid.");
    return;
  }
  if (storeFinishedAt > releaseFinishedAt) {
    failures.push("Package store release report finishedAt is after the packaged release report finishedAt.");
    return;
  }
  const ageHours = Math.floor((releaseFinishedAt - storeFinishedAt) / 3_600_000);
  if (ageHours > maxAgeHours) {
    failures.push(
      `Package store release report is ${ageHours}h older than the release report, above the ${maxAgeHours}h commercial release gate.`
    );
  }
}

function validatePackagedRequiredStoreReleaseSteps(storeReport, steps, failures) {
  const platforms = Array.isArray(storeReport.platforms) ? storeReport.platforms : [];
  const commands = new Set(steps.map((step) => step?.command).filter(Boolean));
  const requiredCommands = [];
  if (!storeReport.options?.skipEnv) {
    if (platforms.includes("android")) {
      requiredCommands.push("npm run android:verify-release-env");
    }
    if (platforms.includes("ios")) {
      requiredCommands.push("npm run ios:verify-release-env");
    }
  }
  if (!storeReport.options?.skipBuild) {
    if (platforms.includes("android")) {
      requiredCommands.push("npm run android:bundleRelease");
    }
    if (platforms.includes("ios")) {
      requiredCommands.push("npm run ios:archive:release", "npm run ios:export:release");
    }
  }
  requiredCommands.push("write distribution artifact manifest");
  for (const command of requiredCommands) {
    const matched =
      command === "write distribution artifact manifest"
        ? steps.some(
            (step) =>
              step?.type === "manifest" ||
              String(step?.command || "").startsWith("write ") ||
              step?.command === "npm run release:distribution-manifest"
          )
        : commands.has(command);
    if (!matched) {
      failures.push(`Package store release report is missing required commercial release step ${JSON.stringify(command)}.`);
    }
  }
}

function validatePackagedStoreReleaseDistributionManifest(storeReport, packagedArtifacts, packageDir, failures) {
  const summary = storeReport.artifacts?.distributionManifest;
  if (!summary?.path || !Number.isFinite(summary.bytes) || summary.bytes <= 0 || !isSha256(summary.sha256)) {
    failures.push("Package store release report distribution manifest evidence is missing or invalid.");
    return;
  }
  const summaryPath = workspaceRecordPath(summary.path);
  if (!summaryPath) {
    failures.push(`Package store release report distribution manifest path must be workspace-relative: ${summary.path || "-"}.`);
    return;
  }
  const packagedDistributionManifest = packagedArtifactFor(packagedArtifacts, distributionArtifactGroup, summaryPath);
  if (!packagedDistributionManifest) {
    failures.push(`Package store release report references distribution manifest not present in package: ${summaryPath}.`);
    return;
  }
  if (packagedDistributionManifest.bytes !== summary.bytes || packagedDistributionManifest.sha256 !== summary.sha256) {
    failures.push(`Package store release report distribution manifest metadata mismatch for ${summaryPath}.`);
    return;
  }

  const distributionManifest = readPackagedJsonArtifact({
    packagedArtifacts,
    group: distributionArtifactGroup,
    sourcePath: summaryPath,
    packageDir,
    label: "store release report distribution manifest",
    failures
  });
  if (!distributionManifest) {
    return;
  }

  const manifestArtifacts = Array.isArray(distributionManifest.artifacts) ? distributionManifest.artifacts : [];
  if (summary.artifactCount !== manifestArtifacts.length) {
    failures.push(`Package store release report distribution manifest artifact count mismatch for ${summaryPath}.`);
  }
  const summaryArtifacts = Array.isArray(summary.artifacts) ? summary.artifacts : [];
  for (const summaryArtifact of summaryArtifacts) {
    if (!workspaceRecordPath(summaryArtifact?.path)) {
      failures.push(`Package store release report distribution artifact summary path must be workspace-relative: ${summaryArtifact?.path || "-"}.`);
    }
  }
  for (const manifestArtifact of manifestArtifacts) {
    const manifestArtifactPath = workspaceRecordPath(manifestArtifact?.path);
    if (!manifestArtifactPath) {
      failures.push(`Package store release report distribution artifact path must be workspace-relative: ${manifestArtifact?.path || "-"}.`);
      continue;
    }
    const summaryArtifact = summaryArtifacts.find((artifact) => artifact?.path === manifestArtifactPath);
    if (!summaryArtifact) {
      failures.push(`Package store release report is missing distribution artifact summary ${manifestArtifactPath}.`);
    } else if (summaryArtifact.bytes !== manifestArtifact.bytes || summaryArtifact.sha256 !== manifestArtifact.sha256) {
      failures.push(`Package store release report distribution artifact metadata mismatch for ${manifestArtifactPath}.`);
    }

    const packagedDistributionArtifact = packagedArtifactFor(packagedArtifacts, distributionArtifactGroup, manifestArtifactPath);
    if (!packagedDistributionArtifact) {
      failures.push(`Package store release report references distribution artifact not present in package: ${manifestArtifactPath}.`);
    } else if (
      packagedDistributionArtifact.bytes !== manifestArtifact.bytes ||
      packagedDistributionArtifact.sha256 !== manifestArtifact.sha256
    ) {
      failures.push(`Package store release report distribution artifact package metadata mismatch for ${manifestArtifactPath}.`);
    }
  }
}

function validateRequiredRecordKinds(records, requirements, label, failures) {
  for (const requirement of requirements) {
    if (!records.some(requirement.test)) {
      failures.push(`Package ${label} is missing ${requirement.label} artifact.`);
    }
  }
}

function validatePackagedManifestRecord(packagedArtifacts, group, record, label, failures) {
  if (!record?.path) {
    failures.push(`Package ${label} contains artifact without path.`);
    return;
  }
  const recordPath = workspaceRecordPath(record.path);
  if (!recordPath) {
    failures.push(`Package ${label} artifact path must be workspace-relative: ${record.path}.`);
    return;
  }
  const packagedArtifact = packagedArtifactFor(packagedArtifacts, group, recordPath);
  if (!packagedArtifact) {
    failures.push(`Package ${label} references artifact not present in package: ${recordPath}.`);
    return;
  }
  if (packagedArtifact.bytes !== record.bytes || packagedArtifact.sha256 !== record.sha256) {
    failures.push(`Package ${label} metadata mismatch for ${recordPath}.`);
  }
}

function packagedArtifactFor(packagedArtifacts, group, sourcePath) {
  return packagedArtifacts.get(`${group}:${sourcePath}`);
}

function validatePackagePrivacy(manifest, packageDir, failures) {
  const entries = [
    manifest.sourceReport,
    manifest.supportBundle,
    ...(manifest.uiEvidence ? [manifest.uiEvidence] : []),
    ...(Array.isArray(manifest.artifacts) ? manifest.artifacts : [])
  ].filter(Boolean);
  const findings = [];
  for (const entry of entries) {
    if (findings.length >= 10 || !isTextEvidencePath(entry.packagedPath)) {
      continue;
    }
    const path = resolve(packageDir, entry.packagedPath);
    if (!safeRelativePath(entry.packagedPath) || !isInsideDirectory(path, packageDir)) {
      continue;
    }
    if (!existsSync(path) || !lstatSync(path).isFile()) {
      continue;
    }
    const content = readFileSync(path, "utf8");
    findings.push(...findSensitiveTextFindings(content, entry.packagedPath).slice(0, 10 - findings.length));
  }
  if (findings.length > 0) {
    failures.push(
      `Release evidence package contains ${findings.length} unredacted sensitive text finding(s): ${findings
        .slice(0, 3)
        .map((finding) => `${finding.path} ${finding.reason}`)
        .join("; ")}.`
    );
  }
}

function validateReportSourcePathsForPackaging(report) {
  const failures = [];
  const supportBundleSourcePath = report?.supportBundle?.absolutePath || report?.supportBundle?.path;
  if (supportBundleSourcePath && !safeSourcePath(supportBundleSourcePath)) {
    failures.push(`Support bundle source path must be absolute or workspace-relative: ${supportBundleSourcePath}.`);
  }

  const evidenceGate = uiEvidenceReportGate(report);
  if (evidenceGate?.evidence?.path && !safeSourcePath(evidenceGate.evidence.path)) {
    failures.push(`Browser UI evidence source path must be absolute or workspace-relative: ${evidenceGate.evidence.path}.`);
  }

  for (const artifact of report?.artifacts?.files || []) {
    if (!workspaceRecordPath(artifact?.path || "")) {
      failures.push(`Release artifact path must be workspace-relative: ${artifact?.path || "-"}.`);
    }
  }
  return failures;
}

const redactedMarker = "[redacted]";
const textEvidenceExtensions = new Set([
  ".bundle",
  ".cjs",
  ".css",
  ".entitlements",
  ".gradle",
  ".html",
  ".js",
  ".jsbundle",
  ".json",
  ".md",
  ".mjs",
  ".pbxproj",
  ".plist",
  ".properties",
  ".ts",
  ".tsx",
  ".txt",
  ".xcprivacy",
  ".xml",
  ".yaml",
  ".yml"
]);
const sensitiveAssignmentPattern =
  /\b([A-Za-z0-9_.-]*(?:access_token|refresh_token|id_token|code_verifier|device_code|client_secret|stream_key|accessToken|refreshToken|idToken|codeVerifier|deviceCode|clientSecret|streamKey|oauthToken|authToken|bearerToken|apiKey|secret))=([^&#\s"']+)/gi;
const sensitiveJsonPattern =
  /["']([A-Za-z0-9_.-]*(?:access_token|refresh_token|id_token|code_verifier|device_code|client_secret|stream_key|accessToken|refreshToken|idToken|codeVerifier|deviceCode|clientSecret|streamKey|oauthToken|authToken|bearerToken|apiKey|authorization|secret))["']\s*:\s*["']([^"']+)["']/gi;
const oauthCallbackCodePattern = /[?&#]code=([^&#\s"']+)/gi;
const authorizationHeaderPattern = /\bAuthorization\s*:\s*(Bearer|OAuth)\s+([^\s,;]+)/gi;
const bearerTokenPattern = /\b(Bearer|OAuth)\s+([A-Za-z0-9._~+/=-]{12,})/g;
const twitchIrcOauthPattern = /\boauth:([A-Za-z0-9._~+/=-]{12,})/gi;
const rtmpPublishUrlPattern = /\brtmps?:\/\/[^\s"'<>]+\/(?:app|live|live2)\/([A-Za-z0-9._~+/=-]{12,}(?:[/?#][^\s"'<>]*)?)/gi;

function countTextEvidenceEntries(entries) {
  return entries.filter((entry) => entry?.packagedPath && isTextEvidencePath(entry.packagedPath)).length;
}

function isTextEvidencePath(path) {
  return textEvidenceExtensions.has(extname(path).toLowerCase());
}

function findSensitiveTextFindings(value, path) {
  const findings = [];
  for (const { pattern, reason, requireTokenShape } of [
    { pattern: sensitiveAssignmentPattern, reason: "contains a sensitive assignment", requireTokenShape: true },
    { pattern: sensitiveJsonPattern, reason: "contains a sensitive JSON value", requireTokenShape: true },
    { pattern: oauthCallbackCodePattern, reason: "contains an OAuth authorization code", requireTokenShape: true },
    { pattern: authorizationHeaderPattern, reason: "contains an Authorization header", requireTokenShape: true },
    { pattern: bearerTokenPattern, reason: "contains a bearer/OAuth token", requireTokenShape: true },
    { pattern: twitchIrcOauthPattern, reason: "contains a Twitch IRC oauth token", requireTokenShape: true },
    { pattern: rtmpPublishUrlPattern, reason: "contains a stream key in an RTMP URL", requireTokenShape: true }
  ]) {
    pattern.lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
      const candidate = match[2] ?? match[1] ?? "";
      if (!isSafeSensitiveValue(candidate) && (!requireTokenShape || looksLikeTokenValue(candidate))) {
        findings.push({ path, reason });
        break;
      }
    }
  }
  return findings;
}

function isSafeSensitiveValue(value) {
  const trimmed = String(value || "").trim();
  return !trimmed || trimmed.includes(redactedMarker);
}

function looksLikeTokenValue(value) {
  const trimmed = String(value || "").trim();
  return (
    trimmed.length >= 12 &&
    /^[A-Za-z0-9._~+/?&=-]+$/.test(trimmed) &&
    /[0-9_~+/\-]/.test(trimmed) &&
    !/=[^=]/.test(trimmed)
  );
}

function uiEvidenceReportGate(report) {
  return (Array.isArray(report?.gates) ? report.gates : []).find((gate) => gate?.label === "Verify browser UI evidence");
}

function hasBrowserUiGate(report) {
  return (Array.isArray(report?.gates) ? report.gates : []).some((gate) => gate?.label === "Verify browser UI");
}

function uiEvidenceSourceFromReport(report) {
  const evidenceGate = uiEvidenceReportGate(report);
  if (evidenceGate?.evidence?.path) {
    return {
      path: evidenceGate.evidence.path,
      sha256: evidenceGate.evidence.sha256
    };
  }
  if (!hasBrowserUiGate(report)) {
    return null;
  }
  const artifacts = Array.isArray(report?.artifacts?.files) ? report.artifacts.files : [];
  const artifact = artifacts.find((candidate) => candidate?.group === "ui" && candidate?.path === ".artifacts/ui-verification.json");
  return artifact?.path
    ? {
        path: artifact.path,
        sha256: artifact.sha256
      }
    : null;
}

function copyEvidenceFile({
  role,
  group = undefined,
  sourcePath,
  packagedPath,
  packageDir,
  expectedBytes = undefined,
  expectedSha256 = undefined
}) {
  const resolvedSourcePath = resolve(sourcePath);
  assertRegularSourceFile(sourcePath, `${role} source`);
  const sourceStat = lstatSync(resolvedSourcePath);
  const sourceBytes = sourceStat.size;
  const sourceSha256 = fileSha256(resolvedSourcePath);
  if (sourceBytes <= 0) {
    throw new Error(`${role} source file is empty: ${sourcePath}.`);
  }
  if (Number.isFinite(expectedBytes) && expectedBytes !== sourceBytes) {
    throw new Error(`${role} source byte count mismatch for ${sourcePath}.`);
  }
  if (expectedSha256 && expectedSha256 !== sourceSha256) {
    throw new Error(`${role} source SHA-256 mismatch for ${sourcePath}.`);
  }

  if (!safeRelativePath(packagedPath)) {
    throw new Error(`${role} packaged path must be package-relative: ${packagedPath}.`);
  }

  const resolvedPackageDir = resolve(packageDir);
  const destination = resolve(resolvedPackageDir, packagedPath);
  if (!isInsideDirectory(destination, resolvedPackageDir)) {
    throw new Error(`${role} packaged path escapes the package directory: ${packagedPath}.`);
  }

  const destinationStat = lstatExisting(destination);
  if (destinationStat) {
    if (destinationStat.isSymbolicLink()) {
      throw new Error(`${role} destination must not be a symbolic link: ${packagedPath}.`);
    }
    if (!destinationStat.isFile()) {
      throw new Error(`${role} destination must point to a file: ${packagedPath}.`);
    }
    if (fileSha256(destination) !== sourceSha256) {
      throw new Error(`${role} destination already exists with different content: ${packagedPath}.`);
    }
  }

  mkdirSync(dirname(destination), { recursive: true });
  assertNoSymlinkedParentDirectories(destination, `${role} destination`);
  copyFileSync(resolvedSourcePath, destination);

  return {
    role,
    ...(group ? { group } : {}),
    sourcePath,
    packagedPath,
    basename: basename(sourcePath),
    bytes: sourceBytes,
    sha256: sourceSha256
  };
}

function validatePackageEntry(entry, packageDir, failures) {
  if (!entry?.role || !entry?.sourcePath || !entry?.packagedPath) {
    failures.push("Package entry is missing role, sourcePath, or packagedPath.");
    return;
  }
  if (!safeRelativePath(entry.packagedPath)) {
    failures.push(`Package entry path must be package-relative: ${entry.packagedPath}.`);
    return;
  }
  const resolvedPath = resolve(packageDir, entry.packagedPath);
  if (!isInsideDirectory(resolvedPath, packageDir)) {
    failures.push(`Package entry escapes the package directory: ${entry.packagedPath}.`);
    return;
  }
  if (!existsSync(resolvedPath)) {
    failures.push(`Package entry file does not exist: ${entry.packagedPath}.`);
    return;
  }
  const packagedFileStat = lstatSync(resolvedPath);
  if (packagedFileStat.isSymbolicLink()) {
    failures.push(`Package entry must not be a symbolic link: ${entry.packagedPath}.`);
    return;
  }
  if (!packagedFileStat.isFile()) {
    failures.push(`Package entry must point to a file: ${entry.packagedPath}.`);
    return;
  }
  const bytes = packagedFileStat.size;
  const sha256 = fileSha256(resolvedPath);
  if (bytes <= 0 || bytes !== entry.bytes || sha256 !== entry.sha256) {
    failures.push(`Release evidence package file metadata mismatch for ${entry.packagedPath}.`);
  }
}

function validateSourceEntry(entry, failures) {
  const sourcePath = sourceEntryRecordPath(entry);
  if (!sourcePath) {
    failures.push(sourceEntryPathFailure(entry));
    return;
  }
  if (!existsSync(resolve(sourcePath))) {
    failures.push(`Package source file does not exist: ${sourcePath}.`);
    return;
  }
  const sourceStat = lstatSync(resolve(sourcePath));
  if (sourceStat.isSymbolicLink()) {
    failures.push(`Package source must not be a symbolic link: ${sourcePath}.`);
    return;
  }
  if (!sourceStat.isFile()) {
    failures.push(`Package source must point to a file: ${sourcePath}.`);
    return;
  }
  const bytes = sourceStat.size;
  const sha256 = fileSha256(resolve(sourcePath));
  if (bytes !== entry.bytes || sha256 !== entry.sha256) {
    failures.push(`Package source metadata mismatch for ${sourcePath}.`);
  }
}

function sourceEntryRecordPath(entry) {
  if (typeof entry?.sourcePath !== "string") {
    return "";
  }
  if (entry.role === "artifact" || entry.role === "uiEvidence") {
    return workspaceRecordPath(entry.sourcePath);
  }
  if (entry.role !== "releaseReport" && entry.role !== "supportBundle") {
    return "";
  }
  if (isAbsolute(entry.sourcePath)) {
    const absolutePath = resolve(entry.sourcePath);
    return absolutePath === entry.sourcePath ? absolutePath : "";
  }
  return workspaceRecordPath(entry.sourcePath);
}

function sourceEntryPathFailure(entry) {
  const sourcePath = entry?.sourcePath || "-";
  if (entry?.role === "artifact" || entry?.role === "uiEvidence") {
    return `Package ${entry.role} source path must be workspace-relative: ${sourcePath}.`;
  }
  if (entry?.role !== "releaseReport" && entry?.role !== "supportBundle") {
    return `Package source entry role is unsupported for source verification: ${entry?.role || "-"}.`;
  }
  return `Package ${entry?.role || "entry"} source path must be canonical absolute or workspace-relative: ${sourcePath}.`;
}

function collectPackageFiles(packageDir, prefix = "") {
  const files = [];
  const directory = resolve(packageDir, prefix);
  for (const dirent of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${dirent.name}` : dirent.name;
    const absolutePath = resolve(packageDir, relativePath);
    if (!isInsideDirectory(absolutePath, packageDir)) {
      continue;
    }
    if (dirent.isDirectory()) {
      files.push(...collectPackageFiles(packageDir, relativePath));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

function ensureNewOrEmptyDirectory(outputDir) {
  const resolvedOutputDir = resolve(outputDir);
  assertNoSymlinkedParentDirectories(outputDir, "Release evidence output directory");
  const outputDirStat = lstatExisting(resolvedOutputDir);
  if (outputDirStat) {
    if (outputDirStat.isSymbolicLink()) {
      throw new Error(`Release evidence output directory must not be a symbolic link: ${outputDir}.`);
    }
    if (!outputDirStat.isDirectory()) {
      throw new Error(`Release evidence output path exists but is not a directory: ${outputDir}.`);
    }
    const existing = readdirSync(resolvedOutputDir);
    if (existing.length > 0) {
      throw new Error(`Release evidence output directory must be empty: ${outputDir}.`);
    }
    return;
  }
  mkdirSync(resolvedOutputDir, { recursive: true });
}

function defaultPackageDir(report) {
  const commit = String(report?.git?.commit || "unknown").slice(0, 12);
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `.artifacts/release-evidence/${commit}-${timestamp}`;
}

function readJsonFile(path, label) {
  try {
    assertRegularSourceFile(path, label);
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw new Error(`Failed to read ${label} ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fileSha256(path) {
  assertRegularSourceFile(path, "File");
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function safeBasename(path) {
  return basename(path).replace(/[^A-Za-z0-9._-]/g, "_") || "support-bundle.json";
}

function workspaceRelativePath(path) {
  const absolutePath = resolve(path);
  const relativePath = relative(cwd(), absolutePath);
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    return "";
  }
  return relativePath;
}

function workspaceRecordPath(path) {
  if (typeof path !== "string") {
    return "";
  }
  const relativePath = workspaceRelativePath(path);
  return relativePath === path ? relativePath : "";
}

function safeSourcePath(path) {
  if (!path) {
    return false;
  }
  if (isAbsolute(path)) {
    return true;
  }
  return Boolean(workspaceRelativePath(path));
}

function safeRelativePath(path) {
  if (!path || isAbsolute(path) || path.split("/").some((part) => part === ".." || part === "")) {
    return false;
  }
  return true;
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function validTimestamp(value) {
  return typeof value === "string" && value.trim() && Number.isFinite(Date.parse(value));
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBuildLabel(value) {
  return stringValue(value).replace(/\s+/g, " ").toLowerCase();
}

function isInsideDirectory(path, directory) {
  const relativePath = relative(resolve(directory), resolve(path));
  return Boolean(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

function assertRegularSourceFile(path, label) {
  assertNoSymlinkedParentDirectories(path, label);
  const stat = lstatExisting(path);
  if (!stat) {
    throw new Error(`${label} file does not exist: ${path}.`);
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${path}.`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} must point to a file: ${path}.`);
  }
}

function assertNoSymlinkedParentDirectories(path, label) {
  const relativePath = workspaceRelativePath(path);
  if (!relativePath) {
    return;
  }
  const parts = relativePath.split(sep).filter(Boolean);
  let currentPath = cwd();
  for (const part of parts.slice(0, -1)) {
    currentPath = join(currentPath, part);
    const stat = lstatExisting(currentPath);
    if (!stat) {
      return;
    }
    const displayPath = relative(cwd(), currentPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} path parent must not be a symbolic link: ${displayPath}.`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`${label} path parent must point to a directory: ${displayPath}.`);
    }
  }
}

function lstatExisting(path) {
  try {
    return lstatSync(resolve(path));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function parseArgs(args) {
  const options = {
    write: false,
    verify: false,
    reportPath: "",
    packageDir: "",
    outputDir: "",
    maxAgeHours: 24,
    allowDirty: false,
    allowCommitMismatch: false,
    verifySources: false,
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--write") {
      options.write = true;
    } else if (arg === "--verify") {
      options.verify = true;
    } else if (arg === "--allow-dirty") {
      options.allowDirty = true;
    } else if (arg === "--allow-commit-mismatch") {
      options.allowCommitMismatch = true;
    } else if (arg === "--verify-sources") {
      options.verifySources = true;
    } else if (arg === "--output") {
      options.outputDir = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--output=")) {
      options.outputDir = arg.slice("--output=".length);
    } else if (arg === "--package") {
      options.packageDir = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--package=")) {
      options.packageDir = arg.slice("--package=".length);
    } else if (arg.startsWith("--max-age-hours=")) {
      options.maxAgeHours = Number(arg.slice("--max-age-hours=".length));
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (!arg.startsWith("--") && options.write && !options.reportPath) {
      options.reportPath = arg;
    } else if (!arg.startsWith("--") && options.verify && !options.packageDir) {
      options.packageDir = arg;
    } else if (!arg.startsWith("--") && !options.write && !options.verify && !options.packageDir) {
      options.packageDir = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.write && options.verify) {
    throw new Error("Use either --write or --verify, not both.");
  }
  if (!options.write && !options.verify && !options.help) {
    options.verify = true;
  }
  if (!Number.isFinite(options.maxAgeHours) || options.maxAgeHours < 1) {
    throw new Error("--max-age-hours must be a positive number.");
  }
  return options;
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run release:evidence-package -- <release-report.json> [--output .artifacts/release-evidence/<id>]",
      "  npm run verify:evidence-package -- <package-dir> [--verify-sources]",
      "",
      "Creates or verifies a standalone release evidence package containing the RC report, support bundle, and hashed release artifacts."
    ].join("\n")
  );
}

function run() {
  try {
    const options = parseArgs(argv.slice(2));
    if (options.help) {
      printUsage();
      return 0;
    }

    if (options.write) {
      const result = createReleaseEvidencePackage({
        reportPath: options.reportPath,
        outputDir: options.outputDir,
        maxAgeHours: options.maxAgeHours,
        allowDirty: options.allowDirty,
        allowCommitMismatch: options.allowCommitMismatch
      });
      console.log(`Wrote release evidence package: ${result.packageDir}`);
      console.log(`Manifest: ${result.manifestPath}`);
      console.log(`Artifacts: ${result.manifest.artifacts.length}`);
      return 0;
    }

    const failures = validateReleaseEvidencePackage({
      packageDir: options.packageDir,
      verifySources: options.verifySources,
      maxAgeHours: options.maxAgeHours
    });
    if (failures.length > 0) {
      console.error("Release evidence package verification failed:");
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      return 1;
    }
    console.log(`Release evidence package verification passed: ${resolve(options.packageDir)}`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  exit(run());
}
