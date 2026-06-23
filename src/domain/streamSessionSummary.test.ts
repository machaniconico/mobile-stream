import { describe, expect, it } from "vitest";
import { type StreamHealthSample } from "./streamHealthHistory";
import { type StreamSessionEvent } from "./streamSessionLog";
import {
  appendStreamSessionSummary,
  createStreamSessionHistorySummary,
  createStreamSessionSummary,
  mergeStreamSessionSummaries,
  normalizeStreamSessionSummaries
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

  it("normalizes persisted session summaries and drops malformed entries", () => {
    const summary = createStreamSessionSummary({
      events: [],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });
    if (!summary) {
      throw new Error("Expected session summary.");
    }

    const normalized = normalizeStreamSessionSummaries([
      summary,
      {
        id: "bad",
        startedAt: "2026-06-23T00:00:01.000Z",
        endedAt: "2026-06-23T00:00:05.000Z",
        endReason: "unknown",
        outcome: "clean",
        health: summary.health
      }
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.id).toBe(summary.id);
  });

  it("limits persisted session summaries to the retention cap", () => {
    const summary = createStreamSessionSummary({
      events: [],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });
    if (!summary) {
      throw new Error("Expected session summary.");
    }

    const summaries = Array.from({ length: 12 }, (_, index) => ({
      ...summary,
      id: `summary-${index}`
    }));

    expect(normalizeStreamSessionSummaries(summaries)).toHaveLength(10);
  });

  it("merges newly completed and persisted summaries without losing history", () => {
    const summary = createStreamSessionSummary({
      events: [],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });
    if (!summary) {
      throw new Error("Expected session summary.");
    }

    const newest = { ...summary, id: "newest-session" };
    const persisted = { ...summary, id: "persisted-session" };
    const merged = mergeStreamSessionSummaries(
      [newest],
      [persisted, newest]
    );

    expect(merged.map((item) => item.id)).toEqual([
      "newest-session",
      "persisted-session"
    ]);
  });

  it("summarizes empty completed session history", () => {
    const history = createStreamSessionHistorySummary([]);

    expect(history.stability).toBe("unknown");
    expect(history.totalSessions).toBe(0);
    expect(history.recommendation).toContain("test stream");
  });

  it("marks repeated clean sessions as a known-good baseline", () => {
    const summary = createStreamSessionSummary({
      events: [],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });
    if (!summary) {
      throw new Error("Expected session summary.");
    }

    const history = createStreamSessionHistorySummary([
      { ...summary, id: "clean-3" },
      { ...summary, id: "clean-2" },
      { ...summary, id: "clean-1" }
    ]);

    expect(history.stability).toBe("baseline");
    expect(history.cleanRate).toBe(100);
    expect(history.summary).toContain("Known-good baseline");
  });

  it("flags recent failed session history as unstable", () => {
    const summary = createStreamSessionSummary({
      events: [],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });
    if (!summary) {
      throw new Error("Expected session summary.");
    }

    const history = createStreamSessionHistorySummary([
      {
        ...summary,
        id: "failed-session",
        endReason: "failed",
        outcome: "fail",
        failureCount: 1
      },
      { ...summary, id: "clean-session" }
    ]);

    expect(history.stability).toBe("unstable");
    expect(history.cleanRate).toBe(50);
    expect(history.totalFailureEvents).toBe(1);
    expect(history.recommendation).toContain("private ingest test");
  });
});
