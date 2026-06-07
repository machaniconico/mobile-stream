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
      return;
    }
    await nativeSpeech.speak(request.text, request.rate, request.pitch, request.volume);
  }

  async stop(): Promise<void> {
    if (!nativeSpeech) {
      return;
    }
    await nativeSpeech.stop();
  }
}
