import { createChatMessage, type ChatMessage } from "./chatReader";
import {
  getPlatformChatConnectionStatus,
  ingestYouTubeLiveChatResponse,
  normalizePlatformChatSettings,
  type PlatformChatIngestResult,
  type PlatformChatSettings,
  type YouTubeLiveChatListResponse
} from "./platformChat";

export interface PlatformChatAuthSession {
  youtubeAccessToken: string;
  twitchOauthToken: string;
  twitchLogin: string;
}

export type PlatformChatNetworkReadinessStatus = "disabled" | "needs-configuration" | "needs-auth" | "ready";

export interface PlatformChatNetworkReadiness {
  status: PlatformChatNetworkReadinessStatus;
  label: string;
  message: string;
}

export type PlatformChatConnectionPhase = "idle" | "disabled" | "needs-configuration" | "needs-auth" | "connecting" | "connected" | "failed";

export interface PlatformChatConnectionState {
  phase: PlatformChatConnectionPhase;
  label: string;
  message: string;
  lastReceivedAt: number | null;
  nextPollAt: number | null;
}

export type PlatformChatAutoConnectReason =
  | "platform-chat-disabled"
  | "chat-reader-disabled"
  | "needs-configuration"
  | "needs-auth"
  | "already-connected"
  | "already-connecting"
  | "connect";

export interface PlatformChatAutoConnectPlan {
  action: "connect" | "skip";
  reason: PlatformChatAutoConnectReason;
  severity: "info" | "warn";
  message: string;
}

export interface PlatformChatFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type PlatformChatFetch = (
  url: string,
  init: {
    method?: string;
    headers: Record<string, string>;
    body?: string;
  }
) => Promise<PlatformChatFetchResponse>;

export interface YouTubeLiveChatPage {
  ingest: PlatformChatIngestResult;
  nextCursor: string | null;
  nextPollIntervalMs: number;
}

export interface TwitchIrcParseResult {
  messages: ChatMessage[];
  pongResponses: string[];
  notices: string[];
}

export class PlatformChatNetworkError extends Error {
  readonly code: PlatformChatNetworkReadinessStatus | "http-error" | "invalid-platform";
  readonly statusCode: number | null;

  constructor(code: PlatformChatNetworkError["code"], message: string, statusCode: number | null = null) {
    super(message);
    this.name = "PlatformChatNetworkError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const YOUTUBE_LIVE_CHAT_MESSAGES_URL = "https://www.googleapis.com/youtube/v3/liveChat/messages";
export const TWITCH_IRC_WEBSOCKET_URL = "wss://irc-ws.chat.twitch.tv:443";
const DEFAULT_YOUTUBE_POLL_INTERVAL_MS = 5000;

export const createDefaultPlatformChatAuthSession = (): PlatformChatAuthSession => ({
  youtubeAccessToken: "",
  twitchOauthToken: "",
  twitchLogin: ""
});

export const normalizePlatformChatAuthSession = (
  auth: Partial<PlatformChatAuthSession> | null | undefined
): PlatformChatAuthSession => ({
  youtubeAccessToken: normalizeToken(auth?.youtubeAccessToken).replace(/^Bearer\s+/i, ""),
  twitchOauthToken: normalizeToken(auth?.twitchOauthToken).replace(/^oauth:/i, ""),
  twitchLogin: normalizeTwitchLogin(auth?.twitchLogin)
});

export const createPlatformChatConnectionState = (
  phase: PlatformChatConnectionPhase = "idle",
  message = "Not connected."
): PlatformChatConnectionState => ({
  phase,
  label: phaseLabel(phase),
  message,
  lastReceivedAt: null,
  nextPollAt: null
});

export const getPlatformChatNetworkReadiness = (
  settings: PlatformChatSettings,
  auth: PlatformChatAuthSession
): PlatformChatNetworkReadiness => {
  const normalizedSettings = normalizePlatformChatSettings(settings);
  const normalizedAuth = normalizePlatformChatAuthSession(auth);
  const platformStatus = getPlatformChatConnectionStatus(normalizedSettings);

  if (platformStatus.status === "disabled") {
    return {
      status: "disabled",
      label: "Disabled",
      message: platformStatus.message
    };
  }

  if (platformStatus.status !== "ready") {
    return {
      status: "needs-configuration",
      label: platformStatus.label,
      message: platformStatus.message
    };
  }

  if (normalizedSettings.platform === "youtube" && !normalizedAuth.youtubeAccessToken) {
    return {
      status: "needs-auth",
      label: "Needs auth",
      message: "YouTube access token is required."
    };
  }

  if (normalizedSettings.platform === "twitch" && (!normalizedAuth.twitchOauthToken || !normalizedAuth.twitchLogin)) {
    return {
      status: "needs-auth",
      label: "Needs auth",
      message: "Twitch access token and login are required."
    };
  }

  return {
    status: "ready",
    label: "Ready",
    message: `${normalizedSettings.platform === "youtube" ? "YouTube" : "Twitch"} chat can connect.`
  };
};

export const createPlatformChatAutoConnectPlan = (
  settings: PlatformChatSettings,
  auth: PlatformChatAuthSession,
  chatReaderEnabled: boolean,
  connection: Pick<PlatformChatConnectionState, "phase"> = createPlatformChatConnectionState()
): PlatformChatAutoConnectPlan => {
  const normalizedSettings = normalizePlatformChatSettings(settings);
  if (!normalizedSettings.enabled) {
    return {
      action: "skip",
      reason: "platform-chat-disabled",
      severity: "info",
      message: "Platform chat auto-connect skipped because platform chat is off."
    };
  }

  if (!chatReaderEnabled) {
    return {
      action: "skip",
      reason: "chat-reader-disabled",
      severity: "warn",
      message: "Platform chat auto-connect skipped because chat readout is off."
    };
  }

  const readiness = getPlatformChatNetworkReadiness(normalizedSettings, auth);
  if (readiness.status === "needs-configuration" || readiness.status === "needs-auth") {
    return {
      action: "skip",
      reason: readiness.status,
      severity: "warn",
      message: readiness.message
    };
  }

  if (connection.phase === "connected") {
    return {
      action: "skip",
      reason: "already-connected",
      severity: "info",
      message: "Platform chat is already connected."
    };
  }

  if (connection.phase === "connecting") {
    return {
      action: "skip",
      reason: "already-connecting",
      severity: "info",
      message: "Platform chat is already connecting."
    };
  }

  return {
    action: "connect",
    reason: "connect",
    severity: "info",
    message: `Starting ${normalizedSettings.platform === "youtube" ? "YouTube" : "Twitch"} chat readout connection.`
  };
};

export const buildYouTubeLiveChatRequest = (
  settings: PlatformChatSettings,
  auth: PlatformChatAuthSession,
  cursor: string | null = null
) => {
  const normalizedSettings = normalizePlatformChatSettings(settings);
  const normalizedAuth = normalizePlatformChatAuthSession(auth);
  const readiness = getPlatformChatNetworkReadiness(normalizedSettings, normalizedAuth);

  if (readiness.status !== "ready") {
    throw new PlatformChatNetworkError(readiness.status, readiness.message);
  }
  if (normalizedSettings.platform !== "youtube") {
    throw new PlatformChatNetworkError("invalid-platform", "YouTube chat request requires YouTube settings.");
  }

  const query = [
    ["liveChatId", normalizedSettings.youtubeLiveChatId],
    ["part", "snippet,authorDetails"],
    ["maxResults", "200"],
    ...(cursor ? [["pageToken", cursor]] : [])
  ]
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  return {
    url: `${YOUTUBE_LIVE_CHAT_MESSAGES_URL}?${query}`,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${normalizedAuth.youtubeAccessToken}`
    }
  };
};

export const fetchYouTubeLiveChatPage = async (
  settings: PlatformChatSettings,
  auth: PlatformChatAuthSession,
  cursor: string | null,
  fetcher: PlatformChatFetch,
  receivedAt: number = Date.now()
): Promise<YouTubeLiveChatPage> => {
  const request = buildYouTubeLiveChatRequest(settings, auth, cursor);
  const response = await fetcher(request.url, { headers: request.headers });

  if (!response.ok) {
    throw new PlatformChatNetworkError("http-error", `YouTube chat request failed with HTTP ${response.status}.`, response.status);
  }

  const payload = (await response.json()) as YouTubeLiveChatListResponse;
  const ingest = ingestYouTubeLiveChatResponse(payload, receivedAt);

  return {
    ingest,
    nextCursor: ingest.nextCursor,
    nextPollIntervalMs: ingest.nextPollIntervalMs ?? DEFAULT_YOUTUBE_POLL_INTERVAL_MS
  };
};

export const createTwitchIrcAuthenticationCommands = (
  settings: PlatformChatSettings,
  auth: PlatformChatAuthSession
): string[] => {
  const normalizedSettings = normalizePlatformChatSettings(settings);
  const normalizedAuth = normalizePlatformChatAuthSession(auth);
  const readiness = getPlatformChatNetworkReadiness(normalizedSettings, normalizedAuth);

  if (readiness.status !== "ready") {
    throw new PlatformChatNetworkError(readiness.status, readiness.message);
  }
  if (normalizedSettings.platform !== "twitch") {
    throw new PlatformChatNetworkError("invalid-platform", "Twitch IRC requires Twitch settings.");
  }

  return [
    "CAP REQ :twitch.tv/tags twitch.tv/commands",
    `PASS oauth:${normalizedAuth.twitchOauthToken}`,
    `NICK ${normalizedAuth.twitchLogin}`,
    `JOIN #${normalizedSettings.twitchChannel}`
  ];
};

export const parseTwitchIrcPayload = (payload: string, receivedAt: number = Date.now()): TwitchIrcParseResult => {
  const messages: ChatMessage[] = [];
  const pongResponses: string[] = [];
  const notices: string[] = [];

  for (const rawLine of payload.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("PING ")) {
      pongResponses.push(line.replace(/^PING/, "PONG"));
      continue;
    }

    const parsed = parseIrcLine(line);
    if (!parsed) {
      continue;
    }

    if (parsed.command === "NOTICE" && parsed.trailing) {
      notices.push(parsed.trailing);
      continue;
    }

    if (parsed.command !== "PRIVMSG" || !parsed.trailing) {
      continue;
    }

    const author = parsed.tags["display-name"] || parsed.prefix?.split("!")[0] || "Twitch viewer";
    const timestamp = Number(parsed.tags["tmi-sent-ts"]);
    const stableId = parsed.tags.id || `${parsed.params[0] ?? "channel"}:${author}:${timestamp || receivedAt}:${parsed.trailing}`;

    messages.push(
      createChatMessage({
        id: stableId,
        source: "twitch",
        author,
        body: parsed.trailing,
        receivedAt: Number.isFinite(timestamp) ? timestamp : receivedAt
      })
    );
  }

  return {
    messages,
    pongResponses,
    notices
  };
};

const parseIrcLine = (line: string) => {
  let rest = line;
  let tags: Record<string, string> = {};
  let prefix: string | null = null;

  if (rest.startsWith("@")) {
    const tagEnd = rest.indexOf(" ");
    if (tagEnd < 0) {
      return null;
    }
    tags = parseTags(rest.slice(1, tagEnd));
    rest = rest.slice(tagEnd + 1);
  }

  if (rest.startsWith(":")) {
    const prefixEnd = rest.indexOf(" ");
    if (prefixEnd < 0) {
      return null;
    }
    prefix = rest.slice(1, prefixEnd);
    rest = rest.slice(prefixEnd + 1);
  }

  const commandEnd = rest.indexOf(" ");
  const command = commandEnd < 0 ? rest : rest.slice(0, commandEnd);
  rest = commandEnd < 0 ? "" : rest.slice(commandEnd + 1);

  const trailingStart = rest.indexOf(" :");
  const trailing = trailingStart >= 0 ? rest.slice(trailingStart + 2) : "";
  const paramsText = trailingStart >= 0 ? rest.slice(0, trailingStart) : rest;
  const params = paramsText.split(" ").filter(Boolean);

  return {
    tags,
    prefix,
    command,
    params,
    trailing
  };
};

const parseTags = (value: string): Record<string, string> =>
  Object.fromEntries(
    value.split(";").map((pair) => {
      const separator = pair.indexOf("=");
      if (separator < 0) {
        return [pair, ""];
      }
      return [pair.slice(0, separator), unescapeTagValue(pair.slice(separator + 1))];
    })
  );

const unescapeTagValue = (value: string): string =>
  value.replace(/\\([snr:\\])/g, (_, code: string) => {
    switch (code) {
      case "s":
        return " ";
      case "n":
        return "\n";
      case "r":
        return "\r";
      case ":":
        return ";";
      case "\\":
        return "\\";
      default:
        return code;
    }
  });

const normalizeToken = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

const normalizeTwitchLogin = (value: unknown): string =>
  (typeof value === "string" ? value.trim().replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_]/g, "") : "").slice(0, 25);

const phaseLabel = (phase: PlatformChatConnectionPhase): string => {
  switch (phase) {
    case "disabled":
      return "Disabled";
    case "needs-configuration":
      return "Needs setup";
    case "needs-auth":
      return "Needs auth";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "failed":
      return "Failed";
    case "idle":
    default:
      return "Idle";
  }
};
