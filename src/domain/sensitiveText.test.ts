import { describe, expect, it } from "vitest";
import { errorToSafeMessage, redactSensitiveText } from "./sensitiveText";

describe("sensitive text redaction", () => {
  it("redacts OAuth callback secrets from URLs and form bodies", () => {
    const text =
      "mobilelivecaster://oauth/twitch#access_token=tw-access-secret&state=ok code=yt-code-secret refresh_token=yt-refresh-secret";

    const redacted = redactSensitiveText(text);

    expect(redacted).toContain("access_token=[redacted]");
    expect(redacted).toContain("code=[redacted]");
    expect(redacted).toContain("refresh_token=[redacted]");
    expect(redacted).not.toContain("tw-access-secret");
    expect(redacted).not.toContain("yt-code-secret");
    expect(redacted).not.toContain("yt-refresh-secret");
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

  it("normalizes unknown errors with a fallback", () => {
    expect(errorToSafeMessage(null, "Fallback message")).toBe("Fallback message");
    expect(errorToSafeMessage(new Error("Bearer abcdefghijklmnop"), "Fallback message")).toBe("Bearer [redacted]");
  });
});
