import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { argv, cwd, exit } from "node:process";
import { pathToFileURL } from "node:url";
import { validateManifestGitProvenance } from "./release-git-provenance.mjs";

export const distributionArtifactManifestPath = ".artifacts/distribution-artifacts.json";
export const distributionArtifactGroup = "distribution";

const minimumDistributionArtifactBytes = 1_048_576;
const distributionArtifactTypes = {
  android: Object.freeze({ kind: "aab", extension: ".aab" }),
  ios: Object.freeze({ kind: "ipa", extension: ".ipa" })
};
const requiredZipEntries = {
  android: [
    { label: "BundleConfig.pb", test: (entry) => entry === "BundleConfig.pb" },
    { label: "base/manifest/AndroidManifest.xml", test: (entry) => entry === "base/manifest/AndroidManifest.xml" }
  ],
  ios: [{ label: "Payload/*.app/Info.plist", test: (entry) => /^Payload\/[^/]+\.app\/Info\.plist$/.test(entry) }]
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

  const relativeManifestPath = workspaceRelativePath(manifestPath);
  assertWritableRegularPath(relativeManifestPath, "Distribution manifest");
  const absoluteManifestPath = resolve(relativeManifestPath);
  mkdirSync(dirname(absoluteManifestPath), { recursive: true });
  writeFileSync(absoluteManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifestPath: relative(cwd(), absoluteManifestPath) };
}

export function readDistributionManifest(manifestPath = distributionArtifactManifestPath) {
  const relativeManifestPath = workspaceRelativePath(manifestPath);
  if (!relativeManifestPath) {
    throw new Error(`Distribution artifact manifest must be inside the workspace: ${manifestPath}`);
  }
  assertRegularSourceFile(relativeManifestPath, "Distribution artifact manifest");
  return JSON.parse(readFileSync(resolve(relativeManifestPath), "utf8"));
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
  const currentCommit = commandOutput("git", ["rev-parse", "HEAD"]);
  validateManifestGitProvenance(
    manifest.git,
    { label: "Distribution manifest", currentCommit, allowDirty, allowCommitMismatch },
    failures
  );

  const seen = new Set();
  for (const artifact of manifest.artifacts) {
    validateDistributionArtifact(artifact, failures);
    const key = `${artifact?.platform}:${artifact?.path}`;
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
    const relativePath = workspaceRecordPath(artifact?.path);
    if (relativePath && existsSync(resolve(relativePath))) {
      records.push(createReleaseArtifactRecord(distributionArtifactGroup, relativePath));
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
  assertNoSymlinkedParentDirectories(relativePath, `${platform} ${kind} artifact`);
  if (!existsSync(resolve(relativePath))) {
    throw new Error(`${platform} ${kind} artifact does not exist: ${relativePath}`);
  }
  const artifactStat = lstatSync(resolve(relativePath));
  if (artifactStat.isSymbolicLink()) {
    throw new Error(`${platform} ${kind} artifact must not be a symbolic link: ${relativePath}`);
  }
  if (!artifactStat.isFile()) {
    throw new Error(`${platform} ${kind} artifact must point to a file: ${relativePath}`);
  }

  const content = readFileSync(resolve(relativePath));
  if (content.byteLength <= 0) {
    throw new Error(`${platform} ${kind} artifact is empty: ${relativePath}`);
  }
  const contentInspection = inspectDistributionArtifactContent({ platform, kind, path: relativePath }, content);
  if (contentInspection.failures.length > 0) {
    throw new Error(contentInspection.failures.join("\n"));
  }

  return {
    platform,
    kind,
    path: relativePath,
    basename: basename(relativePath),
    zipEntryCount: contentInspection.zipEntryCount,
    requiredZipEntries: contentInspection.requiredZipEntries,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function validateDistributionArtifact(artifact, failures) {
  const expected = distributionArtifactTypes[artifact?.platform];
  if (!expected || artifact?.kind !== expected.kind) {
    failures.push(`Distribution artifact has unsupported platform/kind: ${JSON.stringify(artifact?.platform)}/${JSON.stringify(artifact?.kind)}.`);
    return;
  }
  const relativePath = workspaceRecordPath(artifact.path);
  if (!relativePath) {
    failures.push(`Distribution artifact path must be workspace-relative: ${artifact.path || "-"}.`);
    return;
  }
  const absolutePath = resolve(relativePath);
  if (extname(relativePath) !== expected.extension) {
    failures.push(`Distribution artifact ${relativePath} must end with ${expected.extension}.`);
  }
  if (!validateNoSymlinkedParentDirectories(relativePath, "Distribution artifact", failures)) {
    return;
  }
  if (!existsSync(absolutePath)) {
    failures.push(`Distribution artifact file does not exist: ${relativePath}.`);
    return;
  }
  const artifactStat = lstatSync(absolutePath);
  if (artifactStat.isSymbolicLink()) {
    failures.push(`Distribution artifact must not be a symbolic link: ${relativePath}.`);
    return;
  }
  if (!artifactStat.isFile()) {
    failures.push(`Distribution artifact must point to a file: ${relativePath}.`);
    return;
  }

  const content = readFileSync(absolutePath);
  const actualSha256 = createHash("sha256").update(content).digest("hex");
  if (content.byteLength !== artifact.bytes || actualSha256 !== artifact.sha256) {
    failures.push(`Distribution artifact metadata mismatch for ${relativePath}.`);
  }
  const contentInspection = inspectDistributionArtifactContent({ ...artifact, path: relativePath }, content);
  failures.push(...contentInspection.failures);
  if (artifact.zipEntryCount !== contentInspection.zipEntryCount) {
    failures.push(`Distribution artifact ZIP entry count mismatch for ${relativePath}.`);
  }
  if (!sameStringMembers(artifact.requiredZipEntries, contentInspection.requiredZipEntries)) {
    failures.push(`Distribution artifact required ZIP entries mismatch for ${relativePath}.`);
  }
}

export function inspectDistributionArtifactContent(artifact, content) {
  const failures = [];
  let zipEntryCount = 0;
  let requiredEntriesFound = [];
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
  const entries = readZipEntryNames(content);
  if (entries === null) {
    failures.push(`Distribution artifact ${artifact.path} ZIP central directory could not be read.`);
  } else {
    zipEntryCount = entries.length;
    if (zipEntryCount === 0) {
      failures.push(`Distribution artifact ${artifact.path} ZIP central directory has no entries.`);
    }
    requiredEntriesFound = findRequiredZipEntries(artifact.platform, entries);
    const foundLabels = new Set(requiredEntriesFound);
    for (const requirement of requiredZipEntries[artifact.platform] || []) {
      if (!foundLabels.has(requirement.label)) {
        failures.push(`Distribution artifact ${artifact.path} is missing required ${artifact.platform} ZIP entry ${requirement.label}.`);
      }
    }
  }
  return { failures, zipEntryCount, requiredZipEntries: requiredEntriesFound };
}

function hasZipLocalFileHeader(content) {
  return content.length >= 4 && content[0] === 0x50 && content[1] === 0x4b && content[2] === 0x03 && content[3] === 0x04;
}

function hasZipEndOfCentralDirectory(content) {
  return findZipEndOfCentralDirectoryOffset(content) !== -1;
}

function findZipEndOfCentralDirectoryOffset(content) {
  const minimumEocdLength = 22;
  if (content.length < minimumEocdLength) {
    return -1;
  }
  const earliestOffset = Math.max(0, content.length - 65_557);
  for (let offset = content.length - minimumEocdLength; offset >= earliestOffset; offset -= 1) {
    if (content[offset] === 0x50 && content[offset + 1] === 0x4b && content[offset + 2] === 0x05 && content[offset + 3] === 0x06) {
      return offset;
    }
  }
  return -1;
}

function readZipEntryNames(content) {
  const eocdOffset = findZipEndOfCentralDirectoryOffset(content);
  if (eocdOffset === -1 || eocdOffset + 22 > content.length) {
    return null;
  }
  const totalEntries = content.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = content.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = content.readUInt32LE(eocdOffset + 16);
  if (
    totalEntries === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff ||
    centralDirectoryOffset < 0 ||
    centralDirectorySize <= 0 ||
    centralDirectoryOffset + centralDirectorySize > content.length
  ) {
    return null;
  }

  const names = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > content.length || content.readUInt32LE(offset) !== 0x02014b50) {
      return null;
    }
    const nameLength = content.readUInt16LE(offset + 28);
    const extraLength = content.readUInt16LE(offset + 30);
    const commentLength = content.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    const nextOffset = nameEnd + extraLength + commentLength;
    if (nameEnd > content.length || nextOffset > content.length) {
      return null;
    }
    names.push(content.toString("utf8", nameStart, nameEnd));
    offset = nextOffset;
  }
  return names;
}

function findRequiredZipEntries(platform, entries) {
  const found = [];
  for (const requirement of requiredZipEntries[platform] || []) {
    if (entries.some((entry) => requirement.test(entry))) {
      found.push(requirement.label);
    }
  }
  return found;
}

function sameStringMembers(actual, expected) {
  if (!Array.isArray(actual) || !Array.isArray(expected)) {
    return false;
  }
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  return sortedActual.length === sortedExpected.length && sortedActual.every((value, index) => value === sortedExpected[index]);
}

function createReleaseArtifactRecord(group, path) {
  const relativePath = workspaceRelativePath(path);
  if (!relativePath) {
    throw new Error(`Artifact path must be inside the workspace: ${path}`);
  }
  assertNoSymlinkedParentDirectories(relativePath, "Artifact");
  const artifactStat = lstatSync(resolve(relativePath));
  if (artifactStat.isSymbolicLink() || !artifactStat.isFile()) {
    throw new Error(`Artifact path must point to a regular file: ${relativePath}`);
  }
  const content = readFileSync(resolve(relativePath));
  return {
    group,
    path: relativePath,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function assertRegularSourceFile(path, label) {
  assertNoSymlinkedParentDirectories(path, label);
  const stat = lstatExisting(path);
  if (!stat) {
    throw new Error(`${label} does not exist: ${path}`);
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${path}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} must point to a file: ${path}`);
  }
}

function assertWritableRegularPath(path, label) {
  assertNoSymlinkedParentDirectories(path, label);
  const stat = lstatExisting(path);
  if (!stat) {
    return;
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} output must not be a symbolic link: ${path}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} output must point to a file: ${path}`);
  }
}

function validateNoSymlinkedParentDirectories(path, label, failures) {
  try {
    assertNoSymlinkedParentDirectories(path, label);
    return true;
  } catch (error) {
    failures.push(`${error instanceof Error ? error.message : String(error)}.`);
    return false;
  }
}

function assertNoSymlinkedParentDirectories(path, label) {
  const relativePath = workspaceRelativePath(path);
  if (!relativePath) {
    return;
  }
  const parts = relativePath.split(sep).filter(Boolean);
  let currentPath = cwd();
  for (const part of parts.slice(0, -1)) {
    currentPath = join(currentPath, part);
    const stat = lstatExisting(currentPath);
    if (!stat) {
      return;
    }
    const displayPath = relative(cwd(), currentPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} path parent must not be a symbolic link: ${displayPath}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`${label} path parent must point to a directory: ${displayPath}`);
    }
  }
}

function lstatExisting(path) {
  try {
    return lstatSync(resolve(path));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function workspaceRelativePath(path) {
  const absolutePath = resolve(path);
  const relativePath = relative(cwd(), absolutePath);
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    return "";
  }
  return relativePath;
}

function workspaceRecordPath(path) {
  if (typeof path !== "string") {
    return "";
  }
  const relativePath = workspaceRelativePath(path);
  return relativePath === path ? relativePath : "";
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
