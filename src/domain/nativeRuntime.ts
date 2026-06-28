export type NativeRuntimeCompositionStatus = "unknown" | "screen-only" | "applied" | "pending" | "failed";

export interface NativeRuntimeComposition {
  status: NativeRuntimeCompositionStatus;
  appliedCount: number;
  skippedCount: number;
  skippedKinds: string[];
  stillImageAssetCount?: number;
  stillImageAssetLoadedCount?: number;
  stillImageAssetMissingCount?: number;
  stillImageAssetMissingKinds?: string[];
  message: string;
}

export interface NativeRuntimePublisher {
  state: string;
  reconnectAttempts: number;
  sentVideoFrames: number;
  sentAudioFrames: number;
  droppedVideoFrames: number;
  droppedAudioFrames: number;
  bytesWritten: number;
  cacheSize: number;
  itemsInCache: number;
  congested: boolean;
  lastError: string;
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
  audioProcessing?: NativeRuntimeAudioProcessing;
  message: string;
}
