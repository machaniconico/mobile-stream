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
export type StreamAudioLevelSource = "manual" | "face-tracking";

export interface StreamAudioLevelSample {
  at: string;
  level: number;
  source: StreamAudioLevelSource;
}

export interface StreamSessionAudioLevelSummary {
  sampleCount: number;
  averageLevel: number;
  peakLevel: number;
  activeSampleCount: number;
  activePercent: number;
  clippedSampleCount: number;
  summary: string;
  recommendation: string;
}

export interface StreamSessionNativeRuntimeSummary {
  platform: NativeRuntimeTelemetry["platform"];
  status: StreamSessionNativeRuntimeStatus;
  runtimeStatus: string;
  publisherState: string;
  compositionStatus: NativeRuntimeTelemetry["composition"]["status"];
  stillImageAssetCount: number;
  stillImageAssetLoadedCount: number;
  stillImageAssetMissingCount: number;
  stillImageAssetMissingKinds: string[];
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
  qualityEventCount: number;
  qualityLiveUpdateCount: number;
  qualityNextTargetCount: number;
  qualityUpdateFailureCount: number;
  chatEventCount: number;
  chatReconnectEventCount: number;
  chatReconnectFailureCount: number;
  chatSpeechStartedCount: number;
  chatSpeechSpokenCount: number;
  chatSpeechFailureCount: number;
  health: StreamHealthHistorySummary;
  audioLevel: StreamSessionAudioLevelSummary;
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
  audioLevelSamples?: StreamAudioLevelSample[];
}

export const maxStreamSessionSummaries = 10;
export const maxStreamAudioLevelSamples = 600;

export const createStreamAudioLevelSample = (
  level: number,
  source: StreamAudioLevelSource,
  now: Date = new Date()
): StreamAudioLevelSample => ({
  at: now.toISOString(),
  level: clamp01(level),
  source
});

export const appendStreamAudioLevelSample = (
  samples: StreamAudioLevelSample[],
  sample: StreamAudioLevelSample,
  maxSamples = maxStreamAudioLevelSamples
): StreamAudioLevelSample[] => [...samples, sample].slice(-Math.max(1, maxSamples));

export const summarizeStreamAudioLevels = (
  samples: StreamAudioLevelSample[]
): StreamSessionAudioLevelSummary => {
  const normalized = samples
    .map(normalizeAudioLevelSample)
    .filter((sample): sample is StreamAudioLevelSample => Boolean(sample));

  if (normalized.length === 0) {
    return {
      sampleCount: 0,
      averageLevel: 0,
      peakLevel: 0,
      activeSampleCount: 0,
      activePercent: 0,
      clippedSampleCount: 0,
      summary: "No lip-sync audio level samples were retained.",
      recommendation: "Capture a spoken private stream segment so mic FX and mouth-motion levels can be reviewed."
    };
  }

  const sampleCount = normalized.length;
  const totalLevel = normalized.reduce((total, sample) => total + sample.level, 0);
  const averageLevel = roundLevel(totalLevel / sampleCount);
  const peakLevel = roundLevel(Math.max(...normalized.map((sample) => sample.level)));
  const activeSampleCount = normalized.filter((sample) => sample.level >= 0.05).length;
  const activePercent = Math.round((activeSampleCount / sampleCount) * 100);
  const clippedSampleCount = normalized.filter((sample) => sample.level >= 0.98).length;

  return {
    sampleCount,
    averageLevel,
    peakLevel,
    activeSampleCount,
    activePercent,
    clippedSampleCount,
    summary: `Audio meter retained ${sampleCount} sample${sampleCount === 1 ? "" : "s"}; average ${Math.round(averageLevel * 100)}%, peak ${Math.round(peakLevel * 100)}%, active ${activePercent}%.`,
    recommendation:
      clippedSampleCount > 0
        ? "Lower mic gain or compression and repeat the private audio monitor check."
        : "Keep this audio-level baseline with the release-candidate validation run."
  };
};

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
  totalQualityEvents: number;
  totalQualityLiveUpdates: number;
  totalQualityNextTargets: number;
  totalQualityUpdateFailures: number;
  totalChatEvents: number;
  totalChatReconnectEvents: number;
  totalChatReconnectFailures: number;
  totalChatSpeechStarted: number;
  totalChatSpeechSpoken: number;
  totalChatSpeechFailures: number;
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
      totalQualityEvents: 0,
      totalQualityLiveUpdates: 0,
      totalQualityNextTargets: 0,
      totalQualityUpdateFailures: 0,
      totalChatEvents: 0,
      totalChatReconnectEvents: 0,
      totalChatReconnectFailures: 0,
      totalChatSpeechStarted: 0,
      totalChatSpeechSpoken: 0,
      totalChatSpeechFailures: 0,
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
  const totalQualityEvents = normalized.reduce((total, summary) => total + summary.qualityEventCount, 0);
  const totalQualityLiveUpdates = normalized.reduce((total, summary) => total + summary.qualityLiveUpdateCount, 0);
  const totalQualityNextTargets = normalized.reduce((total, summary) => total + summary.qualityNextTargetCount, 0);
  const totalQualityUpdateFailures = normalized.reduce((total, summary) => total + summary.qualityUpdateFailureCount, 0);
  const totalChatEvents = normalized.reduce((total, summary) => total + summary.chatEventCount, 0);
  const totalChatReconnectEvents = normalized.reduce((total, summary) => total + summary.chatReconnectEventCount, 0);
  const totalChatReconnectFailures = normalized.reduce((total, summary) => total + summary.chatReconnectFailureCount, 0);
  const totalChatSpeechStarted = normalized.reduce((total, summary) => total + summary.chatSpeechStartedCount, 0);
  const totalChatSpeechSpoken = normalized.reduce((total, summary) => total + summary.chatSpeechSpokenCount, 0);
  const totalChatSpeechFailures = normalized.reduce((total, summary) => total + summary.chatSpeechFailureCount, 0);
  const averageDurationSeconds = Math.round(
    normalized.reduce((total, summary) => total + summary.durationSeconds, 0) / totalSessions
  );
  const cleanRate = Math.round((cleanCount / totalSessions) * 100);
  const stability = createHistoryStability({
    totalSessions,
    cleanRate,
    failureCount,
    warningCount,
    totalRecoveryEvents,
    totalChatReconnectFailures
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
    totalQualityEvents,
    totalQualityLiveUpdates,
    totalQualityNextTargets,
    totalQualityUpdateFailures,
    totalChatEvents,
    totalChatReconnectEvents,
    totalChatReconnectFailures,
    totalChatSpeechStarted,
    totalChatSpeechSpoken,
    totalChatSpeechFailures,
    stability,
    summary: createHistorySummaryText(stability, totalSessions, cleanRate, failureCount, warningCount),
    recommendation: createHistoryRecommendation(
      stability,
      failureCount,
      warningCount,
      totalRecoveryEvents,
      totalChatReconnectEvents,
      totalChatReconnectFailures
    )
  };
};

export const createStreamSessionSummary = ({
  events,
  healthSamples,
  target,
  endReason,
  nativeRuntime: nativeRuntimeTelemetry = null,
  audioLevelSamples = [],
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
  const qualityEventCount = sessionEvents.filter((event) => event.kind === "quality").length;
  const qualityLiveUpdateCount = sessionEvents.filter(isQualityLiveUpdateEvent).length;
  const qualityNextTargetCount = sessionEvents.filter(isQualityNextTargetEvent).length;
  const qualityUpdateFailureCount = sessionEvents.filter(isQualityUpdateFailureEvent).length;
  const chatEventCount = sessionEvents.filter((event) => event.kind === "chat").length;
  const chatReconnectEventCount = sessionEvents.filter(isChatReconnectEvent).length;
  const chatReconnectFailureCount = sessionEvents.filter(isChatReconnectFailureEvent).length;
  const chatSpeechStartedCount = sessionEvents.filter(isChatSpeechStartedEvent).length;
  const chatSpeechSpokenCount = sessionEvents.filter(isChatSpeechSpokenEvent).length;
  const chatSpeechFailureCount = sessionEvents.filter(isChatSpeechFailureEvent).length;
  const audioLevel = summarizeStreamAudioLevels(
    audioLevelSamples.filter((sample) => sample.at >= startedAt && sample.at <= endedAtIso)
  );
  const nativeRuntime = createNativeRuntimeSessionSummary(nativeRuntimeTelemetry);
  const outcome = createOutcome(endReason, health, warningCount, failureCount, nativeRuntime, audioLevel, chatSpeechFailureCount);

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
    qualityEventCount,
    qualityLiveUpdateCount,
    qualityNextTargetCount,
    qualityUpdateFailureCount,
    chatEventCount,
    chatReconnectEventCount,
    chatReconnectFailureCount,
    chatSpeechStartedCount,
    chatSpeechSpokenCount,
    chatSpeechFailureCount,
    health,
    audioLevel,
    nativeRuntime,
    summary: createSummaryText(
      outcome,
      endReason,
      health,
      nativeRuntime,
      audioLevel,
      chatReconnectEventCount,
      chatSpeechSpokenCount,
      chatSpeechFailureCount,
      qualityLiveUpdateCount,
      qualityNextTargetCount,
      qualityUpdateFailureCount
    ),
    recommendation: createRecommendation(
      outcome,
      endReason,
      health,
      failureCount,
      recoveryEventCount,
      nativeRuntime,
      chatReconnectEventCount,
      chatReconnectFailureCount,
      audioLevel,
      chatSpeechFailureCount,
      qualityLiveUpdateCount,
      qualityUpdateFailureCount
    )
  };
};

const createOutcome = (
  endReason: StreamSessionEndReason,
  health: StreamHealthHistorySummary,
  warningCount: number,
  failureCount: number,
  nativeRuntime: StreamSessionNativeRuntimeSummary | null,
  audioLevel: StreamSessionAudioLevelSummary,
  chatSpeechFailureCount: number
): StreamSessionOutcome => {
  if (endReason === "failed" || failureCount > 0 || health.stability === "unstable" || nativeRuntime?.status === "fail") {
    return "fail";
  }

  if (
    warningCount > 0 ||
    health.stability === "watch" ||
    nativeRuntime?.status === "warn" ||
    audioLevel.clippedSampleCount > 0 ||
    chatSpeechFailureCount > 0
  ) {
    return "warn";
  }

  return "clean";
};

const createSummaryText = (
  outcome: StreamSessionOutcome,
  endReason: StreamSessionEndReason,
  health: StreamHealthHistorySummary,
  nativeRuntime: StreamSessionNativeRuntimeSummary | null,
  audioLevel: StreamSessionAudioLevelSummary,
  chatReconnectEventCount = 0,
  chatSpeechSpokenCount = 0,
  chatSpeechFailureCount = 0,
  qualityLiveUpdateCount = 0,
  qualityNextTargetCount = 0,
  qualityUpdateFailureCount = 0
): string => {
  const prefix =
    outcome === "clean" ? "Clean session" : outcome === "warn" ? "Session needs review" : "Session ended with issues";
  const chatSummary =
    chatReconnectEventCount > 0
      ? ` Chat readout reconnect events: ${chatReconnectEventCount}.`
      : "";
  const speechSummary =
    chatSpeechSpokenCount > 0 || chatSpeechFailureCount > 0
      ? ` Chat speech: ${chatSpeechSpokenCount} spoken / ${chatSpeechFailureCount} failed.`
      : "";
  const qualitySummary =
    qualityLiveUpdateCount > 0 || qualityNextTargetCount > 0 || qualityUpdateFailureCount > 0
      ? ` Quality automation: ${qualityLiveUpdateCount} live update${qualityLiveUpdateCount === 1 ? "" : "s"} / ${qualityNextTargetCount} next-start target${qualityNextTargetCount === 1 ? "" : "s"} / ${qualityUpdateFailureCount} failed.`
      : "";
  const audioSummary = audioLevel.sampleCount > 0 ? ` ${audioLevel.summary}` : "";
  return `${prefix}. Ended ${endReason}. ${health.summary}${audioSummary}${nativeRuntime ? ` ${nativeRuntime.summary}` : ""}${chatSummary}${speechSummary}${qualitySummary}`;
};

const createRecommendation = (
  outcome: StreamSessionOutcome,
  endReason: StreamSessionEndReason,
  health: StreamHealthHistorySummary,
  failureCount: number,
  recoveryEventCount: number,
  nativeRuntime: StreamSessionNativeRuntimeSummary | null,
  chatReconnectEventCount = 0,
  chatReconnectFailureCount = 0,
  audioLevel: StreamSessionAudioLevelSummary,
  chatSpeechFailureCount = 0,
  qualityLiveUpdateCount = 0,
  qualityUpdateFailureCount = 0
): string => {
  if (outcome === "clean") {
    return "Keep this profile as a known-good baseline for the destination.";
  }

  if (chatReconnectFailureCount > 0) {
    return "Review platform chat credentials and network stability before relying on comment readout in public streams.";
  }

  if (chatSpeechFailureCount > 0) {
    return "Review device TTS output and chat reader settings before relying on spoken comments in public streams.";
  }

  if (qualityUpdateFailureCount > 0) {
    return "Review native live quality-update support before relying on automatic bitrate/FPS relief in public streams.";
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

  if (chatReconnectEventCount > 0) {
    return "Watch platform chat stability and keep a manual comment-monitoring fallback ready.";
  }

  if (qualityLiveUpdateCount > 0) {
    return "Keep this run as evidence that live quality automation lowered encoder pressure; repeat if drops continue.";
  }

  if (audioLevel.clippedSampleCount > 0) {
    return audioLevel.recommendation;
  }

  if (health.droppedFrameIncrease > 0 || health.stability === "watch") {
    return "Watch the next session and consider reducing bitrate/FPS if drops continue.";
  }

  if (nativeRuntime?.status === "warn") {
    return nativeRuntime.recommendation;
  }

  return "Review warnings before the next long session.";
};

const isChatReconnectEvent = (event: StreamSessionEvent): boolean =>
  event.kind === "chat" && (event.title === "Chat reconnect scheduled" || event.title === "Chat reconnect exhausted");

const isChatReconnectFailureEvent = (event: StreamSessionEvent): boolean =>
  event.kind === "chat" && event.title === "Chat reconnect exhausted";

const isChatSpeechStartedEvent = (event: StreamSessionEvent): boolean =>
  event.kind === "chat" && event.title === "Chat speech started";

const isChatSpeechSpokenEvent = (event: StreamSessionEvent): boolean =>
  event.kind === "chat" && event.title === "Chat speech spoken";

const isChatSpeechFailureEvent = (event: StreamSessionEvent): boolean =>
  event.kind === "chat" && event.title === "Chat speech failed";

const isQualityLiveUpdateEvent = (event: StreamSessionEvent): boolean =>
  event.kind === "quality" && event.title === "Live quality target lowered";

const isQualityNextTargetEvent = (event: StreamSessionEvent): boolean =>
  event.kind === "quality" && event.title === "Auto quality target lowered";

const isQualityUpdateFailureEvent = (event: StreamSessionEvent): boolean =>
  event.kind === "quality" && (event.severity === "fail" || event.title === "Live quality update failed");

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
  const missingAssetCount = normalizeNonNegativeInteger(runtime.composition.stillImageAssetMissingCount);
  const missingAssets = missingAssetCount > 0;
  const status: StreamSessionNativeRuntimeStatus = failed ? "fail" : stale || congested || pendingComposition || missingAssets ? "warn" : "pass";
  const issueCount = [failed, stale, congested, pendingComposition, missingAssets].filter(Boolean).length;
  const queue = `${runtime.publisher.itemsInCache}/${runtime.publisher.cacheSize}`;

  return {
    platform: runtime.platform,
    status,
    runtimeStatus: runtime.runtimeStatus,
    publisherState: runtime.publisher.state,
    compositionStatus: runtime.composition.status,
    stillImageAssetCount: normalizeNonNegativeInteger(runtime.composition.stillImageAssetCount),
    stillImageAssetLoadedCount: normalizeNonNegativeInteger(runtime.composition.stillImageAssetLoadedCount),
    stillImageAssetMissingCount: missingAssetCount,
    stillImageAssetMissingKinds: runtime.composition.stillImageAssetMissingKinds ?? [],
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
            : missingAssets
              ? "Confirm App Group-copied PNGTuber/image assets load inside the iOS Broadcast Upload Extension before public streams."
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
  totalRecoveryEvents,
  totalChatReconnectFailures
}: {
  totalSessions: number;
  cleanRate: number;
  failureCount: number;
  warningCount: number;
  totalRecoveryEvents: number;
  totalChatReconnectFailures: number;
}): StreamSessionHistorySummary["stability"] => {
  if (failureCount > 0 || totalChatReconnectFailures > 0 || (totalSessions >= 3 && cleanRate < 70)) {
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
  totalRecoveryEvents: number,
  totalChatReconnectEvents: number,
  totalChatReconnectFailures: number
): string => {
  if (stability === "baseline") {
    return "Keep this destination and quality profile as the reference baseline.";
  }

  if (totalChatReconnectFailures > 0) {
    return "Review platform chat credentials and network stability before treating comment readout as production-ready.";
  }

  if (failureCount > 0) {
    return "Run a private ingest test and review failed sessions before the next public stream.";
  }

  if (totalRecoveryEvents > 0) {
    return "Watch network stability and lower bitrate if recovery events repeat.";
  }

  if (totalChatReconnectEvents > 0) {
    return "Run another private stream and confirm platform chat stays connected without readout recovery.";
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
    qualityEventCount: normalizeNonNegativeInteger(value.qualityEventCount),
    qualityLiveUpdateCount: normalizeNonNegativeInteger(value.qualityLiveUpdateCount),
    qualityNextTargetCount: normalizeNonNegativeInteger(value.qualityNextTargetCount),
    qualityUpdateFailureCount: normalizeNonNegativeInteger(value.qualityUpdateFailureCount),
    chatEventCount: normalizeNonNegativeInteger(value.chatEventCount),
    chatReconnectEventCount: normalizeNonNegativeInteger(value.chatReconnectEventCount),
    chatReconnectFailureCount: normalizeNonNegativeInteger(value.chatReconnectFailureCount),
    chatSpeechStartedCount: normalizeNonNegativeInteger(value.chatSpeechStartedCount),
    chatSpeechSpokenCount: normalizeNonNegativeInteger(value.chatSpeechSpokenCount),
    chatSpeechFailureCount: normalizeNonNegativeInteger(value.chatSpeechFailureCount),
    health,
    audioLevel: normalizeAudioLevelSummary(value.audioLevel),
    nativeRuntime: normalizeNativeRuntimeSessionSummary(value.nativeRuntime),
    summary:
      typeof value.summary === "string"
        ? value.summary
        : createSummaryText(
            outcome,
            endReason,
            health,
            normalizeNativeRuntimeSessionSummary(value.nativeRuntime),
            normalizeAudioLevelSummary(value.audioLevel),
            normalizeNonNegativeInteger(value.chatReconnectEventCount),
            normalizeNonNegativeInteger(value.chatSpeechSpokenCount),
            normalizeNonNegativeInteger(value.chatSpeechFailureCount),
            normalizeNonNegativeInteger(value.qualityLiveUpdateCount),
            normalizeNonNegativeInteger(value.qualityNextTargetCount),
            normalizeNonNegativeInteger(value.qualityUpdateFailureCount)
          ),
    recommendation:
      typeof value.recommendation === "string"
        ? value.recommendation
        : createRecommendation(
            outcome,
            endReason,
            health,
            0,
            0,
            normalizeNativeRuntimeSessionSummary(value.nativeRuntime),
            normalizeNonNegativeInteger(value.chatReconnectEventCount),
            normalizeNonNegativeInteger(value.chatReconnectFailureCount),
            normalizeAudioLevelSummary(value.audioLevel),
            normalizeNonNegativeInteger(value.chatSpeechFailureCount),
            normalizeNonNegativeInteger(value.qualityLiveUpdateCount),
            normalizeNonNegativeInteger(value.qualityUpdateFailureCount)
          )
  };
};

const normalizeAudioLevelSample = (value: unknown): StreamAudioLevelSample | null => {
  if (!isRecord(value)) {
    return null;
  }
  const at = normalizeDateString(value.at);
  if (!at) {
    return null;
  }
  return {
    at,
    level: clamp01(typeof value.level === "number" ? value.level : 0),
    source: value.source === "face-tracking" ? "face-tracking" : "manual"
  };
};

const normalizeAudioLevelSummary = (value: unknown): StreamSessionAudioLevelSummary => {
  if (!isRecord(value)) {
    return summarizeStreamAudioLevels([]);
  }
  return {
    sampleCount: normalizeNonNegativeInteger(value.sampleCount),
    averageLevel: clamp01(typeof value.averageLevel === "number" ? value.averageLevel : 0),
    peakLevel: clamp01(typeof value.peakLevel === "number" ? value.peakLevel : 0),
    activeSampleCount: normalizeNonNegativeInteger(value.activeSampleCount),
    activePercent: Math.min(100, normalizeNonNegativeInteger(value.activePercent)),
    clippedSampleCount: normalizeNonNegativeInteger(value.clippedSampleCount),
    summary: typeof value.summary === "string" ? value.summary : "No lip-sync audio level samples were retained.",
    recommendation:
      typeof value.recommendation === "string"
        ? value.recommendation
        : "Capture a spoken private stream segment so mic FX and mouth-motion levels can be reviewed."
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
    stillImageAssetCount: normalizeNonNegativeInteger(value.stillImageAssetCount),
    stillImageAssetLoadedCount: normalizeNonNegativeInteger(value.stillImageAssetLoadedCount),
    stillImageAssetMissingCount: normalizeNonNegativeInteger(value.stillImageAssetMissingCount),
    stillImageAssetMissingKinds: Array.isArray(value.stillImageAssetMissingKinds)
      ? value.stillImageAssetMissingKinds.filter((kind): kind is string => typeof kind === "string")
      : [],
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

const normalizeDateString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const roundLevel = (value: number): number => Math.round(clamp01(value) * 1000) / 1000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
