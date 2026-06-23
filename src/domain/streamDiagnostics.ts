import { buildPublishUrl, getDestinationPreset, redactStreamKey, type StudioProfile } from "./profiles";
import {
  createAudioMonitorSafetyStatus,
  createDefaultAudioRouteState,
  normalizeAudioRouteState,
  type AudioMonitorSafetyStatus,
  type AudioRouteState
} from "./audioRoute";
import type { FaceTrackingRuntimeState } from "./faceTracking";
import {
  createFaceTrackingDiagnostics,
  type FaceTrackingDiagnostics
} from "./faceTrackingDiagnostics";
import { createNativeCompositionReport, type NativeCompositionReport } from "./nativeComposition";
import { assessPlatformPublishingFreshness } from "./platformPublishingFreshness";
import type { NativeRuntimeTelemetry } from "./nativeRuntime";
import type { ReadinessReport } from "./readiness";
import type { SceneDocument } from "./scene";
import {
  createDefaultStreamRecoveryPolicy,
  createStreamRecoveryStatus,
  formatRecoveryBackoff,
  formatDelay,
  type StreamRecoveryStatus
} from "./streamRecovery";
import {
  createStreamQualityIncidents,
  summarizeStreamQualityIncidents,
  type StreamQualityIncident
} from "./streamQualityIncidents";
import {
  createStreamQualityAdvisor,
  type StreamQualityAdvisorRecommendation
} from "./streamQualityAdvisor";
import {
  summarizeStreamHealthHistory,
  type StreamHealthHistorySummary,
  type StreamHealthSample
} from "./streamHealthHistory";
import type { StreamSessionEvent } from "./streamSessionLog";
import {
  createStreamSessionHistorySummary,
  type StreamSessionHistorySummary,
  type StreamSessionSummary
} from "./streamSessionSummary";
import {
  createStreamValidationChecklist,
  type StreamValidationChecklist
} from "./streamValidationChecklist";
import {
  createStreamValidationRunbook,
  type StreamValidationRunbook
} from "./streamValidationRunbook";
import {
  summarizeStreamValidationEvidence,
  type StreamValidationEvidenceSummary,
  type StreamValidationRun
} from "./streamValidationEvidence";
import type { StreamHealth, StreamStatus } from "./streamState";

export type DiagnosticStatus = "pass" | "warn" | "fail" | "info";

export interface PlatformPublishingDiagnostics {
  platform: StudioProfile["destination"]["platform"];
  status: DiagnosticStatus;
  summary: string;
  recommendation: string;
  youtube: {
    hasBroadcastId: boolean;
    hasStreamId: boolean;
    broadcastStatus: string;
    streamStatus: string;
    healthStatus: string;
    healthIssueCount: number;
    statusCheckedAt: string;
  } | null;
  twitch: {
    liveStatus: string;
    viewerCount: number;
    hasCategory: boolean;
    hasCategoryId: boolean;
    language: string;
    startedAt: string;
    statusCheckedAt: string;
  } | null;
}

export interface DiagnosticCheck {
  code: string;
  status: DiagnosticStatus;
  label: string;
  message: string;
}

export interface StreamDiagnostics {
  summary: string;
  status: DiagnosticStatus;
  target: {
    platform: string;
    presetName: string;
    protocol: string;
    host: string;
    application: string;
    publishUrlPreview: string;
    streamKeyPreview: string;
    secureTransport: boolean;
  };
  quality: {
    resolution: string;
    fps: number;
    targetVideoBitrateKbps: number;
    targetAudioBitrateKbps: number;
    estimatedUploadKbps: number;
  };
  telemetry: {
    streamStatus: StreamStatus;
    bitrateKbps: number;
    fps: number;
    droppedFrames: number;
    reconnectAttempts: number;
    elapsedSeconds: number;
    message: string;
  };
  nativeRuntime: NativeRuntimeTelemetry | null;
  recovery: StreamRecoveryStatus & {
    backoffWindow: string;
  };
  qualityIncidents: {
    summary: string;
    incidents: StreamQualityIncident[];
  };
  qualityAdvisor: StreamQualityAdvisorRecommendation;
  faceTracking: FaceTrackingDiagnostics;
  nativeComposition: NativeCompositionReport;
  audio: {
    micEffectsEnabled: boolean;
    presetId: string;
    inputGainDb: number;
    compression: number;
    monitorEnabled: boolean;
    monitorVolume: number;
    monitorHeadphonesOnly: boolean;
    monitorSafety: AudioMonitorSafetyStatus;
  };
  audioRoute: AudioRouteState;
  chatReadout: {
    platformChatEnabled: boolean;
    readerEnabled: boolean;
    connectionPhase: string;
    connectionLabel: string;
    connectionMessage: string;
  };
  platformPublishing: PlatformPublishingDiagnostics;
  history: StreamHealthHistorySummary;
  session: {
    events: StreamSessionEvent[];
    summaries: StreamSessionSummary[];
    lastSummary: StreamSessionSummary | null;
    historySummary: StreamSessionHistorySummary;
  };
  validationEvidence: StreamValidationEvidenceSummary;
  validation: StreamValidationChecklist;
  validationRunbook: StreamValidationRunbook;
  checks: DiagnosticCheck[];
}

export interface StreamDiagnosticReport {
  generatedAt: string;
  app: {
    name: "MobileLiveCaster";
    reportVersion: 1;
  };
  diagnostics: StreamDiagnostics;
}

interface SnapshotLike {
  state: {
    status: StreamStatus;
  };
  health: StreamHealth;
  nativeRuntime?: NativeRuntimeTelemetry | null;
}

export interface StreamDiagnosticsOptions {
  chatReader?: {
    enabled: boolean;
  } | null;
  platformChatConnection?: {
    phase: string;
    label?: string;
    message?: string;
  } | null;
  audioRoute?: AudioRouteState | null;
}

const platformLabels: Record<StudioProfile["destination"]["platform"], string> = {
  custom: "Custom",
  "youtube-live": "YouTube Live",
  twitch: "Twitch"
};

export const createStreamDiagnostics = (
  scene: SceneDocument,
  profile: StudioProfile,
  readiness: ReadinessReport,
  snapshot: SnapshotLike,
  sessionEvents: StreamSessionEvent[] = [],
  healthSamples: StreamHealthSample[] = [],
  sessionSummaries: StreamSessionSummary[] = [],
  validationRuns: StreamValidationRun[] = [],
  faceTrackingRuntime: FaceTrackingRuntimeState | null = null,
  options: StreamDiagnosticsOptions = {}
): StreamDiagnostics => {
  const destination = readiness.sanitizedProfile.destination;
  const quality = readiness.sanitizedProfile.quality;
  const micEffects = readiness.sanitizedProfile.micEffects;
  const platformChat = readiness.sanitizedProfile.platformChat;
  const platformChatConnection = options.platformChatConnection ?? null;
  const endpoint = parseEndpoint(destination.serverUrl);
  const redactedEndpoint = {
    host: endpoint.host,
    application: redactEndpointApplication(endpoint.application, destination.streamKey)
  };
  const targetVideoBitrateKbps = quality.videoBitrateKbps;
  const targetAudioBitrateKbps = quality.audioBitrateKbps;
  const estimatedUploadKbps = Math.round((targetVideoBitrateKbps + targetAudioBitrateKbps) * 1.25);
  const sanitizedHealthMessage = redactStreamKeyOccurrences(snapshot.health.message, destination.streamKey);
  const nativeRuntime = sanitizeNativeRuntime(snapshot.nativeRuntime ?? null, destination.streamKey);
  const sanitizedSessionEvents = sessionEvents.map((event) => sanitizeSessionEvent(event, destination.streamKey));
  const recoveryPolicy = createDefaultStreamRecoveryPolicy();
  const recoveryStatus = createStreamRecoveryStatus(snapshot, quality, recoveryPolicy);
  const qualityIncidents = createStreamQualityIncidents(snapshot, quality);
  const history = summarizeStreamHealthHistory(healthSamples, {
    bitrateKbps: targetVideoBitrateKbps,
    fps: quality.fps
  });
  const qualityAdvisor = createStreamQualityAdvisor({
    quality,
    incidents: qualityIncidents,
    history,
    recovery: recoveryStatus
  });
  const faceTracking = createFaceTrackingDiagnostics(scene, profile, faceTrackingRuntime);
  const nativeComposition = sanitizeNativeCompositionReport(createNativeCompositionReport(scene), destination.streamKey);
  const platformPublishing = createPlatformPublishingDiagnostics(destination.platform, profile.platformPublishing);
  const audioRoute = normalizeAudioRouteState(options.audioRoute ?? createDefaultAudioRouteState());
  const monitorSafety = createAudioMonitorSafetyStatus(micEffects, audioRoute);
  const checks = [
    ...readiness.issues.map<DiagnosticCheck>((issue) => ({
      code: `readiness-${issue.code}`,
      status: issue.severity === "error" ? "fail" : "warn",
      label: issue.field,
      message: issue.message
    })),
    createTransportCheck(destination.protocol),
    createEndpointCheck(redactedEndpoint),
    createStreamKeyCheck(destination.streamKey),
    createSceneCheck(scene),
    createEngineStateCheck(snapshot, sanitizedHealthMessage),
    createTelemetryBitrateCheck(snapshot, targetVideoBitrateKbps),
    createTelemetryFpsCheck(snapshot, quality.fps),
    createTelemetryDropsCheck(snapshot),
    createReconnectCheck(snapshot),
    createNativeRuntimeCheck(nativeRuntime),
    createQualityIncidentCheck(qualityIncidents),
    createQualityAdvisorCheck(qualityAdvisor),
    createFaceTrackingCheck(faceTracking),
    createNativeCompositionCheck(nativeComposition),
    createAudioRouteCheck(monitorSafety),
    createHistoryCheck(history),
    createRecoveryCheck(recoveryStatus)
  ];
  const status = summaryStatus(checks);
  const sessionHistorySummary = createStreamSessionHistorySummary(sessionSummaries);
  const targetPlatform = platformLabels[destination.platform];
  const validationEvidence = summarizeStreamValidationEvidence(validationRuns, {
    requiredTargetPlatform: targetPlatform,
    requiredTransport: destination.protocol
  });
  const validation = createStreamValidationChecklist({
    readiness,
    diagnosticStatus: status,
    target: {
      platform: targetPlatform,
      protocol: destination.protocol,
      secureTransport: destination.protocol === "rtmps"
    },
    telemetry: {
      streamStatus: snapshot.state.status,
      bitrateKbps: snapshot.health.bitrateKbps,
      fps: snapshot.health.fps,
      droppedFrames: snapshot.health.droppedFrames,
      reconnectAttempts: snapshot.health.reconnectAttempts
    },
    health: {
      sampleCount: history.sampleCount,
      stability: history.stability
    },
    session: {
      eventCount: sanitizedSessionEvents.length,
      summaryCount: sessionSummaries.length,
      historySummary: sessionHistorySummary,
      lastOutcome: sessionSummaries[0]?.outcome ?? null
    },
    evidence: validationEvidence,
    faceTracking
  });
  const audio = {
    micEffectsEnabled: micEffects.enabled,
    presetId: micEffects.presetId,
    inputGainDb: micEffects.inputGainDb,
    compression: micEffects.compression,
    monitorEnabled: micEffects.monitorEnabled,
    monitorVolume: micEffects.monitorVolume,
    monitorHeadphonesOnly: micEffects.monitorHeadphonesOnly,
    monitorSafety
  };
  const chatReadout = {
    platformChatEnabled: platformChat.enabled,
    readerEnabled: options.chatReader?.enabled ?? false,
    connectionPhase: platformChatConnection?.phase ?? (platformChat.enabled ? "idle" : "disabled"),
    connectionLabel: platformChatConnection?.label ?? "",
    connectionMessage: platformChatConnection?.message ?? ""
  };
  const validationRunbook = createStreamValidationRunbook({
    readiness,
    target: {
      platform: targetPlatform,
      protocol: destination.protocol,
      secureTransport: destination.protocol === "rtmps"
    },
    telemetry: {
      streamStatus: snapshot.state.status,
      bitrateKbps: snapshot.health.bitrateKbps,
      fps: snapshot.health.fps,
      droppedFrames: snapshot.health.droppedFrames,
      reconnectAttempts: snapshot.health.reconnectAttempts,
      elapsedSeconds: snapshot.health.elapsedSeconds
    },
    health: history,
    session: {
      summaryCount: sessionSummaries.length,
      historySummary: sessionHistorySummary,
      lastOutcome: sessionSummaries[0]?.outcome ?? null
    },
    nativeRuntime,
    nativeComposition,
    faceTracking,
    audio,
    chatReadout,
    platformPublishing,
    evidence: validationEvidence
  });

  return {
    summary: summaryText(status, checks),
    status,
    target: {
      platform: platformLabels[destination.platform],
      presetName: getDestinationPreset(destination.presetId)?.name ?? destination.name,
      protocol: destination.protocol.toUpperCase(),
      host: redactedEndpoint.host || "Invalid endpoint",
      application: redactedEndpoint.application || "-",
      publishUrlPreview: redactPublishUrl(buildPublishUrl(destination), destination.streamKey),
      streamKeyPreview: destination.streamKey ? redactStreamKey(destination.streamKey) : "Not set",
      secureTransport: destination.protocol === "rtmps"
    },
    quality: {
      resolution: `${quality.width}x${quality.height}`,
      fps: quality.fps,
      targetVideoBitrateKbps,
      targetAudioBitrateKbps,
      estimatedUploadKbps
    },
    telemetry: {
      streamStatus: snapshot.state.status,
      bitrateKbps: snapshot.health.bitrateKbps,
      fps: snapshot.health.fps,
      droppedFrames: snapshot.health.droppedFrames,
      reconnectAttempts: snapshot.health.reconnectAttempts,
      elapsedSeconds: snapshot.health.elapsedSeconds,
      message: sanitizedHealthMessage
    },
    nativeRuntime,
    recovery: {
      ...recoveryStatus,
      backoffWindow: formatRecoveryBackoff(recoveryPolicy)
    },
    qualityIncidents: {
      summary: summarizeStreamQualityIncidents(qualityIncidents),
      incidents: qualityIncidents
    },
    qualityAdvisor,
    faceTracking,
    nativeComposition,
    audio,
    audioRoute,
    chatReadout,
    platformPublishing,
    history,
    session: {
      events: sanitizedSessionEvents,
      summaries: sessionSummaries,
      lastSummary: sessionSummaries[0] ?? null,
      historySummary: sessionHistorySummary
    },
    validationEvidence,
    validation,
    validationRunbook,
    checks
  };
};

export const createStreamDiagnosticReport = (
  diagnostics: StreamDiagnostics,
  now: Date = new Date()
): StreamDiagnosticReport => ({
  generatedAt: now.toISOString(),
  app: {
    name: "MobileLiveCaster",
    reportVersion: 1
  },
  diagnostics
});

export const serializeStreamDiagnosticReport = (report: StreamDiagnosticReport): string => JSON.stringify(report, null, 2);

export const formatStreamDiagnosticReport = (report: StreamDiagnosticReport): string => {
  const diagnostics = report.diagnostics;
  const generatedAt = new Date(report.generatedAt);
  const platformPublishingFreshness = assessPlatformPublishingFreshness(diagnostics.platformPublishing, generatedAt);
  return [
    "MobileLiveCaster Diagnostics",
    `Generated: ${report.generatedAt}`,
    `Status: ${diagnostics.status}`,
    `Summary: ${diagnostics.summary}`,
    "",
    "Target",
    `- Platform: ${diagnostics.target.platform}`,
    `- Preset: ${diagnostics.target.presetName}`,
    `- Protocol: ${diagnostics.target.protocol}`,
    `- Endpoint: ${diagnostics.target.host}/${diagnostics.target.application}`,
    `- Publish URL: ${diagnostics.target.publishUrlPreview}`,
    "",
    "Quality",
    `- Resolution: ${diagnostics.quality.resolution}`,
    `- FPS: ${diagnostics.quality.fps}`,
    `- Video bitrate: ${diagnostics.quality.targetVideoBitrateKbps} kbps`,
    `- Audio bitrate: ${diagnostics.quality.targetAudioBitrateKbps} kbps`,
    `- Upload target: ${diagnostics.quality.estimatedUploadKbps} kbps`,
    "",
    "Telemetry",
    `- State: ${diagnostics.telemetry.streamStatus}`,
    `- Bitrate: ${diagnostics.telemetry.bitrateKbps} kbps`,
    `- FPS: ${diagnostics.telemetry.fps}`,
    `- Dropped frames: ${diagnostics.telemetry.droppedFrames}`,
    `- Reconnect attempts: ${diagnostics.telemetry.reconnectAttempts}`,
    `- Message: ${diagnostics.telemetry.message || "-"}`,
    "",
    "Native Runtime",
    `- Platform: ${diagnostics.nativeRuntime?.platform ?? "-"}`,
    `- Runtime status: ${diagnostics.nativeRuntime?.runtimeStatus ?? "-"}`,
    `- Publisher: ${diagnostics.nativeRuntime?.publisher.state || "-"} / cache ${diagnostics.nativeRuntime?.publisher.itemsInCache ?? 0}/${diagnostics.nativeRuntime?.publisher.cacheSize ?? 0} / congested ${diagnostics.nativeRuntime?.publisher.congested ? "yes" : "no"}`,
    `- Composition: ${diagnostics.nativeRuntime?.composition.status ?? "-"} / ${diagnostics.nativeRuntime?.composition.message || "-"}`,
    `- Composition assets: ${diagnostics.nativeRuntime?.composition.stillImageAssetLoadedCount ?? 0}/${diagnostics.nativeRuntime?.composition.stillImageAssetCount ?? 0} loaded / ${diagnostics.nativeRuntime?.composition.stillImageAssetMissingCount ?? 0} missing`,
    `- Native frames: ${diagnostics.nativeRuntime?.videoFrames ?? 0} video / ${diagnostics.nativeRuntime?.publisher.sentAudioFrames ?? 0} audio sent`,
    `- Native encoded bytes: ${diagnostics.nativeRuntime?.encodedBytes ?? 0}`,
    `- Native drops: ${diagnostics.nativeRuntime?.droppedFrames ?? 0} video / ${diagnostics.nativeRuntime?.publisher.droppedAudioFrames ?? 0} audio`,
    `- Stale: ${diagnostics.nativeRuntime?.stale ? "yes" : "no"}`,
    `- Message: ${diagnostics.nativeRuntime?.message || "-"}`,
    "",
    "Recovery",
    `- Mode: ${diagnostics.recovery.mode}`,
    `- Action: ${diagnostics.recovery.recommendedAction}`,
    `- Remaining attempts: ${diagnostics.recovery.attemptsRemaining}/${diagnostics.recovery.maxAttempts}`,
    `- Backoff: ${diagnostics.recovery.backoffWindow}`,
    `- Next retry: ${diagnostics.recovery.nextRetryDelayMs === null ? "-" : formatDelay(diagnostics.recovery.nextRetryDelayMs)}`,
    `- Message: ${diagnostics.recovery.message}`,
    "",
    "Active Quality Incidents",
    `- Summary: ${diagnostics.qualityIncidents.summary}`,
    ...(diagnostics.qualityIncidents.incidents.length === 0
      ? ["- No active quality incidents."]
      : diagnostics.qualityIncidents.incidents.map(
          (incident) => `- [${incident.severity.toUpperCase()}] ${incident.label}: ${incident.message} Recommendation: ${incident.recommendation}`
        )),
    "",
    "Quality Advisor",
    `- Action: ${diagnostics.qualityAdvisor.action}`,
    `- Severity: ${diagnostics.qualityAdvisor.severity}`,
    `- Summary: ${diagnostics.qualityAdvisor.summary}`,
    `- Reason: ${diagnostics.qualityAdvisor.reason || "-"}`,
    `- Recommendation: ${diagnostics.qualityAdvisor.recommendation}`,
    `- Current target: ${formatAdvisorTarget(diagnostics.qualityAdvisor.currentTarget)}`,
    `- Suggested target: ${diagnostics.qualityAdvisor.suggestedTarget ? formatAdvisorTarget(diagnostics.qualityAdvisor.suggestedTarget) : "-"}`,
    "",
    "Face Tracking",
    `- Status: ${diagnostics.faceTracking.status}`,
    `- Summary: ${diagnostics.faceTracking.summary}`,
    `- Input: ${diagnostics.faceTracking.inputMode}`,
    `- Runtime: ${diagnostics.faceTracking.runtimeStatus}`,
    `- Rig: ${diagnostics.faceTracking.rigMode}`,
    `- Avatars: ${diagnostics.faceTracking.visibleAvatarCount} visible / ${diagnostics.faceTracking.preparedPngTuberCount} prepared PNGTuber / ${diagnostics.faceTracking.activeMotionCount} moving`,
    `- Recommendation: ${diagnostics.faceTracking.recommendation}`,
    "",
    "Audio Validation",
    `- Mic effects: ${diagnostics.audio.micEffectsEnabled ? "on" : "off"} / preset ${diagnostics.audio.presetId} / gain ${diagnostics.audio.inputGainDb} dB / compression ${diagnostics.audio.compression}`,
    `- Monitor: ${diagnostics.audio.monitorEnabled ? "on" : "off"} / volume ${Math.round(diagnostics.audio.monitorVolume * 100)}% / headphones-only ${diagnostics.audio.monitorHeadphonesOnly ? "yes" : "no"}`,
    `- Monitor route: ${diagnostics.audio.monitorSafety.status} / ${diagnostics.audio.monitorSafety.outputName} / headphones ${diagnostics.audio.monitorSafety.headphonesConnected ? "yes" : "no"} / stale ${diagnostics.audio.monitorSafety.stale ? "yes" : "no"}`,
    `- Route action: ${diagnostics.audio.monitorSafety.recommendation}`,
    "",
    "Chat Readout",
    `- Platform chat: ${diagnostics.chatReadout.platformChatEnabled ? "on" : "off"}`,
    `- Reader: ${diagnostics.chatReadout.readerEnabled ? "on" : "off"}`,
    `- Connection: ${diagnostics.chatReadout.connectionPhase} / ${diagnostics.chatReadout.connectionLabel || "-"} / ${diagnostics.chatReadout.connectionMessage || "-"}`,
    "",
    "Native Composition",
    `- Status: ${diagnostics.nativeComposition.status}`,
    `- Coverage: ${diagnostics.nativeComposition.coverage}`,
    `- Summary: ${diagnostics.nativeComposition.summary}`,
    `- Visible sources: ${diagnostics.nativeComposition.visibleSourceCount}`,
    `- Screen sources: ${diagnostics.nativeComposition.screenSourceCount}`,
    `- Preview-only overlays: ${diagnostics.nativeComposition.previewOnlySourceCount}`,
    `- Still-image asset issues: ${diagnostics.nativeComposition.assetIssueCount}`,
    `- File-backed asset issues: ${diagnostics.nativeComposition.fileBackedAssetIssueCount}`,
    `- Avatar sources: ${diagnostics.nativeComposition.avatarSourceCount}`,
    `- Next step: ${diagnostics.nativeComposition.recommendedNextStep}`,
    ...(diagnostics.nativeComposition.issues.length === 0
      ? ["- No native composition issues."]
      : diagnostics.nativeComposition.issues.map(
          (issue) => `- [${issue.status.toUpperCase()}] ${issue.sourceKind} ${issue.sourceName}: ${issue.message} Action: ${issue.action}`
        )),
    "",
    "Platform Publishing",
    `- Status: ${diagnostics.platformPublishing.status}`,
    `- Summary: ${diagnostics.platformPublishing.summary}`,
    `- Recommendation: ${diagnostics.platformPublishing.recommendation}`,
    `- Freshness: ${platformPublishingFreshness.status} / ${platformPublishingFreshness.summary}`,
    `- Freshness action: ${platformPublishingFreshness.recommendation}`,
    "",
    "Health History",
    `- Summary: ${diagnostics.history.summary}`,
    `- Samples: ${diagnostics.history.sampleCount}`,
    `- Duration: ${formatDelay(diagnostics.history.durationSeconds * 1000)}`,
    `- Avg bitrate: ${diagnostics.history.averageBitrateKbps} kbps`,
    `- Min bitrate: ${diagnostics.history.minimumBitrateKbps} kbps`,
    `- Avg FPS: ${diagnostics.history.averageFps}`,
    `- Min FPS: ${diagnostics.history.minimumFps}`,
    `- Drop increase: ${diagnostics.history.droppedFrameIncrease}`,
    `- Observed reconnects: ${diagnostics.history.observedReconnectAttempts}`,
    "",
    "Completed Sessions",
    `- History: ${diagnostics.session.historySummary.summary}`,
    `- Clean rate: ${diagnostics.session.historySummary.cleanRate}%`,
    `- Average duration: ${formatDelay(diagnostics.session.historySummary.averageDurationSeconds * 1000)}`,
    `- Chat readout: ${diagnostics.session.historySummary.totalChatEvents} events / ${diagnostics.session.historySummary.totalChatReconnectEvents} reconnects / ${diagnostics.session.historySummary.totalChatReconnectFailures} exhausted`,
    `- Chat speech: ${diagnostics.session.historySummary.totalChatSpeechSpoken} spoken / ${diagnostics.session.historySummary.totalChatSpeechFailures} failed`,
    `- History recommendation: ${diagnostics.session.historySummary.recommendation}`,
    ...(diagnostics.session.lastSummary
      ? [
          `- Last outcome: ${diagnostics.session.lastSummary.outcome}`,
          `- Last duration: ${formatDelay(diagnostics.session.lastSummary.durationSeconds * 1000)}`,
          `- Last summary: ${diagnostics.session.lastSummary.summary}`,
          `- Last audio meter: ${formatSessionAudioLevel(diagnostics.session.lastSummary)}`,
          `- Last chat readout: ${diagnostics.session.lastSummary.chatEventCount} events / ${diagnostics.session.lastSummary.chatReconnectEventCount} reconnects / ${diagnostics.session.lastSummary.chatReconnectFailureCount} exhausted`,
          `- Last chat speech: ${diagnostics.session.lastSummary.chatSpeechSpokenCount} spoken / ${diagnostics.session.lastSummary.chatSpeechFailureCount} failed`,
          `- Last native runtime: ${formatSessionNativeRuntime(diagnostics.session.lastSummary)}`,
          `- Recommendation: ${diagnostics.session.lastSummary.recommendation}`,
          `- Stored summaries: ${diagnostics.session.summaries.length}`
        ]
      : ["- No completed session summaries yet."]),
    "",
    "Commercial Validation",
    `- Status: ${diagnostics.validation.status}`,
    `- Summary: ${diagnostics.validation.summary}`,
    `- Next step: ${diagnostics.validation.recommendedNextStep}`,
    `- Counts: ${diagnostics.validation.passCount} pass / ${diagnostics.validation.warningCount} warn / ${diagnostics.validation.failCount} fail / ${diagnostics.validation.pendingCount} pending`,
    `- Evidence: ${diagnostics.validationEvidence.summary}`,
    `- Evidence recommendation: ${diagnostics.validationEvidence.recommendation}`,
    `- Evidence runs: ${diagnostics.validationEvidence.totalRuns} retained / ${diagnostics.validationEvidence.eligibleRunCount} eligible / ${diagnostics.validationEvidence.staleRunCount} stale`,
    `- Evidence freshness: ${diagnostics.validationEvidence.latestRunAgeDays === null ? "-" : `${diagnostics.validationEvidence.latestRunAgeDays} days old`} / max ${diagnostics.validationEvidence.maxAgeDays} days`,
    `- Evidence build: ${diagnostics.validationEvidence.consistentAppBuild ?? (diagnostics.validationEvidence.appBuildMismatch ? "mismatch" : "-")}`,
    `- Evidence native runtime: ${formatValidationNativeRuntime(diagnostics)}`,
    `- Evidence face tracking: ${formatValidationFaceTracking(diagnostics)}`,
    `- Evidence audio: ${formatValidationAudio(diagnostics)}`,
    `- Evidence chat readout: ${formatValidationChatReadout(diagnostics)}`,
    `- Evidence platform dashboard: ${formatValidationPlatformPublishing(diagnostics, generatedAt)}`,
    `- Runbook: ${diagnostics.validationRunbook.status} / ${diagnostics.validationRunbook.summary}`,
    `- Runbook next: ${diagnostics.validationRunbook.nextAction}`,
    ...diagnostics.validationRunbook.items.map(
      (item) => `- [${item.status.toUpperCase()}] ${item.title}: ${item.detail} Action: ${item.action}`
    ),
    ...diagnostics.validation.items.map(
      (item) => `- [${item.status.toUpperCase()}] ${item.title}: ${item.detail} Action: ${item.action}`
    ),
    "",
    "Session Events",
    ...(diagnostics.session.events.length === 0
      ? ["- No session events recorded yet."]
      : diagnostics.session.events.map(
          (event) => `- [${event.severity.toUpperCase()}] ${event.at} ${event.title}: ${event.message}`
        )),
    "",
    "Checks",
    ...diagnostics.checks.map((check) => `- [${check.status.toUpperCase()}] ${check.label}: ${check.message}`)
  ].join("\n");
};

const allowedChatEventTitles = new Set([
  "Chat auto-connect started",
  "Chat auto-connect skipped",
  "Chat auto-disconnect stopped",
  "Chat reconnect scheduled",
  "Chat reconnect exhausted",
  "Chat speech started",
  "Chat speech spoken",
  "Chat speech failed"
]);

const sanitizeSessionEvent = (event: StreamSessionEvent, streamKey: string): StreamSessionEvent => {
  const redactedTitle = redactStreamKeyOccurrences(event.title, streamKey);
  const redactedMessage = redactStreamKeyOccurrences(event.message, streamKey);
  if (event.kind !== "chat") {
    return {
      ...event,
      title: redactedTitle,
      message: redactedMessage
    };
  }

  const title = allowedChatEventTitles.has(redactedTitle) ? redactedTitle : "Chat readout event";
  return {
    ...event,
    title,
    message: chatEventPrivacyMessage(title)
  };
};

const chatEventPrivacyMessage = (title: string): string => {
  switch (title) {
    case "Chat auto-connect started":
      return "Chat readout auto-connect started. Details redacted for viewer privacy.";
    case "Chat auto-connect skipped":
      return "Chat readout auto-connect was skipped. Details redacted for viewer privacy.";
    case "Chat auto-disconnect stopped":
      return "Chat readout disconnected when the stream stopped. Details redacted for viewer privacy.";
    case "Chat reconnect scheduled":
      return "Chat readout reconnect was scheduled. Details redacted for viewer privacy.";
    case "Chat reconnect exhausted":
      return "Chat readout reconnect retries were exhausted. Details redacted for viewer privacy.";
    case "Chat speech started":
      return "Chat readout speech started. Details redacted for viewer privacy.";
    case "Chat speech spoken":
      return "Chat readout speech completed. Details redacted for viewer privacy.";
    case "Chat speech failed":
      return "Chat readout speech failed. Details redacted for viewer privacy.";
    default:
      return "Chat readout event details redacted for viewer privacy.";
  }
};

const formatSessionAudioLevel = (summary: StreamSessionSummary): string =>
  `${summary.audioLevel.sampleCount} samples / avg ${Math.round(summary.audioLevel.averageLevel * 100)}% / peak ${Math.round(summary.audioLevel.peakLevel * 100)}% / active ${summary.audioLevel.activePercent}% / clipped ${summary.audioLevel.clippedSampleCount}`;

const formatSessionNativeRuntime = (summary: StreamSessionSummary): string =>
  summary.nativeRuntime
    ? `${summary.nativeRuntime.status} / ${summary.nativeRuntime.platform} / ${summary.nativeRuntime.publisherState || "-"} / queue ${summary.nativeRuntime.queuedItems}/${summary.nativeRuntime.cacheSize} / assets ${summary.nativeRuntime.stillImageAssetLoadedCount}/${summary.nativeRuntime.stillImageAssetCount} loaded / ${summary.nativeRuntime.stillImageAssetMissingCount} missing / drops ${summary.nativeRuntime.droppedVideoFrames} video ${summary.nativeRuntime.droppedAudioFrames} audio`
    : "-";

const formatValidationNativeRuntime = (diagnostics: StreamDiagnostics): string =>
  diagnostics.validationEvidence.latestNativeRuntime
    ? `${diagnostics.validationEvidence.nativeRuntimeRunCount} retained / ${diagnostics.validationEvidence.nativeRuntimeWarningCount} warn / ${diagnostics.validationEvidence.nativeRuntimeFailureCount} fail / latest ${diagnostics.validationEvidence.latestNativeRuntime.status} ${diagnostics.validationEvidence.latestNativeRuntime.platform} / queue ${diagnostics.validationEvidence.latestNativeRuntime.queuedItems}/${diagnostics.validationEvidence.latestNativeRuntime.cacheSize} / assets ${diagnostics.validationEvidence.latestNativeRuntime.stillImageAssetLoadedCount}/${diagnostics.validationEvidence.latestNativeRuntime.stillImageAssetCount} loaded / ${diagnostics.validationEvidence.latestNativeRuntime.stillImageAssetMissingCount} missing`
    : "-";

const formatValidationFaceTracking = (diagnostics: StreamDiagnostics): string =>
  `${diagnostics.validationEvidence.faceTrackingRunCount} retained / ${diagnostics.validationEvidence.faceTrackingReadyCount} ready / ${diagnostics.validationEvidence.faceTrackingWarningCount} warn / iOS ${diagnostics.validationEvidence.faceTrackingIosPass ? "pass" : "missing"} / Android ${diagnostics.validationEvidence.faceTrackingAndroidPass ? "pass" : "missing"} / latest ${diagnostics.validationEvidence.latestFaceTracking?.status ?? "-"} ${diagnostics.validationEvidence.latestFaceTracking?.runtimeStatus ?? "-"} / prepared ${diagnostics.validationEvidence.latestFaceTracking?.preparedPngTuberCount ?? 0} / moving ${diagnostics.validationEvidence.latestFaceTracking?.activeMotionCount ?? 0}`;

const formatValidationAudio = (diagnostics: StreamDiagnostics): string =>
  diagnostics.validationEvidence.latestAudio
    ? `${diagnostics.validationEvidence.audioRunCount} retained / ${diagnostics.validationEvidence.audioReadyCount} ready / ${diagnostics.validationEvidence.audioWarningCount} warn / iOS ${diagnostics.validationEvidence.audioIosPass ? "pass" : "missing"} / Android ${diagnostics.validationEvidence.audioAndroidPass ? "pass" : "missing"} / latest ${diagnostics.validationEvidence.latestAudio.status} ${diagnostics.validationEvidence.latestAudio.presetId} / monitor ${diagnostics.validationEvidence.latestAudio.monitorEnabled ? "on" : "off"} / headphones-only ${diagnostics.validationEvidence.latestAudio.monitorHeadphonesOnly ? "yes" : "no"} / route ${diagnostics.validationEvidence.latestAudio.monitorRouteStatus} ${diagnostics.validationEvidence.latestAudio.outputName} / samples ${diagnostics.validationEvidence.latestAudio.levelSampleCount} / peak ${Math.round(diagnostics.validationEvidence.latestAudio.peakLevel * 100)}%`
    : "-";

const formatValidationChatReadout = (diagnostics: StreamDiagnostics): string =>
  diagnostics.validationEvidence.latestChatReadout
    ? `${diagnostics.validationEvidence.chatReadoutRunCount} retained / ${diagnostics.validationEvidence.chatReadoutReadyCount} ready / ${diagnostics.validationEvidence.chatReadoutWarningCount} warn / iOS ${diagnostics.validationEvidence.chatReadoutIosPass ? "pass" : "missing"} / Android ${diagnostics.validationEvidence.chatReadoutAndroidPass ? "pass" : "missing"} / latest ${diagnostics.validationEvidence.latestChatReadout.status} ${diagnostics.validationEvidence.latestChatReadout.connectionPhase} / spoken ${diagnostics.validationEvidence.latestChatReadout.spokenMessageCount} / failed ${diagnostics.validationEvidence.latestChatReadout.speechFailureCount}`
    : "-";

const formatValidationPlatformPublishing = (diagnostics: StreamDiagnostics, now: Date): string => {
  const latestPlatformPublishing = diagnostics.validationEvidence.latestPlatformPublishing;
  if (!latestPlatformPublishing) {
    return "-";
  }

  const freshness = assessPlatformPublishingFreshness(latestPlatformPublishing, now);
  return `${diagnostics.validationEvidence.platformPublishingRunCount} retained / ${diagnostics.validationEvidence.platformPublishingWarningCount} warn / ${diagnostics.validationEvidence.platformPublishingFailureCount} fail / latest ${latestPlatformPublishing.status} ${latestPlatformPublishing.summary} / freshness ${freshness.status} ${freshness.summary}`;
};

const createPlatformPublishingDiagnostics = (
  platform: StudioProfile["destination"]["platform"],
  settings: StudioProfile["platformPublishing"]
): PlatformPublishingDiagnostics => {
  if (platform === "youtube-live") {
    return createYouTubePublishingDiagnostics(settings);
  }
  if (platform === "twitch") {
    return createTwitchPublishingDiagnostics(settings);
  }
  return {
    platform,
    status: "info",
    summary: "Custom RTMP(S) targets do not expose first-party dashboard status inside the app.",
    recommendation: "Confirm ingest health in the custom platform dashboard during private validation.",
    youtube: null,
    twitch: null
  };
};

const createYouTubePublishingDiagnostics = (
  settings: StudioProfile["platformPublishing"]
): PlatformPublishingDiagnostics => {
  const broadcastStatus = settings.youtubeBroadcastStatus || "";
  const streamStatus = settings.youtubeStreamStatus || "";
  const healthStatus = settings.youtubeStreamHealthStatus || "";
  const healthIssueCount = settings.youtubeStreamHealthIssues.length;
  const hasDashboardData = Boolean(
    settings.youtubeBroadcastId ||
      settings.youtubeStreamId ||
      broadcastStatus ||
      streamStatus ||
      healthStatus ||
      healthIssueCount > 0
  );
  const hasErrorIssue = settings.youtubeStreamHealthIssues.some((issue) => issue.trim().toLowerCase().startsWith("error:"));
  const unhealthy =
    ["failed", "revoked"].includes(broadcastStatus.toLowerCase()) ||
    ["inactive", "error"].includes(streamStatus.toLowerCase()) ||
    ["error", "bad"].includes(healthStatus.toLowerCase()) ||
    hasErrorIssue;
  const healthy =
    ["live", "testing"].includes(broadcastStatus.toLowerCase()) &&
    streamStatus.toLowerCase() === "active" &&
    ["ok", "good"].includes(healthStatus.toLowerCase()) &&
    healthIssueCount === 0;
  const status: DiagnosticStatus = !hasDashboardData ? "info" : unhealthy ? "fail" : healthy ? "pass" : "warn";

  return {
    platform: "youtube-live",
    status,
    summary:
      status === "info"
        ? "No YouTube dashboard status has been captured yet."
        : `YouTube dashboard: broadcast ${broadcastStatus || "unknown"}, stream ${streamStatus || "unknown"}, health ${healthStatus || "unknown"}, issues ${healthIssueCount}, checked ${settings.youtubeStatusCheckedAt || "not recorded"}.`,
    recommendation:
      status === "pass"
        ? "Keep the YouTube dashboard health snapshot with this release-candidate validation run."
        : status === "fail"
          ? "Fix YouTube ingest health or broadcast state before treating this run as production evidence."
          : status === "warn"
            ? "Refresh YouTube broadcast and stream health after the private ingest stabilizes."
            : "Refresh YouTube broadcast status during the next private validation run.",
    youtube: {
      hasBroadcastId: Boolean(settings.youtubeBroadcastId.trim()),
      hasStreamId: Boolean(settings.youtubeStreamId.trim()),
      broadcastStatus,
      streamStatus,
      healthStatus,
      healthIssueCount,
      statusCheckedAt: settings.youtubeStatusCheckedAt
    },
    twitch: null
  };
};

const createTwitchPublishingDiagnostics = (
  settings: StudioProfile["platformPublishing"]
): PlatformPublishingDiagnostics => {
  const liveStatus = settings.twitchLiveStatus || "";
  const hasDashboardData = Boolean(liveStatus || settings.twitchStartedAt || settings.twitchViewerCount > 0);
  const status: DiagnosticStatus = !hasDashboardData ? "info" : liveStatus.toLowerCase() === "live" ? "pass" : "warn";

  return {
    platform: "twitch",
    status,
    summary:
      status === "info"
        ? "No Twitch live-status snapshot has been captured yet."
        : `Twitch dashboard: ${liveStatus || "unknown"}, viewers ${settings.twitchViewerCount}, started ${settings.twitchStartedAt || "not reported"}, checked ${settings.twitchStatusCheckedAt || "not recorded"}.`,
    recommendation:
      status === "pass"
        ? "Keep the Twitch live-status snapshot with this release-candidate validation run."
        : status === "warn"
          ? "Refresh Twitch live status after confirming the channel is receiving ingest."
          : "Refresh Twitch live status during the next private validation run.",
    youtube: null,
    twitch: {
      liveStatus,
      viewerCount: settings.twitchViewerCount,
      hasCategory: Boolean(settings.twitchCategory.trim()),
      hasCategoryId: Boolean(settings.twitchCategoryId.trim()),
      language: settings.twitchLanguage,
      startedAt: settings.twitchStartedAt,
      statusCheckedAt: settings.twitchStatusCheckedAt
    }
  };
};

const sanitizeNativeCompositionReport = (
  report: NativeCompositionReport,
  streamKey: string
): NativeCompositionReport => ({
  ...report,
  summary: redactStreamKeyOccurrences(report.summary, streamKey),
  recommendedNextStep: redactStreamKeyOccurrences(report.recommendedNextStep, streamKey),
  issues: report.issues.map((issue) => ({
    ...issue,
    sourceName: redactStreamKeyOccurrences(issue.sourceName, streamKey),
    message: redactStreamKeyOccurrences(issue.message, streamKey),
    action: redactStreamKeyOccurrences(issue.action, streamKey)
  }))
});

const sanitizeNativeRuntime = (
  runtime: NativeRuntimeTelemetry | null,
  streamKey: string
): NativeRuntimeTelemetry | null =>
  runtime
    ? {
        ...runtime,
        message: redactStreamKeyOccurrences(runtime.message, streamKey),
        publisher: {
          ...runtime.publisher,
          lastError: redactStreamKeyOccurrences(runtime.publisher.lastError, streamKey)
        },
        composition: {
          ...runtime.composition,
          message: redactStreamKeyOccurrences(runtime.composition.message, streamKey),
          skippedKinds: runtime.composition.skippedKinds.map((kind) => redactStreamKeyOccurrences(kind, streamKey)),
          stillImageAssetMissingKinds: (runtime.composition.stillImageAssetMissingKinds ?? []).map((kind) =>
            redactStreamKeyOccurrences(kind, streamKey)
          )
        }
      }
    : null;

const formatAdvisorTarget = (target: StreamQualityAdvisorRecommendation["currentTarget"]): string =>
  `${target.profileName} (${target.width}x${target.height} / ${target.fps}fps / ${target.videoBitrateKbps} kbps, upload ${target.estimatedUploadKbps} kbps)`;

const parseEndpoint = (serverUrl: string): { host: string; application: string } => {
  try {
    const url = new URL(serverUrl.trim().replace(/\{stream_key\}.*/i, ""));
    return {
      host: url.host,
      application: url.pathname.replace(/^\/+|\/+$/g, "") || "-"
    };
  } catch {
    return { host: "", application: "" };
  }
};

const redactEndpointApplication = (application: string, streamKey: string): string =>
  redactLikelyEmbeddedStreamKeyPath(redactStreamKeyOccurrences(application, streamKey));

const redactPublishUrl = (publishUrl: string, streamKey: string): string => {
  return redactLikelyEmbeddedStreamKeyUrl(redactStreamKeyOccurrences(publishUrl, streamKey));
};

const redactStreamKeyOccurrences = (value: string, streamKey: string): string => {
  const candidates = streamKeyCandidates(streamKey);
  if (candidates.length === 0) {
    return value;
  }

  return candidates.reduce(
    (current, candidate) => replaceAll(current, candidate, redactStreamKey(candidate)),
    value
  );
};

const streamKeyCandidates = (streamKey: string): string[] => {
  const trimmed = streamKey.trim().replace(/^\/+/, "");
  const lastSegment = trimmed.split("/").filter(Boolean).at(-1) ?? "";
  return [...new Set([trimmed, lastSegment, encodeURIComponent(trimmed), encodeURIComponent(lastSegment)].filter((item) => item.length > 0))].sort(
    (left, right) => right.length - left.length
  );
};

const replaceAll = (value: string, search: string, replacement: string): string =>
  value.replace(new RegExp(escapeRegExp(search), "g"), replacement);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const redactLikelyEmbeddedStreamKeyUrl = (value: string): string => {
  try {
    const url = new URL(value);
    return redactLikelyEmbeddedStreamKeyPath(value, url.pathname);
  } catch {
    return redactLikelyEmbeddedStreamKeyPath(value);
  }
};

const redactLikelyEmbeddedStreamKeyPath = (value: string, pathValue = value): string => {
  const segment = likelyEmbeddedStreamKeySegment(pathValue);
  if (!segment) {
    return value;
  }

  const decodedSegment = safeDecodeURIComponent(segment);
  const redactedSegment = redactStreamKey(decodedSegment);
  return replaceAll(replaceAll(value, segment, redactedSegment), encodeURIComponent(decodedSegment), redactedSegment);
};

const likelyEmbeddedStreamKeySegment = (pathValue: string): string | null => {
  const segments = pathValue.split("/").filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const lastSegment = segments.at(-1) ?? "";
  return isLikelyStreamKeySegment(safeDecodeURIComponent(lastSegment)) ? lastSegment : null;
};

const isLikelyStreamKeySegment = (segment: string): boolean => {
  const normalized = segment.trim();
  if (normalized.length < 8) {
    return false;
  }
  if (/^live_[a-z0-9_]+$/i.test(normalized)) {
    return true;
  }
  return normalized.length >= 12 && /^[a-z0-9._-]+$/i.test(normalized) && /[0-9_-]/.test(normalized);
};

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const createTransportCheck = (protocol: string): DiagnosticCheck => {
  if (protocol === "rtmps") {
    return {
      code: "transport-secure",
      status: "pass",
      label: "Transport",
      message: "RTMPS is selected."
    };
  }
  return {
    code: "transport-plain-rtmp",
    status: "warn",
    label: "Transport",
    message: "RTMP is unencrypted. Prefer RTMPS when the platform supports it."
  };
};

const createEndpointCheck = (endpoint: { host: string; application: string }): DiagnosticCheck => {
  if (!endpoint.host) {
    return {
      code: "endpoint-invalid",
      status: "fail",
      label: "Endpoint",
      message: "Endpoint host could not be parsed."
    };
  }
  return {
    code: "endpoint-parsed",
    status: "pass",
    label: "Endpoint",
    message: `${endpoint.host}/${endpoint.application}`
  };
};

const createStreamKeyCheck = (streamKey: string): DiagnosticCheck => ({
  code: streamKey ? "stream-key-present" : "stream-key-missing",
  status: streamKey ? "pass" : "fail",
  label: "Stream key",
  message: streamKey ? "Stream key is present and redacted in diagnostics." : "Stream key is required before publishing."
});

const createSceneCheck = (scene: SceneDocument): DiagnosticCheck => {
  const visibleSources = scene.sources.filter((source) => source.visible);
  return {
    code: visibleSources.length > 0 ? "scene-visible" : "scene-empty",
    status: visibleSources.length > 0 ? "pass" : "fail",
    label: "Scene",
    message: `${visibleSources.length} visible source${visibleSources.length === 1 ? "" : "s"} ready.`
  };
};

const createEngineStateCheck = (snapshot: SnapshotLike, healthMessage: string): DiagnosticCheck => {
  if (snapshot.state.status === "failed") {
    return {
      code: "engine-failed",
      status: "fail",
      label: "Engine",
      message: healthMessage || "Streaming engine is in failed state."
    };
  }

  if (snapshot.state.status === "preparing" || snapshot.state.status === "stopping") {
    return {
      code: `engine-${snapshot.state.status}`,
      status: "info",
      label: "Engine",
      message: `Streaming engine is ${snapshot.state.status}.`
    };
  }

  return {
    code: `engine-${snapshot.state.status}`,
    status: "pass",
    label: "Engine",
    message: `Streaming engine state is ${snapshot.state.status}.`
  };
};

const createTelemetryBitrateCheck = (snapshot: SnapshotLike, targetVideoBitrateKbps: number): DiagnosticCheck => {
  if (snapshot.state.status !== "live" && snapshot.state.status !== "reconnecting") {
    return {
      code: "telemetry-idle",
      status: "info",
      label: "Telemetry",
      message: "Live telemetry will appear after the stream starts."
    };
  }

  const minimumHealthyBitrate = Math.round(targetVideoBitrateKbps * 0.75);
  if (snapshot.health.bitrateKbps < minimumHealthyBitrate) {
    return {
      code: "telemetry-bitrate-low",
      status: "warn",
      label: "Bitrate",
      message: `Current bitrate is below 75% of target video bitrate (${minimumHealthyBitrate} kbps).`
    };
  }

  return {
    code: "telemetry-bitrate-ok",
    status: "pass",
    label: "Bitrate",
    message: "Current bitrate is within the expected range."
  };
};

const createTelemetryFpsCheck = (snapshot: SnapshotLike, targetFps: number): DiagnosticCheck => {
  if (snapshot.state.status !== "live" && snapshot.state.status !== "reconnecting") {
    return {
      code: "telemetry-fps-idle",
      status: "info",
      label: "FPS",
      message: `${targetFps} fps target configured.`
    };
  }

  if (snapshot.health.fps < Math.max(1, targetFps - 5)) {
    return {
      code: "telemetry-fps-low",
      status: "warn",
      label: "FPS",
      message: `Current FPS is below target (${targetFps}).`
    };
  }

  return {
    code: "telemetry-fps-ok",
    status: "pass",
    label: "FPS",
    message: "Current FPS is close to target."
  };
};

const createTelemetryDropsCheck = (snapshot: SnapshotLike): DiagnosticCheck => {
  if (snapshot.state.status !== "live" && snapshot.state.status !== "reconnecting") {
    return {
      code: "telemetry-drops-idle",
      status: "info",
      label: "Dropped frames",
      message: "No dropped-frame telemetry yet."
    };
  }

  if (snapshot.health.droppedFrames > 0) {
    return {
      code: "telemetry-drops-present",
      status: "warn",
      label: "Dropped frames",
      message: `${snapshot.health.droppedFrames} dropped frame${snapshot.health.droppedFrames === 1 ? "" : "s"} reported.`
    };
  }

  return {
    code: "telemetry-drops-ok",
    status: "pass",
    label: "Dropped frames",
    message: "No dropped frames reported."
  };
};

const createReconnectCheck = (snapshot: SnapshotLike): DiagnosticCheck => {
  if (snapshot.health.reconnectAttempts > 0) {
    return {
      code: "telemetry-reconnects",
      status: "warn",
      label: "Reconnect",
      message: `${snapshot.health.reconnectAttempts} reconnect attempt${snapshot.health.reconnectAttempts === 1 ? "" : "s"} reported.`
    };
  }
  return {
    code: "telemetry-reconnects-ok",
    status: "pass",
    label: "Reconnect",
    message: "No reconnect attempts reported."
  };
};

const createQualityIncidentCheck = (incidents: StreamQualityIncident[]): DiagnosticCheck => {
  const summary = summarizeStreamQualityIncidents(incidents);
  if (incidents.some((incident) => incident.severity === "fail")) {
    return {
      code: "quality-incidents-critical",
      status: "fail",
      label: "Quality incidents",
      message: summary
    };
  }
  if (incidents.length > 0) {
    return {
      code: "quality-incidents-warn",
      status: "warn",
      label: "Quality incidents",
      message: summary
    };
  }
  return {
    code: "quality-incidents-ok",
    status: "pass",
    label: "Quality incidents",
    message: summary
  };
};

const createQualityAdvisorCheck = (advisor: StreamQualityAdvisorRecommendation): DiagnosticCheck => ({
  code: `quality-advisor-${advisor.action}`,
  status: advisor.severity,
  label: "Quality advisor",
  message: advisor.summary
});

const createFaceTrackingCheck = (faceTracking: FaceTrackingDiagnostics): DiagnosticCheck => ({
  code: `face-tracking-${faceTracking.status === "pass" ? "ready" : faceTracking.enabled ? "needs-attention" : "disabled"}`,
  status: faceTracking.status,
  label: "Face tracking",
  message: faceTracking.summary
});

const createNativeCompositionCheck = (composition: NativeCompositionReport): DiagnosticCheck => ({
  code: `native-composition-${composition.coverage}`,
  status: composition.status,
  label: "Native composition",
  message: composition.summary
});

const createAudioRouteCheck = (monitorSafety: AudioMonitorSafetyStatus): DiagnosticCheck => ({
  code: `audio-monitor-route-${monitorSafety.status}`,
  status: monitorSafety.status,
  label: "Audio monitor route",
  message: monitorSafety.summary
});

const createNativeRuntimeCheck = (runtime: NativeRuntimeTelemetry | null): DiagnosticCheck => {
  if (!runtime) {
    return {
      code: "native-runtime-unavailable",
      status: "info",
      label: "Native runtime",
      message: "Native runtime telemetry is not available yet."
    };
  }
  if (runtime.publisher.lastError || runtime.publisher.state === "failed" || runtime.runtimeStatus === "failed") {
    return {
      code: "native-runtime-failed",
      status: "fail",
      label: "Native runtime",
      message: runtime.publisher.lastError || runtime.message || "Native runtime reported a failure."
    };
  }
  if (runtime.stale) {
    return {
      code: "native-runtime-stale",
      status: "warn",
      label: "Native runtime",
      message: "Native runtime telemetry is stale."
    };
  }
  if (runtime.publisher.congested) {
    return {
      code: "native-runtime-congested",
      status: "warn",
      label: "Native runtime",
      message: `Native publisher is congested with ${runtime.publisher.itemsInCache}/${runtime.publisher.cacheSize} queued items.`
    };
  }
  const missingAssetCount = runtime.composition.stillImageAssetMissingCount ?? 0;
  if (runtime.composition.status === "pending" || runtime.composition.status === "failed" || missingAssetCount > 0) {
    return {
      code: `native-runtime-composition-${runtime.composition.status}`,
      status: "warn",
      label: "Native runtime",
      message:
        runtime.composition.message ||
        (missingAssetCount > 0
          ? `Native compositor could not load ${missingAssetCount} still-image asset${missingAssetCount === 1 ? "" : "s"}.`
          : "Native compositor has pending or failed sources.")
    };
  }
  return {
    code: `native-runtime-${runtime.platform}`,
    status: "pass",
    label: "Native runtime",
    message: runtime.message || "Native runtime telemetry is current."
  };
};

const createHistoryCheck = (history: StreamHealthHistorySummary): DiagnosticCheck => {
  if (history.stability === "unstable") {
    return {
      code: "history-unstable",
      status: "warn",
      label: "Health history",
      message: history.summary
    };
  }
  if (history.stability === "watch") {
    return {
      code: "history-watch",
      status: "warn",
      label: "Health history",
      message: history.summary
    };
  }
  if (history.stability === "stable") {
    return {
      code: "history-stable",
      status: "pass",
      label: "Health history",
      message: history.summary
    };
  }
  return {
    code: "history-empty",
    status: "info",
    label: "Health history",
    message: history.summary
  };
};

const createRecoveryCheck = (recovery: StreamRecoveryStatus): DiagnosticCheck => ({
  code: `recovery-${recovery.mode}`,
  status: recovery.severity,
  label: "Recovery",
  message: recovery.message
});

const summaryStatus = (checks: DiagnosticCheck[]): DiagnosticStatus => {
  if (checks.some((check) => check.status === "fail")) {
    return "fail";
  }
  if (checks.some((check) => check.status === "warn")) {
    return "warn";
  }
  return "pass";
};

const summaryText = (status: DiagnosticStatus, checks: DiagnosticCheck[]): string => {
  const failures = checks.filter((check) => check.status === "fail").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  if (status === "fail") {
    return `${failures} blocking diagnostic${failures === 1 ? "" : "s"} before live.`;
  }
  if (status === "warn") {
    return `${warnings} diagnostic warning${warnings === 1 ? "" : "s"} to review.`;
  }
  return "Diagnostics are clean for the configured target.";
};
