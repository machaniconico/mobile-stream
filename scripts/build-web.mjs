import { spawnSync } from "node:child_process";
import { exit } from "node:process";
import { acquireReleaseTestLock } from "./release-test-lock.mjs";

const buildLockTimeoutMs = 10 * 60_000;

const releaseTestUnlock = acquireReleaseTestLock("release-fixture-lock", buildLockTimeoutMs);
let exitCode = 0;
try {
  run("tsc", ["-p", "tsconfig.json"]);
  run("vite", ["build"]);
} catch (error) {
  exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  if (!error?.silent) {
    console.error(error instanceof Error ? error.message : String(error));
  }
} finally {
  releaseTestUnlock();
}

if (exitCode !== 0) {
  exit(exitCode);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    const error = new Error(`${command} terminated by signal ${result.signal}.`);
    error.exitCode = 1;
    throw error;
  }
  if (result.status !== 0) {
    const error = new Error(`${command} exited with status ${result.status}.`);
    error.exitCode = result.status ?? 1;
    error.silent = true;
    throw error;
  }
}
