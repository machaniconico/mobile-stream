import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const fixtureRoot = ".artifacts/verify-scripts-test";
const symlinkScriptPath = "scripts/__verify-scripts-symlink-fixture.mjs";
const directoryScriptPath = "scripts/__verify-scripts-directory-fixture.mjs";

describe("release automation script verifier", () => {
  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(symlinkScriptPath, { recursive: true, force: true });
    rmSync(directoryScriptPath, { recursive: true, force: true });
  });

  it("passes when release automation scripts are regular files", () => {
    const result = runVerifier();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Release automation script verification passed");
  });

  it("rejects symlinked release automation scripts before checking linked targets", () => {
    const outsideScript = `${fixtureRoot}/outside-script.mjs`;
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(outsideScript, "export const outside = true;\n");
    symlinkSync(resolve(outsideScript), symlinkScriptPath);

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Release automation script must not be a symbolic link: ${symlinkScriptPath}`);
    expect(result.stdout).not.toContain("Release automation script verification passed");
  });

  it("rejects dangling symlinked release automation scripts", () => {
    const missingScript = `${fixtureRoot}/missing-script.mjs`;
    mkdirSync(fixtureRoot, { recursive: true });
    symlinkSync(resolve(missingScript), symlinkScriptPath);

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Release automation script must not be a symbolic link: ${symlinkScriptPath}`);
  }, 30_000);

  it("rejects release automation script paths that point to directories", () => {
    mkdirSync(directoryScriptPath, { recursive: true });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Release automation script must point to a file: ${directoryScriptPath}`);
  });
});

function runVerifier() {
  return spawnSync(process.execPath, ["scripts/verify-scripts.mjs"], {
    encoding: "utf8"
  });
}
