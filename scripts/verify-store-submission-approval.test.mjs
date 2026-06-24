import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  releaseConfigArtifactPaths,
  requiredReleaseGateLabels
} from "./release-artifact-policy.mjs";
import { storeSubmissionChecklistPath } from "./verify-store-submission-checklist.mjs";
import { validateStoreSubmissionApproval } from "./verify-store-submission-approval.mjs";

const generatedFiles = [
  "dist/index.html",
  "dist/assets/store-approval-test.js",
  "dist/assets/store-approval-test.css",
  ".artifacts/rn/main.ios.jsbundle",
  ".artifacts/rn/index.android.bundle",
  ".artifacts/mobile-live-caster-desktop.png",
  ".artifacts/mobile-live-caster-mobile.png",
  ".artifacts/store-submission-checklist.json",
  ".artifacts/store-approval-test/submission-metadata.json",
  ".artifacts/store-approval-test/submission-review.md",
  ".artifacts/store-approval-test/ios-store.png",
  ".artifacts/store-approval-test/android-store.png",
  ".artifacts/store-approval-test/support-bundle.json",
  ".artifacts/store-approval-test/ui-evidence.json"
];
const fileBackups = new Map();
const tinyPngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);
const pngBytes = pngWithDimensions(1179, 2556);
const capturedAt = "2026-06-25T00:00:00.000Z";
const appBuild = "rc-1";

describe("store submission approval verifier", () => {
  beforeAll(() => {
    snapshotFiles(generatedFiles);
    writeFixtureFiles();
  });

  afterAll(() => {
    restoreFiles();
  });

  it("accepts a passed RC report with final real-device store-submission evidence captured", () => {
    const failures = validateStoreSubmissionApproval(createReport(), readStoreManifest(), approvalOptions());

    expect(failures).toEqual([]);
  });

  it("rejects approval when the RC report did not capture a referenced store artifact", () => {
    const report = createReport();
    report.artifacts.files = report.artifacts.files.filter(
      (artifact) => artifact.path !== ".artifacts/store-approval-test/submission-review.md"
    );

    const failures = validateStoreSubmissionApproval(report, readStoreManifest(), approvalOptions());

    expect(failures).toContain("Release report is missing store submission artifact .artifacts/store-approval-test/submission-review.md.");
  });

  it("rejects UI-evidence draft screenshots for final store submission approval", () => {
    writeStoreSubmissionFixture({ screenshotSource: "uiEvidenceDraft" });
    const failures = validateStoreSubmissionApproval(createReport(), readStoreManifest(), approvalOptions());

    expect(failures).toContain(
      "Store submission screenshot .artifacts/store-approval-test/ios-store.png must be captured from a real device for final store submission."
    );
    expect(failures).toContain(
      "Store submission screenshot .artifacts/store-approval-test/android-store.png must be captured from a real device for final store submission."
    );

    writeStoreSubmissionFixture();
  });

  it("rejects approval when store screenshots were captured from a different app build", () => {
    writeStoreSubmissionFixture({ appBuild: "rc-2" });

    const failures = validateStoreSubmissionApproval(createReport(), readStoreManifest(), approvalOptions());

    expect(failures).toContain(
      "Store submission screenshot .artifacts/store-approval-test/ios-store.png app build rc-2 does not match validation evidence build rc-1."
    );
    expect(failures).toContain(
      "Store submission screenshot .artifacts/store-approval-test/android-store.png app build rc-2 does not match validation evidence build rc-1."
    );

    writeStoreSubmissionFixture();
  });
});

function approvalOptions() {
  return {
    manifestPath: storeSubmissionChecklistPath,
    maxAgeHours: 24,
    allowDirty: true,
    allowCommitMismatch: false
  };
}

function createReport() {
  writeUiEvidenceFile();
  const supportBundlePath = ".artifacts/store-approval-test/support-bundle.json";
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
      statusShort: " M scripts/verify-store-submission-approval.test.mjs"
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
      files: [
        ...releaseConfigArtifactPaths.map((path) => artifactRecord("release-config", path)),
        artifactRecord("web", "dist/index.html"),
        artifactRecord("web", "dist/assets/store-approval-test.js"),
        artifactRecord("web", "dist/assets/store-approval-test.css"),
        artifactRecord("react-native", ".artifacts/rn/main.ios.jsbundle"),
        artifactRecord("react-native", ".artifacts/rn/index.android.bundle"),
        artifactRecord("ui", ".artifacts/mobile-live-caster-desktop.png"),
        artifactRecord("ui", ".artifacts/mobile-live-caster-mobile.png"),
        artifactRecord("store-submission", storeSubmissionChecklistPath),
        artifactRecord("store-submission", ".artifacts/store-approval-test/submission-metadata.json"),
        artifactRecord("store-submission", ".artifacts/store-approval-test/submission-review.md"),
        artifactRecord("store-submission", ".artifacts/store-approval-test/ios-store.png"),
        artifactRecord("store-submission", ".artifacts/store-approval-test/android-store.png")
      ]
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
        command: "read .artifacts/store-approval-test/ui-evidence.json",
        status: "passed",
        startedAt: new Date(Date.now() - 1_000).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 1,
        exitCode: 0,
        error: null,
        evidence: {
          path: ".artifacts/store-approval-test/ui-evidence.json",
          sha256: fileSha256(".artifacts/store-approval-test/ui-evidence.json"),
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
  writeFile("dist/assets/store-approval-test.js", "console.log('store-approval-test');");
  writeFile("dist/assets/store-approval-test.css", "body { color: #111; }");
  writeFile(".artifacts/rn/main.ios.jsbundle", "ios bundle");
  writeFile(".artifacts/rn/index.android.bundle", "android bundle");
  writeFile(".artifacts/mobile-live-caster-desktop.png", pngBytes);
  writeFile(".artifacts/mobile-live-caster-mobile.png", pngBytes);
  writeFile(
    ".artifacts/store-approval-test/support-bundle.json",
    JSON.stringify({
      app: { name: "MobileLiveCaster", reportVersion: 1, bundleVersion: 15 },
      summary: {
        validationEvidenceAppBuildMismatch: false,
        validationEvidenceConsistentAppBuild: appBuild
      }
    })
  );
  writeStoreSubmissionFixture();
  writeUiEvidenceFile();
}

function writeStoreSubmissionFixture({ screenshotSource = "realDevice", appBuild: screenshotAppBuild = appBuild } = {}) {
  writeFile(".artifacts/store-approval-test/ios-store.png", pngBytes);
  writeFile(".artifacts/store-approval-test/android-store.png", pngBytes);
  writeFile(".artifacts/store-approval-test/submission-review.md", "# Store Submission Review\n\n- [ ] Listing reviewed.\n");
  writeFile(
    ".artifacts/store-approval-test/submission-metadata.json",
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
            path: ".artifacts/store-approval-test/ios-store.png",
            source: screenshotSource,
            ...(screenshotSource === "realDevice"
              ? { osVersion: "iOS 18.5", appBuild: screenshotAppBuild, capturedAt }
              : {})
          },
          {
            platform: "android",
            device: "Pixel 8 Pro",
            path: ".artifacts/store-approval-test/android-store.png",
            source: screenshotSource,
            ...(screenshotSource === "realDevice"
              ? { osVersion: "Android 15", appBuild: screenshotAppBuild, capturedAt }
              : {})
          }
        ],
        reviewDocuments: [
          { kind: "submissionReview", path: ".artifacts/store-approval-test/submission-review.md" }
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
          statusShort: " M scripts/verify-store-submission-approval.test.mjs"
        },
        metadata: metadataRecord(),
        screenshots: [
          screenshotRecord("ios", "iPhone 15 Pro Max", ".artifacts/store-approval-test/ios-store.png", screenshotSource, screenshotAppBuild),
          screenshotRecord("android", "Pixel 8 Pro", ".artifacts/store-approval-test/android-store.png", screenshotSource, screenshotAppBuild)
        ],
        reviewDocuments: [reviewDocumentRecord()]
      },
      null,
      2
    )
  );
}

function writeUiEvidenceFile() {
  writeFile(
    ".artifacts/store-approval-test/ui-evidence.json",
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
          {
            name: "desktop",
            horizontalOverflow: false,
            screenshot: artifactRecord("ui", ".artifacts/mobile-live-caster-desktop.png"),
            requiredTextChecks: requiredTextChecks()
          },
          {
            name: "mobile",
            horizontalOverflow: false,
            screenshot: artifactRecord("ui", ".artifacts/mobile-live-caster-mobile.png"),
            requiredTextChecks: requiredTextChecks()
          }
        ]
      },
      null,
      2
    )
  );
}

function readStoreManifest() {
  return JSON.parse(readFileSync(storeSubmissionChecklistPath, "utf8"));
}

function metadataRecord() {
  return record("store-submission-metadata", ".artifacts/store-approval-test/submission-metadata.json");
}

function reviewDocumentRecord() {
  return record("submissionReview", ".artifacts/store-approval-test/submission-review.md");
}

function screenshotRecord(platform, device, path, source, screenshotAppBuild = appBuild) {
  const content = readFileSync(path);
  const dimensions = pngDimensions(content);
  return {
    platform,
    kind: "screenshot",
    device,
    locale: "ja-JP",
    role: "store",
    source,
    ...(source === "realDevice"
      ? {
          osVersion: platform === "ios" ? "iOS 18.5" : "Android 15",
          appBuild: screenshotAppBuild,
          capturedAt
        }
      : {}),
    path,
    basename: path.split("/").at(-1),
    width: dimensions.width,
    height: dimensions.height,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function record(kind, path) {
  const content = readFileSync(path);
  return {
    kind,
    path,
    basename: path.split("/").at(-1),
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
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

function artifactRecord(group, path) {
  const content = readFileSync(path);
  return {
    group,
    path,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function requiredTextChecks() {
  return ["MobileLiveCaster", "Sources", "Go Live", "Live Setup", "PNGTuber", "RTMPS", "Face input", "Head range"].map(
    (text) => ({ text, count: 1 })
  );
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
