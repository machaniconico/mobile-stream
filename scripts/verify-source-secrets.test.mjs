import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanForSourceSecrets, scanTextForSourceSecrets } from "./verify-source-secrets.mjs";

const fixtureRoot = ".artifacts/verify-source-secrets-test";

describe("source secret scanner", () => {
  it("detects high-signal source and bundle credentials", () => {
    const findings = scanTextForSourceSecrets(
      [
        'const webhook = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDE";',
        'headers.Authorization = "Bearer abcdefghijklmnopqrstuvwxyz1234567890";',
        'const url = "rtmps://a.rtmp.youtube.com/live2/abcd-efgh-ijkl-mnop-qrst";',
        'const key = "AIzaabcdefghijklmnopqrstuvwxyz123456789";',
        'const token = "ghp_abcdefghijklmnopqrstuvwxyz1234567890ABCD";'
      ].join("\n"),
      "sample.ts"
    );

    expect(findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        "discord-webhook-url",
        "authorization-header-token",
        "rtmp-publish-url-key",
        "google-api-key",
        "github-token"
      ])
    );
    expect(findings.every((finding) => finding.preview.includes("[redacted]"))).toBe(true);
  });

  it("allows redacted placeholders and test-like fake values", () => {
    const findings = scanTextForSourceSecrets(
      [
        'const webhook = "https://discord.com/api/webhooks/123456789012345678/[redacted]";',
        'const streamKey = "fake-stream-key-for-test-only";',
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
