import type { StudioProfile } from "./profiles";
import {
  createDefaultStreamAnnouncementAutoPostSettings,
  discordWebhookContentMaxLength,
  normalizeDiscordWebhookContent,
  normalizeStreamAnnouncementAutoPostSettings,
  type StreamAnnouncementAutoPostSettings
} from "./streamAnnouncementAutoPost";
import { redactSensitiveText } from "./sensitiveText";

export interface StreamAnnouncementSettings {
  template: string;
  promptAfterGoLive: boolean;
  autoPostEnabled: boolean;
  discordWebhookUrl: string;
}

export interface StreamAnnouncementInput {
  profile: StudioProfile;
  twitchLogin?: string | null;
  secrets?: string[];
}

export interface StreamAnnouncementPreview {
  text: string;
  sensitiveValueRemoved: boolean;
  truncated: boolean;
  title: string;
  platform: string;
  url: string;
}

export const defaultStreamAnnouncementTemplate = "🔴 Live now! {title} {url}";
export const streamAnnouncementTemplateMaxLength = 500;
export const streamAnnouncementContentMaxLength = discordWebhookContentMaxLength;

export const createDefaultStreamAnnouncementSettings = (): StreamAnnouncementSettings => ({
  template: defaultStreamAnnouncementTemplate,
  promptAfterGoLive: true,
  ...createDefaultStreamAnnouncementAutoPostSettings()
});

export const normalizeStreamAnnouncementSettings = (
  settings: Partial<StreamAnnouncementSettings> | null | undefined
): StreamAnnouncementSettings => {
  const autoPost = normalizeStreamAnnouncementAutoPostSettings(settings as Partial<StreamAnnouncementAutoPostSettings> | null | undefined);
  return {
    template: normalizeStreamAnnouncementTemplate(settings?.template),
    promptAfterGoLive: settings?.promptAfterGoLive !== false,
    ...autoPost
  };
};

export const normalizeStreamAnnouncementTemplate = (template: unknown): string => {
  const normalized = normalizeTemplateText(template);
  return normalized ? normalized.slice(0, streamAnnouncementTemplateMaxLength) : defaultStreamAnnouncementTemplate;
};

export const createStreamAnnouncementText = (
  input: StreamAnnouncementInput,
  template: string = input.profile.streamAnnouncement.template
): string => createStreamAnnouncementPreview(input, template).text;

export const formatStreamAnnouncementAuditMessage = (
  preview: Pick<StreamAnnouncementPreview, "text" | "sensitiveValueRemoved" | "truncated">,
  statusMessage = "Discord announcement posted."
): string => {
  const status = normalizeSingleLine(statusMessage) || "Discord announcement posted.";
  const contentLength = Array.from(preview.text).length;
  return [
    status,
    `Content length: ${contentLength} chars.`,
    `Sensitive values removed: ${preview.sensitiveValueRemoved ? "yes" : "no"}.`,
    `Shortened: ${preview.truncated ? "yes" : "no"}.`
  ].join(" ");
};

export const createStreamAnnouncementPreview = (
  input: StreamAnnouncementInput,
  template: string = input.profile.streamAnnouncement.template
): StreamAnnouncementPreview => {
  const values = resolveStreamAnnouncementValues(input);
  const expanded = normalizeAnnouncementText(
    normalizeStreamAnnouncementTemplate(template)
      .replace(/\{title\}/g, values.title)
      .replace(/\{platform\}/g, values.platform)
      .replace(/\{url\}/g, values.url)
  );
  const redacted = normalizeAnnouncementText(redactAnnouncementSecretsFromText(expanded, createStreamAnnouncementSecrets(input)));
  const text = normalizeDiscordWebhookContent(redacted);

  return {
    text,
    sensitiveValueRemoved: redacted !== expanded,
    truncated: Array.from(redacted).length > Array.from(text).length,
    ...values
  };
};

export const resolveStreamAnnouncementValues = (
  input: StreamAnnouncementInput
): Pick<StreamAnnouncementPreview, "title" | "platform" | "url"> => {
  const { profile } = input;
  const destination = profile.destination;
  const publishing = profile.platformPublishing;

  if (destination.platform === "youtube-live") {
    return {
      title: normalizeSingleLine(publishing.title),
      platform: "YouTube",
      url: publishing.youtubeBroadcastId ? `https://www.youtube.com/watch?v=${encodeURIComponent(publishing.youtubeBroadcastId)}` : ""
    };
  }

  if (destination.platform === "twitch") {
    const twitchLogin = normalizeTwitchLogin(input.twitchLogin);
    return {
      title: normalizeSingleLine(publishing.twitchChannelTitle),
      platform: "Twitch",
      url: twitchLogin ? `https://www.twitch.tv/${twitchLogin}` : ""
    };
  }

  return {
    title: "",
    platform: normalizeSingleLine(destination.name) || "Custom RTMP",
    url: ""
  };
};

const createStreamAnnouncementSecrets = (input: StreamAnnouncementInput): string[] =>
  Array.from(
    new Set(
      [input.profile.destination.streamKey, ...(input.secrets ?? [])]
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    )
  );

const redactAnnouncementSecretsFromText = (value: string, secrets: string[]): string => {
  const candidates = secrets.flatMap((secret) => {
    const trimmed = secret.trim().replace(/^\/+/, "");
    const lastSegment = trimmed.split("/").filter(Boolean).at(-1) ?? "";
    return [trimmed, lastSegment, encodeURIComponent(trimmed), encodeURIComponent(lastSegment)];
  });

  return [...new Set(candidates.filter(Boolean))]
    .sort((left, right) => right.length - left.length)
    .reduce((current, candidate) => current.split(candidate).join("[redacted]"), redactSensitiveText(value));
};

const normalizeAnnouncementText = (value: string): string =>
  value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();

const normalizeTemplateText = (template: unknown): string =>
  typeof template === "string"
    ? template
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .trim()
    : "";

const normalizeSingleLine = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const normalizeTwitchLogin = (value: unknown): string => {
  const raw = normalizeSingleLine(value);
  if (!raw) {
    return "";
  }

  const withoutUrl = raw.replace(/^https?:\/\/(?:www\.)?twitch\.tv\//i, "");
  const login = withoutUrl.replace(/^@+/, "").split(/[/?#]/)[0] ?? "";
  return /^[a-z0-9_]{1,25}$/i.test(login) ? login.toLowerCase() : "";
};
