import { getPlatformHttpFailureMetadata, type PlatformChatFetch, type PlatformChatFetchResponse } from "./platformChatConnection";
import { errorToSafeMessage } from "./sensitiveText";
import type { StreamPlatform } from "./profiles";
import type { StreamStatus } from "./streamState";

export interface StreamAnnouncementAutoPostSettings {
  autoPostEnabled: boolean;
  discordWebhookUrl: string;
}

export type StreamAnnouncementAutoPostSignal =
  | "youtube-live-transition"
  | "youtube-status-refresh"
  | "twitch-status-refresh";

export interface StreamAnnouncementAutoPostDecisionInput {
  settings: StreamAnnouncementAutoPostSettings;
  destinationPlatform: StreamPlatform;
  youtubeBroadcastPrivacyStatus?: string | null;
  youtubeConfiguredPrivacyStatus?: string | null;
  youtubeBroadcastStatus?: string | null;
  twitchLiveStatus?: string | null;
  enginePlatform: "mock" | "ios" | "android";
  streamStatus: StreamStatus;
  sessionStartedAt: number | null;
  signal: StreamAnnouncementAutoPostSignal;
  postedSessionKeys?: Iterable<string>;
}

export type StreamAnnouncementAutoPostDecision =
  | {
      shouldPost: true;
      sessionKey: string;
      reason: "platform-visible-live";
    }
  | {
      shouldPost: false;
      sessionKey: string | null;
      reason:
        | "disabled"
        | "missing-webhook"
        | "invalid-webhook"
        | "mock-engine"
        | "not-platform-visible"
        | "not-live"
        | "missing-session"
        | "already-posted";
    };

export interface StreamAnnouncementAutoPostResult {
  attempts: number;
  message: string;
}

export interface StreamAnnouncementAutoPostInput {
  webhookUrl: string;
  content: string;
  fetcher: PlatformChatFetch;
  wait?: (delayMs: number) => Promise<void>;
  now?: () => number;
}

export class StreamAnnouncementAutoPostError extends Error {
  readonly statusCode: number | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  readonly attempts: number;

  constructor(
    message: string,
    {
      statusCode = null,
      retryable = false,
      retryAfterMs = null,
      attempts = 1
    }: {
      statusCode?: number | null;
      retryable?: boolean;
      retryAfterMs?: number | null;
      attempts?: number;
    } = {}
  ) {
    super(message);
    this.name = "StreamAnnouncementAutoPostError";
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
    this.attempts = attempts;
  }
}

const discordWebhookPathPattern = /^\/api\/webhooks\/(\d{5,32})\/([A-Za-z0-9._-]{20,})\/?$/;
const redactedDiscordWebhookUrl = "https://discord.com/api/webhooks/[redacted]";

export const createDefaultStreamAnnouncementAutoPostSettings = (): StreamAnnouncementAutoPostSettings => ({
  autoPostEnabled: false,
  discordWebhookUrl: ""
});

export const normalizeStreamAnnouncementAutoPostSettings = (
  settings: Partial<StreamAnnouncementAutoPostSettings> | null | undefined
): StreamAnnouncementAutoPostSettings => ({
  autoPostEnabled: settings?.autoPostEnabled === true,
  discordWebhookUrl: normalizeDiscordWebhookUrl(settings?.discordWebhookUrl)
});

export const normalizeDiscordWebhookUrl = (value: unknown): string => {
  const url = typeof value === "string" ? value.trim() : "";
  if (!url) {
    return "";
  }

  const parsed = parseDiscordWebhookUrl(url);
  return parsed ? `https://discord.com/api/webhooks/${parsed.id}/${parsed.token}` : "";
};

export const isValidDiscordWebhookUrl = (value: unknown): boolean => Boolean(normalizeDiscordWebhookUrl(value));

export const assertValidDiscordWebhookUrl = (value: unknown): string => {
  const normalized = normalizeDiscordWebhookUrl(value);
  if (!normalized) {
    throw new StreamAnnouncementAutoPostError(
      "Discord Webhook URL must be https://discord.com/api/webhooks/{id}/{token}."
    );
  }
  return normalized;
};

export const redactDiscordWebhookUrlFromText = (value: string, webhookUrl?: string | null): string => {
  const normalizedWebhookUrl = normalizeDiscordWebhookUrl(webhookUrl);
  const webhookCandidates = [
    normalizedWebhookUrl,
    normalizedWebhookUrl.replace("https://", ""),
    normalizedWebhookUrl.split("/").at(-1) ?? ""
  ].filter(Boolean);

  const redactedSpecific = webhookCandidates.reduce(
    (current, candidate) => current.split(candidate).join("[redacted]"),
    value.replace(/https:\/\/discord\.com\/api\/webhooks\/\d{5,32}\/[A-Za-z0-9._-]{20,}/g, redactedDiscordWebhookUrl)
  );

  return errorToSafeMessage(redactedSpecific, redactedSpecific);
};

export const formatStreamAnnouncementAutoPostError = (error: unknown, webhookUrl?: string | null): string =>
  redactDiscordWebhookUrlFromText(errorToSafeMessage(error, "Discord announcement post failed."), webhookUrl);

export const createStreamAnnouncementAutoPostSessionKey = (
  sessionStartedAt: number | null,
  destinationPlatform: StreamPlatform
): string | null => (typeof sessionStartedAt === "number" && Number.isFinite(sessionStartedAt)
  ? `${destinationPlatform}:${Math.floor(sessionStartedAt)}`
  : null);

export const createStreamAnnouncementAutoPostDecision = ({
  settings,
  destinationPlatform,
  youtubeBroadcastPrivacyStatus,
  youtubeConfiguredPrivacyStatus,
  youtubeBroadcastStatus,
  twitchLiveStatus,
  enginePlatform,
  streamStatus,
  sessionStartedAt,
  signal,
  postedSessionKeys = []
}: StreamAnnouncementAutoPostDecisionInput): StreamAnnouncementAutoPostDecision => {
  const sessionKey = createStreamAnnouncementAutoPostSessionKey(sessionStartedAt, destinationPlatform);
  if (!settings.autoPostEnabled) {
    return { shouldPost: false, sessionKey, reason: "disabled" };
  }
  if (!settings.discordWebhookUrl.trim()) {
    return { shouldPost: false, sessionKey, reason: "missing-webhook" };
  }
  if (!isValidDiscordWebhookUrl(settings.discordWebhookUrl)) {
    return { shouldPost: false, sessionKey, reason: "invalid-webhook" };
  }
  if (enginePlatform === "mock") {
    return { shouldPost: false, sessionKey, reason: "mock-engine" };
  }
  if (streamStatus !== "live") {
    return { shouldPost: false, sessionKey, reason: "not-live" };
  }
  if (!sessionKey) {
    return { shouldPost: false, sessionKey, reason: "missing-session" };
  }
  if (new Set(postedSessionKeys).has(sessionKey)) {
    return { shouldPost: false, sessionKey, reason: "already-posted" };
  }
  if (!isPlatformVisibleLiveSignal({
    destinationPlatform,
    youtubeBroadcastPrivacyStatus,
    youtubeConfiguredPrivacyStatus,
    youtubeBroadcastStatus,
    twitchLiveStatus,
    signal
  })) {
    return { shouldPost: false, sessionKey, reason: "not-platform-visible" };
  }

  return { shouldPost: true, sessionKey, reason: "platform-visible-live" };
};

export const postDiscordStreamAnnouncement = async ({
  webhookUrl,
  content,
  fetcher,
  wait = defaultWait,
  now = Date.now
}: StreamAnnouncementAutoPostInput): Promise<StreamAnnouncementAutoPostResult> => {
  const normalizedWebhookUrl = assertValidDiscordWebhookUrl(webhookUrl);
  const body = JSON.stringify({ content });
  let lastError: StreamAnnouncementAutoPostError | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetcher(normalizedWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body
    });

    if (response.ok) {
      return {
        attempts: attempt,
        message: attempt === 1 ? "Discord announcement posted." : "Discord announcement posted after retry."
      };
    }

    lastError = createDiscordWebhookHttpError(response, attempt, now());
    if (attempt === 1 && lastError.retryable) {
      if (lastError.retryAfterMs !== null && lastError.retryAfterMs > 0) {
        await wait(lastError.retryAfterMs);
      }
      continue;
    }

    throw lastError;
  }

  throw lastError ?? new StreamAnnouncementAutoPostError("Discord webhook post failed.");
};

const createDiscordWebhookHttpError = (
  response: PlatformChatFetchResponse,
  attempts: number,
  now: number
): StreamAnnouncementAutoPostError => {
  const metadata = getPlatformHttpFailureMetadata(response, now);
  return new StreamAnnouncementAutoPostError(`Discord webhook post failed with HTTP ${response.status}.`, {
    ...metadata,
    attempts
  });
};

const defaultWait = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, delayMs));
  });

const parseDiscordWebhookUrl = (value: string): { id: string; token: string } | null => {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "discord.com" ||
      parsed.port ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    const match = parsed.pathname.match(discordWebhookPathPattern);
    return match ? { id: match[1], token: match[2] } : null;
  } catch {
    return null;
  }
};

const isPlatformVisibleLiveSignal = ({
  destinationPlatform,
  youtubeBroadcastPrivacyStatus,
  youtubeConfiguredPrivacyStatus,
  youtubeBroadcastStatus,
  twitchLiveStatus,
  signal
}: Pick<
  StreamAnnouncementAutoPostDecisionInput,
  | "destinationPlatform"
  | "youtubeBroadcastPrivacyStatus"
  | "youtubeConfiguredPrivacyStatus"
  | "youtubeBroadcastStatus"
  | "twitchLiveStatus"
  | "signal"
>): boolean => {
  if (destinationPlatform === "youtube-live") {
    const broadcastStatus = normalizeSingleLine(youtubeBroadcastStatus).toLowerCase();
    const privacyStatus = normalizeSingleLine(youtubeBroadcastPrivacyStatus || youtubeConfiguredPrivacyStatus).toLowerCase();
    return (
      (signal === "youtube-live-transition" || signal === "youtube-status-refresh") &&
      broadcastStatus === "live" &&
      privacyStatus !== "private"
    );
  }

  if (destinationPlatform === "twitch") {
    const liveStatus = normalizeSingleLine(twitchLiveStatus).toLowerCase();
    return signal === "twitch-status-refresh" && Boolean(liveStatus) && liveStatus !== "offline";
  }

  return false;
};

const normalizeSingleLine = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
