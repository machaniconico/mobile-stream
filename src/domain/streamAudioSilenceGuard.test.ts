import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile } from "./profiles";
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
        { at: "2026-06-23T00:00:02.000Z", level: 0, source: "manual" },
        { at: "2026-06-23T00:00:03.000Z", level: 0.01, source: "manual" },
        { at: "2026-06-23T00:00:04.000Z", level: 0.02, source: "manual" }
      ]
    });

    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.peakLevel).toBe(0.02);
    expect(diagnostics.activePercent).toBe(0);
  });

  it("warns when live mic activity is retained but too low", () => {
    const diagnostics = diagnose({
      samples: [
        { at: "2026-06-23T00:00:02.000Z", level: 0.06, source: "manual" },
        { at: "2026-06-23T00:00:03.000Z", level: 0.01, source: "manual" },
        { at: "2026-06-23T00:00:04.000Z", level: 0.01, source: "manual" }
      ]
    });

    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.peakLevel).toBe(0.06);
    expect(diagnostics.activePercent).toBe(33);
  });

  it("passes when current stream mic activity is present", () => {
    const diagnostics = diagnose({
      samples: [
        { at: "2026-06-23T00:00:02.000Z", level: 0.12, source: "manual" },
        { at: "2026-06-23T00:00:03.000Z", level: 0.18, source: "manual" },
        { at: "2026-06-23T00:00:04.000Z", level: 0.24, source: "manual" }
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
        { at: "2026-06-23T00:01:01.000Z", level: 0.14, source: "manual" },
        { at: "2026-06-23T00:01:02.000Z", level: 0.16, source: "manual" },
        { at: "2026-06-23T00:01:03.000Z", level: 0.2, source: "manual" }
      ]
    });

    expect(diagnostics.status).toBe("pass");
    expect(diagnostics.sampleCount).toBe(3);
    expect(diagnostics.peakLevel).toBe(0.2);
  });
});
