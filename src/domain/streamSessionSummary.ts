import {
  summarizeStreamHealthHistory,
  type StreamHealthHistorySummary,
  type StreamHealthSample
} from "./streamHealthHistory";
import type { StreamSessionEvent } from "./streamSessionLog";

export type StreamSessionEndReason = "stopped" | "failed";
export type StreamSessionOutcome = "clean" | "warn" | "fail";

export interface StreamSessionSummary {
  id: string;
  startedAt: string;
  endedAt: string;
  endReason: StreamSessionEndReason;
  outcome: StreamSessionOutcome;
  durationSeconds: number;
  eventCount: number;
  warningCount: number;
  failureCount: number;
  recoveryEventCount: number;
  operationFailureCount: number;
  health: StreamHealthHistorySummary;
  summary: string;
  recommendation: string;
}

export interface StreamSessionSummaryInput {
  events: StreamSessionEvent[];
  healthSamples: StreamHealthSample[];
  target: {
    bitrateKbps: number;
    fps: number;
  };
  endReason: StreamSessionEndReason;
  endedAt?: Date;
}

export const maxStreamSessionSummaries = 10;

export const appendStreamSessionSummary = (
  summaries: StreamSessionSummary[],
  summary: StreamSessionSummary | null,
  maxSummaries = maxStreamSessionSummaries
): StreamSessionSummary[] => {
  if (!summary) {
    return summaries;
  }

  if (summaries.some((item) => item.id === summary.id)) {
    return summaries;
  }

  return [summary, ...summaries].slice(0, Math.max(1, maxSummaries));
};

export const createStreamSessionSummary = ({
  events,
  healthSamples,
  target,
  endReason,
  endedAt = new Date()
}: StreamSessionSummaryInput): StreamSessionSummary | null => {
  if (healthSamples.length === 0) {
    return null;
  }

  const startedAt = healthSamples[0].at;
  const endedAtIso = endedAt.toISOString();
  const health = summarizeStreamHealthHistory(healthSamples, target);
  const sessionEvents = events.filter((event) => event.at >= startedAt && event.at <= endedAtIso);
  const warningCount = sessionEvents.filter((event) => event.severity === "warn").length;
  const failureCount = sessionEvents.filter((event) => event.severity === "fail").length;
  const recoveryEventCount = sessionEvents.filter((event) => event.kind === "recovery").length;
  const operationFailureCount = sessionEvents.filter((event) => event.kind === "operation" && event.severity === "fail").length;
  const outcome = createOutcome(endReason, health, warningCount, failureCount);

  return {
    id: createSummaryId(startedAt, endedAtIso, endReason),
    startedAt,
    endedAt: endedAtIso,
    endReason,
    outcome,
    durationSeconds: health.durationSeconds,
    eventCount: sessionEvents.length,
    warningCount,
    failureCount,
    recoveryEventCount,
    operationFailureCount,
    health,
    summary: createSummaryText(outcome, endReason, health),
    recommendation: createRecommendation(outcome, endReason, health, failureCount, recoveryEventCount)
  };
};

const createOutcome = (
  endReason: StreamSessionEndReason,
  health: StreamHealthHistorySummary,
  warningCount: number,
  failureCount: number
): StreamSessionOutcome => {
  if (endReason === "failed" || failureCount > 0 || health.stability === "unstable") {
    return "fail";
  }

  if (warningCount > 0 || health.stability === "watch") {
    return "warn";
  }

  return "clean";
};

const createSummaryText = (
  outcome: StreamSessionOutcome,
  endReason: StreamSessionEndReason,
  health: StreamHealthHistorySummary
): string => {
  const prefix =
    outcome === "clean" ? "Clean session" : outcome === "warn" ? "Session needs review" : "Session ended with issues";
  return `${prefix}. Ended ${endReason}. ${health.summary}`;
};

const createRecommendation = (
  outcome: StreamSessionOutcome,
  endReason: StreamSessionEndReason,
  health: StreamHealthHistorySummary,
  failureCount: number,
  recoveryEventCount: number
): string => {
  if (outcome === "clean") {
    return "Keep this profile as a known-good baseline for the destination.";
  }

  if (endReason === "failed" || failureCount > 0) {
    return "Review the failed operation and platform ingest status before the next stream.";
  }

  if (recoveryEventCount > 0 || health.observedReconnectAttempts > 0) {
    return "Check network stability and lower bitrate if reconnects repeat.";
  }

  if (health.droppedFrameIncrease > 0 || health.stability === "watch") {
    return "Watch the next session and consider reducing bitrate/FPS if drops continue.";
  }

  return "Review warnings before the next long session.";
};

const createSummaryId = (startedAt: string, endedAt: string, endReason: StreamSessionEndReason): string =>
  [startedAt, endedAt, endReason].join(":");
