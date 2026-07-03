import { describe, expect, it, vi } from "vitest";
import type { PlatformChatFetch } from "./platformChatConnection";
import {
  createDefaultStreamAnnouncementAutoPostSettings,
  createStreamAnnouncementAutoPostDecision,
  formatStreamAnnouncementAutoPostError,
  isValidDiscordWebhookUrl,
  normalizeDiscordWebhookUrl,
  postDiscordStreamAnnouncement,
  StreamAnnouncementAutoPostError
} from "./streamAnnouncementAutoPost";

const validWebhookUrl =
  "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz.ABCDEFGHIJKLMNOPQRSTUVWXYZ_1234567890";

const response = (status: number, retryAfter?: string): Awaited<ReturnType<PlatformChatFetch>> => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: (name: string) => (name.toLowerCase() === "retry-after" ? retryAfter : null)
  },
  json: async () => ({})
});

describe("stream announcement Discord autopost", () => {
  it("accepts only canonical Discord webhook URLs", () => {
    expect(isValidDiscordWebhookUrl(validWebhookUrl)).toBe(true);
    expect(normalizeDiscordWebhookUrl(`${validWebhookUrl}/`)).toBe(validWebhookUrl);
    expect(isValidDiscordWebhookUrl("http://discord.com/api/webhooks/12345/token")).toBe(false);
    expect(isValidDiscordWebhookUrl("https://discord.com/api/webhooks/not-a-snowflake/token")).toBe(false);
    expect(isValidDiscordWebhookUrl("https://discord.com/api/webhooks/123456789012345678/short")).toBe(false);
    expect(isValidDiscordWebhookUrl("https://example.com/api/webhooks/123456789012345678/token-token-token-token")).toBe(false);
  });

  it("posts the Round 1 announcement text as Discord content", async () => {
    const fetcher = vi.fn(async () => response(204));

    await expect(
      postDiscordStreamAnnouncement({
        webhookUrl: validWebhookUrl,
        content: "YouTube: Launch live https://www.youtube.com/watch?v=broadcast-1",
        fetcher
      })
    ).resolves.toMatchObject({
      attempts: 1,
      message: "Discord announcement posted."
    });

    expect(fetcher).toHaveBeenCalledWith(validWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: "YouTube: Launch live https://www.youtube.com/watch?v=broadcast-1"
      })
    });
  });

  it("respects Retry-After and retries a retryable non-2xx response once", async () => {
    const fetcher = vi.fn(async () => (fetcher.mock.calls.length === 1 ? response(503, "2") : response(204)));
    const wait = vi.fn(async () => undefined);

    await expect(
      postDiscordStreamAnnouncement({
        webhookUrl: validWebhookUrl,
        content: "Live now!",
        fetcher,
        wait
      })
    ).resolves.toMatchObject({
      attempts: 2,
      message: "Discord announcement posted after retry."
    });

    expect(wait).toHaveBeenCalledWith(2000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retry more than once and returns a redacted safe error message", async () => {
    const fetcher = vi.fn(async () => response(429, "3"));
    const wait = vi.fn(async () => undefined);

    await expect(
      postDiscordStreamAnnouncement({
        webhookUrl: validWebhookUrl,
        content: "Live now!",
        fetcher,
        wait
      })
    ).rejects.toMatchObject({
      statusCode: 429,
      retryAfterMs: 3000,
      attempts: 2
    });

    expect(wait).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const safeMessage = formatStreamAnnouncementAutoPostError(
      new StreamAnnouncementAutoPostError(`Failed while calling ${validWebhookUrl}`, {
        retryable: true,
        retryAfterMs: 3000
      }),
      validWebhookUrl
    );
    expect(safeMessage).toContain("[redacted]");
    expect(safeMessage).toContain("Retry after 3s.");
    expect(safeMessage).not.toContain(validWebhookUrl);
    expect(safeMessage).not.toContain(validWebhookUrl.split("/").at(-1));
  });

  it("fires only for platform-visible live success and dedupes per stream session", () => {
    const settings = {
      ...createDefaultStreamAnnouncementAutoPostSettings(),
      autoPostEnabled: true,
      discordWebhookUrl: validWebhookUrl
    };
    const base = {
      settings,
      enginePlatform: "ios" as const,
      streamStatus: "live" as const,
      sessionStartedAt: 1_779_000_000_000,
      signal: "youtube-live-transition" as const,
      destinationPlatform: "youtube-live" as const,
      youtubeBroadcastStatus: "live",
      youtubeBroadcastPrivacyStatus: "public"
    };

    const decision = createStreamAnnouncementAutoPostDecision(base);

    expect(decision).toEqual({
      shouldPost: true,
      sessionKey: "youtube-live:1779000000000",
      reason: "platform-visible-live"
    });
    expect(
      createStreamAnnouncementAutoPostDecision({
        ...base,
        postedSessionKeys: ["youtube-live:1779000000000"]
      })
    ).toMatchObject({ shouldPost: false, reason: "already-posted" });
    expect(createStreamAnnouncementAutoPostDecision({ ...base, enginePlatform: "mock" })).toMatchObject({
      shouldPost: false,
      reason: "mock-engine"
    });
    expect(createStreamAnnouncementAutoPostDecision({ ...base, youtubeBroadcastPrivacyStatus: "private" })).toMatchObject({
      shouldPost: false,
      reason: "not-platform-visible"
    });
    expect(createStreamAnnouncementAutoPostDecision({ ...base, destinationPlatform: "custom" })).toMatchObject({
      shouldPost: false,
      reason: "not-platform-visible"
    });
    expect(createStreamAnnouncementAutoPostDecision({ ...base, settings: { ...settings, autoPostEnabled: false } })).toMatchObject({
      shouldPost: false,
      reason: "disabled"
    });
  });

  it("fires for Twitch live status refresh but not offline status", () => {
    const settings = {
      ...createDefaultStreamAnnouncementAutoPostSettings(),
      autoPostEnabled: true,
      discordWebhookUrl: validWebhookUrl
    };

    expect(
      createStreamAnnouncementAutoPostDecision({
        settings,
        destinationPlatform: "twitch",
        twitchLiveStatus: "live",
        enginePlatform: "android",
        streamStatus: "live",
        sessionStartedAt: 1,
        signal: "twitch-status-refresh"
      })
    ).toMatchObject({ shouldPost: true });
    expect(
      createStreamAnnouncementAutoPostDecision({
        settings,
        destinationPlatform: "twitch",
        twitchLiveStatus: "offline",
        enginePlatform: "android",
        streamStatus: "live",
        sessionStartedAt: 1,
        signal: "twitch-status-refresh"
      })
    ).toMatchObject({ shouldPost: false, reason: "not-platform-visible" });
  });
});
