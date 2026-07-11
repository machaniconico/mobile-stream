import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { argv, cwd, exit } from "node:process";
import { pathToFileURL } from "node:url";
import { readPngEvidence } from "./png-evidence.mjs";
import { validateManifestGitProvenance } from "./release-git-provenance.mjs";

export const storeSubmissionChecklistPath = ".artifacts/store-submission-checklist.json";
export const storeSubmissionArtifactGroup = "store-submission";

const storePlatforms = new Set(["ios", "android"]);
const screenshotSources = new Set(["realDevice", "uiEvidenceDraft"]);
const finalScreenshotMinimumShortEdge = 1080;
const finalScreenshotMinimumLongEdge = 1920;
const virtualStoreDevicePattern =
  /(?:simulator|emulator|android\s*sdk|sdk[_\s-]*gphone|sdk[_\s-]*phone|aosp|generic|xcode|preview|browser|chrome|mock|test\s*device|unknown)/i;
const metadataType = "store-submission-metadata";
const reviewDocumentTypes = {
  submissionReview: Object.freeze({ extension: ".md" })
};
const requiredMetadataFields = {
  appStore: {
    name: { min: 2, max: 30 },
    subtitle: { min: 2, max: 30 },
    description: { min: 80, max: 4_000 },
    keywords: { min: 2, max: 100 },
    supportUrl: { url: true },
    privacyPolicyUrl: { url: true },
    category: { min: 2, max: 80 },
    releaseNotes: { min: 10, max: 4_000 },
    reviewContactEmail: { email: true },
    ageRatingNotes: { min: 10, max: 2_000 },
    appPrivacyNotes: { min: 20, max: 4_000 }
  },
  playStore: {
    name: { min: 2, max: 30 },
    shortDescription: { min: 10, max: 80 },
    fullDescription: { min: 80, max: 4_000 },
    privacyPolicyUrl: { url: true },
    supportEmail: { email: true },
    category: { min: 2, max: 80 },
    releaseNotes: { min: 10, max: 500 },
    dataSafetyNotes: { min: 20, max: 4_000 },
    contentRatingNotes: { min: 10, max: 2_000 }
  }
};
const sensitivePatterns = [
  {
    label: "Authorization/Bearer token",
    pattern: /\b(?:authorization|bearer)\b\s*[:=]?\s*(?:bearer\s+)?[A-Za-z0-9._~+/=-]{16,}/i
  },
  {
    label: "OAuth/access/refresh/client secret",
    pattern:
      /\b(?:access_token|refresh_token|id_token|oauth_token|auth_token|bearer_token|client_secret|api_key|private_key|device_code|stream_key|accessToken|refreshToken|idToken|oauthToken|authToken|bearerToken|clientSecret|apiKey|privateKey|deviceCode|streamKey|password)\b\s*[:=]\s*["']?[A-Za-z0-9._~+/=:-]{8,}/i
  },
  {
    label: "credential header",
    pattern:
      /\b(?:x-api-key|api-key|client-secret|stream-key|oauth-token|auth-token|bearer-token|access-token|refresh-token|id-token|device-code|user-code)\b\s*:\s*["']?[A-Za-z0-9._~+/=:-]{8,}/i
  },
  {
    label: "Twitch IRC oauth token",
    pattern: /\boauth:[A-Za-z0-9._~+/=-]{12,}/i
  },
  {
    label: "RTMP URL with stream key",
    pattern: /\brtmps?:\/\/[^\s"'<>]+\/[^\s"'<>]+\/[A-Za-z0-9_-]{8,}/i
  }
];
const emailAddressPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phoneLikePattern = /(^|[^\w+])(\+?\d[\d\s().-]{7,}\d)(?=$|[^\w])/g;
const inviteLinkPattern = /\b(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]{2,}\b/gi;
const protocolLessLinkPattern =
  /(^|[^\w@./:])((?:www\.)?(?:[a-z0-9-]+\.)+(?:ai|app|co|com|dev|gg|io|jp|link|live|ly|me|net|org|site|stream|tv|xyz)(?:\/[^\s<>"']*)?)/gi;
const allowedSupportEmailLocalParts = new Set(["support", "contact", "help", "privacy", "appstore", "playstore"]);

export function createStoreSubmissionChecklist({
  metadataPath,
  manifestPath = storeSubmissionChecklistPath
} = {}) {
  if (!metadataPath) {
    throw new Error("Provide store submission metadata with --metadata <submission.json>.");
  }

  const metadataRecord = createMetadataRecord(metadataPath);
  const metadata = readJsonFile(metadataRecord.path, "store submission metadata");
  const screenshotInputs = storeScreenshots(metadata);
  const screenshots = screenshotInputs.map(createScreenshotRecord);
  const reviewDocuments = storeReviewDocuments(metadata).map(createReviewDocumentRecord);
  const manifest = {
    reportVersion: 1,
    app: "MobileLiveCaster",
    type: "store-submission-checklist-manifest",
    generatedAt: new Date().toISOString(),
    git: {
      commit: commandOutput("git", ["rev-parse", "HEAD"]) || null,
      branch: commandOutput("git", ["branch", "--show-current"]) || null,
      dirty: Boolean(commandOutput("git", ["status", "--short"])),
      statusShort: commandOutput("git", ["status", "--short"]) || ""
    },
    metadata: metadataRecord,
    screenshots,
    reviewDocuments
  };

  const failures = validateStoreSubmissionChecklist(manifest, { manifestPath });
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }

  const relativeManifestPath = workspaceRelativePath(manifestPath);
  assertWritableRegularPath(relativeManifestPath, "Store submission checklist");
  const absoluteManifestPath = resolve(relativeManifestPath);
  mkdirSync(dirname(absoluteManifestPath), { recursive: true });
  writeFileSync(absoluteManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifestPath: relative(cwd(), absoluteManifestPath) };
}

export function readStoreSubmissionChecklist(manifestPath = storeSubmissionChecklistPath) {
  const relativeManifestPath = workspaceRelativePath(manifestPath);
  if (!relativeManifestPath) {
    throw new Error(`Store submission checklist must be inside the workspace: ${manifestPath}`);
  }
  assertRegularSourceFile(relativeManifestPath, "Store submission checklist");
  return JSON.parse(readFileSync(resolve(relativeManifestPath), "utf8"));
}

export function validateStoreSubmissionChecklist(
  manifest,
  {
    manifestPath = storeSubmissionChecklistPath,
    currentCommit = "",
    allowDirty = true,
    allowCommitMismatch = true,
    requireRealDeviceScreenshots = false
  } = {}
) {
  const failures = [];
  if (
    manifest?.app !== "MobileLiveCaster" ||
    manifest?.type !== "store-submission-checklist-manifest" ||
    manifest?.reportVersion !== 1
  ) {
    failures.push("Store submission checklist is not a MobileLiveCaster store-submission-checklist-manifest reportVersion 1 file.");
    return failures;
  }
  const resolvedCurrentCommit = currentCommit || commandOutput("git", ["rev-parse", "HEAD"]);
  validateManifestGitProvenance(
    manifest.git,
    { label: "Store submission checklist", currentCommit: resolvedCurrentCommit, allowDirty, allowCommitMismatch },
    failures
  );
  if (!workspaceRelativePath(manifestPath)) {
    failures.push("Store submission checklist path must be inside the workspace.");
  }

  const metadata = validateMetadataRecord(manifest.metadata, failures);
  if (metadata) {
    validateMetadataSchema(metadata, failures);
    validateManifestScreenshotsMatchMetadata(manifest, metadata, failures);
  }

  const screenshots = Array.isArray(manifest.screenshots) ? manifest.screenshots : [];
  if (screenshots.length === 0) {
    failures.push("Store submission checklist has no screenshots.");
  }
  validateScreenshotCoverage(screenshots, failures);
  const seen = new Set();
  for (const screenshot of screenshots) {
    validateScreenshotRecord(screenshot, failures, { requireRealDeviceScreenshots });
    const key = `${screenshot?.platform}:${screenshot?.path}`;
    if (seen.has(key)) {
      failures.push(`Store submission checklist contains duplicate screenshot ${key}.`);
    }
    seen.add(key);
  }
  const reviewDocuments = Array.isArray(manifest.reviewDocuments) ? manifest.reviewDocuments : [];
  validateManifestReviewDocumentsMatchMetadata(manifest, metadata, failures);
  for (const reviewDocument of reviewDocuments) {
    validateReviewDocumentRecord(reviewDocument, failures);
  }

  return failures;
}

export function collectStoreSubmissionArtifactRecords({ manifestPath = storeSubmissionChecklistPath } = {}) {
  if (!existsSync(resolve(manifestPath))) {
    return [];
  }

  const manifest = readStoreSubmissionChecklist(manifestPath);
  const records = [createReleaseArtifactRecord(storeSubmissionArtifactGroup, manifestPath)];
  const metadataPath = workspaceRecordPath(manifest.metadata?.path);
  if (metadataPath && existsSync(resolve(metadataPath))) {
    records.push(createReleaseArtifactRecord(storeSubmissionArtifactGroup, metadataPath));
  }
  for (const screenshot of Array.isArray(manifest.screenshots) ? manifest.screenshots : []) {
    const screenshotPath = workspaceRecordPath(screenshot?.path);
    if (screenshotPath && existsSync(resolve(screenshotPath))) {
      records.push(createReleaseArtifactRecord(storeSubmissionArtifactGroup, screenshotPath));
    }
  }
  for (const reviewDocument of Array.isArray(manifest.reviewDocuments) ? manifest.reviewDocuments : []) {
    const reviewDocumentPath = workspaceRecordPath(reviewDocument?.path);
    if (reviewDocumentPath && existsSync(resolve(reviewDocumentPath))) {
      records.push(createReleaseArtifactRecord(storeSubmissionArtifactGroup, reviewDocumentPath));
    }
  }
  return records;
}

export function validateStoreSubmissionInReport(report, artifacts, options, fail) {
  const manifestArtifact = artifacts.find(
    (artifact) => artifact?.group === storeSubmissionArtifactGroup && artifact?.path === storeSubmissionChecklistPath
  );
  if (!manifestArtifact) {
    return;
  }

  let manifest;
  try {
    manifest = readStoreSubmissionChecklist(storeSubmissionChecklistPath);
  } catch (error) {
    fail(`Store submission checklist cannot be read: ${error instanceof Error ? error.message : String(error)}.`);
    return;
  }

  for (const failure of validateStoreSubmissionChecklist(manifest, {
    currentCommit: report?.git?.commit || "",
    allowDirty: options.allowDirty,
    allowCommitMismatch: options.allowCommitMismatch
  })) {
    fail(failure);
  }

  const reportArtifactsByPath = new Map(artifacts.map((artifact) => [artifact.path, artifact]));
  for (const checklistRecord of [manifest.metadata, ...(manifest.screenshots || []), ...(manifest.reviewDocuments || [])].filter(Boolean)) {
    const reportRecord = reportArtifactsByPath.get(checklistRecord.path);
    if (!reportRecord) {
      fail(`Report is missing store submission artifact ${checklistRecord.path}.`);
      continue;
    }
    if (reportRecord.group !== storeSubmissionArtifactGroup) {
      fail(`Store submission artifact ${checklistRecord.path} is recorded under group ${JSON.stringify(reportRecord.group)}.`);
    }
    if (reportRecord.bytes !== checklistRecord.bytes || reportRecord.sha256 !== checklistRecord.sha256) {
      fail(`Store submission artifact metadata mismatch for ${checklistRecord.path}.`);
    }
  }
}

export function validateStoreSubmissionMetadataContent(metadata, failures) {
  validateMetadataSchema(metadata, failures);
}

export function validateStoreSubmissionMetadataReferences(manifest, metadata, failures) {
  validateManifestScreenshotsMatchMetadata(manifest, metadata, failures);
  validateManifestReviewDocumentsMatchMetadata(manifest, metadata, failures);
}

function createReviewDocumentRecord({ kind = "submissionReview", path }) {
  const relativePath = workspaceRelativePath(path);
  if (!relativePath) {
    throw new Error(`${kind} review document must be inside the workspace: ${path}`);
  }
  const expected = reviewDocumentTypes[kind];
  if (!expected) {
    throw new Error(`Unsupported store submission review document kind: ${kind}`);
  }
  if (extname(relativePath) !== expected.extension) {
    throw new Error(`${kind} review document must end with ${expected.extension}: ${relativePath}`);
  }
  if (!existsSync(resolve(relativePath))) {
    throw new Error(`${kind} review document does not exist: ${relativePath}`);
  }
  const reviewDocumentStat = lstatSync(resolve(relativePath));
  if (reviewDocumentStat.isSymbolicLink()) {
    throw new Error(`${kind} review document must not be a symbolic link: ${relativePath}`);
  }
  if (!reviewDocumentStat.isFile()) {
    throw new Error(`${kind} review document must point to a file: ${relativePath}`);
  }

  const content = readFileSync(resolve(relativePath));
  if (content.byteLength <= 0) {
    throw new Error(`${kind} review document is empty: ${relativePath}`);
  }

  return {
    kind,
    path: relativePath,
    basename: basename(relativePath),
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function createMetadataRecord(path) {
  const relativePath = workspaceRelativePath(path);
  if (!relativePath) {
    throw new Error(`Store submission metadata must be inside the workspace: ${path}`);
  }
  if (extname(relativePath) !== ".json") {
    throw new Error(`Store submission metadata must be a JSON file: ${relativePath}`);
  }
  if (!existsSync(resolve(relativePath))) {
    throw new Error(`Store submission metadata does not exist: ${relativePath}`);
  }
  const metadataStat = lstatSync(resolve(relativePath));
  if (metadataStat.isSymbolicLink()) {
    throw new Error(`Store submission metadata must not be a symbolic link: ${relativePath}`);
  }
  if (!metadataStat.isFile()) {
    throw new Error(`Store submission metadata must point to a file: ${relativePath}`);
  }

  const content = readFileSync(resolve(relativePath));
  if (content.byteLength <= 0) {
    throw new Error(`Store submission metadata is empty: ${relativePath}`);
  }
  JSON.parse(content.toString("utf8"));

  return {
    kind: metadataType,
    path: relativePath,
    basename: basename(relativePath),
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function createScreenshotRecord({
  platform,
  path,
  device = "",
  locale = "ja-JP",
  role = "store",
  source = "",
  capturedAt = "",
  osVersion = "",
  appBuild = ""
}) {
  const relativePath = workspaceRelativePath(path);
  if (!relativePath) {
    throw new Error(`${platform || "unknown"} store screenshot must be inside the workspace: ${path}`);
  }
  if (!storePlatforms.has(platform)) {
    throw new Error(`Unsupported store screenshot platform: ${platform}`);
  }
  if (extname(relativePath) !== ".png") {
    throw new Error(`${platform} store screenshot must be a PNG file: ${relativePath}`);
  }
  if (!existsSync(resolve(relativePath))) {
    throw new Error(`${platform} store screenshot does not exist: ${relativePath}`);
  }
  const screenshotStat = lstatSync(resolve(relativePath));
  if (screenshotStat.isSymbolicLink()) {
    throw new Error(`${platform} store screenshot must not be a symbolic link: ${relativePath}`);
  }
  if (!screenshotStat.isFile()) {
    throw new Error(`${platform} store screenshot must point to a file: ${relativePath}`);
  }

  const content = readFileSync(resolve(relativePath));
  if (content.byteLength <= 0) {
    throw new Error(`${platform} store screenshot is empty: ${relativePath}`);
  }
  const pngEvidence = readPngEvidence(content);
  if (!pngEvidence.valid) {
    throw new Error(`${platform} store screenshot is not a structurally valid PNG file: ${relativePath} (${pngEvidence.reason}).`);
  }

  return {
    platform,
    kind: "screenshot",
    device: stringValue(device),
    locale: stringValue(locale) || "ja-JP",
    role: stringValue(role) || "store",
    source: stringValue(source),
    capturedAt: stringValue(capturedAt),
    osVersion: stringValue(osVersion),
    appBuild: stringValue(appBuild),
    path: relativePath,
    basename: basename(relativePath),
    width: pngEvidence.width,
    height: pngEvidence.height,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function validateMetadataRecord(record, failures) {
  if (record?.kind !== metadataType) {
    failures.push("Store submission checklist metadata record is missing or has an unsupported kind.");
    return null;
  }
  const relativePath = workspaceRecordPath(record.path);
  if (!relativePath) {
    failures.push(`Store submission metadata path must be workspace-relative: ${record.path || "-"}.`);
    return null;
  }
  const absolutePath = resolve(relativePath);
  if (extname(relativePath) !== ".json") {
    failures.push(`Store submission metadata must be a JSON file: ${relativePath}.`);
    return null;
  }
  if (!existsSync(absolutePath)) {
    failures.push(`Store submission metadata file does not exist: ${relativePath}.`);
    return null;
  }
  const metadataStat = lstatSync(absolutePath);
  if (metadataStat.isSymbolicLink()) {
    failures.push(`Store submission metadata must not be a symbolic link: ${relativePath}.`);
    return null;
  }
  if (!metadataStat.isFile()) {
    failures.push(`Store submission metadata must point to a file: ${relativePath}.`);
    return null;
  }

  const content = readFileSync(absolutePath);
  const actualSha256 = createHash("sha256").update(content).digest("hex");
  if (content.byteLength <= 0) {
    failures.push(`Store submission metadata is empty: ${relativePath}.`);
    return null;
  }
  if (content.byteLength !== record.bytes || actualSha256 !== record.sha256) {
    failures.push(`Store submission metadata metadata mismatch for ${relativePath}.`);
    return null;
  }

  try {
    return JSON.parse(content.toString("utf8"));
  } catch {
    failures.push(`Store submission metadata JSON is unreadable: ${relativePath}.`);
    return null;
  }
}

function validateMetadataSchema(metadata, failures) {
  if (metadata?.app !== "MobileLiveCaster") {
    failures.push("Store submission metadata app must be MobileLiveCaster.");
  }
  for (const [sectionName, fields] of Object.entries(requiredMetadataFields)) {
    const section = metadata?.[sectionName];
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      failures.push(`Store submission metadata is missing ${sectionName}.`);
      continue;
    }
    for (const [fieldName, constraints] of Object.entries(fields)) {
      validateMetadataField(sectionName, fieldName, section[fieldName], constraints, failures);
    }
  }
  validateNoSensitiveText(metadata, failures);
  validateScreenshotCoverage(storeScreenshots(metadata), failures);
}

function validateMetadataField(sectionName, fieldName, value, constraints, failures) {
  const text = stringValue(value);
  if (!text) {
    failures.push(`Store submission metadata ${sectionName}.${fieldName} is required.`);
    return;
  }
  if (constraints.url && !isHttpsUrl(text)) {
    failures.push(`Store submission metadata ${sectionName}.${fieldName} must be an https URL.`);
    return;
  }
  if (constraints.email && !isEmail(text)) {
    failures.push(`Store submission metadata ${sectionName}.${fieldName} must be an email address.`);
    return;
  }
  if (Number.isFinite(constraints.min) && text.length < constraints.min) {
    failures.push(`Store submission metadata ${sectionName}.${fieldName} must be at least ${constraints.min} characters.`);
  }
  if (Number.isFinite(constraints.max) && text.length > constraints.max) {
    failures.push(`Store submission metadata ${sectionName}.${fieldName} must be ${constraints.max} characters or less.`);
  }
}

function validateNoSensitiveText(value, failures, path = "metadata") {
  if (typeof value === "string") {
    for (const { label, pattern } of sensitivePatterns) {
      if (pattern.test(value)) {
        failures.push(`Store submission metadata contains possible ${label} at ${path}.`);
      }
    }
    for (const { label, detected } of storeSubmissionPrivacyFindings(value, path)) {
      if (detected) {
        failures.push(`Store submission metadata contains possible ${label} at ${path}.`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateNoSensitiveText(entry, failures, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      validateNoSensitiveText(child, failures, `${path}.${key}`);
    }
  }
}

function storeSubmissionPrivacyFindings(value, path) {
  return [
    { label: "personal email address", detected: hasDisallowedEmailAddress(value) },
    { label: "phone number", detected: hasUnredactedPhoneMatch(value) },
    { label: "invite link", detected: hasPatternMatch(value, inviteLinkPattern) },
    { label: "protocol-less private link", detected: isProtocolLessLinkPath(path) && hasPatternMatch(value, protocolLessLinkPattern) }
  ];
}

function hasDisallowedEmailAddress(value) {
  emailAddressPattern.lastIndex = 0;
  for (const match of value.matchAll(emailAddressPattern)) {
    const localPart = String(match[0]).split("@")[0]?.toLowerCase() || "";
    if (!allowedSupportEmailLocalParts.has(localPart)) {
      return true;
    }
  }
  return false;
}

function hasUnredactedPhoneMatch(value) {
  phoneLikePattern.lastIndex = 0;
  for (const match of value.matchAll(phoneLikePattern)) {
    if (isUnredactedPhoneCandidate(match[2] || "")) {
      return true;
    }
  }
  return false;
}

function isUnredactedPhoneCandidate(value) {
  const digits = value.replace(/\D/g, "");
  const normalized = value.trim();
  return digits.length >= 10 && digits.length <= 15 && !/^20\d{2}[-./\s]/.test(normalized);
}

function isProtocolLessLinkPath(path) {
  return !path.includes(".supportUrl") && !path.includes(".privacyPolicyUrl");
}

function hasPatternMatch(value, pattern) {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function validateManifestScreenshotsMatchMetadata(manifest, metadata, failures) {
  const declaredPaths = storeScreenshots(metadata).map((screenshot) => workspaceRelativePath(screenshot.path)).filter(Boolean).sort();
  const manifestPaths = (Array.isArray(manifest.screenshots) ? manifest.screenshots : [])
    .map((screenshot) => screenshot?.path)
    .filter(Boolean)
    .sort();
  if (declaredPaths.length !== manifestPaths.length || declaredPaths.some((path, index) => path !== manifestPaths[index])) {
    failures.push("Store submission checklist screenshots do not match the metadata screenshots list.");
  }
}

function validateManifestReviewDocumentsMatchMetadata(manifest, metadata, failures) {
  if (!metadata) {
    return;
  }
  const declaredPaths = storeReviewDocuments(metadata).map((document) => workspaceRelativePath(document.path)).filter(Boolean).sort();
  const manifestPaths = (Array.isArray(manifest.reviewDocuments) ? manifest.reviewDocuments : [])
    .map((document) => document?.path)
    .filter(Boolean)
    .sort();
  if (declaredPaths.length !== manifestPaths.length || declaredPaths.some((path, index) => path !== manifestPaths[index])) {
    failures.push("Store submission checklist review documents do not match the metadata reviewDocuments list.");
  }
}

function validateScreenshotCoverage(screenshots, failures) {
  const values = Array.isArray(screenshots) ? screenshots : [];
  for (const platform of storePlatforms) {
    if (!values.some((screenshot) => screenshot?.platform === platform)) {
      failures.push(`Store submission checklist is missing a ${platform} screenshot.`);
    }
  }
}

function validateScreenshotRecord(screenshot, failures, { requireRealDeviceScreenshots = false } = {}) {
  if (!storePlatforms.has(screenshot?.platform) || screenshot?.kind !== "screenshot") {
    failures.push(`Store submission screenshot has unsupported platform/kind: ${JSON.stringify(screenshot?.platform)}/${JSON.stringify(screenshot?.kind)}.`);
    return;
  }
  const relativePath = workspaceRecordPath(screenshot.path);
  if (!relativePath) {
    failures.push(`Store submission screenshot path must be workspace-relative: ${screenshot.path || "-"}.`);
    return;
  }
  const absolutePath = resolve(relativePath);
  const normalizedScreenshot = { ...screenshot, path: relativePath };
  if (extname(relativePath) !== ".png") {
    failures.push(`Store submission screenshot must be a PNG file: ${relativePath}.`);
  }
  if (!stringValue(screenshot.device)) {
    failures.push(`Store submission screenshot ${relativePath} must include a device label.`);
  }
  if (!screenshotSources.has(screenshot.source)) {
    failures.push(`Store submission screenshot ${relativePath} has unsupported source ${JSON.stringify(screenshot.source)}.`);
  } else if (requireRealDeviceScreenshots && screenshot.source !== "realDevice") {
    failures.push(`Store submission screenshot ${relativePath} must be captured from a real device for final store submission.`);
  }
  if (requireRealDeviceScreenshots && screenshot.source === "realDevice") {
    validateRealDeviceCaptureMetadata(normalizedScreenshot, failures);
    validateRealDeviceIdentity(normalizedScreenshot, failures);
  }
  if (!existsSync(absolutePath)) {
    failures.push(`Store submission screenshot file does not exist: ${relativePath}.`);
    return;
  }
  const screenshotStat = lstatSync(absolutePath);
  if (screenshotStat.isSymbolicLink()) {
    failures.push(`Store submission screenshot must not be a symbolic link: ${relativePath}.`);
    return;
  }
  if (!screenshotStat.isFile()) {
    failures.push(`Store submission screenshot must point to a file: ${relativePath}.`);
    return;
  }

  const content = readFileSync(absolutePath);
  const actualSha256 = createHash("sha256").update(content).digest("hex");
  if (content.byteLength <= 0) {
    failures.push(`Store submission screenshot is empty: ${relativePath}.`);
  }
  if (content.byteLength !== screenshot.bytes || actualSha256 !== screenshot.sha256) {
    failures.push(`Store submission screenshot metadata mismatch for ${relativePath}.`);
  }
  const pngEvidence = readPngEvidence(content);
  if (!pngEvidence.valid) {
    failures.push(`Store submission screenshot is not a structurally valid PNG file: ${relativePath} (${pngEvidence.reason}).`);
  } else {
    if (screenshot.width !== pngEvidence.width || screenshot.height !== pngEvidence.height) {
      failures.push(`Store submission screenshot dimensions mismatch for ${relativePath}.`);
    }
    if (requireRealDeviceScreenshots) {
      validateFinalScreenshotDimensions(normalizedScreenshot, pngEvidence, failures);
    }
  }
}

function validateRealDeviceCaptureMetadata(screenshot, failures) {
  if (!stringValue(screenshot.osVersion)) {
    failures.push(`Store submission screenshot ${screenshot.path} must include the real device OS version for final store submission.`);
  }
  if (!stringValue(screenshot.appBuild)) {
    failures.push(`Store submission screenshot ${screenshot.path} must include the app build/version used for capture.`);
  }
  if (!stringValue(screenshot.capturedAt)) {
    failures.push(`Store submission screenshot ${screenshot.path} must include a capturedAt timestamp.`);
  } else if (!Number.isFinite(Date.parse(screenshot.capturedAt))) {
    failures.push(`Store submission screenshot ${screenshot.path} has an invalid capturedAt timestamp.`);
  }
}

function validateRealDeviceIdentity(screenshot, failures) {
  const device = stringValue(screenshot.device);
  const osVersion = stringValue(screenshot.osVersion);
  if (!device || !osVersion) {
    return;
  }
  if (virtualStoreDevicePattern.test(`${device} ${osVersion}`)) {
    failures.push(
      `Store submission screenshot ${screenshot.path} must use a physical device label, not Simulator/Emulator/browser/test-device evidence.`
    );
    return;
  }
  if (!hasSpecificStoreDeviceLabel(screenshot.platform, device, osVersion)) {
    failures.push(
      `Store submission screenshot ${screenshot.path} must include a specific physical ${screenshot.platform} device label and OS version for final store submission.`
    );
  }
}

function hasSpecificStoreDeviceLabel(platform, device, osVersion) {
  const normalizedDevice = device.trim().toLowerCase();
  const normalizedOs = osVersion.trim().toLowerCase();
  if (!normalizedDevice || !normalizedOs) {
    return false;
  }
  if (platform === "ios") {
    return /\bios|ipados\b/.test(normalizedOs) && /\b(iphone|ipad|ipod)\s+\S+/.test(normalizedDevice);
  }
  if (platform === "android") {
    return (
      /\bandroid\b/.test(normalizedOs) &&
      !/^(android\s*)?(device|phone|mobile|handset)$/.test(normalizedDevice) &&
      normalizedDevice.length >= 4 &&
      (/\d/.test(normalizedDevice) || /[\s_-]/.test(normalizedDevice))
    );
  }
  return false;
}

function validateFinalScreenshotDimensions(screenshot, dimensions, failures) {
  const shortEdge = Math.min(dimensions.width, dimensions.height);
  const longEdge = Math.max(dimensions.width, dimensions.height);
  if (shortEdge < finalScreenshotMinimumShortEdge || longEdge < finalScreenshotMinimumLongEdge) {
    failures.push(
      `Store submission screenshot ${screenshot.path} must be at least ${finalScreenshotMinimumShortEdge}px on the short edge and ${finalScreenshotMinimumLongEdge}px on the long edge for final store submission.`
    );
  }
}

function validateReviewDocumentRecord(reviewDocument, failures) {
  const expected = reviewDocumentTypes[reviewDocument?.kind];
  if (!expected) {
    failures.push(`Store submission review document has unsupported kind: ${JSON.stringify(reviewDocument?.kind)}.`);
    return;
  }
  const relativePath = workspaceRecordPath(reviewDocument.path);
  if (!relativePath) {
    failures.push(`Store submission review document path must be workspace-relative: ${reviewDocument.path || "-"}.`);
    return;
  }
  const absolutePath = resolve(relativePath);
  if (extname(relativePath) !== expected.extension) {
    failures.push(`Store submission review document ${relativePath} must end with ${expected.extension}.`);
  }
  if (!existsSync(absolutePath)) {
    failures.push(`Store submission review document file does not exist: ${relativePath}.`);
    return;
  }
  const reviewDocumentStat = lstatSync(absolutePath);
  if (reviewDocumentStat.isSymbolicLink()) {
    failures.push(`Store submission review document must not be a symbolic link: ${relativePath}.`);
    return;
  }
  if (!reviewDocumentStat.isFile()) {
    failures.push(`Store submission review document must point to a file: ${relativePath}.`);
    return;
  }

  const content = readFileSync(absolutePath);
  const actualSha256 = createHash("sha256").update(content).digest("hex");
  if (content.byteLength <= 0) {
    failures.push(`Store submission review document is empty: ${relativePath}.`);
  }
  if (content.byteLength !== reviewDocument.bytes || actualSha256 !== reviewDocument.sha256) {
    failures.push(`Store submission review document metadata mismatch for ${relativePath}.`);
  }
  validateNoSensitiveText(content.toString("utf8"), failures, `review document ${reviewDocument.path}`);
}

function storeScreenshots(metadata) {
  return Array.isArray(metadata?.screenshots) ? metadata.screenshots : [];
}

function storeReviewDocuments(metadata) {
  return Array.isArray(metadata?.reviewDocuments) ? metadata.reviewDocuments : [];
}

function readJsonFile(path, label) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function createReleaseArtifactRecord(group, path) {
  const relativePath = workspaceRelativePath(path);
  if (!relativePath) {
    throw new Error(`Artifact path must be inside the workspace: ${path}`);
  }
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

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseArgs(args) {
  const options = {
    write: false,
    verify: false,
    metadataPath: "",
    manifestPath: storeSubmissionChecklistPath,
    allowDirty: false,
    allowCommitMismatch: false,
    requireRealDeviceScreenshots: false,
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
    } else if (arg === "--require-real-device-screenshots") {
      options.requireRealDeviceScreenshots = true;
    } else if (arg === "--metadata") {
      options.metadataPath = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--metadata=")) {
      options.metadataPath = arg.slice("--metadata=".length);
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
      "  npm run release:store-submission-checklist -- --metadata <store-submission-metadata.json>",
      "  npm run verify:store-submission -- [--manifest=.artifacts/store-submission-checklist.json] [--allow-dirty] [--allow-commit-mismatch]",
      "  npm run verify:store-submission-final -- [--manifest=.artifacts/store-submission-checklist.json]",
      "",
      "Writes or verifies a hash manifest for App Store / Play Console submission metadata and screenshots.",
      "Use --require-real-device-screenshots for final store submission evidence."
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
      const result = createStoreSubmissionChecklist({
        metadataPath: options.metadataPath,
        manifestPath: options.manifestPath
      });
      if (!options.allowDirty && result.manifest.git.dirty) {
        throw new Error("Store submission checklist was generated from a dirty worktree. Commit or stash source changes first, or rerun with --allow-dirty for development-only evidence.");
      }
      console.log(`Wrote store submission checklist: ${result.manifestPath}`);
      console.log(`Metadata: ${result.manifest.metadata.path}`);
      console.log(`Screenshots: ${result.manifest.screenshots.map((screenshot) => screenshot.path).join(", ")}`);
      return 0;
    }

    const manifest = readStoreSubmissionChecklist(options.manifestPath);
    const failures = validateStoreSubmissionChecklist(manifest, {
      manifestPath: options.manifestPath,
      allowDirty: options.allowDirty,
      allowCommitMismatch: options.allowCommitMismatch,
      requireRealDeviceScreenshots: options.requireRealDeviceScreenshots
    });
    if (failures.length > 0) {
      console.error("Store submission checklist verification failed:");
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      return 1;
    }

    console.log(`Store submission checklist verification passed (${manifest.screenshots.length} screenshots).`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  exit(run());
}
