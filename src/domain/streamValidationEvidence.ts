import type { StreamDiagnostics } from "./streamDiagnostics";
import {
  createNativeRuntimeSessionSummary,
  normalizeNativeRuntimeSessionSummary,
  type StreamSessionNativeRuntimeSummary
} from "./streamSessionSummary";

export type StreamValidationDevicePlatform = "ios" | "android";
export type StreamValidationRunResult = "pass" | "warn" | "fail";

export interface StreamValidationFaceTrackingSummary {
  status: StreamDiagnostics["faceTracking"]["status"];
  enabled: boolean;
  inputMode: StreamDiagnostics["faceTracking"]["inputMode"];
  rigMode: StreamDiagnostics["faceTracking"]["rigMode"];
  runtimeStatus: StreamDiagnostics["faceTracking"]["runtimeStatus"];
  visibleAvatarCount: number;
  preparedPngTuberCount: number;
  activeMotionCount: number;
  summary: string;
  recommendation: string;
}

export interface StreamValidationRun {
  id: string;
  createdAt: string;
  devicePlatform: StreamValidationDevicePlatform;
  deviceName: string;
  osVersion: string;
  appBuild: string;
  networkProfile: string;
  targetPlatform: string;
  transport: string;
  result: StreamValidationRunResult;
  diagnosticStatus: StreamDiagnostics["status"];
  checklistStatus: StreamDiagnostics["validation"]["status"];
  sessionOutcome: NonNullable<StreamDiagnostics["session"]["lastSummary"]>["outcome"] | null;
  healthSampleCount: number;
  completedSessionCount: number;
  nativeRuntime: StreamSessionNativeRuntimeSummary | null;
  faceTracking: StreamValidationFaceTrackingSummary | null;
  platformPublishing: StreamDiagnostics["platformPublishing"] | null;
  validationItemStatuses: Array<{
    id: string;
    status: StreamDiagnostics["validation"]["items"][number]["status"];
  }>;
  summary: string;
  recommendation: string;
}

export interface StreamValidationRunInput {
  diagnostics: StreamDiagnostics;
  devicePlatform: StreamValidationDevicePlatform;
  deviceName?: string;
  osVersion?: string;
  appBuild?: string;
  networkProfile?: string;
  result?: StreamValidationRunResult;
  now?: Date;
  secrets?: string[];
}

export interface StreamValidationEvidenceSummary {
  totalRuns: number;
  eligibleRunCount: number;
  staleRunCount: number;
  passCount: number;
  warningCount: number;
  failureCount: number;
  nativeRuntimeRunCount: number;
  nativeRuntimeWarningCount: number;
  nativeRuntimeFailureCount: number;
  faceTrackingRunCount: number;
  faceTrackingWarningCount: number;
  faceTrackingReadyCount: number;
  platformPublishingRunCount: number;
  platformPublishingWarningCount: number;
  platformPublishingFailureCount: number;
  status: "none" | "partial" | "failing" | "ready" | "stale";
  iosPass: boolean;
  androidPass: boolean;
  appBuildMismatch: boolean;
  consistentAppBuild: string | null;
  passedTargetPlatforms: string[];
  latestRun: StreamValidationRun | null;
  latestEligibleRun: StreamValidationRun | null;
  latestPassingRun: StreamValidationRun | null;
  latestNativeRuntime: StreamSessionNativeRuntimeSummary | null;
  latestFaceTracking: StreamValidationFaceTrackingSummary | null;
  latestPlatformPublishing: StreamDiagnostics["platformPublishing"] | null;
  latestRunAgeDays: number | null;
  maxAgeDays: number;
  summary: string;
  recommendation: string;
}

export interface StreamValidationEvidenceOptions {
  now?: Date;
  maxAgeDays?: number;
  requiredTargetPlatform?: string;
  requiredTransport?: string;
  requiredAppBuild?: string;
}

export const maxStreamValidationRuns = 20;
export const defaultStreamValidationEvidenceMaxAgeDays = 14;

export const createStreamValidationRun = ({
  diagnostics,
  devicePlatform,
  deviceName = "",
  osVersion = "",
  appBuild = "",
  networkProfile = "",
  result = defaultResultForDiagnostics(diagnostics),
  now = new Date(),
  secrets = []
}: StreamValidationRunInput): StreamValidationRun => {
  const createdAt = now.toISOString();
  const sanitizedDeviceName = sanitizeStoredText(deviceName, secrets) || defaultDeviceName(devicePlatform);
  const sanitizedOsVersion = sanitizeStoredText(osVersion, secrets) || "-";
  const sanitizedAppBuild = sanitizeStoredText(appBuild, secrets) || "-";
  const sanitizedNetworkProfile = sanitizeStoredText(networkProfile, secrets) || "private test";
  const nativeRuntime =
    createNativeRuntimeSessionSummary(diagnostics.nativeRuntime) ??
    normalizeNativeRuntimeSessionSummary(diagnostics.session.lastSummary?.nativeRuntime);
  const faceTracking = createFaceTrackingValidationSummary(diagnostics.faceTracking, secrets);
  const platformPublishing = diagnostics.platformPublishing;
  const effectiveResult = createEffectiveValidationResult(result, nativeRuntime, faceTracking, platformPublishing);
  const runBase = {
    createdAt,
    devicePlatform,
    deviceName: sanitizedDeviceName,
    targetPlatform: diagnostics.target.platform,
    transport: diagnostics.target.protocol,
    result: effectiveResult
  };

  return {
    id: createValidationRunId(runBase),
    createdAt,
    devicePlatform,
    deviceName: sanitizedDeviceName,
    osVersion: sanitizedOsVersion,
    appBuild: sanitizedAppBuild,
    networkProfile: sanitizedNetworkProfile,
    targetPlatform: diagnostics.target.platform,
    transport: diagnostics.target.protocol,
    result: effectiveResult,
    diagnosticStatus: diagnostics.status,
    checklistStatus: diagnostics.validation.status,
    sessionOutcome: diagnostics.session.lastSummary?.outcome ?? null,
    healthSampleCount: diagnostics.history.sampleCount,
    completedSessionCount: diagnostics.session.summaries.length,
    nativeRuntime,
    faceTracking,
    platformPublishing,
    validationItemStatuses: diagnostics.validation.items.map((item) => ({
      id: item.id,
      status: item.status
    })),
    summary: createRunSummary(
      effectiveResult,
      sanitizedDeviceName,
      diagnostics.target.platform,
      diagnostics.validation.status,
      nativeRuntime,
      faceTracking,
      platformPublishing
    ),
    recommendation: createRunRecommendation(
      effectiveResult,
      diagnostics.validation.recommendedNextStep,
      nativeRuntime,
      faceTracking,
      platformPublishing
    )
  };
};

export const appendStreamValidationRun = (
  runs: StreamValidationRun[],
  run: StreamValidationRun,
  maxRuns = maxStreamValidationRuns
): StreamValidationRun[] => {
  const normalized = normalizeStreamValidationRuns(runs, maxRuns);
  if (normalized.some((item) => item.id === run.id)) {
    return normalized;
  }
  return normalizeStreamValidationRuns([run, ...normalized], maxRuns);
};

export const mergeStreamValidationRuns = (
  primaryRuns: StreamValidationRun[],
  secondaryRuns: unknown,
  maxRuns = maxStreamValidationRuns
): StreamValidationRun[] => {
  const merged: StreamValidationRun[] = [];
  const seen = new Set<string>();

  for (const run of [
    ...normalizeStreamValidationRuns(primaryRuns, maxRuns),
    ...normalizeStreamValidationRuns(secondaryRuns, maxRuns)
  ]) {
    if (seen.has(run.id)) {
      continue;
    }
    seen.add(run.id);
    merged.push(run);
  }

  return normalizeStreamValidationRuns(merged, maxRuns);
};

export const normalizeStreamValidationRuns = (
  value: unknown,
  maxRuns = maxStreamValidationRuns
): StreamValidationRun[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeStreamValidationRun)
    .filter((run): run is StreamValidationRun => Boolean(run))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, Math.max(1, maxRuns));
};

export const summarizeStreamValidationEvidence = (
  runs: StreamValidationRun[],
  options: StreamValidationEvidenceOptions = {}
): StreamValidationEvidenceSummary => {
  const normalized = normalizeStreamValidationRuns(runs);
  const now = normalizeNow(options.now);
  const maxAgeDays = normalizeMaxAgeDays(options.maxAgeDays);
  const requiredTargetPlatform = normalizeRequirement(options.requiredTargetPlatform);
  const requiredTransport = normalizeRequirement(options.requiredTransport).toUpperCase();
  const requiredAppBuild = normalizeRequirement(options.requiredAppBuild);
  const scopedRuns = normalized.filter((run) => {
    if (requiredTargetPlatform && run.targetPlatform !== requiredTargetPlatform) {
      return false;
    }
    if (requiredTransport && run.transport.toUpperCase() !== requiredTransport) {
      return false;
    }
    if (requiredAppBuild && run.appBuild !== requiredAppBuild) {
      return false;
    }
    return true;
  });
  const evaluatedRuns = scopedRuns.map((run) => ({
    run,
    ageDays: ageInDays(run.createdAt, now),
    isFresh: ageInDays(run.createdAt, now) <= maxAgeDays
  }));
  const eligibleRuns = evaluatedRuns.filter((item) => item.isFresh).map((item) => item.run);
  const totalRuns = normalized.length;
  const eligibleRunCount = eligibleRuns.length;
  const staleRunCount = evaluatedRuns.filter((item) => !item.isFresh).length;
  const passCount = normalized.filter((run) => run.result === "pass").length;
  const warningCount = normalized.filter((run) => run.result === "warn").length;
  const failureCount = normalized.filter((run) => run.result === "fail").length;
  const nativeRuntimeRuns = scopedRuns.filter((run) => run.nativeRuntime);
  const nativeRuntimeRunCount = nativeRuntimeRuns.length;
  const nativeRuntimeWarningCount = nativeRuntimeRuns.filter((run) => run.nativeRuntime?.status === "warn").length;
  const nativeRuntimeFailureCount = nativeRuntimeRuns.filter((run) => run.nativeRuntime?.status === "fail").length;
  const faceTrackingRuns = scopedRuns.filter((run) => run.faceTracking && run.faceTracking.status !== "info");
  const faceTrackingRunCount = faceTrackingRuns.length;
  const faceTrackingWarningCount = faceTrackingRuns.filter((run) => run.faceTracking?.status === "warn").length;
  const faceTrackingReadyCount = faceTrackingRuns.filter((run) => run.faceTracking?.status === "pass").length;
  const platformPublishingRuns = scopedRuns.filter((run) => run.platformPublishing && run.platformPublishing.status !== "info");
  const platformPublishingRunCount = platformPublishingRuns.length;
  const platformPublishingWarningCount = platformPublishingRuns.filter((run) => run.platformPublishing?.status === "warn").length;
  const platformPublishingFailureCount = platformPublishingRuns.filter((run) => run.platformPublishing?.status === "fail").length;
  const latestRun = normalized[0] ?? null;
  const latestEligibleRun = eligibleRuns[0] ?? null;
  const latestPassingRun = eligibleRuns.find((run) => run.result === "pass") ?? null;
  const latestNativeRuntime =
    eligibleRuns.find((run) => run.nativeRuntime)?.nativeRuntime ?? scopedRuns.find((run) => run.nativeRuntime)?.nativeRuntime ?? null;
  const latestFaceTracking =
    eligibleRuns.find((run) => run.faceTracking && run.faceTracking.status !== "info")?.faceTracking ??
    scopedRuns.find((run) => run.faceTracking && run.faceTracking.status !== "info")?.faceTracking ??
    null;
  const latestPlatformPublishing =
    eligibleRuns.find((run) => run.platformPublishing && run.platformPublishing.status !== "info")?.platformPublishing ??
    scopedRuns.find((run) => run.platformPublishing && run.platformPublishing.status !== "info")?.platformPublishing ??
    null;
  const latestDeviceRuns = latestRunsByDevicePlatform(eligibleRuns);
  const iosLatestRun = latestDeviceRuns.find((run) => run.devicePlatform === "ios") ?? null;
  const androidLatestRun = latestDeviceRuns.find((run) => run.devicePlatform === "android") ?? null;
  const iosPass = iosLatestRun?.result === "pass";
  const androidPass = androidLatestRun?.result === "pass";
  const appBuildMismatch = Boolean(
    iosPass &&
      androidPass &&
      androidLatestRun &&
      iosLatestRun &&
      normalizeBuildLabel(iosLatestRun.appBuild) !== normalizeBuildLabel(androidLatestRun.appBuild)
  );
  const consistentAppBuild = iosPass && androidPass && !appBuildMismatch && iosLatestRun ? iosLatestRun.appBuild : null;
  const latestTargetRuns = latestRunsByTargetPlatform(eligibleRuns);
  const passedTargetPlatforms = latestTargetRuns
    .filter((run) => run.result === "pass")
    .map((run) => run.targetPlatform);
  const status = createEvidenceStatus({
    totalRuns,
    eligibleRunCount,
    latestEligibleRun,
    latestDeviceRuns,
    iosPass,
    androidPass,
    appBuildMismatch
  });

  return {
    totalRuns,
    eligibleRunCount,
    staleRunCount,
    passCount,
    warningCount,
    failureCount,
    nativeRuntimeRunCount,
    nativeRuntimeWarningCount,
    nativeRuntimeFailureCount,
    faceTrackingRunCount,
    faceTrackingWarningCount,
    faceTrackingReadyCount,
    platformPublishingRunCount,
    platformPublishingWarningCount,
    platformPublishingFailureCount,
    status,
    iosPass,
    androidPass,
    appBuildMismatch,
    consistentAppBuild,
    passedTargetPlatforms,
    latestRun,
    latestEligibleRun,
    latestPassingRun,
    latestNativeRuntime,
    latestFaceTracking,
    latestPlatformPublishing,
    latestRunAgeDays: latestRun ? ageInDays(latestRun.createdAt, now) : null,
    maxAgeDays,
    summary: createEvidenceSummary(status, {
      totalRuns,
      eligibleRunCount,
      staleRunCount,
      passCount,
      warningCount,
      failureCount,
      iosPass,
      androidPass,
      appBuildMismatch,
      iosAppBuild: iosLatestRun?.appBuild ?? null,
      androidAppBuild: androidLatestRun?.appBuild ?? null,
      consistentAppBuild,
      maxAgeDays
    }),
    recommendation: createEvidenceRecommendation(status, latestEligibleRun ?? latestRun, { appBuildMismatch, maxAgeDays })
  };
};

const defaultResultForDiagnostics = (diagnostics: StreamDiagnostics): StreamValidationRunResult => {
  if (diagnostics.validation.status === "ready") {
    return "pass";
  }
  if (diagnostics.validation.status === "blocked") {
    return "fail";
  }
  return "warn";
};

const normalizeStreamValidationRun = (value: unknown): StreamValidationRun | null => {
  if (!isRecord(value)) {
    return null;
  }

  const devicePlatform = normalizeDevicePlatform(value.devicePlatform);
  const result = normalizeResult(value.result);
  const createdAt = normalizeDateString(value.createdAt);
  if (!devicePlatform || !result || !createdAt) {
    return null;
  }

  const targetPlatform = normalizeText(value.targetPlatform, "Unknown target");
  const transport = normalizeText(value.transport, "RTMP");
  const checklistStatus = normalizeChecklistStatus(value.checklistStatus);
  const diagnosticStatus = normalizeDiagnosticStatus(value.diagnosticStatus);
  const sessionOutcome = normalizeSessionOutcome(value.sessionOutcome);
  const nativeRuntime = normalizeNativeRuntimeSessionSummary(value.nativeRuntime);
  const faceTracking = normalizeFaceTrackingValidationSummary(value.faceTracking);
  const platformPublishing = normalizePlatformPublishingDiagnostics(value.platformPublishing);
  const normalized: StreamValidationRun = {
    id: normalizeText(value.id, createValidationRunId({
      createdAt,
      devicePlatform,
      deviceName: normalizeText(value.deviceName, defaultDeviceName(devicePlatform)),
      targetPlatform,
      transport,
      result
    })),
    createdAt,
    devicePlatform,
    deviceName: normalizeText(value.deviceName, defaultDeviceName(devicePlatform)),
    osVersion: normalizeText(value.osVersion, "-"),
    appBuild: normalizeText(value.appBuild, "-"),
    networkProfile: normalizeText(value.networkProfile, "private test"),
    targetPlatform,
    transport,
    result,
    diagnosticStatus,
    checklistStatus,
    sessionOutcome,
    healthSampleCount: normalizeCount(value.healthSampleCount),
    completedSessionCount: normalizeCount(value.completedSessionCount),
    nativeRuntime,
    faceTracking,
    platformPublishing,
    validationItemStatuses: normalizeValidationItemStatuses(value.validationItemStatuses),
    summary: normalizeText(
      value.summary,
      createRunSummary(
        result,
        normalizeText(value.deviceName, defaultDeviceName(devicePlatform)),
        targetPlatform,
        checklistStatus,
        nativeRuntime,
        faceTracking,
        platformPublishing
      )
    ),
    recommendation: normalizeText(
      value.recommendation,
      createRunRecommendation(
        result,
        "Run another private validation pass.",
        nativeRuntime,
        faceTracking,
        platformPublishing
      )
    )
  };

  return normalized;
};

const createEvidenceStatus = ({
  totalRuns,
  eligibleRunCount,
  latestEligibleRun,
  latestDeviceRuns,
  iosPass,
  androidPass,
  appBuildMismatch
}: {
  totalRuns: number;
  eligibleRunCount: number;
  latestEligibleRun: StreamValidationRun | null;
  latestDeviceRuns: StreamValidationRun[];
  iosPass: boolean;
  androidPass: boolean;
  appBuildMismatch: boolean;
}): StreamValidationEvidenceSummary["status"] => {
  if (totalRuns === 0) {
    return "none";
  }
  if (eligibleRunCount === 0) {
    return "stale";
  }
  if (latestEligibleRun?.result === "fail" || latestDeviceRuns.some((run) => run.result === "fail")) {
    return "failing";
  }
  if (iosPass && androidPass && !appBuildMismatch) {
    return "ready";
  }
  return "partial";
};

const latestRunsByDevicePlatform = (runs: StreamValidationRun[]): StreamValidationRun[] => {
  const latestRuns: StreamValidationRun[] = [];
  const seenPlatforms = new Set<StreamValidationDevicePlatform>();

  for (const run of runs) {
    if (seenPlatforms.has(run.devicePlatform)) {
      continue;
    }
    seenPlatforms.add(run.devicePlatform);
    latestRuns.push(run);
  }

  return latestRuns;
};

const latestRunsByTargetPlatform = (runs: StreamValidationRun[]): StreamValidationRun[] => {
  const latestRuns: StreamValidationRun[] = [];
  const seenTargets = new Set<string>();

  for (const run of runs) {
    if (seenTargets.has(run.targetPlatform)) {
      continue;
    }
    seenTargets.add(run.targetPlatform);
    latestRuns.push(run);
  }

  return latestRuns;
};

const createEvidenceSummary = (
  status: StreamValidationEvidenceSummary["status"],
  counts: {
    totalRuns: number;
    eligibleRunCount: number;
    staleRunCount: number;
    passCount: number;
    warningCount: number;
    failureCount: number;
    iosPass: boolean;
    androidPass: boolean;
    appBuildMismatch: boolean;
    iosAppBuild: string | null;
    androidAppBuild: string | null;
    consistentAppBuild: string | null;
    maxAgeDays: number;
  }
): string => {
  if (status === "none") {
    return "No physical validation runs retained yet.";
  }
  if (status === "stale") {
    return `Retained validation evidence is stale or does not match this target; no eligible run is within ${counts.maxAgeDays} days.`;
  }
  if (status === "failing") {
    return `${counts.failureCount} failed validation run${counts.failureCount === 1 ? "" : "s"} retained.`;
  }
  if (status === "ready") {
    return `Fresh physical validation baseline retained for iOS and Android on build ${counts.consistentAppBuild ?? "-"} across ${counts.eligibleRunCount} eligible run${counts.eligibleRunCount === 1 ? "" : "s"}.`;
  }
  if (counts.appBuildMismatch) {
    return `Physical validation app builds do not match: iOS ${counts.iosAppBuild ?? "-"} / Android ${counts.androidAppBuild ?? "-"}.`;
  }
  const covered = [counts.iosPass ? "iOS" : null, counts.androidPass ? "Android" : null].filter(Boolean).join(" and ");
  return covered
    ? `Physical validation is partial: ${covered} passed, remaining platform still needs evidence.`
    : `${counts.passCount} pass and ${counts.warningCount} warning validation run${counts.totalRuns === 1 ? "" : "s"} retained.`;
};

const createEvidenceRecommendation = (
  status: StreamValidationEvidenceSummary["status"],
  latestRun: StreamValidationRun | null,
  context: {
    appBuildMismatch: boolean;
    maxAgeDays: number;
  }
): string => {
  if (status === "ready") {
    return "Keep iOS and Android validation runs updated for every release candidate.";
  }
  if (status === "failing") {
    return latestRun?.recommendation ?? "Fix the failed physical validation run before public launch.";
  }
  if (context.appBuildMismatch) {
    return "Record fresh iOS and Android validation passes on the same release-candidate build.";
  }
  if (status === "stale") {
    return `Repeat private RTMPS validation on physical iOS and Android devices; retained evidence expires after ${context.maxAgeDays} days.`;
  }
  if (status === "partial") {
    return "Run the missing iOS or Android private RTMPS validation pass and retain the result.";
  }
  return "Record private RTMPS validation runs from physical iOS and Android devices.";
};

const createEffectiveValidationResult = (
  result: StreamValidationRunResult,
  nativeRuntime: StreamSessionNativeRuntimeSummary | null,
  faceTracking: StreamValidationFaceTrackingSummary | null,
  platformPublishing: StreamDiagnostics["platformPublishing"] | null
): StreamValidationRunResult => {
  if (result === "fail" || nativeRuntime?.status === "fail" || platformPublishing?.status === "fail") {
    return "fail";
  }
  if (
    result === "warn" ||
    nativeRuntime?.status === "warn" ||
    faceTracking?.status === "warn" ||
    platformPublishing?.status === "warn"
  ) {
    return "warn";
  }
  return "pass";
};

const createRunSummary = (
  result: StreamValidationRunResult,
  deviceName: string,
  targetPlatform: string,
  checklistStatus: StreamDiagnostics["validation"]["status"],
  nativeRuntime: StreamSessionNativeRuntimeSummary | null,
  faceTracking: StreamValidationFaceTrackingSummary | null,
  platformPublishing: StreamDiagnostics["platformPublishing"] | null
): string => {
  const prefix = result === "pass" ? "Passed" : result === "warn" ? "Needs review" : "Failed";
  return `${prefix} physical validation on ${deviceName} for ${targetPlatform}; checklist was ${checklistStatus}.${nativeRuntime ? ` ${nativeRuntime.summary}` : ""}${faceTracking && faceTracking.status !== "info" ? ` ${faceTracking.summary}` : ""}${platformPublishing && platformPublishing.status !== "info" ? ` ${platformPublishing.summary}` : ""}`;
};

const createRunRecommendation = (
  result: StreamValidationRunResult,
  fallbackRecommendation: string,
  nativeRuntime: StreamSessionNativeRuntimeSummary | null,
  faceTracking: StreamValidationFaceTrackingSummary | null,
  platformPublishing: StreamDiagnostics["platformPublishing"] | null
): string => {
  if (nativeRuntime?.status === "fail") {
    return nativeRuntime.recommendation;
  }
  if (platformPublishing?.status === "fail") {
    return platformPublishing.recommendation;
  }
  if (result === "pass") {
    return "Keep this run as release-candidate evidence and repeat on the other mobile platform.";
  }
  if (result === "fail") {
    return "Fix the validation failure, then repeat a private RTMPS run before public launch.";
  }
  if (nativeRuntime?.status === "warn") {
    return nativeRuntime.recommendation;
  }
  if (faceTracking?.status === "warn") {
    return faceTracking.recommendation;
  }
  if (platformPublishing?.status === "warn") {
    return platformPublishing.recommendation;
  }
  return fallbackRecommendation;
};

const createFaceTrackingValidationSummary = (
  faceTracking: StreamDiagnostics["faceTracking"],
  secrets: string[]
): StreamValidationFaceTrackingSummary => ({
  status: faceTracking.status,
  enabled: faceTracking.enabled,
  inputMode: faceTracking.inputMode,
  rigMode: faceTracking.rigMode,
  runtimeStatus: faceTracking.runtimeStatus,
  visibleAvatarCount: faceTracking.visibleAvatarCount,
  preparedPngTuberCount: faceTracking.preparedPngTuberCount,
  activeMotionCount: faceTracking.activeMotionCount,
  summary: sanitizeStoredText(faceTracking.summary, secrets),
  recommendation: sanitizeStoredText(faceTracking.recommendation, secrets)
});

const createValidationRunId = ({
  createdAt,
  devicePlatform,
  deviceName,
  targetPlatform,
  transport,
  result
}: {
  createdAt: string;
  devicePlatform: StreamValidationDevicePlatform;
  deviceName: string;
  targetPlatform: string;
  transport: string;
  result: StreamValidationRunResult;
}): string => [
  "validation",
  createdAt.replace(/[^0-9]/g, ""),
  devicePlatform,
  slug(deviceName),
  slug(targetPlatform),
  slug(transport),
  result
].join("-");

const defaultDeviceName = (platform: StreamValidationDevicePlatform): string =>
  platform === "ios" ? "iOS device" : "Android device";

const sanitizeStoredText = (value: string, secrets: string[]): string =>
  secrets.reduce((current, secret) => redactSecret(current, secret), clampText(value.trim()));

const redactSecret = (value: string, secret: string): string => {
  const candidates = secretCandidates(secret);
  if (candidates.length === 0) {
    return value;
  }
  return candidates.reduce((current, candidate) => current.split(candidate).join("[redacted]"), value);
};

const secretCandidates = (secret: string): string[] => {
  const trimmed = secret.trim().replace(/^\/+/, "");
  const lastSegment = trimmed.split("/").filter(Boolean).at(-1) ?? "";
  return [...new Set([trimmed, lastSegment, encodeURIComponent(trimmed), encodeURIComponent(lastSegment)].filter(Boolean))].sort(
    (left, right) => right.length - left.length
  );
};

const normalizeText = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim() ? clampText(value.trim()) : fallback;

const clampText = (value: string): string => value.slice(0, 96);

const normalizeCount = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

const normalizeDateString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

const normalizeNow = (value: Date | undefined): Date => {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  return new Date();
};

const normalizeMaxAgeDays = (value: number | undefined): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : defaultStreamValidationEvidenceMaxAgeDays;

const normalizeRequirement = (value: string | undefined): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeBuildLabel = (value: string): string => value.trim().toLowerCase();

const ageInDays = (createdAt: string, now: Date): number => {
  const ageMs = Math.max(0, now.getTime() - Date.parse(createdAt));
  return Math.floor(ageMs / 86_400_000);
};

const normalizeDevicePlatform = (value: unknown): StreamValidationDevicePlatform | null =>
  value === "ios" || value === "android" ? value : null;

const normalizeResult = (value: unknown): StreamValidationRunResult | null =>
  value === "pass" || value === "warn" || value === "fail" ? value : null;

const normalizeChecklistStatus = (value: unknown): StreamDiagnostics["validation"]["status"] =>
  value === "ready" || value === "needs-test" || value === "blocked" ? value : "needs-test";

const normalizeDiagnosticStatus = (value: unknown): StreamDiagnostics["status"] =>
  value === "pass" || value === "warn" || value === "fail" || value === "info" ? value : "info";

const normalizeSessionOutcome = (value: unknown): StreamValidationRun["sessionOutcome"] =>
  value === "clean" || value === "warn" || value === "fail" ? value : null;

const normalizeFaceTrackingValidationSummary = (value: unknown): StreamValidationFaceTrackingSummary | null => {
  if (!isRecord(value)) {
    return null;
  }
  return {
    status: normalizeFaceTrackingDiagnosticStatus(value.status),
    enabled: value.enabled === true,
    inputMode: value.inputMode === "native-camera" ? "native-camera" : "simulated",
    rigMode: value.rigMode === "layered-2d" ? "layered-2d" : "still-image-2d",
    runtimeStatus: normalizeFaceTrackingRuntimeStatus(value.runtimeStatus),
    visibleAvatarCount: normalizeCount(value.visibleAvatarCount),
    preparedPngTuberCount: normalizeCount(value.preparedPngTuberCount),
    activeMotionCount: normalizeCount(value.activeMotionCount),
    summary: normalizeText(value.summary, "No face tracking validation evidence retained."),
    recommendation: normalizeText(value.recommendation, "Repeat face tracking validation on a physical mobile device.")
  };
};

const normalizeFaceTrackingDiagnosticStatus = (value: unknown): StreamValidationFaceTrackingSummary["status"] =>
  value === "pass" || value === "warn" || value === "info" ? value : "info";

const normalizeFaceTrackingRuntimeStatus = (value: unknown): StreamValidationFaceTrackingSummary["runtimeStatus"] =>
  value === "disabled" || value === "tracking" || value === "lost" || value === "unavailable" ? value : "unavailable";

const normalizePlatformPublishingDiagnostics = (value: unknown): StreamDiagnostics["platformPublishing"] | null => {
  if (!isRecord(value)) {
    return null;
  }
  const platform =
    value.platform === "youtube-live" || value.platform === "twitch" || value.platform === "custom"
      ? value.platform
      : null;
  const status = normalizeDiagnosticStatus(value.status);
  if (!platform) {
    return null;
  }
  return {
    platform,
    status,
    summary: normalizeText(value.summary, "No platform publishing dashboard status retained."),
    recommendation: normalizeText(value.recommendation, "Refresh platform publishing status during private validation."),
    youtube: normalizeYouTubePublishingDiagnostics(value.youtube),
    twitch: normalizeTwitchPublishingDiagnostics(value.twitch)
  };
};

const normalizeYouTubePublishingDiagnostics = (
  value: unknown
): StreamDiagnostics["platformPublishing"]["youtube"] => {
  if (!isRecord(value)) {
    return null;
  }
  return {
    hasBroadcastId: value.hasBroadcastId === true,
    hasStreamId: value.hasStreamId === true,
    broadcastStatus: normalizeText(value.broadcastStatus, ""),
    streamStatus: normalizeText(value.streamStatus, ""),
    healthStatus: normalizeText(value.healthStatus, ""),
    healthIssueCount: normalizeCount(value.healthIssueCount)
  };
};

const normalizeTwitchPublishingDiagnostics = (
  value: unknown
): StreamDiagnostics["platformPublishing"]["twitch"] => {
  if (!isRecord(value)) {
    return null;
  }
  return {
    liveStatus: normalizeText(value.liveStatus, ""),
    viewerCount: normalizeCount(value.viewerCount),
    hasCategory: value.hasCategory === true,
    hasCategoryId: value.hasCategoryId === true,
    language: normalizeText(value.language, ""),
    startedAt: normalizeText(value.startedAt, "")
  };
};

const normalizeValidationItemStatuses = (value: unknown): StreamValidationRun["validationItemStatuses"] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const id = normalizeText(item.id, "");
    const status = item.status;
    if (!id || (status !== "pass" && status !== "warn" && status !== "fail" && status !== "pending")) {
      return [];
    }
    return [{ id, status }];
  });
};

const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "unknown";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
