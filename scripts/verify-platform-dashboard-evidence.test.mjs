import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

const fixtureRoot = ".artifacts/verify-platform-dashboard-evidence-test";
const youtubeScreenshot = `${fixtureRoot}/youtube-dashboard.png`;
const twitchScreenshot = `${fixtureRoot}/twitch-dashboard.png`;
const youtubeJson = `${fixtureRoot}/youtube-dashboard.json`;
const manifestPath = `${fixtureRoot}/platform-dashboard-evidence.json`;

const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

describe("platform dashboard evidence verifier", () => {
  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("writes and verifies YouTube/Twitch dashboard evidence hashes", () => {
    writeEvidenceFiles();

    const writeResult = runVerifier([
      "--write",
      "--allow-dirty",
      "--youtube-screenshot",
      youtubeScreenshot,
      "--twitch-screenshot",
      twitchScreenshot,
      "--youtube-json",
      youtubeJson,
      "--manifest",
      manifestPath
    ]);

    expect(writeResult.status).toBe(0);
    expect(writeResult.stdout).toContain("Wrote dashboard evidence manifest");

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.type).toBe("platform-dashboard-evidence-manifest");
    expect(manifest.artifacts).toHaveLength(3);
    expect(manifest.artifacts.map((artifact) => `${artifact.platform}:${artifact.kind}`)).toEqual([
      "youtube:screenshot",
      "twitch:screenshot",
      "youtube:statusJson"
    ]);
    expect(manifest.artifacts[0].sha256).toMatch(/^[a-f0-9]{64}$/);

    const verifyResult = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);
    expect(verifyResult.status).toBe(0);
    expect(verifyResult.stdout).toContain("Dashboard evidence verification passed (3 artifacts).");
  });

  it("fails when dashboard screenshot evidence is modified after manifest creation", () => {
    writeEvidenceFiles();
    expect(
      runVerifier(["--write", "--allow-dirty", "--youtube-screenshot", youtubeScreenshot, "--manifest", manifestPath]).status
    ).toBe(0);

    writeFileSync(youtubeScreenshot, pngBytes.subarray(0, 12));
    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence artifact metadata mismatch for ${youtubeScreenshot}.`);
  });

  it("rejects unreadable dashboard status JSON", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(youtubeJson, "{not-json");

    const result = runVerifier(["--write", "--allow-dirty", "--youtube-json", youtubeJson, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("JSON");
  });

  it("rejects empty dashboard evidence during manifest verification", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(youtubeScreenshot, "");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        reportVersion: 1,
        app: "MobileLiveCaster",
        type: "platform-dashboard-evidence-manifest",
        generatedAt: new Date().toISOString(),
        git: { commit: "", branch: "main", dirty: true, statusShort: "" },
        artifacts: [
          {
            platform: "youtube",
            kind: "screenshot",
            path: youtubeScreenshot,
            basename: "youtube-dashboard.png",
            bytes: 0,
            sha256: createHash("sha256").update("").digest("hex")
          }
        ]
      })
    );

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence artifact is empty: ${youtubeScreenshot}.`);
  });
});

function writeEvidenceFiles() {
  mkdirSync(fixtureRoot, { recursive: true });
  writeFileSync(youtubeScreenshot, pngBytes);
  writeFileSync(twitchScreenshot, pngBytes);
  writeFileSync(
    youtubeJson,
    JSON.stringify({
      platform: "youtube",
      broadcastStatus: "live",
      streamStatus: "active",
      checkedAt: new Date().toISOString()
    })
  );
}

function runVerifier(args) {
  return spawnSync(process.execPath, ["scripts/verify-platform-dashboard-evidence.mjs", ...args], {
    encoding: "utf8"
  });
}
