import type { LiveCaptionRecognitionEngine, LiveCaptionRecognitionRequest } from "../native/LiveCaptionEngine";

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface BrowserSpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): BrowserSpeechRecognitionAlternative;
  [index: number]: BrowserSpeechRecognitionAlternative;
}

interface BrowserSpeechRecognitionResultList {
  readonly length: number;
  item(index: number): BrowserSpeechRecognitionResult;
  [index: number]: BrowserSpeechRecognitionResult;
}

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: BrowserSpeechRecognitionResultList;
}

interface BrowserSpeechRecognitionErrorEvent {
  error?: string;
  message?: string;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

export class WebLiveCaptionEngine implements LiveCaptionRecognitionEngine {
  private recognition: BrowserSpeechRecognition | null = null;
  private stopRequested = false;

  isSupported(): boolean {
    return Boolean(getSpeechRecognitionConstructor());
  }

  async start(request: LiveCaptionRecognitionRequest): Promise<void> {
    await this.stop();
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      request.onStatus?.("unsupported", "Browser speech recognition is not available.");
      return;
    }

    this.stopRequested = false;
    const recognition = new Recognition();
    recognition.lang = request.language;
    recognition.continuous = true;
    recognition.interimResults = request.interimResults;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => request.onStatus?.("listening");
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result[0] ?? result.item(0);
        const transcript = alternative?.transcript ?? "";
        if (!transcript.trim()) {
          continue;
        }
        request.onCue({
          text: transcript,
          language: request.language,
          confidence: typeof alternative.confidence === "number" ? alternative.confidence : 1,
          isFinal: result.isFinal,
          timestampMs: Date.now()
        });
      }
    };
    recognition.onerror = (event) => {
      const message = event.message || event.error || "Speech recognition failed.";
      request.onStatus?.("error", message);
    };
    recognition.onend = () => {
      this.recognition = null;
      if (!this.stopRequested) {
        request.onStatus?.("idle");
      }
    };

    this.recognition = recognition;
    recognition.start();
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    const recognition = this.recognition;
    this.recognition = null;
    if (!recognition) {
      return;
    }
    recognition.onend = null;
    recognition.onresult = null;
    recognition.onerror = null;
    try {
      recognition.stop();
    } catch {
      try {
        recognition.abort();
      } catch {
        // Ignore browser recognition shutdown races.
      }
    }
  }
}

const getSpeechRecognitionConstructor = (): BrowserSpeechRecognitionConstructor | null => {
  const candidate = window as typeof window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
};
