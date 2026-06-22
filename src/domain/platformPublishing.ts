import {
  TWITCH_CHANNEL_MANAGE_SCOPE,
  YOUTUBE_LIVE_MANAGE_SCOPE,
  type PlatformChatOAuthCredential
} from "./platformChatOAuth";
import {
  normalizePlatformPublishingSettings,
  type PlatformPublishingSettings,
  type StudioProfile
} from "./profiles";
import type { PlatformChatFetch } from "./platformChatConnection";

export interface PlatformPublishingResult {
  profile: StudioProfile;
  message: string;
}

export class PlatformPublishingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformPublishingError";
  }
}

interface YouTubeLiveBroadcastResource {
  id?: string;
  snippet?: {
    title?: string;
    liveChatId?: string;
    scheduledStartTime?: string;
  };
  contentDetails?: {
    boundStreamId?: string;
  };
  status?: {
    privacyStatus?: string;
    lifeCycleStatus?: string;
  };
}

interface TwitchCategorySearchResponse {
  data?: Array<{
    id?: string;
    name?: string;
  }>;
}

interface TwitchCategoryResult {
  id: string;
  name: string;
}

const YOUTUBE_LIVE_BROADCASTS_URL = "https://www.googleapis.com/youtube/v3/liveBroadcasts";
const TWITCH_CHANNELS_URL = "https://api.twitch.tv/helix/channels";
const TWITCH_SEARCH_CATEGORIES_URL = "https://api.twitch.tv/helix/search/categories";

export const createYouTubeBroadcastAndBindStream = async (
  profile: StudioProfile,
  credential: PlatformChatOAuthCredential | null,
  fetcher: PlatformChatFetch,
  now: number = Date.now()
): Promise<PlatformPublishingResult> => {
  const normalizedCredential = requirePlatformCredential(credential, "youtube");
  requireScope(normalizedCredential, YOUTUBE_LIVE_MANAGE_SCOPE, "YouTube broadcast setup requires OAuth scope youtube.force-ssl.");
  const settings = normalizePlatformPublishingSettings(profile.platformPublishing);

  if (!settings.youtubeStreamId) {
    throw new PlatformPublishingError("Create or sync a YouTube stream key before creating a bound broadcast.");
  }

  const scheduledStartTime = new Date(now + settings.scheduledStartMinutesFromNow * 60000).toISOString();
  const insertResponse = await fetcher(`${YOUTUBE_LIVE_BROADCASTS_URL}?${createQueryParams({ part: "snippet,status,contentDetails" })}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${normalizedCredential.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      snippet: {
        title: settings.title,
        description: settings.description,
        scheduledStartTime
      },
      status: {
        privacyStatus: settings.privacyStatus,
        selfDeclaredMadeForKids: settings.madeForKids
      },
      contentDetails: {
        enableAutoStart: settings.enableAutoStart,
        enableAutoStop: settings.enableAutoStop,
        enableDvr: true,
        recordFromStart: true,
        monitorStream: {
          enableMonitorStream: false
        }
      }
    })
  });
  const inserted = (await insertResponse.json()) as YouTubeLiveBroadcastResource;

  if (!insertResponse.ok) {
    throw new PlatformPublishingError(`YouTube broadcast creation failed with HTTP ${insertResponse.status}.`);
  }

  const broadcastId = normalizeSingleLine(inserted.id);
  if (!broadcastId) {
    throw new PlatformPublishingError("YouTube broadcast creation response did not include a broadcast ID.");
  }

  const bindResponse = await fetcher(
    `${YOUTUBE_LIVE_BROADCASTS_URL}/bind?${createQueryParams({
      id: broadcastId,
      part: "snippet,contentDetails,status",
      streamId: settings.youtubeStreamId
    })}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${normalizedCredential.accessToken}`
      }
    }
  );
  const bound = (await bindResponse.json()) as YouTubeLiveBroadcastResource;

  if (!bindResponse.ok) {
    throw new PlatformPublishingError(`YouTube broadcast bind failed with HTTP ${bindResponse.status}.`);
  }

  const liveChatId = normalizeSingleLine(bound.snippet?.liveChatId || inserted.snippet?.liveChatId);
  const nextPublishing: PlatformPublishingSettings = {
    ...settings,
    youtubeBroadcastId: broadcastId,
    youtubeLiveChatId: liveChatId,
    youtubeStreamId: normalizeSingleLine(bound.contentDetails?.boundStreamId) || settings.youtubeStreamId
  };

  return {
    profile: {
      ...profile,
      platformPublishing: nextPublishing,
      platformChat: liveChatId
        ? {
            ...profile.platformChat,
            youtubeLiveChatId: liveChatId
          }
        : profile.platformChat
    },
    message: `YouTube broadcast "${bound.snippet?.title || settings.title}" created and bound to the saved stream.`
  };
};

export const applyTwitchChannelMetadata = async (
  profile: StudioProfile,
  credential: PlatformChatOAuthCredential | null,
  fetcher: PlatformChatFetch
): Promise<PlatformPublishingResult> => {
  const normalizedCredential = requirePlatformCredential(credential, "twitch");
  requireScope(normalizedCredential, TWITCH_CHANNEL_MANAGE_SCOPE, "Twitch channel metadata update requires OAuth scope channel:manage:broadcast.");
  const settings = normalizePlatformPublishingSettings(profile.platformPublishing);

  if (!normalizedCredential.twitchUserId) {
    throw new PlatformPublishingError("Twitch broadcaster user ID is required. Reconnect OAuth first.");
  }
  if (!normalizedCredential.clientId) {
    throw new PlatformPublishingError("Twitch OAuth client ID is required. Reconnect OAuth first.");
  }

  const category = settings.twitchCategoryId
    ? { id: settings.twitchCategoryId, name: settings.twitchCategory }
    : await resolveTwitchCategory(settings.twitchCategory, normalizedCredential, fetcher);
  const body: Record<string, string> = {};

  if (settings.title) {
    body.title = settings.title;
  }
  if (category.id) {
    body.game_id = category.id;
  }
  if (settings.twitchLanguage) {
    body.broadcaster_language = settings.twitchLanguage;
  }
  if (Object.keys(body).length === 0) {
    throw new PlatformPublishingError("Twitch channel metadata has no fields to update.");
  }

  const response = await fetcher(
    `${TWITCH_CHANNELS_URL}?broadcaster_id=${encodeURIComponent(normalizedCredential.twitchUserId)}`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${normalizedCredential.accessToken}`,
        "Client-Id": normalizedCredential.clientId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    throw new PlatformPublishingError(`Twitch channel metadata update failed with HTTP ${response.status}.`);
  }

  return {
    profile: {
      ...profile,
      platformPublishing: {
        ...settings,
        twitchCategory: category.name || settings.twitchCategory,
        twitchCategoryId: category.id || settings.twitchCategoryId
      }
    },
    message: `Twitch channel metadata updated${category.name ? ` for ${category.name}` : ""}.`
  };
};

const resolveTwitchCategory = async (
  categoryName: string,
  credential: PlatformChatOAuthCredential,
  fetcher: PlatformChatFetch
): Promise<TwitchCategoryResult> => {
  const query = normalizeSingleLine(categoryName);
  if (!query) {
    return { id: "", name: "" };
  }

  const response = await fetcher(`${TWITCH_SEARCH_CATEGORIES_URL}?${createQueryParams({ query, first: "10" })}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${credential.accessToken}`,
      "Client-Id": credential.clientId ?? ""
    }
  });
  const payload = (await response.json()) as TwitchCategorySearchResponse;

  if (!response.ok) {
    throw new PlatformPublishingError(`Twitch category search failed with HTTP ${response.status}.`);
  }

  const categories = (payload.data ?? [])
    .map((category) => ({
      id: normalizeSingleLine(category.id),
      name: normalizeSingleLine(category.name)
    }))
    .filter((category) => category.id && category.name);
  const normalizedQuery = query.toLowerCase();
  const match = categories.find((category) => category.name.toLowerCase() === normalizedQuery) ?? categories[0];

  if (!match) {
    throw new PlatformPublishingError(`Twitch category "${query}" was not found.`);
  }

  return match;
};

const requirePlatformCredential = (
  credential: PlatformChatOAuthCredential | null,
  platform: PlatformChatOAuthCredential["platform"]
): PlatformChatOAuthCredential => {
  if (!credential || credential.platform !== platform || !credential.accessToken) {
    throw new PlatformPublishingError(`${platform === "youtube" ? "YouTube" : "Twitch"} OAuth credential is required.`);
  }
  return credential;
};

const requireScope = (credential: PlatformChatOAuthCredential, scope: string, message: string) => {
  if (!credential.scopes.includes(scope)) {
    throw new PlatformPublishingError(message);
  }
};

const createQueryParams = (params: Record<string, string>): string => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.set(key, value);
  }
  return query.toString();
};

const normalizeSingleLine = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
