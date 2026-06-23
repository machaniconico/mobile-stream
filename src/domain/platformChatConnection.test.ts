import { describe, expect, it, vi } from "vitest";
import { createDefaultPlatformChatSettings, type PlatformChatSettings } from "./platformChat";
import {
  buildYouTubeLiveChatRequest,
  createDefaultPlatformChatAuthSession,
  createInitialPlatformChatReconnectState,
  createPlatformChatAutoConnectPlan,
  createPlatformChatReconnectDecision,
  createTwitchIrcAuthenticationCommands,
  fetchYouTubeLiveChatPage,
  getPlatformChatNetworkReadiness,
  normalizePlatformChatAuthSession,
  parseTwitchIrcPayload
} from "./platformChatConnection";

const youtubeSettings = (): PlatformChatSettings => ({
  ...createDefaultPlatformChatSettings(),
  enabled: true,
  platform: "youtube",
  youtubeLiveChatId: "live-chat-123"
});

const twitchSettings = (): PlatformChatSettings => ({
  ...createDefaultPlatformChatSettings(),
  enabled: true,
  platform: "twitch",
  twitchChannel: "  @MachaChannel  "
});

describe("platformChatConnection", () => {
  it("requires OAuth auth before network chat can connect", () => {
    expect(getPlatformChatNetworkReadiness(youtubeSettings(), createDefaultPlatformChatAuthSession())).toMatchObject({
      status: "needs-auth",
      label: "Needs auth"
    });

    expect(
      getPlatformChatNetworkReadiness(
        youtubeSettings(),
        normalizePlatformChatAuthSession({
          youtubeAccessToken: "  Bearer yt-token  "
        })
      )
    ).toMatchObject({
      status: "ready"
    });
  });

  it("plans platform chat auto-connect only when readout is enabled and the connection is not active", () => {
    const auth = normalizePlatformChatAuthSession({ youtubeAccessToken: "yt-token" });

    expect(createPlatformChatAutoConnectPlan(createDefaultPlatformChatSettings(), auth, true)).toMatchObject({
      action: "skip",
      reason: "platform-chat-disabled",
      severity: "info"
    });
    expect(createPlatformChatAutoConnectPlan(youtubeSettings(), auth, false)).toMatchObject({
      action: "skip",
      reason: "chat-reader-disabled",
      severity: "warn"
    });
    expect(createPlatformChatAutoConnectPlan(youtubeSettings(), createDefaultPlatformChatAuthSession(), true)).toMatchObject({
      action: "skip",
      reason: "needs-auth",
      severity: "warn"
    });
    expect(createPlatformChatAutoConnectPlan(youtubeSettings(), auth, true, { phase: "connected" })).toMatchObject({
      action: "skip",
      reason: "already-connected"
    });
    expect(createPlatformChatAutoConnectPlan(youtubeSettings(), auth, true, { phase: "connecting" })).toMatchObject({
      action: "skip",
      reason: "already-connecting"
    });
    expect(createPlatformChatAutoConnectPlan(youtubeSettings(), auth, true, { phase: "failed" })).toMatchObject({
      action: "connect",
      reason: "connect",
      severity: "info"
    });
  });

  it("schedules chat reconnects with exponential backoff only while streaming", () => {
    const auth = normalizePlatformChatAuthSession({ youtubeAccessToken: "yt-token" });
    const first = createPlatformChatReconnectDecision({
      settings: youtubeSettings(),
      auth,
      chatReaderEnabled: true,
      streamActive: true,
      connection: { phase: "failed", message: "Network timeout" },
      state: createInitialPlatformChatReconnectState(),
      policy: { baseDelayMs: 1000, maxDelayMs: 5000, maxAttempts: 3 }
    });
    const duplicate = createPlatformChatReconnectDecision({
      settings: youtubeSettings(),
      auth,
      chatReaderEnabled: true,
      streamActive: true,
      connection: { phase: "failed", message: "Network timeout" },
      state: first.state,
      policy: { baseDelayMs: 1000, maxDelayMs: 5000, maxAttempts: 3 }
    });
    const second = createPlatformChatReconnectDecision({
      settings: youtubeSettings(),
      auth,
      chatReaderEnabled: true,
      streamActive: true,
      connection: { phase: "failed", message: "Network timeout" },
      state: { ...first.state, scheduledKey: null },
      policy: { baseDelayMs: 1000, maxDelayMs: 5000, maxAttempts: 3 }
    });
    const stopped = createPlatformChatReconnectDecision({
      settings: youtubeSettings(),
      auth,
      chatReaderEnabled: true,
      streamActive: false,
      connection: { phase: "failed", message: "Network timeout" },
      state: second.state,
      policy: { baseDelayMs: 1000, maxDelayMs: 5000, maxAttempts: 3 }
    });
    const reconnecting = createPlatformChatReconnectDecision({
      settings: youtubeSettings(),
      auth,
      chatReaderEnabled: true,
      streamActive: true,
      connection: { phase: "connecting", message: "Connecting to YouTube chat." },
      state: { ...first.state, scheduledKey: null },
      policy: { baseDelayMs: 1000, maxDelayMs: 5000, maxAttempts: 3 }
    });
    const connected = createPlatformChatReconnectDecision({
      settings: youtubeSettings(),
      auth,
      chatReaderEnabled: true,
      streamActive: true,
      connection: { phase: "connected", message: "Connected." },
      state: { ...first.state, scheduledKey: null },
      policy: { baseDelayMs: 1000, maxDelayMs: 5000, maxAttempts: 3 }
    });

    expect(first).toMatchObject({
      command: "schedule-reconnect",
      delayMs: 1000,
      attemptsUsed: 1,
      maxAttempts: 3
    });
    expect(duplicate.command).toBe("none");
    expect(second).toMatchObject({
      command: "schedule-reconnect",
      delayMs: 2000,
      attemptsUsed: 2
    });
    expect(stopped).toMatchObject({
      command: "cancel",
      attemptsUsed: 0
    });
    expect(reconnecting).toMatchObject({
      command: "none",
      attemptsUsed: 1
    });
    expect(connected).toMatchObject({
      command: "cancel",
      attemptsUsed: 0
    });
  });

  it("gives up after the chat reconnect retry budget is exhausted", () => {
    const auth = normalizePlatformChatAuthSession({ youtubeAccessToken: "yt-token" });
    const state = {
      attemptsUsed: 2,
      lastFailureKey: "youtube\u001flive-chat-123\u001fnetwork timeout",
      scheduledKey: null,
      exhaustedKey: null
    };
    const decision = createPlatformChatReconnectDecision({
      settings: youtubeSettings(),
      auth,
      chatReaderEnabled: true,
      streamActive: true,
      connection: { phase: "failed", message: "Network timeout" },
      state,
      policy: { baseDelayMs: 1000, maxAttempts: 2 }
    });

    expect(decision).toMatchObject({
      command: "give-up",
      severity: "fail",
      attemptsUsed: 2,
      maxAttempts: 2
    });
    expect(decision.state.exhaustedKey).toBe(decision.key);
  });

  it("builds sanitized YouTube live chat requests with bearer auth", () => {
    const request = buildYouTubeLiveChatRequest(
      youtubeSettings(),
      normalizePlatformChatAuthSession({
        youtubeAccessToken: "  Bearer yt-token  "
      }),
      "next-page"
    );

    expect(request.url).toBe(
      "https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=live-chat-123&part=snippet%2CauthorDetails&maxResults=200&pageToken=next-page"
    );
    expect(request.headers.Authorization).toBe("Bearer yt-token");
    expect(request.url).not.toContain("yt-token");
  });

  it("fetches and adapts YouTube live chat pages", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        nextPageToken: "next",
        pollingIntervalMillis: 2500,
        items: [
          {
            id: "message-1",
            snippet: {
              displayMessage: "hello live chat",
              publishedAt: "2026-06-22T00:00:00.000Z",
              type: "textMessageEvent"
            },
            authorDetails: {
              displayName: "Macha"
            }
          }
        ]
      })
    });

    const page = await fetchYouTubeLiveChatPage(
      youtubeSettings(),
      normalizePlatformChatAuthSession({ youtubeAccessToken: "yt-token" }),
      null,
      fetcher,
      1
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(page.nextCursor).toBe("next");
    expect(page.nextPollIntervalMs).toBe(2500);
    expect(page.ingest.messages[0]).toMatchObject({
      source: "youtube",
      author: "Macha",
      body: "hello live chat"
    });
  });

  it("does not parse YouTube chat HTTP error bodies", async () => {
    const json = vi.fn(async () => {
      throw new Error("raw body with yt-token");
    });
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json
    });

    await expect(
      fetchYouTubeLiveChatPage(
        youtubeSettings(),
        normalizePlatformChatAuthSession({ youtubeAccessToken: "yt-token" }),
        null,
        fetcher
      )
    ).rejects.toMatchObject({
      code: "http-error",
      statusCode: 429,
      message: "YouTube chat request failed with HTTP 429."
    });
    expect(json).not.toHaveBeenCalled();
  });

  it("fails safely when a YouTube chat response is not JSON", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("html outage page with yt-token");
      }
    });

    await expect(
      fetchYouTubeLiveChatPage(
        youtubeSettings(),
        normalizePlatformChatAuthSession({ youtubeAccessToken: "yt-token" }),
        null,
        fetcher
      )
    ).rejects.toMatchObject({
      code: "invalid-json",
      statusCode: 200,
      message: "YouTube chat request returned unreadable JSON with HTTP 200."
    });
  });

  it("creates Twitch IRC auth commands without duplicating oauth prefixes", () => {
    expect(
      createTwitchIrcAuthenticationCommands(
        twitchSettings(),
        normalizePlatformChatAuthSession({
          twitchLogin: "  Macha_Login  ",
          twitchOauthToken: "oauth:tw-token"
        })
      )
    ).toEqual([
      "CAP REQ :twitch.tv/tags twitch.tv/commands",
      "PASS oauth:tw-token",
      "NICK macha_login",
      "JOIN #machachannel"
    ]);
  });

  it("parses Twitch IRC ping, notices, and tagged chat messages", () => {
    const result = parseTwitchIrcPayload(
      [
        "PING :tmi.twitch.tv",
        ":tmi.twitch.tv NOTICE * :Login authentication failed",
        "@display-name=Macha\\sViewer;id=tw-message-1;tmi-sent-ts=1782086400000 :macha!macha@macha.tmi.twitch.tv PRIVMSG #machachannel :hello from twitch"
      ].join("\r\n"),
      1
    );

    expect(result.pongResponses).toEqual(["PONG :tmi.twitch.tv"]);
    expect(result.notices).toEqual(["Login authentication failed"]);
    expect(result.messages[0]).toMatchObject({
      source: "twitch",
      author: "Macha Viewer",
      body: "hello from twitch",
      receivedAt: 1782086400000
    });
  });
});
