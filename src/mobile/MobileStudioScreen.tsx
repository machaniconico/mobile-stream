import { Alert, Image, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useEffect, useState, type ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AvatarExpression, AvatarRuntimeState } from "../domain/avatar";
import {
  createAvatarIllustrationRigTuningSummary,
  type AvatarIllustrationRigQualityGrade
} from "../domain/avatarIllustrationRigQuality";
import type { AudioRouteState } from "../domain/audioRoute";
import {
  normalizeMutedWordsInput,
  selectChatOverlayMessages,
  type ChatReaderSettings,
  type ChatReaderState
} from "../domain/chatReader";
import type { FaceTrackingRuntimeState } from "../domain/faceTracking";
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
import {
  createYouTubeBroadcastTransitionPreflightReport,
  type PlatformPublishingPreflightReport
} from "../domain/platformPublishingPreflight";
import type { BroadcastMixerChannelId, DestinationPresetId, MicEffectPresetId, StudioProfile, StreamProtocol } from "../domain/profiles";
import { getPlatformChatConnectionStatus, type PlatformChatSettings } from "../domain/platformChat";
import {
  applyDestinationPreset,
  applyMicEffectPreset,
  broadcastMixerChannels,
  destinationPresets,
  markDestinationCustom,
  micEffectPresets,
  qualityProfiles,
  redactStreamKey,
  serverUrlWithProtocol
} from "../domain/profiles";
import type { ReadinessIssue, ReadinessReport } from "../domain/readiness";
import {
  addSource,
  applyInferredAvatarIllustrationRig,
  createSource,
  defaultAvatarIllustrationRig,
  defaultAvatarMotion,
  reorderSource,
  setLocked,
  setVisibility,
  toRenderGraph,
  updateSource,
  updateTransform,
  type AvatarIllustrationRig,
  type SceneDocument,
  type RenderNode,
  type SceneSource,
  type SceneTemplateId,
  type SceneTransitionKind,
  type SceneTransitionPreview,
  type SceneTransitionSettings,
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
  formatStreamDiagnosticReport,
  type StreamDiagnostics
} from "../domain/streamDiagnostics";
import { applyStreamQualityAdvisorTarget } from "../domain/streamQualityAdvisor";
import type { StreamQualityAutomationDecision } from "../domain/streamQualityAutomation";
import type { StreamSessionEvent } from "../domain/streamSessionLog";
import type { StreamAudioLevelSample, StreamSessionSummary } from "../domain/streamSessionSummary";
import {
  createStreamValidationRun,
  formatStreamValidationRunAudioLabel,
  type StreamValidationDevicePlatform,
  type StreamValidationRun,
  type StreamValidationRunResult
} from "../domain/streamValidationEvidence";
import type { NativeEngineSnapshot } from "../native/LiveCasterNative";
import {
  createSupportBundle,
  formatSupportBundle
} from "../domain/supportBundle";
import {
  pickStillImageAsset,
  pickVrmModelAsset,
  prepareStillImageAsset,
  prepareVrmModelAsset
} from "./sceneStore";

interface MobileStudioScreenProps {
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
  readiness: ReadinessReport;
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
  audioRoute: AudioRouteState;
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
  onChatReaderSettingsChange(settings: Partial<ChatReaderSettings>): void;
  onChatCommentsClear(): void;
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
  onPlatformChatConnect(): void;
  onPlatformChatDisconnect(): void;
  onPlatformChatSampleIngest(): void;
  onClearStreamKey(): void | Promise<void>;
  onPrivacyShieldActivate(): void | Promise<void>;
  onClearStreamSessionSummaries(): void | Promise<void>;
  onRecordStreamValidationRun(run: StreamValidationRun): void | Promise<void>;
  onClearStreamValidationRuns(): void | Promise<void>;
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
const sceneTransitionKinds: Array<{ kind: SceneTransitionKind; label: string }> = [
  { kind: "cut", label: "Cut" },
  { kind: "fade", label: "Fade" }
];
const expressions: AvatarExpression[] = ["neutral", "happy", "angry", "surprised"];

const shareStreamDiagnosticReport = async (diagnostics: StreamDiagnostics, publicLaunchChecklist: PublicLaunchChecklist) => {
  const report = createStreamDiagnosticReport(diagnostics, new Date(), publicLaunchChecklist);
  await Share.share({
    title: "MobileLiveCaster diagnostics",
    message: formatStreamDiagnosticReport(report)
  });
};

const shareSupportBundle = async ({
  scene,
  profile,
  readiness,
  preflight,
  diagnostics
}: {
  scene: SceneDocument;
  profile: StudioProfile;
  readiness: ReadinessReport;
  preflight: StreamStartPreflightReport;
  diagnostics: StreamDiagnostics;
}) => {
  const bundle = createSupportBundle({ scene, profile, readiness, preflight, diagnostics });
  await Share.share({
    title: "MobileLiveCaster support bundle",
    message: formatSupportBundle(bundle)
  });
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

const sessionNativeRuntimeLabel = (summary: StreamSessionSummary): string =>
  summary.nativeRuntime
    ? `${summary.nativeRuntime.status} / ${summary.nativeRuntime.platform} / ${summary.nativeRuntime.publisherState || "-"} / queue ${summary.nativeRuntime.queuedItems}/${summary.nativeRuntime.cacheSize} / vrm ${summary.nativeRuntime.vrmActivePoseCount}/${summary.nativeRuntime.vrmSourceCount} active payloads ${summary.nativeRuntime.vrmPosePayloadCount} renderer ${summary.nativeRuntime.vrmRendererStatus} ${summary.nativeRuntime.vrmRenderedSourceCount}/${summary.nativeRuntime.vrmSourceCount} models ${summary.nativeRuntime.vrmModelLoadedCount} bones ${summary.nativeRuntime.vrmHumanoidBoneCount} expressions ${summary.nativeRuntime.vrmExpressionCount} ${vrmRenderabilityMetricLabel(summary.nativeRuntime)} pose ${summary.nativeRuntime.vrmPoseBoneAppliedCount}/${summary.nativeRuntime.vrmPoseBoneCount} bones ${summary.nativeRuntime.vrmPoseExpressionAppliedCount}/${summary.nativeRuntime.vrmPoseExpressionCount} expressions / drops ${summary.nativeRuntime.droppedVideoFrames} video ${summary.nativeRuntime.droppedAudioFrames} audio`
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
  `${diagnostics.nativeComposition.coverage} / ${diagnostics.nativeComposition.previewOnlySourceCount} preview-only`;

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
    ? `${diagnostics.nativeRuntime.platform} / ${diagnostics.nativeRuntime.publisher.state || diagnostics.nativeRuntime.runtimeStatus} / ${diagnostics.nativeRuntime.composition.status} / assets ${diagnostics.nativeRuntime.composition.stillImageAssetLoadedCount ?? 0}/${diagnostics.nativeRuntime.composition.stillImageAssetCount ?? 0} decoded ${diagnostics.nativeRuntime.composition.stillImageAssetDecodedCount ?? 0} decoded pixels ${diagnostics.nativeRuntime.composition.stillImageAssetDecodedPixelCount ?? 0} composited ${diagnostics.nativeRuntime.composition.stillImageAssetCompositedCount ?? 0} composited pixels ${diagnostics.nativeRuntime.composition.stillImageAssetCompositedPixelCount ?? 0} / app-group ${diagnostics.nativeRuntime.composition.stillImageAssetAppGroupLoadedCount ?? 0}/${diagnostics.nativeRuntime.composition.stillImageAssetAppGroupCount ?? 0} loaded ${diagnostics.nativeRuntime.composition.stillImageAssetAppGroupDecodedCount ?? 0} decoded pixels ${diagnostics.nativeRuntime.composition.stillImageAssetAppGroupDecodedPixelCount ?? 0} ${diagnostics.nativeRuntime.composition.stillImageAssetAppGroupCompositedCount ?? 0} composited pixels ${diagnostics.nativeRuntime.composition.stillImageAssetAppGroupCompositedPixelCount ?? 0} / vrm ${diagnostics.nativeRuntime.composition.vrmActivePoseCount ?? 0}/${diagnostics.nativeRuntime.composition.vrmSourceCount ?? 0} active payloads ${diagnostics.nativeRuntime.composition.vrmPosePayloadCount ?? 0} renderer ${diagnostics.nativeRuntime.composition.vrmRendererStatus ?? ((diagnostics.nativeRuntime.composition.vrmSourceCount ?? 0) > 0 ? "unavailable" : "not-required")} ${diagnostics.nativeRuntime.composition.vrmRenderedSourceCount ?? 0}/${diagnostics.nativeRuntime.composition.vrmSourceCount ?? 0} models ${diagnostics.nativeRuntime.composition.vrmModelLoadedCount ?? 0} bones ${diagnostics.nativeRuntime.composition.vrmHumanoidBoneCount ?? 0} expressions ${diagnostics.nativeRuntime.composition.vrmExpressionCount ?? 0} ${vrmRenderabilityMetricLabel(diagnostics.nativeRuntime.composition)} pose ${(diagnostics.nativeRuntime.composition.vrmPoseBoneAppliedCount ?? 0)}/${diagnostics.nativeRuntime.composition.vrmPoseBoneCount ?? 0} bones ${(diagnostics.nativeRuntime.composition.vrmPoseExpressionAppliedCount ?? 0)}/${diagnostics.nativeRuntime.composition.vrmPoseExpressionCount ?? 0} expressions / frame interval ${diagnostics.nativeRuntime.publisher.videoFrameIntervalSampleCount ?? 0} samples avg ${diagnostics.nativeRuntime.publisher.videoFrameIntervalAverageMs ?? 0}ms max ${diagnostics.nativeRuntime.publisher.videoFrameIntervalMaxMs ?? 0}ms jitter ${diagnostics.nativeRuntime.publisher.videoFrameIntervalJitterMs ?? 0}ms${diagnostics.nativeRuntime.audioProcessing?.micEffectsEnabled ? ` / mic fx ${diagnostics.nativeRuntime.audioProcessing.micEffectsPresetId} ${diagnostics.nativeRuntime.audioProcessing.micEffectsProcessedFrames}` : ""}${nativeRuntimeMonitorMetricLabel(diagnostics)}${diagnostics.nativeRuntime.stale ? " / stale" : ""}${diagnostics.nativeRuntime.publisher.congested ? " / congested" : ""}`
    : "Not linked";

const audioGuardMetricLabel = (diagnostics: StreamDiagnostics): string =>
  `${diagnostics.audio.audioGuard.status} / limiter ${diagnostics.audio.audioGuard.nativeLimitedSamplePercent}% / peak ${Math.round(diagnostics.audio.audioGuard.lastSessionPeakLevel * 100)}%`;

const audioSilenceGuardMetricLabel = (diagnostics: StreamDiagnostics): string =>
  `${diagnostics.audio.audioSilenceGuard.status} / samples ${diagnostics.audio.audioSilenceGuard.sampleCount} / active ${diagnostics.audio.audioSilenceGuard.activePercent}% / peak ${Math.round(diagnostics.audio.audioSilenceGuard.peakLevel * 100)}%`;

const qualityAdvisorTargetLabel = (diagnostics: StreamDiagnostics): string =>
  diagnostics.qualityAdvisor.suggestedTarget
    ? `${diagnostics.qualityAdvisor.suggestedTarget.profileName} / ${diagnostics.qualityAdvisor.suggestedTarget.videoBitrateKbps} kbps / ${diagnostics.qualityAdvisor.suggestedTarget.fps}fps`
    : "Current target";

export const MobileStudioScreen = ({
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
  readiness,
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
  audioRoute,
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
  onChatReaderSettingsChange,
  onChatCommentsClear,
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
  onPlatformChatConnect,
  onPlatformChatDisconnect,
  onPlatformChatSampleIngest,
  onClearStreamKey,
  onPrivacyShieldActivate,
  onClearStreamSessionSummaries,
  onRecordStreamValidationRun,
  onClearStreamValidationRuns
}: MobileStudioScreenProps) => {
  const selectedSource = scene.sources.find((source) => source.id === selectedSourceId) ?? scene.sources[0];
  const [assetPrepareStatus, setAssetPrepareStatus] = useState<{
    kind: "pending" | "success" | "error";
    message: string;
  } | null>(null);
  const isLive = snapshot.state.status === "live" || snapshot.state.status === "reconnecting";
  const isBusy = snapshot.state.status === "preparing" || snapshot.state.status === "stopping";
  const operationBusy = operationStatus?.kind === "pending";
  const platformApiBusy = Boolean(platformApiOperationLabel);
  const setupLocked = isLive || isBusy || operationBusy || platformApiBusy;
  const sceneSwitchLocked = isBusy || operationBusy || platformApiBusy;
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
    const imageAspectRatio = await resolveNativeImageAspectRatio(selectedSource.imageUri);
    onSceneChange(
      applyInferredAvatarIllustrationRig(
        scene,
        selectedSource.id,
        {},
        imageAspectRatio === null ? {} : { imageAspectRatio }
      )
    );
  };
  const chatOverlayMessages = selectChatOverlayMessages(chatReader);
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
      audioRoute,
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
    audioRoute,
    faceTracking: diagnostics.faceTracking
  });
  const platformPublishingFreshness = assessPlatformPublishingFreshness(diagnostics.platformPublishing);
  const publicLaunchChecklist = createPublicLaunchChecklist({
    preflight: startPreflight,
    diagnostics,
    platformPublishingFreshness,
    profile
  });
  const canGoLive = publicLaunchChecklist.canStart;
  const youtubeTransitionReport = (transitionStatus: YouTubeBroadcastTransitionStatus) =>
    createYouTubeBroadcastTransitionPreflightReport({
      profile,
      transitionStatus,
      streamStatus: snapshot.state.status,
      validation: diagnostics.validation,
      publicLaunchChecklist,
      platformChatOAuthCredentials
    });

  useEffect(() => {
    setAssetPrepareStatus(null);
  }, [selectedSourceId]);

  const updateDestination = (update: Partial<StudioProfile["destination"]>) => {
    if (setupLocked) {
      return;
    }
    onProfileChange({
      ...profile,
      destination: {
        ...profile.destination,
        ...update
      }
    });
  };
  const updatePreset = (presetId: DestinationPresetId) => {
    if (setupLocked) {
      return;
    }
    onProfileChange(applyDestinationPreset(profile, presetId));
  };
  const updateProtocol = (protocol: StreamProtocol) => {
    updateDestination(
      markDestinationCustom(profile.destination, {
        protocol,
        serverUrl: serverUrlWithProtocol(profile.destination.serverUrl, protocol)
      })
    );
  };
  const updateServerUrl = (serverUrl: string) => {
    updateDestination(markDestinationCustom(profile.destination, { serverUrl }));
  };
  const updatePublishing = (update: Partial<StudioProfile["platformPublishing"]>) => {
    if (setupLocked) {
      return;
    }
    onProfileChange({
      ...profile,
      platformPublishing: {
        ...profile.platformPublishing,
        ...update
      }
    });
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

  const prepareSelectedStillImageAsset = async () => {
    if (setupLocked || (selectedSource.kind !== "pngtuber" && selectedSource.kind !== "image")) {
      return;
    }
    const sourceUri = selectedSource.kind === "pngtuber" ? selectedSource.imageUri : selectedSource.uri;
    if (!sourceUri.trim()) {
      const message = "Enter a still-image URI before preparing it.";
      setAssetPrepareStatus({ kind: "error", message });
      Alert.alert("Still image", message);
      return;
    }

    setAssetPrepareStatus({ kind: "pending", message: "Preparing native asset..." });
    try {
      const preparedUri = await prepareStillImageAsset(sourceUri, `${selectedSource.name}-${selectedSource.kind}.png`);
      onSceneChange(
        updateSource(scene, selectedSource.id, (source) => {
          if (source.kind === "pngtuber") {
            return { ...source, imageUri: preparedUri };
          }
          if (source.kind === "image") {
            return { ...source, uri: preparedUri };
          }
          return source;
        })
      );
      setAssetPrepareStatus({ kind: "success", message: "Ready for native compositor." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Still-image asset could not be prepared.";
      setAssetPrepareStatus({ kind: "error", message });
      Alert.alert("Still image", message);
    }
  };

  const pickSelectedStillImageAsset = async () => {
    if (setupLocked || (selectedSource.kind !== "pngtuber" && selectedSource.kind !== "image")) {
      return;
    }

    setAssetPrepareStatus({ kind: "pending", message: "Opening image picker..." });
    try {
      const pickedUri = await pickStillImageAsset(`${selectedSource.name}-${selectedSource.kind}.png`);
      if (!pickedUri) {
        setAssetPrepareStatus(null);
        return;
      }
      onSceneChange(
        updateSource(scene, selectedSource.id, (source) => {
          if (source.kind === "pngtuber") {
            return { ...source, imageUri: pickedUri };
          }
          if (source.kind === "image") {
            return { ...source, uri: pickedUri };
          }
          return source;
        })
      );
      setAssetPrepareStatus({ kind: "success", message: "Image selected and ready for native compositor." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Still-image asset could not be picked.";
      setAssetPrepareStatus({ kind: "error", message });
      Alert.alert("Still image", message);
    }
  };

  const prepareSelectedVrmModelAsset = async () => {
    if (setupLocked || selectedSource.kind !== "vrm") {
      return;
    }
    if (!selectedSource.modelUri.trim()) {
      const message = "Enter a VRM/GLB URI before preparing it.";
      setAssetPrepareStatus({ kind: "error", message });
      Alert.alert("VRM model", message);
      return;
    }

    setAssetPrepareStatus({ kind: "pending", message: "Preparing VRM model..." });
    try {
      const preparedUri = await prepareVrmModelAsset(selectedSource.modelUri, `${selectedSource.name}-${selectedSource.kind}.vrm`);
      onSceneChange(
        updateSource(scene, selectedSource.id, (source) => (source.kind === "vrm" ? { ...source, modelUri: preparedUri } : source))
      );
      setAssetPrepareStatus({ kind: "success", message: "VRM model ready for native loader validation." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "VRM model asset could not be prepared.";
      setAssetPrepareStatus({ kind: "error", message });
      Alert.alert("VRM model", message);
    }
  };

  const pickSelectedVrmModelAsset = async () => {
    if (setupLocked || selectedSource.kind !== "vrm") {
      return;
    }

    setAssetPrepareStatus({ kind: "pending", message: "Opening VRM model picker..." });
    try {
      const pickedUri = await pickVrmModelAsset(`${selectedSource.name}-${selectedSource.kind}.vrm`);
      if (!pickedUri) {
        setAssetPrepareStatus(null);
        return;
      }
      onSceneChange(
        updateSource(scene, selectedSource.id, (source) => (source.kind === "vrm" ? { ...source, modelUri: pickedUri } : source))
      );
      setAssetPrepareStatus({ kind: "success", message: "VRM model selected and ready for native loader validation." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "VRM model asset could not be picked.";
      setAssetPrepareStatus({ kind: "error", message });
      Alert.alert("VRM model", message);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.shell}>
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>ML</Text>
          </View>
          <View style={styles.brandTextBlock}>
            <Text style={styles.title}>MobileLiveCaster</Text>
            <Text style={styles.subtitle}>OBS Mode</Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <StatusPill label={snapshot.state.status} tone={isLive ? "live" : snapshot.state.status === "failed" ? "bad" : "idle"} />
          <Metric label={`${snapshot.health.bitrateKbps} kbps`} />
          <Metric label={`${snapshot.health.fps} fps`} />
          <Metric label={`${snapshot.health.droppedFrames} drops`} />
          {snapshot.health.reconnectAttempts > 0 ? <Metric label={`${snapshot.health.reconnectAttempts} retries`} /> : null}
        </View>

        <Panel title="Scenes">
          {scenes.map((candidate) => (
            <Pressable
              key={candidate.id}
              disabled={sceneSwitchLocked && candidate.id !== activeSceneId}
              hitSlop={8}
              style={[
                styles.sceneRow,
                candidate.id === activeSceneId && styles.selectedRow,
                sceneSwitchLocked && candidate.id !== activeSceneId && styles.disabledRow
              ]}
              onPress={() => onSceneSwitch(candidate.id)}
            >
              <Text style={styles.sceneName} numberOfLines={1}>
                {candidate.name}
              </Text>
              <Text style={styles.sourceMeta}>{candidate.sources.length} sources</Text>
            </Pressable>
          ))}

          <View style={styles.grid3}>
            <ActionButton label="Duplicate" disabled={setupLocked} onPress={onSceneDuplicate} />
            <ActionButton label="+ Start" disabled={setupLocked} onPress={() => onSceneCreate("starting-soon")} />
            <ActionButton label="+ Break" disabled={setupLocked} onPress={() => onSceneCreate("break")} />
          </View>
          <View style={styles.sceneTransitionControl}>
            <View style={styles.sceneTransitionHeader}>
              <Text style={styles.sourceMeta}>Transition</Text>
              <Text style={styles.sourceMeta}>
                {sceneTransitionSettings.kind === "cut" ? "instant" : `${sceneTransitionSettings.durationMs}ms`}
              </Text>
            </View>
            <View style={styles.grid2}>
              {sceneTransitionKinds.map((item) => (
                <ActionButton
                  key={item.kind}
                  label={item.label}
                  variant={sceneTransitionSettings.kind === item.kind ? "active" : "default"}
                  disabled={setupLocked}
                  onPress={() => onSceneTransitionChange({ kind: item.kind })}
                />
              ))}
            </View>
            <NumberStepper
              label="Duration ms"
              value={sceneTransitionSettings.durationMs}
              min={0}
              max={2000}
              step={50}
              disabled={setupLocked || sceneTransitionSettings.kind === "cut"}
              onChange={(durationMs) => onSceneTransitionChange({ durationMs })}
            />
          </View>
        </Panel>

        <Panel title="Sources">
          {[...scene.sources].reverse().map((source) => (
            <Pressable
              key={source.id}
              hitSlop={8}
              style={[styles.sourceRow, source.id === selectedSource.id && styles.selectedRow]}
              onPress={() => onSelectSource(source.id)}
            >
              <Text style={styles.sourceKind}>{sourceLabels[source.kind]}</Text>
              <Text style={styles.sourceName} numberOfLines={1}>
                {source.name}
              </Text>
              <Text style={styles.sourceMeta}>{source.visible ? "show" : "hide"} / {source.locked ? "lock" : "free"}</Text>
            </Pressable>
          ))}

          <View style={styles.grid2}>
            {sourceKinds.map((kind) => (
              <ActionButton key={kind} label={`+ ${sourceLabels[kind]}`} disabled={setupLocked} onPress={() => addNewSource(kind)} />
            ))}
          </View>

          <View style={styles.grid4}>
            <IconButton disabled={setupLocked} label="Up" onPress={() => onSceneChange(reorderSource(scene, selectedSource.id, 1))} />
            <IconButton disabled={setupLocked} label="Down" onPress={() => onSceneChange(reorderSource(scene, selectedSource.id, -1))} />
            <IconButton
              disabled={setupLocked}
              label={selectedSource.visible ? "Hide" : "Show"}
              onPress={() => onSceneChange(setVisibility(scene, selectedSource.id, !selectedSource.visible))}
            />
            <IconButton
              disabled={setupLocked}
              label={selectedSource.locked ? "Unlock" : "Lock"}
              onPress={() => onSceneChange(setLocked(scene, selectedSource.id, !selectedSource.locked))}
            />
          </View>
        </Panel>

        <Panel title="Program">
          <ProgramPreview
            scene={scene}
            selectedSourceId={selectedSource.id}
            chatMessages={chatOverlayMessages}
            transitionPreview={sceneTransitionPreview}
            onSelectSource={onSelectSource}
          />
        </Panel>

        <View style={styles.transport}>
          <ActionButton label="Go Live" variant="primary" disabled={!canGoLive} onPress={onStart} />
          <ActionButton label="Stop" variant="danger" disabled={operationBusy || isBusy || !isLive} onPress={onStop} />
          <ActionButton label="Shield" variant="danger" onPress={onPrivacyShieldActivate} />
          <ActionButton label="Reconnect" disabled={operationBusy || !isLive} onPress={onReconnect} />
          <View style={styles.transportReadout}>
            <Text style={styles.mutedText}>{formatElapsed(snapshot.health.elapsedSeconds)}</Text>
            <Text style={styles.mutedText}>{snapshot.health.message}</Text>
          </View>
          {operationStatus ? (
            <View style={[styles.operationBanner, operationStatus.kind === "error" ? styles.operationBannerError : styles.operationBannerPending]}>
              <Text
                style={[
                  styles.operationBannerText,
                  operationStatus.kind === "error" ? styles.operationBannerErrorText : styles.operationBannerPendingText
                ]}
              >
                {operationStatus.message}
              </Text>
            </View>
          ) : null}
          <StartPreflightBanner report={startPreflight} />
          <PublicLaunchChecklistPanel checklist={publicLaunchChecklist} />
        </View>

        <Panel title="Transform">
          <Label text="Name" />
          <TextInput
            value={selectedSource.name}
            onChangeText={(name) => onSceneChange(updateSource(scene, selectedSource.id, (source) => ({ ...source, name })))}
            style={styles.input}
            editable={!setupLocked}
            placeholderTextColor="#71717a"
          />
          {selectedSource.kind === "pngtuber" || selectedSource.kind === "image" ? (
            <>
              <Label text={selectedSource.kind === "pngtuber" ? "Still image URI" : "Image URI"} />
              <TextInput
                value={selectedSource.kind === "pngtuber" ? selectedSource.imageUri : selectedSource.uri}
                onChangeText={(uri) =>
                  onSceneChange(
                    updateSource(scene, selectedSource.id, (source) =>
                      source.kind === "pngtuber" ? { ...source, imageUri: uri } : source.kind === "image" ? { ...source, uri } : source
                    )
                  )
                }
                style={styles.input}
                editable={!setupLocked}
                placeholder="content://, file://, or absolute path"
                placeholderTextColor="#71717a"
              />
              <View style={styles.grid2}>
                <ActionButton
                  label="Pick Image"
                  disabled={setupLocked || assetPrepareStatus?.kind === "pending"}
                  onPress={pickSelectedStillImageAsset}
                />
                <ActionButton
                  label="Prepare Asset"
                  disabled={setupLocked || assetPrepareStatus?.kind === "pending"}
                  onPress={prepareSelectedStillImageAsset}
                />
              </View>
              {assetPrepareStatus ? (
                <Text
                  style={[
                    styles.assetPrepareStatus,
                    assetPrepareStatus.kind === "success" && styles.assetPrepareSuccess,
                    assetPrepareStatus.kind === "error" && styles.assetPrepareError
                  ]}
                >
                  {assetPrepareStatus.message}
                </Text>
              ) : null}
            </>
          ) : null}
          {selectedSource.kind === "live2d" ? (
            <>
              <Label text="Model ID" />
              <TextInput
                value={selectedSource.modelId}
                onChangeText={(modelId) =>
                  onSceneChange(
                    updateSource(scene, selectedSource.id, (source) => (source.kind === "live2d" ? { ...source, modelId } : source))
                  )
                }
                style={styles.input}
                editable={!setupLocked}
                placeholderTextColor="#71717a"
              />
              <Label text="Model3 JSON URI" />
              <TextInput
                value={selectedSource.modelJsonUri}
                onChangeText={(modelJsonUri) =>
                  onSceneChange(
                    updateSource(scene, selectedSource.id, (source) =>
                      source.kind === "live2d" ? { ...source, modelJsonUri } : source
                    )
                  )
                }
                style={styles.input}
                editable={!setupLocked}
                placeholder="file:// or absolute path to .model3.json"
                placeholderTextColor="#71717a"
              />
            </>
          ) : null}
          {selectedSource.kind === "vrm" ? (
            <>
              <Label text="Model ID" />
              <TextInput
                value={selectedSource.modelId}
                onChangeText={(modelId) =>
                  onSceneChange(
                    updateSource(scene, selectedSource.id, (source) => (source.kind === "vrm" ? { ...source, modelId } : source))
                  )
                }
                style={styles.input}
                editable={!setupLocked}
                placeholderTextColor="#71717a"
              />
              <Label text="VRM URI" />
              <TextInput
                value={selectedSource.modelUri}
                onChangeText={(modelUri) =>
                  onSceneChange(
                    updateSource(scene, selectedSource.id, (source) => (source.kind === "vrm" ? { ...source, modelUri } : source))
                  )
                }
                style={styles.input}
                editable={!setupLocked}
                placeholder="file:// or absolute path to .vrm/.glb"
                placeholderTextColor="#71717a"
              />
              <View style={styles.grid2}>
                <ActionButton
                  label="Pick VRM"
                  disabled={setupLocked || assetPrepareStatus?.kind === "pending"}
                  onPress={pickSelectedVrmModelAsset}
                />
                <ActionButton
                  label="Prepare Model"
                  disabled={setupLocked || assetPrepareStatus?.kind === "pending"}
                  onPress={prepareSelectedVrmModelAsset}
                />
              </View>
              {assetPrepareStatus ? (
                <Text
                  style={[
                    styles.assetPrepareStatus,
                    assetPrepareStatus.kind === "success" && styles.assetPrepareSuccess,
                    assetPrepareStatus.kind === "error" && styles.assetPrepareError
                  ]}
                >
                  {assetPrepareStatus.message}
                </Text>
              ) : null}
            </>
          ) : null}
          {selectedSource.kind === "pngtuber" ? (
            <>
              <ActionButton label="Auto rig" disabled={setupLocked} onPress={autoRigSelectedAvatar} />
              <MobileAvatarRigQualityPanel rig={selectedSource.illustrationRig} />
              <NumberStepper
                label="Face Y"
                value={selectedSource.illustrationRig.faceCenterY}
                min={0.15}
                max={0.85}
                step={0.05}
                disabled={setupLocked}
                onChange={(faceCenterY) => updateSelectedIllustrationRig("faceCenterY", faceCenterY)}
              />
              <NumberStepper
                label="Face range"
                value={selectedSource.illustrationRig.faceRange}
                min={0.08}
                max={0.6}
                step={0.05}
                disabled={setupLocked}
                onChange={(faceRange) => updateSelectedIllustrationRig("faceRange", faceRange)}
              />
              <NumberStepper
                label="Hair line"
                value={selectedSource.illustrationRig.hairLineY}
                min={0.05}
                max={0.55}
                step={0.05}
                disabled={setupLocked}
                onChange={(hairLineY) => updateSelectedIllustrationRig("hairLineY", hairLineY)}
              />
              <NumberStepper
                label="Shoulder"
                value={selectedSource.illustrationRig.shoulderLineY}
                min={0.45}
                max={0.95}
                step={0.05}
                disabled={setupLocked}
                onChange={(shoulderLineY) => updateSelectedIllustrationRig("shoulderLineY", shoulderLineY)}
              />
              <NumberStepper
                label="Eye line"
                value={selectedSource.illustrationRig.eyeLineY}
                min={0.12}
                max={0.65}
                step={0.05}
                disabled={setupLocked}
                onChange={(eyeLineY) => updateSelectedIllustrationRig("eyeLineY", eyeLineY)}
              />
              <NumberStepper
                label="Mouth line"
                value={selectedSource.illustrationRig.mouthLineY}
                min={0.25}
                max={0.85}
                step={0.05}
                disabled={setupLocked}
                onChange={(mouthLineY) => updateSelectedIllustrationRig("mouthLineY", mouthLineY)}
              />
              <NumberStepper
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
              <NumberStepper
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
              <NumberStepper
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
              <Label text="Text color" />
              <TextInput
                value={selectedSource.color}
                onChangeText={(color) =>
                  onSceneChange(
                    updateSource(scene, selectedSource.id, (source) => (source.kind === "chat" ? { ...source, color } : source))
                  )
                }
                style={styles.input}
                editable={!setupLocked}
                placeholder="#f8fafc"
                placeholderTextColor="#71717a"
              />
              <View style={styles.grid2}>
                <ActionButton
                  label={selectedSource.showAuthor ? "Author On" : "Author Off"}
                  variant={selectedSource.showAuthor ? "active" : "default"}
                  disabled={setupLocked}
                  onPress={() =>
                    onSceneChange(
                      updateSource(scene, selectedSource.id, (source) =>
                        source.kind === "chat" ? { ...source, showAuthor: !source.showAuthor } : source
                      )
                    )
                  }
                />
                <ActionButton
                  label={selectedSource.redactUrls ? "URL Redact On" : "URL Redact Off"}
                  variant={selectedSource.redactUrls ? "active" : "default"}
                  disabled={setupLocked}
                  onPress={() =>
                    onSceneChange(
                      updateSource(scene, selectedSource.id, (source) =>
                        source.kind === "chat" ? { ...source, redactUrls: !source.redactUrls } : source
                      )
                    )
                  }
                />
                <ActionButton
                  label={selectedSource.backgroundOpacity > 0 ? "Backdrop On" : "Backdrop Off"}
                  variant={selectedSource.backgroundOpacity > 0 ? "active" : "default"}
                  disabled={setupLocked}
                  onPress={() =>
                    onSceneChange(
                      updateSource(scene, selectedSource.id, (source) =>
                        source.kind === "chat"
                          ? { ...source, backgroundOpacity: source.backgroundOpacity > 0 ? 0 : 0.42 }
                          : source
                      )
                    )
                  }
                />
              </View>
            </>
          ) : null}
          <Stepper
            label="X"
            value={selectedSource.transform.x}
            disabled={setupLocked}
            onChange={(x) => onSceneChange(updateTransform(scene, selectedSource.id, { x }))}
          />
          <Stepper
            label="Y"
            value={selectedSource.transform.y}
            disabled={setupLocked}
            onChange={(y) => onSceneChange(updateTransform(scene, selectedSource.id, { y }))}
          />
          <Stepper
            label="Width"
            value={selectedSource.transform.width}
            disabled={setupLocked}
            onChange={(width) => onSceneChange(updateTransform(scene, selectedSource.id, { width }))}
          />
          <Stepper
            label="Height"
            value={selectedSource.transform.height}
            disabled={setupLocked}
            onChange={(height) => onSceneChange(updateTransform(scene, selectedSource.id, { height }))}
          />
          <Stepper
            label="Opacity"
            value={selectedSource.transform.opacity}
            disabled={setupLocked}
            onChange={(opacity) => onSceneChange(updateTransform(scene, selectedSource.id, { opacity }))}
          />
        </Panel>

        <Panel title="Mixer">
          <Stepper label="Lip sync" value={avatarRuntime.mouthOpen} onChange={onMicLevelChange} />
          <View style={styles.levelTrack}>
            <View style={[styles.levelFill, { width: `${Math.round(avatarRuntime.mouthOpen * 100)}%` }]} />
          </View>
          <View style={[styles.audioGuardChip, audioGuardChipStyle(diagnostics.audio.audioGuard.status)]}>
            <Text style={styles.audioGuardTitle}>Peak guard</Text>
            <Text style={styles.audioGuardText}>{diagnostics.audio.audioGuard.summary}</Text>
          </View>
          <View style={[styles.audioGuardChip, audioGuardChipStyle(diagnostics.audio.audioSilenceGuard.status)]}>
            <Text style={styles.audioGuardTitle}>Silence guard</Text>
            <Text style={styles.audioGuardText}>{diagnostics.audio.audioSilenceGuard.summary}</Text>
          </View>
          <View style={styles.grid2}>
            {expressions.map((expression) => (
              <ActionButton
                key={expression}
                label={expression}
                variant={avatarRuntime.expression === expression ? "active" : "default"}
                onPress={() => onExpressionChange(expression)}
              />
            ))}
          </View>

          <View style={styles.grid2}>
            <ActionButton
              label="Off"
              variant={!profile.micEffects.enabled ? "active" : "default"}
              disabled={setupLocked}
              onPress={() => updateMicEffects({ enabled: false })}
            />
            <ActionButton
              label="FX"
              variant={profile.micEffects.enabled ? "active" : "default"}
              disabled={setupLocked}
              onPress={() => updateMicEffects({ enabled: true })}
            />
          </View>

          <Label text="Mic preset" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.destinationRow}>
            {micEffectPresets.map((preset) => (
              <Pressable
                key={preset.id}
                hitSlop={8}
                style={[styles.destinationChip, preset.id === profile.micEffects.presetId && styles.destinationChipActive]}
                disabled={setupLocked}
                onPress={() => updateMicPreset(preset.id)}
              >
                <Text style={styles.destinationName}>{preset.name}</Text>
                <Text style={styles.destinationMeta}>{preset.inputGainDb > 0 ? `+${preset.inputGainDb}` : preset.inputGainDb} dB</Text>
              </Pressable>
            ))}
          </ScrollView>

          <NumberStepper
            label="Gain dB"
            value={profile.micEffects.inputGainDb}
            min={-12}
            max={12}
            step={1}
            disabled={setupLocked}
            onChange={(inputGainDb) => updateMicEffects({ inputGainDb })}
          />
          <NumberStepper
            label="Gate dB"
            value={profile.micEffects.noiseGateDb}
            min={-70}
            max={-25}
            step={1}
            disabled={setupLocked}
            onChange={(noiseGateDb) => updateMicEffects({ noiseGateDb })}
          />
          <NumberStepper
            label="Compression"
            value={profile.micEffects.compression}
            min={0}
            max={1}
            step={0.05}
            disabled={setupLocked}
            onChange={(compression) => updateMicEffects({ compression })}
          />
          <View style={styles.grid2}>
            <ActionButton
              label="Monitor"
              variant={profile.micEffects.monitorEnabled ? "active" : "default"}
              disabled={setupLocked}
              onPress={() => updateMicEffects({ monitorEnabled: !profile.micEffects.monitorEnabled })}
            />
            <ActionButton
              label="Phones"
              variant={profile.micEffects.monitorHeadphonesOnly ? "active" : "default"}
              disabled={setupLocked}
              onPress={() => updateMicEffects({ monitorHeadphonesOnly: !profile.micEffects.monitorHeadphonesOnly })}
            />
          </View>
          <NumberStepper
            label="Monitor"
            value={profile.micEffects.monitorVolume}
            min={0}
            max={1}
            step={0.05}
            disabled={setupLocked || !profile.micEffects.monitorEnabled}
            onChange={(monitorVolume) => updateMicEffects({ monitorVolume })}
          />
          <Label text="Broadcast mix" />
          {broadcastMixerChannels.map((channel) => {
            const settings = profile.broadcastMixer[channel.id];
            return (
              <View key={channel.id} style={styles.broadcastMixerRow}>
                <ActionButton
                  label={settings.muted ? "Muted" : "Live"}
                  variant={settings.muted ? "active" : "default"}
                  disabled={setupLocked}
                  onPress={() => updateBroadcastMixerChannel(channel.id, { muted: !settings.muted })}
                />
                <View style={styles.broadcastMixerVolume}>
                  <NumberStepper
                    label={channel.label}
                    value={settings.volume}
                    min={0}
                    max={1}
                    step={0.05}
                    disabled={setupLocked || settings.muted}
                    onChange={(volume) => updateBroadcastMixerChannel(channel.id, { volume })}
                  />
                </View>
              </View>
            );
          })}
          <View style={styles.trackingReadout}>
            <Text style={[styles.trackingCell, diagnostics.audio.monitorSafety.status === "pass" && styles.trackingCellActive]}>
              {diagnostics.audio.monitorSafety.status}
            </Text>
            <Text style={styles.trackingCell} numberOfLines={1}>
              {diagnostics.audio.monitorSafety.outputName}
            </Text>
            <Text style={styles.trackingCell}>
              phones {diagnostics.audio.monitorSafety.headphonesConnected ? "yes" : "no"}
            </Text>
          </View>

          <View style={styles.sectionDivider} />
          <View style={styles.grid2}>
            <ActionButton
              label="Off"
              variant={!profile.faceTracking.enabled ? "active" : "default"}
              disabled={setupLocked}
              onPress={() => updateFaceTracking({ enabled: false })}
            />
            <ActionButton
              label="Track"
              variant={profile.faceTracking.enabled ? "active" : "default"}
              disabled={setupLocked}
              onPress={() => updateFaceTracking({ enabled: true })}
            />
          </View>

          <Label text="Face input" />
          <View style={styles.grid2}>
            <ActionButton
              label="Sim"
              variant={profile.faceTracking.inputMode === "simulated" ? "active" : "default"}
              disabled={setupLocked}
              onPress={() => updateFaceTracking({ inputMode: "simulated" })}
            />
            <ActionButton
              label="Native"
              variant={profile.faceTracking.inputMode === "native-camera" ? "active" : "default"}
              disabled={setupLocked}
              onPress={() => updateFaceTracking({ inputMode: "native-camera" })}
            />
          </View>

          <Label text="Rig" />
          <View style={styles.grid2}>
            <ActionButton
              label="Still 2D"
              variant={profile.faceTracking.rigMode === "still-image-2d" ? "active" : "default"}
              disabled={setupLocked}
              onPress={() => updateFaceTracking({ rigMode: "still-image-2d" })}
            />
            <ActionButton
              label="Layered"
              variant={profile.faceTracking.rigMode === "layered-2d" ? "active" : "default"}
              disabled={setupLocked}
              onPress={() => updateFaceTracking({ rigMode: "layered-2d" })}
            />
          </View>

          <NumberStepper
            label="Strength"
            value={profile.faceTracking.trackingStrength}
            min={0}
            max={1}
            step={0.05}
            disabled={setupLocked}
            onChange={(trackingStrength) => updateFaceTracking({ trackingStrength })}
          />
          <NumberStepper
            label="Smoothing"
            value={profile.faceTracking.smoothing}
            min={0}
            max={1}
            step={0.05}
            disabled={setupLocked}
            onChange={(smoothing) => updateFaceTracking({ smoothing })}
          />
          <NumberStepper
            label="Dead zone"
            value={profile.faceTracking.deadZone}
            min={0}
            max={0.2}
            step={0.01}
            disabled={setupLocked}
            onChange={(deadZone) => updateFaceTracking({ deadZone })}
          />
          <NumberStepper
            label="Jump limit"
            value={profile.faceTracking.maxMotionStep}
            min={0.04}
            max={1}
            step={0.05}
            disabled={setupLocked}
            onChange={(maxMotionStep) => updateFaceTracking({ maxMotionStep })}
          />
          <NumberStepper
            label="Lost return"
            value={profile.faceTracking.lostReturnSpeed}
            min={0}
            max={1}
            step={0.05}
            disabled={setupLocked}
            onChange={(lostReturnSpeed) => updateFaceTracking({ lostReturnSpeed })}
          />
          <NumberStepper
            label="Head range"
            value={profile.faceTracking.headRange}
            min={0}
            max={1}
            step={0.05}
            disabled={setupLocked}
            onChange={(headRange) => updateFaceTracking({ headRange })}
          />
          <NumberStepper
            label="Body range"
            value={profile.faceTracking.bodyRange}
            min={0}
            max={1}
            step={0.05}
            disabled={setupLocked}
            onChange={(bodyRange) => updateFaceTracking({ bodyRange })}
          />
          <NumberStepper
            label="Illust warp"
            value={profile.faceTracking.illustrationDeform}
            min={0}
            max={1}
            step={0.05}
            disabled={setupLocked}
            onChange={(illustrationDeform) => updateFaceTracking({ illustrationDeform })}
          />
          <NumberStepper
            label="Hair sway"
            value={profile.faceTracking.hairSway}
            min={0}
            max={1}
            step={0.05}
            disabled={setupLocked}
            onChange={(hairSway) => updateFaceTracking({ hairSway })}
          />
          <NumberStepper
            label="Eye deform"
            value={profile.faceTracking.eyeDeform}
            min={0}
            max={1}
            step={0.05}
            disabled={setupLocked}
            onChange={(eyeDeform) => updateFaceTracking({ eyeDeform })}
          />
          <NumberStepper
            label="Mouth deform"
            value={profile.faceTracking.mouthDeform}
            min={0}
            max={1}
            step={0.05}
            disabled={setupLocked}
            onChange={(mouthDeform) => updateFaceTracking({ mouthDeform })}
          />
          <NumberStepper
            label="Mouth"
            value={profile.faceTracking.mouthSensitivity}
            min={0.2}
            max={2}
            step={0.05}
            disabled={setupLocked}
            onChange={(mouthSensitivity) => updateFaceTracking({ mouthSensitivity })}
          />
          <NumberStepper
            label="Blink"
            value={profile.faceTracking.blinkSensitivity}
            min={0.2}
            max={2}
            step={0.05}
            disabled={setupLocked}
            onChange={(blinkSensitivity) => updateFaceTracking({ blinkSensitivity })}
          />
          <View style={styles.grid2}>
            <ActionButton
              label="Auto Expr"
              variant={profile.faceTracking.autoExpression ? "active" : "default"}
              disabled={setupLocked}
              onPress={() => updateFaceTracking({ autoExpression: !profile.faceTracking.autoExpression })}
            />
            <ActionButton label="Calibrate" disabled={setupLocked} onPress={onFaceTrackingCalibrate} />
          </View>
          <View style={styles.trackingReadout}>
            <Text style={[styles.trackingCell, faceTrackingRuntime.status === "tracking" && styles.trackingCellActive]}>
              {faceTrackingRuntime.status}
            </Text>
            <Text style={styles.trackingCell}>yaw {faceTrackingRuntime.yaw.toFixed(2)}</Text>
            <Text style={styles.trackingCell}>pitch {faceTrackingRuntime.pitch.toFixed(2)}</Text>
            <Text style={styles.trackingCell}>conf {Math.round(faceTrackingRuntime.confidence * 100)}%</Text>
          </View>
        </Panel>

        <ChatReaderPanel
        chatReader={chatReader}
        platformChat={platformChat}
        platformChatAuth={platformChatAuth}
        platformChatOAuth={platformChatOAuth}
        platformChatOAuthFlow={platformChatOAuthFlow}
        twitchDeviceOAuthFlow={twitchDeviceOAuthFlow}
        platformChatOAuthStatus={platformChatOAuthStatus}
        platformStreamKeyStatus={platformStreamKeyStatus}
        platformApiOperationLabel={platformApiOperationLabel}
        platformChatConnection={platformChatConnection}
        onSubmit={onChatCommentSubmit}
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

        <Panel title="Live Setup">
          <Label text="Destination" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.destinationRow}>
            {destinationPresets.map((preset) => (
              <Pressable
                key={preset.id}
                hitSlop={8}
                style={[styles.destinationChip, preset.id === profile.destination.presetId && styles.destinationChipActive]}
                disabled={setupLocked}
                onPress={() => updatePreset(preset.id)}
              >
                <Text style={styles.destinationName}>{preset.name}</Text>
                <Text style={styles.destinationMeta}>{preset.protocol.toUpperCase()}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.grid2}>
            {(["rtmp", "rtmps"] as StreamProtocol[]).map((protocol) => (
              <ActionButton
                key={protocol}
                label={protocol.toUpperCase()}
                variant={profile.destination.protocol === protocol ? "active" : "default"}
                disabled={setupLocked}
                onPress={() => updateProtocol(protocol)}
              />
            ))}
          </View>

          <Label text="Server URL" />
          <TextInput
            value={profile.destination.serverUrl}
            onChangeText={updateServerUrl}
            style={styles.input}
            autoCapitalize="none"
            editable={!setupLocked}
            placeholderTextColor="#71717a"
          />

          <Label text="Stream key" />
          <TextInput
            value={profile.destination.streamKey}
            onChangeText={(streamKey) => updateDestination({ streamKey })}
            style={styles.input}
            autoCapitalize="none"
            secureTextEntry
            editable={!setupLocked}
            placeholderTextColor="#71717a"
          />
          <View style={styles.secretRow}>
            <Text style={styles.secretStatus} numberOfLines={1}>
              {profile.destination.streamKey ? `Saved as ${redactStreamKey(profile.destination.streamKey)}` : "No stream key saved"}
            </Text>
            <ActionButton
              label="Clear key"
              variant="danger"
              disabled={setupLocked || !profile.destination.streamKey}
              onPress={onClearStreamKey}
            />
          </View>

          <Label text="Stream title" />
          <TextInput
            value={profile.platformPublishing.title}
            onChangeText={(title) => updatePublishing({ title })}
            style={styles.input}
            maxLength={100}
            editable={!setupLocked}
            placeholderTextColor="#71717a"
          />

          <Label text="Description" />
          <TextInput
            value={profile.platformPublishing.description}
            onChangeText={(description) => updatePublishing({ description })}
            style={[styles.input, styles.multilineInput]}
            maxLength={5000}
            editable={!setupLocked}
            multiline
            placeholderTextColor="#71717a"
          />

          {profile.destination.platform === "youtube-live" ? (
            <>
              <Label text="YouTube privacy" />
              <View style={styles.grid3}>
                {(["private", "unlisted", "public"] as StudioProfile["platformPublishing"]["privacyStatus"][]).map((privacyStatus) => (
                  <ActionButton
                    key={privacyStatus}
                    label={privacyStatus}
                    variant={profile.platformPublishing.privacyStatus === privacyStatus ? "active" : "default"}
                    disabled={setupLocked}
                    onPress={() => updatePublishing({ privacyStatus })}
                  />
                ))}
              </View>
              <Label text="Start offset minutes" />
              <TextInput
                value={String(profile.platformPublishing.scheduledStartMinutesFromNow)}
                onChangeText={(value) => updatePublishing({ scheduledStartMinutesFromNow: Number(value) })}
                style={styles.input}
                keyboardType="number-pad"
                editable={!setupLocked}
                placeholderTextColor="#71717a"
              />
              <View style={styles.grid2}>
                <ActionButton
                  label="Auto Start"
                  variant={profile.platformPublishing.enableAutoStart ? "active" : "default"}
                  disabled={setupLocked}
                  onPress={() => updatePublishing({ enableAutoStart: !profile.platformPublishing.enableAutoStart })}
                />
                <ActionButton
                  label="Auto Stop"
                  variant={profile.platformPublishing.enableAutoStop ? "active" : "default"}
                  disabled={setupLocked}
                  onPress={() => updatePublishing({ enableAutoStop: !profile.platformPublishing.enableAutoStop })}
                />
              </View>
              <View style={styles.grid2}>
                <ActionButton
                  label="Made for Kids"
                  variant={profile.platformPublishing.madeForKids ? "active" : "default"}
                  disabled={setupLocked}
                  onPress={() => updatePublishing({ madeForKids: !profile.platformPublishing.madeForKids })}
                />
                <Text style={styles.secretStatus} numberOfLines={1}>
                  {profile.platformPublishing.youtubeBroadcastStatus ||
                    profile.platformPublishing.youtubeBroadcastId ||
                    profile.platformPublishing.youtubeStreamId ||
                    "No YouTube resource ID"}
                </Text>
              </View>
              <View style={styles.grid3}>
                <Text style={styles.statusCell} numberOfLines={1}>
                  Broadcast {profile.platformPublishing.youtubeBroadcastStatus || "unknown"}
                </Text>
                <Text style={styles.statusCell} numberOfLines={1}>
                  Bound {profile.platformPublishing.youtubeBroadcastBoundStreamId || "unknown"} / app{" "}
                  {profile.platformPublishing.youtubeStreamId || "unknown"}
                </Text>
                <Text style={styles.statusCell} numberOfLines={1}>
                  Privacy {profile.platformPublishing.youtubeBroadcastPrivacyStatus || "unknown"} / app{" "}
                  {profile.platformPublishing.privacyStatus}
                </Text>
                <Text style={styles.statusCell} numberOfLines={1}>
                  Stream {profile.platformPublishing.youtubeStreamStatus || "unknown"}
                </Text>
                <Text style={styles.statusCell} numberOfLines={1}>
                  Health {profile.platformPublishing.youtubeStreamHealthStatus || "unknown"}
                </Text>
                <Text style={styles.statusCell} numberOfLines={1}>
                  Checked {formatStatusCheckedAt(profile.platformPublishing.youtubeStatusCheckedAt)}
                </Text>
              </View>
              {profile.platformPublishing.youtubeStreamHealthIssues.map((issue) => (
                <Text key={issue} style={styles.healthIssue} numberOfLines={2}>
                  {issue}
                </Text>
              ))}
              <ActionButton
                label="Refresh Status"
                disabled={setupLocked || !profile.platformPublishing.youtubeBroadcastId}
                onPress={onPlatformPublishingStatusRefresh}
              />
              <View style={styles.grid3}>
                {(["testing", "live", "complete"] as YouTubeBroadcastTransitionStatus[]).map((broadcastStatus) => {
                  const report = youtubeTransitionReport(broadcastStatus);
                  return (
                    <ActionButton
                      key={broadcastStatus}
                      label={broadcastStatus === "testing" ? "Test" : broadcastStatus === "live" ? "Live" : "Complete"}
                      variant={report.status === "warning" ? "warn" : report.status === "blocked" ? "danger" : "default"}
                      disabled={setupLocked || !report.canProceed}
                      onPress={() => onYouTubeBroadcastTransition(broadcastStatus)}
                    />
                  );
                })}
              </View>
              <YouTubeTransitionPreflightList
                reports={(["testing", "live", "complete"] as YouTubeBroadcastTransitionStatus[]).map((transitionStatus) => ({
                  transitionStatus,
                  report: youtubeTransitionReport(transitionStatus)
                }))}
              />
            </>
          ) : null}

          {profile.destination.platform === "twitch" ? (
            <>
              <Label text="Twitch category" />
              <TextInput
                value={profile.platformPublishing.twitchCategory}
                onChangeText={(twitchCategory) => updatePublishing({ twitchCategory, twitchCategoryId: "" })}
                style={styles.input}
                editable={!setupLocked}
                placeholderTextColor="#71717a"
              />
              <Label text="Twitch category ID" />
              <TextInput
                value={profile.platformPublishing.twitchCategoryId}
                onChangeText={(twitchCategoryId) => updatePublishing({ twitchCategoryId })}
                style={styles.input}
                editable={!setupLocked}
                placeholderTextColor="#71717a"
              />
              <Label text="Twitch language" />
              <TextInput
                value={profile.platformPublishing.twitchLanguage}
                onChangeText={(twitchLanguage) => updatePublishing({ twitchLanguage })}
                style={styles.input}
                maxLength={12}
                editable={!setupLocked}
                placeholderTextColor="#71717a"
              />
              <View style={styles.grid3}>
                <Text style={styles.statusCell} numberOfLines={1}>
                  Status {profile.platformPublishing.twitchLiveStatus || "unknown"}
                </Text>
                <Text style={styles.statusCell} numberOfLines={1}>
                  Title {profile.platformPublishing.twitchChannelTitle || "unknown"} / app{" "}
                  {profile.platformPublishing.title || "unknown"}
                </Text>
                <Text style={styles.statusCell} numberOfLines={1}>
                  Category {profile.platformPublishing.twitchChannelCategory || "unknown"}{" "}
                  {profile.platformPublishing.twitchChannelCategoryId
                    ? `(${profile.platformPublishing.twitchChannelCategoryId})`
                    : "(no id)"}{" "}
                  / app {profile.platformPublishing.twitchCategory || "unknown"}{" "}
                  {profile.platformPublishing.twitchCategoryId ? `(${profile.platformPublishing.twitchCategoryId})` : "(no id)"}
                </Text>
                <Text style={styles.statusCell} numberOfLines={1}>
                  Language {profile.platformPublishing.twitchChannelLanguage || "unknown"} / app{" "}
                  {profile.platformPublishing.twitchLanguage || "unknown"}
                </Text>
                <Text style={styles.statusCell} numberOfLines={1}>
                  Viewers {profile.platformPublishing.twitchViewerCount.toLocaleString()}
                </Text>
                <Text style={styles.statusCell} numberOfLines={1}>
                  Started {profile.platformPublishing.twitchStartedAt || "offline"}
                </Text>
                <Text style={styles.statusCell} numberOfLines={1}>
                  Checked {formatStatusCheckedAt(profile.platformPublishing.twitchStatusCheckedAt)}
                </Text>
              </View>
              <ActionButton label="Refresh Status" disabled={setupLocked} onPress={onPlatformPublishingStatusRefresh} />
            </>
          ) : null}

          <ActionButton
            label={profile.destination.platform === "youtube-live" ? "Create Broadcast" : "Update Metadata"}
            disabled={setupLocked || (profile.destination.platform !== "youtube-live" && profile.destination.platform !== "twitch")}
            onPress={onPlatformPublishingApply}
          />
          <Text style={styles.platformConnectionMessage}>
            {platformApiOperationLabel ? `Running ${platformApiOperationLabel}. ${platformPublishingStatus}` : platformPublishingStatus}
          </Text>

          <Label text="Quality" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.qualityRow}>
            {qualityProfiles.map((quality) => (
              <Pressable
                key={quality.id}
                hitSlop={8}
                style={[styles.qualityChip, quality.id === profile.quality.id && styles.qualityChipActive]}
                disabled={setupLocked}
                onPress={() => onProfileChange({ ...profile, quality })}
              >
                <Text style={styles.qualityText}>{quality.name}</Text>
                <Text style={styles.qualityMeta}>
                  {quality.width}x{quality.height} / {quality.fps}fps
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <ReadinessPanel readiness={readiness} />
        </Panel>

        <StreamDiagnosticsPanel
          scene={scene}
          profile={profile}
          readiness={readiness}
          preflight={startPreflight}
          diagnostics={diagnostics}
          qualityAutomationDecision={qualityAutomationDecision}
          setupLocked={setupLocked}
          onProfileChange={onProfileChange}
          onClearStreamSessionSummaries={onClearStreamSessionSummaries}
          onRecordStreamValidationRun={onRecordStreamValidationRun}
          onClearStreamValidationRuns={onClearStreamValidationRuns}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const MobileAvatarRigQualityPanel = ({ rig }: { rig: AvatarIllustrationRig }) => {
  const summary = createAvatarIllustrationRigTuningSummary(rig);
  const sliceScore = scoreAvatarRigSlices(rig.sliceCount);
  const primaryIssue = summary.issues[0] ?? "Ready for retained proof.";
  return (
    <View style={[styles.rigQualityPanel, rigQualityPanelStyle(summary.grade)]}>
      <View style={styles.rigQualityHeader}>
        <View style={styles.rigQualityTitleBlock}>
          <Text style={styles.rigQualityTitle}>Rig quality</Text>
          <Text style={styles.rigQualityMeta}>grade {summary.grade}</Text>
        </View>
        <Text style={[styles.rigQualityScore, rigQualityScoreTextStyle(summary.grade)]}>
          {summary.highFidelityScore}/100
        </Text>
      </View>
      <View style={styles.rigQualityRows}>
        <MobileRigScoreRow label="Parts" score={summary.partSeparationScore} />
        <MobileRigScoreRow label="Depth" score={summary.depthContinuityScore} />
        <MobileRigScoreRow label="Slices" score={sliceScore} />
      </View>
      <View style={styles.rigLineGrid}>
        <MobileRigLineValue label="Hair" value={rig.hairLineY} />
        <MobileRigLineValue label="Eye" value={rig.eyeLineY} />
        <MobileRigLineValue label="Mouth" value={rig.mouthLineY} />
        <MobileRigLineValue label="Shoulder" value={rig.shoulderLineY} />
        <MobileRigLineValue label="Face" value={rig.faceRange} />
      </View>
      <Text style={[styles.rigQualityMessage, rigQualityMessageTextStyle(summary.grade)]} numberOfLines={2}>
        {primaryIssue}
      </Text>
    </View>
  );
};

const MobileRigScoreRow = ({ label, score }: { label: string; score: number }) => {
  const normalizedScore = clampRigScore(score);
  return (
    <View style={styles.rigScoreRow}>
      <Text style={styles.rigScoreLabel}>{label}</Text>
      <View style={styles.rigScoreTrack}>
        <View style={[styles.rigScoreFill, rigScoreFillStyle(normalizedScore), { flex: Math.max(0.001, normalizedScore) }]} />
        <View style={{ flex: Math.max(0.001, 100 - normalizedScore) }} />
      </View>
      <Text style={styles.rigScoreValue}>{Math.round(normalizedScore)}</Text>
    </View>
  );
};

const MobileRigLineValue = ({ label, value }: { label: string; value: number }) => (
  <View style={styles.rigLineChip}>
    <Text style={styles.rigLineLabel}>{label}</Text>
    <Text style={styles.rigLineValue}>{formatRigPercent(value)}</Text>
  </View>
);

const StreamDiagnosticsPanel = ({
  scene,
  profile,
  readiness,
  preflight,
  diagnostics,
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
  qualityAutomationDecision: StreamQualityAutomationDecision;
  setupLocked: boolean;
  onProfileChange(profile: StudioProfile): void;
  onClearStreamSessionSummaries(): void | Promise<void>;
  onRecordStreamValidationRun(run: StreamValidationRun): void | Promise<void>;
  onClearStreamValidationRuns(): void | Promise<void>;
}) => {
  const platformPublishingFreshness = assessPlatformPublishingFreshness(diagnostics.platformPublishing);
  const publicLaunchChecklist = createPublicLaunchChecklist({
    preflight,
    diagnostics,
    platformPublishingFreshness,
    profile
  });

  return (
  <Panel title="Diagnostics">
    <View style={[styles.diagnosticSummary, diagnosticSummaryStyle(diagnostics.status)]}>
      <Text style={[styles.diagnosticSummaryText, diagnosticSummaryTextStyle(diagnostics.status)]}>{diagnostics.summary}</Text>
    </View>
    <View style={styles.diagnosticActions}>
      <ActionButton label="Share Report" onPress={() => shareStreamDiagnosticReport(diagnostics, publicLaunchChecklist)} />
      <ActionButton label="Share Bundle" onPress={() => shareSupportBundle({ scene, profile, readiness, preflight, diagnostics })} />
      <ActionButton
        label="Clear History"
        disabled={diagnostics.session.summaries.length === 0}
        onPress={() => {
          Alert.alert(
            "Clear stream history?",
            "Completed session summaries stored on this device will be removed.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Clear",
                style: "destructive",
                onPress: () => {
                  void onClearStreamSessionSummaries();
                }
              }
            ]
          );
        }}
      />
    </View>
    <View style={styles.diagnosticGrid}>
      <DiagnosticMetric label="Target" value={diagnostics.target.platform} />
      <DiagnosticMetric label="Endpoint" value={diagnostics.target.host} />
      <DiagnosticMetric label="App" value={diagnostics.target.application} />
      <DiagnosticMetric label="Publish URL" value={diagnostics.target.publishUrlPreview} />
      <DiagnosticMetric label="Quality" value={`${diagnostics.quality.resolution} / ${diagnostics.quality.fps}fps`} />
      <DiagnosticMetric label="Upload target" value={`${diagnostics.quality.estimatedUploadKbps} kbps`} />
      <DiagnosticMetric label="Telemetry" value={`${diagnostics.telemetry.bitrateKbps} kbps / ${diagnostics.telemetry.fps} fps`} />
      <DiagnosticMetric label="Audio guard" value={audioGuardMetricLabel(diagnostics)} />
      <DiagnosticMetric label="Audio silence" value={audioSilenceGuardMetricLabel(diagnostics)} />
      <DiagnosticMetric label="Audio route" value={`${diagnostics.audio.monitorSafety.status} / ${diagnostics.audio.monitorSafety.outputName}`} />
      <DiagnosticMetric label="Native runtime" value={nativeRuntimeMetricLabel(diagnostics)} />
      <DiagnosticMetric label="Recovery" value={recoveryMetricLabel(diagnostics)} />
      <DiagnosticMetric label="History" value={historyMetricLabel(diagnostics)} />
      <DiagnosticMetric label="Completed sessions" value={`${diagnostics.session.summaries.length}`} />
      <DiagnosticMetric label="Session trend" value={sessionHistoryMetricLabel(diagnostics)} />
      <DiagnosticMetric label="Last session" value={sessionMetricLabel(diagnostics)} />
      <DiagnosticMetric label="Advisor" value={diagnostics.qualityAdvisor.action} />
      <DiagnosticMetric label="Native comp" value={nativeCompositionMetricLabel(diagnostics)} />
      <DiagnosticMetric label="Validation" value={validationMetricLabel(diagnostics)} />
      <DiagnosticMetric label="Rehearsal" value={rehearsalMetricLabel(diagnostics)} />
      <DiagnosticMetric label="Dashboard" value={platformPublishingFreshnessMetricLabel(diagnostics, platformPublishingFreshness)} />
    </View>
    <View style={styles.diagnosticIncidents}>
      <View style={[styles.diagnosticIncidentSummary, diagnosticAdvisorSummaryStyle(diagnostics)]}>
        <Text style={[styles.diagnosticIncidentSummaryText, diagnosticAdvisorSummaryTextStyle(diagnostics)]}>
          {diagnostics.qualityAdvisor.summary}
        </Text>
      </View>
      <View style={[styles.diagnosticIncident, diagnosticAdvisorStyle(diagnostics)]}>
        <Text style={styles.diagnosticIncidentTitle}>{qualityAdvisorTargetLabel(diagnostics)}</Text>
        <Text style={styles.diagnosticIncidentText}>{diagnostics.qualityAdvisor.recommendation}</Text>
        <Text style={styles.diagnosticIncidentRecommendation}>
          {diagnostics.qualityAdvisor.reason || "No quality pressure detected."}
        </Text>
        {diagnostics.qualityAdvisor.suggestedTarget ? (
          <ActionButton
            label="Apply Quality"
            disabled={setupLocked}
            onPress={() => onProfileChange(applyStreamQualityAdvisorTarget(profile, diagnostics.qualityAdvisor.suggestedTarget))}
          />
        ) : null}
      </View>
      {qualityAutomationDecision.command !== "none" ? (
        <View style={[styles.diagnosticIncident, diagnosticQualityAutomationStyle(qualityAutomationDecision)]}>
          <Text style={styles.diagnosticIncidentTitle}>{qualityAutomationDecision.title}</Text>
          <Text style={styles.diagnosticIncidentText}>{qualityAutomationDecision.summary}</Text>
          <Text style={styles.diagnosticIncidentRecommendation}>{qualityAutomationDecision.action}</Text>
        </View>
      ) : null}
    </View>
    <View style={styles.diagnosticIncidents}>
      <View style={[styles.diagnosticIncidentSummary, diagnosticValidationSummaryStyle(diagnostics)]}>
        <Text style={[styles.diagnosticIncidentSummaryText, diagnosticValidationSummaryTextStyle(diagnostics)]}>
          {diagnostics.validation.summary}
        </Text>
      </View>
      <View style={[styles.diagnosticIncident, diagnosticValidationStyle(diagnostics)]}>
        <Text style={styles.diagnosticIncidentTitle}>Commercial validation</Text>
        <Text style={styles.diagnosticIncidentText}>{diagnostics.validation.recommendedNextStep}</Text>
        <Text style={styles.diagnosticIncidentRecommendation}>
          {diagnostics.validation.passCount} pass / {diagnostics.validation.warningCount} warn / {diagnostics.validation.failCount} fail /{" "}
          {diagnostics.validation.pendingCount} pending
        </Text>
      </View>
      <View style={[styles.diagnosticIncident, diagnosticRehearsalStyle(diagnostics)]}>
        <Text style={styles.diagnosticIncidentTitle}>Launch rehearsal</Text>
        <Text style={styles.diagnosticIncidentText}>{diagnostics.rehearsal.summary}</Text>
        <Text style={styles.diagnosticIncidentRecommendation}>
          Score {diagnostics.rehearsal.score}/100 grade {diagnostics.rehearsal.grade}. {diagnostics.rehearsal.primaryAction}
        </Text>
      </View>
      {diagnostics.validation.items.map((item) => (
        <View key={item.id} style={[styles.diagnosticIncident, diagnosticValidationItemStyle(item.status)]}>
          <Text style={styles.diagnosticIncidentTitle}>{item.title}</Text>
          <Text style={styles.diagnosticIncidentText}>{item.detail}</Text>
          <Text style={styles.diagnosticIncidentRecommendation}>{item.action}</Text>
        </View>
      ))}
      <View style={[styles.diagnosticIncident, diagnosticPlatformPublishingFreshnessStyle(platformPublishingFreshness.status)]}>
        <Text style={styles.diagnosticIncidentTitle}>Platform dashboard freshness</Text>
        <Text style={styles.diagnosticIncidentText}>{platformPublishingFreshness.summary}</Text>
        <Text style={styles.diagnosticIncidentRecommendation}>{platformPublishingFreshness.recommendation}</Text>
      </View>
    </View>
    <StreamValidationRecorder
      diagnostics={diagnostics}
      profile={profile}
      onRecordStreamValidationRun={onRecordStreamValidationRun}
      onClearStreamValidationRuns={onClearStreamValidationRuns}
    />
    {diagnostics.session.lastSummary ? (
      <View style={styles.diagnosticIncidents}>
        <View style={[styles.diagnosticIncident, diagnosticSessionHistoryStyle(diagnostics)]}>
          <Text style={styles.diagnosticIncidentTitle}>History trend</Text>
          <Text style={styles.diagnosticIncidentText}>{diagnostics.session.historySummary.summary}</Text>
          <Text style={styles.diagnosticIncidentRecommendation}>{diagnostics.session.historySummary.recommendation}</Text>
        </View>
        <View style={[styles.diagnosticIncidentSummary, diagnosticSessionSummaryStyle(diagnostics.session.lastSummary)]}>
          <Text style={[styles.diagnosticIncidentSummaryText, diagnosticSessionSummaryTextStyle(diagnostics.session.lastSummary)]}>
            {diagnostics.session.lastSummary.summary}
          </Text>
        </View>
        <View style={[styles.diagnosticIncident, diagnosticSessionStyle(diagnostics.session.lastSummary)]}>
          <Text style={styles.diagnosticIncidentTitle}>Next stream</Text>
          <Text style={styles.diagnosticIncidentText}>{diagnostics.session.lastSummary.recommendation}</Text>
          <Text style={styles.diagnosticIncidentRecommendation}>
            Warnings {diagnostics.session.lastSummary.warningCount} / failures {diagnostics.session.lastSummary.failureCount} /
            recoveries {diagnostics.session.lastSummary.recoveryEventCount}
          </Text>
          <Text style={styles.diagnosticIncidentRecommendation}>
            Platform API {diagnostics.session.lastSummary.platformApiEventCount} events /{" "}
            {diagnostics.session.lastSummary.platformApiFailureCount} failed
          </Text>
          <Text style={styles.diagnosticIncidentRecommendation}>{sessionNativeRuntimeLabel(diagnostics.session.lastSummary)}</Text>
        </View>
      </View>
    ) : null}
    <View style={styles.diagnosticIncidents}>
      <View style={[styles.diagnosticIncidentSummary, diagnosticIncidentSummaryStyle(diagnostics)]}>
        <Text style={[styles.diagnosticIncidentSummaryText, diagnosticIncidentSummaryTextStyle(diagnostics)]}>
          {diagnostics.qualityIncidents.summary}
        </Text>
      </View>
      {diagnostics.qualityIncidents.incidents.map((incident) => (
        <View key={incident.code} style={[styles.diagnosticIncident, diagnosticIncidentStyle(incident.severity)]}>
          <Text style={styles.diagnosticIncidentTitle}>{incident.label}</Text>
          <Text style={[styles.diagnosticIncidentText, diagnosticIncidentTextStyle(incident.severity)]}>{incident.message}</Text>
          <Text style={styles.diagnosticIncidentRecommendation}>{incident.recommendation}</Text>
        </View>
      ))}
    </View>
    <View style={styles.diagnosticEvents}>
      {diagnostics.session.events.length === 0 ? (
        <Text style={styles.diagnosticEventEmpty}>No session events yet.</Text>
      ) : (
        diagnostics.session.events.slice(-5).map((event) => (
          <View key={event.id} style={[styles.diagnosticEvent, diagnosticEventStyle(event.severity)]}>
            <Text style={styles.diagnosticEventTitle}>{event.title}</Text>
            <Text style={styles.diagnosticEventText}>{event.message}</Text>
          </View>
        ))
      )}
    </View>
    <View style={styles.diagnosticChecks}>
      {diagnostics.checks.map((check) => (
        <View key={check.code} style={[styles.diagnosticCheck, diagnosticCheckStyle(check.status)]}>
          <Text style={styles.diagnosticCheckLabel}>{check.label}</Text>
          <Text style={[styles.diagnosticCheckText, diagnosticCheckTextStyle(check.status)]}>{check.message}</Text>
        </View>
      ))}
    </View>
  </Panel>
  );
};

const StreamValidationRecorder = ({
  diagnostics,
  profile,
  onRecordStreamValidationRun,
  onClearStreamValidationRuns
}: {
  diagnostics: StreamDiagnostics;
  profile: StudioProfile;
  onRecordStreamValidationRun(run: StreamValidationRun): void | Promise<void>;
  onClearStreamValidationRuns(): void | Promise<void>;
}) => {
  const [devicePlatform, setDevicePlatform] = useState<StreamValidationDevicePlatform>(() => getDefaultValidationDevicePlatform());
  const [deviceName, setDeviceName] = useState(() => getDefaultValidationDeviceName(getDefaultValidationDevicePlatform()));
  const [osVersion, setOsVersion] = useState(() => getDefaultValidationOsVersion(getDefaultValidationDevicePlatform()));
  const [appBuild, setAppBuild] = useState("debug");
  const [networkProfile, setNetworkProfile] = useState("private RTMPS");
  const [monitorLatencyMs, setMonitorLatencyMs] = useState("");
  const [monitorTuningNote, setMonitorTuningNote] = useState("");
  const [result, setResult] = useState<StreamValidationRunResult>(() => validationRunResultFromDiagnostics(diagnostics));
  const latestRun = diagnostics.validationEvidence.latestRun;
  const latestRunAudioLabel = latestRun ? formatStreamValidationRunAudioLabel(latestRun) : null;
  const latestDashboardFreshness =
    diagnostics.validationEvidence.latestPlatformPublishingFreshness ??
    (diagnostics.validationEvidence.latestPlatformPublishing
      ? assessPlatformPublishingFreshness(diagnostics.validationEvidence.latestPlatformPublishing)
      : null);

  useEffect(() => {
    setResult(validationRunResultFromDiagnostics(diagnostics));
  }, [diagnostics.validation.status]);

  const record = () => {
    void onRecordStreamValidationRun(
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
        secrets: [profile.destination.streamKey]
      })
    );
  };
  const selectDevicePlatform = (nextPlatform: StreamValidationDevicePlatform) => {
    setDeviceName((currentDeviceName) =>
      currentDeviceName.trim() === "" || currentDeviceName === getDefaultValidationDeviceName(devicePlatform)
        ? getDefaultValidationDeviceName(nextPlatform)
        : currentDeviceName
    );
    setOsVersion((currentOsVersion) =>
      currentOsVersion.trim() === "" || currentOsVersion === getDefaultValidationOsVersion(devicePlatform)
        ? getDefaultValidationOsVersion(nextPlatform)
        : currentOsVersion
    );
    setDevicePlatform(nextPlatform);
  };

  return (
    <View style={styles.diagnosticIncidents}>
      <View style={[styles.diagnosticIncidentSummary, diagnosticValidationEvidenceSummaryStyle(diagnostics)]}>
        <Text style={[styles.diagnosticIncidentSummaryText, diagnosticValidationEvidenceSummaryTextStyle(diagnostics)]}>
          {diagnostics.validationEvidence.summary}
        </Text>
      </View>
      <View style={[styles.diagnosticIncidentSummary, diagnosticValidationRunbookSummaryStyle(diagnostics)]}>
        <Text style={[styles.diagnosticIncidentSummaryText, diagnosticValidationRunbookSummaryTextStyle(diagnostics)]}>
          {diagnostics.validationRunbook.summary}
        </Text>
      </View>
      <View style={[styles.diagnosticIncident, diagnosticValidationRunbookStyle(diagnostics)]}>
        <Text style={styles.diagnosticIncidentTitle}>Private validation runbook</Text>
        <Text style={styles.diagnosticIncidentText}>{diagnostics.validationRunbook.nextAction}</Text>
        <Text style={styles.diagnosticIncidentRecommendation}>
          {diagnostics.validationRunbook.passCount} pass / {diagnostics.validationRunbook.warningCount} warn /{" "}
          {diagnostics.validationRunbook.failCount} fail / {diagnostics.validationRunbook.pendingCount} pending
        </Text>
      </View>
      {diagnostics.validationRunbook.items.map((item) => (
        <View key={item.id} style={[styles.diagnosticIncident, diagnosticValidationItemStyle(item.status)]}>
          <Text style={styles.diagnosticIncidentTitle}>{item.title}</Text>
          <Text style={styles.diagnosticIncidentText}>{item.detail}</Text>
          <Text style={styles.diagnosticIncidentRecommendation}>{item.action}</Text>
        </View>
      ))}
      <View style={[styles.diagnosticIncident, diagnosticValidationEvidenceStyle(diagnostics)]}>
        <Text style={styles.diagnosticIncidentTitle}>Physical validation evidence</Text>
        <Text style={styles.diagnosticIncidentText}>{diagnostics.validationEvidence.recommendation}</Text>
        <Text style={styles.diagnosticIncidentRecommendation}>
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
        </Text>
        <Text style={styles.diagnosticIncidentRecommendation}>evidence fingerprint {diagnostics.validationEvidence.fingerprint}</Text>
      </View>
      {latestDashboardFreshness ? (
        <View style={[styles.diagnosticIncident, diagnosticPlatformPublishingFreshnessStyle(latestDashboardFreshness.status)]}>
          <Text style={styles.diagnosticIncidentTitle}>Validation dashboard freshness</Text>
          <Text style={styles.diagnosticIncidentText}>{latestDashboardFreshness.summary}</Text>
          <Text style={styles.diagnosticIncidentRecommendation}>{latestDashboardFreshness.recommendation}</Text>
        </View>
      ) : null}
      {latestRun ? (
        <View style={[styles.diagnosticIncident, diagnosticValidationRunStyle(latestRun.result)]}>
          <Text style={styles.diagnosticIncidentTitle}>Latest validation run</Text>
          <Text style={styles.diagnosticIncidentText}>{latestRun.summary}</Text>
          <Text style={styles.diagnosticIncidentRecommendation}>
            {latestRun.devicePlatform} / {latestRun.osVersion} / build {latestRun.appBuild} / {latestRun.networkProfile}
            {diagnostics.validationEvidence.latestRunAgeDays === null
              ? ""
              : ` / ${diagnostics.validationEvidence.latestRunAgeDays}d old`}
            {" / "}
            {latestRun.physicalDevice ? "physical device" : `device ${latestRun.physicalDeviceStatus}`}
          </Text>
          <Text style={styles.diagnosticIncidentRecommendation}>run fingerprint {latestRun.fingerprint}</Text>
          {validationRunNativeRuntimeLabel(latestRun) ? (
            <Text style={styles.diagnosticIncidentRecommendation}>{validationRunNativeRuntimeLabel(latestRun)}</Text>
          ) : null}
          {validationRunMonitorHoldLabel(latestRun) ? (
            <Text style={styles.diagnosticIncidentRecommendation}>{validationRunMonitorHoldLabel(latestRun)}</Text>
          ) : null}
          {validationRunFaceTrackingLabel(latestRun) ? (
            <Text style={styles.diagnosticIncidentRecommendation}>{validationRunFaceTrackingLabel(latestRun)}</Text>
          ) : null}
          {latestRunAudioLabel ? <Text style={styles.diagnosticIncidentRecommendation}>{latestRunAudioLabel}</Text> : null}
          {validationRunChatReadoutLabel(latestRun) ? (
            <Text style={styles.diagnosticIncidentRecommendation}>{validationRunChatReadoutLabel(latestRun)}</Text>
          ) : null}
          {validationRunQualityAutomationLabel(latestRun) ? (
            <Text style={styles.diagnosticIncidentRecommendation}>{validationRunQualityAutomationLabel(latestRun)}</Text>
          ) : null}
          {validationRunPlatformPublishingLabel(latestRun) ? (
            <Text style={styles.diagnosticIncidentRecommendation}>{validationRunPlatformPublishingLabel(latestRun)}</Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.validationRecorder}>
        <View style={styles.grid2}>
          <ActionButton
            label="iOS"
            variant={devicePlatform === "ios" ? "active" : "default"}
            onPress={() => selectDevicePlatform("ios")}
          />
          <ActionButton
            label="Android"
            variant={devicePlatform === "android" ? "active" : "default"}
            onPress={() => selectDevicePlatform("android")}
          />
        </View>
        <Label text="Device" />
        <TextInput value={deviceName} onChangeText={setDeviceName} style={styles.input} placeholderTextColor="#71717a" />
        <Label text="OS" />
        <TextInput value={osVersion} onChangeText={setOsVersion} style={styles.input} placeholderTextColor="#71717a" />
        <Label text="Build" />
        <TextInput value={appBuild} onChangeText={setAppBuild} style={styles.input} placeholderTextColor="#71717a" />
        <Label text="Network" />
        <TextInput value={networkProfile} onChangeText={setNetworkProfile} style={styles.input} placeholderTextColor="#71717a" />
        <Label text="Monitor latency ms" />
        <TextInput
          value={monitorLatencyMs}
          onChangeText={setMonitorLatencyMs}
          style={styles.input}
          keyboardType="number-pad"
          placeholder="120"
          placeholderTextColor="#71717a"
        />
        <Label text="Monitor route note" />
        <TextInput
          value={monitorTuningNote}
          onChangeText={setMonitorTuningNote}
          style={styles.input}
          placeholder="wired baseline / Bluetooth reviewed"
          placeholderTextColor="#71717a"
        />
        <View style={styles.grid3}>
          {(["pass", "warn", "fail"] as StreamValidationRunResult[]).map((item) => (
            <ActionButton key={item} label={item} variant={result === item ? "active" : "default"} onPress={() => setResult(item)} />
          ))}
        </View>
        <ActionButton label="Record Evidence" onPress={record} />
        <ActionButton
          label="Clear Evidence"
          disabled={diagnostics.validationEvidence.totalRuns === 0}
          onPress={() => {
            Alert.alert(
              "Clear validation evidence?",
              "Physical validation runs stored on this device will be removed.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Clear",
                  style: "destructive",
                  onPress: () => {
                    void onClearStreamValidationRuns();
                  }
                }
              ]
            );
          }}
        />
      </View>
    </View>
  );
};

const getDefaultValidationDevicePlatform = (): StreamValidationDevicePlatform => (Platform.OS === "android" ? "android" : "ios");

const getDefaultValidationDeviceName = (platform: StreamValidationDevicePlatform): string =>
  platform === "android" ? "Android test device" : "iPhone test device";

const getDefaultValidationOsVersion = (platform: StreamValidationDevicePlatform): string => {
  const label = platform === "android" ? "Android" : "iOS";
  const currentPlatform = getDefaultValidationDevicePlatform();
  if (platform !== currentPlatform) {
    return label;
  }

  const version = String(Platform.Version ?? "").trim();
  return version ? `${label} ${version}` : label;
};

const validationRunResultFromDiagnostics = (diagnostics: StreamDiagnostics): StreamValidationRunResult =>
  diagnostics.validation.status === "ready" ? "pass" : diagnostics.validation.status === "blocked" ? "fail" : "warn";

const parseOptionalLatencyMs = (value: string): number | null => {
  const normalized = Number.parseInt(value.trim(), 10);
  return Number.isFinite(normalized) ? Math.max(0, normalized) : null;
};

const validationRunNativeRuntimeLabel = (run: StreamValidationRun): string | null =>
  run.nativeRuntime
    ? `native ${run.nativeRuntime.status} / ${run.nativeRuntime.platform} / publisher ${run.nativeRuntime.publisherState || "-"} / queue ${run.nativeRuntime.queuedItems}/${run.nativeRuntime.cacheSize} / frame interval ${run.nativeRuntime.videoFrameIntervalSampleCount} samples avg ${run.nativeRuntime.videoFrameIntervalAverageMs}ms max ${run.nativeRuntime.videoFrameIntervalMaxMs}ms jitter ${run.nativeRuntime.videoFrameIntervalJitterMs}ms / vrm ${run.nativeRuntime.vrmActivePoseCount}/${run.nativeRuntime.vrmSourceCount} active payloads ${run.nativeRuntime.vrmPosePayloadCount} renderer ${run.nativeRuntime.vrmRendererStatus} ${run.nativeRuntime.vrmRenderedSourceCount}/${run.nativeRuntime.vrmSourceCount} models ${run.nativeRuntime.vrmModelLoadedCount} bones ${run.nativeRuntime.vrmHumanoidBoneCount} expressions ${run.nativeRuntime.vrmExpressionCount} ${vrmRenderabilityMetricLabel(run.nativeRuntime)} pose ${run.nativeRuntime.vrmPoseBoneAppliedCount}/${run.nativeRuntime.vrmPoseBoneCount} bones ${run.nativeRuntime.vrmPoseExpressionAppliedCount}/${run.nativeRuntime.vrmPoseExpressionCount} expressions`
    : null;

const validationRunMonitorHoldLabel = (run: StreamValidationRun): string | null =>
  run.monitorHold
    ? `hold ${run.monitorHold.status} / ${run.monitorHold.durationSeconds}s / ${run.monitorHold.sampleCount} samples / ${run.monitorHold.stability} / drops ${run.monitorHold.droppedFrameIncrease} / reconnects ${run.monitorHold.observedReconnectAttempts}`
    : null;

const validationRunFaceTrackingLabel = (run: StreamValidationRun): string | null =>
  run.faceTracking && run.faceTracking.status !== "info"
    ? `face ${run.faceTracking.status} / ${run.faceTracking.inputMode} / ${run.faceTracking.runtimeStatus} / prepared ${run.faceTracking.preparedPngTuberCount} / moving ${run.faceTracking.activeMotionCount}`
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

const formatStatusCheckedAt = (value: string): string => {
  if (!value) {
    return "never";
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "invalid";
  }
  return new Date(timestamp).toLocaleString();
};

const DiagnosticMetric = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.diagnosticMetric}>
    <Text style={styles.diagnosticMetricLabel}>{label}</Text>
    <Text style={styles.diagnosticMetricValue}>{value}</Text>
  </View>
);

const ChatReaderPanel = ({
  chatReader,
  platformChat,
  platformChatAuth,
  platformChatOAuth,
  platformChatOAuthFlow,
  twitchDeviceOAuthFlow,
  platformChatOAuthStatus,
  platformStreamKeyStatus,
  platformApiOperationLabel,
  platformChatConnection,
  onSubmit,
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
  platformChatAuth: PlatformChatAuthSession;
  platformChatOAuth: PlatformChatOAuthSettings;
  platformChatOAuthFlow: PlatformChatOAuthFlow | null;
  twitchDeviceOAuthFlow: TwitchDeviceCodeOAuthFlow | null;
  platformChatOAuthStatus: string;
  platformStreamKeyStatus: string;
  platformApiOperationLabel: string | null;
  platformChatConnection: PlatformChatConnectionState;
  onSubmit(author: string, body: string): void;
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
  const updateOAuthClientId = (value: string) =>
    onPlatformChatOAuthChange(platformChat.platform === "youtube" ? { youtubeClientId: value } : { twitchClientId: value });
  const updateOAuthRedirectUri = (value: string) =>
    onPlatformChatOAuthChange(platformChat.platform === "youtube" ? { youtubeRedirectUri: value } : { twitchRedirectUri: value });
  const platformApiBusy = Boolean(platformApiOperationLabel);

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
    <Panel title="Chat Reader">
      <View style={styles.chatStatusRow}>
        <ActionButton
          label={chatReader.settings.enabled ? "Read On" : "Read Off"}
          variant={chatReader.settings.enabled ? "active" : "default"}
          onPress={() => onSettingsChange({ enabled: !chatReader.settings.enabled })}
        />
        <View style={styles.queueBadge}>
          <Text style={styles.queueBadgeText}>{chatReader.queue.length} queued</Text>
        </View>
        <ActionButton
          label="Clear"
          disabled={chatReader.queue.length === 0 && chatReader.history.length === 0}
          onPress={() => {
            Alert.alert(
              "Clear chat comments?",
              "Queued and recent chat comments shown on this device will be removed.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Clear",
                  style: "destructive",
                  onPress: onClearComments
                }
              ]
            );
          }}
        />
      </View>

      <Label text="Author" />
      <TextInput
        value={author}
        onChangeText={setAuthor}
        style={styles.input}
        autoCapitalize="none"
        placeholderTextColor="#71717a"
      />

      <Label text="Comment" />
      <TextInput
        value={body}
        onChangeText={setBody}
        style={styles.input}
        autoCapitalize="none"
        placeholderTextColor="#71717a"
        onSubmitEditing={submit}
      />

      <ActionButton label="Test Read" onPress={submit} />

      <View style={styles.platformChatPanel}>
        <View style={styles.chatStatusRow}>
          <ActionButton
            label={platformChat.enabled ? "Platform On" : "Platform Off"}
            variant={platformChat.enabled ? "active" : "default"}
            onPress={() => onPlatformChatSettingsChange({ enabled: !platformChat.enabled })}
          />
          <View style={[styles.platformStatusBadge, platformStatus.status === "ready" && styles.platformStatusReady]}>
            <Text style={[styles.platformStatusText, platformStatus.status === "ready" && styles.platformStatusReadyText]}>{platformStatus.label}</Text>
          </View>
        </View>
        <View style={styles.platformChoiceRow}>
          <ActionButton
            label="YouTube"
            variant={platformChat.platform === "youtube" ? "active" : "default"}
            onPress={() => onPlatformChatSettingsChange({ platform: "youtube" })}
          />
          <ActionButton
            label="Twitch"
            variant={platformChat.platform === "twitch" ? "active" : "default"}
            onPress={() => onPlatformChatSettingsChange({ platform: "twitch" })}
          />
        </View>
        <View style={styles.oauthPanel}>
          <Label text="OAuth client ID" />
          <TextInput
            value={oauthClientId}
            onChangeText={updateOAuthClientId}
            style={styles.input}
            autoCapitalize="none"
            placeholderTextColor="#71717a"
          />
          <Label text="Redirect URI" />
          <TextInput
            value={oauthRedirectUri}
            onChangeText={updateOAuthRedirectUri}
            style={styles.input}
            autoCapitalize="none"
            placeholderTextColor="#71717a"
          />
          <View style={styles.chatStatusRow}>
            <View style={[styles.platformStatusBadge, platformChatOAuthFlow?.platform === platformChat.platform && styles.platformStatusPending]}>
              <Text style={[styles.platformStatusText, platformChatOAuthFlow?.platform === platformChat.platform && styles.platformStatusPendingText]}>
                {platformChatOAuthFlow?.platform === platformChat.platform ? "OAuth pending" : "OAuth idle"}
              </Text>
            </View>
            <ActionButton label="Start OAuth" disabled={platformApiBusy} onPress={onPlatformChatOAuthStart} />
          </View>
          {platformChat.platform === "twitch" ? (
            <View style={styles.chatStatusRow}>
              <View style={[styles.platformStatusBadge, twitchDeviceOAuthFlow && styles.platformStatusPending]}>
                <Text style={[styles.platformStatusText, twitchDeviceOAuthFlow && styles.platformStatusPendingText]} numberOfLines={1}>
                  {twitchDeviceOAuthFlow ? `Device code ${twitchDeviceOAuthFlow.userCode}` : "Device OAuth idle"}
                </Text>
              </View>
              <ActionButton label="Device OAuth" disabled={platformApiBusy} onPress={onTwitchDeviceOAuthStart} />
              <ActionButton label="Check" disabled={platformApiBusy || !twitchDeviceOAuthFlow} onPress={onTwitchDeviceOAuthPoll} />
            </View>
          ) : null}
          <Label text="Callback URL" />
          <TextInput
            value={platformChatOAuth.callbackUrl}
            onChangeText={(callbackUrl) => onPlatformChatOAuthChange({ callbackUrl })}
            style={styles.input}
            autoCapitalize="none"
            secureTextEntry
            placeholderTextColor="#71717a"
          />
          <ActionButton label="Apply OAuth Callback" disabled={platformApiBusy} onPress={onPlatformChatOAuthCallbackApply} />
          <Text style={styles.platformConnectionMessage}>
            {platformApiOperationLabel ? `Running ${platformApiOperationLabel}. ${platformChatOAuthStatus}` : platformChatOAuthStatus}
          </Text>
          <ActionButton
            label={platformChat.platform === "youtube" ? "Rotate Stream Key" : "Sync Stream Key"}
            disabled={platformApiBusy}
            onPress={onPlatformStreamKeyApply}
          />
          <Text style={styles.platformConnectionMessage}>
            {platformApiOperationLabel ? `Running ${platformApiOperationLabel}. ${platformStreamKeyStatus}` : platformStreamKeyStatus}
          </Text>
        </View>
        {platformChat.platform === "youtube" ? (
          <>
            <Label text="Live chat ID" />
            <TextInput
              value={platformChat.youtubeLiveChatId}
              onChangeText={(youtubeLiveChatId) => onPlatformChatSettingsChange({ youtubeLiveChatId })}
              style={styles.input}
              autoCapitalize="none"
              placeholderTextColor="#71717a"
            />
            <Label text="Access token" />
            <TextInput
              value={platformChatAuth.youtubeAccessToken}
              onChangeText={(youtubeAccessToken) => onPlatformChatAuthChange({ youtubeAccessToken })}
              style={styles.input}
              autoCapitalize="none"
              secureTextEntry
              placeholderTextColor="#71717a"
            />
          </>
        ) : (
          <>
            <Label text="Twitch channel" />
            <TextInput
              value={platformChat.twitchChannel}
              onChangeText={(twitchChannel) => onPlatformChatSettingsChange({ twitchChannel })}
              style={styles.input}
              autoCapitalize="none"
              placeholderTextColor="#71717a"
            />
            <Label text="Twitch login" />
            <TextInput
              value={platformChatAuth.twitchLogin}
              onChangeText={(twitchLogin) => onPlatformChatAuthChange({ twitchLogin })}
              style={styles.input}
              autoCapitalize="none"
              placeholderTextColor="#71717a"
            />
            <Label text="Access token" />
            <TextInput
              value={platformChatAuth.twitchOauthToken}
              onChangeText={(twitchOauthToken) => onPlatformChatAuthChange({ twitchOauthToken })}
              style={styles.input}
              autoCapitalize="none"
              secureTextEntry
              placeholderTextColor="#71717a"
            />
          </>
        )}
        <View style={styles.chatStatusRow}>
          <View
            style={[
              styles.platformStatusBadge,
              platformChatConnection.phase === "connected" && styles.platformStatusReady,
              platformChatConnection.phase === "failed" && styles.platformStatusFailed
            ]}
          >
            <Text
              style={[
                styles.platformStatusText,
                platformChatConnection.phase === "connected" && styles.platformStatusReadyText,
                platformChatConnection.phase === "failed" && styles.platformStatusFailedText
              ]}
            >
              {platformChatConnection.label}
            </Text>
          </View>
          <ActionButton
            label={isNetworkConnected ? "Disconnect" : "Connect"}
            disabled={!platformChat.enabled}
            onPress={isNetworkConnected ? onPlatformChatDisconnect : onPlatformChatConnect}
          />
        </View>
        <Text style={styles.platformConnectionMessage}>{platformChatConnection.message}</Text>
        <ActionButton label="Test Platform Chat" disabled={!platformChat.enabled} onPress={onPlatformChatSampleIngest} />
      </View>

      <NumberStepper label="Rate" value={chatReader.settings.rate} min={0.5} max={1.5} step={0.05} onChange={(rate) => onSettingsChange({ rate })} />
      <NumberStepper label="Pitch" value={chatReader.settings.pitch} min={0.5} max={1.5} step={0.05} onChange={(pitch) => onSettingsChange({ pitch })} />
      <NumberStepper label="Volume" value={chatReader.settings.volume} min={0} max={1} step={0.05} onChange={(volume) => onSettingsChange({ volume })} />
      <NumberStepper
        label="Max length"
        value={chatReader.settings.maxMessageLength}
        min={40}
        max={240}
        step={10}
        onChange={(maxMessageLength) => onSettingsChange({ maxMessageLength })}
      />
      <NumberStepper
        label="Queue limit"
        value={chatReader.settings.maxQueueLength}
        min={4}
        max={24}
        step={1}
        onChange={(maxQueueLength) => onSettingsChange({ maxQueueLength })}
      />
      <NumberStepper
        label="Dedupe window"
        value={chatReader.settings.duplicateWindowSeconds}
        min={0}
        max={120}
        step={5}
        onChange={(duplicateWindowSeconds) => onSettingsChange({ duplicateWindowSeconds })}
      />
      <NumberStepper
        label="Author/min"
        value={chatReader.settings.maxMessagesPerAuthorPerMinute}
        min={1}
        max={30}
        step={1}
        onChange={(maxMessagesPerAuthorPerMinute) => onSettingsChange({ maxMessagesPerAuthorPerMinute })}
      />
      <View style={styles.grid2}>
        <ActionButton
          label={chatReader.settings.redactUrls ? "URL Redact On" : "URL Redact Off"}
          variant={chatReader.settings.redactUrls ? "active" : "default"}
          onPress={() => onSettingsChange({ redactUrls: !chatReader.settings.redactUrls })}
        />
        <ActionButton
          label={chatReader.settings.skipCommandMessages ? "Skip Cmd On" : "Skip Cmd Off"}
          variant={chatReader.settings.skipCommandMessages ? "active" : "default"}
          onPress={() => onSettingsChange({ skipCommandMessages: !chatReader.settings.skipCommandMessages })}
        />
      </View>
      <View style={styles.grid3}>
        <ActionButton
          label={chatReader.settings.moderationEnabled ? "Spam On" : "Spam Off"}
          variant={chatReader.settings.moderationEnabled ? "active" : "default"}
          onPress={() => onSettingsChange({ moderationEnabled: !chatReader.settings.moderationEnabled })}
        />
        <ActionButton
          label={chatReader.settings.blockLinkMessages ? "Block Links" : "Allow Links"}
          variant={chatReader.settings.blockLinkMessages ? "active" : "default"}
          onPress={() => onSettingsChange({ blockLinkMessages: !chatReader.settings.blockLinkMessages })}
        />
        <ActionButton
          label={chatReader.settings.blockExcessiveCaps ? "Block Caps" : "Allow Caps"}
          variant={chatReader.settings.blockExcessiveCaps ? "active" : "default"}
          onPress={() => onSettingsChange({ blockExcessiveCaps: !chatReader.settings.blockExcessiveCaps })}
        />
      </View>

      <Label text="Muted words" />
      <TextInput
        value={mutedWords}
        onChangeText={updateMutedWords}
        style={styles.input}
        autoCapitalize="none"
        placeholderTextColor="#71717a"
      />

      <View style={styles.chatHistory}>
        {chatReader.history.length === 0 ? (
          <Text style={styles.chatEmpty}>No comments yet</Text>
        ) : (
          chatReader.history.slice(0, 4).map((message) => (
            <View key={message.id} style={styles.chatHistoryRow}>
              <Text style={styles.chatAuthor}>{message.author}</Text>
              <Text style={styles.chatBody} numberOfLines={1}>
                {message.body}
              </Text>
            </View>
          ))
        )}
      </View>
    </Panel>
  );
};

const resolveNativeImageAspectRatio = (uri: string): Promise<number | null> => {
  const trimmedUri = uri.trim();
  if (!trimmedUri) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    Image.getSize(
      trimmedUri,
      (width, height) => resolve(width > 0 && height > 0 ? width / height : null),
      () => resolve(null)
    );
  });
};

const ProgramPreview = ({
  scene,
  selectedSourceId,
  chatMessages,
  transitionPreview,
  onSelectSource
}: {
  scene: SceneDocument;
  selectedSourceId: string;
  chatMessages: ReturnType<typeof selectChatOverlayMessages>;
  transitionPreview: SceneTransitionPreview | null;
  onSelectSource(sourceId: string): void;
}) => {
  const transitionOpacity = useSceneTransitionOpacity(transitionPreview);
  return (
    <View style={styles.previewStage}>
      <ScenePreviewLayer scene={scene} selectedSourceId={selectedSourceId} chatMessages={chatMessages} onSelectSource={onSelectSource} />
      {transitionPreview && transitionOpacity > 0 ? (
        <View style={[styles.previewTransitionLayer, { opacity: transitionOpacity }]} pointerEvents="none">
          <ScenePreviewLayer scene={transitionPreview.scene} chatMessages={chatMessages} />
        </View>
      ) : null}
    </View>
  );
};

const ScenePreviewLayer = ({
  scene,
  selectedSourceId = "",
  chatMessages,
  onSelectSource
}: {
  scene: SceneDocument;
  selectedSourceId?: string;
  chatMessages: ReturnType<typeof selectChatOverlayMessages>;
  onSelectSource?(sourceId: string): void;
}) => (
  <>
    {toRenderGraph(scene, { chatMessages }).map((node) => {
      const source = scene.sources.find((item) => item.id === node.id);
      if (!source) {
        return null;
      }
      const interactive = Boolean(onSelectSource);

      const content = (
        <SourceVisual source={source} node={node} />
      );
      return interactive ? (
        <Pressable
          key={source.id}
          style={[
            styles.previewSource,
            {
              left: `${source.transform.x * 100}%`,
              top: `${source.transform.y * 100}%`,
              width: `${source.transform.width * 100}%`,
              height: `${source.transform.height * 100}%`,
              opacity: source.transform.opacity,
              transform: [{ rotate: `${source.transform.rotation}deg` }]
            },
            source.id === selectedSourceId && styles.previewSourceSelected
          ]}
          onPress={() => onSelectSource?.(source.id)}
        >
          {content}
        </Pressable>
      ) : (
        <View
          key={source.id}
          style={[
            styles.previewSource,
            {
              left: `${source.transform.x * 100}%`,
              top: `${source.transform.y * 100}%`,
              width: `${source.transform.width * 100}%`,
              height: `${source.transform.height * 100}%`,
              opacity: source.transform.opacity,
              transform: [{ rotate: `${source.transform.rotation}deg` }]
            }
          ]}
        >
          {content}
        </View>
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
    const timer = setInterval(updateOpacity, 16);
    return () => clearInterval(timer);
  }, [transitionPreview]);

  return opacity;
};

const SourceVisual = ({ source, node }: { source: SceneSource; node?: RenderNode }) => {
  if (source.kind === "screen") {
    return (
      <View style={styles.screenVisual}>
        <Text style={styles.previewText}>Screen Capture</Text>
      </View>
    );
  }

  if (source.kind === "pngtuber" || source.kind === "live2d" || source.kind === "vrm") {
    const motion = source.motion ?? defaultAvatarMotion();
    const rig = source.kind === "pngtuber" ? source.illustrationRig : defaultAvatarIllustrationRig();
    const eyeClose = Math.min(0.95, Math.max(source.blink, motion.eyeSquint));
    const mouthLevel = Math.max(source.mouthOpen, motion.mouthDeform);
    const shoulderTravel = 12 + rig.shoulderLineY * 12;

    if (source.kind === "pngtuber" && source.imageUri.trim()) {
      return (
        <View
          style={[
            styles.avatarVisual,
            {
              transform: [
                { translateX: motion.headX * 72 + motion.shoulderSway * shoulderTravel },
                { translateY: (-motion.bodyBounce + motion.breathing + motion.headY) * 72 },
                { rotate: `${motion.bodyLean * 10 + motion.headRoll * 18}deg` },
                { skewX: `${motion.meshWarp * (3.5 + rig.faceRange * 3)}deg` },
                { skewY: `${motion.hairSway * (2.4 - rig.hairLineY)}deg` },
                { scaleX: Math.max(0.84, 1 - Math.abs(motion.headYaw) * 0.08 - motion.depthTilt * 0.045) },
                { scaleY: Math.max(0.9, 1 - Math.abs(motion.headPitch) * 0.04 + mouthLevel * 0.018) }
              ]
            }
          ]}
        >
          <Image source={{ uri: source.imageUri }} style={styles.avatarStillImage} resizeMode="contain" />
        </View>
      );
    }

    return (
      <View
        style={[
          styles.avatarVisual,
          {
            transform: [
              { translateX: motion.shoulderSway * shoulderTravel },
              { translateY: (-motion.bodyBounce + motion.breathing) * 72 },
              { rotate: `${motion.bodyLean * 10}deg` }
            ]
          }
        ]}
      >
        <View style={styles.avatarBody} />
        <View
          style={[
            styles.avatarHead,
            expressionStyle(source.expression),
            {
              transform: [
                { translateX: motion.headX * 72 },
                { translateY: motion.headY * 72 },
                { rotate: `${motion.headRoll * 18}deg` },
                { skewX: `${motion.meshWarp * 4.5}deg` },
                { scaleX: Math.max(0.84, 1 - Math.abs(motion.headYaw) * 0.08 - motion.depthTilt * 0.04) },
                { scaleY: Math.max(0.9, 1 - Math.abs(motion.headPitch) * 0.04) }
              ]
            }
          ]}
        >
          <View style={[styles.avatarEye, styles.avatarEyeLeft, { transform: [{ scaleY: Math.max(0.1, 1 - eyeClose) }] }]} />
          <View style={[styles.avatarEye, styles.avatarEyeRight, { transform: [{ scaleY: Math.max(0.1, 1 - eyeClose) }] }]} />
          <View style={[styles.avatarMouth, { height: 6 + mouthLevel * 22 }]} />
        </View>
        <Text style={styles.avatarLabel}>{source.kind === "live2d" ? "Live2D" : source.kind === "vrm" ? "VRM" : "PNGTuber"}</Text>
      </View>
    );
  }

  if (source.kind === "text") {
    return (
      <Text style={[styles.textSource, { color: source.color, fontSize: fontSizeForTextSource(source) }]} numberOfLines={1}>
        {source.text}
      </Text>
    );
  }

  if (source.kind === "chat") {
    const text = typeof node?.payload.text === "string" ? node.payload.text : "";
    const lines = text ? text.split("\n") : ["Chat overlay"];
    return (
      <View style={[styles.chatOverlaySource, { backgroundColor: rgbaFromHex(source.backgroundColor, source.backgroundOpacity) }]}>
        {lines.slice(0, source.maxMessages).map((line, index) => (
          <Text
            key={`${line}-${index}`}
            style={[
              styles.chatOverlayLine,
              !text && styles.chatOverlayEmpty,
              { color: source.color, fontSize: fontSizeForChatSource(source) }
            ]}
            numberOfLines={1}
          >
            {line}
          </Text>
        ))}
      </View>
    );
  }

  if (source.kind === "solid") {
    return <View style={[styles.solidSource, { backgroundColor: source.color }]} />;
  }

  return (
    <View style={styles.imageSource}>
      <Text style={styles.previewText}>Image</Text>
    </View>
  );
};

const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <View style={styles.panel}>
    <Text style={styles.panelTitle}>{title}</Text>
    {children}
  </View>
);

const StatusPill = ({ label, tone }: { label: string; tone: "live" | "idle" | "bad" }) => (
  <View style={[styles.statusPill, tone === "live" && styles.statusLive, tone === "bad" && styles.statusBad]}>
    <Text style={[styles.statusText, tone === "live" && styles.statusTextLive]}>{label.toUpperCase()}</Text>
  </View>
);

const Metric = ({ label }: { label: string }) => (
  <View style={styles.metric}>
    <Text style={styles.metricText}>{label}</Text>
  </View>
);

const StartPreflightBanner = ({ report }: { report: StreamStartPreflightReport }) => (
  <View style={[styles.startPreflightBanner, startPreflightBannerStyle(report.status)]}>
    <Text style={[styles.startPreflightSummary, startPreflightSummaryTextStyle(report.status)]}>{report.summary}</Text>
    <Text style={styles.startPreflightAction}>{report.primaryAction}</Text>
    {report.issues.slice(0, 3).map((issue) => (
      <Text key={issue.code} style={[styles.startPreflightIssue, startPreflightIssueTextStyle(issue.severity)]} numberOfLines={2}>
        {issue.label}: {issue.message}
      </Text>
    ))}
  </View>
);

const PublicLaunchChecklistPanel = ({ checklist }: { checklist: PublicLaunchChecklist }) => (
  <View style={[styles.publicLaunchChecklist, publicLaunchChecklistStyle(checklist.status)]}>
    <View style={styles.publicLaunchHeader}>
      <Text style={[styles.publicLaunchTitle, publicLaunchChecklistTextStyle(checklist.status)]}>Public checklist</Text>
      <View style={styles.publicLaunchCounts}>
        <Text style={[styles.publicLaunchCount, styles.publicLaunchCountPass]}>{checklist.passCount} pass</Text>
        <Text style={[styles.publicLaunchCount, styles.publicLaunchCountWarn]}>{checklist.warningCount} warn</Text>
        <Text style={[styles.publicLaunchCount, styles.publicLaunchCountFail]}>{checklist.failCount} fail</Text>
      </View>
    </View>
    <Text style={[styles.publicLaunchSummary, publicLaunchChecklistTextStyle(checklist.status)]}>{checklist.summary}</Text>
    <Text style={[styles.publicLaunchLock, publicLaunchLockTextStyle(checklist)]}>{checklist.startLock.summary}</Text>
    <Text style={styles.publicLaunchAction}>{checklist.primaryAction}</Text>
    <View style={styles.publicLaunchItems}>
      {checklist.items.map((item) => (
        <View key={item.id} style={[styles.publicLaunchItem, publicLaunchItemStyle(item.status)]}>
          <Text style={[styles.publicLaunchItemLabel, publicLaunchItemTextStyle(item.status)]}>{item.label}</Text>
          <Text style={styles.publicLaunchItemDetail} numberOfLines={3}>
            {item.detail}
          </Text>
          <Text style={styles.publicLaunchItemAction} numberOfLines={3}>
            {item.action}
          </Text>
        </View>
      ))}
    </View>
  </View>
);

const ReadinessPanel = ({ readiness }: { readiness: ReadinessReport }) => (
  <View style={[styles.readinessPanel, readiness.canStart ? styles.readinessPanelReady : styles.readinessPanelBlocked]}>
    <Text style={styles.readinessTitle}>{readiness.canStart ? "Start checks passed" : "Start checks need attention"}</Text>
    {readiness.issues.length === 0 ? (
      <Text style={styles.readinessEmpty}>No blocking issues found.</Text>
    ) : (
      readiness.issues.map((issue) => <ReadinessIssueRow key={issue.code} issue={issue} />)
    )}
  </View>
);

const ReadinessIssueRow = ({ issue }: { issue: ReadinessIssue }) => (
  <View style={[styles.readinessIssue, issue.severity === "error" ? styles.readinessIssueError : styles.readinessIssueWarning]}>
    <Text style={[styles.readinessIssueText, issue.severity === "error" ? styles.readinessIssueErrorText : styles.readinessIssueWarningText]}>
      {issue.message}
    </Text>
  </View>
);

const YouTubeTransitionPreflightList = ({
  reports
}: {
  reports: Array<{
    transitionStatus: YouTubeBroadcastTransitionStatus;
    report: PlatformPublishingPreflightReport;
  }>;
}) => (
  <View style={styles.youtubeTransitionPreflights}>
    {reports.map(({ transitionStatus, report }) => (
      <Text
        key={transitionStatus}
        style={[styles.youtubeTransitionPreflight, platformPublishingPreflightTextStyle(report.status)]}
        numberOfLines={2}
      >
        {transitionStatus === "testing" ? "Test" : transitionStatus === "live" ? "Live" : "Complete"}:{" "}
        {report.issues[0]?.message ?? report.summary}
      </Text>
    ))}
  </View>
);

const ActionButton = ({
  label,
  variant = "default",
  disabled,
  onPress
}: {
  label: string;
  variant?: "default" | "primary" | "danger" | "warn" | "active";
  disabled?: boolean;
  onPress(): void | Promise<void>;
}) => (
  <Pressable
    hitSlop={8}
    disabled={disabled}
    style={[
      styles.actionButton,
      variant === "primary" && styles.primaryButton,
      variant === "danger" && styles.dangerButton,
      variant === "warn" && styles.warningButton,
      variant === "active" && styles.activeButton,
      disabled && styles.disabledButton
    ]}
    onPress={onPress}
  >
    <Text style={[styles.actionText, variant === "primary" && styles.primaryText]}>{label}</Text>
  </Pressable>
);

const IconButton = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress(): void }) => (
  <Pressable hitSlop={8} disabled={disabled} style={[styles.iconButton, disabled && styles.disabledButton]} onPress={onPress}>
    <Text style={styles.iconButtonText}>{label}</Text>
  </Pressable>
);

const Label = ({ text }: { text: string }) => <Text style={styles.label}>{text}</Text>;

const Stepper = ({
  label,
  value,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange(value: number): void;
}) => {
  const set = (delta: number) => {
    if (disabled) {
      return;
    }
    onChange(Math.max(0, Math.min(1, Number((value + delta).toFixed(2)))));
  };
  return (
    <View style={styles.stepper}>
      <View style={styles.stepperHeader}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.stepperValue}>{Math.round(value * 100)}</Text>
      </View>
      <View style={styles.stepperControls}>
        <IconButton label="-5" disabled={disabled} onPress={() => set(-0.05)} />
        <View style={styles.stepperTrack}>
          <View style={[styles.stepperFill, { width: `${Math.round(value * 100)}%` }]} />
        </View>
        <IconButton label="+5" disabled={disabled} onPress={() => set(0.05)} />
      </View>
    </View>
  );
};

const NumberStepper = ({
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
}) => {
  const set = (delta: number) => {
    if (disabled) {
      return;
    }
    const next = Math.max(min, Math.min(max, Number((value + delta).toFixed(2))));
    onChange(next);
  };
  return (
    <View style={styles.stepper}>
      <View style={styles.stepperHeader}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.stepperValue}>{Number.isInteger(value) ? value : value.toFixed(2)}</Text>
      </View>
      <View style={styles.stepperControls}>
        <IconButton label="-" disabled={disabled} onPress={() => set(-step)} />
        <View style={styles.stepperTrack}>
          <View style={[styles.stepperFill, { width: `${Math.round(((value - min) / (max - min)) * 100)}%` }]} />
        </View>
        <IconButton label="+" disabled={disabled} onPress={() => set(step)} />
      </View>
    </View>
  );
};

const clampRigScore = (score: number): number => Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));

const scoreAvatarRigSlices = (sliceCount: number): number =>
  sliceCount >= 24 ? 100 : sliceCount >= 20 ? 90 : Math.max(0, Math.round((sliceCount / 20) * 80));

const formatRigPercent = (value: number): string => `${Math.round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100)}%`;

const rigQualityPanelStyle = (grade: AvatarIllustrationRigQualityGrade) => {
  switch (grade) {
    case "ready":
      return styles.rigQualityReady;
    case "review":
      return styles.rigQualityReview;
    case "blocked":
      return styles.rigQualityBlocked;
  }
};

const rigQualityScoreTextStyle = (grade: AvatarIllustrationRigQualityGrade) => {
  switch (grade) {
    case "ready":
      return styles.rigQualityReadyText;
    case "review":
      return styles.rigQualityReviewText;
    case "blocked":
      return styles.rigQualityBlockedText;
  }
};

const rigQualityMessageTextStyle = (grade: AvatarIllustrationRigQualityGrade) =>
  grade === "ready" ? styles.rigQualityReadyText : grade === "blocked" ? styles.rigQualityBlockedText : styles.rigQualityReviewText;

const rigScoreFillStyle = (score: number) =>
  score >= 90 ? styles.rigScoreFillReady : score >= 70 ? styles.rigScoreFillReview : styles.rigScoreFillBlocked;

const diagnosticSummaryStyle = (status: StreamDiagnostics["status"]) => {
  switch (status) {
    case "pass":
      return styles.diagnosticPass;
    case "warn":
      return styles.diagnosticWarn;
    case "fail":
      return styles.diagnosticFail;
    default:
      return null;
  }
};

const diagnosticSummaryTextStyle = (status: StreamDiagnostics["status"]) => {
  switch (status) {
    case "pass":
      return styles.diagnosticPassText;
    case "warn":
      return styles.diagnosticWarnText;
    case "fail":
      return styles.diagnosticFailText;
    default:
      return null;
  }
};

const diagnosticCheckStyle = (status: StreamDiagnostics["checks"][number]["status"]) => {
  switch (status) {
    case "pass":
      return styles.diagnosticCheckPass;
    case "warn":
      return styles.diagnosticCheckWarn;
    case "fail":
      return styles.diagnosticCheckFail;
    default:
      return null;
  }
};

const diagnosticCheckTextStyle = (status: StreamDiagnostics["checks"][number]["status"]) => {
  switch (status) {
    case "warn":
      return styles.diagnosticWarnText;
    case "fail":
      return styles.diagnosticFailText;
    default:
      return null;
  }
};

const audioGuardChipStyle = (status: StreamDiagnostics["audio"]["audioGuard"]["status"]) => {
  switch (status) {
    case "pass":
      return styles.audioGuardPass;
    case "warn":
      return styles.audioGuardWarn;
    case "fail":
      return styles.audioGuardFail;
    default:
      return styles.audioGuardInfo;
  }
};

const diagnosticEventStyle = (severity: StreamDiagnostics["session"]["events"][number]["severity"]) => {
  switch (severity) {
    case "warn":
      return styles.diagnosticCheckWarn;
    case "fail":
      return styles.diagnosticCheckFail;
    default:
      return null;
  }
};

const diagnosticSessionSummaryStyle = (summary: StreamSessionSummary) => {
  if (summary.outcome === "fail") {
    return styles.diagnosticFail;
  }
  if (summary.outcome === "warn") {
    return styles.diagnosticWarn;
  }
  return styles.diagnosticPass;
};

const diagnosticSessionSummaryTextStyle = (summary: StreamSessionSummary) => {
  if (summary.outcome === "fail") {
    return styles.diagnosticFailText;
  }
  if (summary.outcome === "warn") {
    return styles.diagnosticWarnText;
  }
  return styles.diagnosticPassText;
};

const diagnosticSessionStyle = (summary: StreamSessionSummary) =>
  summary.outcome === "fail" ? styles.diagnosticCheckFail : summary.outcome === "warn" ? styles.diagnosticCheckWarn : null;

const diagnosticSessionHistoryStyle = (diagnostics: StreamDiagnostics) =>
  diagnostics.session.historySummary.stability === "baseline"
    ? null
    : diagnostics.session.historySummary.stability === "unstable"
      ? styles.diagnosticCheckFail
      : styles.diagnosticCheckWarn;

const diagnosticAdvisorSummaryStyle = (diagnostics: StreamDiagnostics) => {
  if (diagnostics.qualityAdvisor.severity === "fail") {
    return styles.diagnosticFail;
  }
  if (diagnostics.qualityAdvisor.severity === "warn") {
    return styles.diagnosticWarn;
  }
  return styles.diagnosticPass;
};

const diagnosticAdvisorSummaryTextStyle = (diagnostics: StreamDiagnostics) => {
  if (diagnostics.qualityAdvisor.severity === "fail") {
    return styles.diagnosticFailText;
  }
  if (diagnostics.qualityAdvisor.severity === "warn") {
    return styles.diagnosticWarnText;
  }
  return styles.diagnosticPassText;
};

const diagnosticAdvisorStyle = (diagnostics: StreamDiagnostics) =>
  diagnostics.qualityAdvisor.severity === "fail"
    ? styles.diagnosticCheckFail
    : diagnostics.qualityAdvisor.severity === "warn"
      ? styles.diagnosticCheckWarn
      : null;

const diagnosticQualityAutomationStyle = (decision: StreamQualityAutomationDecision) =>
  decision.command === "none"
    ? null
    : decision.severity === "fail"
      ? styles.diagnosticCheckFail
      : styles.diagnosticCheckWarn;

const diagnosticValidationSummaryStyle = (diagnostics: StreamDiagnostics) => {
  if (diagnostics.validation.status === "blocked") {
    return styles.diagnosticFail;
  }
  if (diagnostics.validation.status === "needs-test") {
    return styles.diagnosticWarn;
  }
  return styles.diagnosticPass;
};

const diagnosticValidationSummaryTextStyle = (diagnostics: StreamDiagnostics) => {
  if (diagnostics.validation.status === "blocked") {
    return styles.diagnosticFailText;
  }
  if (diagnostics.validation.status === "needs-test") {
    return styles.diagnosticWarnText;
  }
  return styles.diagnosticPassText;
};

const diagnosticValidationStyle = (diagnostics: StreamDiagnostics) =>
  diagnostics.validation.status === "blocked"
    ? styles.diagnosticCheckFail
    : diagnostics.validation.status === "needs-test"
      ? styles.diagnosticCheckWarn
      : null;

const diagnosticValidationItemStyle = (status: StreamDiagnostics["validation"]["items"][number]["status"]) =>
  status === "fail" ? styles.diagnosticCheckFail : status === "pass" ? null : styles.diagnosticCheckWarn;

const diagnosticValidationEvidenceSummaryStyle = (diagnostics: StreamDiagnostics) => {
  if (diagnostics.validationEvidence.status === "failing") {
    return styles.diagnosticFail;
  }
  if (diagnostics.validationEvidence.status === "ready") {
    return styles.diagnosticPass;
  }
  return styles.diagnosticWarn;
};

const diagnosticValidationEvidenceSummaryTextStyle = (diagnostics: StreamDiagnostics) => {
  if (diagnostics.validationEvidence.status === "failing") {
    return styles.diagnosticFailText;
  }
  if (diagnostics.validationEvidence.status === "ready") {
    return styles.diagnosticPassText;
  }
  return styles.diagnosticWarnText;
};

const diagnosticValidationEvidenceStyle = (diagnostics: StreamDiagnostics) =>
  diagnostics.validationEvidence.status === "failing"
    ? styles.diagnosticCheckFail
    : diagnostics.validationEvidence.status === "ready"
      ? null
      : styles.diagnosticCheckWarn;

const diagnosticValidationRunbookSummaryStyle = (diagnostics: StreamDiagnostics) => {
  if (diagnostics.validationRunbook.status === "blocked") {
    return styles.diagnosticFail;
  }
  if (diagnostics.validationRunbook.status === "complete") {
    return styles.diagnosticPass;
  }
  return styles.diagnosticWarn;
};

const diagnosticValidationRunbookSummaryTextStyle = (diagnostics: StreamDiagnostics) => {
  if (diagnostics.validationRunbook.status === "blocked") {
    return styles.diagnosticFailText;
  }
  if (diagnostics.validationRunbook.status === "complete") {
    return styles.diagnosticPassText;
  }
  return styles.diagnosticWarnText;
};

const diagnosticValidationRunbookStyle = (diagnostics: StreamDiagnostics) =>
  diagnostics.validationRunbook.status === "blocked"
    ? styles.diagnosticCheckFail
    : diagnostics.validationRunbook.status === "complete"
      ? null
      : styles.diagnosticCheckWarn;

const diagnosticRehearsalStyle = (diagnostics: StreamDiagnostics) =>
  diagnostics.rehearsal.status === "blocked"
    ? styles.diagnosticCheckFail
    : diagnostics.rehearsal.status === "ready"
      ? null
      : styles.diagnosticCheckWarn;

const diagnosticValidationRunStyle = (result: StreamValidationRunResult) =>
  result === "fail" ? styles.diagnosticCheckFail : result === "pass" ? null : styles.diagnosticCheckWarn;

const diagnosticPlatformPublishingFreshnessStyle = (status: PlatformPublishingFreshnessStatus) =>
  status === "fresh" || status === "not-applicable"
    ? null
    : status === "invalid"
      ? styles.diagnosticCheckFail
      : styles.diagnosticCheckWarn;

const hasCriticalQualityIncident = (diagnostics: StreamDiagnostics): boolean =>
  diagnostics.qualityIncidents.incidents.some((incident) => incident.severity === "fail");

const diagnosticIncidentSummaryStyle = (diagnostics: StreamDiagnostics) => {
  if (hasCriticalQualityIncident(diagnostics)) {
    return styles.diagnosticFail;
  }
  if (diagnostics.qualityIncidents.incidents.length > 0) {
    return styles.diagnosticWarn;
  }
  return styles.diagnosticPass;
};

const diagnosticIncidentSummaryTextStyle = (diagnostics: StreamDiagnostics) => {
  if (hasCriticalQualityIncident(diagnostics)) {
    return styles.diagnosticFailText;
  }
  if (diagnostics.qualityIncidents.incidents.length > 0) {
    return styles.diagnosticWarnText;
  }
  return styles.diagnosticPassText;
};

const diagnosticIncidentStyle = (severity: StreamDiagnostics["qualityIncidents"]["incidents"][number]["severity"]) =>
  severity === "fail" ? styles.diagnosticCheckFail : styles.diagnosticCheckWarn;

const diagnosticIncidentTextStyle = (severity: StreamDiagnostics["qualityIncidents"]["incidents"][number]["severity"]) =>
  severity === "fail" ? styles.diagnosticFailText : styles.diagnosticWarnText;

const startPreflightBannerStyle = (status: StreamStartPreflightReport["status"]) => {
  switch (status) {
    case "ready":
      return styles.startPreflightReady;
    case "warning":
      return styles.startPreflightWarning;
    case "blocked":
      return styles.startPreflightBlocked;
  }
};

const startPreflightSummaryTextStyle = (status: StreamStartPreflightReport["status"]) => {
  switch (status) {
    case "ready":
      return styles.startPreflightReadyText;
    case "warning":
      return styles.startPreflightWarningText;
    case "blocked":
      return styles.startPreflightBlockedText;
  }
};

const startPreflightIssueTextStyle = (severity: StreamStartPreflightReport["issues"][number]["severity"]) =>
  severity === "block" ? styles.startPreflightBlockedText : styles.startPreflightWarningText;

const publicLaunchChecklistStyle = (status: PublicLaunchChecklist["status"]) => {
  switch (status) {
    case "ready":
      return styles.publicLaunchReady;
    case "warning":
      return styles.publicLaunchWarning;
    case "blocked":
      return styles.publicLaunchBlocked;
  }
};

const publicLaunchChecklistTextStyle = (status: PublicLaunchChecklist["status"]) => {
  switch (status) {
    case "ready":
      return styles.startPreflightReadyText;
    case "warning":
      return styles.startPreflightWarningText;
    case "blocked":
      return styles.startPreflightBlockedText;
  }
};

const publicLaunchItemStyle = (status: PublicLaunchChecklistItemStatus) => {
  switch (status) {
    case "pass":
      return styles.publicLaunchItemPass;
    case "warn":
      return styles.publicLaunchItemWarn;
    case "fail":
      return styles.publicLaunchItemFail;
  }
};

const publicLaunchItemTextStyle = (status: PublicLaunchChecklistItemStatus) =>
  status === "pass"
    ? styles.startPreflightReadyText
    : status === "warn"
      ? styles.startPreflightWarningText
      : styles.startPreflightBlockedText;

const publicLaunchLockTextStyle = (checklist: PublicLaunchChecklist) =>
  checklist.startLock.blocked
    ? styles.startPreflightBlockedText
    : checklist.startLock.applies
      ? styles.startPreflightReadyText
      : styles.publicLaunchLockOffText;

const platformPublishingPreflightTextStyle = (status: PlatformPublishingPreflightReport["status"]) => {
  switch (status) {
    case "ready":
      return styles.startPreflightReadyText;
    case "warning":
      return styles.startPreflightWarningText;
    case "blocked":
      return styles.startPreflightBlockedText;
  }
};

const expressionStyle = (expression: string) => {
  switch (expression) {
    case "happy":
      return styles.avatarHappy;
    case "angry":
      return styles.avatarAngry;
    case "surprised":
      return styles.avatarSurprised;
    default:
      return null;
  }
};

const fontSizeForTextSource = (source: Extract<SceneSource, { kind: "text" }>) =>
  Math.max(9, Math.min(source.fontSize / 2, source.transform.width * 42, source.transform.height * 150));

const fontSizeForChatSource = (source: Extract<SceneSource, { kind: "chat" }>) =>
  Math.max(9, Math.min(source.fontSize / 2, source.transform.width * 52, source.transform.height * 132));

const rgbaFromHex = (hex: string, alpha: number): string => {
  const normalized = hex.trim().replace(/^#/, "");
  const color = /^[0-9a-fA-F]{6}$/.test(normalized) ? normalized : "000000";
  const red = Number.parseInt(color.slice(0, 2), 16);
  const green = Number.parseInt(color.slice(2, 4), 16);
  const blue = Number.parseInt(color.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
};

const formatElapsed = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`;
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#101015"
  },
  shell: {
    padding: 12,
    gap: 12
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  brandMark: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#505064",
    backgroundColor: "#20202a"
  },
  brandMarkText: {
    color: "#2dd4bf",
    fontWeight: "900"
  },
  brandTextBlock: {
    flex: 1
  },
  title: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "900"
  },
  subtitle: {
    color: "#a1a1aa",
    fontSize: 13,
    marginTop: 2
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  statusPill: {
    minHeight: 34,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: "#18181f"
  },
  statusLive: {
    borderColor: "#22c55e",
    backgroundColor: "#22c55e"
  },
  statusBad: {
    borderColor: "#fb7185",
    backgroundColor: "#fb7185"
  },
  statusText: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "900"
  },
  statusTextLive: {
    color: "#062d18"
  },
  metric: {
    minHeight: 34,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: "#18181f"
  },
  metricText: {
    color: "#f8fafc",
    fontSize: 13
  },
  panel: {
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#18181f",
    gap: 10
  },
  panelTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "900"
  },
  sourceRow: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#20202a",
    gap: 3
  },
  sceneRow: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#15151c",
    gap: 3
  },
  selectedRow: {
    borderColor: "#2dd4bf"
  },
  disabledRow: {
    opacity: 0.48
  },
  sceneName: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "900"
  },
  sceneTransitionControl: {
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#15151c",
    gap: 8
  },
  sceneTransitionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  sourceKind: {
    color: "#2dd4bf",
    fontSize: 12,
    fontWeight: "900"
  },
  sourceName: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700"
  },
  sourceMeta: {
    color: "#a1a1aa",
    fontSize: 12
  },
  rigQualityPanel: {
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#101015",
    gap: 8
  },
  rigQualityReady: {
    borderColor: "rgba(34, 197, 94, 0.46)"
  },
  rigQualityReview: {
    borderColor: "rgba(245, 158, 11, 0.58)"
  },
  rigQualityBlocked: {
    borderColor: "rgba(251, 113, 133, 0.64)"
  },
  rigQualityHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  rigQualityTitleBlock: {
    flex: 1,
    gap: 2
  },
  rigQualityTitle: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  rigQualityMeta: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "800"
  },
  rigQualityScore: {
    minWidth: 72,
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "right"
  },
  rigQualityReadyText: {
    color: "#bbf7d0"
  },
  rigQualityReviewText: {
    color: "#fcd34d"
  },
  rigQualityBlockedText: {
    color: "#fecdd3"
  },
  rigQualityRows: {
    gap: 6
  },
  rigScoreRow: {
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  rigScoreLabel: {
    width: 46,
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "900"
  },
  rigScoreTrack: {
    flex: 1,
    flexDirection: "row",
    height: 8,
    overflow: "hidden",
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#343442",
    backgroundColor: "#18181f"
  },
  rigScoreFill: {
    height: "100%"
  },
  rigScoreFillReady: {
    backgroundColor: "#22c55e"
  },
  rigScoreFillReview: {
    backgroundColor: "#f59e0b"
  },
  rigScoreFillBlocked: {
    backgroundColor: "#fb7185"
  },
  rigScoreValue: {
    width: 34,
    color: "#f8fafc",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "right"
  },
  rigLineGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  rigLineChip: {
    minWidth: 74,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#18181f"
  },
  rigLineLabel: {
    color: "#a1a1aa",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  rigLineValue: {
    marginTop: 2,
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "900"
  },
  rigQualityMessage: {
    color: "#a1a1aa",
    fontSize: 12,
    lineHeight: 17
  },
  grid2: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  grid3: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  grid4: {
    flexDirection: "row",
    gap: 8
  },
  broadcastMixerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "stretch"
  },
  broadcastMixerVolume: {
    flex: 2,
    minWidth: 180
  },
  actionButton: {
    minHeight: 46,
    minWidth: 118,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    backgroundColor: "#20202a",
    paddingHorizontal: 12
  },
  primaryButton: {
    borderColor: "#22c55e",
    backgroundColor: "#22c55e"
  },
  dangerButton: {
    borderColor: "rgba(251, 113, 133, 0.54)",
    backgroundColor: "rgba(251, 113, 133, 0.16)"
  },
  warningButton: {
    borderColor: "rgba(245, 158, 11, 0.54)",
    backgroundColor: "rgba(245, 158, 11, 0.14)"
  },
  activeButton: {
    borderColor: "#2dd4bf",
    backgroundColor: "rgba(45, 212, 191, 0.16)"
  },
  disabledButton: {
    opacity: 0.48
  },
  actionText: {
    color: "#f8fafc",
    fontWeight: "800",
    textTransform: "capitalize"
  },
  primaryText: {
    color: "#062d18"
  },
  iconButton: {
    minHeight: 44,
    minWidth: 66,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    backgroundColor: "#20202a",
    paddingHorizontal: 8
  },
  iconButtonText: {
    color: "#f8fafc",
    fontWeight: "800",
    fontSize: 12
  },
  previewStage: {
    position: "relative",
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#0d0d13"
  },
  previewTransitionLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20
  },
  previewSource: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "transparent"
  },
  previewSourceSelected: {
    borderColor: "#2dd4bf"
  },
  screenVisual: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(56, 189, 248, 0.12)"
  },
  previewText: {
    color: "#a1a1aa",
    fontWeight: "700"
  },
  avatarVisual: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarStillImage: {
    width: "100%",
    height: "100%"
  },
  avatarBody: {
    position: "absolute",
    bottom: "16%",
    width: "58%",
    aspectRatio: 1.6,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "rgba(248, 250, 252, 0.72)",
    backgroundColor: "rgba(45, 212, 191, 0.42)"
  },
  avatarHead: {
    position: "relative",
    width: "72%",
    aspectRatio: 1,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: "#f8fafc",
    backgroundColor: "#8b5cf6"
  },
  avatarHappy: {
    backgroundColor: "#22c55e"
  },
  avatarAngry: {
    backgroundColor: "#fb7185"
  },
  avatarSurprised: {
    backgroundColor: "#38bdf8"
  },
  avatarEye: {
    position: "absolute",
    top: "34%",
    width: "13%",
    height: "18%",
    borderRadius: 99,
    backgroundColor: "#101015"
  },
  avatarEyeLeft: {
    left: "27%"
  },
  avatarEyeRight: {
    right: "27%"
  },
  avatarMouth: {
    position: "absolute",
    left: "38%",
    bottom: "25%",
    width: "24%",
    minHeight: 5,
    borderRadius: 99,
    backgroundColor: "#101015"
  },
  avatarLabel: {
    position: "absolute",
    bottom: 8,
    overflow: "hidden",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    color: "#f8fafc",
    backgroundColor: "rgba(16, 16, 21, 0.78)",
    fontSize: 11,
    fontWeight: "900"
  },
  textSource: {
    width: "100%",
    color: "#f8fafc",
    fontWeight: "900",
    textAlign: "center"
  },
  chatOverlaySource: {
    width: "100%",
    height: "100%",
    justifyContent: "flex-end",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  chatOverlayLine: {
    width: "100%",
    color: "#f8fafc",
    fontWeight: "900",
    textShadowColor: "rgba(0, 0, 0, 0.82)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4
  },
  chatOverlayEmpty: {
    color: "#a1a1aa"
  },
  solidSource: {
    width: "100%",
    height: "100%"
  },
  imageSource: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#f59e0b",
    backgroundColor: "rgba(245, 158, 11, 0.2)"
  },
  transport: {
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#18181f",
    gap: 10
  },
  transportReadout: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  operationBanner: {
    minHeight: 38,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10
  },
  operationBannerPending: {
    borderColor: "rgba(14, 165, 233, 0.46)",
    backgroundColor: "rgba(14, 165, 233, 0.1)"
  },
  operationBannerError: {
    borderColor: "rgba(251, 113, 133, 0.54)",
    backgroundColor: "rgba(251, 113, 133, 0.1)"
  },
  operationBannerText: {
    fontSize: 13,
    fontWeight: "800"
  },
  operationBannerPendingText: {
    color: "#bae6fd"
  },
  operationBannerErrorText: {
    color: "#fecdd3"
  },
  startPreflightBanner: {
    gap: 6,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#101015"
  },
  startPreflightReady: {
    borderColor: "rgba(34, 197, 94, 0.42)"
  },
  startPreflightWarning: {
    borderColor: "rgba(245, 158, 11, 0.42)"
  },
  startPreflightBlocked: {
    borderColor: "rgba(251, 113, 133, 0.54)"
  },
  startPreflightSummary: {
    fontSize: 13,
    fontWeight: "900"
  },
  startPreflightReadyText: {
    color: "#bbf7d0"
  },
  startPreflightWarningText: {
    color: "#fde68a"
  },
  startPreflightBlockedText: {
    color: "#fecdd3"
  },
  startPreflightAction: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  startPreflightIssue: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  publicLaunchChecklist: {
    gap: 8,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#101015"
  },
  publicLaunchReady: {
    borderColor: "rgba(34, 197, 94, 0.42)"
  },
  publicLaunchWarning: {
    borderColor: "rgba(245, 158, 11, 0.42)"
  },
  publicLaunchBlocked: {
    borderColor: "rgba(251, 113, 133, 0.54)"
  },
  publicLaunchHeader: {
    gap: 8
  },
  publicLaunchTitle: {
    fontSize: 13,
    fontWeight: "900"
  },
  publicLaunchCounts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  publicLaunchCount: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: "#121218",
    fontSize: 11,
    fontWeight: "900"
  },
  publicLaunchCountPass: {
    borderColor: "rgba(34, 197, 94, 0.3)",
    color: "#bbf7d0"
  },
  publicLaunchCountWarn: {
    borderColor: "rgba(245, 158, 11, 0.34)",
    color: "#fde68a"
  },
  publicLaunchCountFail: {
    borderColor: "rgba(251, 113, 133, 0.36)",
    color: "#fecdd3"
  },
  publicLaunchSummary: {
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18
  },
  publicLaunchLock: {
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#121218",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  publicLaunchLockOffText: {
    color: "#a1a1aa"
  },
  publicLaunchAction: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  publicLaunchItems: {
    gap: 7
  },
  publicLaunchItem: {
    gap: 4,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#121218"
  },
  publicLaunchItemPass: {
    borderColor: "rgba(34, 197, 94, 0.3)"
  },
  publicLaunchItemWarn: {
    borderColor: "rgba(245, 158, 11, 0.34)"
  },
  publicLaunchItemFail: {
    borderColor: "rgba(251, 113, 133, 0.36)"
  },
  publicLaunchItemLabel: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  publicLaunchItemDetail: {
    color: "#d4d4d8",
    fontSize: 12,
    lineHeight: 17
  },
  publicLaunchItemAction: {
    color: "#a1a1aa",
    fontSize: 12,
    lineHeight: 17
  },
  youtubeTransitionPreflights: {
    gap: 6
  },
  youtubeTransitionPreflight: {
    minHeight: 34,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#101015",
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  mutedText: {
    color: "#a1a1aa"
  },
  assetPrepareStatus: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  assetPrepareSuccess: {
    color: "#bbf7d0"
  },
  assetPrepareError: {
    color: "#fecdd3"
  },
  label: {
    color: "#a1a1aa",
    fontSize: 13,
    fontWeight: "700"
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: "#101015",
    color: "#f8fafc"
  },
  multilineInput: {
    minHeight: 92,
    paddingTop: 12,
    textAlignVertical: "top"
  },
  secretRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  secretStatus: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 13,
    backgroundColor: "#101015",
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "800"
  },
  statusCell: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: "#101015",
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center"
  },
  healthIssue: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.45)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    color: "#fde68a",
    fontSize: 11,
    fontWeight: "700"
  },
  stepper: {
    gap: 8
  },
  stepperHeader: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  stepperValue: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "900"
  },
  stepperControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  stepperTrack: {
    flex: 1,
    height: 10,
    overflow: "hidden",
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#505064",
    backgroundColor: "#101015"
  },
  stepperFill: {
    height: "100%",
    backgroundColor: "#2dd4bf"
  },
  levelTrack: {
    height: 12,
    overflow: "hidden",
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#505064",
    backgroundColor: "#101015"
  },
  levelFill: {
    height: "100%",
    backgroundColor: "#22c55e"
  },
  audioGuardChip: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#181820",
    gap: 3
  },
  audioGuardPass: {
    borderColor: "rgba(34, 197, 94, 0.44)"
  },
  audioGuardWarn: {
    borderColor: "rgba(245, 158, 11, 0.58)"
  },
  audioGuardFail: {
    borderColor: "rgba(251, 113, 133, 0.64)"
  },
  audioGuardInfo: {
    borderColor: "rgba(148, 163, 184, 0.38)"
  },
  audioGuardTitle: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  audioGuardText: {
    color: "#f4f4f5",
    fontSize: 12,
    lineHeight: 17
  },
  sectionDivider: {
    height: 1,
    marginVertical: 4,
    backgroundColor: "#343442"
  },
  trackingReadout: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  trackingCell: {
    minHeight: 32,
    minWidth: 72,
    flex: 1,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 8,
    backgroundColor: "#101015",
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center"
  },
  trackingCellActive: {
    borderColor: "rgba(34, 197, 94, 0.46)",
    color: "#bbf7d0"
  },
  chatStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  queueBadge: {
    minHeight: 46,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: "#101015"
  },
  queueBadgeText: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "800"
  },
  platformChatPanel: {
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#101015",
    gap: 10
  },
  platformChoiceRow: {
    flexDirection: "row",
    gap: 8
  },
  oauthPanel: {
    borderTopWidth: 1,
    borderTopColor: "#343442",
    paddingTop: 10,
    gap: 9
  },
  platformStatusBadge: {
    minHeight: 46,
    flex: 1,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: "#18181f"
  },
  platformStatusReady: {
    borderColor: "rgba(34, 197, 94, 0.42)"
  },
  platformStatusPending: {
    borderColor: "rgba(251, 191, 36, 0.42)"
  },
  platformStatusFailed: {
    borderColor: "rgba(244, 63, 94, 0.42)"
  },
  platformStatusText: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "900"
  },
  platformStatusReadyText: {
    color: "#bbf7d0"
  },
  platformStatusPendingText: {
    color: "#fde68a"
  },
  platformStatusFailedText: {
    color: "#fecdd3"
  },
  platformConnectionMessage: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  chatHistory: {
    gap: 6
  },
  chatEmpty: {
    minHeight: 34,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: "#101015",
    color: "#a1a1aa",
    fontSize: 12
  },
  chatHistoryRow: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#101015"
  },
  chatAuthor: {
    color: "#2dd4bf",
    fontSize: 11,
    fontWeight: "900"
  },
  chatBody: {
    marginTop: 2,
    color: "#a1a1aa",
    fontSize: 12
  },
  qualityRow: {
    gap: 8,
    paddingRight: 4
  },
  readinessPanel: {
    gap: 8,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#101015"
  },
  readinessPanelReady: {
    borderColor: "rgba(34, 197, 94, 0.42)"
  },
  readinessPanelBlocked: {
    borderColor: "rgba(251, 113, 133, 0.42)"
  },
  readinessTitle: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "900"
  },
  readinessEmpty: {
    color: "#a1a1aa",
    fontSize: 12,
    lineHeight: 17
  },
  readinessIssue: {
    minHeight: 30,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#18181f"
  },
  readinessIssueError: {
    borderColor: "rgba(251, 113, 133, 0.36)"
  },
  readinessIssueWarning: {
    borderColor: "rgba(245, 158, 11, 0.34)"
  },
  readinessIssueText: {
    fontSize: 12,
    lineHeight: 17
  },
  readinessIssueErrorText: {
    color: "#fecdd3"
  },
  readinessIssueWarningText: {
    color: "#fde68a"
  },
  diagnosticSummary: {
    minHeight: 40,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#101015"
  },
  diagnosticSummaryText: {
    color: "#a1a1aa",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18
  },
  diagnosticActions: {
    alignItems: "stretch"
  },
  diagnosticPass: {
    borderColor: "rgba(34, 197, 94, 0.42)"
  },
  diagnosticWarn: {
    borderColor: "rgba(245, 158, 11, 0.46)"
  },
  diagnosticFail: {
    borderColor: "rgba(251, 113, 133, 0.54)"
  },
  diagnosticPassText: {
    color: "#bbf7d0"
  },
  diagnosticWarnText: {
    color: "#fde68a"
  },
  diagnosticFailText: {
    color: "#fecdd3"
  },
  diagnosticGrid: {
    gap: 7
  },
  diagnosticMetric: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: "#101015"
  },
  diagnosticMetricLabel: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  diagnosticMetricValue: {
    marginTop: 3,
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  diagnosticIncidents: {
    gap: 7
  },
  diagnosticIncidentSummary: {
    minHeight: 38,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: "#101015"
  },
  diagnosticIncidentSummaryText: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17
  },
  diagnosticIncident: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: "#121218"
  },
  diagnosticIncidentTitle: {
    color: "#f8fafc",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  diagnosticIncidentText: {
    marginTop: 3,
    color: "#a1a1aa",
    fontSize: 12,
    lineHeight: 17
  },
  diagnosticIncidentRecommendation: {
    marginTop: 3,
    color: "#a1a1aa",
    fontSize: 12,
    lineHeight: 17
  },
  validationRecorder: {
    gap: 8,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    padding: 9,
    backgroundColor: "#101015"
  },
  diagnosticEvents: {
    gap: 7
  },
  diagnosticEvent: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: "#121218"
  },
  diagnosticEventTitle: {
    color: "#f8fafc",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  diagnosticEventText: {
    marginTop: 3,
    color: "#a1a1aa",
    fontSize: 12,
    lineHeight: 17
  },
  diagnosticEventEmpty: {
    color: "#a1a1aa",
    fontSize: 12,
    lineHeight: 17
  },
  diagnosticChecks: {
    gap: 7
  },
  diagnosticCheck: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: "#101015"
  },
  diagnosticCheckPass: {
    borderColor: "rgba(34, 197, 94, 0.32)"
  },
  diagnosticCheckWarn: {
    borderColor: "rgba(245, 158, 11, 0.38)"
  },
  diagnosticCheckFail: {
    borderColor: "rgba(251, 113, 133, 0.42)"
  },
  diagnosticCheckLabel: {
    color: "#f8fafc",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  diagnosticCheckText: {
    marginTop: 3,
    color: "#a1a1aa",
    fontSize: 12,
    lineHeight: 17
  },
  destinationRow: {
    gap: 8,
    paddingRight: 4
  },
  destinationChip: {
    minWidth: 142,
    minHeight: 58,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: "#20202a"
  },
  destinationChipActive: {
    borderColor: "#2dd4bf",
    backgroundColor: "rgba(45, 212, 191, 0.14)"
  },
  destinationName: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "900"
  },
  destinationMeta: {
    marginTop: 4,
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "800"
  },
  qualityChip: {
    minWidth: 156,
    minHeight: 64,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#343442",
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: "#20202a"
  },
  qualityChipActive: {
    borderColor: "#2dd4bf"
  },
  qualityText: {
    color: "#f8fafc",
    fontWeight: "900"
  },
  qualityMeta: {
    marginTop: 4,
    color: "#a1a1aa",
    fontSize: 12
  }
});
