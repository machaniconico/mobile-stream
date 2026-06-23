import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile } from "./profiles";
import { createReadinessReport } from "./readiness";
import { createDefaultScene, setVisibility, type SceneDocument } from "./scene";
import type { StreamHealthHistorySummary } from "./streamHealthHistory";
import {
  createStreamSessionHistorySummary,
  type StreamSessionSummary
} from "./streamSessionSummary";
import {
  createStreamValidationChecklist,
  type StreamValidationChecklistInput
} from "./streamValidationChecklist";
import { summarizeStreamValidationEvidence, type StreamValidationEvidenceSummary } from "./streamValidationEvidence";

const stableHealth: StreamHealthHistorySummary = {
  sampleCount: 5,
  durationSeconds: 300,
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

const cleanSession = (id: number): StreamSessionSummary => ({
  id: `session-${id}`,
  startedAt: `2026-06-23T00:0${id}:00.000Z`,
  endedAt: `2026-06-23T00:0${id}:30.000Z`,
  endReason: "stopped",
  outcome: "clean",
  durationSeconds: 300,
  eventCount: 0,
  warningCount: 0,
  failureCount: 0,
  recoveryEventCount: 0,
  operationFailureCount: 0,
  chatEventCount: 0,
  chatReconnectEventCount: 0,
  chatReconnectFailureCount: 0,
  health: stableHealth,
  nativeRuntime: null,
  summary: "Clean session. Stream health is stable.",
  recommendation: "Keep this profile as a known-good baseline for the destination."
});

const createScreenOnlyScene = (): SceneDocument =>
  createDefaultScene().sources
    .filter((source) => source.kind !== "screen")
    .reduce((scene, source) => setVisibility(scene, source.id, false), createDefaultScene());

const defaultInput = (streamKey = "validation-demo"): StreamValidationChecklistInput => {
  const scene = createScreenOnlyScene();
  const profile = {
    ...createDefaultStudioProfile(),
    destination: {
      ...createDefaultStudioProfile().destination,
      streamKey
    }
  };
  const readiness = createReadinessReport(scene, profile);

  return {
    readiness,
    diagnosticStatus: readiness.canStart ? "pass" : "fail",
    target: {
      platform: "YouTube Live",
      protocol: profile.destination.protocol,
      secureTransport: profile.destination.protocol === "rtmps"
    },
    telemetry: {
      streamStatus: "idle",
      bitrateKbps: 0,
      fps: 0,
      droppedFrames: 0,
      reconnectAttempts: 0
    },
    health: {
      sampleCount: 0,
      stability: "unknown"
    },
    session: {
      eventCount: 0,
      summaryCount: 0,
      historySummary: createStreamSessionHistorySummary([]),
      lastOutcome: null
    },
    evidence: summarizeStreamValidationEvidence([])
  };
};

describe("stream validation checklist", () => {
  it("blocks commercial validation when launch preflight has blockers", () => {
    const checklist = createStreamValidationChecklist(defaultInput(""));

    expect(checklist.status).toBe("blocked");
    expect(checklist.failCount).toBeGreaterThan(0);
    expect(checklist.items.find((item) => item.id === "readiness-blocks")?.status).toBe("fail");
    expect(checklist.recommendedNextStep).toContain("Paste the full stream key");
  });

  it("keeps a valid setup in needs-test until live and session evidence exists", () => {
    const checklist = createStreamValidationChecklist(defaultInput());

    expect(checklist.status).toBe("needs-test");
    expect(checklist.pendingCount).toBeGreaterThan(0);
    expect(checklist.summary).toContain("before public launch");
    expect(checklist.items.find((item) => item.id === "ingest-not-run")?.status).toBe("pending");
  });

  it("stays in needs-test when live telemetry is clean but physical validation evidence is missing", () => {
    const sessions = [cleanSession(1), cleanSession(2), cleanSession(3)];
    const input = defaultInput();
    const checklist = createStreamValidationChecklist({
      ...input,
      telemetry: {
        streamStatus: "live",
        bitrateKbps: 3500,
        fps: 30,
        droppedFrames: 0,
        reconnectAttempts: 0
      },
      health: {
        sampleCount: 5,
        stability: "stable"
      },
      session: {
        eventCount: 0,
        summaryCount: sessions.length,
        historySummary: createStreamSessionHistorySummary(sessions),
        lastOutcome: "clean"
      }
    });

    expect(checklist.status).toBe("needs-test");
    expect(checklist.items.find((item) => item.id === "device-session-baseline-only")?.status).toBe("warn");
  });

  it("passes when live telemetry, a clean baseline, and iOS/Android validation evidence are available", () => {
    const sessions = [cleanSession(1), cleanSession(2), cleanSession(3)];
    const input = defaultInput();
    const checklist = createStreamValidationChecklist({
      ...input,
      telemetry: {
        streamStatus: "live",
        bitrateKbps: 3500,
        fps: 30,
        droppedFrames: 0,
        reconnectAttempts: 0
      },
      health: {
        sampleCount: 5,
        stability: "stable"
      },
      session: {
        eventCount: 0,
        summaryCount: sessions.length,
        historySummary: createStreamSessionHistorySummary(sessions),
        lastOutcome: "clean"
      },
      evidence: readyEvidence()
    });

    expect(checklist.status).toBe("ready");
    expect(checklist.failCount).toBe(0);
    expect(checklist.warningCount).toBe(0);
    expect(checklist.pendingCount).toBe(0);
    expect(checklist.passCount).toBe(checklist.items.length);
  });

  it("includes VTuber avatar motion when face tracking diagnostics are provided", () => {
    const checklist = createStreamValidationChecklist({
      ...defaultInput(),
      faceTracking: {
        status: "warn",
        enabled: true,
        inputMode: "simulated",
        rigMode: "still-image-2d",
        runtimeStatus: "unavailable",
        visibleAvatarCount: 1,
        visiblePngTuberCount: 1,
        visibleLive2DCount: 0,
        preparedPngTuberCount: 0,
        activeMotionCount: 0,
        summary: "Face tracking is using simulated input.",
        recommendation: "Switch to native camera input before validation."
      }
    });

    const item = checklist.items.find((entry) => entry.id === "avatar-motion-needs-review");

    expect(item?.area).toBe("avatar");
    expect(item?.status).toBe("warn");
    expect(item?.action).toContain("native camera");
  });

  it("keeps VTuber motion in needs-test until retained avatar evidence covers iOS and Android", () => {
    const checklist = createStreamValidationChecklist({
      ...defaultInput(),
      evidence: readyEvidence(),
      faceTracking: readyFaceTracking()
    });

    const item = checklist.items.find((entry) => entry.id === "avatar-motion-evidence-missing");

    expect(checklist.status).toBe("needs-test");
    expect(item?.area).toBe("avatar");
    expect(item?.status).toBe("warn");
    expect(item?.detail).toContain("iOS missing / Android missing");
  });

  it("passes VTuber motion when current tracking and retained iOS/Android avatar evidence are ready", () => {
    const checklist = createStreamValidationChecklist({
      ...defaultInput(),
      telemetry: {
        streamStatus: "live",
        bitrateKbps: 3500,
        fps: 30,
        droppedFrames: 0,
        reconnectAttempts: 0
      },
      health: {
        sampleCount: 5,
        stability: "stable"
      },
      session: {
        eventCount: 0,
        summaryCount: 3,
        historySummary: createStreamSessionHistorySummary([cleanSession(1), cleanSession(2), cleanSession(3)]),
        lastOutcome: "clean"
      },
      evidence: readyEvidence({
        faceTrackingRunCount: 2,
        faceTrackingReadyCount: 2,
        faceTrackingIosPass: true,
        faceTrackingAndroidPass: true
      }),
      faceTracking: readyFaceTracking()
    });

    expect(checklist.status).toBe("ready");
    expect(checklist.items.find((entry) => entry.id === "avatar-motion-ready")?.status).toBe("pass");
  });

  it("blocks when retained session history is unstable", () => {
    const failedSession: StreamSessionSummary = {
      ...cleanSession(1),
      id: "failed-session",
      outcome: "fail",
      failureCount: 1,
      summary: "Session ended with issues.",
      recommendation: "Review the failed operation and platform ingest status before the next stream."
    };
    const input = defaultInput();
    const checklist = createStreamValidationChecklist({
      ...input,
      telemetry: {
        streamStatus: "live",
        bitrateKbps: 3500,
        fps: 30,
        droppedFrames: 0,
        reconnectAttempts: 0
      },
      health: {
        sampleCount: 5,
        stability: "stable"
      },
      session: {
        eventCount: 1,
        summaryCount: 1,
        historySummary: createStreamSessionHistorySummary([failedSession]),
        lastOutcome: "fail"
      },
      evidence: {
        ...summarizeStreamValidationEvidence([]),
        totalRuns: 1,
        failureCount: 1,
        status: "failing",
        summary: "1 failed validation run retained.",
        recommendation: "Fix the failed physical validation run before public launch."
      }
    });

    expect(checklist.status).toBe("blocked");
    expect(checklist.items.find((item) => item.id === "session-unstable")?.status).toBe("fail");
  });
});

const readyFaceTracking = () => ({
  status: "pass" as const,
  enabled: true,
  inputMode: "native-camera" as const,
  rigMode: "still-image-2d" as const,
  runtimeStatus: "tracking" as const,
  visibleAvatarCount: 1,
  visiblePngTuberCount: 1,
  visibleLive2DCount: 0,
  preparedPngTuberCount: 1,
  activeMotionCount: 1,
  summary: "Face tracking is ready with 1 prepared PNGTuber source.",
  recommendation: "Keep this tracker state with the next private iOS/Android validation run."
});

const readyEvidence = (overrides: Partial<StreamValidationEvidenceSummary> = {}): StreamValidationEvidenceSummary => ({
  totalRuns: 2,
  eligibleRunCount: 2,
  staleRunCount: 0,
  passCount: 2,
  warningCount: 0,
  failureCount: 0,
  nativeRuntimeRunCount: 0,
  nativeRuntimeWarningCount: 0,
  nativeRuntimeFailureCount: 0,
  faceTrackingRunCount: 0,
  faceTrackingWarningCount: 0,
  faceTrackingReadyCount: 0,
  faceTrackingIosPass: false,
  faceTrackingAndroidPass: false,
  platformPublishingRunCount: 0,
  platformPublishingWarningCount: 0,
  platformPublishingFailureCount: 0,
  status: "ready",
  iosPass: true,
  androidPass: true,
  appBuildMismatch: false,
  consistentAppBuild: "rc-1",
  passedTargetPlatforms: ["YouTube Live"],
  latestRun: null,
  latestEligibleRun: null,
  latestPassingRun: null,
  latestNativeRuntime: null,
  latestFaceTracking: null,
  latestPlatformPublishing: null,
  latestRunAgeDays: null,
  maxAgeDays: 14,
  summary: "Fresh physical validation baseline retained for iOS and Android on build rc-1 across 2 eligible runs.",
  recommendation: "Keep iOS and Android validation runs updated for every release candidate.",
  ...overrides
});
