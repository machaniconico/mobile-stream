import { createPlatformApiRetrySchedule } from "./platformApiRetry";

const sensitiveQueryKeys = [
  "access_token",
  "refresh_token",
  "id_token",
  "code",
  "code_verifier",
  "device_code",
  "client_secret",
  "stream_key",
  "api_key",
  "oauth_token",
  "auth_token",
  "bearer_token",
  "accessToken",
  "refreshToken",
  "idToken",
  "codeVerifier",
  "deviceCode",
  "clientSecret",
  "streamKey",
  "apiKey",
  "oauthToken",
  "authToken",
  "bearerToken"
];

const sensitiveKeyPattern = sensitiveQueryKeys.join("|");
const sensitiveNamedCredentialPattern = [
  "access_token",
  "refresh_token",
  "id_token",
  "code_verifier",
  "device_code",
  "client_secret",
  "stream_key",
  "api_key",
  "oauth_token",
  "auth_token",
  "bearer_token",
  "accessToken",
  "refreshToken",
  "idToken",
  "codeVerifier",
  "deviceCode",
  "clientSecret",
  "streamKey",
  "apiKey",
  "oauthToken",
  "authToken",
  "bearerToken",
  "secret"
].join("|");
const redacted = "[redacted]";
const redactedEmail = "[email redacted]";
const redactedInvite = "[invite redacted]";
const redactedPhone = "[phone redacted]";
const redactedOAuthCallback = "[oauth callback redacted]";
const redactedDiscordWebhook = "[discord webhook redacted]";

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const invitePattern = /\b(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]{2,}\b/gi;
const phoneLikePattern = /(^|[^\w+])(\+?\d[\d\s().-]{7,}\d)(?=$|[^\w])/g;
const oauthCallbackPattern =
  /\b(?:mobilelivecaster:\/\/oauth\/|com\.mobilelivecaster\.app:\/oauth\/)[^\s<>"']*[?#][^\s<>"']+/gi;
const discordWebhookPattern =
  /\bhttps:\/\/(?:discord(?:app)?\.com)\/api\/webhooks\/\d{5,32}\/[A-Za-z0-9._-]{20,}/gi;

export const redactSensitiveText = (value: string): string => {
  if (!value) {
    return value;
  }

  return value
    .replace(oauthCallbackPattern, redactOAuthCallbackCandidate)
    .replace(discordWebhookPattern, redactDiscordWebhookCandidate)
    .replace(new RegExp(`([?&#](${sensitiveKeyPattern})=)([^&#\\s]+)`, "gi"), `$1${redacted}`)
    .replace(new RegExp(`\\b(${sensitiveKeyPattern})=([^&\\s]+)`, "gi"), `$1=${redacted}`)
    .replace(new RegExp(`(["'](${sensitiveKeyPattern})["']\\s*:\\s*["'])([^"']+)(["'])`, "gi"), `$1${redacted}$4`)
    .replace(new RegExp(`\\b([A-Za-z0-9_.-]*(?:${sensitiveNamedCredentialPattern}))=([^&\\s"']+)`, "gi"), `$1=${redacted}`)
    .replace(new RegExp(`(["']([A-Za-z0-9_.-]*(?:${sensitiveNamedCredentialPattern}))["']\\s*:\\s*["'])([^"']+)(["'])`, "gi"), `$1${redacted}$4`)
    .replace(/\b(Authorization\s*:\s*)(Bearer|OAuth)\s+[^\s,;]+/gi, `$1$2 ${redacted}`)
    .replace(/\b(Bearer|OAuth)\s+[A-Za-z0-9._~+/=-]{12,}/g, `$1 ${redacted}`)
    .replace(emailPattern, redactedEmail)
    .replace(invitePattern, redactedInvite)
    .replace(phoneLikePattern, redactPhoneCandidate);
};

const redactOAuthCallbackCandidate = (token: string): string => {
  const trailing = token.match(/[),.;:!?]+$/)?.[0] ?? "";
  return `${redactedOAuthCallback}${trailing}`;
};

const redactDiscordWebhookCandidate = (token: string): string => {
  const trailing = token.match(/[),.;:!?]+$/)?.[0] ?? "";
  return `${redactedDiscordWebhook}${trailing}`;
};

const redactPhoneCandidate = (match: string, prefix: string, candidate: string): string => {
  const digits = candidate.replace(/\D/g, "");
  const normalized = candidate.trim();
  if (digits.length < 10 || digits.length > 15 || /^20\d{2}[-./\s]/.test(normalized)) {
    return match;
  }
  return `${prefix}${redactedPhone}`;
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
