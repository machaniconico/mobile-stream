import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const fixtureRoot = ".artifacts/verify-release-config-test";
const symlinkSourcePath = "native/__verify-release-config-symlink.swift";
const symlinkDirectoryPath = "native/__verify-release-config-link";

describe("release configuration verifier", () => {
  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(symlinkSourcePath, { recursive: true, force: true });
    rmSync(symlinkDirectoryPath, { recursive: true, force: true });
  });

  it("passes the current native release configuration", () => {
    const result = runVerifier();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Release configuration verification passed");
  });

  it("rejects symlinked native source files before scanning linked targets", () => {
    const outsideSource = `${fixtureRoot}/outside.swift`;
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(outsideSource, "final class Outside {}\n");
    symlinkSync(resolve(outsideSource), symlinkSourcePath);

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Release configuration source path must not be a symbolic link: ${symlinkSourcePath}`);
    expect(result.stdout).not.toContain("Release configuration verification passed");
  });

  it("rejects symlinked native source directories before scanning linked trees", () => {
    const outsideDirectory = `${fixtureRoot}/outside-native`;
    mkdirSync(outsideDirectory, { recursive: true });
    writeFileSync(`${outsideDirectory}/Legacy.swift`, "final class Legacy {}\n");
    symlinkSync(resolve(outsideDirectory), symlinkDirectoryPath, "dir");

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Release configuration source path must not be a symbolic link: ${symlinkDirectoryPath}`);
    expect(result.stdout).not.toContain("Release configuration verification passed");
  });
});

function runVerifier() {
  return spawnSync(process.execPath, ["scripts/verify-release-config.mjs"], {
    encoding: "utf8"
  });
}
