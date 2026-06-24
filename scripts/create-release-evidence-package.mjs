import { createHash } from "node:crypto";
import { existsSync, copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { argv, cwd, exit } from "node:process";
import { pathToFileURL } from "node:url";
import { validateReport } from "./verify-release-report.mjs";

export const releaseEvidencePackageManifestName = "release-evidence-package.json";
export const releaseEvidencePackageType = "release-evidence-package-manifest";

export function createReleaseEvidencePackage({
  reportPath,
  outputDir,
  maxAgeHours = 24,
  allowDirty = false,
  allowCommitMismatch = false
} = {}) {
  if (!reportPath) {
    throw new Error("Missing release-candidate report path.");
  }

  const report = readJsonFile(reportPath, "release-candidate report");
  const pathFailures = validateReportSourcePathsForPackaging(report);
  if (pathFailures.length > 0) {
    throw new Error(["Release report contains unsafe package source paths:", ...pathFailures.map((failure) => `- ${failure}`)].join("\n"));
  }

  const failures = validateReport(report, { maxAgeHours, allowDirty, allowCommitMismatch });
  if (failures.length > 0) {
    throw new Error(["Release report is not packageable:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  }

  const packageDir = outputDir || defaultPackageDir(report);
  ensureNewOrEmptyDirectory(packageDir);

  const sourceReportEntry = copyEvidenceFile({
    role: "releaseReport",
    sourcePath: reportPath,
    packagedPath: "release-candidate-report.json",
    packageDir
  });

  const supportBundleSourcePath = report.supportBundle?.absolutePath || report.supportBundle?.path;
  if (!supportBundleSourcePath) {
    throw new Error("Release report is missing support bundle path.");
  }
  const supportBundleEntry = copyEvidenceFile({
    role: "supportBundle",
    sourcePath: supportBundleSourcePath,
    packagedPath: `support-bundle/${safeBasename(supportBundleSourcePath)}`,
    packageDir,
    expectedSha256: report.supportBundle.sha256
  });

  const uiEvidenceGate = uiEvidenceReportGate(report);
  const uiEvidenceEntry = uiEvidenceGate?.evidence?.path
    ? copyEvidenceFile({
        role: "uiEvidence",
        sourcePath: uiEvidenceGate.evidence.path,
        packagedPath: `ui-evidence/${safeBasename(uiEvidenceGate.evidence.path)}`,
        packageDir,
        expectedSha256: uiEvidenceGate.evidence.sha256
      })
    : null;

  const artifactEntries = [];
  const seenArtifacts = new Set();
  for (const artifact of report.artifacts?.files || []) {
    if (!artifact?.group || !artifact?.path) {
      throw new Error("Release report contains an artifact without group or path.");
    }
    const artifactPath = workspaceRelativePath(artifact.path);
    if (!artifactPath) {
      throw new Error(`Release artifact path must be workspace-relative: ${artifact.path}.`);
    }
    const duplicateKey = `${artifact.group}:${artifactPath}`;
    if (seenArtifacts.has(duplicateKey)) {
      throw new Error(`Release report contains duplicate artifact ${duplicateKey}.`);
    }
    seenArtifacts.add(duplicateKey);
    artifactEntries.push(
      copyEvidenceFile({
        role: "artifact",
        group: artifact.group,
        sourcePath: artifactPath,
        packagedPath: `artifacts/${artifactPath}`,
        packageDir,
        expectedBytes: artifact.bytes,
        expectedSha256: artifact.sha256
      })
    );
  }

  const manifest = {
    reportVersion: 1,
    app: "MobileLiveCaster",
    type: releaseEvidencePackageType,
    generatedAt: new Date().toISOString(),
    packageDir: workspaceRelativePath(packageDir) || resolve(packageDir),
    git: {
      commit: report.git?.commit || null,
      branch: report.git?.branch || null,
      dirty: Boolean(report.git?.dirty),
      statusShort: report.git?.statusShort || ""
    },
    sourceReport: sourceReportEntry,
    supportBundle: supportBundleEntry,
    ...(uiEvidenceEntry ? { uiEvidence: uiEvidenceEntry } : {}),
    artifacts: artifactEntries,
    privacyScan: {
      status: "passed",
      scannedTextEntries: countTextEvidenceEntries([sourceReportEntry, supportBundleEntry, uiEvidenceEntry, ...artifactEntries].filter(Boolean))
    }
  };

  const manifestPath = join(resolve(packageDir), releaseEvidencePackageManifestName);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const packageFailures = validateReleaseEvidencePackage({ packageDir });
  if (packageFailures.length > 0) {
    throw new Error(["Created release evidence package failed verification:", ...packageFailures.map((failure) => `- ${failure}`)].join("\n"));
  }

  return { manifest, packageDir: resolve(packageDir), manifestPath };
}

export function validateReleaseEvidencePackage({ packageDir, verifySources = false } = {}) {
  const failures = [];
  const resolvedPackageDir = resolve(packageDir || "");
  const manifestPath = join(resolvedPackageDir, releaseEvidencePackageManifestName);

  if (!packageDir) {
    return ["Missing release evidence package directory."];
  }
  if (!existsSync(manifestPath)) {
    return [`Release evidence package manifest does not exist: ${manifestPath}.`];
  }

  let manifest;
  try {
    manifest = readJsonFile(manifestPath, "release evidence package manifest");
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  if (
    manifest?.app !== "MobileLiveCaster" ||
    manifest?.type !== releaseEvidencePackageType ||
    manifest?.reportVersion !== 1
  ) {
    failures.push("Package manifest is not a MobileLiveCaster release-evidence-package-manifest reportVersion 1 file.");
    return failures;
  }

  const entries = [
    manifest.sourceReport,
    manifest.supportBundle,
    ...(manifest.uiEvidence ? [manifest.uiEvidence] : []),
    ...(Array.isArray(manifest.artifacts) ? manifest.artifacts : [])
  ];
  if (!manifest.sourceReport || !manifest.supportBundle || !Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    failures.push("Package manifest must include sourceReport, supportBundle, and at least one artifact.");
    return failures;
  }

  const seenPackagedPaths = new Set();
  for (const entry of entries) {
    validatePackageEntry(entry, resolvedPackageDir, failures);
    if (entry?.packagedPath) {
      if (seenPackagedPaths.has(entry.packagedPath)) {
        failures.push(`Package manifest contains duplicate packaged path ${entry.packagedPath}.`);
      }
      seenPackagedPaths.add(entry.packagedPath);
    }
    if (verifySources) {
      validateSourceEntry(entry, failures);
    }
  }

  validatePackagedReport(manifest, resolvedPackageDir, failures);
  validatePackagePrivacy(manifest, resolvedPackageDir, failures);
  return failures;
}

function validatePackagedReport(manifest, packageDir, failures) {
  const reportPath = join(packageDir, manifest.sourceReport.packagedPath);
  let report;
  try {
    report = readJsonFile(reportPath, "packaged release-candidate report");
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    return;
  }

  if (report?.app !== "MobileLiveCaster" || report?.type !== "release-candidate-verification" || report?.status !== "passed") {
    failures.push("Packaged release report must be a passed MobileLiveCaster release-candidate-verification report.");
  }
  if (report?.git?.commit && manifest.git?.commit && report.git.commit !== manifest.git.commit) {
    failures.push(`Packaged release report commit ${report.git.commit} does not match package commit ${manifest.git.commit}.`);
  }
  if (report?.supportBundle?.sha256 && report.supportBundle.sha256 !== manifest.supportBundle.sha256) {
    failures.push("Packaged support bundle SHA-256 does not match the release report support bundle SHA-256.");
  }

  const evidenceGate = uiEvidenceReportGate(report);
  if (evidenceGate?.evidence?.sha256) {
    if (!manifest.uiEvidence) {
      failures.push("Package is missing browser UI evidence JSON referenced by the release report.");
    } else if (manifest.uiEvidence.sha256 !== evidenceGate.evidence.sha256) {
      failures.push("Packaged browser UI evidence SHA-256 does not match the release report UI evidence SHA-256.");
    }
  }

  const reportArtifacts = new Map((report.artifacts?.files || []).map((artifact) => [`${artifact.group}:${artifact.path}`, artifact]));
  const packagedArtifacts = new Map(
    (manifest.artifacts || []).map((artifact) => [`${artifact.group}:${artifact.sourcePath}`, artifact])
  );
  for (const packagedArtifact of manifest.artifacts || []) {
    const key = `${packagedArtifact.group}:${packagedArtifact.sourcePath}`;
    if (!reportArtifacts.has(key)) {
      failures.push(`Package manifest contains artifact not present in the release report: ${key}.`);
    }
  }
  for (const reportArtifact of report.artifacts?.files || []) {
    const key = `${reportArtifact.group}:${reportArtifact.path}`;
    const packagedArtifact = packagedArtifacts.get(key);
    if (!packagedArtifact) {
      failures.push(`Package is missing release report artifact ${key}.`);
      continue;
    }
    if (packagedArtifact.bytes !== reportArtifact.bytes || packagedArtifact.sha256 !== reportArtifact.sha256) {
      failures.push(`Packaged artifact metadata mismatch for ${reportArtifact.path}.`);
    }
  }
}

function validatePackagePrivacy(manifest, packageDir, failures) {
  const entries = [
    manifest.sourceReport,
    manifest.supportBundle,
    ...(manifest.uiEvidence ? [manifest.uiEvidence] : []),
    ...(Array.isArray(manifest.artifacts) ? manifest.artifacts : [])
  ].filter(Boolean);
  const findings = [];
  for (const entry of entries) {
    if (findings.length >= 10 || !isTextEvidencePath(entry.packagedPath)) {
      continue;
    }
    const path = resolve(packageDir, entry.packagedPath);
    if (!safeRelativePath(entry.packagedPath) || !isInsideDirectory(path, packageDir)) {
      continue;
    }
    if (!existsSync(path) || !statSync(path).isFile()) {
      continue;
    }
    const content = readFileSync(path, "utf8");
    findings.push(...findSensitiveTextFindings(content, entry.packagedPath).slice(0, 10 - findings.length));
  }
  if (findings.length > 0) {
    failures.push(
      `Release evidence package contains ${findings.length} unredacted sensitive text finding(s): ${findings
        .slice(0, 3)
        .map((finding) => `${finding.path} ${finding.reason}`)
        .join("; ")}.`
    );
  }
}

function validateReportSourcePathsForPackaging(report) {
  const failures = [];
  const supportBundleSourcePath = report?.supportBundle?.absolutePath || report?.supportBundle?.path;
  if (supportBundleSourcePath && !safeSourcePath(supportBundleSourcePath)) {
    failures.push(`Support bundle source path must be absolute or workspace-relative: ${supportBundleSourcePath}.`);
  }

  const evidenceGate = uiEvidenceReportGate(report);
  if (evidenceGate?.evidence?.path && !safeSourcePath(evidenceGate.evidence.path)) {
    failures.push(`Browser UI evidence source path must be absolute or workspace-relative: ${evidenceGate.evidence.path}.`);
  }

  for (const artifact of report?.artifacts?.files || []) {
    if (!workspaceRelativePath(artifact?.path || "")) {
      failures.push(`Release artifact path must be workspace-relative: ${artifact?.path || "-"}.`);
    }
  }
  return failures;
}

const redactedMarker = "[redacted]";
const textEvidenceExtensions = new Set([
  ".bundle",
  ".cjs",
  ".css",
  ".entitlements",
  ".gradle",
  ".html",
  ".js",
  ".jsbundle",
  ".json",
  ".md",
  ".mjs",
  ".pbxproj",
  ".plist",
  ".properties",
  ".ts",
  ".tsx",
  ".txt",
  ".xcprivacy",
  ".xml",
  ".yaml",
  ".yml"
]);
const sensitiveAssignmentPattern =
  /\b([A-Za-z0-9_.-]*(?:access_token|refresh_token|id_token|code_verifier|device_code|client_secret|stream_key|accessToken|refreshToken|idToken|codeVerifier|deviceCode|clientSecret|streamKey|oauthToken|authToken|bearerToken|apiKey|secret))=([^&#\s"']+)/gi;
const sensitiveJsonPattern =
  /["']([A-Za-z0-9_.-]*(?:access_token|refresh_token|id_token|code_verifier|device_code|client_secret|stream_key|accessToken|refreshToken|idToken|codeVerifier|deviceCode|clientSecret|streamKey|oauthToken|authToken|bearerToken|apiKey|authorization|secret))["']\s*:\s*["']([^"']+)["']/gi;
const oauthCallbackCodePattern = /[?&#]code=([^&#\s"']+)/gi;
const authorizationHeaderPattern = /\bAuthorization\s*:\s*(Bearer|OAuth)\s+([^\s,;]+)/gi;
const bearerTokenPattern = /\b(Bearer|OAuth)\s+([A-Za-z0-9._~+/=-]{12,})/g;
const twitchIrcOauthPattern = /\boauth:([A-Za-z0-9._~+/=-]{12,})/gi;
const rtmpPublishUrlPattern = /\brtmps?:\/\/[^\s"'<>]+\/(?:app|live|live2)\/([A-Za-z0-9._~+/=-]{12,}(?:[/?#][^\s"'<>]*)?)/gi;

function countTextEvidenceEntries(entries) {
  return entries.filter((entry) => entry?.packagedPath && isTextEvidencePath(entry.packagedPath)).length;
}

function isTextEvidencePath(path) {
  return textEvidenceExtensions.has(extname(path).toLowerCase());
}

function findSensitiveTextFindings(value, path) {
  const findings = [];
  for (const { pattern, reason, requireTokenShape } of [
    { pattern: sensitiveAssignmentPattern, reason: "contains a sensitive assignment", requireTokenShape: true },
    { pattern: sensitiveJsonPattern, reason: "contains a sensitive JSON value", requireTokenShape: true },
    { pattern: oauthCallbackCodePattern, reason: "contains an OAuth authorization code", requireTokenShape: true },
    { pattern: authorizationHeaderPattern, reason: "contains an Authorization header", requireTokenShape: true },
    { pattern: bearerTokenPattern, reason: "contains a bearer/OAuth token", requireTokenShape: true },
    { pattern: twitchIrcOauthPattern, reason: "contains a Twitch IRC oauth token", requireTokenShape: true },
    { pattern: rtmpPublishUrlPattern, reason: "contains a stream key in an RTMP URL", requireTokenShape: true }
  ]) {
    pattern.lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
      const candidate = match[2] ?? match[1] ?? "";
      if (!isSafeSensitiveValue(candidate) && (!requireTokenShape || looksLikeTokenValue(candidate))) {
        findings.push({ path, reason });
        break;
      }
    }
  }
  return findings;
}

function isSafeSensitiveValue(value) {
  const trimmed = String(value || "").trim();
  return !trimmed || trimmed.includes(redactedMarker);
}

function looksLikeTokenValue(value) {
  const trimmed = String(value || "").trim();
  return (
    trimmed.length >= 12 &&
    /^[A-Za-z0-9._~+/?&=-]+$/.test(trimmed) &&
    /[0-9_~+/\-]/.test(trimmed) &&
    !/=[^=]/.test(trimmed)
  );
}

function uiEvidenceReportGate(report) {
  return (Array.isArray(report?.gates) ? report.gates : []).find((gate) => gate?.label === "Verify browser UI evidence");
}

function copyEvidenceFile({
  role,
  group = undefined,
  sourcePath,
  packagedPath,
  packageDir,
  expectedBytes = undefined,
  expectedSha256 = undefined
}) {
  const resolvedSourcePath = resolve(sourcePath);
  if (!existsSync(resolvedSourcePath)) {
    throw new Error(`${role} source file does not exist: ${sourcePath}.`);
  }
  if (!statSync(resolvedSourcePath).isFile()) {
    throw new Error(`${role} source must point to a file: ${sourcePath}.`);
  }
  const sourceBytes = statSync(resolvedSourcePath).size;
  const sourceSha256 = fileSha256(resolvedSourcePath);
  if (sourceBytes <= 0) {
    throw new Error(`${role} source file is empty: ${sourcePath}.`);
  }
  if (Number.isFinite(expectedBytes) && expectedBytes !== sourceBytes) {
    throw new Error(`${role} source byte count mismatch for ${sourcePath}.`);
  }
  if (expectedSha256 && expectedSha256 !== sourceSha256) {
    throw new Error(`${role} source SHA-256 mismatch for ${sourcePath}.`);
  }

  if (!safeRelativePath(packagedPath)) {
    throw new Error(`${role} packaged path must be package-relative: ${packagedPath}.`);
  }

  const resolvedPackageDir = resolve(packageDir);
  const destination = resolve(resolvedPackageDir, packagedPath);
  if (!isInsideDirectory(destination, resolvedPackageDir)) {
    throw new Error(`${role} packaged path escapes the package directory: ${packagedPath}.`);
  }

  if (existsSync(destination) && fileSha256(destination) !== sourceSha256) {
    throw new Error(`${role} destination already exists with different content: ${packagedPath}.`);
  }

  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(resolvedSourcePath, destination);

  return {
    role,
    ...(group ? { group } : {}),
    sourcePath,
    packagedPath,
    basename: basename(sourcePath),
    bytes: sourceBytes,
    sha256: sourceSha256
  };
}

function validatePackageEntry(entry, packageDir, failures) {
  if (!entry?.role || !entry?.sourcePath || !entry?.packagedPath) {
    failures.push("Package entry is missing role, sourcePath, or packagedPath.");
    return;
  }
  if (!safeRelativePath(entry.packagedPath)) {
    failures.push(`Package entry path must be package-relative: ${entry.packagedPath}.`);
    return;
  }
  const resolvedPath = resolve(packageDir, entry.packagedPath);
  if (!isInsideDirectory(resolvedPath, packageDir)) {
    failures.push(`Package entry escapes the package directory: ${entry.packagedPath}.`);
    return;
  }
  if (!existsSync(resolvedPath)) {
    failures.push(`Package entry file does not exist: ${entry.packagedPath}.`);
    return;
  }
  if (!statSync(resolvedPath).isFile()) {
    failures.push(`Package entry must point to a file: ${entry.packagedPath}.`);
    return;
  }
  const bytes = statSync(resolvedPath).size;
  const sha256 = fileSha256(resolvedPath);
  if (bytes <= 0 || bytes !== entry.bytes || sha256 !== entry.sha256) {
    failures.push(`Release evidence package file metadata mismatch for ${entry.packagedPath}.`);
  }
}

function validateSourceEntry(entry, failures) {
  if (!existsSync(resolve(entry.sourcePath))) {
    failures.push(`Package source file does not exist: ${entry.sourcePath}.`);
    return;
  }
  const bytes = statSync(resolve(entry.sourcePath)).size;
  const sha256 = fileSha256(resolve(entry.sourcePath));
  if (bytes !== entry.bytes || sha256 !== entry.sha256) {
    failures.push(`Package source metadata mismatch for ${entry.sourcePath}.`);
  }
}

function ensureNewOrEmptyDirectory(outputDir) {
  const resolvedOutputDir = resolve(outputDir);
  if (existsSync(resolvedOutputDir)) {
    if (!statSync(resolvedOutputDir).isDirectory()) {
      throw new Error(`Release evidence output path exists but is not a directory: ${outputDir}.`);
    }
    const existing = readdirSync(resolvedOutputDir);
    if (existing.length > 0) {
      throw new Error(`Release evidence output directory must be empty: ${outputDir}.`);
    }
    return;
  }
  mkdirSync(resolvedOutputDir, { recursive: true });
}

function defaultPackageDir(report) {
  const commit = String(report?.git?.commit || "unknown").slice(0, 12);
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `.artifacts/release-evidence/${commit}-${timestamp}`;
}

function readJsonFile(path, label) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw new Error(`Failed to read ${label} ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function safeBasename(path) {
  return basename(path).replace(/[^A-Za-z0-9._-]/g, "_") || "support-bundle.json";
}

function workspaceRelativePath(path) {
  const absolutePath = resolve(path);
  const relativePath = relative(cwd(), absolutePath);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return "";
  }
  return relativePath;
}

function safeSourcePath(path) {
  if (!path) {
    return false;
  }
  if (isAbsolute(path)) {
    return true;
  }
  return Boolean(workspaceRelativePath(path));
}

function safeRelativePath(path) {
  if (!path || isAbsolute(path) || path.split("/").some((part) => part === ".." || part === "")) {
    return false;
  }
  return true;
}

function isInsideDirectory(path, directory) {
  const relativePath = relative(resolve(directory), resolve(path));
  return Boolean(relativePath) && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function parseArgs(args) {
  const options = {
    write: false,
    verify: false,
    reportPath: "",
    packageDir: "",
    outputDir: "",
    maxAgeHours: 24,
    allowDirty: false,
    allowCommitMismatch: false,
    verifySources: false,
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
    } else if (arg === "--verify-sources") {
      options.verifySources = true;
    } else if (arg === "--output") {
      options.outputDir = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--output=")) {
      options.outputDir = arg.slice("--output=".length);
    } else if (arg === "--package") {
      options.packageDir = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--package=")) {
      options.packageDir = arg.slice("--package=".length);
    } else if (arg.startsWith("--max-age-hours=")) {
      options.maxAgeHours = Number(arg.slice("--max-age-hours=".length));
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (!arg.startsWith("--") && options.write && !options.reportPath) {
      options.reportPath = arg;
    } else if (!arg.startsWith("--") && options.verify && !options.packageDir) {
      options.packageDir = arg;
    } else if (!arg.startsWith("--") && !options.write && !options.verify && !options.packageDir) {
      options.packageDir = arg;
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
  if (!Number.isFinite(options.maxAgeHours) || options.maxAgeHours < 1) {
    throw new Error("--max-age-hours must be a positive number.");
  }
  return options;
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run release:evidence-package -- <release-report.json> [--output .artifacts/release-evidence/<id>]",
      "  npm run verify:evidence-package -- <package-dir> [--verify-sources]",
      "",
      "Creates or verifies a standalone release evidence package containing the RC report, support bundle, and hashed release artifacts."
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
      const result = createReleaseEvidencePackage({
        reportPath: options.reportPath,
        outputDir: options.outputDir,
        maxAgeHours: options.maxAgeHours,
        allowDirty: options.allowDirty,
        allowCommitMismatch: options.allowCommitMismatch
      });
      console.log(`Wrote release evidence package: ${result.packageDir}`);
      console.log(`Manifest: ${result.manifestPath}`);
      console.log(`Artifacts: ${result.manifest.artifacts.length}`);
      return 0;
    }

    const failures = validateReleaseEvidencePackage({
      packageDir: options.packageDir,
      verifySources: options.verifySources
    });
    if (failures.length > 0) {
      console.error("Release evidence package verification failed:");
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      return 1;
    }
    console.log(`Release evidence package verification passed: ${resolve(options.packageDir)}`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  exit(run());
}
