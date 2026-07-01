import type { LiveCaptionCueInput, LiveCaptionStatus } from "../domain/liveCaption";

export interface LiveCaptionRecognitionRequest {
  language: string;
  interimResults: boolean;
  onCue(cue: LiveCaptionCueInput): void;
  onStatus?(status: LiveCaptionStatus, message?: string): void;
}

export interface LiveCaptionRecognitionEngine {
  isSupported(): boolean;
  start(request: LiveCaptionRecognitionRequest): Promise<void>;
  stop(): Promise<void>;
}
