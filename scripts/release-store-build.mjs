import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
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
  printPlan(plan, options);

  if (options.dryRun) {
    return 0;
  }

  if (!options.allowDirty && isDirtyWorktree()) {
    console.error("Store release orchestration requires a clean worktree. Commit or stash changes first, or use --allow-dirty for development-only evidence.");
    return 1;
  }

  for (const step of plan.steps) {
    if (step.type === "npm") {
      const status = runNpmScript(step.script);
      if (status !== 0) {
        return status;
      }
    } else if (step.type === "manifest") {
      try {
        const result = createDistributionManifest({
          androidAab: step.androidAab,
          iosIpa: step.iosIpa,
          manifestPath: step.manifestPath
        });
        if (!options.allowDirty && result.manifest.git.dirty) {
          console.error("Distribution manifest was generated from a dirty worktree.");
          return 1;
        }
        console.log(`Wrote distribution artifact manifest: ${result.manifestPath}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 1;
      }
    }
  }

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

function relativeToWorkspace(path) {
  return resolve(path).startsWith(resolve(cwd())) ? resolve(path).slice(resolve(cwd()).length + 1) : path;
}

function isDirtyWorktree() {
  const result = spawnSync("git", ["status", "--short"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return result.status === 0 && Boolean(result.stdout.trim());
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
      "                         [--android-aab <path>] [--ios-ipa <path>] [--manifest <path>]",
      "",
      "Runs store-release environment checks, production build/export commands, and writes the distribution artifact manifest."
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
