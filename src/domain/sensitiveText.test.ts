import { describe, expect, it } from "vitest";
import { errorToSafeMessage, redactSensitiveText } from "./sensitiveText";

describe("sensitive text redaction", () => {
  it("redacts OAuth callback secrets from URLs and form bodies", () => {
    const text =
      "mobilelivecaster://oauth/twitch#access_token=tw-access-secret&state=ok code=yt-code-secret refresh_token=yt-refresh-secret";

    const redacted = redactSensitiveText(text);

    expect(redacted).toContain("[oauth callback redacted]");
    expect(redacted).toContain("code=[redacted]");
    expect(redacted).toContain("refresh_token=[redacted]");
    expect(redacted).not.toContain("mobilelivecaster://oauth");
    expect(redacted).not.toContain("tw-access-secret");
    expect(redacted).not.toContain("yt-code-secret");
    expect(redacted).not.toContain("yt-refresh-secret");
  });

  it("redacts credential-bearing mobile OAuth callback URLs as whole tokens", () => {
    const text =
      "callbacks mobilelivecaster://oauth/youtube?code=yt-code-secret. " +
      "com.mobilelivecaster.app:/oauth/twitch#access_token=tw-access-secret, " +
      "redirect_uri=com.mobilelivecaster.app:/oauth/youtube";

    const redacted = redactSensitiveText(text);

    expect(redacted).toContain("[oauth callback redacted].");
    expect(redacted).toContain("[oauth callback redacted],");
    expect(redacted).toContain("redirect_uri=com.mobilelivecaster.app:/oauth/youtube");
    expect(redacted).not.toContain("yt-code-secret");
    expect(redacted).not.toContain("tw-access-secret");
    expect(redacted).not.toContain("mobilelivecaster://oauth/youtube?");
    expect(redacted).not.toContain("com.mobilelivecaster.app:/oauth/twitch#");
  });

  it("redacts OAuth authorization URLs as whole tokens", () => {
    const googleAuthorizationUrl =
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=yt-client&redirect_uri=com.mobilelivecaster.app%3A%2Foauth%2Fyoutube&response_type=code&state=oauth-state-secret&code_challenge=pkce-challenge-secret&code_challenge_method=S256";
    const twitchAuthorizationUrl =
      "https://id.twitch.tv/oauth2/authorize?client_id=tw-client&redirect_uri=mobilelivecaster%3A%2F%2Foauth%2Ftwitch&response_type=token&scope=chat%3Aread&state=twitch-state-secret";

    const redacted = redactSensitiveText(`open ${googleAuthorizationUrl}. then ${twitchAuthorizationUrl},`);

    expect(redacted).toContain("[oauth authorization redacted].");
    expect(redacted).toContain("[oauth authorization redacted],");
    expect(redacted).not.toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(redacted).not.toContain("id.twitch.tv/oauth2/authorize");
    expect(redacted).not.toContain("oauth-state-secret");
    expect(redacted).not.toContain("pkce-challenge-secret");
    expect(redacted).not.toContain("twitch-state-secret");
  });

  it("redacts OAuth device-code values and activation URLs", () => {
    const activationUrl = "https://www.twitch.tv/activate?public=true&device-code=ABCD-EFGH";
    const text =
      `${activationUrl}. device_code=device-secret user_code=user-secret ` +
      '{"deviceCode":"camel-device-secret","userCode":"camel-user-secret","verificationUriComplete":"https://www.twitch.tv/activate?device-code=IJKL-MNOP"}';

    const redacted = redactSensitiveText(text);

    expect(redacted).toContain("[oauth device activation redacted].");
    expect(redacted).toContain("device_code=[redacted]");
    expect(redacted).toContain("user_code=[redacted]");
    expect(redacted).toContain('"deviceCode":"[redacted]"');
    expect(redacted).toContain('"userCode":"[redacted]"');
    expect(redacted).toContain('"verificationUriComplete":"[redacted]"');
    expect(redacted).not.toContain("www.twitch.tv/activate");
    expect(redacted).not.toContain("ABCD-EFGH");
    expect(redacted).not.toContain("user-secret");
    expect(redacted).not.toContain("camel-device-secret");
    expect(redacted).not.toContain("camel-user-secret");
  });

  it("redacts Discord webhook URLs as whole credential tokens", () => {
    const webhookUrl =
      "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz.ABCDEFGHIJKLMNOPQRSTUVWXYZ_1234567890";
    const legacyWebhookUrl =
      "https://discordapp.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz.ABCDEFGHIJKLMNOPQRSTUVWXYZ_1234567890";

    const redacted = redactSensitiveText(`failed ${webhookUrl}. fallback ${legacyWebhookUrl},`);

    expect(redacted).toContain("[discord webhook redacted].");
    expect(redacted).toContain("[discord webhook redacted],");
    expect(redacted).not.toContain("discord.com/api/webhooks/123456789012345678");
    expect(redacted).not.toContain("discordapp.com/api/webhooks/123456789012345678");
    expect(redacted).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });

  it("prioritizes OAuth key redaction before phone-like number redaction", () => {
    expect(redactSensitiveText("access_token=1234567890123")).toBe("access_token=[redacted]");
  });

  it("redacts authorization headers and token payload fields", () => {
    const text =
      'Authorization: Bearer abcdefghijklmnop, next Authorization: OAuth oauthsecretvalue123 {"access_token":"json-token-secret"}';

    const redacted = redactSensitiveText(text);

    expect(redacted).toContain("Authorization: Bearer [redacted]");
    expect(redacted).toContain("Authorization: OAuth [redacted]");
    expect(redacted).toContain('"access_token":"[redacted]"');
    expect(redacted).not.toContain("abcdefghijklmnop");
    expect(redacted).not.toContain("oauthsecretvalue123");
    expect(redacted).not.toContain("json-token-secret");
  });

  it("redacts camelCase credential assignments and nested JSON secret fields", () => {
    const text =
      '{"apiKey":"platform-api-key-secret","nestedClientSecret":"client-secret-value"} ' +
      "customOauthToken=custom-oauth-token-secret bearerToken=bearer-token-secret";

    const redacted = redactSensitiveText(text);

    expect(redacted).toContain('"apiKey":"[redacted]"');
    expect(redacted).toContain('"nestedClientSecret":"[redacted]"');
    expect(redacted).toContain("customOauthToken=[redacted]");
    expect(redacted).toContain("bearerToken=[redacted]");
    expect(redacted).not.toContain("platform-api-key-secret");
    expect(redacted).not.toContain("client-secret-value");
    expect(redacted).not.toContain("custom-oauth-token-secret");
    expect(redacted).not.toContain("bearer-token-secret");
  });

  it("redacts credential-bearing HTTP-style headers", () => {
    const text = "X-API-Key: abc123 Client-Secret: client123 OAuth-Token: oauth123";

    const redacted = redactSensitiveText(text);

    expect(redacted).toContain("X-API-Key: [redacted]");
    expect(redacted).toContain("Client-Secret: [redacted]");
    expect(redacted).toContain("OAuth-Token: [redacted]");
    expect(redacted).not.toContain("abc123");
    expect(redacted).not.toContain("client123");
    expect(redacted).not.toContain("oauth123");
  });

  it("redacts structured credential headers in JSON objects and bracket assignments", () => {
    const text =
      '{"X-API-Key":"alpha-alpha-alpha-1234","Authorization":"Bearer bravo-bravo-bravo-1234"} ' +
      'headers["Client-Secret"] = "charlie-charlie-1234";';

    const redacted = redactSensitiveText(text);

    expect(redacted).toContain('"X-API-Key":"[redacted]"');
    expect(redacted).toContain('"Authorization":"[redacted]"');
    expect(redacted).toContain('headers["Client-Secret"] = "[redacted]"');
    expect(redacted).not.toContain("alpha-alpha-alpha-1234");
    expect(redacted).not.toContain("bravo-bravo-bravo-1234");
    expect(redacted).not.toContain("charlie-charlie-1234");
  });

  it("redacts Twitch IRC oauth commands and RTMP publish URL stream keys", () => {
    const text =
      "PASS oauth:twitch-oauth-secret-1234 " +
      "rtmps://a.rtmp.youtube.com/live2/youtube-stream-key-1234?backup=1 " +
      "rtmp://live.twitch.tv/app/twitch-stream-key-5678";

    const redacted = redactSensitiveText(text);

    expect(redacted).toContain("PASS oauth:[redacted]");
    expect(redacted).toContain("rtmps://a.rtmp.youtube.com/live2/[redacted]");
    expect(redacted).toContain("rtmp://live.twitch.tv/app/[redacted]");
    expect(redacted).not.toContain("twitch-oauth-secret-1234");
    expect(redacted).not.toContain("youtube-stream-key-1234");
    expect(redacted).not.toContain("twitch-stream-key-5678");
  });

  it("redacts high-signal API keys and tokens", () => {
    const googleApiKey = ["AI", "za", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000"].join("");
    const openAiKey = ["sk", "-proj-", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"].join("");
    const githubToken = ["gh", "p_", "cccccccccccccccccccccccccccccc0000"].join("");
    const jwtToken = [
      "eyJhbGciOiJIUzI1NiJ9",
      "eyJzdWIiOiJzZW5zaXRpdmUtdGV4dCJ9",
      "c2lnbmF0dXJlMTIzNDU2Nzg5MA"
    ].join(".");

    const redacted = redactSensitiveText(`keys ${googleApiKey} ${openAiKey} ${githubToken} ${jwtToken}`);

    expect(redacted).toBe("keys [redacted] [redacted] [redacted] [redacted]");
    expect(redacted).not.toContain(googleApiKey);
    expect(redacted).not.toContain(openAiKey);
    expect(redacted).not.toContain(githubToken);
    expect(redacted).not.toContain(jwtToken);
  });

  it("redacts private key blocks", () => {
    const privateKeyBlock = [
      ["-----BEGIN ", "PRIVATE KEY-----"].join(""),
      "not-a-real-key",
      ["-----END ", "PRIVATE KEY-----"].join("")
    ].join("\n");

    const redacted = redactSensitiveText(`before ${privateKeyBlock} after`);

    expect(redacted).toBe("before [redacted] after");
    expect(redacted).not.toContain("not-a-real-key");
    expect(redacted).not.toContain(privateKeyBlock);
  });

  it("redacts personal contact details and invite links", () => {
    const text =
      "mail me@example.com, phone 090-1234-5678, intl +1 415 555 2671, discord.gg/privateRoom";

    const redacted = redactSensitiveText(text);

    expect(redacted).toContain("mail [email redacted]");
    expect(redacted).toContain("phone [phone redacted]");
    expect(redacted).toContain("intl [phone redacted]");
    expect(redacted).toContain("[invite redacted]");
    expect(redacted).not.toContain("me@example.com");
    expect(redacted).not.toContain("090-1234-5678");
    expect(redacted).not.toContain("+1 415 555 2671");
    expect(redacted).not.toContain("discord.gg/privateRoom");
  });

  it("does not redact date-like numbers as phone contacts", () => {
    expect(redactSensitiveText("build window 2026-07-01 12:30 JST")).toBe("build window 2026-07-01 12:30 JST");
  });

  it("normalizes unknown errors with a fallback", () => {
    expect(errorToSafeMessage(null, "Fallback message")).toBe("Fallback message");
    expect(errorToSafeMessage(new Error("Bearer abcdefghijklmnop"), "Fallback message")).toBe("Bearer [redacted]");
  });

  it("adds retry timing hints for retryable platform errors", () => {
    const error = Object.assign(new Error("YouTube chat request failed with HTTP 429."), {
      retryable: true,
      retryAfterMs: 61_000
    });

    expect(errorToSafeMessage(error, "Fallback message")).toBe(
      "YouTube chat request failed with HTTP 429. Retry after 2m."
    );
  });

  it("adds a generic retry hint when no retry-after value is available", () => {
    const error = Object.assign(new Error("Twitch stream key request failed with HTTP 503."), {
      retryable: true,
      retryAfterMs: null
    });

    expect(errorToSafeMessage(error, "Fallback message")).toBe(
      "Twitch stream key request failed with HTTP 503. Retry once the platform is available again."
    );
  });

  it("does not add retry hints for non-retryable platform errors", () => {
    const error = Object.assign(new Error("Twitch OAuth failed with HTTP 401."), {
      retryable: false,
      retryAfterMs: 10_000
    });

    expect(errorToSafeMessage(error, "Fallback message")).toBe("Twitch OAuth failed with HTTP 401.");
  });

  it("redacts secrets before showing retry hints", () => {
    const error = Object.assign(new Error("Authorization: Bearer abcdefghijklmnop failed with HTTP 429."), {
      retryable: true,
      retryAfterMs: 5_000
    });

    expect(errorToSafeMessage(error, "Fallback message")).toBe(
      "Authorization: Bearer [redacted] failed with HTTP 429. Retry after 5s."
    );
  });
});
