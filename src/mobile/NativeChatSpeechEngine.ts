import { NativeModules } from "react-native";
import type { ChatSpeechEngine, ChatSpeechRequest } from "../native/ChatSpeechEngine";

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
    const spoken = await nativeSpeech.speak(request.text, request.rate, request.pitch, request.volume);
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
