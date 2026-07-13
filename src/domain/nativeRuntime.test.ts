import { describe, expect, it } from "vitest";
import {
  normalizeNativeRuntimeAudioProcessing,
  normalizeNativeRuntimeContinuity,
  normalizeNativeRuntimeDevice
} from "./nativeRuntime";

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
        sampledAt: 1_784_000_000_000.4
      })
    ).toEqual({
      thermalState: "serious",
      thermalStatusCode: 3,
      batteryLevelPercent: 42,
      charging: true,
      lowPowerMode: true,
      powerSource: "wireless",
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
        sampledAt: -20
      })
    ).toEqual({
      thermalState: "unknown",
      thermalStatusCode: -1,
      batteryLevelPercent: 100,
      charging: false,
      lowPowerMode: false,
      powerSource: "unknown",
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

describe("native runtime audio telemetry", () => {
  it("normalizes PCM levels, counters, and timestamps", () => {
    const audio = normalizeNativeRuntimeAudioProcessing({
      micRmsLevel: 0.24,
      micPeakLevel: 1.4,
      micSampleCount: 2_048.4,
      micClippedSampleCount: 3.2,
      micLevelUpdatedAt: 1_784_000_000_000.4,
      appAudioRmsLevel: Number.NaN,
      mixedAudioPeakLevel: -0.5
    });

    expect(audio).toMatchObject({
      micRmsLevel: 0.24,
      micPeakLevel: 1,
      micSampleCount: 2_048,
      micClippedSampleCount: 3,
      micLevelUpdatedAt: 1_784_000_000_000,
      appAudioRmsLevel: 0,
      mixedAudioPeakLevel: 0
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
      mixedAudioSampleCount: 0
    });
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
