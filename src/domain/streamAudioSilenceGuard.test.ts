import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile } from "./profiles";
import { normalizeNativeRuntimeAudioProcessing } from "./nativeRuntime";
import {
  createBroadcastAudioSilenceGuardDiagnostics,
  type BroadcastAudioSilenceGuardInput
} from "./streamAudioSilenceGuard";
import type { StreamHealthSample } from "./streamHealthHistory";

const baseProfile = createDefaultStudioProfile();

const healthSample = (at: string, elapsedSeconds = 30): StreamHealthSample => ({
  at,
  status: "live",
  elapsedSeconds,
  bitrateKbps: 3500,
  fps: 30,
  droppedFrames: 0,
  reconnectAttempts: 0
});

const diagnose = (
  overrides: Partial<BroadcastAudioSilenceGuardInput> = {}
) =>
  createBroadcastAudioSilenceGuardDiagnostics({
    samples: [],
    healthSamples: [healthSample("2026-06-23T00:00:00.000Z")],
    broadcastMixer: baseProfile.broadcastMixer,
    streamStatus: "live",
    elapsedSeconds: 30,
    ...overrides
  });

describe("stream audio silence guard", () => {
  it("waits until a stream is live", () => {
    const diagnostics = diagnose({
      streamStatus: "idle",
      elapsedSeconds: 0
    });

    expect(diagnostics.status).toBe("info");
    expect(diagnostics.summary).toContain("starts after the stream is live");
  });

  it("does not warn when the mic channel is not expected in the broadcast mix", () => {
    const diagnostics = diagnose({
      broadcastMixer: {
        ...baseProfile.broadcastMixer,
        mic: {
          muted: true,
          volume: 0
        }
      }
    });

    expect(diagnostics.status).toBe("info");
    expect(diagnostics.micExpected).toBe(false);
  });

  it("warms up during the first live seconds", () => {
    const diagnostics = diagnose({
      elapsedSeconds: 8
    });

    expect(diagnostics.status).toBe("info");
    expect(diagnostics.summary).toContain("warming up");
  });

  it("warns when the live mic has no current activity samples", () => {
    const diagnostics = diagnose();

    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.sampleCount).toBe(0);
    expect(diagnostics.summary).toContain("only 0 current audio activity samples");
  });

  it("warns when retained current activity is silent", () => {
    const diagnostics = diagnose({
      samples: [
        { at: "2026-06-23T00:00:27.000Z", level: 0, source: "manual" },
        { at: "2026-06-23T00:00:28.000Z", level: 0.01, source: "manual" },
        { at: "2026-06-23T00:00:29.000Z", level: 0.02, source: "manual" }
      ]
    });

    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.peakLevel).toBe(0.02);
    expect(diagnostics.activePercent).toBe(0);
  });

  it("warns when live mic activity is retained but too low", () => {
    const diagnostics = diagnose({
      samples: [
        { at: "2026-06-23T00:00:27.000Z", level: 0.06, source: "manual" },
        { at: "2026-06-23T00:00:28.000Z", level: 0.01, source: "manual" },
        { at: "2026-06-23T00:00:29.000Z", level: 0.01, source: "manual" }
      ]
    });

    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.peakLevel).toBe(0.06);
    expect(diagnostics.activePercent).toBe(33);
  });

  it("passes when current stream mic activity is present", () => {
    const diagnostics = diagnose({
      samples: [
        { at: "2026-06-23T00:00:27.000Z", level: 0.12, source: "manual" },
        { at: "2026-06-23T00:00:28.000Z", level: 0.18, source: "manual" },
        { at: "2026-06-23T00:00:29.000Z", level: 0.24, source: "manual" }
      ]
    });

    expect(diagnostics.status).toBe("pass");
    expect(diagnostics.sampleCount).toBe(3);
    expect(diagnostics.activePercent).toBe(100);
  });

  it("filters stale samples before the current health window", () => {
    const diagnostics = diagnose({
      healthSamples: [healthSample("2026-06-23T00:01:00.000Z")],
      samples: [
        { at: "2026-06-23T00:00:02.000Z", level: 0.01, source: "manual" },
        { at: "2026-06-23T00:01:27.000Z", level: 0.14, source: "manual" },
        { at: "2026-06-23T00:01:28.000Z", level: 0.16, source: "manual" },
        { at: "2026-06-23T00:01:29.000Z", level: 0.2, source: "manual" }
      ]
    });

    expect(diagnostics.status).toBe("pass");
    expect(diagnostics.sampleCount).toBe(3);
    expect(diagnostics.peakLevel).toBe(0.2);
  });

  it("does not treat face motion as audio evidence on a native stream", () => {
    const diagnostics = diagnose({
      samples: [
        { at: "2026-06-23T00:00:27.000Z", level: 0.8, source: "face-tracking" },
        { at: "2026-06-23T00:00:28.000Z", level: 0.7, source: "face-tracking" },
        { at: "2026-06-23T00:00:29.000Z", level: 0.9, source: "face-tracking" }
      ],
      nativeRuntime: {
        platform: "android",
        stale: false,
        audioProcessing: normalizeNativeRuntimeAudioProcessing(undefined)
      },
      now: new Date("2026-06-23T00:00:30.000Z")
    });

    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.evidenceSource).toBe("none");
    expect(diagnostics.sampleCount).toBe(0);
    expect(diagnostics.summary).toContain("PCM");
  });

  it("passes native streams only from current PCM meter evidence", () => {
    const diagnostics = diagnose({
      samples: [
        { at: "2026-06-23T00:00:27.000Z", level: 0.12, peakLevel: 0.42, source: "native-pcm" },
        { at: "2026-06-23T00:00:28.000Z", level: 0.18, peakLevel: 0.55, source: "native-pcm" },
        { at: "2026-06-23T00:00:29.000Z", level: 0.2, peakLevel: 0.64, source: "native-pcm" }
      ],
      nativeRuntime: {
        platform: "ios",
        stale: false,
        audioProcessing: normalizeNativeRuntimeAudioProcessing({
          micSampleCount: 44_100,
          micLevelUpdatedAt: Date.parse("2026-06-23T00:00:29.000Z")
        })
      },
      now: new Date("2026-06-23T00:00:30.000Z")
    });

    expect(diagnostics.status).toBe("pass");
    expect(diagnostics.evidenceSource).toBe("native-pcm");
    expect(diagnostics.peakLevel).toBe(0.64);
  });

  it("warns when native PCM telemetry becomes stale", () => {
    const diagnostics = diagnose({
      samples: [
        { at: "2026-06-23T00:00:27.000Z", level: 0.12, source: "native-pcm" },
        { at: "2026-06-23T00:00:28.000Z", level: 0.18, source: "native-pcm" },
        { at: "2026-06-23T00:00:29.000Z", level: 0.2, source: "native-pcm" }
      ],
      nativeRuntime: {
        platform: "ios",
        stale: true,
        audioProcessing: normalizeNativeRuntimeAudioProcessing({
          micSampleCount: 44_100,
          micLevelUpdatedAt: Date.parse("2026-06-23T00:00:29.000Z")
        })
      },
      now: new Date("2026-06-23T00:00:30.000Z")
    });

    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.summary).toContain("stale");
  });

  it("warns when only the microphone meter timestamp stops advancing", () => {
    const diagnostics = diagnose({
      samples: [
        { at: "2026-06-23T00:00:27.000Z", level: 0.12, source: "native-pcm" },
        { at: "2026-06-23T00:00:28.000Z", level: 0.18, source: "native-pcm" },
        { at: "2026-06-23T00:00:29.000Z", level: 0.2, source: "native-pcm" }
      ],
      nativeRuntime: {
        platform: "android",
        stale: false,
        audioProcessing: normalizeNativeRuntimeAudioProcessing({
          micSampleCount: 44_100,
          micLevelUpdatedAt: Date.parse("2026-06-23T00:00:20.000Z")
        })
      },
      now: new Date("2026-06-23T00:00:30.000Z")
    });

    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.summary).toContain("not updating");
  });
});
