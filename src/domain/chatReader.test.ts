import { describe, expect, it } from "vitest";
import {
  clearChatReaderSession,
  clearChatReaderQueue,
  createChatMessage,
  createDefaultChatReaderState,
  createSpeechText,
  enqueueChatMessage,
  markChatMessageSpeaking,
  markChatMessageSpoken,
  normalizeMutedWordsInput,
  selectChatOverlayMessages,
  selectNextReadableMessage,
  updateChatReaderSettings
} from "./chatReader";

describe("chatReader", () => {
  it("queues readable comments and keeps latest history", () => {
    const state = createDefaultChatReaderState();
    const message = createChatMessage({
      author: "  macha  ",
      body: "  hello   stream  ",
      receivedAt: 1
    });

    const next = enqueueChatMessage(state, message);

    expect(next.queue).toHaveLength(1);
    expect(next.history).toHaveLength(1);
    expect(next.queue[0].author).toBe("macha");
    expect(next.queue[0].body).toBe("hello stream");
  });

  it("filters muted words before queuing speech", () => {
    const state = updateChatReaderSettings(createDefaultChatReaderState(), {
      mutedWords: ["spoiler"]
    });
    const message = createChatMessage({
      author: "viewer",
      body: "big spoiler here",
      receivedAt: 2
    });

    const next = enqueueChatMessage(state, message);

    expect(next.queue).toHaveLength(0);
    expect(next.history).toHaveLength(1);
    expect(next.skippedCount).toBe(1);
  });

  it("selects recent overlay comments without muted history", () => {
    const state = updateChatReaderSettings(createDefaultChatReaderState(), {
      mutedWords: ["spoiler"]
    });
    const first = createChatMessage({
      source: "youtube",
      author: "viewer",
      body: "first comment",
      receivedAt: 1
    });
    const muted = createChatMessage({
      source: "twitch",
      author: "viewer",
      body: "spoiler comment",
      receivedAt: 2
    });
    const next = enqueueChatMessage(enqueueChatMessage(state, first), muted);

    expect(next.history).toHaveLength(2);
    expect(selectChatOverlayMessages(next)).toEqual([
      {
        author: "viewer",
        body: "first comment",
        source: "youtube"
      }
    ]);
  });

  it("uses external message ids for stable queue dedupe", () => {
    const state = createDefaultChatReaderState();
    const first = createChatMessage({
      id: "platform-message-1",
      source: "youtube",
      author: "viewer",
      body: "first body",
      receivedAt: 10
    });
    const second = createChatMessage({
      id: "platform-message-1",
      source: "youtube",
      author: "viewer",
      body: "edited body",
      receivedAt: 11
    });

    const next = enqueueChatMessage(enqueueChatMessage(state, first), second);

    expect(first.id).toBe(second.id);
    expect(next.queue).toHaveLength(1);
    expect(next.queue[0].body).toBe("edited body");
  });

  it("skips repeated comments inside the duplicate window", () => {
    const state = updateChatReaderSettings(createDefaultChatReaderState(), {
      duplicateWindowSeconds: 30
    });
    const first = createChatMessage({
      source: "twitch",
      author: "viewer",
      body: "same message",
      receivedAt: 1000
    });
    const duplicate = createChatMessage({
      source: "twitch",
      author: "viewer",
      body: "same   message",
      receivedAt: 1200
    });
    const later = createChatMessage({
      source: "twitch",
      author: "viewer",
      body: "same message",
      receivedAt: 32000
    });

    const skipped = enqueueChatMessage(enqueueChatMessage(state, first), duplicate);
    const acceptedLater = enqueueChatMessage(skipped, later);

    expect(skipped.queue).toHaveLength(1);
    expect(skipped.history).toHaveLength(1);
    expect(skipped.skippedCount).toBe(1);
    expect(acceptedLater.queue).toHaveLength(2);
  });

  it("keeps the readable queue within the configured limit", () => {
    const state = updateChatReaderSettings(createDefaultChatReaderState(), {
      maxQueueLength: 4
    });
    const queued = Array.from({ length: 6 }, (_, index) =>
      createChatMessage({
        author: `viewer-${index}`,
        body: `message-${index}`,
        receivedAt: index + 1
      })
    ).reduce(enqueueChatMessage, state);

    expect(queued.queue.map((message) => message.body)).toEqual(["message-2", "message-3", "message-4", "message-5"]);
  });

  it("trims existing backlog when the queue limit is lowered", () => {
    const queued = Array.from({ length: 6 }, (_, index) =>
      createChatMessage({
        author: `viewer-${index}`,
        body: `message-${index}`,
        receivedAt: index + 1
      })
    ).reduce(enqueueChatMessage, createDefaultChatReaderState());

    const limited = updateChatReaderSettings(queued, { maxQueueLength: 4 });

    expect(limited.queue.map((message) => message.body)).toEqual(["message-2", "message-3", "message-4", "message-5"]);
  });

  it("selects and clears the next spoken message", () => {
    const message = createChatMessage({
      author: "viewer",
      body: "nice avatar",
      receivedAt: 3
    });
    const queued = enqueueChatMessage(createDefaultChatReaderState(), message);
    const selected = selectNextReadableMessage(queued);
    const speaking = markChatMessageSpeaking(queued, message.id);
    const spoken = markChatMessageSpoken(speaking, message.id);

    expect(selected?.id).toBe(message.id);
    expect(selectNextReadableMessage(speaking)).toBeNull();
    expect(spoken.queue).toHaveLength(0);
    expect(spoken.speakingMessageId).toBeNull();
  });

  it("clears chat session comments while preserving speech settings", () => {
    const state = updateChatReaderSettings(createDefaultChatReaderState(), {
      readAuthorName: false,
      volume: 0.5
    });
    const message = createChatMessage({
      author: "private-viewer",
      body: "private comment",
      receivedAt: 5
    });
    const queued = markChatMessageSpeaking(enqueueChatMessage(state, message), message.id);
    const cleared = clearChatReaderSession({ ...queued, skippedCount: 3 });

    expect(cleared.queue).toHaveLength(0);
    expect(cleared.history).toHaveLength(0);
    expect(cleared.speakingMessageId).toBeNull();
    expect(cleared.skippedCount).toBe(0);
    expect(cleared.settings.readAuthorName).toBe(false);
    expect(cleared.settings.volume).toBe(0.5);
  });

  it("builds safe speech text", () => {
    const state = updateChatReaderSettings(createDefaultChatReaderState(), {
      maxMessageLength: 40
    });
    const message = createChatMessage({
      author: "viewer",
      body: "please open https://example.com/secret and read this long text",
      receivedAt: 4
    });

    expect(createSpeechText(message, state.settings)).toBe("viewer says please open link omitted and read this...");
  });

  it("normalizes controls and muted word input", () => {
    const state = updateChatReaderSettings(createDefaultChatReaderState(), {
      rate: 4,
      pitch: -1,
      volume: 2,
      maxMessageLength: 999,
      maxQueueLength: 999,
      duplicateWindowSeconds: 999,
      mutedWords: normalizeMutedWordsInput(" spam, Spoiler,  ")
    });

    expect(state.settings.rate).toBe(1.5);
    expect(state.settings.pitch).toBe(0.5);
    expect(state.settings.volume).toBe(1);
    expect(state.settings.maxMessageLength).toBe(240);
    expect(state.settings.maxQueueLength).toBe(24);
    expect(state.settings.duplicateWindowSeconds).toBe(120);
    expect(state.settings.mutedWords).toEqual(["spam", "spoiler"]);
    expect(clearChatReaderQueue(enqueueChatMessage(state, createChatMessage({ author: "a", body: "b" }))).queue).toHaveLength(0);
  });
});
