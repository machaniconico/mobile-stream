import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createRgbaPngFixture } from "./png-test-fixtures.mjs";

const fixtureRoot = ".artifacts/verify-store-submission-checklist-test";
const metadataPath = `${fixtureRoot}/submission-metadata.json`;
const iosScreenshot = `${fixtureRoot}/ios-store.png`;
const androidScreenshot = `${fixtureRoot}/android-store.png`;
const reviewDocument = `${fixtureRoot}/submission-review.md`;
const manifestPath = `${fixtureRoot}/store-submission-checklist.json`;
const capturedAt = "2026-06-25T00:00:00.000Z";
const appBuild = "1.0.0 (15)";

const tinyPngBytes = createRgbaPngFixture(1, 1);
const pngBytes = pngWithDimensions(1179, 2556);

describe("store submission checklist verifier", () => {
  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("writes and verifies App Store / Play Console metadata and screenshot hashes", () => {
    writeStoreSubmissionFiles();

    const writeResult = runVerifier([
      "--write",
      "--allow-dirty",
      "--metadata",
      metadataPath,
      "--manifest",
      manifestPath
    ]);

    expect(writeResult.status).toBe(0);
    expect(writeResult.stdout).toContain("Wrote store submission checklist");

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.type).toBe("store-submission-checklist-manifest");
    expect(manifest.metadata.path).toBe(metadataPath);
    expect(manifest.screenshots.map((screenshot) => `${screenshot.platform}:${screenshot.device}`)).toEqual([
      "ios:iPhone 15 Pro Max",
      "android:Pixel 8 Pro"
    ]);
    expect(manifest.screenshots.map((screenshot) => screenshot.source)).toEqual(["realDevice", "realDevice"]);
    expect(manifest.screenshots.map((screenshot) => screenshot.osVersion)).toEqual(["iOS 18.5", "Android 15"]);
    expect(manifest.screenshots.map((screenshot) => screenshot.appBuild)).toEqual([appBuild, appBuild]);
    expect(manifest.screenshots.map((screenshot) => `${screenshot.width}x${screenshot.height}`)).toEqual([
      "1179x2556",
      "1179x2556"
    ]);
    expect(manifest.screenshots[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.reviewDocuments).toHaveLength(1);
    expect(manifest.reviewDocuments[0].path).toBe(reviewDocument);
    expect(manifest.reviewDocuments[0].sha256).toMatch(/^[a-f0-9]{64}$/);

    const verifyResult = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);
    expect(verifyResult.status).toBe(0);
    expect(verifyResult.stdout).toContain("Store submission checklist verification passed (2 screenshots).");

    const finalVerifyResult = runVerifier([
      "--verify",
      "--allow-dirty",
      "--manifest",
      manifestPath,
      "--require-real-device-screenshots"
    ]);
    expect(finalVerifyResult.status).toBe(0);
  });

  it("rejects metadata when a platform screenshot is missing", () => {
    writeStoreSubmissionFiles({
      screenshots: [{ platform: "ios", device: "iPhone 15 Pro Max", path: iosScreenshot }]
    });

    const result = runVerifier(["--write", "--allow-dirty", "--metadata", metadataPath, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Store submission checklist is missing a android screenshot.");
  });

  it("rejects non-https privacy policy URLs", () => {
    writeStoreSubmissionFiles({
      appStore: { privacyPolicyUrl: "http://example.com/privacy" }
    });

    const result = runVerifier(["--write", "--allow-dirty", "--metadata", metadataPath, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Store submission metadata appStore.privacyPolicyUrl must be an https URL.");
  });

  it("rejects unredacted token-like text in store metadata", () => {
    writeStoreSubmissionFiles({
      playStore: {
        dataSafetyNotes: "No sale of data. Example rejected secret: client_secret=supersecretvalue12345"
      }
    });

    const result = runVerifier(["--write", "--allow-dirty", "--metadata", metadataPath, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Store submission metadata contains possible OAuth/access/refresh/client secret");
  });

  it("fails when a screenshot is modified after manifest creation", () => {
    writeStoreSubmissionFiles();
    expect(runVerifier(["--write", "--allow-dirty", "--metadata", metadataPath, "--manifest", manifestPath]).status).toBe(0);

    writeFileSync(androidScreenshot, pngBytes.subarray(0, 12));
    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Store submission screenshot metadata mismatch for ${androidScreenshot}.`);
  });

  it("rejects store screenshots with forged IHDR dimensions", () => {
    writeStoreSubmissionFiles();
    const forgedPng = Buffer.from(tinyPngBytes);
    forgedPng.writeUInt32BE(1179, 16);
    forgedPng.writeUInt32BE(2556, 20);
    writeFileSync(iosScreenshot, forgedPng);

    const result = runVerifier(["--write", "--allow-dirty", "--metadata", metadataPath, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `ios store screenshot is not a structurally valid PNG file: ${iosScreenshot} (CRC mismatch in IHDR chunk).`
    );
  });

  it("fails when a review document is modified after manifest creation", () => {
    writeStoreSubmissionFiles();
    expect(runVerifier(["--write", "--allow-dirty", "--metadata", metadataPath, "--manifest", manifestPath]).status).toBe(0);

    writeFileSync(reviewDocument, "Updated review with client_secret=supersecretvalue12345");
    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Store submission review document metadata mismatch for ${reviewDocument}.`);
    expect(result.stderr).toContain("Store submission metadata contains possible OAuth/access/refresh/client secret");
  });

  it("rejects verification when git commit provenance is missing", () => {
    writeStoreSubmissionFiles();
    expect(runVerifier(["--write", "--allow-dirty", "--metadata", metadataPath, "--manifest", manifestPath]).status).toBe(0);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.git.commit = "";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Store submission checklist git commit is missing.");
  });

  it("rejects UI evidence draft screenshots in final store-submission mode", () => {
    writeStoreSubmissionFiles({
      screenshots: [
        { platform: "ios", device: "iPhone 15 Pro Max", path: iosScreenshot, locale: "ja-JP", role: "main", source: "uiEvidenceDraft" },
        { platform: "android", device: "Pixel 8 Pro", path: androidScreenshot, locale: "ja-JP", role: "main", source: "uiEvidenceDraft" }
      ]
    });
    expect(runVerifier(["--write", "--allow-dirty", "--metadata", metadataPath, "--manifest", manifestPath]).status).toBe(0);

    const result = runVerifier([
      "--verify",
      "--allow-dirty",
      "--manifest",
      manifestPath,
      "--require-real-device-screenshots"
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must be captured from a real device for final store submission");
  });

  it("rejects final real-device screenshots without capture metadata", () => {
    writeStoreSubmissionFiles({
      screenshots: [
        { platform: "ios", device: "iPhone 15 Pro Max", path: iosScreenshot, locale: "ja-JP", role: "main", source: "realDevice" },
        { platform: "android", device: "Pixel 8 Pro", path: androidScreenshot, locale: "ja-JP", role: "main", source: "realDevice" }
      ]
    });
    expect(runVerifier(["--write", "--allow-dirty", "--metadata", metadataPath, "--manifest", manifestPath]).status).toBe(0);

    const result = runVerifier([
      "--verify",
      "--allow-dirty",
      "--manifest",
      manifestPath,
      "--require-real-device-screenshots"
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Store submission screenshot ${iosScreenshot} must include the real device OS version`);
    expect(result.stderr).toContain(`Store submission screenshot ${androidScreenshot} must include the app build/version used for capture.`);
  });

  it("rejects placeholder-sized screenshots in final store-submission mode", () => {
    writeStoreSubmissionFiles();
    writeFileSync(iosScreenshot, tinyPngBytes);
    writeFileSync(androidScreenshot, tinyPngBytes);
    expect(runVerifier(["--write", "--allow-dirty", "--metadata", metadataPath, "--manifest", manifestPath]).status).toBe(0);

    const result = runVerifier([
      "--verify",
      "--allow-dirty",
      "--manifest",
      manifestPath,
      "--require-real-device-screenshots"
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must be at least 1080px on the short edge and 1920px on the long edge");
  });
});

function writeStoreSubmissionFiles(overrides = {}) {
  mkdirSync(fixtureRoot, { recursive: true });
  writeFileSync(iosScreenshot, pngBytes);
  writeFileSync(androidScreenshot, pngBytes);
  writeFileSync(reviewDocument, "# Store Submission Review\n\n- [ ] Public listing reviewed.\n");
  writeFileSync(metadataPath, JSON.stringify(createMetadata(overrides), null, 2));
}

function createMetadata(overrides = {}) {
  const base = {
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
      ageRatingNotes: "No gambling, no user-generated storefront, no mature content included.",
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
        path: iosScreenshot,
        locale: "ja-JP",
        role: "main",
        source: "realDevice",
        osVersion: "iOS 18.5",
        appBuild,
        capturedAt
      },
      {
        platform: "android",
        device: "Pixel 8 Pro",
        path: androidScreenshot,
        locale: "ja-JP",
        role: "main",
        source: "realDevice",
        osVersion: "Android 15",
        appBuild,
        capturedAt
      }
    ],
    reviewDocuments: [
      { kind: "submissionReview", path: reviewDocument }
    ]
  };

  return {
    ...base,
    ...overrides,
    appStore: { ...base.appStore, ...(overrides.appStore || {}) },
    playStore: { ...base.playStore, ...(overrides.playStore || {}) },
    screenshots: overrides.screenshots || base.screenshots,
    reviewDocuments: overrides.reviewDocuments || base.reviewDocuments
  };
}

function runVerifier(args) {
  return spawnSync(process.execPath, ["scripts/verify-store-submission-checklist.mjs", ...args], {
    encoding: "utf8"
  });
}

function pngWithDimensions(width, height) {
  return createRgbaPngFixture(width, height);
}
