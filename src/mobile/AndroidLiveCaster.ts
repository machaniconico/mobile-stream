import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import type { SceneDocument } from "../domain/scene";
import { toRenderGraph } from "../domain/scene";
import type { StudioProfile } from "../domain/profiles";
import type { LiveCasterNative, NativeEngineSnapshot } from "../native/LiveCasterNative";
import { initialStreamState } from "../domain/streamState";

interface AndroidLiveCasterModule {
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

const nativeModule = NativeModules.LiveCasterNative as AndroidLiveCasterModule | undefined;

export const canUseAndroidLiveCaster = (): boolean => Platform.OS === "android" && Boolean(nativeModule);

export class AndroidLiveCaster implements LiveCasterNative {
  private listeners = new Set<Listener>();
  private eventEmitter = nativeModule ? new NativeEventEmitter(nativeModule as never) : null;
  private eventSubscription: { remove(): void } | undefined;
  private snapshot: NativeEngineSnapshot = {
    platform: "android",
    state: initialStreamState,
    health: initialStreamState.health
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
    startedAt: snapshot.state.startedAt || null
  },
  health: snapshot.health
});
