import { describe, expect, it, vi } from "vitest";
import {
  completePlatformChatOAuthCallback,
  assessPlatformChatOAuthCredentialHealth,
  createEmptyPlatformChatOAuthCredentialStore,
  createDefaultPlatformChatOAuthSettings,
  createPlatformChatOAuthFlow,
  createPlatformChatAuthFromCredential,
  createPlatformChatAuthFromCredentialStore,
  createPkceS256Challenge,
  ensureFreshPlatformChatOAuthCredential,
  exchangeYouTubeOAuthCode,
  getPlatformChatOAuthCredential,
  normalizePlatformChatOAuthCredentialStore,
  parseOAuthCallback,
  pollTwitchDeviceCodeOAuthFlow,
  refreshTwitchOAuthCredential,
  refreshYouTubeOAuthCredential,
  shouldRefreshPlatformChatOAuthCredential,
  shouldValidateTwitchOAuthCredential,
  startTwitchDeviceCodeOAuthFlow,
  upsertPlatformChatOAuthCredential,
  validateTwitchOAuthToken
} from "./platformChatOAuth";

const oauthSettings = () => ({
  ...createDefaultPlatformChatOAuthSettings(),
  youtubeClientId: "youtube-client",
  youtubeRedirectUri: "com.mobilelivecaster.app:/oauth/youtube",
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

  it("assesses retained OAuth credential scope and expiry health without exposing tokens", () => {
    expect(
      assessPlatformChatOAuthCredentialHealth(
        {
          platform: "youtube",
          accessToken: "secret-youtube-token",
          refreshToken: "secret-refresh-token",
          expiresAt: Date.parse("2099-01-01T00:00:00.000Z"),
          scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
          twitchLogin: null,
          twitchUserId: null,
          validatedAt: 1000,
          clientId: "youtube-client",
          redirectUri: "com.mobilelivecaster.app:/oauth/youtube"
        },
        {
          platform: "youtube",
          requiredScopes: ["https://www.googleapis.com/auth/youtube.force-ssl"],
          purposeLabel: "YouTube broadcast management",
          now: 5000
        }
      )
    ).toMatchObject({
      status: "missing-scopes",
      severity: "fail",
      missingScopes: ["https://www.googleapis.com/auth/youtube.force-ssl"],
      message: expect.not.stringContaining("secret-youtube-token")
    });

    expect(
      assessPlatformChatOAuthCredentialHealth(null, {
        platform: "twitch",
        requiredScopes: ["chat:read"],
        purposeLabel: "Twitch chat readout",
        missingCredentialSeverity: "warn"
      })
    ).toMatchObject({
      status: "missing-credential",
      severity: "warn"
    });
  });

  it("reports missing scopes before refreshable expiry warnings", () => {
    expect(
      assessPlatformChatOAuthCredentialHealth(
        {
          platform: "youtube",
          accessToken: "yt-access",
          refreshToken: "yt-refresh",
          expiresAt: 1100,
          scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
          twitchLogin: null,
          twitchUserId: null,
          validatedAt: 1,
          clientId: "youtube-client",
          redirectUri: "com.mobilelivecaster.app:/oauth/youtube"
        },
        {
          platform: "youtube",
          requiredScopes: ["https://www.googleapis.com/auth/youtube.force-ssl"],
          purposeLabel: "YouTube broadcast management",
          now: 1000
        }
      )
    ).toMatchObject({
      status: "missing-scopes",
      severity: "fail"
    });
  });

  it("builds YouTube OAuth authorization URLs with PKCE and live management scopes", () => {
    const flow = createPlatformChatOAuthFlow("youtube", oauthSettings(), 10);
    const url = new URL(flow.authorizationUrl);

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("youtube-client");
    expect(url.searchParams.get("redirect_uri")).toBe("com.mobilelivecaster.app:/oauth/youtube");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(flow.codeVerifier?.length).toBe(64);
  });

  it("builds Twitch implicit OAuth URLs with chat, stream key, and metadata scopes", () => {
    const flow = createPlatformChatOAuthFlow("twitch", oauthSettings(), 10);
    const url = new URL(flow.authorizationUrl);

    expect(url.origin + url.pathname).toBe("https://id.twitch.tv/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("twitch-client");
    expect(url.searchParams.get("redirect_uri")).toBe("mobilelivecaster://oauth/twitch");
    expect(url.searchParams.get("response_type")).toBe("token");
    expect(url.searchParams.get("scope")).toBe("chat:read channel:read:stream_key channel:manage:broadcast");
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
      expiresAt: 3601000,
      clientId: "youtube-client",
      redirectUri: "com.mobilelivecaster.app:/oauth/youtube"
    });
  });

  it("fails safely when a successful YouTube token response is not JSON", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("html outage page with yt-code");
      }
    });

    await expect(exchangeYouTubeOAuthCode("yt-code", "verifier", oauthSettings(), fetcher, 1000)).rejects.toThrow(
      "YouTube token exchange returned unreadable JSON with HTTP 200."
    );
  });

  it("refreshes YouTube access tokens with stored refresh tokens", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "yt-access-2",
        expires_in: 1800,
        scope: "https://www.googleapis.com/auth/youtube.readonly",
        token_type: "Bearer"
      })
    });

    const credential = await refreshYouTubeOAuthCredential(
      {
        platform: "youtube",
        accessToken: "yt-access-1",
        refreshToken: "yt-refresh",
        expiresAt: 2000,
        scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
        twitchLogin: null,
        twitchUserId: null,
        validatedAt: 1,
        clientId: "stored-youtube-client",
        redirectUri: "com.mobilelivecaster.app:/oauth/youtube"
      },
      {
        ...oauthSettings(),
        youtubeClientId: ""
      },
      fetcher,
      1000
    );

    expect(fetcher).toHaveBeenCalledWith("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: expect.stringContaining("client_id=stored-youtube-client")
    });
    expect(fetcher.mock.calls[0][1].body).toContain("grant_type=refresh_token");
    expect(fetcher.mock.calls[0][0]).not.toContain("yt-refresh");
    expect(credential).toMatchObject({
      platform: "youtube",
      accessToken: "yt-access-2",
      refreshToken: "yt-refresh",
      expiresAt: 1801000,
      clientId: "stored-youtube-client"
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
      expiresAt: 1805000,
      validatedAt: 5000,
      twitchUserId: "123"
    });
  });

  it("starts Twitch device OAuth without a client secret", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        device_code: "device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "https://www.twitch.tv/activate?public=true&device-code=ABCD-EFGH",
        expires_in: 1800,
        interval: 5
      })
    });

    const result = await startTwitchDeviceCodeOAuthFlow(oauthSettings(), fetcher, 1000);

    expect(fetcher).toHaveBeenCalledWith("https://id.twitch.tv/oauth2/device", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: expect.stringContaining("client_id=twitch-client")
    });
    expect(fetcher.mock.calls[0][1].body).toContain("scopes=chat%3Aread+channel%3Aread%3Astream_key+channel%3Amanage%3Abroadcast");
    expect(fetcher.mock.calls[0][1].body).not.toContain("client_secret");
    expect(result.flow).toMatchObject({
      platform: "twitch",
      deviceCode: "device-code",
      userCode: "ABCD-EFGH",
      expiresAt: 1801000,
      intervalMs: 5000,
      lastPollAt: null
    });
  });

  it("does not parse Twitch device OAuth start HTTP error bodies", async () => {
    const json = vi.fn(async () => {
      throw new Error("raw body with twitch-client");
    });
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json
    });

    await expect(startTwitchDeviceCodeOAuthFlow(oauthSettings(), fetcher, 1000)).rejects.toThrow(
      "Twitch device OAuth start failed with HTTP 503."
    );
    expect(json).not.toHaveBeenCalled();
  });

  it("keeps Twitch device OAuth pending until the user authorizes", async () => {
    const flow = {
      platform: "twitch" as const,
      deviceCode: "device-code",
      userCode: "ABCD-EFGH",
      verificationUri: "https://www.twitch.tv/activate",
      expiresAt: 20000,
      intervalMs: 5000,
      createdAt: 1000,
      lastPollAt: null
    };
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        status: 400,
        message: "authorization_pending"
      })
    });

    const result = await pollTwitchDeviceCodeOAuthFlow(flow, oauthSettings(), fetcher, 6000);

    expect(result.status).toBe("pending");
    if (result.status !== "pending") {
      throw new Error("expected pending");
    }
    expect(result.flow.lastPollAt).toBe(6000);
    expect(fetcher).toHaveBeenCalledWith("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: expect.stringContaining("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code")
    });
    expect(fetcher.mock.calls[0][1].body).toContain("device_code=device-code");
  });

  it("polls Twitch device OAuth into a stored refreshable credential", async () => {
    const flow = {
      platform: "twitch" as const,
      deviceCode: "device-code",
      userCode: "ABCD-EFGH",
      verificationUri: "https://www.twitch.tv/activate",
      expiresAt: 20000,
      intervalMs: 5000,
      createdAt: 1000,
      lastPollAt: null
    };
    const fetcher = vi.fn(async (...args: [string, RequestInit?]) => {
      const [url] = args;
      if (url === "https://id.twitch.tv/oauth2/validate") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            client_id: "twitch-client",
            login: "macha",
            scopes: ["chat:read", "channel:read:stream_key"],
            user_id: "123",
            expires_in: 1800
          })
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "tw-access",
          refresh_token: "tw-refresh",
          expires_in: 14400,
          scope: ["chat:read", "channel:read:stream_key", "channel:manage:broadcast"],
          token_type: "bearer"
        })
      };
    });

    const result = await pollTwitchDeviceCodeOAuthFlow(flow, oauthSettings(), fetcher, 6000);

    expect(result.status).toBe("authorized");
    if (result.status !== "authorized") {
      throw new Error("expected authorized");
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe("https://id.twitch.tv/oauth2/token");
    expect(String(fetcher.mock.calls[0]?.[1]?.body ?? "")).not.toContain("tw-refresh");
    expect(fetcher.mock.calls[1][0]).toBe("https://id.twitch.tv/oauth2/validate");
    expect(result.credential).toMatchObject({
      platform: "twitch",
      accessToken: "tw-access",
      refreshToken: "tw-refresh",
      expiresAt: 14406000,
      scopes: ["chat:read", "channel:read:stream_key", "channel:manage:broadcast"],
      twitchLogin: "macha",
      twitchUserId: "123",
      clientId: "twitch-client"
    });
    expect(result.auth).toMatchObject({
      twitchOauthToken: "tw-access",
      twitchLogin: "macha"
    });
  });

  it("refreshes Twitch device OAuth access tokens and rotates refresh tokens", async () => {
    const fetcher = vi.fn(async (...args: [string, RequestInit?]) => {
      const [url] = args;
      if (url === "https://id.twitch.tv/oauth2/validate") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            login: "macha",
            scopes: ["chat:read"],
            user_id: "123",
            expires_in: 1800
          })
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "tw-access-2",
          refresh_token: "tw-refresh-2",
          expires_in: 1800,
          scope: ["chat:read"],
          token_type: "bearer"
        })
      };
    });

    const credential = await refreshTwitchOAuthCredential(
      {
        platform: "twitch",
        accessToken: "tw-access-1",
        refreshToken: "tw-refresh-1",
        expiresAt: 2000,
        scopes: ["chat:read"],
        twitchLogin: "macha",
        twitchUserId: "123",
        validatedAt: 1,
        clientId: "stored-twitch-client",
        redirectUri: null
      },
      {
        ...oauthSettings(),
        twitchClientId: ""
      },
      fetcher,
      1000
    );

    expect(fetcher.mock.calls[0][0]).toBe("https://id.twitch.tv/oauth2/token");
    expect(String(fetcher.mock.calls[0]?.[1]?.body ?? "")).toContain("client_id=stored-twitch-client");
    expect(String(fetcher.mock.calls[0]?.[1]?.body ?? "")).toContain("grant_type=refresh_token");
    expect(fetcher.mock.calls[0][0]).not.toContain("tw-refresh-1");
    expect(credential).toMatchObject({
      platform: "twitch",
      accessToken: "tw-access-2",
      refreshToken: "tw-refresh-2",
      expiresAt: 1801000,
      clientId: "stored-twitch-client",
      twitchLogin: "macha",
      twitchUserId: "123"
    });
  });

  it("refreshes expiring credentials before platform API calls", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "yt-access-2",
        expires_in: 1800,
        scope: "https://www.googleapis.com/auth/youtube.force-ssl",
        token_type: "Bearer"
      })
    });

    const result = await ensureFreshPlatformChatOAuthCredential(
      {
        platform: "youtube",
        accessToken: "yt-access-1",
        refreshToken: "yt-refresh",
        expiresAt: 1050,
        scopes: ["https://www.googleapis.com/auth/youtube.force-ssl"],
        twitchLogin: null,
        twitchUserId: null,
        validatedAt: 1,
        clientId: "stored-youtube-client",
        redirectUri: "com.mobilelivecaster.app:/oauth/youtube"
      },
      {
        ...oauthSettings(),
        youtubeClientId: ""
      },
      fetcher,
      1000
    );

    expect(result.refreshed).toBe(true);
    expect(result.credential?.accessToken).toBe("yt-access-2");
    expect(result.message).toBe("YouTube OAuth token refreshed before platform API call.");
    expect(String(fetcher.mock.calls[0]?.[1]?.body ?? "")).toContain("refresh_token=yt-refresh");
  });

  it("fails closed when an expiring OAuth token cannot be refreshed", async () => {
    await expect(
      ensureFreshPlatformChatOAuthCredential(
        {
          platform: "twitch",
          accessToken: "tw-access",
          refreshToken: null,
          expiresAt: 1050,
          scopes: ["channel:manage:broadcast"],
          twitchLogin: "macha",
          twitchUserId: "123",
          validatedAt: 1,
          clientId: "twitch-client",
          redirectUri: "mobilelivecaster://oauth/twitch"
        },
        oauthSettings(),
        vi.fn(),
        1000
      )
    ).rejects.toThrow("Twitch OAuth token expires soon and cannot be refreshed");
  });

  it("validates stale Twitch credentials before platform API calls", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        client_id: "twitch-client",
        login: "macha",
        scopes: ["channel:manage:broadcast"],
        user_id: "123",
        expires_in: 1800
      })
    });

    const result = await ensureFreshPlatformChatOAuthCredential(
      {
        platform: "twitch",
        accessToken: "tw-access",
        refreshToken: "tw-refresh",
        expiresAt: 99999999,
        scopes: ["channel:manage:broadcast"],
        twitchLogin: "macha",
        twitchUserId: "123",
        validatedAt: 1,
        clientId: "twitch-client",
        redirectUri: "mobilelivecaster://oauth/twitch"
      },
      oauthSettings(),
      fetcher,
      3600002
    );

    expect(result.validated).toBe(true);
    expect(result.refreshed).toBe(false);
    expect(result.credential?.refreshToken).toBe("tw-refresh");
    expect(result.message).toBe("Twitch OAuth token validated before platform API call.");
  });

  it("stores OAuth credentials per platform while accepting legacy single-credential payloads", () => {
    const legacyYouTube = {
      platform: "youtube" as const,
      accessToken: "yt-token",
      refreshToken: "yt-refresh",
      expiresAt: 99999999,
      scopes: ["https://www.googleapis.com/auth/youtube.force-ssl"],
      twitchLogin: null,
      twitchUserId: null,
      validatedAt: 1,
      clientId: "youtube-client",
      redirectUri: "com.mobilelivecaster.app:/oauth/youtube"
    };
    const twitch = {
      platform: "twitch" as const,
      accessToken: "tw-token",
      refreshToken: "tw-refresh",
      expiresAt: 99999999,
      scopes: ["chat:read", "channel:manage:broadcast"],
      twitchLogin: "macha",
      twitchUserId: "123",
      validatedAt: 1,
      clientId: "twitch-client",
      redirectUri: "mobilelivecaster://oauth/twitch"
    };

    const migrated = normalizePlatformChatOAuthCredentialStore(legacyYouTube);
    const combined = upsertPlatformChatOAuthCredential(migrated, twitch);

    expect(getPlatformChatOAuthCredential(combined, "youtube")?.accessToken).toBe("yt-token");
    expect(getPlatformChatOAuthCredential(combined, "twitch")?.accessToken).toBe("tw-token");
    expect(createPlatformChatAuthFromCredentialStore(combined)).toMatchObject({
      youtubeAccessToken: "yt-token",
      twitchOauthToken: "tw-token",
      twitchLogin: "macha"
    });
    expect(upsertPlatformChatOAuthCredential(createEmptyPlatformChatOAuthCredentialStore(), null)).toEqual({
      youtube: null,
      twitch: null
    });
  });

  it("derives chat auth and refresh/validation scheduling from stored credentials", () => {
    expect(
      createPlatformChatAuthFromCredential({
        platform: "twitch",
        accessToken: "tw-token",
        refreshToken: null,
        expiresAt: 100000,
        scopes: ["chat:read"],
        twitchLogin: "macha",
        twitchUserId: "123",
        validatedAt: 1,
        clientId: "twitch-client",
        redirectUri: "mobilelivecaster://oauth/twitch"
      })
    ).toMatchObject({
      twitchOauthToken: "tw-token",
      twitchLogin: "macha"
    });
    expect(
      shouldRefreshPlatformChatOAuthCredential({
        platform: "twitch",
        accessToken: "tw-token",
        refreshToken: "tw-refresh",
        expiresAt: 1000,
        scopes: [],
        twitchLogin: "macha",
        twitchUserId: "123",
        validatedAt: 1,
        clientId: "twitch-client",
        redirectUri: null
      }, 900)
    ).toBe(true);
    expect(
      shouldValidateTwitchOAuthCredential({
        platform: "twitch",
        accessToken: "tw-token",
        refreshToken: null,
        expiresAt: null,
        scopes: ["chat:read"],
        twitchLogin: "macha",
        twitchUserId: "123",
        validatedAt: 0,
        clientId: "twitch-client",
        redirectUri: "mobilelivecaster://oauth/twitch"
      }, 3600000)
    ).toBe(true);
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
