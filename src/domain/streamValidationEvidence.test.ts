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

  it("stores safe native runtime evidence and downgrades passing runs that need review", () => {
    const scene = createDefaultScene();
    const streamKey = "validation-key";
    const profile = profileWithKey(streamKey);
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({ bitrateKbps: 3500, fps: 30, message: `Publishing ${streamKey}` }),
      nativeRuntime: {
        platform: "android" as const,
        runtimeStatus: "live",
        updatedAt: Date.parse("2026-06-23T00:00:05.000Z"),
        stale: false,
        elapsedSeconds: 5,
        videoFrames: 144,
        encodedBytes: 2_200_000,
        droppedFrames: 1,
        publisher: {
          state: "published",
          reconnectAttempts: 0,
          sentVideoFrames: 144,
          sentAudioFrames: 240,
          droppedVideoFrames: 1,
          droppedAudioFrames: 0,
          bytesWritten: 2_200_000,
          cacheSize: 120,
          itemsInCache: 64,
          congested: true,
          lastError: ""
        },
        composition: {
          status: "applied" as const,
          appliedCount: 1,
          skippedCount: 0,
          skippedKinds: [],
          message: `Native screen capture ready ${streamKey}`
        },
        message: `Publishing ${streamKey}`
      }
    });

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "android",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z"),
      secrets: [streamKey]
    });
    const summary = summarizeStreamValidationEvidence([run], { now: validationNow });

    expect(run.result).toBe("warn");
    expect(run.nativeRuntime).toMatchObject({
      platform: "android",
      status: "warn",
      publisherState: "published",
      congested: true,
      queuedItems: 64,
      cacheSize: 120
    });
    expect(JSON.stringify(run)).not.toContain(streamKey);
    expect(JSON.stringify(run)).not.toContain("Native screen capture ready");
    expect(summary.nativeRuntimeRunCount).toBe(1);
    expect(summary.nativeRuntimeWarningCount).toBe(1);
    expect(summary.nativeRuntimeFailureCount).toBe(0);
    expect(summary.latestNativeRuntime?.status).toBe("warn");
  });

  it("does not count disabled face tracking snapshots as retained avatar motion evidence", () => {
    const scene = createDefaultScene();
    const profile = profileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const summary = summarizeStreamValidationEvidence([run], { now: validationNow });

    expect(run.faceTracking?.status).toBe("info");
    expect(summary.faceTrackingRunCount).toBe(0);
    expect(summary.faceTrackingReadyCount).toBe(0);
    expect(summary.faceTrackingWarningCount).toBe(0);
    expect(summary.latestFaceTracking).toBeNull();
  });

  it("stores platform dashboard evidence and downgrades unhealthy passing runs", () => {
    const scene = createDefaultScene();
    const profile = {
      ...profileWithKey("validation-key"),
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        youtubeBroadcastId: "broadcast-1",
        youtubeStreamId: "stream-1",
        youtubeBroadcastStatus: "testing",
        youtubeStreamStatus: "active",
        youtubeStreamHealthStatus: "ok",
        youtubeStreamHealthIssues: ["warning: bitrateLow: Video output low"]
      }
    };
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({ bitrateKbps: 3500, fps: 30 })
    });

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const summary = summarizeStreamValidationEvidence([run], { now: validationNow });

    expect(run.result).toBe("warn");
    expect(run.platformPublishing).toMatchObject({
      platform: "youtube-live",
      status: "warn",
      youtube: {
        hasBroadcastId: true,
        hasStreamId: true,
        broadcastStatus: "testing",
        streamStatus: "active",
        healthStatus: "ok",
        healthIssueCount: 1
      }
    });
    expect(run.summary).toContain("YouTube dashboard");
    expect(summary.platformPublishingRunCount).toBe(1);
    expect(summary.platformPublishingWarningCount).toBe(1);
    expect(summary.platformPublishingFailureCount).toBe(0);
    expect(summary.latestPlatformPublishing?.status).toBe("warn");
  });

  it("stores face tracking evidence and downgrades unready avatar validation", () => {
    const scene = createDefaultScene();
    const profile = {
      ...profileWithKey("validation-key"),
      faceTracking: {
        ...createDefaultStudioProfile().faceTracking,
        enabled: true,
        inputMode: "native-camera" as const,
        rigMode: "still-image-2d" as const
      }
    };
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({ bitrateKbps: 3500, fps: 30 })
    });

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const summary = summarizeStreamValidationEvidence([run], { now: validationNow });

    expect(run.result).toBe("warn");
    expect(run.faceTracking).toMatchObject({
      status: "warn",
      enabled: true,
      inputMode: "native-camera",
      rigMode: "still-image-2d",
      runtimeStatus: "unavailable",
      visibleAvatarCount: 1,
      preparedPngTuberCount: 0
    });
    expect(run.summary).toContain("Face tracking is enabled");
    expect(run.recommendation).toContain("Pick and prepare");
    expect(summary.faceTrackingRunCount).toBe(1);
    expect(summary.faceTrackingWarningCount).toBe(1);
    expect(summary.faceTrackingReadyCount).toBe(0);
    expect(summary.latestFaceTracking?.status).toBe("warn");
  });

  it("fails validation runs when the native publisher reports a failure", () => {
    const scene = createDefaultScene();
    const profile = profileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({ bitrateKbps: 3500, fps: 30 }),
      nativeRuntime: {
        platform: "ios" as const,
        runtimeStatus: "failed",
        updatedAt: Date.parse("2026-06-23T00:00:05.000Z"),
        stale: false,
        elapsedSeconds: 5,
        videoFrames: 48,
        encodedBytes: 500_000,
        droppedFrames: 0,
        publisher: {
          state: "failed",
          reconnectAttempts: 2,
          sentVideoFrames: 48,
          sentAudioFrames: 90,
          droppedVideoFrames: 0,
          droppedAudioFrames: 1,
          bytesWritten: 500_000,
          cacheSize: 120,
          itemsInCache: 0,
          congested: false,
          lastError: "socket reset while publishing"
        },
        composition: {
          status: "applied" as const,
          appliedCount: 1,
          skippedCount: 0,
          skippedKinds: [],
          message: "Native compositor was ready"
        },
        message: "Publisher failed"
      }
    });

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });

    expect(run.result).toBe("fail");
    expect(run.nativeRuntime?.status).toBe("fail");
    expect(run.recommendation).toContain("native runtime");
    expect(JSON.stringify(run)).not.toContain("socket reset");
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
