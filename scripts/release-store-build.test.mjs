import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const fixtureRoot = ".artifacts/release-store-build-test";
const androidAab = `${fixtureRoot}/app-release.aab`;
const iosIpa = `${fixtureRoot}/MobileLiveCaster.ipa`;
const manifestPath = `${fixtureRoot}/distribution-artifacts.json`;

describe("store release orchestration", () => {
  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("prints the full Android and iOS release plan in dry-run mode", () => {
    const result = runStoreRelease(["--dry-run", "--manifest", manifestPath]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Mode: dry-run");
    expect(result.stdout).toContain("npm run android:verify-release-env");
    expect(result.stdout).toContain("npm run android:bundleRelease");
    expect(result.stdout).toContain("npm run ios:verify-release-env");
    expect(result.stdout).toContain("npm run ios:archive:release");
    expect(result.stdout).toContain("npm run ios:export:release");
    expect(result.stdout).toContain(`write distribution manifest: ${manifestPath}`);
    expect(existsSync(manifestPath)).toBe(false);
  });

  it("writes a distribution manifest from existing artifacts when build and env checks are skipped", () => {
    writeDistributionFiles();

    const result = runStoreRelease([
      "--skip-build",
      "--skip-env",
      "--allow-dirty",
      "--manifest",
      manifestPath,
      "--android-aab",
      androidAab,
      "--ios-ipa",
      iosIpa
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Wrote distribution artifact manifest: ${manifestPath}`);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.artifacts.map((artifact) => artifact.path)).toEqual([androidAab, iosIpa]);
  });

  it("fails when a requested release artifact is missing", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(androidAab, "fake-aab");

    const result = runStoreRelease([
      "--skip-build",
      "--skip-env",
      "--allow-dirty",
      "--manifest",
      manifestPath,
      "--android-aab",
      androidAab,
      "--ios-ipa",
      iosIpa
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`ios ipa artifact does not exist: ${iosIpa}`);
  });

  it("can scope orchestration to Android-only releases", () => {
    writeDistributionFiles();

    const result = runStoreRelease([
      "--android-only",
      "--skip-build",
      "--skip-env",
      "--allow-dirty",
      "--manifest",
      manifestPath,
      "--android-aab",
      androidAab
    ]);

    expect(result.status).toBe(0);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.artifacts).toHaveLength(1);
    expect(manifest.artifacts[0]).toMatchObject({ platform: "android", path: androidAab });
  });
});

function writeDistributionFiles() {
  mkdirSync(fixtureRoot, { recursive: true });
  writeFileSync(androidAab, "fake-aab");
  writeFileSync(iosIpa, "fake-ipa");
}

function runStoreRelease(args) {
  return spawnSync(process.execPath, ["scripts/release-store-build.mjs", ...args], {
    encoding: "utf8"
  });
}
