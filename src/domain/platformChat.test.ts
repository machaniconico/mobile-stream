import { describe, expect, it } from "vitest";
import {
  createDefaultPlatformChatSettings,
  createPlatformChatSample,
  getPlatformChatConnectionStatus,
  ingestTwitchEventSubNotification,
  ingestYouTubeLiveChatResponse,
  normalizePlatformChatSettings
} from "./platformChat";

describe("platformChat", () => {
  it("normalizes YouTube live chat list responses into chat messages", () => {
    const result = ingestYouTubeLiveChatResponse(
      {
        nextPageToken: "next-page",
        pollingIntervalMillis: 250,
        items: [
          {
            id: "yt-message-1",
            snippet: {
              displayMessage: "  hello   from youtube  ",
              publishedAt: "2026-06-22T00:00:00.000Z",
              type: "textMessageEvent"
            },
            authorDetails: {
              displayName: "Macha"
            }
          },
          {
            id: "yt-message-2",
            snippet: {
              displayMessage: "membership",
              type: "newSponsorEvent"
            },
            authorDetails: {
              displayName: "Member"
            }
          }
        ]
      },
      1
    );

    expect(result.acceptedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.nextCursor).toBe("next-page");
    expect(result.nextPollIntervalMs).toBe(1000);
    expect(result.warnings).toEqual(["YouTube polling interval was raised to 1000 ms."]);
    expect(result.messages[0]).toMatchObject({
      source: "youtube",
      author: "Macha",
      body: "hello from youtube",
      receivedAt: Date.parse("2026-06-22T00:00:00.000Z")
    });
    expect(result.messages[0].id).toMatch(/^chat-youtube-/);
  });

  it("normalizes Twitch EventSub chat notifications into chat messages", () => {
    const result = ingestTwitchEventSubNotification(
      {
        metadata: {
          message_timestamp: "2026-06-22T00:00:01.000Z"
        },
        event: {
          message_id: "tw-message-1",
          chatter_user_login: "macha_login",
          chatter_user_name: "Macha",
          message: {
            fragments: [{ text: "hello " }, { text: "from twitch" }]
          }
        }
      },
      1
    );

    expect(result.acceptedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(result.messages[0]).toMatchObject({
      source: "twitch",
      author: "Macha",
      body: "hello from twitch",
      receivedAt: Date.parse("2026-06-22T00:00:01.000Z")
    });
    expect(result.messages[0].id).toMatch(/^chat-twitch-/);
  });

  it("reports platform connection status from normalized settings", () => {
    const disabled = createDefaultPlatformChatSettings();
    const twitchReady = normalizePlatformChatSettings({
      enabled: true,
      platform: "twitch",
      youtubeLiveChatId: "",
      twitchChannel: "  @MachaChannel  "
    });

    expect(getPlatformChatConnectionStatus(disabled).status).toBe("disabled");
    expect(getPlatformChatConnectionStatus({ ...disabled, enabled: true }).status).toBe("needs-connection");
    expect(twitchReady.twitchChannel).toBe("machachannel");
    expect(getPlatformChatConnectionStatus(twitchReady)).toMatchObject({
      status: "ready",
      label: "Ready"
    });
  });

  it("creates deterministic sample messages for the selected platform", () => {
    const youtube = createPlatformChatSample(
      {
        enabled: true,
        platform: "youtube",
        youtubeLiveChatId: "live-chat-id",
        twitchChannel: ""
      },
      10
    );
    const twitch = createPlatformChatSample(
      {
        enabled: true,
        platform: "twitch",
        youtubeLiveChatId: "",
        twitchChannel: "macha"
      },
      11
    );

    expect(youtube.messages[0].source).toBe("youtube");
    expect(twitch.messages[0].source).toBe("twitch");
  });
});
