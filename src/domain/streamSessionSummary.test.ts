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

  it("tracks platform API audit events in session and history summaries", () => {
    const summary = createStreamSessionSummary({
      events: [
        event({
          at: "2026-06-23T00:00:02.000Z",
          kind: "platform-api",
          severity: "info",
          title: "Platform publishing setup started",
          message: "Platform publishing setup started."
        }),
        event({
          at: "2026-06-23T00:00:03.000Z",
          kind: "platform-api",
          severity: "fail",
          title: "YouTube broadcast live failed",
          message: "YouTube broadcast transition failed with HTTP 503. Retry guidance: wait 30s."
        })
      ],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });
    if (!summary) {
      throw new Error("Expected session summary.");
    }

    const history = createStreamSessionHistorySummary([summary]);

    expect(summary.outcome).toBe("fail");
    expect(summary.platformApiEventCount).toBe(2);
    expect(summary.platformApiFailureCount).toBe(1);
    expect(summary.summary).toContain("Platform API: 2 events / 1 failed.");
    expect(summary.recommendation).toContain("OAuth scopes");
    expect(history.totalPlatformApiEvents).toBe(2);
    expect(history.totalPlatformApiFailures).toBe(1);
  });

  it("tracks platform chat readout reconnects in session and history summaries", () => {
    const summary = createStreamSessionSummary({
      events: [
        event({
          at: "2026-06-23T00:00:02.000Z",
          kind: "chat",
          severity: "warn",
          title: "Chat reconnect scheduled",
          message: "Twitch chat socket closed. Retrying chat in 2s (1/5)."
        }),
        event({
          at: "2026-06-23T00:00:03.000Z",
          kind: "chat",
          severity: "info",
          title: "Chat auto-connect started",
          message: "Starting Twitch chat readout connection."
        })
      ],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });
    if (!summary) {
      throw new Error("Expected session summary.");
    }

    const history = createStreamSessionHistorySummary([summary]);

    expect(summary.outcome).toBe("warn");
    expect(summary.chatEventCount).toBe(2);
    expect(summary.chatReconnectEventCount).toBe(1);
    expect(summary.chatReconnectFailureCount).toBe(0);
    expect(summary.summary).toContain("Chat readout reconnect events: 1");
    expect(summary.recommendation).toContain("platform chat stability");
    expect(history.totalChatEvents).toBe(2);
    expect(history.totalChatReconnectEvents).toBe(1);
    expect(history.totalChatReconnectFailures).toBe(0);
    expect(history.recommendation).toContain("platform chat stays connected");
  });

  it("stores audio meter samples and chat speech outcomes in session summaries", () => {
    const summary = createStreamSessionSummary({
      events: [
        event({
          at: "2026-06-23T00:00:02.000Z",
          kind: "chat",
          severity: "info",
          title: "Chat speech started",
          message: "Chat readout started speaking a youtube message."
        }),
        event({
          at: "2026-06-23T00:00:03.000Z",
          kind: "chat",
          severity: "info",
          title: "Chat speech spoken",
          message: "Chat readout finished speaking a youtube message."
        })
      ],
      healthSamples: [sample(1), sample(4)],
      audioLevelSamples: [
        { at: "2026-06-23T00:00:02.000Z", level: 0.1, source: "manual" },
        { at: "2026-06-23T00:00:03.000Z", level: 0.75, source: "face-tracking" },
        { at: "2026-06-23T00:00:06.000Z", level: 1, source: "manual" }
      ],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });
    if (!summary) {
      throw new Error("Expected session summary.");
    }
    const history = createStreamSessionHistorySummary([summary]);

    expect(summary.audioLevel.sampleCount).toBe(2);
    expect(summary.audioLevel.peakLevel).toBe(0.75);
    expect(summary.audioLevel.activePercent).toBe(100);
    expect(summary.chatSpeechStartedCount).toBe(1);
    expect(summary.chatSpeechSpokenCount).toBe(1);
    expect(summary.chatSpeechFailureCount).toBe(0);
    expect(summary.summary).toContain("Audio meter retained 2 samples");
    expect(summary.summary).toContain("Chat speech: 1 spoken / 0 failed");
    expect(history.totalChatSpeechSpoken).toBe(1);
    expect(history.totalChatSpeechFailures).toBe(0);
  });

  it("stores quality automation outcomes in session and history summaries", () => {
    const summary = createStreamSessionSummary({
      events: [
        event({
          at: "2026-06-23T00:00:02.000Z",
          kind: "quality",
          severity: "warn",
          title: "Live quality target lowered",
          message: "Live encoder target will use Balanced."
        }),
        event({
          at: "2026-06-23T00:00:03.000Z",
          kind: "quality",
          severity: "fail",
          title: "Live quality update failed",
          message: "The native encoder rejected the live quality update."
        })
      ],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });
    if (!summary) {
      throw new Error("Expected session summary.");
    }
    const history = createStreamSessionHistorySummary([summary]);

    expect(summary.outcome).toBe("fail");
    expect(summary.qualityEventCount).toBe(2);
    expect(summary.qualityLiveUpdateCount).toBe(1);
    expect(summary.qualityNextTargetCount).toBe(0);
    expect(summary.qualityUpdateFailureCount).toBe(1);
    expect(summary.summary).toContain("Quality automation: 1 live update / 0 next-start targets / 1 failed");
    expect(summary.recommendation).toContain("native live quality-update");
    expect(history.totalQualityEvents).toBe(2);
    expect(history.totalQualityLiveUpdates).toBe(1);
    expect(history.totalQualityUpdateFailures).toBe(1);
  });

  it("marks exhausted platform chat readout reconnects as unstable history", () => {
    const summary = createStreamSessionSummary({
      events: [
        event({
          at: "2026-06-23T00:00:02.000Z",
          kind: "chat",
          severity: "fail",
          title: "Chat reconnect exhausted",
          message: "Platform chat reconnect stopped after 5 failed attempts."
        })
      ],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });
    if (!summary) {
      throw new Error("Expected session summary.");
    }

    const history = createStreamSessionHistorySummary([summary]);

    expect(summary.outcome).toBe("fail");
    expect(summary.chatReconnectFailureCount).toBe(1);
    expect(summary.recommendation).toContain("comment readout");
    expect(history.stability).toBe("unstable");
    expect(history.totalChatReconnectFailures).toBe(1);
    expect(history.recommendation).toContain("comment readout");
  });

  it("stores native runtime evidence and marks congested sessions for review", () => {
    const summary = createStreamSessionSummary({
      events: [],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z"),
      nativeRuntime: {
        platform: "android",
        runtimeStatus: "live",
        updatedAt: Date.now(),
        stale: false,
        elapsedSeconds: 4,
        videoFrames: 92,
        encodedBytes: 1_900_000,
        droppedFrames: 2,
        publisher: {
          state: "published",
          reconnectAttempts: 0,
          sentVideoFrames: 92,
          sentAudioFrames: 180,
          droppedVideoFrames: 2,
          droppedAudioFrames: 1,
          bytesWritten: 1_900_000,
          cacheSize: 120,
          itemsInCache: 70,
          congested: true,
          lastError: ""
        },
        composition: {
          status: "applied",
          appliedCount: 1,
          skippedCount: 0,
          skippedKinds: [],
          message: "Native overlays applied"
        },
        audioProcessing: {
          micEffectsEnabled: true,
          micEffectsPresetId: "broadcast",
          micEffectsProcessedFrames: 24,
          micEffectsProcessedSamples: 12_288,
          micEffectsGatedSamples: 0,
          micEffectsLimitedSamples: 1,
          monitorEnabled: true,
          monitorRunning: true,
          monitorVolume: 0.5,
          monitorHeadphonesOnly: true,
          monitorRoute: "bluetooth-a2dp",
          monitorOutputName: "Bluetooth headphones",
          monitorHeadphonesConnected: true,
          monitorWrittenFrames: 12_288,
          monitorDroppedFrames: 0,
          monitorWrittenBuffers: 24,
          monitorDroppedBuffers: 0,
          monitorEstimatedLatencyMs: 142,
          monitorLatencySource: "android-audiotrack-buffer",
          monitorLastError: ""
        },
        message: "Live"
      }
    });

    expect(summary?.outcome).toBe("warn");
    expect(summary?.nativeRuntime?.status).toBe("warn");
    expect(summary?.nativeRuntime?.platform).toBe("android");
    expect(summary?.nativeRuntime?.queuedItems).toBe(70);
    expect(summary?.nativeRuntime?.droppedVideoFrames).toBe(2);
    expect(summary?.nativeRuntime?.monitorEnabled).toBe(true);
    expect(summary?.nativeRuntime?.monitorRunning).toBe(true);
    expect(summary?.nativeRuntime?.monitorOutputName).toBe("Bluetooth headphones");
    expect(summary?.nativeRuntime?.monitorWrittenFrames).toBe(12288);
    expect(summary?.nativeRuntime?.monitorDroppedFrames).toBe(0);
    expect(summary?.nativeRuntime?.monitorEstimatedLatencyMs).toBe(142);
    expect(summary?.nativeRuntime?.monitorLatencySource).toBe("android-audiotrack-buffer");
    expect(summary?.summary).toContain("Native runtime needs review");
    expect(summary?.recommendation).toContain("Lower bitrate");
  });

  it("keeps iOS still-image asset misses in completed native runtime evidence", () => {
    const summary = createStreamSessionSummary({
      events: [],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z"),
      nativeRuntime: {
        platform: "ios",
        runtimeStatus: "live",
        updatedAt: Date.now(),
        stale: false,
        elapsedSeconds: 4,
        videoFrames: 92,
        encodedBytes: 1_900_000,
        droppedFrames: 0,
        publisher: {
          state: "published",
          reconnectAttempts: 0,
          sentVideoFrames: 92,
          sentAudioFrames: 180,
          droppedVideoFrames: 0,
          droppedAudioFrames: 0,
          bytesWritten: 1_900_000,
          cacheSize: 120,
          itemsInCache: 0,
          congested: false,
          lastError: ""
        },
        composition: {
          status: "pending",
          appliedCount: 2,
          skippedCount: 0,
          skippedKinds: [],
          stillImageAssetCount: 2,
          stillImageAssetLoadedCount: 1,
          stillImageAssetMissingCount: 1,
          stillImageAssetMissingKinds: ["pngtuber"],
          stillImageAssetDecodedCount: 1,
          stillImageAssetDecodedPixelCount: 921_600,
          stillImageAssetCompositedCount: 1,
          stillImageAssetCompositedPixelCount: 921_600,
          stillImageAssetAppGroupCount: 1,
          stillImageAssetAppGroupLoadedCount: 1,
          stillImageAssetAppGroupDecodedCount: 1,
          stillImageAssetAppGroupDecodedPixelCount: 921_600,
          stillImageAssetAppGroupCompositedCount: 1,
          stillImageAssetAppGroupCompositedPixelCount: 921_600,
          message: "Native overlays applied: 2; image assets 1/2, missing 1: pngtuber"
        },
        message: "Live"
      }
    });

    expect(summary?.outcome).toBe("warn");
    expect(summary?.nativeRuntime?.status).toBe("warn");
    expect(summary?.nativeRuntime?.stillImageAssetCount).toBe(2);
    expect(summary?.nativeRuntime?.stillImageAssetLoadedCount).toBe(1);
    expect(summary?.nativeRuntime?.stillImageAssetMissingCount).toBe(1);
    expect(summary?.nativeRuntime?.stillImageAssetMissingKinds).toEqual(["pngtuber"]);
    expect(summary?.nativeRuntime?.stillImageAssetDecodedCount).toBe(1);
    expect(summary?.nativeRuntime?.stillImageAssetDecodedPixelCount).toBe(921_600);
    expect(summary?.nativeRuntime?.recommendation).toContain("App Group-copied");
  });

  it("warns when decoded iOS still-image assets are not composited", () => {
    const summary = createStreamSessionSummary({
      events: [],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z"),
      nativeRuntime: {
        platform: "ios",
        runtimeStatus: "live",
        updatedAt: Date.now(),
        stale: false,
        elapsedSeconds: 4,
        videoFrames: 92,
        encodedBytes: 1_900_000,
        droppedFrames: 0,
        publisher: {
          state: "published",
          reconnectAttempts: 0,
          sentVideoFrames: 92,
          sentAudioFrames: 180,
          droppedVideoFrames: 0,
          droppedAudioFrames: 0,
          bytesWritten: 1_900_000,
          cacheSize: 120,
          itemsInCache: 0,
          congested: false,
          lastError: ""
        },
        composition: {
          status: "applied",
          appliedCount: 1,
          skippedCount: 0,
          skippedKinds: [],
          stillImageAssetCount: 1,
          stillImageAssetLoadedCount: 1,
          stillImageAssetMissingCount: 0,
          stillImageAssetMissingKinds: [],
          stillImageAssetDecodedCount: 1,
          stillImageAssetDecodedPixelCount: 921_600,
          stillImageAssetCompositedCount: 0,
          stillImageAssetCompositedPixelCount: 0,
          stillImageAssetAppGroupCount: 1,
          stillImageAssetAppGroupLoadedCount: 1,
          stillImageAssetAppGroupDecodedCount: 1,
          stillImageAssetAppGroupDecodedPixelCount: 921_600,
          stillImageAssetAppGroupCompositedCount: 0,
          stillImageAssetAppGroupCompositedPixelCount: 0,
          message: "Native overlays applied: 1; image assets 1/1"
        },
        message: "Live"
      }
    });

    expect(summary?.outcome).toBe("warn");
    expect(summary?.nativeRuntime?.status).toBe("warn");
    expect(summary?.nativeRuntime?.stillImageAssetCompositedCount).toBe(0);
    expect(summary?.nativeRuntime?.recommendation).toContain("composited");
  });

  it("warns when iOS still-image assets lack App Group render proof", () => {
    const summary = createStreamSessionSummary({
      events: [],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z"),
      nativeRuntime: {
        platform: "ios",
        runtimeStatus: "live",
        updatedAt: Date.now(),
        stale: false,
        elapsedSeconds: 4,
        videoFrames: 92,
        encodedBytes: 1_900_000,
        droppedFrames: 0,
        publisher: {
          state: "published",
          reconnectAttempts: 0,
          sentVideoFrames: 92,
          sentAudioFrames: 180,
          droppedVideoFrames: 0,
          droppedAudioFrames: 0,
          bytesWritten: 1_900_000,
          cacheSize: 120,
          itemsInCache: 0,
          congested: false,
          lastError: ""
        },
        composition: {
          status: "applied",
          appliedCount: 1,
          skippedCount: 0,
          skippedKinds: [],
          stillImageAssetCount: 1,
          stillImageAssetLoadedCount: 1,
          stillImageAssetMissingCount: 0,
          stillImageAssetMissingKinds: [],
          stillImageAssetDecodedCount: 1,
          stillImageAssetDecodedPixelCount: 921_600,
          stillImageAssetCompositedCount: 1,
          stillImageAssetCompositedPixelCount: 921_600,
          stillImageAssetAppGroupCount: 0,
          stillImageAssetAppGroupLoadedCount: 0,
          stillImageAssetAppGroupDecodedCount: 0,
          stillImageAssetAppGroupDecodedPixelCount: 0,
          stillImageAssetAppGroupCompositedCount: 0,
          stillImageAssetAppGroupCompositedPixelCount: 0,
          message: "Native overlays applied: 1; image assets 1/1"
        },
        message: "Live"
      }
    });

    expect(summary?.outcome).toBe("warn");
    expect(summary?.nativeRuntime?.status).toBe("warn");
    expect(summary?.nativeRuntime?.stillImageAssetAppGroupCount).toBe(0);
    expect(summary?.nativeRuntime?.recommendation).toContain("App Group-copied");
    expect(summary?.nativeRuntime?.recommendation).toContain("render");
  });

  it("lets native runtime failures make the completed session fail", () => {
    const summary = createStreamSessionSummary({
      events: [],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z"),
      nativeRuntime: {
        platform: "ios",
        runtimeStatus: "failed",
        updatedAt: Date.now(),
        stale: false,
        elapsedSeconds: 4,
        videoFrames: 40,
        encodedBytes: 900_000,
        droppedFrames: 0,
        publisher: {
          state: "failed",
          reconnectAttempts: 1,
          sentVideoFrames: 40,
          sentAudioFrames: 80,
          droppedVideoFrames: 0,
          droppedAudioFrames: 0,
          bytesWritten: 900_000,
          cacheSize: 0,
          itemsInCache: 0,
          congested: false,
          lastError: "RTMP rejected"
        },
        composition: {
          status: "applied",
          appliedCount: 1,
          skippedCount: 0,
          skippedKinds: [],
          message: "Native overlays applied"
        },
        message: "Failed"
      }
    });

    expect(summary?.outcome).toBe("fail");
    expect(summary?.nativeRuntime?.status).toBe("fail");
    expect(summary?.summary).toContain("Native runtime ended with a failure");
    expect(summary?.recommendation).toContain("private ingest test");
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

  it("normalizes persisted native runtime summaries without requiring raw native messages", () => {
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
      {
        ...summary,
        nativeRuntime: {
          platform: "android",
          status: "warn",
          runtimeStatus: "live",
          publisherState: "published",
          compositionStatus: "applied",
          stillImageAssetCount: 2,
          stillImageAssetLoadedCount: 1,
          stillImageAssetMissingCount: 1,
          stillImageAssetMissingKinds: ["image"],
          stillImageAssetDecodedCount: 1,
          stillImageAssetDecodedPixelCount: 921_600,
          stillImageAssetCompositedCount: 1,
          stillImageAssetCompositedPixelCount: 921_600,
          stillImageAssetAppGroupCount: 0,
          stillImageAssetAppGroupLoadedCount: 0,
          stillImageAssetAppGroupDecodedCount: 0,
          stillImageAssetAppGroupDecodedPixelCount: 0,
          stillImageAssetAppGroupCompositedCount: 0,
          stillImageAssetAppGroupCompositedPixelCount: 0,
          stale: false,
          congested: true,
          queuedItems: 8,
          cacheSize: 16,
          sentVideoFrames: 120.4,
          sentAudioFrames: 240.4,
          droppedVideoFrames: 2,
          droppedAudioFrames: 1,
          bytesWritten: 123456,
          encodedBytes: 123456,
          issueCount: 1
        }
      }
    ]);

    expect(normalized[0]?.nativeRuntime?.status).toBe("warn");
    expect(normalized[0]?.nativeRuntime?.sentVideoFrames).toBe(120);
    expect(normalized[0]?.nativeRuntime?.stillImageAssetMissingKinds).toEqual(["image"]);
    expect(normalized[0]?.nativeRuntime?.stillImageAssetDecodedCount).toBe(1);
    expect(normalized[0]?.nativeRuntime?.stillImageAssetDecodedPixelCount).toBe(921_600);
    expect(normalized[0]?.nativeRuntime?.summary).toContain("Native runtime warn");
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

  it("keeps a single warning session in watch instead of unstable", () => {
    const summary = createStreamSessionSummary({
      events: [
        event({
          severity: "warn",
          title: "Network congestion",
          message: "Publisher queue grew"
        })
      ],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });
    if (!summary) {
      throw new Error("Expected session summary.");
    }

    const history = createStreamSessionHistorySummary([summary]);

    expect(history.stability).toBe("watch");
    expect(history.cleanRate).toBe(0);
  });

  it("marks repeated warning sessions with poor clean rate as unstable", () => {
    const summary = createStreamSessionSummary({
      events: [
        event({
          severity: "warn",
          title: "Network congestion",
          message: "Publisher queue grew"
        })
      ],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });
    if (!summary) {
      throw new Error("Expected session summary.");
    }

    const history = createStreamSessionHistorySummary([
      { ...summary, id: "warn-3" },
      { ...summary, id: "warn-2" },
      { ...summary, id: "warn-1" }
    ]);

    expect(history.stability).toBe("unstable");
    expect(history.cleanRate).toBe(0);
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
