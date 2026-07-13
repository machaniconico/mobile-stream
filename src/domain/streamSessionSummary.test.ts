import { describe, expect, it } from "vitest";
import { type StreamHealthSample } from "./streamHealthHistory";
import { normalizeNativeRuntimeAudioProcessing, type NativeRuntimeAudioProcessing } from "./nativeRuntime";
import { type StreamSessionEvent } from "./streamSessionLog";
import {
  appendStreamSessionSummary,
  createStreamAudioLevelSample,
  createStreamSessionHistorySummary,
  createStreamSessionSummary,
  mergeStreamSessionSummaries,
  normalizeStreamSessionSummaries,
  summarizeStreamAudioLevels
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
  it("keeps native PCM RMS and peak evidence separate", () => {
    const summary = summarizeStreamAudioLevels([
      createStreamAudioLevelSample(0.12, "native-pcm", new Date("2026-06-23T00:00:01.000Z"), {
        peakLevel: 0.72,
        pcmSampleCount: 1_000,
        clippedPcmSampleCount: 0
      }),
      createStreamAudioLevelSample(0.18, "native-pcm", new Date("2026-06-23T00:00:02.000Z"), {
        peakLevel: 0.99,
        pcmSampleCount: 1_000,
        clippedPcmSampleCount: 1
      })
    ]);

    expect(summary.averageLevel).toBe(0.15);
    expect(summary.peakLevel).toBe(0.99);
    expect(summary.activePercent).toBe(100);
    expect(summary.clippedSampleCount).toBe(1);
    expect(summary.pcmSampleCount).toBe(2_000);
    expect(summary.clippedPcmSampleCount).toBe(1);
    expect(summary.evidenceSource).toBe("native-pcm");
  });

  it("does not infer native clipping from a high but unclipped peak", () => {
    const summary = summarizeStreamAudioLevels([
      createStreamAudioLevelSample(0.2, "native-pcm", new Date("2026-06-23T00:00:01.000Z"), {
        peakLevel: 0.99,
        pcmSampleCount: 44_100,
        clippedPcmSampleCount: 0
      })
    ]);

    expect(summary.peakLevel).toBe(0.99);
    expect(summary.clippedSampleCount).toBe(0);
    expect(summary.clippedPcmSampleCount).toBe(0);
  });

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
    expect(summary.audioLevel.evidenceSource).toBe("simulated");
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
      events: [
        event({
          kind: "quality",
          severity: "warn",
          title: "Live quality target lowered",
          message: "Mirrors one native automatic reduction."
        })
      ],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z"),
      audioLevelSamples: [
        { at: "2026-06-23T00:00:02.000Z", level: 1, source: "manual" },
        { at: "2026-06-23T00:00:03.000Z", level: 0.2, peakLevel: 0.5, source: "native-pcm" }
      ],
      nativeRuntime: {
        platform: "android",
        runtimeStatus: "live",
        updatedAt: Date.parse("2026-06-23T00:00:04.000Z"),
        stale: false,
        elapsedSeconds: 4,
        videoFrames: 92,
        encodedBytes: 1_900_000,
        droppedFrames: 2,
        publisher: {
          state: "published",
          publishGeneration: 7,
          currentPublishVideoFrames: 92,
          currentPublishAudioFrames: 180,
          videoEncoderBackend: "mediacodec-h264",
          audioEncoderBackend: "mediacodec-aac",
          reconnectAttempts: 0,
          sentVideoFrames: 92,
          sentAudioFrames: 180,
          droppedVideoFrames: 2,
          droppedAudioFrames: 1,
          bytesWritten: 1_900_000,
          cacheSize: 120,
          itemsInCache: 70,
          congested: true,
          bitrateAdaptation: {
            status: "reduced",
            initialTargetKbps: 3_500,
            requestedTargetKbps: 2_500,
            appliedTargetKbps: 2_500,
            minimumAppliedKbps: 2_500,
            updateCount: 1,
            failureCount: 2,
            lastUpdatedAt: Date.parse("2026-06-23T00:00:03.500Z"),
            controlOwner: "native",
            controllerState: "cooldown",
            baselineTargetKbps: 3_500,
            effectiveTargetKbps: 2_500,
            floorTargetKbps: 1_800,
            pendingTargetKbps: 0,
            automaticReductionCount: 2,
            automaticRestorationCount: 1,
            pressureSampleCount: 7,
            healthySampleCount: 3,
            cooldownRemainingMs: 2_000,
            recoveryEligibleInMs: 5_000,
            publishGeneration: 3,
            cumulativeReconnectCount: 2,
            lastDecisionAt: Date.parse("2026-06-23T00:00:03.500Z"),
            lastDecisionReason: `Authorization: Bearer nativeDecisionToken12345 ${"x".repeat(200)}`
          },
          lastError: ""
        },
        encoderProbe: {
          status: "pass",
          checkedAt: Date.parse("2026-06-23T00:00:01.000Z"),
          activeEncoderInstancesVerified: true,
          videoEncodedOutputCount: 92,
          audioEncodedOutputCount: 180,
          videoBackend: "mediacodec-h264",
          audioBackend: "mediacodec-aac",
          videoCodecName: "c2.android.avc.encoder",
          audioCodecName: "c2.android.aac.encoder",
          videoMime: "video/avc",
          audioMime: "audio/mp4a-latm",
          videoConfigured: true,
          audioConfigured: true,
          videoColorFormat: "surface",
          videoBitrateMode: "cbr",
          videoWidth: 1280,
          videoHeight: 720,
          videoFps: 30,
          audioSampleRate: 44100,
          audioChannelCount: 2,
          message:
            "Configured first-party MediaCodec H.264/AAC encoders with Authorization: Bearer nativeProbeToken12345."
        },
        composition: {
          status: "applied",
          appliedCount: 1,
          skippedCount: 0,
          skippedKinds: [],
          runtimeCompositorBackend: "android-canvas-mediacodec",
          runtimeCompositedFrameCount: 92,
          runtimeDroppedFrameCount: 2,
          runtimeCompositionFailureCount: 0,
          message: "Native overlays applied"
        },
        audioProcessing: {
          micEffectsEnabled: true,
          micEffectsPresetId: "broadcast",
          micEffectsProcessedFrames: 24,
          micEffectsProcessedSamples: 12_288,
          micEffectsGatedSamples: 0,
          micEffectsLimitedSamples: 1,
          micRmsLevel: 0.18,
          micPeakLevel: 0.72,
          micSampleCount: 12_288,
          micClippedSampleCount: 0,
          micLevelUpdatedAt: Date.parse("2026-06-23T00:00:04.000Z"),
          appAudioRmsLevel: 0.16,
          appAudioPeakLevel: 0.58,
          appAudioSampleCount: 24_576,
          appAudioClippedSampleCount: 0,
          appAudioLevelUpdatedAt: Date.parse("2026-06-23T00:00:04.000Z"),
          mixedAudioRmsLevel: 0.24,
          mixedAudioPeakLevel: 0.78,
          mixedAudioSampleCount: 24_576,
          mixedAudioClippedSampleCount: 0,
          mixedAudioLevelUpdatedAt: Date.parse("2026-06-23T00:00:04.000Z"),
          playbackCaptureStatus: "capturing",
          playbackCaptureBackend: "android-audio-playback-capture",
          playbackCaptureSampleRate: 44_100,
          playbackCapturedFrames: 132_300,
          playbackDroppedFrames: 0,
          playbackUnderrunFrames: 0,
          playbackBufferedFrames: 0,
          broadcastAppAudioVolume: 0.85,
          broadcastAppAudioMuted: false,
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
          monitorLastError: "",
          monitorLifecycleEventCount: 4,
          monitorRouteChangeCount: 2,
          monitorInterruptionCount: 1,
          monitorRecoveryCount: 2,
          monitorRecoveryFailureCount: 1,
          monitorLastRecoveryReason: "route-device-removed",
          monitorLastRecoveryAt: Date.parse("2026-06-23T00:00:03.750Z"),
          monitorSuspended: false,
          micCaptureStatus: "capturing",
          micCaptureBackend: "android-audio-record",
          micCaptureSampleRate: 48_000,
          micCaptureFallbackFrames: 1_440,
          micCaptureLifecycleEventCount: 6,
          micCaptureRouteChangeCount: 2,
          micCaptureInterruptionCount: 1,
          micCaptureRecoveryCount: 2,
          micCaptureRecoveryFailureCount: 1,
          micCaptureUnrecoveredEventCount: 3,
          micCaptureLastRecoveryReason: "audio-route-changed",
          micCaptureLastRecoveryAt: Date.parse("2026-06-23T00:00:03.800Z"),
          micCaptureSuspended: false,
          playbackCaptureLifecycleEventCount: 5,
          playbackCaptureRouteChangeCount: 1,
          playbackCaptureInterruptionCount: 2,
          playbackCaptureRecoveryCount: 2,
          playbackCaptureRecoveryFailureCount: 1,
          playbackCaptureUnrecoveredEventCount: 4,
          playbackCaptureLastRecoveryReason: "media-projection-resumed",
          playbackCaptureLastRecoveryAt: Date.parse("2026-06-23T00:00:03.900Z"),
          playbackCaptureSuspended: false
        },
        continuity: {
          status: "healthy",
          videoStalled: false,
          audioStalled: false,
          videoLastAdvancedAt: Date.parse("2026-06-23T00:00:03.800Z"),
          audioLastAdvancedAt: Date.parse("2026-06-23T00:00:03.900Z"),
          videoStallDurationMs: 200,
          audioStallDurationMs: 100,
          videoStallCount: 1,
          audioStallCount: 0,
          maxVideoStallDurationMs: 6_400,
          maxAudioStallDurationMs: 0,
          stallThresholdMs: 5_000
        },
        avSync: {
          status: "in-sync",
          latestVideoTimestampMs: 3_966,
          latestAudioTimestampMs: 3_958,
          skewMs: 8,
          maxAbsSkewMs: 34,
          sampleCount: 309,
          outOfSyncSampleCount: 0,
          outOfSyncIncidentCount: 0,
          criticalIncidentCount: 0,
          consecutiveOutOfSyncSamples: 0,
          maxConsecutiveOutOfSyncSamples: 0,
          warningThresholdMs: 150,
          criticalThresholdMs: 500,
          critical: false
        },
        message: "Live"
      }
    });

    expect(summary?.outcome).toBe("warn");
    expect(summary?.nativeRuntime?.status).toBe("warn");
    expect(summary?.nativeRuntime?.platform).toBe("android");
    expect(summary?.nativeRuntime?.queuedItems).toBe(70);
    expect(summary?.nativeRuntime?.bitrateAdaptationStatus).toBe("reduced");
    expect(summary?.nativeRuntime?.appliedVideoBitrateKbps).toBe(2_500);
    expect(summary?.nativeRuntime?.minimumAppliedVideoBitrateKbps).toBe(2_500);
    expect(summary?.nativeRuntime?.liveVideoBitrateUpdateCount).toBe(1);
    expect(summary?.nativeRuntime?.liveVideoBitrateUpdateFailureCount).toBe(2);
    expect(summary?.nativeRuntime).toMatchObject({
      publisherState: "published",
      publisherPublishGeneration: 7,
      currentPublishVideoFrames: 92,
      currentPublishAudioFrames: 180,
      controlOwner: "native",
      controllerState: "cooldown",
      baselineTargetKbps: 3_500,
      effectiveTargetKbps: 2_500,
      floorTargetKbps: 1_800,
      pendingTargetKbps: 0,
      automaticReductionCount: 2,
      automaticRestorationCount: 1,
      pressureSampleCount: 7,
      healthySampleCount: 3,
      cooldownRemainingMs: 2_000,
      recoveryEligibleInMs: 5_000,
      publishGeneration: 3,
      cumulativeReconnectCount: 2,
      lastDecisionAt: Date.parse("2026-06-23T00:00:03.500Z")
    });
    expect(summary?.nativeRuntime?.lastDecisionReason).toContain("Authorization: Bearer [redacted]");
    expect(summary?.nativeRuntime?.lastDecisionReason).not.toContain("nativeDecisionToken12345");
    expect(summary?.nativeRuntime?.lastDecisionReason).toHaveLength(160);
    expect(summary?.qualityLiveUpdateCount).toBe(3);
    expect(summary?.qualityEventCount).toBe(5);
    expect(summary?.qualityUpdateFailureCount).toBe(2);
    expect(summary?.nativeRuntime?.droppedVideoFrames).toBe(2);
    expect(summary?.nativeRuntime?.monitorEnabled).toBe(true);
    expect(summary?.nativeRuntime?.monitorRunning).toBe(true);
    expect(summary?.nativeRuntime?.monitorOutputName).toBe("Bluetooth headphones");
    expect(summary?.nativeRuntime?.monitorWrittenFrames).toBe(12288);
    expect(summary?.nativeRuntime?.monitorDroppedFrames).toBe(0);
    expect(summary?.nativeRuntime?.monitorEstimatedLatencyMs).toBe(142);
    expect(summary?.nativeRuntime?.monitorLatencySource).toBe("android-audiotrack-buffer");
    expect(summary?.nativeRuntime).toMatchObject({
      monitorLifecycleEventCount: 4,
      monitorRouteChangeCount: 2,
      monitorInterruptionCount: 1,
      monitorRecoveryCount: 2,
      monitorRecoveryFailureCount: 1,
      monitorLastRecoveryReason: "route-device-removed",
      monitorLastRecoveryAt: Date.parse("2026-06-23T00:00:03.750Z"),
      monitorSuspended: false
    });
    expect(summary?.nativeRuntime).toMatchObject({
      micCaptureStatus: "capturing",
      micCaptureBackend: "android-audio-record",
      micCaptureSampleRate: 48_000,
      micCaptureFallbackFrames: 1_440,
      micCaptureLifecycleEventCount: 6,
      micCaptureRouteChangeCount: 2,
      micCaptureInterruptionCount: 1,
      micCaptureRecoveryCount: 2,
      micCaptureRecoveryFailureCount: 1,
      micCaptureUnrecoveredEventCount: 3,
      micCaptureLastRecoveryReason: "audio-route-changed",
      micCaptureLastRecoveryAt: Date.parse("2026-06-23T00:00:03.800Z"),
      micCaptureSuspended: false,
      playbackCaptureLifecycleEventCount: 5,
      playbackCaptureRouteChangeCount: 1,
      playbackCaptureInterruptionCount: 2,
      playbackCaptureRecoveryCount: 2,
      playbackCaptureRecoveryFailureCount: 1,
      playbackCaptureUnrecoveredEventCount: 4,
      playbackCaptureLastRecoveryReason: "media-projection-resumed",
      playbackCaptureLastRecoveryAt: Date.parse("2026-06-23T00:00:03.900Z"),
      playbackCaptureSuspended: false
    });
    expect(summary?.nativeRuntime?.micRmsLevel).toBe(0.18);
    expect(summary?.nativeRuntime?.micPeakLevel).toBe(0.72);
    expect(summary?.nativeRuntime?.micSampleCount).toBe(12288);
    expect(summary?.nativeRuntime?.micClippedSampleCount).toBe(0);
    expect(summary?.nativeRuntime?.appAudioPeakLevel).toBe(0.58);
    expect(summary?.nativeRuntime?.appAudioSampleCount).toBe(24576);
    expect(summary?.nativeRuntime?.mixedAudioSampleCount).toBe(24576);
    expect(summary?.nativeRuntime?.mixedAudioClippedSampleCount).toBe(0);
    expect(summary?.nativeRuntime).toMatchObject({
      playbackCaptureStatus: "capturing",
      playbackCaptureBackend: "android-audio-playback-capture",
      playbackCaptureSampleRate: 44_100,
      playbackCapturedFrames: 132_300,
      playbackDroppedFrames: 0,
      playbackUnderrunFrames: 0,
      playbackBufferedFrames: 0
    });
    expect(summary?.nativeRuntime?.continuityStatus).toBe("healthy");
    expect(summary?.nativeRuntime?.videoStallCount).toBe(1);
    expect(summary?.nativeRuntime?.maxVideoStallDurationMs).toBe(6400);
    expect(summary?.nativeRuntime?.avSyncStatus).toBe("in-sync");
    expect(summary?.nativeRuntime?.avSyncSkewMs).toBe(8);
    expect(summary?.nativeRuntime?.avSyncMaxAbsSkewMs).toBe(34);
    expect(summary?.nativeRuntime?.avSyncSampleCount).toBe(309);
    expect(summary?.audioLevel.sampleCount).toBe(1);
    expect(summary?.audioLevel.evidenceSource).toBe("native-pcm");
    expect(summary?.audioLevel.peakLevel).toBe(0.5);
    expect(summary?.audioLevel.clippedSampleCount).toBe(0);
    expect(summary?.nativeRuntime?.encoderProbeStatus).toBe("pass");
    expect(summary?.nativeRuntime?.encoderProbeActiveEncoderInstancesVerified).toBe(true);
    expect(summary?.nativeRuntime?.encoderProbeVideoEncodedOutputCount).toBe(92);
    expect(summary?.nativeRuntime?.encoderProbeAudioEncodedOutputCount).toBe(180);
    expect(summary?.nativeRuntime?.encoderProbeVideoBackend).toBe("mediacodec-h264");
    expect(summary?.nativeRuntime).toMatchObject({
      encoderProbeVideoConfigured: true,
      encoderProbeAudioConfigured: true,
      encoderProbeVideoWidth: 1280,
      encoderProbeVideoHeight: 720,
      encoderProbeVideoFps: 30
    });
    expect(summary?.nativeRuntime?.encoderProbeMessage).toContain("Authorization: Bearer [redacted]");
    expect(summary?.nativeRuntime?.encoderProbeMessage).not.toContain("nativeProbeToken12345");
    expect(summary?.summary).toContain("Native runtime needs review");
    expect(summary?.summary).toContain("Native-owned bitrate controller");
    expect(summary?.recommendation).toContain("native-owned bitrate controller");
    expect(summary?.recommendation).toContain("failed live updates");
  });

  it("requires Android MediaCodec native runtime evidence to include direct compositor frame proof", () => {
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
        droppedFrames: 0,
        publisher: {
          state: "published",
          publishGeneration: 1.5,
          currentPublishVideoFrames: -1,
          currentPublishAudioFrames: Number.NaN,
          videoEncoderBackend: "mediacodec-h264",
          audioEncoderBackend: "mediacodec-aac",
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
          message: "Native overlays applied"
        },
        message: "Live"
      }
    });

    expect(summary?.nativeRuntime?.status).toBe("warn");
    expect(summary?.nativeRuntime?.runtimeCompositorBackend).toBe("none");
    expect(summary?.nativeRuntime?.runtimeCompositedFrameCount).toBe(0);
    expect(summary?.nativeRuntime).toMatchObject({
      publisherPublishGeneration: 0,
      currentPublishVideoFrames: 0,
      currentPublishAudioFrames: 0
    });
    expect(summary?.nativeRuntime?.recommendation).toContain("Android direct MediaCodec validation");
  });

  it("warns when Android playback capture proof is missing or unstable", () => {
    const createSummary = (audioProcessing: Partial<NativeRuntimeAudioProcessing>) =>
      createStreamSessionSummary({
        events: [],
        healthSamples: [sample(1), sample(4)],
        target: { bitrateKbps: 3500, fps: 30 },
        endReason: "stopped",
        endedAt: new Date("2026-06-23T00:00:05.000Z"),
        nativeRuntime: {
          platform: "android",
          runtimeStatus: "live",
          updatedAt: Date.parse("2026-06-23T00:00:04.000Z"),
          stale: false,
          elapsedSeconds: 4,
          videoFrames: 92,
          encodedBytes: 1_900_000,
          droppedFrames: 0,
          publisher: {
            state: "published",
            videoEncoderBackend: "mediacodec-h264",
            audioEncoderBackend: "mediacodec-aac",
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
            status: "screen-only",
            appliedCount: 0,
            skippedCount: 0,
            skippedKinds: [],
            runtimeCompositorBackend: "android-canvas-mediacodec",
            runtimeCompositedFrameCount: 92,
            runtimeDroppedFrameCount: 0,
            runtimeCompositionFailureCount: 0,
            message: "Native screen capture applied"
          },
          audioProcessing: normalizeNativeRuntimeAudioProcessing({
            appAudioPeakLevel: 0.58,
            appAudioSampleCount: 24_576,
            appAudioLevelUpdatedAt: Date.parse("2026-06-23T00:00:04.000Z"),
            mixedAudioSampleCount: 24_576,
            mixedAudioLevelUpdatedAt: Date.parse("2026-06-23T00:00:04.000Z"),
            broadcastAppAudioVolume: 0.85,
            broadcastAppAudioMuted: false,
            ...audioProcessing
          }),
          message: "Live"
        }
      });

    const missing = createSummary({});
    const unstable = createSummary({
      playbackCaptureStatus: "capturing",
      playbackCaptureBackend: "android-audio-playback-capture",
      playbackCaptureSampleRate: 44_100,
      playbackCapturedFrames: 132_300,
      playbackDroppedFrames: 0,
      playbackUnderrunFrames: 7_000,
      playbackBufferedFrames: 0
    });

    expect(missing?.nativeRuntime).toMatchObject({
      status: "warn",
      playbackCaptureStatus: "unavailable",
      playbackCapturedFrames: 0,
      playbackCaptureTelemetryComplete: false
    });
    expect(missing?.nativeRuntime?.recommendation).toContain("at least two seconds");
    expect(unstable?.nativeRuntime).toMatchObject({
      status: "warn",
      playbackCapturedFrames: 132_300,
      playbackUnderrunFrames: 7_000,
      playbackCaptureTelemetryComplete: true
    });
    expect(unstable?.nativeRuntime?.recommendation).toContain("drops, underruns, or excess buffering");
  });

  it("requires iOS ReplayKit native runtime evidence to include compositor frame proof", () => {
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
          videoEncoderBackend: "videotoolbox-h264",
          audioEncoderBackend: "audiotoolbox-aac",
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
          stillImageAssetCount: 0,
          stillImageAssetLoadedCount: 0,
          stillImageAssetMissingCount: 0,
          stillImageAssetMissingKinds: [],
          stillImageAssetDecodedCount: 0,
          stillImageAssetDecodedPixelCount: 0,
          stillImageAssetCompositedCount: 0,
          stillImageAssetCompositedPixelCount: 0,
          message: "Native overlays applied"
        },
        message: "Live"
      }
    });

    expect(summary?.nativeRuntime?.status).toBe("warn");
    expect(summary?.nativeRuntime?.runtimeCompositorBackend).toBe("none");
    expect(summary?.nativeRuntime?.runtimeCompositedFrameCount).toBe(0);
    expect(summary?.nativeRuntime?.recommendation).toContain("iOS ReplayKit validation");
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
          videoEncoderBackend: "videotoolbox-h264",
          audioEncoderBackend: "audiotoolbox-aac",
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
          runtimeCompositorBackend: "ios-replaykit-coregraphics",
          runtimeCompositedFrameCount: 92,
          runtimeDroppedFrameCount: 0,
          runtimeCompositionFailureCount: 0,
          liveRenderGraphReloadCount: 2,
          liveRenderGraphRejectedUpdateCount: 1,
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
    expect(summary?.nativeRuntime?.liveRenderGraphReloadCount).toBe(2);
    expect(summary?.nativeRuntime?.liveRenderGraphRejectedUpdateCount).toBe(1);
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
          videoEncoderBackend: "videotoolbox-h264",
          audioEncoderBackend: "audiotoolbox-aac",
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
          runtimeCompositorBackend: "ios-replaykit-coregraphics",
          runtimeCompositedFrameCount: 92,
          runtimeDroppedFrameCount: 0,
          runtimeCompositionFailureCount: 0,
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
          videoEncoderBackend: "videotoolbox-h264",
          audioEncoderBackend: "audiotoolbox-aac",
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
          runtimeCompositorBackend: "ios-replaykit-coregraphics",
          runtimeCompositedFrameCount: 92,
          runtimeDroppedFrameCount: 0,
          runtimeCompositionFailureCount: 0,
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
          videoEncoderBackend: "videotoolbox-h264",
          audioEncoderBackend: "audiotoolbox-aac",
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

  it("redacts unsafe persisted session summary text during normalization", () => {
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

    const [normalized] = normalizeStreamSessionSummaries([
      {
        ...summary,
        id: "session mobilelivecaster://oauth/youtube?code=sessioncodesecret12345",
        summary: "Failed with Authorization: Bearer summaryBearerToken12345",
        recommendation: "Contact viewer@example.com / 090-1234-5678 / discord.gg/privateRoom",
        health: {
          ...summary.health,
          summary: "Inspect www.example.org/private before release."
        },
        audioLevel: {
          ...summary.audioLevel,
          summary: "Callback mobilelivecaster://oauth/twitch?access_token=audioaccesssecret12345",
          recommendation: "Send logs to viewer@example.com only after redaction."
        },
        nativeRuntime: {
          platform: "android",
          status: "warn",
          runtimeStatus: "live access_token=nativeRuntimeToken12345",
          publisherState: "published",
          videoEncoderBackend: "mediacodec-h264",
          audioEncoderBackend: "mediacodec-aac",
          encoderProbeMessage: "Probe Authorization: Bearer nativeProbeToken12345",
          compositionStatus: "applied",
          compositionAppliedKinds: ["overlay", "www.example.org/native"],
          live2dRuntimeStatuses: ["ready client_secret=live2dClientSecret12345"],
          vrmRuntimeStatuses: ["ready mobilelivecaster://oauth/twitch?code=vrmCodeSecret12345"],
          monitorOutputName: "viewer@example.com",
          controlOwner: "native",
          controllerState: "cooldown",
          lastDecisionReason: `Authorization: Bearer nativeDecisionSecret12345 ${"y".repeat(200)}`,
          summary: "Native callback mobilelivecaster://oauth/twitch?code=nativeCodeSecret12345",
          recommendation: "Open discord.gg/nativeRoom"
        }
      }
    ]);
    const serialized = JSON.stringify(normalized);

    expect(normalized?.id).toContain("[oauth callback redacted]");
    expect(normalized?.summary).toContain("Authorization: Bearer [redacted]");
    expect(normalized?.health.summary).toBe("Inspect [redacted] before release.");
    expect(normalized?.audioLevel.summary).toContain("[oauth callback redacted]");
    expect(normalized?.audioLevel.recommendation).toContain("[email redacted]");
    expect(normalized?.nativeRuntime?.runtimeStatus).toBe("live access_token=[redacted]");
    expect(normalized?.nativeRuntime?.encoderProbeMessage).toContain("Authorization: Bearer [redacted]");
    expect(normalized?.nativeRuntime?.compositionAppliedKinds).toEqual(["overlay", "[redacted]"]);
    expect(normalized?.nativeRuntime?.live2dRuntimeStatuses).toEqual(["ready client_secret=[redacted]"]);
    expect(normalized?.nativeRuntime?.vrmRuntimeStatuses).toEqual(["ready [oauth callback redacted]"]);
    expect(normalized?.nativeRuntime?.monitorOutputName).toBe("[email redacted]");
    expect(normalized?.nativeRuntime?.controlOwner).toBe("native");
    expect(normalized?.nativeRuntime?.controllerState).toBe("cooldown");
    expect(normalized?.nativeRuntime?.lastDecisionReason).toContain("Authorization: Bearer [redacted]");
    expect(normalized?.nativeRuntime?.lastDecisionReason).toHaveLength(160);
    expect(normalized?.nativeRuntime?.summary).toBe("Native callback [oauth callback redacted]");
    expect(normalized?.nativeRuntime?.recommendation).toBe("Open [invite redacted]");
    expect(serialized).not.toContain("sessioncodesecret12345");
    expect(serialized).not.toContain("summaryBearerToken12345");
    expect(serialized).not.toContain("viewer@example.com");
    expect(serialized).not.toContain("090-1234-5678");
    expect(serialized).not.toContain("discord.gg/privateRoom");
    expect(serialized).not.toContain("www.example.org");
    expect(serialized).not.toContain("audioaccesssecret12345");
    expect(serialized).not.toContain("nativeRuntimeToken12345");
    expect(serialized).not.toContain("nativeDecisionSecret12345");
    expect(serialized).not.toContain("nativeProbeToken12345");
    expect(serialized).not.toContain("live2dClientSecret12345");
    expect(serialized).not.toContain("vrmCodeSecret12345");
    expect(serialized).not.toContain("nativeCodeSecret12345");
  });

  it("redacts nested runtime text when rebuilding missing persisted summary text", () => {
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

    const [normalized] = normalizeStreamSessionSummaries([
      {
        ...summary,
        summary: undefined,
        health: {
          ...summary.health,
          summary: "Health Authorization: Bearer healthSummaryToken12345"
        },
        audioLevel: {
          ...summary.audioLevel,
          sampleCount: 1,
          summary: "Audio callback mobilelivecaster://oauth/youtube?code=audioSummaryCode12345"
        },
        nativeRuntime: {
          platform: "ios",
          status: "warn",
          runtimeStatus: "live",
          publisherState: "published",
          videoEncoderBackend: "videotoolbox-h264",
          audioEncoderBackend: "audiotoolbox-aac",
          compositionStatus: "applied",
          summary: "Native Authorization: Bearer nestedRuntimeToken12345",
          recommendation: "Open www.example.org/native"
        }
      }
    ]);

    expect(normalized?.summary).toContain("Health Authorization: Bearer [redacted]");
    expect(normalized?.summary).toContain("Audio callback [oauth callback redacted]");
    expect(normalized?.summary).toContain("Native Authorization: Bearer [redacted]");
    expect(JSON.stringify(normalized)).not.toContain("healthSummaryToken12345");
    expect(JSON.stringify(normalized)).not.toContain("audioSummaryCode12345");
    expect(JSON.stringify(normalized)).not.toContain("nestedRuntimeToken12345");
    expect(JSON.stringify(normalized)).not.toContain("www.example.org");
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
          publisherPublishGeneration: 2.5,
          currentPublishVideoFrames: "120",
          currentPublishAudioFrames: Number.NaN,
          videoEncoderBackend: "mediacodec-h264",
          audioEncoderBackend: "mediacodec-aac",
          encoderProbeStatus: "pass",
          encoderProbeVideoConfigured: true,
          encoderProbeAudioConfigured: false,
          encoderProbeVideoWidth: 1280.5,
          encoderProbeVideoHeight: "720",
          encoderProbeVideoFps: -30,
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
    expect(normalized[0]?.nativeRuntime).toMatchObject({
      publisherState: "published",
      publisherPublishGeneration: 0,
      currentPublishVideoFrames: 0,
      currentPublishAudioFrames: 0,
      encoderProbeStatus: "pass",
      encoderProbeVideoConfigured: true,
      encoderProbeAudioConfigured: false,
      encoderProbeVideoWidth: 0,
      encoderProbeVideoHeight: 0,
      encoderProbeVideoFps: 0,
      controlOwner: "none",
      controllerState: "idle",
      baselineTargetKbps: 0,
      effectiveTargetKbps: 0,
      floorTargetKbps: 0,
      pendingTargetKbps: 0,
      automaticReductionCount: 0,
      automaticRestorationCount: 0,
      publishGeneration: 0,
      cumulativeReconnectCount: 0,
      lastDecisionAt: 0,
      lastDecisionReason: "",
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
      playbackCaptureStatus: "unavailable",
      playbackCaptureBackend: "none",
      playbackCaptureSampleRate: 0,
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

  it("downgrades a persisted passing runtime when native encoder output proof is absent", () => {
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

    const [normalized] = normalizeStreamSessionSummaries([
      {
        ...summary,
        nativeRuntime: {
          platform: "ios",
          status: "pass",
          runtimeStatus: "live",
          publisherState: "published",
          videoEncoderBackend: "videotoolbox-h264",
          audioEncoderBackend: "audiotoolbox-aac",
          compositionStatus: "screen-only",
          issueCount: 0
        }
      }
    ]);

    expect(normalized?.nativeRuntime).toMatchObject({
      status: "warn",
      encoderProbeStatus: "missing",
      encoderProbeVideoConfigured: false,
      encoderProbeAudioConfigured: false,
      encoderProbeVideoWidth: 0,
      encoderProbeVideoHeight: 0,
      encoderProbeVideoFps: 0,
      issueCount: 1
    });
  });
