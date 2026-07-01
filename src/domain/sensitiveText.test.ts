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
