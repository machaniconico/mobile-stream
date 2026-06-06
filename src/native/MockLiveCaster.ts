import type { SceneDocument } from "../domain/scene";
import type { StudioProfile } from "../domain/profiles";
import type { LiveCasterNative, NativeEngineSnapshot } from "./LiveCasterNative";
import { initialStreamState, streamReducer, type StreamState } from "../domain/streamState";
import { createReadinessReport } from "../domain/readiness";

type Listener = (snapshot: NativeEngineSnapshot) => void;

export class MockLiveCaster implements LiveCasterNative {
  private state: StreamState = initialStreamState;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | undefined;
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
    const readiness = createReadinessReport(scene, profile);
    if (!readiness.canStart) {
      this.preparedScene = null;
      this.preparedProfile = null;
      this.reduce({ type: "fail", error: readiness.issues.find((issue) => issue.severity === "error")?.message ?? "Stream is not ready" });
      return;
    }

    this.preparedScene = scene;
    this.preparedProfile = readiness.sanitizedProfile;
    this.reduce({ type: "prepare", now: Date.now() });
  }

  async start(): Promise<void> {
    if (this.state.status === "failed") {
      return;
    }
    if (!this.preparedScene || !this.preparedProfile) {
      this.reduce({ type: "fail", error: "Scene or profile is missing" });
      return;
    }
    this.reduce({ type: "start", now: Date.now() });
    this.startHealthLoop();
  }

  async stop(): Promise<void> {
    this.reduce({ type: "stop", now: Date.now() });
    clearInterval(this.timer);
    this.timer = undefined;
    setTimeout(() => this.reduce({ type: "stopped" }), 450);
  }

  async reconnect(): Promise<void> {
    this.reduce({ type: "reconnect", now: Date.now() });
    setTimeout(() => this.reduce({ type: "start", now: Date.now() }), 900);
  }

  async updateScene(scene: SceneDocument): Promise<void> {
    this.preparedScene = scene;
  }

  private startHealthLoop() {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      const jitter = Math.round(Math.random() * 340 - 120);
      const dropChance = Math.random() > 0.82 ? 1 : 0;
      const targetBitrate = this.preparedProfile?.quality.videoBitrateKbps ?? 3500;
      this.reduce({
        type: "health",
        now: Date.now(),
        bitrateKbps: Math.max(900, targetBitrate + jitter),
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
