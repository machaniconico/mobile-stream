import { redactSensitiveText } from "./sensitiveText";

export const redactSecretsFromPersistedValue = <T>(value: T, secrets: string[] = []): T => {
  const candidates = secretCandidates(secrets);
  return redactValue(value, candidates) as T;
};

export const redactSecretsFromText = (value: string, secrets: string[] = []): string => {
  const candidates = secretCandidates(secrets);
  return redactText(value, candidates);
};

const generatedFingerprintPattern = /^(?:scene1|sve1|svr1)-[0-9a-f]{8}-[0-9a-z]+$/;

export const isSafeGeneratedFingerprint = (
  value: string | null | undefined,
  secrets: string[] = []
): value is string => {
  if (!value || !generatedFingerprintPattern.test(value)) {
    return false;
  }
  const normalized = value.toLowerCase();
  return !secretCandidates(secrets).some((secret) => {
    const candidate = secret.toLowerCase();
    return Boolean(candidate) && (normalized.includes(candidate) || candidate.includes(normalized));
  });
};

export const restoreGeneratedFingerprint = <T extends string | null | undefined>(
  redactedValue: T,
  originalValue: T,
  secrets: string[] = []
): T => (isSafeGeneratedFingerprint(originalValue, secrets) ? originalValue : redactedValue);

export const redactSecretsFromTextPreservingGeneratedFingerprints = (
  value: string,
  fingerprints: Array<string | null | undefined>,
  secrets: string[] = []
): string => {
  const uniqueFingerprints = [
    ...new Set(fingerprints.filter((fingerprint): fingerprint is string => isSafeGeneratedFingerprint(fingerprint, secrets)))
  ];
  const protectedFingerprints = uniqueFingerprints.map((fingerprint, index) => ({
    fingerprint,
    placeholder: createUnusedFingerprintPlaceholder(value, index)
  }));
  const protectedText = protectedFingerprints.reduce(
    (current, entry) => current.split(entry.fingerprint).join(entry.placeholder),
    value
  );
  return protectedFingerprints.reduce(
    (current, entry) => current.split(entry.placeholder).join(entry.fingerprint),
    redactSecretsFromText(protectedText, secrets)
  );
};

const createUnusedFingerprintPlaceholder = (value: string, index: number): string => {
  let placeholder = `__MLC_GENERATED_FINGERPRINT_${index}__`;
  while (value.includes(placeholder)) {
    placeholder = `_${placeholder}_`;
  }
  return placeholder;
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

const protocolLessLinkTldPattern = [
  "stream",
  "live",
  "link",
  "site",
  "com",
  "app",
  "dev",
  "xyz",
  "net",
  "org",
  "ai",
  "co",
  "gg",
  "io",
  "jp",
  "ly",
  "me",
  "tv"
].join("|");

const redactProtocolLessLinks = (value: string): string =>
  value
    .replace(/\bwww\.[^\s<>"']+/gi, redactProtocolLessLinkToken)
    .replace(
      new RegExp(
        `(^|[^\\w@./:])((?:[a-z0-9-]+\\.)+(?:${protocolLessLinkTldPattern})(?:/[^\\s<>"']*)?)`,
        "gi"
      ),
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
