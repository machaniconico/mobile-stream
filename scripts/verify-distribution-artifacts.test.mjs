import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const fixtureRoot = ".artifacts/verify-distribution-artifacts-test";
const androidAab = `${fixtureRoot}/app-release.aab`;
const iosIpa = `${fixtureRoot}/MobileLiveCaster.ipa`;
const manifestPath = `${fixtureRoot}/distribution-artifacts.json`;

describe("distribution artifact verifier", () => {
  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("writes and verifies Android AAB and iOS IPA artifact hashes", () => {
    writeDistributionFiles();

    const writeResult = runVerifier([
      "--write",
      "--allow-dirty",
      "--android-aab",
      androidAab,
      "--ios-ipa",
      iosIpa,
      "--manifest",
      manifestPath
    ]);

    expect(writeResult.status).toBe(0);
    expect(writeResult.stdout).toContain("Wrote distribution artifact manifest");

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.type).toBe("distribution-artifact-manifest");
    expect(manifest.artifacts).toHaveLength(2);
    expect(manifest.artifacts[0]).toMatchObject({ platform: "android", kind: "aab", path: androidAab });
    expect(manifest.artifacts[1]).toMatchObject({ platform: "ios", kind: "ipa", path: iosIpa });
    expect(manifest.artifacts[0].sha256).toMatch(/^[a-f0-9]{64}$/);

    const verifyResult = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);
    expect(verifyResult.status).toBe(0);
    expect(verifyResult.stdout).toContain("Distribution artifact verification passed (2 artifacts).");
  });

  it("fails when a manifest artifact hash no longer matches the binary", () => {
    writeDistributionFiles();
    expect(
      runVerifier(["--write", "--allow-dirty", "--android-aab", androidAab, "--manifest", manifestPath]).status
    ).toBe(0);

    writeFileSync(androidAab, "changed-aab");
    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Distribution artifact metadata mismatch for ${androidAab}.`);
  });

  it("rejects unsupported distribution artifact extensions", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    const wrongPath = `${fixtureRoot}/app-release.zip`;
    writeFileSync(wrongPath, "not-aab");

    const result = runVerifier(["--write", "--allow-dirty", "--android-aab", wrongPath, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must end with .aab");
  });
});

function writeDistributionFiles() {
  mkdirSync(fixtureRoot, { recursive: true });
  writeFileSync(androidAab, "fake-android-aab");
  writeFileSync(iosIpa, "fake-ios-ipa");
}

function runVerifier(args) {
  return spawnSync(process.execPath, ["scripts/verify-distribution-artifacts.mjs", ...args], {
    encoding: "utf8"
  });
}
