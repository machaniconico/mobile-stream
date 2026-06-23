import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { argv, env, exit, platform, cwd } from "node:process";

const defaultUiUrl = "http://127.0.0.1:5173/";
const devServerTimeoutMs = 30_000;
const defaultReportPath = ".artifacts/release-candidate-verification.json";

const sourceGates = [
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
  console.log(
    `UI verification: ${
      options.skipUi ? "skipped by operator flag" : options.uiUrl ? `enabled against ${options.uiUrl}` : "enabled"
    }`
  );

  try {
    runCleanWorktreeGate(report, options.allowDirty);

    for (const [label, args] of sourceGates) {
      runTrackedGate(report, label, args);
    }

    if (options.skipUi) {
      recordSkippedGate(report, "Verify browser UI", "Skipped by operator flag after separate UI verification.");
    } else {
      await runUiGate(report, options.uiUrl);
    }

    runTrackedGate(report, "Verify commercial release support bundle", [
      "run",
      "verify:commercial-release-bundle",
      "--",
      options.supportBundlePath,
      `--max-age-hours=${options.maxAgeHours}`,
      ...(options.allowWarnings ? ["--allow-warnings"] : [])
    ]);

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
        `${error.message}\nIf this environment blocks nested browser launches, run \`npm run verify:ui\` separately and rerun release-candidate verification with \`--skip-ui\`.`,
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

  return parsed;
}

function normalizeUiUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    return url.toString();
  } catch {
    printUsage();
    throw new GateError("\n--ui-url must be an http(s) URL.", 2);
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
      uiUrl: options.uiUrl || null
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
    files: collectReleaseArtifacts()
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

function collectReleaseArtifacts() {
  return [
    ...collectFiles("web", ["dist/index.html"]),
    ...collectDirectoryFiles("web", "dist/assets", (path) => path.endsWith(".js") || path.endsWith(".css")),
    ...collectFiles("react-native", [".artifacts/rn/main.ios.jsbundle", ".artifacts/rn/index.android.bundle"])
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
      "  npm run verify:release-candidate -- <support-bundle.json> [--max-age-hours=24] [--allow-warnings] [--allow-dirty] [--report-json=.artifacts/release-candidate-verification.json] [--ui-url=http://127.0.0.1:5173/] [--skip-ui]",
      "",
      "Runs source release gates, browser UI verification, React Native bundle verification, and the commercial support-bundle gate.",
      "Writes a JSON evidence report for release approval audit trails.",
      "Fails on uncommitted source changes unless --allow-dirty is provided for development-only evidence.",
      "Use --ui-url when a preview server is already running.",
      "Use --skip-ui only when Chrome is unavailable and UI verification has been run separately."
    ].join("\n")
  );
}
