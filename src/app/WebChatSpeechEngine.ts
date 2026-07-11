import { getChatSpeechPlaybackTimeoutMs, type ChatSpeechEngine, type ChatSpeechRequest } from "../native/ChatSpeechEngine";

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
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const settle = (result: "resolved" | "failed" | "timed-out") => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeout) {
          clearTimeout(timeout);
        }
        if (result === "resolved") {
          resolve();
          return;
        }
        reject(new Error(result === "timed-out" ? "Web speech synthesis timed out." : "Web speech synthesis failed."));
      };
      timeout = setTimeout(() => {
        window.speechSynthesis.cancel();
        settle("timed-out");
      }, getChatSpeechPlaybackTimeoutMs(request.text));
      utterance.rate = request.rate;
      utterance.pitch = request.pitch;
      utterance.volume = request.volume;
      utterance.onend = () => settle("resolved");
      utterance.onerror = () => settle("failed");
      window.speechSynthesis.speak(utterance);
    });
  }

  async stop(): Promise<void> {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }
}
