import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { distributionArtifactManifestPath } from "./verify-distribution-artifacts.mjs";
import { dashboardEvidenceManifestPath } from "./verify-platform-dashboard-evidence.mjs";
import { storeSubmissionChecklistPath } from "./verify-store-submission-checklist.mjs";

const fixtureRoot = ".artifacts/verify-release-candidate-test";
const supportBundlePath = `${fixtureRoot}/support-bundle.json`;
const reportPath = `${fixtureRoot}/release-candidate-report.json`;
const managedArtifactPaths = [
  storeSubmissionChecklistPath,
  distributionArtifactManifestPath,
  dashboardEvidenceManifestPath
];
let artifactBackups = new Map();

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
