import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  releaseConfigArtifactPaths,
  requiredReleaseGateLabels
} from "./release-artifact-policy.mjs";
import { distributionArtifactManifestPath } from "./verify-distribution-artifacts.mjs";
import { dashboardEvidenceManifestPath } from "./verify-platform-dashboard-evidence.mjs";
import { storeSubmissionChecklistPath } from "./verify-store-submission-checklist.mjs";
import { storeReleaseReportArtifactGroup, storeReleaseReportType } from "./release-store-build.mjs";
import { validateReport } from "./verify-release-report.mjs";

const generatedFiles = [
  "dist/index.html",
  "dist/assets/release-report-test.js",
  "dist/assets/release-report-test.css",
  ".artifacts/rn/main.ios.jsbundle",
  ".artifacts/rn/index.android.bundle",
  ".artifacts/mobile-live-caster-desktop.png",
  ".artifacts/mobile-live-caster-mobile.png",
  ".artifacts/distribution-artifacts.json",
  ".artifacts/release-report-test/app-release.aab",
  ".artifacts/release-report-test/MobileLiveCaster.ipa",
  ".artifacts/platform-dashboard-evidence.json",
  ".artifacts/release-report-test/youtube-dashboard.png",
  ".artifacts/release-report-test/twitch-dashboard.png",
  ".artifacts/release-report-test/youtube-dashboard.json",
  ".artifacts/release-report-test/twitch-dashboard.json",
  ".artifacts/store-submission-checklist.json",
  ".artifacts/release-report-test/store-release-report.json",
  ".artifacts/release-report-test/store-submission-metadata.json",
  ".artifacts/release-report-test/submission-review.md",
  ".artifacts/release-report-test/ios-store.png",
  ".artifacts/release-report-test/android-store.png",
  ".artifacts/release-report-test/support-bundle.json",
  ".artifacts/release-report-test/ui-evidence.json"
];
const fileBackups = new Map();
const tinyPngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);
const minimumDistributionArtifactBytes = 1_048_576;
const pngBytes = pngWithDimensions(1179, 2556);
const capturedAt = "2026-06-25T00:00:00.000Z";

describe("release report verifier", () => {
  beforeAll(() => {
    snapshotFiles(generatedFiles);
    writeFixtureFiles();
  });

  afterAll(() => {
    restoreFiles();
  });

  it("accepts a complete release report with matching support, UI, and artifact hashes", () => {
    const failures = validateReport(createReport(), reportOptions());

    expect(failures).toEqual([]);
  });

  it("rejects release reports when an artifact hash no longer matches the workspace file", () => {
    const report = createReport();
    report.artifacts.files[0].sha256 = "0".repeat(64);

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain(`Artifact metadata mismatch for ${report.artifacts.files[0].path}.`);
  });

  it("rejects UI evidence screenshots that are not PNG files", () => {
    const report = createReport();
    const badScreenshotPath = ".artifacts/release-report-test/bad-mobile.png";
    writeFile(badScreenshotPath, "not a png");
    writeUiEvidenceFile({ mobilePath: badScreenshotPath });
    const evidenceGate = report.gates.find((gate) => gate.label === "Verify browser UI evidence");
    evidenceGate.evidence.sha256 = fileSha256(evidenceGate.evidence.path);

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain(
      "Browser UI evidence screenshot is not a PNG file: .artifacts/release-report-test/bad-mobile.png."
    );
  });

  it("accepts release reports with a matching distribution artifact manifest", () => {
    restoreUiScreenshots();
    const failures = validateReport(createReport({ includeDistribution: true }), reportOptions());

    expect(failures).toEqual([]);
  });

  it("rejects release reports missing an artifact referenced by the distribution manifest", () => {
    restoreUiScreenshots();
    const report = createReport({ includeDistribution: true });
    report.artifacts.files = report.artifacts.files.filter(
      (artifact) => artifact.path !== ".artifacts/release-report-test/MobileLiveCaster.ipa"
    );

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Report is missing distribution artifact .artifacts/release-report-test/MobileLiveCaster.ipa.");
  });

  it("accepts release reports with matching platform dashboard evidence artifacts", () => {
    restoreUiScreenshots();
    const failures = validateReport(createReport({ includeDashboardEvidence: true }), reportOptions());

    expect(failures).toEqual([]);
  });

  it("rejects release reports missing dashboard evidence referenced by the manifest", () => {
    restoreUiScreenshots();
    const report = createReport({ includeDashboardEvidence: true });
    report.artifacts.files = report.artifacts.files.filter(
      (artifact) => artifact.path !== ".artifacts/release-report-test/twitch-dashboard.png"
    );

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Report is missing dashboard evidence artifact .artifacts/release-report-test/twitch-dashboard.png.");
  });

  it("accepts release reports with matching store submission checklist artifacts", () => {
    restoreUiScreenshots();
    const failures = validateReport(createReport({ includeStoreSubmission: true }), reportOptions());

    expect(failures).toEqual([]);
  });

  it("rejects release reports missing store submission artifacts referenced by the checklist", () => {
    restoreUiScreenshots();
    const report = createReport({ includeStoreSubmission: true });
    report.artifacts.files = report.artifacts.files.filter(
      (artifact) => artifact.path !== ".artifacts/release-report-test/android-store.png"
    );

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Report is missing store submission artifact .artifacts/release-report-test/android-store.png.");
  });

  it("accepts release reports with matching store release orchestration evidence", () => {
    restoreUiScreenshots();
    const failures = validateReport(createReport({ includeStoreRelease: true }), reportOptions());

    expect(failures).toEqual([]);
  });

  it("rejects failed store release orchestration evidence in a release report", () => {
    restoreUiScreenshots();
    const report = createReport({ includeStoreRelease: true, storeReleaseStatus: "failed" });

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain('Store release report status must be passed, got "failed".');
  });

  it("rejects stale store release orchestration evidence in a release report", () => {
    restoreUiScreenshots();
    const report = createReport({
      includeStoreRelease: true,
      storeReleaseFinishedAt: new Date(Date.now() - 48 * 3_600_000).toISOString()
    });

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain("Store release report is 48h old, above the 24h commercial release gate.");
  });
});

function reportOptions() {
  return {
    maxAgeHours: 24,
    allowDirty: true,
    allowCommitMismatch: false
  };
}

function createReport({
  includeDistribution = false,
  includeDashboardEvidence = false,
  includeStoreSubmission = false,
  includeStoreRelease = false,
  storeReleaseStatus = "passed",
  storeReleaseFinishedAt
} = {}) {
  writeUiEvidenceFile();
  const shouldIncludeDistribution = includeDistribution || includeStoreRelease;
  if (shouldIncludeDistribution) {
    writeDistributionFixture();
  }
  if (includeDashboardEvidence) {
    writeDashboardEvidenceFixture();
  }
  if (includeStoreSubmission) {
    writeStoreSubmissionFixture();
  }
  if (includeStoreRelease) {
    writeStoreReleaseFixture({ status: storeReleaseStatus, finishedAt: storeReleaseFinishedAt });
  }
  const supportBundlePath = ".artifacts/release-report-test/support-bundle.json";
  const artifactFiles = [
    ...releaseConfigArtifactPaths.map((path) => artifactRecord("release-config", path)),
    artifactRecord("web", "dist/index.html"),
    artifactRecord("web", "dist/assets/release-report-test.js"),
    artifactRecord("web", "dist/assets/release-report-test.css"),
    artifactRecord("react-native", ".artifacts/rn/main.ios.jsbundle"),
    artifactRecord("react-native", ".artifacts/rn/index.android.bundle"),
    artifactRecord("ui", ".artifacts/mobile-live-caster-desktop.png"),
    artifactRecord("ui", ".artifacts/mobile-live-caster-mobile.png"),
    ...(shouldIncludeDistribution ? distributionArtifactRecords() : []),
    ...(includeDashboardEvidence ? dashboardEvidenceRecords() : []),
    ...(includeStoreSubmission ? storeSubmissionRecords() : []),
    ...(includeStoreRelease ? storeReleaseArtifactRecords() : [])
  ];

  return {
    reportVersion: 1,
    app: "MobileLiveCaster",
    type: "release-candidate-verification",
    status: "passed",
    startedAt: new Date(Date.now() - 1_000).toISOString(),
    finishedAt: new Date().toISOString(),
    git: {
      commit: currentCommit(),
      branch: "main",
      dirty: true,
      statusShort: " M scripts/verify-release-report.test.mjs"
    },
    options: {
      allowDirty: true,
      skipUi: true
    },
    supportBundle: {
      path: supportBundlePath,
      absolutePath: resolve(supportBundlePath),
      basename: "support-bundle.json",
      sha256: fileSha256(supportBundlePath)
    },
    artifacts: {
      generatedAt: new Date().toISOString(),
      files: artifactFiles
    },
    gates: [
      ...requiredReleaseGateLabels.map((label) => ({
        label,
        command: "fixture",
        status: label === "Verify clean git worktree" ? "skipped" : "passed",
        startedAt: new Date(Date.now() - 1_000).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 1,
        exitCode: label === "Verify clean git worktree" ? null : 0,
        error: label === "Verify clean git worktree" ? "Allowed by --allow-dirty." : null
      })),
      {
        label: "Verify browser UI evidence",
        command: "read .artifacts/release-report-test/ui-evidence.json",
        status: "passed",
        startedAt: new Date(Date.now() - 1_000).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 1,
        exitCode: 0,
        error: null,
        evidence: {
          path: ".artifacts/release-report-test/ui-evidence.json",
          sha256: fileSha256(".artifacts/release-report-test/ui-evidence.json"),
          target: "http://127.0.0.1:5173/",
          finishedAt: new Date().toISOString(),
          viewports: []
        }
      }
    ],
    error: null
  };
}

function writeFixtureFiles() {
  writeFile("dist/index.html", "<!doctype html><title>MobileLiveCaster</title>");
  writeFile("dist/assets/release-report-test.js", "console.log('release-report-test');");
  writeFile("dist/assets/release-report-test.css", "body { color: #111; }");
  writeFile(".artifacts/rn/main.ios.jsbundle", "ios bundle");
  writeFile(".artifacts/rn/index.android.bundle", "android bundle");
  writeFile(".artifacts/mobile-live-caster-desktop.png", pngBytes);
  writeFile(".artifacts/mobile-live-caster-mobile.png", pngBytes);
  writeFile(".artifacts/release-report-test/support-bundle.json", JSON.stringify({ app: "MobileLiveCaster" }));
  writeUiEvidenceFile();
}

function restoreUiScreenshots() {
  writeFile(".artifacts/mobile-live-caster-desktop.png", pngBytes);
  writeFile(".artifacts/mobile-live-caster-mobile.png", pngBytes);
  writeUiEvidenceFile();
}

function writeDistributionFixture() {
  writeFile(".artifacts/release-report-test/app-release.aab", androidAabBytes());
  writeFile(".artifacts/release-report-test/MobileLiveCaster.ipa", iosIpaBytes());
  writeFile(
    distributionArtifactManifestPath,
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "distribution-artifact-manifest",
        generatedAt: new Date().toISOString(),
        git: {
          commit: currentCommit(),
          branch: "main",
          dirty: true,
          statusShort: " M scripts/verify-release-report.test.mjs"
        },
        artifacts: [
          distributionManifestRecord("android", "aab", ".artifacts/release-report-test/app-release.aab"),
          distributionManifestRecord("ios", "ipa", ".artifacts/release-report-test/MobileLiveCaster.ipa")
        ]
      },
      null,
      2
    )
  );
}

function writeDashboardEvidenceFixture() {
  writeFile(".artifacts/release-report-test/youtube-dashboard.png", pngBytes);
  writeFile(".artifacts/release-report-test/twitch-dashboard.png", pngBytes);
  writeFile(
    ".artifacts/release-report-test/youtube-dashboard.json",
    JSON.stringify({
      platform: "youtube",
      broadcastId: "ytBroadcast9xYz",
      streamId: "ytStream8aBc",
      channelId: "UCMobileLiveCaster",
      broadcastStatus: "live",
      streamStatus: "active",
      checkedAt: capturedAt
    })
  );
  writeFile(
    ".artifacts/release-report-test/twitch-dashboard.json",
    JSON.stringify({
      platform: "twitch",
      broadcasterId: "123456789",
      broadcasterLogin: "mobilelivecaster",
      streamId: "987654321",
      liveStatus: "live",
      checkedAt: capturedAt
    })
  );
  writeFile(
    dashboardEvidenceManifestPath,
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "platform-dashboard-evidence-manifest",
        generatedAt: new Date().toISOString(),
        git: {
          commit: currentCommit(),
          branch: "main",
          dirty: true,
          statusShort: " M scripts/verify-release-report.test.mjs"
        },
        artifacts: [
          dashboardManifestRecord("youtube", ".artifacts/release-report-test/youtube-dashboard.png"),
          dashboardManifestRecord("twitch", ".artifacts/release-report-test/twitch-dashboard.png"),
          dashboardStatusJsonRecord("youtube", ".artifacts/release-report-test/youtube-dashboard.json"),
          dashboardStatusJsonRecord("twitch", ".artifacts/release-report-test/twitch-dashboard.json")
        ]
      },
      null,
      2
    )
  );
}

function writeStoreSubmissionFixture() {
  writeFile(".artifacts/release-report-test/ios-store.png", pngBytes);
  writeFile(".artifacts/release-report-test/android-store.png", pngBytes);
  writeFile(
    ".artifacts/release-report-test/submission-review.md",
    "# MobileLiveCaster Store Submission Review\n\n- [ ] Listing copy reviewed.\n"
  );
  writeFile(
    ".artifacts/release-report-test/store-submission-metadata.json",
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
            path: ".artifacts/release-report-test/ios-store.png",
            source: "realDevice"
          },
          {
            platform: "android",
            device: "Pixel 8 Pro",
            path: ".artifacts/release-report-test/android-store.png",
            source: "realDevice"
          }
        ],
        reviewDocuments: [
          { kind: "submissionReview", path: ".artifacts/release-report-test/submission-review.md" }
        ]
      },
      null,
      2
    )
  );
  writeFile(
    storeSubmissionChecklistPath,
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "store-submission-checklist-manifest",
        generatedAt: new Date().toISOString(),
        git: {
          commit: currentCommit(),
          branch: "main",
          dirty: true,
          statusShort: " M scripts/verify-release-report.test.mjs"
        },
        metadata: storeSubmissionMetadataRecord(),
        screenshots: [
          storeScreenshotRecord("ios", "iPhone 15 Pro Max", ".artifacts/release-report-test/ios-store.png", "realDevice"),
          storeScreenshotRecord("android", "Pixel 8 Pro", ".artifacts/release-report-test/android-store.png", "realDevice")
        ],
        reviewDocuments: [storeReviewDocumentRecord()]
      },
      null,
      2
    )
  );
}

function writeStoreReleaseFixture({ status = "passed", finishedAt = new Date().toISOString() } = {}) {
  const startedAt = new Date(Date.parse(finishedAt) - 1_000).toISOString();
  writeFile(
    ".artifacts/release-report-test/store-release-report.json",
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: storeReleaseReportType,
        status,
        startedAt,
        finishedAt,
        durationMs: 1,
        git: {
          commit: currentCommit(),
          branch: "main",
          dirty: true,
          statusShort: " M scripts/verify-release-report.test.mjs"
        },
        mode: "execute",
        platforms: ["android", "ios"],
        options: {
          skipEnv: false,
          skipBuild: false,
          allowDirty: true,
          manifestPath: distributionArtifactManifestPath,
          androidAab: ".artifacts/release-report-test/app-release.aab",
          iosIpa: ".artifacts/release-report-test/MobileLiveCaster.ipa"
        },
        checks: [
          {
            label: "Verify clean git worktree",
            command: "git status --short",
            status: "skipped",
            startedAt: new Date(Date.now() - 1_000).toISOString(),
            finishedAt: new Date().toISOString(),
            durationMs: 0,
            exitCode: 0,
            error: "Allowed by --allow-dirty.",
            statusShort: " M scripts/verify-release-report.test.mjs"
          }
        ],
        steps: [
          storeReleaseStep("verify-env", "npm run android:verify-release-env"),
          storeReleaseStep("android", "npm run android:bundleRelease"),
          storeReleaseStep("verify-env", "npm run ios:verify-release-env"),
          storeReleaseStep("ios", "npm run ios:archive:release"),
          storeReleaseStep("ios", "npm run ios:export:release"),
          {
            type: "manifest",
            label: "Write distribution artifact manifest",
            command: `write ${distributionArtifactManifestPath}`,
            status,
            startedAt: new Date(Date.now() - 1_000).toISOString(),
            finishedAt: new Date().toISOString(),
            durationMs: 1,
            exitCode: status === "passed" ? 0 : 1,
            error: status === "passed" ? null : "fixture failure",
            inputs: {
              androidAab: ".artifacts/release-report-test/app-release.aab",
              iosIpa: ".artifacts/release-report-test/MobileLiveCaster.ipa",
              manifestPath: distributionArtifactManifestPath
            },
            result: distributionManifestSummary(distributionManifestArtifactRecord())
          }
        ],
        artifacts: {
          distributionManifest: distributionManifestSummary(distributionManifestArtifactRecord())
        },
        error: status === "passed" ? null : "fixture failure"
      },
      null,
      2
    )
  );
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

function distributionArtifactRecords() {
  return [
    artifactRecord("distribution", distributionArtifactManifestPath),
    artifactRecord("distribution", ".artifacts/release-report-test/app-release.aab"),
    artifactRecord("distribution", ".artifacts/release-report-test/MobileLiveCaster.ipa")
  ];
}

function storeReleaseArtifactRecords() {
  return [artifactRecord(storeReleaseReportArtifactGroup, ".artifacts/release-report-test/store-release-report.json")];
}

function distributionManifestArtifactRecord() {
  const content = readFileSync(distributionArtifactManifestPath);
  const manifest = JSON.parse(content.toString("utf8"));
  return {
    path: distributionArtifactManifestPath,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
    artifactCount: Array.isArray(manifest.artifacts) ? manifest.artifacts.length : 0,
    artifacts: (manifest.artifacts || []).map((artifact) => ({
      platform: artifact.platform,
      kind: artifact.kind,
      path: artifact.path,
      bytes: artifact.bytes,
      sha256: artifact.sha256
    }))
  };
}

function distributionManifestSummary(record) {
  return {
    path: record.path,
    bytes: record.bytes,
    sha256: record.sha256,
    artifactCount: record.artifactCount,
    artifacts: record.artifacts
  };
}

function distributionManifestRecord(platform, kind, path) {
  const content = readFileSync(path);
  const zipEntryInfo =
    platform === "android"
      ? { zipEntryCount: 3, requiredZipEntries: ["BundleConfig.pb", "base/manifest/AndroidManifest.xml"] }
      : { zipEntryCount: 2, requiredZipEntries: ["Payload/*.app/Info.plist"] };
  return {
    platform,
    kind,
    path,
    basename: path.split("/").at(-1),
    ...zipEntryInfo,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function dashboardEvidenceRecords() {
  return [
    artifactRecord("dashboard", dashboardEvidenceManifestPath),
    artifactRecord("dashboard", ".artifacts/release-report-test/youtube-dashboard.png"),
    artifactRecord("dashboard", ".artifacts/release-report-test/twitch-dashboard.png"),
    artifactRecord("dashboard", ".artifacts/release-report-test/youtube-dashboard.json"),
    artifactRecord("dashboard", ".artifacts/release-report-test/twitch-dashboard.json")
  ];
}

function storeSubmissionRecords() {
  return [
    artifactRecord("store-submission", storeSubmissionChecklistPath),
    artifactRecord("store-submission", ".artifacts/release-report-test/store-submission-metadata.json"),
    artifactRecord("store-submission", ".artifacts/release-report-test/submission-review.md"),
    artifactRecord("store-submission", ".artifacts/release-report-test/ios-store.png"),
    artifactRecord("store-submission", ".artifacts/release-report-test/android-store.png")
  ];
}

function dashboardStatusJsonRecord(platform, path) {
  const content = readFileSync(path);
  return {
    platform,
    kind: "statusJson",
    path,
    basename: path.split("/").at(-1),
    checkedAt: JSON.parse(content.toString("utf8")).checkedAt,
    statusSummary:
      platform === "youtube"
        ? "broadcast:live:ytBroadcast9xYz stream:active:ytStream8aBc channel:UCMobileLiveCaster"
        : "live:live channel:123456789/mobilelivecaster stream:987654321",
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function dashboardManifestRecord(platform, path) {
  const content = readFileSync(path);
  const dimensions = pngDimensions(content);
  return {
    platform,
    kind: "screenshot",
    path,
    basename: path.split("/").at(-1),
    width: dimensions.width,
    height: dimensions.height,
    capturedAt,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function storeSubmissionMetadataRecord() {
  const path = ".artifacts/release-report-test/store-submission-metadata.json";
  const content = readFileSync(path);
  return {
    kind: "store-submission-metadata",
    path,
    basename: path.split("/").at(-1),
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function storeScreenshotRecord(platform, device, path, source) {
  const content = readFileSync(path);
  const dimensions = pngDimensions(content);
  return {
    platform,
    kind: "screenshot",
    device,
    locale: "ja-JP",
    role: "store",
    source,
    path,
    basename: path.split("/").at(-1),
    width: dimensions.width,
    height: dimensions.height,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function storeReviewDocumentRecord() {
  const path = ".artifacts/release-report-test/submission-review.md";
  const content = readFileSync(path);
  return {
    kind: "submissionReview",
    path,
    basename: path.split("/").at(-1),
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function writeUiEvidenceFile({
  desktopPath = ".artifacts/mobile-live-caster-desktop.png",
  mobilePath = ".artifacts/mobile-live-caster-mobile.png"
} = {}) {
  writeFile(
    ".artifacts/release-report-test/ui-evidence.json",
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "browser-ui-verification",
        status: "passed",
        target: "http://127.0.0.1:5173/",
        finishedAt: new Date().toISOString(),
        git: {
          commit: currentCommit(),
          dirty: true
        },
        viewports: [
          viewportEvidence("desktop", desktopPath),
          viewportEvidence("mobile", mobilePath)
        ]
      },
      null,
      2
    )
  );
}

function viewportEvidence(name, path) {
  return {
    name,
    horizontalOverflow: false,
    screenshot: artifactRecord("ui", path)
  };
}

function artifactRecord(group, path) {
  const content = readFileSync(path);
  return {
    group,
    path,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function currentCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function snapshotFiles(paths) {
  for (const path of paths) {
    fileBackups.set(path, existsSync(path) ? readFileSync(path) : null);
  }
}

function restoreFiles() {
  for (const [path, content] of fileBackups.entries()) {
    if (content === null) {
      rmSync(path, { force: true });
    } else {
      writeFile(path, content);
    }
  }
}

function pngWithDimensions(width, height) {
  const bytes = Buffer.from(tinyPngBytes);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function pngDimensions(content) {
  return {
    width: content.readUInt32BE(16),
    height: content.readUInt32BE(20)
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
