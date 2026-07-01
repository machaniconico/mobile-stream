import { redactSensitiveText } from "./sensitiveText";

export const redactSecretsFromPersistedValue = <T>(value: T, secrets: string[] = []): T => {
  const candidates = secretCandidates(secrets);
  return redactValue(value, candidates) as T;
};

export const redactSecretsFromText = (value: string, secrets: string[] = []): string => {
  const candidates = secretCandidates(secrets);
  return redactText(value, candidates);
};

const redactValue = (value: unknown, candidates: string[]): unknown => {
  if (typeof value === "string") {
    return redactText(value, candidates);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, candidates));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactValue(item, candidates)])
    );
  }
  return value;
};

const redactText = (value: string, candidates: string[]): string =>
  candidates.reduce(
    (current, candidate) => current.split(candidate).join("[redacted]"),
    redactProtocolLessLinks(redactSensitiveText(value))
  );

const redactProtocolLessLinks = (value: string): string =>
  value
    .replace(/\bwww\.[^\s<>"']+/gi, redactProtocolLessLinkToken)
    .replace(
      /(^|[^\w@./:])((?:[a-z0-9-]+\.)+(?:ai|app|co|com|dev|gg|io|jp|link|live|ly|me|net|org|site|stream|tv|xyz)(?:\/[^\s<>"']*)?)/gi,
      (_match, prefix: string, token: string) => `${prefix}${redactProtocolLessLinkToken(token)}`
    );

const redactProtocolLessLinkToken = (token: string): string => {
  const trailing = token.match(/[),.;:!?]+$/)?.[0] ?? "";
  return `[redacted]${trailing}`;
};

const secretCandidates = (secrets: string[]): string[] => {
  const candidates = secrets.flatMap((secret) => {
    const trimmed = secret.trim().replace(/^\/+/, "");
    const lastSegment = trimmed.split("/").filter(Boolean).at(-1) ?? "";
    return [trimmed, lastSegment, encodeURIComponent(trimmed), encodeURIComponent(lastSegment)];
  });

  return [...new Set(candidates.filter(Boolean))].sort((left, right) => right.length - left.length);
};
