import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const fixtureRoot = ".artifacts/import-store-real-device-screenshots-test";
const sourceRoot = `${fixtureRoot}/source`;
const outputDir = `${fixtureRoot}/store`;
const manifestPath = `${fixtureRoot}/store-submission-checklist.json`;
const iosDraftSource = `${sourceRoot}/ios-draft.png`;
const iosRealSource = `${sourceRoot}/ios-real.png`;
const androidRealSource = `${sourceRoot}/android-real.png`;
const metadataPath = `${outputDir}/submission-metadata.json`;
const reviewPath = `${outputDir}/submission-review.md`;
const capturedAt = "2026-06-25T00:00:00.000Z";
const appBuild = "1.0.0 (15)";

const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);
const otherPngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAQAAABWes8LAAAADElEQVR42mP8z8AARQAExgH+RtwAAAABJRU5ErkJggg==",
  "base64"
);

describe("store real-device screenshot importer", () => {
  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("replaces UI draft screenshots with real-device captures and regenerates final checklist", () => {
    writeSourceScreenshots();
    const draft = runDraft([
      "--output-dir",
      outputDir,
      "--manifest",
      manifestPath,
      "--ui-evidence-json",
      `${fixtureRoot}/ui-evidence.json`
    ]);
    expect(draft.status).toBe(0);

    const result = runImporter([
      "--metadata",
      metadataPath,
      "--manifest",
      manifestPath,
      "--ios-screenshot",
      iosRealSource,
      "--android-screenshot",
      androidRealSource,
      "--ios-device",
      "iPhone 15 Pro",
      "--android-device",
      "Pixel 8 Pro",
      "--ios-os-version",
      "iOS 18.5",
      "--android-os-version",
      "Android 15",
      "--app-build",
      appBuild,
      "--captured-at",
      capturedAt,
      "--locale",
      "ja-JP"
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Updated store submission metadata: ${metadataPath}`);
    expect(result.stdout).toContain(`Updated store submission review: ${reviewPath}`);
    expect(readFileSync(`${outputDir}/screenshots/ios-store.png`).equals(otherPngBytes)).toBe(true);
    expect(readFileSync(`${outputDir}/screenshots/android-store.png`).equals(otherPngBytes)).toBe(true);

    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    expect(metadata.screenshots.map((screenshot) => screenshot.source)).toEqual(["realDevice", "realDevice"]);
    expect(metadata.screenshots.map((screenshot) => screenshot.device)).toEqual(["iPhone 15 Pro", "Pixel 8 Pro"]);
    expect(metadata.screenshots.map((screenshot) => screenshot.osVersion)).toEqual(["iOS 18.5", "Android 15"]);
    expect(metadata.screenshots.map((screenshot) => screenshot.appBuild)).toEqual([appBuild, appBuild]);
    expect(metadata.screenshots.map((screenshot) => screenshot.capturedAt)).toEqual([capturedAt, capturedAt]);
    expect(metadata.reviewDocuments).toEqual([{ kind: "submissionReview", path: reviewPath }]);
    expect(readFileSync(reviewPath, "utf8")).toContain(`| ios | iPhone 15 Pro | ja-JP | realDevice | iOS 18.5 | ${appBuild} | ${capturedAt} |`);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.screenshots.map((screenshot) => screenshot.source)).toEqual(["realDevice", "realDevice"]);
    expect(manifest.screenshots.map((screenshot) => screenshot.osVersion)).toEqual(["iOS 18.5", "Android 15"]);
    expect(manifest.screenshots.map((screenshot) => screenshot.appBuild)).toEqual([appBuild, appBuild]);
    expect(manifest.screenshots.map((screenshot) => screenshot.sha256)).toHaveLength(2);

    const final = runChecklist(["--verify", "--manifest", manifestPath, "--require-real-device-screenshots", "--allow-dirty"]);
    expect(final.status).toBe(0);
  });

  it("preserves store listing fields while updating screenshot evidence", () => {
    writeSourceScreenshots();
    writeMetadata({
      appStore: { subtitle: "Live Tools" },
      playStore: { shortDescription: "VTuber live tools" }
    });

    const result = runImporter([
      "--metadata",
      metadataPath,
      "--manifest",
      manifestPath,
      "--ios-screenshot",
      iosRealSource,
      "--android-screenshot",
      androidRealSource,
      "--ios-os-version",
      "iOS 18.5",
      "--android-os-version",
      "Android 15",
      "--app-build",
      appBuild
    ]);

    expect(result.status).toBe(0);
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    expect(metadata.appStore.subtitle).toBe("Live Tools");
    expect(metadata.playStore.shortDescription).toBe("VTuber live tools");
    expect(metadata.screenshots.map((screenshot) => screenshot.source)).toEqual(["realDevice", "realDevice"]);
  });

  it("rejects a missing metadata file before copying screenshots", () => {
    writeSourceScreenshots();

    const result = runImporter([
      "--metadata",
      metadataPath,
      "--manifest",
      manifestPath,
      "--ios-screenshot",
      iosRealSource,
      "--android-screenshot",
      androidRealSource,
      "--ios-os-version",
      "iOS 18.5",
      "--android-os-version",
      "Android 15",
      "--app-build",
      appBuild
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Store submission metadata does not exist: ${metadataPath}`);
    expect(existsSync(`${outputDir}/screenshots/ios-store.png`)).toBe(false);
  });

  it("rejects non-PNG real-device sources", () => {
    writeSourceScreenshots();
    writeMetadata();
    writeFileSync(`${sourceRoot}/bad-ios.txt`, "not a png");

    const result = runImporter([
      "--metadata",
      metadataPath,
      "--manifest",
      manifestPath,
      "--ios-screenshot",
      `${sourceRoot}/bad-ios.txt`,
      "--android-screenshot",
      androidRealSource,
      "--ios-os-version",
      "iOS 18.5",
      "--android-os-version",
      "Android 15",
      "--app-build",
      appBuild
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("iOS real-device screenshot source must be a PNG file");
  });

  it("requires OS and app build metadata before importing final screenshots", () => {
    writeSourceScreenshots();
    writeMetadata();

    const result = runImporter([
      "--metadata",
      metadataPath,
      "--manifest",
      manifestPath,
      "--ios-screenshot",
      iosRealSource,
      "--android-screenshot",
      androidRealSource,
      "--ios-os-version",
      "iOS 18.5"
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Provide --android-os-version <version> for final Android store screenshot evidence.");
  });
});

function writeSourceScreenshots() {
  mkdirSync(sourceRoot, { recursive: true });
  writeFileSync(iosDraftSource, pngBytes);
  writeFileSync(iosRealSource, otherPngBytes);
  writeFileSync(androidRealSource, otherPngBytes);
  writeFileSync(
    `${fixtureRoot}/ui-evidence.json`,
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "browser-ui-verification",
        status: "passed",
        viewports: [
          {
            name: "mobile",
            screenshot: {
              path: iosDraftSource
            }
          }
        ]
      },
      null,
      2
    )
  );
}

function writeMetadata(overrides = {}) {
  mkdirSync(`${outputDir}/screenshots`, { recursive: true });
  writeFileSync(`${outputDir}/screenshots/ios-store.png`, pngBytes);
  writeFileSync(`${outputDir}/screenshots/android-store.png`, pngBytes);
  writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        app: "MobileLiveCaster",
        appStore: {
          name: "MobileLiveCaster",
          subtitle: "VTuber Live Studio",
          description:
            "MobileLiveCaster helps creators prepare mobile VTuber streams with PNGTuber controls, mic monitoring, chat readout checks, and release evidence before going live.",
          keywords: "VTuber,live,streaming,RTMP,avatar",
          supportUrl: "https://mobilelivecaster.app/support",
          privacyPolicyUrl: "https://mobilelivecaster.app/privacy",
          category: "Photo & Video",
          releaseNotes: "Initial public release candidate with mobile VTuber streaming tools.",
          reviewContactEmail: "support@mobilelivecaster.app",
          ageRatingNotes: "No gambling, no user-generated storefront, and no mature content is bundled.",
          appPrivacyNotes:
            "Stream settings are user-provided, stream keys stay in secure device storage, and release evidence redacts sensitive values.",
          ...(overrides.appStore || {})
        },
        playStore: {
          name: "MobileLiveCaster",
          shortDescription: "Mobile VTuber streaming studio",
          fullDescription:
            "MobileLiveCaster helps creators prepare mobile RTMPS streams with PNGTuber controls, mic processing, chat readout checks, and release validation evidence.",
          privacyPolicyUrl: "https://mobilelivecaster.app/privacy",
          supportEmail: "support@mobilelivecaster.app",
          category: "Video Players & Editors",
          releaseNotes: "Initial public release candidate with mobile VTuber streaming tools.",
          dataSafetyNotes:
            "Stream keys stay in secure device storage, OAuth tokens are redacted from support evidence, and the app does not sell personal data.",
          contentRatingNotes: "No gambling, no monetized loot, and no mature content is bundled.",
          ...(overrides.playStore || {})
        },
        screenshots: [
          {
            platform: "ios",
            device: "iPhone 15 Pro Max",
            path: `${outputDir}/screenshots/ios-store.png`,
            locale: "ja-JP",
            role: "main",
            source: "uiEvidenceDraft"
          },
          {
            platform: "android",
            device: "Pixel 8 Pro",
            path: `${outputDir}/screenshots/android-store.png`,
            locale: "ja-JP",
            role: "main",
            source: "uiEvidenceDraft"
          }
        ],
        reviewDocuments: [{ kind: "submissionReview", path: reviewPath }]
      },
      null,
      2
    )
  );
}

function runDraft(args) {
  return spawnSync(process.execPath, ["scripts/create-store-submission-draft.mjs", ...args], {
    encoding: "utf8"
  });
}

function runImporter(args) {
  return spawnSync(process.execPath, ["scripts/import-store-real-device-screenshots.mjs", ...args], {
    encoding: "utf8"
  });
}

function runChecklist(args) {
  return spawnSync(process.execPath, ["scripts/verify-store-submission-checklist.mjs", ...args], {
    encoding: "utf8"
  });
}
