import { spawn, spawnSync } from "node:child_process";
import { basename } from "node:path";
import { argv, env, exit, platform } from "node:process";

const defaultUiUrl = "http://127.0.0.1:5173/";
const devServerTimeoutMs = 30_000;

const sourceGates = [
  ["Verify native release configuration", ["run", "verify:release-config"]],
  ["Run unit tests", ["test"]],
  ["Typecheck web and React Native", ["run", "typecheck"]],
  ["Build web prototype", ["run", "build"]],
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

  console.log("MobileLiveCaster Release Candidate Verification");
  console.log(`Support bundle: ${options.supportBundlePath}`);
  console.log(`Bundle age limit: ${options.maxAgeHours}h`);
  console.log(`Warnings accepted: ${options.allowWarnings ? "yes" : "no"}`);
  console.log(
    `UI verification: ${
      options.skipUi ? "skipped by operator flag" : options.uiUrl ? `enabled against ${options.uiUrl}` : "enabled"
    }`
  );

  for (const [label, args] of sourceGates) {
    runGate(label, args);
  }

  if (!options.skipUi) {
    await runUiGate(options.uiUrl);
  }

  runGate("Verify commercial release support bundle", [
    "run",
    "verify:commercial-release-bundle",
    "--",
    options.supportBundlePath,
    `--max-age-hours=${options.maxAgeHours}`,
    ...(options.allowWarnings ? ["--allow-warnings"] : [])
  ]);

  console.log(`Release candidate verification passed for ${basename(options.supportBundlePath)}.`);
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

async function runUiGate(uiUrl) {
  if (uiUrl) {
    runBrowserUiGate({
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
    runBrowserUiGate({
      ...env,
      MLC_URL: defaultUiUrl
    });
  } finally {
    stopServer(server);
  }
}

function runBrowserUiGate(uiEnv) {
  try {
    runGate("Verify browser UI", ["run", "verify:ui"], {
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
    skipUi: false,
    uiUrl: "",
    help: false
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--allow-warnings") {
      parsed.allowWarnings = true;
    } else if (arg === "--skip-ui") {
      parsed.skipUi = true;
    } else if (arg.startsWith("--ui-url=")) {
      parsed.uiUrl = normalizeUiUrl(arg.slice("--ui-url=".length));
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

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run verify:release-candidate -- <support-bundle.json> [--max-age-hours=24] [--allow-warnings] [--ui-url=http://127.0.0.1:5173/] [--skip-ui]",
      "",
      "Runs source release gates, browser UI verification, React Native bundle verification, and the commercial support-bundle gate.",
      "Use --ui-url when a preview server is already running.",
      "Use --skip-ui only when Chrome is unavailable and UI verification has been run separately."
    ].join("\n")
  );
}
