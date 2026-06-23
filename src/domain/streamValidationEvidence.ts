import type { StreamDiagnostics } from "./streamDiagnostics";
import type { AudioOutputRouteKind, AudioRouteMonitorStatus } from "./audioRoute";
import {
  createNativeRuntimeSessionSummary,
  normalizeNativeRuntimeSessionSummary,
  type StreamSessionNativeRuntimeSummary
} from "./streamSessionSummary";

export type StreamValidationDevicePlatform = "ios" | "android";
export type StreamValidationRunResult = "pass" | "warn" | "fail";
export type StreamValidationFeatureStatus = "pass" | "warn" | "fail" | "pending";

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

export interface StreamValidationAudioSummary {
  status: StreamValidationFeatureStatus;
  micEffectsEnabled: boolean;
  presetId: string;
  inputGainDb: number;
  compression: number;
  monitorEnabled: boolean;
  monitorVolume: number;
  monitorHeadphonesOnly: boolean;
  monitorRouteStatus: AudioRouteMonitorStatus;
  outputRoute: AudioOutputRouteKind;
  outputName: string;
  headphonesConnected: boolean;
  routeCheckedAt: string | null;
  routeStale: boolean;
  nativeMonitorReported: boolean;
  nativeMonitorRunning: boolean;
  nativeMonitorRoute: string;
  nativeMonitorOutputName: string;
  nativeMonitorHeadphonesConnected: boolean;
  nativeMonitorWrittenFrames: number;
  nativeMonitorDroppedFrames: number;
  nativeMonitorWrittenBuffers: number;
  nativeMonitorDroppedBuffers: number;
  levelSampleCount: number;
  averageLevel: number;
  peakLevel: number;
  activeLevelPercent: number;
  clippedLevelCount: number;
  summary: string;
  recommendation: string;
}

export interface StreamValidationChatReadoutSummary {
  status: StreamValidationFeatureStatus;
  platformChatEnabled: boolean;
  readerEnabled: boolean;
  connectionPhase: string;
  connectionLabel: string;
  spokenMessageCount: number;
  speechFailureCount: number;
  summary: string;
  recommendation: string;
}

export interface StreamValidationQualityAutomationSummary {
  status: StreamValidationFeatureStatus;
  eventCount: number;
  liveUpdateCount: number;
  nextTargetCount: number;
  failureCount: number;
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
  audio: StreamValidationAudioSummary | null;
  chatReadout: StreamValidationChatReadoutSummary | null;
  qualityAutomation: StreamValidationQualityAutomationSummary | null;
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
  faceTrackingIosPass: boolean;
  faceTrackingAndroidPass: boolean;
  audioRunCount: number;
  audioReadyCount: number;
  audioWarningCount: number;
  audioIosPass: boolean;
  audioAndroidPass: boolean;
  chatReadoutRunCount: number;
  chatReadoutReadyCount: number;
  chatReadoutWarningCount: number;
  chatReadoutIosPass: boolean;
  chatReadoutAndroidPass: boolean;
  qualityAutomationRunCount: number;
  qualityAutomationLiveUpdateCount: number;
  qualityAutomationNextTargetCount: number;
  qualityAutomationFailureCount: number;
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
  latestAudio: StreamValidationAudioSummary | null;
  latestChatReadout: StreamValidationChatReadoutSummary | null;
  latestQualityAutomation: StreamValidationQualityAutomationSummary | null;
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

export const formatStreamValidationRunAudioLabel = (run: StreamValidationRun): string | null => {
  if (!run.audio) {
    return null;
  }

  const audio = run.audio;
  const nativeMonitor = audio.nativeMonitorReported
    ? ` / native monitor ${audio.nativeMonitorRunning ? "running" : "reported"} ${audio.nativeMonitorWrittenFrames}/${audio.nativeMonitorDroppedFrames} frames ${audio.nativeMonitorOutputName}`
    : "";
  return `audio ${audio.status} / ${audio.presetId} / monitor ${audio.monitorEnabled ? "on" : "off"} / headphones-only ${
    audio.monitorHeadphonesOnly ? "yes" : "no"
  } / route ${audio.monitorRouteStatus} ${audio.outputName} / headphones ${audio.headphonesConnected ? "yes" : "no"} / stale ${
    audio.routeStale ? "yes" : "no"
  }${nativeMonitor} / samples ${audio.levelSampleCount} / peak ${Math.round(audio.peakLevel * 100)}%`;
};

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
  const audio = createAudioValidationSummary(diagnostics, secrets);
  const chatReadout = createChatReadoutValidationSummary(diagnostics, secrets);
  const qualityAutomation = createQualityAutomationValidationSummary(diagnostics, secrets);
  const platformPublishing = diagnostics.platformPublishing;
  const effectiveResult = createEffectiveValidationResult(result, nativeRuntime, faceTracking, audio, chatReadout, platformPublishing);
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
    audio,
    chatReadout,
    qualityAutomation,
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
      audio,
      chatReadout,
      qualityAutomation,
      platformPublishing
    ),
    recommendation: createRunRecommendation(
      effectiveResult,
      diagnostics.validation.recommendedNextStep,
      nativeRuntime,
      faceTracking,
      audio,
      chatReadout,
      qualityAutomation,
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
  const audioRuns = scopedRuns.filter((run) => run.audio);
  const audioRunCount = audioRuns.length;
  const audioReadyCount = audioRuns.filter((run) => run.audio?.status === "pass").length;
  const audioWarningCount = audioRuns.filter((run) => run.audio?.status !== "pass").length;
  const chatReadoutRuns = scopedRuns.filter((run) => run.chatReadout);
  const chatReadoutRunCount = chatReadoutRuns.length;
  const chatReadoutReadyCount = chatReadoutRuns.filter((run) => run.chatReadout?.status === "pass").length;
  const chatReadoutWarningCount = chatReadoutRuns.filter((run) => run.chatReadout?.status !== "pass").length;
  const qualityAutomationRuns = scopedRuns.filter((run) => run.qualityAutomation);
  const qualityAutomationRunCount = qualityAutomationRuns.length;
  const qualityAutomationLiveUpdateCount = qualityAutomationRuns.reduce(
    (total, run) => total + (run.qualityAutomation?.liveUpdateCount ?? 0),
    0
  );
  const qualityAutomationNextTargetCount = qualityAutomationRuns.reduce(
    (total, run) => total + (run.qualityAutomation?.nextTargetCount ?? 0),
    0
  );
  const qualityAutomationFailureCount = qualityAutomationRuns.reduce(
    (total, run) => total + (run.qualityAutomation?.failureCount ?? 0),
    0
  );
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
  const latestAudio =
    eligibleRuns.find((run) => run.audio)?.audio ?? scopedRuns.find((run) => run.audio)?.audio ?? null;
  const latestChatReadout =
    eligibleRuns.find((run) => run.chatReadout)?.chatReadout ??
    scopedRuns.find((run) => run.chatReadout)?.chatReadout ??
    null;
  const latestQualityAutomation =
    eligibleRuns.find((run) => run.qualityAutomation)?.qualityAutomation ??
    scopedRuns.find((run) => run.qualityAutomation)?.qualityAutomation ??
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
  const faceTrackingIosPass = iosPass && isAvatarMotionEvidencePass(iosLatestRun?.faceTracking);
  const faceTrackingAndroidPass = androidPass && isAvatarMotionEvidencePass(androidLatestRun?.faceTracking);
  const audioIosPass = iosPass && isFeatureEvidencePass(iosLatestRun?.audio);
  const audioAndroidPass = androidPass && isFeatureEvidencePass(androidLatestRun?.audio);
  const chatReadoutIosPass = iosPass && isFeatureEvidencePass(iosLatestRun?.chatReadout);
  const chatReadoutAndroidPass = androidPass && isFeatureEvidencePass(androidLatestRun?.chatReadout);
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
    appBuildMismatch,
    faceTrackingIosPass,
    faceTrackingAndroidPass,
    audioIosPass,
    audioAndroidPass,
    chatReadoutIosPass,
    chatReadoutAndroidPass
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
    faceTrackingIosPass,
    faceTrackingAndroidPass,
    audioRunCount,
    audioReadyCount,
    audioWarningCount,
    audioIosPass,
    audioAndroidPass,
    chatReadoutRunCount,
    chatReadoutReadyCount,
    chatReadoutWarningCount,
    chatReadoutIosPass,
    chatReadoutAndroidPass,
    qualityAutomationRunCount,
    qualityAutomationLiveUpdateCount,
    qualityAutomationNextTargetCount,
    qualityAutomationFailureCount,
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
    latestAudio,
    latestChatReadout,
    latestQualityAutomation,
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
      faceTrackingIosPass,
      faceTrackingAndroidPass,
      audioIosPass,
      audioAndroidPass,
      chatReadoutIosPass,
      chatReadoutAndroidPass,
      appBuildMismatch,
      iosAppBuild: iosLatestRun?.appBuild ?? null,
      androidAppBuild: androidLatestRun?.appBuild ?? null,
      consistentAppBuild,
      maxAgeDays
    }),
    recommendation: createEvidenceRecommendation(status, latestEligibleRun ?? latestRun, {
      appBuildMismatch,
      maxAgeDays,
      iosPass,
      androidPass,
      faceTrackingIosPass,
      faceTrackingAndroidPass,
      audioIosPass,
      audioAndroidPass,
      chatReadoutIosPass,
      chatReadoutAndroidPass
    })
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
  const audio = normalizeAudioValidationSummary(value.audio);
  const chatReadout = normalizeChatReadoutValidationSummary(value.chatReadout);
  const qualityAutomation = normalizeQualityAutomationValidationSummary(value.qualityAutomation);
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
    audio,
    chatReadout,
    qualityAutomation,
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
        audio,
        chatReadout,
        qualityAutomation,
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
        audio,
        chatReadout,
        qualityAutomation,
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
  appBuildMismatch,
  faceTrackingIosPass,
  faceTrackingAndroidPass,
  audioIosPass,
  audioAndroidPass,
  chatReadoutIosPass,
  chatReadoutAndroidPass
}: {
  totalRuns: number;
  eligibleRunCount: number;
  latestEligibleRun: StreamValidationRun | null;
  latestDeviceRuns: StreamValidationRun[];
  iosPass: boolean;
  androidPass: boolean;
  appBuildMismatch: boolean;
  faceTrackingIosPass: boolean;
  faceTrackingAndroidPass: boolean;
  audioIosPass: boolean;
  audioAndroidPass: boolean;
  chatReadoutIosPass: boolean;
  chatReadoutAndroidPass: boolean;
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
  if (
    iosPass &&
    androidPass &&
    !appBuildMismatch &&
    faceTrackingIosPass &&
    faceTrackingAndroidPass &&
    audioIosPass &&
    audioAndroidPass &&
    chatReadoutIosPass &&
    chatReadoutAndroidPass
  ) {
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

const isAvatarMotionEvidencePass = (faceTracking: StreamValidationFaceTrackingSummary | null | undefined): boolean =>
  faceTracking?.status === "pass" && faceTracking.activeMotionCount > 0;

const isFeatureEvidencePass = (
  feature: { status: StreamValidationFeatureStatus } | null | undefined
): boolean => feature?.status === "pass";

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
    faceTrackingIosPass: boolean;
    faceTrackingAndroidPass: boolean;
    audioIosPass: boolean;
    audioAndroidPass: boolean;
    chatReadoutIosPass: boolean;
    chatReadoutAndroidPass: boolean;
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
  if (counts.iosPass && counts.androidPass && (!counts.faceTrackingIosPass || !counts.faceTrackingAndroidPass)) {
    return `Physical validation is partial: iOS and Android passed, but retained VTuber avatar-motion evidence is incomplete: iOS ${counts.faceTrackingIosPass ? "pass" : "missing"} / Android ${counts.faceTrackingAndroidPass ? "pass" : "missing"}.`;
  }
  if (counts.iosPass && counts.androidPass && (!counts.audioIosPass || !counts.audioAndroidPass)) {
    return `Physical validation is partial: iOS and Android passed, but retained mic FX/headphone monitor evidence is incomplete: iOS ${counts.audioIosPass ? "pass" : "missing"} / Android ${counts.audioAndroidPass ? "pass" : "missing"}.`;
  }
  if (counts.iosPass && counts.androidPass && (!counts.chatReadoutIosPass || !counts.chatReadoutAndroidPass)) {
    return `Physical validation is partial: iOS and Android passed, but retained chat readout evidence is incomplete: iOS ${counts.chatReadoutIosPass ? "pass" : "missing"} / Android ${counts.chatReadoutAndroidPass ? "pass" : "missing"}.`;
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
    iosPass: boolean;
    androidPass: boolean;
    faceTrackingIosPass: boolean;
    faceTrackingAndroidPass: boolean;
    audioIosPass: boolean;
    audioAndroidPass: boolean;
    chatReadoutIosPass: boolean;
    chatReadoutAndroidPass: boolean;
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
  if (context.iosPass && context.androidPass && (!context.faceTrackingIosPass || !context.faceTrackingAndroidPass)) {
    return "Record fresh iOS and Android validation runs with native camera tracking active and visible PNGTuber motion applied.";
  }
  if (context.iosPass && context.androidPass && (!context.audioIosPass || !context.audioAndroidPass)) {
    return "Record fresh iOS and Android validation runs with mic effects enabled and headphones-only self-monitoring verified.";
  }
  if (context.iosPass && context.androidPass && (!context.chatReadoutIosPass || !context.chatReadoutAndroidPass)) {
    return "Record fresh iOS and Android validation runs with YouTube/Twitch chat connected and readout speaking a sample message.";
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
  audio: StreamValidationAudioSummary | null,
  chatReadout: StreamValidationChatReadoutSummary | null,
  platformPublishing: StreamDiagnostics["platformPublishing"] | null
): StreamValidationRunResult => {
  if (
    result === "fail" ||
    nativeRuntime?.status === "fail" ||
    audio?.status === "fail" ||
    chatReadout?.status === "fail" ||
    platformPublishing?.status === "fail"
  ) {
    return "fail";
  }
  if (
    result === "warn" ||
    nativeRuntime?.status === "warn" ||
    faceTracking?.status === "warn" ||
    !isFeatureEvidencePass(audio) ||
    !isFeatureEvidencePass(chatReadout) ||
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
  audio: StreamValidationAudioSummary | null,
  chatReadout: StreamValidationChatReadoutSummary | null,
  qualityAutomation: StreamValidationQualityAutomationSummary | null,
  platformPublishing: StreamDiagnostics["platformPublishing"] | null
): string => {
  const prefix = result === "pass" ? "Passed" : result === "warn" ? "Needs review" : "Failed";
  return `${prefix} physical validation on ${deviceName} for ${targetPlatform}; checklist was ${checklistStatus}.${nativeRuntime ? ` ${nativeRuntime.summary}` : ""}${faceTracking && faceTracking.status !== "info" ? ` ${faceTracking.summary}` : ""}${audio ? ` ${audio.summary}` : ""}${chatReadout ? ` ${chatReadout.summary}` : ""}${qualityAutomation ? ` ${qualityAutomation.summary}` : ""}${platformPublishing && platformPublishing.status !== "info" ? ` ${platformPublishing.summary}` : ""}`;
};

const createRunRecommendation = (
  result: StreamValidationRunResult,
  fallbackRecommendation: string,
  nativeRuntime: StreamSessionNativeRuntimeSummary | null,
  faceTracking: StreamValidationFaceTrackingSummary | null,
  audio: StreamValidationAudioSummary | null,
  chatReadout: StreamValidationChatReadoutSummary | null,
  qualityAutomation: StreamValidationQualityAutomationSummary | null,
  platformPublishing: StreamDiagnostics["platformPublishing"] | null
): string => {
  if (nativeRuntime?.status === "fail") {
    return nativeRuntime.recommendation;
  }
  if (audio?.status === "fail") {
    return audio.recommendation;
  }
  if (chatReadout?.status === "fail") {
    return chatReadout.recommendation;
  }
  if (qualityAutomation?.status === "fail") {
    return qualityAutomation.recommendation;
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
  if (audio && audio.status !== "pass") {
    return audio.recommendation;
  }
  if (chatReadout && chatReadout.status !== "pass") {
    return chatReadout.recommendation;
  }
  if (qualityAutomation?.status === "warn") {
    return qualityAutomation.recommendation;
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

const createAudioValidationSummary = (
  diagnostics: StreamDiagnostics,
  secrets: string[]
): StreamValidationAudioSummary => {
  const item = findRunbookItem(diagnostics, "audio");
  const audioLevel = diagnostics.session.lastSummary?.audioLevel ?? null;
  const nativeMonitor = createNativeMonitorEvidence(diagnostics);
  return {
    status: item?.status ?? "pending",
    micEffectsEnabled: diagnostics.audio.micEffectsEnabled,
    presetId: diagnostics.audio.presetId,
    inputGainDb: diagnostics.audio.inputGainDb,
    compression: diagnostics.audio.compression,
    monitorEnabled: diagnostics.audio.monitorEnabled,
    monitorVolume: diagnostics.audio.monitorVolume,
    monitorHeadphonesOnly: diagnostics.audio.monitorHeadphonesOnly,
    monitorRouteStatus: diagnostics.audio.monitorSafety.status,
    outputRoute: diagnostics.audio.monitorSafety.route,
    outputName: diagnostics.audio.monitorSafety.outputName,
    headphonesConnected: diagnostics.audio.monitorSafety.headphonesConnected,
    routeCheckedAt: diagnostics.audio.monitorSafety.checkedAt,
    routeStale: diagnostics.audio.monitorSafety.stale,
    nativeMonitorReported: nativeMonitor.nativeMonitorReported,
    nativeMonitorRunning: nativeMonitor.nativeMonitorRunning,
    nativeMonitorRoute: nativeMonitor.nativeMonitorRoute,
    nativeMonitorOutputName: nativeMonitor.nativeMonitorOutputName,
    nativeMonitorHeadphonesConnected: nativeMonitor.nativeMonitorHeadphonesConnected,
    nativeMonitorWrittenFrames: nativeMonitor.nativeMonitorWrittenFrames,
    nativeMonitorDroppedFrames: nativeMonitor.nativeMonitorDroppedFrames,
    nativeMonitorWrittenBuffers: nativeMonitor.nativeMonitorWrittenBuffers,
    nativeMonitorDroppedBuffers: nativeMonitor.nativeMonitorDroppedBuffers,
    levelSampleCount: audioLevel?.sampleCount ?? 0,
    averageLevel: audioLevel?.averageLevel ?? 0,
    peakLevel: audioLevel?.peakLevel ?? 0,
    activeLevelPercent: audioLevel?.activePercent ?? 0,
    clippedLevelCount: audioLevel?.clippedSampleCount ?? 0,
    summary: sanitizeStoredText(
      `${audioLevel && audioLevel.sampleCount > 0 ? `${audioLevel.summary} ` : ""}${
        item?.detail ?? "No mic FX/headphone monitor validation retained."
      }${nativeMonitor.nativeMonitorReported ? ` Native monitor wrote ${nativeMonitor.nativeMonitorWrittenFrames} frame${nativeMonitor.nativeMonitorWrittenFrames === 1 ? "" : "s"} across ${nativeMonitor.nativeMonitorWrittenBuffers} buffer${nativeMonitor.nativeMonitorWrittenBuffers === 1 ? "" : "s"} with ${nativeMonitor.nativeMonitorDroppedFrames} dropped frame${nativeMonitor.nativeMonitorDroppedFrames === 1 ? "" : "s"} on ${nativeMonitor.nativeMonitorOutputName}.` : ""}`,
      secrets
    ),
    recommendation: sanitizeStoredText(item?.action ?? "Repeat validation with mic effects and headphone monitoring checked.", secrets)
  };
};

const createNativeMonitorEvidence = (
  diagnostics: StreamDiagnostics
): Pick<
  StreamValidationAudioSummary,
  | "nativeMonitorReported"
  | "nativeMonitorRunning"
  | "nativeMonitorRoute"
  | "nativeMonitorOutputName"
  | "nativeMonitorHeadphonesConnected"
  | "nativeMonitorWrittenFrames"
  | "nativeMonitorDroppedFrames"
  | "nativeMonitorWrittenBuffers"
  | "nativeMonitorDroppedBuffers"
> => {
  const current = diagnostics.nativeRuntime?.audioProcessing;
  if (current) {
    return {
      nativeMonitorReported: true,
      nativeMonitorRunning: current.monitorRunning,
      nativeMonitorRoute: current.monitorRoute,
      nativeMonitorOutputName: current.monitorOutputName,
      nativeMonitorHeadphonesConnected: current.monitorHeadphonesConnected,
      nativeMonitorWrittenFrames: normalizeCount(current.monitorWrittenFrames),
      nativeMonitorDroppedFrames: normalizeCount(current.monitorDroppedFrames),
      nativeMonitorWrittenBuffers: normalizeCount(current.monitorWrittenBuffers),
      nativeMonitorDroppedBuffers: normalizeCount(current.monitorDroppedBuffers)
    };
  }

  const retained = diagnostics.session.lastSummary?.nativeRuntime;
  if (retained?.monitorEnabled || retained?.monitorWrittenFrames || retained?.monitorDroppedFrames) {
    return {
      nativeMonitorReported: true,
      nativeMonitorRunning: retained.monitorRunning,
      nativeMonitorRoute: retained.monitorRoute,
      nativeMonitorOutputName: retained.monitorOutputName,
      nativeMonitorHeadphonesConnected: retained.monitorHeadphonesConnected,
      nativeMonitorWrittenFrames: retained.monitorWrittenFrames,
      nativeMonitorDroppedFrames: retained.monitorDroppedFrames,
      nativeMonitorWrittenBuffers: retained.monitorWrittenBuffers,
      nativeMonitorDroppedBuffers: retained.monitorDroppedBuffers
    };
  }

  return {
    nativeMonitorReported: false,
    nativeMonitorRunning: false,
    nativeMonitorRoute: "unknown",
    nativeMonitorOutputName: "Unknown",
    nativeMonitorHeadphonesConnected: false,
    nativeMonitorWrittenFrames: 0,
    nativeMonitorDroppedFrames: 0,
    nativeMonitorWrittenBuffers: 0,
    nativeMonitorDroppedBuffers: 0
  };
};

const createChatReadoutValidationSummary = (
  diagnostics: StreamDiagnostics,
  secrets: string[]
): StreamValidationChatReadoutSummary => {
  const item = findRunbookItem(diagnostics, "chat");
  const lastSummary = diagnostics.session.lastSummary;
  return {
    status: item?.status ?? "pending",
    platformChatEnabled: diagnostics.chatReadout.platformChatEnabled,
    readerEnabled: diagnostics.chatReadout.readerEnabled,
    connectionPhase: diagnostics.chatReadout.connectionPhase,
    connectionLabel: diagnostics.chatReadout.connectionLabel,
    spokenMessageCount: lastSummary?.chatSpeechSpokenCount ?? 0,
    speechFailureCount: lastSummary?.chatSpeechFailureCount ?? 0,
    summary: sanitizeStoredText(
      `${item?.detail ?? "No chat readout validation retained."}${
        lastSummary ? ` Chat speech retained ${lastSummary.chatSpeechSpokenCount} spoken / ${lastSummary.chatSpeechFailureCount} failed.` : ""
      }`,
      secrets
    ),
    recommendation: sanitizeStoredText(item?.action ?? "Repeat validation with YouTube/Twitch chat connected and spoken.", secrets)
  };
};

const createQualityAutomationValidationSummary = (
  diagnostics: StreamDiagnostics,
  secrets: string[]
): StreamValidationQualityAutomationSummary | null => {
  const currentEvents = summarizeQualityAutomationEvents(diagnostics.session.events);
  const lastSummary = diagnostics.session.lastSummary;
  const eventCount = Math.max(currentEvents.eventCount, lastSummary?.qualityEventCount ?? 0);
  const liveUpdateCount = Math.max(currentEvents.liveUpdateCount, lastSummary?.qualityLiveUpdateCount ?? 0);
  const nextTargetCount = Math.max(currentEvents.nextTargetCount, lastSummary?.qualityNextTargetCount ?? 0);
  const failureCount = Math.max(currentEvents.failureCount, lastSummary?.qualityUpdateFailureCount ?? 0);

  if (eventCount === 0 && liveUpdateCount === 0 && nextTargetCount === 0 && failureCount === 0) {
    return null;
  }

  const status: StreamValidationFeatureStatus =
    failureCount > 0 ? "fail" : liveUpdateCount > 0 || nextTargetCount > 0 ? "pass" : "warn";
  const summary = `Quality automation retained ${eventCount} event${eventCount === 1 ? "" : "s"}: ${liveUpdateCount} live update${liveUpdateCount === 1 ? "" : "s"}, ${nextTargetCount} next-start target${nextTargetCount === 1 ? "" : "s"}, ${failureCount} failed.`;
  const recommendation =
    failureCount > 0
      ? "Repeat validation after fixing native live quality updates."
      : liveUpdateCount > 0
        ? "Keep this run as evidence that live bitrate/FPS relief can apply during a stream."
        : nextTargetCount > 0
          ? "Keep this run as evidence that the next-start quality fallback was armed and applied."
          : "Repeat validation under a controlled weak-network condition to prove automatic quality relief.";

  return {
    status,
    eventCount,
    liveUpdateCount,
    nextTargetCount,
    failureCount,
    summary: sanitizeStoredText(summary, secrets),
    recommendation: sanitizeStoredText(recommendation, secrets)
  };
};

const summarizeQualityAutomationEvents = (
  events: StreamDiagnostics["session"]["events"]
): Pick<StreamValidationQualityAutomationSummary, "eventCount" | "liveUpdateCount" | "nextTargetCount" | "failureCount"> => {
  const qualityEvents = events.filter((event) => event.kind === "quality");
  return {
    eventCount: qualityEvents.length,
    liveUpdateCount: qualityEvents.filter((event) => event.title === "Live quality target lowered").length,
    nextTargetCount: qualityEvents.filter((event) => event.title === "Auto quality target lowered").length,
    failureCount: qualityEvents.filter((event) => event.severity === "fail" || event.title === "Live quality update failed").length
  };
};

const findRunbookItem = (
  diagnostics: StreamDiagnostics,
  phase: StreamDiagnostics["validationRunbook"]["items"][number]["phase"]
): StreamDiagnostics["validationRunbook"]["items"][number] | null =>
  diagnostics.validationRunbook.items.find((item) => item.phase === phase) ?? null;

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

const normalizeFiniteNumber = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

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

const normalizeAudioValidationSummary = (value: unknown): StreamValidationAudioSummary | null => {
  if (!isRecord(value)) {
    return null;
  }
  return {
    status: normalizeFeatureStatus(value.status),
    micEffectsEnabled: value.micEffectsEnabled === true,
    presetId: normalizeText(value.presetId, "unknown"),
    inputGainDb: normalizeFiniteNumber(value.inputGainDb, 0, -12, 12),
    compression: normalizeFiniteNumber(value.compression, 0, 0, 1),
    monitorEnabled: value.monitorEnabled === true,
    monitorVolume: normalizeFiniteNumber(value.monitorVolume, 0, 0, 1),
    monitorHeadphonesOnly: value.monitorHeadphonesOnly === true,
    monitorRouteStatus: normalizeAudioRouteStatus(value.monitorRouteStatus),
    outputRoute: normalizeAudioOutputRoute(value.outputRoute),
    outputName: normalizeText(value.outputName, "Unknown output"),
    headphonesConnected: value.headphonesConnected === true,
    routeCheckedAt: normalizeDateString(value.routeCheckedAt),
    routeStale: value.routeStale === true,
    nativeMonitorReported: value.nativeMonitorReported === true,
    nativeMonitorRunning: value.nativeMonitorRunning === true,
    nativeMonitorRoute: normalizeText(value.nativeMonitorRoute, "unknown"),
    nativeMonitorOutputName: normalizeText(value.nativeMonitorOutputName, "Unknown"),
    nativeMonitorHeadphonesConnected: value.nativeMonitorHeadphonesConnected === true,
    nativeMonitorWrittenFrames: normalizeCount(value.nativeMonitorWrittenFrames),
    nativeMonitorDroppedFrames: normalizeCount(value.nativeMonitorDroppedFrames),
    nativeMonitorWrittenBuffers: normalizeCount(value.nativeMonitorWrittenBuffers),
    nativeMonitorDroppedBuffers: normalizeCount(value.nativeMonitorDroppedBuffers),
    levelSampleCount: normalizeCount(value.levelSampleCount),
    averageLevel: normalizeFiniteNumber(value.averageLevel, 0, 0, 1),
    peakLevel: normalizeFiniteNumber(value.peakLevel, 0, 0, 1),
    activeLevelPercent: Math.min(100, normalizeCount(value.activeLevelPercent)),
    clippedLevelCount: normalizeCount(value.clippedLevelCount),
    summary: normalizeText(value.summary, "No mic FX/headphone monitor validation evidence retained."),
    recommendation: normalizeText(value.recommendation, "Repeat validation with mic effects and headphone monitoring checked.")
  };
};

const normalizeChatReadoutValidationSummary = (value: unknown): StreamValidationChatReadoutSummary | null => {
  if (!isRecord(value)) {
    return null;
  }
  return {
    status: normalizeFeatureStatus(value.status),
    platformChatEnabled: value.platformChatEnabled === true,
    readerEnabled: value.readerEnabled === true,
    connectionPhase: normalizeText(value.connectionPhase, "unknown"),
    connectionLabel: normalizeText(value.connectionLabel, ""),
    spokenMessageCount: normalizeCount(value.spokenMessageCount),
    speechFailureCount: normalizeCount(value.speechFailureCount),
    summary: normalizeText(value.summary, "No chat readout validation evidence retained."),
    recommendation: normalizeText(value.recommendation, "Repeat validation with YouTube/Twitch chat connected and spoken.")
  };
};

const normalizeQualityAutomationValidationSummary = (value: unknown): StreamValidationQualityAutomationSummary | null => {
  if (!isRecord(value)) {
    return null;
  }
  const eventCount = normalizeCount(value.eventCount);
  const liveUpdateCount = normalizeCount(value.liveUpdateCount);
  const nextTargetCount = normalizeCount(value.nextTargetCount);
  const failureCount = normalizeCount(value.failureCount);
  if (eventCount === 0 && liveUpdateCount === 0 && nextTargetCount === 0 && failureCount === 0) {
    return null;
  }
  return {
    status: normalizeFeatureStatus(value.status),
    eventCount,
    liveUpdateCount,
    nextTargetCount,
    failureCount,
    summary: normalizeText(value.summary, "No quality automation validation evidence retained."),
    recommendation: normalizeText(value.recommendation, "Repeat validation under weak-network conditions.")
  };
};

const normalizeFeatureStatus = (value: unknown): StreamValidationFeatureStatus =>
  value === "pass" || value === "warn" || value === "fail" || value === "pending" ? value : "pending";

const normalizeAudioRouteStatus = (value: unknown): AudioRouteMonitorStatus =>
  value === "pass" || value === "warn" || value === "fail" || value === "info" ? value : "info";

const normalizeAudioOutputRoute = (value: unknown): AudioOutputRouteKind =>
  value === "speaker" ||
  value === "receiver" ||
  value === "wired-headphones" ||
  value === "wired-headset" ||
  value === "usb-headset" ||
  value === "bluetooth-a2dp" ||
  value === "bluetooth-sco" ||
  value === "airplay" ||
  value === "hdmi" ||
  value === "other" ||
  value === "unknown"
    ? value
    : "unknown";

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
    healthIssueCount: normalizeCount(value.healthIssueCount),
    statusCheckedAt: normalizeDateString(value.statusCheckedAt) ?? ""
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
    startedAt: normalizeText(value.startedAt, ""),
    statusCheckedAt: normalizeDateString(value.statusCheckedAt) ?? ""
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
