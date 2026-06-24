import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { argv, exit } from "node:process";
import { pathToFileURL } from "node:url";
import { validateReport } from "./verify-release-report.mjs";
import {
  readStoreSubmissionChecklist,
  storeSubmissionArtifactGroup,
  storeSubmissionChecklistPath,
  validateStoreSubmissionChecklist
} from "./verify-store-submission-checklist.mjs";

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
  validateStoreArtifactsCaptured(report, manifest, options, fail);

  return failures;
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

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run verify:store-submission-approval -- <release-candidate-report.json>",
      "",
      "Verifies a passed RC report, final store-submission checklist, real-device store screenshots,",
      "and that all store-submission artifacts are captured in the RC report."
    ].join("\n")
  );
}

function isDirectRun() {
  return Boolean(argv[1] && import.meta.url === pathToFileURL(argv[1]).href);
}
