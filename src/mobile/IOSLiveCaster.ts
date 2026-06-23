import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import type { SceneDocument } from "../domain/scene";
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

  async prepare(scene: SceneDocument, profile: StudioProfile): Promise<void> {
    const module = requireNativeModule();
    this.snapshot = normalizeSnapshot(await module.prepare(JSON.stringify(toRenderGraph(scene)), JSON.stringify(profile)));
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

  async updateScene(scene: SceneDocument): Promise<void> {
    const module = requireNativeModule();
    this.snapshot = normalizeSnapshot(await module.updateScene(JSON.stringify(toRenderGraph(scene))));
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
          message: runtime.composition?.message ?? ""
        },
        message: runtime.message ?? ""
      }
    : null;
