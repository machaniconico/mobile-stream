import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { argv, exit } from "node:process";
import { pathToFileURL } from "node:url";
import {
  releaseConfigArtifactPaths,
  requiredReleaseArtifactGroups,
  requiredReleaseGateLabels
} from "./release-artifact-policy.mjs";

const requiredUiViewportNames = ["desktop", "mobile"];
const requiredReactNativeArtifacts = [".artifacts/rn/main.ios.jsbundle", ".artifacts/rn/index.android.bundle"];
const requiredUiArtifacts = [".artifacts/mobile-live-caster-desktop.png", ".artifacts/mobile-live-caster-mobile.png"];

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
  const failures = validateReport(report, options);

  console.log("MobileLiveCaster Release Report Verification");
  console.log(`Report: ${options.reportPath}`);
  console.log(`Status: ${report.status || "-"}`);
  console.log(`Commit: ${report.git?.commit || "-"}`);
  console.log(`Dirty worktree in report: ${report.git?.dirty ? "yes" : "no"}`);

  if (failures.length > 0) {
    console.error("Release report verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    exit(1);
  }

  const artifactCount = Array.isArray(report.artifacts?.files) ? report.artifacts.files.length : 0;
  console.log(
    `Release report verification passed for ${basename(options.reportPath)} (${report.gates.length} gates, ${artifactCount} artifacts).`
  );
}

function parseArgs(args) {
  const parsed = {
    reportPath: "",
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

  return parsed;
}

export function validateReport(report, options) {
  const failures = [];
  const fail = (message) => failures.push(message);

  if (report?.app !== "MobileLiveCaster" || report?.type !== "release-candidate-verification" || report?.reportVersion !== 1) {
    fail("Report is not a MobileLiveCaster release-candidate-verification reportVersion 1 file.");
  }
  if (report?.status !== "passed") {
    fail(`Report status must be passed, got ${JSON.stringify(report?.status)}.`);
  }

  validateReportAge(report, options, fail);
  validateGitState(report, options, fail);
  validateGates(report, options, fail);
  validateSupportBundle(report, fail);
  validateArtifacts(report, fail);
  validateUiEvidence(report, options, fail);

  return failures;
}

function validateReportAge(report, options, fail) {
  const ageHours = ageInHours(report?.finishedAt, new Date());
  if (ageHours === null) {
    fail("Report finishedAt timestamp is missing or invalid.");
    return;
  }
  if (ageHours > options.maxAgeHours) {
    fail(`Report is ${ageHours}h old, above the ${options.maxAgeHours}h release-report gate.`);
  }
}

function validateGitState(report, options, fail) {
  const reportCommit = stringValue(report?.git?.commit);
  const currentCommit = commandOutput("git", ["rev-parse", "HEAD"]);
  const currentStatus = commandOutput("git", ["status", "--short"]);

  if (!reportCommit) {
    fail("Report git commit is missing.");
  }
  if (currentCommit && reportCommit && currentCommit !== reportCommit && !options.allowCommitMismatch) {
    fail(`Current HEAD ${currentCommit} does not match report commit ${reportCommit}.`);
  }
  if (report?.git?.dirty && !options.allowDirty) {
    fail("Report was generated from a dirty worktree.");
  }
  if (report?.options?.allowDirty && !options.allowDirty) {
    fail("Report was generated with --allow-dirty.");
  }
  if (currentStatus && !options.allowDirty) {
    fail(`Current worktree has uncommitted changes:\n${currentStatus}`);
  }
}

function validateGates(report, options, fail) {
  const gates = Array.isArray(report?.gates) ? report.gates : [];
  if (gates.length === 0) {
    fail("Report has no gate results.");
    return;
  }

  for (const label of requiredReleaseGateLabels) {
    if (!gates.some((gate) => gate?.label === label)) {
      fail(`Report is missing gate ${JSON.stringify(label)}.`);
    }
  }

  const uiGate = gates.find((gate) => gate?.label === "Verify browser UI" || gate?.label === "Verify browser UI evidence");
  if (!uiGate) {
    fail("Report is missing browser UI verification or browser UI evidence gate.");
  }

  for (const gate of gates) {
    const allowedDirtySkip =
      options.allowDirty && gate?.label === "Verify clean git worktree" && gate?.status === "skipped";
    if (gate?.status !== "passed" && !allowedDirtySkip) {
      fail(`Gate ${JSON.stringify(gate?.label || "-")} must be passed, got ${JSON.stringify(gate?.status)}.`);
    }
    if (!Number.isFinite(gate?.durationMs) || gate.durationMs < 0) {
      fail(`Gate ${JSON.stringify(gate?.label || "-")} is missing a valid durationMs.`);
    }
  }
}

function validateSupportBundle(report, fail) {
  const bundle = report?.supportBundle;
  if (!bundle?.sha256 || !isSha256(bundle.sha256)) {
    fail("Support bundle SHA-256 is missing or invalid.");
    return;
  }

  const bundlePath = bundle.absolutePath || bundle.path;
  if (!bundlePath) {
    fail("Support bundle path is missing.");
    return;
  }
  if (!existsSync(resolve(bundlePath))) {
    fail(`Support bundle file does not exist: ${bundlePath}.`);
    return;
  }
  const actual = fileSha256(bundlePath);
  if (actual !== bundle.sha256) {
    fail(`Support bundle SHA-256 mismatch for ${bundlePath}.`);
  }
}

function validateArtifacts(report, fail) {
  const artifacts = Array.isArray(report?.artifacts?.files) ? report.artifacts.files : [];
  if (artifacts.length === 0) {
    fail("Report has no artifact records.");
    return;
  }

  for (const group of requiredReleaseArtifactGroups) {
    if (!artifacts.some((artifact) => artifact?.group === group)) {
      fail(`Report is missing artifact group ${JSON.stringify(group)}.`);
    }
  }

  const artifactPaths = new Set(artifacts.map((artifact) => artifact?.path).filter(Boolean));
  for (const expectedPath of releaseConfigArtifactPaths) {
    if (!artifactPaths.has(expectedPath)) {
      fail(`Report is missing release-config artifact ${expectedPath}.`);
    }
  }
  for (const expectedPath of requiredReactNativeArtifacts) {
    if (!artifactPaths.has(expectedPath)) {
      fail(`Report is missing React Native artifact ${expectedPath}.`);
    }
  }
  for (const expectedPath of requiredUiArtifacts) {
    if (!artifactPaths.has(expectedPath)) {
      fail(`Report is missing UI screenshot artifact ${expectedPath}.`);
    }
  }
  if (!artifactPaths.has("dist/index.html")) {
    fail("Report is missing web artifact dist/index.html.");
  }
  if (!artifacts.some((artifact) => artifact?.group === "web" && /\.js$/.test(artifact.path))) {
    fail("Report is missing a web JavaScript asset artifact.");
  }
  if (!artifacts.some((artifact) => artifact?.group === "web" && /\.css$/.test(artifact.path))) {
    fail("Report is missing a web CSS asset artifact.");
  }

  for (const artifact of artifacts) {
    validateArtifactRecord(artifact, fail);
  }
}

function validateArtifactRecord(artifact, fail) {
  if (!artifact?.group || !artifact?.path) {
    fail("Artifact record is missing group or path.");
    return;
  }
  if (artifact.path.startsWith("/") || artifact.path.startsWith("..")) {
    fail(`Artifact path must be workspace-relative: ${artifact.path}.`);
    return;
  }
  if (!Number.isFinite(artifact.bytes) || artifact.bytes <= 0 || !isSha256(artifact.sha256)) {
    fail(`Artifact ${artifact.path} is missing valid bytes or sha256 metadata.`);
    return;
  }
  if (!existsSync(resolve(artifact.path))) {
    fail(`Artifact file does not exist: ${artifact.path}.`);
    return;
  }

  const content = readFileSync(resolve(artifact.path));
  const actualSha256 = createHash("sha256").update(content).digest("hex");
  if (content.byteLength !== artifact.bytes || actualSha256 !== artifact.sha256) {
    fail(`Artifact metadata mismatch for ${artifact.path}.`);
  }
}

function validateUiEvidence(report, options, fail) {
  const gates = Array.isArray(report?.gates) ? report.gates : [];
  const evidenceGate = gates.find((gate) => gate?.label === "Verify browser UI evidence");

  if (report?.options?.skipUi && !evidenceGate) {
    fail("Report skipped in-process UI verification but does not include a browser UI evidence gate.");
    return;
  }
  if (!evidenceGate) {
    return;
  }

  const evidencePath = evidenceGate.evidence?.path;
  if (!evidencePath) {
    fail("Browser UI evidence gate is missing its evidence path.");
    return;
  }
  if (!existsSync(resolve(evidencePath))) {
    fail(`Browser UI evidence file does not exist: ${evidencePath}.`);
    return;
  }
  if (!isSha256(evidenceGate.evidence?.sha256) || fileSha256(evidencePath) !== evidenceGate.evidence.sha256) {
    fail(`Browser UI evidence SHA-256 mismatch for ${evidencePath}.`);
  }

  const evidence = readJsonFile(evidencePath, "browser UI evidence");
  if (evidence.status !== "passed") {
    fail(`Browser UI evidence status must be passed, got ${JSON.stringify(evidence.status)}.`);
  }
  if (evidence.git?.commit !== report.git?.commit && !options.allowCommitMismatch) {
    fail(`Browser UI evidence commit ${evidence.git?.commit || "-"} does not match report commit ${report.git?.commit || "-"}.`);
  }
  if (evidence.git?.dirty && !options.allowDirty) {
    fail("Browser UI evidence was generated from a dirty worktree.");
  }

  const viewports = Array.isArray(evidence.viewports) ? evidence.viewports : [];
  for (const viewportName of requiredUiViewportNames) {
    const viewport = viewports.find((candidate) => candidate?.name === viewportName);
    if (!viewport) {
      fail(`Browser UI evidence is missing ${viewportName} viewport results.`);
      continue;
    }
    if (viewport.horizontalOverflow !== false) {
      fail(`Browser UI evidence reports horizontal overflow for ${viewportName}.`);
    }
    validateEvidenceScreenshot(viewport, fail);
  }
}

function validateEvidenceScreenshot(viewport, fail) {
  const screenshot = viewport.screenshot;
  if (!screenshot?.path || !Number.isFinite(screenshot.bytes) || screenshot.bytes <= 0 || !isSha256(screenshot.sha256)) {
    fail(`Browser UI evidence for ${viewport.name} is missing valid screenshot metadata.`);
    return;
  }
  if (!existsSync(resolve(screenshot.path))) {
    fail(`Browser UI evidence screenshot does not exist: ${screenshot.path}.`);
    return;
  }
  const content = readFileSync(resolve(screenshot.path));
  const actualSha256 = createHash("sha256").update(content).digest("hex");
  if (content.byteLength !== screenshot.bytes || actualSha256 !== screenshot.sha256) {
    fail(`Browser UI evidence screenshot metadata mismatch for ${screenshot.path}.`);
  }
  if (!isPng(content)) {
    fail(`Browser UI evidence screenshot is not a PNG file: ${screenshot.path}.`);
  }
}

function readJsonFile(path, label) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.status !== 0 || result.error) {
    return "";
  }
  return result.stdout.trim();
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

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isPng(content) {
  return (
    content.length >= 8 &&
    content[0] === 0x89 &&
    content[1] === 0x50 &&
    content[2] === 0x4e &&
    content[3] === 0x47 &&
    content[4] === 0x0d &&
    content[5] === 0x0a &&
    content[6] === 0x1a &&
    content[7] === 0x0a
  );
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run verify:release-report -- <release-candidate-report.json> [--max-age-hours=24] [--allow-dirty] [--allow-commit-mismatch]",
      "",
      "Audits a saved release-candidate verification report against the current workspace files, support bundle, UI evidence, git commit, and artifact hashes.",
      "Use --allow-dirty or --allow-commit-mismatch only for development-only report inspection."
    ].join("\n")
  );
}

function isDirectRun() {
  return argv[1] ? pathToFileURL(resolve(argv[1])).href === import.meta.url : false;
}
