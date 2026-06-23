import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile, type StudioProfile } from "./profiles";
import { createReadinessReport } from "./readiness";
import { createDefaultScene, defaultAvatarMotion, updateSource } from "./scene";
import { createStreamDiagnostics } from "./streamDiagnostics";
import { createStreamSessionSummary } from "./streamSessionSummary";
import {
  appendStreamValidationRun,
  createStreamValidationRun,
  formatStreamValidationRunAudioLabel,
  mergeStreamValidationRuns,
  normalizeStreamValidationRuns,
  summarizeStreamValidationEvidence
} from "./streamValidationEvidence";
import { initialStreamState, type StreamHealth } from "./streamState";

const health = (update: Partial<StreamHealth> = {}): StreamHealth => ({
  ...initialStreamState.health,
  ...update
});

const healthSample = (elapsedSeconds: number) => ({
  at: new Date(Date.UTC(2026, 5, 23, 0, 0, elapsedSeconds)).toISOString(),
  status: "live" as const,
  elapsedSeconds,
  bitrateKbps: 3500,
  fps: 30,
  droppedFrames: 0,
  reconnectAttempts: 0
});
const stableMonitorSamples = () => [healthSample(0), healthSample(30), healthSample(65)];
const shortMonitorSamples = () => [healthSample(0), healthSample(10), healthSample(20)];
const nearMinimumMonitorSamples = () => [healthSample(0), healthSample(30), healthSample(59.5)];

const profileWithKey = (streamKey: string): StudioProfile => ({
  ...createDefaultStudioProfile(),
  destination: {
    ...createDefaultStudioProfile().destination,
    streamKey
  }
});
const commercialProfileWithKey = (streamKey: string): StudioProfile => ({
  ...profileWithKey(streamKey),
  micEffects: {
    ...createDefaultStudioProfile().micEffects,
    enabled: true,
    presetId: "broadcast",
    inputGainDb: 3,
    compression: 0.62,
    monitorEnabled: true,
    monitorVolume: 0.45,
    monitorHeadphonesOnly: true
  },
  platformChat: {
    ...createDefaultStudioProfile().platformChat,
    enabled: true,
    platform: "youtube",
    youtubeLiveChatId: "live-chat-1"
  },
  platformPublishing: {
    ...createDefaultStudioProfile().platformPublishing,
    youtubeBroadcastId: "broadcast-1",
    youtubeStreamId: "stream-1",
    youtubeBroadcastStatus: "live",
    youtubeStreamStatus: "active",
    youtubeStreamHealthStatus: "ok",
    youtubeStatusCheckedAt: "2026-06-23T00:00:00.000Z"
  }
});
const headphoneAudioRoute = {
  route: "wired-headphones" as const,
  outputName: "Wired headphones",
  headphonesConnected: true,
  checkedAt: "2026-06-23T00:00:00.000Z",
  stale: false,
  summary: "Wired headphones route is active; headphones connected.",
  recommendation: "Keep headphones connected while self-monitoring is enabled."
};
const connectedChatOptions = {
  chatReader: { enabled: true },
  platformChatConnection: {
    phase: "connected",
    label: "Connected",
    message: "YouTube Live chat is connected."
  },
  audioRoute: headphoneAudioRoute
};
const tunedMonitor = {
  measuredLatencyMs: 92,
  note: "wired monitor baseline clean"
};
const validationNow = new Date("2026-06-23T00:02:00.000Z");
const nativeMonitorRuntime = (platform: "ios" | "android" = "ios") => ({
  platform,
  runtimeStatus: "live",
  updatedAt: Date.parse("2026-06-23T00:00:04.000Z"),
  stale: false,
  elapsedSeconds: 4,
  videoFrames: 120,
  encodedBytes: 2_200_000,
  droppedFrames: 0,
  publisher: {
    state: "published",
    reconnectAttempts: 0,
    sentVideoFrames: 120,
    sentAudioFrames: 190,
    droppedVideoFrames: 0,
    droppedAudioFrames: 0,
    bytesWritten: 2_200_000,
    cacheSize: 120,
    itemsInCache: 0,
    congested: false,
    lastError: ""
  },
  composition: {
    status: "applied" as const,
    appliedCount: 1,
    skippedCount: 0,
    skippedKinds: [],
    stillImageAssetCount: 1,
    stillImageAssetLoadedCount: 1,
    stillImageAssetMissingCount: 0,
    stillImageAssetMissingKinds: [],
    message: "Native overlays applied"
  },
  audioProcessing: {
    micEffectsEnabled: true,
    micEffectsPresetId: "broadcast",
    micEffectsProcessedFrames: 48,
    micEffectsProcessedSamples: 24_576,
    micEffectsGatedSamples: 64,
    micEffectsLimitedSamples: 2,
    monitorEnabled: true,
    monitorRunning: true,
    monitorVolume: 0.45,
    monitorHeadphonesOnly: true,
    monitorRoute: "wired-headphones",
    monitorOutputName: "Wired headphones",
    monitorHeadphonesConnected: true,
    monitorWrittenFrames: 24_576,
    monitorDroppedFrames: 0,
    monitorWrittenBuffers: 48,
    monitorDroppedBuffers: 0,
    monitorEstimatedLatencyMs: 0,
    monitorLatencySource: "",
    monitorLastError: ""
  },
  message: "Live"
});
const nativeMonitorRuntimeWithLatency = (
  platform: "ios" | "android" = "ios",
  latencyMs = 96,
  source = `${platform}-native-monitor-estimate`
) => {
  const runtime = nativeMonitorRuntime(platform);
  return {
    ...runtime,
    audioProcessing: {
      ...runtime.audioProcessing,
      monitorEstimatedLatencyMs: latencyMs,
      monitorLatencySource: source
    }
  };
};

describe("stream validation evidence", () => {
  it("creates a redacted validation run from diagnostics", () => {
    const scene = createDefaultScene();
    const streamKey = "super-secret-key";
    const profile = profileWithKey(streamKey);
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      deviceName: `iPhone ${streamKey}`,
      osVersion: "iOS 18.5",
      appBuild: "rc-1",
      networkProfile: `studio wifi ${streamKey}`,
      result: "warn",
      now: new Date("2026-06-23T00:00:00.000Z"),
      secrets: [streamKey]
    });

    expect(run.id).toContain("validation-20260623000000000-ios");
    expect(run.deviceName).toContain("[redacted]");
    expect(run.networkProfile).toContain("[redacted]");
    expect(JSON.stringify(run)).not.toContain(streamKey);
    expect(run.targetPlatform).toBe("YouTube Live");
    expect(run.checklistStatus).toBe("needs-test");
    expect(run.recommendation).toContain("Enable a mic effect preset");
  });

  it("stores audio and chat readout evidence and downgrades unvalidated passing runs", () => {
    const scene = createDefaultScene();
    const profile = profileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const summary = summarizeStreamValidationEvidence([run], { now: validationNow });

    expect(run.result).toBe("warn");
    expect(run.audio).toMatchObject({
      status: "warn",
      micEffectsEnabled: false,
      monitorEnabled: false,
      monitorHeadphonesOnly: true,
      monitorRouteStatus: "info",
      outputRoute: "unknown"
    });
    expect(run.chatReadout).toMatchObject({
      status: "warn",
      platformChatEnabled: false,
      readerEnabled: false,
      connectionPhase: "disabled"
    });
    expect(run.recommendation).toContain("Enable a mic effect preset");
    expect(summary.audioRunCount).toBe(1);
    expect(summary.audioWarningCount).toBe(1);
    expect(summary.chatReadoutRunCount).toBe(1);
    expect(summary.chatReadoutWarningCount).toBe(1);
    expect(summary.latestAudio?.status).toBe("warn");
    expect(summary.latestChatReadout?.status).toBe("warn");
  });

  it("copies retained audio meter and spoken chat counts into validation evidence", () => {
    const scene = createDefaultScene();
    const profile = commercialProfileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const sessionSummary = createStreamSessionSummary({
      events: [
        {
          id: "chat-speech-spoken",
          at: "2026-06-23T00:00:03.000Z",
          kind: "chat",
          severity: "info",
          title: "Chat speech spoken",
          message: "Chat readout finished speaking a youtube message."
        }
      ],
      healthSamples: [healthSample(1), healthSample(4)],
      audioLevelSamples: [
        { at: "2026-06-23T00:00:02.000Z", level: 0.2, source: "manual" },
        { at: "2026-06-23T00:00:03.000Z", level: 0.8, source: "face-tracking" }
      ],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });
    if (!sessionSummary) {
      throw new Error("Expected session summary.");
    }
    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "idle" },
        health: health(),
        nativeRuntime: nativeMonitorRuntime("ios")
      },
      [],
      [],
      [sessionSummary],
      [],
      null,
      connectedChatOptions
    );

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      audioMonitorTuning: tunedMonitor,
      result: "warn",
      now: new Date("2026-06-23T00:00:00.000Z")
    });

    expect(run.audio).toMatchObject({
      status: "pass",
      monitorRouteStatus: "pass",
      outputRoute: "wired-headphones",
      headphonesConnected: true,
      nativeMonitorReported: true,
      nativeMonitorRunning: true,
      nativeMonitorWrittenFrames: 24576,
      nativeMonitorDroppedFrames: 0,
      nativeMonitorWrittenBuffers: 48,
      nativeMonitorDroppedBuffers: 0,
      monitorLatencyMs: 92,
      monitorLatencyStatus: "pass",
      monitorLatencyBudgetMs: 180,
      monitorLatencySource: "manual",
      bluetoothRoute: false,
      levelSampleCount: 2,
      peakLevel: 0.8,
      activeLevelPercent: 100
    });
    expect(formatStreamValidationRunAudioLabel(run)).toBe(
      "audio pass / broadcast / monitor on / headphones-only yes / route pass Wired headphones / headphones yes / stale no / native monitor running 24576/0 frames Wired headphones / latency 92ms pass/180ms manual / samples 2 / peak 80%"
    );
    expect(run.chatReadout).toMatchObject({
      spokenMessageCount: 1,
      speechFailureCount: 0
    });
    expect(run.audio?.summary).toContain("Audio meter retained 2 sam");
    expect(run.chatReadout?.summary).toContain("Chat speech retained 1 spoken / 0 failed");
  });

  it("requires measured monitor latency before audio evidence can pass", () => {
    const scene = createDefaultScene();
    const profile = commercialProfileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "idle" },
        health: health(),
        nativeRuntime: nativeMonitorRuntime("ios")
      },
      [],
      stableMonitorSamples(),
      [],
      [],
      null,
      connectedChatOptions
    );

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const summary = summarizeStreamValidationEvidence([run], { now: validationNow });

    expect(run.result).toBe("warn");
    expect(run.audio).toMatchObject({
      status: "warn",
      monitorLatencyMs: null,
      monitorLatencyStatus: "warn",
      monitorLatencyBudgetMs: 180,
      monitorLatencySource: "",
      bluetoothRoute: false
    });
    expect(run.audio?.recommendation).toContain("Measure processed mic self-monitor latency");
    expect(summary.audioIosPass).toBe(false);
  });

  it("uses native monitor latency evidence when manual tuning is not entered", () => {
    const scene = createDefaultScene();
    const profile = commercialProfileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "idle" },
        health: health(),
        nativeRuntime: nativeMonitorRuntimeWithLatency("android", 104, "android-audiotrack-buffer")
      },
      [],
      stableMonitorSamples(),
      [],
      [],
      null,
      connectedChatOptions
    );

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "android",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });

    expect(run.audio).toMatchObject({
      status: "pass",
      monitorLatencyMs: 104,
      monitorLatencyStatus: "pass",
      monitorLatencyBudgetMs: 180,
      monitorLatencySource: "android-audiotrack-buffer"
    });
    expect(formatStreamValidationRunAudioLabel(run)).toContain("104ms pass/180ms android-audiotrack-buffer");
  });

  it("fails audio evidence when measured monitor latency is above the release limit", () => {
    const scene = createDefaultScene();
    const profile = commercialProfileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "idle" },
        health: health(),
        nativeRuntime: nativeMonitorRuntime("ios")
      },
      [],
      stableMonitorSamples(),
      [],
      [],
      null,
      connectedChatOptions
    );

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      audioMonitorTuning: {
        measuredLatencyMs: 420,
        note: "noticeable slapback"
      },
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });

    expect(run.result).toBe("fail");
    expect(run.audio).toMatchObject({
      status: "fail",
      monitorLatencyMs: 420,
      monitorLatencyStatus: "fail",
      monitorLatencyBudgetMs: 180,
      monitorLatencySource: "manual",
      monitorTuningNote: "noticeable slapback"
    });
    expect(run.audio?.recommendation).toContain("Reduce monitor buffer size");
  });

  it("requires native self-monitor write and drop proof for audio evidence to pass", () => {
    const scene = createDefaultScene();
    const profile = commercialProfileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "idle" },
        health: health()
      },
      [],
      stableMonitorSamples(),
      [],
      [],
      null,
      connectedChatOptions
    );

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      audioMonitorTuning: tunedMonitor,
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const summary = summarizeStreamValidationEvidence([run], { now: validationNow });

    expect(run.result).toBe("warn");
    expect(run.audio).toMatchObject({
      status: "warn",
      nativeMonitorReported: false,
      nativeMonitorWrittenFrames: 0,
      nativeMonitorDroppedFrames: 0
    });
    expect(run.audio?.recommendation).toContain("native self-monitoring reports written frames");
    expect(summary.audioReadyCount).toBe(0);
    expect(summary.audioWarningCount).toBe(1);
    expect(summary.audioIosPass).toBe(false);
  });

  it("requires a stable monitor hold before validation runs can pass", () => {
    const scene = createDefaultScene();
    const profile = commercialProfileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "idle" },
        health: health(),
        nativeRuntime: nativeMonitorRuntime("ios")
      },
      [],
      [],
      [],
      [],
      null,
      connectedChatOptions
    );

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      audioMonitorTuning: tunedMonitor,
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const summary = summarizeStreamValidationEvidence([run], { now: validationNow });

    expect(run.result).toBe("warn");
    expect(run.monitorHold).toMatchObject({
      status: "warn",
      sampleCount: 0,
      durationSeconds: 0,
      stability: "unknown"
    });
    expect(run.recommendation).toContain("60s and 3 samples");
    expect(summary.monitorHoldRunCount).toBe(1);
    expect(summary.monitorHoldReadyCount).toBe(0);
    expect(summary.monitorHoldWarningCount).toBe(1);
    expect(summary.monitorHoldIosPass).toBe(false);
  });

  it("does not round a short monitor hold up to the release threshold", () => {
    const scene = createDefaultScene();
    const profile = commercialProfileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "idle" },
        health: health(),
        nativeRuntime: nativeMonitorRuntime("ios")
      },
      [],
      nearMinimumMonitorSamples(),
      [],
      [],
      null,
      connectedChatOptions
    );

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      audioMonitorTuning: tunedMonitor,
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });

    expect(run.result).toBe("warn");
    expect(run.monitorHold).toMatchObject({
      status: "warn",
      sampleCount: 3,
      durationSeconds: 59,
      stability: "stable"
    });
    expect(run.recommendation).toContain("60s and 3 samples");
  });

  it("does not reuse an older completed stable hold when current validation history is short", () => {
    const scene = createDefaultScene();
    const profile = commercialProfileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const retainedSession = createStreamSessionSummary({
      events: [],
      healthSamples: stableMonitorSamples(),
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:01:05.000Z"),
      nativeRuntime: nativeMonitorRuntime("ios")
    });
    if (!retainedSession) {
      throw new Error("Expected retained session.");
    }
    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "idle" },
        health: health(),
        nativeRuntime: nativeMonitorRuntime("ios")
      },
      [],
      shortMonitorSamples(),
      [retainedSession],
      [],
      null,
      connectedChatOptions
    );

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "pass",
      now: new Date("2026-06-23T00:02:00.000Z")
    });

    expect(run.result).toBe("warn");
    expect(run.monitorHold).toMatchObject({
      status: "warn",
      sampleCount: 3,
      durationSeconds: 20
    });
    expect(run.summary).toContain("20s / 3 samples");
  });

  it("requires native publisher and compositor proof for validation runs to pass", () => {
    const scene = createDefaultScene();
    const profile = commercialProfileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const runtime = nativeMonitorRuntime("ios");
    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "idle" },
        health: health(),
        nativeRuntime: {
          ...runtime,
          publisher: {
            ...runtime.publisher,
            sentVideoFrames: 0,
            sentAudioFrames: 0,
            bytesWritten: 0
          }
        }
      },
      [],
      stableMonitorSamples(),
      [],
      [],
      null,
      connectedChatOptions
    );

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      audioMonitorTuning: tunedMonitor,
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const summary = summarizeStreamValidationEvidence([run], { now: validationNow });

    expect(run.result).toBe("warn");
    expect(run.nativeRuntime).toMatchObject({
      status: "pass",
      sentVideoFrames: 0,
      sentAudioFrames: 0,
      bytesWritten: 0,
      compositionStatus: "applied",
      stillImageAssetLoadedCount: 1,
      stillImageAssetMissingCount: 0
    });
    expect(run.audio?.status).toBe("pass");
    expect(run.chatReadout?.status).toBe("pass");
    expect(run.recommendation).toContain("native publisher/compositor telemetry");
    expect(summary.nativeRuntimeRunCount).toBe(1);
    expect(summary.nativeRuntimeReadyCount).toBe(0);
    expect(summary.nativeRuntimeIosPass).toBe(false);
  });

  it("requires native runtime proof to match the validation device platform", () => {
    const scene = createDefaultScene();
    const profile = commercialProfileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "idle" },
        health: health(),
        nativeRuntime: nativeMonitorRuntime("android")
      },
      [],
      stableMonitorSamples(),
      [],
      [],
      null,
      connectedChatOptions
    );

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      audioMonitorTuning: tunedMonitor,
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const summary = summarizeStreamValidationEvidence([run], { now: validationNow });

    expect(run.result).toBe("warn");
    expect(run.nativeRuntime).toMatchObject({
      platform: "android",
      status: "pass",
      sentVideoFrames: 120,
      sentAudioFrames: 190,
      bytesWritten: 2_200_000
    });
    expect(run.recommendation).toContain("matching this validation device");
    expect(summary.nativeRuntimeRunCount).toBe(1);
    expect(summary.nativeRuntimeReadyCount).toBe(0);
    expect(summary.nativeRuntimeIosPass).toBe(false);
  });

  it("copies retained quality automation outcomes into validation evidence", () => {
    const scene = createDefaultScene();
    const profile = commercialProfileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const sessionSummary = createStreamSessionSummary({
      events: [
        {
          id: "quality-live-update",
          at: "2026-06-23T00:00:03.000Z",
          kind: "quality",
          severity: "warn",
          title: "Live quality target lowered",
          message: "Live encoder target will use Balanced."
        }
      ],
      healthSamples: [healthSample(1), healthSample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });
    if (!sessionSummary) {
      throw new Error("Expected session summary.");
    }
    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "idle" },
        health: health()
      },
      [],
      [],
      [sessionSummary],
      [],
      null,
      connectedChatOptions
    );

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "android",
      result: "warn",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const summary = summarizeStreamValidationEvidence([run], { now: validationNow });

    expect(run.qualityAutomation).toMatchObject({
      status: "pass",
      eventCount: 1,
      liveUpdateCount: 1,
      nextTargetCount: 0,
      failureCount: 0
    });
    expect(run.summary).toContain("Quality automation retained 1 event");
    expect(summary.qualityAutomationRunCount).toBe(1);
    expect(summary.qualityAutomationLiveUpdateCount).toBe(1);
    expect(summary.qualityAutomationFailureCount).toBe(0);
    expect(summary.latestQualityAutomation?.status).toBe("pass");
  });

  it("stores safe native runtime evidence and downgrades passing runs that need review", () => {
    const scene = createDefaultScene();
    const streamKey = "validation-key";
    const profile = profileWithKey(streamKey);
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({ bitrateKbps: 3500, fps: 30, message: `Publishing ${streamKey}` }),
      nativeRuntime: {
        platform: "android" as const,
        runtimeStatus: "live",
        updatedAt: Date.parse("2026-06-23T00:00:05.000Z"),
        stale: false,
        elapsedSeconds: 5,
        videoFrames: 144,
        encodedBytes: 2_200_000,
        droppedFrames: 1,
        publisher: {
          state: "published",
          reconnectAttempts: 0,
          sentVideoFrames: 144,
          sentAudioFrames: 240,
          droppedVideoFrames: 1,
          droppedAudioFrames: 0,
          bytesWritten: 2_200_000,
          cacheSize: 120,
          itemsInCache: 64,
          congested: true,
          lastError: ""
        },
        composition: {
          status: "applied" as const,
          appliedCount: 1,
          skippedCount: 0,
          skippedKinds: [],
          message: `Native screen capture ready ${streamKey}`
        },
        message: `Publishing ${streamKey}`
      }
    });

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "android",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z"),
      secrets: [streamKey]
    });
    const summary = summarizeStreamValidationEvidence([run], { now: validationNow });

    expect(run.result).toBe("warn");
    expect(run.nativeRuntime).toMatchObject({
      platform: "android",
      status: "warn",
      publisherState: "published",
      congested: true,
      queuedItems: 64,
      cacheSize: 120
    });
    expect(JSON.stringify(run)).not.toContain(streamKey);
    expect(JSON.stringify(run)).not.toContain("Native screen capture ready");
    expect(summary.nativeRuntimeRunCount).toBe(1);
    expect(summary.nativeRuntimeWarningCount).toBe(1);
    expect(summary.nativeRuntimeFailureCount).toBe(0);
    expect(summary.latestNativeRuntime?.status).toBe("warn");
  });

  it("does not count disabled face tracking snapshots as retained avatar motion evidence", () => {
    const scene = createDefaultScene();
    const profile = profileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const summary = summarizeStreamValidationEvidence([run], { now: validationNow });

    expect(run.faceTracking?.status).toBe("info");
    expect(summary.faceTrackingRunCount).toBe(0);
    expect(summary.faceTrackingReadyCount).toBe(0);
    expect(summary.faceTrackingWarningCount).toBe(0);
    expect(summary.latestFaceTracking).toBeNull();
  });

  it("stores platform dashboard evidence and downgrades unhealthy passing runs", () => {
    const scene = createDefaultScene();
    const profile = {
      ...commercialProfileWithKey("validation-key"),
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        youtubeBroadcastId: "broadcast-1",
        youtubeStreamId: "stream-1",
        youtubeBroadcastStatus: "testing",
        youtubeStreamStatus: "active",
        youtubeStreamHealthStatus: "ok",
        youtubeStreamHealthIssues: ["warning: bitrateLow: Video output low"]
      }
    };
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({ bitrateKbps: 3500, fps: 30 })
    });

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const summary = summarizeStreamValidationEvidence([run], { now: validationNow });

    expect(run.result).toBe("warn");
    expect(run.platformPublishing).toMatchObject({
      platform: "youtube-live",
      status: "warn",
      youtube: {
        hasBroadcastId: true,
        hasStreamId: true,
        broadcastStatus: "testing",
        streamStatus: "active",
        healthStatus: "ok",
        healthIssueCount: 1
      }
    });
    expect(run.summary).toContain("YouTube dashboard");
    expect(summary.platformPublishingRunCount).toBe(1);
    expect(summary.platformPublishingWarningCount).toBe(1);
    expect(summary.platformPublishingFailureCount).toBe(0);
    expect(summary.latestPlatformPublishing?.status).toBe("warn");
  });

  it("requires fresh platform dashboard evidence before a validation run can pass", () => {
    const scene = updateSource(createDefaultScene(), "source-avatar", (source) =>
      source.kind === "pngtuber"
        ? {
            ...source,
            imageUri: "file:///shared/avatar.png",
            motion: defaultAvatarMotion({ confidence: 0.9, headYaw: 0.08 })
          }
        : source
    );
    const profile = {
      ...commercialProfileWithKey("validation-key"),
      faceTracking: {
        ...createDefaultStudioProfile().faceTracking,
        enabled: true,
        inputMode: "native-camera" as const,
        rigMode: "still-image-2d" as const
      },
      platformPublishing: createDefaultStudioProfile().platformPublishing
    };
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "live" },
        health: health({ bitrateKbps: 3500, fps: 30 }),
        nativeRuntime: nativeMonitorRuntime("ios")
      },
      [],
      stableMonitorSamples(),
      [],
      [],
      {
        status: "tracking",
        yaw: 0.1,
        pitch: 0,
        roll: 0,
        mouthOpen: 0.4,
        blink: 0,
        smile: 0.2,
        browRaise: 0.1,
        confidence: 0.92,
        expression: "neutral",
        lastFrameAt: Date.parse("2026-06-23T00:00:00.000Z")
      },
      connectedChatOptions
    );

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const summary = summarizeStreamValidationEvidence([run], { now: validationNow });

    expect(run.result).toBe("warn");
    expect(run.platformPublishing?.status).toBe("info");
    expect(run.platformPublishingFreshness).toMatchObject({
      status: "missing",
      platformLabel: "YouTube"
    });
    expect(run.recommendation).toContain("Refresh YouTube status");
    expect(summary.platformPublishingRunCount).toBe(0);
    expect(summary.platformPublishingReadyCount).toBe(0);
    expect(summary.platformPublishingFreshnessWarningCount).toBe(1);
    expect(summary.platformPublishingIosPass).toBe(false);
    expect(summary.latestPlatformPublishing).toBeNull();
    expect(summary.latestPlatformPublishingFreshness?.status).toBe("missing");
  });

  it("stores face tracking evidence and downgrades unready avatar validation", () => {
    const scene = createDefaultScene();
    const profile = {
      ...commercialProfileWithKey("validation-key"),
      faceTracking: {
        ...createDefaultStudioProfile().faceTracking,
        enabled: true,
        inputMode: "native-camera" as const,
        rigMode: "still-image-2d" as const
      }
    };
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({ bitrateKbps: 3500, fps: 30 })
    });

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const summary = summarizeStreamValidationEvidence([run], { now: validationNow });

    expect(run.result).toBe("warn");
    expect(run.faceTracking).toMatchObject({
      status: "warn",
      enabled: true,
      inputMode: "native-camera",
      rigMode: "still-image-2d",
      runtimeStatus: "unavailable",
      visibleAvatarCount: 1,
      preparedPngTuberCount: 0
    });
    expect(run.summary).toContain("Face tracking is enabled");
    expect(run.recommendation).toContain("Pick and prepare");
    expect(summary.faceTrackingRunCount).toBe(1);
    expect(summary.faceTrackingWarningCount).toBe(1);
    expect(summary.faceTrackingReadyCount).toBe(0);
    expect(summary.latestFaceTracking?.status).toBe("warn");
  });

  it("tracks iOS and Android face tracking coverage from retained passing runs", () => {
    const scene = updateSource(createDefaultScene(), "source-avatar", (source) =>
      source.kind === "pngtuber"
        ? {
            ...source,
            imageUri: "file:///shared/avatar.png",
            motion: defaultAvatarMotion({ confidence: 0.9, headYaw: 0.12 })
          }
        : source
    );
    const profile = {
      ...commercialProfileWithKey("validation-key"),
      faceTracking: {
        ...createDefaultStudioProfile().faceTracking,
        enabled: true,
        inputMode: "native-camera" as const,
        rigMode: "still-image-2d" as const
      }
    };
    const readiness = createReadinessReport(scene, profile);
    const faceTrackingRuntime = {
      status: "tracking" as const,
      yaw: 0.1,
      pitch: 0,
      roll: 0,
      mouthOpen: 0.4,
      blink: 0,
      smile: 0.2,
      browRaise: 0.1,
      confidence: 0.92,
      expression: "neutral" as const,
      lastFrameAt: Date.parse("2026-06-23T00:00:00.000Z")
    };
    const diagnosticsFor = (platform: "ios" | "android") => createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "live" },
        health: health({ bitrateKbps: 3500, fps: 30 }),
        nativeRuntime: nativeMonitorRuntime(platform)
      },
      [],
      stableMonitorSamples(),
      [],
      [],
      faceTrackingRuntime,
      connectedChatOptions
    );
    const iosRun = createStreamValidationRun({
      diagnostics: diagnosticsFor("ios"),
      devicePlatform: "ios",
      audioMonitorTuning: tunedMonitor,
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const androidRun = createStreamValidationRun({
      diagnostics: diagnosticsFor("android"),
      devicePlatform: "android",
      audioMonitorTuning: tunedMonitor,
      result: "pass",
      now: new Date("2026-06-23T00:01:00.000Z")
    });

    const summary = summarizeStreamValidationEvidence([androidRun, iosRun], { now: validationNow });

    expect(iosRun.faceTracking?.status).toBe("pass");
    expect(androidRun.faceTracking?.status).toBe("pass");
    expect(summary.faceTrackingIosPass).toBe(true);
    expect(summary.faceTrackingAndroidPass).toBe(true);
    expect(summary.faceTrackingReadyCount).toBe(2);
    expect(summary.latestFaceTracking?.runtimeStatus).toBe("tracking");
    expect(summary.audioIosPass).toBe(true);
    expect(summary.audioAndroidPass).toBe(true);
    expect(summary.chatReadoutIosPass).toBe(true);
    expect(summary.chatReadoutAndroidPass).toBe(true);
    expect(summary.platformPublishingReadyCount).toBe(2);
    expect(summary.platformPublishingFreshCount).toBe(2);
    expect(summary.platformPublishingIosPass).toBe(true);
    expect(summary.platformPublishingAndroidPass).toBe(true);
    expect(summary.status).toBe("ready");
  });

  it("does not treat retained face tracking pass as avatar evidence when motion count is zero", () => {
    const scene = createDefaultScene();
    const profile = profileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const iosBaseRun = createStreamValidationRun({
      diagnostics: createStreamDiagnostics(scene, profile, readiness, {
        state: { status: "idle" },
        health: health(),
        nativeRuntime: nativeMonitorRuntime("ios")
      }, [], stableMonitorSamples()),
      devicePlatform: "ios",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const androidBaseRun = createStreamValidationRun({
      diagnostics: createStreamDiagnostics(scene, profile, readiness, {
        state: { status: "idle" },
        health: health(),
        nativeRuntime: nativeMonitorRuntime("android")
      }, [], stableMonitorSamples()),
      devicePlatform: "android",
      result: "pass",
      now: new Date("2026-06-23T00:01:00.000Z")
    });
    const iosRun = {
      ...iosBaseRun,
      result: "pass" as const,
      faceTracking: {
        status: "pass" as const,
        enabled: true,
        inputMode: "native-camera" as const,
        rigMode: "still-image-2d" as const,
        runtimeStatus: "tracking" as const,
        visibleAvatarCount: 1,
        preparedPngTuberCount: 1,
        activeMotionCount: 0,
        summary: "Legacy pass retained without motion count.",
        recommendation: "Repeat validation."
      }
    };
    const androidRun = {
      ...androidBaseRun,
      result: "pass" as const,
      faceTracking: iosRun.faceTracking
    };

    const summary = summarizeStreamValidationEvidence([androidRun, iosRun], { now: validationNow });

    expect(summary.faceTrackingReadyCount).toBe(2);
    expect(summary.faceTrackingIosPass).toBe(false);
    expect(summary.faceTrackingAndroidPass).toBe(false);
    expect(summary.status).toBe("partial");
    expect(summary.summary).toContain("avatar-motion evidence is incomplete");
  });

  it("fails validation runs when the native publisher reports a failure", () => {
    const scene = createDefaultScene();
    const profile = profileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({ bitrateKbps: 3500, fps: 30 }),
      nativeRuntime: {
        platform: "ios" as const,
        runtimeStatus: "failed",
        updatedAt: Date.parse("2026-06-23T00:00:05.000Z"),
        stale: false,
        elapsedSeconds: 5,
        videoFrames: 48,
        encodedBytes: 500_000,
        droppedFrames: 0,
        publisher: {
          state: "failed",
          reconnectAttempts: 2,
          sentVideoFrames: 48,
          sentAudioFrames: 90,
          droppedVideoFrames: 0,
          droppedAudioFrames: 1,
          bytesWritten: 500_000,
          cacheSize: 120,
          itemsInCache: 0,
          congested: false,
          lastError: "socket reset while publishing"
        },
        composition: {
          status: "applied" as const,
          appliedCount: 1,
          skippedCount: 0,
          skippedKinds: [],
          message: "Native compositor was ready"
        },
        message: "Publisher failed"
      }
    });

    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });

    expect(run.result).toBe("fail");
    expect(run.nativeRuntime?.status).toBe("fail");
    expect(run.recommendation).toContain("native runtime");
    expect(JSON.stringify(run)).not.toContain("socket reset");
  });

  it("normalizes, deduplicates, and retains newest validation runs first", () => {
    const scene = createDefaultScene();
    const profile = profileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });
    const firstRun = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "warn",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const secondRun = createStreamValidationRun({
      diagnostics,
      devicePlatform: "android",
      result: "pass",
      now: new Date("2026-06-23T00:01:00.000Z")
    });

    const runs = appendStreamValidationRun(appendStreamValidationRun([firstRun], secondRun), secondRun);

    expect(runs.map((run) => run.id)).toEqual([secondRun.id, firstRun.id]);
    expect(mergeStreamValidationRuns([secondRun], [secondRun, firstRun]).map((run) => run.id)).toEqual([secondRun.id, firstRun.id]);
    expect(normalizeStreamValidationRuns([{ ...firstRun, devicePlatform: "windows" }, secondRun]).map((run) => run.id)).toEqual([
      secondRun.id
    ]);
  });

  it("summarizes physical platform coverage for release-candidate evidence", () => {
    const scene = createDefaultScene();
    const profile = commercialProfileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnosticsFor = (platform: "ios" | "android") => createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "idle" },
        health: health(),
        nativeRuntime: nativeMonitorRuntime(platform)
      },
      [],
      stableMonitorSamples(),
      [],
      [],
      null,
      connectedChatOptions
    );
    const iosRun = createStreamValidationRun({
      diagnostics: diagnosticsFor("ios"),
      devicePlatform: "ios",
      audioMonitorTuning: tunedMonitor,
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const androidRun = createStreamValidationRun({
      diagnostics: diagnosticsFor("android"),
      devicePlatform: "android",
      audioMonitorTuning: tunedMonitor,
      result: "pass",
      now: new Date("2026-06-23T00:01:00.000Z")
    });

    const partial = summarizeStreamValidationEvidence([iosRun], { now: validationNow });
    const ready = summarizeStreamValidationEvidence([androidRun, iosRun], { now: validationNow });

    expect(partial.status).toBe("partial");
    expect(partial.iosPass).toBe(true);
    expect(partial.androidPass).toBe(false);
    expect(ready.status).toBe("partial");
    expect(ready.eligibleRunCount).toBe(2);
    expect(ready.staleRunCount).toBe(0);
    expect(ready.consistentAppBuild).toBe("-");
    expect(ready.summary).toContain("avatar-motion evidence is incomplete");
    expect(ready.recommendation).toContain("native camera tracking");
    expect(ready.passedTargetPlatforms).toEqual(["YouTube Live"]);
  });

  it("does not keep target platform passing after a newer failed run", () => {
    const scene = createDefaultScene();
    const profile = profileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });
    const passedRun = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const failedRun = createStreamValidationRun({
      diagnostics,
      devicePlatform: "ios",
      result: "fail",
      now: new Date("2026-06-23T00:01:00.000Z")
    });

    const summary = summarizeStreamValidationEvidence([passedRun, failedRun], { now: validationNow });

    expect(summary.status).toBe("failing");
    expect(summary.passedTargetPlatforms).toEqual([]);
    expect(summary.latestRun?.result).toBe("fail");
  });

  it("requires fresh evidence on the same app build before becoming ready", () => {
    const scene = createDefaultScene();
    const profile = commercialProfileWithKey("validation-key");
    const readiness = createReadinessReport(scene, profile);
    const diagnosticsFor = (platform: "ios" | "android") => createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "idle" },
        health: health(),
        nativeRuntime: nativeMonitorRuntime(platform)
      },
      [],
      stableMonitorSamples(),
      [],
      [],
      null,
      connectedChatOptions
    );
    const iosRun = createStreamValidationRun({
      diagnostics: diagnosticsFor("ios"),
      devicePlatform: "ios",
      appBuild: "rc-1",
      audioMonitorTuning: tunedMonitor,
      result: "pass",
      now: new Date("2026-06-23T00:00:00.000Z")
    });
    const androidRun = createStreamValidationRun({
      diagnostics: diagnosticsFor("android"),
      devicePlatform: "android",
      appBuild: "rc-2",
      audioMonitorTuning: tunedMonitor,
      result: "pass",
      now: new Date("2026-06-23T00:01:00.000Z")
    });
    const matchingAndroidRun = createStreamValidationRun({
      diagnostics: diagnosticsFor("android"),
      devicePlatform: "android",
      appBuild: "rc-1",
      audioMonitorTuning: tunedMonitor,
      result: "pass",
      now: new Date("2026-06-23T00:01:30.000Z")
    });
    const stale = summarizeStreamValidationEvidence([matchingAndroidRun, iosRun], {
      now: new Date("2026-07-23T00:00:00.000Z"),
      maxAgeDays: 14
    });
    const mismatch = summarizeStreamValidationEvidence([androidRun, iosRun], { now: validationNow });
    const ready = summarizeStreamValidationEvidence([matchingAndroidRun, iosRun], { now: validationNow });

    expect(mismatch.status).toBe("partial");
    expect(mismatch.appBuildMismatch).toBe(true);
    expect(mismatch.summary).toContain("app builds do not match");
    expect(ready.status).toBe("partial");
    expect(ready.consistentAppBuild).toBe("rc-1");
    expect(ready.summary).toContain("avatar-motion evidence is incomplete");
    expect(stale.status).toBe("stale");
    expect(stale.eligibleRunCount).toBe(0);
    expect(stale.staleRunCount).toBe(2);
  });
});
