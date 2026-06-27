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

const minimumSupportBundleVersion = 20;
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
    createSupportBundleRedactionIssue(bundle),
    createBundleAgeIssue(bundle, now, maxBundleAgeHours),
    createPreflightIssue(bundle),
    createPublicLaunchIssue(bundle),
    createPlatformPublishingFreshnessIssue(bundle),
    createValidationIssue(bundle),
    createValidationRunbookIssue(bundle),
    createValidationEvidenceIssue(bundle),
    createValidationEvidenceCoverageIssue(bundle),
    createValidationEvidenceManifestIssue(bundle),
    createValidationEvidenceManifestIntegrityIssue(bundle),
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
      "Export a support bundle v20 or newer after retaining release-candidate validation runs."
    );
  }
  const latestRuns = latestEligibleManifestRunsByPlatform(manifest);
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
  const latestRuns = latestEligibleManifestRunsByPlatform(manifest);
  const iosRun = latestRuns.get("ios");
  const androidRun = latestRuns.get("android");
  const derivedEligibleRunCount = manifest.filter(isManifestRunFreshInScope).length;
  const derivedStaleRunCount = manifest.filter((run) => run.fresh !== true).length;

  if (derivedEligibleRunCount !== summary.validationEvidenceEligibleRunCount) {
    mismatches.push(
      `eligible run count summary=${summary.validationEvidenceEligibleRunCount} manifest=${derivedEligibleRunCount}`
    );
  }
  if (derivedStaleRunCount !== summary.validationEvidenceStaleRunCount) {
    mismatches.push(`stale run count summary=${summary.validationEvidenceStaleRunCount} manifest=${derivedStaleRunCount}`);
  }

  const eligibilityFlagMismatchCount = manifest.filter((run) => run.eligible !== isManifestRunFreshInScope(run)).length;
  if (eligibilityFlagMismatchCount > 0) {
    mismatches.push(`${eligibilityFlagMismatchCount} manifest eligible flag(s) do not match fresh in-scope state`);
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
    [summary.validationEvidenceMonitorHoldIosPass, "iOS stable monitor-hold proof", isManifestFeaturePass(iosRun?.monitorHoldStatus)],
    [
      summary.validationEvidenceMonitorHoldAndroidPass,
      "Android stable monitor-hold proof",
      isManifestFeaturePass(androidRun?.monitorHoldStatus)
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
  const missing = [
    !bundle.summary.validationEvidencePhysicalDeviceIosPass || !bundle.summary.validationEvidencePhysicalDeviceAndroidPass
      ? "physical device identity"
      : "",
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

type ValidationEvidenceManifestRun = SupportBundle["summary"]["validationEvidenceRunManifest"][number];

const latestEligibleManifestRunsByPlatform = (
  manifest: ValidationEvidenceManifestRun[]
): Map<ValidationEvidenceManifestRun["devicePlatform"], ValidationEvidenceManifestRun> => {
  const runsByPlatform = new Map<ValidationEvidenceManifestRun["devicePlatform"], ValidationEvidenceManifestRun>();
  const sortedRuns = [...manifest]
    .filter(isManifestRunFreshInScope)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  for (const run of sortedRuns) {
    if (runsByPlatform.has(run.devicePlatform)) {
      continue;
    }
    runsByPlatform.set(run.devicePlatform, run);
  }
  return runsByPlatform;
};

const isManifestRunFreshInScope = (run: ValidationEvidenceManifestRun): boolean =>
  run.fresh === true && run.matchesScope === true && Number.isFinite(Date.parse(run.createdAt));

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
  (run?.nativeRuntimeCompositionStatus === "applied" || run?.nativeRuntimeCompositionStatus === "screen-only") &&
  hasZeroManifestNativeRuntimeMissingAssets(run) &&
  hasLoadedAllManifestNativeRuntimeAssets(run);

const isPositiveFiniteNumber = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

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

const isManifestAudioPass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isManifestFeaturePass(run?.audioStatus) &&
  isPositiveFiniteNumber(run?.audioNativeMonitorWrittenFrames) &&
  isPositiveFiniteNumber(run?.audioNativeMonitorWrittenBuffers) &&
  hasZeroManifestAudioDrops(run) &&
  run?.audioMonitorLatencyStatus === "pass" &&
  typeof run.audioMonitorLatencyMs === "number" &&
  Number.isFinite(run.audioMonitorLatencyMs) &&
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
  Number(run.faceTrackingActiveMotionCount) > 0 &&
  hasZeroManifestRigIssues(run);

const hasZeroManifestRigIssues = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  typeof run?.faceTrackingRigIssueCount === "number" &&
  Number.isFinite(run.faceTrackingRigIssueCount) &&
  run.faceTrackingRigIssueCount === 0;

const isManifestChatReadoutPass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isManifestFeaturePass(run?.chatReadoutStatus) &&
  Number(run?.chatReadoutSpokenMessageCount) > 0 &&
  hasZeroManifestChatSpeechFailures(run);

const hasZeroManifestChatSpeechFailures = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  typeof run?.chatReadoutSpeechFailureCount === "number" &&
  Number.isFinite(run.chatReadoutSpeechFailureCount) &&
  run.chatReadoutSpeechFailureCount === 0;

const isManifestPlatformPublishingPass = (run: ValidationEvidenceManifestRun | undefined): boolean =>
  isManifestFeaturePass(run?.platformPublishingStatus) &&
  (run?.platformPublishingFreshnessStatus === "fresh" || run?.platformPublishingFreshnessStatus === "not-applicable");

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
