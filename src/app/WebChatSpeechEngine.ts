import type { ChatSpeechEngine, ChatSpeechRequest } from "../native/ChatSpeechEngine";

export class WebChatSpeechEngine implements ChatSpeechEngine {
  async speak(request: ChatSpeechRequest): Promise<void> {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      throw new Error("Web speech synthesis is unavailable.");
    }

    window.speechSynthesis.cancel();

    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(request.text);
      utterance.rate = request.rate;
      utterance.pitch = request.pitch;
      utterance.volume = request.volume;
      utterance.onend = () => resolve();
      utterance.onerror = () => reject(new Error("Web speech synthesis failed."));
      window.speechSynthesis.speak(utterance);
    });
  }

  async stop(): Promise<void> {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }
}
