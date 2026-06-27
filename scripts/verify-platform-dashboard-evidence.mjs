import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { argv, cwd, exit } from "node:process";
import { pathToFileURL } from "node:url";
import { readPngEvidence } from "./png-evidence.mjs";
import { validateManifestGitProvenance } from "./release-git-provenance.mjs";

export const dashboardEvidenceManifestPath = ".artifacts/platform-dashboard-evidence.json";
export const dashboardEvidenceArtifactGroup = "dashboard";

const dashboardPlatforms = new Set(["youtube", "twitch"]);
const dashboardScreenshotMinimumShortEdge = 720;
const dashboardScreenshotMinimumLongEdge = 1280;
export const dashboardScreenshotStatusMaxSkewMinutes = 10;
const badYoutubeBroadcastStatuses = new Set(["complete", "failed", "revoked"]);
const badYoutubeStreamStatuses = new Set(["inactive", "error"]);
const badIdentityMarkers = new Set(["-", "mock", "n/a", "na", "none", "null", "placeholder", "test", "unknown"]);
const evidenceKinds = {
  screenshot: Object.freeze({ extension: ".png" }),
  statusJson: Object.freeze({ extension: ".json" })
};

export function createDashboardEvidenceManifest({
  youtubeScreenshot,
  youtubeScreenshotCapturedAt,
  twitchScreenshot,
  twitchScreenshotCapturedAt,
  youtubeJson,
  twitchJson,
  manifestPath = dashboardEvidenceManifestPath
} = {}) {
  const artifactInputs = [
    youtubeScreenshot ? { platform: "youtube", kind: "screenshot", path: youtubeScreenshot, capturedAt: youtubeScreenshotCapturedAt } : null,
    twitchScreenshot ? { platform: "twitch", kind: "screenshot", path: twitchScreenshot, capturedAt: twitchScreenshotCapturedAt } : null,
    youtubeJson ? { platform: "youtube", kind: "statusJson", path: youtubeJson } : null,
    twitchJson ? { platform: "twitch", kind: "statusJson", path: twitchJson } : null
  ].filter(Boolean);

  if (artifactInputs.length === 0) {
    throw new Error("Provide at least one dashboard evidence artifact.");
  }

  const manifest = {
    reportVersion: 1,
    app: "MobileLiveCaster",
    type: "platform-dashboard-evidence-manifest",
    generatedAt: new Date().toISOString(),
    git: {
      commit: commandOutput("git", ["rev-parse", "HEAD"]) || null,
      branch: commandOutput("git", ["branch", "--show-current"]) || null,
      dirty: Boolean(commandOutput("git", ["status", "--short"])),
      statusShort: commandOutput("git", ["status", "--short"]) || ""
    },
    artifacts: artifactInputs.map(createDashboardArtifactRecord)
  };

  const failures = validateDashboardEvidenceManifest(manifest, { manifestPath });
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }

  const absoluteManifestPath = resolve(manifestPath);
  mkdirSync(dirname(absoluteManifestPath), { recursive: true });
  writeFileSync(absoluteManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifestPath: relative(cwd(), absoluteManifestPath) };
}

export function readDashboardEvidenceManifest(manifestPath = dashboardEvidenceManifestPath) {
  return JSON.parse(readFileSync(resolve(manifestPath), "utf8"));
}

export function validateDashboardEvidenceManifest(
  manifest,
  { manifestPath = dashboardEvidenceManifestPath, allowDirty = true, allowCommitMismatch = true } = {}
) {
  const failures = [];
  if (manifest?.app !== "MobileLiveCaster" || manifest?.type !== "platform-dashboard-evidence-manifest" || manifest?.reportVersion !== 1) {
    failures.push("Dashboard evidence manifest is not a MobileLiveCaster platform-dashboard-evidence-manifest reportVersion 1 file.");
    return failures;
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    failures.push("Dashboard evidence manifest has no artifacts.");
    return failures;
  }
  const currentCommit = commandOutput("git", ["rev-parse", "HEAD"]);
  validateManifestGitProvenance(
    manifest.git,
    { label: "Dashboard evidence manifest", currentCommit, allowDirty, allowCommitMismatch },
    failures
  );

  const seen = new Set();
  for (const artifact of manifest.artifacts) {
    validateDashboardArtifact(artifact, failures);
    const key = `${artifact.platform}:${artifact.kind}:${artifact.path}`;
    if (seen.has(key)) {
      failures.push(`Dashboard evidence manifest contains duplicate artifact ${key}.`);
    }
    seen.add(key);
  }
  validateDashboardArtifactTiming(manifest.artifacts, failures);

  if (!workspaceRelativePath(manifestPath)) {
    failures.push("Dashboard evidence manifest path must be inside the workspace.");
  }

  return failures;
}

export function collectDashboardEvidenceArtifactRecords({ manifestPath = dashboardEvidenceManifestPath } = {}) {
  if (!existsSync(resolve(manifestPath))) {
    return [];
  }

  const manifest = readDashboardEvidenceManifest(manifestPath);
  const records = [createReleaseArtifactRecord(dashboardEvidenceArtifactGroup, manifestPath)];
  for (const artifact of Array.isArray(manifest.artifacts) ? manifest.artifacts : []) {
    if (artifact?.path && existsSync(resolve(artifact.path))) {
      records.push(createReleaseArtifactRecord(dashboardEvidenceArtifactGroup, artifact.path));
    }
  }
  return records;
}

export function validateDashboardEvidenceInReport(artifacts, fail) {
  const manifestArtifact = artifacts.find(
    (artifact) => artifact?.group === dashboardEvidenceArtifactGroup && artifact?.path === dashboardEvidenceManifestPath
  );
  if (!manifestArtifact) {
    return;
  }

  let manifest;
  try {
    manifest = readDashboardEvidenceManifest(dashboardEvidenceManifestPath);
  } catch (error) {
    fail(`Dashboard evidence manifest cannot be read: ${error instanceof Error ? error.message : String(error)}.`);
    return;
  }

  for (const failure of validateDashboardEvidenceManifest(manifest, { allowDirty: true, allowCommitMismatch: true })) {
    fail(failure);
  }

  const reportArtifactsByPath = new Map(artifacts.map((artifact) => [artifact.path, artifact]));
  for (const manifestRecord of manifest.artifacts || []) {
    const reportRecord = reportArtifactsByPath.get(manifestRecord.path);
    if (!reportRecord) {
      fail(`Report is missing dashboard evidence artifact ${manifestRecord.path}.`);
      continue;
    }
    if (reportRecord.group !== dashboardEvidenceArtifactGroup) {
      fail(`Dashboard evidence artifact ${manifestRecord.path} is recorded under group ${JSON.stringify(reportRecord.group)}.`);
    }
    if (reportRecord.bytes !== manifestRecord.bytes || reportRecord.sha256 !== manifestRecord.sha256) {
      fail(`Dashboard evidence artifact metadata mismatch for ${manifestRecord.path}.`);
    }
  }
}

function createDashboardArtifactRecord({ platform, kind, path, capturedAt }) {
  const relativePath = workspaceRelativePath(path);
  if (!relativePath) {
    throw new Error(`${platform} dashboard ${kind} evidence must be inside the workspace: ${path}`);
  }
  const expected = evidenceKinds[kind];
  if (!dashboardPlatforms.has(platform) || !expected) {
    throw new Error(`Unsupported dashboard evidence platform/kind: ${platform}/${kind}`);
  }
  if (extname(relativePath) !== expected.extension) {
    throw new Error(`${platform} dashboard ${kind} evidence must end with ${expected.extension}: ${relativePath}`);
  }
  if (!existsSync(resolve(relativePath))) {
    throw new Error(`${platform} dashboard ${kind} evidence does not exist: ${relativePath}`);
  }
  if (!statSync(resolve(relativePath)).isFile()) {
    throw new Error(`${platform} dashboard ${kind} evidence must point to a file: ${relativePath}`);
  }

  const content = readFileSync(resolve(relativePath));
  if (content.byteLength <= 0) {
    throw new Error(`${platform} dashboard ${kind} evidence is empty: ${relativePath}`);
  }
  const screenshotEvidence = kind === "screenshot" ? readPngEvidence(content) : null;
  if (kind === "screenshot" && !screenshotEvidence?.valid) {
    throw new Error(
      `${platform} dashboard screenshot evidence must be a structurally valid PNG file: ${relativePath} (${screenshotEvidence?.reason || "unknown error"})`
    );
  }
  const screenshotCapturedAt = kind === "screenshot" ? normalizeDashboardTimestamp(capturedAt) : "";
  if (kind === "screenshot" && !screenshotCapturedAt) {
    throw new Error(`${platform} dashboard screenshot evidence must include a capturedAt timestamp: ${relativePath}`);
  }
  const statusJsonSummary = kind === "statusJson" ? createStatusJsonSummary({ platform, path: relativePath }, content) : null;
  if (kind === "statusJson") {
    if (statusJsonSummary.failures.length > 0) {
      throw new Error(statusJsonSummary.failures.join("\n"));
    }
  }

  return {
    platform,
    kind,
    path: relativePath,
    basename: basename(relativePath),
    ...(screenshotEvidence?.valid
      ? { width: screenshotEvidence.width, height: screenshotEvidence.height, capturedAt: screenshotCapturedAt }
      : {}),
    ...(statusJsonSummary ? { checkedAt: statusJsonSummary.checkedAt, statusSummary: statusJsonSummary.statusSummary } : {}),
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function validateDashboardArtifact(artifact, failures) {
  const expected = evidenceKinds[artifact?.kind];
  if (!dashboardPlatforms.has(artifact?.platform) || !expected) {
    failures.push(`Dashboard evidence artifact has unsupported platform/kind: ${JSON.stringify(artifact?.platform)}/${JSON.stringify(artifact?.kind)}.`);
    return;
  }
  if (!artifact.path || artifact.path.startsWith("/") || artifact.path.startsWith("..")) {
    failures.push(`Dashboard evidence path must be workspace-relative: ${artifact.path || "-"}.`);
    return;
  }
  if (extname(artifact.path) !== expected.extension) {
    failures.push(`Dashboard evidence artifact ${artifact.path} must end with ${expected.extension}.`);
  }
  if (!existsSync(resolve(artifact.path))) {
    failures.push(`Dashboard evidence artifact file does not exist: ${artifact.path}.`);
    return;
  }
  if (!statSync(resolve(artifact.path)).isFile()) {
    failures.push(`Dashboard evidence artifact must point to a file: ${artifact.path}.`);
    return;
  }

  const content = readFileSync(resolve(artifact.path));
  const actualSha256 = createHash("sha256").update(content).digest("hex");
  if (content.byteLength <= 0) {
    failures.push(`Dashboard evidence artifact is empty: ${artifact.path}.`);
  }
  if (content.byteLength !== artifact.bytes || actualSha256 !== artifact.sha256) {
    failures.push(`Dashboard evidence artifact metadata mismatch for ${artifact.path}.`);
  }
  if (artifact.kind === "screenshot") {
    const pngEvidence = readPngEvidence(content);
    if (!pngEvidence.valid) {
      failures.push(`Dashboard evidence screenshot is not a structurally valid PNG file: ${artifact.path} (${pngEvidence.reason}).`);
    } else {
      if (artifact.width !== pngEvidence.width || artifact.height !== pngEvidence.height) {
        failures.push(`Dashboard evidence screenshot dimensions mismatch for ${artifact.path}.`);
      }
      validateDashboardScreenshotDimensions(artifact, pngEvidence, failures);
    }
    if (!normalizeDashboardTimestamp(artifact.capturedAt)) {
      failures.push(`Dashboard evidence screenshot ${artifact.path} must include a valid capturedAt timestamp.`);
    }
  }
  if (artifact.kind === "statusJson") {
    const statusJsonSummary = createStatusJsonSummary(artifact, content);
    failures.push(...statusJsonSummary.failures);
    if (artifact.checkedAt !== statusJsonSummary.checkedAt) {
      failures.push(`Dashboard evidence status JSON checkedAt mismatch for ${artifact.path}.`);
    }
    if (artifact.statusSummary !== statusJsonSummary.statusSummary) {
      failures.push(`Dashboard evidence status JSON summary mismatch for ${artifact.path}.`);
    }
  }
}

function validateDashboardArtifactTiming(artifacts, failures) {
  for (const platform of dashboardPlatforms) {
    const statusArtifacts = artifacts.filter((artifact) => artifact?.platform === platform && artifact?.kind === "statusJson");
    const screenshotArtifacts = artifacts.filter((artifact) => artifact?.platform === platform && artifact?.kind === "screenshot");
    for (const screenshotArtifact of screenshotArtifacts) {
      const screenshotCapturedAt = normalizeDashboardTimestamp(screenshotArtifact.capturedAt);
      if (!screenshotCapturedAt) {
        continue;
      }
      for (const statusArtifact of statusArtifacts) {
        const statusCheckedAt = normalizeDashboardTimestamp(statusArtifact.checkedAt);
        if (!statusCheckedAt) {
          continue;
        }
        const skewMinutes = Math.abs(Date.parse(screenshotCapturedAt) - Date.parse(statusCheckedAt)) / 60_000;
        if (skewMinutes > dashboardScreenshotStatusMaxSkewMinutes) {
          failures.push(
            `Dashboard evidence ${platform} screenshot capturedAt must be within ${dashboardScreenshotStatusMaxSkewMinutes} minutes of status JSON checkedAt.`
          );
        }
      }
    }
  }
}

function createStatusJsonSummary(artifact, content) {
  const failures = [];
  let parsed = null;
  try {
    parsed = JSON.parse(content.toString("utf8"));
  } catch {
    return { failures: [`Dashboard evidence status JSON is unreadable: ${artifact.path}.`], checkedAt: "", statusSummary: "" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { failures: [`Dashboard evidence status JSON must be an object: ${artifact.path}.`], checkedAt: "", statusSummary: "" };
  }

  const platform = stringValue(parsed.platform);
  if (platform !== artifact.platform) {
    failures.push(`Dashboard evidence status JSON ${artifact.path} platform must be ${artifact.platform}.`);
  }
  const checkedAt = stringValue(parsed.checkedAt);
  if (!checkedAt) {
    failures.push(`Dashboard evidence status JSON ${artifact.path} must include checkedAt.`);
  } else if (!Number.isFinite(Date.parse(checkedAt))) {
    failures.push(`Dashboard evidence status JSON ${artifact.path} has an invalid checkedAt timestamp.`);
  }

  if (artifact.platform === "youtube") {
    const broadcastStatus = stringValue(parsed.broadcastStatus).toLowerCase();
    const streamStatus = stringValue(parsed.streamStatus).toLowerCase();
    const broadcastId = requiredIdentityValue(parsed.broadcastId, "YouTube broadcastId", artifact.path, failures);
    const streamId = requiredIdentityValue(parsed.streamId, "YouTube streamId", artifact.path, failures);
    const channelId = requiredIdentityValue(parsed.channelId, "YouTube channelId", artifact.path, failures);
    if (!broadcastStatus) {
      failures.push(`Dashboard evidence status JSON ${artifact.path} must include YouTube broadcastStatus.`);
    } else if (badYoutubeBroadcastStatuses.has(broadcastStatus)) {
      failures.push(`Dashboard evidence status JSON ${artifact.path} has non-release YouTube broadcastStatus ${broadcastStatus}.`);
    }
    if (!streamStatus) {
      failures.push(`Dashboard evidence status JSON ${artifact.path} must include YouTube streamStatus.`);
    } else if (badYoutubeStreamStatuses.has(streamStatus)) {
      failures.push(`Dashboard evidence status JSON ${artifact.path} has non-release YouTube streamStatus ${streamStatus}.`);
    }
    return {
      failures,
      checkedAt,
      statusSummary: `broadcast:${broadcastStatus || "-"}:${broadcastId || "-"} stream:${streamStatus || "-"}:${streamId || "-"} channel:${channelId || "-"}`
    };
  }

  const liveStatus = stringValue(parsed.liveStatus).toLowerCase();
  const broadcasterId = requiredIdentityValue(parsed.broadcasterId, "Twitch broadcasterId", artifact.path, failures);
  const broadcasterLogin = requiredIdentityValue(parsed.broadcasterLogin, "Twitch broadcasterLogin", artifact.path, failures);
  const streamId = requiredIdentityValue(parsed.streamId, "Twitch streamId", artifact.path, failures);
  if (!liveStatus) {
    failures.push(`Dashboard evidence status JSON ${artifact.path} must include Twitch liveStatus.`);
  } else if (liveStatus !== "live") {
    failures.push(`Dashboard evidence status JSON ${artifact.path} has non-release Twitch liveStatus ${liveStatus}.`);
  }
  return {
    failures,
    checkedAt,
    statusSummary: `live:${liveStatus || "-"} channel:${broadcasterId || "-"}/${broadcasterLogin || "-"} stream:${streamId || "-"}`
  };
}

function validateDashboardScreenshotDimensions(artifact, dimensions, failures) {
  const shortEdge = Math.min(dimensions.width, dimensions.height);
  const longEdge = Math.max(dimensions.width, dimensions.height);
  if (shortEdge < dashboardScreenshotMinimumShortEdge || longEdge < dashboardScreenshotMinimumLongEdge) {
    failures.push(
      `Dashboard evidence screenshot ${artifact.path} must be at least ${dashboardScreenshotMinimumShortEdge}px on the short edge and ${dashboardScreenshotMinimumLongEdge}px on the long edge.`
    );
  }
}

function createReleaseArtifactRecord(group, path) {
  const relativePath = workspaceRelativePath(path);
  if (!relativePath) {
    throw new Error(`Artifact path must be inside the workspace: ${path}`);
  }
  const content = readFileSync(resolve(relativePath));
  return {
    group,
    path: relativePath,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDashboardTimestamp(value) {
  const timestamp = stringValue(value);
  return timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : "";
}

function requiredIdentityValue(value, label, path, failures) {
  const identity = stringValue(value);
  if (!identity) {
    failures.push(`Dashboard evidence status JSON ${path} must include ${label}.`);
    return "";
  }
  const lowerIdentity = identity.toLowerCase();
  if (badIdentityMarkers.has(lowerIdentity)) {
    failures.push(`Dashboard evidence status JSON ${path} has placeholder ${label} ${identity}.`);
  }
  if (identity.length > 128 || /[\s\u0000-\u001f\u007f]/.test(identity)) {
    failures.push(`Dashboard evidence status JSON ${path} has invalid ${label} ${identity}.`);
  }
  return identity;
}

function workspaceRelativePath(path) {
  const absolutePath = resolve(path);
  const relativePath = relative(cwd(), absolutePath);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return "";
  }
  return relativePath;
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.status !== 0 || result.error) {
    return "";
  }
  return result.stdout.trim();
}

function parseArgs(args) {
  const options = {
    write: false,
    verify: false,
    youtubeScreenshot: "",
    youtubeScreenshotCapturedAt: "",
    twitchScreenshot: "",
    twitchScreenshotCapturedAt: "",
    youtubeJson: "",
    twitchJson: "",
    manifestPath: dashboardEvidenceManifestPath,
    allowDirty: false,
    allowCommitMismatch: false,
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--write") {
      options.write = true;
    } else if (arg === "--verify") {
      options.verify = true;
    } else if (arg === "--allow-dirty") {
      options.allowDirty = true;
    } else if (arg === "--allow-commit-mismatch") {
      options.allowCommitMismatch = true;
    } else if (arg === "--youtube-screenshot") {
      options.youtubeScreenshot = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--youtube-screenshot=")) {
      options.youtubeScreenshot = arg.slice("--youtube-screenshot=".length);
    } else if (arg === "--youtube-screenshot-captured-at") {
      options.youtubeScreenshotCapturedAt = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--youtube-screenshot-captured-at=")) {
      options.youtubeScreenshotCapturedAt = arg.slice("--youtube-screenshot-captured-at=".length);
    } else if (arg === "--twitch-screenshot") {
      options.twitchScreenshot = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--twitch-screenshot=")) {
      options.twitchScreenshot = arg.slice("--twitch-screenshot=".length);
    } else if (arg === "--twitch-screenshot-captured-at") {
      options.twitchScreenshotCapturedAt = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--twitch-screenshot-captured-at=")) {
      options.twitchScreenshotCapturedAt = arg.slice("--twitch-screenshot-captured-at=".length);
    } else if (arg === "--youtube-json") {
      options.youtubeJson = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--youtube-json=")) {
      options.youtubeJson = arg.slice("--youtube-json=".length);
    } else if (arg === "--twitch-json") {
      options.twitchJson = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--twitch-json=")) {
      options.twitchJson = arg.slice("--twitch-json=".length);
    } else if (arg === "--manifest") {
      options.manifestPath = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--manifest=")) {
      options.manifestPath = arg.slice("--manifest=".length);
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.write && options.verify) {
    throw new Error("Use either --write or --verify, not both.");
  }
  if (!options.write && !options.verify && !options.help) {
    options.verify = true;
  }
  return options;
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run release:dashboard-evidence -- --youtube-screenshot <png> --youtube-screenshot-captured-at <iso> --twitch-screenshot <png> --twitch-screenshot-captured-at <iso> [--youtube-json <json>] [--twitch-json <json>]",
      "  npm run verify:dashboard-evidence -- [--manifest=.artifacts/platform-dashboard-evidence.json] [--allow-dirty] [--allow-commit-mismatch]",
      "",
      "Writes or verifies a hash manifest for YouTube/Twitch dashboard evidence artifacts.",
      `Dashboard screenshots require capturedAt timestamps, and matching status JSON checkedAt values must be within ${dashboardScreenshotStatusMaxSkewMinutes} minutes.`,
      "YouTube status JSON requires platform, checkedAt, broadcastId, streamId, channelId, broadcastStatus, and streamStatus.",
      "Twitch status JSON requires platform, checkedAt, broadcasterId, broadcasterLogin, streamId, and liveStatus."
    ].join("\n")
  );
}

function run() {
  try {
    const options = parseArgs(argv.slice(2));
    if (options.help) {
      printUsage();
      return 0;
    }

    if (options.write) {
      const result = createDashboardEvidenceManifest(options);
      if (!options.allowDirty && result.manifest.git.dirty) {
        throw new Error("Dashboard evidence manifest was generated from a dirty worktree. Commit or stash source changes first, or rerun with --allow-dirty for development-only evidence.");
      }
      console.log(`Wrote dashboard evidence manifest: ${result.manifestPath}`);
      console.log(`Artifacts: ${result.manifest.artifacts.map((artifact) => artifact.path).join(", ")}`);
      return 0;
    }

    if (!existsSync(resolve(options.manifestPath))) {
      throw new Error(`Dashboard evidence manifest does not exist: ${options.manifestPath}`);
    }
    const manifest = readDashboardEvidenceManifest(options.manifestPath);
    const failures = validateDashboardEvidenceManifest(manifest, {
      manifestPath: options.manifestPath,
      allowDirty: options.allowDirty,
      allowCommitMismatch: options.allowCommitMismatch
    });
    if (failures.length > 0) {
      console.error("Dashboard evidence verification failed:");
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      return 1;
    }

    console.log(`Dashboard evidence verification passed (${manifest.artifacts.length} artifacts).`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  exit(run());
}
