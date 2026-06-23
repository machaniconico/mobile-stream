import { createPlatformApiRetrySchedule } from "./platformApiRetry";

const sensitiveQueryKeys = [
  "access_token",
  "refresh_token",
  "id_token",
  "code",
  "code_verifier",
  "device_code",
  "client_secret",
  "stream_key"
];

const sensitiveKeyPattern = sensitiveQueryKeys.join("|");
const redacted = "[redacted]";

export const redactSensitiveText = (value: string): string => {
  if (!value) {
    return value;
  }

  return value
    .replace(new RegExp(`([?&#](${sensitiveKeyPattern})=)([^&#\\s]+)`, "gi"), `$1${redacted}`)
    .replace(new RegExp(`\\b(${sensitiveKeyPattern})=([^&\\s]+)`, "gi"), `$1=${redacted}`)
    .replace(new RegExp(`(["'](${sensitiveKeyPattern})["']\\s*:\\s*["'])([^"']+)(["'])`, "gi"), `$1${redacted}$4`)
    .replace(/\b(Authorization\s*:\s*)(Bearer|OAuth)\s+[^\s,;]+/gi, `$1$2 ${redacted}`)
    .replace(/\b(Bearer|OAuth)\s+[A-Za-z0-9._~+/=-]{12,}/g, `$1 ${redacted}`);
};

export const errorToSafeMessage = (error: unknown, fallback: string): string => {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : typeof error === "string" && error.trim()
        ? error.trim()
        : fallback;
  return redactSensitiveText(`${message}${createRetryHint(error)}`);
};

const createRetryHint = (error: unknown): string => {
  const retry = createPlatformApiRetrySchedule(error, {
    fallbackDelayMs: null,
    minDelayMs: 0,
    maxDelayMs: null
  });
  if (!retry.retryable) {
    return "";
  }

  if (retry.label) {
    return ` Retry after ${retry.label}.`;
  }

  return " Retry once the platform is available again.";
};
