import {
  normalizePlatformChatOAuthCredentialStore,
  type PlatformChatOAuthCredentialStore,
  type TwitchDeviceCodeOAuthFlow
} from "./platformChatOAuth";

export interface DiagnosticRedactionSecretInput {
  streamKey?: string | null;
  platformChatOAuthCredentials?: Partial<PlatformChatOAuthCredentialStore> | null;
  twitchDeviceOAuthFlow?: Pick<TwitchDeviceCodeOAuthFlow, "deviceCode"> | null;
}

export const createDiagnosticRedactionSecrets = ({
  streamKey,
  platformChatOAuthCredentials,
  twitchDeviceOAuthFlow
}: DiagnosticRedactionSecretInput): string[] => {
  const credentials = normalizePlatformChatOAuthCredentialStore(platformChatOAuthCredentials);
  return compactSecrets([
    streamKey,
    credentials.youtube?.accessToken,
    credentials.youtube?.refreshToken,
    credentials.twitch?.accessToken,
    credentials.twitch?.refreshToken,
    twitchDeviceOAuthFlow?.deviceCode
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
