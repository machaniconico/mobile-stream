export type NativeRuntimeCompositionStatus = "unknown" | "screen-only" | "applied" | "pending" | "failed";
export type NativeRuntimePlatform = "ios" | "android";

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
}

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
  composition: NativeRuntimeComposition;
  audioProcessing?: NativeRuntimeAudioProcessing;
  message: string;
}
