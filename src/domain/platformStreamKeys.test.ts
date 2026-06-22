import { describe, expect, it, vi } from "vitest";
import { createDefaultStudioProfile } from "./profiles";
import {
  createTwitchDestination,
  createYouTubeDestinationFromStream,
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
  redirectUri: "com.example.mobilelivecaster:/oauth/youtube"
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

    const result = await rotateYouTubeStreamKey(createDefaultStudioProfile(), youtubeCredential(), fetcher, 1000);

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
