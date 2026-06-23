import {
  summarizeStreamHealthHistory,
  type StreamHealthHistorySummary,
  type StreamHealthSample
} from "./streamHealthHistory";
import type { NativeRuntimeTelemetry } from "./nativeRuntime";
import type { StreamSessionEvent } from "./streamSessionLog";

export type StreamSessionEndReason = "stopped" | "failed";
export type StreamSessionOutcome = "clean" | "warn" | "fail";
export type StreamSessionNativeRuntimeStatus = "pass" | "warn" | "fail";

export interface StreamSessionNativeRuntimeSummary {
  platform: NativeRuntimeTelemetry["platform"];
  status: StreamSessionNativeRuntimeStatus;
  runtimeStatus: string;
  publisherState: string;
  compositionStatus: NativeRuntimeTelemetry["composition"]["status"];
  stale: boolean;
  congested: boolean;
  queuedItems: number;
  cacheSize: number;
  sentVideoFrames: number;
  sentAudioFrames: number;
  droppedVideoFrames: number;
  droppedAudioFrames: number;
  bytesWritten: number;
  encodedBytes: number;
  issueCount: number;
  summary: string;
  recommendation: string;
}

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
  nativeRuntime: StreamSessionNativeRuntimeSummary | null;
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
  nativeRuntime?: NativeRuntimeTelemetry | null;
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
  nativeRuntime: nativeRuntimeTelemetry = null,
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
  const nativeRuntime = createNativeRuntimeSessionSummary(nativeRuntimeTelemetry);
  const outcome = createOutcome(endReason, health, warningCount, failureCount, nativeRuntime);

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
    nativeRuntime,
    summary: createSummaryText(outcome, endReason, health, nativeRuntime),
    recommendation: createRecommendation(outcome, endReason, health, failureCount, recoveryEventCount, nativeRuntime)
  };
};

const createOutcome = (
  endReason: StreamSessionEndReason,
  health: StreamHealthHistorySummary,
  warningCount: number,
  failureCount: number,
  nativeRuntime: StreamSessionNativeRuntimeSummary | null
): StreamSessionOutcome => {
  if (endReason === "failed" || failureCount > 0 || health.stability === "unstable" || nativeRuntime?.status === "fail") {
    return "fail";
  }

  if (warningCount > 0 || health.stability === "watch" || nativeRuntime?.status === "warn") {
    return "warn";
  }

  return "clean";
};

const createSummaryText = (
  outcome: StreamSessionOutcome,
  endReason: StreamSessionEndReason,
  health: StreamHealthHistorySummary,
  nativeRuntime: StreamSessionNativeRuntimeSummary | null
): string => {
  const prefix =
    outcome === "clean" ? "Clean session" : outcome === "warn" ? "Session needs review" : "Session ended with issues";
  return `${prefix}. Ended ${endReason}. ${health.summary}${nativeRuntime ? ` ${nativeRuntime.summary}` : ""}`;
};

const createRecommendation = (
  outcome: StreamSessionOutcome,
  endReason: StreamSessionEndReason,
  health: StreamHealthHistorySummary,
  failureCount: number,
  recoveryEventCount: number,
  nativeRuntime: StreamSessionNativeRuntimeSummary | null
): string => {
  if (outcome === "clean") {
    return "Keep this profile as a known-good baseline for the destination.";
  }

  if (nativeRuntime?.status === "fail") {
    return nativeRuntime.recommendation;
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

  if (nativeRuntime?.status === "warn") {
    return nativeRuntime.recommendation;
  }

  return "Review warnings before the next long session.";
};

export const createNativeRuntimeSessionSummary = (
  runtime: NativeRuntimeTelemetry | null | undefined
): StreamSessionNativeRuntimeSummary | null => {
  if (!runtime) {
    return null;
  }

  const failed = Boolean(
    runtime.publisher.lastError ||
    runtime.publisher.state === "failed" ||
    runtime.runtimeStatus === "failed" ||
    runtime.composition.status === "failed"
  );
  const stale = runtime.stale;
  const congested = runtime.publisher.congested;
  const pendingComposition = runtime.composition.status === "pending";
  const status: StreamSessionNativeRuntimeStatus = failed ? "fail" : stale || congested || pendingComposition ? "warn" : "pass";
  const issueCount = [failed, stale, congested, pendingComposition].filter(Boolean).length;
  const queue = `${runtime.publisher.itemsInCache}/${runtime.publisher.cacheSize}`;

  return {
    platform: runtime.platform,
    status,
    runtimeStatus: runtime.runtimeStatus,
    publisherState: runtime.publisher.state,
    compositionStatus: runtime.composition.status,
    stale,
    congested,
    queuedItems: normalizeNonNegativeInteger(runtime.publisher.itemsInCache),
    cacheSize: normalizeNonNegativeInteger(runtime.publisher.cacheSize),
    sentVideoFrames: normalizeNonNegativeInteger(runtime.publisher.sentVideoFrames),
    sentAudioFrames: normalizeNonNegativeInteger(runtime.publisher.sentAudioFrames),
    droppedVideoFrames: normalizeNonNegativeInteger(runtime.publisher.droppedVideoFrames),
    droppedAudioFrames: normalizeNonNegativeInteger(runtime.publisher.droppedAudioFrames),
    bytesWritten: normalizeNonNegativeInteger(runtime.publisher.bytesWritten),
    encodedBytes: normalizeNonNegativeInteger(runtime.encodedBytes),
    issueCount,
    summary:
      status === "fail"
        ? `Native runtime ended with a failure on ${runtime.platform}.`
        : status === "warn"
          ? `Native runtime needs review on ${runtime.platform}: queue ${queue}, composition ${runtime.composition.status}.`
          : `Native runtime ended clean on ${runtime.platform}.`,
    recommendation:
      status === "fail"
        ? "Review native runtime publisher/compositor status and run a private ingest test before going public."
        : congested
          ? "Lower bitrate/FPS or improve network stability before a long public stream."
          : stale
            ? "Confirm the native runtime is still reporting current telemetry during device validation."
            : pendingComposition
              ? "Review native compositor coverage before treating this scene as production-ready."
              : "Keep this native runtime result as supporting evidence for the destination."
  };
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
  if (failureCount > 0 || (totalSessions >= 3 && cleanRate < 70)) {
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
    nativeRuntime: normalizeNativeRuntimeSessionSummary(value.nativeRuntime),
    summary: typeof value.summary === "string" ? value.summary : createSummaryText(outcome, endReason, health, normalizeNativeRuntimeSessionSummary(value.nativeRuntime)),
    recommendation: typeof value.recommendation === "string" ? value.recommendation : createRecommendation(outcome, endReason, health, 0, 0, normalizeNativeRuntimeSessionSummary(value.nativeRuntime))
  };
};

export const normalizeNativeRuntimeSessionSummary = (value: unknown): StreamSessionNativeRuntimeSummary | null => {
  if (!isRecord(value)) {
    return null;
  }

  const platform = value.platform === "ios" || value.platform === "android" ? value.platform : null;
  const status = normalizeNativeRuntimeStatus(value.status);
  const compositionStatus = normalizeCompositionStatus(value.compositionStatus);
  if (!platform || !status || !compositionStatus) {
    return null;
  }

  return {
    platform,
    status,
    runtimeStatus: typeof value.runtimeStatus === "string" ? value.runtimeStatus : "unknown",
    publisherState: typeof value.publisherState === "string" ? value.publisherState : "",
    compositionStatus,
    stale: value.stale === true,
    congested: value.congested === true,
    queuedItems: normalizeNonNegativeInteger(value.queuedItems),
    cacheSize: normalizeNonNegativeInteger(value.cacheSize),
    sentVideoFrames: normalizeNonNegativeInteger(value.sentVideoFrames),
    sentAudioFrames: normalizeNonNegativeInteger(value.sentAudioFrames),
    droppedVideoFrames: normalizeNonNegativeInteger(value.droppedVideoFrames),
    droppedAudioFrames: normalizeNonNegativeInteger(value.droppedAudioFrames),
    bytesWritten: normalizeNonNegativeInteger(value.bytesWritten),
    encodedBytes: normalizeNonNegativeInteger(value.encodedBytes),
    issueCount: normalizeNonNegativeInteger(value.issueCount),
    summary: typeof value.summary === "string" ? value.summary : `Native runtime ${status} on ${platform}.`,
    recommendation: typeof value.recommendation === "string" ? value.recommendation : "Review native runtime evidence before public launch."
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

const normalizeNativeRuntimeStatus = (value: unknown): StreamSessionNativeRuntimeStatus | null =>
  value === "pass" || value === "warn" || value === "fail" ? value : null;

const normalizeCompositionStatus = (
  value: unknown
): NativeRuntimeTelemetry["composition"]["status"] | null =>
  value === "unknown" || value === "screen-only" || value === "applied" || value === "pending" || value === "failed"
    ? value
    : null;

const normalizeStability = (value: unknown): StreamHealthHistorySummary["stability"] | null =>
  value === "unknown" || value === "stable" || value === "watch" || value === "unstable" ? value : null;

const normalizeNonNegativeInteger = (value: unknown): number =>
  Math.max(0, Math.round(typeof value === "number" && Number.isFinite(value) ? value : 0));

const normalizeNonNegativeNumber = (value: unknown): number =>
  Math.max(0, typeof value === "number" && Number.isFinite(value) ? value : 0);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
