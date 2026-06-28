import {
  TWITCH_STREAM_KEY_SCOPE,
  YOUTUBE_LIVE_MANAGE_SCOPE,
  type PlatformChatOAuthCredential
} from "./platformChatOAuth";
import {
  createDestinationFromPreset,
  getDestinationPreset,
  type DestinationPresetId,
  type DestinationProfile,
  type QualityProfile,
  type StudioProfile
} from "./profiles";
import {
  getPlatformHttpFailureMetadata,
  type PlatformChatFetch
} from "./platformChatConnection";

export interface PlatformStreamKeyResult {
  profile: StudioProfile;
  message: string;
  destination: DestinationProfile;
}

export class PlatformStreamKeyError extends Error {
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
    this.name = "PlatformStreamKeyError";
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

interface YouTubeLiveStreamResource {
  id?: string;
  snippet?: {
    title?: string;
  };
  cdn?: {
    ingestionInfo?: {
      streamName?: string;
      ingestionAddress?: string;
      rtmpsIngestionAddress?: string;
    };
  };
}

interface TwitchStreamKeyResponse {
  data?: Array<{
    stream_key?: string;
  }>;
}

const YOUTUBE_LIVE_STREAMS_URL = "https://www.googleapis.com/youtube/v3/liveStreams";
const TWITCH_STREAM_KEY_URL = "https://api.twitch.tv/helix/streams/key";

export const rotateYouTubeStreamKey = async (
  profile: StudioProfile,
  credential: PlatformChatOAuthCredential | null,
  fetcher: PlatformChatFetch,
  now: number = Date.now()
): Promise<PlatformStreamKeyResult> => {
  const normalizedCredential = requirePlatformCredential(credential, "youtube");
  requireScope(normalizedCredential, YOUTUBE_LIVE_MANAGE_SCOPE, "YouTube stream key rotation requires OAuth scope youtube.force-ssl.");

  const response = await fetcher(`${YOUTUBE_LIVE_STREAMS_URL}?part=snippet%2Ccdn%2CcontentDetails`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${normalizedCredential.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      snippet: {
        title: `MobileLiveCaster ${new Date(now).toISOString()}`
      },
      cdn: {
        ingestionType: "rtmp",
        frameRate: qualityToYouTubeFrameRate(profile.quality),
        resolution: qualityToYouTubeResolution(profile.quality)
      },
      contentDetails: {
        isReusable: true
      }
    })
  });
  assertPlatformStreamKeyResponseOk(response, "YouTube live stream creation");
  const payload = await readPlatformStreamKeyJson<YouTubeLiveStreamResource>(
    response,
    "YouTube live stream creation"
  );

  const destination = createYouTubeDestinationFromStream(profile.destination, payload);
  const youtubeStreamId = normalizeSingleLine(payload.id);
  return {
    profile: {
      ...profile,
      destination,
      platformPublishing: {
        ...profile.platformPublishing,
        youtubeStreamId: youtubeStreamId || profile.platformPublishing.youtubeStreamId,
        youtubeBroadcastId: "",
        youtubeBroadcastBoundStreamId: "",
        youtubeLiveChatId: "",
        youtubeBroadcastStatus: "",
        youtubeBroadcastPrivacyStatus: "",
        youtubeStreamStatus: "",
        youtubeStreamHealthStatus: "",
        youtubeStreamHealthIssues: [],
        youtubeStatusCheckedAt: ""
      }
    },
    destination,
    message: `YouTube stream key rotated with ${payload.snippet?.title || "a new reusable stream"}.`
  };
};

export const syncTwitchStreamKey = async (
  profile: StudioProfile,
  credential: PlatformChatOAuthCredential | null,
  fetcher: PlatformChatFetch
): Promise<PlatformStreamKeyResult> => {
  const normalizedCredential = requirePlatformCredential(credential, "twitch");
  requireScope(normalizedCredential, TWITCH_STREAM_KEY_SCOPE, "Twitch stream key sync requires OAuth scope channel:read:stream_key.");

  if (!normalizedCredential.twitchUserId) {
    throw new PlatformStreamKeyError("Twitch broadcaster user ID is required. Reconnect OAuth first.");
  }
  if (!normalizedCredential.clientId) {
    throw new PlatformStreamKeyError("Twitch OAuth client ID is required. Reconnect OAuth first.");
  }

  const response = await fetcher(`${TWITCH_STREAM_KEY_URL}?broadcaster_id=${encodeURIComponent(normalizedCredential.twitchUserId)}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${normalizedCredential.accessToken}`,
      "Client-Id": normalizedCredential.clientId
    }
  });
  assertPlatformStreamKeyResponseOk(response, "Twitch stream key request");
  const payload = await readPlatformStreamKeyJson<TwitchStreamKeyResponse>(response, "Twitch stream key request");

  const streamKey = normalizeSingleLine(payload.data?.[0]?.stream_key);
  if (!streamKey) {
    throw new PlatformStreamKeyError("Twitch stream key response did not include a stream key.");
  }

  const destination = createTwitchDestination(profile.destination, streamKey);
  return {
    profile: {
      ...profile,
      destination
    },
    destination,
    message: "Twitch stream key synced from Helix."
  };
};

export const createYouTubeDestinationFromStream = (
  currentDestination: DestinationProfile,
  stream: YouTubeLiveStreamResource
): DestinationProfile => {
  const streamName = normalizeSingleLine(stream.cdn?.ingestionInfo?.streamName);
  const serverUrl = normalizeSingleLine(stream.cdn?.ingestionInfo?.rtmpsIngestionAddress || stream.cdn?.ingestionInfo?.ingestionAddress);

  if (!streamName || !serverUrl) {
    throw new PlatformStreamKeyError("YouTube live stream response did not include RTMP/RTMPS ingestion details.");
  }

  const preset = createDestinationFromPreset("youtube-live-rtmps", streamName);
  return {
    ...preset,
    serverUrl,
    protocol: serverUrl.toLowerCase().startsWith("rtmps://") ? "rtmps" : "rtmp",
    streamKey: streamName,
    name: currentDestination.platform === "youtube-live" ? currentDestination.name : preset.name
  };
};

export const createTwitchDestination = (
  currentDestination: DestinationProfile,
  streamKey: string
): DestinationProfile => {
  const normalizedStreamKey = normalizeSingleLine(streamKey);
  if (!normalizedStreamKey) {
    throw new PlatformStreamKeyError("Twitch stream key is required.");
  }

  if (currentDestination.platform === "twitch") {
    return {
      ...currentDestination,
      streamKey: normalizedStreamKey
    };
  }

  const presetId: DestinationPresetId = getDestinationPreset(currentDestination.presetId)?.platform === "twitch"
    ? currentDestination.presetId
    : "twitch-auto";
  return {
    ...createDestinationFromPreset(presetId, normalizedStreamKey),
    streamKey: normalizedStreamKey
  };
};

const requirePlatformCredential = (
  credential: PlatformChatOAuthCredential | null,
  platform: PlatformChatOAuthCredential["platform"]
): PlatformChatOAuthCredential => {
  if (!credential || credential.platform !== platform || !credential.accessToken) {
    throw new PlatformStreamKeyError(`${platform === "youtube" ? "YouTube" : "Twitch"} OAuth credential is required.`);
  }
  return credential;
};

const requireScope = (credential: PlatformChatOAuthCredential, scope: string, message: string) => {
  if (!credential.scopes.includes(scope)) {
    throw new PlatformStreamKeyError(message);
  }
};

const assertPlatformStreamKeyResponseOk = (
  response: Awaited<ReturnType<PlatformChatFetch>>,
  operation: string
) => {
  if (!response.ok) {
    throw new PlatformStreamKeyError(`${operation} failed with HTTP ${response.status}.`, getPlatformHttpFailureMetadata(response));
  }
};

const readPlatformStreamKeyJson = async <T>(
  response: Awaited<ReturnType<PlatformChatFetch>>,
  operation: string
): Promise<T> => {
  try {
    return (await response.json()) as T;
  } catch {
    throw new PlatformStreamKeyError(`${operation} returned unreadable JSON with HTTP ${response.status}.`, {
      statusCode: response.status
    });
  }
};

const qualityToYouTubeFrameRate = (quality: QualityProfile): "30fps" | "60fps" => (quality.fps === 60 ? "60fps" : "30fps");

const qualityToYouTubeResolution = (quality: QualityProfile): "720p" | "1080p" | "1440p" | "2160p" | "variable" => {
  if (quality.height <= 720) {
    return "720p";
  }
  if (quality.height <= 1080) {
    return "1080p";
  }
  if (quality.height <= 1440) {
    return "1440p";
  }
  if (quality.height <= 2160) {
    return "2160p";
  }
  return "variable";
};

const normalizeSingleLine = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
