import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanForSourceSecrets, scanTextForSourceSecrets } from "./verify-source-secrets.mjs";

const fixtureRoot = ".artifacts/verify-source-secrets-test";

describe("source secret scanner", () => {
  it("detects high-signal source and bundle credentials", () => {
    const findings = scanTextForSourceSecrets(
      [
        'const webhook = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDE";',
        'const callback = "mobilelivecaster://oauth/youtube?code=oauthcodeabcdefghijklmnopqrstuvwxyz&state=stateabcdefghijklmnopqrstuvwxyz";',
        'const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?client_id=yt-client&redirect_uri=com.mobilelivecaster.app%3A%2Foauth%2Fyoutube&response_type=code&state=stateabcdefghijklmnopqrstuvwxyz&code_challenge=pkceabcdefghijklmnopqrstuvwxyz&code_challenge_method=S256";',
        'const activate = "https://www.twitch.tv/activate?public=true&device-code=ABCDEFGH1234567890";',
        'headers.Authorization = "Bearer abcdefghijklmnopqrstuvwxyz1234567890";',
        'const url = "rtmps://a.rtmp.youtube.com/live2/abcd-efgh-ijkl-mnop-qrst";',
        'const key = "AIzaabcdefghijklmnopqrstuvwxyz123456789";',
        'const deviceCode = "abcdefghijklmnopqrstuvwxyz1234567890";',
        'const userCode = "ABCDEFGHIJKLMNOPQRSTUVWX";',
        'const token = "ghp_abcdefghijklmnopqrstuvwxyz1234567890ABCD";'
      ].join("\n"),
      "sample.ts"
    );

    expect(findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        "discord-webhook-url",
        "oauth-callback-url",
        "oauth-authorization-url",
        "oauth-device-activation-url",
        "authorization-header-token",
        "rtmp-publish-url-key",
        "google-api-key",
        "assigned-sensitive-value",
        "github-token"
      ])
    );
    expect(findings.every((finding) => finding.preview.includes("[redacted]"))).toBe(true);
  });

  it("allows redacted placeholders and test-like fake values", () => {
    const findings = scanTextForSourceSecrets(
      [
        'const webhook = "https://discord.com/api/webhooks/123456789012345678/[redacted]";',
        'const authorizationUrl = "https://accounts.google.com/o/oauth2/v2/auth?client_id=placeholder&state=[redacted]&code_challenge=[redacted]";',
        'const activationUrl = "https://www.twitch.tv/activate?device-code=[redacted]";',
        'const streamKey = "fake-stream-key-for-test-only";',
        'const deviceCode = "fake-device-code-for-test-only";',
        'headers.Authorization = "Bearer [redacted]";'
      ].join("\n"),
      "sample.ts"
    );

    expect(findings).toEqual([]);
  });

  it("scans requested workspace roots while excluding test files", () => {
    rmSync(fixtureRoot, { recursive: true, force: true });
    mkdirSync(`${fixtureRoot}/src`, { recursive: true });
    writeFileSync(
      `${fixtureRoot}/src/production.ts`,
      'export const header = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890";\n'
    );
    writeFileSync(
      `${fixtureRoot}/src/production.test.ts`,
      'export const ignored = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890";\n'
    );

    try {
      const result = scanForSourceSecrets({ roots: [`${fixtureRoot}/src`] });

      expect(result.status).toBe("failed");
      expect(result.git).toMatchObject({
        commit: expect.stringMatching(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i),
        dirty: expect.any(Boolean),
        statusShort: expect.any(String)
      });
      expect(result.findingCount).toBe(1);
      expect(result.scannedFiles).toEqual([`${fixtureRoot}/src/production.ts`]);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        file: `${fixtureRoot}/src/production.ts`,
        ruleId: "authorization-header-token"
      });
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
