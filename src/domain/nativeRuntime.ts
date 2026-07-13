import { redactSensitiveText } from "./sensitiveText";

export type NativeRuntimeCompositionStatus = "unknown" | "screen-only" | "applied" | "pending" | "failed";
export type NativeRuntimePlatform = "ios" | "android";
export type NativeRuntimeThermalState = "unknown" | "nominal" | "fair" | "serious" | "critical";
export type NativeRuntimePowerSource = "unknown" | "battery" | "wired" | "wireless";
export type NativeRuntimeMemoryPressureState = "unknown" | "normal" | "warning" | "critical";

export interface NativeRuntimeDevice {
  thermalState: NativeRuntimeThermalState;
  thermalStatusCode: number;
  batteryLevelPercent: number;
  charging: boolean;
  lowPowerMode: boolean;
  powerSource: NativeRuntimePowerSource;
  memoryPressureState: NativeRuntimeMemoryPressureState;
  availableMemoryBytes: number;
  memoryThresholdBytes: number;
  sampledAt: number;
}

const nativeThermalStates = new Set<NativeRuntimeThermalState>([
  "unknown",
  "nominal",
  "fair",
  "serious",
  "critical"
]);
const nativePowerSources = new Set<NativeRuntimePowerSource>(["unknown", "battery", "wired", "wireless"]);
const nativeMemoryPressureStates = new Set<NativeRuntimeMemoryPressureState>([
  "unknown",
  "normal",
  "warning",
  "critical"
]);

export const normalizeNativeRuntimeDevice = (
  device: Partial<NativeRuntimeDevice> | null | undefined
): NativeRuntimeDevice | undefined => {
  if (!device) {
    return undefined;
  }

  const batteryLevelPercent = normalizeFiniteNumber(device.batteryLevelPercent, -1);
  return {
    thermalState: nativeThermalStates.has(device.thermalState as NativeRuntimeThermalState)
      ? (device.thermalState as NativeRuntimeThermalState)
      : "unknown",
    thermalStatusCode: Math.round(normalizeFiniteNumber(device.thermalStatusCode, -1)),
    batteryLevelPercent:
      batteryLevelPercent < 0 ? -1 : Math.round(Math.min(100, batteryLevelPercent)),
    charging: device.charging === true,
    lowPowerMode: device.lowPowerMode === true,
    powerSource: nativePowerSources.has(device.powerSource as NativeRuntimePowerSource)
      ? (device.powerSource as NativeRuntimePowerSource)
      : "unknown",
    memoryPressureState: nativeMemoryPressureStates.has(
      device.memoryPressureState as NativeRuntimeMemoryPressureState
    )
      ? (device.memoryPressureState as NativeRuntimeMemoryPressureState)
      : "unknown",
    availableMemoryBytes: normalizeByteCount(device.availableMemoryBytes),
    memoryThresholdBytes: normalizeByteCount(device.memoryThresholdBytes),
    sampledAt: Math.max(0, Math.round(normalizeFiniteNumber(device.sampledAt, 0)))
  };
};

const normalizeFiniteNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const normalizeByteCount = (value: unknown): number => {
  const normalized = normalizeFiniteNumber(value, -1);
  return normalized < 0 ? -1 : Math.round(Math.min(Number.MAX_SAFE_INTEGER, normalized));
};

const productionVrmRendererBackendsByPlatform: Record<NativeRuntimePlatform, Set<string>> = {
  ios: new Set(["metal", "metal-scene-kit", "scene-kit"]),
  android: new Set(["opengl-es", "opengl-es-3", "filament-opengl-es"])
};

const productionVideoEncoderBackendsByPlatform: Record<NativeRuntimePlatform, Set<string>> = {
  ios: new Set(["videotoolbox", "videotoolbox-h264"]),
  android: new Set(["mediacodec", "mediacodec-h264"])
};

const productionAudioEncoderBackendsByPlatform: Record<NativeRuntimePlatform, Set<string>> = {
  ios: new Set(["audiotoolbox", "audiotoolbox-aac"]),
  android: new Set(["mediacodec", "mediacodec-aac"])
};

export const normalizeVrmRendererBackend = (backend: string | null | undefined): string =>
  typeof backend === "string" ? backend.trim().toLowerCase() : "";

export const isProductionVrmRendererBackend = (
  platform: NativeRuntimePlatform | string | null | undefined,
  backend: string | null | undefined
): boolean => {
  if (platform !== "ios" && platform !== "android") {
    return false;
  }
  return productionVrmRendererBackendsByPlatform[platform].has(normalizeVrmRendererBackend(backend));
};

export const normalizeNativeEncoderBackend = (backend: string | null | undefined): string =>
  typeof backend === "string" ? backend.trim().toLowerCase() : "";

export const isProductionNativeVideoEncoderBackend = (
  platform: NativeRuntimePlatform | string | null | undefined,
  backend: string | null | undefined
): boolean => {
  if (platform !== "ios" && platform !== "android") {
    return false;
  }
  return productionVideoEncoderBackendsByPlatform[platform].has(normalizeNativeEncoderBackend(backend));
};

export const isProductionNativeAudioEncoderBackend = (
  platform: NativeRuntimePlatform | string | null | undefined,
  backend: string | null | undefined
): boolean => {
  if (platform !== "ios" && platform !== "android") {
    return false;
  }
  return productionAudioEncoderBackendsByPlatform[platform].has(normalizeNativeEncoderBackend(backend));
};

export interface NativeRuntimeComposition {
  status: NativeRuntimeCompositionStatus;
  appliedCount: number;
  appliedKinds?: string[];
  skippedCount: number;
  skippedKinds: string[];
  stillImageAssetCount?: number;
  stillImageAssetLoadedCount?: number;
  stillImageAssetMissingCount?: number;
  stillImageAssetMissingKinds?: string[];
  stillImageAssetDecodedCount?: number;
  stillImageAssetDecodedPixelCount?: number;
  stillImageAssetCompositedCount?: number;
  stillImageAssetCompositedPixelCount?: number;
  runtimeCompositorBackend?: string;
  runtimeCompositedFrameCount?: number;
  runtimeDroppedFrameCount?: number;
  runtimeCompositionFailureCount?: number;
  liveRenderGraphReloadCount?: number;
  liveRenderGraphRejectedUpdateCount?: number;
  stillImageAssetAppGroupCount?: number;
  stillImageAssetAppGroupLoadedCount?: number;
  stillImageAssetAppGroupDecodedCount?: number;
  stillImageAssetAppGroupDecodedPixelCount?: number;
  stillImageAssetAppGroupCompositedCount?: number;
  stillImageAssetAppGroupCompositedPixelCount?: number;
  live2dSourceCount?: number;
  live2dPosePayloadCount?: number;
  live2dActivePoseCount?: number;
  live2dMissingPoseCount?: number;
  live2dRuntimeStatuses?: string[];
  vrmSourceCount?: number;
  vrmPosePayloadCount?: number;
  vrmActivePoseCount?: number;
  vrmMissingPoseCount?: number;
  vrmModelUriCount?: number;
  vrmModelVersions?: string[];
  vrmHumanoidBoneCount?: number;
  vrmExpressionCount?: number;
  vrmMeshPrimitiveCount?: number;
  vrmSkinnedMeshPrimitiveCount?: number;
  vrmSkinJointCount?: number;
  vrmPositionAccessorCount?: number;
  vrmVertexCount?: number;
  vrmIndexCount?: number;
  vrmBoundsAccessorCount?: number;
  vrmSkinningAttributePrimitiveCount?: number;
  vrmTrianglePrimitiveCount?: number;
  vrmUnsupportedPrimitiveModeCount?: number;
  vrmNormalAccessorCount?: number;
  vrmTexcoordAccessorCount?: number;
  vrmMorphTargetCount?: number;
  vrmMaterialCount?: number;
  vrmTextureCount?: number;
  vrmImageCount?: number;
  vrmUnsupportedImageMimeCount?: number;
  vrmTransparentMaterialCount?: number;
  vrmPoseBoneCount?: number;
  vrmPoseBoneAppliedCount?: number;
  vrmPoseBoneUnsupportedCount?: number;
  vrmPoseExpressionCount?: number;
  vrmPoseExpressionAppliedCount?: number;
  vrmPoseExpressionUnsupportedCount?: number;
  vrmRuntimeStatuses?: string[];
  vrmRendererStatus?: "not-required" | "unavailable" | "loading" | "ready" | "failed";
  vrmRendererBackend?: string;
  vrmModelLoadedCount?: number;
  vrmRenderedSourceCount?: number;
  vrmRenderMissingCount?: number;
  vrmRenderFailureCount?: number;
  message: string;
}

export type NativeRuntimeBitrateAdaptationStatus = "unknown" | "steady" | "reduced" | "restored" | "failed";
export type NativeRuntimeBitrateAdaptationControlOwner = "none" | "native";

export interface NativeRuntimeBitrateAdaptation {
  status: NativeRuntimeBitrateAdaptationStatus;
  initialTargetKbps: number;
  requestedTargetKbps: number;
  appliedTargetKbps: number;
  minimumAppliedKbps: number;
  updateCount: number;
  failureCount: number;
  lastUpdatedAt: number;
  controlOwner?: NativeRuntimeBitrateAdaptationControlOwner;
  controllerState?: string;
  baselineTargetKbps?: number;
  effectiveTargetKbps?: number;
  floorTargetKbps?: number;
  pendingTargetKbps?: number;
  automaticReductionCount?: number;
  automaticRestorationCount?: number;
  pressureSampleCount?: number;
  healthySampleCount?: number;
  cooldownRemainingMs?: number;
  recoveryEligibleInMs?: number;
  publishGeneration?: number;
  cumulativeReconnectCount?: number;
  lastDecisionAt?: number;
  lastDecisionReason?: string;
}

export interface NormalizedNativeRuntimeBitrateAdaptation extends NativeRuntimeBitrateAdaptation {
  controlOwner: NativeRuntimeBitrateAdaptationControlOwner;
  controllerState: string;
  baselineTargetKbps: number;
  effectiveTargetKbps: number;
  floorTargetKbps: number;
  pendingTargetKbps: number;
  automaticReductionCount: number;
  automaticRestorationCount: number;
  pressureSampleCount: number;
  healthySampleCount: number;
  cooldownRemainingMs: number;
  recoveryEligibleInMs: number;
  publishGeneration: number;
  cumulativeReconnectCount: number;
  lastDecisionAt: number;
  lastDecisionReason: string;
}

const nativeBitrateAdaptationStatuses = new Set<NativeRuntimeBitrateAdaptationStatus>([
  "unknown",
  "steady",
  "reduced",
  "restored",
  "failed"
]);
const nativeBitrateAdaptationControlOwners = new Set<NativeRuntimeBitrateAdaptationControlOwner>([
  "none",
  "native"
]);

export const normalizeNativeRuntimeBitrateAdaptation = (
  value: Partial<NativeRuntimeBitrateAdaptation> | null | undefined
): NormalizedNativeRuntimeBitrateAdaptation => ({
  status: nativeBitrateAdaptationStatuses.has(value?.status as NativeRuntimeBitrateAdaptationStatus)
    ? (value?.status as NativeRuntimeBitrateAdaptationStatus)
    : "unknown",
  initialTargetKbps: normalizeNativeRuntimeNonnegativeInteger(value?.initialTargetKbps),
  requestedTargetKbps: normalizeNativeRuntimeNonnegativeInteger(value?.requestedTargetKbps),
  appliedTargetKbps: normalizeNativeRuntimeNonnegativeInteger(value?.appliedTargetKbps),
  minimumAppliedKbps: normalizeNativeRuntimeNonnegativeInteger(value?.minimumAppliedKbps),
  updateCount: normalizeNativeRuntimeNonnegativeInteger(value?.updateCount),
  failureCount: normalizeNativeRuntimeNonnegativeInteger(value?.failureCount),
  lastUpdatedAt: normalizeNativeRuntimeNonnegativeInteger(value?.lastUpdatedAt),
  controlOwner: nativeBitrateAdaptationControlOwners.has(
    value?.controlOwner as NativeRuntimeBitrateAdaptationControlOwner
  )
    ? (value?.controlOwner as NativeRuntimeBitrateAdaptationControlOwner)
    : "none",
  controllerState: normalizeNativeRuntimeBitrateText(value?.controllerState, "idle", 64),
  baselineTargetKbps: normalizeNativeRuntimeNonnegativeInteger(value?.baselineTargetKbps),
  effectiveTargetKbps: normalizeNativeRuntimeNonnegativeInteger(value?.effectiveTargetKbps),
  floorTargetKbps: normalizeNativeRuntimeNonnegativeInteger(value?.floorTargetKbps),
  pendingTargetKbps: normalizeNativeRuntimeNonnegativeInteger(value?.pendingTargetKbps),
  automaticReductionCount: normalizeNativeRuntimeNonnegativeInteger(value?.automaticReductionCount),
  automaticRestorationCount: normalizeNativeRuntimeNonnegativeInteger(value?.automaticRestorationCount),
  pressureSampleCount: normalizeNativeRuntimeNonnegativeInteger(value?.pressureSampleCount),
  healthySampleCount: normalizeNativeRuntimeNonnegativeInteger(value?.healthySampleCount),
  cooldownRemainingMs: normalizeNativeRuntimeNonnegativeInteger(value?.cooldownRemainingMs),
  recoveryEligibleInMs: normalizeNativeRuntimeNonnegativeInteger(value?.recoveryEligibleInMs),
  publishGeneration: normalizeNativeRuntimeNonnegativeInteger(value?.publishGeneration),
  cumulativeReconnectCount: normalizeNativeRuntimeNonnegativeInteger(value?.cumulativeReconnectCount),
  lastDecisionAt: normalizeNativeRuntimeNonnegativeInteger(value?.lastDecisionAt),
  lastDecisionReason: normalizeNativeRuntimeBitrateText(value?.lastDecisionReason, "", 160)
});

const normalizeNativeRuntimeNonnegativeInteger = (value: unknown): number =>
  Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(normalizeFiniteNumber(value, 0))));

const normalizeNativeRuntimeBitrateText = (
  value: unknown,
  fallback: string,
  maxLength: number
): string => {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim();
  if (!normalized) {
    return fallback;
  }
  return redactSensitiveText(normalized.slice(0, maxLength * 4)).slice(0, maxLength).trim() || fallback;
};

export interface NativeRuntimePublisher {
  state: string;
  publishGeneration?: number;
  currentPublishVideoFrames?: number;
  currentPublishAudioFrames?: number;
  videoEncoderBackend?: string;
  audioEncoderBackend?: string;
  reconnectAttempts: number;
  sentVideoFrames: number;
  sentAudioFrames: number;
  droppedVideoFrames: number;
  droppedAudioFrames: number;
  bytesWritten: number;
  videoFrameIntervalSampleCount?: number;
  videoFrameIntervalAverageMs?: number;
  videoFrameIntervalMaxMs?: number;
  videoFrameIntervalJitterMs?: number;
  cacheSize: number;
  itemsInCache: number;
  congested: boolean;
  bitrateAdaptation?: NativeRuntimeBitrateAdaptation;
  lastError: string;
}

export type NativeRuntimeEncoderProbeStatus = "unknown" | "pass" | "warn" | "fail";

export interface NativeRuntimeEncoderProbe {
  status: NativeRuntimeEncoderProbeStatus;
  checkedAt: number;
  videoBackend: string;
  audioBackend: string;
  videoCodecName: string;
  audioCodecName: string;
  videoMime: string;
  audioMime: string;
  videoConfigured: boolean;
  audioConfigured: boolean;
  videoColorFormat: string;
  videoBitrateMode: string;
  videoWidth: number;
  videoHeight: number;
  videoFps: number;
  audioSampleRate: number;
  audioChannelCount: number;
  message: string;
}

export interface NativeRuntimeAudioProcessing {
  micEffectsEnabled: boolean;
  micEffectsPresetId: string;
  micEffectsProcessedFrames: number;
  micEffectsProcessedSamples: number;
  micEffectsGatedSamples: number;
  micEffectsLimitedSamples: number;
  monitorEnabled: boolean;
  monitorRunning: boolean;
  monitorVolume: number;
  monitorHeadphonesOnly: boolean;
  monitorRoute: string;
  monitorOutputName: string;
  monitorHeadphonesConnected: boolean;
  monitorWrittenFrames: number;
  monitorDroppedFrames: number;
  monitorWrittenBuffers: number;
  monitorDroppedBuffers: number;
  monitorEstimatedLatencyMs: number;
  monitorLatencySource: string;
  monitorLastError: string;
  broadcastMicVolume?: number;
  broadcastMicMuted?: boolean;
  broadcastAppAudioVolume?: number;
  broadcastAppAudioMuted?: boolean;
  broadcastChatReadoutVolume?: number;
  broadcastChatReadoutMuted?: boolean;
  micRmsLevel?: number;
  micPeakLevel?: number;
  micSampleCount?: number;
  micClippedSampleCount?: number;
  micLevelUpdatedAt?: number;
  appAudioRmsLevel?: number;
  appAudioPeakLevel?: number;
  appAudioSampleCount?: number;
  appAudioClippedSampleCount?: number;
  appAudioLevelUpdatedAt?: number;
  mixedAudioRmsLevel?: number;
  mixedAudioPeakLevel?: number;
  mixedAudioSampleCount?: number;
  mixedAudioClippedSampleCount?: number;
  mixedAudioLevelUpdatedAt?: number;
  playbackCaptureStatus?: string;
  playbackCaptureBackend?: string;
  playbackCaptureSampleRate?: number;
  playbackCapturedFrames?: number;
  playbackDroppedFrames?: number;
  playbackUnderrunFrames?: number;
  playbackBufferedFrames?: number;
  playbackCaptureTelemetryComplete?: boolean;
}

export const androidPlaybackCaptureBackend = "android-audio-playback-capture";
export const androidPlaybackCaptureMinimumDurationSeconds = 2;
export const androidPlaybackCaptureMaximumDropRatio = 0.01;
export const androidPlaybackCaptureMaximumUnderrunRatio = 0.05;
export const androidPlaybackCaptureMaximumBufferedMs = 100;

export interface AndroidPlaybackCaptureAssessment {
  ready: boolean;
  telemetryComplete: boolean;
  durationSeconds: number;
  dropRatio: number;
  underrunRatio: number;
  bufferedMs: number;
}

export const assessAndroidPlaybackCapture = (
  audio: Pick<
    NativeRuntimeAudioProcessing,
    | "playbackCaptureStatus"
    | "playbackCaptureBackend"
    | "playbackCaptureSampleRate"
    | "playbackCapturedFrames"
    | "playbackDroppedFrames"
    | "playbackUnderrunFrames"
    | "playbackBufferedFrames"
    | "playbackCaptureTelemetryComplete"
  > | null | undefined
): AndroidPlaybackCaptureAssessment => {
  const sampleRate = normalizeNativeAudioCount(audio?.playbackCaptureSampleRate);
  const capturedFrames = normalizeNativeAudioCount(audio?.playbackCapturedFrames);
  const droppedFrames = normalizeNativeAudioCount(audio?.playbackDroppedFrames);
  const underrunFrames = normalizeNativeAudioCount(audio?.playbackUnderrunFrames);
  const bufferedFrames = normalizeNativeAudioCount(audio?.playbackBufferedFrames);
  const durationSeconds = sampleRate > 0 ? capturedFrames / sampleRate : 0;
  const dropRatio = capturedFrames > 0 ? droppedFrames / capturedFrames : 1;
  const deliveredFrames = Math.max(0, capturedFrames - droppedFrames - bufferedFrames);
  const underrunDenominator = deliveredFrames + underrunFrames;
  const underrunRatio = underrunDenominator > 0 ? underrunFrames / underrunDenominator : 1;
  const bufferedMs = sampleRate > 0 ? bufferedFrames * 1_000 / sampleRate : Number.POSITIVE_INFINITY;
  const validCounters =
    isPositiveInteger(audio?.playbackCaptureSampleRate) &&
    isPositiveInteger(audio?.playbackCapturedFrames) &&
    isNonNegativeInteger(audio?.playbackDroppedFrames) &&
    isNonNegativeInteger(audio?.playbackUnderrunFrames) &&
    isNonNegativeInteger(audio?.playbackBufferedFrames) &&
    audio?.playbackCaptureTelemetryComplete !== false;
  return {
    ready:
      (audio?.playbackCaptureStatus === "capturing" || audio?.playbackCaptureStatus === "stopped") &&
      audio?.playbackCaptureBackend === androidPlaybackCaptureBackend &&
      validCounters &&
      durationSeconds >= androidPlaybackCaptureMinimumDurationSeconds &&
      dropRatio <= androidPlaybackCaptureMaximumDropRatio &&
      underrunRatio <= androidPlaybackCaptureMaximumUnderrunRatio &&
      bufferedMs <= androidPlaybackCaptureMaximumBufferedMs,
    telemetryComplete: validCounters,
    durationSeconds,
    dropRatio,
    underrunRatio,
    bufferedMs
  };
};

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;

export type NativeRuntimeContinuityStatus =
  | "unknown"
  | "inactive"
  | "warming-up"
  | "healthy"
  | "video-stalled"
  | "audio-stalled"
  | "both-stalled";

export interface NativeRuntimeContinuity {
  status: NativeRuntimeContinuityStatus;
  videoStalled: boolean;
  audioStalled: boolean;
  videoLastAdvancedAt: number;
  audioLastAdvancedAt: number;
  videoStallDurationMs: number;
  audioStallDurationMs: number;
  videoStallCount: number;
  audioStallCount: number;
  maxVideoStallDurationMs: number;
  maxAudioStallDurationMs: number;
  stallThresholdMs: number;
}

export const normalizeNativeRuntimeContinuity = (
  continuity: Partial<NativeRuntimeContinuity> | null | undefined
): NativeRuntimeContinuity => {
  const reportedStatus = continuity?.status;
  const videoStalled =
    continuity?.videoStalled === true || reportedStatus === "video-stalled" || reportedStatus === "both-stalled";
  const audioStalled =
    continuity?.audioStalled === true || reportedStatus === "audio-stalled" || reportedStatus === "both-stalled";
  const status: NativeRuntimeContinuityStatus =
    videoStalled && audioStalled
      ? "both-stalled"
      : videoStalled
        ? "video-stalled"
        : audioStalled
          ? "audio-stalled"
          : reportedStatus === "inactive" || reportedStatus === "warming-up" || reportedStatus === "healthy"
            ? reportedStatus
            : "unknown";

  return {
    status,
    videoStalled,
    audioStalled,
    videoLastAdvancedAt: normalizeNativeAudioTimestamp(continuity?.videoLastAdvancedAt),
    audioLastAdvancedAt: normalizeNativeAudioTimestamp(continuity?.audioLastAdvancedAt),
    videoStallDurationMs: normalizeNativeAudioCount(continuity?.videoStallDurationMs),
    audioStallDurationMs: normalizeNativeAudioCount(continuity?.audioStallDurationMs),
    videoStallCount: normalizeNativeAudioCount(continuity?.videoStallCount),
    audioStallCount: normalizeNativeAudioCount(continuity?.audioStallCount),
    maxVideoStallDurationMs: normalizeNativeAudioCount(continuity?.maxVideoStallDurationMs),
    maxAudioStallDurationMs: normalizeNativeAudioCount(continuity?.maxAudioStallDurationMs),
    stallThresholdMs: Math.max(1_000, normalizeNativeAudioCount(continuity?.stallThresholdMs) || 5_000)
  };
};

export type NativeRuntimeAvSyncStatus =
  | "unknown"
  | "warming-up"
  | "in-sync"
  | "video-leading"
  | "audio-leading";

export interface NativeRuntimeAvSync {
  status: NativeRuntimeAvSyncStatus;
  latestVideoTimestampMs: number;
  latestAudioTimestampMs: number;
  skewMs: number;
  maxAbsSkewMs: number;
  sampleCount: number;
  outOfSyncSampleCount: number;
  outOfSyncIncidentCount: number;
  criticalIncidentCount: number;
  consecutiveOutOfSyncSamples: number;
  maxConsecutiveOutOfSyncSamples: number;
  warningThresholdMs: number;
  criticalThresholdMs: number;
  critical: boolean;
}

const nativeRuntimeAvSyncStatuses = new Set<NativeRuntimeAvSyncStatus>([
  "unknown",
  "warming-up",
  "in-sync",
  "video-leading",
  "audio-leading"
]);

export const normalizeNativeRuntimeAvSync = (
  avSync: Partial<NativeRuntimeAvSync> | null | undefined
): NativeRuntimeAvSync => {
  const warningThresholdMs = Math.max(1, normalizeNativeAudioCount(avSync?.warningThresholdMs) || 150);
  const criticalThresholdMs = Math.max(
    warningThresholdMs,
    normalizeNativeAudioCount(avSync?.criticalThresholdMs) || 500
  );
  const latestVideoTimestampMs = normalizeNativeAudioTimestamp(avSync?.latestVideoTimestampMs);
  const latestAudioTimestampMs = normalizeNativeAudioTimestamp(avSync?.latestAudioTimestampMs);
  const sampleCount = normalizeNativeAudioCount(avSync?.sampleCount);
  const skewMs = Math.round(normalizeFiniteNumber(avSync?.skewMs, 0));
  const absSkewMs = Math.abs(skewMs);
  const reportedStatus = nativeRuntimeAvSyncStatuses.has(avSync?.status as NativeRuntimeAvSyncStatus)
    ? (avSync?.status as NativeRuntimeAvSyncStatus)
    : "unknown";
  const status: NativeRuntimeAvSyncStatus =
    reportedStatus !== "unknown"
      ? reportedStatus
      : sampleCount <= 0
        ? avSync
          ? "warming-up"
          : "unknown"
        : absSkewMs <= warningThresholdMs
          ? "in-sync"
          : skewMs > 0
            ? "video-leading"
            : "audio-leading";
  const consecutiveOutOfSyncSamples = normalizeNativeAudioCount(avSync?.consecutiveOutOfSyncSamples);

  return {
    status,
    latestVideoTimestampMs,
    latestAudioTimestampMs,
    skewMs,
    maxAbsSkewMs: Math.max(absSkewMs, normalizeNativeAudioCount(avSync?.maxAbsSkewMs)),
    sampleCount,
    outOfSyncSampleCount: Math.min(sampleCount, normalizeNativeAudioCount(avSync?.outOfSyncSampleCount)),
    outOfSyncIncidentCount: normalizeNativeAudioCount(avSync?.outOfSyncIncidentCount),
    criticalIncidentCount: normalizeNativeAudioCount(avSync?.criticalIncidentCount),
    consecutiveOutOfSyncSamples,
    maxConsecutiveOutOfSyncSamples: Math.max(
      consecutiveOutOfSyncSamples,
      normalizeNativeAudioCount(avSync?.maxConsecutiveOutOfSyncSamples)
    ),
    warningThresholdMs,
    criticalThresholdMs,
    critical:
      avSync?.critical === true ||
      (absSkewMs >= criticalThresholdMs && consecutiveOutOfSyncSamples >= 3)
  };
};

export const normalizeNativeRuntimeAudioProcessing = (
  audioProcessing: Partial<NativeRuntimeAudioProcessing> | null | undefined
): NativeRuntimeAudioProcessing => ({
  micEffectsEnabled: audioProcessing?.micEffectsEnabled ?? false,
  micEffectsPresetId: audioProcessing?.micEffectsPresetId ?? "clean",
  micEffectsProcessedFrames: normalizeNativeAudioCount(audioProcessing?.micEffectsProcessedFrames),
  micEffectsProcessedSamples: normalizeNativeAudioCount(audioProcessing?.micEffectsProcessedSamples),
  micEffectsGatedSamples: normalizeNativeAudioCount(audioProcessing?.micEffectsGatedSamples),
  micEffectsLimitedSamples: normalizeNativeAudioCount(audioProcessing?.micEffectsLimitedSamples),
  monitorEnabled: audioProcessing?.monitorEnabled ?? false,
  monitorRunning: audioProcessing?.monitorRunning ?? false,
  monitorVolume: normalizeNativeAudioLevel(audioProcessing?.monitorVolume),
  monitorHeadphonesOnly: audioProcessing?.monitorHeadphonesOnly ?? true,
  monitorRoute: audioProcessing?.monitorRoute ?? "unknown",
  monitorOutputName: audioProcessing?.monitorOutputName ?? "Unknown",
  monitorHeadphonesConnected: audioProcessing?.monitorHeadphonesConnected ?? false,
  monitorWrittenFrames: normalizeNativeAudioCount(audioProcessing?.monitorWrittenFrames),
  monitorDroppedFrames: normalizeNativeAudioCount(audioProcessing?.monitorDroppedFrames),
  monitorWrittenBuffers: normalizeNativeAudioCount(audioProcessing?.monitorWrittenBuffers),
  monitorDroppedBuffers: normalizeNativeAudioCount(audioProcessing?.monitorDroppedBuffers),
  monitorEstimatedLatencyMs: normalizeNativeAudioCount(audioProcessing?.monitorEstimatedLatencyMs),
  monitorLatencySource: audioProcessing?.monitorLatencySource ?? "",
  monitorLastError: audioProcessing?.monitorLastError ?? "",
  broadcastMicVolume: normalizeNativeAudioLevel(audioProcessing?.broadcastMicVolume, 1),
  broadcastMicMuted: audioProcessing?.broadcastMicMuted ?? false,
  broadcastAppAudioVolume: normalizeNativeAudioLevel(audioProcessing?.broadcastAppAudioVolume, 0.85),
  broadcastAppAudioMuted: audioProcessing?.broadcastAppAudioMuted ?? false,
  broadcastChatReadoutVolume: normalizeNativeAudioLevel(audioProcessing?.broadcastChatReadoutVolume, 0.85),
  broadcastChatReadoutMuted: audioProcessing?.broadcastChatReadoutMuted ?? false,
  micRmsLevel: normalizeNativeAudioLevel(audioProcessing?.micRmsLevel),
  micPeakLevel: normalizeNativeAudioLevel(audioProcessing?.micPeakLevel),
  micSampleCount: normalizeNativeAudioCount(audioProcessing?.micSampleCount),
  micClippedSampleCount: normalizeNativeAudioCount(audioProcessing?.micClippedSampleCount),
  micLevelUpdatedAt: normalizeNativeAudioTimestamp(audioProcessing?.micLevelUpdatedAt),
  appAudioRmsLevel: normalizeNativeAudioLevel(audioProcessing?.appAudioRmsLevel),
  appAudioPeakLevel: normalizeNativeAudioLevel(audioProcessing?.appAudioPeakLevel),
  appAudioSampleCount: normalizeNativeAudioCount(audioProcessing?.appAudioSampleCount),
  appAudioClippedSampleCount: normalizeNativeAudioCount(audioProcessing?.appAudioClippedSampleCount),
  appAudioLevelUpdatedAt: normalizeNativeAudioTimestamp(audioProcessing?.appAudioLevelUpdatedAt),
  mixedAudioRmsLevel: normalizeNativeAudioLevel(audioProcessing?.mixedAudioRmsLevel),
  mixedAudioPeakLevel: normalizeNativeAudioLevel(audioProcessing?.mixedAudioPeakLevel),
  mixedAudioSampleCount: normalizeNativeAudioCount(audioProcessing?.mixedAudioSampleCount),
  mixedAudioClippedSampleCount: normalizeNativeAudioCount(audioProcessing?.mixedAudioClippedSampleCount),
  mixedAudioLevelUpdatedAt: normalizeNativeAudioTimestamp(audioProcessing?.mixedAudioLevelUpdatedAt),
  playbackCaptureStatus: audioProcessing?.playbackCaptureStatus ?? "unavailable",
  playbackCaptureBackend: audioProcessing?.playbackCaptureBackend ?? "none",
  playbackCaptureSampleRate: normalizeNativeAudioCount(audioProcessing?.playbackCaptureSampleRate),
  playbackCapturedFrames: normalizeNativeAudioCount(audioProcessing?.playbackCapturedFrames),
  playbackDroppedFrames: normalizeNativeAudioCount(audioProcessing?.playbackDroppedFrames),
  playbackUnderrunFrames: normalizeNativeAudioCount(audioProcessing?.playbackUnderrunFrames),
  playbackBufferedFrames: normalizeNativeAudioCount(audioProcessing?.playbackBufferedFrames),
  playbackCaptureTelemetryComplete:
    isPositiveInteger(audioProcessing?.playbackCaptureSampleRate) &&
    isPositiveInteger(audioProcessing?.playbackCapturedFrames) &&
    isNonNegativeInteger(audioProcessing?.playbackDroppedFrames) &&
    isNonNegativeInteger(audioProcessing?.playbackUnderrunFrames) &&
    isNonNegativeInteger(audioProcessing?.playbackBufferedFrames)
});

const normalizeNativeAudioLevel = (value: unknown, fallback = 0): number =>
  Math.min(1, Math.max(0, normalizeFiniteNumber(value, fallback)));

const normalizeNativeAudioCount = (value: unknown): number =>
  Math.max(0, Math.round(normalizeFiniteNumber(value, 0)));

const normalizeNativeAudioTimestamp = (value: unknown): number =>
  Math.max(0, Math.round(normalizeFiniteNumber(value, 0)));

export interface NativeRuntimeTelemetry {
  platform: NativeRuntimePlatform;
  runtimeStatus: string;
  updatedAt: number;
  stale: boolean;
  elapsedSeconds: number;
  videoFrames: number;
  encodedBytes: number;
  droppedFrames: number;
  publisher: NativeRuntimePublisher;
  encoderProbe?: NativeRuntimeEncoderProbe | null;
  device?: NativeRuntimeDevice;
  composition: NativeRuntimeComposition;
  audioProcessing?: NativeRuntimeAudioProcessing;
  continuity?: NativeRuntimeContinuity;
  avSync?: NativeRuntimeAvSync;
  message: string;
}
