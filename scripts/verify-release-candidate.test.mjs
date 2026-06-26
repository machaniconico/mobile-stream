import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { storeSubmissionChecklistPath } from "./verify-store-submission-checklist.mjs";

const fixtureRoot = ".artifacts/verify-release-candidate-test";
const supportBundlePath = `${fixtureRoot}/support-bundle.json`;
const reportPath = `${fixtureRoot}/release-candidate-report.json`;
let storeSubmissionChecklistBackup = null;

describe("release candidate verifier", () => {
  beforeEach(() => {
    storeSubmissionChecklistBackup = existsSync(storeSubmissionChecklistPath) ? readFileSync(storeSubmissionChecklistPath) : null;
    rmSync(fixtureRoot, { recursive: true, force: true });
    writeFile(supportBundlePath, JSON.stringify({ app: { name: "MobileLiveCaster" } }));
  });

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
    if (storeSubmissionChecklistBackup === null) {
      rmSync(storeSubmissionChecklistPath, { force: true });
    } else {
      writeFile(storeSubmissionChecklistPath, storeSubmissionChecklistBackup);
    }
  });

  it("fails before expensive source gates when store-submission evidence exists without a store-release report", () => {
    writeFile(
      storeSubmissionChecklistPath,
      JSON.stringify({
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "store-submission-checklist-manifest"
      })
    );

    const result = spawnSync(
      process.execPath,
      [
        "scripts/verify-release-candidate.mjs",
        supportBundlePath,
        "--allow-dirty",
        `--report-json=${reportPath}`
      ],
      { encoding: "utf8" }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Store release orchestration report is required when ${storeSubmissionChecklistPath} exists.`
    );
    expect(result.stdout).not.toContain("==> Run unit tests");

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const gate = report.gates.find((entry) => entry.label === "Verify store release orchestration requirement");
    expect(gate).toMatchObject({
      status: "failed",
      exitCode: 1,
      evidence: {
        storeSubmissionChecklistPresent: true,
        storeReleaseReportRequired: true,
        storeReleaseReportSupplied: false
      }
    });
  });
});

function writeFile(path, content) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, content);
}
