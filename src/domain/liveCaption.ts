import type { CaptionOverlayCue } from "./scene";
import { redactSensitiveText } from "./sensitiveText";

export type LiveCaptionStatus = "idle" | "listening" | "unsupported" | "error";

export interface LiveCaptionSettings {
  enabled: boolean;
  language: string;
  interimResults: boolean;
  maxCueCount: number;
  maxCueLength: number;
  staleCueMillis: number;
}

export interface LiveCaptionState {
  settings: LiveCaptionSettings;
  status: LiveCaptionStatus;
  cues: CaptionOverlayCue[];
  errorMessage: string;
  updatedAt: number;
  transcriptCount: number;
}

export interface LiveCaptionCueInput {
  text: string;
  speaker?: string;
  language?: string;
  confidence?: number;
  isFinal?: boolean;
  timestampMs?: number;
}

const DEFAULT_LANGUAGE = "ja-JP";
const DEFAULT_MAX_CUE_COUNT = 5;
const DEFAULT_MAX_CUE_LENGTH = 220;
const DEFAULT_STALE_CUE_MILLIS = 8000;

export const createDefaultLiveCaptionSettings = (
  overrides: Partial<LiveCaptionSettings> = {}
): LiveCaptionSettings => normalizeLiveCaptionSettings({
  enabled: false,
  language: DEFAULT_LANGUAGE,
  interimResults: true,
  maxCueCount: DEFAULT_MAX_CUE_COUNT,
  maxCueLength: DEFAULT_MAX_CUE_LENGTH,
  staleCueMillis: DEFAULT_STALE_CUE_MILLIS,
  ...overrides
});

export const createDefaultLiveCaptionState = (
  overrides: Partial<LiveCaptionState> = {}
): LiveCaptionState => ({
  settings: createDefaultLiveCaptionSettings(overrides.settings),
  status: overrides.status ?? "idle",
  cues: normalizeCaptionCues(overrides.cues ?? [], createDefaultLiveCaptionSettings(overrides.settings)),
  errorMessage: formatLiveCaptionStatusMessage(overrides.status ?? "idle", overrides.errorMessage ?? ""),
  updatedAt: finiteNumber(overrides.updatedAt, 0),
  transcriptCount: Math.round(clamp(finiteNumber(overrides.transcriptCount, 0), 0, Number.MAX_SAFE_INTEGER))
});

export const updateLiveCaptionSettings = (
  state: LiveCaptionState,
  update: Partial<LiveCaptionSettings>
): LiveCaptionState => {
  const settings = normalizeLiveCaptionSettings({ ...state.settings, ...update });
  const enabledChanged = settings.enabled !== state.settings.enabled;
  return {
    ...state,
    settings,
    status: settings.enabled ? state.status : "idle",
    errorMessage: settings.enabled ? state.errorMessage : "",
    cues: enabledChanged && !settings.enabled ? [] : normalizeCaptionCues(state.cues, settings)
  };
};

export const setLiveCaptionStatus = (
  state: LiveCaptionState,
  status: LiveCaptionStatus,
  errorMessage = ""
): LiveCaptionState => ({
  ...state,
  status,
  errorMessage: formatLiveCaptionStatusMessage(status, errorMessage)
});

export const formatLiveCaptionFailureLogMessage = (error: unknown): string =>
  formatLiveCaptionStatusMessage(
    "error",
    error instanceof Error ? error.message : typeof error === "string" ? error : ""
  );

export const ingestLiveCaptionCue = (
  state: LiveCaptionState,
  input: LiveCaptionCueInput,
  now = Date.now()
): LiveCaptionState => {
  if (!state.settings.enabled) {
    return state;
  }
  const cue = normalizeCaptionCue(input, state.settings, now);
  if (!cue || (cue.isFinal === false && !state.settings.interimResults)) {
    return state;
  }

  const finalized = state.cues.filter((item) => item.isFinal !== false);
  const nextCues = [...finalized, cue].slice(-state.settings.maxCueCount);
  return {
    ...state,
    status: "listening",
    errorMessage: "",
    cues: nextCues,
    updatedAt: now,
    transcriptCount: cue.isFinal === false ? state.transcriptCount : state.transcriptCount + 1
  };
};

export const clearLiveCaptionCues = (state: LiveCaptionState): LiveCaptionState => ({
  ...state,
  cues: [],
  errorMessage: state.status === "error" ? state.errorMessage : "",
  transcriptCount: 0,
  updatedAt: 0
});

export const selectLiveCaptionCues = (
  state: LiveCaptionState,
  now = Date.now()
): CaptionOverlayCue[] => {
  if (!state.settings.enabled || state.status === "unsupported") {
    return [];
  }
  return state.cues
    .filter((cue) => {
      const timestamp = finiteNumber(cue.timestampMs, 0);
      return timestamp <= 0 || now - timestamp <= state.settings.staleCueMillis;
    })
    .slice(-state.settings.maxCueCount);
};

const normalizeLiveCaptionSettings = (settings: LiveCaptionSettings): LiveCaptionSettings => ({
  enabled: settings.enabled === true,
  language: normalizeLanguage(settings.language),
  interimResults: settings.interimResults !== false,
  maxCueCount: Math.round(clamp(finiteNumber(settings.maxCueCount, DEFAULT_MAX_CUE_COUNT), 1, 8)),
  maxCueLength: Math.round(clamp(finiteNumber(settings.maxCueLength, DEFAULT_MAX_CUE_LENGTH), 40, 320)),
  staleCueMillis: Math.round(clamp(finiteNumber(settings.staleCueMillis, DEFAULT_STALE_CUE_MILLIS), 1200, 30000))
});

const normalizeCaptionCues = (
  cues: CaptionOverlayCue[],
  settings: LiveCaptionSettings,
  now = Date.now()
): CaptionOverlayCue[] =>
  cues
    .map((cue) => normalizeCaptionCue(cue, settings, now))
    .filter((cue): cue is CaptionOverlayCue => cue !== null)
    .slice(-settings.maxCueCount);

const normalizeCaptionCue = (
  input: LiveCaptionCueInput,
  settings: LiveCaptionSettings,
  now: number
): CaptionOverlayCue | null => {
  const text = truncateCaptionText(input.text, settings.maxCueLength);
  if (!text) {
    return null;
  }
  const speaker = normalizeCaptionLabel(input.speaker ?? "");
  const language = normalizeLanguage(input.language ?? settings.language);
  return {
    text,
    speaker: speaker || undefined,
    language,
    confidence: clamp(finiteNumber(input.confidence, 1), 0, 1),
    isFinal: input.isFinal !== false,
    timestampMs: Math.max(0, Math.round(finiteNumber(input.timestampMs, now)))
  };
};

const truncateCaptionText = (value: string, maxLength: number): string => {
  const clean = normalizeCaptionText(value);
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
};

const normalizeCaptionText = (value: string): string =>
  normalizeWhitespace(redactSensitiveText(value).replace(/https?:\/\/\S+/gi, "[link]"));

const normalizeCaptionLabel = (value: string): string => normalizeWhitespace(redactSensitiveText(value)).slice(0, 48);

const formatLiveCaptionStatusMessage = (status: LiveCaptionStatus, errorMessage: string): string => {
  if (status !== "error" && status !== "unsupported") {
    return "";
  }

  const safeMessage = normalizeWhitespace(redactSensitiveText(errorMessage));
  if (safeLiveCaptionStatusMessages.has(safeMessage) || /^Speech recognition failed with Android error code \d+\.$/.test(safeMessage)) {
    return safeMessage;
  }

  return status === "unsupported"
    ? "Speech recognition is not available for live captions."
    : "Speech recognition failed. Details omitted.";
};

const safeLiveCaptionStatusMessages = new Set([
  "",
  "Speech recognition is not available in this browser.",
  "Browser speech recognition is not available.",
  "Native speech recognition is not linked in this build.",
  "Android speech recognition service is not available on this device.",
  "iOS speech recognition is not available on this device.",
  "iOS speech recognition is currently unavailable.",
  "Speech recognition and microphone permission are required for live captions.",
  "Speech recognition permission is required for live captions.",
  "Microphone permission is required for live captions.",
  "Microphone audio input is unavailable for live captions.",
  "Audio recording failed during speech recognition.",
  "Network error occurred during speech recognition.",
  "Speech recognition network request timed out.",
  "Speech recognition service returned an error.",
  "Speech recognition is temporarily rate limited.",
  "Requested caption language is not supported on this device.",
  "Requested caption language is unavailable on this device."
]);

const normalizeLanguage = (value: string): string => {
  const clean = normalizeWhitespace(value).replace(/_/g, "-");
  return /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(clean) ? clean : DEFAULT_LANGUAGE;
};

const normalizeWhitespace = (value: string): string =>
  value
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
