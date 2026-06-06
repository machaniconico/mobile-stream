import type { SceneDocument } from "../domain/scene";
import type { StudioProfile } from "../domain/profiles";
import type { LiveCasterNative, NativeEngineSnapshot } from "./LiveCasterNative";
import { initialStreamState, streamReducer, type StreamState } from "../domain/streamState";

type Listener = (snapshot: NativeEngineSnapshot) => void;

export class MockLiveCaster implements LiveCasterNative {
  private state: StreamState = initialStreamState;
  private listeners = new Set<Listener>();
  private timer: number | undefined;
  private preparedScene: SceneDocument | null = null;
  private preparedProfile: StudioProfile | null = null;

  getSnapshot(): NativeEngineSnapshot {
    return {
      state: this.state,
      platform: "mock",
      health: this.state.health
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  async prepare(scene: SceneDocument, profile: StudioProfile): Promise<void> {
    this.preparedScene = scene;
    this.preparedProfile = profile;
    this.reduce({ type: "prepare", now: Date.now() });
  }

  async start(): Promise<void> {
    if (!this.preparedScene || !this.preparedProfile) {
      this.reduce({ type: "fail", error: "Scene or profile is missing" });
      return;
    }
    this.reduce({ type: "start", now: Date.now() });
    this.startHealthLoop();
  }

  async stop(): Promise<void> {
    this.reduce({ type: "stop", now: Date.now() });
    window.clearInterval(this.timer);
    this.timer = undefined;
    window.setTimeout(() => this.reduce({ type: "stopped" }), 450);
  }

  async reconnect(): Promise<void> {
    this.reduce({ type: "reconnect", now: Date.now() });
    window.setTimeout(() => this.reduce({ type: "start", now: Date.now() }), 900);
  }

  async updateScene(scene: SceneDocument): Promise<void> {
    this.preparedScene = scene;
  }

  private startHealthLoop() {
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      const jitter = Math.round(Math.random() * 340 - 120);
      const dropChance = Math.random() > 0.82 ? 1 : 0;
      this.reduce({
        type: "health",
        now: Date.now(),
        bitrateKbps: Math.max(900, 3500 + jitter),
        droppedFrames: this.state.health.droppedFrames + dropChance,
        fps: this.preparedProfile?.quality.fps ?? 30,
        message: dropChance ? "Network jitter" : "Live"
      });
    }, 1000);
  }

  private reduce(event: Parameters<typeof streamReducer>[1]) {
    this.state = streamReducer(this.state, event);
    this.emit();
  }

  private emit() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
