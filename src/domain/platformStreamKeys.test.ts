import { describe, expect, it, vi } from "vitest";
import { createDefaultStudioProfile } from "./profiles";
import {
  createTwitchDestination,
  createYouTubeDestinationFromStream,
  PlatformStreamKeyError,
  rotateYouTubeStreamKey,
  syncTwitchStreamKey
} from "./platformStreamKeys";
import type { PlatformChatOAuthCredential } from "./platformChatOAuth";

const youtubeCredential = (): PlatformChatOAuthCredential => ({
  platform: "youtube",
  accessToken: "yt-access",
  refreshToken: "yt-refresh",
  expiresAt: 999999,
  scopes: ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/youtube.force-ssl"],
  twitchLogin: null,
  twitchUserId: null,
  validatedAt: 1,
  clientId: "youtube-client",
  redirectUri: "com.mobilelivecaster.app:/oauth/youtube"
});

const twitchCredential = (): PlatformChatOAuthCredential => ({
  platform: "twitch",
  accessToken: "tw-access",
  refreshToken: null,
  expiresAt: 999999,
  scopes: ["chat:read", "channel:read:stream_key"],
  twitchLogin: "macha",
  twitchUserId: "12345",
  validatedAt: 1,
  clientId: "twitch-client",
  redirectUri: "mobilelivecaster://oauth/twitch"
});

describe("platformStreamKeys", () => {
  it("creates a reusable YouTube stream and applies RTMPS ingestion details", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "stream-1",
        snippet: {
          title: "MobileLiveCaster stream"
        },
        cdn: {
          ingestionInfo: {
            streamName: "yt-stream-key",
            rtmpsIngestionAddress: "rtmps://a.rtmps.youtube.com/live2"
          }
        }
      })
    });

    const profile = {
      ...createDefaultStudioProfile(),
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        youtubeBroadcastId: "old-broadcast",
        youtubeBroadcastBoundStreamId: "old-stream",
        youtubeLiveChatId: "old-chat",
        youtubeBroadcastStatus: "testing",
        youtubeBroadcastPrivacyStatus: "private" as const,
        youtubeStreamStatus: "active",
        youtubeStreamHealthStatus: "ok",
        youtubeStreamHealthIssues: ["warning: old"],
        youtubeStatusCheckedAt: "2026-06-23T00:00:00.000Z"
      }
    };

    const result = await rotateYouTubeStreamKey(profile, youtubeCredential(), fetcher, 1000);

    expect(fetcher).toHaveBeenCalledWith("https://www.googleapis.com/youtube/v3/liveStreams?part=snippet%2Ccdn%2CcontentDetails", {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer yt-access",
        "Content-Type": "application/json"
      },
      body: expect.stringContaining("\"isReusable\":true")
    });
    expect(fetcher.mock.calls[0][0]).not.toContain("yt-access");
    expect(result.profile.destination).toMatchObject({
      platform: "youtube-live",
      protocol: "rtmps",
      serverUrl: "rtmps://a.rtmps.youtube.com/live2",
      streamKey: "yt-stream-key"
    });
    expect(result.profile.platformPublishing.youtubeStreamId).toBe("stream-1");
    expect(result.profile.platformPublishing.youtubeBroadcastId).toBe("");
    expect(result.profile.platformPublishing.youtubeBroadcastBoundStreamId).toBe("");
    expect(result.profile.platformPublishing.youtubeLiveChatId).toBe("");
    expect(result.profile.platformPublishing.youtubeBroadcastStatus).toBe("");
    expect(result.profile.platformPublishing.youtubeStreamStatus).toBe("");
    expect(result.profile.platformPublishing.youtubeStatusCheckedAt).toBe("");
  });

  it("syncs Twitch stream keys through Helix and keeps the current Twitch ingest preset", async () => {
    const profile = createDefaultStudioProfile();
    profile.destination = createTwitchDestination(profile.destination, "old-key");
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ stream_key: "live_123_new" }]
      })
    });

    const result = await syncTwitchStreamKey(profile, twitchCredential(), fetcher);

    expect(fetcher).toHaveBeenCalledWith("https://api.twitch.tv/helix/streams/key?broadcaster_id=12345", {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer tw-access",
        "Client-Id": "twitch-client"
      }
    });
    expect(fetcher.mock.calls[0][0]).not.toContain("tw-access");
    expect(result.profile.destination).toMatchObject({
      platform: "twitch",
      streamKey: "live_123_new"
    });
  });

  it("rejects credentials missing platform stream key scopes", async () => {
    await expect(
      rotateYouTubeStreamKey(
        createDefaultStudioProfile(),
        {
          ...youtubeCredential(),
          scopes: ["https://www.googleapis.com/auth/youtube.readonly"]
        },
        vi.fn()
      )
    ).rejects.toThrow("youtube.force-ssl");

    await expect(
      syncTwitchStreamKey(
        createDefaultStudioProfile(),
        {
          ...twitchCredential(),
          scopes: ["chat:read"]
        },
        vi.fn()
      )
    ).rejects.toThrow("channel:read:stream_key");
  });

  it("fails safely when stream key HTTP errors have unreadable JSON bodies", async () => {
    const json = vi.fn(async () => {
      throw new Error("raw upstream body with tw-access token");
    });
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: {
        get: (name: string) => (name.toLowerCase() === "retry-after" ? "3" : null)
      },
      json
    });

    await expect(syncTwitchStreamKey(createDefaultStudioProfile(), twitchCredential(), fetcher)).rejects.toThrow(
      "Twitch stream key request failed with HTTP 429."
    );
    await expect(syncTwitchStreamKey(createDefaultStudioProfile(), twitchCredential(), fetcher)).rejects.toMatchObject({
      name: "PlatformStreamKeyError",
      statusCode: 429,
      retryable: true,
      retryAfterMs: 3000
    } satisfies Partial<PlatformStreamKeyError>);
    expect(json).not.toHaveBeenCalled();
  });

  it("fails safely when a successful stream key response is not JSON", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("html outage page with yt-access token");
      }
    });

    await expect(rotateYouTubeStreamKey(createDefaultStudioProfile(), youtubeCredential(), fetcher)).rejects.toThrow(
      "YouTube live stream creation returned unreadable JSON with HTTP 200."
    );
    await expect(rotateYouTubeStreamKey(createDefaultStudioProfile(), youtubeCredential(), fetcher)).rejects.toMatchObject({
      statusCode: 200,
      retryable: false,
      retryAfterMs: null
    } satisfies Partial<PlatformStreamKeyError>);
  });

  it("normalizes YouTube and Twitch destinations from API stream keys", () => {
    expect(
      createYouTubeDestinationFromStream(createDefaultStudioProfile().destination, {
        cdn: {
          ingestionInfo: {
            streamName: "abc",
            ingestionAddress: "rtmp://a.rtmp.youtube.com/live2"
          }
        }
      })
    ).toMatchObject({
      protocol: "rtmp",
      streamKey: "abc"
    });
    expect(createTwitchDestination(createDefaultStudioProfile().destination, " live_new ")).toMatchObject({
      platform: "twitch",
      streamKey: "live_new"
    });
  });
});
