import { describe, expect, it } from "vitest";
import {
  appendStreamHealthSample,
  createStreamHealthSample,
  summarizeStreamHealthHistory,
  type StreamHealthSample
} from "./streamHealthHistory";
import { initialStreamState, type StreamHealth } from "./streamState";

const health = (update: Partial<StreamHealth> = {}): StreamHealth => ({
  ...initialStreamState.health,
  ...update
});

const sample = (update: Partial<StreamHealthSample> = {}): StreamHealthSample => ({
  at: "2026-06-23T00:00:00.000Z",
  status: "live",
  elapsedSeconds: 1,
  bitrateKbps: 3500,
  fps: 30,
  droppedFrames: 0,
  reconnectAttempts: 0,
  ...update
});

describe("stream health history", () => {
  it("samples only live and reconnecting telemetry", () => {
    expect(createStreamHealthSample({ state: { status: "idle" }, health: health() })).toBeNull();
    expect(
      createStreamHealthSample(
        {
          state: { status: "live" },
          health: health({ elapsedSeconds: 2, bitrateKbps: 3400, fps: 30 })
        },
        new Date("2026-06-23T00:00:02.000Z")
      )
    ).toEqual({
      at: "2026-06-23T00:00:02.000Z",
      status: "live",
      elapsedSeconds: 2,
      bitrateKbps: 3400,
      fps: 30,
      droppedFrames: 0,
      reconnectAttempts: 0
    });
  });

  it("deduplicates adjacent samples and keeps the configured limit", () => {
    const first = sample();
    const second = sample({ elapsedSeconds: 2, bitrateKbps: 3600 });

    expect(appendStreamHealthSample([], first)).toEqual([first]);
    expect(appendStreamHealthSample([first], first)).toEqual([first]);
    expect(appendStreamHealthSample([first], second, 1)).toEqual([second]);
  });

  it("summarizes stable history", () => {
    const summary = summarizeStreamHealthHistory(
      [
        sample({ elapsedSeconds: 1, bitrateKbps: 3550, fps: 30 }),
        sample({ elapsedSeconds: 4, bitrateKbps: 3450, fps: 30 })
      ],
      { bitrateKbps: 3500, fps: 30 }
    );

    expect(summary.stability).toBe("stable");
    expect(summary.sampleCount).toBe(2);
    expect(summary.durationSeconds).toBe(3);
    expect(summary.averageBitrateKbps).toBe(3500);
    expect(summary.minimumFps).toBe(30);
  });

  it("marks low average quality as watch", () => {
    const summary = summarizeStreamHealthHistory(
      [
        sample({ elapsedSeconds: 1, bitrateKbps: 2500, fps: 26 }),
        sample({ elapsedSeconds: 4, bitrateKbps: 2450, fps: 26, droppedFrames: 1 })
      ],
      { bitrateKbps: 3500, fps: 30 }
    );

    expect(summary.stability).toBe("watch");
    expect(summary.droppedFrameIncrease).toBe(1);
  });

  it("marks reconnect history as unstable", () => {
    const summary = summarizeStreamHealthHistory(
      [
        sample({ elapsedSeconds: 1, bitrateKbps: 3400, fps: 30 }),
        sample({ elapsedSeconds: 4, bitrateKbps: 3400, fps: 30, reconnectAttempts: 1 })
      ],
      { bitrateKbps: 3500, fps: 30 }
    );

    expect(summary.stability).toBe("unstable");
    expect(summary.summary).toContain("Unstable");
  });
});
