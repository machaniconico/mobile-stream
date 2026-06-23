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
  if (!hasRetryMetadata(error) || !error.retryable) {
    return "";
  }

  if (typeof error.retryAfterMs === "number" && Number.isFinite(error.retryAfterMs) && error.retryAfterMs >= 0) {
    return ` Retry after ${formatRetryAfter(error.retryAfterMs)}.`;
  }

  return " Retry once the platform is available again.";
};

const hasRetryMetadata = (error: unknown): error is {
  retryable: boolean;
  retryAfterMs?: number | null;
} =>
  typeof error === "object" &&
  error !== null &&
  "retryable" in error &&
  typeof (error as { retryable?: unknown }).retryable === "boolean";

const formatRetryAfter = (retryAfterMs: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(retryAfterMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.ceil(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  return remainingMinutes > 0 ? `${totalHours}h ${remainingMinutes}m` : `${totalHours}h`;
};
