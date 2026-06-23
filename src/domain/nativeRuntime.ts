export type NativeRuntimeCompositionStatus = "unknown" | "screen-only" | "applied" | "pending" | "failed";

export interface NativeRuntimeComposition {
  status: NativeRuntimeCompositionStatus;
  appliedCount: number;
  skippedCount: number;
  skippedKinds: string[];
  message: string;
}

export interface NativeRuntimePublisher {
  state: string;
  reconnectAttempts: number;
  droppedVideoFrames: number;
  bytesWritten: number;
  lastError: string;
}

export interface NativeRuntimeTelemetry {
  platform: "ios" | "android";
  runtimeStatus: string;
  updatedAt: number;
  stale: boolean;
  elapsedSeconds: number;
  videoFrames: number;
  encodedBytes: number;
  droppedFrames: number;
  publisher: NativeRuntimePublisher;
  composition: NativeRuntimeComposition;
  message: string;
}
