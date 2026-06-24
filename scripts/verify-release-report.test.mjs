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
  ".artifacts/release-report-test/support-bundle.json",
  ".artifacts/release-report-test/ui-evidence.json"
];
const fileBackups = new Map();
const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

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
    writeFileSync(".artifacts/mobile-live-caster-mobile.png", "not a png");
    writeUiEvidenceFile();
    const report = createReport();

    const failures = validateReport(report, reportOptions());

    expect(failures).toContain(
      "Browser UI evidence screenshot is not a PNG file: .artifacts/mobile-live-caster-mobile.png."
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
});

function reportOptions() {
  return {
    maxAgeHours: 24,
    allowDirty: true,
    allowCommitMismatch: false
  };
}

function createReport({ includeDistribution = false } = {}) {
  writeUiEvidenceFile();
  if (includeDistribution) {
    writeDistributionFixture();
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
    ...(includeDistribution ? distributionArtifactRecords() : [])
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
  writeFile(".artifacts/release-report-test/app-release.aab", "fake-android-aab");
  writeFile(".artifacts/release-report-test/MobileLiveCaster.ipa", "fake-ios-ipa");
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

function distributionArtifactRecords() {
  return [
    artifactRecord("distribution", distributionArtifactManifestPath),
    artifactRecord("distribution", ".artifacts/release-report-test/app-release.aab"),
    artifactRecord("distribution", ".artifacts/release-report-test/MobileLiveCaster.ipa")
  ];
}

function distributionManifestRecord(platform, kind, path) {
  const content = readFileSync(path);
  return {
    platform,
    kind,
    path,
    basename: path.split("/").at(-1),
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function writeUiEvidenceFile() {
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
          viewportEvidence("desktop", ".artifacts/mobile-live-caster-desktop.png"),
          viewportEvidence("mobile", ".artifacts/mobile-live-caster-mobile.png")
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
  rmSync(".artifacts/release-report-test", { recursive: true, force: true });
  rmSync(".artifacts/distribution-artifacts.json", { force: true });
  rmSync("dist/assets/release-report-test.js", { force: true });
  rmSync("dist/assets/release-report-test.css", { force: true });
}
