import { afterEach, describe, expect, it, vi } from "vitest";

const request = {
  messageId: "chat-1",
  text: "private chat text",
  rate: 1,
  pitch: 1,
  volume: 0.8
};

describe("NativeChatSpeechEngine", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("react-native");
  });

  it("fails when the native speech module is unavailable", async () => {
    vi.doMock("react-native", () => ({
      NativeModules: {}
    }));
    const { NativeChatSpeechEngine } = await import("./NativeChatSpeechEngine");

    await expect(new NativeChatSpeechEngine().speak(request)).rejects.toThrow("Native chat speech module is unavailable.");
  });

  it("fails when the native speech module rejects playback", async () => {
    const speak = vi.fn(async () => false);
    vi.doMock("react-native", () => ({
      NativeModules: {
        LiveCasterSpeech: {
          speak,
          stop: vi.fn(async () => true)
        }
      }
    }));
    const { NativeChatSpeechEngine } = await import("./NativeChatSpeechEngine");

    await expect(new NativeChatSpeechEngine().speak(request)).rejects.toThrow("Native chat speech failed.");
    expect(speak).toHaveBeenCalledWith(request.text, request.rate, request.pitch, request.volume);
  });
});
