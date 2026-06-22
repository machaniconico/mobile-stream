import { describe, expect, it, vi } from "vitest";
import type { PlatformChatOAuthCredential } from "./platformChatOAuth";
import type { PlatformChatFetch } from "./platformChatConnection";
import { applyTwitchChannelMetadata, createYouTubeBroadcastAndBindStream, transitionYouTubeBroadcast } from "./platformPublishing";
import { applyDestinationPreset, createDefaultStudioProfile } from "./profiles";

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
  scopes: ["chat:read", "channel:read:stream_key", "channel:manage:broadcast"],
  twitchLogin: "macha",
  twitchUserId: "12345",
  validatedAt: 1,
  clientId: "twitch-client",
  redirectUri: "mobilelivecaster://oauth/twitch"
});

describe("platformPublishing", () => {
  it("creates a YouTube broadcast and binds it to the saved stream", async () => {
    const profile = {
      ...createDefaultStudioProfile(),
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        title: "Launch live",
        description: "Launch notes",
        privacyStatus: "unlisted" as const,
        scheduledStartMinutesFromNow: 15,
        youtubeStreamId: "stream-1"
      }
    };
    const fetcher = vi.fn(async (...args: Parameters<PlatformChatFetch>) => {
      const [url] = args;
      if (url.includes("/bind?")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "broadcast-1",
            snippet: {
              title: "Launch live",
              liveChatId: "chat-1"
            },
            contentDetails: {
              boundStreamId: "stream-1"
            }
          })
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "broadcast-1",
          snippet: {
            title: "Launch live"
          }
        })
      };
    });

    const result = await createYouTubeBroadcastAndBindStream(profile, youtubeCredential(), fetcher, Date.UTC(2026, 0, 1, 0, 0, 0));

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe("https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet%2Cstatus%2CcontentDetails");
    expect(fetcher.mock.calls[0][0]).not.toContain("yt-access");
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer yt-access",
        "Content-Type": "application/json"
      }
    });
    expect(JSON.parse(fetcher.mock.calls[0][1].body ?? "{}")).toMatchObject({
      snippet: {
        title: "Launch live",
        description: "Launch notes",
        scheduledStartTime: "2026-01-01T00:15:00.000Z"
      },
      status: {
        privacyStatus: "unlisted",
        selfDeclaredMadeForKids: false
      },
      contentDetails: {
        enableAutoStart: true,
        enableAutoStop: true,
        monitorStream: {
          enableMonitorStream: true
        }
      }
    });
    expect(fetcher.mock.calls[1][0]).toBe(
      "https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=broadcast-1&part=snippet%2CcontentDetails%2Cstatus&streamId=stream-1"
    );
    expect(result.profile.platformPublishing.youtubeBroadcastId).toBe("broadcast-1");
    expect(result.profile.platformPublishing.youtubeLiveChatId).toBe("chat-1");
    expect(result.profile.platformChat.youtubeLiveChatId).toBe("chat-1");
  });

  it("transitions a YouTube broadcast lifecycle state", async () => {
    const profile = {
      ...createDefaultStudioProfile(),
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        youtubeBroadcastId: "broadcast-1",
        youtubeLiveChatId: "chat-1"
      }
    };
    const fetcher = vi.fn(async (..._args: Parameters<PlatformChatFetch>) => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: "broadcast-1",
        snippet: {
          liveChatId: "chat-2"
        },
        status: {
          lifeCycleStatus: "live"
        }
      })
    }));

    const result = await transitionYouTubeBroadcast(profile, youtubeCredential(), "live", fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      "https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=live&id=broadcast-1&part=snippet%2CcontentDetails%2Cstatus",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer yt-access"
        }
      }
    );
    expect(fetcher.mock.calls[0][0]).not.toContain("yt-access");
    expect(result.profile.platformPublishing.youtubeBroadcastStatus).toBe("live");
    expect(result.profile.platformPublishing.youtubeLiveChatId).toBe("chat-2");
    expect(result.profile.platformChat.youtubeLiveChatId).toBe("chat-2");
  });

  it("updates Twitch channel metadata with resolved category IDs", async () => {
    const profile = {
      ...applyDestinationPreset(createDefaultStudioProfile(), "twitch-auto"),
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        title: "Drawing stream",
        twitchCategory: "Art",
        twitchCategoryId: "",
        twitchLanguage: "ja"
      }
    };
    const fetcher = vi.fn(async (...args: Parameters<PlatformChatFetch>) => {
      const [url] = args;
      if (url.includes("/search/categories")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: "509660",
                name: "Art"
              }
            ]
          })
        };
      }

      return {
        ok: true,
        status: 204,
        json: async () => ({})
      };
    });

    const result = await applyTwitchChannelMetadata(profile, twitchCredential(), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.twitch.tv/helix/search/categories?query=Art&first=10");
    expect(fetcher.mock.calls[0][0]).not.toContain("tw-access");
    expect(fetcher.mock.calls[1][0]).toBe("https://api.twitch.tv/helix/channels?broadcaster_id=12345");
    expect(fetcher.mock.calls[1][1]).toMatchObject({
      method: "PATCH",
      headers: {
        Authorization: "Bearer tw-access",
        "Client-Id": "twitch-client",
        "Content-Type": "application/json"
      }
    });
    expect(JSON.parse(fetcher.mock.calls[1][1].body ?? "{}")).toEqual({
      title: "Drawing stream",
      game_id: "509660",
      broadcaster_language: "ja"
    });
    expect(result.profile.platformPublishing.twitchCategoryId).toBe("509660");
  });

  it("requires a saved YouTube stream ID before creating a bound broadcast", async () => {
    await expect(
      createYouTubeBroadcastAndBindStream(createDefaultStudioProfile(), youtubeCredential(), vi.fn())
    ).rejects.toThrow("stream key");
  });

  it("requires a saved YouTube broadcast ID before transitions", async () => {
    await expect(
      transitionYouTubeBroadcast(createDefaultStudioProfile(), youtubeCredential(), "testing", vi.fn())
    ).rejects.toThrow("broadcast");
  });

  it("rejects Twitch credentials missing channel metadata scope", async () => {
    await expect(
      applyTwitchChannelMetadata(createDefaultStudioProfile(), {
        ...twitchCredential(),
        scopes: ["chat:read", "channel:read:stream_key"]
      }, vi.fn())
    ).rejects.toThrow("channel:manage:broadcast");
  });
});
