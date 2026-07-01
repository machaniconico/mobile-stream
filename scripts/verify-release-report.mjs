import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { argv, cwd, exit } from "node:process";
import { pathToFileURL } from "node:url";
import {
  releaseConfigArtifactPaths,
  requiredReleaseArtifactGroups,
  requiredReleaseGateLabels
} from "./release-artifact-policy.mjs";
import { validateDistributionArtifactsInReport } from "./verify-distribution-artifacts.mjs";
import { validateDashboardEvidenceInReport } from "./verify-platform-dashboard-evidence.mjs";
import { storeSubmissionArtifactGroup, validateStoreSubmissionInReport } from "./verify-store-submission-checklist.mjs";
import { validateStoreReleaseReportInReleaseReport } from "./release-store-build.mjs";
import { physicalDevicePreflightArtifactGroup, validatePhysicalDevicePreflightReport } from "./verify-physical-devices.mjs";
import { createCommercialReleaseGate } from "./verify-commercial-release-bundle.mjs";
import { isLoopbackHttpUrl } from "./release-url-policy.mjs";
import { readPngEvidence } from "./png-evidence.mjs";
import { validateManifestGitProvenance } from "./release-git-provenance.mjs";
import { requiredBrowserUiTextChecks } from "./browser-ui-required-text.mjs";

const requiredUiViewportNames = ["desktop", "mobile"];
const defaultBrowserUiEvidencePath = ".artifacts/ui-verification.json";
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
  if (report?.options?.allowWarnings) {
    fail("Report was generated with --allow-warnings and cannot be used for commercial approval.");
  }

  validateReportAge(report, options, fail);
  validateGitState(report, options, fail);
  validateGates(report, options, fail);
  validateSupportBundle(report, options, fail);
  validateArtifacts(report, options, fail);
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
  const currentCommit = commandOutput("git", ["rev-parse", "HEAD"]);
  const currentStatus = commandOutput("git", ["status", "--short"]);

  validateManifestGitProvenance(
    report?.git,
    { label: "Report", currentCommit, allowDirty: options.allowDirty, allowCommitMismatch: options.allowCommitMismatch },
    failuresFrom(fail)
  );
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

function validateSupportBundle(report, options, fail) {
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
  if (!validateRegularSourceFile(bundlePath, "Support bundle", fail)) {
    return;
  }
  const actual = fileSha256(bundlePath);
  if (actual !== bundle.sha256) {
    fail(`Support bundle SHA-256 mismatch for ${bundlePath}.`);
    return;
  }

  let supportBundle;
  try {
    supportBundle = readJsonFile(bundlePath, "support bundle");
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return;
  }

  const releaseFinishedAt = Date.parse(String(report?.finishedAt || ""));
  if (!Number.isFinite(releaseFinishedAt)) {
    return;
  }
  const gate = createCommercialReleaseGate(supportBundle, {
    now: new Date(releaseFinishedAt),
    maxBundleAgeHours: options.maxAgeHours,
    allowWarnings: false
  });
  if (gate.canRelease) {
    return;
  }

  fail(`Release report support bundle commercial release gate must be ready, got ${gate.status}: ${gate.summary}`);
  const blockingIssues = gate.issues.filter((issue) => issue.severity === "fail");
  for (const issue of (blockingIssues.length > 0 ? blockingIssues : gate.issues).slice(0, 5)) {
    fail(`Release report support bundle ${issue.code}: ${issue.detail}`);
  }
}

function validateArtifacts(report, options, fail) {
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
  validateDistributionArtifactsInReport(artifacts, fail);
  validateDashboardEvidenceInReport(artifacts, fail);
  validateStoreSubmissionInReport(artifacts, fail);
  validateStoreReleaseReportInReleaseReport(artifacts, fail, {
    expectedCommit: report.git?.commit || "",
    allowDirty: options.allowDirty,
    allowCommitMismatch: options.allowCommitMismatch,
    maxAgeHours: options.maxAgeHours
  });
  validatePhysicalDevicePreflightInReport(report, artifacts, options, fail);
}

function validatePhysicalDevicePreflightInReport(report, artifacts, options, fail) {
  const hasStoreSubmissionEvidence = artifacts.some((artifact) => artifact?.group === storeSubmissionArtifactGroup);
  const preflightArtifact = artifacts.find((artifact) => artifact?.group === physicalDevicePreflightArtifactGroup);
  if (hasStoreSubmissionEvidence && !preflightArtifact) {
    fail("Store-submission release reports must include physical-device preflight evidence.");
    return;
  }
  if (report?.options?.physicalDevicePreflightJson && !preflightArtifact) {
    fail("Report options include physical-device preflight evidence but artifacts are missing the physical-device-preflight group.");
    return;
  }
  if (!preflightArtifact) {
    return;
  }
  if (!preflightArtifact.path) {
    fail("Physical device preflight artifact is missing its path.");
    return;
  }
  let preflight;
  try {
    preflight = readJsonFile(preflightArtifact.path, "physical device preflight");
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return;
  }
  for (const failure of validatePhysicalDevicePreflightReport(preflight, {
    reportPath: preflightArtifact.path,
    currentCommit: stringValue(report?.git?.commit),
    allowDirty: options.allowDirty,
    maxAgeHours: options.maxAgeHours
  })) {
    fail(failure);
  }
  validatePhysicalDevicePreflightGateEvidence(report, preflight, fail);
}

function validatePhysicalDevicePreflightGateEvidence(report, preflight, fail) {
  const gate = (Array.isArray(report?.gates) ? report.gates : []).find(
    (entry) => entry?.label === "Verify physical device preflight"
  );
  if (!gate) {
    fail("Release report is missing the physical-device preflight gate record.");
    return;
  }
  if (gate.status !== "passed") {
    fail(`Physical-device preflight gate must be passed, got ${JSON.stringify(gate.status)}.`);
  }
  const evidence = gate.evidence;
  if (!evidence || typeof evidence !== "object") {
    fail("Physical-device preflight gate evidence is missing.");
    return;
  }
  const runbook = evidence.runbook;
  if (!runbook || typeof runbook !== "object") {
    fail("Physical-device preflight gate evidence is missing runbook summary.");
    return;
  }
  const steps = Array.isArray(preflight?.runbook?.steps) ? preflight.runbook.steps : [];
  const expectedSummary = typeof preflight?.runbook?.summary === "string" ? preflight.runbook.summary : "";
  const expectedStepIds = steps.map((step) => String(step?.id || "")).filter(Boolean);
  const readyStepCount = steps.filter((step) => step?.status === "ready-to-run" && step?.deviceReady === true).length;
  const waitingStepCount = steps.filter((step) => step?.status === "waiting-for-device" || step?.deviceReady !== true).length;

  if (runbook.summary !== expectedSummary) {
    fail("Physical-device preflight gate runbook summary does not match the preflight artifact.");
  }
  if (runbook.stepCount !== steps.length) {
    fail("Physical-device preflight gate runbook step count does not match the preflight artifact.");
  }
  if (runbook.readyStepCount !== readyStepCount) {
    fail("Physical-device preflight gate runbook ready-step count does not match the preflight artifact.");
  }
  if (runbook.waitingStepCount !== waitingStepCount) {
    fail("Physical-device preflight gate runbook waiting-step count does not match the preflight artifact.");
  }
  if (JSON.stringify(runbook.stepIds || []) !== JSON.stringify(expectedStepIds)) {
    fail("Physical-device preflight gate runbook step IDs do not match the preflight artifact.");
  }
}

function validateArtifactRecord(artifact, fail) {
  if (!artifact?.group || !artifact?.path) {
    fail("Artifact record is missing group or path.");
    return;
  }
  const artifactPath = workspaceRecordPath(artifact.path);
  if (!artifactPath) {
    fail(`Artifact path must be workspace-relative: ${artifact.path}.`);
    return;
  }
  if (!Number.isFinite(artifact.bytes) || artifact.bytes <= 0 || !isSha256(artifact.sha256)) {
    fail(`Artifact ${artifactPath} is missing valid bytes or sha256 metadata.`);
    return;
  }
  if (!existsSync(resolve(artifactPath))) {
    fail(`Artifact file does not exist: ${artifactPath}.`);
    return;
  }
  if (!validateRegularSourceFile(artifactPath, "Artifact", fail)) {
    return;
  }

  const content = readFileSync(resolve(artifactPath));
  const actualSha256 = createHash("sha256").update(content).digest("hex");
  if (content.byteLength !== artifact.bytes || actualSha256 !== artifact.sha256) {
    fail(`Artifact metadata mismatch for ${artifactPath}.`);
  }
}

function validateUiEvidence(report, options, fail) {
  const gates = Array.isArray(report?.gates) ? report.gates : [];
  const evidenceGate = gates.find((gate) => gate?.label === "Verify browser UI evidence");
  const browserUiGate = gates.find((gate) => gate?.label === "Verify browser UI");

  if (report?.options?.skipUi && !evidenceGate) {
    fail("Report skipped in-process UI verification but does not include a browser UI evidence gate.");
    return;
  }
  if (!evidenceGate && !browserUiGate) {
    return;
  }

  const evidenceSource = evidenceGate?.evidence || browserUiEvidenceArtifact(report);
  const evidencePath = evidenceSource?.path;
  if (!evidencePath) {
    fail(
      evidenceGate
        ? "Browser UI evidence gate is missing its evidence path."
        : `Browser UI verification is missing evidence artifact ${defaultBrowserUiEvidencePath}.`
    );
    return;
  }
  const relativeEvidencePath = workspaceRecordPath(evidencePath);
  if (!relativeEvidencePath) {
    fail(`Browser UI evidence path must be workspace-relative: ${evidencePath}.`);
    return;
  }
  if (!existsSync(resolve(relativeEvidencePath))) {
    fail(`Browser UI evidence file does not exist: ${relativeEvidencePath}.`);
    return;
  }
  if (!validateRegularSourceFile(relativeEvidencePath, "Browser UI evidence", fail)) {
    return;
  }
  if (!isSha256(evidenceSource.sha256) || fileSha256(relativeEvidencePath) !== evidenceSource.sha256) {
    fail(`Browser UI evidence SHA-256 mismatch for ${relativeEvidencePath}.`);
  }

  const evidence = readJsonFile(relativeEvidencePath, "browser UI evidence");
  if (evidence?.app !== "MobileLiveCaster" || evidence?.type !== "browser-ui-verification" || evidence?.reportVersion !== 1) {
    fail("Browser UI evidence is not a MobileLiveCaster browser-ui-verification reportVersion 1 file.");
  }
  if (evidence.status !== "passed") {
    fail(`Browser UI evidence status must be passed, got ${JSON.stringify(evidence.status)}.`);
  }
  const evidenceAgeHours = ageInHours(evidence.finishedAt, new Date());
  if (evidenceAgeHours === null) {
    fail("Browser UI evidence finishedAt timestamp is missing or invalid.");
  } else if (evidenceAgeHours > options.maxAgeHours) {
    fail(`Browser UI evidence is ${evidenceAgeHours}h old, above the ${options.maxAgeHours}h release-report gate.`);
  }
  validateManifestGitProvenance(
    evidence.git,
    {
      label: "Browser UI evidence",
      currentCommit: stringValue(report?.git?.commit),
      allowDirty: options.allowDirty,
      allowCommitMismatch: options.allowCommitMismatch
    },
    failuresFrom(fail)
  );
  if (!isLoopbackHttpUrl(evidence.target)) {
    fail("Browser UI evidence target must be a loopback http(s) URL.");
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
    validateEvidenceTextChecks(viewport, fail);
    validateEvidenceQuickTextInteraction(viewport, fail);
    validateEvidenceScreenshot(viewport, fail);
  }
}

function browserUiEvidenceArtifact(report) {
  const artifacts = Array.isArray(report?.artifacts?.files) ? report.artifacts.files : [];
  return artifacts.find((artifact) => artifact?.group === "ui" && artifact?.path === defaultBrowserUiEvidencePath);
}

function validateEvidenceTextChecks(viewport, fail) {
  const checks = Array.isArray(viewport.requiredTextChecks) ? viewport.requiredTextChecks : [];
  for (const text of requiredBrowserUiTextChecks) {
    const check = checks.find((candidate) => candidate?.text === text);
    if (!check || !Number.isFinite(check.count) || check.count <= 0) {
      fail(`Browser UI evidence for ${viewport.name} is missing text ${JSON.stringify(text)}.`);
    }
  }
}

function validateEvidenceQuickTextInteraction(viewport, fail) {
  const proof = viewport.quickTextInteraction;
  if (
    !proof ||
    typeof proof.text !== "string" ||
    typeof proof.programText !== "string" ||
    typeof proof.previewText !== "string"
  ) {
    fail(`Browser UI evidence for ${viewport.name} is missing Quick Text interaction proof.`);
    return;
  }
  if (!proof.text.includes(viewport.name) || !proof.programText.includes(proof.text) || !proof.previewText.includes(proof.text)) {
    fail(`Browser UI evidence for ${viewport.name} has invalid Quick Text interaction proof.`);
  }
}

function validateEvidenceScreenshot(viewport, fail) {
  const screenshot = viewport.screenshot;
  if (!screenshot?.path || !Number.isFinite(screenshot.bytes) || screenshot.bytes <= 0 || !isSha256(screenshot.sha256)) {
    fail(`Browser UI evidence for ${viewport.name} is missing valid screenshot metadata.`);
    return;
  }
  const screenshotPath = workspaceRecordPath(screenshot.path);
  if (!screenshotPath) {
    fail(`Browser UI evidence screenshot path must be workspace-relative: ${screenshot.path}.`);
    return;
  }
  if (!existsSync(resolve(screenshotPath))) {
    fail(`Browser UI evidence screenshot does not exist: ${screenshotPath}.`);
    return;
  }
  if (!validateRegularSourceFile(screenshotPath, "Browser UI evidence screenshot", fail)) {
    return;
  }
  const content = readFileSync(resolve(screenshotPath));
  const actualSha256 = createHash("sha256").update(content).digest("hex");
  if (content.byteLength !== screenshot.bytes || actualSha256 !== screenshot.sha256) {
    fail(`Browser UI evidence screenshot metadata mismatch for ${screenshotPath}.`);
  }
  const pngEvidence = readPngEvidence(content);
  if (!pngEvidence.valid) {
    fail(`Browser UI evidence screenshot is not a structurally valid PNG file: ${screenshotPath} (${pngEvidence.reason}).`);
  }
}

function readJsonFile(path, label) {
  try {
    assertRegularSourceFile(path, label);
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function failuresFrom(fail) {
  return {
    push(message) {
      fail(message);
    }
  };
}

function fileSha256(path) {
  assertRegularSourceFile(path, "File");
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function validateRegularSourceFile(path, label, fail) {
  try {
    assertRegularSourceFile(path, label);
    return true;
  } catch (error) {
    fail(`${error instanceof Error ? error.message : String(error)}.`);
    return false;
  }
}

function assertRegularSourceFile(path, label) {
  assertNoSymlinkedParentDirectories(path, label);
  const stat = lstatExisting(path);
  if (!stat) {
    throw new Error(`${label} does not exist: ${path}`);
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${path}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} must point to a file: ${path}`);
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
      throw new Error(`${label} path parent must not be a symbolic link: ${displayPath}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`${label} path parent must point to a directory: ${displayPath}`);
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

function workspaceRelativePath(path) {
  if (!path) {
    return "";
  }
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
