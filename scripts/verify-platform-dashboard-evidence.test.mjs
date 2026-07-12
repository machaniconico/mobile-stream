import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRgbaPngFixture } from "./png-test-fixtures.mjs";

const fixtureRoot = ".artifacts/verify-platform-dashboard-evidence-test";
const youtubeScreenshot = `${fixtureRoot}/youtube-dashboard.png`;
const twitchScreenshot = `${fixtureRoot}/twitch-dashboard.png`;
const youtubeJson = `${fixtureRoot}/youtube-dashboard.json`;
const twitchJson = `${fixtureRoot}/twitch-dashboard.json`;
const manifestPath = `${fixtureRoot}/platform-dashboard-evidence.json`;
const expectedYoutubeStatusSummary = "broadcast:live:ytBroadcast9xYz stream:active:ytStream8aBc channel:UCMobileLiveCaster";
const expectedTwitchStatusSummary = "live:live channel:123456789/mobilelivecaster stream:987654321";
const dashboardCapturedAt = "2026-06-23T00:00:00.000Z";

const pngBytes = createRgbaPngFixture(1, 1);
const dashboardPngBytes = pngWithDimensions(1440, 900);

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
      "--youtube-screenshot-captured-at",
      dashboardCapturedAt,
      "--twitch-screenshot",
      twitchScreenshot,
      "--twitch-screenshot-captured-at",
      dashboardCapturedAt,
      "--youtube-json",
      youtubeJson,
      "--twitch-json",
      twitchJson,
      "--manifest",
      manifestPath
    ]);

    expect(writeResult.status).toBe(0);
    expect(writeResult.stdout).toContain("Wrote dashboard evidence manifest");

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.type).toBe("platform-dashboard-evidence-manifest");
    expect(manifest.artifacts).toHaveLength(4);
    expect(manifest.artifacts.map((artifact) => `${artifact.platform}:${artifact.kind}`)).toEqual([
      "youtube:screenshot",
      "twitch:screenshot",
      "youtube:statusJson",
      "twitch:statusJson"
    ]);
    expect(manifest.artifacts[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.artifacts[0]).toMatchObject({ width: 1440, height: 900, capturedAt: dashboardCapturedAt });
    expect(manifest.artifacts[2]).toMatchObject({
      checkedAt: dashboardCapturedAt,
      statusSummary: expectedYoutubeStatusSummary
    });
    expect(manifest.artifacts[3]).toMatchObject({
      checkedAt: dashboardCapturedAt,
      statusSummary: expectedTwitchStatusSummary
    });

    const verifyResult = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);
    expect(verifyResult.status).toBe(0);
    expect(verifyResult.stdout).toContain("Dashboard evidence verification passed (4 artifacts).");
  });

  it("fails when dashboard screenshot evidence is modified after manifest creation", () => {
    writeEvidenceFiles();
    expect(
      runVerifier([
        "--write",
        "--allow-dirty",
        "--youtube-screenshot",
        youtubeScreenshot,
        "--youtube-screenshot-captured-at",
        dashboardCapturedAt,
        "--manifest",
        manifestPath
      ]).status
    ).toBe(0);

    writeFileSync(youtubeScreenshot, pngBytes.subarray(0, 12));
    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence artifact metadata mismatch for ${youtubeScreenshot}.`);
  });

  it("rejects placeholder-sized dashboard screenshots", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(youtubeScreenshot, pngBytes);

    const result = runVerifier([
      "--write",
      "--allow-dirty",
      "--youtube-screenshot",
      youtubeScreenshot,
      "--youtube-screenshot-captured-at",
      dashboardCapturedAt,
      "--manifest",
      manifestPath
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Dashboard evidence screenshot ${youtubeScreenshot} must be at least 720px on the short edge and 1280px on the long edge.`
    );
  });

  it("rejects dashboard screenshots with forged IHDR dimensions", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    const forgedPng = Buffer.from(pngBytes);
    forgedPng.writeUInt32BE(1440, 16);
    forgedPng.writeUInt32BE(900, 20);
    writeFileSync(youtubeScreenshot, forgedPng);

    const result = runVerifier([
      "--write",
      "--allow-dirty",
      "--youtube-screenshot",
      youtubeScreenshot,
      "--youtube-screenshot-captured-at",
      dashboardCapturedAt,
      "--manifest",
      manifestPath
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `youtube dashboard screenshot evidence must be a structurally valid PNG file: ${youtubeScreenshot} (CRC mismatch in IHDR chunk)`
    );
  });

  it("rejects dashboard screenshots without capturedAt evidence", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(youtubeScreenshot, dashboardPngBytes);

    const result = runVerifier(["--write", "--allow-dirty", "--youtube-screenshot", youtubeScreenshot, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`youtube dashboard screenshot evidence must include a capturedAt timestamp: ${youtubeScreenshot}`);
  });

  it("rejects dashboard screenshots with invalid capturedAt evidence", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(youtubeScreenshot, dashboardPngBytes);

    const result = runVerifier([
      "--write",
      "--allow-dirty",
      "--youtube-screenshot",
      youtubeScreenshot,
      "--youtube-screenshot-captured-at",
      "not-a-date",
      "--manifest",
      manifestPath
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`youtube dashboard screenshot evidence must include a capturedAt timestamp: ${youtubeScreenshot}`);
  });

  it("rejects dashboard screenshots captured after verification time", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(youtubeScreenshot, dashboardPngBytes);
    const futureCapturedAt = new Date(Date.now() + 5 * 60_000).toISOString();

    const result = runVerifier([
      "--write",
      "--allow-dirty",
      "--youtube-screenshot",
      youtubeScreenshot,
      "--youtube-screenshot-captured-at",
      futureCapturedAt,
      "--manifest",
      manifestPath
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence screenshot ${youtubeScreenshot} capturedAt is after the verification time.`);
  });

  it("rejects dashboard screenshots that are not fresh against status JSON", () => {
    writeEvidenceFiles();

    const result = runVerifier([
      "--write",
      "--allow-dirty",
      "--youtube-screenshot",
      youtubeScreenshot,
      "--youtube-screenshot-captured-at",
      "2026-06-23T00:30:01.000Z",
      "--youtube-json",
      youtubeJson,
      "--manifest",
      manifestPath
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Dashboard evidence youtube screenshot capturedAt must be within 10 minutes of status JSON checkedAt.");
  });

  it("rejects unreadable dashboard status JSON", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(youtubeJson, "{not-json");

    const result = runVerifier(["--write", "--allow-dirty", "--youtube-json", youtubeJson, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("JSON");
  });

  it("rejects non-canonical manifest evidence paths before reading evidence files", () => {
    writeEvidenceFiles();
    expect(
      runVerifier([
        "--write",
        "--allow-dirty",
        "--youtube-screenshot",
        youtubeScreenshot,
        "--youtube-screenshot-captured-at",
        dashboardCapturedAt,
        "--youtube-json",
        youtubeJson,
        "--manifest",
        manifestPath
      ]).status
    ).toBe(0);

    const nonCanonicalScreenshotPath = `${fixtureRoot}/nested/../youtube-dashboard.png`;
    const absoluteJsonPath = resolve(youtubeJson);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts.find((artifact) => artifact.kind === "screenshot").path = nonCanonicalScreenshotPath;
    manifest.artifacts.find((artifact) => artifact.kind === "statusJson").path = absoluteJsonPath;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence path must be workspace-relative: ${nonCanonicalScreenshotPath}.`);
    expect(result.stderr).toContain(`Dashboard evidence path must be workspace-relative: ${absoluteJsonPath}.`);
  });

  it("rejects symlinked manifest evidence files", () => {
    writeEvidenceFiles();
    expect(
      runVerifier([
        "--write",
        "--allow-dirty",
        "--youtube-json",
        youtubeJson,
        "--twitch-json",
        twitchJson,
        "--manifest",
        manifestPath
      ]).status
    ).toBe(0);

    rmSync(youtubeJson);
    symlinkSync(resolve(twitchJson), youtubeJson);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence artifact must not be a symbolic link: ${youtubeJson}.`);
  });

  it("rejects dashboard evidence paths with symlinked parents before reading linked files", () => {
    writeEvidenceFiles();
    const outsideEvidenceDir = `${fixtureRoot}/outside-evidence`;
    const evidenceLinkDir = `${fixtureRoot}/evidence-link`;
    mkdirSync(outsideEvidenceDir, { recursive: true });
    writeFileSync(
      `${outsideEvidenceDir}/youtube-dashboard.json`,
      JSON.stringify({
        platform: "youtube",
        broadcastId: "ytBroadcast9xYz",
        streamId: "ytStream8aBc",
        channelId: "UCMobileLiveCaster",
        broadcastStatus: "live",
        streamStatus: "active",
        checkedAt: dashboardCapturedAt
      })
    );
    symlinkSync(resolve(outsideEvidenceDir), evidenceLinkDir);

    const result = runVerifier([
      "--write",
      "--allow-dirty",
      "--youtube-json",
      `${evidenceLinkDir}/youtube-dashboard.json`,
      "--manifest",
      manifestPath
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`youtube dashboard statusJson evidence path parent must not be a symbolic link: ${evidenceLinkDir}`);
  });

  it("rejects manifest evidence paths with symlinked parents before reading linked files", () => {
    writeEvidenceFiles();
    expect(
      runVerifier([
        "--write",
        "--allow-dirty",
        "--youtube-json",
        youtubeJson,
        "--manifest",
        manifestPath
      ]).status
    ).toBe(0);

    const outsideEvidenceDir = `${fixtureRoot}/outside-evidence`;
    const evidenceLinkDir = `${fixtureRoot}/evidence-link`;
    mkdirSync(outsideEvidenceDir, { recursive: true });
    writeFileSync(
      `${outsideEvidenceDir}/youtube-dashboard.json`,
      JSON.stringify({
        platform: "youtube",
        broadcastId: "ytBroadcast9xYz",
        streamId: "ytStream8aBc",
        channelId: "UCMobileLiveCaster",
        broadcastStatus: "live",
        streamStatus: "active",
        checkedAt: dashboardCapturedAt
      })
    );
    symlinkSync(resolve(outsideEvidenceDir), evidenceLinkDir);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts[0].path = `${evidenceLinkDir}/youtube-dashboard.json`;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence artifact path parent must not be a symbolic link: ${evidenceLinkDir}.`);
  });

  it("rejects symlinked dashboard evidence manifest output paths before writing linked targets", () => {
    writeEvidenceFiles();
    const outsideManifest = `${fixtureRoot}/outside-manifest.json`;
    const manifestSymlink = `${fixtureRoot}/manifest-link.json`;
    writeFileSync(outsideManifest, "unchanged");
    symlinkSync(resolve(outsideManifest), manifestSymlink);

    const result = runVerifier([
      "--write",
      "--allow-dirty",
      "--youtube-json",
      youtubeJson,
      "--manifest",
      manifestSymlink
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence manifest output must not be a symbolic link: ${manifestSymlink}`);
    expect(readFileSync(outsideManifest, "utf8")).toBe("unchanged");
  });

  it("rejects symlinked dashboard evidence manifest input paths before reading linked reports", () => {
    writeEvidenceFiles();
    expect(
      runVerifier([
        "--write",
        "--allow-dirty",
        "--youtube-json",
        youtubeJson,
        "--manifest",
        manifestPath
      ]).status
    ).toBe(0);

    const manifestSymlink = `${fixtureRoot}/manifest-link.json`;
    symlinkSync(resolve(manifestPath), manifestSymlink);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestSymlink]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence manifest must not be a symbolic link: ${manifestSymlink}`);
  });

  it("rejects dangling dashboard evidence manifest input symlinks before creating linked targets", () => {
    writeEvidenceFiles();
    const missingManifestTarget = `${fixtureRoot}/missing-manifest-target.json`;
    const manifestSymlink = `${fixtureRoot}/manifest-link.json`;
    symlinkSync(resolve(missingManifestTarget), manifestSymlink);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestSymlink]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence manifest must not be a symbolic link: ${manifestSymlink}`);
    expect(existsSync(missingManifestTarget)).toBe(false);
  });

  it("rejects dashboard evidence manifest input paths with symlinked parents before reading linked reports", () => {
    writeEvidenceFiles();
    expect(
      runVerifier([
        "--write",
        "--allow-dirty",
        "--youtube-json",
        youtubeJson,
        "--manifest",
        manifestPath
      ]).status
    ).toBe(0);

    const outsideManifestDir = `${fixtureRoot}/outside-manifests`;
    const manifestLinkDir = `${fixtureRoot}/manifest-link-dir`;
    mkdirSync(outsideManifestDir, { recursive: true });
    writeFileSync(`${outsideManifestDir}/platform-dashboard-evidence.json`, readFileSync(manifestPath));
    symlinkSync(resolve(outsideManifestDir), manifestLinkDir);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", `${manifestLinkDir}/platform-dashboard-evidence.json`]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence manifest path parent must not be a symbolic link: ${manifestLinkDir}`);
  });

  it("rejects dangling dashboard evidence manifest output symlinks before creating linked targets", () => {
    writeEvidenceFiles();
    const missingManifestTarget = `${fixtureRoot}/missing-manifest-target.json`;
    const manifestSymlink = `${fixtureRoot}/manifest-link.json`;
    symlinkSync(resolve(missingManifestTarget), manifestSymlink);

    const result = runVerifier([
      "--write",
      "--allow-dirty",
      "--youtube-json",
      youtubeJson,
      "--manifest",
      manifestSymlink
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence manifest output must not be a symbolic link: ${manifestSymlink}`);
    expect(existsSync(missingManifestTarget)).toBe(false);
  });

  it("rejects dashboard evidence manifest output paths with symlinked parents before writing linked targets", () => {
    writeEvidenceFiles();
    const outsideManifestDir = `${fixtureRoot}/outside-manifests`;
    const manifestLinkDir = `${fixtureRoot}/manifest-link-dir`;
    mkdirSync(outsideManifestDir, { recursive: true });
    symlinkSync(resolve(outsideManifestDir), manifestLinkDir);

    const result = runVerifier([
      "--write",
      "--allow-dirty",
      "--youtube-json",
      youtubeJson,
      "--manifest",
      `${manifestLinkDir}/platform-dashboard-evidence.json`
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence manifest path parent must not be a symbolic link: ${manifestLinkDir}`);
    expect(existsSync(`${outsideManifestDir}/platform-dashboard-evidence.json`)).toBe(false);
  });

  it("rejects dashboard status JSON for the wrong platform", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(
      youtubeJson,
      JSON.stringify({
        platform: "twitch",
        broadcastStatus: "live",
        streamStatus: "active",
        checkedAt: new Date().toISOString()
      })
    );

    const result = runVerifier(["--write", "--allow-dirty", "--youtube-json", youtubeJson, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence status JSON ${youtubeJson} platform must be youtube.`);
  });

  it("rejects YouTube dashboard status JSON without release-ready statuses", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(
      youtubeJson,
      JSON.stringify({
        platform: "youtube",
        broadcastId: "ytBroadcast9xYz",
        streamId: "ytStream8aBc",
        channelId: "UCMobileLiveCaster",
        broadcastStatus: "complete",
        streamStatus: "inactive",
        checkedAt: new Date().toISOString()
      })
    );

    const result = runVerifier(["--write", "--allow-dirty", "--youtube-json", youtubeJson, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence status JSON ${youtubeJson} has non-release YouTube broadcastStatus complete.`);
    expect(result.stderr).toContain(`Dashboard evidence status JSON ${youtubeJson} has non-release YouTube streamStatus inactive.`);
  });

  it("rejects Twitch dashboard status JSON unless it is live", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(
      twitchJson,
      JSON.stringify({
        platform: "twitch",
        broadcasterId: "123456789",
        broadcasterLogin: "mobilelivecaster",
        streamId: "987654321",
        liveStatus: "offline",
        checkedAt: new Date().toISOString()
      })
    );

    const result = runVerifier(["--write", "--allow-dirty", "--twitch-json", twitchJson, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence status JSON ${twitchJson} has non-release Twitch liveStatus offline.`);
  });

  it("rejects dashboard status JSON without platform identity proof", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(
      youtubeJson,
      JSON.stringify({
        platform: "youtube",
        broadcastId: "placeholder",
        streamId: "ytStream8aBc",
        broadcastStatus: "live",
        streamStatus: "active",
        checkedAt: new Date().toISOString()
      })
    );

    const result = runVerifier(["--write", "--allow-dirty", "--youtube-json", youtubeJson, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence status JSON ${youtubeJson} has placeholder YouTube broadcastId placeholder.`);
    expect(result.stderr).toContain(`Dashboard evidence status JSON ${youtubeJson} must include YouTube channelId.`);
  });

  it("rejects Twitch dashboard status JSON without broadcaster and stream identity proof", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(
      twitchJson,
      JSON.stringify({
        platform: "twitch",
        broadcasterId: "123456789",
        broadcasterLogin: "unknown",
        liveStatus: "live",
        checkedAt: new Date().toISOString()
      })
    );

    const result = runVerifier(["--write", "--allow-dirty", "--twitch-json", twitchJson, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence status JSON ${twitchJson} has placeholder Twitch broadcasterLogin unknown.`);
    expect(result.stderr).toContain(`Dashboard evidence status JSON ${twitchJson} must include Twitch streamId.`);
  });

  it("rejects status JSON summary changes in the dashboard manifest", () => {
    writeEvidenceFiles();
    expect(
      runVerifier([
        "--write",
        "--allow-dirty",
        "--youtube-screenshot",
        youtubeScreenshot,
        "--youtube-screenshot-captured-at",
        dashboardCapturedAt,
        "--youtube-json",
        youtubeJson,
        "--manifest",
        manifestPath
      ]).status
    ).toBe(0);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const statusRecord = manifest.artifacts.find((artifact) => artifact.kind === "statusJson");
    statusRecord.statusSummary = "broadcast:live:otherBroadcast stream:active:ytStream8aBc channel:UCMobileLiveCaster";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence status JSON summary mismatch for ${youtubeJson}.`);
  });

  it("rejects verification when git commit provenance is missing", () => {
    writeEvidenceFiles();
    expect(
      runVerifier([
        "--write",
        "--allow-dirty",
        "--youtube-screenshot",
        youtubeScreenshot,
        "--youtube-screenshot-captured-at",
        dashboardCapturedAt,
        "--manifest",
        manifestPath
      ]).status
    ).toBe(0);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.git.commit = "";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Dashboard evidence manifest git commit is missing.");
  });

  it("rejects manifest evidence paths with traversal segments", () => {
    writeEvidenceFiles();
    expect(
      runVerifier([
        "--write",
        "--allow-dirty",
        "--youtube-screenshot",
        youtubeScreenshot,
        "--youtube-screenshot-captured-at",
        dashboardCapturedAt,
        "--manifest",
        manifestPath
      ]).status
    ).toBe(0);

    const traversalPath = `${fixtureRoot}/nested/../../../../youtube-dashboard.png`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts[0].path = traversalPath;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = runVerifier(["--verify", "--allow-dirty", "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence path must be workspace-relative: ${traversalPath}.`);
  });

  it("rejects dashboard status JSON without a valid checkedAt timestamp", () => {
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(
      youtubeJson,
      JSON.stringify({
        platform: "youtube",
        broadcastId: "ytBroadcast9xYz",
        streamId: "ytStream8aBc",
        channelId: "UCMobileLiveCaster",
        broadcastStatus: "live",
        streamStatus: "active",
        checkedAt: "not-a-date"
      })
    );

    const result = runVerifier(["--write", "--allow-dirty", "--youtube-json", youtubeJson, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence status JSON ${youtubeJson} has an invalid checkedAt timestamp.`);
  });

  it("rejects dashboard status JSON checked after verification time", () => {
    const futureCheckedAt = new Date(Date.now() + 5 * 60_000).toISOString();
    writeEvidenceFiles({ checkedAt: futureCheckedAt });

    const result = runVerifier(["--write", "--allow-dirty", "--youtube-json", youtubeJson, "--manifest", manifestPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Dashboard evidence status JSON ${youtubeJson} checkedAt is after the verification time.`);
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
            capturedAt: dashboardCapturedAt,
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

function writeEvidenceFiles({ checkedAt = dashboardCapturedAt } = {}) {
  mkdirSync(fixtureRoot, { recursive: true });
  writeFileSync(youtubeScreenshot, dashboardPngBytes);
  writeFileSync(twitchScreenshot, dashboardPngBytes);
  writeFileSync(
    youtubeJson,
    JSON.stringify({
      platform: "youtube",
      broadcastId: "ytBroadcast9xYz",
      streamId: "ytStream8aBc",
      channelId: "UCMobileLiveCaster",
      broadcastStatus: "live",
      streamStatus: "active",
      checkedAt
    })
  );
  writeFileSync(
    twitchJson,
    JSON.stringify({
      platform: "twitch",
      broadcasterId: "123456789",
      broadcasterLogin: "mobilelivecaster",
      streamId: "987654321",
      liveStatus: "live",
      checkedAt
    })
  );
}

function runVerifier(args) {
  return spawnSync(process.execPath, ["scripts/verify-platform-dashboard-evidence.mjs", ...args], {
    encoding: "utf8"
  });
}

function pngWithDimensions(width, height) {
  return createRgbaPngFixture(width, height);
}
