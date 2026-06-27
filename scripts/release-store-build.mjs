import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { argv, cwd, env, exit, platform } from "node:process";
import { pathToFileURL } from "node:url";
import { iosReleasePaths } from "./ios-release-config.mjs";
import {
  createDistributionManifest,
  distributionArtifactManifestPath,
  validateDistributionManifest
} from "./verify-distribution-artifacts.mjs";
import { validateManifestGitProvenance } from "./release-git-provenance.mjs";

export const storeReleaseReportArtifactGroup = "store-release";
export const storeReleaseReportDefaultPath = ".artifacts/store-release-orchestration.json";
export const storeReleaseReportType = "store-release-orchestration";
const defaultAndroidAabPath = "android/app/build/outputs/bundle/release/app-release.aab";

const platformPlan = {
  android: {
    verifyEnvScript: "android:verify-release-env",
    buildScripts: ["android:bundleRelease"]
  },
  ios: {
    verifyEnvScript: "ios:verify-release-env",
    buildScripts: ["ios:archive:release", "ios:export:release"]
  }
};

export function createStoreReleasePlan({ options = {}, envVars = env } = {}) {
  const platforms = options.platforms || ["android", "ios"];
  const iosPaths = iosReleasePaths(envVars);
  const androidAab = options.androidAab || defaultAndroidAabPath;
  const iosIpa = options.iosIpa || findFirstIpa(iosPaths.exportPath) || join(iosPaths.exportPath, "MobileLiveCaster.ipa");
  const steps = [];

  for (const target of platforms) {
    if (!options.skipEnv) {
      steps.push({ type: "npm", script: platformPlan[target].verifyEnvScript });
    }
    if (!options.skipBuild) {
      for (const script of platformPlan[target].buildScripts) {
        steps.push({ type: "npm", script });
      }
    }
  }

  steps.push({
    type: "manifest",
    manifestPath: options.manifestPath || distributionArtifactManifestPath,
    androidAab: platforms.includes("android") ? androidAab : "",
    iosIpa: platforms.includes("ios") ? iosIpa : ""
  });

  return { platforms, steps };
}

function runStoreRelease(options) {
  const plan = createStoreReleasePlan({ options });
  const report = options.reportJsonPath ? createStoreReleaseReport({ plan, options }) : null;
  printPlan(plan, options);

  if (options.dryRun) {
    if (report) {
      for (const step of report.steps) {
        step.status = "planned";
      }
      finishStoreReleaseReport(report, "planned");
      writeStoreReleaseReport(report, options.reportJsonPath);
    }
    return 0;
  }

  recordCleanWorktreeCheck(report, options.allowDirty);
  if (!options.allowDirty && isDirtyWorktree()) {
    const message =
      "Store release orchestration requires a clean worktree. Commit or stash changes first, or use --allow-dirty for development-only evidence.";
    failStoreReleaseReport(report, message);
    writeStoreReleaseReport(report, options.reportJsonPath);
    console.error(message);
    return 1;
  }

  for (let index = 0; index < plan.steps.length; index += 1) {
    const step = plan.steps[index];
    const reportStep = report?.steps[index] || null;
    startStoreReleaseStep(reportStep);
    if (step.type === "npm") {
      const status = runNpmScript(step.script);
      if (status !== 0) {
        const message = `npm run ${step.script} failed with exit code ${status}.`;
        failStoreReleaseStep(reportStep, message, status);
        failStoreReleaseReport(report, message);
        writeStoreReleaseReport(report, options.reportJsonPath);
        return status;
      }
      passStoreReleaseStep(reportStep);
    } else if (step.type === "manifest") {
      try {
        const result = createDistributionManifest({
          androidAab: step.androidAab,
          iosIpa: step.iosIpa,
          manifestPath: step.manifestPath
        });
        if (!options.allowDirty && result.manifest.git.dirty) {
          const message = "Distribution manifest was generated from a dirty worktree.";
          failStoreReleaseStep(reportStep, message, 1);
          failStoreReleaseReport(report, message);
          writeStoreReleaseReport(report, options.reportJsonPath);
          console.error(message);
          return 1;
        }
        if (reportStep) {
          reportStep.result = distributionManifestSummary(result.manifestPath, result.manifest);
          report.artifacts.distributionManifest = reportStep.result;
        }
        passStoreReleaseStep(reportStep);
        console.log(`Wrote distribution artifact manifest: ${result.manifestPath}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failStoreReleaseStep(reportStep, message, 1);
        failStoreReleaseReport(report, message);
        writeStoreReleaseReport(report, options.reportJsonPath);
        console.error(message);
        return 1;
      }
    }
  }

  finishStoreReleaseReport(report, "passed");
  writeStoreReleaseReport(report, options.reportJsonPath);
  return 0;
}

function printPlan(plan, options) {
  console.log("MobileLiveCaster Store Release Orchestration");
  console.log(`Mode: ${options.dryRun ? "dry-run" : "execute"}`);
  console.log(`Platforms: ${plan.platforms.join(", ")}`);
  for (const step of plan.steps) {
    if (step.type === "npm") {
      console.log(`- npm run ${step.script}`);
    } else {
      console.log(`- write distribution manifest: ${step.manifestPath}`);
      if (step.androidAab) {
        console.log(`  android: ${step.androidAab}`);
      }
      if (step.iosIpa) {
        console.log(`  ios: ${step.iosIpa}`);
      }
    }
  }
}

function runNpmScript(script) {
  const executable = platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(executable, ["run", script], { stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

function findFirstIpa(directory) {
  const absoluteDirectory = resolve(directory);
  if (!existsSync(absoluteDirectory)) {
    return "";
  }

  const entries = readdirSync(absoluteDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(absoluteDirectory, entry.name);
    if (entry.isFile() && extname(path) === ".ipa") {
      return relativeToWorkspace(path);
    }
  }
  for (const entry of entries) {
    const path = join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      const nested = findFirstIpa(path);
      if (nested) {
        return nested;
      }
    }
  }
  return "";
}

function createStoreReleaseReport({ plan, options }) {
  const startedAt = new Date().toISOString();
  return {
    reportVersion: 1,
    app: "MobileLiveCaster",
    type: storeReleaseReportType,
    status: "running",
    startedAt,
    finishedAt: null,
    durationMs: null,
    git: gitSnapshot(),
    mode: options.dryRun ? "dry-run" : "execute",
    platforms: plan.platforms,
    options: {
      skipEnv: Boolean(options.skipEnv),
      skipBuild: Boolean(options.skipBuild),
      allowDirty: Boolean(options.allowDirty),
      manifestPath: options.manifestPath,
      androidAab: options.androidAab || "",
      iosIpa: options.iosIpa || ""
    },
    checks: [],
    steps: plan.steps.map(storeReleaseReportStep),
    artifacts: {}
  };
}

function storeReleaseReportStep(step) {
  if (step.type === "npm") {
    return {
      type: "npm",
      label: `npm run ${step.script}`,
      command: `npm run ${step.script}`,
      status: "pending",
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      exitCode: null,
      error: null
    };
  }
  return {
    type: "manifest",
    label: "Write distribution artifact manifest",
    command: `write ${step.manifestPath}`,
    status: "pending",
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    exitCode: null,
    error: null,
    inputs: {
      androidAab: step.androidAab || "",
      iosIpa: step.iosIpa || "",
      manifestPath: step.manifestPath
    },
    result: null
  };
}

function recordCleanWorktreeCheck(report, allowDirty) {
  if (!report) {
    return;
  }
  const now = new Date().toISOString();
  const statusShort = gitStatusShort();
  report.checks.push({
    label: "Verify clean git worktree",
    command: "git status --short",
    status: statusShort ? (allowDirty ? "skipped" : "failed") : "passed",
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
    exitCode: statusShort && !allowDirty ? 1 : 0,
    error: statusShort ? (allowDirty ? "Allowed by --allow-dirty." : "Working tree has uncommitted changes.") : null,
    statusShort
  });
}

function startStoreReleaseStep(step) {
  if (!step) {
    return;
  }
  step.status = "running";
  step.startedAt = new Date().toISOString();
  step._startedAtMs = Date.now();
}

function passStoreReleaseStep(step) {
  if (!step) {
    return;
  }
  step.status = "passed";
  step.exitCode = 0;
  finishStoreReleaseStep(step);
}

function failStoreReleaseStep(step, message, exitCode) {
  if (!step) {
    return;
  }
  step.status = "failed";
  step.exitCode = exitCode;
  step.error = message;
  finishStoreReleaseStep(step);
}

function finishStoreReleaseStep(step) {
  step.finishedAt = new Date().toISOString();
  step.durationMs = Number.isFinite(step._startedAtMs) ? Date.now() - step._startedAtMs : null;
  delete step._startedAtMs;
}

function finishStoreReleaseReport(report, status) {
  if (!report) {
    return;
  }
  report.status = status;
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.parse(report.finishedAt) - Date.parse(report.startedAt);
}

function failStoreReleaseReport(report, message) {
  if (!report) {
    return;
  }
  report.error = message;
  finishStoreReleaseReport(report, "failed");
}

function writeStoreReleaseReport(report, reportJsonPath) {
  if (!report || !reportJsonPath) {
    return;
  }
  const relativeReportPath = workspaceRelativePath(reportJsonPath);
  if (!relativeReportPath) {
    throw new Error(`Store release report output path must be inside the workspace: ${reportJsonPath}`);
  }
  assertWritableRegularPath(relativeReportPath, "Store release report");
  const resolvedPath = resolve(relativeReportPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Store release report written to ${relativeReportPath}`);
}

function distributionManifestSummary(manifestPath, manifest) {
  const relativeManifestPath = workspaceRelativePath(manifestPath);
  if (!relativeManifestPath) {
    throw new Error(`Store release distribution manifest must be inside the workspace: ${manifestPath}`);
  }
  assertRegularSourceFile(relativeManifestPath, "Store release distribution manifest");
  const resolvedPath = resolve(relativeManifestPath);
  const manifestStat = lstatSync(resolvedPath);
  return {
    path: relativeManifestPath,
    bytes: manifestStat.size,
    sha256: fileSha256(resolvedPath),
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

export function readStoreReleaseReport(reportPath = storeReleaseReportDefaultPath) {
  const relativeReportPath = workspaceRelativePath(reportPath);
  if (!relativeReportPath) {
    throw new Error(`Store release report must be inside the workspace: ${reportPath}`);
  }
  assertRegularSourceFile(relativeReportPath, "Store release report");
  return JSON.parse(readFileSync(resolve(relativeReportPath), "utf8"));
}

export function validateStoreReleaseReport(
  report,
  {
    reportPath = storeReleaseReportDefaultPath,
    currentCommit = commandOutput("git", ["rev-parse", "HEAD"]),
    allowDirty = true,
    allowCommitMismatch = true,
    requirePassed = true,
    maxAgeHours = 24,
    now = new Date()
  } = {}
) {
  const failures = [];
  if (report?.app !== "MobileLiveCaster" || report?.type !== storeReleaseReportType || report?.reportVersion !== 1) {
    failures.push("Store release report is not a MobileLiveCaster store-release-orchestration reportVersion 1 file.");
    return failures;
  }
  if (requirePassed && report.status !== "passed") {
    failures.push(`Store release report status must be passed, got ${JSON.stringify(report.status)}.`);
  }
  if (requirePassed && report.mode !== "execute") {
    failures.push(`Store release report mode must be execute, got ${JSON.stringify(report.mode)}.`);
  }
  const finishedAtTimestamp = Date.parse(String(report.finishedAt || ""));
  if (!Number.isFinite(finishedAtTimestamp)) {
    failures.push("Store release report finishedAt timestamp is missing or invalid.");
  } else if (requirePassed) {
    const ageHours = ageInHours(report.finishedAt, now);
    if (ageHours === null) {
      failures.push("Store release report finishedAt timestamp is in the future.");
    } else if (ageHours > maxAgeHours) {
      failures.push(`Store release report is ${ageHours}h old, above the ${maxAgeHours}h commercial release gate.`);
    }
  }
  if (!Number.isFinite(report.durationMs) || report.durationMs < 0) {
    failures.push("Store release report durationMs is missing or invalid.");
  }

  validateManifestGitProvenance(
    report?.git,
    { label: "Store release report", currentCommit, allowDirty, allowCommitMismatch },
    failures
  );
  if (report.options?.allowDirty && !allowDirty) {
    failures.push("Store release report was generated with --allow-dirty.");
  }
  if (requirePassed && report.options?.skipEnv) {
    failures.push("Store release report was generated with --skip-env and cannot be used as commercial release evidence.");
  }
  if (requirePassed && report.options?.skipBuild) {
    failures.push("Store release report was generated with --skip-build and cannot be used as commercial release evidence.");
  }

  const platforms = Array.isArray(report.platforms) ? report.platforms : [];
  if (platforms.length === 0) {
    failures.push("Store release report has no platforms.");
  }

  const steps = Array.isArray(report.steps) ? report.steps : [];
  if (steps.length === 0) {
    failures.push("Store release report has no steps.");
  }
  for (const step of steps) {
    if (!step?.type || !step?.command) {
      failures.push("Store release report step is missing type or command.");
      continue;
    }
    if (requirePassed && step.status !== "passed") {
      failures.push(`Store release report step ${JSON.stringify(step.command)} must be passed, got ${JSON.stringify(step.status)}.`);
    }
    if (step.status === "passed" && step.exitCode !== 0) {
      failures.push(`Store release report step ${JSON.stringify(step.command)} has a non-zero exitCode.`);
    }
    if (step.status !== "pending" && step.status !== "planned" && (!Number.isFinite(step.durationMs) || step.durationMs < 0)) {
      failures.push(`Store release report step ${JSON.stringify(step.command)} is missing a valid durationMs.`);
    }
  }
  validateRequiredStoreReleaseSteps(report, platforms, steps, failures, { requirePassed });

  validateStoreReleaseDistributionManifest(report, reportPath, failures);
  return failures;
}

function validateRequiredStoreReleaseSteps(report, platforms, steps, failures, { requirePassed }) {
  if (!requirePassed) {
    return;
  }
  const commands = new Set(steps.map((step) => step?.command).filter(Boolean));
  const requiredCommands = [];
  for (const target of platforms) {
    const plan = platformPlan[target];
    if (!plan) {
      continue;
    }
    if (!report.options?.skipEnv) {
      requiredCommands.push(`npm run ${plan.verifyEnvScript}`);
    }
    if (!report.options?.skipBuild) {
      requiredCommands.push(...plan.buildScripts.map((script) => `npm run ${script}`));
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
      failures.push(`Store release report is missing required commercial release step ${JSON.stringify(command)}.`);
    }
  }
}

export function collectStoreReleaseArtifactRecords({ reportPath = storeReleaseReportDefaultPath } = {}) {
  const relativeReportPath = workspaceRelativePath(reportPath);
  if (!relativeReportPath || !existsSync(resolve(relativeReportPath))) {
    return [];
  }
  return [createReleaseArtifactRecord(storeReleaseReportArtifactGroup, relativeReportPath)];
}

export function validateStoreReleaseReportInReleaseReport(
  artifacts,
  fail,
  { expectedCommit = "", allowDirty = true, allowCommitMismatch = true, maxAgeHours = 24 } = {}
) {
  const reportArtifact = artifacts.find((artifact) => artifact?.group === storeReleaseReportArtifactGroup);
  if (!reportArtifact) {
    return;
  }

  let report;
  try {
    report = readStoreReleaseReport(reportArtifact.path);
  } catch (error) {
    fail(`Store release report cannot be read: ${error instanceof Error ? error.message : String(error)}.`);
    return;
  }

  for (const failure of validateStoreReleaseReport(report, {
    reportPath: reportArtifact.path,
    currentCommit: expectedCommit,
    allowDirty,
    allowCommitMismatch,
    requirePassed: true,
    maxAgeHours
  })) {
    fail(failure);
  }

  const manifestPath = report.artifacts?.distributionManifest?.path;
  if (!manifestPath) {
    fail("Store release report is missing distribution manifest evidence.");
    return;
  }
  const manifestArtifact = artifacts.find((artifact) => artifact?.group === "distribution" && artifact?.path === manifestPath);
  if (!manifestArtifact) {
    fail(`Release report is missing store release distribution manifest artifact ${manifestPath}.`);
    return;
  }
  if (
    manifestArtifact.bytes !== report.artifacts.distributionManifest.bytes ||
    manifestArtifact.sha256 !== report.artifacts.distributionManifest.sha256
  ) {
    fail(`Store release report distribution manifest metadata mismatch for ${manifestPath}.`);
  }
}

function validateStoreReleaseDistributionManifest(report, reportPath, failures) {
  const summary = report.artifacts?.distributionManifest;
  if (report.status === "planned" && !summary) {
    return;
  }
  if (!summary?.path || !Number.isFinite(summary.bytes) || summary.bytes <= 0 || !isSha256(summary.sha256)) {
    failures.push("Store release report distribution manifest evidence is missing or invalid.");
    return;
  }
  const relativeSummaryPath = workspaceRecordPath(summary.path);
  if (!relativeSummaryPath) {
    failures.push(`Store release report distribution manifest path must be workspace-relative: ${summary.path}.`);
    return;
  }
  if (!validateNoSymlinkedParentDirectories(relativeSummaryPath, "Store release report distribution manifest", failures)) {
    return;
  }
  const summaryStat = lstatExisting(relativeSummaryPath);
  if (!summaryStat) {
    failures.push(`Store release report distribution manifest does not exist: ${relativeSummaryPath}.`);
    return;
  }
  if (summaryStat.isSymbolicLink()) {
    failures.push(`Store release report distribution manifest must not be a symbolic link: ${relativeSummaryPath}.`);
    return;
  }
  if (!summaryStat.isFile()) {
    failures.push(`Store release report distribution manifest must point to a file: ${relativeSummaryPath}.`);
    return;
  }
  const content = readFileSync(resolve(relativeSummaryPath));
  const actualSha256 = createHash("sha256").update(content).digest("hex");
  if (content.byteLength !== summary.bytes || actualSha256 !== summary.sha256) {
    failures.push(`Store release report distribution manifest metadata mismatch for ${relativeSummaryPath}.`);
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(content.toString("utf8"));
  } catch (error) {
    failures.push(`Store release report distribution manifest cannot be read: ${error instanceof Error ? error.message : String(error)}.`);
    return;
  }
  for (const failure of validateDistributionManifest(manifest, {
    manifestPath: relativeSummaryPath,
    allowDirty: true,
    allowCommitMismatch: true
  })) {
    failures.push(`Store release report distribution manifest invalid: ${failure}`);
  }
  const manifestArtifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  if (summary.artifactCount !== manifestArtifacts.length) {
    failures.push(`Store release report distribution manifest artifact count mismatch for ${relativeSummaryPath}.`);
  }
  const summaryArtifacts = Array.isArray(summary.artifacts) ? summary.artifacts : [];
  for (const manifestArtifact of manifestArtifacts) {
    const summaryArtifact = summaryArtifacts.find((artifact) => artifact?.path === manifestArtifact.path);
    if (!summaryArtifact) {
      failures.push(`Store release report is missing distribution artifact summary ${manifestArtifact.path}.`);
      continue;
    }
    if (summaryArtifact.bytes !== manifestArtifact.bytes || summaryArtifact.sha256 !== manifestArtifact.sha256) {
      failures.push(`Store release report distribution artifact metadata mismatch for ${manifestArtifact.path}.`);
    }
  }
  if (reportPath) {
    const relativeReportPath = workspaceRecordPath(reportPath);
    if (!relativeReportPath) {
      failures.push(`Store release report path must be workspace-relative: ${reportPath}.`);
    } else if (!validateNoSymlinkedParentDirectories(relativeReportPath, "Store release report", failures)) {
      return;
    } else {
      const reportStat = lstatExisting(relativeReportPath);
      if (!reportStat) {
        failures.push(`Store release report file does not exist: ${relativeReportPath}.`);
      } else if (reportStat.isSymbolicLink()) {
        failures.push(`Store release report must not be a symbolic link: ${relativeReportPath}.`);
      } else if (!reportStat.isFile()) {
        failures.push(`Store release report must point to a file: ${relativeReportPath}.`);
      }
    }
  }
}

function gitSnapshot() {
  return {
    commit: commandOutput("git", ["rev-parse", "HEAD"]) || null,
    branch: commandOutput("git", ["branch", "--show-current"]) || null,
    dirty: Boolean(gitStatusShort()),
    statusShort: gitStatusShort()
  };
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function fileSha256(path) {
  assertRegularSourceFile(path, "Store release artifact");
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function createReleaseArtifactRecord(group, path) {
  const relativePath = workspaceRelativePath(path);
  if (!relativePath) {
    throw new Error(`Artifact path must be inside the workspace: ${path}`);
  }
  assertRegularSourceFile(relativePath, "Store release artifact");
  const content = readFileSync(resolve(relativePath));
  return {
    group,
    path: relativePath,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
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

function relativeToWorkspace(path) {
  return workspaceRelativePath(path) || path;
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

function assertWritableRegularPath(path, label) {
  assertNoSymlinkedParentDirectories(path, label);
  const stat = lstatExisting(path);
  if (!stat) {
    return;
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} output must not be a symbolic link: ${path}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} output must point to a file: ${path}`);
  }
}

function validateNoSymlinkedParentDirectories(path, label, failures) {
  try {
    assertNoSymlinkedParentDirectories(path, label);
    return true;
  } catch (error) {
    failures.push(`${error instanceof Error ? error.message : String(error)}.`);
    return false;
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

function isDirtyWorktree() {
  return Boolean(gitStatusShort());
}

function gitStatusShort() {
  const result = spawnSync("git", ["status", "--short"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function parseArgs(args) {
  const options = {
    platforms: ["android", "ios"],
    skipEnv: false,
    skipBuild: false,
    dryRun: false,
    allowDirty: false,
    androidAab: "",
    iosIpa: "",
    manifestPath: distributionArtifactManifestPath,
    reportJsonPath: "",
    help: false
  };
  let androidOnly = false;
  let iosOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--android-only") {
      androidOnly = true;
    } else if (arg === "--ios-only") {
      iosOnly = true;
    } else if (arg === "--skip-env") {
      options.skipEnv = true;
    } else if (arg === "--skip-build") {
      options.skipBuild = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--allow-dirty") {
      options.allowDirty = true;
    } else if (arg === "--android-aab") {
      options.androidAab = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--android-aab=")) {
      options.androidAab = arg.slice("--android-aab=".length);
    } else if (arg === "--ios-ipa") {
      options.iosIpa = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--ios-ipa=")) {
      options.iosIpa = arg.slice("--ios-ipa=".length);
    } else if (arg === "--manifest") {
      options.manifestPath = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--manifest=")) {
      options.manifestPath = arg.slice("--manifest=".length);
    } else if (arg === "--report-json") {
      options.reportJsonPath = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--report-json=")) {
      options.reportJsonPath = arg.slice("--report-json=".length);
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (androidOnly && iosOnly) {
    throw new Error("Use only one of --android-only or --ios-only.");
  }
  if (androidOnly) {
    options.platforms = ["android"];
  } else if (iosOnly) {
    options.platforms = ["ios"];
  }
  return options;
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run release:store -- [--android-only|--ios-only] [--dry-run] [--skip-env] [--skip-build] [--allow-dirty]",
      "                         [--android-aab <path>] [--ios-ipa <path>] [--manifest <path>] [--report-json <path>]",
      "",
      "Runs store-release environment checks, production build/export commands, writes the distribution artifact manifest, and optionally writes a store-release orchestration report."
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
    return runStoreRelease(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  exit(run());
}
