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
  rate: number;
  pitch: number;
  volume: number;
  maxMessageLength: number;
  mutedWords: string[];
}

export interface ChatReaderState {
  settings: ChatReaderSettings;
  queue: ChatMessage[];
  history: ChatMessage[];
  speakingMessageId: string | null;
  skippedCount: number;
}

export interface ChatMessageInput {
  source?: ChatMessage["source"];
  author: string;
  body: string;
  receivedAt?: number;
}

const MAX_QUEUE_LENGTH = 24;
const MAX_HISTORY_LENGTH = 16;

export const createDefaultChatReaderSettings = (): ChatReaderSettings => ({
  enabled: true,
  readAuthorName: true,
  rate: 1,
  pitch: 1,
  volume: 0.85,
  maxMessageLength: 140,
  mutedWords: []
});

export const createDefaultChatReaderState = (): ChatReaderState => ({
  settings: createDefaultChatReaderSettings(),
  queue: [],
  history: [],
  speakingMessageId: null,
  skippedCount: 0
});

export const createChatMessage = ({ source = "manual", author, body, receivedAt = Date.now() }: ChatMessageInput): ChatMessage => {
  const cleanAuthor = normalizeWhitespace(author) || "viewer";
  const cleanBody = normalizeWhitespace(body);
  return {
    id: `chat-${receivedAt}-${hashMessage(`${source}:${cleanAuthor}:${cleanBody}`)}`,
    source,
    author: cleanAuthor.slice(0, 48),
    body: cleanBody,
    receivedAt
  };
};

export const enqueueChatMessage = (state: ChatReaderState, message: ChatMessage): ChatReaderState => {
  if (!message.body) {
    return {
      ...state,
      skippedCount: state.skippedCount + 1
    };
  }

  const history = [message, ...state.history.filter((item) => item.id !== message.id)].slice(0, MAX_HISTORY_LENGTH);

  if (isMutedMessage(message, state.settings)) {
    return {
      ...state,
      history,
      skippedCount: state.skippedCount + 1
    };
  }

  const queue = [...state.queue.filter((item) => item.id !== message.id), message].slice(-MAX_QUEUE_LENGTH);

  return {
    ...state,
    queue,
    history
  };
};

export const updateChatReaderSettings = (
  state: ChatReaderState,
  update: Partial<ChatReaderSettings>
): ChatReaderState => ({
  ...state,
  settings: normalizeChatReaderSettings({
    ...state.settings,
    ...update
  })
});

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

export const createSpeechText = (message: ChatMessage, settings: ChatReaderSettings): string | null => {
  if (isMutedMessage(message, settings)) {
    return null;
  }

  const body = truncateForSpeech(stripUrls(message.body), settings.maxMessageLength);
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
  maxMessageLength: Math.round(clamp(settings.maxMessageLength, 40, 240)),
  mutedWords: settings.mutedWords.map((word) => normalizeWhitespace(word).toLowerCase()).filter(Boolean).slice(0, 24)
});

const isMutedMessage = (message: ChatMessage, settings: ChatReaderSettings): boolean => {
  if (settings.mutedWords.length === 0) {
    return false;
  }

  const haystack = `${message.author} ${message.body}`.toLowerCase();
  return settings.mutedWords.some((word) => haystack.includes(word));
};

const stripUrls = (value: string): string => value.replace(/https?:\/\/\S+/gi, "link omitted");

const truncateForSpeech = (value: string, maxLength: number): string => {
  const clean = normalizeWhitespace(value);
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
};

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

const hashMessage = (value: string): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};
