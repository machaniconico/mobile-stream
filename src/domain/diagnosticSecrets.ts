import {
  normalizePlatformChatOAuthCredentialStore,
  type PlatformChatOAuthFlow,
  type PlatformChatOAuthCredentialStore,
  type TwitchDeviceCodeOAuthFlow
} from "./platformChatOAuth";

export interface DiagnosticRedactionSecretInput {
  streamKey?: string | null;
  discordWebhookUrl?: string | null;
  platformChatOAuthCredentials?: Partial<PlatformChatOAuthCredentialStore> | null;
  platformChatOAuthFlow?: Partial<Pick<PlatformChatOAuthFlow, "state" | "codeVerifier">> | null;
  twitchDeviceOAuthFlow?: Partial<Pick<TwitchDeviceCodeOAuthFlow, "deviceCode" | "userCode">> | null;
}

export const createDiagnosticRedactionSecrets = ({
  streamKey,
  discordWebhookUrl,
  platformChatOAuthCredentials,
  platformChatOAuthFlow,
  twitchDeviceOAuthFlow
}: DiagnosticRedactionSecretInput): string[] => {
  const credentials = normalizePlatformChatOAuthCredentialStore(platformChatOAuthCredentials);
  return compactSecrets([
    streamKey,
    discordWebhookUrl,
    credentials.youtube?.accessToken,
    credentials.youtube?.refreshToken,
    credentials.twitch?.accessToken,
    credentials.twitch?.refreshToken,
    platformChatOAuthFlow?.state,
    platformChatOAuthFlow?.codeVerifier,
    twitchDeviceOAuthFlow?.deviceCode,
    twitchDeviceOAuthFlow?.userCode
  ]);
};

const compactSecrets = (values: Array<string | null | undefined>): string[] =>
  Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    )
  );
