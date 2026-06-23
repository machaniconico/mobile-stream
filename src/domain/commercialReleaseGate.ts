import type { SupportBundle } from "./supportBundle";

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

const minimumSupportBundleVersion = 13;
const defaultMaxBundleAgeHours = 24;

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
    createBundleAgeIssue(bundle, now, maxBundleAgeHours),
    createPreflightIssue(bundle),
    createPublicLaunchIssue(bundle),
    createValidationIssue(bundle),
    createValidationRunbookIssue(bundle),
    createValidationEvidenceIssue(bundle),
    createValidationEvidenceCoverageIssue(bundle),
    createValidationEvidenceManifestIssue(bundle),
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
    bundle.summary.validationEvidenceAppBuildMismatch ||
    !nonEmptyText(bundle.summary.validationEvidenceConsistentAppBuild)
  ) {
    return failIssue(
      "validation-evidence-coverage",
      "Physical validation coverage",
      `Coverage iOS ${bundle.summary.validationEvidenceIosPass ? "pass" : "missing"} / Android ${
        bundle.summary.validationEvidenceAndroidPass ? "pass" : "missing"
      } / build ${bundle.summary.validationEvidenceConsistentAppBuild ?? (bundle.summary.validationEvidenceAppBuildMismatch ? "mismatch" : "-")}.`,
      "Record fresh passing iOS and Android validation runs on the same release-candidate app build."
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
      "Export a support bundle v13 or newer after retaining release-candidate validation runs."
    );
  }
  const eligiblePlatforms = new Set(manifest.filter((run) => run.eligible && run.result === "pass").map((run) => run.devicePlatform));
  if (!eligiblePlatforms.has("ios") || !eligiblePlatforms.has("android")) {
    return failIssue(
      "validation-evidence-manifest-incomplete",
      "Validation evidence manifest",
      "The manifest does not include eligible passing iOS and Android runs.",
      "Record and retain passing validation runs for both iOS and Android on the current build."
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

const createValidationEvidenceFeatureIssue = (bundle: SupportBundle): CommercialReleaseGateIssue | null => {
  const missing = [
    !bundle.summary.validationEvidenceNativeRuntimeIosPass || !bundle.summary.validationEvidenceNativeRuntimeAndroidPass
      ? "native publisher/compositor"
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
