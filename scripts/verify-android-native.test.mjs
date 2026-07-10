import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  androidNativeDebugArtifactPath,
  androidNativeVerificationArtifactPath
} from "./release-artifact-policy.mjs";
import {
  collectAndroidNativeVerificationArtifactRecords,
  validateAndroidNativeVerificationArtifacts,
  validateAndroidNativeVerificationReport
} from "./verify-android-native.mjs";
import { nativeBuildFixturePaths, writeNativeBuildFixture } from "./native-build-test-fixtures.mjs";
import { acquireReleaseTestLock, releaseTestLockHookTimeoutMs } from "./release-test-lock.mjs";

const fixtureRoot = ".artifacts/verify-android-native-test";
const managedPaths = nativeBuildFixturePaths(fixtureRoot).allPaths;
const backups = new Map();
let releaseTestUnlock = () => {};

vi.setConfig({ hookTimeout: releaseTestLockHookTimeoutMs });

describe("Android native verifier", () => {
  beforeAll(() => {
    releaseTestUnlock = acquireReleaseTestLock();
    for (const path of managedPaths) {
      backups.set(path, existsSync(path) ? readFileSync(path) : null);
    }
    writeNativeBuildFixture(fixtureRoot);
  });

  afterAll(() => {
    try {
      for (const [path, content] of backups) {
        if (content === null) {
          rmSync(path, { force: true });
        } else {
          writeFileSync(path, content);
        }
      }
      rmSync(fixtureRoot, { recursive: true, force: true });
    } finally {
      releaseTestUnlock();
    }
  });

  it("collects a signed APK and its build verification report", () => {
    const report = JSON.parse(readFileSync(androidNativeVerificationArtifactPath, "utf8"));
    const artifacts = collectAndroidNativeVerificationArtifactRecords({ required: true });

    expect(artifacts.map((artifact) => artifact.path)).toEqual([
      androidNativeVerificationArtifactPath,
      androidNativeDebugArtifactPath
    ]);
    expect(
      validateAndroidNativeVerificationArtifacts(artifacts, {
        releaseFinishedAt: new Date().toISOString(),
        releaseGitCommit: report.gitCommit
      })
    ).toEqual([]);
  });

  it("rejects APK metadata that predates the verification build", () => {
    const report = JSON.parse(readFileSync(androidNativeVerificationArtifactPath, "utf8"));
    report.apk.modifiedAt = new Date(Date.parse(report.startedAt) - 60_000).toISOString();

    expect(validateAndroidNativeVerificationReport(report)).toContain(
      "Android native debug APK was not produced during this verification build."
    );
  });

  it("rejects native evidence from another git commit", () => {
    const report = JSON.parse(readFileSync(androidNativeVerificationArtifactPath, "utf8"));

    expect(validateAndroidNativeVerificationReport(report, { releaseGitCommit: "0".repeat(40) })).toContain(
      "Android native verification git commit does not match the release candidate report."
    );
  });

  it("fails closed when a required verification report is absent", () => {
    expect(() =>
      collectAndroidNativeVerificationArtifactRecords({
        reportPath: `${fixtureRoot}/missing-report.json`,
        required: true
      })
    ).toThrow(`Android native verification report does not exist: ${fixtureRoot}/missing-report.json`);
  });
});
