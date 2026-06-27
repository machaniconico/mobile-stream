import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRgbaPngFixture } from "./png-test-fixtures.mjs";

const fixtureRoot = ".artifacts/create-store-submission-draft-test";
const sourceRoot = `${fixtureRoot}/source`;
const outputDir = `${fixtureRoot}/store`;
const manifestPath = `${fixtureRoot}/store-submission-checklist.json`;
const iosSource = `${sourceRoot}/ios-source.png`;
const androidSource = `${sourceRoot}/android-source.png`;
const uiEvidencePath = `${fixtureRoot}/ui-evidence.json`;

const pngBytes = createRgbaPngFixture(1, 1);

describe("store submission draft creator", () => {
  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("creates submission metadata and a verified checklist from explicit platform screenshots", () => {
    writeSourceScreenshots();

    const result = runDraft([
      "--output-dir",
      outputDir,
      "--manifest",
      manifestPath,
      "--ios-screenshot",
      iosSource,
      "--android-screenshot",
      androidSource,
      "--support-url",
      "https://mobilelivecaster.app/support",
      "--privacy-policy-url",
      "https://mobilelivecaster.app/privacy",
      "--support-email",
      "support@mobilelivecaster.app"
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Wrote store submission metadata: ${outputDir}/submission-metadata.json`);
    expect(result.stdout).toContain(`Wrote store submission review: ${outputDir}/submission-review.md`);
    expect(existsSync(`${outputDir}/screenshots/ios-store.png`)).toBe(true);
    expect(existsSync(`${outputDir}/screenshots/android-store.png`)).toBe(true);
    expect(existsSync(`${outputDir}/submission-review.md`)).toBe(true);

    const metadata = JSON.parse(readFileSync(`${outputDir}/submission-metadata.json`, "utf8"));
    expect(metadata.appStore.privacyPolicyUrl).toBe("https://mobilelivecaster.app/privacy");
    expect(metadata.screenshots.map((screenshot) => screenshot.path)).toEqual([
      `${outputDir}/screenshots/ios-store.png`,
      `${outputDir}/screenshots/android-store.png`
    ]);
    expect(metadata.screenshots.map((screenshot) => screenshot.source)).toEqual(["realDevice", "realDevice"]);
    expect(metadata.reviewDocuments).toEqual([{ kind: "submissionReview", path: `${outputDir}/submission-review.md` }]);
    expect(readFileSync(`${outputDir}/submission-review.md`, "utf8")).toContain("## Approval Checklist");

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.type).toBe("store-submission-checklist-manifest");
    expect(manifest.screenshots).toHaveLength(2);
    expect(manifest.screenshots.map((screenshot) => screenshot.source)).toEqual(["realDevice", "realDevice"]);
    expect(manifest.reviewDocuments).toHaveLength(1);
    expect(manifest.reviewDocuments[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("creates a draft from a passing UI evidence mobile screenshot when platform screenshots are omitted", () => {
    writeSourceScreenshots();
    writeUiEvidence({ screenshotPath: iosSource });

    const result = runDraft(["--output-dir", outputDir, "--manifest", manifestPath, "--ui-evidence-json", uiEvidencePath]);

    expect(result.status).toBe(0);
    const metadata = JSON.parse(readFileSync(`${outputDir}/submission-metadata.json`, "utf8"));
    expect(metadata.screenshots.map((screenshot) => screenshot.platform)).toEqual(["ios", "android"]);
    expect(metadata.screenshots.map((screenshot) => screenshot.source)).toEqual(["uiEvidenceDraft", "uiEvidenceDraft"]);
    expect(metadata.reviewDocuments[0].path).toBe(`${outputDir}/submission-review.md`);
    expect(readFileSync(`${outputDir}/screenshots/ios-store.png`).equals(pngBytes)).toBe(true);
    expect(readFileSync(`${outputDir}/screenshots/android-store.png`).equals(pngBytes)).toBe(true);
  });

  it("rejects UI evidence that is not passing", () => {
    writeSourceScreenshots();
    writeUiEvidence({ screenshotPath: iosSource, status: "failed" });

    const result = runDraft(["--output-dir", outputDir, "--manifest", manifestPath, "--ui-evidence-json", uiEvidencePath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("UI evidence JSON must be a passing MobileLiveCaster browser-ui-verification report.");
  });

  it("rejects non-PNG screenshot sources before writing the checklist", () => {
    mkdirSync(sourceRoot, { recursive: true });
    writeFileSync(`${sourceRoot}/ios.txt`, "not a png");
    writeFileSync(androidSource, pngBytes);

    const result = runDraft([
      "--output-dir",
      outputDir,
      "--manifest",
      manifestPath,
      "--ios-screenshot",
      `${sourceRoot}/ios.txt`,
      "--android-screenshot",
      androidSource
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("iOS store screenshot source must be a PNG file");
  });

  it("rejects symlinked screenshot sources before copying store evidence", () => {
    writeSourceScreenshots();
    const iosSymlink = `${sourceRoot}/ios-link.png`;
    symlinkSync(resolve(iosSource), iosSymlink);

    const result = runDraft([
      "--output-dir",
      outputDir,
      "--manifest",
      manifestPath,
      "--ios-screenshot",
      iosSymlink,
      "--android-screenshot",
      androidSource
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`iOS store screenshot source must not be a symbolic link: ${iosSymlink}`);
  });

  it("rejects UI evidence paths with symlinked parents before reading linked JSON", () => {
    writeSourceScreenshots();
    const outsideEvidenceRoot = `${fixtureRoot}/outside-ui-evidence`;
    const evidenceLinkRoot = `${fixtureRoot}/ui-evidence-link`;
    mkdirSync(outsideEvidenceRoot, { recursive: true });
    writeFileSync(`${outsideEvidenceRoot}/ui-evidence.json`, "{}");
    symlinkSync(resolve(outsideEvidenceRoot), evidenceLinkRoot);

    const result = runDraft([
      "--output-dir",
      outputDir,
      "--manifest",
      manifestPath,
      "--ui-evidence-json",
      `${evidenceLinkRoot}/ui-evidence.json`
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`UI evidence JSON path parent must not be a symbolic link: ${evidenceLinkRoot}`);
  });

  it("rejects symlinked output directories before creating store screenshots", () => {
    writeSourceScreenshots();
    const outsideStore = `${fixtureRoot}/outside-store`;
    mkdirSync(outsideStore, { recursive: true });
    symlinkSync(resolve(outsideStore), outputDir);

    const result = runDraft([
      "--output-dir",
      outputDir,
      "--manifest",
      manifestPath,
      "--ios-screenshot",
      iosSource,
      "--android-screenshot",
      androidSource
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Store submission screenshots directory path parent must not be a symbolic link: ${outputDir}`);
    expect(existsSync(`${outsideStore}/screenshots/ios-store.png`)).toBe(false);
  });

  it("rejects symlinked metadata output paths before writing linked targets", () => {
    writeSourceScreenshots();
    mkdirSync(outputDir, { recursive: true });
    const outsideMetadata = `${fixtureRoot}/outside-metadata.json`;
    const metadataSymlink = `${outputDir}/submission-metadata.json`;
    writeFileSync(outsideMetadata, "unchanged");
    symlinkSync(resolve(outsideMetadata), metadataSymlink);

    const result = runDraft([
      "--output-dir",
      outputDir,
      "--manifest",
      manifestPath,
      "--metadata-out",
      metadataSymlink,
      "--ios-screenshot",
      iosSource,
      "--android-screenshot",
      androidSource
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Store submission metadata output must not be a symbolic link: ${metadataSymlink}`);
    expect(readFileSync(outsideMetadata, "utf8")).toBe("unchanged");
  });

  it("rejects dangling metadata output symlinks before creating linked targets", () => {
    writeSourceScreenshots();
    mkdirSync(outputDir, { recursive: true });
    const missingMetadataTarget = `${fixtureRoot}/missing-metadata-target.json`;
    const metadataSymlink = `${outputDir}/submission-metadata.json`;
    symlinkSync(resolve(missingMetadataTarget), metadataSymlink);

    const result = runDraft([
      "--output-dir",
      outputDir,
      "--manifest",
      manifestPath,
      "--metadata-out",
      metadataSymlink,
      "--ios-screenshot",
      iosSource,
      "--android-screenshot",
      androidSource
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Store submission metadata output must not be a symbolic link: ${metadataSymlink}`);
    expect(existsSync(missingMetadataTarget)).toBe(false);
  });
});

function writeSourceScreenshots() {
  mkdirSync(sourceRoot, { recursive: true });
  writeFileSync(iosSource, pngBytes);
  writeFileSync(androidSource, pngBytes);
}

function writeUiEvidence({ screenshotPath, status = "passed" }) {
  writeFileSync(
    uiEvidencePath,
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "browser-ui-verification",
        status,
        viewports: [
          {
            name: "mobile",
            screenshot: {
              path: screenshotPath
            }
          }
        ]
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
