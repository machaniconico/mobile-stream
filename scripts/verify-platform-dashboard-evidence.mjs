import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { argv, cwd, exit } from "node:process";
import { pathToFileURL } from "node:url";

export const dashboardEvidenceManifestPath = ".artifacts/platform-dashboard-evidence.json";
export const dashboardEvidenceArtifactGroup = "dashboard";

const dashboardPlatforms = new Set(["youtube", "twitch"]);
const dashboardScreenshotMinimumShortEdge = 720;
const dashboardScreenshotMinimumLongEdge = 1280;
const badYoutubeBroadcastStatuses = new Set(["complete", "failed", "revoked"]);
const badYoutubeStreamStatuses = new Set(["inactive", "error"]);
const evidenceKinds = {
  screenshot: Object.freeze({ extension: ".png" }),
  statusJson: Object.freeze({ extension: ".json" })
};

export function createDashboardEvidenceManifest({
  youtubeScreenshot,
  twitchScreenshot,
  youtubeJson,
  twitchJson,
  manifestPath = dashboardEvidenceManifestPath
} = {}) {
  const artifactInputs = [
    youtubeScreenshot ? { platform: "youtube", kind: "screenshot", path: youtubeScreenshot } : null,
    twitchScreenshot ? { platform: "twitch", kind: "screenshot", path: twitchScreenshot } : null,
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
  if (!allowDirty && manifest.git?.dirty) {
    failures.push("Dashboard evidence manifest was generated from a dirty worktree.");
  }

  const currentCommit = commandOutput("git", ["rev-parse", "HEAD"]);
  if (!allowCommitMismatch && currentCommit && manifest.git?.commit && currentCommit !== manifest.git.commit) {
    failures.push(`Dashboard evidence manifest commit ${manifest.git.commit} does not match current commit ${currentCommit}.`);
  }

  const seen = new Set();
  for (const artifact of manifest.artifacts) {
    validateDashboardArtifact(artifact, failures);
    const key = `${artifact.platform}:${artifact.kind}:${artifact.path}`;
    if (seen.has(key)) {
      failures.push(`Dashboard evidence manifest contains duplicate artifact ${key}.`);
    }
    seen.add(key);
  }

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

function createDashboardArtifactRecord({ platform, kind, path }) {
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
  const screenshotDimensions = kind === "screenshot" ? readPngDimensions(content) : null;
  if (kind === "screenshot" && !screenshotDimensions) {
    throw new Error(`${platform} dashboard screenshot evidence must be a readable PNG file: ${relativePath}`);
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
    ...(screenshotDimensions ? { width: screenshotDimensions.width, height: screenshotDimensions.height } : {}),
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
    const dimensions = readPngDimensions(content);
    if (!dimensions) {
      failures.push(`Dashboard evidence screenshot is not a readable PNG file: ${artifact.path}.`);
    } else {
      if (artifact.width !== dimensions.width || artifact.height !== dimensions.height) {
        failures.push(`Dashboard evidence screenshot dimensions mismatch for ${artifact.path}.`);
      }
      validateDashboardScreenshotDimensions(artifact, dimensions, failures);
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
      statusSummary: `broadcast:${broadcastStatus || "-"} stream:${streamStatus || "-"}`
    };
  }

  const liveStatus = stringValue(parsed.liveStatus).toLowerCase();
  if (!liveStatus) {
    failures.push(`Dashboard evidence status JSON ${artifact.path} must include Twitch liveStatus.`);
  } else if (liveStatus !== "live") {
    failures.push(`Dashboard evidence status JSON ${artifact.path} has non-release Twitch liveStatus ${liveStatus}.`);
  }
  return {
    failures,
    checkedAt,
    statusSummary: `live:${liveStatus || "-"}`
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

function readPngDimensions(content) {
  if (!isPng(content) || content.length < 24 || content.toString("ascii", 12, 16) !== "IHDR") {
    return null;
  }
  const width = content.readUInt32BE(16);
  const height = content.readUInt32BE(20);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function isPng(content) {
  return (
    content.length >= 8 &&
    content[0] === 0x89 &&
    content[1] === 0x50 &&
    content[2] === 0x4e &&
    content[3] === 0x47 &&
    content[4] === 0x0d &&
    content[5] === 0x0a &&
    content[6] === 0x1a &&
    content[7] === 0x0a
  );
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
    twitchScreenshot: "",
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
    } else if (arg === "--twitch-screenshot") {
      options.twitchScreenshot = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--twitch-screenshot=")) {
      options.twitchScreenshot = arg.slice("--twitch-screenshot=".length);
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
      "  npm run release:dashboard-evidence -- --youtube-screenshot <png> --twitch-screenshot <png> [--youtube-json <json>] [--twitch-json <json>]",
      "  npm run verify:dashboard-evidence -- [--manifest=.artifacts/platform-dashboard-evidence.json] [--allow-dirty] [--allow-commit-mismatch]",
      "",
      "Writes or verifies a hash manifest for YouTube/Twitch dashboard evidence artifacts."
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
