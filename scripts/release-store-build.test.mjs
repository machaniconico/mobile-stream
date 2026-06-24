import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const fixtureRoot = ".artifacts/release-store-build-test";
const androidAab = `${fixtureRoot}/app-release.aab`;
const iosIpa = `${fixtureRoot}/MobileLiveCaster.ipa`;
const manifestPath = `${fixtureRoot}/distribution-artifacts.json`;
const minimumDistributionArtifactBytes = 1_048_576;

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
    writeFileSync(androidAab, androidAabBytes());

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
  writeFileSync(androidAab, androidAabBytes());
  writeFileSync(iosIpa, iosIpaBytes());
}

function runStoreRelease(args) {
  return spawnSync(process.execPath, ["scripts/release-store-build.mjs", ...args], {
    encoding: "utf8"
  });
}

function androidAabBytes({ marker = 0x5a } = {}) {
  return zipArtifactBytes([
    { name: "BundleConfig.pb", data: Buffer.from("bundle config") },
    { name: "base/manifest/AndroidManifest.xml", data: Buffer.from("<manifest />") },
    { name: "base/dex/classes.dex", size: minimumDistributionArtifactBytes, marker }
  ]);
}

function iosIpaBytes({ marker = 0x49 } = {}) {
  return zipArtifactBytes([
    { name: "Payload/MobileLiveCaster.app/Info.plist", data: Buffer.from("<plist />") },
    { name: "Payload/MobileLiveCaster.app/MobileLiveCaster", size: minimumDistributionArtifactBytes, marker }
  ]);
}

function zipArtifactBytes(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = entry.data || Buffer.alloc(entry.size || 0, entry.marker || 0x5a);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}
