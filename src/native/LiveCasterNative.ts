import type { SceneDocument } from "../domain/scene";
import type { StudioProfile } from "../domain/profiles";
import type { StreamHealth, StreamState } from "../domain/streamState";
import type { NativeRuntimeTelemetry } from "../domain/nativeRuntime";
export type { NativeRuntimeTelemetry } from "../domain/nativeRuntime";

export interface NativeEngineSnapshot {
  state: StreamState;
  platform: "mock" | "ios" | "android";
  health: StreamHealth;
  nativeRuntime?: NativeRuntimeTelemetry | null;
}

export interface LiveCasterNative {
  getSnapshot(): NativeEngineSnapshot;
  subscribe(listener: (snapshot: NativeEngineSnapshot) => void): () => void;
  prepare(scene: SceneDocument, profile: StudioProfile): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  reconnect(): Promise<void>;
  updateScene(scene: SceneDocument): Promise<void>;
  updateQuality(profile: StudioProfile): Promise<void>;
}

export class NativeNotLinkedError extends Error {
  constructor(method: string) {
    super(`LiveCaster native module is not linked: ${method}`);
    this.name = "NativeNotLinkedError";
  }
}
