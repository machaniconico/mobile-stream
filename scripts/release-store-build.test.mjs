import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readStoreReleaseReport, validateStoreReleaseReport } from "./release-store-build.mjs";

const fixtureRoot = ".artifacts/release-store-build-test";
const androidAab = `${fixtureRoot}/app-release.aab`;
const iosIpa = `${fixtureRoot}/MobileLiveCaster.ipa`;
const manifestPath = `${fixtureRoot}/distribution-artifacts.json`;
const reportPath = `${fixtureRoot}/store-release-report.json`;
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

  it("writes a planned store release report in dry-run mode when requested", () => {
    const result = runStoreRelease(["--dry-run", "--manifest", manifestPath, "--report-json", reportPath]);

    expect(result.status).toBe(0);
    expect(existsSync(manifestPath)).toBe(false);
    expect(existsSync(reportPath)).toBe(true);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    expect(report).toMatchObject({
      reportVersion: 1,
      app: "MobileLiveCaster",
      type: "store-release-orchestration",
      status: "planned",
      mode: "dry-run",
      platforms: ["android", "ios"]
    });
    expect(report.steps.every((step) => step.status === "planned")).toBe(true);
  });

  it("rejects symlinked store release report output paths before writing linked targets", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    const outsideReport = `${fixtureRoot}/outside-report.json`;
    const reportSymlink = `${fixtureRoot}/report-link.json`;
    writeFileSync(outsideReport, "unchanged");
    symlinkSync(resolve(outsideReport), reportSymlink);

    const result = runStoreRelease(["--dry-run", "--manifest", manifestPath, "--report-json", reportSymlink]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Store release report output must not be a symbolic link: ${reportSymlink}`);
    expect(readFileSync(outsideReport, "utf8")).toBe("unchanged");
  });

  it("rejects dangling store release report output symlinks before creating linked targets", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    const missingReportTarget = `${fixtureRoot}/missing-report-target.json`;
    const reportSymlink = `${fixtureRoot}/report-link.json`;
    symlinkSync(resolve(missingReportTarget), reportSymlink);

    const result = runStoreRelease(["--dry-run", "--manifest", manifestPath, "--report-json", reportSymlink]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Store release report output must not be a symbolic link: ${reportSymlink}`);
    expect(existsSync(missingReportTarget)).toBe(false);
  });

  it("rejects store release report output paths with symlinked parents before writing linked targets", () => {
    const outsideReportDir = `${fixtureRoot}/outside-reports`;
    const reportLinkDir = `${fixtureRoot}/report-link-dir`;
    mkdirSync(outsideReportDir, { recursive: true });
    symlinkSync(resolve(outsideReportDir), reportLinkDir);

    const result = runStoreRelease([
      "--dry-run",
      "--manifest",
      manifestPath,
      "--report-json",
      `${reportLinkDir}/store-release-report.json`
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Store release report path parent must not be a symbolic link: ${reportLinkDir}`);
    expect(existsSync(`${outsideReportDir}/store-release-report.json`)).toBe(false);
  });

  it("rejects symlinked store release report input paths before reading linked reports", () => {
    expect(runStoreRelease(["--dry-run", "--manifest", manifestPath, "--report-json", reportPath]).status).toBe(0);
    const reportSymlink = `${fixtureRoot}/report-link.json`;
    symlinkSync(resolve(reportPath), reportSymlink);

    expect(() => readStoreReleaseReport(reportSymlink)).toThrow(
      `Store release report must not be a symbolic link: ${reportSymlink}`
    );
  });

  it("rejects dangling store release report input symlinks before creating linked targets", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    const missingReportTarget = `${fixtureRoot}/missing-report-target.json`;
    const reportSymlink = `${fixtureRoot}/report-link.json`;
    symlinkSync(resolve(missingReportTarget), reportSymlink);

    expect(() => readStoreReleaseReport(reportSymlink)).toThrow(
      `Store release report must not be a symbolic link: ${reportSymlink}`
    );
    expect(existsSync(missingReportTarget)).toBe(false);
  });

  it("rejects store release report input paths with symlinked parents before reading linked reports", () => {
    expect(runStoreRelease(["--dry-run", "--manifest", manifestPath, "--report-json", reportPath]).status).toBe(0);
    const outsideReportDir = `${fixtureRoot}/outside-reports`;
    const reportLinkDir = `${fixtureRoot}/report-link-dir`;
    mkdirSync(outsideReportDir, { recursive: true });
    writeFileSync(`${outsideReportDir}/store-release-report.json`, readFileSync(reportPath));
    symlinkSync(resolve(outsideReportDir), reportLinkDir);

    expect(() => readStoreReleaseReport(`${reportLinkDir}/store-release-report.json`)).toThrow(
      `Store release report path parent must not be a symbolic link: ${reportLinkDir}`
    );
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

  it("writes a passed store release report with distribution manifest evidence", () => {
    writeDistributionFiles();

    const result = runStoreRelease([
      "--skip-build",
      "--skip-env",
      "--allow-dirty",
      "--manifest",
      manifestPath,
      "--report-json",
      reportPath,
      "--android-aab",
      androidAab,
      "--ios-ipa",
      iosIpa
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Store release report written to ${reportPath}`);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    expect(report).toMatchObject({
      reportVersion: 1,
      app: "MobileLiveCaster",
      type: "store-release-orchestration",
      status: "passed",
      mode: "execute",
      platforms: ["android", "ios"]
    });
    expect(report.steps).toHaveLength(1);
    expect(report.steps[0]).toMatchObject({
      type: "manifest",
      status: "passed",
      exitCode: 0
    });
    expect(report.artifacts.distributionManifest).toMatchObject({
      path: manifestPath,
      artifactCount: 2
    });
    expect(report.artifacts.distributionManifest.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.artifacts.distributionManifest.artifacts.map((artifact) => artifact.path)).toEqual([androidAab, iosIpa]);
  });

  it("rejects skipped env/build store release reports as commercial evidence", () => {
    writeDistributionFiles();

    const result = runStoreRelease([
      "--skip-build",
      "--skip-env",
      "--allow-dirty",
      "--manifest",
      manifestPath,
      "--report-json",
      reportPath,
      "--android-aab",
      androidAab,
      "--ios-ipa",
      iosIpa
    ]);

    expect(result.status).toBe(0);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const failures = validateStoreReleaseReport(report, {
      reportPath,
      currentCommit: report.git.commit,
      allowDirty: true,
      allowCommitMismatch: true,
      requirePassed: true
    });

    expect(failures).toContain(
      "Store release report was generated with --skip-env and cannot be used as commercial release evidence."
    );
    expect(failures).toContain(
      "Store release report was generated with --skip-build and cannot be used as commercial release evidence."
    );
  });

  it("rejects store release reports when git dirty-state provenance is missing", () => {
    writeDistributionFiles();

    const result = runStoreRelease([
      "--skip-build",
      "--skip-env",
      "--allow-dirty",
      "--manifest",
      manifestPath,
      "--report-json",
      reportPath,
      "--android-aab",
      androidAab,
      "--ios-ipa",
      iosIpa
    ]);

    expect(result.status).toBe(0);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    delete report.git.dirty;

    const failures = validateStoreReleaseReport(report, {
      reportPath,
      currentCommit: report.git.commit,
      allowDirty: true,
      allowCommitMismatch: true,
      requirePassed: false
    });

    expect(failures).toContain("Store release report git dirty state is missing.");
  });

  it("rejects symlinked distribution manifests referenced by store release reports", () => {
    writeDistributionFiles();
    expect(
      runStoreRelease([
        "--skip-build",
        "--skip-env",
        "--allow-dirty",
        "--manifest",
        manifestPath,
        "--report-json",
        reportPath,
        "--android-aab",
        androidAab,
        "--ios-ipa",
        iosIpa
      ]).status
    ).toBe(0);

    const outsideManifest = `${fixtureRoot}/outside-distribution-artifacts.json`;
    writeFileSync(outsideManifest, readFileSync(manifestPath));
    rmSync(manifestPath);
    symlinkSync(resolve(outsideManifest), manifestPath);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const failures = validateStoreReleaseReport(report, {
      reportPath,
      currentCommit: report.git.commit,
      allowDirty: true,
      allowCommitMismatch: true,
      requirePassed: false
    });

    expect(failures).toContain(`Store release report distribution manifest must not be a symbolic link: ${manifestPath}.`);
  });

  it("rejects distribution manifest paths with symlinked parents in store release reports", () => {
    writeDistributionFiles();
    expect(
      runStoreRelease([
        "--skip-build",
        "--skip-env",
        "--allow-dirty",
        "--manifest",
        manifestPath,
        "--report-json",
        reportPath,
        "--android-aab",
        androidAab,
        "--ios-ipa",
        iosIpa
      ]).status
    ).toBe(0);

    const outsideManifestDir = `${fixtureRoot}/outside-manifests`;
    const manifestLinkDir = `${fixtureRoot}/manifest-link-dir`;
    mkdirSync(outsideManifestDir, { recursive: true });
    writeFileSync(`${outsideManifestDir}/distribution-artifacts.json`, readFileSync(manifestPath));
    symlinkSync(resolve(outsideManifestDir), manifestLinkDir);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    report.artifacts.distributionManifest.path = `${manifestLinkDir}/distribution-artifacts.json`;
    const failures = validateStoreReleaseReport(report, {
      reportPath,
      currentCommit: report.git.commit,
      allowDirty: true,
      allowCommitMismatch: true,
      requirePassed: false
    });

    expect(failures).toContain(
      `Store release report distribution manifest path parent must not be a symbolic link: ${manifestLinkDir}.`
    );
  });

  it("revalidates distribution manifest artifact paths referenced by store release reports", () => {
    writeDistributionFiles();
    expect(
      runStoreRelease([
        "--skip-build",
        "--skip-env",
        "--allow-dirty",
        "--manifest",
        manifestPath,
        "--report-json",
        reportPath,
        "--android-aab",
        androidAab,
        "--ios-ipa",
        iosIpa
      ]).status
    ).toBe(0);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const nonCanonicalArtifactPath = `${fixtureRoot}/nested/../app-release.aab`;
    manifest.artifacts[0].path = nonCanonicalArtifactPath;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    report.artifacts.distributionManifest.bytes = readFileSync(manifestPath).byteLength;
    report.artifacts.distributionManifest.sha256 = sha256(manifestPath);
    report.artifacts.distributionManifest.artifacts[0].path = nonCanonicalArtifactPath;

    const failures = validateStoreReleaseReport(report, {
      reportPath,
      currentCommit: report.git.commit,
      allowDirty: true,
      allowCommitMismatch: true,
      requirePassed: false
    });

    expect(failures).toContain(
      `Store release report distribution manifest invalid: Distribution artifact path must be workspace-relative: ${nonCanonicalArtifactPath}.`
    );
  });

  it("rejects commercial store release reports missing required platform steps", () => {
    writeDistributionFiles();

    const result = runStoreRelease([
      "--skip-build",
      "--skip-env",
      "--allow-dirty",
      "--manifest",
      manifestPath,
      "--report-json",
      reportPath,
      "--android-aab",
      androidAab,
      "--ios-ipa",
      iosIpa
    ]);

    expect(result.status).toBe(0);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    report.options.skipEnv = false;
    report.options.skipBuild = false;
    report.steps = [
      storeReleaseStep("verify-env", "npm run android:verify-release-env"),
      storeReleaseStep("android", "npm run android:bundleRelease"),
      storeReleaseStep("verify-env", "npm run ios:verify-release-env"),
      storeReleaseStep("ios", "npm run ios:archive:release"),
      report.steps[0]
    ];

    const failures = validateStoreReleaseReport(report, {
      reportPath,
      currentCommit: report.git.commit,
      allowDirty: true,
      allowCommitMismatch: true,
      requirePassed: true
    });

    expect(failures).toContain(
      'Store release report is missing required commercial release step "npm run ios:export:release".'
    );
  });

  it("rejects stale store release reports as commercial evidence", () => {
    writeDistributionFiles();

    const result = runStoreRelease([
      "--skip-build",
      "--skip-env",
      "--allow-dirty",
      "--manifest",
      manifestPath,
      "--report-json",
      reportPath,
      "--android-aab",
      androidAab,
      "--ios-ipa",
      iosIpa
    ]);

    expect(result.status).toBe(0);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    report.options.skipEnv = false;
    report.options.skipBuild = false;
    report.finishedAt = new Date(Date.now() - 48 * 3_600_000).toISOString();
    report.steps = [
      storeReleaseStep("verify-env", "npm run android:verify-release-env"),
      storeReleaseStep("android", "npm run android:bundleRelease"),
      storeReleaseStep("verify-env", "npm run ios:verify-release-env"),
      storeReleaseStep("ios", "npm run ios:archive:release"),
      storeReleaseStep("ios", "npm run ios:export:release"),
      report.steps[0]
    ];

    const failures = validateStoreReleaseReport(report, {
      reportPath,
      currentCommit: report.git.commit,
      allowDirty: true,
      allowCommitMismatch: true,
      requirePassed: true,
      maxAgeHours: 24
    });

    expect(failures).toContain("Store release report is 48h old, above the 24h commercial release gate.");
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

  it("writes a failed store release report when distribution manifest creation fails", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(androidAab, androidAabBytes());

    const result = runStoreRelease([
      "--skip-build",
      "--skip-env",
      "--allow-dirty",
      "--manifest",
      manifestPath,
      "--report-json",
      reportPath,
      "--android-aab",
      androidAab,
      "--ios-ipa",
      iosIpa
    ]);

    expect(result.status).toBe(1);
    expect(existsSync(reportPath)).toBe(true);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    expect(report.status).toBe("failed");
    expect(report.error).toBe(`ios ipa artifact does not exist: ${iosIpa}`);
    expect(report.steps[0]).toMatchObject({
      type: "manifest",
      status: "failed",
      exitCode: 1,
      error: `ios ipa artifact does not exist: ${iosIpa}`
    });
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

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function storeReleaseStep(type, command) {
  return {
    type,
    label: command,
    command,
    status: "passed",
    startedAt: new Date(Date.now() - 1_000).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 1,
    exitCode: 0,
    error: null
  };
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
