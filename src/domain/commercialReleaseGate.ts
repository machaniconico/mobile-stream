import type { SupportBundle } from "./supportBundle";
import {
  minimumValidationMonitorDurationSeconds,
  minimumValidationMonitorSampleCount
} from "./streamValidationThresholds";
import { platformPublishingDashboardMaxAgeMinutes } from "./platformPublishingFreshness";

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
  allowWarnings?: boolean;
}

const minimumSupportBundleVersion = 43;
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
    maxBundleAgeHours = defaultMaxBundleAgeHours,
    allowWarnings = false
  }: CommercialReleaseGateOptions = {}
): CommercialReleaseGate => {
  const issueCandidates = [
    createBundleVersionIssue(bundle),
    createSupportBundleRedactionIssue(bundle),
    createBundleAgeIssue(bundle, now, maxBundleAgeHours),
    createPreflightIssue(bundle),
    createPublicLaunchIssue(bundle),
    createPublicLaunchConfirmationEvidenceIssue(bundle),
    createPlatformPublishingFreshnessIssue(bundle),
    createValidationIssue(bundle),
    createValidationRunbookIssue(bundle),
    createRehearsalIssue(bundle),
    createValidationEvidenceIssue(bundle),
    createValidationEvidenceCoverageIssue(bundle),
    createValidationEvidenceManifestIssue(bundle),
    createValidationEvidenceManifestIntegrityIssue(bundle),
    createValidationEvidenceQualityAutomationIssue(bundle),
    createValidationEvidenceFeatureIssue(bundle),
    createRetainedStaleEvidenceIssue(bundle)
  ];
  const issues = issueCandidates.filter((issue): issue is CommercialReleaseGateIssue => Boolean(issue));
  const warningCount = issues.filter((issue) => issue.severity === "warn").length;
  const failureCount = issues.filter((issue) => issue.severity === "fail").length;
  const status: CommercialReleaseGateStatus = failureCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "ready";
  const canRelease = failureCount === 0 && (allowWarnings || warningCount === 0);

  return {
    canRelease,
    status,
    generatedAt: bundle.generatedAt,
    bundleAgeHours: ageInHours(bundle.generatedAt, now),
    evidenceFingerprint: nonEmptyText(bundle.summary.validationEvidenceFingerprint),
    latestRunFingerprint: nonEmptyText(bundle.summary.validationEvidenceLatestRunFingerprint),
    issueCounts: {
      warningCount,
      failureCount
    },
    issues,
    summary: createGateSummary(status, canRelease, { warningCount, failureCount }),
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
  const ageHours = ageInHours(bundle.generatedAt, now);
  if (ageHours === null) {
    return failIssue(
      "bundle-generated-at-invalid",
      "Support bundle freshness",
      "The support bundle generatedAt timestamp is invalid.",
      "Export a fresh support bundle from the release candidate build."
    );
  }
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
    return warnIssue(
      "preflight-warning",
      "Go Live preflight",
      `${bundle.summary.launchWarningCount} launch warning${bundle.summary.launchWarningCount === 1 ? "" : "s"} remain.`,
      "Review preflight warnings and either resolve them or approve release with warnings explicitly."
    );
  }
  return null;
};

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
    return warnIssue(
      "public-launch-warning",
      "Public launch checklist",
      `${bundle.summary.publicLaunchWarningCount} public launch warning${bundle.summary.publicLaunchWarningCount === 1 ? "" : "s"} remain.`,
      "Review dashboard, chat, mic monitor, and evidence warnings before approving release."
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
  const hasNoConfirmation = count === 0 && status === "none" && lastAt === null && typeof lastMessage === "string";
  const hasConfirmation =
    typeof count === "number" &&
    count > 0 &&
    (status === "confirmed" || status === "cancelled") &&
    typeof lastAt === "string" &&
    Number.isFinite(Date.parse(lastAt)) &&
    typeof lastMessage === "string" &&
    lastMessage.trim().length > 0;

  if (!hasValidCount || !hasValidStatus || (!hasNoConfirmation && !hasConfirmation)) {
    return failIssue(
      "public-launch-confirmation-evidence",
      "Public launch confirmation audit",
      "The support bundle is missing valid public launch confirmation summary evidence.",
      "Export a support bundle v43 or newer so retained public launch confirmation events are summarized."
    );
  }

  return null;
};

const createPlatformPublishingFreshnessIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  const status = bundle.summary.platformPublishingFreshnessStatus;
  if (status === "fresh" || status === "not-applicable") {
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
    return warnIssue(
      "commercial-validation-warning",
      "Commercial validation",
      `${bundle.summary.validationWarningCount} warning(s) and ${bundle.summary.validationPendingCount} pending validation item(s) remain.`,
      "Review remaining validation items before approving release with warnings."
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
    return warnIssue(
      "stream-rehearsal-warning",
      "Launch rehearsal",
      bundle.summary.rehearsalSummary,
      bundle.summary.rehearsalPrimaryAction || "Review rehearsal warnings before approving release."
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
      "Export a support bundle v43 or newer after retaining release-candidate validation runs."
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
  if (manifest.length !== bundle.summary.validationEvidenceRunCount) {
    return warnIssue(
      "validation-evidence-manifest-count-mismatch",
      "Validation evidence manifest",
      `Manifest has ${manifest.length} run(s), but the summary reports ${bundle.summary.validationEvidenceRunCount}.`,
      "Export a fresh support bundle so retained run counts and manifest rows match."
    );
  }
  return null;
};

const createValidationEvidenceManifestIntegrityIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
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
    mismatches.push(`${eligibilityFlagMismatchCount} manifest eligible flag(s) do not match fresh destination-scope state`);
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

  const claimChecks: Array<[boolean, string, boolean]> = [
    [summary.validationEvidenceIosPass, "iOS validation pass", isManifestRunPass(iosRun)],
    [summary.validationEvidenceAndroidPass, "Android validation pass", isManifestRunPass(androidRun)],
    [summary.validationEvidencePhysicalDeviceIosPass, "iOS physical-device proof", isManifestPhysicalRunPass(iosRun)],
    [summary.validationEvidencePhysicalDeviceAndroidPass, "Android physical-device proof", isManifestPhysicalRunPass(androidRun)],
    [summary.validationEvidenceNativeRuntimeIosPass, "iOS native runtime proof", isManifestNativeRuntimePass(iosRun)],
    [
      summary.validationEvidenceNativeRuntimeAndroidPass,
      "Android native runtime proof",
      isManifestNativeRuntimePass(androidRun)
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
      isManifestPlatformPublishingPass(iosRun)
    ],
    [
      summary.validationEvidencePlatformPublishingAndroidPass,
      "Android platform dashboard proof",
      isManifestPlatformPublishingPass(androidRun)
    ],
    [
      summary.validationEvidencePlatformIngestIosPass,
      "iOS same-run platform ingest proof",
      isManifestPlatformIngestPass(iosRun)
    ],
    [
      summary.validationEvidencePlatformIngestAndroidPass,
      "Android same-run platform ingest proof",
      isManifestPlatformIngestPass(androidRun)
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
  return {
    ios: resolveValidationEvidencePlatformIngestPass(bundle.summary.validationEvidencePlatformIngestIosPass, latestRuns.get("ios")),
    android: resolveValidationEvidencePlatformIngestPass(
      bundle.summary.validationEvidencePlatformIngestAndroidPass,
      latestRuns.get("android")
    )
  };
};

const resolveValidationEvidencePlatformIngestPass = (
  summaryValue: unknown,
  manifestRun: ValidationEvidenceManifestRun | undefined
): boolean => (typeof summaryValue === "boolean" ? summaryValue : isManifestPlatformIngestPass(manifestRun));

const createRetainedStaleEvidenceIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  if (bundle.summary.validationEvidenceStaleRunCount <= 0) {
    return null;
  }
  return warnIssue(
    "validation-evidence-stale-retained-runs",
    "Physical validation evidence",
    `${bundle.summary.validationEvidenceStaleRunCount} stale retained validation run(s) remain in the bundle.`,
    "Clear old retained validation evidence after exporting any support records that still need it."
  );
};

const createGateSummary = (
  status: CommercialReleaseGateStatus,
  canRelease: boolean,
  counts: { warningCount: number; failureCount: number }
): string => {
  if (canRelease) {
    return status === "warning"
      ? `${counts.warningCount} release warning${counts.warningCount === 1 ? "" : "s"} accepted.`
      : "Commercial release gate is ready.";
  }
  if (counts.failureCount > 0) {
    return `${counts.failureCount} commercial release blocker${counts.failureCount === 1 ? "" : "s"} remain.`;
  }
  return `${counts.warningCount} commercial release warning${counts.warningCount === 1 ? "" : "s"} require approval.`;
};

const createPrimaryAction = (canRelease: boolean, issues: CommercialReleaseGateIssue[]): string => {
  if (canRelease) {
    return "Archive this support bundle with the release-candidate build before publishing.";
  }
  return issues.find((issue) => issue.severity === "fail")?.action ?? issues[0]?.action ?? "Review release warnings before publishing.";
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

const warnIssue = (
  code: string,
  label: string,
  detail: string,
  action: string
): CommercialReleaseGateIssue => ({
  code,
  severity: "warn",
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

type ValidationEvidenceManifestRun = SupportBundle["summary"]["validationEvidenceRunManifest"][number];

interface ExpectedManifestScope {
  targetPlatform: string | null;
  transport: string | null;
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
  transport: null
};

const createExpectedManifestScope = (bundle: SupportBundle): ExpectedManifestScope => ({
  targetPlatform: expectedTargetPlatformForBundle(bundle),
  transport: expectedTransportForBundle(bundle)
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

const isManifestRunFreshInScope = (
  run: ValidationEvidenceManifestRun,
  manifestScope: ExpectedManifestScope = emptyExpectedManifestScope
): boolean => isManifestRunFreshAndScopeClaimed(run) && isManifestRunDestinationScopePass(run, manifestScope);

const isManifestRunDestinationScopePass = (
  run: ValidationEvidenceManifestRun,
  { targetPlatform, transport }: ExpectedManifestScope
): boolean => {
  const expectedTarget = normalizeTargetPlatformLabel(targetPlatform);
  if (expectedTarget && normalizeTargetPlatformLabel(run.targetPlatform) !== expectedTarget) {
    return false;
  }
  const expectedTransport = normalizeTransportLabel(transport);
  if (expectedTransport && normalizeTransportLabel(run.transport) !== expectedTransport) {
    return false;
  }
  return true;
};

const formatManifestScope = ({ targetPlatform, transport }: ExpectedManifestScope): string =>
  `${targetPlatform ?? "unknown target"}/${transport ?? "unknown transport"}`;

const normalizeTargetPlatformLabel = (value: unknown): string => (typeof value === "string" ? value.trim().toLowerCase() : "");

const normalizeTransportLabel = (value: unknown): string => (typeof value === "string" ? value.trim().toUpperCase() : "");

const isManifestRunPass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  run?.result === "pass";

const isManifestPhysicalRunPass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isManifestRunPass(run) && run?.physicalDevice === true && run.physicalDeviceStatus === "pass";

const isManifestFeaturePass = (status: string | null | undefined): boolean => status === "pass";

const isManifestNativeRuntimePass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isManifestFeaturePass(run?.nativeRuntimeStatus) &&
  run?.nativeRuntimePlatform === run?.devicePlatform &&
  isPositiveFiniteNumber(run?.nativeRuntimeSentVideoFrames) &&
  isPositiveFiniteNumber(run?.nativeRuntimeSentAudioFrames) &&
  isPositiveFiniteNumber(run?.nativeRuntimeBytesWritten) &&
  hasManifestNativeRuntimeVideoFrameIntervalProof(run) &&
  (run?.nativeRuntimeCompositionStatus === "applied" || run?.nativeRuntimeCompositionStatus === "screen-only") &&
  hasManifestStillImageOverlayProof(run) &&
  hasManifestIosAppGroupStillImageProof(run) &&
  hasManifestVrmReleaseProof(run);

const hasManifestNativeRuntimeVideoFrameIntervalProof = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isPositiveFiniteNumber(run?.nativeRuntimeVideoFrameIntervalSampleCount) &&
  isPositiveFiniteNumber(run?.nativeRuntimeVideoFrameIntervalAverageMs) &&
  isPositiveFiniteNumber(run?.nativeRuntimeVideoFrameIntervalMaxMs) &&
  isNonNegativeFiniteNumber(run?.nativeRuntimeVideoFrameIntervalJitterMs);

const isManifestMonitorHoldPass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isManifestFeaturePass(run?.monitorHoldStatus) &&
  isAtLeastFiniteNumber(run?.monitorHoldSampleCount, minimumValidationMonitorSampleCount) &&
  isAtLeastFiniteNumber(run?.monitorHoldDurationSeconds, minimumValidationMonitorDurationSeconds) &&
  run?.monitorHoldStability === "stable" &&
  hasZeroManifestMonitorHoldInstability(run);

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
    isAtLeastFiniteNumber(run.nativeRuntimeVrmSkinningAttributePrimitiveCount, run.nativeRuntimeVrmSkinnedMeshPrimitiveCount) &&
    isAtLeastFiniteNumber(run.nativeRuntimeVrmTrianglePrimitiveCount, run.nativeRuntimeVrmMeshPrimitiveCount) &&
    isZeroFiniteNumber(run.nativeRuntimeVrmUnsupportedPrimitiveModeCount) &&
    isZeroFiniteNumber(run.nativeRuntimeVrmUnsupportedImageMimeCount) &&
    (run.nativeRuntimeVrmImageCount === 0 || isPositiveFiniteNumber(run.nativeRuntimeVrmTexcoordAccessorCount)) &&
    isZeroFiniteNumber(run.nativeRuntimeVrmPoseBoneUnsupportedCount) &&
    isZeroFiniteNumber(run.nativeRuntimeVrmPoseExpressionUnsupportedCount)
  );
};

const isManifestAudioPass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isManifestFeaturePass(run?.audioStatus) &&
  isPositiveFiniteNumber(run?.audioNativeMonitorWrittenFrames) &&
  isPositiveFiniteNumber(run?.audioNativeMonitorWrittenBuffers) &&
  hasZeroManifestAudioDrops(run) &&
  run?.audioMonitorLatencyStatus === "pass" &&
  typeof run.audioMonitorLatencyMs === "number" &&
  Number.isFinite(run.audioMonitorLatencyMs) &&
  (run.audioBluetoothRoute !== true || run.audioBluetoothTuningReviewed === true) &&
  (!run.audioMonitorHeadphonesOnly || run.audioNativeMonitorHeadphonesConnected === true);

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
  isPositiveFiniteNumber(run?.faceTrackingActiveMotionCount) &&
  (hasReadyManifestPngTuberMotionProof(run) || hasReadyManifestVrmMotionProof(run));

const hasReadyManifestFaceLandmarks = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  run?.faceTrackingFaceLandmarkReady === true &&
  typeof run.faceTrackingFaceLandmarkConfidence === "number" &&
  Number.isFinite(run.faceTrackingFaceLandmarkConfidence) &&
  run.faceTrackingFaceLandmarkConfidence >= 0.55;

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
  Number.isFinite(run.faceTrackingRigHighFidelityScore) &&
  Number.isFinite(run.faceTrackingRigPartSeparationScore) &&
  Number.isFinite(run.faceTrackingRigDepthContinuityScore) &&
  run.faceTrackingRigHighFidelityScore >= 90 &&
  run.faceTrackingRigPartSeparationScore >= 90 &&
  run.faceTrackingRigDepthContinuityScore >= 90;

const hasReadyManifestPngTuberMotionProof = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isPositiveFiniteNumber(run?.faceTrackingPreparedPngTuberCount) &&
  hasZeroManifestRigIssues(run) &&
  hasReadyManifestRigQuality(run) &&
  hasReadyManifestRigHighFidelity(run);

const hasReadyManifestVrmMotionProof = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isPositiveFiniteNumber(run?.faceTrackingVisibleVrmCount) &&
  run?.faceTrackingNativeVrmRendererReady === true &&
  isPositiveFiniteNumber(run?.nativeRuntimeVrmSourceCount) &&
  hasManifestVrmReleaseProof(run);

const isManifestChatReadoutPass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isManifestFeaturePass(run?.chatReadoutStatus) &&
  Number(run?.chatReadoutSpokenMessageCount) > 0 &&
  hasZeroManifestChatSpeechFailures(run);

const hasZeroManifestChatSpeechFailures = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  typeof run?.chatReadoutSpeechFailureCount === "number" &&
  Number.isFinite(run.chatReadoutSpeechFailureCount) &&
  run.chatReadoutSpeechFailureCount === 0;

const isManifestQualityAutomationPass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isManifestFeaturePass(run?.qualityAutomationStatus) &&
  (Number(run?.qualityAutomationLiveUpdateCount) > 0 || Number(run?.qualityAutomationNextTargetCount) > 0) &&
  isZeroFiniteNumber(run?.qualityAutomationFailureCount);

const isManifestPlatformPublishingPass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  run?.platformPublishingFreshnessStatus === "not-applicable" ||
  (isManifestFeaturePass(run?.platformPublishingStatus) &&
    run?.platformPublishingFreshnessStatus === "fresh" &&
    isNonEmptyIsoDate(run.platformPublishingCheckedAt) &&
    isAtMostFiniteNumber(run.platformPublishingFreshnessAgeMinutes, platformPublishingDashboardMaxAgeMinutes) &&
    isManifestPlatformIdentityPass(run));

const isManifestPlatformIngestPass = (run: ValidationEvidenceManifestRun | undefined): boolean => {
  if (!run) {
    return false;
  }
  if (!isManifestPlatformIngestProofRequired(run)) {
    return true;
  }
  return isManifestNativeRuntimePass(run) && isManifestPlatformPublishingPass(run);
};

const isManifestPlatformIngestProofRequired = (run: ValidationEvidenceManifestRun): boolean => {
  const target = normalizeTargetPlatformLabel(run.targetPlatform);
  return target === "youtube live" || target.includes("youtube") || target === "twitch" || target.includes("twitch");
};

const isManifestPlatformIdentityPass = (run: ValidationEvidenceManifestRun): boolean => {
  if (run.platformPublishingPlatform === "youtube-live") {
    return (
      run.platformPublishingYoutubeHasBroadcastId === true &&
      run.platformPublishingYoutubeHasStreamId === true &&
      ["live", "testing"].includes(normalizeStatusLabel(run.platformPublishingYoutubeBroadcastStatus)) &&
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
      nonEmptyText(run.platformPublishingTwitchChannelLanguage) !== null
    );
  }
  return false;
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
  /\b([A-Za-z0-9_.-]*(?:access_token|refresh_token|id_token|code|code_verifier|device_code|client_secret|stream_key|accessToken|refreshToken|idToken|codeVerifier|deviceCode|clientSecret|streamKey|oauthToken|authToken|bearerToken|apiKey|secret))=([^&#\s"']+)/gi;
const sensitiveJsonPattern =
  /["']([A-Za-z0-9_.-]*(?:access_token|refresh_token|id_token|code_verifier|device_code|client_secret|stream_key|accessToken|refreshToken|idToken|codeVerifier|deviceCode|clientSecret|streamKey|oauthToken|authToken|bearerToken|apiKey|authorization|secret))["']\s*:\s*["']([^"']+)["']/gi;
const authorizationHeaderPattern = /\bAuthorization\s*:\s*(Bearer|OAuth)\s+([^\s,;]+)/gi;
const bearerTokenPattern = /\b(Bearer|OAuth)\s+([A-Za-z0-9._~+/=-]{12,})/g;

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
  if (!value || !hasSensitiveTextLeak(value)) {
    return [];
  }
  return [{ path, reason: "contains an unredacted token pattern" }];
};

const hasSensitiveTextLeak = (value: string): boolean =>
  hasUnredactedMatch(value, sensitiveAssignmentPattern) ||
  hasUnredactedMatch(value, sensitiveJsonPattern) ||
  hasUnredactedMatch(value, authorizationHeaderPattern) ||
  hasUnredactedMatch(value, bearerTokenPattern);

const hasUnredactedMatch = (value: string, pattern: RegExp): boolean => {
  pattern.lastIndex = 0;
  for (const match of value.matchAll(pattern)) {
    const candidate = match[2] ?? "";
    if (!isSafeSensitiveValue(candidate)) {
      return true;
    }
  }
  return false;
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
