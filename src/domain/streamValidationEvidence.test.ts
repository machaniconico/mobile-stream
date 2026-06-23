import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile, type StudioProfile } from "./profiles";
import { createReadinessReport } from "./readiness";
import { createDefaultScene } from "./scene";
import { createStreamDiagnostics } from "./streamDiagnostics";
import {
  appendStreamValidationRun,
  createStreamValidationRun,
  mergeStreamValidationRuns,
  normalizeStreamValidationRuns,
  summarizeStreamValidationEvidence
} from "./streamValidationEvidence";
import { initialStreamState, type StreamHealth } from "./streamState";

const health = (update: Partial<StreamHealth> = {}): StreamHealth => ({
  ...initialStreamState.health,
  ...update
});

const profileWithKey = (streamKey: string): StudioProfile => ({
  ...createDefaultStudioProfile(),
  destination: {
    ...createDefaultStudioProfile().destination,
    streamKey
  }
});
const validationNow = new Date("2026-06-23T00:02:00.000Z");

describe("stream validation evidence", () => {
  it("creates a redacted validation run from diagnostics", () => {
    const scene = createDefaultScene();
    const streamKey = "super-secret-key";
    const profile = profileWithKey(streamKey);
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      deviceName: `iPhone ${streamKey}`,
      osVersion: "iOS 18.5",
      appBuild: "rc-1",
      networkProfile: `studio wifi ${streamKey}`,
      result: "warn",
      now: new Date("2026-06-23T00:00:00.000Z"),
      secrets: [streamKey]
    });

    expect(run.id).toContain("validation-20260623000000000-ios");
    expect(run.deviceName).toContain("[redacted]");
    expect(run.networkProfile).toContain("[redacted]");
    expect(JSON.stringify(run)).not.toContain(streamKey);
    expect(run.targetPlatform).toBe("YouTube Live");
    expect(run.checklistStatus).toBe("needs-test");
    expect(run.recommendation).toContain("Start a private");
  });

  it("normalizes, deduplicates, and retains newest validation runs first", () => {
    const scene = createDefaultScene();
    const profile = profileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });
    const firstRun = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "warn",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const secondRun = createStreamValidationRun({
      diagnostics,
      devicePlatform: "android",
      result: "pass",
      now: new Date("2026-06-23T00:01:00.000Z")
    });

    const runs = appendStreamValidationRun(appendStreamValidationRun([firstRun], secondRun), secondRun);

    expect(runs.map((run) => run.id)).toEqual([secondRun.id, firstRun.id]);
    expect(mergeStreamValidationRuns([secondRun], [secondRun, firstRun]).map((run) => run.id)).toEqual([secondRun.id, firstRun.id]);
    expect(normalizeStreamValidationRuns([{ ...firstRun, devicePlatform: "windows" }, secondRun])).toEqual([secondRun]);
  });

  it("summarizes physical platform coverage for release-candidate evidence", () => {
    const scene = createDefaultScene();
    const profile = profileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });
    const iosRun = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const androidRun = createStreamValidationRun({
      diagnostics,
      devicePlatform: "android",
      result: "pass",
      now: new Date("2026-06-23T00:01:00.000Z")
    });

    const partial = summarizeStreamValidationEvidence([iosRun], { now: validationNow });
    const ready = summarizeStreamValidationEvidence([androidRun, iosRun], { now: validationNow });

    expect(partial.status).toBe("partial");
    expect(partial.iosPass).toBe(true);
    expect(partial.androidPass).toBe(false);
    expect(ready.status).toBe("ready");
    expect(ready.eligibleRunCount).toBe(2);
    expect(ready.staleRunCount).toBe(0);
    expect(ready.consistentAppBuild).toBe("-");
    expect(ready.summary).toContain("iOS and Android");
    expect(ready.passedTargetPlatforms).toEqual(["YouTube Live"]);
  });

  it("does not keep target platform passing after a newer failed run", () => {
    const scene = createDefaultScene();
    const profile = profileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });
    const passedRun = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const failedRun = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "fail",
      now: new Date("2026-06-23T00:01:00.000Z")
    });

    const summary = summarizeStreamValidationEvidence([passedRun, failedRun], { now: validationNow });

    expect(summary.status).toBe("failing");
    expect(summary.passedTargetPlatforms).toEqual([]);
    expect(summary.latestRun?.result).toBe("fail");
  });

  it("requires fresh evidence on the same app build before becoming ready", () => {
    const scene = createDefaultScene();
    const profile = profileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });
    const iosRun = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      appBuild: "rc-1",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const androidRun = createStreamValidationRun({
      diagnostics,
      devicePlatform: "android",
      appBuild: "rc-2",
      result: "pass",
      now: new Date("2026-06-23T00:01:00.000Z")
    });
    const matchingAndroidRun = createStreamValidationRun({
      diagnostics,
      devicePlatform: "android",
      appBuild: "rc-1",
      result: "pass",
      now: new Date("2026-06-23T00:01:30.000Z")
    });
    const stale = summarizeStreamValidationEvidence([matchingAndroidRun, iosRun], {
      now: new Date("2026-07-23T00:00:00.000Z"),
      maxAgeDays: 14
    });
    const mismatch = summarizeStreamValidationEvidence([androidRun, iosRun], { now: validationNow });
    const ready = summarizeStreamValidationEvidence([matchingAndroidRun, iosRun], { now: validationNow });

    expect(mismatch.status).toBe("partial");
    expect(mismatch.appBuildMismatch).toBe(true);
    expect(mismatch.summary).toContain("app builds do not match");
    expect(ready.status).toBe("ready");
    expect(ready.consistentAppBuild).toBe("rc-1");
    expect(stale.status).toBe("stale");
    expect(stale.eligibleRunCount).toBe(0);
    expect(stale.staleRunCount).toBe(2);
  });
});
