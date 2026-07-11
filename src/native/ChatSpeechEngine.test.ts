import { describe, expect, it } from "vitest";
import { formatChatSpeechFailureLogMessage, getChatSpeechPlaybackTimeoutMs } from "./ChatSpeechEngine";

describe("ChatSpeechEngine helpers", () => {
  it("scales playback timeout with bounded spoken text length", () => {
    expect(getChatSpeechPlaybackTimeoutMs("short")).toBe(6600);
    expect(getChatSpeechPlaybackTimeoutMs("x".repeat(1000))).toBe(45000);
  });

  it("keeps known speech engine failures while dropping arbitrary spoken text", () => {
    expect(formatChatSpeechFailureLogMessage(new Error("Native chat speech timed out."))).toBe(
      "Native chat speech timed out."
    );

    const unsafe = formatChatSpeechFailureLogMessage(
      new Error("viewer said private comment and Authorization: Bearer body-secret-token-12345")
    );

    expect(unsafe).toBe("Playback failed; details omitted.");
    expect(unsafe).not.toContain("private comment");
    expect(unsafe).not.toContain("body-secret-token");
  });
});
