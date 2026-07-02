import { describe, expect, it } from "vitest";
import { createDiagnosticRedactionSecrets } from "./diagnosticSecrets";

describe("diagnosticSecrets", () => {
  it("collects stream and OAuth secrets while dropping empty values", () => {
    expect(
      createDiagnosticRedactionSecrets({
        streamKey: " stream-key ",
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
        twitchDeviceOAuthFlow: {
          deviceCode: "device-secret"
        }
      })
    ).toEqual(["stream-key", "yt-access", "yt-refresh", "tw-access", "device-secret"]);
  });
});
