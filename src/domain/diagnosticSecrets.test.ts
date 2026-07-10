import { describe, expect, it } from "vitest";
import { createDiagnosticRedactionSecrets } from "./diagnosticSecrets";

describe("diagnosticSecrets", () => {
  it("collects stream and OAuth secrets while dropping empty values", () => {
    expect(
      createDiagnosticRedactionSecrets({
        streamKey: " stream-key ",
        discordWebhookUrl:
          " https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz.ABCDEFGHIJKLMNOPQRSTUVWXYZ_1234567890 ",
        platformChatOAuthCredentials: {
          youtube: {
            platform: "youtube",
            accessToken: " yt-access ",
            refreshToken: "yt-refresh",
            expiresAt: null,
            scopes: [],
            twitchLogin: null,
            twitchUserId: null,
            validatedAt: null,
            clientId: null,
            redirectUri: null
          },
          twitch: {
            platform: "twitch",
            accessToken: "tw-access",
            refreshToken: "",
            expiresAt: null,
            scopes: [],
            twitchLogin: "macha",
            twitchUserId: "123",
            validatedAt: null,
            clientId: "twitch-client",
            redirectUri: null
          }
        },
        platformChatOAuthFlow: {
          state: "oauth-state-secret",
          codeVerifier: "pkce-verifier-secret"
        },
        twitchDeviceOAuthFlow: {
          deviceCode: "device-secret",
          userCode: "user-code-secret"
        }
      })
    ).toEqual([
      "stream-key",
      "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz.ABCDEFGHIJKLMNOPQRSTUVWXYZ_1234567890",
      "yt-access",
      "yt-refresh",
      "tw-access",
      "oauth-state-secret",
      "pkce-verifier-secret",
      "device-secret",
      "user-code-secret"
    ]);
  });
});
