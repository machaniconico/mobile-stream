export interface PlatformApiRetryPolicy {
  fallbackDelayMs?: number | null;
  minDelayMs?: number | null;
  maxDelayMs?: number | null;
}

export interface PlatformApiRetrySchedule {
  retryable: boolean;
  delayMs: number | null;
  retryAfterMs: number | null;
  label: string | null;
}

const defaultFallbackDelayMs = 60000;
const defaultMinDelayMs = 1000;
const defaultMaxDelayMs = 300000;

export const createPlatformApiRetrySchedule = (
  error: unknown,
  {
    fallbackDelayMs = defaultFallbackDelayMs,
    minDelayMs = defaultMinDelayMs,
    maxDelayMs = defaultMaxDelayMs
  }: PlatformApiRetryPolicy = {}
): PlatformApiRetrySchedule => {
  const metadata = readRetryMetadata(error);
  if (!metadata.retryable) {
    return {
      retryable: false,
      delayMs: null,
      retryAfterMs: metadata.retryAfterMs,
      label: null
    };
  }

  const requestedDelayMs = metadata.retryAfterMs ?? fallbackDelayMs;
  if (requestedDelayMs === null) {
    return {
      retryable: true,
      delayMs: null,
      retryAfterMs: metadata.retryAfterMs,
      label: null
    };
  }

  const delayMs = clampDelayMs(requestedDelayMs, minDelayMs, maxDelayMs);
  return {
    retryable: true,
    delayMs,
    retryAfterMs: metadata.retryAfterMs,
    label: formatPlatformApiRetryDelay(delayMs)
  };
};

export const formatPlatformApiRetryDelay = (delayMs: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(delayMs / 1000));
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

const readRetryMetadata = (error: unknown): { retryable: boolean; retryAfterMs: number | null } => {
  if (!hasRetryableFlag(error)) {
    return { retryable: false, retryAfterMs: null };
  }

  const retryAfterMs = (error as { retryAfterMs?: unknown }).retryAfterMs;
  return {
    retryable: (error as { retryable: boolean }).retryable,
    retryAfterMs: typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs >= 0 ? retryAfterMs : null
  };
};

const hasRetryableFlag = (error: unknown): error is { retryable: boolean } =>
  typeof error === "object" &&
  error !== null &&
  "retryable" in error &&
  typeof (error as { retryable?: unknown }).retryable === "boolean";

const clampDelayMs = (delayMs: number, minDelayMs: number | null, maxDelayMs: number | null): number => {
  const finiteDelayMs = Number.isFinite(delayMs) ? Math.max(0, delayMs) : defaultFallbackDelayMs;
  const withMin = minDelayMs === null ? finiteDelayMs : Math.max(minDelayMs, finiteDelayMs);
  return maxDelayMs === null ? withMin : Math.min(maxDelayMs, withMin);
};
