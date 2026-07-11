import { afterEach, describe, expect, it, vi } from "vitest";
import { getChatSpeechPlaybackTimeoutMs } from "../native/ChatSpeechEngine";
import { WebChatSpeechEngine } from "./WebChatSpeechEngine";

const request = {
  messageId: "chat-1",
  text: "private chat text",
  rate: 1,
  pitch: 1,
  volume: 0.8
};

class FakeSpeechSynthesisUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  volume = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

describe("WebChatSpeechEngine", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fails when the browser speech API is unavailable", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("SpeechSynthesisUtterance", undefined);

    await expect(new WebChatSpeechEngine().speak(request)).rejects.toThrow("Web speech synthesis is unavailable.");
  });

  it("fails utterance errors without leaking spoken text through the error", async () => {
    const speechSynthesis = {
      cancel: vi.fn(),
      speak: vi.fn((utterance: FakeSpeechSynthesisUtterance) => {
        utterance.onerror?.();
      })
    };
    vi.stubGlobal("window", { speechSynthesis });
    vi.stubGlobal("SpeechSynthesisUtterance", FakeSpeechSynthesisUtterance);

    try {
      await new WebChatSpeechEngine().speak(request);
      throw new Error("expected speech to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Web speech synthesis failed.");
      expect((error as Error).message).not.toContain(request.text);
    }
  });

  it("times out stalled utterances and cancels browser speech output", async () => {
    vi.useFakeTimers();
    const speechSynthesis = {
      cancel: vi.fn(),
      speak: vi.fn()
    };
    vi.stubGlobal("window", { speechSynthesis });
    vi.stubGlobal("SpeechSynthesisUtterance", FakeSpeechSynthesisUtterance);

    const promise = new WebChatSpeechEngine().speak(request);
    const assertion = expect(promise).rejects.toThrow("Web speech synthesis timed out.");
    await vi.advanceTimersByTimeAsync(getChatSpeechPlaybackTimeoutMs(request.text));

    await assertion;
    expect(speechSynthesis.cancel).toHaveBeenCalledTimes(2);
  });

  it("ignores stop requests when browser speech output is unavailable", async () => {
    vi.stubGlobal("window", undefined);

    await expect(new WebChatSpeechEngine().stop()).resolves.toBeUndefined();
  });
});
