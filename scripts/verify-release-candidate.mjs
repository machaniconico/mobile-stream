import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { argv, env, exit, platform, cwd } from "node:process";
import { releaseConfigArtifactPaths } from "./release-artifact-policy.mjs";
import {
  collectDistributionArtifactRecords,
  distributionArtifactManifestPath,
  readDistributionManifest,
  validateDistributionManifest
} from "./verify-distribution-artifacts.mjs";
import {
  collectDashboardEvidenceArtifactRecords,
  dashboardEvidenceManifestPath,
  readDashboardEvidenceManifest,
  validateDashboardEvidenceManifest
} from "./verify-platform-dashboard-evidence.mjs";
import {
  collectStoreSubmissionArtifactRecords,
  readStoreSubmissionChecklist,
  storeSubmissionChecklistPath,
  validateStoreSubmissionChecklist
} from "./verify-store-submission-checklist.mjs";
import { collectStoreReleaseArtifactRecords, validateStoreReleaseReport } from "./release-store-build.mjs";
import { isLoopbackHttpUrl } from "./release-url-policy.mjs";
import { readPngEvidence } from "./png-evidence.mjs";
import { validateManifestGitProvenance } from "./release-git-provenance.mjs";

const defaultUiUrl = "http://127.0.0.1:5173/";
const devServerTimeoutMs = 30_000;
const defaultReportPath = ".artifacts/release-candidate-verification.json";
const requiredUiTextChecks = ["MobileLiveCaster", "Sources", "Go Live", "Live Setup", "PNGTuber", "RTMPS", "Face input", "Head range"];
const requiredUiViewportNames = ["desktop", "mobile"];
const sourceGates = [
  ["Verify release automation scripts", ["run", "verify:scripts"]],
  ["Verify repository automation safety", ["run", "verify:repo-automation"]],
  ["Verify native release configuration", ["run", "verify:release-config"]],
  ["Run unit tests", ["test"]],
  ["Typecheck web and React Native", ["run", "typecheck"]],
  ["Build web prototype", ["run", "build"]],
  ["Verify web bundle size", ["run", "verify:web-bundle-size"]],
  ["Bundle React Native JavaScript", ["run", "verify:rn"]]
];

const npm = npmExecutable();

class GateError extends Error {
  constructor(message, exitCode) {
    super(message);
    this.exitCode = exitCode;
  }
}

await main().catch((error) => {
  if (error instanceof GateError) {
    console.error(error.message);
    exit(error.exitCode);
  }
  console.error(error instanceof Error ? error.message : String(error));
  exit(1);
});

async function main() {
  const options = parseArgs(argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  if (!options.supportBundlePath) {
    printUsage();
    throw new GateError("\nMissing support bundle path.", 2);
  }

  const supportBundle = readSupportBundle(options.supportBundlePath);
  const report = createReport(options, supportBundle);

  console.log("MobileLiveCaster Release Candidate Verification");
  console.log(`Support bundle: ${options.supportBundlePath}`);
  console.log(`Support bundle SHA-256: ${supportBundle.sha256}`);
  console.log(`Bundle age limit: ${options.maxAgeHours}h`);
  console.log(`Warnings accepted: ${options.allowWarnings ? "yes" : "no"}`);
  console.log(`Dirty worktree accepted: ${options.allowDirty ? "yes" : "no"}`);
  console.log(`Report: ${options.reportJsonPath}`);
  console.log(`Store release report: ${options.storeReleaseReportJsonPath || "not supplied"}`);
  console.log(
    `UI verification: ${
      options.skipUi
        ? `skipped by operator flag with evidence ${options.uiEvidenceJsonPath}`
        : options.uiUrl
          ? `enabled against ${options.uiUrl}`
          : "enabled"
    }`
  );

  try {
    runCleanWorktreeGate(report, options.allowDirty);
    runStoreSubmissionEvidenceRequirementGate(report, options);
    runStoreSubmissionHandoffIntegrityGate(report, options);

    if (options.skipUi) {
      runUiEvidenceGate(report, options);
    }
    if (options.storeReleaseReportJsonPath) {
      runStoreReleaseReportGate(report, options);
    }

    runCommercialSupportBundleGate(report, options);

    for (const [label, args] of sourceGates) {
      runTrackedGate(report, label, args);
    }

    if (!options.skipUi) {
      await runUiGate(report, options.uiUrl);
    }

    finishReport(report, "passed");
    writeReport(report, options.reportJsonPath);
    console.log(`Release candidate verification passed for ${basename(options.supportBundlePath)}.`);
    console.log(`Release candidate report written to ${options.reportJsonPath}.`);
  } catch (error) {
    finishReport(report, "failed", error);
    writeReport(report, options.reportJsonPath);
    console.error(`Release candidate report written to ${options.reportJsonPath}.`);
    throw error;
  }
}

function runCommercialSupportBundleGate(report, options) {
  runTrackedGate(report, "Verify commercial release support bundle", [
    "run",
    "verify:commercial-release-bundle",
    "--",
    options.supportBundlePath,
    `--max-age-hours=${options.maxAgeHours}`,
    ...(options.allowWarnings ? ["--allow-warnings"] : [])
  ]);
}

function runGate(label, args, extraOptions = {}) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(npm, args, {
    stdio: "inherit",
    env,
    ...extraOptions
  });

  if (result.error) {
    throw new GateError(`${label} failed to start: ${result.error.message}`, 1);
  }
  if (result.status !== 0) {
    throw new GateError(`${label} failed with exit code ${result.status ?? "unknown"}.`, result.status ?? 1);
  }
}

function runTrackedGate(report, label, args, extraOptions = {}) {
  const gate = {
    label,
    command: ["npm", ...args].join(" "),
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    exitCode: null,
    error: null
  };
  const startedAt = Date.now();
  report.gates.push(gate);
  try {
    runGate(label, args, extraOptions);
    gate.status = "passed";
    gate.exitCode = 0;
  } catch (error) {
    gate.status = "failed";
    gate.exitCode = error instanceof GateError ? error.exitCode : 1;
    gate.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    gate.finishedAt = new Date().toISOString();
    gate.durationMs = Date.now() - startedAt;
  }
}

function recordSkippedGate(report, label, reason) {
  const now = new Date().toISOString();
  report.gates.push({
    label,
    command: null,
    status: "skipped",
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
    exitCode: null,
    error: reason
  });
}

function runUiEvidenceGate(report, options) {
  const gate = {
    label: "Verify browser UI evidence",
    command: `read ${options.uiEvidenceJsonPath}`,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    exitCode: null,
    error: null,
    evidence: null
  };
  const startedAt = Date.now();
  report.gates.push(gate);

  try {
    const evidence = readJsonFile(options.uiEvidenceJsonPath, "UI verification evidence");
    validateUiEvidence(evidence, {
      currentCommit: report.git.commit,
      allowDirty: options.allowDirty,
      maxAgeHours: options.maxAgeHours
    });
    gate.status = "passed";
    gate.exitCode = 0;
    gate.evidence = {
      path: options.uiEvidenceJsonPath,
      sha256: fileSha256(options.uiEvidenceJsonPath),
      target: evidence.target,
      finishedAt: evidence.finishedAt,
      viewports: evidence.viewports.map((viewport) => ({
        name: viewport.name,
        screenshot: viewport.screenshot
      }))
    };
  } catch (error) {
    gate.status = "failed";
    gate.exitCode = error instanceof GateError ? error.exitCode : 1;
    gate.error = error instanceof Error ? error.message : String(error);
    throw error instanceof GateError ? error : new GateError(gate.error, gate.exitCode);
  } finally {
    gate.finishedAt = new Date().toISOString();
    gate.durationMs = Date.now() - startedAt;
  }
}

function runStoreReleaseReportGate(report, options) {
  const gate = {
    label: "Verify store release orchestration report",
    command: `read ${options.storeReleaseReportJsonPath}`,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    exitCode: null,
    error: null,
    evidence: null
  };
  const startedAt = Date.now();
  report.gates.push(gate);

  try {
    const storeReleaseReport = readJsonFile(options.storeReleaseReportJsonPath, "store release orchestration report");
    const failures = validateStoreReleaseReport(storeReleaseReport, {
      reportPath: options.storeReleaseReportJsonPath,
      currentCommit: report.git.commit,
      allowDirty: options.allowDirty,
      allowCommitMismatch: false,
      requirePassed: true,
      maxAgeHours: options.maxAgeHours
    });
    if (failures.length > 0) {
      throw new GateError(failures.join("\n"), 1);
    }
    gate.status = "passed";
    gate.exitCode = 0;
    gate.evidence = {
      path: options.storeReleaseReportJsonPath,
      sha256: fileSha256(options.storeReleaseReportJsonPath),
      status: storeReleaseReport.status,
      mode: storeReleaseReport.mode,
      platforms: storeReleaseReport.platforms || [],
      distributionManifest: storeReleaseReport.artifacts?.distributionManifest || null
    };
  } catch (error) {
    gate.status = "failed";
    gate.exitCode = error instanceof GateError ? error.exitCode : 1;
    gate.error = error instanceof Error ? error.message : String(error);
    throw error instanceof GateError ? error : new GateError(gate.error, gate.exitCode);
  } finally {
    gate.finishedAt = new Date().toISOString();
    gate.durationMs = Date.now() - startedAt;
  }
}

function runStoreSubmissionEvidenceRequirementGate(report, options) {
  const now = new Date().toISOString();
  const checklistExists = existsSync(storeSubmissionChecklistPath);
  const distributionManifestExists = existsSync(distributionArtifactManifestPath);
  const dashboardManifestExists = existsSync(dashboardEvidenceManifestPath);
  const gate = {
    label: "Verify store submission evidence requirements",
    command: `test -f ${storeSubmissionChecklistPath}`,
    status: "passed",
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
    exitCode: 0,
    error: null,
    evidence: {
      storeSubmissionChecklistPath,
      storeSubmissionChecklistPresent: checklistExists,
      distributionArtifactManifestPath,
      distributionArtifactManifestPresent: distributionManifestExists,
      dashboardEvidenceManifestPath,
      dashboardEvidenceManifestPresent: dashboardManifestExists,
      storeReleaseReportRequired: checklistExists,
      storeReleaseReportSupplied: Boolean(options.storeReleaseReportJsonPath)
    }
  };
  report.gates.push(gate);

  if (!checklistExists) {
    return;
  }

  const failures = [];
  if (!distributionManifestExists) {
    failures.push(
      `Distribution artifact manifest is required when ${storeSubmissionChecklistPath} exists. Run \`npm run release:store -- --report-json <path>\` or \`npm run release:distribution-manifest -- --android-aab <path> --ios-ipa <path>\` before release-candidate verification.`
    );
  }
  if (!dashboardManifestExists) {
    failures.push(
      `Dashboard evidence manifest is required when ${storeSubmissionChecklistPath} exists. Run \`npm run release:dashboard-evidence -- --youtube-screenshot <path> --youtube-screenshot-captured-at <iso> --twitch-screenshot <path> --twitch-screenshot-captured-at <iso> --youtube-json <path> --twitch-json <path>\` before release-candidate verification.`
    );
  }
  if (!options.storeReleaseReportJsonPath) {
    failures.push(
      `Store release orchestration report is required when ${storeSubmissionChecklistPath} exists. Run \`npm run release:store -- --report-json <path>\` and pass --store-release-report-json=<path>.`
    );
  }

  if (failures.length === 0) {
    return;
  }

  gate.status = "failed";
  gate.exitCode = 1;
  gate.error = failures.join("\n");
  throw new GateError(gate.error, 1);
}

function runStoreSubmissionHandoffIntegrityGate(report, options) {
  if (!existsSync(storeSubmissionChecklistPath)) {
    return;
  }

  const gate = {
    label: "Verify store submission handoff evidence integrity",
    command: `read ${distributionArtifactManifestPath} && read ${dashboardEvidenceManifestPath} && read ${storeSubmissionChecklistPath}`,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    exitCode: null,
    error: null,
    evidence: null
  };
  const startedAt = Date.now();
  report.gates.push(gate);

  try {
    const failures = [];
    const distributionManifest = readDistributionManifest(distributionArtifactManifestPath);
    const dashboardManifest = readDashboardEvidenceManifest(dashboardEvidenceManifestPath);
    const storeSubmissionChecklist = readStoreSubmissionChecklist(storeSubmissionChecklistPath);

    failures.push(
      ...validateDistributionManifest(distributionManifest, {
        manifestPath: distributionArtifactManifestPath,
        allowDirty: options.allowDirty,
        allowCommitMismatch: false
      })
    );
    failures.push(...validateDistributionHandoffCoverage(distributionManifest));
    failures.push(
      ...validateDashboardEvidenceManifest(dashboardManifest, {
        manifestPath: dashboardEvidenceManifestPath,
        allowDirty: options.allowDirty,
        allowCommitMismatch: false
      })
    );
    failures.push(...validateDashboardHandoffCoverage(dashboardManifest));
    failures.push(...validateDashboardFreshness(dashboardManifest, options.maxAgeHours));
    failures.push(
      ...validateStoreSubmissionChecklist(storeSubmissionChecklist, {
        manifestPath: storeSubmissionChecklistPath,
        allowDirty: options.allowDirty,
        allowCommitMismatch: false,
        requireRealDeviceScreenshots: true
      })
    );

    if (failures.length > 0) {
      throw new GateError(failures.join("\n"), 1);
    }

    gate.status = "passed";
    gate.exitCode = 0;
    gate.evidence = {
      distributionManifest: manifestEvidence(distributionArtifactManifestPath, distributionManifest),
      dashboardEvidenceManifest: manifestEvidence(dashboardEvidenceManifestPath, dashboardManifest),
      storeSubmissionChecklist: manifestEvidence(storeSubmissionChecklistPath, storeSubmissionChecklist),
      dashboardStatusJson: (dashboardManifest.artifacts || [])
        .filter((artifact) => artifact?.kind === "statusJson")
        .map((artifact) => ({
          platform: artifact.platform,
          path: artifact.path,
          checkedAt: artifact.checkedAt
        }))
    };
  } catch (error) {
    gate.status = "failed";
    gate.exitCode = error instanceof GateError ? error.exitCode : 1;
    gate.error = error instanceof Error ? error.message : String(error);
    throw error instanceof GateError ? error : new GateError(gate.error, gate.exitCode);
  } finally {
    gate.finishedAt = new Date().toISOString();
    gate.durationMs = Date.now() - startedAt;
  }
}

function validateDistributionHandoffCoverage(manifest) {
  const failures = [];
  const artifacts = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
  for (const platformName of ["android", "ios"]) {
    if (!artifacts.some((artifact) => artifact?.platform === platformName)) {
      failures.push(`Store submission handoff requires ${platformName} distribution artifact evidence.`);
    }
  }
  return failures;
}

function validateDashboardHandoffCoverage(manifest) {
  const failures = [];
  const artifacts = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
  for (const requirement of [
    { platform: "youtube", kind: "screenshot", label: "YouTube dashboard screenshot" },
    { platform: "youtube", kind: "statusJson", label: "YouTube dashboard status JSON" },
    { platform: "twitch", kind: "screenshot", label: "Twitch dashboard screenshot" },
    { platform: "twitch", kind: "statusJson", label: "Twitch dashboard status JSON" }
  ]) {
    if (!artifacts.some((artifact) => artifact?.platform === requirement.platform && artifact?.kind === requirement.kind)) {
      failures.push(`Store submission handoff requires ${requirement.label} evidence.`);
    }
  }
  return failures;
}

function validateDashboardFreshness(manifest, maxAgeHours) {
  const failures = [];
  for (const artifact of Array.isArray(manifest?.artifacts) ? manifest.artifacts : []) {
    if (artifact?.kind !== "statusJson") {
      continue;
    }
    const ageHours = ageInHours(artifact.checkedAt, new Date());
    if (ageHours === null) {
      failures.push(`Dashboard evidence status JSON ${artifact.path} checkedAt timestamp is missing or invalid.`);
    } else if (ageHours > maxAgeHours) {
      failures.push(`Dashboard evidence status JSON ${artifact.path} is ${ageHours}h old, above the ${maxAgeHours}h release gate.`);
    }
  }
  return failures;
}

function manifestEvidence(path, manifest) {
  const content = readFileSync(resolve(path));
  return {
    path,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
    generatedAt: manifest.generatedAt || null,
    commit: manifest.git?.commit || null,
    dirty: Boolean(manifest.git?.dirty),
    artifactCount: Array.isArray(manifest.artifacts)
      ? manifest.artifacts.length
      : Array.isArray(manifest.screenshots)
        ? manifest.screenshots.length + (Array.isArray(manifest.reviewDocuments) ? manifest.reviewDocuments.length : 0) + 1
        : 0
  };
}

function runCleanWorktreeGate(report, allowDirty) {
  const now = new Date().toISOString();
  const gate = {
    label: "Verify clean git worktree",
    command: "git status --short",
    status: "passed",
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
    exitCode: 0,
    error: null
  };
  report.gates.push(gate);

  if (!report.git.dirty) {
    return;
  }

  const detail = `Working tree has uncommitted changes:\n${report.git.statusShort}`;
  if (allowDirty) {
    gate.status = "skipped";
    gate.error = `Allowed by --allow-dirty. ${detail}`;
    return;
  }

  gate.status = "failed";
  gate.exitCode = 1;
  gate.error = `${detail}\nCommit or stash source changes before approving a release candidate, or rerun with --allow-dirty for development-only evidence.`;
  throw new GateError(gate.error, 1);
}

async function runUiGate(report, uiUrl) {
  if (uiUrl) {
    runBrowserUiGate(report, {
      ...env,
      MLC_URL: uiUrl
    });
    return;
  }

  console.log("\n==> Start web preview for UI verification");
  const server = spawn(npm, ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
    stdio: ["ignore", "pipe", "pipe"],
    env
  });
  const logs = [];
  const collectLog = (chunk) => {
    logs.push(chunk.toString());
    if (logs.join("").length > 8_000) {
      logs.splice(0, logs.length - 8);
    }
  };
  server.stdout.on("data", collectLog);
  server.stderr.on("data", collectLog);

  try {
    await waitForServer(defaultUiUrl, server, logs);
    runBrowserUiGate(report, {
      ...env,
      MLC_URL: defaultUiUrl
    });
  } finally {
    stopServer(server);
  }
}

function runBrowserUiGate(report, uiEnv) {
  try {
    runTrackedGate(report, "Verify browser UI", ["run", "verify:ui"], {
      env: uiEnv
    });
  } catch (error) {
    if (error instanceof GateError) {
      throw new GateError(
        `${error.message}\nIf this environment blocks nested browser launches, run \`npm run verify:ui\` separately and rerun release-candidate verification with \`--skip-ui --ui-evidence-json=.artifacts/ui-verification.json\`.`,
        error.exitCode
      );
    }
    throw error;
  }
}

async function waitForServer(url, server, logs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < devServerTimeoutMs) {
    if (server.exitCode !== null) {
      throwWithServerLogs("Web preview exited before it became ready.", logs);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep waiting until Vite binds the port.
    }
    await delay(250);
  }

  throwWithServerLogs(`Web preview did not become ready at ${url} within ${devServerTimeoutMs / 1_000}s.`, logs);
}

function stopServer(server) {
  if (server.exitCode !== null) {
    return;
  }
  server.kill("SIGTERM");
}

function throwWithServerLogs(message, logs) {
  const output = logs.join("").trim();
  const hint =
    "If this environment blocks nested dev-server ports, start `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` separately and rerun with `--ui-url=http://127.0.0.1:5173/`.";
  throw new GateError(output ? `${message}\n\nWeb preview output:\n${output}\n\n${hint}` : `${message}\n\n${hint}`, 1);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseArgs(args) {
  const parsed = {
    supportBundlePath: "",
    maxAgeHours: 24,
    allowWarnings: false,
    allowDirty: false,
    skipUi: false,
    uiUrl: "",
    uiEvidenceJsonPath: "",
    storeReleaseReportJsonPath: "",
    reportJsonPath: defaultReportPath,
    help: false
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--allow-warnings") {
      parsed.allowWarnings = true;
    } else if (arg === "--allow-dirty") {
      parsed.allowDirty = true;
    } else if (arg === "--skip-ui") {
      parsed.skipUi = true;
    } else if (arg.startsWith("--ui-url=")) {
      parsed.uiUrl = normalizeUiUrl(arg.slice("--ui-url=".length));
    } else if (arg.startsWith("--ui-evidence-json=")) {
      parsed.uiEvidenceJsonPath = arg.slice("--ui-evidence-json=".length);
    } else if (arg.startsWith("--store-release-report-json=")) {
      parsed.storeReleaseReportJsonPath = arg.slice("--store-release-report-json=".length);
      if (!parsed.storeReleaseReportJsonPath.trim()) {
        printUsage();
        throw new GateError("\n--store-release-report-json must not be empty.", 2);
      }
    } else if (arg.startsWith("--report-json=")) {
      parsed.reportJsonPath = arg.slice("--report-json=".length);
    } else if (arg.startsWith("--max-age-hours=")) {
      parsed.maxAgeHours = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--support-bundle=")) {
      parsed.supportBundlePath = arg.slice("--support-bundle=".length);
    } else if (!arg.startsWith("--") && !parsed.supportBundlePath) {
      parsed.supportBundlePath = arg;
    } else {
      printUsage();
      throw new GateError(`\nUnknown argument: ${arg}`, 2);
    }
  }

  if (!Number.isFinite(parsed.maxAgeHours) || parsed.maxAgeHours < 1) {
    printUsage();
    throw new GateError("\n--max-age-hours must be a positive number.", 2);
  }
  if (!parsed.reportJsonPath.trim()) {
    printUsage();
    throw new GateError("\n--report-json must not be empty.", 2);
  }
  if (parsed.skipUi && !parsed.uiEvidenceJsonPath.trim()) {
    printUsage();
    throw new GateError("\n--skip-ui requires --ui-evidence-json=<path> from a passing `npm run verify:ui` run.", 2);
  }
  if (parsed.storeReleaseReportJsonPath && !parsed.storeReleaseReportJsonPath.trim()) {
    printUsage();
    throw new GateError("\n--store-release-report-json must not be empty.", 2);
  }

  return parsed;
}

function normalizeUiUrl(value) {
  try {
    const url = new URL(value);
    if (!isLoopbackHttpUrl(url.toString())) {
      throw new Error("unsupported host");
    }
    return url.toString();
  } catch {
    printUsage();
    throw new GateError("\n--ui-url must be a loopback http(s) URL, such as http://127.0.0.1:5173/.", 2);
  }
}

function npmExecutable() {
  return platform === "win32" ? "npm.cmd" : "npm";
}

function readSupportBundle(path) {
  try {
    const absolutePath = resolve(path);
    const content = readFileSync(absolutePath);
    return {
      path,
      absolutePath,
      basename: basename(path),
      sha256: createHash("sha256").update(content).digest("hex")
    };
  } catch (error) {
    throw new GateError(
      `Could not read support bundle before running release gates: ${error instanceof Error ? error.message : String(error)}`,
      2
    );
  }
}

function readJsonFile(path, label) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw new GateError(`Could not read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`, 2);
  }
}

function validateUiEvidence(evidence, { currentCommit, allowDirty, maxAgeHours }) {
  if (evidence?.app !== "MobileLiveCaster" || evidence?.type !== "browser-ui-verification" || evidence?.reportVersion !== 1) {
    throw new GateError("UI evidence is not a MobileLiveCaster browser-ui-verification reportVersion 1 file.", 1);
  }
  if (evidence.status !== "passed") {
    throw new GateError(`UI evidence did not pass. Status: ${evidence.status || "-"}.`, 1);
  }
  const ageHours = ageInHours(evidence.finishedAt, new Date());
  if (ageHours === null) {
    throw new GateError("UI evidence finishedAt timestamp is missing or invalid.", 1);
  }
  if (ageHours > maxAgeHours) {
    throw new GateError(`UI evidence is ${ageHours}h old, above the ${maxAgeHours}h release gate.`, 1);
  }
  const gitFailures = [];
  validateManifestGitProvenance(
    evidence.git,
    { label: "UI evidence", currentCommit, allowDirty, allowCommitMismatch: false },
    gitFailures
  );
  if (gitFailures.length > 0) {
    throw new GateError(gitFailures.join("\n"), 1);
  }
  if (!isLoopbackHttpUrl(evidence.target)) {
    throw new GateError("UI evidence target must be a loopback http(s) URL.", 1);
  }

  const viewports = Array.isArray(evidence.viewports) ? evidence.viewports : [];
  for (const viewportName of requiredUiViewportNames) {
    const viewport = viewports.find((candidate) => candidate?.name === viewportName);
    if (!viewport) {
      throw new GateError(`UI evidence is missing ${viewportName} viewport results.`, 1);
    }
    if (viewport.horizontalOverflow !== false) {
      throw new GateError(`UI evidence reports horizontal overflow for ${viewportName}.`, 1);
    }
    validateUiTextChecks(viewport);
    validateUiScreenshot(viewport);
  }
}

function validateUiTextChecks(viewport) {
  const checks = Array.isArray(viewport.requiredTextChecks) ? viewport.requiredTextChecks : [];
  for (const text of requiredUiTextChecks) {
    const check = checks.find((candidate) => candidate?.text === text);
    if (!check || !Number.isFinite(check.count) || check.count <= 0) {
      throw new GateError(`UI evidence for ${viewport.name} is missing text ${JSON.stringify(text)}.`, 1);
    }
  }
}

function validateUiScreenshot(viewport) {
  const screenshot = viewport.screenshot;
  if (!screenshot?.path || !screenshot.sha256 || !Number.isFinite(screenshot.bytes) || screenshot.bytes <= 0) {
    throw new GateError(`UI evidence for ${viewport.name} is missing screenshot artifact metadata.`, 1);
  }
  const absolutePath = resolve(screenshot.path);
  if (!existsSync(absolutePath)) {
    throw new GateError(`UI evidence screenshot does not exist: ${screenshot.path}.`, 1);
  }
  const content = readFileSync(absolutePath);
  const actualSha256 = createHash("sha256").update(content).digest("hex");
  if (content.byteLength !== screenshot.bytes || actualSha256 !== screenshot.sha256) {
    throw new GateError(`UI evidence screenshot hash mismatch for ${screenshot.path}.`, 1);
  }
  const pngEvidence = readPngEvidence(content);
  if (!pngEvidence.valid) {
    throw new GateError(`UI evidence screenshot is not a structurally valid PNG file: ${screenshot.path} (${pngEvidence.reason}).`, 1);
  }
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

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function createReport(options, supportBundle) {
  const startedAt = new Date().toISOString();
  return {
    reportVersion: 1,
    app: "MobileLiveCaster",
    type: "release-candidate-verification",
    status: "running",
    startedAt,
    finishedAt: null,
    durationMs: null,
    environment: {
      node: process.version,
      platform,
      npm: commandOutput(npm, ["--version"]) || null
    },
    git: {
      commit: commandOutput("git", ["rev-parse", "HEAD"]) || null,
      branch: commandOutput("git", ["branch", "--show-current"]) || null,
      dirty: Boolean(commandOutput("git", ["status", "--short"])),
      statusShort: commandOutput("git", ["status", "--short"]) || ""
    },
    options: {
      maxAgeHours: options.maxAgeHours,
      allowWarnings: options.allowWarnings,
      allowDirty: options.allowDirty,
      skipUi: options.skipUi,
      uiUrl: options.uiUrl || null,
      uiEvidenceJson: options.uiEvidenceJsonPath || null,
      storeReleaseReportJson: options.storeReleaseReportJsonPath || null
    },
    supportBundle,
    artifacts: {
      generatedAt: null,
      files: []
    },
    gates: [],
    error: null
  };
}

function finishReport(report, status, error = null) {
  report.status = status;
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.parse(report.finishedAt) - Date.parse(report.startedAt);
  report.artifacts = {
    generatedAt: report.finishedAt,
    files: collectReleaseArtifacts({
      storeReleaseReportJsonPath: report.options.storeReleaseReportJson || ""
    })
  };
  report.error = error ? (error instanceof Error ? error.message : String(error)) : null;
}

function writeReport(report, path) {
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`);
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

function collectReleaseArtifacts({ storeReleaseReportJsonPath = "" } = {}) {
  return [
    ...collectFiles("release-config", releaseConfigArtifactPaths),
    ...collectFiles("web", ["dist/index.html"]),
    ...collectDirectoryFiles("web", "dist/assets", (path) => path.endsWith(".js") || path.endsWith(".css")),
    ...collectFiles("react-native", [".artifacts/rn/main.ios.jsbundle", ".artifacts/rn/index.android.bundle"]),
    ...collectDistributionArtifactRecords(),
    ...collectDashboardEvidenceArtifactRecords(),
    ...collectStoreSubmissionArtifactRecords(),
    ...collectStoreReleaseArtifactRecords({ reportPath: storeReleaseReportJsonPath }),
    ...collectFiles("ui", [
      ".artifacts/ui-verification.json",
      ".artifacts/mobile-live-caster-desktop.png",
      ".artifacts/mobile-live-caster-mobile.png"
    ])
  ].sort((left, right) => left.path.localeCompare(right.path));
}

function collectFiles(group, paths) {
  return paths.flatMap((path) => (existsSync(path) ? [createArtifactRecord(group, path)] : []));
}

function collectDirectoryFiles(group, directory, include) {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory)
    .map((entry) => join(directory, entry))
    .filter((path) => statSync(path).isFile() && include(path))
    .map((path) => createArtifactRecord(group, path));
}

function createArtifactRecord(group, path) {
  const absolutePath = resolve(path);
  const content = readFileSync(absolutePath);
  return {
    group,
    path: relative(cwd(), absolutePath),
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run verify:release-candidate -- <support-bundle.json> [--max-age-hours=24] [--allow-warnings] [--allow-dirty] [--report-json=.artifacts/release-candidate-verification.json] [--ui-url=http://127.0.0.1:5173/] [--skip-ui --ui-evidence-json=.artifacts/ui-verification.json] [--store-release-report-json=.artifacts/store-release-orchestration.json]",
      "",
      "Runs source release gates, browser UI verification, React Native bundle verification, and the commercial support-bundle gate.",
      "Writes a JSON evidence report for release approval audit trails.",
      "Fails on uncommitted source changes unless --allow-dirty is provided for development-only evidence.",
      "Use --ui-url when a preview server is already running.",
      "The --ui-url value and skipped UI evidence target must be loopback preview URLs: localhost, 127.0.0.1, or [::1].",
      "Use --skip-ui only when Chrome is unavailable and pass --ui-evidence-json from a separate passing `npm run verify:ui` run."
    ].join("\n")
  );
}
