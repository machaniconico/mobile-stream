import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createGitleaksHistoryScanReport,
  expectedGitleaksBaselineFindings,
  expectedGitleaksVersion,
  validateGitleaksBaselineEntries,
  validateGitleaksBaselineFile,
  validateGitleaksHistoryScanReport
} from "./verify-gitleaks-history.mjs";

describe("gitleaks history scanner", () => {
  it("accepts the committed redacted baseline", () => {
    const entries = validateGitleaksBaselineFile();

    expect(entries.map((entry) => entry.Fingerprint).sort()).toEqual(
      expectedGitleaksBaselineFindings.map((entry) => entry.Fingerprint).sort()
    );
  });

  it("rejects baseline expansion beyond the fixed historical test fixtures", () => {
    const entries = JSON.parse(readFileSync(".gitleaks-baseline.json", "utf8"));
    entries.push({
      ...entries[0],
      Fingerprint: "unexpected:new.ts:generic-api-key:1",
      File: "new.ts",
      StartLine: 1
    });

    expect(() => validateGitleaksBaselineEntries(entries)).toThrow("unapproved finding");
  });

  it("rejects unredacted secret-like baseline content", () => {
    const entries = JSON.parse(readFileSync(".gitleaks-baseline.json", "utf8"));
    entries[0] = {
      ...entries[0],
      Match: 'apiKey: "AIzaabcdefghijklmnopqrstuvwxyz123456789"',
      Secret: "AIzaabcdefghijklmnopqrstuvwxyz123456789"
    };

    expect(() => validateGitleaksBaselineEntries(entries)).toThrow("not redacted");
  });

  it("validates a passing release history scan artifact", () => {
    const baselineFindings = validateGitleaksBaselineFile();
    const report = createGitleaksHistoryScanReport({
      status: "passed",
      generatedAt: "2026-06-25T00:00:01.000Z",
      gitleaksVersion: expectedGitleaksVersion,
      shallowRepository: false,
      baselineFindings,
      rawFindings: []
    });

    expect(
      validateGitleaksHistoryScanReport(report, {
        releaseStartedAt: "2026-06-25T00:00:00.000Z",
        releaseFinishedAt: "2026-06-25T00:00:02.000Z"
      })
    ).toEqual([]);
  });

  it("rejects retained unbaselined findings in release history scan artifacts", () => {
    const baselineFindings = validateGitleaksBaselineFile();
    const report = createGitleaksHistoryScanReport({
      status: "failed",
      generatedAt: "2026-06-25T00:00:01.000Z",
      gitleaksVersion: expectedGitleaksVersion,
      shallowRepository: false,
      baselineFindings,
      rawFindings: [{ RuleID: "generic-api-key", File: "src/main.ts", StartLine: 1, Fingerprint: "new" }]
    });

    expect(validateGitleaksHistoryScanReport(report).join("\n")).toContain("zero unbaselined findings");
  });

  it("rejects history scan artifacts produced from shallow repositories", () => {
    const baselineFindings = validateGitleaksBaselineFile();
    const report = createGitleaksHistoryScanReport({
      status: "passed",
      generatedAt: "2026-06-25T00:00:01.000Z",
      gitleaksVersion: expectedGitleaksVersion,
      shallowRepository: true,
      baselineFindings,
      rawFindings: []
    });

    expect(validateGitleaksHistoryScanReport(report)).toContain(
      "Gitleaks history scan artifact must be generated from a full git history checkout."
    );
  });

  it("rejects history scan artifacts from unexpected gitleaks versions", () => {
    const report = createGitleaksHistoryScanReport({
      status: "passed",
      generatedAt: "2026-06-25T00:00:01.000Z",
      gitleaksVersion: "8.29.0",
      shallowRepository: false,
      baselineFindings: validateGitleaksBaselineFile(),
      rawFindings: []
    });

    expect(validateGitleaksHistoryScanReport(report)).toContain(
      `Gitleaks history scan artifact must use gitleaks ${expectedGitleaksVersion}.`
    );
  });

  it("rejects history scan artifacts whose baseline hash does not match the approved file", () => {
    const report = createGitleaksHistoryScanReport({
      status: "passed",
      generatedAt: "2026-06-25T00:00:01.000Z",
      gitleaksVersion: expectedGitleaksVersion,
      shallowRepository: false,
      baselineFindings: validateGitleaksBaselineFile(),
      rawFindings: []
    });

    expect(
      validateGitleaksHistoryScanReport(report, {
        expectedBaselineSha256: "0".repeat(64)
      })
    ).toContain("Gitleaks history scan artifact baseline SHA-256 does not match the approved baseline file.");
  });

  it("rejects history scan artifacts whose git provenance does not match the release commit", () => {
    const report = createGitleaksHistoryScanReport({
      status: "passed",
      generatedAt: "2026-06-25T00:00:01.000Z",
      gitleaksVersion: expectedGitleaksVersion,
      shallowRepository: false,
      baselineFindings: validateGitleaksBaselineFile(),
      rawFindings: []
    });
    report.git.commit = "0".repeat(40);

    expect(
      validateGitleaksHistoryScanReport(report, {
        expectedGitCommit: "1".repeat(40),
        allowCommitMismatch: false
      })
    ).toContain(`Gitleaks history scan artifact commit ${"0".repeat(40)} does not match current commit ${"1".repeat(40)}.`);
  });

  it("rejects dirty history scan artifacts for commercial package evidence", () => {
    const report = createGitleaksHistoryScanReport({
      status: "passed",
      generatedAt: "2026-06-25T00:00:01.000Z",
      gitleaksVersion: expectedGitleaksVersion,
      shallowRepository: false,
      baselineFindings: validateGitleaksBaselineFile(),
      rawFindings: []
    });
    report.git.dirty = true;

    expect(validateGitleaksHistoryScanReport(report, { allowDirty: false })).toContain(
      "Gitleaks history scan artifact was generated from a dirty worktree."
    );
  });
});
