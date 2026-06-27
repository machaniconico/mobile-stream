import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const fixtureRoot = ".artifacts/verify-distribution-artifacts-test";
const androidAab = `${fixtureRoot}/app-release.aab`;
const iosIpa = `${fixtureRoot}/MobileLiveCaster.ipa`;
const manifestPath = `${fixtureRoot}/distribution-artifacts.json`;
const minimumDistributionArtifactBytes = 1_048_576;

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
    expect(manifest.artifacts[0]).toMatchObject({
      platform: "android",
      kind: "aab",
      path: androidAab,
      zipEntryCount: 3,
      requiredZipEntries: ["BundleConfig.pb", "base/manifest/AndroidManifest.xml"]
    });
    expect(manifest.artifacts[1]).toMatchObject({
      platform: "ios",
      kind: "ipa",
      path: iosIpa,
      zipEntryCount: 2,
      requiredZipEntries: ["Payload/*.app/Info.plist"]
    });
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

    writeFileSync(androidAab, androidAabBytes({ marker: 0x41 }));
    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Distribution artifact metadata mismatch for ${androidAab}.`);
  });

  it("rejects verification when git commit provenance is missing", () => {
    writeDistributionFiles();
    expect(
      runVerifier(["--write", "--allow-dirty", "--android-aab", androidAab, "--manifest", manifestPath]).status
    ).toBe(0);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.git.commit = "";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Distribution manifest git commit is missing.");
  });

  it("rejects manifest artifact paths with traversal segments", () => {
    writeDistributionFiles();
    expect(
      runVerifier(["--write", "--allow-dirty", "--android-aab", androidAab, "--manifest", manifestPath]).status
    ).toBe(0);

    const traversalPath = `${fixtureRoot}/nested/../../../../outside.aab`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts[0].path = traversalPath;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Distribution artifact path must be workspace-relative: ${traversalPath}.`);
  });

  it("rejects non-canonical manifest artifact paths before reading binaries", () => {
    writeDistributionFiles();
    expect(
      runVerifier(["--write", "--allow-dirty", "--android-aab", androidAab, "--manifest", manifestPath]).status
    ).toBe(0);

    const nonCanonicalPath = `${fixtureRoot}/nested/../app-release.aab`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts[0].path = nonCanonicalPath;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Distribution artifact path must be workspace-relative: ${nonCanonicalPath}.`);
  });

  it("rejects absolute manifest artifact paths before reading binaries", () => {
    writeDistributionFiles();
    expect(
      runVerifier(["--write", "--allow-dirty", "--android-aab", androidAab, "--manifest", manifestPath]).status
    ).toBe(0);

    const absolutePath = resolve(androidAab);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts[0].path = absolutePath;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Distribution artifact path must be workspace-relative: ${absolutePath}.`);
  });

  it("rejects symlinked manifest artifact files", () => {
    writeDistributionFiles();
    expect(
      runVerifier(["--write", "--allow-dirty", "--android-aab", androidAab, "--manifest", manifestPath]).status
    ).toBe(0);

    rmSync(androidAab);
    symlinkSync(resolve(iosIpa), androidAab);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Distribution artifact must not be a symbolic link: ${androidAab}.`);
  });

  it("rejects distribution artifact paths with symlinked parents before reading binaries", () => {
    writeDistributionFiles();
    const outsideArtifactDir = `${fixtureRoot}/outside-artifacts`;
    const artifactLinkDir = `${fixtureRoot}/artifact-link`;
    mkdirSync(outsideArtifactDir, { recursive: true });
    writeFileSync(`${outsideArtifactDir}/app-release.aab`, androidAabBytes());
    symlinkSync(resolve(outsideArtifactDir), artifactLinkDir);

    const result = runVerifier([
      "--write",
      "--allow-dirty",
      "--android-aab",
      `${artifactLinkDir}/app-release.aab`,
      "--manifest",
      manifestPath
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`android aab artifact path parent must not be a symbolic link: ${artifactLinkDir}`);
  });

  it("rejects manifest artifact paths with symlinked parents before reading linked binaries", () => {
    writeDistributionFiles();
    expect(
      runVerifier(["--write", "--allow-dirty", "--android-aab", androidAab, "--manifest", manifestPath]).status
    ).toBe(0);

    const outsideArtifactDir = `${fixtureRoot}/outside-artifacts`;
    const artifactLinkDir = `${fixtureRoot}/artifact-link`;
    mkdirSync(outsideArtifactDir, { recursive: true });
    writeFileSync(`${outsideArtifactDir}/app-release.aab`, androidAabBytes());
    symlinkSync(resolve(outsideArtifactDir), artifactLinkDir);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts[0].path = `${artifactLinkDir}/app-release.aab`;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Distribution artifact path parent must not be a symbolic link: ${artifactLinkDir}.`);
  });

  it("rejects symlinked distribution manifest output paths before writing linked targets", () => {
    writeDistributionFiles();
    const outsideManifest = `${fixtureRoot}/outside-manifest.json`;
    const manifestSymlink = `${fixtureRoot}/manifest-link.json`;
    writeFileSync(outsideManifest, "unchanged");
    symlinkSync(resolve(outsideManifest), manifestSymlink);

    const result = runVerifier(["--write", "--allow-dirty", "--android-aab", androidAab, "--manifest", manifestSymlink]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Distribution manifest output must not be a symbolic link: ${manifestSymlink}`);
    expect(readFileSync(outsideManifest, "utf8")).toBe("unchanged");
  });

  it("rejects symlinked distribution manifest input paths before reading linked reports", () => {
    writeDistributionFiles();
    expect(
      runVerifier(["--write", "--allow-dirty", "--android-aab", androidAab, "--manifest", manifestPath]).status
    ).toBe(0);

    const manifestSymlink = `${fixtureRoot}/manifest-link.json`;
    symlinkSync(resolve(manifestPath), manifestSymlink);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestSymlink]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Distribution artifact manifest must not be a symbolic link: ${manifestSymlink}`);
  });

  it("rejects dangling distribution manifest input symlinks before creating linked targets", () => {
    writeDistributionFiles();
    const missingManifestTarget = `${fixtureRoot}/missing-manifest-target.json`;
    const manifestSymlink = `${fixtureRoot}/manifest-link.json`;
    symlinkSync(resolve(missingManifestTarget), manifestSymlink);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestSymlink]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Distribution artifact manifest must not be a symbolic link: ${manifestSymlink}`);
    expect(existsSync(missingManifestTarget)).toBe(false);
  });

  it("rejects distribution manifest input paths with symlinked parents before reading linked reports", () => {
    writeDistributionFiles();
    expect(
      runVerifier(["--write", "--allow-dirty", "--android-aab", androidAab, "--manifest", manifestPath]).status
    ).toBe(0);

    const outsideManifestDir = `${fixtureRoot}/outside-manifests`;
    const manifestLinkDir = `${fixtureRoot}/manifest-link-dir`;
    mkdirSync(outsideManifestDir, { recursive: true });
    writeFileSync(`${outsideManifestDir}/distribution-artifacts.json`, readFileSync(manifestPath));
    symlinkSync(resolve(outsideManifestDir), manifestLinkDir);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", `${manifestLinkDir}/distribution-artifacts.json`]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Distribution artifact manifest path parent must not be a symbolic link: ${manifestLinkDir}`);
  });

  it("rejects dangling distribution manifest output symlinks before creating linked targets", () => {
    writeDistributionFiles();
    const missingManifestTarget = `${fixtureRoot}/missing-manifest-target.json`;
    const manifestSymlink = `${fixtureRoot}/manifest-link.json`;
    symlinkSync(resolve(missingManifestTarget), manifestSymlink);

    const result = runVerifier(["--write", "--allow-dirty", "--android-aab", androidAab, "--manifest", manifestSymlink]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Distribution manifest output must not be a symbolic link: ${manifestSymlink}`);
    expect(existsSync(missingManifestTarget)).toBe(false);
  });

  it("rejects distribution manifest output paths with symlinked parents before writing linked targets", () => {
    writeDistributionFiles();
    const outsideManifestDir = `${fixtureRoot}/outside-manifests`;
    const manifestLinkDir = `${fixtureRoot}/manifest-link-dir`;
    mkdirSync(outsideManifestDir, { recursive: true });
    symlinkSync(resolve(outsideManifestDir), manifestLinkDir);

    const result = runVerifier([
      "--write",
      "--allow-dirty",
      "--android-aab",
      androidAab,
      "--manifest",
      `${manifestLinkDir}/distribution-artifacts.json`
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Distribution manifest path parent must not be a symbolic link: ${manifestLinkDir}`);
    expect(existsSync(`${outsideManifestDir}/distribution-artifacts.json`)).toBe(false);
  });

  it("rejects placeholder-sized distribution artifacts", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(
      androidAab,
      zipArtifactBytes([
        { name: "BundleConfig.pb", data: Buffer.from("bundle config") },
        { name: "base/manifest/AndroidManifest.xml", data: Buffer.from("<manifest />") },
        { name: "base/dex/classes.dex", size: 4096 }
      ])
    );

    const result = runVerifier(["--write", "--allow-dirty", "--android-aab", androidAab, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Distribution artifact ${androidAab} must be at least ${minimumDistributionArtifactBytes} bytes to prevent placeholder release binaries.`
    );
  });

  it("rejects non-ZIP distribution artifacts even when they are large", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(androidAab, Buffer.alloc(minimumDistributionArtifactBytes, 0x20));

    const result = runVerifier(["--write", "--allow-dirty", "--android-aab", androidAab, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Distribution artifact ${androidAab} must start with a ZIP local-file header.`);
    expect(result.stderr).toContain(`Distribution artifact ${androidAab} is missing a ZIP end-of-central-directory record.`);
  });

  it("rejects Android AAB artifacts missing required bundle entries", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(androidAab, zipArtifactBytes([{ name: "base/dex/classes.dex", size: minimumDistributionArtifactBytes }]));

    const result = runVerifier(["--write", "--allow-dirty", "--android-aab", androidAab, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Distribution artifact ${androidAab} is missing required android ZIP entry BundleConfig.pb.`);
    expect(result.stderr).toContain(
      `Distribution artifact ${androidAab} is missing required android ZIP entry base/manifest/AndroidManifest.xml.`
    );
  });

  it("rejects iOS IPA artifacts missing the app Info.plist", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(iosIpa, zipArtifactBytes([{ name: "Payload/MobileLiveCaster.app/MobileLiveCaster", size: minimumDistributionArtifactBytes }]));

    const result = runVerifier(["--write", "--allow-dirty", "--ios-ipa", iosIpa, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Distribution artifact ${iosIpa} is missing required ios ZIP entry Payload/*.app/Info.plist.`);
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
  writeFileSync(androidAab, androidAabBytes());
  writeFileSync(iosIpa, iosIpaBytes());
}

function runVerifier(args) {
  return spawnSync(process.execPath, ["scripts/verify-distribution-artifacts.mjs", ...args], {
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
