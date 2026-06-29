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
import {
  getPlatformHttpFailureMetadata,
  type PlatformChatFetch
} from "./platformChatConnection";

export interface PlatformPublishingResult {
  profile: StudioProfile;
  message: string;
}

export type YouTubeBroadcastTransitionStatus = "testing" | "live" | "complete";

export class PlatformPublishingError extends Error {
  readonly statusCode: number | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    {
      statusCode = null,
      retryable = false,
      retryAfterMs = null
    }: {
      statusCode?: number | null;
      retryable?: boolean;
      retryAfterMs?: number | null;
    } = {}
  ) {
    super(message);
    this.name = "PlatformPublishingError";
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
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

interface YouTubeLiveBroadcastListResponse {
  items?: YouTubeLiveBroadcastResource[];
}

interface YouTubeLiveStreamHealthIssue {
  type?: string;
  severity?: string;
  reason?: string;
  description?: string;
}

interface YouTubeLiveStreamResource {
  id?: string;
  status?: {
    streamStatus?: string;
    healthStatus?: {
      status?: string;
      configurationIssues?: YouTubeLiveStreamHealthIssue[];
    };
  };
}

interface YouTubeLiveStreamListResponse {
  items?: YouTubeLiveStreamResource[];
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

interface TwitchChannelInformationResponse {
  data?: TwitchChannelInformationResource[];
}

interface TwitchChannelInformationResource {
  broadcaster_language?: string;
  game_id?: string;
  game_name?: string;
  title?: string;
}

interface TwitchStreamsResponse {
  data?: TwitchStreamResource[];
}

interface TwitchStreamResource {
  game_id?: string;
  game_name?: string;
  type?: string;
  title?: string;
  viewer_count?: number;
  started_at?: string;
  language?: string;
}

const YOUTUBE_LIVE_BROADCASTS_URL = "https://www.googleapis.com/youtube/v3/liveBroadcasts";
const YOUTUBE_LIVE_STREAMS_URL = "https://www.googleapis.com/youtube/v3/liveStreams";
const TWITCH_CHANNELS_URL = "https://api.twitch.tv/helix/channels";
const TWITCH_SEARCH_CATEGORIES_URL = "https://api.twitch.tv/helix/search/categories";
const TWITCH_STREAMS_URL = "https://api.twitch.tv/helix/streams";

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
          enableMonitorStream: true
        }
      }
    })
  });
  assertPlatformPublishingResponseOk(insertResponse, "YouTube broadcast creation");
  const inserted = await readPlatformPublishingJson<YouTubeLiveBroadcastResource>(
    insertResponse,
    "YouTube broadcast creation"
  );

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
  assertPlatformPublishingResponseOk(bindResponse, "YouTube broadcast bind");
  const bound = await readPlatformPublishingJson<YouTubeLiveBroadcastResource>(bindResponse, "YouTube broadcast bind");

  const liveChatId = normalizeSingleLine(bound.snippet?.liveChatId || inserted.snippet?.liveChatId);
  const boundStreamId = normalizeSingleLine(bound.contentDetails?.boundStreamId) || settings.youtubeStreamId;
  const nextPublishing: PlatformPublishingSettings = {
    ...settings,
    youtubeBroadcastId: broadcastId,
    youtubeBroadcastBoundStreamId: boundStreamId,
    youtubeLiveChatId: liveChatId,
    youtubeBroadcastStatus: normalizeSingleLine(bound.status?.lifeCycleStatus || inserted.status?.lifeCycleStatus) || "created",
    youtubeBroadcastPrivacyStatus: normalizeYouTubePrivacyStatus(bound.status?.privacyStatus || inserted.status?.privacyStatus) || settings.privacyStatus,
    youtubeStreamId: settings.youtubeStreamId || boundStreamId,
    youtubeStatusCheckedAt: new Date(now).toISOString()
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

export const transitionYouTubeBroadcast = async (
  profile: StudioProfile,
  credential: PlatformChatOAuthCredential | null,
  broadcastStatus: YouTubeBroadcastTransitionStatus,
  fetcher: PlatformChatFetch,
  now: number = Date.now()
): Promise<PlatformPublishingResult> => {
  const normalizedCredential = requirePlatformCredential(credential, "youtube");
  requireScope(normalizedCredential, YOUTUBE_LIVE_MANAGE_SCOPE, "YouTube broadcast transition requires OAuth scope youtube.force-ssl.");
  const settings = normalizePlatformPublishingSettings(profile.platformPublishing);

  if (!settings.youtubeBroadcastId) {
    throw new PlatformPublishingError("Create a YouTube broadcast before changing its lifecycle state.");
  }

  const response = await fetcher(
    `${YOUTUBE_LIVE_BROADCASTS_URL}/transition?${createQueryParams({
      broadcastStatus,
      id: settings.youtubeBroadcastId,
      part: "snippet,contentDetails,status"
    })}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${normalizedCredential.accessToken}`
      }
    }
  );
  assertPlatformPublishingResponseOk(response, `YouTube broadcast transition to ${broadcastStatus}`);
  const payload = await readPlatformPublishingJson<YouTubeLiveBroadcastResource>(
    response,
    `YouTube broadcast transition to ${broadcastStatus}`
  );

  const liveChatId = normalizeSingleLine(payload.snippet?.liveChatId || settings.youtubeLiveChatId);
  const nextStatus = normalizeSingleLine(payload.status?.lifeCycleStatus) || broadcastStatus;
  const nextPrivacyStatus = normalizeYouTubePrivacyStatus(payload.status?.privacyStatus) || settings.youtubeBroadcastPrivacyStatus;
  const nextBoundStreamId = normalizeSingleLine(payload.contentDetails?.boundStreamId) || settings.youtubeBroadcastBoundStreamId;

  return {
    profile: {
      ...profile,
      platformPublishing: {
        ...settings,
        youtubeBroadcastStatus: nextStatus,
        youtubeBroadcastBoundStreamId: nextBoundStreamId,
        youtubeBroadcastPrivacyStatus: nextPrivacyStatus,
        youtubeLiveChatId: liveChatId,
        youtubeStatusCheckedAt: new Date(now).toISOString()
      },
      platformChat: liveChatId
        ? {
            ...profile.platformChat,
            youtubeLiveChatId: liveChatId
          }
        : profile.platformChat
    },
    message: `YouTube broadcast transition requested: ${nextStatus}.`
  };
};

export const refreshYouTubeBroadcastStatus = async (
  profile: StudioProfile,
  credential: PlatformChatOAuthCredential | null,
  fetcher: PlatformChatFetch,
  now: number = Date.now()
): Promise<PlatformPublishingResult> => {
  const normalizedCredential = requirePlatformCredential(credential, "youtube");
  requireScope(normalizedCredential, YOUTUBE_LIVE_MANAGE_SCOPE, "YouTube broadcast status refresh requires OAuth scope youtube.force-ssl.");
  const settings = normalizePlatformPublishingSettings(profile.platformPublishing);

  if (!settings.youtubeBroadcastId) {
    throw new PlatformPublishingError("Create a YouTube broadcast before refreshing its status.");
  }

  const broadcastResponse = await fetcher(
    `${YOUTUBE_LIVE_BROADCASTS_URL}?${createQueryParams({
      id: settings.youtubeBroadcastId,
      part: "snippet,contentDetails,status"
    })}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${normalizedCredential.accessToken}`
      }
    }
  );
  assertPlatformPublishingResponseOk(broadcastResponse, "YouTube broadcast status request");
  const broadcastPayload = await readPlatformPublishingJson<YouTubeLiveBroadcastListResponse>(
    broadcastResponse,
    "YouTube broadcast status request"
  );

  const broadcast = broadcastPayload.items?.[0];
  if (!broadcast) {
    throw new PlatformPublishingError("YouTube broadcast status response did not include the saved broadcast.");
  }

  const boundStreamId = normalizeSingleLine(broadcast.contentDetails?.boundStreamId);
  const streamStatusLookupId = boundStreamId || settings.youtubeStreamId;
  const liveChatId = normalizeSingleLine(broadcast.snippet?.liveChatId || settings.youtubeLiveChatId);
  const nextPublishing: PlatformPublishingSettings = {
    ...settings,
    youtubeBroadcastStatus: normalizeSingleLine(broadcast.status?.lifeCycleStatus) || settings.youtubeBroadcastStatus,
    youtubeBroadcastBoundStreamId: boundStreamId || settings.youtubeBroadcastBoundStreamId,
    youtubeBroadcastPrivacyStatus: normalizeYouTubePrivacyStatus(broadcast.status?.privacyStatus) || settings.youtubeBroadcastPrivacyStatus,
    youtubeLiveChatId: liveChatId,
    youtubeStreamId: settings.youtubeStreamId || boundStreamId,
    youtubeStreamStatus: settings.youtubeStreamStatus,
    youtubeStreamHealthStatus: settings.youtubeStreamHealthStatus,
    youtubeStreamHealthIssues: settings.youtubeStreamHealthIssues,
    youtubeStatusCheckedAt: new Date(now).toISOString()
  };

  if (streamStatusLookupId) {
    const streamResponse = await fetcher(
      `${YOUTUBE_LIVE_STREAMS_URL}?${createQueryParams({
        id: streamStatusLookupId,
        part: "status"
      })}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${normalizedCredential.accessToken}`
        }
      }
    );
    assertPlatformPublishingResponseOk(streamResponse, "YouTube stream status request");
    const streamPayload = await readPlatformPublishingJson<YouTubeLiveStreamListResponse>(
      streamResponse,
      "YouTube stream status request"
    );

    const stream = streamPayload.items?.[0];
    if (stream) {
      nextPublishing.youtubeStreamStatus = normalizeSingleLine(stream.status?.streamStatus);
      nextPublishing.youtubeStreamHealthStatus = normalizeSingleLine(stream.status?.healthStatus?.status);
      nextPublishing.youtubeStreamHealthIssues = (stream.status?.healthStatus?.configurationIssues ?? [])
        .map(formatYouTubeHealthIssue)
        .filter(Boolean)
        .slice(0, 12);
    }
  }

  const statusSummary = [
    `broadcast ${nextPublishing.youtubeBroadcastStatus || "unknown"}`,
    streamStatusLookupId ? `stream ${nextPublishing.youtubeStreamStatus || "unknown"}` : "no bound stream"
  ].join(", ");

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
    message: `YouTube status refreshed: ${statusSummary}.`
  };
};

export const refreshTwitchChannelStatus = async (
  profile: StudioProfile,
  credential: PlatformChatOAuthCredential | null,
  fetcher: PlatformChatFetch,
  now: number = Date.now()
): Promise<PlatformPublishingResult> => {
  const normalizedCredential = requirePlatformCredential(credential, "twitch");
  const settings = normalizePlatformPublishingSettings(profile.platformPublishing);

  if (!normalizedCredential.twitchUserId) {
    throw new PlatformPublishingError("Twitch broadcaster user ID is required. Reconnect OAuth first.");
  }
  if (!normalizedCredential.clientId) {
    throw new PlatformPublishingError("Twitch OAuth client ID is required. Reconnect OAuth first.");
  }

  const channelResponse = await fetcher(
    `${TWITCH_CHANNELS_URL}?${createQueryParams({ broadcaster_id: normalizedCredential.twitchUserId })}`,
    {
      headers: createTwitchJsonHeaders(normalizedCredential)
    }
  );
  assertPlatformPublishingResponseOk(channelResponse, "Twitch channel status request");
  const channelPayload = await readPlatformPublishingJson<TwitchChannelInformationResponse>(
    channelResponse,
    "Twitch channel status request"
  );

  const channel = channelPayload.data?.[0];
  if (!channel) {
    throw new PlatformPublishingError("Twitch channel status response did not include the broadcaster channel.");
  }

  const streamResponse = await fetcher(
    `${TWITCH_STREAMS_URL}?${createQueryParams({ user_id: normalizedCredential.twitchUserId })}`,
    {
      headers: createTwitchJsonHeaders(normalizedCredential)
    }
  );
  assertPlatformPublishingResponseOk(streamResponse, "Twitch stream status request");
  const streamPayload = await readPlatformPublishingJson<TwitchStreamsResponse>(
    streamResponse,
    "Twitch stream status request"
  );

  const stream = streamPayload.data?.[0];
  const channelTitle = normalizeSingleLine(channel.title);
  const streamTitle = normalizeSingleLine(stream?.title);
  const categoryId = normalizeSingleLine(channel.game_id || stream?.game_id);
  const categoryName = normalizeSingleLine(channel.game_name || stream?.game_name);
  const language = normalizeSingleLine(channel.broadcaster_language || stream?.language).toLowerCase();
  const liveStatus = stream ? normalizeSingleLine(stream.type) || "live" : "offline";
  const viewerCount = stream ? normalizeViewerCount(stream.viewer_count) : 0;
  const startedAt = stream ? normalizeSingleLine(stream.started_at) : "";

  const nextPublishing: PlatformPublishingSettings = normalizePlatformPublishingSettings({
    ...settings,
    twitchChannelTitle: channelTitle || streamTitle,
    twitchChannelCategory: categoryName,
    twitchChannelCategoryId: categoryId,
    twitchChannelLanguage: language,
    twitchLiveStatus: liveStatus,
    twitchViewerCount: viewerCount,
    twitchStartedAt: startedAt,
    twitchStatusCheckedAt: new Date(now).toISOString()
  });

  const statusSummary =
    liveStatus === "offline" ? "offline" : `${liveStatus}, ${nextPublishing.twitchViewerCount.toLocaleString()} viewers`;

  return {
    profile: {
      ...profile,
      platformPublishing: nextPublishing
    },
    message: `Twitch status refreshed: ${statusSummary}.`
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

  assertPlatformPublishingResponseOk(response, "Twitch channel metadata update");

  return {
    profile: {
      ...profile,
      platformPublishing: normalizePlatformPublishingSettings({
        ...settings,
        twitchCategory: category.name || settings.twitchCategory,
        twitchCategoryId: category.id || settings.twitchCategoryId,
        twitchChannelTitle: settings.title,
        twitchChannelCategory: category.name || settings.twitchCategory,
        twitchChannelCategoryId: category.id || settings.twitchCategoryId,
        twitchChannelLanguage: settings.twitchLanguage
      })
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
  assertPlatformPublishingResponseOk(response, "Twitch category search");
  const payload = await readPlatformPublishingJson<TwitchCategorySearchResponse>(response, "Twitch category search");

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

const assertPlatformPublishingResponseOk = (
  response: Awaited<ReturnType<PlatformChatFetch>>,
  operation: string
) => {
  if (!response.ok) {
    throw new PlatformPublishingError(`${operation} failed with HTTP ${response.status}.`, getPlatformHttpFailureMetadata(response));
  }
};

const readPlatformPublishingJson = async <T>(
  response: Awaited<ReturnType<PlatformChatFetch>>,
  operation: string
): Promise<T> => {
  try {
    return (await response.json()) as T;
  } catch {
    throw new PlatformPublishingError(`${operation} returned unreadable JSON with HTTP ${response.status}.`, {
      statusCode: response.status
    });
  }
};

const createQueryParams = (params: Record<string, string>): string => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.set(key, value);
  }
  return query.toString();
};

const createTwitchJsonHeaders = (credential: PlatformChatOAuthCredential): Record<string, string> => ({
  Accept: "application/json",
  Authorization: `Bearer ${credential.accessToken}`,
  "Client-Id": credential.clientId ?? ""
});

const normalizeViewerCount = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
};

const formatYouTubeHealthIssue = (issue: YouTubeLiveStreamHealthIssue): string => {
  const severity = normalizeSingleLine(issue?.severity);
  const type = normalizeSingleLine(issue?.type);
  const reason = normalizeSingleLine(issue?.reason);
  const description = normalizeSingleLine(issue?.description);
  return [severity, type, reason || description].filter(Boolean).join(": ");
};

const normalizeSingleLine = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

const normalizeYouTubePrivacyStatus = (value: unknown): PlatformPublishingSettings["privacyStatus"] | "" => {
  const normalized = normalizeSingleLine(value).toLowerCase();
  return normalized === "private" || normalized === "unlisted" || normalized === "public" ? normalized : "";
};
