import type { SupportBundle } from "./supportBundle";
import {
  minimumValidationMonitorDurationSeconds,
  minimumValidationMonitorSampleCount
} from "./streamValidationThresholds";
import { platformPublishingDashboardMaxAgeMinutes } from "./platformPublishingFreshness";
import {
  isProductionNativeAudioEncoderBackend,
  isProductionNativeVideoEncoderBackend,
  isProductionVrmRendererBackend
} from "./nativeRuntime";

export type CommercialReleaseGateStatus = "ready" | "warning" | "blocked";
export type CommercialReleaseGateIssueSeverity = "warn" | "fail";

export interface CommercialReleaseGateIssue {
  code: string;
  severity: CommercialReleaseGateIssueSeverity;
  label: string;
  detail: string;
  action: string;
}

export interface CommercialReleaseGate {
  canRelease: boolean;
  status: CommercialReleaseGateStatus;
  generatedAt: string;
  bundleAgeHours: number | null;
  sceneFingerprint: string | null;
  evidenceFingerprint: string | null;
  latestRunFingerprint: string | null;
  issueCounts: {
    warningCount: number;
    failureCount: number;
  };
  issues: CommercialReleaseGateIssue[];
  summary: string;
  primaryAction: string;
}

export interface CommercialReleaseGateOptions {
  now?: Date;
  maxBundleAgeHours?: number;
}

const minimumSupportBundleVersion = 55;
const defaultMaxBundleAgeHours = 24;

const destinationTargetPlatformLabels = {
  "youtube-live": "YouTube Live",
  twitch: "Twitch",
  custom: "Custom"
} as const;

export const createCommercialReleaseGate = (
  bundle: SupportBundle,
  {
    now = new Date(),
    maxBundleAgeHours = defaultMaxBundleAgeHours
  }: CommercialReleaseGateOptions = {}
): CommercialReleaseGate => {
  const issueCandidates = [
    createBundleVersionIssue(bundle),
    createSupportBundleRedactionIssue(bundle),
    createBundleAgeIssue(bundle, now, maxBundleAgeHours),
    createPreflightIssue(bundle),
    createAndroidPublisherModeIssue(bundle),
    createPublicLaunchIssue(bundle),
    createPublicLaunchConfirmationEvidenceIssue(bundle),
    createStreamSessionRecoveryEvidenceIssue(bundle),
    createSceneFingerprintIssue(bundle),
    createNativeCaptionOverlaySummaryIssue(bundle),
    createTextOverlayEvidenceIssue(bundle),
    createChatOverlayEvidenceIssue(bundle),
    createLiveCaptionEvidenceIssue(bundle),
    createPlatformPublishingFreshnessIssue(bundle, now),
    createValidationIssue(bundle),
    createValidationRunbookIssue(bundle),
    createRehearsalIssue(bundle),
    createValidationEvidenceIssue(bundle),
    createValidationEvidenceCoverageIssue(bundle),
    createValidationEvidenceManifestIssue(bundle),
    createValidationEvidenceSceneManifestIssue(bundle),
    createValidationEvidenceManifestIntegrityIssue(bundle, now),
    createValidationEvidenceQualityAutomationIssue(bundle),
    createValidationEvidenceFeatureIssue(bundle),
    createRetainedStaleEvidenceIssue(bundle)
  ];
  const issues = issueCandidates.filter((issue): issue is CommercialReleaseGateIssue => Boolean(issue));
  const warningCount = issues.filter((issue) => issue.severity === "warn").length;
  const failureCount = issues.filter((issue) => issue.severity === "fail").length;
  const status: CommercialReleaseGateStatus = failureCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "ready";
  const canRelease = failureCount === 0 && warningCount === 0;

  return {
    canRelease,
    status,
    generatedAt: bundle.generatedAt,
    bundleAgeHours: ageInHours(bundle.generatedAt, now),
    sceneFingerprint: nonEmptyText(bundle.summary.sceneFingerprint) ?? nonEmptyText(bundle.scene?.fingerprint),
    evidenceFingerprint: nonEmptyText(bundle.summary.validationEvidenceFingerprint),
    latestRunFingerprint: nonEmptyText(bundle.summary.validationEvidenceLatestRunFingerprint),
    issueCounts: {
      warningCount,
      failureCount
    },
    issues,
    summary: createGateSummary(canRelease, { warningCount, failureCount }),
    primaryAction: createPrimaryAction(canRelease, issues)
  };
};

export const formatCommercialReleaseGate = (gate: CommercialReleaseGate): string =>
  [
    "MobileLiveCaster Commercial Release Gate",
    `Status: ${gate.status}`,
    `Can release: ${gate.canRelease ? "yes" : "no"}`,
    `Generated: ${gate.generatedAt}`,
    `Bundle age: ${gate.bundleAgeHours === null ? "-" : `${gate.bundleAgeHours}h`}`,
    `Scene fingerprint: ${gate.sceneFingerprint ?? "-"}`,
    `Evidence fingerprint: ${gate.evidenceFingerprint ?? "-"}`,
    `Latest run fingerprint: ${gate.latestRunFingerprint ?? "-"}`,
    `Summary: ${gate.summary}`,
    `Primary action: ${gate.primaryAction}`,
    ...gate.issues.map((issue) => `- [${issue.severity.toUpperCase()}] ${issue.label}: ${issue.detail} Action: ${issue.action}`)
  ].join("\n");

const createBundleVersionIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  if (bundle.app.name !== "MobileLiveCaster" || bundle.app.reportVersion !== 1) {
    return failIssue(
      "bundle-identity",
      "Support bundle",
      "The support bundle is not a MobileLiveCaster reportVersion 1 bundle.",
      "Export a fresh MobileLiveCaster support bundle from the release candidate build."
    );
  }
  if (!Number.isFinite(bundle.app.bundleVersion) || bundle.app.bundleVersion < minimumSupportBundleVersion) {
    return failIssue(
      "bundle-version",
      "Support bundle",
      `Support bundle v${bundle.app.bundleVersion} is older than the required v${minimumSupportBundleVersion}.`,
      "Export a fresh support bundle so validation fingerprints and retained-run manifest evidence are included."
    );
  }
  return null;
};

const createBundleAgeIssue = (
  bundle: SupportBundle,
  now: Date,
  maxBundleAgeHours: number
): CommercialReleaseGateIssue | null => {
  const generatedAtMs = Date.parse(bundle.generatedAt);
  if (!Number.isFinite(generatedAtMs)) {
    return failIssue(
      "bundle-generated-at-invalid",
      "Support bundle freshness",
      "The support bundle generatedAt timestamp is invalid.",
      "Export a fresh support bundle from the release candidate build."
    );
  }
  if (generatedAtMs > now.getTime()) {
    return failIssue(
      "bundle-generated-at-future",
      "Support bundle freshness",
      "The support bundle generatedAt timestamp is in the future.",
      "Export a support bundle after the release-candidate validation run completes, then verify it on the same clock."
    );
  }
  const ageHours = Math.floor((now.getTime() - generatedAtMs) / 3_600_000);
  if (ageHours > maxBundleAgeHours) {
    return failIssue(
      "bundle-stale",
      "Support bundle freshness",
      `The support bundle is ${ageHours}h old, above the ${maxBundleAgeHours}h release gate.`,
      "Export a fresh support bundle immediately before release approval."
    );
  }
  return null;
};

const createSupportBundleRedactionIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  const findings = findSensitiveBundleFindings(bundle);
  if (findings.length === 0) {
    return null;
  }
  const examples = findings
    .slice(0, 3)
    .map((finding) => `${finding.path} ${finding.reason}`)
    .join("; ");
  return failIssue(
    "support-bundle-sensitive-data",
    "Support bundle privacy",
    `Support bundle contains ${findings.length} unredacted sensitive value(s): ${examples}.`,
    "Fix redaction, export a fresh support bundle, and do not archive the leaking evidence."
  );
};

const createPreflightIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  if (bundle.summary.preflightStatus === "blocked" || bundle.summary.launchBlockCount > 0) {
    return failIssue(
      "preflight-blocked",
      "Go Live preflight",
      `${bundle.summary.launchBlockCount} launch blocker${bundle.summary.launchBlockCount === 1 ? "" : "s"} remain.`,
      "Resolve Go Live preflight blockers and export a new support bundle."
    );
  }
  if (bundle.summary.preflightStatus === "warning" || bundle.summary.launchWarningCount > 0) {
    return failIssue(
      "preflight-incomplete",
      "Go Live preflight",
      `${bundle.summary.launchWarningCount} launch warning${bundle.summary.launchWarningCount === 1 ? "" : "s"} remain.`,
      "Resolve Go Live preflight warnings before approving release; platform-visible starts must have a clean preflight."
    );
  }
  return null;
};

const createAndroidPublisherModeIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null =>
  bundle.profile?.androidPublisherMode === "mediacodec"
    ? null
    : failIssue(
        "android-publisher-mode-not-commercial",
        "Android publisher mode",
        `Android publisher mode is ${bundle.profile?.androidPublisherMode || "missing"}; commercial release requires the direct MediaCodec path.`,
        "Switch Android publisher mode to direct MediaCodec and retain passing Android physical validation evidence before release approval."
      );

const createPublicLaunchIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  if (
    !bundle.summary.publicLaunchCanStart ||
    bundle.summary.publicLaunchStatus === "blocked" ||
    bundle.summary.publicLaunchFailCount > 0 ||
    bundle.summary.publicLaunchStartLockBlocked
  ) {
    return failIssue(
      "public-launch-blocked",
      "Public launch checklist",
      bundle.summary.publicLaunchStartLockSummary || `${bundle.summary.publicLaunchFailCount} public launch blocker(s) remain.`,
      bundle.summary.publicLaunchStartLockAction || "Resolve public launch checklist blockers and export a fresh support bundle."
    );
  }
  if (bundle.summary.publicLaunchStatus === "warning" || bundle.summary.publicLaunchWarningCount > 0) {
    return failIssue(
      "public-launch-incomplete",
      "Public launch checklist",
      `${bundle.summary.publicLaunchWarningCount} public launch warning${bundle.summary.publicLaunchWarningCount === 1 ? "" : "s"} remain.`,
      "Resolve public launch checklist warnings before approving release; platform-visible starts are locked when warnings remain."
    );
  }
  return null;
};

const createPublicLaunchConfirmationEvidenceIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  const summary = bundle.summary as Partial<SupportBundle["summary"]>;
  const count = summary.publicLaunchConfirmationEventCount;
  const status = summary.publicLaunchLastConfirmationStatus;
  const lastAt = summary.publicLaunchLastConfirmationAt;
  const lastMessage = summary.publicLaunchLastConfirmationMessage;
  const hasValidCount = typeof count === "number" && Number.isInteger(count) && count >= 0;
  const hasValidStatus = status === "confirmed" || status === "cancelled" || status === "none";
  const hasConfirmation =
    typeof count === "number" &&
    count > 0 &&
    (status === "confirmed" || status === "cancelled") &&
    typeof lastAt === "string" &&
    Number.isFinite(Date.parse(lastAt)) &&
    hasPublicLaunchConfirmationTimestampEvidence(
      lastAt,
      bundle.generatedAt,
      summary.platformPublishingFreshnessCheckedAt,
      summary.validationEvidenceRunManifest,
      createExpectedManifestScope(bundle)
    ) &&
    typeof lastMessage === "string" &&
    hasPublicLaunchConfirmationAuditEvidence(lastMessage, expectedTargetPlatformForBundle(bundle));

  if (!hasValidCount || !hasValidStatus || !hasConfirmation) {
    return failIssue(
      "public-launch-confirmation-evidence",
      "Public launch confirmation audit",
      "The support bundle is missing valid public launch confirmation summary evidence.",
      "Export a support bundle v55 or newer so retained public launch confirmation events, Android publisher mode, audio route-match/latency source/tuning proof, text overlay proof, live caption proof, native caption overlay kind proof, semantic, eye-mouth, and horizontal-anchor avatar segment proof, same-run ingest timing proof, and native encoder backend proof are summarized."
    );
  }

  if (status === "cancelled") {
    return failIssue(
      "public-launch-confirmation-cancelled",
      "Public launch confirmation audit",
      "The latest public launch confirmation was cancelled by the operator.",
      "Run the public launch checklist again and accept the final confirmation only when the current target, dashboard, audio, avatar, chat, caption, and safety evidence is ready."
    );
  }

  return null;
};

const hasPublicLaunchConfirmationAuditEvidence = (message: string, expectedTargetPlatform: string | null): boolean => {
  const normalizedMessage = message.trim();
  return (
    hasPublicLaunchConfirmationTargetEvidence(normalizedMessage, expectedTargetPlatform) &&
    hasPublicLaunchConfirmationSafetyEvidence(normalizedMessage, expectedTargetPlatform) &&
    hasCleanPublicLaunchConfirmationChecklist(normalizedMessage)
  );
};

const hasPublicLaunchConfirmationTargetEvidence = (message: string, expectedTargetPlatform: string | null): boolean => {
  const match = /\bTarget:\s*([^,\n.;]+)/i.exec(message);
  const target = nonEmptyText(match?.[1]);
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
};

const hasPublicLaunchConfirmationSafetyEvidence = (message: string, expectedTargetPlatform: string | null): boolean => {
  const expectedTarget = normalizeTargetPlatformLabel(expectedTargetPlatform);
  const normalizedMessage = normalizeStatusLabel(message);
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
};

const hasCleanPublicLaunchConfirmationChecklist = (message: string): boolean =>
  /Checklist:\s*\d+\s+pass(?:es)?\s*\/\s*0\s+warn(?:ings)?\s*\/\s*0\s+fail(?:ures)?/i.test(message);

const hasPublicLaunchConfirmationTimestampEvidence = (
  lastAt: string,
  generatedAt: string,
  platformPublishingCheckedAt: unknown,
  validationEvidenceRunManifest: unknown,
  manifestScope: ExpectedManifestScope
): boolean => {
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
};

const latestInScopeValidationRunCreatedAtMs = (
  validationEvidenceRunManifest: unknown,
  manifestScope: ExpectedManifestScope
): number | null => {
  if (!Array.isArray(validationEvidenceRunManifest)) {
    return null;
  }
  const timestamps = validationEvidenceRunManifest
    .filter((run): run is ValidationEvidenceManifestRun => isManifestRunFreshInScope(run as ValidationEvidenceManifestRun, manifestScope))
    .map((run) => manifestRunCreatedAtMs(run))
    .filter(Number.isFinite);
  if (timestamps.length === 0) {
    return null;
  }
  return Math.max(...timestamps);
};

const createSceneFingerprintIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  if (bundle.app.bundleVersion < 53) {
    return null;
  }
  const summary = bundle.summary as Partial<SupportBundle["summary"]>;
  const scene = bundle.scene as Partial<SupportBundle["scene"]> | undefined;
  const summaryFingerprint = nonEmptyText(summary.sceneFingerprint);
  const sceneFingerprint = nonEmptyText(scene?.fingerprint);
  if (!summaryFingerprint || !sceneFingerprint) {
    return failIssue(
      "scene-fingerprint-missing",
      "Scene fingerprint",
      "Support bundle v55 is missing scene composition fingerprint evidence.",
      "Export a fresh support bundle from the exact scene/profile intended for release."
    );
  }
  if (summaryFingerprint !== sceneFingerprint) {
    return failIssue(
      "scene-fingerprint-mismatch",
      "Scene fingerprint",
      "Summary and scene fingerprint values do not match.",
      "Export a fresh support bundle without manually editing the JSON."
    );
  }
  return null;
};

const createNativeCaptionOverlaySummaryIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  const summary = bundle.summary as Partial<SupportBundle["summary"]>;
  if (isNonNegativeInteger(summary.nativeCompositionCaptionOverlayCount)) {
    return null;
  }

  return failIssue(
    "native-caption-overlay-summary-missing",
    "Native caption overlay evidence",
    "The support bundle is missing native caption overlay count summary evidence.",
    "Export a support bundle v55 or newer so subtitle and live-caption overlays are retained separately from generic text overlay proof."
  );
};

const createStreamSessionRecoveryEvidenceIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  const session = bundle.diagnostics?.session;
  if (!session) {
    return null;
  }

  const history = session.historySummary;
  const lastSummary = session.lastSummary;
  const totalFailureEvents = history?.totalFailureEvents ?? 0;
  const totalRecoveryEvents = history?.totalRecoveryEvents ?? 0;
  const lastFailureEvents = lastSummary?.failureCount ?? 0;
  const lastRecoveryEvents = lastSummary?.recoveryEventCount ?? 0;
  const lastOperationFailures = lastSummary?.operationFailureCount ?? 0;
  const lastPlatformApiFailures = lastSummary?.platformApiFailureCount ?? 0;
  const lastQualityUpdateFailures = lastSummary?.qualityUpdateFailureCount ?? 0;
  const lastChatReconnectFailures = lastSummary?.chatReconnectFailureCount ?? 0;
  const lastChatSpeechFailures = lastSummary?.chatSpeechFailureCount ?? 0;

  if (
    history?.stability === "unstable" ||
    (history?.failureCount ?? 0) > 0 ||
    totalFailureEvents > 0 ||
    lastSummary?.outcome === "fail" ||
    lastFailureEvents > 0 ||
    lastOperationFailures > 0 ||
    lastPlatformApiFailures > 0 ||
    lastQualityUpdateFailures > 0 ||
    lastChatReconnectFailures > 0 ||
    lastChatSpeechFailures > 0
  ) {
    return failIssue(
      "stream-session-recovery-evidence-failed",
      "Stream session recovery evidence",
      `Recent stream session evidence is not clean: history ${history?.stability ?? "unknown"}, ${history?.failureCount ?? 0} failed session(s), ${totalFailureEvents} failure event(s), last outcome ${lastSummary?.outcome ?? "-"}.`,
      "Repeat private RTMP(S) validation until the latest completed session has no failed operations, chat readout failures, quality-update failures, or failed recovery evidence."
    );
  }

  if (totalRecoveryEvents > 0 || lastRecoveryEvents > 0) {
    return failIssue(
      "stream-session-recovery-events-present",
      "Stream session recovery evidence",
      `Recent stream session evidence includes ${totalRecoveryEvents} recovery event(s); latest session includes ${lastRecoveryEvents}.`,
      "Repeat a clean private stream without automatic recovery before approving the build for platform-visible release."
    );
  }

  return null;
};

const createTextOverlayEvidenceIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  const summary = bundle.summary as Partial<SupportBundle["summary"]>;
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
    return failIssue(
      "text-overlay-evidence-missing",
      "Text overlay evidence",
      "The support bundle is missing text overlay launch evidence.",
      "Export a support bundle v55 or newer so visible manual text, subtitle, ticker, live-caption, native caption overlay kind proof, and avatar-overlap overlay evidence is summarized."
    );
  }

  if (status === "fail" || (summary.textOverlaySensitiveContentIssueCount ?? 0) > 0) {
    return failIssue(
      "text-overlay-evidence-failed",
      "Text overlay evidence",
      summary.textOverlaySummary || "Text overlay evidence failed.",
      summary.textOverlayRecommendation || "Resolve text overlay blockers and export a fresh support bundle."
    );
  }

  if ((summary.textOverlayVisibleSourceCount ?? 0) > 0 && (summary.textOverlayRenderVisibleSourceCount ?? 0) <= 0) {
    return failIssue(
      "text-overlay-evidence-incomplete",
      "Text overlay evidence",
      summary.textOverlaySummary || "Visible text overlays are missing program-output proof.",
      summary.textOverlayRecommendation || "Confirm visible text overlay output before approving release."
    );
  }

  if (
    status === "warn" ||
    (summary.textOverlayQueuedTimedManualSourceCount ?? 0) > 0 ||
    (summary.textOverlayExpiredTimedManualSourceCount ?? 0) > 0 ||
    (summary.textOverlayEmptyVisibleManualSourceCount ?? 0) > 0 ||
    (summary.textOverlayDominantBackdropIssueCount ?? 0) > 0 ||
    (summary.textOverlayLayoutRiskIssueCount ?? 0) > 0 ||
    (summary.textOverlaySafeAreaIssueCount ?? 0) > 0 ||
    (summary.textOverlayAvatarOverlapIssueCount ?? 0) > 0
  ) {
    return failIssue(
      "text-overlay-evidence-incomplete",
      "Text overlay evidence",
      summary.textOverlaySummary || "Text overlay evidence has warnings.",
      summary.textOverlayRecommendation || "Resolve text overlay readability, safe-area, empty-text, and avatar-overlap warnings before approving release."
    );
  }

  return null;
};

const createChatOverlayEvidenceIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  const summary = bundle.summary as Partial<SupportBundle["summary"]>;
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
    return failIssue(
      "chat-overlay-evidence-missing",
      "Chat overlay evidence",
      "The support bundle is missing chat overlay launch evidence.",
      "Export a support bundle v55 or newer so visible chat overlay transparency, URL redaction, layout, safe-area, and avatar-overlap evidence is summarized."
    );
  }

  if (status === "fail") {
    return failIssue(
      "chat-overlay-evidence-failed",
      "Chat overlay evidence",
      summary.chatOverlaySummary || "Chat overlay evidence failed.",
      summary.chatOverlayRecommendation || "Resolve chat overlay blockers and export a fresh support bundle."
    );
  }

  if (
    status === "warn" ||
    (summary.chatOverlayUrlRedactionDisabledCount ?? 0) > 0 ||
    (summary.chatOverlayOpaqueBackgroundIssueCount ?? 0) > 0 ||
    (summary.chatOverlayLayoutRiskIssueCount ?? 0) > 0 ||
    (summary.chatOverlaySafeAreaIssueCount ?? 0) > 0 ||
    (summary.chatOverlayAvatarOverlapIssueCount ?? 0) > 0
  ) {
    return failIssue(
      "chat-overlay-evidence-incomplete",
      "Chat overlay evidence",
      summary.chatOverlaySummary || "Chat overlay evidence has warnings.",
      summary.chatOverlayRecommendation || "Resolve chat overlay transparency, URL redaction, readability, safe-area, and avatar-overlap warnings before approving release."
    );
  }

  return null;
};

const createLiveCaptionEvidenceIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  const summary = bundle.summary as Partial<SupportBundle["summary"]>;
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
    return failIssue(
      "live-caption-evidence-missing",
      "Live caption evidence",
      "The support bundle is missing live caption launch evidence.",
      "Export a support bundle v55 or newer so live caption enablement, recognition state, source visibility, cue proof, and native caption overlay kind proof are summarized."
    );
  }

  if (status === "fail") {
    return failIssue(
      "live-caption-evidence-failed",
      "Live caption evidence",
      summary.liveCaptionSummary || "Live caption evidence failed.",
      summary.liveCaptionRecommendation || "Resolve live caption blockers and export a fresh support bundle."
    );
  }

  if (
    summary.liveCaptionEnabled &&
    (summary.liveCaptionRecognitionStatus !== "listening" ||
      (summary.liveCaptionVisibleRuntimeSourceCount ?? 0) <= 0 ||
      (summary.liveCaptionFinalCueCount ?? 0) <= 0 ||
      (summary.liveCaptionTranscriptCount ?? 0) <= 0)
  ) {
    return failIssue(
      "live-caption-evidence-incomplete",
      "Live caption evidence",
      summary.liveCaptionSummary || "Enabled live captions are missing final cue evidence.",
      summary.liveCaptionRecommendation || "Confirm visible final live-caption cue evidence before approving release."
    );
  }

  if (status === "warn") {
    return failIssue(
      "live-caption-evidence-incomplete",
      "Live caption evidence",
      summary.liveCaptionSummary || "Live caption evidence has warnings.",
      summary.liveCaptionRecommendation || "Confirm final live caption cue evidence before approving release."
    );
  }

  return null;
};

const createPlatformPublishingFreshnessIssue = (bundle: SupportBundle, now: Date): CommercialReleaseGateIssue | null => {
  const status = bundle.summary.platformPublishingFreshnessStatus;
  if (status === "fresh") {
    const ageMinutes = bundle.summary.platformPublishingFreshnessAgeMinutes;
    if (
      hasPlatformPublishingFreshnessTimestampProof(
        bundle.generatedAt,
        bundle.summary.platformPublishingFreshnessCheckedAt,
        ageMinutes,
        now
      )
    ) {
      return null;
    }
    return failIssue(
      "platform-publishing-freshness",
      "Platform publishing freshness",
      bundle.summary.platformPublishingFreshnessSummary ||
        `Platform publishing freshness is marked fresh without valid checked-at and <=${platformPublishingDashboardMaxAgeMinutes}m age evidence.`,
      bundle.summary.platformPublishingFreshnessRecommendation ||
        "Refresh YouTube Live or Twitch publishing status immediately before commercial release approval."
    );
  }

  if (status === "not-applicable") {
    if (isFirstPartyPublishingDestination(bundle)) {
      return failIssue(
        "platform-publishing-freshness",
        "Platform publishing freshness",
        bundle.summary.platformPublishingFreshnessSummary ||
          "YouTube/Twitch publishing freshness cannot be marked not-applicable for a platform-visible destination.",
        bundle.summary.platformPublishingFreshnessRecommendation ||
          "Refresh YouTube Live or Twitch publishing status immediately before commercial release approval."
      );
    }
    return null;
  }

  return failIssue(
    "platform-publishing-freshness",
    "Platform publishing freshness",
    bundle.summary.platformPublishingFreshnessSummary || `Platform publishing freshness is ${status || "missing"}.`,
    bundle.summary.platformPublishingFreshnessRecommendation ||
      "Refresh YouTube Live or Twitch publishing status immediately before commercial release approval."
  );
};

const platformPublishingFreshnessFutureSkewToleranceMs = 2 * 60 * 1000;

const hasPlatformPublishingFreshnessTimestampProof = (
  generatedAt: string,
  checkedAt: unknown,
  ageMinutes: unknown,
  now: Date
): boolean => {
  const generatedAtMs = Date.parse(generatedAt);
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
  const observedAgeMinutes = Math.floor(Math.max(0, generatedAtMs - checkedAtMs) / 60_000);
  return (
    typeof ageMinutes === "number" &&
    Number.isInteger(ageMinutes) &&
    ageMinutes >= 0 &&
    ageMinutes <= platformPublishingDashboardMaxAgeMinutes &&
    Math.abs(observedAgeMinutes - ageMinutes) <= 1
  );
};

const createValidationIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  if (bundle.summary.validationStatus !== "ready" || bundle.summary.validationFailCount > 0) {
    return failIssue(
      "commercial-validation-not-ready",
      "Commercial validation",
      `Commercial validation is ${bundle.summary.validationStatus} with ${bundle.summary.validationFailCount} failure(s).`,
      "Complete the commercial validation checklist on the release candidate build."
    );
  }
  if (bundle.summary.validationWarningCount > 0 || bundle.summary.validationPendingCount > 0) {
    return failIssue(
      "commercial-validation-incomplete",
      "Commercial validation",
      `${bundle.summary.validationWarningCount} warning(s) and ${bundle.summary.validationPendingCount} pending validation item(s) remain.`,
      "Resolve every commercial validation warning and pending item before release approval."
    );
  }
  return null;
};

const createValidationRunbookIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  if (bundle.summary.validationRunbookStatus !== "complete") {
    return failIssue(
      "validation-runbook-incomplete",
      "Private validation runbook",
      `Private validation runbook is ${bundle.summary.validationRunbookStatus}.`,
      bundle.summary.validationRunbookNextAction || "Complete the private RTMP(S) validation runbook."
    );
  }
  return null;
};

const createRehearsalIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  const rehearsalScore = bundle.summary.rehearsalScore;
  if (
    bundle.summary.rehearsalStatus !== "ready" ||
    !bundle.summary.rehearsalCanPromoteToPublic ||
    bundle.summary.rehearsalFailCount > 0 ||
    bundle.summary.rehearsalPendingCount > 0
  ) {
    return failIssue(
      "stream-rehearsal-not-ready",
      "Launch rehearsal",
      bundle.summary.rehearsalSummary ||
        `Launch rehearsal is ${bundle.summary.rehearsalStatus || "missing"} with ${bundle.summary.rehearsalFailCount ?? 0} failure(s) and ${bundle.summary.rehearsalPendingCount ?? 0} pending check(s).`,
      bundle.summary.rehearsalPrimaryAction || "Run and archive a passing private rehearsal before commercial release approval."
    );
  }
  if (typeof rehearsalScore === "number" && Number.isFinite(rehearsalScore) && rehearsalScore < 95) {
    return failIssue(
      "stream-rehearsal-score-low",
      "Launch rehearsal",
      `Launch rehearsal score is ${rehearsalScore}/100 grade ${bundle.summary.rehearsalGrade ?? "-"}.`,
      bundle.summary.rehearsalPrimaryAction || "Repeat the private rehearsal until the pre-launch score is A."
    );
  }
  if (bundle.summary.rehearsalWarningCount > 0) {
    return failIssue(
      "stream-rehearsal-incomplete",
      "Launch rehearsal",
      bundle.summary.rehearsalSummary,
      bundle.summary.rehearsalPrimaryAction || "Resolve rehearsal warnings before approving release."
    );
  }
  return null;
};

const createValidationEvidenceIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  if (bundle.summary.validationEvidenceStatus !== "ready") {
    return failIssue(
      "validation-evidence-not-ready",
      "Physical validation evidence",
      `Physical validation evidence is ${bundle.summary.validationEvidenceStatus}.`,
      "Retain fresh passing iOS and Android private RTMP(S) validation runs for this build."
    );
  }
  if (!nonEmptyText(bundle.summary.validationEvidenceFingerprint) || !nonEmptyText(bundle.summary.validationEvidenceLatestRunFingerprint)) {
    return failIssue(
      "validation-evidence-fingerprint-missing",
      "Physical validation evidence",
      "Validation evidence fingerprints are missing.",
      "Export a fresh support bundle after recording release-candidate validation evidence."
    );
  }
  return null;
};

const createValidationEvidenceCoverageIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  if (
    !bundle.summary.validationEvidenceIosPass ||
    !bundle.summary.validationEvidenceAndroidPass ||
    !bundle.summary.validationEvidencePhysicalDeviceIosPass ||
    !bundle.summary.validationEvidencePhysicalDeviceAndroidPass ||
    bundle.summary.validationEvidenceAppBuildMismatch ||
    !nonEmptyText(bundle.summary.validationEvidenceConsistentAppBuild)
  ) {
    return failIssue(
      "validation-evidence-coverage",
      "Physical validation coverage",
      `Coverage iOS ${bundle.summary.validationEvidenceIosPass ? "pass" : "missing"} / Android ${
        bundle.summary.validationEvidenceAndroidPass ? "pass" : "missing"
      } / physical iOS ${bundle.summary.validationEvidencePhysicalDeviceIosPass ? "pass" : "missing"} / Android ${
        bundle.summary.validationEvidencePhysicalDeviceAndroidPass ? "pass" : "missing"
      } / build ${bundle.summary.validationEvidenceConsistentAppBuild ?? (bundle.summary.validationEvidenceAppBuildMismatch ? "mismatch" : "-")}.`,
      "Record fresh passing physical-device iOS and Android validation runs on the same release-candidate app build."
    );
  }
  return null;
};

const createValidationEvidenceManifestIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  const manifest = bundle.summary.validationEvidenceRunManifest;
  if (!Array.isArray(manifest) || manifest.length === 0) {
    return failIssue(
      "validation-evidence-manifest-missing",
      "Validation evidence manifest",
      "The retained validation run manifest is missing.",
      "Export a support bundle v55 or newer after retaining release-candidate validation runs."
    );
  }
  const manifestScope = createExpectedManifestScope(bundle);
  const destinationScopeMismatchCount = manifest.filter(
    (run) => isManifestRunFreshAndScopeClaimed(run) && !isManifestRunDestinationScopePass(run, manifestScope)
  ).length;
  if (destinationScopeMismatchCount > 0) {
    return failIssue(
      "validation-evidence-manifest-scope",
      "Validation evidence manifest",
      `${destinationScopeMismatchCount} fresh manifest run(s) marked in-scope do not match the current destination scope ${formatManifestScope(manifestScope)}.`,
      "Record and retain iOS and Android validation runs against the exact current destination and RTMP(S) transport before release approval."
    );
  }
  const latestRuns = latestEligibleManifestRunsByPlatform(manifest, manifestScope);
  if (!isManifestPhysicalRunPass(latestRuns.get("ios")) || !isManifestPhysicalRunPass(latestRuns.get("android"))) {
    return failIssue(
      "validation-evidence-manifest-incomplete",
      "Validation evidence manifest",
      "The manifest does not include fresh in-scope passing physical-device iOS and Android runs.",
      "Record and retain passing physical-device validation runs for both iOS and Android on the current build."
    );
  }
  if (latestRuns.get("android")?.androidPublisherMode !== "mediacodec") {
    return failIssue(
      "validation-evidence-manifest-android-publisher-mode",
      "Validation evidence manifest",
      `The latest Android validation manifest row used ${latestRuns.get("android")?.androidPublisherMode || "missing"} publisher mode.`,
      "Repeat Android physical validation with direct MediaCodec selected, then export a support bundle v55 or newer."
    );
  }
  if (manifest.length !== bundle.summary.validationEvidenceRunCount) {
    return failIssue(
      "validation-evidence-manifest-count-mismatch",
      "Validation evidence manifest",
      `Manifest has ${manifest.length} run(s), but the summary reports ${bundle.summary.validationEvidenceRunCount}.`,
      "Export a fresh support bundle so retained run counts and manifest rows match."
    );
  }
  return null;
};

const createValidationEvidenceSceneManifestIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  if (bundle.app.bundleVersion < 54) {
    return null;
  }
  const sceneFingerprint = nonEmptyText(bundle.summary.sceneFingerprint) ?? nonEmptyText(bundle.scene?.fingerprint);
  if (!sceneFingerprint) {
    return null;
  }
  const manifest = bundle.summary.validationEvidenceRunManifest;
  if (!Array.isArray(manifest) || manifest.length === 0) {
    return null;
  }
  const mismatchedRuns = manifest.filter(
    (run) => isManifestRunFreshAndScopeClaimed(run) && nonEmptyText(run.sceneFingerprint) !== sceneFingerprint
  );
  if (mismatchedRuns.length === 0) {
    return null;
  }
  return failIssue(
    "validation-evidence-manifest-scene-fingerprint",
    "Validation evidence manifest",
    `${mismatchedRuns.length} fresh retained validation run(s) do not match the current scene fingerprint ${sceneFingerprint}.`,
    "Record fresh iOS and Android validation runs from the exact scene composition intended for release, then export a v55 support bundle."
  );
};

const createValidationEvidenceManifestIntegrityIssue = (bundle: SupportBundle, now: Date): CommercialReleaseGateIssue | null => {
  const manifest = bundle.summary.validationEvidenceRunManifest;
  if (!Array.isArray(manifest) || manifest.length === 0) {
    return null;
  }

  const summary = bundle.summary;
  const mismatches: string[] = [];
  const manifestScope = createExpectedManifestScope(bundle);
  const latestRuns = latestEligibleManifestRunsByPlatform(manifest, manifestScope);
  const iosRun = latestRuns.get("ios");
  const androidRun = latestRuns.get("android");
  const derivedEligibleRunCount = manifest.filter((run) => isManifestRunFreshInScope(run, manifestScope)).length;
  const derivedStaleRunCount = manifest.filter((run) => run.fresh !== true).length;
  const bundleGeneratedAtMs = Date.parse(bundle.generatedAt);
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

  if (derivedEligibleRunCount !== summary.validationEvidenceEligibleRunCount) {
    mismatches.push(
      `eligible run count summary=${summary.validationEvidenceEligibleRunCount} manifest=${derivedEligibleRunCount}`
    );
  }
  if (derivedStaleRunCount !== summary.validationEvidenceStaleRunCount) {
    mismatches.push(`stale run count summary=${summary.validationEvidenceStaleRunCount} manifest=${derivedStaleRunCount}`);
  }

  const eligibilityFlagMismatchCount = manifest.filter((run) => run.eligible !== isManifestRunFreshInScope(run, manifestScope)).length;
  if (eligibilityFlagMismatchCount > 0) {
    mismatches.push(`${eligibilityFlagMismatchCount} manifest eligible flag(s) do not match fresh destination/protocol/scene scope state`);
  }

  const expectedBuild = nonEmptyText(summary.validationEvidenceConsistentAppBuild);
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
  if (!summary.validationEvidenceAppBuildMismatch && manifestBuildMismatch) {
    mismatches.push(`summary reports same build but manifest latest iOS/Android builds are ${iosRun?.appBuild} / ${androidRun?.appBuild}`);
  }

  const expectedNativeOverlays = nativeCompositionOverlayProofRequirements(summary);
  const expectedYouTubePublishing = youtubePublishingProofRequirements(bundle);
  const expectedTwitchPublishing = twitchPublishingProofRequirements(bundle);
  const claimChecks: Array<[boolean, string, boolean]> = [
    [summary.validationEvidenceIosPass, "iOS validation pass", isManifestRunPass(iosRun)],
    [summary.validationEvidenceAndroidPass, "Android validation pass", isManifestRunPass(androidRun)],
    [summary.validationEvidencePhysicalDeviceIosPass, "iOS physical-device proof", isManifestPhysicalRunPass(iosRun)],
    [summary.validationEvidencePhysicalDeviceAndroidPass, "Android physical-device proof", isManifestPhysicalRunPass(androidRun)],
    [summary.validationEvidenceNativeRuntimeIosPass, "iOS native runtime proof", isManifestNativeRuntimePass(iosRun, expectedNativeOverlays)],
    [
      summary.validationEvidenceNativeRuntimeAndroidPass,
      "Android native runtime proof",
      isManifestNativeRuntimePass(androidRun, expectedNativeOverlays)
    ],
    [summary.validationEvidenceMonitorHoldIosPass, "iOS stable monitor-hold proof", isManifestMonitorHoldPass(iosRun)],
    [
      summary.validationEvidenceMonitorHoldAndroidPass,
      "Android stable monitor-hold proof",
      isManifestMonitorHoldPass(androidRun)
    ],
    [summary.validationEvidenceFaceTrackingIosPass, "iOS avatar-motion proof", isManifestAvatarMotionPass(iosRun)],
    [
      summary.validationEvidenceFaceTrackingAndroidPass,
      "Android avatar-motion proof",
      isManifestAvatarMotionPass(androidRun)
    ],
    [summary.validationEvidenceAudioIosPass, "iOS mic/headphone proof", isManifestAudioPass(iosRun)],
    [summary.validationEvidenceAudioAndroidPass, "Android mic/headphone proof", isManifestAudioPass(androidRun)],
    [summary.validationEvidenceChatReadoutIosPass, "iOS spoken chat-readout proof", isManifestChatReadoutPass(iosRun)],
    [
      summary.validationEvidenceChatReadoutAndroidPass,
      "Android spoken chat-readout proof",
      isManifestChatReadoutPass(androidRun)
    ],
    [
      summary.validationEvidencePlatformPublishingIosPass,
      "iOS platform dashboard proof",
      isManifestPlatformPublishingPass(iosRun, expectedYouTubePublishing, expectedTwitchPublishing)
    ],
    [
      summary.validationEvidencePlatformPublishingAndroidPass,
      "Android platform dashboard proof",
      isManifestPlatformPublishingPass(androidRun, expectedYouTubePublishing, expectedTwitchPublishing)
    ],
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
    if (claimed && !backedByManifest) {
      mismatches.push(`${label} is claimed by summary but not backed by the latest manifest row`);
    }
  }

  if (mismatches.length === 0) {
    return null;
  }

  const detail = mismatches.slice(0, 4).join("; ");
  return failIssue(
    "validation-evidence-manifest-integrity",
    "Validation evidence manifest",
    `${detail}${mismatches.length > 4 ? `; ${mismatches.length - 4} more mismatch(es)` : ""}.`,
    "Export a fresh support bundle from the release-candidate build so summary validation claims are regenerated from the retained-run manifest."
  );
};

const createValidationEvidenceFeatureIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  const { ios: platformIngestIosPass, android: platformIngestAndroidPass } =
    getValidationEvidencePlatformIngestPasses(bundle);
  const missing = [
    !bundle.summary.validationEvidencePhysicalDeviceIosPass || !bundle.summary.validationEvidencePhysicalDeviceAndroidPass
      ? "physical device identity"
      : "",
    !bundle.summary.validationEvidenceNativeRuntimeIosPass || !bundle.summary.validationEvidenceNativeRuntimeAndroidPass
      ? "native publisher/compositor overlay proof"
      : "",
    !bundle.summary.validationEvidenceMonitorHoldIosPass || !bundle.summary.validationEvidenceMonitorHoldAndroidPass
      ? "stable monitor hold"
      : "",
    !bundle.summary.validationEvidenceFaceTrackingIosPass || !bundle.summary.validationEvidenceFaceTrackingAndroidPass
      ? "avatar motion"
      : "",
    !bundle.summary.validationEvidenceAudioIosPass || !bundle.summary.validationEvidenceAudioAndroidPass
      ? "mic FX/headphone monitor"
      : "",
    !bundle.summary.validationEvidenceChatReadoutIosPass || !bundle.summary.validationEvidenceChatReadoutAndroidPass
      ? "chat readout"
      : "",
    !bundle.summary.validationEvidencePlatformPublishingIosPass || !bundle.summary.validationEvidencePlatformPublishingAndroidPass
      ? "platform dashboard"
      : "",
    !platformIngestIosPass || !platformIngestAndroidPass
      ? "same-run platform ingest"
      : ""
  ].filter(Boolean);
  if (missing.length === 0) {
    return null;
  }
  return failIssue(
    "validation-evidence-feature-gap",
    "Physical validation feature proof",
    `Missing passing evidence for ${missing.join(", ")}.`,
    "Repeat private validation until both iOS and Android runs include all release-candidate feature proof."
  );
};

const createValidationEvidenceQualityAutomationIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  const { ios, android } = getValidationEvidenceQualityAutomationPasses(bundle);
  if (ios && android) {
    return null;
  }
  return failIssue(
    "validation-evidence-quality-automation-gap",
    "Weak-network quality automation proof",
    `Missing passing controlled weak-network quality automation evidence for ${[!ios ? "iOS" : "", !android ? "Android" : ""].filter(Boolean).join(" and ")}.`,
    "Repeat controlled weak-network private validation on both iOS and Android until each retained run proves a live quality update or next-start fallback with zero update failures."
  );
};

const getValidationEvidenceQualityAutomationPasses = (bundle: SupportBundle): { ios: boolean; android: boolean } => {
  const manifest = bundle.summary.validationEvidenceRunManifest;
  const latestRuns = Array.isArray(manifest)
    ? latestEligibleManifestRunsByPlatform(manifest, createExpectedManifestScope(bundle))
    : new Map<string, ValidationEvidenceManifestRun>();
  return {
    ios: isManifestQualityAutomationPass(latestRuns.get("ios")),
    android: isManifestQualityAutomationPass(latestRuns.get("android"))
  };
};

const getValidationEvidencePlatformIngestPasses = (bundle: SupportBundle): { ios: boolean; android: boolean } => {
  const manifest = bundle.summary.validationEvidenceRunManifest;
  const latestRuns = Array.isArray(manifest)
    ? latestEligibleManifestRunsByPlatform(manifest, createExpectedManifestScope(bundle))
    : new Map<string, ValidationEvidenceManifestRun>();
  const expectedNativeOverlays = nativeCompositionOverlayProofRequirements(bundle.summary);
  const expectedYouTubePublishing = youtubePublishingProofRequirements(bundle);
  const expectedTwitchPublishing = twitchPublishingProofRequirements(bundle);
  return {
    ios: resolveValidationEvidencePlatformIngestPass(
      bundle.summary.validationEvidencePlatformIngestIosPass,
      latestRuns.get("ios"),
      expectedNativeOverlays,
      expectedYouTubePublishing,
      expectedTwitchPublishing
    ),
    android: resolveValidationEvidencePlatformIngestPass(
      bundle.summary.validationEvidencePlatformIngestAndroidPass,
      latestRuns.get("android"),
      expectedNativeOverlays,
      expectedYouTubePublishing,
      expectedTwitchPublishing
    )
  };
};

const resolveValidationEvidencePlatformIngestPass = (
  summaryValue: unknown,
  manifestRun: ValidationEvidenceManifestRun | undefined,
  expectedNativeOverlays: NativeOverlayProofRequirements = emptyNativeOverlayProofRequirements,
  expectedYouTubePublishing: YouTubePublishingProofRequirements = emptyYouTubePublishingProofRequirements,
  expectedTwitchPublishing: TwitchPublishingProofRequirements = emptyTwitchPublishingProofRequirements
): boolean =>
  typeof summaryValue === "boolean"
    ? summaryValue
    : isManifestPlatformIngestPass(manifestRun, expectedNativeOverlays, expectedYouTubePublishing, expectedTwitchPublishing);

const createRetainedStaleEvidenceIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  if (bundle.summary.validationEvidenceStaleRunCount <= 0) {
    return null;
  }
  return failIssue(
    "validation-evidence-stale-retained-runs",
    "Physical validation evidence",
    `${bundle.summary.validationEvidenceStaleRunCount} stale retained validation run(s) remain in the bundle.`,
    "Clear old retained validation evidence and export a fresh support bundle before release approval."
  );
};

const createGateSummary = (
  canRelease: boolean,
  counts: { warningCount: number; failureCount: number }
): string => {
  if (canRelease) {
    return "Commercial release gate is ready.";
  }
  if (counts.failureCount > 0) {
    return `${counts.failureCount} commercial release blocker${counts.failureCount === 1 ? "" : "s"} remain.`;
  }
  return `${counts.warningCount} commercial release warning${counts.warningCount === 1 ? "" : "s"} require resolution.`;
};

const createPrimaryAction = (canRelease: boolean, issues: CommercialReleaseGateIssue[]): string => {
  if (canRelease) {
    return "Archive this support bundle with the release-candidate build before publishing.";
  }
  return issues.find((issue) => issue.severity === "fail")?.action ?? issues[0]?.action ?? "Resolve release warnings before publishing.";
};

const failIssue = (
  code: string,
  label: string,
  detail: string,
  action: string
): CommercialReleaseGateIssue => ({
  code,
  severity: "fail",
  label,
  detail,
  action
});

const ageInHours = (createdAt: string, now: Date): number | null => {
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  const ageMs = now.getTime() - timestamp;
  if (ageMs < 0) {
    return null;
  }
  return Math.floor(ageMs / 3_600_000);
};

const nonEmptyText = (value: string | null | undefined): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isFirstPartyPublishingDestination = (bundle: SupportBundle): boolean =>
  bundle.profile?.destination?.platform === "youtube-live" || bundle.profile?.destination?.platform === "twitch";

const isDiagnosticStatus = (value: unknown): value is "pass" | "warn" | "fail" | "info" =>
  value === "pass" || value === "warn" || value === "fail" || value === "info";

type ValidationEvidenceManifestRun = SupportBundle["summary"]["validationEvidenceRunManifest"][number];

interface ExpectedManifestScope {
  targetPlatform: string | null;
  transport: string | null;
  sceneFingerprint: string | null;
}

const latestEligibleManifestRunsByPlatform = (
  manifest: ValidationEvidenceManifestRun[],
  manifestScope: ExpectedManifestScope = emptyExpectedManifestScope
): Map<ValidationEvidenceManifestRun["devicePlatform"], ValidationEvidenceManifestRun> => {
  const runsByPlatform = new Map<ValidationEvidenceManifestRun["devicePlatform"], ValidationEvidenceManifestRun>();
  const sortedRuns = [...manifest]
    .filter((run) => isManifestRunFreshInScope(run, manifestScope))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  for (const run of sortedRuns) {
    if (runsByPlatform.has(run.devicePlatform)) {
      continue;
    }
    runsByPlatform.set(run.devicePlatform, run);
  }
  return runsByPlatform;
};

const emptyExpectedManifestScope: ExpectedManifestScope = {
  targetPlatform: null,
  transport: null,
  sceneFingerprint: null
};

const createExpectedManifestScope = (bundle: SupportBundle): ExpectedManifestScope => ({
  targetPlatform: expectedTargetPlatformForBundle(bundle),
  transport: expectedTransportForBundle(bundle),
  sceneFingerprint: nonEmptyText(bundle.summary?.sceneFingerprint) ?? nonEmptyText(bundle.scene?.fingerprint)
});

const expectedTargetPlatformForBundle = (bundle: SupportBundle): string | null => {
  const platform = bundle.profile?.destination?.platform;
  if (typeof platform !== "string") {
    return null;
  }
  return destinationTargetPlatformLabels[platform as keyof typeof destinationTargetPlatformLabels] ?? null;
};

const expectedTransportForBundle = (bundle: SupportBundle): string | null => {
  const protocol = bundle.profile?.destination?.protocol;
  const transport = normalizeTransportLabel(protocol);
  return transport || null;
};

const isManifestRunFreshAndScopeClaimed = (run: ValidationEvidenceManifestRun): boolean =>
  run.fresh === true && run.matchesScope === true && Number.isFinite(Date.parse(run.createdAt));

const manifestRunCreatedAtMs = (run: ValidationEvidenceManifestRun): number => Date.parse(String(run.createdAt));

const isManifestRunFreshInScope = (
  run: ValidationEvidenceManifestRun,
  manifestScope: ExpectedManifestScope = emptyExpectedManifestScope
): boolean => isManifestRunFreshAndScopeClaimed(run) && isManifestRunDestinationScopePass(run, manifestScope);

const isManifestRunDestinationScopePass = (
  run: ValidationEvidenceManifestRun,
  { targetPlatform, transport, sceneFingerprint }: ExpectedManifestScope
): boolean => {
  const expectedTarget = normalizeTargetPlatformLabel(targetPlatform);
  if (expectedTarget && normalizeTargetPlatformLabel(run.targetPlatform) !== expectedTarget) {
    return false;
  }
  const expectedTransport = normalizeTransportLabel(transport);
  if (expectedTransport && normalizeTransportLabel(run.transport) !== expectedTransport) {
    return false;
  }
  const expectedSceneFingerprint = nonEmptyText(sceneFingerprint);
  if (expectedSceneFingerprint && nonEmptyText(run.sceneFingerprint) !== expectedSceneFingerprint) {
    return false;
  }
  return true;
};

const formatManifestScope = ({ targetPlatform, transport, sceneFingerprint }: ExpectedManifestScope): string =>
  `${targetPlatform ?? "unknown target"}/${transport ?? "unknown transport"}/${sceneFingerprint ?? "unknown scene"}`;

const normalizeTargetPlatformLabel = (value: unknown): string => (typeof value === "string" ? value.trim().toLowerCase() : "");

const normalizeTransportLabel = (value: unknown): string => (typeof value === "string" ? value.trim().toUpperCase() : "");

const isManifestRunPass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  run?.result === "pass";

const isManifestPhysicalRunPass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isManifestRunPass(run) && run?.physicalDevice === true && run.physicalDeviceStatus === "pass";

const isManifestFeaturePass = (status: string | null | undefined): boolean => status === "pass";

const isManifestNativeRuntimePass = (
  run: ValidationEvidenceManifestRun | undefined,
  expectedNativeOverlays: NativeOverlayProofRequirements = emptyNativeOverlayProofRequirements
): boolean =>
  isManifestFeaturePass(run?.nativeRuntimeStatus) &&
  run?.nativeRuntimePlatform === run?.devicePlatform &&
  isPositiveFiniteNumber(run?.nativeRuntimeSentVideoFrames) &&
  isPositiveFiniteNumber(run?.nativeRuntimeSentAudioFrames) &&
  isPositiveFiniteNumber(run?.nativeRuntimeBytesWritten) &&
  isProductionNativeVideoEncoderBackend(run?.devicePlatform, run?.nativeRuntimeVideoEncoderBackend) &&
  isProductionNativeAudioEncoderBackend(run?.devicePlatform, run?.nativeRuntimeAudioEncoderBackend) &&
  hasManifestNativePublisherBackpressureProof(run) &&
  hasManifestNativePublisherDropProof(run) &&
  hasManifestNativeRuntimeVideoFrameIntervalProof(run) &&
  hasManifestLiveRenderGraphUpdateProof(run) &&
  hasManifestNativeCompositorDropProof(run) &&
  hasManifestAndroidMediaCodecCompositorProof(run) &&
  hasManifestIosReplayKitCompositorProof(run) &&
  (run?.nativeRuntimeCompositionStatus === "applied" || run?.nativeRuntimeCompositionStatus === "screen-only") &&
  hasManifestNativeOverlayProof(run, expectedNativeOverlays) &&
  hasManifestStillImageOverlayProof(run) &&
  hasManifestIosAppGroupStillImageProof(run) &&
  hasManifestLive2DPoseProof(run) &&
  hasManifestVrmReleaseProof(run);

const hasManifestNativeRuntimeVideoFrameIntervalProof = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isPositiveFiniteNumber(run?.nativeRuntimeVideoFrameIntervalSampleCount) &&
  isPositiveFiniteNumber(run?.nativeRuntimeVideoFrameIntervalAverageMs) &&
  isPositiveFiniteNumber(run?.nativeRuntimeVideoFrameIntervalMaxMs) &&
  isNonNegativeFiniteNumber(run?.nativeRuntimeVideoFrameIntervalJitterMs);

const hasManifestNativePublisherBackpressureProof = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  run?.nativeRuntimeCongested === false &&
  isZeroFiniteNumber(run?.nativeRuntimeQueuedItems) &&
  isNonNegativeFiniteNumber(run?.nativeRuntimeCacheSize);

const hasManifestNativePublisherDropProof = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isZeroFiniteNumber(run?.nativeRuntimeDroppedVideoFrames) &&
  isZeroFiniteNumber(run?.nativeRuntimeDroppedAudioFrames);

const hasManifestLiveRenderGraphUpdateProof = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isNonNegativeFiniteNumber(run?.nativeRuntimeLiveRenderGraphReloadCount) &&
  isZeroFiniteNumber(run?.nativeRuntimeLiveRenderGraphRejectedUpdateCount);

const hasManifestNativeCompositorDropProof = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isZeroFiniteNumber(run?.nativeRuntimeDroppedFrameCount);

const hasManifestAndroidMediaCodecCompositorProof = (run: ValidationEvidenceManifestRun | undefined): boolean => {
  if (
    run?.devicePlatform !== "android" ||
    !isProductionNativeVideoEncoderBackend(run.devicePlatform, run.nativeRuntimeVideoEncoderBackend)
  ) {
    return true;
  }

  return (
    run.nativeRuntimeCompositorBackend === "android-canvas-mediacodec" &&
    isPositiveFiniteNumber(run.nativeRuntimeCompositedFrameCount) &&
    isZeroFiniteNumber(run.nativeRuntimeCompositionFailureCount)
  );
};

const hasManifestIosReplayKitCompositorProof = (run: ValidationEvidenceManifestRun | undefined): boolean => {
  if (run?.devicePlatform !== "ios" || !isPositiveFiniteNumber(run.nativeRuntimeCompositionAppliedCount)) {
    return true;
  }

  return (
    run.nativeRuntimeCompositorBackend === "ios-replaykit-coregraphics" &&
    isPositiveFiniteNumber(run.nativeRuntimeCompositedFrameCount) &&
    isZeroFiniteNumber(run.nativeRuntimeCompositionFailureCount)
  );
};

const isManifestMonitorHoldPass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isManifestFeaturePass(run?.monitorHoldStatus) &&
  isAtLeastFiniteNumber(run?.monitorHoldSampleCount, minimumValidationMonitorSampleCount) &&
  isAtLeastFiniteNumber(run?.monitorHoldDurationSeconds, minimumValidationMonitorDurationSeconds) &&
  run?.monitorHoldStability === "stable" &&
  hasManifestMonitorHoldMediaTelemetryProof(run) &&
  hasZeroManifestMonitorHoldInstability(run);

const hasManifestMonitorHoldMediaTelemetryProof = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isPositiveFiniteNumber(run?.monitorHoldAverageBitrateKbps) &&
  isPositiveFiniteNumber(run?.monitorHoldMinimumBitrateKbps) &&
  isPositiveFiniteNumber(run?.monitorHoldAverageFps) &&
  isPositiveFiniteNumber(run?.monitorHoldMinimumFps);

const hasZeroManifestMonitorHoldInstability = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isZeroFiniteNumber(run?.monitorHoldDroppedFrameIncrease) && isZeroFiniteNumber(run?.monitorHoldObservedReconnectAttempts);

const isPositiveFiniteNumber = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const isNonNegativeFiniteNumber = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isAtLeastFiniteNumber = (value: unknown, minimum: number): boolean =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum;

const isAtMostFiniteNumber = (value: unknown, maximum: number): boolean =>
  typeof value === "number" && Number.isFinite(value) && value <= maximum;

const isZeroFiniteNumber = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value) && value === 0;

interface NativeOverlayProofRequirements {
  total: number;
  text: number;
  caption: number;
  chat: number;
}

const emptyNativeOverlayProofRequirements: NativeOverlayProofRequirements = { total: 0, text: 0, caption: 0, chat: 0 };

interface YouTubePublishingProofRequirements {
  boundStreamId: string | null;
  broadcastPrivacyStatus: string | null;
}

interface TwitchPublishingProofRequirements {
  titleLength: number | null;
  category: string | null;
  categoryId: string | null;
  language: string | null;
}

const emptyYouTubePublishingProofRequirements: YouTubePublishingProofRequirements = {
  boundStreamId: null,
  broadcastPrivacyStatus: null
};

const emptyTwitchPublishingProofRequirements: TwitchPublishingProofRequirements = {
  titleLength: null,
  category: null,
  categoryId: null,
  language: null
};

const nativeCompositionOverlayProofRequirements = (summary: SupportBundle["summary"]): NativeOverlayProofRequirements => ({
  total: nonNegativeSummaryCount(summary.nativeCompositionNativeOverlayCount),
  text: nonNegativeSummaryCount(summary.nativeCompositionTextOverlayCount),
  caption: nonNegativeSummaryCount(summary.nativeCompositionCaptionOverlayCount),
  chat: nonNegativeSummaryCount(summary.nativeCompositionChatOverlayCount)
});

const youtubePublishingProofRequirements = (bundle: SupportBundle): YouTubePublishingProofRequirements => ({
  boundStreamId: nonEmptyText(bundle.profile?.platformPublishing?.youtubeBroadcastBoundStreamId),
  broadcastPrivacyStatus: nonEmptyText(bundle.profile?.platformPublishing?.privacyStatus)
});

const twitchPublishingProofRequirements = (bundle: SupportBundle): TwitchPublishingProofRequirements => ({
  titleLength: positiveIntegerOrNull(bundle.profile?.platformPublishing?.titleLength),
  category: nonEmptyText(bundle.profile?.platformPublishing?.twitchCategory),
  categoryId: nonEmptyText(bundle.profile?.platformPublishing?.twitchCategoryId),
  language: nonEmptyText(bundle.profile?.platformPublishing?.twitchLanguage)
});

const nonNegativeSummaryCount = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

const positiveIntegerOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;

const hasManifestNativeOverlayProof = (
  run: ValidationEvidenceManifestRun | undefined,
  expectedNativeOverlays: NativeOverlayProofRequirements
): boolean => {
  if (!isPositiveFiniteNumber(expectedNativeOverlays.total)) {
    return true;
  }

  const appliedKinds = run?.nativeRuntimeCompositionAppliedKinds ?? [];
  const appliedCaptionOverlayCount = countKind(appliedKinds, "caption");
  const appliedTextOverlayCount = countKind(appliedKinds, "text") + appliedCaptionOverlayCount;
  return (
    run?.nativeRuntimeCompositionStatus === "applied" &&
    isAtLeastFiniteNumber(run.nativeRuntimeCompositionAppliedCount, expectedNativeOverlays.total) &&
    appliedTextOverlayCount >= expectedNativeOverlays.text &&
    appliedCaptionOverlayCount >= expectedNativeOverlays.caption &&
    countKind(appliedKinds, "chat") >= expectedNativeOverlays.chat &&
    isZeroFiniteNumber(run.nativeRuntimeCompositionSkippedCount)
  );
};

const countKind = (kinds: string[], expectedKind: string): number =>
  kinds.filter((kind) => kind === expectedKind).length;

const hasZeroManifestNativeRuntimeMissingAssets = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  typeof run?.nativeRuntimeStillImageAssetMissingCount === "number" &&
  Number.isFinite(run.nativeRuntimeStillImageAssetMissingCount) &&
  run.nativeRuntimeStillImageAssetMissingCount === 0;

const hasLoadedAllManifestNativeRuntimeAssets = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  typeof run?.nativeRuntimeStillImageAssetLoadedCount === "number" &&
  typeof run.nativeRuntimeStillImageAssetCount === "number" &&
  Number.isFinite(run.nativeRuntimeStillImageAssetLoadedCount) &&
  Number.isFinite(run.nativeRuntimeStillImageAssetCount) &&
  run.nativeRuntimeStillImageAssetLoadedCount >= run.nativeRuntimeStillImageAssetCount;

const hasDecodedAllManifestNativeRuntimeAssets = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  typeof run?.nativeRuntimeStillImageAssetDecodedCount === "number" &&
  typeof run?.nativeRuntimeStillImageAssetDecodedPixelCount === "number" &&
  typeof run.nativeRuntimeStillImageAssetCount === "number" &&
  Number.isFinite(run.nativeRuntimeStillImageAssetDecodedCount) &&
  Number.isFinite(run.nativeRuntimeStillImageAssetDecodedPixelCount) &&
  Number.isFinite(run.nativeRuntimeStillImageAssetCount) &&
  run.nativeRuntimeStillImageAssetDecodedCount >= run.nativeRuntimeStillImageAssetCount &&
  run.nativeRuntimeStillImageAssetDecodedPixelCount > 0;

const hasCompositedAllManifestNativeRuntimeAssets = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  typeof run?.nativeRuntimeStillImageAssetCompositedCount === "number" &&
  typeof run?.nativeRuntimeStillImageAssetCompositedPixelCount === "number" &&
  typeof run.nativeRuntimeStillImageAssetCount === "number" &&
  Number.isFinite(run.nativeRuntimeStillImageAssetCompositedCount) &&
  Number.isFinite(run.nativeRuntimeStillImageAssetCompositedPixelCount) &&
  Number.isFinite(run.nativeRuntimeStillImageAssetCount) &&
  run.nativeRuntimeStillImageAssetCompositedCount >= run.nativeRuntimeStillImageAssetCount &&
  run.nativeRuntimeStillImageAssetCompositedPixelCount > 0;

const hasManifestStillImageOverlayProof = (run: ValidationEvidenceManifestRun | undefined): boolean => {
  if (!isPositiveFiniteNumber(run?.nativeRuntimeStillImageAssetCount)) {
    return true;
  }

  return (
    run?.nativeRuntimeCompositionStatus === "applied" &&
    isAtLeastFiniteNumber(run.nativeRuntimeCompositionAppliedCount, run.nativeRuntimeStillImageAssetCount) &&
    isZeroFiniteNumber(run.nativeRuntimeCompositionSkippedCount) &&
    hasZeroManifestNativeRuntimeMissingAssets(run) &&
    hasLoadedAllManifestNativeRuntimeAssets(run) &&
    hasDecodedAllManifestNativeRuntimeAssets(run) &&
    hasCompositedAllManifestNativeRuntimeAssets(run)
  );
};

const hasManifestIosAppGroupStillImageProof = (run: ValidationEvidenceManifestRun | undefined): boolean => {
  if (run?.devicePlatform !== "ios" || !isPositiveFiniteNumber(run?.nativeRuntimeStillImageAssetCount)) {
    return true;
  }

  return (
    isAtLeastFiniteNumber(run.nativeRuntimeStillImageAssetAppGroupCount, run.nativeRuntimeStillImageAssetCount) &&
    isAtLeastFiniteNumber(run.nativeRuntimeStillImageAssetAppGroupLoadedCount, run.nativeRuntimeStillImageAssetCount) &&
    isAtLeastFiniteNumber(run.nativeRuntimeStillImageAssetAppGroupDecodedCount, run.nativeRuntimeStillImageAssetCount) &&
    isPositiveFiniteNumber(run.nativeRuntimeStillImageAssetAppGroupDecodedPixelCount) &&
    isAtLeastFiniteNumber(run.nativeRuntimeStillImageAssetAppGroupCompositedCount, run.nativeRuntimeStillImageAssetCount) &&
    isPositiveFiniteNumber(run.nativeRuntimeStillImageAssetAppGroupCompositedPixelCount)
  );
};

const hasManifestVrmReleaseProof = (run: ValidationEvidenceManifestRun | undefined): boolean => {
  const vrmSourceCount = run?.nativeRuntimeVrmSourceCount;
  if (typeof vrmSourceCount !== "number" || !Number.isFinite(vrmSourceCount) || vrmSourceCount <= 0) {
    return true;
  }

  return (
    run?.nativeRuntimeVrmRendererStatus === "ready" &&
    isProductionVrmRendererBackend(run.devicePlatform, run.nativeRuntimeVrmRendererBackend) &&
    isAtLeastFiniteNumber(run.nativeRuntimeVrmRenderedSourceCount, vrmSourceCount) &&
    isZeroFiniteNumber(run.nativeRuntimeVrmRenderMissingCount) &&
    isZeroFiniteNumber(run.nativeRuntimeVrmRenderFailureCount) &&
    isAtLeastFiniteNumber(run.nativeRuntimeVrmActivePoseCount, vrmSourceCount) &&
    isZeroFiniteNumber(run.nativeRuntimeVrmMissingPoseCount) &&
    isPositiveFiniteNumber(run.nativeRuntimeVrmModelLoadedCount) &&
    isPositiveFiniteNumber(run.nativeRuntimeVrmHumanoidBoneCount) &&
    isPositiveFiniteNumber(run.nativeRuntimeVrmExpressionCount) &&
    isPositiveFiniteNumber(run.nativeRuntimeVrmMeshPrimitiveCount) &&
    isPositiveFiniteNumber(run.nativeRuntimeVrmSkinnedMeshPrimitiveCount) &&
    isPositiveFiniteNumber(run.nativeRuntimeVrmSkinJointCount) &&
    isPositiveFiniteNumber(run.nativeRuntimeVrmPositionAccessorCount) &&
    isPositiveFiniteNumber(run.nativeRuntimeVrmVertexCount) &&
    hasManifestVrmModelStructureProof(run) &&
    isAtLeastFiniteNumber(run.nativeRuntimeVrmSkinningAttributePrimitiveCount, run.nativeRuntimeVrmSkinnedMeshPrimitiveCount) &&
    isAtLeastFiniteNumber(run.nativeRuntimeVrmTrianglePrimitiveCount, run.nativeRuntimeVrmMeshPrimitiveCount) &&
    isZeroFiniteNumber(run.nativeRuntimeVrmUnsupportedPrimitiveModeCount) &&
    isZeroFiniteNumber(run.nativeRuntimeVrmUnsupportedImageMimeCount) &&
    isZeroFiniteNumber(run.nativeRuntimeVrmPoseBoneUnsupportedCount) &&
    isZeroFiniteNumber(run.nativeRuntimeVrmPoseExpressionUnsupportedCount)
  );
};

const hasManifestVrmModelStructureProof = (run: ValidationEvidenceManifestRun): boolean =>
  isAtLeastFiniteNumber(run.nativeRuntimeVrmBoundsAccessorCount, run.nativeRuntimeVrmPositionAccessorCount) &&
  isPositiveFiniteNumber(run.nativeRuntimeVrmMaterialCount) &&
  (run.nativeRuntimeVrmImageCount === 0 ||
    (isPositiveFiniteNumber(run.nativeRuntimeVrmTextureCount) &&
      isPositiveFiniteNumber(run.nativeRuntimeVrmTexcoordAccessorCount)));

const hasManifestLive2DPoseProof = (run: ValidationEvidenceManifestRun | undefined): boolean => {
  const live2dSourceCount = run?.nativeRuntimeLive2dSourceCount;
  if (typeof live2dSourceCount !== "number" || !Number.isFinite(live2dSourceCount) || live2dSourceCount <= 0) {
    return true;
  }

  return (
    isAtLeastFiniteNumber(run?.nativeRuntimeLive2dPosePayloadCount, live2dSourceCount) &&
    isAtLeastFiniteNumber(run?.nativeRuntimeLive2dActivePoseCount, live2dSourceCount) &&
    isZeroFiniteNumber(run?.nativeRuntimeLive2dMissingPoseCount)
  );
};

const isManifestAudioPass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isManifestFeaturePass(run?.audioStatus) &&
  isPositiveFiniteNumber(run?.audioNativeMonitorWrittenFrames) &&
  isPositiveFiniteNumber(run?.audioNativeMonitorWrittenBuffers) &&
  hasZeroManifestAudioDrops(run) &&
  Boolean(nonEmptyText(run?.audioOutputRoute)) &&
  Boolean(nonEmptyText(run?.audioNativeMonitorRoute)) &&
  run?.audioNativeMonitorRouteMatchesOutput === true &&
  run?.audioMonitorLatencyStatus === "pass" &&
  typeof run.audioMonitorLatencyMs === "number" &&
  Number.isFinite(run.audioMonitorLatencyMs) &&
  isPositiveFiniteNumber(run.audioMonitorLatencyBudgetMs) &&
  run.audioMonitorLatencyMs <= run.audioMonitorLatencyBudgetMs &&
  Boolean(nonEmptyText(run.audioMonitorLatencySource)) &&
  (run.audioBluetoothRoute !== true ||
    (run.audioBluetoothTuningReviewed === true && Boolean(nonEmptyText(run.audioMonitorTuningNote)))) &&
  run.audioNativeMonitorHeadphonesConnected === true;

const hasZeroManifestAudioDrops = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  typeof run?.audioNativeMonitorDroppedFrames === "number" &&
  typeof run.audioNativeMonitorDroppedBuffers === "number" &&
  Number.isFinite(run.audioNativeMonitorDroppedFrames) &&
  Number.isFinite(run.audioNativeMonitorDroppedBuffers) &&
  run.audioNativeMonitorDroppedFrames === 0 &&
  run.audioNativeMonitorDroppedBuffers === 0;

const isManifestAvatarMotionPass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isManifestFeaturePass(run?.faceTrackingStatus) &&
  run?.faceTrackingRuntimeFresh === true &&
  hasReadyManifestFaceLandmarks(run) &&
  hasReadyManifestMotionAttenuationProof(run) &&
  isPositiveFiniteNumber(run?.faceTrackingActiveMotionCount) &&
  (hasReadyManifestPngTuberMotionProof(run) || hasReadyManifestVrmMotionProof(run));

const hasReadyManifestFaceLandmarks = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  run?.faceTrackingFaceLandmarkReady === true &&
  typeof run.faceTrackingFaceLandmarkConfidence === "number" &&
  Number.isFinite(run.faceTrackingFaceLandmarkConfidence) &&
  run.faceTrackingFaceLandmarkConfidence >= 0.55;

const hasReadyManifestMotionAttenuationProof = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isPositiveFiniteNumber(run?.faceTrackingLandmarkMotionScale) &&
  isPositiveFiniteNumber(run?.faceTrackingFaceControlScale);

const hasZeroManifestRigIssues = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  typeof run?.faceTrackingRigIssueCount === "number" &&
  Number.isFinite(run.faceTrackingRigIssueCount) &&
  run.faceTrackingRigIssueCount === 0;

const hasReadyManifestRigQuality = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  run?.faceTrackingRigQualityGrade === "ready" &&
  typeof run.faceTrackingRigQualityScore === "number" &&
  Number.isFinite(run.faceTrackingRigQualityScore) &&
  run.faceTrackingRigQualityScore >= 90;

const hasReadyManifestRigHighFidelity = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  run?.faceTrackingRigHighFidelityGrade === "ready" &&
  typeof run.faceTrackingRigHighFidelityScore === "number" &&
  typeof run.faceTrackingRigPartSeparationScore === "number" &&
  typeof run.faceTrackingRigDepthContinuityScore === "number" &&
  typeof run.faceTrackingRigSemanticSegmentScore === "number" &&
  typeof run.faceTrackingRigEyeMouthSegmentScore === "number" &&
  typeof run.faceTrackingRigHorizontalAnchorScore === "number" &&
  Number.isFinite(run.faceTrackingRigHighFidelityScore) &&
  Number.isFinite(run.faceTrackingRigPartSeparationScore) &&
  Number.isFinite(run.faceTrackingRigDepthContinuityScore) &&
  Number.isFinite(run.faceTrackingRigSemanticSegmentScore) &&
  Number.isFinite(run.faceTrackingRigEyeMouthSegmentScore) &&
  Number.isFinite(run.faceTrackingRigHorizontalAnchorScore) &&
  run.faceTrackingRigHighFidelityScore >= 90 &&
  run.faceTrackingRigPartSeparationScore >= 90 &&
  run.faceTrackingRigDepthContinuityScore >= 90 &&
  run.faceTrackingRigSemanticSegmentScore >= 90 &&
  run.faceTrackingRigEyeMouthSegmentScore >= 90 &&
  run.faceTrackingRigHorizontalAnchorScore >= 90;

const hasReadyManifestPngTuberMotionProof = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isPositiveFiniteNumber(run?.faceTrackingPreparedPngTuberCount) &&
  hasZeroManifestRigIssues(run) &&
  hasReadyManifestRigQuality(run) &&
  hasReadyManifestRigHighFidelity(run);

const hasReadyManifestVrmMotionProof = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isPositiveFiniteNumber(run?.faceTrackingVisibleVrmCount) &&
  run?.faceTrackingNativeVrmRendererReady === true &&
  isPositiveFiniteNumber(run?.nativeRuntimeVrmSourceCount) &&
  hasManifestLive2DPoseProof(run) &&
  hasManifestVrmReleaseProof(run);

const isManifestChatReadoutPass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isManifestFeaturePass(run?.chatReadoutStatus) &&
  run?.chatReadoutPlatformChatEnabled === true &&
  run?.chatReadoutReaderEnabled === true &&
  normalizeStatusLabel(run?.chatReadoutConnectionPhase) === "connected" &&
  Boolean(nonEmptyText(run?.chatReadoutConnectionLabel)) &&
  Number(run?.chatReadoutSpokenMessageCount) > 0 &&
  hasZeroManifestChatSpeechFailures(run);

const hasZeroManifestChatSpeechFailures = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  typeof run?.chatReadoutSpeechFailureCount === "number" &&
  Number.isFinite(run.chatReadoutSpeechFailureCount) &&
  run.chatReadoutSpeechFailureCount === 0;

const isManifestQualityAutomationPass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isManifestFeaturePass(run?.qualityAutomationStatus) &&
  hasControlledWeakNetworkProfile(run?.networkProfile) &&
  (Number(run?.qualityAutomationLiveUpdateCount) > 0 || Number(run?.qualityAutomationNextTargetCount) > 0) &&
  isZeroFiniteNumber(run?.qualityAutomationFailureCount);

const hasControlledWeakNetworkProfile = (networkProfile: unknown): boolean => {
  const normalized = normalizeStatusLabel(networkProfile);
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
};

const isManifestPlatformPublishingPass = (
  run: ValidationEvidenceManifestRun | undefined,
  expectedYouTubePublishing: YouTubePublishingProofRequirements = emptyYouTubePublishingProofRequirements,
  expectedTwitchPublishing: TwitchPublishingProofRequirements = emptyTwitchPublishingProofRequirements
): boolean =>
  (run?.platformPublishingFreshnessStatus === "not-applicable" && !isFirstPartyManifestPublishingDestination(run)) ||
  (isManifestFeaturePass(run?.platformPublishingStatus) &&
    run?.platformPublishingFreshnessStatus === "fresh" &&
    isNonEmptyIsoDate(run.platformPublishingCheckedAt) &&
    isAtMostFiniteNumber(run.platformPublishingFreshnessAgeMinutes, platformPublishingDashboardMaxAgeMinutes) &&
    isManifestPlatformIdentityPass(run, expectedYouTubePublishing, expectedTwitchPublishing));

const isManifestPlatformIngestPass = (
  run: ValidationEvidenceManifestRun | undefined,
  expectedNativeOverlays: NativeOverlayProofRequirements = emptyNativeOverlayProofRequirements,
  expectedYouTubePublishing: YouTubePublishingProofRequirements = emptyYouTubePublishingProofRequirements,
  expectedTwitchPublishing: TwitchPublishingProofRequirements = emptyTwitchPublishingProofRequirements
): boolean => {
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
};

const isManifestPlatformPublishingTimestampConsistent = (run: ValidationEvidenceManifestRun): boolean => {
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
};

const isManifestPlatformIngestProofRequired = (run: ValidationEvidenceManifestRun): boolean => {
  const target = normalizeTargetPlatformLabel(run.targetPlatform);
  return target === "youtube live" || target.includes("youtube") || target === "twitch" || target.includes("twitch");
};

const isFirstPartyManifestPublishingDestination = (run: ValidationEvidenceManifestRun): boolean =>
  run.platformPublishingPlatform === "youtube-live" ||
  run.platformPublishingPlatform === "twitch" ||
  isManifestPlatformIngestProofRequired(run);

const isManifestPlatformIdentityPass = (
  run: ValidationEvidenceManifestRun,
  expectedYouTubePublishing: YouTubePublishingProofRequirements = emptyYouTubePublishingProofRequirements,
  expectedTwitchPublishing: TwitchPublishingProofRequirements = emptyTwitchPublishingProofRequirements
): boolean => {
  if (run.platformPublishingPlatform === "youtube-live") {
    return (
      run.platformPublishingYoutubeHasBroadcastId === true &&
      run.platformPublishingYoutubeHasStreamId === true &&
      ["live", "testing"].includes(normalizeStatusLabel(run.platformPublishingYoutubeBroadcastStatus)) &&
      hasExpectedYouTubeBoundStreamProof(run, expectedYouTubePublishing) &&
      hasExpectedYouTubePrivacyProof(run, expectedYouTubePublishing) &&
      normalizeStatusLabel(run.platformPublishingYoutubeStreamStatus) === "active" &&
      ["ok", "good"].includes(normalizeStatusLabel(run.platformPublishingYoutubeHealthStatus)) &&
      isZeroFiniteNumber(run.platformPublishingYoutubeHealthIssueCount)
    );
  }
  if (run.platformPublishingPlatform === "twitch") {
    return (
      normalizeStatusLabel(run.platformPublishingTwitchLiveStatus) === "live" &&
      isNonEmptyIsoDate(run.platformPublishingTwitchStartedAt) &&
      run.platformPublishingTwitchHasCategoryId === true &&
      nonEmptyText(run.platformPublishingTwitchChannelTitle) !== null &&
      nonEmptyText(run.platformPublishingTwitchChannelCategory) !== null &&
      nonEmptyText(run.platformPublishingTwitchChannelCategoryId) !== null &&
      nonEmptyText(run.platformPublishingTwitchChannelLanguage) !== null &&
      isNonNegativeFiniteNumber(run.platformPublishingTwitchViewerCount) &&
      hasExpectedTwitchTitleProof(run, expectedTwitchPublishing) &&
      hasExpectedTwitchCategoryProof(run, expectedTwitchPublishing) &&
      hasExpectedTwitchLanguageProof(run, expectedTwitchPublishing)
    );
  }
  return false;
};

const hasExpectedYouTubeBoundStreamProof = (
  run: ValidationEvidenceManifestRun,
  expectedYouTubePublishing: YouTubePublishingProofRequirements
): boolean => {
  const manifestBoundStreamId = nonEmptyText(run.platformPublishingYoutubeBoundStreamId);
  if (!manifestBoundStreamId) {
    return false;
  }
  return !expectedYouTubePublishing.boundStreamId || manifestBoundStreamId === expectedYouTubePublishing.boundStreamId;
};

const hasExpectedYouTubePrivacyProof = (
  run: ValidationEvidenceManifestRun,
  expectedYouTubePublishing: YouTubePublishingProofRequirements
): boolean => {
  const manifestPrivacyStatus = nonEmptyText(run.platformPublishingYoutubeBroadcastPrivacyStatus);
  if (!manifestPrivacyStatus) {
    return false;
  }
  return (
    !expectedYouTubePublishing.broadcastPrivacyStatus ||
    normalizeStatusLabel(manifestPrivacyStatus) === normalizeStatusLabel(expectedYouTubePublishing.broadcastPrivacyStatus)
  );
};

const hasExpectedTwitchCategoryProof = (
  run: ValidationEvidenceManifestRun,
  expectedTwitchPublishing: TwitchPublishingProofRequirements
): boolean => {
  const manifestCategoryId = nonEmptyText(run.platformPublishingTwitchChannelCategoryId);
  if (!manifestCategoryId) {
    return false;
  }
  if (expectedTwitchPublishing.categoryId) {
    return normalizeStatusLabel(manifestCategoryId) === normalizeStatusLabel(expectedTwitchPublishing.categoryId);
  }
  const manifestCategory = nonEmptyText(run.platformPublishingTwitchChannelCategory);
  return Boolean(
    manifestCategory &&
      (!expectedTwitchPublishing.category ||
        normalizeStatusLabel(manifestCategory) === normalizeStatusLabel(expectedTwitchPublishing.category))
  );
};

const hasExpectedTwitchTitleProof = (
  run: ValidationEvidenceManifestRun,
  expectedTwitchPublishing: TwitchPublishingProofRequirements
): boolean => {
  const manifestTitle = nonEmptyText(run.platformPublishingTwitchChannelTitle);
  if (!manifestTitle) {
    return false;
  }
  return expectedTwitchPublishing.titleLength === null || manifestTitle.length === expectedTwitchPublishing.titleLength;
};

const hasExpectedTwitchLanguageProof = (
  run: ValidationEvidenceManifestRun,
  expectedTwitchPublishing: TwitchPublishingProofRequirements
): boolean => {
  const manifestLanguage = nonEmptyText(run.platformPublishingTwitchChannelLanguage);
  if (!manifestLanguage) {
    return false;
  }
  return (
    !expectedTwitchPublishing.language ||
    normalizeStatusLabel(manifestLanguage) === normalizeStatusLabel(expectedTwitchPublishing.language)
  );
};

const isNonEmptyIsoDate = (value: unknown): boolean => typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));

const normalizeStatusLabel = (value: unknown): string => (typeof value === "string" ? value.trim().toLowerCase() : "");

const normalizeBuildLabel = (value: string): string => value.trim().toLowerCase();

interface SensitiveBundleFinding {
  path: string;
  reason: string;
}

const redactedMarker = "[redacted]";
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

const findSensitiveBundleFindings = (value: unknown): SensitiveBundleFinding[] => {
  const findings: SensitiveBundleFinding[] = [];
  const seen = new WeakSet<object>();

  const visit = (entry: unknown, path: string, key?: string) => {
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

    for (const [childKey, childValue] of Object.entries(entry as Record<string, unknown>)) {
      visit(childValue, `${path}.${childKey}`, childKey);
    }
  };

  visit(value, "bundle");
  return findings;
};

const findSensitiveStringFindings = (value: string, path: string): SensitiveBundleFinding[] => {
  const findings: SensitiveBundleFinding[] = [];
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
};

const hasSensitiveTextLeak = (value: string): boolean =>
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
  hasPatternMatch(value, privateKeyBlockPattern);

const hasUnredactedMatch = (value: string, pattern: RegExp): boolean => {
  pattern.lastIndex = 0;
  for (const match of value.matchAll(pattern)) {
    const candidate = match[2] ?? match[1] ?? "";
    if (!isSafeSensitiveValue(candidate)) {
      return true;
    }
  }
  return false;
};

const hasUnredactedContactTextLeak = (value: string): boolean =>
  hasPatternMatch(value, emailAddressPattern) ||
  hasPatternMatch(value, inviteLinkPattern) ||
  hasUnredactedPhoneMatch(value);

const hasUnredactedProtocolLessLink = (value: string, path: string): boolean => {
  protocolLessLinkPattern.lastIndex = 0;
  for (const match of value.matchAll(protocolLessLinkPattern)) {
    const candidate = match[2] ?? "";
    if (candidate && !candidate.includes(redactedMarker) && !isAllowedProtocolLessLinkFinding(path, candidate)) {
      return true;
    }
  }
  return false;
};

const isAllowedProtocolLessLinkFinding = (path: string, candidate: string): boolean =>
  (path === "bundle.target.host" || path === "bundle.profile.destination.host") &&
  candidate.includes(".") &&
  !candidate.includes("/") &&
  /^[a-z0-9.-]+$/i.test(candidate);

const hasPatternMatch = (value: string, pattern: RegExp): boolean => {
  pattern.lastIndex = 0;
  return pattern.test(value);
};

const hasUnredactedPhoneMatch = (value: string): boolean => {
  phoneLikePattern.lastIndex = 0;
  for (const match of value.matchAll(phoneLikePattern)) {
    if (isUnredactedPhoneCandidate(match[2] ?? "")) {
      return true;
    }
  }
  return false;
};

const isUnredactedPhoneCandidate = (value: string): boolean => {
  const digits = value.replace(/\D/g, "");
  const normalized = value.trim();
  return digits.length >= 10 && digits.length <= 15 && !/^20\d{2}[-./\s]/.test(normalized);
};

const isSafeSensitiveValue = (value: string): boolean => {
  const trimmed = value.trim();
  return !trimmed || trimmed.includes(redactedMarker);
};

const normalizePropertyName = (value: string): string => value.replace(/[^a-z0-9]/gi, "").toLowerCase();

const isSensitivePropertyName = (value: string): boolean => {
  const normalized = normalizePropertyName(value);
  return sensitivePropertyNames.has(normalized) || sensitivePropertySuffixes.some((suffix) => normalized.endsWith(suffix));
};
