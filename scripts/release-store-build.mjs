import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { argv, cwd, env, exit, platform } from "node:process";
import { pathToFileURL } from "node:url";
import { iosReleasePaths } from "./ios-release-config.mjs";
import { createDistributionManifest, distributionArtifactManifestPath } from "./verify-distribution-artifacts.mjs";

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
    type: "store-release-orchestration",
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
  const resolvedPath = resolve(reportJsonPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Store release report written to ${reportJsonPath}`);
}

function distributionManifestSummary(manifestPath, manifest) {
  const resolvedPath = resolve(manifestPath);
  return {
    path: manifestPath,
    bytes: statSync(resolvedPath).size,
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
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function relativeToWorkspace(path) {
  return resolve(path).startsWith(resolve(cwd())) ? resolve(path).slice(resolve(cwd()).length + 1) : path;
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
