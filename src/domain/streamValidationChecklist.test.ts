import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile } from "./profiles";
import { createReadinessReport } from "./readiness";
import { createDefaultScene } from "./scene";
import type { StreamHealthHistorySummary } from "./streamHealthHistory";
import {
  createStreamSessionHistorySummary,
  type StreamSessionSummary
} from "./streamSessionSummary";
import {
  createStreamValidationChecklist,
  type StreamValidationChecklistInput
} from "./streamValidationChecklist";

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
  health: stableHealth,
  summary: "Clean session. Stream health is stable.",
  recommendation: "Keep this profile as a known-good baseline for the destination."
});

const defaultInput = (streamKey = "validation-demo"): StreamValidationChecklistInput => {
  const scene = createDefaultScene();
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
    }
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

  it("passes when live telemetry and a clean retained baseline are available", () => {
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

    expect(checklist.status).toBe("ready");
    expect(checklist.failCount).toBe(0);
    expect(checklist.warningCount).toBe(0);
    expect(checklist.pendingCount).toBe(0);
    expect(checklist.passCount).toBe(checklist.items.length);
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
      }
    });

    expect(checklist.status).toBe("blocked");
    expect(checklist.items.find((item) => item.id === "session-unstable")?.status).toBe("fail");
  });
});
