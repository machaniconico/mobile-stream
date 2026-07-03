import {
  Activity,
  ArrowDown,
  ArrowUp,
  Clapperboard,
  Copy,
  Download,
  Eye,
  EyeOff,
  Headphones,
  KeyRound,
  Layers,
  Lock,
  Megaphone,
  MessageCircle,
  Mic,
  MonitorSmartphone,
  Pin,
  Play,
  Plus,
  Radio,
  RotateCcw,
  SlidersHorizontal,
  ShieldCheck,
  Square,
  Unlock,
  Volume2,
  Wand2,
  Wifi
} from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { AvatarExpression, AvatarRuntimeState } from "../domain/avatar";
import { createAvatarIllustrationRigTuningSummary } from "../domain/avatarIllustrationRigQuality";
import {
  normalizeMutedWordsInput,
  selectChatOverlayMessages,
  type ChatReaderSettings,
  type ChatReaderState
} from "../domain/chatReader";
import type { FaceTrackingRuntimeState } from "../domain/faceTracking";
import { createDiagnosticRedactionSecrets } from "../domain/diagnosticSecrets";
import type { LiveCaptionSettings, LiveCaptionState } from "../domain/liveCaption";
import { getPlatformChatConnectionStatus, type PlatformChatSettings } from "../domain/platformChat";
import type { PlatformChatAuthSession, PlatformChatConnectionState } from "../domain/platformChatConnection";
import type {
  PlatformChatOAuthCredentialStore,
  PlatformChatOAuthFlow,
  PlatformChatOAuthSettings,
  TwitchDeviceCodeOAuthFlow
} from "../domain/platformChatOAuth";
import type { YouTubeBroadcastTransitionStatus } from "../domain/platformPublishing";
import {
  assessPlatformPublishingFreshness,
  type PlatformPublishingFreshness,
  type PlatformPublishingFreshnessStatus
} from "../domain/platformPublishingFreshness";
import {
  createPublicLaunchChecklist,
  type PublicLaunchChecklist,
  type PublicLaunchChecklistItemStatus
} from "../domain/publicLaunchChecklist";
import { getPlatformStreamKeyOperationInfo, resolvePlatformStreamKeyOperationPlatform } from "../domain/platformStreamKeys";
import {
  applyMicEffectPreset,
  broadcastMixerChannels,
  micEffectPresets,
  type BroadcastMixerChannelId,
  type MicEffectPresetId,
  type StudioProfile
} from "../domain/profiles";
import type { ReadinessReport } from "../domain/readiness";
import {
  addSource,
  analyzeAvatarIllustrationAlphaMask,
  activateTimedTextSource,
  applyInferredAvatarIllustrationRig,
  applyTextOverlayPresetStyle,
  createAvatarIllustrationLandmarkAnalysisFromPixelFeatures,
  createAvatarIllustrationLandmarkAnalysisFromDetector,
  createSource,
  createTextOverlayPresetSource,
  createTextOverlayRuntimeStatus,
  defaultAvatarIllustrationRig,
  defaultAvatarMotion,
  applyQuickTextOverlayPreset,
  quickTextOverlayDurationPresets,
  quickTextOverlayPresetActions,
  quickTextOverlayPresetGroups,
  manualTextOverlayPresets,
  queueTimedTextOverlay,
  reorderSource,
  setLocked,
  setVisibility,
  hideTextOverlays,
  showPersistentTextOverlay,
  showTimedTextOverlay,
  toRenderGraph,
  updateSource,
  updateTransform,
  type AvatarIllustrationDetectorFace,
  type CaptionOverlayCue,
  type SceneDocument,
  type AvatarIllustrationRig,
  type AvatarIllustrationRigInferenceInput,
  type RenderNode,
  type SceneSource,
  type SceneTemplateId,
  type SceneTransitionKind,
  type SceneTransitionPreview,
  type SceneTransitionSettings,
  type QuickTextOverlayPresetAction,
  type QuickTextOverlayPresetId,
  type ManualTextOverlayPresetId,
  type TextSourceAlign,
  type TextSourceContentSource,
  type TextSourceMode,
  type TextSourceTimerMode,
  type TextSourceVisibilityMode,
  type TextOverlayRuntimeStatus,
  type TextOverlayPresetId,
  type SourceKind
} from "../domain/scene";
import type { StreamOperationStatus } from "../domain/streamOperation";
import type { StreamHealthSample } from "../domain/streamHealthHistory";
import {
  createStreamStartPreflightReport,
  type StreamStartPreflightReport
} from "../domain/streamStartPreflight";
import {
  createStreamDiagnosticReport,
  createStreamDiagnostics,
  serializeStreamDiagnosticReport,
  type StreamDiagnostics
} from "../domain/streamDiagnostics";
import { createStreamAnnouncementPreview } from "../domain/streamAnnouncement";
import { applyStreamQualityAdvisorTarget } from "../domain/streamQualityAdvisor";
import type { StreamQualityAutomationDecision } from "../domain/streamQualityAutomation";
import type { StreamSessionEvent } from "../domain/streamSessionLog";
import type { StreamAudioLevelSample, StreamSessionSummary } from "../domain/streamSessionSummary";
import {
  createStreamValidationAudioMonitorPreview,
  createStreamValidationNativeRuntimePreview,
  createStreamValidationRun,
  formatStreamValidationRunAudioLabel,
  type StreamValidationDevicePlatform,
  type StreamValidationFeatureStatus,
  type StreamValidationRun,
  type StreamValidationRunResult
} from "../domain/streamValidationEvidence";
import type { NativeEngineSnapshot } from "../native/LiveCasterNative";
import {
  createSupportBundle,
  serializeSupportBundle
} from "../domain/supportBundle";
import { LiveSetupScreen } from "./LiveSetupScreen";
import { PanelTitle } from "./ui";

interface StudioScreenProps {
  scene: SceneDocument;
  scenes: SceneDocument[];
  activeSceneId: string;
  sceneTransitionSettings: SceneTransitionSettings;
  sceneTransitionPreview: SceneTransitionPreview | null;
  profile: StudioProfile;
  selectedSourceId: string;
  snapshot: NativeEngineSnapshot;
  streamSessionEvents: StreamSessionEvent[];
  streamHealthSamples: StreamHealthSample[];
  streamSessionSummaries: StreamSessionSummary[];
  audioLevelSamples: StreamAudioLevelSample[];
  streamValidationRuns: StreamValidationRun[];
  qualityAutomationDecision: StreamQualityAutomationDecision;
  operationStatus: StreamOperationStatus | null;
  streamAnnouncementPromptNonce: number;
  streamAnnouncementAutoPostStatus: string;
  streamAnnouncementWebhookStorageNotice: string;
  readiness: ReadinessReport;
  liveCaption: LiveCaptionState;
  liveCaptionCues: CaptionOverlayCue[];
  chatReader: ChatReaderState;
  platformChat: PlatformChatSettings;
  platformChatAuth: PlatformChatAuthSession;
  platformChatOAuth: PlatformChatOAuthSettings;
  platformChatOAuthCredentials: PlatformChatOAuthCredentialStore;
  platformChatOAuthFlow: PlatformChatOAuthFlow | null;
  twitchDeviceOAuthFlow: TwitchDeviceCodeOAuthFlow | null;
  platformChatOAuthStatus: string;
  platformStreamKeyStatus: string;
  platformPublishingStatus: string;
  platformApiOperationLabel: string | null;
  platformChatConnection: PlatformChatConnectionState;
  avatarRuntime: AvatarRuntimeState;
  faceTrackingRuntime: FaceTrackingRuntimeState;
  onSceneChange(scene: SceneDocument): void;
  onSceneSwitch(sceneId: string): void;
  onSceneCreate(templateId: SceneTemplateId): void;
  onSceneDuplicate(): void;
  onSceneTransitionChange(settings: Partial<SceneTransitionSettings>): void;
  onProfileChange(profile: StudioProfile): void;
  onSelectSource(sourceId: string): void;
  onMicLevelChange(level: number): void;
  onExpressionChange(expression: AvatarExpression): void;
  onFaceTrackingCalibrate(): void;
  onStart(): Promise<void>;
  onStop(): Promise<void>;
  onReconnect(): Promise<void>;
  onChatCommentSubmit(author: string, body: string): void;
  onChatCommentPin(messageId: string): void;
  onChatCommentUnpin(): void;
  onChatReaderSettingsChange(settings: Partial<ChatReaderSettings>): void;
  onChatCommentsClear(): void;
  onLiveCaptionSettingsChange(settings: Partial<LiveCaptionSettings>): void;
  onLiveCaptionClear(): void;
  onLiveCaptionTestCue(): void;
  onPlatformChatSettingsChange(settings: Partial<PlatformChatSettings>): void;
  onPlatformChatAuthChange(settings: Partial<PlatformChatAuthSession>): void;
  onPlatformChatOAuthChange(settings: Partial<PlatformChatOAuthSettings>): void;
  onPlatformChatOAuthStart(): void | Promise<void>;
  onTwitchDeviceOAuthStart(): void | Promise<void>;
  onTwitchDeviceOAuthPoll(): void | Promise<void>;
  onPlatformChatOAuthCallbackApply(): void | Promise<void>;
  onPlatformStreamKeyApply(): void | Promise<void>;
  onPlatformPublishingApply(): void | Promise<void>;
  onPlatformPublishingStatusRefresh(): void | Promise<void>;
  onYouTubeBroadcastTransition(status: YouTubeBroadcastTransitionStatus): void | Promise<void>;
  onStreamAnnouncementWebhookTest(): void | Promise<void>;
  onPlatformChatConnect(): void;
  onPlatformChatDisconnect(): void;
  onPlatformChatSampleIngest(): void;
  onClearStreamKey(): void;
  onPrivacyShieldActivate(): void | Promise<void>;
  onClearStreamSessionSummaries(): void;
  onRecordStreamValidationRun(run: StreamValidationRun): void;
  onClearStreamValidationRuns(): void;
}

const sourceLabels: Record<SourceKind, string> = {
  screen: "Screen",
  pngtuber: "PNGTuber",
  live2d: "Live2D",
  vrm: "VRM",
  image: "Image",
  solid: "Solid",
  text: "Text",
  chat: "Chat"
};

const sourceKinds: SourceKind[] = ["pngtuber", "live2d", "vrm", "chat", "text", "image", "solid"];
const textSourceModes: Array<{ mode: TextSourceMode; label: string }> = [
  { mode: "label", label: "Label" },
  { mode: "subtitle", label: "Subtitle" },
  { mode: "ticker", label: "Ticker" },
  { mode: "caption", label: "Caption" }
];
const textSourceContentSources: Array<{ contentSource: TextSourceContentSource; label: string }> = [
  { contentSource: "manual", label: "Manual" },
  { contentSource: "runtime-caption", label: "Live caption" }
];
const textSourceVisibilityModes: Array<{ visibilityMode: TextSourceVisibilityMode; label: string }> = [
  { visibilityMode: "always", label: "Always" },
  { visibilityMode: "timed", label: "Timed" }
];
const textSourceTimerModes: Array<{ timerMode: TextSourceTimerMode; label: string }> = [
  { timerMode: "none", label: "Static" },
  { timerMode: "countdown", label: "Countdown" },
  { timerMode: "uptime", label: "Uptime" }
];
const textOverlayPresets: Array<{ presetId: TextOverlayPresetId; label: string }> = [
  { presetId: "title", label: "Title" },
  { presetId: "subtitle", label: "Subtitle" },
  { presetId: "lower-third", label: "Lower Third" },
  { presetId: "notice", label: "Notice" },
  { presetId: "ticker", label: "Ticker" },
  { presetId: "badge", label: "Badge" },
  { presetId: "starting-soon-countdown", label: "Starting Soon countdown" },
  { presetId: "uptime-badge", label: "Uptime badge" },
  { presetId: "live-caption", label: "Live Caption" }
];
const textSourceAlignments: TextSourceAlign[] = ["left", "center", "right"];
const sceneTransitionKinds: Array<{ kind: SceneTransitionKind; label: string }> = [
  { kind: "cut", label: "Cut" },
  { kind: "fade", label: "Fade" }
];

const expressions: AvatarExpression[] = ["neutral", "happy", "angry", "surprised"];

const downloadStreamDiagnosticReport = (
  diagnostics: StreamDiagnostics,
  publicLaunchChecklist: PublicLaunchChecklist,
  secrets: string[] = []
) => {
  const generatedAt = new Date();
  const report = serializeStreamDiagnosticReport(createStreamDiagnosticReport(diagnostics, generatedAt, publicLaunchChecklist), { secrets });
  const blob = new Blob([report], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `mobile-live-caster-diagnostics-${generatedAt.toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const downloadSupportBundle = ({
  scene,
  profile,
  readiness,
  preflight,
  diagnostics,
  secrets
}: {
  scene: SceneDocument;
  profile: StudioProfile;
  readiness: ReadinessReport;
  preflight: StreamStartPreflightReport;
  diagnostics: StreamDiagnostics;
  secrets: string[];
}) => {
  const generatedAt = new Date();
  const bundle = serializeSupportBundle(
    createSupportBundle({
      scene,
      profile,
      readiness,
      preflight,
      diagnostics,
      now: generatedAt
    }),
    { secrets }
  );
  const blob = new Blob([bundle], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `mobile-live-caster-support-${generatedAt.toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

type VrmRenderabilityLabelMetrics = {
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

const vrmRenderabilityMetricLabel = (metrics: VrmRenderabilityLabelMetrics): string =>
  `primitives ${metrics.vrmMeshPrimitiveCount ?? 0} triangles ${metrics.vrmTrianglePrimitiveCount ?? 0} unsupported modes ${metrics.vrmUnsupportedPrimitiveModeCount ?? 0} skinned ${metrics.vrmSkinnedMeshPrimitiveCount ?? 0} joints ${metrics.vrmSkinJointCount ?? 0} position ${metrics.vrmPositionAccessorCount ?? 0} normals ${metrics.vrmNormalAccessorCount ?? 0} uvs ${metrics.vrmTexcoordAccessorCount ?? 0} vertices ${metrics.vrmVertexCount ?? 0} indices ${metrics.vrmIndexCount ?? 0} bounds ${metrics.vrmBoundsAccessorCount ?? 0} skin attrs ${metrics.vrmSkinningAttributePrimitiveCount ?? 0} morphs ${metrics.vrmMorphTargetCount ?? 0} materials ${metrics.vrmMaterialCount ?? 0} transparent materials ${metrics.vrmTransparentMaterialCount ?? 0} textures ${metrics.vrmTextureCount ?? 0} images ${metrics.vrmImageCount ?? 0} unsupported image mimes ${metrics.vrmUnsupportedImageMimeCount ?? 0}`;

type Live2DPoseLabelMetrics = {
  live2dSourceCount?: number;
  live2dPosePayloadCount?: number;
  live2dActivePoseCount?: number;
  live2dMissingPoseCount?: number;
  live2dRuntimeStatuses?: string[];
};

const live2dPoseMetricLabel = (metrics: Live2DPoseLabelMetrics): string => {
  const statuses =
    metrics.live2dRuntimeStatuses && metrics.live2dRuntimeStatuses.length > 0
      ? ` statuses ${metrics.live2dRuntimeStatuses.join("/")}`
      : "";
  return `live2d ${metrics.live2dActivePoseCount ?? 0}/${metrics.live2dSourceCount ?? 0} active payloads ${metrics.live2dPosePayloadCount ?? 0} missing ${metrics.live2dMissingPoseCount ?? 0}${statuses}`;
};

const recoveryMetricLabel = (diagnostics: StreamDiagnostics): string => {
  const retryDelay =
    diagnostics.recovery.nextRetryDelayMs === null ? "" : ` / next ${Math.round(diagnostics.recovery.nextRetryDelayMs / 1000)}s`;
  return `${diagnostics.recovery.mode} / ${diagnostics.recovery.attemptsRemaining} retries left${retryDelay}`;
};

const historyMetricLabel = (diagnostics: StreamDiagnostics): string =>
  diagnostics.history.sampleCount === 0
    ? "No samples yet"
    : `${diagnostics.history.stability} / avg ${diagnostics.history.averageBitrateKbps} kbps / ${diagnostics.history.averageFps} fps`;

const sessionMetricLabel = (diagnostics: StreamDiagnostics): string =>
  diagnostics.session.lastSummary
    ? `${diagnostics.session.lastSummary.outcome} / ${Math.round(diagnostics.session.lastSummary.durationSeconds)}s / ${diagnostics.session.lastSummary.eventCount} events${diagnostics.session.lastSummary.nativeRuntime ? ` / native ${diagnostics.session.lastSummary.nativeRuntime.status}` : ""}`
    : "No completed sessions yet";

const nativeOverlayProofMetricLabel = ({
  appliedCount,
  skippedCount,
  skippedKinds
}: {
  appliedCount: number;
  skippedCount: number;
  skippedKinds?: string[];
}): string =>
  `overlays applied ${appliedCount} skipped ${skippedCount}${skippedKinds && skippedKinds.length > 0 ? ` kinds ${skippedKinds.join("/")}` : ""}`;

const liveRenderGraphMetricLabel = ({
  liveRenderGraphReloadCount,
  liveRenderGraphRejectedUpdateCount
}: {
  liveRenderGraphReloadCount?: number;
  liveRenderGraphRejectedUpdateCount?: number;
}): string => `live reloads ${liveRenderGraphReloadCount ?? 0} rejected ${liveRenderGraphRejectedUpdateCount ?? 0}`;

const sessionNativeRuntimeLabel = (summary: StreamSessionSummary): string =>
  summary.nativeRuntime
    ? `${summary.nativeRuntime.status} / ${summary.nativeRuntime.platform} / ${summary.nativeRuntime.publisherState || "-"} / queue ${summary.nativeRuntime.queuedItems}/${summary.nativeRuntime.cacheSize} / ${nativeOverlayProofMetricLabel({
        appliedCount: summary.nativeRuntime.compositionAppliedCount,
        skippedCount: summary.nativeRuntime.compositionSkippedCount,
        skippedKinds: summary.nativeRuntime.compositionSkippedKinds
      })} / ${liveRenderGraphMetricLabel(summary.nativeRuntime)} / ${live2dPoseMetricLabel(summary.nativeRuntime)} / vrm ${summary.nativeRuntime.vrmActivePoseCount}/${summary.nativeRuntime.vrmSourceCount} active payloads ${summary.nativeRuntime.vrmPosePayloadCount} renderer ${summary.nativeRuntime.vrmRendererStatus} ${summary.nativeRuntime.vrmRenderedSourceCount}/${summary.nativeRuntime.vrmSourceCount} models ${summary.nativeRuntime.vrmModelLoadedCount} bones ${summary.nativeRuntime.vrmHumanoidBoneCount} expressions ${vrmRenderabilityMetricLabel(summary.nativeRuntime)} pose ${summary.nativeRuntime.vrmPoseBoneAppliedCount}/${summary.nativeRuntime.vrmPoseBoneCount} bones ${summary.nativeRuntime.vrmPoseExpressionAppliedCount}/${summary.nativeRuntime.vrmPoseExpressionCount} expressions / drops ${summary.nativeRuntime.droppedVideoFrames} video ${summary.nativeRuntime.droppedAudioFrames} audio`
    : "No native runtime evidence stored.";

const sessionHistoryMetricLabel = (diagnostics: StreamDiagnostics): string =>
  diagnostics.session.historySummary.totalSessions === 0
    ? "No baseline yet"
    : `${diagnostics.session.historySummary.stability} / ${diagnostics.session.historySummary.cleanRate}% clean / avg ${diagnostics.session.historySummary.averageDurationSeconds}s`;

const validationMetricLabel = (diagnostics: StreamDiagnostics): string =>
  `${diagnostics.validation.status} / ${diagnostics.validation.pendingCount} pending / ${diagnostics.validation.failCount} fail`;

const rehearsalMetricLabel = (diagnostics: StreamDiagnostics): string =>
  `${diagnostics.rehearsal.score}/100 ${diagnostics.rehearsal.grade} / ${diagnostics.rehearsal.status} / ${diagnostics.rehearsal.weakAreaCount} weak`;

const platformPublishingFreshnessMetricLabel = (
  diagnostics: StreamDiagnostics,
  freshness: PlatformPublishingFreshness
): string =>
  `${diagnostics.platformPublishing.status} / ${freshness.status}${freshness.ageMinutes === null ? "" : ` / ${freshness.ageMinutes}m old`}`;

const nativeCompositionMetricLabel = (diagnostics: StreamDiagnostics): string =>
  `${diagnostics.nativeComposition.coverage} / overlays ${diagnostics.nativeComposition.nativeOverlayCount} / text ${diagnostics.nativeComposition.textOverlayCount} / caption ${diagnostics.nativeComposition.captionOverlayCount} / chat ${diagnostics.nativeComposition.chatOverlayCount} / ${diagnostics.nativeComposition.previewOnlySourceCount} preview-only`;

const nativeRuntimeMonitorMetricLabel = (diagnostics: StreamDiagnostics): string => {
  const audioProcessing = diagnostics.nativeRuntime?.audioProcessing;
  if (!audioProcessing?.monitorEnabled) {
    return "";
  }
  const monitorStatus = audioProcessing.monitorRunning ? "on" : audioProcessing.monitorHeadphonesConnected ? "ready" : "blocked";
  const route = audioProcessing.monitorOutputName || audioProcessing.monitorRoute || "Unknown";
  const latency = audioProcessing.monitorEstimatedLatencyMs > 0 ? ` / ${audioProcessing.monitorEstimatedLatencyMs}ms` : "";
  return ` / monitor ${monitorStatus} ${audioProcessing.monitorWrittenFrames}/${audioProcessing.monitorDroppedFrames} ${route}${latency}`;
};

const nativeRuntimeMetricLabel = (diagnostics: StreamDiagnostics): string =>
  diagnostics.nativeRuntime
    ? `${diagnostics.nativeRuntime.platform} / ${diagnostics.nativeRuntime.publisher.state || diagnostics.nativeRuntime.runtimeStatus} / ${diagnostics.nativeRuntime.composition.status} / ${nativeOverlayProofMetricLabel({
        appliedCount: diagnostics.nativeRuntime.composition.appliedCount,
        skippedCount: diagnostics.nativeRuntime.composition.skippedCount,
        skippedKinds: diagnostics.nativeRuntime.composition.skippedKinds
      })} / ${liveRenderGraphMetricLabel(diagnostics.nativeRuntime.composition)} / assets ${diagnostics.nativeRuntime.composition.stillImageAssetLoadedCount ?? 0}/${diagnostics.nativeRuntime.composition.stillImageAssetCount ?? 0} decoded ${diagnostics.nativeRuntime.composition.stillImageAssetDecodedCount ?? 0} decoded pixels ${diagnostics.nativeRuntime.composition.stillImageAssetDecodedPixelCount ?? 0} composited ${diagnostics.nativeRuntime.composition.stillImageAssetCompositedCount ?? 0} composited pixels ${diagnostics.nativeRuntime.composition.stillImageAssetCompositedPixelCount ?? 0} / app-group ${diagnostics.nativeRuntime.composition.stillImageAssetAppGroupLoadedCount ?? 0}/${diagnostics.nativeRuntime.composition.stillImageAssetAppGroupCount ?? 0} loaded ${diagnostics.nativeRuntime.composition.stillImageAssetAppGroupDecodedCount ?? 0} decoded pixels ${diagnostics.nativeRuntime.composition.stillImageAssetAppGroupDecodedPixelCount ?? 0} ${diagnostics.nativeRuntime.composition.stillImageAssetAppGroupCompositedCount ?? 0} composited pixels ${diagnostics.nativeRuntime.composition.stillImageAssetAppGroupCompositedPixelCount ?? 0} / ${live2dPoseMetricLabel(diagnostics.nativeRuntime.composition)} / vrm ${diagnostics.nativeRuntime.composition.vrmActivePoseCount ?? 0}/${diagnostics.nativeRuntime.composition.vrmSourceCount ?? 0} active payloads ${diagnostics.nativeRuntime.composition.vrmPosePayloadCount ?? 0} renderer ${diagnostics.nativeRuntime.composition.vrmRendererStatus ?? ((diagnostics.nativeRuntime.composition.vrmSourceCount ?? 0) > 0 ? "unavailable" : "not-required")} ${diagnostics.nativeRuntime.composition.vrmRenderedSourceCount ?? 0}/${diagnostics.nativeRuntime.composition.vrmSourceCount ?? 0} models ${diagnostics.nativeRuntime.composition.vrmModelLoadedCount ?? 0} bones ${diagnostics.nativeRuntime.composition.vrmHumanoidBoneCount ?? 0} expressions ${diagnostics.nativeRuntime.composition.vrmExpressionCount ?? 0} ${vrmRenderabilityMetricLabel(diagnostics.nativeRuntime.composition)} pose ${(diagnostics.nativeRuntime.composition.vrmPoseBoneAppliedCount ?? 0)}/${diagnostics.nativeRuntime.composition.vrmPoseBoneCount ?? 0} bones ${(diagnostics.nativeRuntime.composition.vrmPoseExpressionAppliedCount ?? 0)}/${diagnostics.nativeRuntime.composition.vrmPoseExpressionCount ?? 0} expressions${diagnostics.nativeRuntime.audioProcessing?.micEffectsEnabled ? ` / mic fx ${diagnostics.nativeRuntime.audioProcessing.micEffectsPresetId} ${diagnostics.nativeRuntime.audioProcessing.micEffectsProcessedFrames}` : ""}${nativeRuntimeMonitorMetricLabel(diagnostics)}${diagnostics.nativeRuntime.stale ? " / stale" : ""}${diagnostics.nativeRuntime.publisher.congested ? " / congested" : ""}`
    : "Not linked";

const audioGuardMetricLabel = (diagnostics: StreamDiagnostics): string =>
  `${diagnostics.audio.audioGuard.status} / limiter ${diagnostics.audio.audioGuard.nativeLimitedSamplePercent}% / peak ${Math.round(diagnostics.audio.audioGuard.lastSessionPeakLevel * 100)}%`;

const audioSilenceGuardMetricLabel = (diagnostics: StreamDiagnostics): string =>
  `${diagnostics.audio.audioSilenceGuard.status} / samples ${diagnostics.audio.audioSilenceGuard.sampleCount} / active ${diagnostics.audio.audioSilenceGuard.activePercent}% / peak ${Math.round(diagnostics.audio.audioSilenceGuard.peakLevel * 100)}%`;

const qualityIncidentSummaryTone = (diagnostics: StreamDiagnostics): "pass" | "warn" | "fail" => {
  if (diagnostics.qualityIncidents.incidents.some((incident) => incident.severity === "fail")) {
    return "fail";
  }
  return diagnostics.qualityIncidents.incidents.length > 0 ? "warn" : "pass";
};

const qualityAdvisorTone = (diagnostics: StreamDiagnostics): "pass" | "warn" | "fail" =>
  diagnostics.qualityAdvisor.severity === "fail" ? "fail" : diagnostics.qualityAdvisor.severity === "warn" ? "warn" : "pass";

const qualityAdvisorTargetLabel = (diagnostics: StreamDiagnostics): string =>
  diagnostics.qualityAdvisor.suggestedTarget
    ? `${diagnostics.qualityAdvisor.suggestedTarget.profileName} / ${diagnostics.qualityAdvisor.suggestedTarget.videoBitrateKbps} kbps / ${diagnostics.qualityAdvisor.suggestedTarget.fps}fps`
    : "Current target";

const qualityAutomationTone = (decision: StreamQualityAutomationDecision): "pass" | "warn" | "fail" =>
  decision.command === "none" ? "pass" : decision.severity === "fail" ? "fail" : "warn";

const sessionSummaryTone = (summary: StreamSessionSummary): "pass" | "warn" | "fail" =>
  summary.outcome === "clean" ? "pass" : summary.outcome;

const sessionHistoryTone = (diagnostics: StreamDiagnostics): "pass" | "warn" | "fail" =>
  diagnostics.session.historySummary.stability === "baseline"
    ? "pass"
    : diagnostics.session.historySummary.stability === "unstable"
      ? "fail"
      : "warn";

const validationTone = (diagnostics: StreamDiagnostics): "pass" | "warn" | "fail" =>
  diagnostics.validation.status === "ready" ? "pass" : diagnostics.validation.status === "blocked" ? "fail" : "warn";

const validationItemTone = (
  status: StreamDiagnostics["validation"]["items"][number]["status"] | StreamValidationFeatureStatus
): "pass" | "warn" | "fail" =>
  status === "fail" ? "fail" : status === "pass" ? "pass" : "warn";

export const StudioScreen = ({
  scene,
  scenes,
  activeSceneId,
  sceneTransitionSettings,
  sceneTransitionPreview,
  profile,
  selectedSourceId,
  snapshot,
  streamSessionEvents,
  streamHealthSamples,
  streamSessionSummaries,
  audioLevelSamples,
  streamValidationRuns,
  qualityAutomationDecision,
  operationStatus,
  streamAnnouncementPromptNonce,
  streamAnnouncementAutoPostStatus,
  streamAnnouncementWebhookStorageNotice,
  readiness,
  liveCaption,
  liveCaptionCues,
  chatReader,
  platformChat,
  platformChatAuth,
  platformChatOAuth,
  platformChatOAuthCredentials,
  platformChatOAuthFlow,
  twitchDeviceOAuthFlow,
  platformChatOAuthStatus,
  platformStreamKeyStatus,
  platformPublishingStatus,
  platformApiOperationLabel,
  platformChatConnection,
  avatarRuntime,
  faceTrackingRuntime,
  onSceneChange,
  onSceneSwitch,
  onSceneCreate,
  onSceneDuplicate,
  onSceneTransitionChange,
  onProfileChange,
  onSelectSource,
  onMicLevelChange,
  onExpressionChange,
  onFaceTrackingCalibrate,
  onStart,
  onStop,
  onReconnect,
  onChatCommentSubmit,
  onChatCommentPin,
  onChatCommentUnpin,
  onChatReaderSettingsChange,
  onChatCommentsClear,
  onLiveCaptionSettingsChange,
  onLiveCaptionClear,
  onLiveCaptionTestCue,
  onPlatformChatSettingsChange,
  onPlatformChatAuthChange,
  onPlatformChatOAuthChange,
  onPlatformChatOAuthStart,
  onTwitchDeviceOAuthStart,
  onTwitchDeviceOAuthPoll,
  onPlatformChatOAuthCallbackApply,
  onPlatformStreamKeyApply,
  onPlatformPublishingApply,
  onPlatformPublishingStatusRefresh,
  onYouTubeBroadcastTransition,
  onStreamAnnouncementWebhookTest,
  onPlatformChatConnect,
  onPlatformChatDisconnect,
  onPlatformChatSampleIngest,
  onClearStreamKey,
  onPrivacyShieldActivate,
  onClearStreamSessionSummaries,
  onRecordStreamValidationRun,
  onClearStreamValidationRuns
}: StudioScreenProps) => {
  const selectedSource = scene.sources.find((source) => source.id === selectedSourceId) ?? scene.sources[0];
  const isLive = snapshot.state.status === "live" || snapshot.state.status === "reconnecting";
  const isBusy = snapshot.state.status === "preparing" || snapshot.state.status === "stopping";
  const operationBusy = operationStatus?.kind === "pending";
  const platformApiBusy = Boolean(platformApiOperationLabel);
  const setupLocked = isLive || isBusy || operationBusy || platformApiBusy;
  const sceneSwitchLocked = isBusy || operationBusy || platformApiBusy;
  const chatOverlayMessages = selectChatOverlayMessages(chatReader);
  const [textOverlayClock, setTextOverlayClock] = useState(() => Date.now());
  const [quickSubtitleText, setQuickSubtitleText] = useState("");
  const [quickTextPresetId, setQuickTextPresetId] = useState<ManualTextOverlayPresetId>("subtitle");
  const [quickTextDurationMs, setQuickTextDurationMs] = useState(() => quickTextOverlayDurationPresets[1]?.durationMs ?? 5000);
  const [quickTextPresetAction, setQuickTextPresetAction] = useState<QuickTextOverlayPresetAction>("show");
  const [streamAnnouncementPromptVisible, setStreamAnnouncementPromptVisible] = useState(false);
  const [streamAnnouncementShareStatus, setStreamAnnouncementShareStatus] = useState("");
  const quickSubtitleLocked = isBusy || operationBusy || platformApiBusy;
  const canShowQuickSubtitle = quickSubtitleText.trim().length > 0 && !quickSubtitleLocked;
  const canQueueQuickSubtitle = quickSubtitleText.trim().length > 0 && !quickSubtitleLocked;
  const canPinQuickText = quickSubtitleText.trim().length > 0 && !quickSubtitleLocked;
  const canHideManualTextOverlay =
    !quickSubtitleLocked &&
    scene.sources.some((source) => source.kind === "text" && source.contentSource === "manual" && source.visible);
  const hasActiveTextOverlayClockSources = scene.sources.some(
    (source) =>
      source.kind === "text" &&
      source.visible &&
      (((source.timerMode ?? "none") !== "none") ||
        (source.visibilityMode === "timed" &&
          source.activatedAtMs > 0 &&
          source.activatedAtMs + source.displayDurationMs > textOverlayClock))
  );
  const textOverlayRuntimeStatus = createTextOverlayRuntimeStatus(scene, {
    captions: liveCaptionCues,
    captionsEnabled: liveCaption.settings.enabled,
    nowMs: textOverlayClock
  });
  useEffect(() => {
    if (!hasActiveTextOverlayClockSources) {
      setTextOverlayClock(Date.now());
      return undefined;
    }
    const timer = window.setInterval(() => setTextOverlayClock(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [hasActiveTextOverlayClockSources]);
  const selectedManualTextSourceId =
    selectedSource.kind === "text" && selectedSource.contentSource === "manual" ? selectedSource.id : undefined;
  const showQuickSubtitle = () => {
    if (!canShowQuickSubtitle) {
      return;
    }
    const nowMs = Date.now();
    onSceneChange(
      showTimedTextOverlay(scene, {
        sourceId: selectedManualTextSourceId,
        text: quickSubtitleText,
        presetId: quickTextPresetId,
        durationMs: quickTextDurationMs,
        nowMs
      })
    );
    setQuickSubtitleText("");
    setTextOverlayClock(nowMs);
  };
  const queueQuickSubtitle = () => {
    if (!canQueueQuickSubtitle) {
      return;
    }
    const nowMs = Date.now();
    onSceneChange(
      queueTimedTextOverlay(scene, {
        sourceId: selectedManualTextSourceId,
        text: quickSubtitleText,
        presetId: quickTextPresetId,
        durationMs: quickTextDurationMs,
        nowMs
      })
    );
    setQuickSubtitleText("");
    setTextOverlayClock(nowMs);
  };
  const pinQuickText = () => {
    if (!canPinQuickText) {
      return;
    }
    const nowMs = Date.now();
    onSceneChange(
      showPersistentTextOverlay(scene, {
        sourceId: selectedManualTextSourceId,
        text: quickSubtitleText,
        presetId: quickTextPresetId,
        nowMs
      })
    );
    setQuickSubtitleText("");
    setTextOverlayClock(nowMs);
  };
  const hideManualTextOverlay = () => {
    if (!canHideManualTextOverlay) {
      return;
    }
    const targetSourceId = selectedManualTextSourceId && selectedSource.visible ? selectedManualTextSourceId : undefined;
    onSceneChange(hideTextOverlays(scene, { sourceId: targetSourceId }));
    setTextOverlayClock(Date.now());
  };
  const showQuickTextPreset = (presetId: QuickTextOverlayPresetId) => {
    if (quickSubtitleLocked) {
      return;
    }
    const nowMs = Date.now();
    onSceneChange(applyQuickTextOverlayPreset(scene, presetId, quickTextPresetAction, { durationMs: quickTextDurationMs, nowMs }));
    setTextOverlayClock(nowMs);
  };
  const diagnostics = createStreamDiagnostics(
    scene,
    profile,
    readiness,
    snapshot,
    streamSessionEvents,
    streamHealthSamples,
    streamSessionSummaries,
    streamValidationRuns,
    faceTrackingRuntime,
    {
      chatReader: chatReader.settings,
      platformChatConnection,
      audioLevelSamples
    }
  );
  const startPreflight = createStreamStartPreflightReport({
    readiness,
    streamStatus: snapshot.state.status,
    enginePlatform: snapshot.platform,
    operationStatus,
    profile,
    validation: diagnostics.validation,
    validationEvidence: diagnostics.validationEvidence,
    chatReader: chatReader.settings,
    platformChatAuth,
    platformChatOAuthCredentials,
    platformChatConnection,
    faceTracking: diagnostics.faceTracking
  });
  const platformPublishingFreshness = assessPlatformPublishingFreshness(diagnostics.platformPublishing);
  const publicLaunchChecklist = createPublicLaunchChecklist({
    preflight: startPreflight,
    diagnostics,
    platformPublishingFreshness,
    profile
  });
  const diagnosticSecrets = createDiagnosticRedactionSecrets({
    streamKey: profile.destination.streamKey,
    discordWebhookUrl: profile.streamAnnouncement.discordWebhookUrl,
    platformChatOAuthCredentials,
    twitchDeviceOAuthFlow
  });
  const streamAnnouncementPreview = createStreamAnnouncementPreview({
    profile,
    twitchLogin: platformChatOAuthCredentials.twitch?.twitchLogin ?? platformChatAuth.twitchLogin,
    secrets: diagnosticSecrets
  });
  const canGoLive = publicLaunchChecklist.canStart;
  useEffect(() => {
    if (streamAnnouncementPromptNonce > 0 && profile.streamAnnouncement.promptAfterGoLive) {
      setStreamAnnouncementPromptVisible(true);
    }
  }, [profile.streamAnnouncement.promptAfterGoLive, streamAnnouncementPromptNonce]);
  useEffect(() => {
    if (!isLive) {
      setStreamAnnouncementPromptVisible(false);
    }
  }, [isLive]);

  const shareStreamAnnouncement = async () => {
    if (!streamAnnouncementPreview.text) {
      setStreamAnnouncementShareStatus("Announcement preview is empty.");
      return;
    }

    const message = streamAnnouncementPreview.text;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ text: message });
        setStreamAnnouncementShareStatus("Announcement shared.");
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
        setStreamAnnouncementShareStatus("Announcement copied to clipboard.");
      } else {
        setStreamAnnouncementShareStatus("Share unavailable; copy the preview manually.");
      }
      setStreamAnnouncementPromptVisible(false);
    } catch (error) {
      const errorName = error instanceof DOMException ? error.name : "";
      setStreamAnnouncementShareStatus(errorName === "AbortError" ? "Share cancelled." : "Announcement share failed.");
    }
  };
  const updateMicEffects = (update: Partial<StudioProfile["micEffects"]>) => {
    if (setupLocked) {
      return;
    }
    onProfileChange({
      ...profile,
      micEffects: {
        ...profile.micEffects,
        ...update
      }
    });
  };
  const updateMicPreset = (presetId: MicEffectPresetId) => {
    if (setupLocked) {
      return;
    }
    onProfileChange(applyMicEffectPreset(profile, presetId));
  };
  const updateBroadcastMixerChannel = (
    channelId: BroadcastMixerChannelId,
    update: Partial<StudioProfile["broadcastMixer"][BroadcastMixerChannelId]>
  ) => {
    if (setupLocked) {
      return;
    }
    onProfileChange({
      ...profile,
      broadcastMixer: {
        ...profile.broadcastMixer,
        [channelId]: {
          ...profile.broadcastMixer[channelId],
          ...update
        }
      }
    });
  };
  const updateFaceTracking = (update: Partial<StudioProfile["faceTracking"]>) => {
    if (setupLocked) {
      return;
    }
    onProfileChange({
      ...profile,
      faceTracking: {
        ...profile.faceTracking,
        ...update
      }
    });
  };

  const addNewSource = (kind: SourceKind) => {
    if (setupLocked) {
      return;
    }
    const source = createSource(kind);
    onSceneChange(addSource(scene, source));
    onSelectSource(source.id);
  };

  const addTextOverlayPreset = (presetId: TextOverlayPresetId) => {
    if (setupLocked) {
      return;
    }
    const source = createTextOverlayPresetSource(presetId);
    onSceneChange(addSource(scene, source));
    onSelectSource(source.id);
  };

  const updateSelectedTransform = (key: keyof SceneSource["transform"], value: number) => {
    onSceneChange(updateTransform(scene, selectedSource.id, { [key]: value }));
  };

  const updateSelectedName = (name: string) => {
    onSceneChange(updateSource(scene, selectedSource.id, (source) => ({ ...source, name })));
  };

  const updateSelectedIllustrationRig = (key: keyof AvatarIllustrationRig, value: number) => {
    onSceneChange(
      updateSource(scene, selectedSource.id, (source) =>
        source.kind === "pngtuber"
          ? {
              ...source,
              illustrationRig: defaultAvatarIllustrationRig({
                ...source.illustrationRig,
                [key]: value
              })
            }
          : source
      )
    );
  };

  const autoRigSelectedAvatar = async () => {
    if (setupLocked || selectedSource.kind !== "pngtuber") {
      return;
    }
    const rigInput = await resolveBrowserAvatarRigInferenceInput(selectedSource.imageUri);
    onSceneChange(applyInferredAvatarIllustrationRig(scene, selectedSource.id, {}, rigInput));
  };

  return (
    <main className="studio-shell">
      <header className="top-bar">
        <div className="brand-block">
          <div className="app-mark" aria-hidden="true">
            ML
          </div>
          <div>
            <h1>MobileLiveCaster</h1>
            <p>OBS Mode</p>
          </div>
        </div>
        <div className="status-strip" aria-label="stream status">
          <StatusPill label={snapshot.state.status} tone={isLive ? "live" : snapshot.state.status === "failed" ? "bad" : "idle"} />
          <Metric icon={<Wifi size={16} />} label={`${snapshot.health.bitrateKbps} kbps`} />
          <Metric icon={<Activity size={16} />} label={`${snapshot.health.fps} fps`} />
          <Metric icon={<Radio size={16} />} label={`${snapshot.health.droppedFrames} drops`} />
          {snapshot.health.reconnectAttempts > 0 ? (
            <Metric icon={<RotateCcw size={16} />} label={`${snapshot.health.reconnectAttempts} retries`} />
          ) : null}
        </div>
      </header>

      <section className="studio-grid">
        <aside className="left-rail" aria-label="scene sources">
          <PanelTitle icon={<Clapperboard size={18} />} title="Scenes" />
          <div className="scene-list">
            {scenes.map((candidate) => (
              <button
                key={candidate.id}
                className={`scene-row ${candidate.id === activeSceneId ? "selected" : ""}`}
                type="button"
                disabled={sceneSwitchLocked && candidate.id !== activeSceneId}
                onClick={() => onSceneSwitch(candidate.id)}
              >
                <span className="scene-name">{candidate.name}</span>
                <span className="scene-meta">{candidate.sources.length} sources</span>
              </button>
            ))}
          </div>
          <div className="button-grid scene-tool-grid">
            <button className="tool-button" type="button" disabled={setupLocked} onClick={onSceneDuplicate}>
              <Copy size={16} />
              <span>Duplicate</span>
            </button>
            <button className="tool-button" type="button" disabled={setupLocked} onClick={() => onSceneCreate("starting-soon")}>
              <Plus size={16} />
              <span>Start</span>
            </button>
            <button className="tool-button" type="button" disabled={setupLocked} onClick={() => onSceneCreate("break")}>
              <Plus size={16} />
              <span>Break</span>
            </button>
          </div>
          <div className="scene-transition-control">
            <div className="scene-transition-header">
              <span>Transition</span>
              <span>{sceneTransitionSettings.kind === "cut" ? "instant" : `${sceneTransitionSettings.durationMs}ms`}</span>
            </div>
            <div className="scene-transition-buttons" role="group" aria-label="scene transition type">
              {sceneTransitionKinds.map((item) => (
                <button
                  key={item.kind}
                  className={`segmented-button ${sceneTransitionSettings.kind === item.kind ? "active" : ""}`}
                  type="button"
                  disabled={setupLocked}
                  onClick={() => onSceneTransitionChange({ kind: item.kind })}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="scene-duration-control">
              <span>Duration</span>
              <input
                type="range"
                min={0}
                max={2000}
                step={50}
                disabled={setupLocked || sceneTransitionSettings.kind === "cut"}
                value={sceneTransitionSettings.durationMs}
                onChange={(event) => onSceneTransitionChange({ durationMs: Number(event.target.value) })}
              />
            </label>
          </div>

          <PanelTitle icon={<Layers size={18} />} title="Sources" />
          <div className="source-list">
            {[...scene.sources].reverse().map((source) => (
              <button
                key={source.id}
                className={`source-row ${source.id === selectedSource.id ? "selected" : ""}`}
                type="button"
                onClick={() => onSelectSource(source.id)}
              >
                <span className="source-kind">{sourceLabels[source.kind]}</span>
                <span className="source-name">{source.name}</span>
                <span className="source-actions">
                  {source.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  {source.locked ? <Lock size={16} /> : <Unlock size={16} />}
                </span>
              </button>
            ))}
          </div>

          <div className="button-grid">
            {textOverlayPresets.map((preset) => (
              <button
                key={preset.presetId}
                className="tool-button"
                type="button"
                disabled={setupLocked}
                onClick={() => addTextOverlayPreset(preset.presetId)}
              >
                <Plus size={16} />
                <span>{preset.label}</span>
              </button>
            ))}
            {sourceKinds.map((kind) => (
              <button key={kind} className="tool-button" type="button" disabled={setupLocked} onClick={() => addNewSource(kind)}>
                <Plus size={16} />
                <span>{sourceLabels[kind]}</span>
              </button>
            ))}
          </div>

          <div className="source-tools">
            <button
              className="icon-button"
              type="button"
              aria-label="move source up"
              disabled={setupLocked}
              onClick={() => onSceneChange(reorderSource(scene, selectedSource.id, 1))}
            >
              <ArrowUp size={18} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="move source down"
              disabled={setupLocked}
              onClick={() => onSceneChange(reorderSource(scene, selectedSource.id, -1))}
            >
              <ArrowDown size={18} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label={selectedSource.visible ? "hide source" : "show source"}
              disabled={setupLocked}
              onClick={() => onSceneChange(setVisibility(scene, selectedSource.id, !selectedSource.visible))}
            >
              {selectedSource.visible ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label={selectedSource.locked ? "unlock source" : "lock source"}
              disabled={setupLocked}
              onClick={() => onSceneChange(setLocked(scene, selectedSource.id, !selectedSource.locked))}
            >
              {selectedSource.locked ? <Lock size={18} /> : <Unlock size={18} />}
            </button>
          </div>
        </aside>

        <section className="program-column" aria-label="program preview">
          <ProgramPreview
            scene={scene}
            selectedSourceId={selectedSource.id}
            chatMessages={chatOverlayMessages}
            captions={liveCaptionCues}
            captionsEnabled={liveCaption.settings.enabled}
            nowMs={textOverlayClock}
            transitionPreview={sceneTransitionPreview}
            onSelectSource={onSelectSource}
          />
          <div className="transport-bar">
            <button
              className="primary-action"
              type="button"
              disabled={!canGoLive}
              aria-describedby="go-live-readiness public-launch-readiness"
              onClick={onStart}
            >
              <Play size={18} />
              <span>Go Live</span>
            </button>
            <button className="danger-action" type="button" disabled={operationBusy || isBusy || !isLive} onClick={onStop}>
              <Square size={18} />
              <span>Stop</span>
            </button>
            <button className="danger-action emergency-action" type="button" onClick={onPrivacyShieldActivate}>
              <ShieldCheck size={18} />
              <span>Shield</span>
            </button>
            <button className="secondary-action" type="button" disabled={operationBusy || !isLive} onClick={onReconnect}>
              <RotateCcw size={18} />
              <span>Reconnect</span>
            </button>
            <button
              className={`secondary-action${streamAnnouncementPromptVisible ? " announcement-action-highlight" : ""}`}
              type="button"
              disabled={!isLive || !streamAnnouncementPreview.text}
              onClick={shareStreamAnnouncement}
            >
              <Megaphone size={18} />
              <span>Share announcement</span>
            </button>
            <div className="transport-readout">
              <span>{formatElapsed(snapshot.health.elapsedSeconds)}</span>
              <span>{snapshot.health.message}</span>
            </div>
          </div>
          {streamAnnouncementPromptVisible ? (
            <div className="stream-announcement-prompt" role="status">
              <div>
                <strong>Stream announcement ready</strong>
                <p>{streamAnnouncementPreview.text}</p>
                {streamAnnouncementPreview.sensitiveValueRemoved ? (
                  <span className="stream-announcement-warning">sensitive value removed</span>
                ) : null}
              </div>
              <div className="stream-announcement-actions">
                <button className="primary-action compact-action" type="button" onClick={shareStreamAnnouncement}>
                  <Megaphone size={16} />
                  <span>Share announcement</span>
                </button>
                <button className="secondary-action compact-action" type="button" onClick={() => setStreamAnnouncementPromptVisible(false)}>
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
          {streamAnnouncementShareStatus ? (
            <div className="stream-announcement-status" role="status">
              {streamAnnouncementShareStatus}
            </div>
          ) : null}
          {streamAnnouncementAutoPostStatus ? (
            <div className="stream-announcement-status" role="status">
              {streamAnnouncementAutoPostStatus}
            </div>
          ) : null}
          <div className="quick-subtitle-bar">
            <label className="quick-subtitle-field">
              <span>Quick text</span>
              <input
                value={quickSubtitleText}
                disabled={quickSubtitleLocked}
                maxLength={220}
                placeholder="配信に表示する字幕・テキスト"
                onChange={(event) => setQuickSubtitleText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    showQuickSubtitle();
                  }
                }}
              />
            </label>
            <label className="quick-subtitle-field quick-text-style-field">
              <span>Style</span>
              <select
                value={quickTextPresetId}
                disabled={quickSubtitleLocked}
                onChange={(event) => setQuickTextPresetId(event.target.value as ManualTextOverlayPresetId)}
              >
                {manualTextOverlayPresets.map((preset) => (
                  <option key={preset.presetId} value={preset.presetId}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="quick-text-duration-field">
              <legend>Hold</legend>
              <div className="quick-text-duration-buttons">
                {quickTextOverlayDurationPresets.map((preset) => (
                  <button
                    key={preset.id}
                    className={`quick-text-duration-button${quickTextDurationMs === preset.durationMs ? " active" : ""}`}
                    type="button"
                    disabled={quickSubtitleLocked}
                    aria-pressed={quickTextDurationMs === preset.durationMs}
                    onClick={() => setQuickTextDurationMs(preset.durationMs)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="quick-text-duration-field">
              <legend>Preset action</legend>
              <div className="quick-text-duration-buttons quick-text-action-buttons">
                {quickTextOverlayPresetActions.map((option) => (
                  <button
                    key={option.action}
                    className={`quick-text-duration-button${quickTextPresetAction === option.action ? " active" : ""}`}
                    type="button"
                    disabled={quickSubtitleLocked}
                    aria-pressed={quickTextPresetAction === option.action}
                    onClick={() => setQuickTextPresetAction(option.action)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="quick-subtitle-actions">
              <button className="secondary-action" type="button" disabled={!canShowQuickSubtitle} onClick={showQuickSubtitle}>
                <MessageCircle size={18} />
                <span>Show text</span>
              </button>
              <button className="secondary-action" type="button" disabled={!canQueueQuickSubtitle} onClick={queueQuickSubtitle}>
                <Plus size={18} />
                <span>Queue text</span>
              </button>
              <button className="secondary-action" type="button" disabled={!canPinQuickText} onClick={pinQuickText}>
                <Pin size={18} />
                <span>Pin text</span>
              </button>
              <button className="secondary-action" type="button" disabled={!canHideManualTextOverlay} onClick={hideManualTextOverlay}>
                <EyeOff size={18} />
                <span>Hide text</span>
              </button>
            </div>
            <TextOverlayStatusStrip status={textOverlayRuntimeStatus} />
            <div className="quick-text-preset-row" aria-label="quick text overlay presets">
              {quickTextOverlayPresetGroups.map((group) => (
                <div key={group.category} className="quick-text-preset-group">
                  <span className="quick-text-preset-group-label">{group.label}</span>
                  <div className="quick-text-preset-buttons">
                    {group.presets.map((preset) => (
                      <button
                        key={preset.id}
                        className="quick-text-preset-button"
                        type="button"
                        disabled={quickSubtitleLocked}
                        onClick={() => showQuickTextPreset(preset.id)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {operationStatus ? (
            <div className={`operation-banner ${operationStatus.kind}`} role={operationStatus.kind === "error" ? "alert" : "status"}>
              {operationStatus.message}
            </div>
          ) : null}
          <StartPreflightBanner report={startPreflight} />
          <PublicLaunchChecklistPanel checklist={publicLaunchChecklist} />
        </section>

        <aside className="right-rail" aria-label="inspector and setup">
          <section className="control-panel">
            <PanelTitle icon={<SlidersHorizontal size={18} />} title="Transform" />
            <label className="field">
              <span>Name</span>
              <input value={selectedSource.name} disabled={setupLocked} onChange={(event) => updateSelectedName(event.target.value)} />
            </label>
            {selectedSource.kind === "pngtuber" || selectedSource.kind === "image" ? (
              <label className="field">
                <span>{selectedSource.kind === "pngtuber" ? "Still image URI" : "Image URI"}</span>
                <input
                  value={selectedSource.kind === "pngtuber" ? selectedSource.imageUri : selectedSource.uri}
                  disabled={setupLocked}
                  placeholder="content://, file://, or absolute path"
                  onChange={(event) =>
                    onSceneChange(
                      updateSource(scene, selectedSource.id, (source) =>
                        source.kind === "pngtuber"
                          ? { ...source, imageUri: event.target.value }
                          : source.kind === "image"
                            ? { ...source, uri: event.target.value }
                            : source
                      )
                    )
                  }
                />
              </label>
            ) : null}
            {selectedSource.kind === "live2d" ? (
              <>
                <label className="field">
                  <span>Model ID</span>
                  <input
                    value={selectedSource.modelId}
                    disabled={setupLocked}
                    onChange={(event) =>
                      onSceneChange(
                        updateSource(scene, selectedSource.id, (source) =>
                          source.kind === "live2d" ? { ...source, modelId: event.target.value } : source
                        )
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Model3 JSON URI</span>
                  <input
                    value={selectedSource.modelJsonUri}
                    disabled={setupLocked}
                    placeholder="file:// or absolute path to .model3.json"
                    onChange={(event) =>
                      onSceneChange(
                        updateSource(scene, selectedSource.id, (source) =>
                          source.kind === "live2d" ? { ...source, modelJsonUri: event.target.value } : source
                        )
                      )
                    }
                  />
                </label>
              </>
            ) : null}
            {selectedSource.kind === "vrm" ? (
              <>
                <label className="field">
                  <span>Model ID</span>
                  <input
                    value={selectedSource.modelId}
                    disabled={setupLocked}
                    onChange={(event) =>
                      onSceneChange(
                        updateSource(scene, selectedSource.id, (source) =>
                          source.kind === "vrm" ? { ...source, modelId: event.target.value } : source
                        )
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>VRM URI</span>
                  <input
                    value={selectedSource.modelUri}
                    disabled={setupLocked}
                    placeholder="file:// or absolute path to .vrm/.glb"
                    onChange={(event) =>
                      onSceneChange(
                        updateSource(scene, selectedSource.id, (source) =>
                          source.kind === "vrm" ? { ...source, modelUri: event.target.value } : source
                        )
                      )
                    }
                  />
                </label>
              </>
            ) : null}
            {selectedSource.kind === "text" ? (
              <>
                <label className="field">
                  <span>Preset style</span>
                  <select
                    value=""
                    disabled={setupLocked}
                    onChange={(event) => {
                      const presetId = event.target.value as TextOverlayPresetId;
                      if (!presetId) {
                        return;
                      }
                      onSceneChange(
                        updateSource(scene, selectedSource.id, (source) =>
                          source.kind === "text" ? applyTextOverlayPresetStyle(source, presetId) : source
                        )
                      );
                      event.currentTarget.value = "";
                    }}
                  >
                    <option value="">Apply preset...</option>
                    {textOverlayPresets.map((preset) => (
                      <option key={preset.presetId} value={preset.presetId}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>
                    {selectedSource.timerMode !== "none"
                      ? "Timer prefix"
                      : selectedSource.contentSource === "runtime-caption"
                        ? "Fallback text"
                        : "Text"}
                  </span>
                  <textarea
                    value={selectedSource.text}
                    disabled={setupLocked}
                    rows={selectedSource.mode === "subtitle" || selectedSource.mode === "caption" ? 3 : 2}
                    onChange={(event) =>
                      onSceneChange(
                        updateSource(scene, selectedSource.id, (source) =>
                          source.kind === "text" ? { ...source, text: event.target.value } : source
                        )
                      )
                    }
                  />
                </label>
                <fieldset className="quick-text-duration-field">
                  <legend>Timer</legend>
                  <div className="quick-text-duration-buttons quick-text-action-buttons">
                    {textSourceTimerModes.map((mode) => (
                      <button
                        key={mode.timerMode}
                        className={`quick-text-duration-button${selectedSource.timerMode === mode.timerMode ? " active" : ""}`}
                        type="button"
                        disabled={setupLocked || selectedSource.contentSource !== "manual"}
                        aria-pressed={selectedSource.timerMode === mode.timerMode}
                        onClick={() =>
                          onSceneChange(
                            updateSource(scene, selectedSource.id, (source) =>
                              source.kind === "text"
                                ? {
                                    ...source,
                                    timerMode: mode.timerMode,
                                    countdownTargetMs:
                                      mode.timerMode === "countdown"
                                        ? source.countdownTargetMs && source.countdownTargetMs > Date.now()
                                          ? source.countdownTargetMs
                                          : Date.now() + 5 * 60 * 1000
                                        : source.countdownTargetMs,
                                    activatedAtMs: mode.timerMode === "uptime" ? Date.now() : source.activatedAtMs
                                  }
                                : source
                            )
                          )
                        }
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                {selectedSource.timerMode === "countdown" ? (
                  <>
                    <label className="field">
                      <span>Target time</span>
                      <input
                        type="datetime-local"
                        value={formatDateTimeLocalInputValue(selectedSource.countdownTargetMs)}
                        disabled={setupLocked}
                        onChange={(event) =>
                          onSceneChange(
                            updateSource(scene, selectedSource.id, (source) =>
                              source.kind === "text"
                                ? {
                                    ...source,
                                    countdownTargetMs: parseDateTimeLocalInputValue(
                                      event.target.value,
                                      source.countdownTargetMs ?? Date.now()
                                    )
                                  }
                                : source
                            )
                          )
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Complete text</span>
                      <input
                        value={selectedSource.timerCompleteText}
                        disabled={setupLocked}
                        maxLength={80}
                        onChange={(event) =>
                          onSceneChange(
                            updateSource(scene, selectedSource.id, (source) =>
                              source.kind === "text" ? { ...source, timerCompleteText: event.target.value } : source
                            )
                          )
                        }
                      />
                    </label>
                  </>
                ) : null}
                <label className="field">
                  <span>Mode</span>
                  <select
                    value={selectedSource.mode}
                    disabled={setupLocked}
                    onChange={(event) =>
                      onSceneChange(
                        updateSource(scene, selectedSource.id, (source) =>
                          source.kind === "text" ? { ...source, mode: event.target.value as TextSourceMode } : source
                        )
                      )
                    }
                  >
                    {textSourceModes.map((mode) => (
                      <option key={mode.mode} value={mode.mode}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Source</span>
                  <select
                    value={selectedSource.contentSource}
                    disabled={setupLocked}
                    onChange={(event) =>
                      onSceneChange(
                        updateSource(scene, selectedSource.id, (source) =>
                          source.kind === "text"
                            ? { ...source, contentSource: event.target.value as TextSourceContentSource }
                            : source
                        )
                      )
                    }
                  >
                    {textSourceContentSources.map((source) => (
                      <option key={source.contentSource} value={source.contentSource}>
                        {source.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="monitor-row">
                  {textSourceVisibilityModes.map((mode) => (
                    <button
                      key={mode.visibilityMode}
                      className={`segmented-button ${selectedSource.visibilityMode === mode.visibilityMode ? "active" : ""}`}
                      type="button"
                      disabled={setupLocked}
                      onClick={() =>
                        onSceneChange(
                          updateSource(scene, selectedSource.id, (source) =>
                            source.kind === "text"
                              ? {
                                  ...source,
                                  visibilityMode: mode.visibilityMode,
                                  activatedAtMs: 0
                                }
                              : source
                          )
                        )
                      }
                    >
                      {mode.label}
                    </button>
                  ))}
                  <button
                    className={`segmented-button ${selectedSource.visibilityMode === "timed" ? "active" : ""}`}
                    type="button"
                    disabled={setupLocked || selectedSource.visibilityMode !== "timed"}
                    onClick={() => onSceneChange(activateTimedTextSource(scene, selectedSource.id))}
                  >
                    Show now
                  </button>
                </div>
                <SpeechSlider
                  label="Show sec"
                  value={Math.round(selectedSource.displayDurationMs / 1000)}
                  min={1}
                  max={60}
                  step={1}
                  disabled={setupLocked || selectedSource.visibilityMode !== "timed"}
                  onChange={(displaySeconds) =>
                    onSceneChange(
                      updateSource(scene, selectedSource.id, (source) =>
                        source.kind === "text"
                          ? { ...source, displayDurationMs: Math.round(displaySeconds) * 1000 }
                          : source
                      )
                    )
                  }
                />
                {selectedSource.contentSource === "runtime-caption" ? (
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={selectedSource.showCaptionSpeaker}
                      disabled={setupLocked}
                      onChange={(event) =>
                        onSceneChange(
                          updateSource(scene, selectedSource.id, (source) =>
                            source.kind === "text" ? { ...source, showCaptionSpeaker: event.target.checked } : source
                          )
                        )
                      }
                    />
                    <span>Show speaker name</span>
                  </label>
                ) : null}
                <label className="field">
                  <span>Align</span>
                  <select
                    value={selectedSource.align}
                    disabled={setupLocked}
                    onChange={(event) =>
                      onSceneChange(
                        updateSource(scene, selectedSource.id, (source) =>
                          source.kind === "text" ? { ...source, align: event.target.value as TextSourceAlign } : source
                        )
                      )
                    }
                  >
                    {textSourceAlignments.map((align) => (
                      <option key={align} value={align}>
                        {align}
                      </option>
                    ))}
                  </select>
                </label>
                <SpeechSlider
                  label="Font"
                  value={selectedSource.fontSize}
                  min={10}
                  max={180}
                  step={2}
                  disabled={setupLocked}
                  onChange={(fontSize) =>
                    onSceneChange(
                      updateSource(scene, selectedSource.id, (source) =>
                        source.kind === "text" ? { ...source, fontSize } : source
                      )
                    )
                  }
                />
                <SpeechSlider
                  label="Lines"
                  value={selectedSource.maxLines}
                  min={1}
                  max={4}
                  step={1}
                  disabled={setupLocked}
                  onChange={(maxLines) =>
                    onSceneChange(
                      updateSource(scene, selectedSource.id, (source) =>
                        source.kind === "text" ? { ...source, maxLines: Math.round(maxLines) } : source
                      )
                    )
                  }
                />
                <label className="field">
                  <span>Text color</span>
                  <input
                    value={selectedSource.color}
                    disabled={setupLocked}
                    onChange={(event) =>
                      onSceneChange(
                        updateSource(scene, selectedSource.id, (source) =>
                          source.kind === "text" ? { ...source, color: event.target.value } : source
                        )
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Backdrop color</span>
                  <input
                    value={selectedSource.backgroundColor}
                    disabled={setupLocked}
                    onChange={(event) =>
                      onSceneChange(
                        updateSource(scene, selectedSource.id, (source) =>
                          source.kind === "text" ? { ...source, backgroundColor: event.target.value } : source
                        )
                      )
                    }
                  />
                </label>
                <SpeechSlider
                  label="Backdrop"
                  value={selectedSource.backgroundOpacity}
                  min={0}
                  max={1}
                  step={0.02}
                  disabled={setupLocked}
                  onChange={(backgroundOpacity) =>
                    onSceneChange(
                      updateSource(scene, selectedSource.id, (source) =>
                        source.kind === "text" ? { ...source, backgroundOpacity } : source
                      )
                    )
                  }
                />
                <label className="field">
                  <span>Outline color</span>
                  <input
                    value={selectedSource.outlineColor}
                    disabled={setupLocked}
                    onChange={(event) =>
                      onSceneChange(
                        updateSource(scene, selectedSource.id, (source) =>
                          source.kind === "text" ? { ...source, outlineColor: event.target.value } : source
                        )
                      )
                    }
                  />
                </label>
                <SpeechSlider
                  label="Outline"
                  value={selectedSource.outlineWidth}
                  min={0}
                  max={12}
                  step={1}
                  disabled={setupLocked}
                  onChange={(outlineWidth) =>
                    onSceneChange(
                      updateSource(scene, selectedSource.id, (source) =>
                        source.kind === "text" ? { ...source, outlineWidth } : source
                      )
                    )
                  }
                />
              </>
            ) : null}
            {selectedSource.kind === "pngtuber" ? (
              <>
                <button className="secondary-action compact-action" type="button" disabled={setupLocked} onClick={autoRigSelectedAvatar}>
                  <Wand2 size={16} />
                  <span>Auto rig</span>
                </button>
                <AvatarRigQualityPanel rig={selectedSource.illustrationRig} />
                <SpeechSlider
                  label="Face X"
                  value={selectedSource.illustrationRig.faceCenterX}
                  min={0.05}
                  max={0.95}
                  step={0.01}
                  disabled={setupLocked}
                  onChange={(faceCenterX) => updateSelectedIllustrationRig("faceCenterX", faceCenterX)}
                />
                <SpeechSlider
                  label="Face Y"
                  value={selectedSource.illustrationRig.faceCenterY}
                  min={0.15}
                  max={0.85}
                  step={0.01}
                  disabled={setupLocked}
                  onChange={(faceCenterY) => updateSelectedIllustrationRig("faceCenterY", faceCenterY)}
                />
                <SpeechSlider
                  label="Face range"
                  value={selectedSource.illustrationRig.faceRange}
                  min={0.08}
                  max={0.6}
                  step={0.01}
                  disabled={setupLocked}
                  onChange={(faceRange) => updateSelectedIllustrationRig("faceRange", faceRange)}
                />
                <SpeechSlider
                  label="Hair line"
                  value={selectedSource.illustrationRig.hairLineY}
                  min={0.05}
                  max={0.55}
                  step={0.01}
                  disabled={setupLocked}
                  onChange={(hairLineY) => updateSelectedIllustrationRig("hairLineY", hairLineY)}
                />
                <SpeechSlider
                  label="Shoulder"
                  value={selectedSource.illustrationRig.shoulderLineY}
                  min={0.45}
                  max={0.95}
                  step={0.01}
                  disabled={setupLocked}
                  onChange={(shoulderLineY) => updateSelectedIllustrationRig("shoulderLineY", shoulderLineY)}
                />
                <SpeechSlider
                  label="Left eye X"
                  value={selectedSource.illustrationRig.leftEyeX}
                  min={0.05}
                  max={0.95}
                  step={0.01}
                  disabled={setupLocked}
                  onChange={(leftEyeX) => updateSelectedIllustrationRig("leftEyeX", leftEyeX)}
                />
                <SpeechSlider
                  label="Right eye X"
                  value={selectedSource.illustrationRig.rightEyeX}
                  min={0.05}
                  max={0.95}
                  step={0.01}
                  disabled={setupLocked}
                  onChange={(rightEyeX) => updateSelectedIllustrationRig("rightEyeX", rightEyeX)}
                />
                <SpeechSlider
                  label="Eye line"
                  value={selectedSource.illustrationRig.eyeLineY}
                  min={0.12}
                  max={0.65}
                  step={0.01}
                  disabled={setupLocked}
                  onChange={(eyeLineY) => updateSelectedIllustrationRig("eyeLineY", eyeLineY)}
                />
                <SpeechSlider
                  label="Mouth X"
                  value={selectedSource.illustrationRig.mouthCenterX}
                  min={0.05}
                  max={0.95}
                  step={0.01}
                  disabled={setupLocked}
                  onChange={(mouthCenterX) => updateSelectedIllustrationRig("mouthCenterX", mouthCenterX)}
                />
                <SpeechSlider
                  label="Mouth line"
                  value={selectedSource.illustrationRig.mouthLineY}
                  min={0.25}
                  max={0.85}
                  step={0.01}
                  disabled={setupLocked}
                  onChange={(mouthLineY) => updateSelectedIllustrationRig("mouthLineY", mouthLineY)}
                />
                <SpeechSlider
                  label="Rig slices"
                  value={selectedSource.illustrationRig.sliceCount}
                  min={12}
                  max={40}
                  step={1}
                  disabled={setupLocked}
                  onChange={(sliceCount) => updateSelectedIllustrationRig("sliceCount", Math.round(sliceCount))}
                />
              </>
            ) : null}
            {selectedSource.kind === "chat" ? (
              <>
                <SpeechSlider
                  label="Messages"
                  value={selectedSource.maxMessages}
                  min={1}
                  max={8}
                  step={1}
                  disabled={setupLocked}
                  onChange={(maxMessages) =>
                    onSceneChange(
                      updateSource(scene, selectedSource.id, (source) =>
                        source.kind === "chat" ? { ...source, maxMessages: Math.round(maxMessages) } : source
                      )
                    )
                  }
                />
                <SpeechSlider
                  label="Max length"
                  value={selectedSource.maxMessageLength}
                  min={40}
                  max={240}
                  step={10}
                  disabled={setupLocked}
                  onChange={(maxMessageLength) =>
                    onSceneChange(
                      updateSource(scene, selectedSource.id, (source) =>
                        source.kind === "chat" ? { ...source, maxMessageLength: Math.round(maxMessageLength) } : source
                      )
                    )
                  }
                />
                <label className="field">
                  <span>Text color</span>
                  <input
                    value={selectedSource.color}
                    disabled={setupLocked}
                    onChange={(event) =>
                      onSceneChange(
                        updateSource(scene, selectedSource.id, (source) =>
                          source.kind === "chat" ? { ...source, color: event.target.value } : source
                        )
                      )
                    }
                  />
                </label>
                <div className="monitor-row">
                  <button
                    className={`segmented-button ${selectedSource.showAuthor ? "active" : ""}`}
                    type="button"
                    disabled={setupLocked}
                    onClick={() =>
                      onSceneChange(
                        updateSource(scene, selectedSource.id, (source) =>
                          source.kind === "chat" ? { ...source, showAuthor: !source.showAuthor } : source
                        )
                      )
                    }
                  >
                    Author
                  </button>
                  <button
                    className={`segmented-button ${selectedSource.redactUrls ? "active" : ""}`}
                    type="button"
                    disabled={setupLocked}
                    onClick={() =>
                      onSceneChange(
                        updateSource(scene, selectedSource.id, (source) =>
                          source.kind === "chat" ? { ...source, redactUrls: !source.redactUrls } : source
                        )
                      )
                    }
                  >
                    URL Redact
                  </button>
                  <button
                    className={`segmented-button ${selectedSource.backgroundOpacity > 0 ? "active" : ""}`}
                    type="button"
                    disabled={setupLocked}
                    onClick={() =>
                      onSceneChange(
                        updateSource(scene, selectedSource.id, (source) =>
                          source.kind === "chat"
                            ? { ...source, backgroundOpacity: source.backgroundOpacity > 0 ? 0 : 0.42 }
                            : source
                        )
                      )
                    }
                  >
                    Backdrop
                  </button>
                </div>
              </>
            ) : null}
            <Slider label="X" value={selectedSource.transform.x} disabled={setupLocked} onChange={(value) => updateSelectedTransform("x", value)} />
            <Slider label="Y" value={selectedSource.transform.y} disabled={setupLocked} onChange={(value) => updateSelectedTransform("y", value)} />
            <Slider
              label="Width"
              value={selectedSource.transform.width}
              disabled={setupLocked}
              onChange={(value) => updateSelectedTransform("width", value)}
            />
            <Slider
              label="Height"
              value={selectedSource.transform.height}
              disabled={setupLocked}
              onChange={(value) => updateSelectedTransform("height", value)}
            />
            <Slider
              label="Opacity"
              value={selectedSource.transform.opacity}
              disabled={setupLocked}
              onChange={(value) => updateSelectedTransform("opacity", value)}
            />
          </section>

          <section className="control-panel">
            <PanelTitle icon={<Mic size={18} />} title="Mixer" />
            <Slider label="Lip sync" value={avatarRuntime.mouthOpen} onChange={onMicLevelChange} />
            <div className="level-meter" aria-label="lip sync meter">
              <span style={{ width: `${Math.round(avatarRuntime.mouthOpen * 100)}%` }} />
            </div>
            <div className={`audio-guard-chip ${diagnostics.audio.audioGuard.status}`}>
              <span>Peak guard</span>
              <strong>{diagnostics.audio.audioGuard.summary}</strong>
            </div>
            <div className={`audio-guard-chip ${diagnostics.audio.audioSilenceGuard.status}`}>
              <span>Silence guard</span>
              <strong>{diagnostics.audio.audioSilenceGuard.summary}</strong>
            </div>
            <div className="expression-grid">
              {expressions.map((expression) => (
                <button
                  key={expression}
                  className={`expression-button ${avatarRuntime.expression === expression ? "active" : ""}`}
                  type="button"
                  onClick={() => onExpressionChange(expression)}
                >
                  {expression}
                </button>
              ))}
            </div>
            <div className="mic-effects">
              <div className="protocol-row" role="group" aria-label="mic effects power">
                <button
                  className={`segmented-button ${!profile.micEffects.enabled ? "active" : ""}`}
                  type="button"
                  disabled={setupLocked}
                  onClick={() => updateMicEffects({ enabled: false })}
                >
                  Off
                </button>
                <button
                  className={`segmented-button ${profile.micEffects.enabled ? "active" : ""}`}
                  type="button"
                  disabled={setupLocked}
                  onClick={() => updateMicEffects({ enabled: true })}
                >
                  FX
                </button>
              </div>
              <label className="field">
                <span>Mic preset</span>
                <select
                  value={profile.micEffects.presetId}
                  disabled={setupLocked}
                  onChange={(event) => updateMicPreset(event.target.value as MicEffectPresetId)}
                >
                  {micEffectPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <SpeechSlider
                label="Gain dB"
                value={profile.micEffects.inputGainDb}
                min={-12}
                max={12}
                step={1}
                disabled={setupLocked}
                onChange={(inputGainDb) => updateMicEffects({ inputGainDb })}
              />
              <SpeechSlider
                label="Gate dB"
                value={profile.micEffects.noiseGateDb}
                min={-70}
                max={-25}
                step={1}
                disabled={setupLocked}
                onChange={(noiseGateDb) => updateMicEffects({ noiseGateDb })}
              />
              <SpeechSlider
                label="Compression"
                value={profile.micEffects.compression}
                min={0}
                max={1}
                step={0.01}
                disabled={setupLocked}
                onChange={(compression) => updateMicEffects({ compression })}
              />
              <div className="monitor-row">
                <button
                  className={`segmented-button ${profile.micEffects.monitorEnabled ? "active" : ""}`}
                  type="button"
                  disabled={setupLocked}
                  onClick={() => updateMicEffects({ monitorEnabled: !profile.micEffects.monitorEnabled })}
                >
                  <Headphones size={16} />
                  Monitor
                </button>
                <button
                  className={`segmented-button ${profile.micEffects.monitorHeadphonesOnly ? "active" : ""}`}
                  type="button"
                  disabled={setupLocked}
                  onClick={() => updateMicEffects({ monitorHeadphonesOnly: !profile.micEffects.monitorHeadphonesOnly })}
                >
                  Phones
                </button>
              </div>
              <SpeechSlider
                label="Monitor"
                value={profile.micEffects.monitorVolume}
                min={0}
                max={1}
                step={0.01}
                disabled={setupLocked || !profile.micEffects.monitorEnabled}
                onChange={(monitorVolume) => updateMicEffects({ monitorVolume })}
              />
            </div>
            <div className="broadcast-mixer" aria-label="broadcast audio mixer">
              <div className="section-kicker">Broadcast mix</div>
              {broadcastMixerChannels.map((channel) => {
                const settings = profile.broadcastMixer[channel.id];
                return (
                  <div className="broadcast-mixer-row" key={channel.id}>
                    <button
                      className={`segmented-button ${settings.muted ? "active" : ""}`}
                      type="button"
                      disabled={setupLocked}
                      onClick={() => updateBroadcastMixerChannel(channel.id, { muted: !settings.muted })}
                    >
                      {settings.muted ? "Muted" : "Live"}
                    </button>
                    <SpeechSlider
                      label={channel.label}
                      value={settings.volume}
                      min={0}
                      max={1}
                      step={0.01}
                      disabled={setupLocked || settings.muted}
                      onChange={(volume) => updateBroadcastMixerChannel(channel.id, { volume })}
                    />
                  </div>
                );
              })}
            </div>
            <div className="face-tracking">
              <div className="protocol-row" role="group" aria-label="face tracking power">
                <button
                  className={`segmented-button ${!profile.faceTracking.enabled ? "active" : ""}`}
                  type="button"
                  disabled={setupLocked}
                  onClick={() => updateFaceTracking({ enabled: false })}
                >
                  Off
                </button>
                <button
                  className={`segmented-button ${profile.faceTracking.enabled ? "active" : ""}`}
                  type="button"
                  disabled={setupLocked}
                  onClick={() => updateFaceTracking({ enabled: true })}
                >
                  Track
                </button>
              </div>
              <label className="field">
                <span>Face input</span>
                <select
                  value={profile.faceTracking.inputMode}
                  disabled={setupLocked}
                  onChange={(event) => updateFaceTracking({ inputMode: event.target.value as StudioProfile["faceTracking"]["inputMode"] })}
                >
                  <option value="simulated">Simulated</option>
                  <option value="native-camera">Native camera</option>
                </select>
              </label>
              <label className="field">
                <span>Rig</span>
                <select
                  value={profile.faceTracking.rigMode}
                  disabled={setupLocked}
                  onChange={(event) => updateFaceTracking({ rigMode: event.target.value as StudioProfile["faceTracking"]["rigMode"] })}
                >
                  <option value="still-image-2d">Still image 2D</option>
                  <option value="layered-2d">Layered 2D</option>
                </select>
              </label>
              <SpeechSlider
                label="Strength"
                value={profile.faceTracking.trackingStrength}
                min={0}
                max={1}
                step={0.01}
                disabled={setupLocked}
                onChange={(trackingStrength) => updateFaceTracking({ trackingStrength })}
              />
              <SpeechSlider
                label="Smoothing"
                value={profile.faceTracking.smoothing}
                min={0}
                max={1}
                step={0.01}
                disabled={setupLocked}
                onChange={(smoothing) => updateFaceTracking({ smoothing })}
              />
              <SpeechSlider
                label="Dead zone"
                value={profile.faceTracking.deadZone}
                min={0}
                max={0.2}
                step={0.005}
                disabled={setupLocked}
                onChange={(deadZone) => updateFaceTracking({ deadZone })}
              />
              <SpeechSlider
                label="Jump limit"
                value={profile.faceTracking.maxMotionStep}
                min={0.04}
                max={1}
                step={0.01}
                disabled={setupLocked}
                onChange={(maxMotionStep) => updateFaceTracking({ maxMotionStep })}
              />
              <SpeechSlider
                label="Lost return"
                value={profile.faceTracking.lostReturnSpeed}
                min={0}
                max={1}
                step={0.01}
                disabled={setupLocked}
                onChange={(lostReturnSpeed) => updateFaceTracking({ lostReturnSpeed })}
              />
              <SpeechSlider
                label="Head range"
                value={profile.faceTracking.headRange}
                min={0}
                max={1}
                step={0.01}
                disabled={setupLocked}
                onChange={(headRange) => updateFaceTracking({ headRange })}
              />
              <SpeechSlider
                label="Body range"
                value={profile.faceTracking.bodyRange}
                min={0}
                max={1}
                step={0.01}
                disabled={setupLocked}
                onChange={(bodyRange) => updateFaceTracking({ bodyRange })}
              />
              <SpeechSlider
                label="Illust warp"
                value={profile.faceTracking.illustrationDeform}
                min={0}
                max={1}
                step={0.01}
                disabled={setupLocked}
                onChange={(illustrationDeform) => updateFaceTracking({ illustrationDeform })}
              />
              <SpeechSlider
                label="Hair sway"
                value={profile.faceTracking.hairSway}
                min={0}
                max={1}
                step={0.01}
                disabled={setupLocked}
                onChange={(hairSway) => updateFaceTracking({ hairSway })}
              />
              <SpeechSlider
                label="Eye deform"
                value={profile.faceTracking.eyeDeform}
                min={0}
                max={1}
                step={0.01}
                disabled={setupLocked}
                onChange={(eyeDeform) => updateFaceTracking({ eyeDeform })}
              />
              <SpeechSlider
                label="Mouth deform"
                value={profile.faceTracking.mouthDeform}
                min={0}
                max={1}
                step={0.01}
                disabled={setupLocked}
                onChange={(mouthDeform) => updateFaceTracking({ mouthDeform })}
              />
              <SpeechSlider
                label="Mouth"
                value={profile.faceTracking.mouthSensitivity}
                min={0.2}
                max={2}
                step={0.05}
                disabled={setupLocked}
                onChange={(mouthSensitivity) => updateFaceTracking({ mouthSensitivity })}
              />
              <SpeechSlider
                label="Blink"
                value={profile.faceTracking.blinkSensitivity}
                min={0.2}
                max={2}
                step={0.05}
                disabled={setupLocked}
                onChange={(blinkSensitivity) => updateFaceTracking({ blinkSensitivity })}
              />
              <div className="monitor-row">
                <button
                  className={`segmented-button ${profile.faceTracking.autoExpression ? "active" : ""}`}
                  type="button"
                  disabled={setupLocked}
                  onClick={() => updateFaceTracking({ autoExpression: !profile.faceTracking.autoExpression })}
                >
                  Auto Expr
                </button>
                <button className="segmented-button" type="button" disabled={setupLocked} onClick={onFaceTrackingCalibrate}>
                  Calibrate
                </button>
              </div>
              <div className={`tracking-readout ${faceTrackingRuntime.status}`}>
                <span>{faceTrackingRuntime.status}</span>
                <span>yaw {faceTrackingRuntime.yaw.toFixed(2)}</span>
                <span>pitch {faceTrackingRuntime.pitch.toFixed(2)}</span>
                <span>conf {Math.round(faceTrackingRuntime.confidence * 100)}%</span>
                <span>
                  lm {Math.round((diagnostics.faceTracking.faceLandmarkConfidence ?? 0) * 100)}%{" "}
                  {diagnostics.faceTracking.faceLandmarkReady ? "ok" : "low"}
                </span>
                <span>
                  attn {Math.round(diagnostics.faceTracking.landmarkMotionScale * 100)}/
                  {Math.round(diagnostics.faceTracking.faceControlScale * 100)}%
                </span>
              </div>
            </div>
          </section>

          <LiveCaptionPanel
            liveCaption={liveCaption}
            cues={liveCaptionCues}
            onSettingsChange={onLiveCaptionSettingsChange}
            onClear={onLiveCaptionClear}
            onTestCue={onLiveCaptionTestCue}
          />

          <ChatReaderPanel
            chatReader={chatReader}
            platformChat={platformChat}
            streamKeyOperationPlatform={resolvePlatformStreamKeyOperationPlatform(profile)}
            platformChatAuth={platformChatAuth}
            platformChatOAuth={platformChatOAuth}
            platformChatOAuthFlow={platformChatOAuthFlow}
            twitchDeviceOAuthFlow={twitchDeviceOAuthFlow}
            platformChatOAuthStatus={platformChatOAuthStatus}
            platformStreamKeyStatus={platformStreamKeyStatus}
            platformApiOperationLabel={platformApiOperationLabel}
            platformChatConnection={platformChatConnection}
            onSubmit={onChatCommentSubmit}
            onPin={onChatCommentPin}
            onUnpin={onChatCommentUnpin}
            onSettingsChange={onChatReaderSettingsChange}
            onClearComments={onChatCommentsClear}
            onPlatformChatSettingsChange={onPlatformChatSettingsChange}
            onPlatformChatAuthChange={onPlatformChatAuthChange}
            onPlatformChatOAuthChange={onPlatformChatOAuthChange}
            onPlatformChatOAuthStart={onPlatformChatOAuthStart}
            onTwitchDeviceOAuthStart={onTwitchDeviceOAuthStart}
            onTwitchDeviceOAuthPoll={onTwitchDeviceOAuthPoll}
            onPlatformChatOAuthCallbackApply={onPlatformChatOAuthCallbackApply}
            onPlatformStreamKeyApply={onPlatformStreamKeyApply}
            onPlatformChatConnect={onPlatformChatConnect}
            onPlatformChatDisconnect={onPlatformChatDisconnect}
            onPlatformChatSampleIngest={onPlatformChatSampleIngest}
          />

          <LiveSetupScreen
            profile={profile}
            readiness={readiness}
            streamStatus={snapshot.state.status}
            validation={diagnostics.validation}
            publicLaunchChecklist={publicLaunchChecklist}
            platformChatOAuthCredentials={platformChatOAuthCredentials}
            locked={setupLocked}
            platformPublishingStatus={platformPublishingStatus}
            platformApiOperationLabel={platformApiOperationLabel}
            streamAnnouncementAutoPostStatus={streamAnnouncementAutoPostStatus}
            streamAnnouncementWebhookStorageNotice={streamAnnouncementWebhookStorageNotice}
            onProfileChange={onProfileChange}
            onPlatformPublishingApply={onPlatformPublishingApply}
            onPlatformPublishingStatusRefresh={onPlatformPublishingStatusRefresh}
            onYouTubeBroadcastTransition={onYouTubeBroadcastTransition}
            onStreamAnnouncementWebhookTest={onStreamAnnouncementWebhookTest}
            onClearStreamKey={onClearStreamKey}
          />

          <StreamDiagnosticsPanel
            scene={scene}
            profile={profile}
            readiness={readiness}
            preflight={startPreflight}
            diagnostics={diagnostics}
            secrets={diagnosticSecrets}
            qualityAutomationDecision={qualityAutomationDecision}
            setupLocked={setupLocked}
            onProfileChange={onProfileChange}
            onClearStreamSessionSummaries={onClearStreamSessionSummaries}
            onRecordStreamValidationRun={onRecordStreamValidationRun}
            onClearStreamValidationRuns={onClearStreamValidationRuns}
          />
        </aside>
      </section>
    </main>
  );
};

const StartPreflightBanner = ({ report }: { report: StreamStartPreflightReport }) => (
  <div id="go-live-readiness" className={`start-preflight-banner ${report.status}`}>
    <div className="start-preflight-summary">
      <ShieldCheck size={16} />
      <span>{report.summary}</span>
    </div>
    <span className="start-preflight-action">{report.primaryAction}</span>
    {report.issues.length > 0 ? (
      <div className="start-preflight-list">
        {report.issues.slice(0, 3).map((issue) => (
          <span key={issue.code} className={`start-preflight-issue ${issue.severity}`}>
            {issue.label}: {issue.message}
          </span>
        ))}
      </div>
    ) : null}
  </div>
);

const PublicLaunchChecklistPanel = ({ checklist }: { checklist: PublicLaunchChecklist }) => (
  <div id="public-launch-readiness" className={`public-launch-checklist ${checklist.status}`} aria-label="public launch checklist">
    <div className="public-launch-header">
      <div className="public-launch-title">
        <ShieldCheck size={16} />
        <span>Public checklist</span>
      </div>
      <div className="public-launch-counts" aria-label="public checklist counts">
        <span className="public-launch-count pass">{checklist.passCount} pass</span>
        <span className="public-launch-count warn">{checklist.warningCount} warn</span>
        <span className="public-launch-count fail">{checklist.failCount} fail</span>
      </div>
    </div>
    <strong className="public-launch-summary">{checklist.summary}</strong>
    <span className={`public-launch-lock ${checklist.startLock.blocked ? "blocked" : checklist.startLock.applies ? "active" : "off"}`}>
      {checklist.startLock.summary}
    </span>
    <span className="public-launch-action">{checklist.primaryAction}</span>
    <div className="public-launch-items">
      {checklist.items.map((item) => (
        <div key={item.id} className={`public-launch-item ${publicLaunchChecklistTone(item.status)}`}>
          <strong>{item.label}</strong>
          <span>{item.detail}</span>
          <em>{item.action}</em>
        </div>
      ))}
    </div>
  </div>
);

const StreamDiagnosticsPanel = ({
  scene,
  profile,
  readiness,
  preflight,
  diagnostics,
  secrets,
  qualityAutomationDecision,
  setupLocked,
  onProfileChange,
  onClearStreamSessionSummaries,
  onRecordStreamValidationRun,
  onClearStreamValidationRuns
}: {
  scene: SceneDocument;
  profile: StudioProfile;
  readiness: ReadinessReport;
  preflight: StreamStartPreflightReport;
  diagnostics: StreamDiagnostics;
  secrets: string[];
  qualityAutomationDecision: StreamQualityAutomationDecision;
  setupLocked: boolean;
  onProfileChange(profile: StudioProfile): void;
  onClearStreamSessionSummaries(): void;
  onRecordStreamValidationRun(run: StreamValidationRun): void;
  onClearStreamValidationRuns(): void;
}) => {
  const platformPublishingFreshness = assessPlatformPublishingFreshness(diagnostics.platformPublishing);
  const publicLaunchChecklist = createPublicLaunchChecklist({
    preflight,
    diagnostics,
    platformPublishingFreshness,
    profile
  });

  return (
    <section className="control-panel">
      <PanelTitle icon={<Activity size={18} />} title="Diagnostics" />
      <div className="diagnostic-summary-row">
        <div className={`diagnostic-summary ${diagnostics.status}`}>{diagnostics.summary}</div>
        <div className="diagnostic-actions">
          <button
            className="secondary-action compact-action diagnostic-export"
            type="button"
            onClick={() => downloadStreamDiagnosticReport(diagnostics, publicLaunchChecklist, secrets)}
          >
            <Download size={15} />
            Diagnostics
          </button>
          <button
            className="secondary-action compact-action diagnostic-export"
            type="button"
            onClick={() => downloadSupportBundle({ scene, profile, readiness, preflight, diagnostics, secrets })}
          >
            <Download size={15} />
            Support
          </button>
          <button
            className="secondary-action compact-action diagnostic-export"
            type="button"
            disabled={diagnostics.session.summaries.length === 0}
            onClick={() => {
              if (window.confirm("Clear completed stream session history on this device?")) {
                onClearStreamSessionSummaries();
              }
            }}
          >
            <RotateCcw size={15} />
            Clear History
          </button>
        </div>
      </div>
      <div className="diagnostic-grid">
        <span>Target</span>
        <strong>{diagnostics.target.platform}</strong>
        <span>Endpoint</span>
        <strong>{diagnostics.target.host}</strong>
        <span>App</span>
        <strong>{diagnostics.target.application}</strong>
        <span>Publish URL</span>
        <strong>{diagnostics.target.publishUrlPreview}</strong>
        <span>Quality</span>
        <strong>
          {diagnostics.quality.resolution} / {diagnostics.quality.fps}fps
        </strong>
        <span>Upload target</span>
        <strong>{diagnostics.quality.estimatedUploadKbps} kbps</strong>
        <span>Telemetry</span>
        <strong>
          {diagnostics.telemetry.bitrateKbps} kbps / {diagnostics.telemetry.fps} fps
        </strong>
        <span>Audio guard</span>
        <strong>{audioGuardMetricLabel(diagnostics)}</strong>
        <span>Audio silence</span>
        <strong>{audioSilenceGuardMetricLabel(diagnostics)}</strong>
        <span>Dashboard</span>
        <strong>{platformPublishingFreshnessMetricLabel(diagnostics, platformPublishingFreshness)}</strong>
        <span>Native runtime</span>
        <strong>{nativeRuntimeMetricLabel(diagnostics)}</strong>
        <span>Recovery</span>
        <strong>{recoveryMetricLabel(diagnostics)}</strong>
        <span>History</span>
        <strong>{historyMetricLabel(diagnostics)}</strong>
        <span>Completed sessions</span>
        <strong>{diagnostics.session.summaries.length}</strong>
        <span>Session trend</span>
        <strong>{sessionHistoryMetricLabel(diagnostics)}</strong>
        <span>Last session</span>
        <strong>{sessionMetricLabel(diagnostics)}</strong>
        <span>Advisor</span>
        <strong>{diagnostics.qualityAdvisor.action}</strong>
        <span>Native comp</span>
        <strong>{nativeCompositionMetricLabel(diagnostics)}</strong>
        <span>Validation</span>
        <strong>{validationMetricLabel(diagnostics)}</strong>
        <span>Rehearsal</span>
        <strong>{rehearsalMetricLabel(diagnostics)}</strong>
      </div>
      <div className="diagnostic-incidents">
        <div className={`diagnostic-incident-summary ${qualityAdvisorTone(diagnostics)}`}>
          {diagnostics.qualityAdvisor.summary}
        </div>
        <div className={`diagnostic-incident ${qualityAdvisorTone(diagnostics)}`}>
          <strong>{qualityAdvisorTargetLabel(diagnostics)}</strong>
          <span>{diagnostics.qualityAdvisor.recommendation}</span>
          <em>{diagnostics.qualityAdvisor.reason || "No quality pressure detected."}</em>
          {diagnostics.qualityAdvisor.suggestedTarget ? (
            <button
              className="secondary-action compact-action"
              type="button"
              disabled={setupLocked}
              onClick={() => onProfileChange(applyStreamQualityAdvisorTarget(profile, diagnostics.qualityAdvisor.suggestedTarget))}
            >
              Apply Quality
            </button>
          ) : null}
        </div>
        {qualityAutomationDecision.command !== "none" ? (
          <div className={`diagnostic-incident ${qualityAutomationTone(qualityAutomationDecision)}`}>
            <strong>{qualityAutomationDecision.title}</strong>
            <span>{qualityAutomationDecision.summary}</span>
            <em>{qualityAutomationDecision.action}</em>
          </div>
        ) : null}
      </div>
      <div className="diagnostic-incidents">
        <div className={`diagnostic-incident-summary ${validationTone(diagnostics)}`}>
          {diagnostics.validation.summary}
        </div>
        <div className={`diagnostic-incident ${validationTone(diagnostics)}`}>
          <strong>Commercial validation</strong>
          <span>{diagnostics.validation.recommendedNextStep}</span>
          <em>
            {diagnostics.validation.passCount} pass / {diagnostics.validation.warningCount} warn / {diagnostics.validation.failCount} fail /{" "}
            {diagnostics.validation.pendingCount} pending
          </em>
        </div>
        <div className={`diagnostic-incident ${rehearsalTone(diagnostics)}`}>
          <strong>Launch rehearsal</strong>
          <span>{diagnostics.rehearsal.summary}</span>
          <em>
            Score {diagnostics.rehearsal.score}/100 grade {diagnostics.rehearsal.grade}. {diagnostics.rehearsal.primaryAction}
          </em>
        </div>
        <div className={`diagnostic-incident ${platformPublishingFreshnessTone(platformPublishingFreshness.status)}`}>
          <strong>Platform dashboard freshness</strong>
          <span>{platformPublishingFreshness.summary}</span>
          <em>{platformPublishingFreshness.recommendation}</em>
        </div>
        {diagnostics.validation.items.map((item) => (
          <div key={item.id} className={`diagnostic-incident ${validationItemTone(item.status)}`}>
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
            <em>{item.action}</em>
          </div>
        ))}
      </div>
      <StreamValidationRecorder
        diagnostics={diagnostics}
        secrets={secrets}
        onRecordStreamValidationRun={onRecordStreamValidationRun}
        onClearStreamValidationRuns={onClearStreamValidationRuns}
      />
      {diagnostics.session.lastSummary ? (
      <div className="diagnostic-incidents">
        <div className={`diagnostic-incident ${sessionHistoryTone(diagnostics)}`}>
          <strong>History trend</strong>
          <span>{diagnostics.session.historySummary.summary}</span>
          <em>{diagnostics.session.historySummary.recommendation}</em>
        </div>
        <div className={`diagnostic-incident-summary ${sessionSummaryTone(diagnostics.session.lastSummary)}`}>
          {diagnostics.session.lastSummary.summary}
        </div>
        <div className={`diagnostic-incident ${sessionSummaryTone(diagnostics.session.lastSummary)}`}>
          <strong>Next stream</strong>
          <span>{diagnostics.session.lastSummary.recommendation}</span>
          <em>
            Warnings {diagnostics.session.lastSummary.warningCount} / failures {diagnostics.session.lastSummary.failureCount} /
            recoveries {diagnostics.session.lastSummary.recoveryEventCount}
          </em>
          <em>
            Platform API {diagnostics.session.lastSummary.platformApiEventCount} events /{" "}
            {diagnostics.session.lastSummary.platformApiFailureCount} failed
          </em>
          <em>{sessionNativeRuntimeLabel(diagnostics.session.lastSummary)}</em>
        </div>
      </div>
    ) : null}
    <div className="diagnostic-incidents">
      <div className={`diagnostic-incident-summary ${qualityIncidentSummaryTone(diagnostics)}`}>
        {diagnostics.qualityIncidents.summary}
      </div>
      {diagnostics.qualityIncidents.incidents.map((incident) => (
        <div key={incident.code} className={`diagnostic-incident ${incident.severity}`}>
          <strong>{incident.label}</strong>
          <span>{incident.message}</span>
          <em>{incident.recommendation}</em>
        </div>
      ))}
    </div>
    <div className="diagnostic-events">
      {diagnostics.session.events.slice(-5).map((event) => (
        <div key={event.id} className={`diagnostic-event ${event.severity}`}>
          <strong>{event.title}</strong>
          <span>{event.message}</span>
        </div>
      ))}
      {diagnostics.session.events.length === 0 ? <span className="diagnostic-empty">No session events yet.</span> : null}
    </div>
    <div className="diagnostic-checks">
      {diagnostics.checks.map((check) => (
        <div key={check.code} className={`diagnostic-check ${check.status}`}>
          <strong>{check.label}</strong>
          <span>{check.message}</span>
        </div>
      ))}
    </div>
    </section>
  );
};

const StreamValidationRecorder = ({
  diagnostics,
  secrets,
  onRecordStreamValidationRun,
  onClearStreamValidationRuns
}: {
  diagnostics: StreamDiagnostics;
  secrets: string[];
  onRecordStreamValidationRun(run: StreamValidationRun): void;
  onClearStreamValidationRuns(): void;
}) => {
  const [devicePlatform, setDevicePlatform] = useState<StreamValidationDevicePlatform>("ios");
  const [deviceName, setDeviceName] = useState("iPhone test device");
  const [osVersion, setOsVersion] = useState("");
  const [appBuild, setAppBuild] = useState("debug");
  const [networkProfile, setNetworkProfile] = useState("private RTMPS");
  const [monitorLatencyMs, setMonitorLatencyMs] = useState("");
  const [monitorTuningNote, setMonitorTuningNote] = useState("");
  const [result, setResult] = useState<StreamValidationRunResult>(() => validationRunResultFromDiagnostics(diagnostics));
  const latestRun = diagnostics.validationEvidence.latestRun;
  const latestRunAudioLabel = latestRun ? formatStreamValidationRunAudioLabel(latestRun) : null;
  const nativeRuntimePreview = createStreamValidationNativeRuntimePreview(diagnostics, devicePlatform);
  const audioMonitorPreview = createStreamValidationAudioMonitorPreview(
    diagnostics,
    {
      measuredLatencyMs: parseOptionalLatencyMs(monitorLatencyMs),
      note: monitorTuningNote
    },
    secrets
  );
  const latestDashboardFreshness =
    diagnostics.validationEvidence.latestPlatformPublishingFreshness ??
    (diagnostics.validationEvidence.latestPlatformPublishing
      ? assessPlatformPublishingFreshness(diagnostics.validationEvidence.latestPlatformPublishing)
      : null);

  useEffect(() => {
    setResult(validationRunResultFromDiagnostics(diagnostics));
  }, [diagnostics.validation.status]);

  const record = () => {
    onRecordStreamValidationRun(
      createStreamValidationRun({
        diagnostics,
        devicePlatform,
        deviceName,
        osVersion,
        appBuild,
        networkProfile,
        audioMonitorTuning: {
          measuredLatencyMs: parseOptionalLatencyMs(monitorLatencyMs),
          note: monitorTuningNote
        },
        result,
        secrets
      })
    );
  };

  return (
    <div className="diagnostic-incidents">
      <div className={`diagnostic-incident-summary ${validationEvidenceTone(diagnostics)}`}>
        {diagnostics.validationEvidence.summary}
      </div>
      <div className={`diagnostic-incident-summary ${validationRunbookTone(diagnostics)}`}>
        {diagnostics.validationRunbook.summary}
      </div>
      <div className={`diagnostic-incident ${validationRunbookTone(diagnostics)}`}>
        <strong>Private validation runbook</strong>
        <span>{diagnostics.validationRunbook.nextAction}</span>
        <em>
          {diagnostics.validationRunbook.passCount} pass / {diagnostics.validationRunbook.warningCount} warn /{" "}
          {diagnostics.validationRunbook.failCount} fail / {diagnostics.validationRunbook.pendingCount} pending
        </em>
      </div>
      {diagnostics.validationRunbook.items.map((item) => (
        <div key={item.id} className={`diagnostic-incident ${validationItemTone(item.status)}`}>
          <strong>{item.title}</strong>
          <span>{item.detail}</span>
          <em>{item.action}</em>
        </div>
      ))}
      <div className={`diagnostic-incident ${validationEvidenceTone(diagnostics)}`}>
        <strong>Physical validation evidence</strong>
        <span>{diagnostics.validationEvidence.recommendation}</span>
        <em>
          {diagnostics.validationEvidence.eligibleRunCount}/{diagnostics.validationEvidence.totalRuns} eligible /{" "}
          {diagnostics.validationEvidence.staleRunCount} stale / iOS {diagnostics.validationEvidence.iosPass ? "pass" : "missing"} / Android{" "}
          {diagnostics.validationEvidence.androidPass ? "pass" : "missing"} / build{" "}
          {diagnostics.validationEvidence.consistentAppBuild ?? (diagnostics.validationEvidence.appBuildMismatch ? "mismatch" : "-")} / physical iOS{" "}
          {diagnostics.validationEvidence.physicalDeviceIosPass ? "pass" : "missing"} / Android{" "}
          {diagnostics.validationEvidence.physicalDeviceAndroidPass ? "pass" : "missing"} / publisher Android{" "}
          {diagnostics.validationEvidence.androidPublisherModeAndroidPass ? "pass" : "missing"} / native iOS{" "}
          {diagnostics.validationEvidence.nativeRuntimeIosPass ? "pass" : "missing"} / Android{" "}
          {diagnostics.validationEvidence.nativeRuntimeAndroidPass ? "pass" : "missing"} / hold iOS{" "}
          {diagnostics.validationEvidence.monitorHoldIosPass ? "pass" : "missing"} / Android{" "}
          {diagnostics.validationEvidence.monitorHoldAndroidPass ? "pass" : "missing"} / face{" "}
          iOS {diagnostics.validationEvidence.faceTrackingIosPass ? "pass" : "missing"} / Android{" "}
          {diagnostics.validationEvidence.faceTrackingAndroidPass ? "pass" : "missing"} / audio iOS{" "}
          {diagnostics.validationEvidence.audioIosPass ? "pass" : "missing"} / Android{" "}
          {diagnostics.validationEvidence.audioAndroidPass ? "pass" : "missing"} / dashboard iOS{" "}
          {diagnostics.validationEvidence.platformPublishingIosPass ? "pass" : "missing"} / Android{" "}
          {diagnostics.validationEvidence.platformPublishingAndroidPass ? "pass" : "missing"} / ingest iOS{" "}
          {diagnostics.validationEvidence.platformIngestIosPass ? "pass" : "missing"} / Android{" "}
          {diagnostics.validationEvidence.platformIngestAndroidPass ? "pass" : "missing"}
        </em>
        <em>evidence fingerprint {diagnostics.validationEvidence.fingerprint}</em>
      </div>
      {latestDashboardFreshness ? (
        <div className={`diagnostic-incident ${platformPublishingFreshnessTone(latestDashboardFreshness.status)}`}>
          <strong>Validation dashboard freshness</strong>
          <span>{latestDashboardFreshness.summary}</span>
          <em>{latestDashboardFreshness.recommendation}</em>
        </div>
      ) : null}
      <div className={`diagnostic-incident ${validationItemTone(audioMonitorPreview.monitorLatencyStatus)}`}>
        <strong>Monitor latency preview</strong>
        <span>{audioMonitorPreview.summary}</span>
        <em>{audioMonitorPreview.recommendation}</em>
      </div>
      <div className={`diagnostic-incident ${validationItemTone(nativeRuntimePreview.status)}`}>
        <strong>Native runtime preview</strong>
        <span>{nativeRuntimePreview.summary}</span>
        <em>{nativeRuntimePreview.recommendation}</em>
      </div>
      {latestRun ? (
        <div className={`diagnostic-incident ${validationRunTone(latestRun.result)}`}>
          <strong>Latest validation run</strong>
          <span>{latestRun.summary}</span>
          <em>
            {latestRun.devicePlatform} / {latestRun.osVersion} / build {latestRun.appBuild} / {latestRun.networkProfile}
            {diagnostics.validationEvidence.latestRunAgeDays === null
              ? ""
              : ` / ${diagnostics.validationEvidence.latestRunAgeDays}d old`}
            {" / "}
            {latestRun.physicalDevice ? "physical device" : `device ${latestRun.physicalDeviceStatus}`}
          </em>
          <em>run fingerprint {latestRun.fingerprint}</em>
          {validationRunNativeRuntimeLabel(latestRun) ? <em>{validationRunNativeRuntimeLabel(latestRun)}</em> : null}
          {validationRunMonitorHoldLabel(latestRun) ? <em>{validationRunMonitorHoldLabel(latestRun)}</em> : null}
          {validationRunFaceTrackingLabel(latestRun) ? <em>{validationRunFaceTrackingLabel(latestRun)}</em> : null}
          {latestRunAudioLabel ? <em>{latestRunAudioLabel}</em> : null}
          {validationRunChatReadoutLabel(latestRun) ? <em>{validationRunChatReadoutLabel(latestRun)}</em> : null}
          {validationRunQualityAutomationLabel(latestRun) ? <em>{validationRunQualityAutomationLabel(latestRun)}</em> : null}
          {validationRunPlatformPublishingLabel(latestRun) ? <em>{validationRunPlatformPublishingLabel(latestRun)}</em> : null}
        </div>
      ) : null}
      <div className="validation-recorder">
        <div className="protocol-row" role="group" aria-label="validation device platform">
          {(["ios", "android"] as StreamValidationDevicePlatform[]).map((platform) => (
            <button
              key={platform}
              className={`segmented-button ${devicePlatform === platform ? "active" : ""}`}
              type="button"
              onClick={() => setDevicePlatform(platform)}
            >
              {platform === "ios" ? "iOS" : "Android"}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Device</span>
          <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} />
        </label>
        <label className="field">
          <span>OS</span>
          <input value={osVersion} onChange={(event) => setOsVersion(event.target.value)} placeholder="iOS 18 / Android 15" />
        </label>
        <label className="field">
          <span>Build</span>
          <input value={appBuild} onChange={(event) => setAppBuild(event.target.value)} />
        </label>
        <label className="field">
          <span>Network</span>
          <input value={networkProfile} onChange={(event) => setNetworkProfile(event.target.value)} />
        </label>
        <label className="field">
          <span>Monitor latency ms</span>
          <input
            inputMode="numeric"
            value={monitorLatencyMs}
            onChange={(event) => setMonitorLatencyMs(event.target.value)}
            placeholder="120"
          />
        </label>
        <label className="field">
          <span>Monitor route note</span>
          <input
            value={monitorTuningNote}
            onChange={(event) => setMonitorTuningNote(event.target.value)}
            placeholder="wired baseline / Bluetooth reviewed"
          />
        </label>
        <div className="protocol-row" role="group" aria-label="validation result">
          {(["pass", "warn", "fail"] as StreamValidationRunResult[]).map((item) => (
            <button
              key={item}
              className={`segmented-button ${result === item ? "active" : ""}`}
              type="button"
              onClick={() => setResult(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <button className="secondary-action compact-action diagnostic-export" type="button" onClick={record}>
          <ShieldCheck size={15} />
          Record Evidence
        </button>
        <button
          className="secondary-action compact-action diagnostic-export"
          type="button"
          disabled={diagnostics.validationEvidence.totalRuns === 0}
          onClick={() => {
            if (window.confirm("Clear retained physical validation evidence on this device?")) {
              onClearStreamValidationRuns();
            }
          }}
        >
          <RotateCcw size={15} />
          Clear Evidence
        </button>
      </div>
    </div>
  );
};

const validationRunResultFromDiagnostics = (diagnostics: StreamDiagnostics): StreamValidationRunResult =>
  diagnostics.validation.status === "ready" ? "pass" : diagnostics.validation.status === "blocked" ? "fail" : "warn";

const parseOptionalLatencyMs = (value: string): number | null => {
  const normalized = Number.parseInt(value.trim(), 10);
  return Number.isFinite(normalized) ? Math.max(0, normalized) : null;
};

const validationEvidenceTone = (diagnostics: StreamDiagnostics): "pass" | "warn" | "fail" =>
  diagnostics.validationEvidence.status === "ready"
    ? "pass"
    : diagnostics.validationEvidence.status === "failing"
      ? "fail"
      : "warn";

const validationRunbookTone = (diagnostics: StreamDiagnostics): "pass" | "warn" | "fail" =>
  diagnostics.validationRunbook.status === "complete"
    ? "pass"
    : diagnostics.validationRunbook.status === "blocked"
      ? "fail"
      : "warn";

const rehearsalTone = (diagnostics: StreamDiagnostics): "pass" | "warn" | "fail" =>
  diagnostics.rehearsal.status === "ready" ? "pass" : diagnostics.rehearsal.status === "blocked" ? "fail" : "warn";

const validationRunTone = (result: StreamValidationRunResult): "pass" | "warn" | "fail" =>
  result === "pass" ? "pass" : result === "fail" ? "fail" : "warn";

const platformPublishingFreshnessTone = (status: PlatformPublishingFreshnessStatus): "pass" | "warn" | "fail" =>
  status === "fresh" || status === "not-applicable" ? "pass" : status === "invalid" ? "fail" : "warn";

const publicLaunchChecklistTone = (status: PublicLaunchChecklistItemStatus): "pass" | "warn" | "fail" => status;

const validationRunNativeRuntimeLabel = (run: StreamValidationRun): string | null =>
  run.nativeRuntime
    ? `native ${run.nativeRuntime.status} / ${run.nativeRuntime.platform} / publisher ${run.nativeRuntime.publisherState || "-"} / queue ${run.nativeRuntime.queuedItems}/${run.nativeRuntime.cacheSize} / ${nativeOverlayProofMetricLabel({
        appliedCount: run.nativeRuntime.compositionAppliedCount,
        skippedCount: run.nativeRuntime.compositionSkippedCount,
        skippedKinds: run.nativeRuntime.compositionSkippedKinds
      })} / ${liveRenderGraphMetricLabel(run.nativeRuntime)} / ${live2dPoseMetricLabel(run.nativeRuntime)} / vrm ${run.nativeRuntime.vrmActivePoseCount}/${run.nativeRuntime.vrmSourceCount} active payloads ${run.nativeRuntime.vrmPosePayloadCount} renderer ${run.nativeRuntime.vrmRendererStatus} ${run.nativeRuntime.vrmRenderedSourceCount}/${run.nativeRuntime.vrmSourceCount} models ${run.nativeRuntime.vrmModelLoadedCount} bones ${run.nativeRuntime.vrmHumanoidBoneCount} expressions ${run.nativeRuntime.vrmExpressionCount} ${vrmRenderabilityMetricLabel(run.nativeRuntime)} pose ${run.nativeRuntime.vrmPoseBoneAppliedCount}/${run.nativeRuntime.vrmPoseBoneCount} bones ${run.nativeRuntime.vrmPoseExpressionAppliedCount}/${run.nativeRuntime.vrmPoseExpressionCount} expressions`
    : null;

const validationRunMonitorHoldLabel = (run: StreamValidationRun): string | null =>
  run.monitorHold
    ? `hold ${run.monitorHold.status} / ${run.monitorHold.durationSeconds}s / ${run.monitorHold.sampleCount} samples / ${run.monitorHold.stability} / drops ${run.monitorHold.droppedFrameIncrease} / reconnects ${run.monitorHold.observedReconnectAttempts}`
    : null;

const validationRunFaceTrackingLabel = (run: StreamValidationRun): string | null =>
  run.faceTracking && run.faceTracking.status !== "info"
    ? `face ${run.faceTracking.status} / ${run.faceTracking.inputMode} / ${run.faceTracking.runtimeStatus} / landmarks ${Math.round(run.faceTracking.faceLandmarkConfidence * 100)}% ${run.faceTracking.faceLandmarkReady ? "ready" : "not-ready"} / attenuation motion ${Math.round(run.faceTracking.landmarkMotionScale * 100)}% controls ${Math.round(run.faceTracking.faceControlScale * 100)}% / prepared ${run.faceTracking.preparedPngTuberCount} / moving ${run.faceTracking.activeMotionCount}`
    : null;

const validationRunChatReadoutLabel = (run: StreamValidationRun): string | null =>
  run.chatReadout
    ? `chat ${run.chatReadout.status} / ${run.chatReadout.connectionPhase} / spoken ${run.chatReadout.spokenMessageCount} / failed ${run.chatReadout.speechFailureCount}`
    : null;

const validationRunQualityAutomationLabel = (run: StreamValidationRun): string | null =>
  run.qualityAutomation
    ? `quality automation ${run.qualityAutomation.status} / live ${run.qualityAutomation.liveUpdateCount} / next-start ${run.qualityAutomation.nextTargetCount} / failed ${run.qualityAutomation.failureCount}`
    : null;

const validationRunPlatformPublishingLabel = (run: StreamValidationRun): string | null =>
  run.platformPublishing && run.platformPublishing.status !== "info"
    ? `dashboard ${run.platformPublishing.status} / ${run.platformPublishing.summary}${
        run.platformPublishingFreshness && run.platformPublishingFreshness.status !== "not-applicable"
          ? ` / freshness ${run.platformPublishingFreshness.status} ${run.platformPublishingFreshness.summary}`
          : ""
      }`
    : run.platformPublishingFreshness && run.platformPublishingFreshness.status !== "not-applicable"
      ? `dashboard freshness ${run.platformPublishingFreshness.status} / ${run.platformPublishingFreshness.summary}`
      : null;

const LiveCaptionPanel = ({
  liveCaption,
  cues,
  onSettingsChange,
  onClear,
  onTestCue
}: {
  liveCaption: LiveCaptionState;
  cues: CaptionOverlayCue[];
  onSettingsChange(settings: Partial<LiveCaptionSettings>): void;
  onClear(): void;
  onTestCue(): void;
}) => {
  const latestCue = cues.at(-1);
  return (
    <section className="panel">
      <PanelTitle icon={<Mic size={18} />} title="Live Captions" />
      <div className="segmented">
        <button
          className={`segmented-button ${liveCaption.settings.enabled ? "active" : ""}`}
          type="button"
          onClick={() => onSettingsChange({ enabled: !liveCaption.settings.enabled })}
        >
          <span>{liveCaption.settings.enabled ? "Captions On" : "Captions Off"}</span>
        </button>
        <span className={`chat-source-status ${liveCaption.status}`}>{liveCaption.status}</span>
      </div>
      <label className="field">
        <span>Language</span>
        <input value={liveCaption.settings.language} onChange={(event) => onSettingsChange({ language: event.target.value })} />
      </label>
      <SpeechSlider
        label="Caption Length"
        value={liveCaption.settings.maxCueLength}
        min={40}
        max={320}
        step={10}
        onChange={(maxCueLength) => onSettingsChange({ maxCueLength })}
      />
      <SpeechSlider
        label="Hold Seconds"
        value={Math.round(liveCaption.settings.staleCueMillis / 1000)}
        min={2}
        max={30}
        step={1}
        onChange={(seconds) => onSettingsChange({ staleCueMillis: seconds * 1000 })}
      />
      <div className="segmented">
        <button
          className={`segmented-button ${liveCaption.settings.interimResults ? "active" : ""}`}
          type="button"
          onClick={() => onSettingsChange({ interimResults: !liveCaption.settings.interimResults })}
        >
          <span>{liveCaption.settings.interimResults ? "Interim On" : "Interim Off"}</span>
        </button>
        <button className="segmented-button" type="button" disabled={!liveCaption.settings.enabled} onClick={onTestCue}>
          <span>Test Caption</span>
        </button>
        <button className="segmented-button" type="button" disabled={liveCaption.cues.length === 0} onClick={onClear}>
          <span>Clear</span>
        </button>
      </div>
      {liveCaption.errorMessage ? <span className="chat-network-message">{liveCaption.errorMessage}</span> : null}
      <div className="chat-history">
        {latestCue ? (
          <div className="chat-history-row">
            <strong>{latestCue.speaker || "Caption"}</strong>
            <span>{latestCue.text}</span>
          </div>
        ) : (
          <span className="muted">No caption cues</span>
        )}
      </div>
    </section>
  );
};

const ChatReaderPanel = ({
  chatReader,
  platformChat,
  streamKeyOperationPlatform,
  platformChatAuth,
  platformChatOAuth,
  platformChatOAuthFlow,
  twitchDeviceOAuthFlow,
  platformChatOAuthStatus,
  platformStreamKeyStatus,
  platformApiOperationLabel,
  platformChatConnection,
  onSubmit,
  onPin,
  onUnpin,
  onSettingsChange,
  onClearComments,
  onPlatformChatSettingsChange,
  onPlatformChatAuthChange,
  onPlatformChatOAuthChange,
  onPlatformChatOAuthStart,
  onTwitchDeviceOAuthStart,
  onTwitchDeviceOAuthPoll,
  onPlatformChatOAuthCallbackApply,
  onPlatformStreamKeyApply,
  onPlatformChatConnect,
  onPlatformChatDisconnect,
  onPlatformChatSampleIngest
}: {
  chatReader: ChatReaderState;
  platformChat: PlatformChatSettings;
  streamKeyOperationPlatform: ReturnType<typeof resolvePlatformStreamKeyOperationPlatform>;
  platformChatAuth: PlatformChatAuthSession;
  platformChatOAuth: PlatformChatOAuthSettings;
  platformChatOAuthFlow: PlatformChatOAuthFlow | null;
  twitchDeviceOAuthFlow: TwitchDeviceCodeOAuthFlow | null;
  platformChatOAuthStatus: string;
  platformStreamKeyStatus: string;
  platformApiOperationLabel: string | null;
  platformChatConnection: PlatformChatConnectionState;
  onSubmit(author: string, body: string): void;
  onPin(messageId: string): void;
  onUnpin(): void;
  onSettingsChange(settings: Partial<ChatReaderSettings>): void;
  onClearComments(): void;
  onPlatformChatSettingsChange(settings: Partial<PlatformChatSettings>): void;
  onPlatformChatAuthChange(settings: Partial<PlatformChatAuthSession>): void;
  onPlatformChatOAuthChange(settings: Partial<PlatformChatOAuthSettings>): void;
  onPlatformChatOAuthStart(): void | Promise<void>;
  onTwitchDeviceOAuthStart(): void | Promise<void>;
  onTwitchDeviceOAuthPoll(): void | Promise<void>;
  onPlatformChatOAuthCallbackApply(): void | Promise<void>;
  onPlatformStreamKeyApply(): void | Promise<void>;
  onPlatformChatConnect(): void;
  onPlatformChatDisconnect(): void;
  onPlatformChatSampleIngest(): void;
}) => {
  const [author, setAuthor] = useState("viewer");
  const [body, setBody] = useState("Nice stream!");
  const [mutedWords, setMutedWords] = useState(chatReader.settings.mutedWords.join(", "));
  const platformStatus = getPlatformChatConnectionStatus(platformChat);
  const isNetworkConnected = platformChatConnection.phase === "connected" || platformChatConnection.phase === "connecting";
  const oauthClientId = platformChat.platform === "youtube" ? platformChatOAuth.youtubeClientId : platformChatOAuth.twitchClientId;
  const oauthRedirectUri = platformChat.platform === "youtube" ? platformChatOAuth.youtubeRedirectUri : platformChatOAuth.twitchRedirectUri;
  const oauthClientKey = platformChat.platform === "youtube" ? "youtubeClientId" : "twitchClientId";
  const oauthRedirectKey = platformChat.platform === "youtube" ? "youtubeRedirectUri" : "twitchRedirectUri";
  const platformApiBusy = Boolean(platformApiOperationLabel);
  const streamKeyOperationInfo = getPlatformStreamKeyOperationInfo(streamKeyOperationPlatform);

  const submit = () => {
    if (!body.trim()) {
      return;
    }
    onSubmit(author, body);
    setBody("");
  };

  const updateMutedWords = (value: string) => {
    setMutedWords(value);
    onSettingsChange({ mutedWords: normalizeMutedWordsInput(value) });
  };

  return (
    <section className="control-panel">
      <PanelTitle icon={<MessageCircle size={18} />} title="Chat Reader" />
      <div className="chat-reader-status">
        <button
          className={`segmented-button ${chatReader.settings.enabled ? "active" : ""}`}
          type="button"
          onClick={() => onSettingsChange({ enabled: !chatReader.settings.enabled })}
        >
          <Volume2 size={16} />
          <span>{chatReader.settings.enabled ? "Read On" : "Read Off"}</span>
        </button>
        <span>{chatReader.queue.length} queued</span>
        <button
          className="secondary-action compact-action"
          type="button"
          disabled={chatReader.queue.length === 0 && chatReader.history.length === 0}
          onClick={() => {
            if (window.confirm("Clear queued and recent chat comments on this device?")) {
              onClearComments();
            }
          }}
        >
          <RotateCcw size={15} />
          Clear
        </button>
      </div>

      <label className="field">
        <span>Author</span>
        <input value={author} onChange={(event) => setAuthor(event.target.value)} />
      </label>
      <label className="field">
        <span>Comment</span>
        <input value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} />
      </label>
      <button className="secondary-action chat-submit" type="button" onClick={submit}>
        Test Read
      </button>

      <div className="chat-platform-panel">
        <div className="chat-platform-row">
          <button
            className={`segmented-button ${platformChat.enabled ? "active" : ""}`}
            type="button"
            onClick={() => onPlatformChatSettingsChange({ enabled: !platformChat.enabled })}
          >
            <Radio size={15} />
            <span>{platformChat.enabled ? "Platform On" : "Platform Off"}</span>
          </button>
          <span className={`chat-source-status ${platformStatus.status}`}>{platformStatus.label}</span>
        </div>
        <div className="protocol-row">
          <button
            className={`segmented-button ${platformChat.platform === "youtube" ? "active" : ""}`}
            type="button"
            onClick={() => onPlatformChatSettingsChange({ platform: "youtube" })}
          >
            YouTube
          </button>
          <button
            className={`segmented-button ${platformChat.platform === "twitch" ? "active" : ""}`}
            type="button"
            onClick={() => onPlatformChatSettingsChange({ platform: "twitch" })}
          >
            Twitch
          </button>
        </div>
        <div className="chat-oauth-panel">
          <label className="field">
            <span>OAuth client ID</span>
            <input
              autoComplete="off"
              value={oauthClientId}
              onChange={(event) => onPlatformChatOAuthChange({ [oauthClientKey]: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Redirect URI</span>
            <input value={oauthRedirectUri} onChange={(event) => onPlatformChatOAuthChange({ [oauthRedirectKey]: event.target.value })} />
          </label>
          <div className="chat-platform-row">
            <span className={`chat-source-status ${platformChatOAuthFlow?.platform === platformChat.platform ? "connecting" : "idle"}`}>
              {platformChatOAuthFlow?.platform === platformChat.platform ? "OAuth pending" : "OAuth idle"}
            </span>
            <button className="secondary-action compact-action" type="button" disabled={platformApiBusy} onClick={onPlatformChatOAuthStart}>
              <ShieldCheck size={15} />
              Start OAuth
            </button>
          </div>
          {platformChat.platform === "twitch" ? (
            <div className="chat-platform-row chat-device-row">
              <span className={`chat-source-status ${twitchDeviceOAuthFlow ? "connecting" : "idle"}`}>
                {twitchDeviceOAuthFlow ? `Device code ${twitchDeviceOAuthFlow.userCode}` : "Device OAuth idle"}
              </span>
              <button className="secondary-action compact-action" type="button" disabled={platformApiBusy} onClick={onTwitchDeviceOAuthStart}>
                Device OAuth
              </button>
              <button
                className="secondary-action compact-action"
                type="button"
                disabled={platformApiBusy || !twitchDeviceOAuthFlow}
                onClick={onTwitchDeviceOAuthPoll}
              >
                Check
              </button>
            </div>
          ) : null}
          <label className="field">
            <span>Callback URL</span>
            <input
              autoComplete="off"
              type="password"
              value={platformChatOAuth.callbackUrl}
              onChange={(event) => onPlatformChatOAuthChange({ callbackUrl: event.target.value })}
            />
          </label>
          <button className="secondary-action compact-action chat-ingest-action" type="button" disabled={platformApiBusy} onClick={onPlatformChatOAuthCallbackApply}>
            Apply OAuth Callback
          </button>
          <span className="chat-network-message">{platformApiOperationLabel ? `Running ${platformApiOperationLabel}. ${platformChatOAuthStatus}` : platformChatOAuthStatus}</span>
          <button className="secondary-action compact-action chat-ingest-action" type="button" disabled={platformApiBusy} onClick={onPlatformStreamKeyApply}>
            <KeyRound size={15} />
            {streamKeyOperationInfo.actionLabel}
          </button>
          <span className="chat-network-message">{streamKeyOperationInfo.description}</span>
          <span className="chat-network-message">{platformApiOperationLabel ? `Running ${platformApiOperationLabel}. ${platformStreamKeyStatus}` : platformStreamKeyStatus}</span>
        </div>
        {platformChat.platform === "youtube" ? (
          <>
            <label className="field">
              <span>Live chat ID</span>
              <input
                value={platformChat.youtubeLiveChatId}
                onChange={(event) => onPlatformChatSettingsChange({ youtubeLiveChatId: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Access token</span>
              <input
                autoComplete="off"
                type="password"
                value={platformChatAuth.youtubeAccessToken}
                onChange={(event) => onPlatformChatAuthChange({ youtubeAccessToken: event.target.value })}
              />
            </label>
          </>
        ) : (
          <>
            <label className="field">
              <span>Twitch channel</span>
              <input value={platformChat.twitchChannel} onChange={(event) => onPlatformChatSettingsChange({ twitchChannel: event.target.value })} />
            </label>
            <label className="field">
              <span>Twitch login</span>
              <input
                autoComplete="off"
                value={platformChatAuth.twitchLogin}
                onChange={(event) => onPlatformChatAuthChange({ twitchLogin: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Access token</span>
              <input
                autoComplete="off"
                type="password"
                value={platformChatAuth.twitchOauthToken}
                onChange={(event) => onPlatformChatAuthChange({ twitchOauthToken: event.target.value })}
              />
            </label>
          </>
        )}
        <div className="chat-platform-row">
          <span className={`chat-source-status ${platformChatConnection.phase}`}>{platformChatConnection.label}</span>
          <button
            className="secondary-action compact-action"
            type="button"
            disabled={!platformChat.enabled}
            onClick={isNetworkConnected ? onPlatformChatDisconnect : onPlatformChatConnect}
          >
            <Wifi size={15} />
            {isNetworkConnected ? "Disconnect" : "Connect"}
          </button>
        </div>
        <span className="chat-network-message">{platformChatConnection.message}</span>
        <button className="secondary-action compact-action chat-ingest-action" type="button" disabled={!platformChat.enabled} onClick={onPlatformChatSampleIngest}>
          <MessageCircle size={15} />
          Test Platform Chat
        </button>
      </div>

      <SpeechSlider label="Rate" value={chatReader.settings.rate} min={0.5} max={1.5} step={0.05} onChange={(rate) => onSettingsChange({ rate })} />
      <SpeechSlider label="Pitch" value={chatReader.settings.pitch} min={0.5} max={1.5} step={0.05} onChange={(pitch) => onSettingsChange({ pitch })} />
      <SpeechSlider label="Volume" value={chatReader.settings.volume} min={0} max={1} step={0.05} onChange={(volume) => onSettingsChange({ volume })} />
      <SpeechSlider
        label="Max length"
        value={chatReader.settings.maxMessageLength}
        min={40}
        max={240}
        step={10}
        onChange={(maxMessageLength) => onSettingsChange({ maxMessageLength })}
      />
      <SpeechSlider
        label="Queue limit"
        value={chatReader.settings.maxQueueLength}
        min={4}
        max={24}
        step={1}
        onChange={(maxQueueLength) => onSettingsChange({ maxQueueLength })}
      />
      <SpeechSlider
        label="Dedupe window"
        value={chatReader.settings.duplicateWindowSeconds}
        min={0}
        max={120}
        step={5}
        onChange={(duplicateWindowSeconds) => onSettingsChange({ duplicateWindowSeconds })}
      />
      <SpeechSlider
        label="Author/min"
        value={chatReader.settings.maxMessagesPerAuthorPerMinute}
        min={1}
        max={30}
        step={1}
        onChange={(maxMessagesPerAuthorPerMinute) => onSettingsChange({ maxMessagesPerAuthorPerMinute })}
      />
      <div className="monitor-row">
        <button
          className={`segmented-button ${chatReader.settings.redactUrls ? "active" : ""}`}
          type="button"
          onClick={() => onSettingsChange({ redactUrls: !chatReader.settings.redactUrls })}
        >
          URL Redact
        </button>
        <button
          className={`segmented-button ${chatReader.settings.skipCommandMessages ? "active" : ""}`}
          type="button"
          onClick={() => onSettingsChange({ skipCommandMessages: !chatReader.settings.skipCommandMessages })}
        >
          Skip Commands
        </button>
      </div>
      <div className="monitor-row">
        <button
          className={`segmented-button ${chatReader.settings.moderationEnabled ? "active" : ""}`}
          type="button"
          onClick={() => onSettingsChange({ moderationEnabled: !chatReader.settings.moderationEnabled })}
        >
          Spam Guard
        </button>
        <button
          className={`segmented-button ${chatReader.settings.blockLinkMessages ? "active" : ""}`}
          type="button"
          onClick={() => onSettingsChange({ blockLinkMessages: !chatReader.settings.blockLinkMessages })}
        >
          Block Links
        </button>
        <button
          className={`segmented-button ${chatReader.settings.blockExcessiveCaps ? "active" : ""}`}
          type="button"
          onClick={() => onSettingsChange({ blockExcessiveCaps: !chatReader.settings.blockExcessiveCaps })}
        >
          Block Caps
        </button>
      </div>

      <label className="field">
        <span>Muted words</span>
        <input value={mutedWords} onChange={(event) => updateMutedWords(event.target.value)} />
      </label>

      <div className="chat-history" aria-label="recent comments">
        {chatReader.history.length === 0 ? (
          <span className="chat-empty">No comments yet</span>
        ) : (
          chatReader.history.slice(0, 4).map((message) => {
            const isPinned = chatReader.pinnedMessage?.id === message.id;
            return (
              <span key={message.id} className={`chat-history-row${isPinned ? " pinned" : ""}`}>
                <strong>{message.author}</strong>
                <span>{message.body}</span>
                <button
                  className="chat-pin-button"
                  type="button"
                  aria-pressed={isPinned}
                  onClick={() => (isPinned ? onUnpin() : onPin(message.id))}
                >
                  {isPinned ? "解除" : "📌 ピン留め"}
                </button>
              </span>
            );
          })
        )}
      </div>
    </section>
  );
};

type BrowserAvatarRigInferenceInput = Pick<
  AvatarIllustrationRigInferenceInput,
  "imageAspectRatio" | "imageAnalysis" | "landmarkAnalysis"
>;

const resolveBrowserAvatarRigInferenceInput = (uri: string): Promise<BrowserAvatarRigInferenceInput> => {
  const trimmedUri = uri.trim();
  if (!trimmedUri || typeof window === "undefined" || typeof window.Image !== "function") {
    return Promise.resolve({});
  }

  return loadBrowserAvatarRigInferenceInput(trimmedUri, false).then((result) => {
    if (result.analysisReadable || !isCrossOriginHttpUri(trimmedUri)) {
      return result.input;
    }
    return loadBrowserAvatarRigInferenceInput(trimmedUri, true).then((retry) =>
      retry.analysisReadable ? retry.input : result.input
    );
  });
};

const loadBrowserAvatarRigInferenceInput = (
  uri: string,
  anonymousCors: boolean
): Promise<{
  input: BrowserAvatarRigInferenceInput;
  analysisReadable: boolean;
}> =>
  new Promise((resolve) => {
    const image = new window.Image();
    if (anonymousCors) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => {
      const imageAspectRatio = image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : null;
      if (!imageAspectRatio || typeof document === "undefined") {
        resolve({
          input: imageAspectRatio === null ? {} : { imageAspectRatio },
          analysisReadable: false
        });
        return;
      }
      try {
        const maxAnalysisSize = 512;
        const scale = Math.min(1, maxAnalysisSize / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          resolve({ input: { imageAspectRatio }, analysisReadable: false });
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        detectBrowserAvatarLandmarkAnalysis(canvas, width, height)
          .then((landmarkAnalysis) => {
            try {
              const imageData = context.getImageData(0, 0, width, height);
              const imageAnalysis = analyzeAvatarIllustrationAlphaMask({
                width,
                height,
                data: imageData.data
              });
              const pixelLandmarkAnalysis = createAvatarIllustrationLandmarkAnalysisFromPixelFeatures({
                width,
                height,
                data: imageData.data,
                foregroundBounds: imageAnalysis?.foregroundBounds ?? null
              });
              resolve({
                input: createBrowserAvatarRigInferenceInput(
                  imageAspectRatio,
                  imageAnalysis,
                  selectBrowserAvatarRigLandmarkAnalysis(landmarkAnalysis, pixelLandmarkAnalysis)
                ),
                analysisReadable: true
              });
            } catch {
              resolve({
                input: createBrowserAvatarRigInferenceInput(imageAspectRatio, null, landmarkAnalysis),
                analysisReadable: Boolean(landmarkAnalysis)
              });
            }
          })
          .catch(() => {
            try {
              const imageData = context.getImageData(0, 0, width, height);
              const imageAnalysis = analyzeAvatarIllustrationAlphaMask({
                width,
                height,
                data: imageData.data
              });
              const pixelLandmarkAnalysis = createAvatarIllustrationLandmarkAnalysisFromPixelFeatures({
                width,
                height,
                data: imageData.data,
                foregroundBounds: imageAnalysis?.foregroundBounds ?? null
              });
              resolve({
                input: createBrowserAvatarRigInferenceInput(imageAspectRatio, imageAnalysis, pixelLandmarkAnalysis),
                analysisReadable: true
              });
            } catch {
              resolve({ input: { imageAspectRatio }, analysisReadable: false });
            }
          });
      } catch {
        resolve({ input: { imageAspectRatio }, analysisReadable: false });
      }
    };
    image.onerror = () => resolve({ input: {}, analysisReadable: false });
    image.src = uri;
  });

const createBrowserAvatarRigInferenceInput = (
  imageAspectRatio: number,
  imageAnalysis: BrowserAvatarRigInferenceInput["imageAnalysis"],
  landmarkAnalysis: BrowserAvatarRigInferenceInput["landmarkAnalysis"]
): BrowserAvatarRigInferenceInput => ({
  imageAspectRatio,
  ...(imageAnalysis ? { imageAnalysis } : {}),
  ...(landmarkAnalysis ? { landmarkAnalysis } : {})
});

const selectBrowserAvatarRigLandmarkAnalysis = (
  detectorAnalysis: BrowserAvatarRigInferenceInput["landmarkAnalysis"],
  pixelAnalysis: BrowserAvatarRigInferenceInput["landmarkAnalysis"]
): BrowserAvatarRigInferenceInput["landmarkAnalysis"] => {
  if (!detectorAnalysis) {
    return pixelAnalysis;
  }
  if (!pixelAnalysis || detectorAnalysis.confidence >= 0.82) {
    return detectorAnalysis;
  }
  return pixelAnalysis.confidence > detectorAnalysis.confidence ? pixelAnalysis : detectorAnalysis;
};

interface BrowserFaceDetector {
  detect(image: HTMLCanvasElement): Promise<BrowserDetectedFace[]>;
}

interface BrowserFaceDetectorConstructor {
  new (options?: { fastMode?: boolean; maxDetectedFaces?: number }): BrowserFaceDetector;
}

interface BrowserDetectedFace {
  boundingBox: {
    x?: number;
    y?: number;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  };
  landmarks?: BrowserDetectedFaceLandmark[] | null;
}

interface BrowserDetectedFaceLandmark {
  type?: string;
  locations?: BrowserDetectedFacePoint[] | null;
}

interface BrowserDetectedFacePoint {
  x?: number;
  y?: number;
}

let browserFaceDetector: BrowserFaceDetector | null = null;
let browserFaceDetectorInitialized = false;

const detectBrowserAvatarLandmarkAnalysis = async (
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): Promise<BrowserAvatarRigInferenceInput["landmarkAnalysis"]> => {
  const detector = getBrowserFaceDetector();
  if (!detector) {
    return null;
  }
  try {
    const faces = await detector.detect(canvas);
    const detectorFaces = faces.map((face): AvatarIllustrationDetectorFace => ({
      boundingBox: {
        x: finiteBrowserNumber(face.boundingBox.x, finiteBrowserNumber(face.boundingBox.left, 0)),
        y: finiteBrowserNumber(face.boundingBox.y, finiteBrowserNumber(face.boundingBox.top, 0)),
        width: finiteBrowserNumber(face.boundingBox.width, 0),
        height: finiteBrowserNumber(face.boundingBox.height, 0)
      },
      landmarks: (face.landmarks ?? []).map((landmark) => ({
        type: landmark.type ?? "unknown",
        locations: (landmark.locations ?? []).map((point) => ({
          x: finiteBrowserNumber(point.x, Number.NaN),
          y: finiteBrowserNumber(point.y, Number.NaN),
          confidence: 0.82
        }))
      }))
    }));
    return createAvatarIllustrationLandmarkAnalysisFromDetector({ width, height, faces: detectorFaces });
  } catch {
    return null;
  }
};

const getBrowserFaceDetector = (): BrowserFaceDetector | null => {
  if (browserFaceDetectorInitialized) {
    return browserFaceDetector;
  }
  browserFaceDetectorInitialized = true;
  if (typeof window === "undefined") {
    return null;
  }
  const FaceDetector = (window as Window & typeof globalThis & { FaceDetector?: BrowserFaceDetectorConstructor }).FaceDetector;
  if (typeof FaceDetector !== "function") {
    return null;
  }
  try {
    browserFaceDetector = new FaceDetector({ fastMode: false, maxDetectedFaces: 1 });
  } catch {
    browserFaceDetector = null;
  }
  return browserFaceDetector;
};

const finiteBrowserNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const isCrossOriginHttpUri = (uri: string): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const parsed = new URL(uri, window.location.href);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.origin !== window.location.origin;
  } catch {
    return false;
  }
};

interface ProgramPreviewProps {
  scene: SceneDocument;
  selectedSourceId: string;
  chatMessages: ReturnType<typeof selectChatOverlayMessages>;
  captions: CaptionOverlayCue[];
  captionsEnabled: boolean;
  nowMs: number;
  transitionPreview: SceneTransitionPreview | null;
  onSelectSource(sourceId: string): void;
}

const ProgramPreview = ({
  scene,
  selectedSourceId,
  chatMessages,
  captions,
  captionsEnabled,
  nowMs,
  transitionPreview,
  onSelectSource
}: ProgramPreviewProps) => {
  const transitionOpacity = useSceneTransitionOpacity(transitionPreview);
  return (
    <div className="program-preview">
      <div className="preview-toolbar">
        <span>{scene.name}</span>
        <span>
          {scene.canvas.width}x{scene.canvas.height} / {scene.canvas.fps}fps
        </span>
      </div>
      <div className="program-stage">
        <ScenePreviewLayer
          scene={scene}
          selectedSourceId={selectedSourceId}
          chatMessages={chatMessages}
          captions={captions}
          captionsEnabled={captionsEnabled}
          nowMs={nowMs}
          interactive
          onSelectSource={onSelectSource}
        />
        {transitionPreview && transitionOpacity > 0 ? (
          <div className="program-transition-layer" style={{ opacity: transitionOpacity }} aria-hidden="true">
            <ScenePreviewLayer
              scene={transitionPreview.scene}
              chatMessages={chatMessages}
              captions={captions}
              captionsEnabled={captionsEnabled}
              nowMs={nowMs}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};

const ScenePreviewLayer = ({
  scene,
  selectedSourceId = "",
  chatMessages,
  captions,
  captionsEnabled,
  nowMs,
  interactive = false,
  onSelectSource
}: {
  scene: SceneDocument;
  selectedSourceId?: string;
  chatMessages: ReturnType<typeof selectChatOverlayMessages>;
  captions: CaptionOverlayCue[];
  captionsEnabled: boolean;
  nowMs: number;
  interactive?: boolean;
  onSelectSource?(sourceId: string): void;
}) => (
  <>
    {toRenderGraph(scene, { chatMessages, captions, captionsEnabled, nowMs }).map((node) => {
      const source = scene.sources.find((item) => item.id === node.id);
      if (!source) {
        return null;
      }
      const style = {
        left: `${source.transform.x * 100}%`,
        top: `${source.transform.y * 100}%`,
        width: `${source.transform.width * 100}%`,
        height: `${source.transform.height * 100}%`,
        opacity: source.transform.opacity,
        transform: `rotate(${source.transform.rotation}deg)`
      };
      const className = `program-source ${source.kind} ${source.id === selectedSourceId ? "selected" : ""}`;
      return interactive && onSelectSource ? (
        <button key={source.id} className={className} style={style} type="button" onClick={() => onSelectSource(source.id)}>
          <SourceVisual source={source} node={node} />
        </button>
      ) : (
        <div key={source.id} className={className} style={style}>
          <SourceVisual source={source} node={node} />
        </div>
      );
    })}
  </>
);

const useSceneTransitionOpacity = (transitionPreview: SceneTransitionPreview | null): number => {
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    if (!transitionPreview || transitionPreview.settings.kind !== "fade" || transitionPreview.settings.durationMs <= 0) {
      setOpacity(0);
      return undefined;
    }

    const updateOpacity = () => {
      const elapsed = Date.now() - transitionPreview.startedAt;
      setOpacity(Math.max(0, 1 - elapsed / transitionPreview.settings.durationMs));
    };
    updateOpacity();
    const timer = window.setInterval(updateOpacity, 16);
    return () => window.clearInterval(timer);
  }, [transitionPreview]);

  return opacity;
};

const SourceVisual = ({ source, node }: { source: SceneSource; node?: RenderNode }) => {
  if (source.kind === "screen") {
    return (
      <div className="screen-visual">
        <MonitorSmartphone size={32} />
        <span>Screen Capture</span>
      </div>
    );
  }

  if (source.kind === "pngtuber" || source.kind === "live2d" || source.kind === "vrm") {
    const motion = source.motion ?? defaultAvatarMotion();
    const rig = source.kind === "pngtuber" ? source.illustrationRig : defaultAvatarIllustrationRig();
    const eyeClose = Math.min(0.95, Math.max(source.blink, motion.eyeSquint));
    const mouthLevel = Math.max(source.mouthOpen, motion.mouthDeform);
    const bodyTransform = [
      `translate(${motion.shoulderSway * 2.6}%, ${(-motion.bodyBounce + motion.breathing) * 100}px)`,
      `rotate(${motion.bodyLean * 10}deg)`
    ].join(" ");
    const headTransform = [
      `translate(${motion.headX * 100}%, ${motion.headY * 100}%)`,
      `rotate(${motion.headRoll * 18}deg)`,
      `skew(${motion.headYaw * 7 + motion.meshWarp * 4.5}deg, ${-motion.headPitch * 5 + motion.hairSway * 1.8}deg)`,
      `scale(${Math.max(0.84, 1 - Math.abs(motion.headYaw) * 0.08 - motion.depthTilt * 0.045)}, ${Math.max(
        0.9,
        1 - Math.abs(motion.headPitch) * 0.04 + mouthLevel * 0.018
      )})`
    ].join(" ");

    if (source.kind === "pngtuber" && source.imageUri.trim()) {
      return (
        <div
          className="avatar-visual still-image"
          style={{
            transform: `${bodyTransform} ${headTransform}`,
            transformOrigin: `${Math.round(rig.faceCenterX * 100)}% ${Math.round(rig.faceCenterY * 100)}%`
          }}
        >
          <img src={source.imageUri} alt="" />
        </div>
      );
    }

    return (
      <div className={`avatar-visual ${source.expression}`} style={{ transform: bodyTransform }}>
        <span className="avatar-body" aria-hidden="true" />
        <div className="avatar-head" style={{ transform: headTransform }}>
          <span className="avatar-eye left" style={{ transform: `scaleY(${Math.max(0.1, 1 - eyeClose)})` }} />
          <span className="avatar-eye right" style={{ transform: `scaleY(${Math.max(0.1, 1 - eyeClose)})` }} />
          <span className="avatar-mouth" style={{ height: `${8 + mouthLevel * 34}px` }} />
        </div>
        <span className="avatar-label">{source.kind === "live2d" ? "Live2D" : source.kind === "vrm" ? "VRM" : "PNGTuber"}</span>
      </div>
    );
  }

  if (source.kind === "text") {
    const text = typeof node?.payload.text === "string" ? node.payload.text : source.text;
    const textStyle: CSSProperties = {
      color: source.color,
      fontSize: `${fontSizeForTextSource(source)}px`,
      justifyContent: textSourceJustifyContent(source.align),
      textAlign: source.align,
      backgroundColor: rgbaFromHex(source.backgroundColor, source.backgroundOpacity),
      WebkitTextStroke: source.outlineWidth > 0 ? `${Math.max(1, source.outlineWidth / 2)}px ${source.outlineColor}` : undefined
    };
    const textCopyStyle: CSSProperties = {
      WebkitLineClamp: source.maxLines
    };
    return (
      <span className={`text-visual ${source.mode}`} style={textStyle}>
        <span className="text-visual-copy" style={textCopyStyle}>
          {text}
        </span>
      </span>
    );
  }

  if (source.kind === "chat") {
    const text = typeof node?.payload.text === "string" ? node.payload.text : "";
    const messages = parseChatOverlayPayloadMessages(node);
    const lines = text ? text.split("\n") : ["Chat overlay"];
    return (
      <div
        className={`chat-overlay-visual ${text ? "" : "empty"}`}
        style={{
          color: source.color,
          fontSize: `${fontSizeForChatSource(source)}px`,
          backgroundColor: rgbaFromHex(source.backgroundColor, source.backgroundOpacity)
        }}
      >
        {messages.length > 0
          ? messages.slice(0, source.maxMessages).map((message, index) => (
              <span key={`${message.author}-${message.body}-${index}`} className={message.pinned ? "pinned" : undefined}>
                {source.showAuthor ? `${message.author}: ${message.body}` : message.body}
              </span>
            ))
          : lines.slice(0, source.maxMessages).map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}
      </div>
    );
  }

  if (source.kind === "solid") {
    return <span className="solid-visual" style={{ background: source.color }} />;
  }

  if (source.kind === "image" && source.uri.trim()) {
    return (
      <span className="image-visual still-image">
        <img src={source.uri} alt="" />
      </span>
    );
  }

  return <span className="image-visual">Image</span>;
};

const TextOverlayStatusStrip = ({ status }: { status: TextOverlayRuntimeStatus }) => {
  const previewText = formatTextOverlayPreview(status.previewText);
  return (
    <div className="quick-text-status" aria-label="subtitle and text display status">
      <span>
        <strong>{status.activeSourceCount}</strong>表示中
      </span>
      <span>
        <strong>{status.queuedSourceCount}</strong>待機
      </span>
      <span>
        <strong>{status.pinnedSourceCount}</strong>固定
      </span>
      <span>
        <strong>{formatTextOverlayRemaining(status.remainingMs)}</strong>残り
      </span>
      <span className="quick-text-status-preview" title={status.previewText || undefined}>
        {previewText || "表示テキストなし"}
      </span>
    </div>
  );
};

const StatusPill = ({ label, tone }: { label: string; tone: "live" | "idle" | "bad" }) => (
  <span className={`status-pill ${tone}`}>{label}</span>
);

const AvatarRigQualityPanel = ({ rig }: { rig: AvatarIllustrationRig }) => {
  const summary = createAvatarIllustrationRigTuningSummary(rig);
  const faceTop = clampRigPercent(summary.faceTop);
  const faceBottom = clampRigPercent(summary.faceBottom);
  const faceBandStyle: CSSProperties = {
    top: `${faceTop}%`,
    height: `${Math.max(6, faceBottom - faceTop)}%`
  };
  const issue = summary.issues[0] ?? "Ready for retained proof.";

  return (
    <div className={`avatar-rig-quality ${summary.grade}`} aria-label="PNGTuber rig quality">
      <div className="rig-quality-head">
        <span>Rig quality</span>
        <strong>{summary.highFidelityScore}/100</strong>
      </div>
      <div className="rig-quality-body">
        <div className="rig-map" aria-hidden="true">
          <span className="rig-face-band" style={faceBandStyle} />
          <RigMapAnchor label="Face" x={rig.faceCenterX} y={rig.faceCenterY} />
          <RigMapAnchor label="L" x={rig.leftEyeX} y={rig.eyeLineY} />
          <RigMapAnchor label="R" x={rig.rightEyeX} y={rig.eyeLineY} />
          <RigMapAnchor label="M" x={rig.mouthCenterX} y={rig.mouthLineY} />
          <RigMapLine label="Hair" value={rig.hairLineY} />
          <RigMapLine label="Eye" value={rig.eyeLineY} />
          <RigMapLine label="Mouth" value={rig.mouthLineY} />
          <RigMapLine label="Shoulder" value={rig.shoulderLineY} />
        </div>
        <div className="rig-score-list">
          <RigScoreBar label="Parts" score={summary.partSeparationScore} />
          <RigScoreBar label="Depth" score={summary.depthContinuityScore} />
          <RigScoreBar label="Semantic" score={summary.semanticSegmentScore} />
          <RigScoreBar label="Eye/Mouth" score={summary.eyeMouthSegmentScore} />
          <RigScoreBar label="Anchors" score={summary.horizontalAnchorScore} />
          <RigScoreBar label="Slices" score={rig.sliceCount >= 24 ? 100 : rig.sliceCount >= 20 ? 90 : 0} />
        </div>
      </div>
      <p className="rig-quality-message">{issue}</p>
    </div>
  );
};

const RigMapLine = ({ label, value }: { label: string; value: number }) => (
  <span className="rig-map-line" style={{ top: `${clampRigPercent(value)}%` }}>
    <i />
    <b>{label}</b>
  </span>
);

const RigMapAnchor = ({ label, x, y }: { label: string; x: number; y: number }) => (
  <span className="rig-map-anchor" style={{ left: `${clampRigPercent(x)}%`, top: `${clampRigPercent(y)}%` }}>
    {label}
  </span>
);

const RigScoreBar = ({ label, score }: { label: string; score: number }) => {
  const normalized = clampRigPercent(score / 100);
  return (
    <span className="rig-score-row">
      <span>{label}</span>
      <span
        className="rig-score-track"
        role="progressbar"
        aria-label={`${label} rig score`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(normalized)}
      >
        <i style={{ width: `${normalized}%` }} />
      </span>
      <strong>{Math.round(normalized)}</strong>
    </span>
  );
};

const clampRigPercent = (value: number): number => Math.max(0, Math.min(100, Number.isFinite(value) ? value * 100 : 0));

const Metric = ({ icon, label }: { icon: ReactNode; label: string }) => (
  <span className="metric">
    {icon}
    {label}
  </span>
);

const Slider = ({
  label,
  value,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange(value: number): void;
}) => (
  <label className="slider-field">
    <span>
      {label}
      <strong>{Math.round(value * 100)}</strong>
    </span>
    <input
      min="0"
      max="1"
      step="0.01"
      type="range"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </label>
);

const SpeechSlider = ({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange(value: number): void;
}) => (
  <label className="slider-field">
    <span>
      {label}
      <strong>{Number.isInteger(value) ? value : value.toFixed(2)}</strong>
    </span>
    <input
      min={min}
      max={max}
      step={step}
      type="range"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </label>
);

const formatElapsed = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`;
};

const formatTextOverlayRemaining = (remainingMs: number): string => {
  if (remainingMs <= 0) {
    return "-";
  }
  return `${Math.ceil(remainingMs / 1000)}s`;
};

const formatTextOverlayPreview = (value: string): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 48 ? `${normalized.slice(0, 47)}...` : normalized;
};

const parseChatOverlayPayloadMessages = (
  node?: RenderNode
): Array<{ author: string; body: string; source?: string; pinned?: boolean }> => {
  if (typeof node?.payload.messagesJson !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(node.payload.messagesJson);
    return Array.isArray(parsed)
      ? parsed.flatMap((message) =>
          typeof message?.author === "string" && typeof message?.body === "string"
            ? [
                {
                  author: message.author,
                  body: message.body,
                  source: typeof message.source === "string" ? message.source : undefined,
                  pinned: message.pinned === true
                }
              ]
            : []
        )
      : [];
  } catch {
    return [];
  }
};

const formatDateTimeLocalInputValue = (valueMs: number | undefined): string => {
  if (!valueMs || !Number.isFinite(valueMs) || valueMs <= 0) {
    return "";
  }
  const date = new Date(valueMs);
  const localMs = valueMs - date.getTimezoneOffset() * 60 * 1000;
  return new Date(localMs).toISOString().slice(0, 16);
};

const parseDateTimeLocalInputValue = (value: string, fallbackMs: number): number => {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallbackMs;
};

const fontSizeForTextSource = (source: Extract<SceneSource, { kind: "text" }>): number => {
  const lineFactor = source.mode === "subtitle" ? Math.max(1, source.maxLines) : 1;
  const sourceWidthBudget = source.transform.width * (source.mode === "ticker" ? 34 : 48);
  const sourceHeightBudget = (source.transform.height * 160) / lineFactor;
  return Math.max(10, Math.min(source.fontSize / 2, sourceWidthBudget, sourceHeightBudget));
};

const textSourceJustifyContent = (align: TextSourceAlign): CSSProperties["justifyContent"] =>
  align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";

const fontSizeForChatSource = (source: Extract<SceneSource, { kind: "chat" }>): number => {
  const lineBudget = source.transform.height * 132;
  const widthBudget = source.transform.width * 52;
  return Math.max(10, Math.min(source.fontSize / 2, lineBudget, widthBudget));
};

const rgbaFromHex = (hex: string, alpha: number): string => {
  const normalized = hex.trim().replace(/^#/, "");
  const color = /^[0-9a-fA-F]{6}$/.test(normalized) ? normalized : "000000";
  const red = Number.parseInt(color.slice(0, 2), 16);
  const green = Number.parseInt(color.slice(2, 4), 16);
  const blue = Number.parseInt(color.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
};
