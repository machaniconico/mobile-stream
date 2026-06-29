import {
  broadcastMixerChannels,
  buildPublishUrl,
  getDestinationPreset,
  redactStreamKey,
  type BroadcastMixerProfile,
  type StudioProfile
} from "./profiles";
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
import type { PublicLaunchChecklist } from "./publicLaunchChecklist";
import type { NativeRuntimeTelemetry } from "./nativeRuntime";
import type { ReadinessReport } from "./readiness";
import type { SceneDocument } from "./scene";
import { redactSensitiveText } from "./sensitiveText";
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
  createBroadcastAudioSilenceGuardDiagnostics,
  type BroadcastAudioSilenceGuardDiagnostics
} from "./streamAudioSilenceGuard";
import {
  summarizeStreamHealthHistory,
  type StreamHealthHistorySummary,
  type StreamHealthSample
} from "./streamHealthHistory";
import type { StreamSessionEvent } from "./streamSessionLog";
import {
  createStreamSessionHistorySummary,
  type StreamAudioLevelSample,
  type StreamSessionAudioLevelSummary,
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
  createStreamRehearsalReport,
  type StreamRehearsalReport
} from "./streamRehearsal";
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
    boundStreamId: string;
    broadcastPrivacyStatus: string;
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
    channelTitle: string;
    channelCategory: string;
    channelCategoryId: string;
    channelLanguage: string;
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

export interface BroadcastAudioGuardDiagnostics {
  status: DiagnosticStatus;
  nativeProcessedSamples: number;
  nativeLimitedSamples: number;
  nativeLimitedSamplePercent: number;
  lastSessionPeakLevel: number;
  lastSessionClippedSampleCount: number;
  summary: string;
  recommendation: string;
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
    enginePlatform: string;
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
    broadcastMixer: BroadcastMixerProfile;
    broadcastMixerSummary: string;
    audioGuard: BroadcastAudioGuardDiagnostics;
    audioSilenceGuard: BroadcastAudioSilenceGuardDiagnostics;
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
  rehearsal: StreamRehearsalReport;
  checks: DiagnosticCheck[];
}

export interface StreamDiagnosticReport {
  generatedAt: string;
  app: {
    name: "MobileLiveCaster";
    reportVersion: 2;
  };
  publicLaunchChecklist: PublicLaunchChecklist | null;
  diagnostics: StreamDiagnostics;
}

interface SnapshotLike {
  platform?: string;
  state: {
    status: StreamStatus;
  };
  health: StreamHealth;
  nativeRuntime?: NativeRuntimeTelemetry | null;
}

export interface StreamDiagnosticsOptions {
  now?: number | Date;
  chatReader?: {
    enabled: boolean;
  } | null;
  platformChatConnection?: {
    phase: string;
    label?: string;
    message?: string;
  } | null;
  audioRoute?: AudioRouteState | null;
  audioLevelSamples?: StreamAudioLevelSample[];
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
  const broadcastMixer = readiness.sanitizedProfile.broadcastMixer;
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
  const faceTracking = createFaceTrackingDiagnostics(scene, profile, faceTrackingRuntime, {
    now: options.now ?? Date.now(),
    nativeRuntimeComposition: nativeRuntime?.composition ?? null
  });
  const nativeComposition = sanitizeNativeCompositionReport(createNativeCompositionReport(scene), destination.streamKey);
  const platformPublishing = createPlatformPublishingDiagnostics(destination.platform, profile.platformPublishing);
  const audioRoute = normalizeAudioRouteState(options.audioRoute ?? createDefaultAudioRouteState());
  const monitorSafety = createAudioMonitorSafetyStatus(micEffects, audioRoute);
  const audioGuard = createBroadcastAudioGuardDiagnostics(nativeRuntime?.audioProcessing ?? null, sessionSummaries[0]?.audioLevel ?? null);
  const audioSilenceGuard = createBroadcastAudioSilenceGuardDiagnostics({
    samples: options.audioLevelSamples ?? [],
    healthSamples,
    broadcastMixer,
    streamStatus: snapshot.state.status,
    elapsedSeconds: snapshot.health.elapsedSeconds
  });
  const effectiveReadiness = createEffectiveReadiness(readiness, faceTracking);
  const effectiveNativeComposition = createEffectiveNativeComposition(nativeComposition, faceTracking);
  const checks = [
    ...effectiveReadiness.issues.map<DiagnosticCheck>((issue) => ({
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
    createNativeCompositionCheck(effectiveNativeComposition),
    createBroadcastMixerCheck(broadcastMixer),
    createBroadcastAudioGuardCheck(audioGuard),
    createBroadcastAudioSilenceGuardCheck(audioSilenceGuard),
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
    readiness: effectiveReadiness,
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
    monitorSafety,
    broadcastMixer,
    broadcastMixerSummary: formatBroadcastMixerSummary(broadcastMixer),
    audioGuard,
    audioSilenceGuard
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
    nativeComposition: effectiveNativeComposition,
    faceTracking,
    audio,
    chatReadout,
    platformPublishing,
    evidence: validationEvidence
  });
  const rehearsal = createStreamRehearsalReport({
    target: {
      platform: targetPlatform,
      protocol: destination.protocol,
      secureTransport: destination.protocol === "rtmps"
    },
    telemetry: {
      streamStatus: snapshot.state.status,
      bitrateKbps: snapshot.health.bitrateKbps,
      fps: snapshot.health.fps,
      elapsedSeconds: snapshot.health.elapsedSeconds
    },
    validation,
    runbook: validationRunbook,
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
      enginePlatform: snapshot.platform ?? "unknown",
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
    nativeComposition: effectiveNativeComposition,
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
    rehearsal,
    checks
  };
};

export const createStreamDiagnosticReport = (
  diagnostics: StreamDiagnostics,
  now: Date = new Date(),
  publicLaunchChecklist: PublicLaunchChecklist | null = null
): StreamDiagnosticReport => ({
  generatedAt: now.toISOString(),
  app: {
    name: "MobileLiveCaster",
    reportVersion: 2
  },
  publicLaunchChecklist,
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
    ...(report.publicLaunchChecklist
      ? [
          "",
          "Public Launch Checklist",
          `- Status: ${report.publicLaunchChecklist.status}`,
          `- Can start: ${report.publicLaunchChecklist.canStart ? "yes" : "no"}`,
          `- Start lock: ${report.publicLaunchChecklist.startLock.applies ? "on" : "off"} / blocked ${report.publicLaunchChecklist.startLock.blocked ? "yes" : "no"}`,
          `- Lock summary: ${report.publicLaunchChecklist.startLock.summary}`,
          `- Lock action: ${report.publicLaunchChecklist.startLock.action}`,
          `- Counts: ${report.publicLaunchChecklist.passCount} pass / ${report.publicLaunchChecklist.warningCount} warn / ${report.publicLaunchChecklist.failCount} fail`,
          `- Summary: ${report.publicLaunchChecklist.summary}`,
          `- Action: ${report.publicLaunchChecklist.primaryAction}`,
          ...report.publicLaunchChecklist.items.map(
            (item) => `- [${item.status.toUpperCase()}] ${item.label}: ${item.detail} Action: ${item.action}`
          )
        ]
      : []),
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
    `- Engine platform: ${diagnostics.telemetry.enginePlatform}`,
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
    `- Composition overlays: applied ${diagnostics.nativeRuntime?.composition.appliedCount ?? 0} / skipped ${diagnostics.nativeRuntime?.composition.skippedCount ?? 0}${formatKinds(diagnostics.nativeRuntime?.composition.skippedKinds)}`,
    `- Composition assets: ${diagnostics.nativeRuntime?.composition.stillImageAssetLoadedCount ?? 0}/${diagnostics.nativeRuntime?.composition.stillImageAssetCount ?? 0} loaded / ${diagnostics.nativeRuntime?.composition.stillImageAssetMissingCount ?? 0} missing`,
    `- Composition VRM: ${diagnostics.nativeRuntime?.composition.vrmActivePoseCount ?? 0}/${diagnostics.nativeRuntime?.composition.vrmSourceCount ?? 0} active / payloads ${diagnostics.nativeRuntime?.composition.vrmPosePayloadCount ?? 0} / missing ${diagnostics.nativeRuntime?.composition.vrmMissingPoseCount ?? 0}`,
    `- Composition VRM renderer: ${diagnostics.nativeRuntime?.composition.vrmRendererStatus ?? ((diagnostics.nativeRuntime?.composition.vrmSourceCount ?? 0) > 0 ? "unavailable" : "-")} / ${diagnostics.nativeRuntime?.composition.vrmRendererBackend ?? "-"} / rendered ${diagnostics.nativeRuntime?.composition.vrmRenderedSourceCount ?? 0}/${diagnostics.nativeRuntime?.composition.vrmSourceCount ?? 0} / models ${diagnostics.nativeRuntime?.composition.vrmModelLoadedCount ?? 0}/${diagnostics.nativeRuntime?.composition.vrmModelUriCount ?? 0} / versions ${(diagnostics.nativeRuntime?.composition.vrmModelVersions ?? []).join("/") || "-"} / bones ${diagnostics.nativeRuntime?.composition.vrmHumanoidBoneCount ?? 0} / expressions ${diagnostics.nativeRuntime?.composition.vrmExpressionCount ?? 0} / primitives ${diagnostics.nativeRuntime?.composition.vrmMeshPrimitiveCount ?? 0} / triangles ${diagnostics.nativeRuntime?.composition.vrmTrianglePrimitiveCount ?? 0} / unsupported modes ${diagnostics.nativeRuntime?.composition.vrmUnsupportedPrimitiveModeCount ?? 0} / skinned ${diagnostics.nativeRuntime?.composition.vrmSkinnedMeshPrimitiveCount ?? 0} / joints ${diagnostics.nativeRuntime?.composition.vrmSkinJointCount ?? 0} / position accessors ${diagnostics.nativeRuntime?.composition.vrmPositionAccessorCount ?? 0} / normals ${diagnostics.nativeRuntime?.composition.vrmNormalAccessorCount ?? 0} / uvs ${diagnostics.nativeRuntime?.composition.vrmTexcoordAccessorCount ?? 0} / vertices ${diagnostics.nativeRuntime?.composition.vrmVertexCount ?? 0} / indices ${diagnostics.nativeRuntime?.composition.vrmIndexCount ?? 0} / bounds ${diagnostics.nativeRuntime?.composition.vrmBoundsAccessorCount ?? 0} / skin attrs ${diagnostics.nativeRuntime?.composition.vrmSkinningAttributePrimitiveCount ?? 0} / morphs ${diagnostics.nativeRuntime?.composition.vrmMorphTargetCount ?? 0} / materials ${diagnostics.nativeRuntime?.composition.vrmMaterialCount ?? 0} / transparent materials ${diagnostics.nativeRuntime?.composition.vrmTransparentMaterialCount ?? 0} / textures ${diagnostics.nativeRuntime?.composition.vrmTextureCount ?? 0} / images ${diagnostics.nativeRuntime?.composition.vrmImageCount ?? 0} / unsupported image mimes ${diagnostics.nativeRuntime?.composition.vrmUnsupportedImageMimeCount ?? 0} / pose bones ${diagnostics.nativeRuntime?.composition.vrmPoseBoneAppliedCount ?? 0}/${diagnostics.nativeRuntime?.composition.vrmPoseBoneCount ?? 0} / pose expressions ${diagnostics.nativeRuntime?.composition.vrmPoseExpressionAppliedCount ?? 0}/${diagnostics.nativeRuntime?.composition.vrmPoseExpressionCount ?? 0} / missing ${diagnostics.nativeRuntime?.composition.vrmRenderMissingCount ?? Math.max(0, (diagnostics.nativeRuntime?.composition.vrmSourceCount ?? 0) - (diagnostics.nativeRuntime?.composition.vrmRenderedSourceCount ?? 0))} / failed ${diagnostics.nativeRuntime?.composition.vrmRenderFailureCount ?? 0}`,
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
    `- Runtime age: ${diagnostics.faceTracking.runtimeAgeMs === null ? "-" : `${diagnostics.faceTracking.runtimeAgeMs} ms`} / fresh ${diagnostics.faceTracking.runtimeFresh ? "yes" : "no"}`,
    `- Native landmarks: ${Math.round((diagnostics.faceTracking.faceLandmarkConfidence ?? 0) * 100)}% / ready ${diagnostics.faceTracking.faceLandmarkReady ? "yes" : "no"}`,
    `- Rig: ${diagnostics.faceTracking.rigMode}`,
    `- Avatars: ${diagnostics.faceTracking.visibleAvatarCount} visible / ${diagnostics.faceTracking.preparedPngTuberCount} prepared PNGTuber / ${diagnostics.faceTracking.visibleVrmCount} VRM / native VRM renderer ${diagnostics.faceTracking.nativeVrmRendererReady ? "ready" : "not-ready"} / ${diagnostics.faceTracking.activeMotionCount} moving`,
    `- Rig quality: ${diagnostics.faceTracking.rigQualityScore}/100 ${diagnostics.faceTracking.rigQualityGrade}`,
    `- Rig issues: ${diagnostics.faceTracking.rigIssueCount} / ${diagnostics.faceTracking.rigIssueSummary}`,
    `- Recommendation: ${diagnostics.faceTracking.recommendation}`,
    "",
    "Audio Validation",
    `- Mic effects: ${diagnostics.audio.micEffectsEnabled ? "on" : "off"} / preset ${diagnostics.audio.presetId} / gain ${diagnostics.audio.inputGainDb} dB / compression ${diagnostics.audio.compression}`,
    `- Broadcast mix: ${diagnostics.audio.broadcastMixerSummary}`,
    `- Peak guard: ${diagnostics.audio.audioGuard.status} / ${diagnostics.audio.audioGuard.summary} Action: ${diagnostics.audio.audioGuard.recommendation}`,
    `- Silence guard: ${diagnostics.audio.audioSilenceGuard.status} / ${diagnostics.audio.audioSilenceGuard.summary} Action: ${diagnostics.audio.audioSilenceGuard.recommendation}`,
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
    `- Platform API: ${diagnostics.session.historySummary.totalPlatformApiEvents} events / ${diagnostics.session.historySummary.totalPlatformApiFailures} failed`,
    `- Chat readout: ${diagnostics.session.historySummary.totalChatEvents} events / ${diagnostics.session.historySummary.totalChatReconnectEvents} reconnects / ${diagnostics.session.historySummary.totalChatReconnectFailures} exhausted`,
    `- Chat speech: ${diagnostics.session.historySummary.totalChatSpeechSpoken} spoken / ${diagnostics.session.historySummary.totalChatSpeechFailures} failed`,
    `- Quality automation: ${diagnostics.session.historySummary.totalQualityEvents} events / ${diagnostics.session.historySummary.totalQualityLiveUpdates} live updates / ${diagnostics.session.historySummary.totalQualityNextTargets} next-start targets / ${diagnostics.session.historySummary.totalQualityUpdateFailures} failed`,
    `- History recommendation: ${diagnostics.session.historySummary.recommendation}`,
    ...(diagnostics.session.lastSummary
      ? [
          `- Last outcome: ${diagnostics.session.lastSummary.outcome}`,
          `- Last duration: ${formatDelay(diagnostics.session.lastSummary.durationSeconds * 1000)}`,
          `- Last summary: ${diagnostics.session.lastSummary.summary}`,
          `- Last audio meter: ${formatSessionAudioLevel(diagnostics.session.lastSummary)}`,
          `- Last platform API: ${diagnostics.session.lastSummary.platformApiEventCount} events / ${diagnostics.session.lastSummary.platformApiFailureCount} failed`,
          `- Last chat readout: ${diagnostics.session.lastSummary.chatEventCount} events / ${diagnostics.session.lastSummary.chatReconnectEventCount} reconnects / ${diagnostics.session.lastSummary.chatReconnectFailureCount} exhausted`,
          `- Last chat speech: ${diagnostics.session.lastSummary.chatSpeechSpokenCount} spoken / ${diagnostics.session.lastSummary.chatSpeechFailureCount} failed`,
          `- Last quality automation: ${diagnostics.session.lastSummary.qualityEventCount} events / ${diagnostics.session.lastSummary.qualityLiveUpdateCount} live updates / ${diagnostics.session.lastSummary.qualityNextTargetCount} next-start targets / ${diagnostics.session.lastSummary.qualityUpdateFailureCount} failed`,
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
    `- Evidence fingerprint: ${diagnostics.validationEvidence.fingerprint}`,
    `- Evidence run manifest: ${formatValidationEvidenceRunManifest(diagnostics.validationEvidence.runManifest)}`,
    `- Evidence freshness: ${diagnostics.validationEvidence.latestRunAgeDays === null ? "-" : `${diagnostics.validationEvidence.latestRunAgeDays} days old`} / max ${diagnostics.validationEvidence.maxAgeDays} days`,
    `- Evidence build: ${diagnostics.validationEvidence.consistentAppBuild ?? (diagnostics.validationEvidence.appBuildMismatch ? "mismatch" : "-")}`,
    `- Evidence physical devices: ${diagnostics.validationEvidence.physicalDeviceRunCount} retained / ${diagnostics.validationEvidence.physicalDeviceReadyCount} ready / ${diagnostics.validationEvidence.physicalDeviceWarningCount} warn / ${diagnostics.validationEvidence.physicalDeviceFailureCount} fail / iOS ${diagnostics.validationEvidence.physicalDeviceIosPass ? "pass" : "missing"} / Android ${diagnostics.validationEvidence.physicalDeviceAndroidPass ? "pass" : "missing"}`,
    `- Evidence monitor hold: ${formatValidationMonitorHold(diagnostics)}`,
    `- Evidence native runtime: ${formatValidationNativeRuntime(diagnostics)}`,
    `- Evidence face tracking: ${formatValidationFaceTracking(diagnostics)}`,
    `- Evidence audio: ${formatValidationAudio(diagnostics)}`,
    `- Evidence chat readout: ${formatValidationChatReadout(diagnostics)}`,
    `- Evidence quality automation: ${formatValidationQualityAutomation(diagnostics)}`,
    `- Evidence platform dashboard: ${formatValidationPlatformPublishing(diagnostics, generatedAt)}`,
    `- Evidence platform ingest: ${formatValidationPlatformIngest(diagnostics)}`,
    `- Runbook: ${diagnostics.validationRunbook.status} / ${diagnostics.validationRunbook.summary}`,
    `- Runbook next: ${diagnostics.validationRunbook.nextAction}`,
    `- Rehearsal score: ${diagnostics.rehearsal.score}/100 grade ${diagnostics.rehearsal.grade} / weak areas ${diagnostics.rehearsal.weakAreaCount}`,
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

type VrmRuntimeRenderabilityEvidence = {
  vrmMeshPrimitiveCount?: number;
  vrmTrianglePrimitiveCount?: number;
  vrmUnsupportedPrimitiveModeCount?: number;
  vrmSkinnedMeshPrimitiveCount?: number;
  vrmSkinJointCount?: number;
  vrmPositionAccessorCount?: number;
  vrmNormalAccessorCount?: number;
  vrmTexcoordAccessorCount?: number;
  vrmVertexCount?: number;
  vrmIndexCount?: number;
  vrmBoundsAccessorCount?: number;
  vrmSkinningAttributePrimitiveCount?: number;
  vrmMorphTargetCount?: number;
  vrmMaterialCount?: number;
  vrmTransparentMaterialCount?: number;
  vrmTextureCount?: number;
  vrmImageCount?: number;
  vrmUnsupportedImageMimeCount?: number;
};

const formatVrmRuntimeRenderabilityEvidence = (runtime: VrmRuntimeRenderabilityEvidence): string =>
  `primitives ${runtime.vrmMeshPrimitiveCount ?? 0} triangles ${runtime.vrmTrianglePrimitiveCount ?? 0} unsupported modes ${runtime.vrmUnsupportedPrimitiveModeCount ?? 0} skinned ${runtime.vrmSkinnedMeshPrimitiveCount ?? 0} joints ${runtime.vrmSkinJointCount ?? 0} position accessors ${runtime.vrmPositionAccessorCount ?? 0} normals ${runtime.vrmNormalAccessorCount ?? 0} uvs ${runtime.vrmTexcoordAccessorCount ?? 0} vertices ${runtime.vrmVertexCount ?? 0} indices ${runtime.vrmIndexCount ?? 0} bounds ${runtime.vrmBoundsAccessorCount ?? 0} skin attrs ${runtime.vrmSkinningAttributePrimitiveCount ?? 0} morphs ${runtime.vrmMorphTargetCount ?? 0} materials ${runtime.vrmMaterialCount ?? 0} transparent materials ${runtime.vrmTransparentMaterialCount ?? 0} textures ${runtime.vrmTextureCount ?? 0} images ${runtime.vrmImageCount ?? 0} unsupported image mimes ${runtime.vrmUnsupportedImageMimeCount ?? 0}`;

const formatKinds = (kinds: string[] | undefined): string => (kinds && kinds.length > 0 ? ` kinds ${kinds.join("/")}` : "");

const formatSessionNativeRuntime = (summary: StreamSessionSummary): string =>
  summary.nativeRuntime
    ? `${summary.nativeRuntime.status} / ${summary.nativeRuntime.platform} / ${summary.nativeRuntime.publisherState || "-"} / queue ${summary.nativeRuntime.queuedItems}/${summary.nativeRuntime.cacheSize} / overlays applied ${summary.nativeRuntime.compositionAppliedCount} skipped ${summary.nativeRuntime.compositionSkippedCount}${formatKinds(summary.nativeRuntime.compositionSkippedKinds)} / assets ${summary.nativeRuntime.stillImageAssetLoadedCount}/${summary.nativeRuntime.stillImageAssetCount} loaded / ${summary.nativeRuntime.stillImageAssetMissingCount} missing / vrm ${summary.nativeRuntime.vrmActivePoseCount}/${summary.nativeRuntime.vrmSourceCount} active payloads ${summary.nativeRuntime.vrmPosePayloadCount} missing ${summary.nativeRuntime.vrmMissingPoseCount} renderer ${summary.nativeRuntime.vrmRendererStatus} ${summary.nativeRuntime.vrmRenderedSourceCount}/${summary.nativeRuntime.vrmSourceCount} models ${summary.nativeRuntime.vrmModelLoadedCount} versions ${summary.nativeRuntime.vrmModelVersions.join("/") || "-"} bones ${summary.nativeRuntime.vrmHumanoidBoneCount} expressions ${summary.nativeRuntime.vrmExpressionCount} ${formatVrmRuntimeRenderabilityEvidence(summary.nativeRuntime)} pose bones ${summary.nativeRuntime.vrmPoseBoneAppliedCount}/${summary.nativeRuntime.vrmPoseBoneCount} pose expressions ${summary.nativeRuntime.vrmPoseExpressionAppliedCount}/${summary.nativeRuntime.vrmPoseExpressionCount} / drops ${summary.nativeRuntime.droppedVideoFrames} video ${summary.nativeRuntime.droppedAudioFrames} audio`
    : "-";

const formatValidationEvidenceRunManifest = (
  manifest: StreamDiagnostics["validationEvidence"]["runManifest"]
): string => {
  if (manifest.length === 0) {
    return "-";
  }

  return manifest
    .map((run) => {
      const scopeStatus = run.eligible ? "eligible" : run.matchesScope ? "stale" : "out-of-scope";
      return [
        `${run.devicePlatform} ${run.result} ${scopeStatus}`,
        `device ${run.physicalDevice ? "physical" : run.physicalDeviceStatus}`,
        `build ${run.appBuild}`,
        `${run.targetPlatform}/${run.transport}`,
        `${run.ageDays}d`,
        run.fingerprint,
        `native ${run.nativeRuntimeStatus ?? "-"} overlays applied ${run.nativeRuntimeCompositionAppliedCount} skipped ${run.nativeRuntimeCompositionSkippedCount}${formatKinds(run.nativeRuntimeCompositionSkippedKinds)}`,
        `landmarks ${Math.round(run.faceTrackingFaceLandmarkConfidence * 100)}% ${run.faceTrackingFaceLandmarkReady ? "ready" : "not-ready"}`,
        `avatar prepared ${run.faceTrackingPreparedPngTuberCount} vrm ${run.faceTrackingVisibleVrmCount} renderer ${run.faceTrackingNativeVrmRendererReady ? "ready" : "not-ready"} moving ${run.faceTrackingActiveMotionCount} rig ${run.faceTrackingRigQualityScore}/100 ${run.faceTrackingRigQualityGrade ?? "blocked"}`,
        `hold ${run.monitorHoldStatus ?? "-"}`,
        `audio ${run.audioStatus ?? "-"}`,
        `chat ${run.chatReadoutStatus ?? "-"}`,
        `dashboard ${run.platformPublishingStatus ?? "-"}/${run.platformPublishingFreshnessStatus ?? "-"}`
      ].join(" ");
    })
    .join(" | ");
};

const formatValidationNativeRuntime = (diagnostics: StreamDiagnostics): string =>
  diagnostics.validationEvidence.latestNativeRuntime
    ? `${diagnostics.validationEvidence.nativeRuntimeRunCount} retained / ${diagnostics.validationEvidence.nativeRuntimeReadyCount} ready / ${diagnostics.validationEvidence.nativeRuntimeWarningCount} warn / ${diagnostics.validationEvidence.nativeRuntimeFailureCount} fail / iOS ${diagnostics.validationEvidence.nativeRuntimeIosPass ? "pass" : "missing"} / Android ${diagnostics.validationEvidence.nativeRuntimeAndroidPass ? "pass" : "missing"} / latest ${diagnostics.validationEvidence.latestNativeRuntime.status} ${diagnostics.validationEvidence.latestNativeRuntime.platform} / sent ${diagnostics.validationEvidence.latestNativeRuntime.sentVideoFrames} video ${diagnostics.validationEvidence.latestNativeRuntime.sentAudioFrames} audio / bytes ${diagnostics.validationEvidence.latestNativeRuntime.bytesWritten} / queue ${diagnostics.validationEvidence.latestNativeRuntime.queuedItems}/${diagnostics.validationEvidence.latestNativeRuntime.cacheSize} / overlays applied ${diagnostics.validationEvidence.latestNativeRuntime.compositionAppliedCount} skipped ${diagnostics.validationEvidence.latestNativeRuntime.compositionSkippedCount}${formatKinds(diagnostics.validationEvidence.latestNativeRuntime.compositionSkippedKinds)} / assets ${diagnostics.validationEvidence.latestNativeRuntime.stillImageAssetLoadedCount}/${diagnostics.validationEvidence.latestNativeRuntime.stillImageAssetCount} loaded / ${diagnostics.validationEvidence.latestNativeRuntime.stillImageAssetMissingCount} missing / vrm ${diagnostics.validationEvidence.latestNativeRuntime.vrmActivePoseCount}/${diagnostics.validationEvidence.latestNativeRuntime.vrmSourceCount} active payloads ${diagnostics.validationEvidence.latestNativeRuntime.vrmPosePayloadCount} missing ${diagnostics.validationEvidence.latestNativeRuntime.vrmMissingPoseCount} renderer ${diagnostics.validationEvidence.latestNativeRuntime.vrmRendererStatus} ${diagnostics.validationEvidence.latestNativeRuntime.vrmRenderedSourceCount}/${diagnostics.validationEvidence.latestNativeRuntime.vrmSourceCount} models ${diagnostics.validationEvidence.latestNativeRuntime.vrmModelLoadedCount} versions ${diagnostics.validationEvidence.latestNativeRuntime.vrmModelVersions.join("/") || "-"} bones ${diagnostics.validationEvidence.latestNativeRuntime.vrmHumanoidBoneCount} expressions ${diagnostics.validationEvidence.latestNativeRuntime.vrmExpressionCount} ${formatVrmRuntimeRenderabilityEvidence(diagnostics.validationEvidence.latestNativeRuntime)} pose bones ${diagnostics.validationEvidence.latestNativeRuntime.vrmPoseBoneAppliedCount}/${diagnostics.validationEvidence.latestNativeRuntime.vrmPoseBoneCount} pose expressions ${diagnostics.validationEvidence.latestNativeRuntime.vrmPoseExpressionAppliedCount}/${diagnostics.validationEvidence.latestNativeRuntime.vrmPoseExpressionCount}`
    : "-";

const formatValidationMonitorHold = (diagnostics: StreamDiagnostics): string =>
  diagnostics.validationEvidence.latestMonitorHold
    ? `${diagnostics.validationEvidence.monitorHoldRunCount} retained / ${diagnostics.validationEvidence.monitorHoldReadyCount} ready / ${diagnostics.validationEvidence.monitorHoldWarningCount} warn / ${diagnostics.validationEvidence.monitorHoldFailureCount} fail / iOS ${diagnostics.validationEvidence.monitorHoldIosPass ? "pass" : "missing"} / Android ${diagnostics.validationEvidence.monitorHoldAndroidPass ? "pass" : "missing"} / latest ${diagnostics.validationEvidence.latestMonitorHold.status} ${diagnostics.validationEvidence.latestMonitorHold.durationSeconds}s ${diagnostics.validationEvidence.latestMonitorHold.sampleCount} samples / ${diagnostics.validationEvidence.latestMonitorHold.stability} / avg ${diagnostics.validationEvidence.latestMonitorHold.averageBitrateKbps} kbps ${diagnostics.validationEvidence.latestMonitorHold.averageFps} fps / min ${diagnostics.validationEvidence.latestMonitorHold.minimumBitrateKbps} kbps ${diagnostics.validationEvidence.latestMonitorHold.minimumFps} fps / drops ${diagnostics.validationEvidence.latestMonitorHold.droppedFrameIncrease} / reconnects ${diagnostics.validationEvidence.latestMonitorHold.observedReconnectAttempts}`
    : "-";

const formatValidationFaceTracking = (diagnostics: StreamDiagnostics): string =>
  `${diagnostics.validationEvidence.faceTrackingRunCount} retained / ${diagnostics.validationEvidence.faceTrackingReadyCount} ready / ${diagnostics.validationEvidence.faceTrackingWarningCount} warn / iOS ${diagnostics.validationEvidence.faceTrackingIosPass ? "pass" : "missing"} / Android ${diagnostics.validationEvidence.faceTrackingAndroidPass ? "pass" : "missing"} / latest ${diagnostics.validationEvidence.latestFaceTracking?.status ?? "-"} ${diagnostics.validationEvidence.latestFaceTracking?.runtimeStatus ?? "-"} / landmarks ${Math.round((diagnostics.validationEvidence.latestFaceTracking?.faceLandmarkConfidence ?? 0) * 100)}% ${diagnostics.validationEvidence.latestFaceTracking?.faceLandmarkReady ? "ready" : "not-ready"} / prepared ${diagnostics.validationEvidence.latestFaceTracking?.preparedPngTuberCount ?? 0} / vrm ${diagnostics.validationEvidence.latestFaceTracking?.visibleVrmCount ?? 0} renderer ${diagnostics.validationEvidence.latestFaceTracking?.nativeVrmRendererReady ? "ready" : "not-ready"} / moving ${diagnostics.validationEvidence.latestFaceTracking?.activeMotionCount ?? 0} / rig quality ${diagnostics.validationEvidence.latestFaceTracking?.rigQualityScore ?? 0}/100 ${diagnostics.validationEvidence.latestFaceTracking?.rigQualityGrade ?? "blocked"}`;

const formatValidationAudio = (diagnostics: StreamDiagnostics): string =>
  diagnostics.validationEvidence.latestAudio
    ? `${diagnostics.validationEvidence.audioRunCount} retained / ${diagnostics.validationEvidence.audioReadyCount} ready / ${diagnostics.validationEvidence.audioWarningCount} warn / iOS ${diagnostics.validationEvidence.audioIosPass ? "pass" : "missing"} / Android ${diagnostics.validationEvidence.audioAndroidPass ? "pass" : "missing"} / latest ${diagnostics.validationEvidence.latestAudio.status} ${diagnostics.validationEvidence.latestAudio.presetId} / monitor ${diagnostics.validationEvidence.latestAudio.monitorEnabled ? "on" : "off"} / headphones-only ${diagnostics.validationEvidence.latestAudio.monitorHeadphonesOnly ? "yes" : "no"} / route ${diagnostics.validationEvidence.latestAudio.monitorRouteStatus} ${diagnostics.validationEvidence.latestAudio.outputName} / native monitor ${diagnostics.validationEvidence.latestAudio.nativeMonitorReported ? (diagnostics.validationEvidence.latestAudio.nativeMonitorRunning ? "running" : "reported") : "missing"} ${diagnostics.validationEvidence.latestAudio.nativeMonitorWrittenFrames}/${diagnostics.validationEvidence.latestAudio.nativeMonitorDroppedFrames} frames / samples ${diagnostics.validationEvidence.latestAudio.levelSampleCount} / peak ${Math.round(diagnostics.validationEvidence.latestAudio.peakLevel * 100)}%`
    : "-";

const formatBroadcastMixerSummary = (mixer: BroadcastMixerProfile): string =>
  broadcastMixerChannels
    .map((channel) => {
      const settings = mixer[channel.id];
      const level = settings.muted || settings.volume <= 0 ? "muted" : `${Math.round(settings.volume * 100)}%`;
      return `${channel.shortLabel} ${level}`;
    })
    .join(" / ");

const createBroadcastAudioGuardDiagnostics = (
  audioProcessing: NativeRuntimeTelemetry["audioProcessing"] | null | undefined,
  lastAudioLevel: StreamSessionAudioLevelSummary | null | undefined
): BroadcastAudioGuardDiagnostics => {
  const nativeProcessedSamples = Math.max(0, Math.round(audioProcessing?.micEffectsProcessedSamples ?? 0));
  const nativeLimitedSamples = Math.max(0, Math.round(audioProcessing?.micEffectsLimitedSamples ?? 0));
  const nativeLimitedSamplePercent =
    nativeProcessedSamples > 0 ? Math.round((nativeLimitedSamples / nativeProcessedSamples) * 1000) / 10 : 0;
  const lastSessionPeakLevel = lastAudioLevel?.peakLevel ?? 0;
  const lastSessionClippedSampleCount = lastAudioLevel?.clippedSampleCount ?? 0;

  if (nativeProcessedSamples > 0 && nativeLimitedSamplePercent >= 5) {
    return {
      status: "fail",
      nativeProcessedSamples,
      nativeLimitedSamples,
      nativeLimitedSamplePercent,
      lastSessionPeakLevel,
      lastSessionClippedSampleCount,
      summary: `Native mic limiter is catching ${nativeLimitedSamplePercent}% of processed samples.`,
      recommendation: "Lower mic gain or compression before starting a public stream."
    };
  }

  if (nativeProcessedSamples > 0 && nativeLimitedSamplePercent >= 1) {
    return {
      status: "warn",
      nativeProcessedSamples,
      nativeLimitedSamples,
      nativeLimitedSamplePercent,
      lastSessionPeakLevel,
      lastSessionClippedSampleCount,
      summary: `Native mic limiter is catching ${nativeLimitedSamplePercent}% of processed samples.`,
      recommendation: "Reduce gain slightly and repeat the private mic monitor check."
    };
  }

  if (lastSessionClippedSampleCount > 0) {
    return {
      status: "warn",
      nativeProcessedSamples,
      nativeLimitedSamples,
      nativeLimitedSamplePercent,
      lastSessionPeakLevel,
      lastSessionClippedSampleCount,
      summary: `Last session peaked at ${Math.round(lastSessionPeakLevel * 100)}% with ${lastSessionClippedSampleCount} clipped meter sample${lastSessionClippedSampleCount === 1 ? "" : "s"}.`,
      recommendation: "Lower mic gain and record a new private validation run."
    };
  }

  if (nativeProcessedSamples === 0 && !lastAudioLevel) {
    return {
      status: "info",
      nativeProcessedSamples,
      nativeLimitedSamples,
      nativeLimitedSamplePercent,
      lastSessionPeakLevel,
      lastSessionClippedSampleCount,
      summary: "No native limiter or retained meter evidence yet.",
      recommendation: "Run a private spoken audio check before approving a production stream."
    };
  }

  return {
    status: "pass",
    nativeProcessedSamples,
    nativeLimitedSamples,
    nativeLimitedSamplePercent,
    lastSessionPeakLevel,
    lastSessionClippedSampleCount,
    summary:
      nativeProcessedSamples > 0
        ? `Native mic limiter is below threshold at ${nativeLimitedSamplePercent}%.`
        : `Last session peak was ${Math.round(lastSessionPeakLevel * 100)}% with no clipped meter samples.`,
    recommendation: "Keep this audio peak baseline with validation evidence."
  };
};

const formatValidationChatReadout = (diagnostics: StreamDiagnostics): string =>
  diagnostics.validationEvidence.latestChatReadout
    ? `${diagnostics.validationEvidence.chatReadoutRunCount} retained / ${diagnostics.validationEvidence.chatReadoutReadyCount} ready / ${diagnostics.validationEvidence.chatReadoutWarningCount} warn / iOS ${diagnostics.validationEvidence.chatReadoutIosPass ? "pass" : "missing"} / Android ${diagnostics.validationEvidence.chatReadoutAndroidPass ? "pass" : "missing"} / latest ${diagnostics.validationEvidence.latestChatReadout.status} ${diagnostics.validationEvidence.latestChatReadout.connectionPhase} / spoken ${diagnostics.validationEvidence.latestChatReadout.spokenMessageCount} / failed ${diagnostics.validationEvidence.latestChatReadout.speechFailureCount}`
    : "-";

const formatValidationQualityAutomation = (diagnostics: StreamDiagnostics): string =>
  diagnostics.validationEvidence.latestQualityAutomation
    ? `${diagnostics.validationEvidence.qualityAutomationRunCount} retained / live ${diagnostics.validationEvidence.qualityAutomationLiveUpdateCount} / next-start ${diagnostics.validationEvidence.qualityAutomationNextTargetCount} / failed ${diagnostics.validationEvidence.qualityAutomationFailureCount} / latest ${diagnostics.validationEvidence.latestQualityAutomation.status} ${diagnostics.validationEvidence.latestQualityAutomation.summary}`
    : "-";

const formatValidationPlatformPublishing = (diagnostics: StreamDiagnostics, now: Date): string => {
  const latestPlatformPublishing = diagnostics.validationEvidence.latestPlatformPublishing;
  const latestFreshness = diagnostics.validationEvidence.latestPlatformPublishingFreshness;
  if (!latestPlatformPublishing && !latestFreshness) {
    return "-";
  }

  const freshness = latestFreshness ?? assessPlatformPublishingFreshness(latestPlatformPublishing, now);
  return `${diagnostics.validationEvidence.platformPublishingRunCount} retained / ${diagnostics.validationEvidence.platformPublishingReadyCount} ready / ${diagnostics.validationEvidence.platformPublishingFreshCount} fresh / ${diagnostics.validationEvidence.platformPublishingFreshnessWarningCount} freshness warn / ${diagnostics.validationEvidence.platformPublishingWarningCount} warn / ${diagnostics.validationEvidence.platformPublishingFailureCount} fail / iOS ${diagnostics.validationEvidence.platformPublishingIosPass ? "pass" : "missing"} / Android ${diagnostics.validationEvidence.platformPublishingAndroidPass ? "pass" : "missing"} / latest ${latestPlatformPublishing?.status ?? "-"} ${latestPlatformPublishing?.summary ?? "-"} / freshness ${freshness.status} ${freshness.summary}`;
};

const formatValidationPlatformIngest = (diagnostics: StreamDiagnostics): string =>
  `${diagnostics.validationEvidence.platformIngestRunCount} retained / ${diagnostics.validationEvidence.platformIngestReadyCount} ready / ${diagnostics.validationEvidence.platformIngestWarningCount} warn / ${diagnostics.validationEvidence.platformIngestFailureCount} fail / iOS ${diagnostics.validationEvidence.platformIngestIosPass ? "pass" : "missing"} / Android ${diagnostics.validationEvidence.platformIngestAndroidPass ? "pass" : "missing"}`;

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
  const boundStreamId = settings.youtubeBroadcastBoundStreamId || "";
  const broadcastPrivacyStatus = settings.youtubeBroadcastPrivacyStatus || "";
  const streamStatus = settings.youtubeStreamStatus || "";
  const healthStatus = settings.youtubeStreamHealthStatus || "";
  const healthIssueCount = settings.youtubeStreamHealthIssues.length;
  const hasDashboardData = Boolean(
    settings.youtubeBroadcastId ||
      settings.youtubeStreamId ||
      broadcastStatus ||
      boundStreamId ||
      broadcastPrivacyStatus ||
      streamStatus ||
      healthStatus ||
      healthIssueCount > 0
  );
  const privacyMismatch = Boolean(broadcastPrivacyStatus && broadcastPrivacyStatus !== settings.privacyStatus);
  const streamBindingMismatch = Boolean(boundStreamId && settings.youtubeStreamId && boundStreamId !== settings.youtubeStreamId);
  const hasErrorIssue = settings.youtubeStreamHealthIssues.some((issue) => issue.trim().toLowerCase().startsWith("error:"));
  const unhealthy =
    privacyMismatch ||
    streamBindingMismatch ||
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
        : `YouTube dashboard: broadcast ${broadcastStatus || "unknown"}, bound stream ${boundStreamId || "unknown"} (app ${settings.youtubeStreamId || "unknown"}), privacy ${broadcastPrivacyStatus || "unknown"} (app ${settings.privacyStatus}), stream ${streamStatus || "unknown"}, health ${healthStatus || "unknown"}, issues ${healthIssueCount}, checked ${settings.youtubeStatusCheckedAt || "not recorded"}.`,
    recommendation:
      status === "pass"
        ? "Keep the YouTube dashboard health snapshot with this release-candidate validation run."
        : status === "fail"
          ? streamBindingMismatch
            ? "Recreate or rebind the YouTube broadcast so the bound stream matches the app stream key."
            : privacyMismatch
            ? "Refresh or recreate the YouTube broadcast so dashboard privacy matches the app setting."
            : "Fix YouTube ingest health or broadcast state before treating this run as production evidence."
          : status === "warn"
            ? "Refresh YouTube broadcast and stream health after the private ingest stabilizes."
            : "Refresh YouTube broadcast status during the next private validation run.",
    youtube: {
      hasBroadcastId: Boolean(settings.youtubeBroadcastId.trim()),
      hasStreamId: Boolean(settings.youtubeStreamId.trim()),
      broadcastStatus,
      boundStreamId,
      broadcastPrivacyStatus,
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
  const channelTitle = settings.twitchChannelTitle || "";
  const channelCategory = settings.twitchChannelCategory || "";
  const channelCategoryId = settings.twitchChannelCategoryId || "";
  const channelLanguage = settings.twitchChannelLanguage || "";
  const hasMetadataSnapshot = Boolean(
    settings.twitchStatusCheckedAt ||
      channelTitle ||
      channelCategory ||
      channelCategoryId ||
      channelLanguage
  );
  const titleMismatch = Boolean(
    hasMetadataSnapshot &&
      settings.title &&
      normalizeTwitchDiagnosticDisplay(channelTitle) !== normalizeTwitchDiagnosticDisplay(settings.title)
  );
  const categoryIdMismatch = Boolean(
    hasMetadataSnapshot &&
      settings.twitchCategoryId &&
      (!channelCategoryId ||
        normalizeTwitchDiagnosticComparable(channelCategoryId) !== normalizeTwitchDiagnosticComparable(settings.twitchCategoryId))
  );
  const matchingCategoryIds = Boolean(
    channelCategoryId &&
      settings.twitchCategoryId &&
      normalizeTwitchDiagnosticComparable(channelCategoryId) === normalizeTwitchDiagnosticComparable(settings.twitchCategoryId)
  );
  const categoryNameMismatch = Boolean(
    hasMetadataSnapshot &&
    !categoryIdMismatch &&
      !matchingCategoryIds &&
      settings.twitchCategory &&
      normalizeTwitchDiagnosticComparable(channelCategory) !== normalizeTwitchDiagnosticComparable(settings.twitchCategory)
  );
  const languageMismatch = Boolean(
    hasMetadataSnapshot &&
      settings.twitchLanguage &&
      normalizeTwitchDiagnosticComparable(channelLanguage) !== normalizeTwitchDiagnosticComparable(settings.twitchLanguage)
  );
  const metadataMismatch = titleMismatch || categoryIdMismatch || categoryNameMismatch || languageMismatch;
  const hasDashboardData = Boolean(
    liveStatus ||
      settings.twitchStartedAt ||
      settings.twitchViewerCount > 0 ||
      channelTitle ||
      channelCategory ||
      channelCategoryId ||
      channelLanguage
  );
  const status: DiagnosticStatus = !hasDashboardData
    ? "info"
    : metadataMismatch
      ? "fail"
      : liveStatus.toLowerCase() === "live"
        ? "pass"
        : "warn";

  return {
    platform: "twitch",
    status,
    summary:
      status === "info"
        ? "No Twitch live-status snapshot has been captured yet."
        : `Twitch dashboard: ${liveStatus || "unknown"}, title ${channelTitle || "unknown"} (app ${settings.title || "unknown"}), category ${channelCategory || "unknown"}${channelCategoryId ? ` (${channelCategoryId})` : ""} (app ${settings.twitchCategory || "unknown"}${settings.twitchCategoryId ? ` (${settings.twitchCategoryId})` : ""}), language ${channelLanguage || "unknown"} (app ${settings.twitchLanguage || "unknown"}), viewers ${settings.twitchViewerCount}, started ${settings.twitchStartedAt || "not reported"}, checked ${settings.twitchStatusCheckedAt || "not recorded"}.`,
    recommendation:
      status === "pass"
        ? "Keep the Twitch live-status snapshot with this release-candidate validation run."
        : status === "fail"
          ? "Apply Twitch metadata and refresh dashboard status so the Twitch dashboard title, category, and language match the app settings."
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
      channelTitle,
      channelCategory,
      channelCategoryId,
      channelLanguage,
      startedAt: settings.twitchStartedAt,
      statusCheckedAt: settings.twitchStatusCheckedAt
    }
  };
};

const normalizeTwitchDiagnosticDisplay = (value: string): string => value.trim().replace(/\s+/g, " ");

const normalizeTwitchDiagnosticComparable = (value: string): string => normalizeTwitchDiagnosticDisplay(value).toLowerCase();

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
        },
        audioProcessing: runtime.audioProcessing
          ? {
              ...runtime.audioProcessing,
              monitorLastError: redactStreamKeyOccurrences(runtime.audioProcessing.monitorLastError, streamKey)
            }
          : undefined
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
  const redactedStreamKeys = candidates.reduce(
    (current, candidate) => replaceAll(current, candidate, redactStreamKey(candidate)),
    value
  );
  return redactSensitiveText(redactedStreamKeys);
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

const createEffectiveReadiness = (
  readiness: ReadinessReport,
  faceTracking: FaceTrackingDiagnostics
): ReadinessReport => {
  const issues = readiness.issues.filter(
    (issue) =>
      !(
        (issue.code === "scene-vrm-preview" || issue.code === "scene-native-composition-preview-only-overlays") &&
        faceTracking.nativeVrmRendererReady &&
        !readiness.issues.some((candidate) => candidate.code.startsWith("scene-vrm-model-"))
      )
  );

  if (issues.length === readiness.issues.length) {
    return readiness;
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  return {
    ...readiness,
    issues,
    errorCount,
    warningCount: issues.length - errorCount,
    canStart: errorCount === 0
  };
};

const createEffectiveNativeComposition = (
  composition: NativeCompositionReport,
  faceTracking: FaceTrackingDiagnostics
): NativeCompositionReport => {
  if (
    composition.coverage !== "preview-only-overlays" ||
    !faceTracking.nativeVrmRendererReady ||
    composition.assetIssueCount > 0 ||
    composition.unsupportedSourceKinds.some((kind) => kind !== "vrm")
  ) {
    return composition;
  }

  return {
    ...composition,
    status: "pass",
    coverage: "native-overlays",
    summary: `${faceTracking.visibleVrmCount} visible VRM/VRoid source${faceTracking.visibleVrmCount === 1 ? "" : "s"} are covered by retained native renderer proof.`,
    recommendedNextStep: "Keep the native VRM renderer proof with the release-candidate validation run.",
    previewOnlySourceCount: 0,
    requiresNativeCompositor: false,
    unsupportedSourceKinds: [],
    issues: composition.issues.filter((issue) => issue.sourceKind !== "vrm")
  };
};

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

const createBroadcastMixerCheck = (mixer: BroadcastMixerProfile): DiagnosticCheck => {
  const micLive = !mixer.mic.muted && mixer.mic.volume > 0;
  const appLive = !mixer.appAudio.muted && mixer.appAudio.volume > 0;
  const chatLive = !mixer.chatReadout.muted && mixer.chatReadout.volume > 0;
  const summary = formatBroadcastMixerSummary(mixer);

  if (!micLive && !appLive && !chatLive) {
    return {
      code: "broadcast-mixer-silent",
      status: "fail",
      label: "Broadcast mixer",
      message: `All broadcast audio channels are muted or set to zero. ${summary}`
    };
  }

  if (!micLive) {
    return {
      code: "broadcast-mixer-mic-muted",
      status: "warn",
      label: "Broadcast mixer",
      message: `The mic channel is muted or set to zero in the broadcast mix. ${summary}`
    };
  }

  return {
    code: "broadcast-mixer-ready",
    status: "pass",
    label: "Broadcast mixer",
    message: summary
  };
};

const createBroadcastAudioGuardCheck = (audioGuard: BroadcastAudioGuardDiagnostics): DiagnosticCheck => ({
  code: `broadcast-audio-guard-${audioGuard.status}`,
  status: audioGuard.status,
  label: "Audio peak guard",
  message: audioGuard.summary
});

const createBroadcastAudioSilenceGuardCheck = (
  audioSilenceGuard: BroadcastAudioSilenceGuardDiagnostics
): DiagnosticCheck => ({
  code: `broadcast-audio-silence-guard-${audioSilenceGuard.status}`,
  status: audioSilenceGuard.status,
  label: "Audio silence guard",
  message: audioSilenceGuard.summary
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
  const missingVrmPoseCount = runtime.composition.vrmMissingPoseCount ?? 0;
  const vrmSourceCount = runtime.composition.vrmSourceCount ?? 0;
  const vrmRendererStatus = runtime.composition.vrmRendererStatus ?? (vrmSourceCount > 0 ? "unavailable" : "not-required");
  const vrmRenderedSourceCount = runtime.composition.vrmRenderedSourceCount ?? 0;
  const vrmRenderMissingCount = runtime.composition.vrmRenderMissingCount ?? Math.max(0, vrmSourceCount - vrmRenderedSourceCount);
  const vrmRenderFailureCount = runtime.composition.vrmRenderFailureCount ?? 0;
  const vrmModelLoadedCount = runtime.composition.vrmModelLoadedCount ?? 0;
  const incompleteVrmModelMetadata =
    vrmModelLoadedCount > 0 && ((runtime.composition.vrmHumanoidBoneCount ?? 0) === 0 || (runtime.composition.vrmExpressionCount ?? 0) === 0);
  const incompleteVrmRenderability =
    vrmModelLoadedCount > 0 &&
    ((runtime.composition.vrmMeshPrimitiveCount ?? 0) === 0 ||
      (runtime.composition.vrmSkinnedMeshPrimitiveCount ?? 0) === 0 ||
      (runtime.composition.vrmSkinJointCount ?? 0) === 0 ||
      (runtime.composition.vrmPositionAccessorCount ?? 0) === 0 ||
      (runtime.composition.vrmVertexCount ?? 0) === 0 ||
      (runtime.composition.vrmTrianglePrimitiveCount ?? 0) < (runtime.composition.vrmMeshPrimitiveCount ?? 0) ||
      (runtime.composition.vrmUnsupportedPrimitiveModeCount ?? 0) > 0 ||
      (runtime.composition.vrmUnsupportedImageMimeCount ?? 0) > 0 ||
      ((runtime.composition.vrmImageCount ?? 0) > 0 && (runtime.composition.vrmTexcoordAccessorCount ?? 0) === 0) ||
      (runtime.composition.vrmSkinningAttributePrimitiveCount ?? 0) <
        (runtime.composition.vrmSkinnedMeshPrimitiveCount ?? 0));
  const incompleteVrmPoseMapping =
    vrmModelLoadedCount > 0 &&
    ((runtime.composition.vrmPoseBoneUnsupportedCount ?? 0) > 0 ||
      (runtime.composition.vrmPoseExpressionUnsupportedCount ?? 0) > 0);
  const incompleteVrmRendering =
    vrmSourceCount > 0 &&
    (vrmRendererStatus !== "ready" ||
      vrmRenderedSourceCount < vrmSourceCount ||
      vrmRenderMissingCount > 0 ||
      vrmRenderFailureCount > 0 ||
      incompleteVrmModelMetadata ||
      incompleteVrmRenderability ||
      incompleteVrmPoseMapping);
  if (
    runtime.composition.status === "pending" ||
    runtime.composition.status === "failed" ||
    missingAssetCount > 0 ||
    missingVrmPoseCount > 0 ||
    incompleteVrmRendering
  ) {
    return {
      code: `native-runtime-composition-${runtime.composition.status}`,
      status: "warn",
      label: "Native runtime",
      message:
        runtime.composition.message ||
        (missingAssetCount > 0
          ? `Native compositor could not load ${missingAssetCount} still-image asset${missingAssetCount === 1 ? "" : "s"}.`
            : missingVrmPoseCount > 0
              ? `Native compositor is missing ${missingVrmPoseCount} VRM pose payload${missingVrmPoseCount === 1 ? "" : "s"}.`
              : incompleteVrmModelMetadata
                ? "Native VRM model metadata is missing humanoid bones or expressions."
                : incompleteVrmRenderability
                  ? "Native VRM model metadata is missing triangle primitives, POSITION vertices, textured UVs, supported PNG/JPEG images, skinned meshes, skin joints, or skinning attributes."
                  : incompleteVrmPoseMapping
                    ? "Native VRM pose payload has bones or expressions unsupported by the loaded model."
                    : incompleteVrmRendering
                      ? `Native VRM renderer is ${vrmRendererStatus} (${vrmRenderedSourceCount}/${vrmSourceCount} rendered).`
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
