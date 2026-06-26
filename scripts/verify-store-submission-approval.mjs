import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { argv, exit } from "node:process";
import { pathToFileURL } from "node:url";
import { validateReport } from "./verify-release-report.mjs";
import {
  distributionArtifactGroup,
  distributionArtifactManifestPath,
  readDistributionManifest,
  validateDistributionManifest
} from "./verify-distribution-artifacts.mjs";
import {
  dashboardEvidenceArtifactGroup,
  dashboardEvidenceManifestPath,
  readDashboardEvidenceManifest,
  validateDashboardEvidenceManifest
} from "./verify-platform-dashboard-evidence.mjs";
import {
  readStoreSubmissionChecklist,
  storeSubmissionArtifactGroup,
  storeSubmissionChecklistPath,
  validateStoreSubmissionChecklist
} from "./verify-store-submission-checklist.mjs";
import {
  storeReleaseReportArtifactGroup,
  validateStoreReleaseReportInReleaseReport
} from "./release-store-build.mjs";

const storeReleaseReportGateLabel = "Verify store release orchestration report";

if (isDirectRun()) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    exit(1);
  });
}

async function main() {
  const options = parseArgs(argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }
  if (!options.reportPath) {
    printUsage();
    throw new Error("\nMissing release-candidate report path.");
  }

  const report = readJsonFile(options.reportPath, "release-candidate report");
  const manifest = readStoreSubmissionChecklist(options.manifestPath);
  const failures = validateStoreSubmissionApproval(report, manifest, options);

  console.log("MobileLiveCaster Store Submission Approval");
  console.log(`Report: ${options.reportPath}`);
  console.log(`Checklist: ${options.manifestPath}`);
  console.log(`Commit: ${report.git?.commit || "-"}`);

  if (failures.length > 0) {
    console.error("Store submission approval failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    exit(1);
  }

  const artifactCount = Array.isArray(report.artifacts?.files)
    ? report.artifacts.files.filter((artifact) => artifact?.group === storeSubmissionArtifactGroup).length
    : 0;
  console.log(
    `Store submission approval passed for ${basename(options.reportPath)} (${artifactCount} store-submission artifacts).`
  );
}

export function validateStoreSubmissionApproval(report, manifest, options) {
  const failures = [];
  const fail = (message) => failures.push(message);

  for (const failure of validateReport(report, options)) {
    fail(failure);
  }
  for (const failure of validateStoreSubmissionChecklist(manifest, {
    manifestPath: options.manifestPath,
    allowDirty: options.allowDirty,
    allowCommitMismatch: options.allowCommitMismatch,
    requireRealDeviceScreenshots: true
  })) {
    fail(failure);
  }

  const reportCommit = stringValue(report?.git?.commit);
  const manifestCommit = stringValue(manifest?.git?.commit);
  if (reportCommit && manifestCommit && reportCommit !== manifestCommit && !options.allowCommitMismatch) {
    fail(`Store submission checklist commit ${manifestCommit} does not match release report commit ${reportCommit}.`);
  }
  validateFinalReleaseArtifactsCaptured(report, options, fail);
  validateStoreArtifactsCaptured(report, manifest, options, fail);
  validateScreenshotBuildMatchesSupportBundle(report, manifest, fail);
  validateStoreScreenshotFreshness(report, manifest, options, fail);

  return failures;
}

function validateFinalReleaseArtifactsCaptured(report, options, fail) {
  const artifacts = Array.isArray(report?.artifacts?.files) ? report.artifacts.files : [];
  const artifactByPath = new Map(artifacts.map((artifact) => [artifact.path, artifact]));

  validateDistributionArtifactsCaptured(artifactByPath, options, fail);
  validateDashboardArtifactsCaptured(artifactByPath, options, fail);
  validateStoreReleaseArtifactsCaptured(report, artifacts, artifactByPath, options, fail);
}

function validateDistributionArtifactsCaptured(artifactByPath, options, fail) {
  const manifestArtifact = requireReportArtifact(
    artifactByPath,
    distributionArtifactGroup,
    distributionArtifactManifestPath,
    "distribution manifest",
    fail
  );
  if (!manifestArtifact) {
    return;
  }

  let manifest = null;
  try {
    manifest = readDistributionManifest(distributionArtifactManifestPath);
  } catch (error) {
    fail(`Distribution manifest cannot be read for store submission approval: ${error instanceof Error ? error.message : String(error)}.`);
    return;
  }

  for (const failure of validateDistributionManifest(manifest, {
    manifestPath: distributionArtifactManifestPath,
    allowDirty: options.allowDirty,
    allowCommitMismatch: options.allowCommitMismatch
  })) {
    fail(failure);
  }

  for (const platform of ["android", "ios"]) {
    if (!manifest.artifacts?.some((artifact) => artifact?.platform === platform)) {
      fail(`Store submission approval requires ${platform} distribution artifact evidence.`);
    }
  }

  validateManifestRecordsCaptured(artifactByPath, distributionArtifactGroup, manifest.artifacts || [], "distribution artifact", fail);
}

function validateDashboardArtifactsCaptured(artifactByPath, options, fail) {
  const manifestArtifact = requireReportArtifact(
    artifactByPath,
    dashboardEvidenceArtifactGroup,
    dashboardEvidenceManifestPath,
    "dashboard evidence manifest",
    fail
  );
  if (!manifestArtifact) {
    return;
  }

  let manifest = null;
  try {
    manifest = readDashboardEvidenceManifest(dashboardEvidenceManifestPath);
  } catch (error) {
    fail(`Dashboard evidence manifest cannot be read for store submission approval: ${error instanceof Error ? error.message : String(error)}.`);
    return;
  }

  for (const failure of validateDashboardEvidenceManifest(manifest, {
    manifestPath: dashboardEvidenceManifestPath,
    allowDirty: options.allowDirty,
    allowCommitMismatch: options.allowCommitMismatch
  })) {
    fail(failure);
  }
  for (const failure of validateDashboardStatusFreshness(manifest, options.maxAgeHours)) {
    fail(failure);
  }

  for (const requirement of [
    { platform: "youtube", kind: "screenshot", label: "YouTube dashboard screenshot" },
    { platform: "youtube", kind: "statusJson", label: "YouTube dashboard status JSON" },
    { platform: "twitch", kind: "screenshot", label: "Twitch dashboard screenshot" },
    { platform: "twitch", kind: "statusJson", label: "Twitch dashboard status JSON" }
  ]) {
    if (!manifest.artifacts?.some((artifact) => artifact?.platform === requirement.platform && artifact?.kind === requirement.kind)) {
      fail(`Store submission approval requires ${requirement.label} evidence.`);
    }
  }

  validateManifestRecordsCaptured(artifactByPath, dashboardEvidenceArtifactGroup, manifest.artifacts || [], "dashboard evidence artifact", fail);
}

function validateStoreReleaseArtifactsCaptured(report, artifacts, artifactByPath, options, fail) {
  const reportArtifact = artifacts.find((artifact) => artifact?.group === storeReleaseReportArtifactGroup);
  if (!reportArtifact) {
    fail("Store submission approval requires store-release orchestration report in the RC report.");
    return;
  }

  const gate = (Array.isArray(report?.gates) ? report.gates : []).find((entry) => entry?.label === storeReleaseReportGateLabel);
  if (!gate) {
    fail("Store submission approval requires store-release orchestration gate in the RC report.");
  } else {
    if (!gate.evidence?.path) {
      fail("Store release orchestration gate evidence path is missing.");
    } else if (gate.evidence.path !== reportArtifact.path) {
      fail(
        `Store release orchestration gate evidence path ${gate.evidence.path} does not match artifact ${reportArtifact.path}.`
      );
    }
    if (!gate.evidence?.sha256) {
      fail("Store release orchestration gate evidence SHA-256 is missing.");
    } else if (gate.evidence.sha256 !== reportArtifact.sha256) {
      fail("Store release orchestration gate evidence SHA-256 does not match the RC report store-release artifact.");
    }
  }

  if (artifactByPath.get(reportArtifact.path)?.group !== storeReleaseReportArtifactGroup) {
    fail(`Store release orchestration report ${reportArtifact.path} is not recorded under group ${storeReleaseReportArtifactGroup}.`);
  }
  validateStoreReleaseReportInReleaseReport(artifacts, fail, {
    expectedCommit: report.git?.commit || "",
    allowDirty: options.allowDirty,
    allowCommitMismatch: options.allowCommitMismatch,
    maxAgeHours: options.maxAgeHours
  });
}

function validateDashboardStatusFreshness(manifest, maxAgeHours) {
  const failures = [];
  const now = new Date();
  for (const artifact of Array.isArray(manifest?.artifacts) ? manifest.artifacts : []) {
    if (artifact?.kind !== "statusJson") {
      continue;
    }
    const ageHours = ageInHours(artifact.checkedAt, now);
    if (ageHours === null) {
      failures.push(`Dashboard evidence status JSON ${artifact.path} checkedAt is in the future or invalid.`);
    } else if (ageHours > maxAgeHours) {
      failures.push(
        `Dashboard evidence status JSON ${artifact.path} is ${ageHours}h old, above the ${maxAgeHours}h store-submission approval gate.`
      );
    }
  }
  return failures;
}

function requireReportArtifact(artifactByPath, expectedGroup, path, label, fail) {
  const artifact = artifactByPath.get(path);
  if (!artifact) {
    fail(`Store submission approval requires ${label} ${path} in the RC report.`);
    return null;
  }
  if (artifact.group !== expectedGroup) {
    fail(`${label} ${path} is recorded under group ${JSON.stringify(artifact.group)}.`);
  }
  return artifact;
}

function validateManifestRecordsCaptured(artifactByPath, expectedGroup, records, label, fail) {
  for (const record of records) {
    const artifact = artifactByPath.get(record.path);
    if (!artifact) {
      fail(`Release report is missing ${label} ${record.path}.`);
      continue;
    }
    if (artifact.group !== expectedGroup) {
      fail(`${label} ${record.path} is recorded under group ${JSON.stringify(artifact.group)}.`);
    }
    if (artifact.bytes !== record.bytes || artifact.sha256 !== record.sha256) {
      fail(`Release report ${label} metadata mismatch for ${record.path}.`);
    }
  }
}

function validateScreenshotBuildMatchesSupportBundle(report, manifest, fail) {
  const supportBundle = readSupportBundleForReport(report, fail);
  if (!supportBundle) {
    return;
  }

  const expectedBuild = stringValue(supportBundle?.summary?.validationEvidenceConsistentAppBuild);
  if (supportBundle?.summary?.validationEvidenceAppBuildMismatch === true) {
    fail("Support bundle validation evidence has an app build mismatch; store screenshots cannot be approved.");
    return;
  }
  if (!expectedBuild) {
    fail("Support bundle validation evidence consistent app build is missing for store submission approval.");
    return;
  }

  for (const screenshot of Array.isArray(manifest?.screenshots) ? manifest.screenshots : []) {
    if (screenshot?.source !== "realDevice") {
      continue;
    }
    const actualBuild = stringValue(screenshot.appBuild);
    if (normalizeBuildLabel(actualBuild) !== normalizeBuildLabel(expectedBuild)) {
      fail(
        `Store submission screenshot ${screenshot.path} app build ${actualBuild || "-"} does not match validation evidence build ${expectedBuild}.`
      );
    }
  }
}

function validateStoreScreenshotFreshness(report, manifest, options, fail) {
  const releaseFinishedAt = Date.parse(String(report?.finishedAt || ""));
  if (!Number.isFinite(releaseFinishedAt)) {
    fail("Release report finishedAt timestamp is missing or invalid for store screenshot freshness approval.");
    return;
  }
  for (const screenshot of Array.isArray(manifest?.screenshots) ? manifest.screenshots : []) {
    if (screenshot?.source !== "realDevice") {
      continue;
    }
    const screenshotCapturedAt = Date.parse(String(screenshot.capturedAt || ""));
    if (!Number.isFinite(screenshotCapturedAt)) {
      continue;
    }
    if (screenshotCapturedAt > releaseFinishedAt) {
      fail(`Store submission screenshot ${screenshot.path} capturedAt is after release report finishedAt.`);
      continue;
    }
    const ageHours = Math.floor((releaseFinishedAt - screenshotCapturedAt) / 3_600_000);
    if (ageHours > options.maxAgeHours) {
      fail(
        `Store submission screenshot ${screenshot.path} is ${ageHours}h older than the release report, above the ${options.maxAgeHours}h store-submission approval gate.`
      );
    }
  }
}

function readSupportBundleForReport(report, fail) {
  const bundlePath = report?.supportBundle?.absolutePath || report?.supportBundle?.path;
  if (!bundlePath) {
    fail("Release report support bundle path is missing for store submission approval.");
    return null;
  }
  try {
    return JSON.parse(readFileSync(resolve(bundlePath), "utf8"));
  } catch (error) {
    fail(`Could not read support bundle for store submission approval: ${error instanceof Error ? error.message : String(error)}.`);
    return null;
  }
}

function validateStoreArtifactsCaptured(report, manifest, options, fail) {
  const artifacts = Array.isArray(report?.artifacts?.files) ? report.artifacts.files : [];
  const records = [manifest.metadata, ...(manifest.screenshots || []), ...(manifest.reviewDocuments || [])].filter(Boolean);
  const artifactByPath = new Map(artifacts.map((artifact) => [artifact.path, artifact]));

  const manifestArtifact = artifactByPath.get(options.manifestPath);
  if (!manifestArtifact) {
    fail(`Release report is missing store submission checklist artifact ${options.manifestPath}.`);
  } else if (manifestArtifact.group !== storeSubmissionArtifactGroup) {
    fail(`Store submission checklist artifact ${options.manifestPath} is recorded under group ${JSON.stringify(manifestArtifact.group)}.`);
  }

  for (const record of records) {
    const artifact = artifactByPath.get(record.path);
    if (!artifact) {
      fail(`Release report is missing store submission artifact ${record.path}.`);
      continue;
    }
    if (artifact.group !== storeSubmissionArtifactGroup) {
      fail(`Store submission artifact ${record.path} is recorded under group ${JSON.stringify(artifact.group)}.`);
    }
    if (artifact.bytes !== record.bytes || artifact.sha256 !== record.sha256) {
      fail(`Release report store submission artifact metadata mismatch for ${record.path}.`);
    }
  }
}

function parseArgs(args) {
  const parsed = {
    reportPath: "",
    manifestPath: storeSubmissionChecklistPath,
    maxAgeHours: 24,
    allowDirty: false,
    allowCommitMismatch: false,
    help: false
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--allow-dirty") {
      parsed.allowDirty = true;
    } else if (arg === "--allow-commit-mismatch") {
      parsed.allowCommitMismatch = true;
    } else if (arg.startsWith("--max-age-hours=")) {
      parsed.maxAgeHours = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--report=")) {
      parsed.reportPath = arg.slice("--report=".length);
    } else if (arg.startsWith("--manifest=")) {
      parsed.manifestPath = arg.slice("--manifest=".length);
    } else if (!arg.startsWith("--") && !parsed.reportPath) {
      parsed.reportPath = arg;
    } else {
      printUsage();
      throw new Error(`\nUnknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(parsed.maxAgeHours) || parsed.maxAgeHours < 1) {
    printUsage();
    throw new Error("\n--max-age-hours must be a positive number.");
  }
  if (!existsSync(resolve(parsed.manifestPath)) && !parsed.help) {
    throw new Error(`Store submission checklist does not exist: ${parsed.manifestPath}`);
  }

  return parsed;
}

function readJsonFile(path, label) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBuildLabel(value) {
  return stringValue(value).replace(/\s+/g, " ").toLowerCase();
}

function ageInHours(value, now) {
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  const ageMs = now.getTime() - timestamp;
  if (ageMs < 0) {
    return null;
  }
  return Math.floor(ageMs / 3_600_000);
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run verify:store-submission-approval -- <release-candidate-report.json>",
      "",
      "Verifies a passed RC report, final store-submission checklist, real-device store screenshots,",
      "matching validation build evidence, store-release orchestration evidence, and that all store-submission artifacts",
      "are captured in the RC report."
    ].join("\n")
  );
}

function isDirectRun() {
  return Boolean(argv[1] && import.meta.url === pathToFileURL(argv[1]).href);
}
