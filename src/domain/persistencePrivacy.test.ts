import { describe, expect, it } from "vitest";
import {
  isSafeGeneratedFingerprint,
  redactSecretsFromPersistedValue,
  redactSecretsFromText,
  redactSecretsFromTextPreservingGeneratedFingerprints,
  restoreGeneratedFingerprint
} from "./persistencePrivacy";

describe("persistence privacy", () => {
  it("redacts exact, last-segment, and encoded secret candidates in persisted values", () => {
    const secret = "app/live_user_123456";
    const value = {
      deviceName: `Pixel ${secret}`,
      nested: {
        url: `rtmps://example.test/app/${encodeURIComponent(secret)}`,
        lastSegment: "live_user_123456"
      },
      notes: ["safe", `token ${secret}`]
    };

    const redacted = redactSecretsFromPersistedValue(value, [secret]);
    const json = JSON.stringify(redacted);

    expect(json).not.toContain(secret);
    expect(json).not.toContain("live_user_123456");
    expect(json).not.toContain(encodeURIComponent(secret));
    expect(json).toContain("[redacted]");
  });

  it("leaves text untouched when no useful secret candidates are supplied", () => {
    expect(redactSecretsFromText("ordinary validation note", ["", "   "])).toBe("ordinary validation note");
  });

  it("redacts common OAuth and Authorization secrets even without supplied stream keys", () => {
    const webhookUrl =
      "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz.ABCDEFGHIJKLMNOPQRSTUVWXYZ_1234567890";
    const authorizationUrl =
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=yt-client&redirect_uri=com.mobilelivecaster.app%3A%2Foauth%2Fyoutube&response_type=code&state=oauth-state-secret&code_challenge=pkce-challenge-secret&code_challenge_method=S256";
    const activationUrl = "https://www.twitch.tv/activate?public=true&device-code=ABCD-EFGH";
    const value = {
      note: "Authorization: Bearer youtube-access-token-secret",
      callback: "mobilelivecaster://oauth/youtube?code=oauth-code-secret&device_code=device-secret&user_code=user-secret",
      authorizationUrl,
      activationUrl,
      webhook: `Discord delivery failed for ${webhookUrl}`,
      payload: {
        clientSecret:
          '{"client_secret":"client-secret-value","refresh_token":"refresh-secret","userCode":"camel-user-secret"}'
      }
    };

    const redacted = redactSecretsFromPersistedValue(value);
    const json = JSON.stringify(redacted);

    expect(json).not.toContain("youtube-access-token-secret");
    expect(json).not.toContain("oauth-code-secret");
    expect(json).not.toContain("device-secret");
    expect(json).not.toContain("user-secret");
    expect(json).not.toContain("camel-user-secret");
    expect(json).not.toContain("mobilelivecaster://oauth");
    expect(json).not.toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(json).not.toContain("oauth-state-secret");
    expect(json).not.toContain("pkce-challenge-secret");
    expect(json).not.toContain("www.twitch.tv/activate");
    expect(json).not.toContain("ABCD-EFGH");
    expect(json).not.toContain(webhookUrl);
    expect(json).not.toContain("discord.com/api/webhooks/123456789012345678");
    expect(json).not.toContain("client-secret-value");
    expect(json).not.toContain("refresh-secret");
    expect(json).toContain("[redacted]");
    expect(json).toContain("[oauth authorization redacted]");
    expect(json).toContain("[oauth device activation redacted]");
    expect(json).toContain("[discord webhook redacted]");
  });

  it("redacts contact details and protocol-less links without removing retained RTMPS endpoints", () => {
    const value = {
      ingestEndpoint: "rtmps://live.example.com/app",
      note:
        "viewer@example.com shared www.example.org/private, example.tv/show, 090-1234-5678, and discord.gg/privateRoom"
    };

    const redacted = redactSecretsFromPersistedValue(value);
    const json = JSON.stringify(redacted);

    expect(json).toContain("rtmps://live.example.com/app");
    expect(json).not.toContain("viewer@example.com");
    expect(json).not.toContain("www.example.org");
    expect(json).not.toContain("example.tv");
    expect(json).not.toContain("090-1234-5678");
    expect(json).not.toContain("discord.gg/privateRoom");
    expect(json).toContain("[redacted]");
    expect(json).toContain("[email redacted]");
    expect(json).toContain("[phone redacted]");
    expect(json).toContain("[invite redacted]");
  });

  it("redacts protocol-less .com links as whole tokens", () => {
    const redacted = redactSecretsFromText("open example.com/private and a.rtmps.youtube.com/live2");

    expect(redacted).toBe("open [redacted] and [redacted]");
    expect(redacted).not.toContain("m/private");
    expect(redacted).not.toContain("m/live2");
  });

  it("preserves strict generated fingerprints unless they are explicit secrets", () => {
    const fingerprint = "svr1-97471090-868";

    expect(redactSecretsFromText(fingerprint)).toBe("svr1-[phone redacted]");
    expect(redactSecretsFromTextPreservingGeneratedFingerprints(fingerprint, [fingerprint])).toBe(fingerprint);
    expect(redactSecretsFromTextPreservingGeneratedFingerprints(fingerprint, [fingerprint], [fingerprint])).toBe(
      "svr1-[phone redacted]"
    );
    expect(
      redactSecretsFromTextPreservingGeneratedFingerprints(fingerprint, [fingerprint], ["prefix/97471090"])
    ).toBe("svr1-[phone redacted]");
    expect(restoreGeneratedFingerprint("svr1-[phone redacted]", fingerprint)).toBe(fingerprint);
    expect(restoreGeneratedFingerprint("svr1-[phone redacted]", fingerprint, [fingerprint])).toBe(
      "svr1-[phone redacted]"
    );
    expect(restoreGeneratedFingerprint("svr1-[phone redacted]", fingerprint, ["prefix/97471090"])).toBe(
      "svr1-[phone redacted]"
    );
    expect(isSafeGeneratedFingerprint("svr1-97471090-868")).toBe(true);
    expect(isSafeGeneratedFingerprint("svr1-9747109z-868")).toBe(false);
    expect(isSafeGeneratedFingerprint("custom1-97471090-868")).toBe(false);
  });
});
