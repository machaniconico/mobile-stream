import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDefaultPlatformChatSettings } from "../domain/platformChat";
import { createPlatformChatConnectionKey, TWITCH_CHAT_CONNECTION_LOST_MESSAGE } from "./usePlatformChatConnection";

describe("usePlatformChatConnection", () => {
  it("uses one Twitch socket failure message for error and close events", () => {
    const source = readFileSync(new URL("./usePlatformChatConnection.ts", import.meta.url), "utf8");

    expect(TWITCH_CHAT_CONNECTION_LOST_MESSAGE).toBe("Twitch chat connection lost.");
    expect(source.match(/createPlatformChatConnectionState\("failed", TWITCH_CHAT_CONNECTION_LOST_MESSAGE\)/g)).toHaveLength(2);
    expect(source).not.toContain("Twitch chat socket error.");
    expect(source).not.toContain("Twitch chat socket closed.");
  });

  it("keeps lastReceivedAt when YouTube polls or Twitch PINGs have no chat messages", () => {
    const source = readFileSync(new URL("./usePlatformChatConnection.ts", import.meta.url), "utf8");

    expect(source.match(/lastReceivedAt: .*current\.lastReceivedAt/g)).toHaveLength(2);
    expect(source).not.toContain("lastReceivedAt: page.ingest.messages.at(-1)?.receivedAt ?? null");
    expect(source).not.toContain("lastReceivedAt: result.messages.at(-1)?.receivedAt ?? null");
  });

  it("fingerprints OAuth tokens in the connection identity instead of storing raw token text", () => {
    const first = createPlatformChatConnectionKey(
      { ...createDefaultPlatformChatSettings(), enabled: true, platform: "youtube", youtubeLiveChatId: "live-chat-1" },
      {
        youtubeAccessToken: "youtube-access-token-secret",
        twitchOauthToken: "",
        twitchLogin: ""
      }
    );
    const second = createPlatformChatConnectionKey(
      { ...createDefaultPlatformChatSettings(), enabled: true, platform: "youtube", youtubeLiveChatId: "live-chat-1" },
      {
        youtubeAccessToken: "youtube-access-token-secret-rotated",
        twitchOauthToken: "",
        twitchLogin: ""
      }
    );

    expect(first).not.toContain("youtube-access-token-secret");
    expect(second).not.toContain("youtube-access-token-secret-rotated");
    expect(first).not.toBe(second);
  });

  it("does not include normalized auth tokens directly in the connection key source", () => {
    const source = readFileSync(new URL("./usePlatformChatConnection.ts", import.meta.url), "utf8");

    expect(source).toContain("authTokenFingerprint(normalizedAuth.youtubeAccessToken)");
    expect(source).toContain("authTokenFingerprint(normalizedAuth.twitchOauthToken)");
    expect(source).not.toContain("normalizedAuth.youtubeAccessToken,");
    expect(source).not.toContain("normalizedAuth.twitchOauthToken,");
  });
});
