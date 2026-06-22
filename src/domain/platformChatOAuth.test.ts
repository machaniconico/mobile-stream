import { describe, expect, it, vi } from "vitest";
import {
  completePlatformChatOAuthCallback,
  createDefaultPlatformChatOAuthSettings,
  createPlatformChatOAuthFlow,
  createPkceS256Challenge,
  exchangeYouTubeOAuthCode,
  parseOAuthCallback,
  validateTwitchOAuthToken
} from "./platformChatOAuth";

const oauthSettings = () => ({
  ...createDefaultPlatformChatOAuthSettings(),
  youtubeClientId: "youtube-client",
  youtubeRedirectUri: "com.example.mobilelivecaster:/oauth/youtube",
  twitchClientId: "twitch-client",
  twitchRedirectUri: "mobilelivecaster://oauth/twitch"
});

describe("platformChatOAuth", () => {
  it("creates RFC7636-compatible S256 PKCE challenges", () => {
    expect(createPkceS256Challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
  });

  it("fails closed when secure random generation is unavailable", () => {
    const originalCrypto = globalThis.crypto;
    try {
      vi.stubGlobal("crypto", undefined);
      expect(() => createPlatformChatOAuthFlow("youtube", oauthSettings(), 10)).toThrow("Secure random generation is unavailable");
    } finally {
      vi.stubGlobal("crypto", originalCrypto);
    }
  });

  it("builds YouTube OAuth authorization URLs with PKCE and readonly scope", () => {
    const flow = createPlatformChatOAuthFlow("youtube", oauthSettings(), 10);
    const url = new URL(flow.authorizationUrl);

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("youtube-client");
    expect(url.searchParams.get("redirect_uri")).toBe("com.example.mobilelivecaster:/oauth/youtube");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/youtube.readonly");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(flow.codeVerifier?.length).toBe(64);
  });

  it("builds Twitch implicit OAuth URLs with chat read scope", () => {
    const flow = createPlatformChatOAuthFlow("twitch", oauthSettings(), 10);
    const url = new URL(flow.authorizationUrl);

    expect(url.origin + url.pathname).toBe("https://id.twitch.tv/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("twitch-client");
    expect(url.searchParams.get("redirect_uri")).toBe("mobilelivecaster://oauth/twitch");
    expect(url.searchParams.get("response_type")).toBe("token");
    expect(url.searchParams.get("scope")).toBe("chat:read");
    expect(flow.codeVerifier).toBeNull();
  });

  it("parses query and fragment OAuth callbacks", () => {
    expect(parseOAuthCallback("mobilelivecaster://oauth/youtube?code=yt-code&state=abc")).toMatchObject({
      code: "yt-code",
      state: "abc"
    });
    expect(parseOAuthCallback("mobilelivecaster://oauth/twitch#access_token=tw-token&scope=chat%3Aread&state=abc")).toMatchObject({
      accessToken: "tw-token",
      state: "abc",
      scopes: ["chat:read"]
    });
  });

  it("exchanges YouTube authorization codes without placing secrets in URLs", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "yt-access",
        refresh_token: "yt-refresh",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/youtube.readonly",
        token_type: "Bearer"
      })
    });

    const credential = await exchangeYouTubeOAuthCode("yt-code", "verifier", oauthSettings(), fetcher, 1000);

    expect(fetcher).toHaveBeenCalledWith("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: expect.stringContaining("code=yt-code")
    });
    expect(fetcher.mock.calls[0][0]).not.toContain("yt-code");
    expect(credential).toMatchObject({
      platform: "youtube",
      accessToken: "yt-access",
      refreshToken: "yt-refresh",
      expiresAt: 3601000
    });
  });

  it("validates Twitch tokens and extracts login for IRC NICK", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        client_id: "twitch-client",
        login: "macha",
        scopes: ["chat:read"],
        user_id: "123",
        expires_in: 1800
      })
    });

    const credential = await validateTwitchOAuthToken("OAuth tw-access", fetcher, 5000);

    expect(fetcher).toHaveBeenCalledWith("https://id.twitch.tv/oauth2/validate", {
      headers: {
        Accept: "application/json",
        Authorization: "OAuth tw-access"
      }
    });
    expect(credential).toMatchObject({
      platform: "twitch",
      accessToken: "tw-access",
      twitchLogin: "macha",
      scopes: ["chat:read"],
      expiresAt: 1805000
    });
  });

  it("completes Twitch callbacks into in-memory chat auth", async () => {
    const flow = createPlatformChatOAuthFlow("twitch", oauthSettings(), 10);
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        login: "macha",
        scopes: ["chat:read"],
        expires_in: 1800
      })
    });

    const result = await completePlatformChatOAuthCallback(
      `mobilelivecaster://oauth/twitch#access_token=tw-token&state=${flow.state}`,
      flow,
      oauthSettings(),
      fetcher,
      1
    );

    expect(result.auth).toMatchObject({
      twitchOauthToken: "tw-token",
      twitchLogin: "macha"
    });
  });
});
