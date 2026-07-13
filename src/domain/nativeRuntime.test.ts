import { describe, expect, it } from "vitest";
import {
  assessAndroidPlaybackCapture,
  normalizeNativeRuntimeAudioProcessing,
  normalizeNativeRuntimeAvSync,
  normalizeNativeRuntimeBitrateAdaptation,
  normalizeNativeRuntimeContinuity,
  normalizeNativeRuntimeDevice
} from "./nativeRuntime";

describe("native live video bitrate telemetry", () => {
  it("normalizes applied targets and retained update evidence", () => {
    expect(
      normalizeNativeRuntimeBitrateAdaptation({
        status: "reduced",
        initialTargetKbps: 6_000.4,
        requestedTargetKbps: 4_300.4,
        appliedTargetKbps: 4_300.4,
        minimumAppliedKbps: 3_900.4,
        updateCount: 2.4,
        failureCount: -1,
        lastUpdatedAt: 1_784_000_000_000.4,
        controlOwner: "native",
        controllerState: "cooldown",
        baselineTargetKbps: 6_000.4,
        effectiveTargetKbps: 4_300.4,
        floorTargetKbps: 3_000.4,
        pendingTargetKbps: 4_100.6,
        automaticReductionCount: 2.4,
        automaticRestorationCount: 1.6,
        pressureSampleCount: 3.4,
        healthySampleCount: 4.6,
        cooldownRemainingMs: 7_999.6,
        recoveryEligibleInMs: 12_000.4,
        publishGeneration: 3.6,
        cumulativeReconnectCount: 1.4,
        lastDecisionAt: 1_784_000_000_100.4,
        lastDecisionReason: "Queue pressure persisted."
      })
    ).toEqual({
      status: "reduced",
      initialTargetKbps: 6_000,
      requestedTargetKbps: 4_300,
      appliedTargetKbps: 4_300,
      minimumAppliedKbps: 3_900,
      updateCount: 2,
      failureCount: 0,
      lastUpdatedAt: 1_784_000_000_000,
      controlOwner: "native",
      controllerState: "cooldown",
      baselineTargetKbps: 6_000,
      effectiveTargetKbps: 4_300,
      floorTargetKbps: 3_000,
      pendingTargetKbps: 4_101,
      automaticReductionCount: 2,
      automaticRestorationCount: 2,
      pressureSampleCount: 3,
      healthySampleCount: 5,
      cooldownRemainingMs: 8_000,
      recoveryEligibleInMs: 12_000,
      publishGeneration: 4,
      cumulativeReconnectCount: 1,
      lastDecisionAt: 1_784_000_000_100,
      lastDecisionReason: "Queue pressure persisted."
    });
  });

  it("keeps defaults compatible with payloads from older native runtimes", () => {
    expect(normalizeNativeRuntimeBitrateAdaptation(undefined)).toEqual({
      status: "unknown",
      initialTargetKbps: 0,
      requestedTargetKbps: 0,
      appliedTargetKbps: 0,
      minimumAppliedKbps: 0,
      updateCount: 0,
      failureCount: 0,
      lastUpdatedAt: 0,
      controlOwner: "none",
      controllerState: "idle",
      baselineTargetKbps: 0,
      effectiveTargetKbps: 0,
      floorTargetKbps: 0,
      pendingTargetKbps: 0,
      automaticReductionCount: 0,
      automaticRestorationCount: 0,
      pressureSampleCount: 0,
      healthySampleCount: 0,
      cooldownRemainingMs: 0,
      recoveryEligibleInMs: 0,
      publishGeneration: 0,
      cumulativeReconnectCount: 0,
      lastDecisionAt: 0,
      lastDecisionReason: ""
    });
  });

  it("bounds hostile numeric values and sanitizes untrusted controller text", () => {
    const normalized = normalizeNativeRuntimeBitrateAdaptation({
      status: "perfect" as "steady",
      appliedTargetKbps: Number.NaN,
      failureCount: 1.6,
      controlOwner: "javascript" as "native",
      controllerState: "pressure\nAuthorization: Bearer controller-secret-token-value",
      baselineTargetKbps: Number.POSITIVE_INFINITY,
      effectiveTargetKbps: Number.MAX_VALUE,
      floorTargetKbps: -100,
      pendingTargetKbps: Number.NaN,
      automaticReductionCount: -2,
      automaticRestorationCount: Number.NEGATIVE_INFINITY,
      pressureSampleCount: 4.6,
      healthySampleCount: -4,
      cooldownRemainingMs: Number.POSITIVE_INFINITY,
      recoveryEligibleInMs: Number.MAX_VALUE,
      publishGeneration: -1,
      cumulativeReconnectCount: 2.4,
      lastDecisionAt: Number.NaN,
      lastDecisionReason: `Authorization: Bearer decision-secret-token-value\n${"x".repeat(300)}`
    });

    expect(normalized).toMatchObject({
      status: "unknown",
      appliedTargetKbps: 0,
      failureCount: 2,
      controlOwner: "none",
      baselineTargetKbps: 0,
      effectiveTargetKbps: Number.MAX_SAFE_INTEGER,
      floorTargetKbps: 0,
      pendingTargetKbps: 0,
      automaticReductionCount: 0,
      automaticRestorationCount: 0,
      pressureSampleCount: 5,
      healthySampleCount: 0,
      cooldownRemainingMs: 0,
      recoveryEligibleInMs: Number.MAX_SAFE_INTEGER,
      publishGeneration: 0,
      cumulativeReconnectCount: 2,
      lastDecisionAt: 0
    });
    expect(normalized.controllerState).toBe("pressure Authorization: Bearer [redacted]");
    expect(normalized.lastDecisionReason).toContain("Bearer [redacted]");
    expect(normalized.lastDecisionReason).not.toContain("decision-secret-token-value");
    expect(normalized.lastDecisionReason).not.toContain("\n");
    expect(normalized.lastDecisionReason.length).toBeLessThanOrEqual(160);
  });
});

describe("native runtime device telemetry", () => {
  it("normalizes valid device resource telemetry", () => {
    expect(
      normalizeNativeRuntimeDevice({
        thermalState: "serious",
        thermalStatusCode: 3.2,
        batteryLevelPercent: 41.6,
        charging: true,
        lowPowerMode: true,
        powerSource: "wireless",
        memoryPressureState: "warning",
        availableMemoryBytes: 134_217_728.4,
        memoryThresholdBytes: 67_108_864.6,
        sampledAt: 1_784_000_000_000.4
      })
    ).toEqual({
      thermalState: "serious",
      thermalStatusCode: 3,
      batteryLevelPercent: 42,
      charging: true,
      lowPowerMode: true,
      powerSource: "wireless",
      memoryPressureState: "warning",
      availableMemoryBytes: 134_217_728,
      memoryThresholdBytes: 67_108_865,
      sampledAt: 1_784_000_000_000
    });
  });

  it("fails unknown and malformed values closed without inventing a healthy reading", () => {
    expect(
      normalizeNativeRuntimeDevice({
        thermalState: "cool" as "nominal",
        thermalStatusCode: Number.NaN,
        batteryLevelPercent: 140,
        charging: false,
        lowPowerMode: false,
        powerSource: "solar" as "battery",
        memoryPressureState: "elevated" as "normal",
        availableMemoryBytes: Number.NaN,
        memoryThresholdBytes: -20,
        sampledAt: -20
      })
    ).toEqual({
      thermalState: "unknown",
      thermalStatusCode: -1,
      batteryLevelPercent: 100,
      charging: false,
      lowPowerMode: false,
      powerSource: "unknown",
      memoryPressureState: "unknown",
      availableMemoryBytes: -1,
      memoryThresholdBytes: -1,
      sampledAt: 0
    });
    expect(normalizeNativeRuntimeDevice(undefined)).toBeUndefined();
  });

  it("keeps unavailable battery capacity as -1", () => {
    expect(
      normalizeNativeRuntimeDevice({
        thermalState: "unknown",
        thermalStatusCode: -1,
        batteryLevelPercent: -1,
        charging: false,
        lowPowerMode: false,
        powerSource: "unknown",
        sampledAt: 0
      })?.batteryLevelPercent
    ).toBe(-1);
  });
});

describe("native runtime A/V sync telemetry", () => {
  it("normalizes signed drift and retained incident evidence", () => {
    expect(
      normalizeNativeRuntimeAvSync({
        status: "audio-leading",
        latestVideoTimestampMs: 12_000.4,
        latestAudioTimestampMs: 12_320.2,
        skewMs: -319.6,
        maxAbsSkewMs: 610.2,
        sampleCount: 90.4,
        outOfSyncSampleCount: 12.2,
        outOfSyncIncidentCount: 2.2,
        criticalIncidentCount: 1.2,
        consecutiveOutOfSyncSamples: 4.2,
        maxConsecutiveOutOfSyncSamples: 8.2,
        warningThresholdMs: 150,
        criticalThresholdMs: 500,
        critical: false
      })
    ).toEqual({
      status: "audio-leading",
      latestVideoTimestampMs: 12_000,
      latestAudioTimestampMs: 12_320,
      skewMs: -320,
      maxAbsSkewMs: 610,
      sampleCount: 90,
      outOfSyncSampleCount: 12,
      outOfSyncIncidentCount: 2,
      criticalIncidentCount: 1,
      consecutiveOutOfSyncSamples: 4,
      maxConsecutiveOutOfSyncSamples: 8,
      warningThresholdMs: 150,
      criticalThresholdMs: 500,
      critical: false
    });
  });

  it("fails missing telemetry closed and derives malformed native status conservatively", () => {
    expect(normalizeNativeRuntimeAvSync(undefined)).toMatchObject({
      status: "unknown",
      sampleCount: 0,
      warningThresholdMs: 150,
      criticalThresholdMs: 500,
      critical: false
    });
    expect(
      normalizeNativeRuntimeAvSync({
        status: "perfect" as "in-sync",
        skewMs: 620,
        sampleCount: 6,
        consecutiveOutOfSyncSamples: 3,
        outOfSyncSampleCount: 99
      })
    ).toMatchObject({
      status: "video-leading",
      maxAbsSkewMs: 620,
      outOfSyncSampleCount: 6,
      critical: true
    });
  });
});

describe("native runtime audio telemetry", () => {
  it("normalizes PCM levels, counters, and timestamps", () => {
    const audio = normalizeNativeRuntimeAudioProcessing({
      micRmsLevel: 0.24,
      micPeakLevel: 1.4,
      micSampleCount: 2_048.4,
      micClippedSampleCount: 3.2,
      micLevelUpdatedAt: 1_784_000_000_000.4,
      appAudioRmsLevel: Number.NaN,
      mixedAudioPeakLevel: -0.5,
      playbackCaptureStatus: "capturing",
      playbackCaptureBackend: "android-audio-playback-capture",
      playbackCaptureSampleRate: 44_100.4,
      playbackCapturedFrames: 132_300.4,
      playbackDroppedFrames: -2,
      playbackUnderrunFrames: 441.4,
      playbackBufferedFrames: 882.4,
      monitorLifecycleEventCount: 4.6,
      monitorRouteChangeCount: 2.4,
      monitorInterruptionCount: 1.4,
      monitorRecoveryCount: 2.4,
      monitorRecoveryFailureCount: -1,
      monitorLastRecoveryReason: "route-device-removed",
      monitorLastRecoveryAt: 1_784_000_000_125.6,
      monitorSuspended: true,
      micCaptureStatus: "capturing",
      micCaptureBackend: "android-audio-record",
      micCaptureSampleRate: 48_000.4,
      micCaptureFallbackFrames: 960.6,
      micCaptureLifecycleEventCount: 6.6,
      micCaptureRouteChangeCount: 2.4,
      micCaptureInterruptionCount: 1.4,
      micCaptureRecoveryCount: 2.6,
      micCaptureRecoveryFailureCount: -1,
      micCaptureUnrecoveredEventCount: -1.4,
      micCaptureLastRecoveryReason: "audio-route-changed",
      micCaptureLastRecoveryAt: 1_784_000_000_225.6,
      micCaptureSuspended: true,
      playbackCaptureLifecycleEventCount: 5.6,
      playbackCaptureRouteChangeCount: 1.4,
      playbackCaptureInterruptionCount: 2.6,
      playbackCaptureRecoveryCount: 3.4,
      playbackCaptureRecoveryFailureCount: -2,
      playbackCaptureUnrecoveredEventCount: 2.6,
      playbackCaptureLastRecoveryReason: "media-projection-resumed",
      playbackCaptureLastRecoveryAt: 1_784_000_000_325.6,
      playbackCaptureSuspended: true
    });

    expect(audio).toMatchObject({
      micRmsLevel: 0.24,
      micPeakLevel: 1,
      micSampleCount: 2_048,
      micClippedSampleCount: 3,
      micLevelUpdatedAt: 1_784_000_000_000,
      appAudioRmsLevel: 0,
      mixedAudioPeakLevel: 0,
      playbackCaptureSampleRate: 44_100,
      playbackCapturedFrames: 132_300,
      playbackDroppedFrames: 0,
      playbackUnderrunFrames: 441,
      playbackBufferedFrames: 882,
      playbackCaptureTelemetryComplete: false,
      monitorLifecycleEventCount: 5,
      monitorRouteChangeCount: 2,
      monitorInterruptionCount: 1,
      monitorRecoveryCount: 2,
      monitorRecoveryFailureCount: 0,
      monitorLastRecoveryReason: "route-device-removed",
      monitorLastRecoveryAt: 1_784_000_000_126,
      monitorSuspended: true,
      micCaptureStatus: "capturing",
      micCaptureBackend: "android-audio-record",
      micCaptureSampleRate: 48_000,
      micCaptureFallbackFrames: 961,
      micCaptureLifecycleEventCount: 7,
      micCaptureRouteChangeCount: 2,
      micCaptureInterruptionCount: 1,
      micCaptureRecoveryCount: 3,
      micCaptureRecoveryFailureCount: 0,
      micCaptureUnrecoveredEventCount: 0,
      micCaptureLastRecoveryReason: "audio-route-changed",
      micCaptureLastRecoveryAt: 1_784_000_000_226,
      micCaptureSuspended: true,
      playbackCaptureLifecycleEventCount: 6,
      playbackCaptureRouteChangeCount: 1,
      playbackCaptureInterruptionCount: 3,
      playbackCaptureRecoveryCount: 3,
      playbackCaptureRecoveryFailureCount: 0,
      playbackCaptureUnrecoveredEventCount: 3,
      playbackCaptureLastRecoveryReason: "media-projection-resumed",
      playbackCaptureLastRecoveryAt: 1_784_000_000_326,
      playbackCaptureSuspended: true
    });
  });

  it("provides conservative defaults for native versions without PCM metering", () => {
    expect(normalizeNativeRuntimeAudioProcessing(undefined)).toMatchObject({
      micEffectsEnabled: false,
      monitorHeadphonesOnly: true,
      broadcastMicVolume: 1,
      micRmsLevel: 0,
      micPeakLevel: 0,
      micSampleCount: 0,
      micClippedSampleCount: 0,
      micLevelUpdatedAt: 0,
      appAudioSampleCount: 0,
      mixedAudioSampleCount: 0,
      playbackCaptureStatus: "unavailable",
      playbackCaptureBackend: "none",
      playbackCapturedFrames: 0,
      playbackCaptureTelemetryComplete: false,
      monitorLifecycleEventCount: 0,
      monitorRouteChangeCount: 0,
      monitorInterruptionCount: 0,
      monitorRecoveryCount: 0,
      monitorRecoveryFailureCount: 0,
      monitorLastRecoveryReason: "",
      monitorLastRecoveryAt: 0,
      monitorSuspended: false,
      micCaptureStatus: "unavailable",
      micCaptureBackend: "none",
      micCaptureSampleRate: 0,
      micCaptureFallbackFrames: 0,
      micCaptureLifecycleEventCount: 0,
      micCaptureRouteChangeCount: 0,
      micCaptureInterruptionCount: 0,
      micCaptureRecoveryCount: 0,
      micCaptureRecoveryFailureCount: 0,
      micCaptureUnrecoveredEventCount: 0,
      micCaptureLastRecoveryReason: "",
      micCaptureLastRecoveryAt: 0,
      micCaptureSuspended: false,
      playbackCaptureLifecycleEventCount: 0,
      playbackCaptureRouteChangeCount: 0,
      playbackCaptureInterruptionCount: 0,
      playbackCaptureRecoveryCount: 0,
      playbackCaptureRecoveryFailureCount: 0,
      playbackCaptureUnrecoveredEventCount: 0,
      playbackCaptureLastRecoveryReason: "",
      playbackCaptureLastRecoveryAt: 0,
      playbackCaptureSuspended: false
    });
    expect(
      normalizeNativeRuntimeAudioProcessing({ micCaptureFallbackFrames: -480 }).micCaptureFallbackFrames
    ).toBe(0);
  });

  it("requires sustained low-loss Android playback capture proof", () => {
    const ready = {
      playbackCaptureStatus: "capturing",
      playbackCaptureBackend: "android-audio-playback-capture",
      playbackCaptureSampleRate: 44_100,
      playbackCapturedFrames: 132_300,
      playbackDroppedFrames: 441,
      playbackUnderrunFrames: 2_205,
      playbackBufferedFrames: 2_205
    };

    expect(assessAndroidPlaybackCapture(ready)).toMatchObject({
      ready: true,
      telemetryComplete: true,
      durationSeconds: 3
    });
    expect(assessAndroidPlaybackCapture(normalizeNativeRuntimeAudioProcessing(ready)).ready).toBe(true);
    expect(assessAndroidPlaybackCapture({ ...ready, playbackCapturedFrames: 44_100 }).ready).toBe(false);
    expect(assessAndroidPlaybackCapture({ ...ready, playbackDroppedFrames: 1_324 }).ready).toBe(false);
    expect(assessAndroidPlaybackCapture({ ...ready, playbackUnderrunFrames: 7_000 }).ready).toBe(false);
    expect(assessAndroidPlaybackCapture({ ...ready, playbackBufferedFrames: 4_411 }).ready).toBe(false);
  });

  it("calculates underruns from delivered frames and rejects malformed capture counters", () => {
    const boundary = {
      playbackCaptureStatus: "stopped",
      playbackCaptureBackend: "android-audio-playback-capture",
      playbackCaptureSampleRate: 48_000,
      playbackCapturedFrames: 96_000,
      playbackDroppedFrames: 960,
      playbackUnderrunFrames: 4_749,
      playbackBufferedFrames: 4_800
    };

    expect(assessAndroidPlaybackCapture(boundary).ready).toBe(true);
    expect(assessAndroidPlaybackCapture({ ...boundary, playbackUnderrunFrames: 4_750 }).ready).toBe(false);
    expect(assessAndroidPlaybackCapture({ ...boundary, playbackDroppedFrames: undefined }).ready).toBe(false);
    expect(assessAndroidPlaybackCapture({ ...boundary, playbackDroppedFrames: -1 }).ready).toBe(false);
    expect(assessAndroidPlaybackCapture({ ...boundary, playbackDroppedFrames: 0.5 }).ready).toBe(false);
    expect(assessAndroidPlaybackCapture({ ...boundary, playbackCaptureSampleRate: Number.NaN }).ready).toBe(false);
    expect(assessAndroidPlaybackCapture({ ...boundary, playbackCapturedFrames: Number.POSITIVE_INFINITY }).ready).toBe(
      false
    );
  });
});

describe("native runtime continuity telemetry", () => {
  it("normalizes current stalls and retained incident counters", () => {
    expect(
      normalizeNativeRuntimeContinuity({
        status: "video-stalled",
        videoStalled: true,
        audioStalled: false,
        videoLastAdvancedAt: 1_784_000_000_000.4,
        audioLastAdvancedAt: 1_784_000_004_000.4,
        videoStallDurationMs: 6_100.6,
        audioStallDurationMs: -2,
        videoStallCount: 2.2,
        audioStallCount: 1,
        maxVideoStallDurationMs: 8_400.2,
        maxAudioStallDurationMs: Number.NaN,
        stallThresholdMs: 5_000
      })
    ).toEqual({
      status: "video-stalled",
      videoStalled: true,
      audioStalled: false,
      videoLastAdvancedAt: 1_784_000_000_000,
      audioLastAdvancedAt: 1_784_000_004_000,
      videoStallDurationMs: 6_101,
      audioStallDurationMs: 0,
      videoStallCount: 2,
      audioStallCount: 1,
      maxVideoStallDurationMs: 8_400,
      maxAudioStallDurationMs: 0,
      stallThresholdMs: 5_000
    });
  });

  it("fails missing and malformed continuity closed without inventing health", () => {
    expect(normalizeNativeRuntimeContinuity(undefined)).toMatchObject({
      status: "unknown",
      videoStalled: false,
      audioStalled: false,
      videoStallCount: 0,
      audioStallCount: 0,
      stallThresholdMs: 5_000
    });
    expect(
      normalizeNativeRuntimeContinuity({
        status: "perfect" as "healthy",
        videoStalled: true,
        stallThresholdMs: 200
      })
    ).toMatchObject({ status: "video-stalled", videoStalled: true, stallThresholdMs: 1_000 });
  });

  it("resolves contradictory native status and flags toward a stalled state", () => {
    expect(
      normalizeNativeRuntimeContinuity({
        status: "healthy",
        videoStalled: true
      })
    ).toMatchObject({ status: "video-stalled", videoStalled: true, audioStalled: false });

    expect(
      normalizeNativeRuntimeContinuity({
        status: "both-stalled",
        videoStalled: false,
        audioStalled: false
      })
    ).toMatchObject({ status: "both-stalled", videoStalled: true, audioStalled: true });
  });
});
