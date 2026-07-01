import { describe, expect, it } from "vitest";
import type { FaceTrackingDiagnostics } from "./faceTrackingDiagnostics";
import type { NativeCompositionReport } from "./nativeComposition";
import type { NativeRuntimeTelemetry } from "./nativeRuntime";
import { createDefaultStudioProfile } from "./profiles";
import type { ReadinessReport } from "./readiness";
import type { StreamHealthHistorySummary } from "./streamHealthHistory";
import { createStreamSessionHistorySummary } from "./streamSessionSummary";
import { createStreamValidationRunbook, type StreamValidationRunbookInput } from "./streamValidationRunbook";
import { summarizeStreamValidationEvidence, type StreamValidationEvidenceSummary } from "./streamValidationEvidence";

const readiness: ReadinessReport = {
  canStart: true,
  errorCount: 0,
  warningCount: 0,
  issues: [],
  sanitizedProfile: createDefaultStudioProfile()
};

const stableHealth: StreamHealthHistorySummary = {
  sampleCount: 5,
  durationSeconds: 90,
  averageBitrateKbps: 3500,
  minimumBitrateKbps: 3400,
  maximumBitrateKbps: 3600,
  averageFps: 30,
  minimumFps: 30,
  droppedFrameIncrease: 0,
  observedDroppedFrames: 0,
  observedReconnectAttempts: 0,
  stability: "stable",
  summary: "Stream health is stable."
};
const validationNow = new Date("2026-06-23T00:05:00.000Z");

const nativeComposition: NativeCompositionReport = {
  status: "pass",
  coverage: "native-overlays",
  summary: "Native overlays are covered.",
  visibleSourceCount: 2,
  screenSourceCount: 1,
  nativeOverlayCount: 3,
  stillImageOverlayCount: 1,
  textOverlayCount: 1,
  chatOverlayCount: 1,
  previewOnlySourceCount: 0,
  assetIssueCount: 0,
  fileBackedAssetIssueCount: 0,
  avatarSourceCount: 1,
  requiresNativeCompositor: true,
  recommendedNextStep: "Keep native overlays above the screen source.",
  unsupportedSourceKinds: [],
  issues: []
};

const faceTracking: FaceTrackingDiagnostics = {
  status: "pass",
  enabled: true,
  inputMode: "native-camera",
  rigMode: "still-image-2d",
  runtimeStatus: "tracking",
  runtimeAgeMs: 120,
  runtimeFresh: true,
  visibleAvatarCount: 1,
  visiblePngTuberCount: 1,
  visibleLive2DCount: 0,
  visibleVrmCount: 0,
  nativeVrmRendererReady: false,
  preparedPngTuberCount: 1,
  activeMotionCount: 1,
  rigIssueCount: 0,
  rigIssueSummary: "No still-image rig issues.",
  rigQualityScore: 100,
  rigQualityGrade: "ready",
  summary: "Face tracking is ready.",
  recommendation: "Keep this tracker state with validation evidence."
};

const nativeRuntime: NativeRuntimeTelemetry = {
  platform: "ios",
  runtimeStatus: "live",
  updatedAt: Date.now(),
  stale: false,
  elapsedSeconds: 90,
  videoFrames: 2700,
  encodedBytes: 20_000_000,
  droppedFrames: 0,
  publisher: {
    state: "published",
    videoEncoderBackend: "videotoolbox-h264",
    audioEncoderBackend: "audiotoolbox-aac",
    reconnectAttempts: 0,
    sentVideoFrames: 2700,
    sentAudioFrames: 4300,
    droppedVideoFrames: 0,
    droppedAudioFrames: 0,
    bytesWritten: 20_000_000,
    videoFrameIntervalSampleCount: 119,
    videoFrameIntervalAverageMs: 33.3,
    videoFrameIntervalMaxMs: 42,
    videoFrameIntervalJitterMs: 8.7,
    cacheSize: 120,
    itemsInCache: 0,
    congested: false,
    lastError: ""
  },
  composition: {
    status: "applied",
    appliedCount: 2,
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
    runtimeCompositedFrameCount: 2700,
    runtimeDroppedFrameCount: 0,
    runtimeCompositionFailureCount: 0,
    stillImageAssetAppGroupCount: 1,
    stillImageAssetAppGroupLoadedCount: 1,
    stillImageAssetAppGroupDecodedCount: 1,
    stillImageAssetAppGroupDecodedPixelCount: 921_600,
    stillImageAssetAppGroupCompositedCount: 1,
    stillImageAssetAppGroupCompositedPixelCount: 921_600,
    message: "Native overlays applied: 2; image assets 1/1"
  },
  message: "iOS extension live"
};

const evidence = (overrides: Partial<StreamValidationEvidenceSummary> = {}): StreamValidationEvidenceSummary => ({
  ...summarizeStreamValidationEvidence([]),
  ...overrides
});

const readyAudio: StreamValidationRunbookInput["audio"] = {
  micEffectsEnabled: true,
  presetId: "broadcast",
  inputGainDb: 3,
  compression: 0.62,
  monitorEnabled: true,
  monitorVolume: 0.45,
  monitorHeadphonesOnly: true,
  monitorSafety: {
    status: "pass",
    route: "wired-headphones",
    outputName: "Wired headphones",
    headphonesConnected: true,
    checkedAt: "2026-06-23T00:00:00.000Z",
    stale: false,
    summary: "Headphones-only monitoring is routed to Wired headphones.",
    recommendation: "Keep this route connected during the private validation run."
  }
};

const readyChatReadout: StreamValidationRunbookInput["chatReadout"] = {
  platformChatEnabled: true,
  readerEnabled: true,
  connectionPhase: "connected",
  connectionLabel: "Connected",
  connectionMessage: "YouTube Live chat is connected."
};

const input = (overrides: Partial<StreamValidationRunbookInput> = {}): StreamValidationRunbookInput => ({
  readiness,
  target: {
    platform: "YouTube Live",
    protocol: "rtmps",
    secureTransport: true
  },
  telemetry: {
    streamStatus: "idle",
    bitrateKbps: 0,
    fps: 0,
    droppedFrames: 0,
    reconnectAttempts: 0,
    elapsedSeconds: 0
  },
  health: {
    ...stableHealth,
    sampleCount: 0,
    durationSeconds: 0,
    stability: "unknown"
  },
  session: {
    summaryCount: 0,
    historySummary: createStreamSessionHistorySummary([]),
    lastOutcome: null
  },
  nativeRuntime: null,
  nativeComposition,
  faceTracking,
  audio: readyAudio,
  chatReadout: readyChatReadout,
  platformPublishing: {
    status: "info",
    summary: "Dashboard status has not been refreshed.",
    recommendation: "Refresh dashboard status while live."
  },
  evidence: evidence(),
  now: validationNow,
  ...overrides
});

describe("stream validation runbook", () => {
  it("starts in setup when no private run has started", () => {
    const runbook = createStreamValidationRunbook(input());

    expect(runbook.status).toBe("setup");
    expect(runbook.items.find((item) => item.id === "runbook-start-pending")?.status).toBe("pending");
    expect(runbook.nextAction).toContain("physical iOS or Android device");
  });

  it("tracks a live private run until monitor hold, dashboard, stop, and record steps finish", () => {
    const runbook = createStreamValidationRunbook(
      input({
        telemetry: {
          streamStatus: "live",
          bitrateKbps: 3500,
          fps: 30,
          droppedFrames: 0,
          reconnectAttempts: 0,
          elapsedSeconds: 20
        },
        health: {
          ...stableHealth,
          sampleCount: 2,
          durationSeconds: 20
        },
        nativeRuntime
      })
    );

    expect(runbook.status).toBe("running");
    expect(runbook.items.find((item) => item.id === "runbook-monitor-running")?.status).toBe("warn");
    expect(runbook.items.find((item) => item.id === "runbook-native-runtime-ready")?.status).toBe("pass");
  });

  it("warns when headphone self-monitoring can leak through speakers", () => {
    const runbook = createStreamValidationRunbook(
      input({
        audio: {
          ...readyAudio,
          monitorHeadphonesOnly: false
        }
      })
    );

    expect(runbook.items.find((item) => item.id === "runbook-audio-monitor-open")?.status).toBe("warn");
    expect(runbook.nextAction).toContain("headphones-only");
  });

  it("fails when headphones-only monitoring is routed to speakers", () => {
    const runbook = createStreamValidationRunbook(
      input({
        audio: {
          ...readyAudio,
          monitorSafety: {
            status: "fail",
            route: "speaker",
            outputName: "Speaker",
            headphonesConnected: false,
            checkedAt: "2026-06-23T00:00:00.000Z",
            stale: false,
            summary: "Headphones-only monitoring is enabled, but output is routed to Speaker.",
            recommendation: "Connect headphones or turn monitoring off before starting a stream."
          }
        }
      })
    );

    expect(runbook.items.find((item) => item.id === "runbook-audio-route-unsafe")?.status).toBe("fail");
    expect(runbook.nextAction).toContain("Connect headphones");
  });

  it("warns when platform chat readout is not connected", () => {
    const runbook = createStreamValidationRunbook(
      input({
        chatReadout: {
          ...readyChatReadout,
          connectionPhase: "failed",
          connectionLabel: "Failed",
          connectionMessage: "Twitch chat auth expired."
        }
      })
    );

    expect(runbook.items.find((item) => item.id === "runbook-chat-needs-connection")?.status).toBe("warn");
    expect(runbook.nextAction).toContain("Connect YouTube Live or Twitch chat");
  });

  it("blocks when native compositor still-image assets are missing", () => {
    const runbook = createStreamValidationRunbook(
      input({
        telemetry: {
          streamStatus: "live",
          bitrateKbps: 3500,
          fps: 30,
          droppedFrames: 0,
          reconnectAttempts: 0,
          elapsedSeconds: 90
        },
        health: stableHealth,
        nativeRuntime: {
          ...nativeRuntime,
          composition: {
            ...nativeRuntime.composition,
            status: "pending",
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
          }
        }
      })
    );

    expect(runbook.status).toBe("running");
    expect(runbook.items.find((item) => item.id === "runbook-native-runtime-review")?.status).toBe("warn");
    expect(runbook.nextAction).toContain("App Group");
  });

  it("keeps the runbook open until quality stress fallback evidence is retained", () => {
    const runbook = createStreamValidationRunbook(
      input({
        telemetry: {
          streamStatus: "idle",
          bitrateKbps: 0,
          fps: 0,
          droppedFrames: 0,
          reconnectAttempts: 0,
          elapsedSeconds: 0
        },
        health: stableHealth,
        session: {
          summaryCount: 1,
          historySummary: createStreamSessionHistorySummary([]),
          lastOutcome: "clean"
        },
        nativeRuntime,
        platformPublishing: readyPlatformPublishing(),
        evidence: evidence({
          status: "ready",
          totalRuns: 2,
          eligibleRunCount: 2,
          iosPass: true,
          androidPass: true,
          summary: "Fresh physical validation baseline retained for iOS and Android.",
          recommendation: "Keep evidence fresh."
        })
      })
    );

    const item = runbook.items.find((entry) => entry.id === "runbook-quality-stress-missing");

    expect(runbook.status).toBe("record");
    expect(item?.status).toBe("warn");
    expect(item?.action).toContain("controlled weak-network");
  });

  it("blocks when retained quality stress fallback failed", () => {
    const runbook = createStreamValidationRunbook(
      input({
        health: stableHealth,
        session: {
          summaryCount: 1,
          historySummary: createStreamSessionHistorySummary([]),
          lastOutcome: "clean"
        },
        nativeRuntime,
        platformPublishing: readyPlatformPublishing(),
        evidence: evidence({
          status: "ready",
          totalRuns: 2,
          eligibleRunCount: 2,
          iosPass: true,
          androidPass: true,
          qualityAutomationRunCount: 1,
          qualityAutomationFailureCount: 1,
          summary: "Fresh physical validation baseline retained for iOS and Android.",
          recommendation: "Keep evidence fresh."
        })
      })
    );

    const item = runbook.items.find((entry) => entry.id === "runbook-quality-stress-failed");

    expect(runbook.status).toBe("blocked");
    expect(item?.status).toBe("fail");
    expect(item?.action).toContain("Fix native bitrate/FPS update");
  });

  it("completes when clean sessions and retained iOS/Android evidence are ready", () => {
    const runbook = createStreamValidationRunbook(
      input({
        telemetry: {
          streamStatus: "idle",
          bitrateKbps: 0,
          fps: 0,
          droppedFrames: 0,
          reconnectAttempts: 0,
          elapsedSeconds: 0
        },
        health: stableHealth,
        session: {
          summaryCount: 2,
          historySummary: createStreamSessionHistorySummary([]),
          lastOutcome: "clean"
        },
        nativeRuntime,
        platformPublishing: readyPlatformPublishing(),
        evidence: evidence({
          status: "ready",
          totalRuns: 2,
          eligibleRunCount: 2,
          iosPass: true,
          androidPass: true,
          qualityAutomationRunCount: 1,
          qualityAutomationLiveUpdateCount: 1,
          latestQualityAutomation: {
            status: "pass",
            eventCount: 1,
            liveUpdateCount: 1,
            nextTargetCount: 0,
            failureCount: 0,
            summary: "Quality automation retained 1 event: 1 live update, 0 next-start targets, 0 failed.",
            recommendation: "Keep this run as evidence that live bitrate/FPS relief can apply during a stream."
          },
          summary: "Fresh physical validation baseline retained for iOS and Android.",
          recommendation: "Keep evidence fresh."
        })
      })
    );

    expect(runbook.status).toBe("complete");
    expect(runbook.failCount).toBe(0);
    expect(runbook.warningCount).toBe(0);
    expect(runbook.pendingCount).toBe(0);
    expect(runbook.items.find((item) => item.id === "runbook-audio-ready")?.status).toBe("pass");
    expect(runbook.items.find((item) => item.id === "runbook-chat-connected")?.status).toBe("pass");
    expect(runbook.items.find((item) => item.id === "runbook-quality-stress-live-update")?.status).toBe("pass");
  });

  it("keeps the runbook open when passing dashboard status is stale", () => {
    const runbook = createStreamValidationRunbook(
      input({
        telemetry: {
          streamStatus: "idle",
          bitrateKbps: 0,
          fps: 0,
          droppedFrames: 0,
          reconnectAttempts: 0,
          elapsedSeconds: 0
        },
        health: stableHealth,
        session: {
          summaryCount: 2,
          historySummary: createStreamSessionHistorySummary([]),
          lastOutcome: "clean"
        },
        nativeRuntime,
        platformPublishing: readyPlatformPublishing("2026-06-23T00:00:00.000Z"),
        evidence: evidence({
          status: "ready",
          totalRuns: 2,
          eligibleRunCount: 2,
          iosPass: true,
          androidPass: true,
          summary: "Fresh physical validation baseline retained for iOS and Android.",
          recommendation: "Keep evidence fresh."
        }),
        now: new Date("2026-06-23T00:20:00.000Z")
      })
    );

    const item = runbook.items.find((entry) => entry.id === "runbook-dashboard-stale");

    expect(runbook.status).toBe("record");
    expect(item?.status).toBe("warn");
    expect(item?.detail).toContain("20 minutes old");
  });
});

const readyPlatformPublishing = (statusCheckedAt = "2026-06-23T00:04:00.000Z"): StreamValidationRunbookInput["platformPublishing"] => ({
  platform: "youtube-live",
  status: "pass",
  summary: `YouTube dashboard: broadcast live, stream active, health ok, issues 0, checked ${statusCheckedAt}.`,
  recommendation: "Keep the YouTube dashboard health snapshot with this release-candidate validation run.",
  youtube: {
    statusCheckedAt
  },
  twitch: null
});
