import { afterEach, describe, expect, it, vi } from "vitest";
import { type StreamHealthSample } from "../domain/streamHealthHistory";
import { createStreamSessionSummary } from "../domain/streamSessionSummary";
import {
  clearStreamSessionSummaries,
  loadStreamSessionSummaries,
  saveStreamSessionSummaries
} from "./localStore";

const sessionSummaryStorageKey = "mobile-live-caster.stream-session-summaries";

const createMemoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
};

const sample = (elapsedSeconds: number): StreamHealthSample => ({
  at: new Date(Date.UTC(2026, 5, 23, 0, 0, elapsedSeconds)).toISOString(),
  status: "live",
  elapsedSeconds,
  bitrateKbps: 3500,
  fps: 30,
  droppedFrames: 0,
  reconnectAttempts: 0
});

describe("local stream session summary store", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves, loads, and clears completed stream session summaries", () => {
    const storage = createMemoryStorage();
    vi.stubGlobal("localStorage", storage);
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

    saveStreamSessionSummaries([summary]);

    expect(loadStreamSessionSummaries()).toHaveLength(1);
    expect(storage.getItem(sessionSummaryStorageKey)).toContain(summary.id);

    clearStreamSessionSummaries();

    expect(loadStreamSessionSummaries()).toEqual([]);
    expect(storage.getItem(sessionSummaryStorageKey)).toBeNull();
  });
});
