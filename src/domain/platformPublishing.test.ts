import { describe, expect, it, vi } from "vitest";
import type { PlatformChatOAuthCredential } from "./platformChatOAuth";
import type { PlatformChatFetch } from "./platformChatConnection";
import {
  applyTwitchChannelMetadata,
  createYouTubeBroadcastAndBindStream,
  PlatformPublishingError,
  refreshTwitchChannelStatus,
  refreshYouTubeBroadcastStatus,
  transitionYouTubeBroadcast
} from "./platformPublishing";
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
  redirectUri: "com.mobilelivecaster.app:/oauth/youtube"
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
            status: {
              privacyStatus: "unlisted"
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
    expect(result.profile.platformPublishing.youtubeBroadcastBoundStreamId).toBe("stream-1");
    expect(result.profile.platformPublishing.youtubeLiveChatId).toBe("chat-1");
    expect(result.profile.platformPublishing.youtubeBroadcastPrivacyStatus).toBe("unlisted");
    expect(result.profile.platformPublishing.youtubeStatusCheckedAt).toBe("2026-01-01T00:00:00.000Z");
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
          lifeCycleStatus: "live",
          privacyStatus: "public"
        }
      })
    }));

    const result = await transitionYouTubeBroadcast(
      profile,
      youtubeCredential(),
      "live",
      fetcher,
      Date.parse("2026-06-23T00:03:00.000Z")
    );

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
    expect(result.profile.platformPublishing.youtubeBroadcastBoundStreamId).toBe("");
    expect(result.profile.platformPublishing.youtubeBroadcastPrivacyStatus).toBe("public");
    expect(result.profile.platformPublishing.youtubeLiveChatId).toBe("chat-2");
    expect(result.profile.platformPublishing.youtubeStatusCheckedAt).toBe("2026-06-23T00:03:00.000Z");
    expect(result.profile.platformChat.youtubeLiveChatId).toBe("chat-2");
  });

  it("refreshes YouTube broadcast and ingest stream status", async () => {
    const profile = {
      ...createDefaultStudioProfile(),
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        youtubeBroadcastId: "broadcast-1",
        youtubeStreamId: "stream-1"
      }
    };
    const fetcher = vi.fn(async (...args: Parameters<PlatformChatFetch>) => {
      const [url] = args;
      if (url.startsWith("https://www.googleapis.com/youtube/v3/liveStreams")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: "stream-1",
                status: {
                  streamStatus: "active",
                  healthStatus: {
                    status: "ok",
                    configurationIssues: [
                      {
                        severity: "warning",
                        type: "bitrateLow",
                        reason: "Video output low",
                        description: "Bitrate is below target."
                      }
                    ]
                  }
                }
              }
            ]
          })
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: "broadcast-1",
              snippet: {
                liveChatId: "chat-1"
              },
              contentDetails: {
                boundStreamId: "stream-1"
              },
              status: {
                lifeCycleStatus: "testing",
                privacyStatus: "private"
              }
            }
          ]
        })
      };
    });

    const result = await refreshYouTubeBroadcastStatus(profile, youtubeCredential(), fetcher, Date.parse("2026-06-23T00:00:00.000Z"));

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://www.googleapis.com/youtube/v3/liveBroadcasts?id=broadcast-1&part=snippet%2CcontentDetails%2Cstatus"
    );
    expect(fetcher.mock.calls[1][0]).toBe("https://www.googleapis.com/youtube/v3/liveStreams?id=stream-1&part=status");
    expect(fetcher.mock.calls[0][0]).not.toContain("yt-access");
    expect(result.profile.platformPublishing.youtubeBroadcastStatus).toBe("testing");
    expect(result.profile.platformPublishing.youtubeBroadcastBoundStreamId).toBe("stream-1");
    expect(result.profile.platformPublishing.youtubeBroadcastPrivacyStatus).toBe("private");
    expect(result.profile.platformPublishing.youtubeStreamStatus).toBe("active");
    expect(result.profile.platformPublishing.youtubeStreamHealthStatus).toBe("ok");
    expect(result.profile.platformPublishing.youtubeStreamHealthIssues).toEqual(["warning: bitrateLow: Video output low"]);
    expect(result.profile.platformPublishing.youtubeStatusCheckedAt).toBe("2026-06-23T00:00:00.000Z");
    expect(result.profile.platformChat.youtubeLiveChatId).toBe("chat-1");
  });

  it("keeps the saved YouTube stream ID when a refreshed broadcast is bound to another stream", async () => {
    const profile = {
      ...createDefaultStudioProfile(),
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        youtubeBroadcastId: "broadcast-1",
        youtubeStreamId: "saved-stream"
      }
    };
    const fetcher = vi.fn(async (...args: Parameters<PlatformChatFetch>) => {
      const [url] = args;
      if (url.startsWith("https://www.googleapis.com/youtube/v3/liveStreams")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: "bound-stream",
                status: {
                  streamStatus: "active",
                  healthStatus: { status: "ok", configurationIssues: [] }
                }
              }
            ]
          })
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: "broadcast-1",
              contentDetails: {
                boundStreamId: "bound-stream"
              },
              status: {
                lifeCycleStatus: "testing",
                privacyStatus: "private"
              }
            }
          ]
        })
      };
    });

    const result = await refreshYouTubeBroadcastStatus(profile, youtubeCredential(), fetcher, Date.parse("2026-06-23T00:06:00.000Z"));

    expect(fetcher.mock.calls[1][0]).toBe("https://www.googleapis.com/youtube/v3/liveStreams?id=bound-stream&part=status");
    expect(result.profile.platformPublishing.youtubeStreamId).toBe("saved-stream");
    expect(result.profile.platformPublishing.youtubeBroadcastBoundStreamId).toBe("bound-stream");
    expect(result.profile.platformPublishing.youtubeStreamStatus).toBe("active");
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

  it("refreshes Twitch channel metadata and live stream status", async () => {
    const profile = {
      ...applyDestinationPreset(createDefaultStudioProfile(), "twitch-auto"),
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        title: "Old title",
        twitchCategory: "Just Chatting",
        twitchCategoryId: "509658",
        twitchLanguage: "en"
      }
    };
    const fetcher = vi.fn(async (...args: Parameters<PlatformChatFetch>) => {
      const [url] = args;
      if (url.startsWith("https://api.twitch.tv/helix/streams")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                type: "live",
                title: "Live title",
                game_id: "509658",
                game_name: "Just Chatting",
                viewer_count: 1234,
                started_at: "2026-06-22T12:00:00Z",
                language: "ja"
              }
            ]
          })
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              broadcaster_language: "en",
              game_id: "509660",
              game_name: "Art",
              title: "Drawing stream"
            }
          ]
        })
      };
    });

    const result = await refreshTwitchChannelStatus(
      profile,
      {
        ...twitchCredential(),
        scopes: ["chat:read"]
      },
      fetcher,
      Date.parse("2026-06-23T00:01:00.000Z")
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.twitch.tv/helix/channels?broadcaster_id=12345");
    expect(fetcher.mock.calls[1][0]).toBe("https://api.twitch.tv/helix/streams?user_id=12345");
    expect(fetcher.mock.calls[0][0]).not.toContain("tw-access");
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      headers: {
        Authorization: "Bearer tw-access",
        "Client-Id": "twitch-client"
      }
    });
    expect(result.profile.platformPublishing.title).toBe("Drawing stream");
    expect(result.profile.platformPublishing.twitchCategory).toBe("Art");
    expect(result.profile.platformPublishing.twitchCategoryId).toBe("509660");
    expect(result.profile.platformPublishing.twitchLanguage).toBe("ja");
    expect(result.profile.platformPublishing.twitchLiveStatus).toBe("live");
    expect(result.profile.platformPublishing.twitchViewerCount).toBe(1234);
    expect(result.profile.platformPublishing.twitchStartedAt).toBe("2026-06-22T12:00:00Z");
    expect(result.profile.platformPublishing.twitchStatusCheckedAt).toBe("2026-06-23T00:01:00.000Z");
  });

  it("marks Twitch status offline when no active stream is returned", async () => {
    const profile = applyDestinationPreset(createDefaultStudioProfile(), "twitch-auto");
    const fetcher = vi.fn(async (...args: Parameters<PlatformChatFetch>) => {
      const [url] = args;
      if (url.startsWith("https://api.twitch.tv/helix/streams")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [] })
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              broadcaster_language: "ja",
              game_id: "509658",
              game_name: "Just Chatting",
              title: "Offline setup"
            }
          ]
        })
      };
    });

    const result = await refreshTwitchChannelStatus(profile, twitchCredential(), fetcher, Date.parse("2026-06-23T00:02:00.000Z"));

    expect(result.profile.platformPublishing.title).toBe("Offline setup");
    expect(result.profile.platformPublishing.twitchLiveStatus).toBe("offline");
    expect(result.profile.platformPublishing.twitchViewerCount).toBe(0);
    expect(result.profile.platformPublishing.twitchStartedAt).toBe("");
    expect(result.profile.platformPublishing.twitchStatusCheckedAt).toBe("2026-06-23T00:02:00.000Z");
    expect(result.message).toBe("Twitch status refreshed: offline.");
  });

  it("fails safely when platform publishing HTTP errors have unreadable JSON bodies", async () => {
    const profile = {
      ...createDefaultStudioProfile(),
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        youtubeStreamId: "stream-1"
      }
    };
    const json = vi.fn(async () => {
      throw new Error("raw upstream body with yt-access token");
    });
    const fetcher = vi.fn(async (..._args: Parameters<PlatformChatFetch>) => ({
      ok: false,
      status: 503,
      headers: {
        get: (name: string) => (name.toLowerCase() === "retry-after" ? "7" : null)
      },
      json
    }));

    await expect(createYouTubeBroadcastAndBindStream(profile, youtubeCredential(), fetcher)).rejects.toThrow(
      "YouTube broadcast creation failed with HTTP 503."
    );
    await expect(createYouTubeBroadcastAndBindStream(profile, youtubeCredential(), fetcher)).rejects.toMatchObject({
      name: "PlatformPublishingError",
      statusCode: 503,
      retryable: true,
      retryAfterMs: 7000
    } satisfies Partial<PlatformPublishingError>);
    expect(json).not.toHaveBeenCalled();
  });

  it("fails safely when a successful platform publishing response is not JSON", async () => {
    const profile = {
      ...createDefaultStudioProfile(),
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        youtubeBroadcastId: "broadcast-1"
      }
    };
    const fetcher = vi.fn(async (..._args: Parameters<PlatformChatFetch>) => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("html outage page with tw-access token");
      }
    }));

    await expect(refreshYouTubeBroadcastStatus(profile, youtubeCredential(), fetcher)).rejects.toThrow(
      "YouTube broadcast status request returned unreadable JSON with HTTP 200."
    );
    await expect(refreshYouTubeBroadcastStatus(profile, youtubeCredential(), fetcher)).rejects.toMatchObject({
      statusCode: 200,
      retryable: false,
      retryAfterMs: null
    } satisfies Partial<PlatformPublishingError>);
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

  it("keeps retry metadata when Twitch channel metadata update is rate-limited", async () => {
    const profile = {
      ...applyDestinationPreset(createDefaultStudioProfile(), "twitch-auto"),
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        title: "Drawing stream",
        twitchCategory: "Art",
        twitchCategoryId: "509660",
        twitchLanguage: "ja"
      }
    };
    const fetcher = vi.fn(async (..._args: Parameters<PlatformChatFetch>) => ({
      ok: false,
      status: 429,
      headers: {
        get: (name: string) => (name.toLowerCase() === "retry-after" ? "13" : null)
      },
      json: async () => ({ status: 429 })
    }));

    await expect(applyTwitchChannelMetadata(profile, twitchCredential(), fetcher)).rejects.toMatchObject({
      name: "PlatformPublishingError",
      statusCode: 429,
      retryable: true,
      retryAfterMs: 13000
    } satisfies Partial<PlatformPublishingError>);
  });
});
