import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import type { RenderGraphRuntime, SceneDocument } from "../domain/scene";
import { toRenderGraph } from "../domain/scene";
import type { StudioProfile } from "../domain/profiles";
import {
  normalizeNativeRuntimeAudioProcessing,
  normalizeNativeRuntimeAvSync,
  normalizeNativeRuntimeBitrateAdaptation,
  normalizeNativeRuntimeContinuity,
  normalizeNativeRuntimeDevice
} from "../domain/nativeRuntime";
import type { LiveCasterNative, NativeEngineSnapshot, NativeRuntimeTelemetry } from "../native/LiveCasterNative";
import { initialStreamState, type StreamHealth } from "../domain/streamState";

interface AndroidLiveCasterModule {
  getSnapshot(): Promise<NativeEngineSnapshot>;
  ensurePermissions(): Promise<AndroidStartPermissionReport>;
  prepare(renderGraphJson: string, profileJson: string): Promise<NativeEngineSnapshot>;
  start(): Promise<NativeEngineSnapshot>;
  stop(): Promise<NativeEngineSnapshot>;
  reconnect(): Promise<NativeEngineSnapshot>;
  updateScene(renderGraphJson: string): Promise<NativeEngineSnapshot>;
  updateQuality(profileJson: string): Promise<NativeEngineSnapshot>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

type Listener = (snapshot: NativeEngineSnapshot) => void;

interface AndroidStartPermissionReport {
  granted: boolean;
  missing: string[];
  message: string;
}

const nativeModule = NativeModules.LiveCasterNative as AndroidLiveCasterModule | undefined;

export const canUseAndroidLiveCaster = (): boolean => Platform.OS === "android" && Boolean(nativeModule);

export class AndroidLiveCaster implements LiveCasterNative {
  private listeners = new Set<Listener>();
  private eventEmitter = nativeModule ? new NativeEventEmitter(nativeModule as never) : null;
  private eventSubscription: { remove(): void } | undefined;
  private snapshot: NativeEngineSnapshot = {
    platform: "android",
    state: initialStreamState,
    health: initialStreamState.health,
    nativeRuntime: null
  };

  getSnapshot(): NativeEngineSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.ensureEventSubscription();
    this.listeners.add(listener);
    listener(this.snapshot);
    void this.refreshSnapshot();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.eventSubscription?.remove();
        this.eventSubscription = undefined;
      }
    };
  }

  async prepare(scene: SceneDocument, profile: StudioProfile, runtime?: RenderGraphRuntime): Promise<void> {
    const module = requireNativeModule();
    this.snapshot = normalizeSnapshot(await module.prepare(JSON.stringify(toRenderGraph(scene, runtime)), JSON.stringify(profile)));
    this.emit();
  }

  async start(): Promise<void> {
    const module = requireNativeModule();
    const permissionReport = await module.ensurePermissions();
    if (!permissionReport.granted) {
      throw new Error(permissionReport.message || `Missing Android permissions: ${permissionReport.missing.join(", ")}`);
    }
    this.snapshot = normalizeSnapshot(await module.start());
    this.emit();
  }

  async stop(): Promise<void> {
    const module = requireNativeModule();
    this.snapshot = normalizeSnapshot(await module.stop());
    this.emit();
  }

  async reconnect(): Promise<void> {
    const module = requireNativeModule();
    this.snapshot = normalizeSnapshot(await module.reconnect());
    this.emit();
  }

  async updateScene(scene: SceneDocument, runtime?: RenderGraphRuntime): Promise<void> {
    const module = requireNativeModule();
    this.snapshot = normalizeSnapshot(await module.updateScene(JSON.stringify(toRenderGraph(scene, runtime))));
    this.emit();
  }

  async updateQuality(profile: StudioProfile): Promise<void> {
    const module = requireNativeModule();
    this.snapshot = normalizeSnapshot(await module.updateQuality(JSON.stringify(profile)));
    this.emit();
  }

  private async refreshSnapshot() {
    if (!nativeModule) {
      return;
    }
    this.snapshot = normalizeSnapshot(await nativeModule.getSnapshot());
    this.emit();
  }

  private ensureEventSubscription() {
    if (this.eventSubscription || !this.eventEmitter) {
      return;
    }
    this.eventSubscription = this.eventEmitter.addListener("LiveCasterSnapshot", (snapshot: NativeEngineSnapshot) => {
      this.snapshot = normalizeSnapshot(snapshot);
      this.emit();
    });
  }

  private emit() {
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}

const requireNativeModule = (): AndroidLiveCasterModule => {
  if (!nativeModule) {
    throw new Error("LiveCasterNative Android module is not linked");
  }
  return nativeModule;
};

const normalizeSnapshot = (snapshot: NativeEngineSnapshot): NativeEngineSnapshot => ({
  ...snapshot,
  platform: "android",
  state: {
    ...snapshot.state,
    startedAt: snapshot.state.startedAt || null,
    health: normalizeHealth(snapshot.state.health)
  },
  health: normalizeHealth(snapshot.health),
  nativeRuntime: normalizeNativeRuntime(snapshot.nativeRuntime, "android")
});

const normalizeHealth = (health: Partial<StreamHealth> | undefined): StreamHealth => ({
  ...initialStreamState.health,
  ...health,
  reconnectAttempts: health?.reconnectAttempts ?? 0
});

const normalizeNativeRuntime = (
  runtime: Partial<NativeRuntimeTelemetry> | null | undefined,
  platform: "ios" | "android"
): NativeRuntimeTelemetry | null =>
  runtime
    ? {
        platform,
        runtimeStatus: runtime.runtimeStatus ?? "unknown",
        updatedAt: runtime.updatedAt ?? 0,
        stale: runtime.stale ?? false,
        elapsedSeconds: runtime.elapsedSeconds ?? 0,
        videoFrames: runtime.videoFrames ?? 0,
        encodedBytes: runtime.encodedBytes ?? 0,
        droppedFrames: runtime.droppedFrames ?? 0,
        device: normalizeNativeRuntimeDevice(runtime.device),
        publisher: {
          state: runtime.publisher?.state ?? "",
          publishGeneration: runtime.publisher?.publishGeneration ?? 0,
          currentPublishVideoFrames: runtime.publisher?.currentPublishVideoFrames ?? 0,
          currentPublishAudioFrames: runtime.publisher?.currentPublishAudioFrames ?? 0,
          videoEncoderBackend: runtime.publisher?.videoEncoderBackend ?? "",
          audioEncoderBackend: runtime.publisher?.audioEncoderBackend ?? "",
          reconnectAttempts: runtime.publisher?.reconnectAttempts ?? 0,
          sentVideoFrames: runtime.publisher?.sentVideoFrames ?? 0,
          sentAudioFrames: runtime.publisher?.sentAudioFrames ?? 0,
          droppedVideoFrames: runtime.publisher?.droppedVideoFrames ?? 0,
          droppedAudioFrames: runtime.publisher?.droppedAudioFrames ?? 0,
          bytesWritten: runtime.publisher?.bytesWritten ?? 0,
          videoFrameIntervalSampleCount: runtime.publisher?.videoFrameIntervalSampleCount ?? 0,
          videoFrameIntervalAverageMs: runtime.publisher?.videoFrameIntervalAverageMs ?? 0,
          videoFrameIntervalMaxMs: runtime.publisher?.videoFrameIntervalMaxMs ?? 0,
          videoFrameIntervalJitterMs: runtime.publisher?.videoFrameIntervalJitterMs ?? 0,
          cacheSize: runtime.publisher?.cacheSize ?? 0,
          itemsInCache: runtime.publisher?.itemsInCache ?? 0,
          congested: runtime.publisher?.congested ?? false,
          bitrateAdaptation: normalizeNativeRuntimeBitrateAdaptation(runtime.publisher?.bitrateAdaptation),
          lastError: runtime.publisher?.lastError ?? ""
        },
        encoderProbe: normalizeEncoderProbe(runtime.encoderProbe),
        lastActiveEncoderProbe: normalizeEncoderProbe(runtime.lastActiveEncoderProbe),
        composition: {
          status: runtime.composition?.status ?? "unknown",
          appliedCount: runtime.composition?.appliedCount ?? 0,
          appliedKinds: runtime.composition?.appliedKinds ?? [],
          skippedCount: runtime.composition?.skippedCount ?? 0,
          skippedKinds: runtime.composition?.skippedKinds ?? [],
          stillImageAssetCount: runtime.composition?.stillImageAssetCount ?? 0,
          stillImageAssetLoadedCount: runtime.composition?.stillImageAssetLoadedCount ?? 0,
          stillImageAssetMissingCount: runtime.composition?.stillImageAssetMissingCount ?? 0,
          stillImageAssetMissingKinds: runtime.composition?.stillImageAssetMissingKinds ?? [],
          stillImageAssetDecodedCount: runtime.composition?.stillImageAssetDecodedCount ?? 0,
          stillImageAssetDecodedPixelCount: runtime.composition?.stillImageAssetDecodedPixelCount ?? 0,
          stillImageAssetCompositedCount: runtime.composition?.stillImageAssetCompositedCount ?? 0,
          stillImageAssetCompositedPixelCount: runtime.composition?.stillImageAssetCompositedPixelCount ?? 0,
          runtimeCompositorBackend: runtime.composition?.runtimeCompositorBackend ?? "none",
          runtimeCompositedFrameCount: runtime.composition?.runtimeCompositedFrameCount ?? 0,
          runtimeDroppedFrameCount: runtime.composition?.runtimeDroppedFrameCount ?? 0,
          runtimeCompositionFailureCount: runtime.composition?.runtimeCompositionFailureCount ?? 0,
          stillImageAssetAppGroupCount: runtime.composition?.stillImageAssetAppGroupCount ?? 0,
          stillImageAssetAppGroupLoadedCount: runtime.composition?.stillImageAssetAppGroupLoadedCount ?? 0,
          stillImageAssetAppGroupDecodedCount: runtime.composition?.stillImageAssetAppGroupDecodedCount ?? 0,
          stillImageAssetAppGroupDecodedPixelCount: runtime.composition?.stillImageAssetAppGroupDecodedPixelCount ?? 0,
          stillImageAssetAppGroupCompositedCount: runtime.composition?.stillImageAssetAppGroupCompositedCount ?? 0,
          stillImageAssetAppGroupCompositedPixelCount: runtime.composition?.stillImageAssetAppGroupCompositedPixelCount ?? 0,
          live2dSourceCount: runtime.composition?.live2dSourceCount ?? 0,
          live2dPosePayloadCount: runtime.composition?.live2dPosePayloadCount ?? 0,
          live2dActivePoseCount: runtime.composition?.live2dActivePoseCount ?? 0,
          live2dMissingPoseCount: runtime.composition?.live2dMissingPoseCount ?? 0,
          live2dRuntimeStatuses: runtime.composition?.live2dRuntimeStatuses ?? [],
          vrmSourceCount: runtime.composition?.vrmSourceCount ?? 0,
          vrmPosePayloadCount: runtime.composition?.vrmPosePayloadCount ?? 0,
          vrmActivePoseCount: runtime.composition?.vrmActivePoseCount ?? 0,
          vrmMissingPoseCount: runtime.composition?.vrmMissingPoseCount ?? 0,
          vrmModelUriCount: runtime.composition?.vrmModelUriCount ?? 0,
          vrmModelVersions: runtime.composition?.vrmModelVersions ?? [],
          vrmHumanoidBoneCount: runtime.composition?.vrmHumanoidBoneCount ?? 0,
          vrmExpressionCount: runtime.composition?.vrmExpressionCount ?? 0,
          vrmMeshPrimitiveCount: runtime.composition?.vrmMeshPrimitiveCount ?? 0,
          vrmSkinnedMeshPrimitiveCount: runtime.composition?.vrmSkinnedMeshPrimitiveCount ?? 0,
          vrmSkinJointCount: runtime.composition?.vrmSkinJointCount ?? 0,
          vrmPositionAccessorCount: runtime.composition?.vrmPositionAccessorCount ?? 0,
          vrmVertexCount: runtime.composition?.vrmVertexCount ?? 0,
          vrmIndexCount: runtime.composition?.vrmIndexCount ?? 0,
          vrmBoundsAccessorCount: runtime.composition?.vrmBoundsAccessorCount ?? 0,
          vrmSkinningAttributePrimitiveCount: runtime.composition?.vrmSkinningAttributePrimitiveCount ?? 0,
          vrmTrianglePrimitiveCount: runtime.composition?.vrmTrianglePrimitiveCount ?? 0,
          vrmUnsupportedPrimitiveModeCount: runtime.composition?.vrmUnsupportedPrimitiveModeCount ?? 0,
          vrmNormalAccessorCount: runtime.composition?.vrmNormalAccessorCount ?? 0,
          vrmTexcoordAccessorCount: runtime.composition?.vrmTexcoordAccessorCount ?? 0,
          vrmMorphTargetCount: runtime.composition?.vrmMorphTargetCount ?? 0,
          vrmMaterialCount: runtime.composition?.vrmMaterialCount ?? 0,
          vrmTextureCount: runtime.composition?.vrmTextureCount ?? 0,
          vrmImageCount: runtime.composition?.vrmImageCount ?? 0,
          vrmUnsupportedImageMimeCount: runtime.composition?.vrmUnsupportedImageMimeCount ?? 0,
          vrmTransparentMaterialCount: runtime.composition?.vrmTransparentMaterialCount ?? 0,
          vrmPoseBoneCount: runtime.composition?.vrmPoseBoneCount ?? 0,
          vrmPoseBoneAppliedCount: runtime.composition?.vrmPoseBoneAppliedCount ?? 0,
          vrmPoseBoneUnsupportedCount: runtime.composition?.vrmPoseBoneUnsupportedCount ?? 0,
          vrmPoseExpressionCount: runtime.composition?.vrmPoseExpressionCount ?? 0,
          vrmPoseExpressionAppliedCount: runtime.composition?.vrmPoseExpressionAppliedCount ?? 0,
          vrmPoseExpressionUnsupportedCount: runtime.composition?.vrmPoseExpressionUnsupportedCount ?? 0,
          vrmRuntimeStatuses: runtime.composition?.vrmRuntimeStatuses ?? [],
          vrmRendererStatus:
            runtime.composition?.vrmRendererStatus ??
            ((runtime.composition?.vrmSourceCount ?? 0) > 0 ? "unavailable" : "not-required"),
          vrmRendererBackend: runtime.composition?.vrmRendererBackend ?? "none",
          vrmModelLoadedCount: runtime.composition?.vrmModelLoadedCount ?? 0,
          vrmRenderedSourceCount: runtime.composition?.vrmRenderedSourceCount ?? 0,
          vrmRenderMissingCount: runtime.composition?.vrmRenderMissingCount ?? 0,
          vrmRenderFailureCount: runtime.composition?.vrmRenderFailureCount ?? 0,
          message: runtime.composition?.message ?? ""
        },
        audioProcessing: normalizeNativeRuntimeAudioProcessing(runtime.audioProcessing),
        continuity: normalizeNativeRuntimeContinuity(runtime.continuity),
        avSync: normalizeNativeRuntimeAvSync(runtime.avSync),
        message: runtime.message ?? ""
      }
    : null;

type NativeRuntimeEncoderProbe = NonNullable<NativeRuntimeTelemetry["encoderProbe"]>;

const normalizeEncoderProbe = (
  encoderProbe: Partial<NativeRuntimeEncoderProbe> | null | undefined
): NativeRuntimeEncoderProbe | null =>
  encoderProbe
    ? {
        status:
          encoderProbe.status === "pass" || encoderProbe.status === "warn" || encoderProbe.status === "fail"
            ? encoderProbe.status
            : "unknown",
        checkedAt: encoderProbe.checkedAt ?? 0,
        activeEncoderInstancesVerified: encoderProbe.activeEncoderInstancesVerified ?? false,
        videoEncodedOutputCount: encoderProbe.videoEncodedOutputCount ?? 0,
        audioEncodedOutputCount: encoderProbe.audioEncodedOutputCount ?? 0,
        videoBackend: encoderProbe.videoBackend ?? "none",
        audioBackend: encoderProbe.audioBackend ?? "none",
        videoCodecName: encoderProbe.videoCodecName ?? "",
        audioCodecName: encoderProbe.audioCodecName ?? "",
        videoMime: encoderProbe.videoMime ?? "",
        audioMime: encoderProbe.audioMime ?? "",
        videoConfigured: encoderProbe.videoConfigured ?? false,
        audioConfigured: encoderProbe.audioConfigured ?? false,
        videoColorFormat: encoderProbe.videoColorFormat ?? "",
        videoBitrateMode: encoderProbe.videoBitrateMode ?? "",
        videoWidth: encoderProbe.videoWidth ?? 0,
        videoHeight: encoderProbe.videoHeight ?? 0,
        videoFps: encoderProbe.videoFps ?? 0,
        audioSampleRate: encoderProbe.audioSampleRate ?? 0,
        audioChannelCount: encoderProbe.audioChannelCount ?? 0,
        message: encoderProbe.message ?? ""
      }
    : null;
