import { mkdirSync, rmSync, statSync } from "node:fs";

const defaultTimeoutMs = 120_000;
const staleAfterMs = 10 * 60_000;

export function acquireReleaseTestLock(name = "release-fixture-lock", timeoutMs = defaultTimeoutMs) {
  const lockDir = `.artifacts/${name}`;
  const startedAt = Date.now();

  while (true) {
    try {
      mkdirSync(lockDir, { recursive: false });
      return () => rmSync(lockDir, { recursive: true, force: true });
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
      if (isStaleLock(lockDir)) {
        rmSync(lockDir, { recursive: true, force: true });
        continue;
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for release test fixture lock: ${lockDir}`);
      }
      sleep(50);
    }
  }
}

const isStaleLock = (lockDir) => {
  try {
    return Date.now() - statSync(lockDir).mtimeMs > staleAfterMs;
  } catch {
    return false;
  }
};

const isAlreadyExistsError = (error) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";

const sleep = (ms) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};
