import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDistributionManifest, distributionArtifactManifestPath } from "./verify-distribution-artifacts.mjs";
import { createDashboardEvidenceManifest, dashboardEvidenceManifestPath } from "./verify-platform-dashboard-evidence.mjs";
import { createStoreSubmissionChecklist, storeSubmissionChecklistPath } from "./verify-store-submission-checklist.mjs";

const fixtureRoot = ".artifacts/verify-release-candidate-test";
const supportBundlePath = `${fixtureRoot}/support-bundle.json`;
const reportPath = `${fixtureRoot}/release-candidate-report.json`;
const managedArtifactPaths = [
  storeSubmissionChecklistPath,
  distributionArtifactManifestPath,
  dashboardEvidenceManifestPath,
  `${fixtureRoot}/app-release.aab`,
  `${fixtureRoot}/MobileLiveCaster.ipa`,
  `${fixtureRoot}/youtube-dashboard.png`,
  `${fixtureRoot}/twitch-dashboard.png`,
  `${fixtureRoot}/youtube-dashboard.json`,
  `${fixtureRoot}/twitch-dashboard.json`,
  `${fixtureRoot}/ios-store.png`,
  `${fixtureRoot}/android-store.png`,
  `${fixtureRoot}/submission-metadata.json`,
  `${fixtureRoot}/submission-review.md`
];
let artifactBackups = new Map();
const tinyPngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);
const minimumDistributionArtifactBytes = 1_048_576;
const pngBytes = pngWithDimensions(1179, 2556);

describe("release candidate verifier", () => {
  beforeEach(() => {
    artifactBackups = new Map(
      managedArtifactPaths.map((path) => [path, existsSync(path) ? readFileSync(path) : null])
    );
    for (const path of managedArtifactPaths) {
      rmSync(path, { force: true });
    }
    rmSync(fixtureRoot, { recursive: true, force: true });
    writeFile(supportBundlePath, JSON.stringify({ app: { name: "MobileLiveCaster" } }));
  });

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
    restoreManagedArtifacts();
  });

  it("fails before expensive source gates when store-submission evidence exists without handoff evidence", () => {
    writeStoreSubmissionChecklist();

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Distribution artifact manifest is required when ${storeSubmissionChecklistPath} exists.`
    );
    expect(result.stderr).toContain(
      `Dashboard evidence manifest is required when ${storeSubmissionChecklistPath} exists.`
    );
    expect(result.stderr).toContain(
      `Store release orchestration report is required when ${storeSubmissionChecklistPath} exists.`
    );
    expect(result.stdout).not.toContain("==> Run unit tests");

    const gate = readRequirementGate();
    expect(gate).toMatchObject({
      status: "failed",
      exitCode: 1,
      evidence: {
        storeSubmissionChecklistPresent: true,
        distributionArtifactManifestPresent: false,
        dashboardEvidenceManifestPresent: false,
        storeReleaseReportRequired: true,
        storeReleaseReportSupplied: false
      }
    });
  });

  it("fails only on the missing store-release report when distribution and dashboard manifests exist", () => {
    writeStoreSubmissionChecklist();
    writeFile(distributionArtifactManifestPath, JSON.stringify({ type: "distribution-artifact-manifest" }));
    writeFile(dashboardEvidenceManifestPath, JSON.stringify({ type: "platform-dashboard-evidence-manifest" }));

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain("Distribution artifact manifest is required");
    expect(result.stderr).not.toContain("Dashboard evidence manifest is required");
    expect(result.stderr).toContain(
      `Store release orchestration report is required when ${storeSubmissionChecklistPath} exists.`
    );

    const gate = readRequirementGate();
    expect(gate).toMatchObject({
      status: "failed",
      exitCode: 1,
      evidence: {
        storeSubmissionChecklistPresent: true,
        distributionArtifactManifestPresent: true,
        dashboardEvidenceManifestPresent: true,
        storeReleaseReportRequired: true,
        storeReleaseReportSupplied: false
      }
    });
  });

  it("fails before validating a supplied store-release report when required manifests are missing", () => {
    writeStoreSubmissionChecklist();

    const result = runVerifier([`--store-release-report-json=${fixtureRoot}/missing-store-release-report.json`]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Distribution artifact manifest is required when ${storeSubmissionChecklistPath} exists.`
    );
    expect(result.stderr).toContain(
      `Dashboard evidence manifest is required when ${storeSubmissionChecklistPath} exists.`
    );
    expect(result.stderr).not.toContain("Store release orchestration report is required");
    expect(result.stdout).not.toContain("==> Run unit tests");

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    expect(report.gates.some((entry) => entry.label === "Verify store release orchestration report")).toBe(false);
    const gate = readRequirementGate(report);
    expect(gate).toMatchObject({
      status: "failed",
      exitCode: 1,
      evidence: {
        storeSubmissionChecklistPresent: true,
        distributionArtifactManifestPresent: false,
        dashboardEvidenceManifestPresent: false,
        storeReleaseReportRequired: true,
        storeReleaseReportSupplied: true
      }
    });
  });

  it("fails before expensive source gates when dashboard handoff status evidence is stale", () => {
    writeValidHandoffEvidence({
      dashboardCheckedAt: new Date(Date.now() - 49 * 3_600_000).toISOString()
    });

    const result = runVerifier([`--store-release-report-json=${fixtureRoot}/missing-store-release-report.json`]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Dashboard evidence status JSON ${fixtureRoot}/youtube-dashboard.json is 49h old, above the 24h release gate.`
    );
    expect(result.stderr).toContain(
      `Dashboard evidence status JSON ${fixtureRoot}/twitch-dashboard.json is 49h old, above the 24h release gate.`
    );
    expect(result.stdout).not.toContain("==> Run unit tests");

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const gate = report.gates.find((entry) => entry.label === "Verify store submission handoff evidence integrity");
    expect(gate).toMatchObject({
      status: "failed",
      exitCode: 1
    });
    expect(report.gates.some((entry) => entry.label === "Verify store release orchestration report")).toBe(false);
  });

  it("passes handoff integrity before validating the supplied store-release report", () => {
    writeValidHandoffEvidence();

    const result = runVerifier([`--store-release-report-json=${fixtureRoot}/missing-store-release-report.json`]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`Could not read store release orchestration report at ${fixtureRoot}/missing-store-release-report.json`);
    expect(result.stdout).not.toContain("==> Run unit tests");

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const handoffGate = report.gates.find((entry) => entry.label === "Verify store submission handoff evidence integrity");
    expect(handoffGate).toMatchObject({
      status: "passed",
      exitCode: 0,
      evidence: {
        distributionManifest: {
          path: distributionArtifactManifestPath
        },
        dashboardEvidenceManifest: {
          path: dashboardEvidenceManifestPath
        },
        storeSubmissionChecklist: {
          path: storeSubmissionChecklistPath
        }
      }
    });

    const storeReleaseGate = report.gates.find((entry) => entry.label === "Verify store release orchestration report");
    expect(storeReleaseGate).toMatchObject({
      status: "failed",
      exitCode: 2
    });
  });
});

function runVerifier(extraArgs = []) {
  return spawnSync(
    process.execPath,
    [
      "scripts/verify-release-candidate.mjs",
      supportBundlePath,
      "--allow-dirty",
      `--report-json=${reportPath}`,
      ...extraArgs
    ],
    { encoding: "utf8" }
  );
}

function readRequirementGate(report = JSON.parse(readFileSync(reportPath, "utf8"))) {
  return report.gates.find((entry) => entry.label === "Verify store submission evidence requirements");
}

function writeStoreSubmissionChecklist() {
  writeFile(
    storeSubmissionChecklistPath,
    JSON.stringify({
      reportVersion: 1,
      app: "MobileLiveCaster",
      type: "store-submission-checklist-manifest"
    })
  );
}

function writeValidHandoffEvidence({ dashboardCheckedAt = new Date().toISOString() } = {}) {
  writeFile(`${fixtureRoot}/app-release.aab`, androidAabBytes());
  writeFile(`${fixtureRoot}/MobileLiveCaster.ipa`, iosIpaBytes());
  createDistributionManifest({
    androidAab: `${fixtureRoot}/app-release.aab`,
    iosIpa: `${fixtureRoot}/MobileLiveCaster.ipa`
  });

  writeFile(`${fixtureRoot}/youtube-dashboard.png`, pngBytes);
  writeFile(`${fixtureRoot}/twitch-dashboard.png`, pngBytes);
  writeFile(
    `${fixtureRoot}/youtube-dashboard.json`,
    JSON.stringify({
      platform: "youtube",
      broadcastId: "ytBroadcast9xYz",
      streamId: "ytStream8aBc",
      channelId: "UCMobileLiveCaster",
      broadcastStatus: "live",
      streamStatus: "active",
      checkedAt: dashboardCheckedAt
    })
  );
  writeFile(
    `${fixtureRoot}/twitch-dashboard.json`,
    JSON.stringify({
      platform: "twitch",
      broadcasterId: "123456789",
      broadcasterLogin: "mobilelivecaster",
      streamId: "987654321",
      liveStatus: "live",
      checkedAt: dashboardCheckedAt
    })
  );
  createDashboardEvidenceManifest({
    youtubeScreenshot: `${fixtureRoot}/youtube-dashboard.png`,
    youtubeScreenshotCapturedAt: dashboardCheckedAt,
    twitchScreenshot: `${fixtureRoot}/twitch-dashboard.png`,
    twitchScreenshotCapturedAt: dashboardCheckedAt,
    youtubeJson: `${fixtureRoot}/youtube-dashboard.json`,
    twitchJson: `${fixtureRoot}/twitch-dashboard.json`
  });

  writeFile(`${fixtureRoot}/ios-store.png`, pngBytes);
  writeFile(`${fixtureRoot}/android-store.png`, pngBytes);
  writeFile(`${fixtureRoot}/submission-review.md`, "# MobileLiveCaster Store Submission Review\n\n- Listing copy reviewed.\n");
  writeFile(
    `${fixtureRoot}/submission-metadata.json`,
    JSON.stringify(
      {
        app: "MobileLiveCaster",
        appStore: {
          name: "MobileLiveCaster",
          subtitle: "VTuber Live Studio",
          description:
            "MobileLiveCaster lets creators compose a mobile VTuber scene, prepare RTMPS output, monitor audio, and validate stream readiness before going live.",
          keywords: "VTuber,live,streaming,RTMP,avatar",
          supportUrl: "https://example.com/mobilelivecaster/support",
          privacyPolicyUrl: "https://example.com/mobilelivecaster/privacy",
          category: "Photo & Video",
          releaseNotes: "Initial public release candidate with mobile VTuber streaming tools.",
          reviewContactEmail: "support@example.com",
          ageRatingNotes: "No gambling, no mature content included.",
          appPrivacyNotes: "Collects only user-provided stream settings and local validation evidence."
        },
        playStore: {
          name: "MobileLiveCaster",
          shortDescription: "Mobile VTuber streaming studio",
          fullDescription:
            "MobileLiveCaster helps creators prepare mobile RTMPS streams with PNGTuber controls, mic processing, chat readout checks, and release validation evidence.",
          privacyPolicyUrl: "https://example.com/mobilelivecaster/privacy",
          supportEmail: "support@example.com",
          category: "Video Players & Editors",
          releaseNotes: "Initial public release candidate with mobile VTuber streaming tools.",
          dataSafetyNotes: "Stream keys stay in secure device storage and release evidence redacts sensitive values.",
          contentRatingNotes: "No gambling, no monetized loot, no mature content included."
        },
        screenshots: [
          {
            platform: "ios",
            device: "iPhone 15 Pro Max",
            path: `${fixtureRoot}/ios-store.png`,
            source: "realDevice",
            osVersion: "iOS 18.5",
            appBuild: "1.0.0 (1)",
            capturedAt: new Date().toISOString()
          },
          {
            platform: "android",
            device: "Pixel 8 Pro",
            path: `${fixtureRoot}/android-store.png`,
            source: "realDevice",
            osVersion: "Android 15",
            appBuild: "1.0.0 (1)",
            capturedAt: new Date().toISOString()
          }
        ],
        reviewDocuments: [{ kind: "submissionReview", path: `${fixtureRoot}/submission-review.md` }]
      },
      null,
      2
    )
  );
  createStoreSubmissionChecklist({ metadataPath: `${fixtureRoot}/submission-metadata.json` });
}

function restoreManagedArtifacts() {
  for (const [path, content] of artifactBackups.entries()) {
    if (content === null) {
      rmSync(path, { force: true });
    } else {
      writeFile(path, content);
    }
  }
}

function writeFile(path, content) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, content);
}

function pngWithDimensions(width, height) {
  const bytes = Buffer.from(tinyPngBytes);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
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
