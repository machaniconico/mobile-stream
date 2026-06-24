import { describe, expect, it } from "vitest";
import { redactSecretsFromPersistedValue, redactSecretsFromText } from "./persistencePrivacy";

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
    const value = {
      note: "Authorization: Bearer youtube-access-token-secret",
      callback: "mobilelivecaster://oauth/youtube?code=oauth-code-secret&device_code=device-secret",
      payload: {
        clientSecret: '{"client_secret":"client-secret-value","refresh_token":"refresh-secret"}'
      }
    };

    const redacted = redactSecretsFromPersistedValue(value);
    const json = JSON.stringify(redacted);

    expect(json).not.toContain("youtube-access-token-secret");
    expect(json).not.toContain("oauth-code-secret");
    expect(json).not.toContain("device-secret");
    expect(json).not.toContain("client-secret-value");
    expect(json).not.toContain("refresh-secret");
    expect(json).toContain("[redacted]");
  });
});
