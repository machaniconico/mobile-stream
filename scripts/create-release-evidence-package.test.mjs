import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { releaseConfigArtifactPaths, requiredReleaseGateLabels } from "./release-artifact-policy.mjs";
import {
  createReleaseEvidencePackage,
  releaseEvidencePackageManifestName,
  releaseEvidencePackageType,
  validateReleaseEvidencePackage
} from "./create-release-evidence-package.mjs";

const fixtureRoot = ".artifacts/release-evidence-package-test";
const packageDir = `${fixtureRoot}/package`;
const reportPath = `${fixtureRoot}/release-report.json`;
const supportBundlePath = `${fixtureRoot}/support-bundle.json`;
const generatedFiles = [
  "dist/index.html",
  "dist/assets/release-evidence-package-test.js",
  "dist/assets/release-evidence-package-test.css",
  ".artifacts/rn/main.ios.jsbundle",
  ".artifacts/rn/index.android.bundle",
  ".artifacts/mobile-live-caster-desktop.png",
  ".artifacts/mobile-live-caster-mobile.png"
];
const fileBackups = new Map();
const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

describe("release evidence package creator", () => {
  beforeAll(() => {
    snapshotFiles(generatedFiles);
    writeFixtureFiles();
  });

  afterAll(() => {
    restoreFiles();
  });

  it("creates and verifies a standalone release evidence package from a passed RC report", () => {
    writeReportFixture();

    const result = createReleaseEvidencePackage({
      reportPath,
      outputDir: packageDir,
      allowDirty: true
    });

    expect(result.manifest.type).toBe(releaseEvidencePackageType);
    expect(existsSync(`${packageDir}/${releaseEvidencePackageManifestName}`)).toBe(true);
    expect(existsSync(`${packageDir}/release-candidate-report.json`)).toBe(true);
    expect(existsSync(`${packageDir}/support-bundle/support-bundle.json`)).toBe(true);
    expect(existsSync(`${packageDir}/ui-evidence/ui-evidence.json`)).toBe(true);
    expect(existsSync(`${packageDir}/artifacts/dist/index.html`)).toBe(true);
    expect(validateReleaseEvidencePackage({ packageDir })).toEqual([]);
  });

  it("rejects tampered packaged artifact files", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    writeFileSync(`${packageDir}/artifacts/dist/index.html`, "<!doctype html><title>Tampered</title>");
    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Release evidence package file metadata mismatch for artifacts/dist/index.html.");
  });

  it("rejects a package manifest that retains artifacts removed from the packaged report", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    packagedReport.artifacts.files = packagedReport.artifacts.files.filter((artifact) => artifact.path !== "dist/index.html");
    writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
    manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Package manifest contains artifact not present in the release report: web:dist/index.html.");
  });

  it("rejects traversal-style artifact paths before report validation reads sources", () => {
    writeReportFixture();
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    report.artifacts.files[0].path = "dist/../../outside-release-artifact.txt";
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    expect(() =>
      createReleaseEvidencePackage({
        reportPath,
        outputDir: `${fixtureRoot}/unsafe-package`,
        allowDirty: true
      })
    ).toThrow("Release report contains unsafe package source paths:");
  });

  it("rejects source drift when source verification is requested", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    writeFileSync("dist/index.html", "<!doctype html><title>Source drift</title>");
    const failures = validateReleaseEvidencePackage({ packageDir, verifySources: true });

    expect(failures).toContain("Package source metadata mismatch for dist/index.html.");
  });

  it("rejects unredacted sensitive text even when package metadata hashes match", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedUiEvidencePath = `${packageDir}/ui-evidence/ui-evidence.json`;
    const packagedUiEvidence = JSON.parse(readFileSync(packagedUiEvidencePath, "utf8"));
    packagedUiEvidence.debug = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456";
    writeFileSync(packagedUiEvidencePath, JSON.stringify(packagedUiEvidence, null, 2));

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    const evidenceGate = packagedReport.gates.find((gate) => gate.label === "Verify browser UI evidence");
    evidenceGate.evidence.sha256 = fileSha256(packagedUiEvidencePath);
    writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
    manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
    manifest.uiEvidence.bytes = readFileSync(packagedUiEvidencePath).byteLength;
    manifest.uiEvidence.sha256 = fileSha256(packagedUiEvidencePath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures.join("\n")).toContain("Release evidence package contains");
    expect(failures.join("\n")).toContain("unredacted sensitive text finding(s)");
    expect(failures.join("\n")).toContain("ui-evidence/ui-evidence.json contains a bearer/OAuth token");
  });

  it("scans release text artifacts such as mjs files for oauth tokens and RTMP stream keys", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    const packagedScriptPath = `${packageDir}/artifacts/scripts/create-release-evidence-package.mjs`;
    writeFileSync(
      packagedScriptPath,
      [
        "const twitch = 'PASS oauth:abcdefghijklmnopqrstuvwxyz123456';",
        "const publishUrl = 'rtmps://a.rtmps.youtube.com/live2/abcd-efgh-ijkl-mnop-qrst';"
      ].join("\n")
    );

    const packagedReportPath = `${packageDir}/release-candidate-report.json`;
    const packagedReport = JSON.parse(readFileSync(packagedReportPath, "utf8"));
    const reportArtifact = packagedReport.artifacts.files.find(
      (artifact) => artifact.path === "scripts/create-release-evidence-package.mjs"
    );
    reportArtifact.bytes = readFileSync(packagedScriptPath).byteLength;
    reportArtifact.sha256 = fileSha256(packagedScriptPath);
    writeFileSync(packagedReportPath, JSON.stringify(packagedReport, null, 2));

    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.sourceReport.bytes = readFileSync(packagedReportPath).byteLength;
    manifest.sourceReport.sha256 = fileSha256(packagedReportPath);
    const packageArtifact = manifest.artifacts.find(
      (artifact) => artifact.sourcePath === "scripts/create-release-evidence-package.mjs"
    );
    packageArtifact.bytes = readFileSync(packagedScriptPath).byteLength;
    packageArtifact.sha256 = fileSha256(packagedScriptPath);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures.join("\n")).toContain("artifacts/scripts/create-release-evidence-package.mjs contains a Twitch IRC oauth token");
    expect(failures.join("\n")).toContain("artifacts/scripts/create-release-evidence-package.mjs contains a stream key in an RTMP URL");
  });

  it("does not read package-escaped paths during the privacy scan", () => {
    resetPackageDir();
    writeReportFixture();
    createReleaseEvidencePackage({ reportPath, outputDir: packageDir, allowDirty: true });

    writeFile(`${fixtureRoot}/outside.json`, JSON.stringify({ debug: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456" }));
    const manifestPath = `${packageDir}/${releaseEvidencePackageManifestName}`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.uiEvidence.packagedPath = "../outside.json";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const failures = validateReleaseEvidencePackage({ packageDir });

    expect(failures).toContain("Package entry path must be package-relative: ../outside.json.");
    expect(failures.join("\n")).not.toContain("unredacted sensitive text finding");
  });
});

function writeFixtureFiles() {
  resetPackageDir();
  writeFile("dist/index.html", "<!doctype html><title>MobileLiveCaster</title>");
  writeFile("dist/assets/release-evidence-package-test.js", "console.log('release-evidence-package-test');");
  writeFile("dist/assets/release-evidence-package-test.css", "body { color: #111; }");
  writeFile(".artifacts/rn/main.ios.jsbundle", "ios bundle");
  writeFile(".artifacts/rn/index.android.bundle", "android bundle");
  writeFile(".artifacts/mobile-live-caster-desktop.png", pngBytes);
  writeFile(".artifacts/mobile-live-caster-mobile.png", pngBytes);
  writeFile(supportBundlePath, JSON.stringify({ app: "MobileLiveCaster", fixture: true }));
  writeUiEvidenceFile();
}

function writeReportFixture() {
  writeFixtureFiles();
  const artifactFiles = [
    ...releaseConfigArtifactPaths.map((path) => artifactRecord("release-config", path)),
    artifactRecord("web", "dist/index.html"),
    artifactRecord("web", "dist/assets/release-evidence-package-test.js"),
    artifactRecord("web", "dist/assets/release-evidence-package-test.css"),
    artifactRecord("react-native", ".artifacts/rn/main.ios.jsbundle"),
    artifactRecord("react-native", ".artifacts/rn/index.android.bundle"),
    artifactRecord("ui", ".artifacts/mobile-live-caster-desktop.png"),
    artifactRecord("ui", ".artifacts/mobile-live-caster-mobile.png")
  ];

  writeFile(
    reportPath,
    JSON.stringify(
      {
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
          statusShort: " M scripts/create-release-evidence-package.test.mjs"
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
            command: "read .artifacts/release-evidence-package-test/ui-evidence.json",
            status: "passed",
            startedAt: new Date(Date.now() - 1_000).toISOString(),
            finishedAt: new Date().toISOString(),
            durationMs: 1,
            exitCode: 0,
            error: null,
            evidence: {
              path: ".artifacts/release-evidence-package-test/ui-evidence.json",
              sha256: fileSha256(".artifacts/release-evidence-package-test/ui-evidence.json"),
              target: "http://127.0.0.1:5173/",
              finishedAt: new Date().toISOString(),
              viewports: []
            }
          }
        ],
        error: null
      },
      null,
      2
    )
  );
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

function writeUiEvidenceFile() {
  writeFile(
    ".artifacts/release-evidence-package-test/ui-evidence.json",
    JSON.stringify(
      {
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "ui-verification",
        status: "passed",
        target: "http://127.0.0.1:5173/",
        finishedAt: new Date().toISOString(),
        git: {
          commit: currentCommit(),
          dirty: true,
          statusShort: " M scripts/create-release-evidence-package.test.mjs"
        },
        viewports: [
          uiViewport("desktop", ".artifacts/mobile-live-caster-desktop.png"),
          uiViewport("mobile", ".artifacts/mobile-live-caster-mobile.png")
        ]
      },
      null,
      2
    )
  );
}

function uiViewport(name, screenshotPath) {
  const content = readFileSync(screenshotPath);
  return {
    name,
    horizontalOverflow: false,
    screenshot: {
      path: screenshotPath,
      bytes: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex")
    }
  };
}

function writeFile(path, content) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function currentCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

function resetPackageDir() {
  rmSync(packageDir, { recursive: true, force: true });
}

function snapshotFiles(paths) {
  for (const path of paths) {
    fileBackups.set(path, existsSync(path) ? readFileSync(path) : null);
  }
}

function restoreFiles() {
  rmSync(fixtureRoot, { recursive: true, force: true });
  for (const [path, content] of fileBackups.entries()) {
    if (content === null) {
      rmSync(path, { force: true });
    } else {
      mkdirSync(resolve(path, ".."), { recursive: true });
      writeFileSync(path, content);
    }
  }
}
