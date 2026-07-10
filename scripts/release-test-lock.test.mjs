import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireReleaseTestLock,
  releaseTestLockHookTimeoutMs,
  releaseTestLockTimeoutMs
} from "./release-test-lock.mjs";

const testRoot = ".artifacts";
const lockName = "release-test-lock-unit";
const lockDir = `${testRoot}/${lockName}`;
const ownerPath = join(lockDir, "owner.json");

describe("release test lock", () => {
  afterEach(() => {
    rmSync(lockDir, { recursive: true, force: true });
  });

  it("reclaims locks whose owner process no longer exists", () => {
    writeLockOwner({ pid: 999_999_999 });

    const unlock = acquireReleaseTestLock(lockName, 500);

    try {
      const owner = readCurrentOwner();
      expect(owner.pid).toBe(process.pid);
      expect(existsSync(lockDir)).toBe(true);
    } finally {
      unlock();
    }
  });

  it("does not reclaim locks whose owner process is still alive", () => {
    writeLockOwner({ pid: process.pid });

    expect(() => acquireReleaseTestLock(lockName, 80)).toThrow(
      `Timed out waiting for release test fixture lock: ${lockDir}`
    );
  });

  it("reclaims expired owner leases even when the recorded PID is in use", () => {
    writeLockOwner({ pid: process.pid });
    const oldTimestamp = new Date(Date.now() - 11 * 60_000);
    utimesSync(ownerPath, oldTimestamp, oldTimestamp);
    utimesSync(lockDir, oldTimestamp, oldTimestamp);

    const unlock = acquireReleaseTestLock(lockName, 500);

    try {
      expect(readCurrentOwner().ownerId).not.toBe("fixture-owner");
    } finally {
      unlock();
    }
  });

  it("stores ownership in a unique marker file", () => {
    const unlock = acquireReleaseTestLock(lockName, 500);

    try {
      const owner = readCurrentOwner();
      const entries = readdirSync(lockDir);
      expect(entries).toEqual([`owner.${owner.ownerId}.json`]);
    } finally {
      unlock();
    }
  });

  it("does not remove a replacement lock when a previous owner releases", () => {
    const unlock = acquireReleaseTestLock(lockName, 500);
    rmSync(lockDir, { recursive: true, force: true });
    writeLockOwner({ pid: process.pid, ownerId: "replacement-owner" });

    unlock();

    expect(existsSync(lockDir)).toBe(true);
    expect(JSON.parse(readFileSync(ownerPath, "utf8"))).toMatchObject({
      pid: process.pid,
      ownerId: "replacement-owner"
    });
  });

  it("keeps the recommended hook timeout above the lock wait timeout", () => {
    expect(releaseTestLockHookTimeoutMs).toBeGreaterThan(releaseTestLockTimeoutMs);
  });
});

function writeLockOwner({ pid, ownerId = "fixture-owner" }) {
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(
    ownerPath,
    `${JSON.stringify(
      {
        name: lockName,
        pid,
        ownerId,
        createdAt: new Date().toISOString()
      },
      null,
      2
    )}\n`
  );
}

function readCurrentOwner() {
  const marker = readdirSync(lockDir).find((entry) => entry === "owner.json" || /^owner\.[0-9a-f-]+\.json$/i.test(entry));
  if (!marker) {
    throw new Error(`Missing owner marker in ${lockDir}`);
  }
  return JSON.parse(readFileSync(join(lockDir, marker), "utf8"));
}
