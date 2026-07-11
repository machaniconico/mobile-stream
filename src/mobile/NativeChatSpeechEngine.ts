import { NativeModules } from "react-native";
import { getChatSpeechPlaybackTimeoutMs, type ChatSpeechEngine, type ChatSpeechRequest } from "../native/ChatSpeechEngine";

interface LiveCasterSpeechModule {
  speak(text: string, rate: number, pitch: number, volume: number): Promise<boolean>;
  stop(): Promise<boolean>;
}

const nativeSpeech = NativeModules.LiveCasterSpeech as LiveCasterSpeechModule | undefined;

export class NativeChatSpeechEngine implements ChatSpeechEngine {
  async speak(request: ChatSpeechRequest): Promise<void> {
    if (!nativeSpeech) {
      throw new Error("Native chat speech module is unavailable.");
    }
    const spoken = await withTimeout(
      nativeSpeech.speak(request.text, request.rate, request.pitch, request.volume),
      getChatSpeechPlaybackTimeoutMs(request.text),
      "Native chat speech timed out."
    );
    if (!spoken) {
      throw new Error("Native chat speech failed.");
    }
  }

  async stop(): Promise<void> {
    if (!nativeSpeech) {
      return;
    }
    await nativeSpeech.stop();
  }
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};
