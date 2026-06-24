import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { argv, cwd, exit } from "node:process";
import { pathToFileURL } from "node:url";

export const distributionArtifactManifestPath = ".artifacts/distribution-artifacts.json";
export const distributionArtifactGroup = "distribution";

const minimumDistributionArtifactBytes = 1_048_576;
const distributionArtifactTypes = {
  android: Object.freeze({ kind: "aab", extension: ".aab" }),
  ios: Object.freeze({ kind: "ipa", extension: ".ipa" })
};

export function createDistributionManifest({ androidAab, iosIpa, manifestPath = distributionArtifactManifestPath } = {}) {
  const artifactInputs = [
    androidAab ? { platform: "android", path: androidAab, ...distributionArtifactTypes.android } : null,
    iosIpa ? { platform: "ios", path: iosIpa, ...distributionArtifactTypes.ios } : null
  ].filter(Boolean);

  if (artifactInputs.length === 0) {
    throw new Error("Provide at least one distribution artifact with --android-aab or --ios-ipa.");
  }

  const artifacts = artifactInputs.map(createDistributionArtifactRecord);
  const manifest = {
    reportVersion: 1,
    app: "MobileLiveCaster",
    type: "distribution-artifact-manifest",
    generatedAt: new Date().toISOString(),
    git: {
      commit: commandOutput("git", ["rev-parse", "HEAD"]) || null,
      branch: commandOutput("git", ["branch", "--show-current"]) || null,
      dirty: Boolean(commandOutput("git", ["status", "--short"])),
      statusShort: commandOutput("git", ["status", "--short"]) || ""
    },
    artifacts
  };

  const failures = validateDistributionManifest(manifest, { manifestPath });
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }

  const absoluteManifestPath = resolve(manifestPath);
  mkdirSync(dirname(absoluteManifestPath), { recursive: true });
  writeFileSync(absoluteManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifestPath: relative(cwd(), absoluteManifestPath) };
}

export function readDistributionManifest(manifestPath = distributionArtifactManifestPath) {
  return JSON.parse(readFileSync(resolve(manifestPath), "utf8"));
}

export function validateDistributionManifest(
  manifest,
  { manifestPath = distributionArtifactManifestPath, allowDirty = true, allowCommitMismatch = true } = {}
) {
  const failures = [];
  if (manifest?.app !== "MobileLiveCaster" || manifest?.type !== "distribution-artifact-manifest" || manifest?.reportVersion !== 1) {
    failures.push("Distribution manifest is not a MobileLiveCaster distribution-artifact-manifest reportVersion 1 file.");
    return failures;
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    failures.push("Distribution manifest has no artifacts.");
    return failures;
  }
  if (!allowDirty && manifest.git?.dirty) {
    failures.push("Distribution manifest was generated from a dirty worktree.");
  }

  const currentCommit = commandOutput("git", ["rev-parse", "HEAD"]);
  if (!allowCommitMismatch && currentCommit && manifest.git?.commit && currentCommit !== manifest.git.commit) {
    failures.push(`Distribution manifest commit ${manifest.git.commit} does not match current commit ${currentCommit}.`);
  }

  const seen = new Set();
  for (const artifact of manifest.artifacts) {
    validateDistributionArtifact(artifact, failures);
    const key = `${artifact.platform}:${artifact.path}`;
    if (seen.has(key)) {
      failures.push(`Distribution manifest contains duplicate artifact ${key}.`);
    }
    seen.add(key);
  }

  const manifestRelativePath = workspaceRelativePath(manifestPath);
  if (!manifestRelativePath) {
    failures.push("Distribution manifest path must be inside the workspace.");
  }

  return failures;
}

export function collectDistributionArtifactRecords({ manifestPath = distributionArtifactManifestPath } = {}) {
  if (!existsSync(resolve(manifestPath))) {
    return [];
  }

  const manifest = readDistributionManifest(manifestPath);
  const records = [createReleaseArtifactRecord(distributionArtifactGroup, manifestPath)];
  for (const artifact of Array.isArray(manifest.artifacts) ? manifest.artifacts : []) {
    if (artifact?.path && existsSync(resolve(artifact.path))) {
      records.push(createReleaseArtifactRecord(distributionArtifactGroup, artifact.path));
    }
  }
  return records;
}

export function validateDistributionArtifactsInReport(artifacts, fail) {
  const manifestArtifact = artifacts.find(
    (artifact) => artifact?.group === distributionArtifactGroup && artifact?.path === distributionArtifactManifestPath
  );
  if (!manifestArtifact) {
    return;
  }

  let manifest;
  try {
    manifest = readDistributionManifest(distributionArtifactManifestPath);
  } catch (error) {
    fail(`Distribution artifact manifest cannot be read: ${error instanceof Error ? error.message : String(error)}.`);
    return;
  }

  for (const failure of validateDistributionManifest(manifest, { allowDirty: true, allowCommitMismatch: true })) {
    fail(failure);
  }

  const reportArtifactsByPath = new Map(artifacts.map((artifact) => [artifact.path, artifact]));
  for (const manifestRecord of manifest.artifacts || []) {
    const reportRecord = reportArtifactsByPath.get(manifestRecord.path);
    if (!reportRecord) {
      fail(`Report is missing distribution artifact ${manifestRecord.path}.`);
      continue;
    }
    if (reportRecord.group !== distributionArtifactGroup) {
      fail(`Distribution artifact ${manifestRecord.path} is recorded under group ${JSON.stringify(reportRecord.group)}.`);
    }
    if (reportRecord.bytes !== manifestRecord.bytes || reportRecord.sha256 !== manifestRecord.sha256) {
      fail(`Distribution artifact metadata mismatch for ${manifestRecord.path}.`);
    }
  }
}

function createDistributionArtifactRecord({ platform, kind, extension, path }) {
  const relativePath = workspaceRelativePath(path);
  if (!relativePath) {
    throw new Error(`${platform} ${kind} artifact must be inside the workspace: ${path}`);
  }
  if (extname(relativePath) !== extension) {
    throw new Error(`${platform} ${kind} artifact must end with ${extension}: ${relativePath}`);
  }
  if (!existsSync(resolve(relativePath))) {
    throw new Error(`${platform} ${kind} artifact does not exist: ${relativePath}`);
  }
  if (!statSync(resolve(relativePath)).isFile()) {
    throw new Error(`${platform} ${kind} artifact must point to a file: ${relativePath}`);
  }

  const content = readFileSync(resolve(relativePath));
  if (content.byteLength <= 0) {
    throw new Error(`${platform} ${kind} artifact is empty: ${relativePath}`);
  }
  const contentFailures = validateDistributionArtifactContent({ platform, kind, path: relativePath }, content);
  if (contentFailures.length > 0) {
    throw new Error(contentFailures.join("\n"));
  }

  return {
    platform,
    kind,
    path: relativePath,
    basename: basename(relativePath),
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function validateDistributionArtifact(artifact, failures) {
  const expected = distributionArtifactTypes[artifact?.platform];
  if (!expected || artifact.kind !== expected.kind) {
    failures.push(`Distribution artifact has unsupported platform/kind: ${JSON.stringify(artifact?.platform)}/${JSON.stringify(artifact?.kind)}.`);
    return;
  }
  if (!artifact.path || artifact.path.startsWith("/") || artifact.path.startsWith("..")) {
    failures.push(`Distribution artifact path must be workspace-relative: ${artifact.path || "-"}.`);
    return;
  }
  if (extname(artifact.path) !== expected.extension) {
    failures.push(`Distribution artifact ${artifact.path} must end with ${expected.extension}.`);
  }
  if (!existsSync(resolve(artifact.path))) {
    failures.push(`Distribution artifact file does not exist: ${artifact.path}.`);
    return;
  }
  if (!statSync(resolve(artifact.path)).isFile()) {
    failures.push(`Distribution artifact must point to a file: ${artifact.path}.`);
    return;
  }

  const content = readFileSync(resolve(artifact.path));
  const actualSha256 = createHash("sha256").update(content).digest("hex");
  if (content.byteLength !== artifact.bytes || actualSha256 !== artifact.sha256) {
    failures.push(`Distribution artifact metadata mismatch for ${artifact.path}.`);
  }
  failures.push(...validateDistributionArtifactContent(artifact, content));
}

function validateDistributionArtifactContent(artifact, content) {
  const failures = [];
  if (content.byteLength < minimumDistributionArtifactBytes) {
    failures.push(
      `Distribution artifact ${artifact.path} must be at least ${minimumDistributionArtifactBytes} bytes to prevent placeholder release binaries.`
    );
  }
  if (!hasZipLocalFileHeader(content)) {
    failures.push(`Distribution artifact ${artifact.path} must start with a ZIP local-file header.`);
  }
  if (!hasZipEndOfCentralDirectory(content)) {
    failures.push(`Distribution artifact ${artifact.path} is missing a ZIP end-of-central-directory record.`);
  }
  return failures;
}

function hasZipLocalFileHeader(content) {
  return content.length >= 4 && content[0] === 0x50 && content[1] === 0x4b && content[2] === 0x03 && content[3] === 0x04;
}

function hasZipEndOfCentralDirectory(content) {
  const minimumEocdLength = 22;
  if (content.length < minimumEocdLength) {
    return false;
  }
  const earliestOffset = Math.max(0, content.length - 65_557);
  for (let offset = content.length - minimumEocdLength; offset >= earliestOffset; offset -= 1) {
    if (content[offset] === 0x50 && content[offset + 1] === 0x4b && content[offset + 2] === 0x05 && content[offset + 3] === 0x06) {
      return true;
    }
  }
  return false;
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
    androidAab: "",
    iosIpa: "",
    manifestPath: distributionArtifactManifestPath,
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
    } else if (arg === "--android-aab") {
      options.androidAab = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--android-aab=")) {
      options.androidAab = arg.slice("--android-aab=".length);
    } else if (arg === "--ios-ipa") {
      options.iosIpa = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--ios-ipa=")) {
      options.iosIpa = arg.slice("--ios-ipa=".length);
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
      "  npm run release:distribution-manifest -- --android-aab <app-release.aab> --ios-ipa <MobileLiveCaster.ipa>",
      "  npm run verify:distribution-artifacts -- [--manifest=.artifacts/distribution-artifacts.json] [--allow-dirty] [--allow-commit-mismatch]",
      "",
      "Writes or verifies a hash manifest for store distribution artifacts without reading signing secrets."
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
      const result = createDistributionManifest({
        androidAab: options.androidAab,
        iosIpa: options.iosIpa,
        manifestPath: options.manifestPath
      });
      if (!options.allowDirty && result.manifest.git.dirty) {
        throw new Error("Distribution manifest was generated from a dirty worktree. Commit or stash source changes first, or rerun with --allow-dirty for development-only evidence.");
      }
      console.log(`Wrote distribution artifact manifest: ${result.manifestPath}`);
      console.log(`Artifacts: ${result.manifest.artifacts.map((artifact) => artifact.path).join(", ")}`);
      return 0;
    }

    if (!existsSync(resolve(options.manifestPath))) {
      throw new Error(`Distribution artifact manifest does not exist: ${options.manifestPath}`);
    }
    const manifest = readDistributionManifest(options.manifestPath);
    const failures = validateDistributionManifest(manifest, {
      manifestPath: options.manifestPath,
      allowDirty: options.allowDirty,
      allowCommitMismatch: options.allowCommitMismatch
    });
    if (failures.length > 0) {
      console.error("Distribution artifact verification failed:");
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      return 1;
    }

    console.log(`Distribution artifact verification passed (${manifest.artifacts.length} artifacts).`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  exit(run());
}
