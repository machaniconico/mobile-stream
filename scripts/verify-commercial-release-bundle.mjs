import { lstatSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { argv, cwd, exit } from "node:process";
import { pathToFileURL } from "node:url";

const minimumSupportBundleVersion = 62;
const nativeAdaptiveBitrateEvidenceMaxAgeMs = 30 * 60 * 1_000;
const nativeAdaptiveBitrateEvidenceFutureSkewMs = 60 * 1_000;
const minimumValidationMonitorDurationSeconds = 60;
const minimumValidationMonitorSampleCount = 3;
const platformPublishingDashboardMaxAgeMinutes = 10;
const platformPublishingFreshnessFutureSkewToleranceMs = 2 * 60 * 1000;
const defaultMaxBundleAgeHours = 24;
const destinationTargetPlatformLabels = {
  "youtube-live": "YouTube Live",
  twitch: "Twitch",
  custom: "Custom"
};
const productionVrmRendererBackendsByPlatform = {
  ios: new Set(["metal", "metal-scene-kit", "scene-kit"]),
  android: new Set(["opengl-es", "opengl-es-3", "filament-opengl-es"])
};
const productionVideoEncoderBackendsByPlatform = {
  ios: new Set(["videotoolbox", "videotoolbox-h264"]),
  android: new Set(["mediacodec", "mediacodec-h264"])
};
const productionAudioEncoderBackendsByPlatform = {
  ios: new Set(["audiotoolbox", "audiotoolbox-aac"]),
  android: new Set(["mediacodec", "mediacodec-aac"])
};
const redactedMarker = "[redacted]";
const emptyNativeOverlayProofRequirements = { total: 0, text: 0, caption: 0, chat: 0 };
const sensitivePropertyNames = new Set([
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "codeverifier",
  "devicecode",
  "usercode",
  "verificationuri",
  "verificationuricomplete",
  "clientsecret",
  "streamkey",
  "authorization",
  "oauthtoken",
  "authtoken",
  "bearertoken",
  "apikey"
]);
const sensitivePropertySuffixes = [
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "codeverifier",
  "devicecode",
  "usercode",
  "verificationuri",
  "verificationuricomplete",
  "clientsecret",
  "streamkey",
  "authorization",
  "oauthtoken",
  "authtoken",
  "bearertoken",
  "apikey",
  "secret"
];
const sensitiveAssignmentPattern =
  /\b([A-Za-z0-9_.-]*(?:access_token|refresh_token|id_token|code|code_verifier|device_code|user_code|verification_uri|verification_uri_complete|client_secret|stream_key|api_key|oauth_token|auth_token|bearer_token|accessToken|refreshToken|idToken|codeVerifier|deviceCode|userCode|verificationUri|verificationUriComplete|clientSecret|streamKey|oauthToken|authToken|bearerToken|apiKey|secret))=([^&#\s"']+)/gi;
const sensitiveJsonPattern =
  /["']([A-Za-z0-9_.-]*(?:access_token|refresh_token|id_token|code_verifier|device_code|user_code|verification_uri|verification_uri_complete|client_secret|stream_key|api_key|oauth_token|auth_token|bearer_token|accessToken|refreshToken|idToken|codeVerifier|deviceCode|userCode|verificationUri|verificationUriComplete|clientSecret|streamKey|oauthToken|authToken|bearerToken|apiKey|authorization|secret))["']\s*:\s*["']([^"']+)["']/gi;
const authorizationHeaderPattern = /\bAuthorization\s*:\s*(Bearer|OAuth)\s+([^\s,;]+)/gi;
const sensitiveHeaderPattern =
  /\b(x-api-key|api-key|client-secret|stream-key|oauth-token|auth-token|bearer-token|access-token|refresh-token|id-token|device-code|user-code)\s*:\s*([^\s,;"']+)/gi;
const sensitiveStructuredHeaderPattern =
  /((?:\b|["'])(?:Authorization|x-api-key|api-key|client-secret|stream-key|oauth-token|auth-token|bearer-token|access-token|refresh-token|id-token|device-code|user-code)(?:\b|["'])\s*\]?\s*[:=]\s*["'](?:(?:Bearer|OAuth)\s+)?)([A-Za-z0-9._~+/=-]{12,})(["'])/gi;
const bearerTokenPattern = /\b(Bearer|OAuth)\s+([A-Za-z0-9._~+/=-]{12,})/g;
const twitchIrcOauthPattern = /\b(oauth:)([A-Za-z0-9._~+/=-]{12,})/gi;
const rtmpPublishUrlPattern =
  /\b(rtmps?:\/\/[^\s"'<>]+\/(?:app|live|live2)\/)([A-Za-z0-9._~+/=-]{12,}(?:[/?#][^\s"'<>]*)?)/gi;
const oauthCallbackPattern =
  /\b(?:mobilelivecaster:\/\/oauth\/|com\.mobilelivecaster\.app:\/oauth\/)[^\s<>"']*[?#][^\s<>"']+/gi;
const oauthAuthorizationPattern =
  /\bhttps:\/\/(?:accounts\.google\.com\/o\/oauth2\/v2\/auth|id\.twitch\.tv\/oauth2\/authorize)\?[^\s<>"']+/gi;
const oauthDeviceActivationPattern = /\bhttps:\/\/(?:www\.)?twitch\.tv\/activate\?[^\s<>"']+/gi;
const discordWebhookUrlPattern =
  /\bhttps:\/\/(?:discord(?:app)?\.com)\/api\/webhooks\/\d{5,32}\/[A-Za-z0-9._-]{20,}/gi;
const googleApiKeyPattern = /\b(AIza[0-9A-Za-z_-]{30,})\b/g;
const openAiApiKeyPattern = /\b(sk-(?:proj-)?[A-Za-z0-9_-]{32,})\b/g;
const githubTokenPattern = /\b((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,})\b/g;
const jwtTokenPattern = /\b(eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,})\b/g;
const privateKeyBlockPattern = /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----/i;
const emailAddressPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const inviteLinkPattern = /\b(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]{2,}\b/gi;
const phoneLikePattern = /(^|[^\w+])(\+?\d[\d\s().-]{7,}\d)(?=$|[^\w])/g;
const protocolLessLinkPattern =
  /(^|[^\w@./:])((?:www\.)?(?:[a-z0-9-]+\.)+(?:ai|app|co|com|dev|gg|io|jp|link|live|ly|me|net|org|site|stream|tv|xyz)(?:\/[^\s<>"']*)?)/gi;

if (isDirectRun()) {
  exit(run());
}

function run() {
  const args = argv.slice(2);
  const filePath = args.find((arg) => !arg.startsWith("--"));
  const maxAgeArg = args.find((arg) => arg.startsWith("--max-age-hours="));
  const maxBundleAgeHours = maxAgeArg ? Number(maxAgeArg.split("=")[1]) : defaultMaxBundleAgeHours;

  if (args.includes("--allow-warnings")) {
    console.error(
      "Usage: npm run verify:commercial-release-bundle -- <support-bundle.json> [--max-age-hours=24]"
    );
    console.error("--allow-warnings is not supported for commercial release approval. Resolve support-bundle warnings first.");
    return 2;
  }

  if (!filePath || !Number.isFinite(maxBundleAgeHours) || maxBundleAgeHours < 1) {
    console.error(
      "Usage: npm run verify:commercial-release-bundle -- <support-bundle.json> [--max-age-hours=24]"
    );
    return 2;
  }

  let bundle;
  try {
    assertRegularSourceFile(filePath, "Support bundle");
    bundle = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`Commercial release bundle verification failed: could not read ${filePath}`);
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const gate = createCommercialReleaseGate(bundle, {
    now: new Date(),
    maxBundleAgeHours
  });

  console.log(`MobileLiveCaster Commercial Release Gate (${basename(filePath)})`);
  console.log(`Status: ${gate.status}`);
  console.log(`Can release: ${gate.canRelease ? "yes" : "no"}`);
  console.log(`Bundle age: ${gate.bundleAgeHours === null ? "-" : `${gate.bundleAgeHours}h`}`);
  console.log(`Scene fingerprint: ${text(bundle?.summary?.sceneFingerprint) || text(bundle?.scene?.fingerprint) || "-"}`);
  console.log(`Evidence fingerprint: ${text(bundle?.summary?.validationEvidenceFingerprint) || "-"}`);
  console.log(`Latest run fingerprint: ${text(bundle?.summary?.validationEvidenceLatestRunFingerprint) || "-"}`);
  console.log(`Summary: ${gate.summary}`);
  console.log(`Primary action: ${gate.primaryAction}`);
  for (const issue of gate.issues) {
    console.log(`- [${issue.severity.toUpperCase()}] ${issue.label}: ${issue.detail} Action: ${issue.action}`);
  }

  return gate.canRelease ? 0 : 1;
}

export function createCommercialReleaseGate(bundle, { now, maxBundleAgeHours = defaultMaxBundleAgeHours }) {
  const issues = [
    bundleIdentityIssue(bundle),
    streamOutputQualityIssue(bundle),
    supportBundleRedactionIssue(bundle),
    bundleAgeIssue(bundle, now, maxBundleAgeHours),
    summaryIssue(bundle),
    preflightIssue(bundle),
    androidPublisherModeIssue(bundle),
    publicLaunchIssue(bundle),
    publicLaunchConfirmationEvidenceIssue(bundle),
    streamSessionRecoveryEvidenceIssue(bundle),
    sceneFingerprintIssue(bundle),
    nativeCaptionOverlaySummaryIssue(bundle),
    textOverlayEvidenceIssue(bundle),
    chatOverlayEvidenceIssue(bundle),
    liveCaptionEvidenceIssue(bundle),
    platformPublishingFreshnessIssue(bundle, now),
    validationIssue(bundle),
    validationRunbookIssue(bundle),
    rehearsalIssue(bundle),
    validationEvidenceIssue(bundle),
    validationCoverageIssue(bundle),
    validationManifestIssue(bundle),
    validationManifestIntegrityIssue(bundle, now),
    validationSceneManifestIssue(bundle),
    validationQualityAutomationIssue(bundle),
    validationFeatureIssue(bundle),
    staleEvidenceIssue(bundle)
  ].filter(Boolean);
  const warningCount = issues.filter((issue) => issue.severity === "warn").length;
  const failureCount = issues.filter((issue) => issue.severity === "fail").length;
  const status = failureCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "ready";
  const canRelease = failureCount === 0 && warningCount === 0;
  return {
    canRelease,
    status,
    bundleAgeHours: ageInHours(bundle?.generatedAt, now),
    issues,
    summary: gateSummary(canRelease, warningCount, failureCount),
    primaryAction:
      canRelease
        ? "Archive this support bundle with the release-candidate build before publishing."
        : issues.find((issue) => issue.severity === "fail")?.action ??
          issues[0]?.action ??
          "Resolve release warnings before publishing."
  };
}

function isDirectRun() {
  return Boolean(argv[1] && import.meta.url === pathToFileURL(argv[1]).href);
}

function assertRegularSourceFile(path, label) {
  assertNoSymlinkedParentDirectories(path, label);
  const stat = lstatSync(resolve(path));
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${path}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} must point to a file: ${path}`);
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

function workspaceRelativePath(path) {
  const absolutePath = resolve(path);
  const relativePath = relative(cwd(), absolutePath);
  if (relativePath === "") {
    return ".";
  }
  if (relativePath.startsWith("..") || relativePath === ".." || relativePath.includes(`..${sep}`)) {
    return null;
  }
  return relativePath;
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

function bundleIdentityIssue(bundle) {
  if (bundle?.app?.name !== "MobileLiveCaster" || bundle?.app?.reportVersion !== 1) {
    return fail(
      "bundle-identity",
      "Support bundle",
      "The file is not a MobileLiveCaster reportVersion 1 support bundle.",
      "Export a fresh MobileLiveCaster support bundle from the release candidate build."
    );
  }
  if (!Number.isInteger(bundle.app.bundleVersion) || bundle.app.bundleVersion < minimumSupportBundleVersion) {
    return fail(
      "bundle-version",
      "Support bundle",
      `Support bundle v${bundle.app.bundleVersion} is older than the required v${minimumSupportBundleVersion}.`,
      "Export a fresh support bundle so validation fingerprints and retained-run manifest evidence are included."
    );
  }
  return null;
}

function streamOutputQualityIssue(bundle) {
  const width = bundle?.quality?.width;
  const height = bundle?.quality?.height;
  const fps = bundle?.quality?.fps;
  if (
    !isPositiveInteger(width) ||
    !isPositiveInteger(height) ||
    !isPositiveInteger(fps) ||
    bundle?.quality?.resolution !== `${width}x${height}`
  ) {
    return fail(
      "stream-output-quality",
      "Stream output quality",
      "Support bundle v62 is missing a valid current output width, height, FPS, or matching resolution label.",
      "Select the release output quality, record fresh iOS and Android validation runs without changing it, then export a new support bundle."
    );
  }
  return null;
}

function bundleAgeIssue(bundle, now, maxBundleAgeHours) {
  const generatedAtMs = Date.parse(String(bundle?.generatedAt ?? ""));
  if (!Number.isFinite(generatedAtMs)) {
    return fail(
      "bundle-generated-at-invalid",
      "Support bundle freshness",
      "The support bundle generatedAt timestamp is invalid.",
      "Export a fresh support bundle from the release candidate build."
    );
  }
  if (generatedAtMs > now.getTime()) {
    return fail(
      "bundle-generated-at-future",
      "Support bundle freshness",
      "The support bundle generatedAt timestamp is in the future.",
      "Export a support bundle after the release-candidate validation run completes, then verify it on the same clock."
    );
  }
  const ageHours = Math.floor((now.getTime() - generatedAtMs) / 3_600_000);
  if (ageHours > maxBundleAgeHours) {
    return fail(
      "bundle-stale",
      "Support bundle freshness",
      `The support bundle is ${ageHours}h old, above the ${maxBundleAgeHours}h release gate.`,
      "Export a fresh support bundle immediately before release approval."
    );
  }
  return null;
}

function summaryIssue(bundle) {
  if (!bundle?.summary || typeof bundle.summary !== "object") {
    return fail(
      "bundle-summary-missing",
      "Support bundle",
      "The support bundle summary is missing.",
      "Export a fresh support bundle from the release candidate build."
    );
  }
  return null;
}

function nativeCaptionOverlaySummaryIssue(bundle) {
  if (isNonNegativeInteger(bundle?.summary?.nativeCompositionCaptionOverlayCount)) {
    return null;
  }
  return fail(
    "native-caption-overlay-summary-missing",
    "Native caption overlay evidence",
    "The support bundle is missing native caption overlay count summary evidence.",
    "Export a support bundle v62 or newer so subtitle and live-caption overlays are retained separately from generic text overlay proof."
  );
}

function streamSessionRecoveryEvidenceIssue(bundle) {
  const session = bundle?.diagnostics?.session;
  if (!session) {
    return null;
  }

  const history = session.historySummary ?? {};
  const lastSummary = session.lastSummary ?? null;
  const totalFailureEvents = number(history.totalFailureEvents);
  const totalRecoveryEvents = number(history.totalRecoveryEvents);
  const lastFailureEvents = number(lastSummary?.failureCount);
  const lastRecoveryEvents = number(lastSummary?.recoveryEventCount);
  const lastOperationFailures = number(lastSummary?.operationFailureCount);
  const lastPlatformApiFailures = number(lastSummary?.platformApiFailureCount);
  const lastQualityUpdateFailures = number(lastSummary?.qualityUpdateFailureCount);
  const lastChatReconnectFailures = number(lastSummary?.chatReconnectFailureCount);
  const lastChatSpeechFailures = number(lastSummary?.chatSpeechFailureCount);

  if (
    history.stability === "unstable" ||
    number(history.failureCount) > 0 ||
    totalFailureEvents > 0 ||
    lastSummary?.outcome === "fail" ||
    lastFailureEvents > 0 ||
    lastOperationFailures > 0 ||
    lastPlatformApiFailures > 0 ||
    lastQualityUpdateFailures > 0 ||
    lastChatReconnectFailures > 0 ||
    lastChatSpeechFailures > 0
  ) {
    return fail(
      "stream-session-recovery-evidence-failed",
      "Stream session recovery evidence",
      `Recent stream session evidence is not clean: history ${text(history.stability) || "unknown"}, ${number(history.failureCount)} failed session(s), ${totalFailureEvents} failure event(s), last outcome ${text(lastSummary?.outcome) || "-"}.`,
      "Repeat private RTMP(S) validation until the latest completed session has no failed operations, chat readout failures, quality-update failures, or failed recovery evidence."
    );
  }

  if (totalRecoveryEvents > 0 || lastRecoveryEvents > 0) {
    return fail(
      "stream-session-recovery-events-present",
      "Stream session recovery evidence",
      `Recent stream session evidence includes ${totalRecoveryEvents} recovery event(s); latest session includes ${lastRecoveryEvents}.`,
      "Repeat a clean private stream without automatic recovery before approving the build for platform-visible release."
    );
  }

  return null;
}

function preflightIssue(bundle) {
  const summary = bundle?.summary ?? {};
  if (summary.preflightStatus === "blocked" || number(summary.launchBlockCount) > 0) {
    return fail(
      "preflight-blocked",
      "Go Live preflight",
      `${number(summary.launchBlockCount)} launch blocker(s) remain.`,
      "Resolve Go Live preflight blockers and export a new support bundle."
    );
  }
  if (summary.preflightStatus === "warning" || number(summary.launchWarningCount) > 0) {
    return fail(
      "preflight-incomplete",
      "Go Live preflight",
      `${number(summary.launchWarningCount)} launch warning(s) remain.`,
      "Resolve Go Live preflight warnings before approving release; platform-visible starts must have a clean preflight."
    );
  }
  return null;
}

function androidPublisherModeIssue(bundle) {
  const mode = text(bundle?.profile?.androidPublisherMode);
  if (mode === "mediacodec") {
    return null;
  }
  return fail(
    "android-publisher-mode-not-commercial",
    "Android publisher mode",
    `Android publisher mode is ${mode || "missing"}; commercial release requires the direct MediaCodec path.`,
    "Switch Android publisher mode to direct MediaCodec and retain passing Android physical validation evidence before release approval."
  );
}

function publicLaunchIssue(bundle) {
  const summary = bundle?.summary ?? {};
  if (
    summary.publicLaunchCanStart !== true ||
    summary.publicLaunchStatus === "blocked" ||
    number(summary.publicLaunchFailCount) > 0 ||
    summary.publicLaunchStartLockBlocked === true
  ) {
    return fail(
      "public-launch-blocked",
      "Public launch checklist",
      text(summary.publicLaunchStartLockSummary) || `${number(summary.publicLaunchFailCount)} public launch blocker(s) remain.`,
      text(summary.publicLaunchStartLockAction) || "Resolve public launch checklist blockers and export a fresh support bundle."
    );
  }
  if (summary.publicLaunchStatus === "warning" || number(summary.publicLaunchWarningCount) > 0) {
    return fail(
      "public-launch-incomplete",
      "Public launch checklist",
      `${number(summary.publicLaunchWarningCount)} public launch warning(s) remain.`,
      "Resolve public launch checklist warnings before approving release; platform-visible starts are locked when warnings remain."
    );
  }
  return null;
}

function publicLaunchConfirmationEvidenceIssue(bundle) {
  const summary = bundle?.summary ?? {};
  const count = summary.publicLaunchConfirmationEventCount;
  const status = summary.publicLaunchLastConfirmationStatus;
  const lastAt = summary.publicLaunchLastConfirmationAt;
  const lastMessage = summary.publicLaunchLastConfirmationMessage;
  const hasValidCount = Number.isInteger(count) && count >= 0;
  const hasValidStatus = status === "confirmed" || status === "cancelled" || status === "none";
  const hasConfirmation =
    typeof count === "number" &&
    count > 0 &&
    (status === "confirmed" || status === "cancelled") &&
    typeof lastAt === "string" &&
    Number.isFinite(Date.parse(lastAt)) &&
    hasPublicLaunchConfirmationTimestampEvidence(
      lastAt,
      bundle?.generatedAt,
      summary.platformPublishingFreshnessCheckedAt,
      summary.validationEvidenceRunManifest,
      createExpectedManifestScope(bundle)
    ) &&
    typeof lastMessage === "string" &&
    hasPublicLaunchConfirmationAuditEvidence(lastMessage, expectedTargetPlatformForBundle(bundle));

  if (!hasValidCount || !hasValidStatus || !hasConfirmation) {
    return fail(
      "public-launch-confirmation-evidence",
      "Public launch confirmation audit",
      "The support bundle is missing valid public launch confirmation summary evidence.",
      "Export a v62 support bundle with retained launch, native publisher, overlay, avatar, ingest, encoder, playback-capture, A/V sync, and native output-format proof."
    );
  }

  if (status === "cancelled") {
    return fail(
      "public-launch-confirmation-cancelled",
      "Public launch confirmation audit",
      "The latest public launch confirmation was cancelled by the operator.",
      "Run the public launch checklist again and accept the final confirmation only when the current target, dashboard, audio, avatar, chat, caption, and safety evidence is ready."
    );
  }

  return null;
}

function hasPublicLaunchConfirmationAuditEvidence(message, expectedTargetPlatform) {
  const normalizedMessage = message.trim();
  return (
    hasPublicLaunchConfirmationTargetEvidence(normalizedMessage, expectedTargetPlatform) &&
    hasPublicLaunchConfirmationSafetyEvidence(normalizedMessage, expectedTargetPlatform) &&
    hasCleanPublicLaunchConfirmationChecklist(normalizedMessage)
  );
}

function hasPublicLaunchConfirmationTargetEvidence(message, expectedTargetPlatform) {
  const match = /\bTarget:\s*([^,\n.;]+)/i.exec(message);
  const target = text(match?.[1]);
  if (!target) {
    return false;
  }
  const expectedTarget = normalizeTargetPlatformLabel(expectedTargetPlatform);
  if (!expectedTarget) {
    return true;
  }
  const normalizedTarget = normalizeTargetPlatformLabel(target);
  if (expectedTarget === "twitch") {
    return normalizedTarget === "twitch" || normalizedTarget.startsWith("twitch ");
  }
  return normalizedTarget === expectedTarget;
}

function hasPublicLaunchConfirmationSafetyEvidence(message, expectedTargetPlatform) {
  const expectedTarget = normalizeTargetPlatformLabel(expectedTargetPlatform);
  const normalizedMessage = statusLabel(message);
  if (expectedTarget === "twitch") {
    return (
      /\bcategory\s+(?!id selected\b)(?!unknown category\b)\S+/.test(normalizedMessage) &&
      normalizedMessage.includes("category id selected") &&
      /\bchannel status\s+(?:offline|not[-\s]live)\b/.test(normalizedMessage)
    );
  }
  if (!expectedTarget.includes("youtube")) {
    return true;
  }
  return (
    normalizedMessage.includes("app privacy public") &&
    normalizedMessage.includes("dashboard privacy public") &&
    normalizedMessage.includes("broadcast selected") &&
    normalizedMessage.includes("stream selected") &&
    /\bbroadcast status\s+(?:ready|testing)\b/.test(normalizedMessage)
  );
}

function hasCleanPublicLaunchConfirmationChecklist(message) {
  return /Checklist:\s*\d+\s+pass(?:es)?\s*\/\s*0\s+warn(?:ings)?\s*\/\s*0\s+fail(?:ures)?/i.test(message);
}

function hasPublicLaunchConfirmationTimestampEvidence(
  lastAt,
  generatedAt,
  platformPublishingCheckedAt,
  validationEvidenceRunManifest,
  manifestScope
) {
  const lastAtMs = Date.parse(lastAt);
  const generatedAtMs = Date.parse(generatedAt);
  if (!Number.isFinite(lastAtMs) || !Number.isFinite(generatedAtMs) || lastAtMs > generatedAtMs) {
    return false;
  }
  const checkedAtMs = Date.parse(String(platformPublishingCheckedAt ?? ""));
  if (Number.isFinite(checkedAtMs) && lastAtMs < checkedAtMs) {
    return false;
  }
  const latestValidationRunMs = latestInScopeValidationRunCreatedAtMs(validationEvidenceRunManifest, manifestScope);
  return latestValidationRunMs === null || lastAtMs >= latestValidationRunMs;
}

function latestInScopeValidationRunCreatedAtMs(validationEvidenceRunManifest, manifestScope) {
  if (!Array.isArray(validationEvidenceRunManifest)) {
    return null;
  }
  const timestamps = validationEvidenceRunManifest
    .filter((run) => isManifestRunFreshInScope(run, manifestScope))
    .map((run) => manifestRunCreatedAtMs(run))
    .filter(Number.isFinite);
  if (timestamps.length === 0) {
    return null;
  }
  return Math.max(...timestamps);
}

function sceneFingerprintIssue(bundle) {
  if (number(bundle?.app?.bundleVersion) < 54) {
    return null;
  }
  const summaryFingerprint = text(bundle?.summary?.sceneFingerprint);
  const sceneFingerprint = text(bundle?.scene?.fingerprint);
  if (!summaryFingerprint || !sceneFingerprint) {
    return fail(
      "scene-fingerprint-missing",
      "Scene fingerprint",
      "Support bundle v62 is missing scene composition fingerprint evidence.",
      "Export a fresh support bundle from the exact scene/profile intended for release."
    );
  }
  if (summaryFingerprint !== sceneFingerprint) {
    return fail(
      "scene-fingerprint-mismatch",
      "Scene fingerprint",
      "Summary and scene fingerprint values do not match.",
      "Export a fresh support bundle without manually editing the JSON."
    );
  }
  return null;
}

function validationSceneManifestIssue(bundle) {
  if (number(bundle?.app?.bundleVersion) < 54) {
    return null;
  }
  const sceneFingerprint = text(bundle?.summary?.sceneFingerprint) || text(bundle?.scene?.fingerprint);
  const manifest = bundle?.summary?.validationEvidenceRunManifest;
  if (!sceneFingerprint || !Array.isArray(manifest) || manifest.length === 0) {
    return null;
  }
  const mismatchedRuns = manifest.filter(
    (run) => isManifestRunFreshAndScopeClaimed(run) && text(run?.sceneFingerprint) !== sceneFingerprint
  );
  if (mismatchedRuns.length === 0) {
    return null;
  }
  return fail(
    "validation-evidence-manifest-scene-fingerprint",
    "Validation evidence manifest",
    `${mismatchedRuns.length} fresh retained validation run(s) do not match the current scene fingerprint ${sceneFingerprint}.`,
    "Record fresh iOS and Android validation runs from the exact scene composition intended for release, then export a v62 support bundle."
  );
}

function textOverlayEvidenceIssue(bundle) {
  const summary = bundle?.summary ?? {};
  const status = summary.textOverlayStatus;
  const hasRequiredEvidence =
    isDiagnosticStatus(status) &&
    isNonNegativeInteger(summary.textOverlaySourceCount) &&
    isNonNegativeInteger(summary.textOverlayVisibleSourceCount) &&
    isNonNegativeInteger(summary.textOverlayManualSourceCount) &&
    isNonNegativeInteger(summary.textOverlayVisibleManualSourceCount) &&
    isNonNegativeInteger(summary.textOverlayRuntimeCaptionSourceCount) &&
    isNonNegativeInteger(summary.textOverlayVisibleRuntimeCaptionSourceCount) &&
    isNonNegativeInteger(summary.textOverlayRenderVisibleSourceCount) &&
    isNonNegativeInteger(summary.textOverlayActiveTimedManualSourceCount) &&
    isNonNegativeInteger(summary.textOverlayQueuedTimedManualSourceCount) &&
    isNonNegativeInteger(summary.textOverlayExpiredTimedManualSourceCount) &&
    isNonNegativeInteger(summary.textOverlayPersistentManualSourceCount) &&
    isNonNegativeInteger(summary.textOverlayEmptyVisibleManualSourceCount) &&
    isNonNegativeInteger(summary.textOverlaySensitiveContentIssueCount) &&
    isNonNegativeInteger(summary.textOverlayDominantBackdropIssueCount) &&
    isNonNegativeInteger(summary.textOverlayLayoutRiskIssueCount) &&
    isNonNegativeInteger(summary.textOverlaySafeAreaIssueCount) &&
    isNonNegativeInteger(summary.textOverlayAvatarOverlapIssueCount) &&
    typeof summary.textOverlaySummary === "string" &&
    summary.textOverlaySummary.trim().length > 0 &&
    typeof summary.textOverlayRecommendation === "string" &&
    summary.textOverlayRecommendation.trim().length > 0;

  if (!hasRequiredEvidence) {
    return fail(
      "text-overlay-evidence-missing",
      "Text overlay evidence",
      "The support bundle is missing text overlay launch evidence.",
      "Export a support bundle v62 or newer so visible manual text, subtitle, ticker, live-caption, native caption overlay kind proof, and avatar-overlap overlay evidence is summarized."
    );
  }

  if (status === "fail" || number(summary.textOverlaySensitiveContentIssueCount) > 0) {
    return fail(
      "text-overlay-evidence-failed",
      "Text overlay evidence",
      summary.textOverlaySummary || "Text overlay evidence failed.",
      summary.textOverlayRecommendation || "Resolve text overlay blockers and export a fresh support bundle."
    );
  }

  if (
    status === "warn" ||
    number(summary.textOverlayQueuedTimedManualSourceCount) > 0 ||
    number(summary.textOverlayExpiredTimedManualSourceCount) > 0 ||
    number(summary.textOverlayEmptyVisibleManualSourceCount) > 0 ||
    number(summary.textOverlayDominantBackdropIssueCount) > 0 ||
    number(summary.textOverlayLayoutRiskIssueCount) > 0 ||
    number(summary.textOverlaySafeAreaIssueCount) > 0 ||
    number(summary.textOverlayAvatarOverlapIssueCount) > 0
  ) {
    return fail(
      "text-overlay-evidence-incomplete",
      "Text overlay evidence",
      summary.textOverlaySummary || "Text overlay evidence has warnings.",
      summary.textOverlayRecommendation || "Resolve text overlay readability, safe-area, empty-text, and avatar-overlap warnings before approving release."
    );
  }

  return null;
}

function chatOverlayEvidenceIssue(bundle) {
  const summary = bundle?.summary ?? {};
  const status = summary.chatOverlayStatus;
  const hasRequiredEvidence =
    isDiagnosticStatus(status) &&
    isNonNegativeInteger(summary.chatOverlaySourceCount) &&
    isNonNegativeInteger(summary.chatOverlayVisibleSourceCount) &&
    isNonNegativeInteger(summary.chatOverlayTransparentVisibleSourceCount) &&
    isNonNegativeInteger(summary.chatOverlayUrlRedactionDisabledCount) &&
    isNonNegativeInteger(summary.chatOverlayOpaqueBackgroundIssueCount) &&
    isNonNegativeInteger(summary.chatOverlayLayoutRiskIssueCount) &&
    isNonNegativeInteger(summary.chatOverlaySafeAreaIssueCount) &&
    isNonNegativeInteger(summary.chatOverlayAvatarOverlapIssueCount) &&
    typeof summary.chatOverlaySummary === "string" &&
    summary.chatOverlaySummary.trim().length > 0 &&
    typeof summary.chatOverlayRecommendation === "string" &&
    summary.chatOverlayRecommendation.trim().length > 0;

  if (!hasRequiredEvidence) {
    return fail(
      "chat-overlay-evidence-missing",
      "Chat overlay evidence",
      "The support bundle is missing chat overlay launch evidence.",
      "Export a support bundle v62 or newer so visible chat overlay transparency, URL redaction, layout, safe-area, and avatar-overlap overlay evidence is summarized."
    );
  }

  if (
    status === "warn" ||
    number(summary.chatOverlayUrlRedactionDisabledCount) > 0 ||
    number(summary.chatOverlayOpaqueBackgroundIssueCount) > 0 ||
    number(summary.chatOverlayLayoutRiskIssueCount) > 0 ||
    number(summary.chatOverlaySafeAreaIssueCount) > 0 ||
    number(summary.chatOverlayAvatarOverlapIssueCount) > 0
  ) {
    return fail(
      "chat-overlay-evidence-incomplete",
      "Chat overlay evidence",
      summary.chatOverlaySummary || "Chat overlay evidence has warnings.",
      summary.chatOverlayRecommendation || "Resolve chat overlay transparency, URL redaction, readability, safe-area, and avatar-overlap warnings before approving release."
    );
  }

  return null;
}

function liveCaptionEvidenceIssue(bundle) {
  const summary = bundle?.summary ?? {};
  const status = summary.liveCaptionStatus;
  const hasRequiredEvidence =
    isDiagnosticStatus(status) &&
    typeof summary.liveCaptionEnabled === "boolean" &&
    typeof summary.liveCaptionRecognitionStatus === "string" &&
    isNonNegativeInteger(summary.liveCaptionRuntimeSourceCount) &&
    isNonNegativeInteger(summary.liveCaptionVisibleRuntimeSourceCount) &&
    isNonNegativeInteger(summary.liveCaptionActiveCueCount) &&
    isNonNegativeInteger(summary.liveCaptionFinalCueCount) &&
    isNonNegativeInteger(summary.liveCaptionTranscriptCount) &&
    typeof summary.liveCaptionSummary === "string" &&
    summary.liveCaptionSummary.trim().length > 0 &&
    typeof summary.liveCaptionRecommendation === "string" &&
    summary.liveCaptionRecommendation.trim().length > 0;

  if (!hasRequiredEvidence) {
    return fail(
      "live-caption-evidence-missing",
      "Live caption evidence",
      "The support bundle is missing live caption launch evidence.",
      "Export a support bundle v62 or newer so live caption enablement, recognition state, source visibility, cue proof, and native caption overlay kind proof are summarized."
    );
  }

  if (status === "fail") {
    return fail(
      "live-caption-evidence-failed",
      "Live caption evidence",
      summary.liveCaptionSummary || "Live caption evidence failed.",
      summary.liveCaptionRecommendation || "Resolve live caption blockers and export a fresh support bundle."
    );
  }

  if (status === "warn") {
    return fail(
      "live-caption-evidence-incomplete",
      "Live caption evidence",
      summary.liveCaptionSummary || "Live caption evidence has warnings.",
      summary.liveCaptionRecommendation || "Confirm final live caption cue evidence before approving release."
    );
  }

  return null;
}

function platformPublishingFreshnessIssue(bundle, now) {
  const summary = bundle?.summary ?? {};
  const status = summary.platformPublishingFreshnessStatus;
  if (status === "fresh") {
    if (
      hasPlatformPublishingFreshnessTimestampProof(
        bundle?.generatedAt,
        summary.platformPublishingFreshnessCheckedAt,
        summary.platformPublishingFreshnessAgeMinutes,
        now
      )
    ) {
      return null;
    }
    return fail(
      "platform-publishing-freshness",
      "Platform publishing freshness",
      text(summary.platformPublishingFreshnessSummary) ||
        `Platform publishing freshness is marked fresh without valid checked-at and <=${platformPublishingDashboardMaxAgeMinutes}m age evidence.`,
      text(summary.platformPublishingFreshnessRecommendation) ||
        "Refresh YouTube Live or Twitch publishing status immediately before commercial release approval."
    );
  }

  if (status === "not-applicable") {
    if (isFirstPartyPublishingDestination(bundle)) {
      return fail(
        "platform-publishing-freshness",
        "Platform publishing freshness",
        text(summary.platformPublishingFreshnessSummary) ||
          "YouTube/Twitch publishing freshness cannot be marked not-applicable for a platform-visible destination.",
        text(summary.platformPublishingFreshnessRecommendation) ||
          "Refresh YouTube Live or Twitch publishing status immediately before commercial release approval."
      );
    }
    return null;
  }

  return fail(
    "platform-publishing-freshness",
    "Platform publishing freshness",
    text(summary.platformPublishingFreshnessSummary) || `Platform publishing freshness is ${status || "missing"}.`,
    text(summary.platformPublishingFreshnessRecommendation) ||
      "Refresh YouTube Live or Twitch publishing status immediately before commercial release approval."
  );
}

function hasPlatformPublishingFreshnessTimestampProof(generatedAt, checkedAt, ageMinutes, now) {
  const generatedAtMs = Date.parse(String(generatedAt ?? ""));
  const checkedAtMs = Date.parse(String(checkedAt ?? ""));
  if (!Number.isFinite(generatedAtMs) || !Number.isFinite(checkedAtMs)) {
    return false;
  }
  if (checkedAtMs > now.getTime()) {
    return false;
  }
  if (checkedAtMs - generatedAtMs > platformPublishingFreshnessFutureSkewToleranceMs) {
    return false;
  }
  const observedAgeMinutes = Math.floor(Math.max(0, generatedAtMs - checkedAtMs) / 60000);
  return (
    Number.isInteger(ageMinutes) &&
    ageMinutes >= 0 &&
    ageMinutes <= platformPublishingDashboardMaxAgeMinutes &&
    Math.abs(observedAgeMinutes - ageMinutes) <= 1
  );
}

function isFirstPartyPublishingDestination(bundle) {
  const platform =
    bundle?.target?.platform ?? bundle?.profile?.destination?.platform ?? bundle?.platformPublishing?.platform;
  const targetPlatform =
    bundle?.summary?.targetPlatform ?? bundle?.target?.platformLabel ?? bundle?.profile?.name ?? "";
  return (
    platform === "youtube-live" ||
    platform === "twitch" ||
    normalizeTargetPlatformLabel(targetPlatform).includes("youtube") ||
    normalizeTargetPlatformLabel(targetPlatform).includes("twitch")
  );
}

function validationIssue(bundle) {
  const summary = bundle?.summary ?? {};
  if (summary.validationStatus !== "ready" || number(summary.validationFailCount) > 0) {
    return fail(
      "commercial-validation-not-ready",
      "Commercial validation",
      `Commercial validation is ${summary.validationStatus || "-"} with ${number(summary.validationFailCount)} failure(s).`,
      "Complete the commercial validation checklist on the release candidate build."
    );
  }
  if (number(summary.validationWarningCount) > 0 || number(summary.validationPendingCount) > 0) {
    return fail(
      "commercial-validation-incomplete",
      "Commercial validation",
      `${number(summary.validationWarningCount)} warning(s) and ${number(summary.validationPendingCount)} pending validation item(s) remain.`,
      "Resolve every commercial validation warning and pending item before release approval."
    );
  }
  return null;
}

function validationRunbookIssue(bundle) {
  const summary = bundle?.summary ?? {};
  if (summary.validationRunbookStatus !== "complete") {
    return fail(
      "validation-runbook-incomplete",
      "Private validation runbook",
      `Private validation runbook is ${summary.validationRunbookStatus || "-"}.`,
      text(summary.validationRunbookNextAction) || "Complete the private RTMP(S) validation runbook."
    );
  }
  return null;
}

function rehearsalIssue(bundle) {
  const summary = bundle?.summary ?? {};
  const rehearsalScore = summary.rehearsalScore;
  if (
    summary.rehearsalStatus !== "ready" ||
    summary.rehearsalCanPromoteToPublic !== true ||
    number(summary.rehearsalFailCount) > 0 ||
    number(summary.rehearsalPendingCount) > 0
  ) {
    return fail(
      "stream-rehearsal-not-ready",
      "Launch rehearsal",
      text(summary.rehearsalSummary) ||
        `Launch rehearsal is ${summary.rehearsalStatus || "missing"} with ${number(summary.rehearsalFailCount)} failure(s) and ${number(summary.rehearsalPendingCount)} pending check(s).`,
      text(summary.rehearsalPrimaryAction) || "Run and archive a passing private rehearsal before commercial release approval."
    );
  }
  if (typeof rehearsalScore === "number" && Number.isFinite(rehearsalScore) && rehearsalScore < 95) {
    return fail(
      "stream-rehearsal-score-low",
      "Launch rehearsal",
      `Launch rehearsal score is ${rehearsalScore}/100 grade ${text(summary.rehearsalGrade) || "-"}.`,
      text(summary.rehearsalPrimaryAction) || "Repeat the private rehearsal until the pre-launch score is A."
    );
  }
  if (number(summary.rehearsalWarningCount) > 0) {
    return fail(
      "stream-rehearsal-incomplete",
      "Launch rehearsal",
      text(summary.rehearsalSummary) || "Launch rehearsal has warnings.",
      text(summary.rehearsalPrimaryAction) || "Resolve rehearsal warnings before approving release."
    );
  }
  return null;
}

function validationEvidenceIssue(bundle) {
  const summary = bundle?.summary ?? {};
  if (summary.validationEvidenceStatus !== "ready") {
    return fail(
      "validation-evidence-not-ready",
      "Physical validation evidence",
      `Physical validation evidence is ${summary.validationEvidenceStatus || "-"}.`,
      "Retain fresh passing iOS and Android private RTMP(S) validation runs for this build."
    );
  }
  if (!text(summary.validationEvidenceFingerprint) || !text(summary.validationEvidenceLatestRunFingerprint)) {
    return fail(
      "validation-evidence-fingerprint-missing",
      "Physical validation evidence",
      "Validation evidence fingerprints are missing.",
      "Export a fresh support bundle after recording release-candidate validation evidence."
    );
  }
  return null;
}

function validationCoverageIssue(bundle) {
  const summary = bundle?.summary ?? {};
  if (
    summary.validationEvidenceIosPass !== true ||
    summary.validationEvidenceAndroidPass !== true ||
    summary.validationEvidencePhysicalDeviceIosPass !== true ||
    summary.validationEvidencePhysicalDeviceAndroidPass !== true ||
    summary.validationEvidenceAppBuildMismatch === true ||
    !text(summary.validationEvidenceConsistentAppBuild)
  ) {
    return fail(
      "validation-evidence-coverage",
      "Physical validation coverage",
      `Coverage iOS ${summary.validationEvidenceIosPass ? "pass" : "missing"} / Android ${
        summary.validationEvidenceAndroidPass ? "pass" : "missing"
      } / physical iOS ${summary.validationEvidencePhysicalDeviceIosPass ? "pass" : "missing"} / Android ${
        summary.validationEvidencePhysicalDeviceAndroidPass ? "pass" : "missing"
      } / build ${text(summary.validationEvidenceConsistentAppBuild) || (summary.validationEvidenceAppBuildMismatch ? "mismatch" : "-")}.`,
      "Record fresh passing physical-device iOS and Android validation runs on the same release-candidate app build."
    );
  }
  return null;
}

function validationManifestIssue(bundle) {
  const summary = bundle?.summary ?? {};
  const manifest = summary.validationEvidenceRunManifest;
  if (!Array.isArray(manifest) || manifest.length === 0) {
    return fail(
      "validation-evidence-manifest-missing",
      "Validation evidence manifest",
      "The retained validation run manifest is missing.",
      "Export a support bundle v62 or newer after retaining release-candidate validation runs."
    );
  }
  const manifestScope = createExpectedManifestScope(bundle);
  const destinationScopeMismatchCount = manifest.filter(
    (run) => isManifestRunFreshAndScopeClaimed(run) && !isManifestRunDestinationScopePass(run, manifestScope)
  ).length;
  if (destinationScopeMismatchCount > 0) {
    return fail(
      "validation-evidence-manifest-scope",
      "Validation evidence manifest",
      `${destinationScopeMismatchCount} fresh manifest run(s) marked in-scope do not match the current destination scope ${formatManifestScope(manifestScope)}.`,
      "Record and retain iOS and Android validation runs against the exact current destination, RTMP(S) transport, scene, and output width/height/FPS before release approval."
    );
  }
  const latestEligibleRuns = [...latestEligibleManifestRunsByPlatform(manifest, manifestScope).values()];
  const eligiblePlatforms = new Set(
    latestEligibleRuns
      .filter(
        (run) =>
          run?.eligible === true &&
          run?.result === "pass" &&
          run?.physicalDevice === true &&
          run?.physicalDeviceStatus === "pass"
      )
      .map((run) => run.devicePlatform)
  );
  if (!eligiblePlatforms.has("ios") || !eligiblePlatforms.has("android")) {
    return fail(
      "validation-evidence-manifest-incomplete",
      "Validation evidence manifest",
      "The manifest does not include eligible passing physical-device iOS and Android runs.",
      "Record and retain passing physical-device validation runs for both iOS and Android on the current build."
    );
  }
  const latestAndroidRun = latestEligibleRuns.find((run) => run?.devicePlatform === "android");
  if (latestAndroidRun?.androidPublisherMode !== "mediacodec") {
    return fail(
      "validation-evidence-manifest-android-publisher-mode",
      "Validation evidence manifest",
      `The latest Android validation manifest row used ${text(latestAndroidRun?.androidPublisherMode) || "missing"} publisher mode.`,
      "Repeat Android physical validation with direct MediaCodec selected, then export a support bundle v62 or newer."
    );
  }
  const expectedNativeOverlays = nativeCompositionOverlayProofRequirements(summary);
  const expectedYouTubePublishing = youtubePublishingProofRequirements(bundle);
  const expectedTwitchPublishing = twitchPublishingProofRequirements(bundle);
  const eligibleNativeRuntimePlatforms = new Set(
    latestEligibleRuns
      .filter(
        (run) =>
          run?.eligible === true &&
          run?.result === "pass" &&
          isManifestNativeRuntimePass(run, expectedNativeOverlays)
      )
      .map((run) => run.devicePlatform)
  );
  if (
    (summary.validationEvidenceNativeRuntimeIosPass === true && !eligibleNativeRuntimePlatforms.has("ios")) ||
    (summary.validationEvidenceNativeRuntimeAndroidPass === true && !eligibleNativeRuntimePlatforms.has("android"))
  ) {
    return fail(
      "validation-evidence-manifest-native-runtime",
      "Validation evidence manifest",
      "The manifest does not back claimed native runtime evidence with a published publisher state, a positive-integer current publish generation, positive-integer current-generation video/audio frames, platform-matched production video/audio encoder backends, passing video/audio encoder configure flags, verified active encoder instances, positive encoded video/audio output counts, and exact native encoder output width/height/FPS matching the requested run target, cumulative video/audio frames, bytes written, clean RTMP A/V timestamp sync samples, non-congested publisher state, empty native publisher queue, zero publisher video/audio drops, compositor status, zero compositor drops/failures, Android playback-capture telemetry with the production backend, a capturing/stopped state, at least two seconds captured, at most 1% drops, at most 5% underruns, and at most 100ms buffered audio, healthy microphone/playback lifecycle and recovery counters with no suspended capture or recovery failures, live render-graph update proof, applied/skipped native overlay proof, loaded, decoded, and composited still-image assets, and accepted production VRM renderer/backend/model geometry/texture/pose proof when VRM sources are present.",
      "Export a support bundle v62 or newer after retaining iOS and Android validation runs with exact requested/native encoder output-format proof, published current-generation native publisher/compositor overlay telemetry, clean RTMP A/V timestamp sync samples, Android playback-capture telemetry within the release thresholds, healthy microphone/playback capture recovery proof, and platform-accepted production encoder backends."
    );
  }
  const eligibleMonitorHoldPlatforms = new Set(
    latestEligibleRuns
      .filter(
        (run) =>
          run?.eligible === true &&
          run?.result === "pass" &&
          run?.monitorHoldStatus === "pass" &&
          isAtLeastNumber(run?.monitorHoldSampleCount, minimumValidationMonitorSampleCount) &&
          isAtLeastNumber(run?.monitorHoldDurationSeconds, minimumValidationMonitorDurationSeconds) &&
          run?.monitorHoldStability === "stable" &&
          hasMonitorHoldMediaTelemetryProof(run) &&
          isZeroNumber(run?.monitorHoldDroppedFrameIncrease) &&
          isZeroNumber(run?.monitorHoldObservedReconnectAttempts)
      )
      .map((run) => run.devicePlatform)
  );
  if (
    (summary.validationEvidenceMonitorHoldIosPass === true && !eligibleMonitorHoldPlatforms.has("ios")) ||
    (summary.validationEvidenceMonitorHoldAndroidPass === true && !eligibleMonitorHoldPlatforms.has("android"))
  ) {
    return fail(
      "validation-evidence-manifest-monitor-hold",
      "Validation evidence manifest",
      "The manifest does not back claimed monitor-hold evidence with stable duration, sample count, positive bitrate/FPS telemetry, zero dropped frames, and zero reconnects.",
      "Export a support bundle v62 or newer after retaining iOS and Android validation runs with at least 60s / 3 samples of stable monitor telemetry including bitrate/FPS proof."
    );
  }
  const eligibleAudioPlatforms = new Set(
    latestEligibleRuns
      .filter(
        (run) =>
          run?.eligible === true &&
          run?.result === "pass" &&
          run?.audioStatus === "pass" &&
          isPositiveNumber(run?.audioNativeMonitorWrittenFrames) &&
          isPositiveNumber(run?.audioNativeMonitorWrittenBuffers) &&
          isZeroNumber(run?.audioNativeMonitorDroppedFrames) &&
          isZeroNumber(run?.audioNativeMonitorDroppedBuffers) &&
          text(run.audioOutputRoute) &&
          text(run.audioNativeMonitorRoute) &&
          run.audioNativeMonitorRouteMatchesOutput === true &&
          run?.audioMonitorLatencyStatus === "pass" &&
          typeof run.audioMonitorLatencyMs === "number" &&
          Number.isFinite(run.audioMonitorLatencyMs) &&
          isPositiveNumber(run.audioMonitorLatencyBudgetMs) &&
          run.audioMonitorLatencyMs <= run.audioMonitorLatencyBudgetMs &&
          text(run.audioMonitorLatencySource) &&
          (run.audioBluetoothRoute !== true || (run.audioBluetoothTuningReviewed === true && text(run.audioMonitorTuningNote))) &&
          run.audioNativeMonitorHeadphonesConnected === true
      )
      .map((run) => run.devicePlatform)
  );
  if (
    (summary.validationEvidenceAudioIosPass === true && !eligibleAudioPlatforms.has("ios")) ||
    (summary.validationEvidenceAudioAndroidPass === true && !eligibleAudioPlatforms.has("android"))
  ) {
    return fail(
      "validation-evidence-manifest-audio-monitor",
      "Validation evidence manifest",
      "The manifest does not back claimed mic/headphone evidence with native monitor write/drop proof, headphone route proof, measured monitor latency source/budget proof, and Bluetooth tuning notes when applicable.",
      "Export a support bundle v62 or newer after retaining iOS and Android validation runs with mic FX self-monitoring exercised through headphones and retained route-match latency source/budget/tuning proof."
    );
  }
  const eligibleAvatarPlatforms = new Set(
    latestEligibleRuns
      .filter(
        (run) =>
          run?.eligible === true &&
          run?.result === "pass" &&
          run?.faceTrackingStatus === "pass" &&
          run?.faceTrackingRuntimeFresh === true &&
          hasReadyFaceLandmarks(run) &&
          hasMotionAttenuationProof(run) &&
          isPositiveNumber(run?.faceTrackingActiveMotionCount) &&
          (hasReadyPngTuberMotionProof(run) || hasReadyVrmMotionProof(run))
      )
      .map((run) => run.devicePlatform)
  );
  if (
    (summary.validationEvidenceFaceTrackingIosPass === true && !eligibleAvatarPlatforms.has("ios")) ||
    (summary.validationEvidenceFaceTrackingAndroidPass === true && !eligibleAvatarPlatforms.has("android"))
  ) {
    return fail(
      "validation-evidence-manifest-avatar-motion",
      "Validation evidence manifest",
      "The manifest does not back claimed avatar-motion evidence with fresh tracking runtime, ready native face landmarks, retained motion/control attenuation-scale proof, active motion, and either ready high-fidelity PNGTuber rig plus semantic/eye-mouth/horizontal-anchor segment proof or ready native-rendered VRM proof.",
      "Export a support bundle v62 or newer after retaining iOS and Android validation runs with fresh native-camera avatar motion, retained motion/control attenuation-scale proof, and ready PNGTuber rig quality/high-fidelity/semantic/eye-mouth/horizontal-anchor segment proof or native-rendered VRM proof."
    );
  }
  const eligibleChatReadoutPlatforms = new Set(
    latestEligibleRuns
      .filter(
        (run) =>
          run?.eligible === true &&
          run?.result === "pass" &&
          run?.chatReadoutStatus === "pass" &&
          run?.chatReadoutPlatformChatEnabled === true &&
          run?.chatReadoutReaderEnabled === true &&
          statusLabel(run?.chatReadoutConnectionPhase) === "connected" &&
          nonEmptyText(run?.chatReadoutConnectionLabel) !== null &&
          nonEmptyText(run?.chatReadoutConnectionMessage) !== null &&
          number(run?.chatReadoutSpokenMessageCount) > 0 &&
          isZeroNumber(run?.chatReadoutSpeechFailureCount)
      )
      .map((run) => run.devicePlatform)
  );
  if (
    (summary.validationEvidenceChatReadoutIosPass === true && !eligibleChatReadoutPlatforms.has("ios")) ||
    (summary.validationEvidenceChatReadoutAndroidPass === true && !eligibleChatReadoutPlatforms.has("android"))
  ) {
    return fail(
      "validation-evidence-manifest-chat-readout",
      "Validation evidence manifest",
      "The manifest does not back claimed chat readout evidence with connected platform chat label/message proof, enabled reader, spoken-message success, and zero speech failures.",
      "Export a support bundle v62 or newer after retaining iOS and Android validation runs with YouTube/Twitch chat readout connection label/message proof and native/browser speech output exercised."
    );
  }
  const eligiblePlatformDashboardPlatforms = new Set(
    latestEligibleRuns
      .filter(
        (run) =>
          run?.eligible === true &&
          run?.result === "pass" &&
          isManifestPlatformPublishingPass(run, expectedYouTubePublishing, expectedTwitchPublishing)
      )
      .map((run) => run.devicePlatform)
  );
  if (
    (summary.validationEvidencePlatformPublishingIosPass === true && !eligiblePlatformDashboardPlatforms.has("ios")) ||
    (summary.validationEvidencePlatformPublishingAndroidPass === true && !eligiblePlatformDashboardPlatforms.has("android"))
  ) {
    return fail(
      "validation-evidence-manifest-platform-dashboard",
      "Validation evidence manifest",
      "The manifest does not back claimed platform dashboard evidence with fresh checked-at proof, YouTube identity/state/privacy/bound-stream proof, and Twitch dashboard status and Twitch title/category/language metadata.",
      "Export a support bundle v62 or newer after retaining iOS and Android validation runs with fresh YouTube/Twitch dashboard status, YouTube privacy/bound-stream proof, and Twitch title/category/language metadata from the destination receiving the stream."
    );
  }
  const eligiblePlatformIngestPlatforms = new Set(
    latestEligibleRuns
      .filter(
        (run) =>
          run?.eligible === true &&
          run?.result === "pass" &&
          isManifestPlatformIngestPass(run, expectedNativeOverlays, expectedYouTubePublishing, expectedTwitchPublishing)
      )
      .map((run) => run.devicePlatform)
  );
  if (
    (summary.validationEvidencePlatformIngestIosPass === true && !eligiblePlatformIngestPlatforms.has("ios")) ||
    (summary.validationEvidencePlatformIngestAndroidPass === true && !eligiblePlatformIngestPlatforms.has("android"))
  ) {
    return fail(
      "validation-evidence-manifest-platform-ingest",
      "Validation evidence manifest",
      "The manifest does not back claimed platform ingest proof with same-run native send telemetry and YouTube/Twitch receiving-state proof, including YouTube privacy and bound-stream evidence when applicable.",
      "Export a support bundle after retaining iOS and Android validation runs where the same run proves native video/audio frames were sent and the destination dashboard received ingest with YouTube privacy/bound-stream proof."
    );
  }
  if (manifest.length !== number(summary.validationEvidenceRunCount)) {
    return fail(
      "validation-evidence-manifest-count-mismatch",
      "Validation evidence manifest",
      `Manifest has ${manifest.length} run(s), but the summary reports ${number(summary.validationEvidenceRunCount)}.`,
      "Export a fresh support bundle so retained run counts and manifest rows match."
    );
  }
  return null;
}

function validationManifestIntegrityIssue(bundle, now) {
  const summary = bundle?.summary ?? {};
  const manifest = summary.validationEvidenceRunManifest;
  if (!Array.isArray(manifest) || manifest.length === 0) {
    return null;
  }

  const mismatches = [];
  const manifestScope = createExpectedManifestScope(bundle);
  const latestRuns = latestEligibleManifestRunsByPlatform(manifest, manifestScope);
  const iosRun = latestRuns.get("ios");
  const androidRun = latestRuns.get("android");
  const derivedEligibleRunCount = manifest.filter((run) => isManifestRunFreshInScope(run, manifestScope)).length;
  const derivedStaleRunCount = manifest.filter((run) => run?.fresh !== true).length;
  const scopedChatReadoutRuns = manifest.filter((run) => isManifestRunInScope(run, manifestScope) && hasManifestChatReadoutEvidence(run));
  const derivedChatReadoutRunCount = scopedChatReadoutRuns.length;
  const derivedChatReadoutReadyCount = scopedChatReadoutRuns.filter((run) => isManifestChatReadoutPass(run)).length;
  const derivedChatReadoutWarningCount = scopedChatReadoutRuns.filter((run) => !isManifestChatReadoutPass(run)).length;
  const bundleGeneratedAtMs = Date.parse(String(bundle?.generatedAt ?? ""));
  const futureVerifierRunCount = manifest.filter((run) => {
    const createdAtMs = manifestRunCreatedAtMs(run);
    return Number.isFinite(createdAtMs) && createdAtMs > now.getTime();
  }).length;
  const futureBundleRunCount = Number.isFinite(bundleGeneratedAtMs)
    ? manifest.filter((run) => {
        const createdAtMs = manifestRunCreatedAtMs(run);
        return Number.isFinite(createdAtMs) && createdAtMs > bundleGeneratedAtMs;
      }).length
    : 0;

  if (futureVerifierRunCount > 0) {
    mismatches.push(`${futureVerifierRunCount} manifest run(s) are dated after the verifier time`);
  }
  if (futureBundleRunCount > 0) {
    mismatches.push(`${futureBundleRunCount} manifest run(s) are dated after support bundle generatedAt`);
  }

  if (derivedEligibleRunCount !== number(summary.validationEvidenceEligibleRunCount)) {
    mismatches.push(`eligible run count summary=${number(summary.validationEvidenceEligibleRunCount)} manifest=${derivedEligibleRunCount}`);
  }
  if (derivedStaleRunCount !== number(summary.validationEvidenceStaleRunCount)) {
    mismatches.push(`stale run count summary=${number(summary.validationEvidenceStaleRunCount)} manifest=${derivedStaleRunCount}`);
  }
  if (derivedChatReadoutRunCount !== number(summary.validationEvidenceChatReadoutRunCount)) {
    mismatches.push(`chat readout run count summary=${number(summary.validationEvidenceChatReadoutRunCount)} manifest=${derivedChatReadoutRunCount}`);
  }
  if (derivedChatReadoutReadyCount !== number(summary.validationEvidenceChatReadoutReadyCount)) {
    mismatches.push(`chat readout ready count summary=${number(summary.validationEvidenceChatReadoutReadyCount)} manifest=${derivedChatReadoutReadyCount}`);
  }
  if (derivedChatReadoutWarningCount !== number(summary.validationEvidenceChatReadoutWarningCount)) {
    mismatches.push(`chat readout warning count summary=${number(summary.validationEvidenceChatReadoutWarningCount)} manifest=${derivedChatReadoutWarningCount}`);
  }

  const eligibilityFlagMismatchCount = manifest.filter((run) => run?.eligible !== isManifestRunFreshInScope(run, manifestScope)).length;
  if (eligibilityFlagMismatchCount > 0) {
    mismatches.push(`${eligibilityFlagMismatchCount} manifest eligible flag(s) do not match fresh destination/protocol/scene/output scope state`);
  }

  const expectedBuild = text(summary.validationEvidenceConsistentAppBuild);
  if (expectedBuild) {
    const expected = normalizeBuildLabel(expectedBuild);
    if (!iosRun || !androidRun || normalizeBuildLabel(iosRun.appBuild) !== expected || normalizeBuildLabel(androidRun.appBuild) !== expected) {
      mismatches.push(`summary build ${expectedBuild} is not backed by latest manifest iOS/Android app-build rows`);
    }
  }

  const manifestBuildMismatch = Boolean(
    iosRun &&
      androidRun &&
      normalizeBuildLabel(iosRun.appBuild) !== normalizeBuildLabel(androidRun.appBuild)
  );
  if (summary.validationEvidenceAppBuildMismatch !== true && manifestBuildMismatch) {
    mismatches.push(`summary reports same build but manifest latest iOS/Android builds are ${iosRun?.appBuild} / ${androidRun?.appBuild}`);
  }

  const expectedNativeOverlays = nativeCompositionOverlayProofRequirements(summary);
  const expectedYouTubePublishing = youtubePublishingProofRequirements(bundle);
  const expectedTwitchPublishing = twitchPublishingProofRequirements(bundle);
  const claimChecks = [
    [summary.validationEvidenceIosPass, "iOS validation pass", isManifestRunPass(iosRun)],
    [summary.validationEvidenceAndroidPass, "Android validation pass", isManifestRunPass(androidRun)],
    [summary.validationEvidencePhysicalDeviceIosPass, "iOS physical-device proof", isManifestPhysicalRunPass(iosRun)],
    [summary.validationEvidencePhysicalDeviceAndroidPass, "Android physical-device proof", isManifestPhysicalRunPass(androidRun)],
    [summary.validationEvidenceNativeRuntimeIosPass, "iOS native runtime proof", isManifestNativeRuntimePass(iosRun, expectedNativeOverlays)],
    [summary.validationEvidenceNativeRuntimeAndroidPass, "Android native runtime proof", isManifestNativeRuntimePass(androidRun, expectedNativeOverlays)],
    [summary.validationEvidenceMonitorHoldIosPass, "iOS stable monitor-hold proof", isManifestMonitorHoldPass(iosRun)],
    [summary.validationEvidenceMonitorHoldAndroidPass, "Android stable monitor-hold proof", isManifestMonitorHoldPass(androidRun)],
    [summary.validationEvidenceFaceTrackingIosPass, "iOS avatar-motion proof", isManifestAvatarMotionPass(iosRun)],
    [summary.validationEvidenceFaceTrackingAndroidPass, "Android avatar-motion proof", isManifestAvatarMotionPass(androidRun)],
    [summary.validationEvidenceAudioIosPass, "iOS mic/headphone proof", isManifestAudioPass(iosRun)],
    [summary.validationEvidenceAudioAndroidPass, "Android mic/headphone proof", isManifestAudioPass(androidRun)],
    [summary.validationEvidenceChatReadoutIosPass, "iOS spoken chat-readout proof", isManifestChatReadoutPass(iosRun)],
    [summary.validationEvidenceChatReadoutAndroidPass, "Android spoken chat-readout proof", isManifestChatReadoutPass(androidRun)],
    [summary.validationEvidencePlatformPublishingIosPass, "iOS platform dashboard proof", isManifestPlatformPublishingPass(iosRun, expectedYouTubePublishing, expectedTwitchPublishing)],
    [summary.validationEvidencePlatformPublishingAndroidPass, "Android platform dashboard proof", isManifestPlatformPublishingPass(androidRun, expectedYouTubePublishing, expectedTwitchPublishing)],
    [
      summary.validationEvidencePlatformIngestIosPass,
      "iOS same-run platform ingest proof",
      isManifestPlatformIngestPass(iosRun, expectedNativeOverlays, expectedYouTubePublishing, expectedTwitchPublishing)
    ],
    [
      summary.validationEvidencePlatformIngestAndroidPass,
      "Android same-run platform ingest proof",
      isManifestPlatformIngestPass(androidRun, expectedNativeOverlays, expectedYouTubePublishing, expectedTwitchPublishing)
    ]
  ];
  for (const [claimed, label, backedByManifest] of claimChecks) {
    if (claimed === true && !backedByManifest) {
      mismatches.push(`${label} is claimed by summary but not backed by the latest manifest row`);
    }
  }

  if (mismatches.length === 0) {
    return null;
  }

  const detail = mismatches.slice(0, 4).join("; ");
  return fail(
    "validation-evidence-manifest-integrity",
    "Validation evidence manifest",
    `${detail}${mismatches.length > 4 ? `; ${mismatches.length - 4} more mismatch(es)` : ""}.`,
    "Export a fresh support bundle from the release-candidate build so summary validation claims are regenerated from the retained-run manifest."
  );
}

function validationFeatureIssue(bundle) {
  const summary = bundle?.summary ?? {};
  const platformIngestPasses = validationEvidencePlatformIngestPasses(bundle);
  const missing = [
    summary.validationEvidencePhysicalDeviceIosPass !== true || summary.validationEvidencePhysicalDeviceAndroidPass !== true
      ? "physical device identity"
      : "",
    summary.validationEvidenceNativeRuntimeIosPass !== true || summary.validationEvidenceNativeRuntimeAndroidPass !== true
      ? "native publisher/compositor overlay proof"
      : "",
    summary.validationEvidenceMonitorHoldIosPass !== true || summary.validationEvidenceMonitorHoldAndroidPass !== true
      ? "stable monitor hold"
      : "",
    summary.validationEvidenceFaceTrackingIosPass !== true || summary.validationEvidenceFaceTrackingAndroidPass !== true
      ? "avatar motion"
      : "",
    summary.validationEvidenceAudioIosPass !== true || summary.validationEvidenceAudioAndroidPass !== true
      ? "mic FX/headphone monitor"
      : "",
    summary.validationEvidenceChatReadoutIosPass !== true || summary.validationEvidenceChatReadoutAndroidPass !== true
      ? "chat readout"
      : "",
    summary.validationEvidencePlatformPublishingIosPass !== true || summary.validationEvidencePlatformPublishingAndroidPass !== true
      ? "platform dashboard"
      : "",
    !platformIngestPasses.ios || !platformIngestPasses.android
      ? "same-run platform ingest"
      : ""
  ].filter(Boolean);
  if (missing.length === 0) {
    return null;
  }
  return fail(
    "validation-evidence-feature-gap",
    "Physical validation feature proof",
    `Missing passing evidence for ${missing.join(", ")}.`,
    "Repeat private validation until both iOS and Android runs include all release-candidate feature proof."
  );
}

function validationQualityAutomationIssue(bundle) {
  const passes = validationEvidenceQualityAutomationPasses(bundle);
  if (passes.ios && passes.android) {
    return null;
  }
  return fail(
    "validation-evidence-quality-automation-gap",
    "Weak-network quality automation proof",
    `Missing passing controlled weak-network quality automation evidence for ${[!passes.ios ? "iOS" : "", !passes.android ? "Android" : ""].filter(Boolean).join(" and ")}.`,
    "Repeat controlled weak-network private validation on both iOS and Android until each retained run proves either a native-owned automatic bitrate reduction with confirmed application, no pending target, and zero native failures or a next-start fallback with zero app update failures."
  );
}

function validationEvidenceQualityAutomationPasses(bundle) {
  const summary = bundle?.summary ?? {};
  const manifest = summary.validationEvidenceRunManifest;
  const latestRuns = Array.isArray(manifest)
    ? latestEligibleManifestRunsByPlatform(manifest, createExpectedManifestScope(bundle))
    : new Map();
  return {
    ios: isManifestQualityAutomationPass(latestRuns.get("ios")),
    android: isManifestQualityAutomationPass(latestRuns.get("android"))
  };
}

function validationEvidencePlatformIngestPasses(bundle) {
  const summary = bundle?.summary ?? {};
  const manifest = summary.validationEvidenceRunManifest;
  const latestRuns = Array.isArray(manifest)
    ? latestEligibleManifestRunsByPlatform(manifest, createExpectedManifestScope(bundle))
    : new Map();
  const expectedNativeOverlays = nativeCompositionOverlayProofRequirements(summary);
  const expectedYouTubePublishing = youtubePublishingProofRequirements(bundle);
  const expectedTwitchPublishing = twitchPublishingProofRequirements(bundle);
  return {
    ios: resolveValidationEvidencePlatformIngestPass(
      summary.validationEvidencePlatformIngestIosPass,
      latestRuns.get("ios"),
      expectedNativeOverlays,
      expectedYouTubePublishing,
      expectedTwitchPublishing
    ),
    android: resolveValidationEvidencePlatformIngestPass(
      summary.validationEvidencePlatformIngestAndroidPass,
      latestRuns.get("android"),
      expectedNativeOverlays,
      expectedYouTubePublishing,
      expectedTwitchPublishing
    )
  };
}

function resolveValidationEvidencePlatformIngestPass(
  summaryValue,
  manifestRun,
  expectedNativeOverlays = emptyNativeOverlayProofRequirements,
  expectedYouTubePublishing = emptyYouTubePublishingProofRequirements,
  expectedTwitchPublishing = emptyTwitchPublishingProofRequirements
) {
  return typeof summaryValue === "boolean"
    ? summaryValue
    : isManifestPlatformIngestPass(manifestRun, expectedNativeOverlays, expectedYouTubePublishing, expectedTwitchPublishing);
}

function staleEvidenceIssue(bundle) {
  const staleRunCount = number(bundle?.summary?.validationEvidenceStaleRunCount);
  if (staleRunCount <= 0) {
    return null;
  }
  return fail(
    "validation-evidence-stale-retained-runs",
    "Physical validation evidence",
    `${staleRunCount} stale retained validation run(s) remain in the bundle.`,
    "Clear old retained validation evidence and export a fresh support bundle before release approval."
  );
}

function supportBundleRedactionIssue(bundle) {
  const findings = findSensitiveBundleFindings(bundle);
  if (findings.length === 0) {
    return null;
  }
  const examples = findings
    .slice(0, 3)
    .map((finding) => `${finding.path} ${finding.reason}`)
    .join("; ");
  return fail(
    "support-bundle-sensitive-data",
    "Support bundle privacy",
    `Support bundle contains ${findings.length} unredacted sensitive value(s): ${examples}.`,
    "Fix redaction, export a fresh support bundle, and do not archive the leaking evidence."
  );
}

function gateSummary(canRelease, warningCount, failureCount) {
  if (canRelease) {
    return "Commercial release gate is ready.";
  }
  if (failureCount > 0) {
    return `${failureCount} commercial release blocker${failureCount === 1 ? "" : "s"} remain.`;
  }
  return `${warningCount} commercial release warning${warningCount === 1 ? "" : "s"} require resolution.`;
}

function fail(code, label, detail, action) {
  return { code, severity: "fail", label, detail, action };
}

function ageInHours(value, now) {
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  const ageMs = now.getTime() - timestamp;
  if (ageMs < 0) {
    return null;
  }
  return Math.floor(ageMs / 3_600_000);
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isAtLeastNumber(value, minimum) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum;
}

function isAtMostNumber(value, maximum) {
  return typeof value === "number" && Number.isFinite(value) && value <= maximum;
}

function isZeroNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value === 0;
}

function latestEligibleManifestRunsByPlatform(manifest, manifestScope = emptyExpectedManifestScope) {
  const runsByPlatform = new Map();
  const sortedRuns = [...manifest].filter((run) => isManifestRunFreshInScope(run, manifestScope)).sort((left, right) => {
    const rightTime = Date.parse(String(right?.createdAt));
    const leftTime = Date.parse(String(left?.createdAt));
    return rightTime - leftTime;
  });
  for (const run of sortedRuns) {
    if (!runsByPlatform.has(run.devicePlatform)) {
      runsByPlatform.set(run.devicePlatform, run);
    }
  }
  return runsByPlatform;
}

function isManifestRunPass(run) {
  return run?.result === "pass";
}

function isManifestPhysicalRunPass(run) {
  return isManifestRunPass(run) && run?.physicalDevice === true && run?.physicalDeviceStatus === "pass";
}

function isManifestMonitorHoldPass(run) {
  return (
    run?.monitorHoldStatus === "pass" &&
    isAtLeastNumber(run?.monitorHoldSampleCount, minimumValidationMonitorSampleCount) &&
    isAtLeastNumber(run?.monitorHoldDurationSeconds, minimumValidationMonitorDurationSeconds) &&
    run?.monitorHoldStability === "stable" &&
    hasMonitorHoldMediaTelemetryProof(run) &&
    isZeroNumber(run?.monitorHoldDroppedFrameIncrease) &&
    isZeroNumber(run?.monitorHoldObservedReconnectAttempts)
  );
}

function isManifestAudioPass(run) {
  return (
    run?.audioStatus === "pass" &&
    isPositiveNumber(run?.audioNativeMonitorWrittenFrames) &&
    isPositiveNumber(run?.audioNativeMonitorWrittenBuffers) &&
    isZeroNumber(run?.audioNativeMonitorDroppedFrames) &&
    isZeroNumber(run?.audioNativeMonitorDroppedBuffers) &&
    text(run?.audioOutputRoute) &&
    text(run?.audioNativeMonitorRoute) &&
    run?.audioNativeMonitorRouteMatchesOutput === true &&
    run?.audioMonitorLatencyStatus === "pass" &&
    typeof run.audioMonitorLatencyMs === "number" &&
    Number.isFinite(run.audioMonitorLatencyMs) &&
    isPositiveNumber(run.audioMonitorLatencyBudgetMs) &&
    run.audioMonitorLatencyMs <= run.audioMonitorLatencyBudgetMs &&
    text(run.audioMonitorLatencySource) &&
    (run.audioBluetoothRoute !== true || (run.audioBluetoothTuningReviewed === true && text(run.audioMonitorTuningNote))) &&
    run.audioNativeMonitorHeadphonesConnected === true
  );
}

function isManifestAvatarMotionPass(run) {
  return (
    run?.faceTrackingStatus === "pass" &&
    run?.faceTrackingRuntimeFresh === true &&
    hasReadyFaceLandmarks(run) &&
    hasMotionAttenuationProof(run) &&
    isPositiveNumber(run?.faceTrackingActiveMotionCount) &&
    (hasReadyPngTuberMotionProof(run) || hasReadyVrmMotionProof(run))
  );
}

function isManifestChatReadoutPass(run) {
  return (
    run?.chatReadoutStatus === "pass" &&
    run?.chatReadoutPlatformChatEnabled === true &&
    run?.chatReadoutReaderEnabled === true &&
    statusLabel(run?.chatReadoutConnectionPhase) === "connected" &&
    nonEmptyText(run?.chatReadoutConnectionLabel) !== null &&
    nonEmptyText(run?.chatReadoutConnectionMessage) !== null &&
    number(run?.chatReadoutSpokenMessageCount) > 0 &&
    isZeroNumber(run?.chatReadoutSpeechFailureCount)
  );
}

function hasManifestChatReadoutEvidence(run) {
  return (
    run?.chatReadoutStatus === "pass" ||
    run?.chatReadoutStatus === "warn" ||
    run?.chatReadoutStatus === "fail" ||
    run?.chatReadoutStatus === "pending"
  );
}

const emptyExpectedManifestScope = {
  targetPlatform: null,
  transport: null,
  sceneFingerprint: null,
  videoWidth: null,
  videoHeight: null,
  videoFps: null
};

function createExpectedManifestScope(bundle) {
  return {
    targetPlatform: expectedTargetPlatformForBundle(bundle),
    transport: expectedTransportForBundle(bundle),
    sceneFingerprint: text(bundle?.summary?.sceneFingerprint) || text(bundle?.scene?.fingerprint),
    videoWidth: isPositiveInteger(bundle?.quality?.width) ? bundle.quality.width : null,
    videoHeight: isPositiveInteger(bundle?.quality?.height) ? bundle.quality.height : null,
    videoFps: isPositiveInteger(bundle?.quality?.fps) ? bundle.quality.fps : null
  };
}

function expectedTargetPlatformForBundle(bundle) {
  const platform = bundle?.profile?.destination?.platform;
  return typeof platform === "string" ? destinationTargetPlatformLabels[platform] ?? null : null;
}

function expectedTransportForBundle(bundle) {
  const transport = normalizeTransportLabel(bundle?.profile?.destination?.protocol);
  return transport || null;
}

const emptyYouTubePublishingProofRequirements = {
  boundStreamId: null,
  broadcastPrivacyStatus: null
};

const emptyTwitchPublishingProofRequirements = {
  titleLength: null,
  category: null,
  categoryId: null,
  language: null
};

function youtubePublishingProofRequirements(bundle) {
  return {
    boundStreamId: text(bundle?.profile?.platformPublishing?.youtubeBroadcastBoundStreamId) || null,
    broadcastPrivacyStatus: text(bundle?.profile?.platformPublishing?.privacyStatus) || null
  };
}

function twitchPublishingProofRequirements(bundle) {
  return {
    titleLength: positiveIntegerOrNull(bundle?.profile?.platformPublishing?.titleLength),
    category: text(bundle?.profile?.platformPublishing?.twitchCategory) || null,
    categoryId: text(bundle?.profile?.platformPublishing?.twitchCategoryId) || null,
    language: text(bundle?.profile?.platformPublishing?.twitchLanguage) || null
  };
}

function positiveIntegerOrNull(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function isManifestPlatformPublishingPass(
  run,
  expectedYouTubePublishing = emptyYouTubePublishingProofRequirements,
  expectedTwitchPublishing = emptyTwitchPublishingProofRequirements
) {
  if (run?.platformPublishingFreshnessStatus === "not-applicable") {
    return !isFirstPartyManifestPublishingDestination(run);
  }
  return (
    run?.platformPublishingStatus === "pass" &&
    run?.platformPublishingFreshnessStatus === "fresh" &&
    isNonEmptyIsoDate(run?.platformPublishingCheckedAt) &&
    isAtMostNumber(run?.platformPublishingFreshnessAgeMinutes, platformPublishingDashboardMaxAgeMinutes) &&
    isManifestPlatformPublishingTimestampConsistent(run) &&
    isManifestPlatformIdentityPass(run, expectedYouTubePublishing, expectedTwitchPublishing)
  );
}

function isManifestQualityAutomationPass(run) {
  const counters = [
    run?.qualityAutomationLiveUpdateCount,
    run?.qualityAutomationNextTargetCount,
    run?.qualityAutomationFailureCount,
    run?.nativeRuntimeLiveVideoBitrateUpdateCount,
    run?.nativeRuntimeLiveVideoBitrateUpdateFailureCount,
    run?.nativeRuntimeAutomaticReductionCount,
    run?.nativeRuntimeAutomaticRestorationCount
  ];
  if (!counters.every(isNonNegativeInteger)) {
    return false;
  }
  const liveUpdateCount = run?.qualityAutomationLiveUpdateCount ?? 0;
  const nextTargetCount = run?.qualityAutomationNextTargetCount ?? 0;
  const nativeLiveUpdateCount = run?.nativeRuntimeLiveVideoBitrateUpdateCount ?? 0;
  const automaticReductionCount = run?.nativeRuntimeAutomaticReductionCount ?? 0;
  const automaticRestorationCount = run?.nativeRuntimeAutomaticRestorationCount ?? 0;
  const nativeAutomaticUpdateCount = automaticReductionCount + automaticRestorationCount;
  const baselineTargetKbps = number(run?.nativeRuntimeBaselineTargetKbps);
  const effectiveTargetKbps = number(run?.nativeRuntimeEffectiveTargetKbps);
  const floorTargetKbps = number(run?.nativeRuntimeFloorTargetKbps);
  const nativeLiveProofPass =
    liveUpdateCount <= 0 ||
    (run?.nativeRuntimeControlOwner === "native" &&
      Boolean(text(run?.nativeRuntimeControllerState)) &&
      statusLabel(run?.nativeRuntimeControllerState) !== "failed" &&
      (run?.nativeRuntimeBitrateAdaptationStatus === "reduced" || run?.nativeRuntimeBitrateAdaptationStatus === "restored") &&
      automaticReductionCount > 0 &&
      nativeAutomaticUpdateCount >= liveUpdateCount &&
      nativeLiveUpdateCount >= nativeAutomaticUpdateCount &&
      baselineTargetKbps > 0 &&
      floorTargetKbps > 0 &&
      floorTargetKbps <= effectiveTargetKbps &&
      effectiveTargetKbps <= baselineTargetKbps &&
      isZeroNumber(run?.nativeRuntimePendingTargetKbps) &&
      isPositiveNumber(run?.nativeRuntimeInitialVideoBitrateKbps) &&
      isPositiveNumber(run?.nativeRuntimeRequestedVideoBitrateKbps) &&
      isPositiveNumber(run?.nativeRuntimeAppliedVideoBitrateKbps) &&
      isPositiveNumber(run?.nativeRuntimeMinimumAppliedVideoBitrateKbps) &&
      run?.nativeRuntimeAppliedVideoBitrateKbps === effectiveTargetKbps &&
      isZeroNumber(run?.nativeRuntimeLiveVideoBitrateUpdateFailureCount) &&
      hasManifestNativeRuntimeSessionProof(run));
  return (
    run?.qualityAutomationStatus === "pass" &&
    hasControlledWeakNetworkProfile(run?.networkProfile) &&
    (liveUpdateCount > 0 || nextTargetCount > 0) &&
    isZeroNumber(run?.qualityAutomationFailureCount) &&
    nativeLiveProofPass
  );
}

function hasManifestNativeRuntimeSessionProof(run) {
  if (!text(run?.nativeRuntimeSessionId)) {
    return false;
  }
  const startedAtMs = Date.parse(text(run?.nativeRuntimeSessionStartedAt));
  const endedAtMs = Date.parse(text(run?.nativeRuntimeSessionEndedAt));
  const decisionAtMs = Date.parse(text(run?.nativeRuntimeLastDecisionAt));
  const updateAtMs = Date.parse(text(run?.nativeRuntimeLastVideoBitrateUpdateAt));
  const createdAtMs = Date.parse(text(run?.createdAt));
  if (![startedAtMs, endedAtMs, decisionAtMs, updateAtMs, createdAtMs].every(Number.isFinite)) {
    return false;
  }
  const evidenceAgeMs = createdAtMs - endedAtMs;
  const decisionAgeMs = createdAtMs - decisionAtMs;
  const updateAgeMs = createdAtMs - updateAtMs;
  return (
    startedAtMs <= decisionAtMs &&
    decisionAtMs <= endedAtMs &&
    startedAtMs <= updateAtMs &&
    updateAtMs <= endedAtMs &&
    evidenceAgeMs >= -nativeAdaptiveBitrateEvidenceFutureSkewMs &&
    evidenceAgeMs <= nativeAdaptiveBitrateEvidenceMaxAgeMs &&
    decisionAgeMs >= -nativeAdaptiveBitrateEvidenceFutureSkewMs &&
    decisionAgeMs <= nativeAdaptiveBitrateEvidenceMaxAgeMs &&
    updateAgeMs >= -nativeAdaptiveBitrateEvidenceFutureSkewMs &&
    updateAgeMs <= nativeAdaptiveBitrateEvidenceMaxAgeMs
  );
}

function hasControlledWeakNetworkProfile(networkProfile) {
  const normalized = statusLabel(networkProfile);
  return (
    normalized.includes("weak") ||
    normalized.includes("stress") ||
    normalized.includes("throttle") ||
    normalized.includes("constrained") ||
    normalized.includes("degraded") ||
    normalized.includes("unstable") ||
    normalized.includes("latency") ||
    normalized.includes("jitter") ||
    normalized.includes("loss") ||
    normalized.includes("reconnect") ||
    normalized.includes("poor") ||
    normalized.includes("limited") ||
    normalized.includes("弱") ||
    normalized.includes("低速") ||
    normalized.includes("遅延") ||
    normalized.includes("損失") ||
    normalized.includes("不安定") ||
    normalized.includes("スロットル")
  );
}

function isManifestPlatformIngestPass(
  run,
  expectedNativeOverlays = emptyNativeOverlayProofRequirements,
  expectedYouTubePublishing = emptyYouTubePublishingProofRequirements,
  expectedTwitchPublishing = emptyTwitchPublishingProofRequirements
) {
  if (!run) {
    return false;
  }
  if (!isManifestPlatformIngestProofRequired(run)) {
    return true;
  }
  return (
    isManifestNativeRuntimePass(run, expectedNativeOverlays) &&
    isManifestPlatformPublishingPass(run, expectedYouTubePublishing, expectedTwitchPublishing) &&
    isManifestPlatformPublishingTimestampConsistent(run)
  );
}

function isManifestPlatformPublishingTimestampConsistent(run) {
  const createdAtMs = Date.parse(String(run.createdAt));
  const checkedAtMs = Date.parse(String(run.platformPublishingCheckedAt));
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(checkedAtMs)) {
    return false;
  }
  const observedAgeMinutes = Math.floor((createdAtMs - checkedAtMs) / 60_000);
  const retainedObservedAgeMinutes = run.platformPublishingObservedAgeMinutes;
  return (
    observedAgeMinutes >= 0 &&
    observedAgeMinutes <= platformPublishingDashboardMaxAgeMinutes &&
    typeof retainedObservedAgeMinutes === "number" &&
    Number.isFinite(retainedObservedAgeMinutes) &&
    Math.abs(observedAgeMinutes - retainedObservedAgeMinutes) <= 1 &&
    typeof run.platformPublishingFreshnessAgeMinutes === "number" &&
    Number.isFinite(run.platformPublishingFreshnessAgeMinutes) &&
    Math.abs(observedAgeMinutes - run.platformPublishingFreshnessAgeMinutes) <= 1
  );
}

function isManifestNativeRuntimePass(run, expectedNativeOverlays = emptyNativeOverlayProofRequirements) {
  return (
    run?.nativeRuntimeStatus === "pass" &&
    run?.nativeRuntimePlatform === run?.devicePlatform &&
    run?.nativeRuntimePublisherState === "published" &&
    isPositiveInteger(run?.nativeRuntimePublisherPublishGeneration) &&
    isPositiveInteger(run?.nativeRuntimeCurrentPublishVideoFrames) &&
    isPositiveInteger(run?.nativeRuntimeCurrentPublishAudioFrames) &&
    isPositiveNumber(run?.nativeRuntimeSentVideoFrames) &&
    isPositiveNumber(run?.nativeRuntimeSentAudioFrames) &&
    isPositiveNumber(run?.nativeRuntimeBytesWritten) &&
    isProductionNativeVideoEncoderBackend(run?.devicePlatform, run?.nativeRuntimeVideoEncoderBackend) &&
    isProductionNativeAudioEncoderBackend(run?.devicePlatform, run?.nativeRuntimeAudioEncoderBackend) &&
    hasNativeEncoderOutputProof(run) &&
    hasNativePublisherBackpressureProof(run) &&
    hasNativePublisherDropProof(run) &&
    hasNativeRuntimeVideoFrameIntervalProof(run) &&
    hasNativeAvSyncProof(run) &&
    hasLiveRenderGraphUpdateProof(run) &&
    hasNativeCompositorDropProof(run) &&
    hasAndroidMediaCodecCompositorProof(run) &&
    hasAndroidPlaybackCaptureProof(run) &&
    hasAndroidAudioCaptureRecoveryProof(run) &&
    hasIosReplayKitCompositorProof(run) &&
    (run?.nativeRuntimeCompositionStatus === "applied" || run?.nativeRuntimeCompositionStatus === "screen-only") &&
    hasNativeOverlayProof(run, expectedNativeOverlays) &&
    hasStillImageOverlayProof(run) &&
    hasIosAppGroupStillImageProof(run) &&
    hasLive2DPoseProof(run) &&
    hasVrmReleaseProof(run)
  );
}

function hasNativeEncoderOutputProof(run) {
  return (
    run?.nativeRuntimeEncoderProbeStatus === "pass" &&
    isProductionNativeVideoEncoderBackend(run?.devicePlatform, run?.nativeRuntimeEncoderProbeVideoBackend) &&
    isProductionNativeAudioEncoderBackend(run?.devicePlatform, run?.nativeRuntimeEncoderProbeAudioBackend) &&
    run.nativeRuntimeEncoderProbeActiveEncoderInstancesVerified === true &&
    isPositiveInteger(run.nativeRuntimeEncoderProbeVideoEncodedOutputCount) &&
    isPositiveInteger(run.nativeRuntimeEncoderProbeAudioEncodedOutputCount) &&
    run.nativeRuntimeEncoderProbeVideoConfigured === true &&
    run.nativeRuntimeEncoderProbeAudioConfigured === true &&
    isPositiveInteger(run.requestedVideoWidth) &&
    isPositiveInteger(run.requestedVideoHeight) &&
    isPositiveInteger(run.requestedVideoFps) &&
    isPositiveInteger(run.nativeRuntimeEncoderProbeVideoWidth) &&
    isPositiveInteger(run.nativeRuntimeEncoderProbeVideoHeight) &&
    isPositiveInteger(run.nativeRuntimeEncoderProbeVideoFps) &&
    run.nativeRuntimeEncoderProbeVideoWidth === run.requestedVideoWidth &&
    run.nativeRuntimeEncoderProbeVideoHeight === run.requestedVideoHeight &&
    run.nativeRuntimeEncoderProbeVideoFps === run.requestedVideoFps &&
    run.nativeRuntimeEncoderProbeMatchesRequestedOutput === true
  );
}

function hasNativeRuntimeVideoFrameIntervalProof(run) {
  return (
    isPositiveNumber(run?.nativeRuntimeVideoFrameIntervalSampleCount) &&
    isPositiveNumber(run?.nativeRuntimeVideoFrameIntervalAverageMs) &&
    isPositiveNumber(run?.nativeRuntimeVideoFrameIntervalMaxMs) &&
    isNonNegativeNumber(run?.nativeRuntimeVideoFrameIntervalJitterMs)
  );
}

function hasNativeAvSyncProof(run) {
  return (
    run?.nativeRuntimeAvSyncStatus === "in-sync" &&
    isAtLeastNumber(
      run.nativeRuntimeAvSyncSampleCount,
      Math.max(3, Math.ceil((run.monitorHoldDurationSeconds ?? 0) * 2))
    ) &&
    isNonNegativeNumber(run.nativeRuntimeAvSyncMaxAbsSkewMs) &&
    run.nativeRuntimeAvSyncMaxAbsSkewMs <= 150 &&
    isZeroNumber(run.nativeRuntimeAvSyncOutOfSyncSampleCount) &&
    isZeroNumber(run.nativeRuntimeAvSyncIncidentCount) &&
    isZeroNumber(run.nativeRuntimeAvSyncCriticalIncidentCount) &&
    isZeroNumber(run.nativeRuntimeAvSyncMaxConsecutiveOutOfSyncSamples) &&
    typeof run.nativeRuntimeAvSyncSkewMs === "number" &&
    Number.isFinite(run.nativeRuntimeAvSyncSkewMs) &&
    Math.abs(run.nativeRuntimeAvSyncSkewMs) <= 150
  );
}

function hasMonitorHoldMediaTelemetryProof(run) {
  return (
    isPositiveNumber(run?.monitorHoldAverageBitrateKbps) &&
    isPositiveNumber(run?.monitorHoldMinimumBitrateKbps) &&
    isPositiveNumber(run?.monitorHoldAverageFps) &&
    isPositiveNumber(run?.monitorHoldMinimumFps)
  );
}

function hasNativePublisherBackpressureProof(run) {
  return (
    run?.nativeRuntimeCongested === false &&
    isZeroNumber(run?.nativeRuntimeQueuedItems) &&
    isNonNegativeNumber(run?.nativeRuntimeCacheSize)
  );
}

function hasNativePublisherDropProof(run) {
  return isZeroNumber(run?.nativeRuntimeDroppedVideoFrames) && isZeroNumber(run?.nativeRuntimeDroppedAudioFrames);
}

function hasLiveRenderGraphUpdateProof(run) {
  return (
    isNonNegativeNumber(run?.nativeRuntimeLiveRenderGraphReloadCount) &&
    isZeroNumber(run?.nativeRuntimeLiveRenderGraphRejectedUpdateCount)
  );
}

function hasNativeCompositorDropProof(run) {
  return isZeroNumber(run?.nativeRuntimeDroppedFrameCount);
}

function hasAndroidMediaCodecCompositorProof(run) {
  if (
    run?.devicePlatform !== "android" ||
    !isProductionNativeVideoEncoderBackend(run?.devicePlatform, run?.nativeRuntimeVideoEncoderBackend)
  ) {
    return true;
  }

  return (
    run.nativeRuntimeCompositorBackend === "android-canvas-mediacodec" &&
    isPositiveNumber(run.nativeRuntimeCompositedFrameCount) &&
    isZeroNumber(run.nativeRuntimeCompositionFailureCount)
  );
}

function hasAndroidPlaybackCaptureProof(run) {
  if (
    run?.devicePlatform !== "android" ||
    !isProductionNativeAudioEncoderBackend(run?.devicePlatform, run?.nativeRuntimeAudioEncoderBackend)
  ) {
    return true;
  }

  const sampleRate = run.nativeRuntimePlaybackCaptureSampleRate;
  const capturedFrames = run.nativeRuntimePlaybackCapturedFrames;
  const droppedFrames = run.nativeRuntimePlaybackDroppedFrames;
  const underrunFrames = run.nativeRuntimePlaybackUnderrunFrames;
  const bufferedFrames = run.nativeRuntimePlaybackBufferedFrames;
  if (
    (run.nativeRuntimePlaybackCaptureStatus !== "capturing" && run.nativeRuntimePlaybackCaptureStatus !== "stopped") ||
    run.nativeRuntimePlaybackCaptureBackend !== "android-audio-playback-capture" ||
    !isPositiveInteger(sampleRate) ||
    !isPositiveInteger(capturedFrames) ||
    !isNonNegativeInteger(droppedFrames) ||
    !isNonNegativeInteger(underrunFrames) ||
    !isNonNegativeInteger(bufferedFrames)
  ) {
    return false;
  }

  const deliveredFrames = Math.max(0, capturedFrames - droppedFrames - bufferedFrames);
  return (
    capturedFrames / sampleRate >= 2 &&
    droppedFrames / capturedFrames <= 0.01 &&
    underrunFrames / (deliveredFrames + underrunFrames) <= 0.05 &&
    bufferedFrames * 1_000 / sampleRate <= 100
  );
}

function hasAndroidAudioCaptureRecoveryProof(run) {
  if (run?.devicePlatform !== "android") {
    return true;
  }
  return (
    hasCaptureRecoveryProof({
      status: run.nativeRuntimeMicCaptureStatus,
      backend: run.nativeRuntimeMicCaptureBackend,
      expectedBackend: "android-audiorecord-microphone",
      sampleRate: run.nativeRuntimeMicCaptureSampleRate,
      fallbackFrames: run.nativeRuntimeMicCaptureFallbackFrames,
      lifecycleEventCount: run.nativeRuntimeMicCaptureLifecycleEventCount,
      routeChangeCount: run.nativeRuntimeMicCaptureRouteChangeCount,
      interruptionCount: run.nativeRuntimeMicCaptureInterruptionCount,
      recoveryCount: run.nativeRuntimeMicCaptureRecoveryCount,
      recoveryFailureCount: run.nativeRuntimeMicCaptureRecoveryFailureCount,
      unrecoveredEventCount: run.nativeRuntimeMicCaptureUnrecoveredEventCount,
      lastRecoveryReason: run.nativeRuntimeMicCaptureLastRecoveryReason,
      lastRecoveryAt: run.nativeRuntimeMicCaptureLastRecoveryAt,
      suspended: run.nativeRuntimeMicCaptureSuspended
    }) &&
    hasCaptureRecoveryProof({
      status: run.nativeRuntimePlaybackCaptureStatus,
      backend: run.nativeRuntimePlaybackCaptureBackend,
      expectedBackend: "android-audio-playback-capture",
      sampleRate: run.nativeRuntimePlaybackCaptureSampleRate,
      lifecycleEventCount: run.nativeRuntimePlaybackCaptureLifecycleEventCount,
      routeChangeCount: run.nativeRuntimePlaybackCaptureRouteChangeCount,
      interruptionCount: run.nativeRuntimePlaybackCaptureInterruptionCount,
      recoveryCount: run.nativeRuntimePlaybackCaptureRecoveryCount,
      recoveryFailureCount: run.nativeRuntimePlaybackCaptureRecoveryFailureCount,
      unrecoveredEventCount: run.nativeRuntimePlaybackCaptureUnrecoveredEventCount,
      lastRecoveryReason: run.nativeRuntimePlaybackCaptureLastRecoveryReason,
      lastRecoveryAt: run.nativeRuntimePlaybackCaptureLastRecoveryAt,
      suspended: run.nativeRuntimePlaybackCaptureSuspended
    })
  );
}

function hasCaptureRecoveryProof({
  status,
  backend,
  expectedBackend,
  sampleRate,
  fallbackFrames,
  lifecycleEventCount,
  routeChangeCount,
  interruptionCount,
  recoveryCount,
  recoveryFailureCount,
  unrecoveredEventCount,
  lastRecoveryReason,
  lastRecoveryAt,
  suspended
}) {
  const counters = [
    lifecycleEventCount,
    routeChangeCount,
    interruptionCount,
    recoveryCount,
    recoveryFailureCount,
    unrecoveredEventCount,
    ...(fallbackFrames === undefined ? [] : [fallbackFrames])
  ];
  if (!counters.every(isNonNegativeInteger)) {
    return false;
  }
  const eventCount = routeChangeCount + interruptionCount;
  const hasRecoveryEvidence =
    recoveryCount > 0 &&
    typeof lastRecoveryReason === "string" &&
    lastRecoveryReason.trim().length > 0 &&
    isPositiveInteger(lastRecoveryAt);
  return (
    (status === "capturing" || status === "stopped") &&
    backend === expectedBackend &&
    isPositiveInteger(sampleRate) &&
    lifecycleEventCount >= eventCount &&
    recoveryFailureCount === 0 &&
    unrecoveredEventCount === 0 &&
    suspended === false &&
    (eventCount === 0 || hasRecoveryEvidence)
  );
}

function hasIosReplayKitCompositorProof(run) {
  if (run?.devicePlatform !== "ios" || !isPositiveNumber(run?.nativeRuntimeCompositionAppliedCount)) {
    return true;
  }

  return (
    run.nativeRuntimeCompositorBackend === "ios-replaykit-coregraphics" &&
    isPositiveNumber(run.nativeRuntimeCompositedFrameCount) &&
    isZeroNumber(run.nativeRuntimeCompositionFailureCount)
  );
}

function hasStillImageOverlayProof(run) {
  if (!isPositiveNumber(run?.nativeRuntimeStillImageAssetCount)) {
    return true;
  }

  return (
    run?.nativeRuntimeCompositionStatus === "applied" &&
    isAtLeastNumber(run?.nativeRuntimeCompositionAppliedCount, run.nativeRuntimeStillImageAssetCount) &&
    isZeroNumber(run?.nativeRuntimeCompositionSkippedCount) &&
    isZeroNumber(run?.nativeRuntimeStillImageAssetMissingCount) &&
    hasLoadedAllNativeRuntimeAssets(run) &&
    hasDecodedAllNativeRuntimeAssets(run) &&
    hasCompositedAllNativeRuntimeAssets(run)
  );
}

function nativeCompositionOverlayProofRequirements(summary) {
  return {
    total: nonNegativeSummaryCount(summary?.nativeCompositionNativeOverlayCount),
    text: nonNegativeSummaryCount(summary?.nativeCompositionTextOverlayCount),
    caption: nonNegativeSummaryCount(summary?.nativeCompositionCaptionOverlayCount),
    chat: nonNegativeSummaryCount(summary?.nativeCompositionChatOverlayCount)
  };
}

function nonNegativeSummaryCount(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function hasNativeOverlayProof(run, expectedNativeOverlays) {
  if (!isPositiveNumber(expectedNativeOverlays.total)) {
    return true;
  }

  const appliedKinds = Array.isArray(run?.nativeRuntimeCompositionAppliedKinds)
    ? run.nativeRuntimeCompositionAppliedKinds
    : [];
  const appliedCaptionOverlayCount = countKind(appliedKinds, "caption");
  const appliedTextOverlayCount = countKind(appliedKinds, "text") + appliedCaptionOverlayCount;
  return (
    run?.nativeRuntimeCompositionStatus === "applied" &&
    isAtLeastNumber(run?.nativeRuntimeCompositionAppliedCount, expectedNativeOverlays.total) &&
    appliedTextOverlayCount >= expectedNativeOverlays.text &&
    appliedCaptionOverlayCount >= expectedNativeOverlays.caption &&
    countKind(appliedKinds, "chat") >= expectedNativeOverlays.chat &&
    isZeroNumber(run?.nativeRuntimeCompositionSkippedCount)
  );
}

function countKind(kinds, expectedKind) {
  return kinds.filter((kind) => kind === expectedKind).length;
}

function hasIosAppGroupStillImageProof(run) {
  if (run?.devicePlatform !== "ios" || !isPositiveNumber(run?.nativeRuntimeStillImageAssetCount)) {
    return true;
  }

  return (
    isAtLeastNumber(run?.nativeRuntimeStillImageAssetAppGroupCount, run.nativeRuntimeStillImageAssetCount) &&
    isAtLeastNumber(run?.nativeRuntimeStillImageAssetAppGroupLoadedCount, run.nativeRuntimeStillImageAssetCount) &&
    isAtLeastNumber(run?.nativeRuntimeStillImageAssetAppGroupDecodedCount, run.nativeRuntimeStillImageAssetCount) &&
    isPositiveNumber(run?.nativeRuntimeStillImageAssetAppGroupDecodedPixelCount) &&
    isAtLeastNumber(run?.nativeRuntimeStillImageAssetAppGroupCompositedCount, run.nativeRuntimeStillImageAssetCount) &&
    isPositiveNumber(run?.nativeRuntimeStillImageAssetAppGroupCompositedPixelCount)
  );
}

function hasVrmReleaseProof(run) {
  const vrmSourceCount = run?.nativeRuntimeVrmSourceCount;
  if (typeof vrmSourceCount !== "number" || !Number.isFinite(vrmSourceCount) || vrmSourceCount <= 0) {
    return true;
  }

  return (
    run?.nativeRuntimeVrmRendererStatus === "ready" &&
    isProductionVrmRendererBackend(run?.devicePlatform, run?.nativeRuntimeVrmRendererBackend) &&
    isAtLeastNumber(run?.nativeRuntimeVrmRenderedSourceCount, vrmSourceCount) &&
    isZeroNumber(run?.nativeRuntimeVrmRenderMissingCount) &&
    isZeroNumber(run?.nativeRuntimeVrmRenderFailureCount) &&
    isAtLeastNumber(run?.nativeRuntimeVrmActivePoseCount, vrmSourceCount) &&
    isZeroNumber(run?.nativeRuntimeVrmMissingPoseCount) &&
    isPositiveNumber(run?.nativeRuntimeVrmModelLoadedCount) &&
    isPositiveNumber(run?.nativeRuntimeVrmHumanoidBoneCount) &&
    isPositiveNumber(run?.nativeRuntimeVrmExpressionCount) &&
    isPositiveNumber(run?.nativeRuntimeVrmMeshPrimitiveCount) &&
    isPositiveNumber(run?.nativeRuntimeVrmSkinnedMeshPrimitiveCount) &&
    isPositiveNumber(run?.nativeRuntimeVrmSkinJointCount) &&
    isPositiveNumber(run?.nativeRuntimeVrmPositionAccessorCount) &&
    isPositiveNumber(run?.nativeRuntimeVrmVertexCount) &&
    hasVrmModelStructureProof(run) &&
    isAtLeastNumber(run?.nativeRuntimeVrmSkinningAttributePrimitiveCount, run.nativeRuntimeVrmSkinnedMeshPrimitiveCount) &&
    isAtLeastNumber(run?.nativeRuntimeVrmTrianglePrimitiveCount, run.nativeRuntimeVrmMeshPrimitiveCount) &&
    isZeroNumber(run?.nativeRuntimeVrmUnsupportedPrimitiveModeCount) &&
    isZeroNumber(run?.nativeRuntimeVrmUnsupportedImageMimeCount) &&
    isZeroNumber(run?.nativeRuntimeVrmPoseBoneUnsupportedCount) &&
    isZeroNumber(run?.nativeRuntimeVrmPoseExpressionUnsupportedCount)
  );
}

function hasVrmModelStructureProof(run) {
  return (
    isAtLeastNumber(run?.nativeRuntimeVrmBoundsAccessorCount, run.nativeRuntimeVrmPositionAccessorCount) &&
    isPositiveNumber(run?.nativeRuntimeVrmMaterialCount) &&
    (run.nativeRuntimeVrmImageCount === 0 ||
      (isPositiveNumber(run?.nativeRuntimeVrmTextureCount) &&
        isPositiveNumber(run?.nativeRuntimeVrmTexcoordAccessorCount)))
  );
}

function hasLive2DPoseProof(run) {
  const live2dSourceCount = run?.nativeRuntimeLive2dSourceCount;
  if (typeof live2dSourceCount !== "number" || !Number.isFinite(live2dSourceCount) || live2dSourceCount <= 0) {
    return true;
  }

  return (
    isAtLeastNumber(run?.nativeRuntimeLive2dPosePayloadCount, live2dSourceCount) &&
    isAtLeastNumber(run?.nativeRuntimeLive2dActivePoseCount, live2dSourceCount) &&
    isZeroNumber(run?.nativeRuntimeLive2dMissingPoseCount)
  );
}

function isProductionVrmRendererBackend(platform, backend) {
  const normalized = typeof backend === "string" ? backend.trim().toLowerCase() : "";
  return platform === "ios" || platform === "android"
    ? productionVrmRendererBackendsByPlatform[platform].has(normalized)
    : false;
}

function isProductionNativeVideoEncoderBackend(platform, backend) {
  const normalized = typeof backend === "string" ? backend.trim().toLowerCase() : "";
  return platform === "ios" || platform === "android"
    ? productionVideoEncoderBackendsByPlatform[platform].has(normalized)
    : false;
}

function isProductionNativeAudioEncoderBackend(platform, backend) {
  const normalized = typeof backend === "string" ? backend.trim().toLowerCase() : "";
  return platform === "ios" || platform === "android"
    ? productionAudioEncoderBackendsByPlatform[platform].has(normalized)
    : false;
}

function hasReadyFaceLandmarks(run) {
  return (
    run?.faceTrackingFaceLandmarkReady === true &&
    typeof run.faceTrackingFaceLandmarkConfidence === "number" &&
    Number.isFinite(run.faceTrackingFaceLandmarkConfidence) &&
    run.faceTrackingFaceLandmarkConfidence >= 0.55
  );
}

function hasMotionAttenuationProof(run) {
  return (
    isPositiveNumber(run?.faceTrackingLandmarkMotionScale) &&
    isPositiveNumber(run?.faceTrackingFaceControlScale)
  );
}

function hasReadyPngTuberMotionProof(run) {
  return (
    isPositiveNumber(run?.faceTrackingPreparedPngTuberCount) &&
    isZeroNumber(run?.faceTrackingRigIssueCount) &&
    run?.faceTrackingRigQualityGrade === "ready" &&
    isAtLeastNumber(run?.faceTrackingRigQualityScore, 90) &&
    run?.faceTrackingRigHighFidelityGrade === "ready" &&
    isAtLeastNumber(run?.faceTrackingRigHighFidelityScore, 90) &&
    isAtLeastNumber(run?.faceTrackingRigPartSeparationScore, 90) &&
    isAtLeastNumber(run?.faceTrackingRigDepthContinuityScore, 90) &&
    isAtLeastNumber(run?.faceTrackingRigSemanticSegmentScore, 90) &&
    isAtLeastNumber(run?.faceTrackingRigEyeMouthSegmentScore, 90) &&
    isAtLeastNumber(run?.faceTrackingRigHorizontalAnchorScore, 90)
  );
}

function hasReadyVrmMotionProof(run) {
  return (
    isPositiveNumber(run?.faceTrackingVisibleVrmCount) &&
    run?.faceTrackingNativeVrmRendererReady === true &&
    isPositiveNumber(run?.nativeRuntimeVrmSourceCount) &&
    hasLive2DPoseProof(run) &&
    hasVrmReleaseProof(run)
  );
}

function isManifestPlatformIngestProofRequired(run) {
  const target = normalizeTargetPlatformLabel(run?.targetPlatform);
  return target === "youtube live" || target.includes("youtube") || target === "twitch" || target.includes("twitch");
}

function isFirstPartyManifestPublishingDestination(run) {
  return (
    run?.platformPublishingPlatform === "youtube-live" ||
    run?.platformPublishingPlatform === "twitch" ||
    isManifestPlatformIngestProofRequired(run)
  );
}

function isManifestPlatformIdentityPass(
  run,
  expectedYouTubePublishing = emptyYouTubePublishingProofRequirements,
  expectedTwitchPublishing = emptyTwitchPublishingProofRequirements
) {
  if (run?.platformPublishingPlatform === "youtube-live") {
    return (
      run.platformPublishingYoutubeHasBroadcastId === true &&
      run.platformPublishingYoutubeHasStreamId === true &&
      ["live", "testing"].includes(statusLabel(run.platformPublishingYoutubeBroadcastStatus)) &&
      hasExpectedYouTubeBoundStreamProof(run, expectedYouTubePublishing) &&
      hasExpectedYouTubePrivacyProof(run, expectedYouTubePublishing) &&
      statusLabel(run.platformPublishingYoutubeStreamStatus) === "active" &&
      ["ok", "good"].includes(statusLabel(run.platformPublishingYoutubeHealthStatus)) &&
      isZeroNumber(run.platformPublishingYoutubeHealthIssueCount)
    );
  }
  if (run?.platformPublishingPlatform === "twitch") {
    return (
      statusLabel(run.platformPublishingTwitchLiveStatus) === "live" &&
      isNonEmptyIsoDate(run.platformPublishingTwitchStartedAt) &&
      run.platformPublishingTwitchHasCategoryId === true &&
      nonEmptyText(run.platformPublishingTwitchChannelTitle) !== null &&
      nonEmptyText(run.platformPublishingTwitchChannelCategory) !== null &&
      nonEmptyText(run.platformPublishingTwitchChannelCategoryId) !== null &&
      nonEmptyText(run.platformPublishingTwitchChannelLanguage) !== null &&
      isNonNegativeNumber(run.platformPublishingTwitchViewerCount) &&
      hasExpectedTwitchTitleProof(run, expectedTwitchPublishing) &&
      hasExpectedTwitchCategoryProof(run, expectedTwitchPublishing) &&
      hasExpectedTwitchLanguageProof(run, expectedTwitchPublishing)
    );
  }
  return false;
}

function hasExpectedYouTubeBoundStreamProof(run, expectedYouTubePublishing) {
  const manifestBoundStreamId = text(run?.platformPublishingYoutubeBoundStreamId);
  if (!manifestBoundStreamId) {
    return false;
  }
  return !expectedYouTubePublishing.boundStreamId || manifestBoundStreamId === expectedYouTubePublishing.boundStreamId;
}

function hasExpectedYouTubePrivacyProof(run, expectedYouTubePublishing) {
  const manifestPrivacyStatus = text(run?.platformPublishingYoutubeBroadcastPrivacyStatus);
  if (!manifestPrivacyStatus) {
    return false;
  }
  return (
    !expectedYouTubePublishing.broadcastPrivacyStatus ||
    statusLabel(manifestPrivacyStatus) === statusLabel(expectedYouTubePublishing.broadcastPrivacyStatus)
  );
}

function hasExpectedTwitchCategoryProof(run, expectedTwitchPublishing) {
  const manifestCategoryId = nonEmptyText(run?.platformPublishingTwitchChannelCategoryId);
  if (!manifestCategoryId) {
    return false;
  }
  if (expectedTwitchPublishing.categoryId) {
    return statusLabel(manifestCategoryId) === statusLabel(expectedTwitchPublishing.categoryId);
  }
  const manifestCategory = nonEmptyText(run?.platformPublishingTwitchChannelCategory);
  return Boolean(
    manifestCategory &&
      (!expectedTwitchPublishing.category || statusLabel(manifestCategory) === statusLabel(expectedTwitchPublishing.category))
  );
}

function hasExpectedTwitchTitleProof(run, expectedTwitchPublishing) {
  const manifestTitle = nonEmptyText(run?.platformPublishingTwitchChannelTitle);
  if (!manifestTitle) {
    return false;
  }
  return expectedTwitchPublishing.titleLength === null || manifestTitle.length === expectedTwitchPublishing.titleLength;
}

function hasExpectedTwitchLanguageProof(run, expectedTwitchPublishing) {
  const manifestLanguage = nonEmptyText(run?.platformPublishingTwitchChannelLanguage);
  if (!manifestLanguage) {
    return false;
  }
  return !expectedTwitchPublishing.language || statusLabel(manifestLanguage) === statusLabel(expectedTwitchPublishing.language);
}

function isNonEmptyIsoDate(value) {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

function statusLabel(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function nonEmptyText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isDiagnosticStatus(value) {
  return value === "pass" || value === "warn" || value === "fail" || value === "info";
}

function isManifestRunFreshAndScopeClaimed(run) {
  return run?.fresh === true && run?.matchesScope === true && Number.isFinite(Date.parse(String(run?.createdAt)));
}

function manifestRunCreatedAtMs(run) {
  return Date.parse(String(run?.createdAt ?? ""));
}

function isManifestRunFreshInScope(run, manifestScope = emptyExpectedManifestScope) {
  return isManifestRunFreshAndScopeClaimed(run) && isManifestRunDestinationScopePass(run, manifestScope);
}

function isManifestRunInScope(run, manifestScope = emptyExpectedManifestScope) {
  return run?.matchesScope === true && isManifestRunDestinationScopePass(run, manifestScope);
}

function isManifestRunDestinationScopePass(
  run,
  { targetPlatform, transport, sceneFingerprint, videoWidth, videoHeight, videoFps }
) {
  const expectedTarget = normalizeTargetPlatformLabel(targetPlatform);
  if (expectedTarget && normalizeTargetPlatformLabel(run?.targetPlatform) !== expectedTarget) {
    return false;
  }
  const expectedTransport = normalizeTransportLabel(transport);
  if (expectedTransport && normalizeTransportLabel(run?.transport) !== expectedTransport) {
    return false;
  }
  const expectedSceneFingerprint = text(sceneFingerprint);
  if (expectedSceneFingerprint && text(run?.sceneFingerprint) !== expectedSceneFingerprint) {
    return false;
  }
  if (videoWidth !== null && run?.requestedVideoWidth !== videoWidth) {
    return false;
  }
  if (videoHeight !== null && run?.requestedVideoHeight !== videoHeight) {
    return false;
  }
  if (videoFps !== null && run?.requestedVideoFps !== videoFps) {
    return false;
  }
  return true;
}

function formatManifestScope({ targetPlatform, transport, sceneFingerprint, videoWidth, videoHeight, videoFps }) {
  return `${targetPlatform ?? "unknown target"}/${transport ?? "unknown transport"}/${sceneFingerprint ?? "unknown scene"}/${
    videoWidth ?? "unknown"
  }x${videoHeight ?? "unknown"}@${videoFps ?? "unknown"}`;
}

function normalizeTargetPlatformLabel(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeTransportLabel(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeBuildLabel(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hasLoadedAllNativeRuntimeAssets(run) {
  return (
    typeof run?.nativeRuntimeStillImageAssetLoadedCount === "number" &&
    typeof run.nativeRuntimeStillImageAssetCount === "number" &&
    Number.isFinite(run.nativeRuntimeStillImageAssetLoadedCount) &&
    Number.isFinite(run.nativeRuntimeStillImageAssetCount) &&
    run.nativeRuntimeStillImageAssetLoadedCount >= run.nativeRuntimeStillImageAssetCount
  );
}

function hasDecodedAllNativeRuntimeAssets(run) {
  return (
    typeof run?.nativeRuntimeStillImageAssetDecodedCount === "number" &&
    typeof run?.nativeRuntimeStillImageAssetDecodedPixelCount === "number" &&
    typeof run.nativeRuntimeStillImageAssetCount === "number" &&
    Number.isFinite(run.nativeRuntimeStillImageAssetDecodedCount) &&
    Number.isFinite(run.nativeRuntimeStillImageAssetDecodedPixelCount) &&
    Number.isFinite(run.nativeRuntimeStillImageAssetCount) &&
    run.nativeRuntimeStillImageAssetDecodedCount >= run.nativeRuntimeStillImageAssetCount &&
    run.nativeRuntimeStillImageAssetDecodedPixelCount > 0
  );
}

function hasCompositedAllNativeRuntimeAssets(run) {
  return (
    typeof run?.nativeRuntimeStillImageAssetCompositedCount === "number" &&
    typeof run?.nativeRuntimeStillImageAssetCompositedPixelCount === "number" &&
    typeof run.nativeRuntimeStillImageAssetCount === "number" &&
    Number.isFinite(run.nativeRuntimeStillImageAssetCompositedCount) &&
    Number.isFinite(run.nativeRuntimeStillImageAssetCompositedPixelCount) &&
    Number.isFinite(run.nativeRuntimeStillImageAssetCount) &&
    run.nativeRuntimeStillImageAssetCompositedCount >= run.nativeRuntimeStillImageAssetCount &&
    run.nativeRuntimeStillImageAssetCompositedPixelCount > 0
  );
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function findSensitiveBundleFindings(value) {
  const findings = [];
  const seen = new WeakSet();

  const visit = (entry, path, key) => {
    if (findings.length >= 10) {
      return;
    }

    if (typeof entry === "string") {
      if (key && isSensitivePropertyName(key) && !isSafeSensitiveValue(entry)) {
        findings.push({ path, reason: `stores ${key}` });
      }
      findings.push(...findSensitiveStringFindings(entry, path).slice(0, 10 - findings.length));
      return;
    }

    if (entry === null || typeof entry !== "object") {
      if (key && isSensitivePropertyName(key) && entry !== null && entry !== undefined) {
        findings.push({ path, reason: `stores non-redacted ${key}` });
      }
      return;
    }

    if (seen.has(entry)) {
      return;
    }
    seen.add(entry);

    if (Array.isArray(entry)) {
      entry.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }

    for (const [childKey, childValue] of Object.entries(entry)) {
      visit(childValue, `${path}.${childKey}`, childKey);
    }
  };

  visit(value, "bundle");
  return findings;
}

function findSensitiveStringFindings(value, path) {
  const findings = [];
  if (!value) {
    return findings;
  }
  if (hasSensitiveTextLeak(value)) {
    findings.push({ path, reason: "contains an unredacted token pattern" });
  }
  if (hasUnredactedContactTextLeak(value)) {
    findings.push({ path, reason: "contains an unredacted contact pattern" });
  }
  if (hasUnredactedProtocolLessLink(value, path)) {
    findings.push({ path, reason: "contains an unredacted protocol-less link pattern" });
  }
  return findings;
}

function hasSensitiveTextLeak(value) {
  return (
    hasUnredactedMatch(value, sensitiveAssignmentPattern) ||
    hasUnredactedMatch(value, sensitiveJsonPattern) ||
    hasUnredactedMatch(value, authorizationHeaderPattern) ||
    hasUnredactedMatch(value, sensitiveHeaderPattern) ||
    hasUnredactedMatch(value, sensitiveStructuredHeaderPattern) ||
    hasUnredactedMatch(value, bearerTokenPattern) ||
    hasUnredactedMatch(value, twitchIrcOauthPattern) ||
    hasUnredactedMatch(value, rtmpPublishUrlPattern) ||
    hasUnredactedMatch(value, googleApiKeyPattern) ||
    hasUnredactedMatch(value, openAiApiKeyPattern) ||
    hasUnredactedMatch(value, githubTokenPattern) ||
    hasUnredactedMatch(value, jwtTokenPattern) ||
    hasPatternMatch(value, oauthCallbackPattern) ||
    hasPatternMatch(value, oauthAuthorizationPattern) ||
    hasPatternMatch(value, oauthDeviceActivationPattern) ||
    hasPatternMatch(value, discordWebhookUrlPattern) ||
    hasPatternMatch(value, privateKeyBlockPattern)
  );
}

function hasUnredactedMatch(value, pattern) {
  pattern.lastIndex = 0;
  for (const match of value.matchAll(pattern)) {
    const candidate = match[2] ?? match[1] ?? "";
    if (!isSafeSensitiveValue(candidate)) {
      return true;
    }
  }
  return false;
}

function hasUnredactedContactTextLeak(value) {
  return hasPatternMatch(value, emailAddressPattern) || hasPatternMatch(value, inviteLinkPattern) || hasUnredactedPhoneMatch(value);
}

function hasUnredactedProtocolLessLink(value, path) {
  protocolLessLinkPattern.lastIndex = 0;
  for (const match of value.matchAll(protocolLessLinkPattern)) {
    const candidate = match[2] ?? "";
    if (candidate && !candidate.includes(redactedMarker) && !isAllowedProtocolLessLinkFinding(path, candidate)) {
      return true;
    }
  }
  return false;
}

function isAllowedProtocolLessLinkFinding(path, candidate) {
  return (
    (path === "bundle.target.host" || path === "bundle.profile.destination.host") &&
    candidate.includes(".") &&
    !candidate.includes("/") &&
    /^[a-z0-9.-]+$/i.test(candidate)
  );
}

function hasPatternMatch(value, pattern) {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function hasUnredactedPhoneMatch(value) {
  phoneLikePattern.lastIndex = 0;
  for (const match of value.matchAll(phoneLikePattern)) {
    if (isUnredactedPhoneCandidate(match[2] ?? "")) {
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

function isSafeSensitiveValue(value) {
  const trimmed = value.trim();
  return !trimmed || trimmed.includes(redactedMarker);
}

function normalizePropertyName(value) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSensitivePropertyName(value) {
  const normalized = normalizePropertyName(value);
  return sensitivePropertyNames.has(normalized) || sensitivePropertySuffixes.some((suffix) => normalized.endsWith(suffix));
}
