import { describe, expect, it } from "vitest";
import { type StreamHealthSample } from "./streamHealthHistory";
import { type StreamSessionEvent } from "./streamSessionLog";
import {
  appendStreamSessionSummary,
  createStreamSessionSummary
} from "./streamSessionSummary";

const sample = (elapsedSeconds: number, update: Partial<StreamHealthSample> = {}): StreamHealthSample => ({
  at: new Date(Date.UTC(2026, 5, 23, 0, 0, elapsedSeconds)).toISOString(),
  status: "live",
  elapsedSeconds,
  bitrateKbps: 3500,
  fps: 30,
  droppedFrames: 0,
  reconnectAttempts: 0,
  ...update
});

const event = (update: Partial<StreamSessionEvent> = {}): StreamSessionEvent => ({
  id: `event-${update.at ?? "0"}`,
  at: update.at ?? "2026-06-23T00:00:02.000Z",
  kind: "status",
  severity: "info",
  title: "Stream live",
  message: "live",
  ...update
});

describe("stream session summary", () => {
  it("returns null when no health samples were captured", () => {
    expect(
      createStreamSessionSummary({
        events: [],
        healthSamples: [],
        target: { bitrateKbps: 3500, fps: 30 },
        endReason: "stopped"
      })
    ).toBeNull();
  });

  it("creates a clean stopped session summary", () => {
    const summary = createStreamSessionSummary({
      events: [event()],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });

    expect(summary?.outcome).toBe("clean");
    expect(summary?.durationSeconds).toBe(3);
    expect(summary?.eventCount).toBe(1);
    expect(summary?.summary).toContain("Clean session");
  });

  it("marks failed sessions as failures", () => {
    const summary = createStreamSessionSummary({
      events: [
        event({
          at: "2026-06-23T00:00:03.000Z",
          severity: "fail",
          kind: "operation",
          title: "Start failed",
          message: "RTMP rejected"
        })
      ],
      healthSamples: [sample(1), sample(4, { reconnectAttempts: 1 })],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "failed",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });

    expect(summary?.outcome).toBe("fail");
    expect(summary?.operationFailureCount).toBe(1);
    expect(summary?.recommendation).toContain("failed operation");
  });

  it("deduplicates appended summaries", () => {
    const summary = createStreamSessionSummary({
      events: [],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });

    expect(appendStreamSessionSummary([], summary)).toHaveLength(1);
    expect(appendStreamSessionSummary(summary ? [summary] : [], summary)).toHaveLength(1);
  });
});
