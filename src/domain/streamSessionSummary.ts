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

export interface StreamSessionHistorySummary {
  totalSessions: number;
  cleanCount: number;
  warningCount: number;
  failureCount: number;
  cleanRate: number;
  averageDurationSeconds: number;
  totalWarningEvents: number;
  totalFailureEvents: number;
  totalRecoveryEvents: number;
  stability: "unknown" | "baseline" | "watch" | "unstable";
  summary: string;
  recommendation: string;
}

export const normalizeStreamSessionSummaries = (
  value: unknown,
  maxSummaries = maxStreamSessionSummaries
): StreamSessionSummary[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const summaries = value
    .map(normalizeStreamSessionSummary)
    .filter((summary): summary is StreamSessionSummary => Boolean(summary));

  return summaries.slice(0, Math.max(1, maxSummaries));
};

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

export const mergeStreamSessionSummaries = (
  primarySummaries: StreamSessionSummary[],
  secondarySummaries: unknown,
  maxSummaries = maxStreamSessionSummaries
): StreamSessionSummary[] => {
  const maxCount = Math.max(1, maxSummaries);
  const merged: StreamSessionSummary[] = [];
  const seen = new Set<string>();

  for (const summary of [
    ...normalizeStreamSessionSummaries(primarySummaries, maxCount),
    ...normalizeStreamSessionSummaries(secondarySummaries, maxCount)
  ]) {
    if (seen.has(summary.id)) {
      continue;
    }

    seen.add(summary.id);
    merged.push(summary);
    if (merged.length >= maxCount) {
      break;
    }
  }

  return merged;
};

export const createStreamSessionHistorySummary = (
  summaries: StreamSessionSummary[]
): StreamSessionHistorySummary => {
  const normalized = normalizeStreamSessionSummaries(summaries);
  const totalSessions = normalized.length;

  if (totalSessions === 0) {
    return {
      totalSessions: 0,
      cleanCount: 0,
      warningCount: 0,
      failureCount: 0,
      cleanRate: 0,
      averageDurationSeconds: 0,
      totalWarningEvents: 0,
      totalFailureEvents: 0,
      totalRecoveryEvents: 0,
      stability: "unknown",
      summary: "No completed stream history yet.",
      recommendation: "Complete a test stream to establish a local quality baseline."
    };
  }

  const cleanCount = normalized.filter((summary) => summary.outcome === "clean").length;
  const warningCount = normalized.filter((summary) => summary.outcome === "warn").length;
  const failureCount = normalized.filter((summary) => summary.outcome === "fail").length;
  const totalWarningEvents = normalized.reduce((total, summary) => total + summary.warningCount, 0);
  const totalFailureEvents = normalized.reduce((total, summary) => total + summary.failureCount, 0);
  const totalRecoveryEvents = normalized.reduce((total, summary) => total + summary.recoveryEventCount, 0);
  const averageDurationSeconds = Math.round(
    normalized.reduce((total, summary) => total + summary.durationSeconds, 0) / totalSessions
  );
  const cleanRate = Math.round((cleanCount / totalSessions) * 100);
  const stability = createHistoryStability({
    totalSessions,
    cleanRate,
    failureCount,
    warningCount,
    totalRecoveryEvents
  });

  return {
    totalSessions,
    cleanCount,
    warningCount,
    failureCount,
    cleanRate,
    averageDurationSeconds,
    totalWarningEvents,
    totalFailureEvents,
    totalRecoveryEvents,
    stability,
    summary: createHistorySummaryText(stability, totalSessions, cleanRate, failureCount, warningCount),
    recommendation: createHistoryRecommendation(stability, failureCount, warningCount, totalRecoveryEvents)
  };
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

const createHistoryStability = ({
  totalSessions,
  cleanRate,
  failureCount,
  warningCount,
  totalRecoveryEvents
}: {
  totalSessions: number;
  cleanRate: number;
  failureCount: number;
  warningCount: number;
  totalRecoveryEvents: number;
}): StreamSessionHistorySummary["stability"] => {
  if (failureCount > 0 || cleanRate < 70) {
    return "unstable";
  }

  if (warningCount > 0 || totalRecoveryEvents > 0 || cleanRate < 100) {
    return "watch";
  }

  return totalSessions >= 3 ? "baseline" : "watch";
};

const createHistorySummaryText = (
  stability: StreamSessionHistorySummary["stability"],
  totalSessions: number,
  cleanRate: number,
  failureCount: number,
  warningCount: number
): string => {
  if (stability === "baseline") {
    return `Known-good baseline: ${totalSessions} clean sessions retained.`;
  }

  if (stability === "unstable") {
    return `Recent stream history is unstable: ${cleanRate}% clean, ${failureCount} failed, ${warningCount} warning sessions.`;
  }

  return `Recent stream history needs watch: ${cleanRate}% clean across ${totalSessions} sessions.`;
};

const createHistoryRecommendation = (
  stability: StreamSessionHistorySummary["stability"],
  failureCount: number,
  warningCount: number,
  totalRecoveryEvents: number
): string => {
  if (stability === "baseline") {
    return "Keep this destination and quality profile as the reference baseline.";
  }

  if (failureCount > 0) {
    return "Run a private ingest test and review failed sessions before the next public stream.";
  }

  if (totalRecoveryEvents > 0) {
    return "Watch network stability and lower bitrate if recovery events repeat.";
  }

  if (warningCount > 0) {
    return "Review warning sessions and avoid increasing quality until another clean test passes.";
  }

  return "Capture at least three clean sessions before treating this setup as a baseline.";
};

const normalizeStreamSessionSummary = (value: unknown): StreamSessionSummary | null => {
  if (!isRecord(value)) {
    return null;
  }

  const endReason = normalizeEndReason(value.endReason);
  const outcome = normalizeOutcome(value.outcome);
  const health = normalizeHealthSummary(value.health);
  if (!endReason || !outcome || !health || typeof value.startedAt !== "string" || typeof value.endedAt !== "string") {
    return null;
  }

  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id : createSummaryId(value.startedAt, value.endedAt, endReason),
    startedAt: value.startedAt,
    endedAt: value.endedAt,
    endReason,
    outcome,
    durationSeconds: normalizeNonNegativeNumber(value.durationSeconds),
    eventCount: normalizeNonNegativeInteger(value.eventCount),
    warningCount: normalizeNonNegativeInteger(value.warningCount),
    failureCount: normalizeNonNegativeInteger(value.failureCount),
    recoveryEventCount: normalizeNonNegativeInteger(value.recoveryEventCount),
    operationFailureCount: normalizeNonNegativeInteger(value.operationFailureCount),
    health,
    summary: typeof value.summary === "string" ? value.summary : createSummaryText(outcome, endReason, health),
    recommendation: typeof value.recommendation === "string" ? value.recommendation : createRecommendation(outcome, endReason, health, 0, 0)
  };
};

const normalizeHealthSummary = (value: unknown): StreamHealthHistorySummary | null => {
  if (!isRecord(value)) {
    return null;
  }

  const stability = normalizeStability(value.stability);
  if (!stability) {
    return null;
  }

  return {
    sampleCount: normalizeNonNegativeInteger(value.sampleCount),
    durationSeconds: normalizeNonNegativeNumber(value.durationSeconds),
    averageBitrateKbps: normalizeNonNegativeInteger(value.averageBitrateKbps),
    minimumBitrateKbps: normalizeNonNegativeInteger(value.minimumBitrateKbps),
    maximumBitrateKbps: normalizeNonNegativeInteger(value.maximumBitrateKbps),
    averageFps: normalizeNonNegativeNumber(value.averageFps),
    minimumFps: normalizeNonNegativeNumber(value.minimumFps),
    droppedFrameIncrease: normalizeNonNegativeInteger(value.droppedFrameIncrease),
    observedDroppedFrames: normalizeNonNegativeInteger(value.observedDroppedFrames),
    observedReconnectAttempts: normalizeNonNegativeInteger(value.observedReconnectAttempts),
    stability,
    summary: typeof value.summary === "string" ? value.summary : "No stream health history captured yet."
  };
};

const normalizeEndReason = (value: unknown): StreamSessionEndReason | null =>
  value === "stopped" || value === "failed" ? value : null;

const normalizeOutcome = (value: unknown): StreamSessionOutcome | null =>
  value === "clean" || value === "warn" || value === "fail" ? value : null;

const normalizeStability = (value: unknown): StreamHealthHistorySummary["stability"] | null =>
  value === "unknown" || value === "stable" || value === "watch" || value === "unstable" ? value : null;

const normalizeNonNegativeInteger = (value: unknown): number =>
  Math.max(0, Math.round(typeof value === "number" && Number.isFinite(value) ? value : 0));

const normalizeNonNegativeNumber = (value: unknown): number =>
  Math.max(0, typeof value === "number" && Number.isFinite(value) ? value : 0);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
