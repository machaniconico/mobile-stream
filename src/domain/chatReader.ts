import { redactSensitiveText } from "./sensitiveText";

export interface ChatMessage {
  id: string;
  source: "manual" | "youtube" | "twitch" | "mock";
  author: string;
  body: string;
  receivedAt: number;
}

export interface ChatReaderSettings {
  enabled: boolean;
  readAuthorName: boolean;
  redactUrls: boolean;
  skipCommandMessages: boolean;
  moderationEnabled: boolean;
  blockLinkMessages: boolean;
  blockExcessiveCaps: boolean;
  rate: number;
  pitch: number;
  volume: number;
  maxMessageLength: number;
  maxQueueLength: number;
  duplicateWindowSeconds: number;
  maxMessagesPerAuthorPerMinute: number;
  mutedWords: string[];
}

export interface ChatReaderState {
  settings: ChatReaderSettings;
  queue: ChatMessage[];
  history: ChatMessage[];
  authorActivity: ChatAuthorActivity[];
  speakingMessageId: string | null;
  skippedCount: number;
}

export interface ChatAuthorActivity {
  author: string;
  receivedAt: number;
}

export interface ChatMessageInput {
  id?: string;
  source?: ChatMessage["source"];
  author: string;
  body: string;
  receivedAt?: number;
}

export interface ChatOverlayDisplayMessage {
  author: string;
  body: string;
  source: ChatMessage["source"];
}

const MAX_QUEUE_LENGTH = 24;
const MAX_HISTORY_LENGTH = 16;
const MAX_AUTHOR_ACTIVITY_LENGTH = 500;
const AUTHOR_RATE_WINDOW_MILLIS = 60 * 1000;

export const createDefaultChatReaderSettings = (): ChatReaderSettings => ({
  enabled: true,
  readAuthorName: true,
  redactUrls: true,
  skipCommandMessages: true,
  moderationEnabled: true,
  blockLinkMessages: false,
  blockExcessiveCaps: true,
  rate: 1,
  pitch: 1,
  volume: 0.85,
  maxMessageLength: 140,
  maxQueueLength: MAX_QUEUE_LENGTH,
  duplicateWindowSeconds: 20,
  maxMessagesPerAuthorPerMinute: 6,
  mutedWords: []
});

export const createDefaultChatReaderState = (): ChatReaderState => ({
  settings: createDefaultChatReaderSettings(),
  queue: [],
  history: [],
  authorActivity: [],
  speakingMessageId: null,
  skippedCount: 0
});

export const createChatMessage = ({ id, source = "manual", author, body, receivedAt = Date.now() }: ChatMessageInput): ChatMessage => {
  const cleanAuthor = sanitizeChatText(author) || "viewer";
  const cleanBody = sanitizeChatText(body);
  const stableId = normalizeWhitespace(id ?? "");
  return {
    id: stableId ? `chat-${source}-${hashMessage(stableId)}` : `chat-${receivedAt}-${hashMessage(`${source}:${cleanAuthor}:${cleanBody}`)}`,
    source,
    author: cleanAuthor.slice(0, 48),
    body: cleanBody,
    receivedAt
  };
};

export const enqueueChatMessage = (state: ChatReaderState, message: ChatMessage): ChatReaderState => {
  const authorActivity = pruneAuthorActivity(state.authorActivity ?? [], message.receivedAt);

  if (!message.body) {
    return {
      ...state,
      authorActivity,
      skippedCount: state.skippedCount + 1
    };
  }

  if (isDuplicateRecentMessage(message, state.history, state.settings.duplicateWindowSeconds)) {
    return {
      ...state,
      authorActivity,
      skippedCount: state.skippedCount + 1
    };
  }

  if (shouldSkipCommandMessage(message, state.settings)) {
    return {
      ...state,
      authorActivity,
      skippedCount: state.skippedCount + 1
    };
  }

  if (isModerationBlockedMessage(message, { ...state, authorActivity })) {
    return {
      ...state,
      authorActivity,
      skippedCount: state.skippedCount + 1
    };
  }

  const history = [message, ...state.history.filter((item) => item.id !== message.id)].slice(0, MAX_HISTORY_LENGTH);
  const nextAuthorActivity = appendAuthorActivity(authorActivity, message);

  if (isMutedMessage(message, state.settings)) {
    return {
      ...state,
      history,
      authorActivity: nextAuthorActivity,
      skippedCount: state.skippedCount + 1
    };
  }

  const queue = [...state.queue.filter((item) => item.id !== message.id), message].slice(-state.settings.maxQueueLength);

  return {
    ...state,
    queue,
    history,
    authorActivity: nextAuthorActivity
  };
};

export const updateChatReaderSettings = (
  state: ChatReaderState,
  update: Partial<ChatReaderSettings>
): ChatReaderState => {
  const settings = normalizeChatReaderSettings({
    ...state.settings,
    ...update
  });
  return {
    ...state,
    settings,
    queue: state.queue.slice(-settings.maxQueueLength)
  };
};

export const selectNextReadableMessage = (state: ChatReaderState): ChatMessage | null => {
  if (!state.settings.enabled || state.speakingMessageId || state.queue.length === 0) {
    return null;
  }
  return state.queue[0];
};

export const markChatMessageSpeaking = (state: ChatReaderState, messageId: string): ChatReaderState => ({
  ...state,
  speakingMessageId: messageId
});

export const markChatMessageSpoken = (state: ChatReaderState, messageId: string): ChatReaderState => ({
  ...state,
  queue: state.queue.filter((message) => message.id !== messageId),
  speakingMessageId: state.speakingMessageId === messageId ? null : state.speakingMessageId
});

export const clearChatReaderQueue = (state: ChatReaderState): ChatReaderState => ({
  ...state,
  queue: [],
  speakingMessageId: null
});

export const clearChatReaderSession = (state: ChatReaderState): ChatReaderState => ({
  ...state,
  queue: [],
  history: [],
  authorActivity: [],
  speakingMessageId: null,
  skippedCount: 0
});

export const selectChatOverlayMessages = (state: ChatReaderState, limit = 4): ChatOverlayDisplayMessage[] =>
  state.history
    .filter((message) => !isMutedMessage(message, state.settings))
    .filter((message) => !isMessageContentBlockedByModeration(message, state.settings))
    .slice(0, Math.round(clamp(limit, 1, 8)))
    .map((message) => ({
      author: message.author,
      body: state.settings.redactUrls ? stripUrls(message.body) : message.body,
      source: message.source
    }));

export const createSpeechText = (message: ChatMessage, settings: ChatReaderSettings): string | null => {
  if (isMutedMessage(message, settings) || shouldSkipCommandMessage(message, settings) || isMessageContentBlockedByModeration(message, settings)) {
    return null;
  }

  const body = truncateForSpeech(settings.redactUrls ? stripUrls(message.body) : message.body, settings.maxMessageLength);
  if (!body) {
    return null;
  }

  return settings.readAuthorName ? `${message.author} says ${body}` : body;
};

export const normalizeMutedWordsInput = (value: string): string[] =>
  value
    .split(",")
    .map((word) => normalizeWhitespace(word).toLowerCase())
    .filter(Boolean)
    .slice(0, 24);

const normalizeChatReaderSettings = (settings: ChatReaderSettings): ChatReaderSettings => ({
  ...settings,
  rate: clamp(settings.rate, 0.5, 1.5),
  pitch: clamp(settings.pitch, 0.5, 1.5),
  volume: clamp(settings.volume, 0, 1),
  redactUrls: settings.redactUrls !== false,
  skipCommandMessages: settings.skipCommandMessages !== false,
  moderationEnabled: settings.moderationEnabled !== false,
  blockLinkMessages: settings.blockLinkMessages === true,
  blockExcessiveCaps: settings.blockExcessiveCaps !== false,
  maxMessageLength: Math.round(clamp(settings.maxMessageLength, 40, 240)),
  maxQueueLength: Math.round(clamp(settings.maxQueueLength, 4, MAX_QUEUE_LENGTH)),
  duplicateWindowSeconds: Math.round(clamp(settings.duplicateWindowSeconds, 0, 120)),
  maxMessagesPerAuthorPerMinute: Math.round(clamp(settings.maxMessagesPerAuthorPerMinute, 1, 30)),
  mutedWords: settings.mutedWords.map((word) => normalizeWhitespace(word).toLowerCase()).filter(Boolean).slice(0, 24)
});

const isMutedMessage = (message: ChatMessage, settings: ChatReaderSettings): boolean => {
  if (settings.mutedWords.length === 0) {
    return false;
  }

  const haystack = `${message.author} ${message.body}`.toLowerCase();
  return settings.mutedWords.some((word) => haystack.includes(word));
};

const shouldSkipCommandMessage = (message: ChatMessage, settings: ChatReaderSettings): boolean =>
  settings.skipCommandMessages && /^![\w-]{1,32}(?:\s|$)/.test(normalizeWhitespace(message.body));

const isModerationBlockedMessage = (message: ChatMessage, state: ChatReaderState): boolean => {
  const { settings } = state;
  if (!settings.moderationEnabled) {
    return false;
  }

  if (isMessageContentBlockedByModeration(message, settings)) {
    return true;
  }

  const author = normalizeWhitespace(message.author).toLowerCase();
  const recentAuthorMessageCount = (state.authorActivity ?? []).filter((item) => {
    if (message.receivedAt - item.receivedAt > AUTHOR_RATE_WINDOW_MILLIS) {
      return false;
    }
    return item.author === author;
  }).length;
  return recentAuthorMessageCount >= settings.maxMessagesPerAuthorPerMinute;
};

const appendAuthorActivity = (activity: ChatAuthorActivity[], message: ChatMessage): ChatAuthorActivity[] =>
  [
    ...activity,
    {
      author: normalizeWhitespace(message.author).toLowerCase(),
      receivedAt: message.receivedAt
    }
  ].slice(-MAX_AUTHOR_ACTIVITY_LENGTH);

const pruneAuthorActivity = (activity: ChatAuthorActivity[], receivedAt: number): ChatAuthorActivity[] =>
  activity.filter((item) => receivedAt - item.receivedAt <= AUTHOR_RATE_WINDOW_MILLIS).slice(-MAX_AUTHOR_ACTIVITY_LENGTH);

const isMessageContentBlockedByModeration = (message: ChatMessage, settings: ChatReaderSettings): boolean => {
  if (!settings.moderationEnabled) {
    return false;
  }
  return (settings.blockLinkMessages && containsUrl(message.body)) || (settings.blockExcessiveCaps && hasExcessiveCaps(message.body));
};

const isDuplicateRecentMessage = (message: ChatMessage, history: ChatMessage[], duplicateWindowSeconds: number): boolean => {
  if (duplicateWindowSeconds <= 0) {
    return false;
  }

  const signature = messageSignature(message);
  const windowMillis = duplicateWindowSeconds * 1000;
  return history.some((item) => {
    if (message.receivedAt - item.receivedAt > windowMillis) {
      return false;
    }
    return messageSignature(item) === signature;
  });
};

const messageSignature = (message: ChatMessage): string =>
  `${message.source}:${normalizeWhitespace(message.author).toLowerCase()}:${normalizeWhitespace(message.body).toLowerCase()}`;

const containsUrl = (value: string): boolean =>
  /\bhttps?:\/\/[^\s<>"']+/i.test(value) ||
  /\bwww\.[^\s<>"']+/i.test(value) ||
  /(^|[^\w@.])((?:[a-z0-9-]+\.)+(?:ai|app|co|com|dev|gg|io|jp|link|live|ly|me|net|org|site|stream|tv|xyz)(?:\/[^\s<>"']*)?)/i.test(
    value
  );

const stripUrls = (value: string): string =>
  value
    .replace(/\bhttps?:\/\/[^\s<>"']+/gi, omitUrlToken)
    .replace(/\bwww\.[^\s<>"']+/gi, omitUrlToken)
    .replace(
      /(^|[^\w@.])((?:[a-z0-9-]+\.)+(?:ai|app|co|com|dev|gg|io|jp|link|live|ly|me|net|org|site|stream|tv|xyz)(?:\/[^\s<>"']*)?)/gi,
      (_match, prefix: string, token: string) => `${prefix}${omitUrlToken(token)}`
    );

const omitUrlToken = (token: string): string => {
  const trailing = token.match(/[),.;:!?]+$/)?.[0] ?? "";
  return `link omitted${trailing}`;
};

const hasExcessiveCaps = (value: string): boolean => {
  const letters = value.replace(/[^a-z]/gi, "");
  if (letters.length < 12) {
    return false;
  }
  const uppercase = letters.replace(/[^A-Z]/g, "");
  return uppercase.length / letters.length >= 0.75;
};

const truncateForSpeech = (value: string, maxLength: number): string => {
  const clean = normalizeWhitespace(value);
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
};

const sanitizeChatText = (value: string): string => normalizeWhitespace(redactSensitiveText(value));

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

const hashMessage = (value: string): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};
