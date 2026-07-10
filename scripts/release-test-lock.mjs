import { randomUUID } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  statSync,
  utimesSync,
  writeFileSync
} from "node:fs";
import { basename, join } from "node:path";

export const releaseTestLockTimeoutMs = 60_000;
export const releaseTestLockHookTimeoutMs = releaseTestLockTimeoutMs + 5_000;
const staleAfterMs = 10 * 60_000;
const heartbeatIntervalMs = 30_000;
const legacyOwnerFileName = "owner.json";
const ownerMarkerPattern = /^owner\.[0-9a-f-]+\.json$/i;
const orphanOwnerFilePattern = /^owner\.json\.\d+\.tmp$/;

export function acquireReleaseTestLock(name = "release-fixture-lock", timeoutMs = releaseTestLockTimeoutMs) {
  const lockDir = `.artifacts/${name}`;
  const ownerId = randomUUID();
  const ownerPath = join(lockDir, `owner.${ownerId}.json`);
  const startedAt = Date.now();

  // .artifacts/ is gitignored, so fresh checkouts (CI) do not have it. The lock
  // mkdir below must stay non-recursive for atomicity, so create the parent here.
  mkdirSync(".artifacts", { recursive: true });

  while (true) {
    try {
      mkdirSync(lockDir, { recursive: false });
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
      if (tryReclaimStaleLock(lockDir)) {
        continue;
      }
      waitForRetry(lockDir, startedAt, timeoutMs);
      continue;
    }

    try {
      writeOwnerFile(ownerPath, name, ownerId);
      if (!isSoleOwnerMarker(lockDir, ownerPath)) {
        releaseOwnerMarker(lockDir, ownerPath);
        waitForRetry(lockDir, startedAt, timeoutMs);
        continue;
      }
    } catch (error) {
      releaseOwnerMarker(lockDir, ownerPath);
      if (isMissingPathError(error)) {
        waitForRetry(lockDir, startedAt, timeoutMs);
        continue;
      }
      throw error;
    }

    const heartbeat = startOwnerHeartbeat(ownerPath, ownerId);
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      clearInterval(heartbeat);
      releaseOwnerMarker(lockDir, ownerPath);
    };
  }
}

const tryReclaimStaleLock = (lockDir) => {
  try {
    const owner = readOwner(lockDir);
    if (owner) {
      const leaseExpired = Date.now() - owner.updatedAtMs > staleAfterMs;
      if (isProcessAlive(owner.pid) && !leaseExpired) {
        return false;
      }
      rmSync(owner.path, { force: true });
      return tryRemoveEmptyLockDirectory(lockDir);
    }
    if (Date.now() - statSync(lockDir).mtimeMs <= staleAfterMs) {
      return false;
    }
    removeExpiredOwnerArtifacts(lockDir);
    return tryRemoveEmptyLockDirectory(lockDir);
  } catch (error) {
    if (isMissingPathError(error)) {
      return true;
    }
    throw error;
  }
};

const isAlreadyExistsError = (error) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";

const isMissingPathError = (error) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

const isDirectoryNotEmptyError = (error) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error.code === "ENOTEMPTY" || error.code === "EEXIST");

const waitForRetry = (lockDir, startedAt, timeoutMs) => {
  if (Date.now() - startedAt >= timeoutMs) {
    throw new Error(`Timed out waiting for release test fixture lock: ${lockDir}`);
  }
  sleep(50);
};

const sleep = (ms) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

function writeOwnerFile(ownerPath, name, ownerId) {
  const owner = {
    name,
    pid: process.pid,
    ownerId,
    createdAt: new Date().toISOString()
  };
  writeFileSync(ownerPath, `${JSON.stringify(owner, null, 2)}\n`, { flag: "wx" });
}

function startOwnerHeartbeat(ownerPath, ownerId) {
  const heartbeat = setInterval(() => {
    const owner = readOwnerFile(ownerPath);
    if (owner?.ownerId !== ownerId) {
      clearInterval(heartbeat);
      return;
    }
    try {
      const now = new Date();
      utimesSync(ownerPath, now, now);
    } catch {
      clearInterval(heartbeat);
    }
  }, heartbeatIntervalMs);
  heartbeat.unref();
  return heartbeat;
}

function releaseOwnerMarker(lockDir, ownerPath) {
  rmSync(ownerPath, { force: true });
  tryRemoveEmptyLockDirectory(lockDir);
}

function tryRemoveEmptyLockDirectory(lockDir) {
  try {
    rmdirSync(lockDir);
    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return true;
    }
    if (isDirectoryNotEmptyError(error)) {
      return false;
    }
    throw error;
  }
}

function readOwner(lockDir) {
  const markerPaths = listOwnerMarkerPaths(lockDir);
  if (markerPaths.length !== 1) {
    return null;
  }
  const path = markerPaths[0];
  const owner = readOwnerFile(path);
  if (!owner) {
    return null;
  }
  try {
    return { ...owner, path, updatedAtMs: statSync(path).mtimeMs };
  } catch {
    return null;
  }
}

function readOwnerFile(path) {
  try {
    const owner = JSON.parse(readFileSync(path, "utf8"));
    if (
      !Number.isInteger(owner?.pid) ||
      owner.pid <= 0 ||
      typeof owner.ownerId !== "string" ||
      !owner.ownerId
    ) {
      return null;
    }
    return owner;
  } catch {
    return null;
  }
}

function listOwnerMarkerPaths(lockDir) {
  return readdirSync(lockDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isOwnerMarkerName(entry.name))
    .map((entry) => join(lockDir, entry.name));
}

function isSoleOwnerMarker(lockDir, ownerPath) {
  try {
    const entries = readdirSync(lockDir);
    return entries.length === 1 && entries[0] === basename(ownerPath);
  } catch {
    return false;
  }
}

function isOwnerMarkerName(name) {
  return name === legacyOwnerFileName || ownerMarkerPattern.test(name);
}

function removeExpiredOwnerArtifacts(lockDir) {
  const now = Date.now();
  for (const entry of readdirSync(lockDir, { withFileTypes: true })) {
    if (!entry.isFile() || (!isOwnerMarkerName(entry.name) && !orphanOwnerFilePattern.test(entry.name))) {
      continue;
    }
    const path = join(lockDir, entry.name);
    const stat = lstatSync(path);
    if (now - stat.mtimeMs > staleAfterMs) {
      rmSync(path, { force: true });
    }
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && error.code === "ESRCH") {
      return false;
    }
    return true;
  }
}
