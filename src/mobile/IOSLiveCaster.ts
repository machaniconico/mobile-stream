import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import type { RenderGraphRuntime, SceneDocument } from "../domain/scene";
import { toRenderGraph } from "../domain/scene";
import type { StudioProfile } from "../domain/profiles";
import { initialStreamState, type StreamHealth } from "../domain/streamState";
import type { LiveCasterNative, NativeEngineSnapshot, NativeRuntimeTelemetry } from "../native/LiveCasterNative";

interface IOSLiveCasterModule {
  getSnapshot(): Promise<NativeEngineSnapshot>;
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

const nativeModule = NativeModules.LiveCasterNative as IOSLiveCasterModule | undefined;

export const canUseIOSLiveCaster = (): boolean => Platform.OS === "ios" && Boolean(nativeModule);

export class IOSLiveCaster implements LiveCasterNative {
  private listeners = new Set<Listener>();
  private eventEmitter = nativeModule ? new NativeEventEmitter(nativeModule as never) : null;
  private eventSubscription: { remove(): void } | undefined;
  private snapshot: NativeEngineSnapshot = {
    platform: "ios",
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

const requireNativeModule = (): IOSLiveCasterModule => {
  if (!nativeModule) {
    throw new Error("LiveCasterNative iOS module is not linked");
  }
  return nativeModule;
};

const normalizeSnapshot = (snapshot: NativeEngineSnapshot): NativeEngineSnapshot => ({
  ...snapshot,
  platform: "ios",
  state: {
    ...snapshot.state,
    startedAt: snapshot.state.startedAt || null,
    health: normalizeHealth(snapshot.state.health)
  },
  health: normalizeHealth(snapshot.health),
  nativeRuntime: normalizeNativeRuntime(snapshot.nativeRuntime, "ios")
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
        publisher: {
          state: runtime.publisher?.state ?? "",
          reconnectAttempts: runtime.publisher?.reconnectAttempts ?? 0,
          sentVideoFrames: runtime.publisher?.sentVideoFrames ?? 0,
          sentAudioFrames: runtime.publisher?.sentAudioFrames ?? 0,
          droppedVideoFrames: runtime.publisher?.droppedVideoFrames ?? 0,
          droppedAudioFrames: runtime.publisher?.droppedAudioFrames ?? 0,
          bytesWritten: runtime.publisher?.bytesWritten ?? 0,
          cacheSize: runtime.publisher?.cacheSize ?? 0,
          itemsInCache: runtime.publisher?.itemsInCache ?? 0,
          congested: runtime.publisher?.congested ?? false,
          lastError: runtime.publisher?.lastError ?? ""
        },
        composition: {
          status: runtime.composition?.status ?? "unknown",
          appliedCount: runtime.composition?.appliedCount ?? 0,
          skippedCount: runtime.composition?.skippedCount ?? 0,
          skippedKinds: runtime.composition?.skippedKinds ?? [],
          stillImageAssetCount: runtime.composition?.stillImageAssetCount ?? 0,
          stillImageAssetLoadedCount: runtime.composition?.stillImageAssetLoadedCount ?? 0,
          stillImageAssetMissingCount: runtime.composition?.stillImageAssetMissingCount ?? 0,
          stillImageAssetMissingKinds: runtime.composition?.stillImageAssetMissingKinds ?? [],
          vrmSourceCount: runtime.composition?.vrmSourceCount ?? 0,
          vrmPosePayloadCount: runtime.composition?.vrmPosePayloadCount ?? 0,
          vrmActivePoseCount: runtime.composition?.vrmActivePoseCount ?? 0,
          vrmMissingPoseCount: runtime.composition?.vrmMissingPoseCount ?? 0,
          vrmModelUriCount: runtime.composition?.vrmModelUriCount ?? 0,
          vrmModelVersions: runtime.composition?.vrmModelVersions ?? [],
          vrmHumanoidBoneCount: runtime.composition?.vrmHumanoidBoneCount ?? 0,
          vrmExpressionCount: runtime.composition?.vrmExpressionCount ?? 0,
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
        audioProcessing: {
          micEffectsEnabled: runtime.audioProcessing?.micEffectsEnabled ?? false,
          micEffectsPresetId: runtime.audioProcessing?.micEffectsPresetId ?? "clean",
          micEffectsProcessedFrames: runtime.audioProcessing?.micEffectsProcessedFrames ?? 0,
          micEffectsProcessedSamples: runtime.audioProcessing?.micEffectsProcessedSamples ?? 0,
          micEffectsGatedSamples: runtime.audioProcessing?.micEffectsGatedSamples ?? 0,
          micEffectsLimitedSamples: runtime.audioProcessing?.micEffectsLimitedSamples ?? 0,
          monitorEnabled: runtime.audioProcessing?.monitorEnabled ?? false,
          monitorRunning: runtime.audioProcessing?.monitorRunning ?? false,
          monitorVolume: runtime.audioProcessing?.monitorVolume ?? 0,
          monitorHeadphonesOnly: runtime.audioProcessing?.monitorHeadphonesOnly ?? true,
          monitorRoute: runtime.audioProcessing?.monitorRoute ?? "unknown",
          monitorOutputName: runtime.audioProcessing?.monitorOutputName ?? "Unknown",
          monitorHeadphonesConnected: runtime.audioProcessing?.monitorHeadphonesConnected ?? false,
          monitorWrittenFrames: runtime.audioProcessing?.monitorWrittenFrames ?? 0,
          monitorDroppedFrames: runtime.audioProcessing?.monitorDroppedFrames ?? 0,
          monitorWrittenBuffers: runtime.audioProcessing?.monitorWrittenBuffers ?? 0,
          monitorDroppedBuffers: runtime.audioProcessing?.monitorDroppedBuffers ?? 0,
          monitorEstimatedLatencyMs: runtime.audioProcessing?.monitorEstimatedLatencyMs ?? 0,
          monitorLatencySource: runtime.audioProcessing?.monitorLatencySource ?? "",
          monitorLastError: runtime.audioProcessing?.monitorLastError ?? "",
          broadcastMicVolume: runtime.audioProcessing?.broadcastMicVolume ?? 1,
          broadcastMicMuted: runtime.audioProcessing?.broadcastMicMuted ?? false,
          broadcastAppAudioVolume: runtime.audioProcessing?.broadcastAppAudioVolume ?? 0.85,
          broadcastAppAudioMuted: runtime.audioProcessing?.broadcastAppAudioMuted ?? false,
          broadcastChatReadoutVolume: runtime.audioProcessing?.broadcastChatReadoutVolume ?? 0.85,
          broadcastChatReadoutMuted: runtime.audioProcessing?.broadcastChatReadoutMuted ?? false
        },
        message: runtime.message ?? ""
      }
    : null;
