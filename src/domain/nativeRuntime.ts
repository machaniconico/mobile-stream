export type NativeRuntimeCompositionStatus = "unknown" | "screen-only" | "applied" | "pending" | "failed";
export type NativeRuntimePlatform = "ios" | "android";
export type NativeRuntimeThermalState = "unknown" | "nominal" | "fair" | "serious" | "critical";
export type NativeRuntimePowerSource = "unknown" | "battery" | "wired" | "wireless";

export interface NativeRuntimeDevice {
  thermalState: NativeRuntimeThermalState;
  thermalStatusCode: number;
  batteryLevelPercent: number;
  charging: boolean;
  lowPowerMode: boolean;
  powerSource: NativeRuntimePowerSource;
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
    sampledAt: Math.max(0, Math.round(normalizeFiniteNumber(device.sampledAt, 0)))
  };
};

const normalizeFiniteNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

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
}

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
  mixedAudioLevelUpdatedAt: normalizeNativeAudioTimestamp(audioProcessing?.mixedAudioLevelUpdatedAt)
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
