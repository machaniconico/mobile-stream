import { createChatMessage, type ChatMessage } from "./chatReader";

export type PlatformChatPlatform = "youtube" | "twitch";

export interface PlatformChatSettings {
  enabled: boolean;
  platform: PlatformChatPlatform;
  youtubeLiveChatId: string;
  twitchChannel: string;
}

export interface PlatformChatConnectionStatus {
  status: "disabled" | "needs-connection" | "ready";
  label: string;
  message: string;
}

export interface PlatformChatIngestResult {
  messages: ChatMessage[];
  acceptedCount: number;
  skippedCount: number;
  nextCursor: string | null;
  nextPollIntervalMs: number | null;
  warnings: string[];
}

export interface YouTubeLiveChatListResponse {
  nextPageToken?: string;
  pollingIntervalMillis?: number;
  items?: YouTubeLiveChatMessageResource[];
}

interface YouTubeLiveChatMessageResource {
  id?: string;
  snippet?: {
    displayMessage?: string;
    publishedAt?: string;
    type?: string;
  };
  authorDetails?: {
    displayName?: string;
  };
}

interface TwitchEventSubNotification {
  metadata?: {
    message_timestamp?: string;
  };
  event?: TwitchChatMessageEvent;
}

interface TwitchChatMessageEvent {
  message_id?: string;
  chatter_user_login?: string;
  chatter_user_name?: string;
  message?: {
    text?: string;
    fragments?: Array<{
      text?: string;
    }>;
  };
}

export const createDefaultPlatformChatSettings = (): PlatformChatSettings => ({
  enabled: false,
  platform: "youtube",
  youtubeLiveChatId: "",
  twitchChannel: ""
});

export const normalizePlatformChatSettings = (settings: PlatformChatSettings): PlatformChatSettings => ({
  enabled: settings.enabled,
  platform: settings.platform === "twitch" ? "twitch" : "youtube",
  youtubeLiveChatId: normalizeIdentifier(settings.youtubeLiveChatId).slice(0, 160),
  twitchChannel: normalizeIdentifier(settings.twitchChannel).replace(/^@/, "").toLowerCase().slice(0, 80)
});

export const getPlatformChatConnectionStatus = (settings: PlatformChatSettings): PlatformChatConnectionStatus => {
  const normalized = normalizePlatformChatSettings(settings);
  if (!normalized.enabled) {
    return {
      status: "disabled",
      label: "Disabled",
      message: "Platform chat is off."
    };
  }

  if (normalized.platform === "youtube" && !normalized.youtubeLiveChatId) {
    return {
      status: "needs-connection",
      label: "Needs ID",
      message: "YouTube live chat ID is required."
    };
  }

  if (normalized.platform === "twitch" && !normalized.twitchChannel) {
    return {
      status: "needs-connection",
      label: "Needs channel",
      message: "Twitch channel is required."
    };
  }

  return {
    status: "ready",
    label: "Ready",
    message: normalized.platform === "youtube" ? "YouTube chat adapter is configured." : "Twitch chat adapter is configured."
  };
};

export const ingestYouTubeLiveChatResponse = (
  response: YouTubeLiveChatListResponse,
  receivedAt: number = Date.now()
): PlatformChatIngestResult => {
  const items = Array.isArray(response.items) ? response.items : [];
  const messages = items.flatMap((item) => {
    const body = normalizeMessageBody(item.snippet?.displayMessage ?? "");
    if (!body || (item.snippet?.type && item.snippet.type !== "textMessageEvent")) {
      return [];
    }

    return [
      createChatMessage({
        id: item.id,
        source: "youtube",
        author: item.authorDetails?.displayName ?? "YouTube viewer",
        body,
        receivedAt: parseTimestamp(item.snippet?.publishedAt, receivedAt)
      })
    ];
  });

  return {
    messages,
    acceptedCount: messages.length,
    skippedCount: items.length - messages.length,
    nextCursor: response.nextPageToken ?? null,
    nextPollIntervalMs: clampPollInterval(response.pollingIntervalMillis),
    warnings: response.pollingIntervalMillis && response.pollingIntervalMillis < 1000 ? ["YouTube polling interval was raised to 1000 ms."] : []
  };
};

export const ingestTwitchEventSubNotification = (
  notification: TwitchEventSubNotification,
  receivedAt: number = Date.now()
): PlatformChatIngestResult => {
  const event = notification.event;
  if (!event) {
    return emptyIngestResult(1);
  }

  const body = normalizeMessageBody(event.message?.text ?? event.message?.fragments?.map((fragment) => fragment.text ?? "").join("") ?? "");
  if (!body) {
    return emptyIngestResult(1);
  }

  const messages = [
    createChatMessage({
      id: event.message_id,
      source: "twitch",
      author: event.chatter_user_name || event.chatter_user_login || "Twitch viewer",
      body,
      receivedAt: parseTimestamp(notification.metadata?.message_timestamp, receivedAt)
    })
  ];

  return {
    messages,
    acceptedCount: 1,
    skippedCount: 0,
    nextCursor: null,
    nextPollIntervalMs: null,
    warnings: []
  };
};

export const createPlatformChatSample = (
  settings: PlatformChatSettings,
  receivedAt: number = Date.now()
): PlatformChatIngestResult => {
  const normalized = normalizePlatformChatSettings(settings);
  if (normalized.platform === "twitch") {
    return ingestTwitchEventSubNotification(
      {
        metadata: {
          message_timestamp: new Date(receivedAt).toISOString()
        },
        event: {
          message_id: `sample-twitch-${receivedAt}`,
          chatter_user_name: normalized.twitchChannel || "twitch_viewer",
          message: {
            text: "Twitch chat adapter sample"
          }
        }
      },
      receivedAt
    );
  }

  return ingestYouTubeLiveChatResponse(
    {
      nextPageToken: `sample-youtube-${receivedAt}`,
      pollingIntervalMillis: 5000,
      items: [
        {
          id: `sample-youtube-${receivedAt}`,
          snippet: {
            displayMessage: "YouTube chat adapter sample",
            publishedAt: new Date(receivedAt).toISOString(),
            type: "textMessageEvent"
          },
          authorDetails: {
            displayName: "YouTube viewer"
          }
        }
      ]
    },
    receivedAt
  );
};

const emptyIngestResult = (skippedCount: number): PlatformChatIngestResult => ({
  messages: [],
  acceptedCount: 0,
  skippedCount,
  nextCursor: null,
  nextPollIntervalMs: null,
  warnings: []
});

const normalizeIdentifier = (value: string): string => value.replace(/\s+/g, " ").trim();

const normalizeMessageBody = (value: string): string =>
  value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseTimestamp = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampPollInterval = (value: number | undefined): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(Math.max(1000, Math.min(value, 60000)));
};
