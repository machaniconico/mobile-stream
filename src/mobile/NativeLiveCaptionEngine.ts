import { NativeEventEmitter, NativeModules } from "react-native";
import type { LiveCaptionCueInput, LiveCaptionStatus } from "../domain/liveCaption";
import type { LiveCaptionRecognitionEngine, LiveCaptionRecognitionRequest } from "../native/LiveCaptionEngine";

interface LiveCasterSpeechRecognitionModule {
  start(language: string, interimResults: boolean): Promise<boolean>;
  stop(): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

interface NativeCaptionEvent {
  text?: string;
  speaker?: string;
  language?: string;
  confidence?: number;
  isFinal?: boolean;
  timestampMs?: number;
}

interface NativeCaptionStatusEvent {
  status?: LiveCaptionStatus;
  message?: string;
}

const nativeSpeechRecognition = NativeModules.LiveCasterSpeechRecognition as LiveCasterSpeechRecognitionModule | undefined;

export class NativeLiveCaptionEngine implements LiveCaptionRecognitionEngine {
  private eventEmitter = nativeSpeechRecognition ? new NativeEventEmitter(nativeSpeechRecognition as never) : null;
  private subscriptions: Array<{ remove(): void }> = [];

  isSupported(): boolean {
    return Boolean(nativeSpeechRecognition);
  }

  async start(request: LiveCaptionRecognitionRequest): Promise<void> {
    await this.stop();
    if (!nativeSpeechRecognition || !this.eventEmitter) {
      request.onStatus?.("unsupported", "Native speech recognition is not linked in this build.");
      return;
    }

    this.subscriptions = [
      this.eventEmitter.addListener("LiveCaptionCue", (event: NativeCaptionEvent) => {
        const cue = nativeCaptionEventToCue(event);
        if (cue) {
          request.onCue(cue);
        }
      }),
      this.eventEmitter.addListener("LiveCaptionStatus", (event: NativeCaptionStatusEvent) => {
        request.onStatus?.(event.status ?? "idle", event.message);
      })
    ];

    await nativeSpeechRecognition.start(request.language, request.interimResults);
    request.onStatus?.("listening");
  }

  async stop(): Promise<void> {
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];
    if (!nativeSpeechRecognition) {
      return;
    }
    await nativeSpeechRecognition.stop();
  }
}

const nativeCaptionEventToCue = (event: NativeCaptionEvent): LiveCaptionCueInput | null => {
  const text = typeof event.text === "string" ? event.text : "";
  if (!text.trim()) {
    return null;
  }
  return {
    text,
    speaker: typeof event.speaker === "string" ? event.speaker : undefined,
    language: typeof event.language === "string" ? event.language : undefined,
    confidence: typeof event.confidence === "number" ? event.confidence : undefined,
    isFinal: event.isFinal !== false,
    timestampMs: typeof event.timestampMs === "number" ? event.timestampMs : Date.now()
  };
};
