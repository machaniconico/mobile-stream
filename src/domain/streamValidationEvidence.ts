import type { StreamDiagnostics } from "./streamDiagnostics";
import type { AudioOutputRouteKind, AudioRouteMonitorStatus } from "./audioRoute";
import {
  assessPlatformPublishingFreshness,
  isPlatformPublishingFreshEnoughForRelease,
  resolvePlatformPublishingFreshnessPlatform,
  type PlatformPublishingFreshness,
  type PlatformPublishingFreshnessStatus
} from "./platformPublishingFreshness";
import {
  createNativeRuntimeSessionSummary,
  normalizeNativeRuntimeSessionSummary,
  type StreamSessionNativeRuntimeSummary
} from "./streamSessionSummary";
import type { StreamHealthHistoryStability, StreamHealthHistorySummary } from "./streamHealthHistory";
import {
  minimumValidationMonitorDurationSeconds,
  minimumValidationMonitorSampleCount
} from "./streamValidationThresholds";

export type StreamValidationDevicePlatform = "ios" | "android";
export type StreamValidationRunResult = "pass" | "warn" | "fail";
export type StreamValidationFeatureStatus = "pass" | "warn" | "fail" | "pending";

export interface StreamValidationFaceTrackingSummary {
  status: StreamDiagnostics["faceTracking"]["status"];
  enabled: boolean;
  inputMode: StreamDiagnostics["faceTracking"]["inputMode"];
  rigMode: StreamDiagnostics["faceTracking"]["rigMode"];
  runtimeStatus: StreamDiagnostics["faceTracking"]["runtimeStatus"];
  runtimeAgeMs: number | null;
  runtimeFresh: boolean;
  visibleAvatarCount: number;
  preparedPngTuberCount: number;
  activeMotionCount: number;
  rigIssueCount: number;
  rigIssueSummary: string;
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
  monitorLatencyMs: number | null;
  monitorLatencyBudgetMs: number;
  monitorLatencyStatus: StreamValidationFeatureStatus;
  monitorLatencySource: string;
  bluetoothRoute: boolean;
  monitorTuningNote: string;
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

export interface StreamValidationMonitorHoldSummary {
  status: StreamValidationFeatureStatus;
  sampleCount: number;
  durationSeconds: number;
  stability: StreamHealthHistoryStability;
  averageBitrateKbps: number;
  minimumBitrateKbps: number;
  averageFps: number;
  minimumFps: number;
  droppedFrameIncrease: number;
  observedReconnectAttempts: number;
  summary: string;
  recommendation: string;
}

export interface StreamValidationRun {
  id: string;
  fingerprint: string;
  createdAt: string;
  devicePlatform: StreamValidationDevicePlatform;
  deviceName: string;
  osVersion: string;
  physicalDevice: boolean;
  physicalDeviceStatus: StreamValidationFeatureStatus;
  physicalDeviceSummary: string;
  physicalDeviceRecommendation: string;
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
  monitorHold: StreamValidationMonitorHoldSummary | null;
  faceTracking: StreamValidationFaceTrackingSummary | null;
  audio: StreamValidationAudioSummary | null;
  chatReadout: StreamValidationChatReadoutSummary | null;
  qualityAutomation: StreamValidationQualityAutomationSummary | null;
  platformPublishing: StreamDiagnostics["platformPublishing"] | null;
  platformPublishingFreshness: PlatformPublishingFreshness | null;
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
  audioMonitorTuning?: StreamValidationAudioMonitorTuningInput;
  result?: StreamValidationRunResult;
  now?: Date;
  secrets?: string[];
}

export interface StreamValidationAudioMonitorTuningInput {
  measuredLatencyMs?: number | null;
  note?: string;
}

export interface StreamValidationEvidenceRunManifestItem {
  id: string;
  fingerprint: string;
  createdAt: string;
  ageDays: number;
  fresh: boolean;
  matchesScope: boolean;
  eligible: boolean;
  devicePlatform: StreamValidationDevicePlatform;
  deviceName: string;
  osVersion: string;
  physicalDevice: boolean;
  physicalDeviceStatus: StreamValidationFeatureStatus;
  appBuild: string;
  networkProfile: string;
  targetPlatform: string;
  transport: string;
  result: StreamValidationRunResult;
  nativeRuntimePlatform: StreamSessionNativeRuntimeSummary["platform"] | null;
  nativeRuntimeStatus: StreamSessionNativeRuntimeSummary["status"] | null;
  nativeRuntimeCompositionStatus: StreamSessionNativeRuntimeSummary["compositionStatus"] | null;
  nativeRuntimeSentVideoFrames: number;
  nativeRuntimeSentAudioFrames: number;
  nativeRuntimeBytesWritten: number;
  nativeRuntimeStillImageAssetCount: number;
  nativeRuntimeStillImageAssetLoadedCount: number;
  nativeRuntimeStillImageAssetMissingCount: number;
  monitorHoldStatus: StreamValidationMonitorHoldSummary["status"] | null;
  monitorHoldSampleCount: number;
  monitorHoldDurationSeconds: number;
  monitorHoldStability: StreamValidationMonitorHoldSummary["stability"] | null;
  monitorHoldAverageBitrateKbps: number;
  monitorHoldMinimumBitrateKbps: number;
  monitorHoldAverageFps: number;
  monitorHoldMinimumFps: number;
  monitorHoldDroppedFrameIncrease: number;
  monitorHoldObservedReconnectAttempts: number;
  faceTrackingStatus: StreamValidationFaceTrackingSummary["status"] | null;
  faceTrackingRuntimeFresh: boolean | null;
  faceTrackingRuntimeAgeMs: number | null;
  faceTrackingActiveMotionCount: number;
  faceTrackingRigIssueCount: number;
  audioStatus: StreamValidationAudioSummary["status"] | null;
  audioMonitorHeadphonesOnly: boolean;
  audioNativeMonitorHeadphonesConnected: boolean;
  audioNativeMonitorWrittenFrames: number;
  audioNativeMonitorDroppedFrames: number;
  audioNativeMonitorWrittenBuffers: number;
  audioNativeMonitorDroppedBuffers: number;
  audioMonitorLatencyStatus: StreamValidationAudioSummary["monitorLatencyStatus"] | null;
  audioMonitorLatencyMs: number | null;
  chatReadoutStatus: StreamValidationChatReadoutSummary["status"] | null;
  chatReadoutSpokenMessageCount: number;
  chatReadoutSpeechFailureCount: number;
  qualityAutomationStatus: StreamValidationQualityAutomationSummary["status"] | null;
  platformPublishingPlatform: StreamDiagnostics["platformPublishing"]["platform"] | null;
  platformPublishingStatus: StreamDiagnostics["platformPublishing"]["status"] | null;
  platformPublishingFreshnessStatus: PlatformPublishingFreshnessStatus | null;
  platformPublishingCheckedAt: string;
  platformPublishingFreshnessAgeMinutes: number | null;
  platformPublishingYoutubeHasBroadcastId: boolean;
  platformPublishingYoutubeHasStreamId: boolean;
  platformPublishingYoutubeBroadcastStatus: string;
  platformPublishingYoutubeStreamStatus: string;
  platformPublishingYoutubeHealthStatus: string;
  platformPublishingYoutubeHealthIssueCount: number;
  platformPublishingTwitchLiveStatus: string;
  platformPublishingTwitchStartedAt: string;
  platformPublishingTwitchHasCategoryId: boolean;
  platformPublishingTwitchViewerCount: number;
  summary: string;
  recommendation: string;
}

export interface StreamValidationEvidenceSummary {
  fingerprint: string;
  runManifest: StreamValidationEvidenceRunManifestItem[];
  totalRuns: number;
  eligibleRunCount: number;
  staleRunCount: number;
  passCount: number;
  warningCount: number;
  failureCount: number;
  physicalDeviceRunCount: number;
  physicalDeviceReadyCount: number;
  physicalDeviceWarningCount: number;
  physicalDeviceFailureCount: number;
  physicalDeviceIosPass: boolean;
  physicalDeviceAndroidPass: boolean;
  nativeRuntimeRunCount: number;
  nativeRuntimeReadyCount: number;
  nativeRuntimeWarningCount: number;
  nativeRuntimeFailureCount: number;
  nativeRuntimeIosPass: boolean;
  nativeRuntimeAndroidPass: boolean;
  monitorHoldRunCount: number;
  monitorHoldReadyCount: number;
  monitorHoldWarningCount: number;
  monitorHoldFailureCount: number;
  monitorHoldIosPass: boolean;
  monitorHoldAndroidPass: boolean;
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
  platformPublishingReadyCount: number;
  platformPublishingFreshCount: number;
  platformPublishingFreshnessWarningCount: number;
  platformPublishingWarningCount: number;
  platformPublishingFailureCount: number;
  platformPublishingIosPass: boolean;
  platformPublishingAndroidPass: boolean;
  platformIngestRunCount: number;
  platformIngestReadyCount: number;
  platformIngestWarningCount: number;
  platformIngestFailureCount: number;
  platformIngestIosPass: boolean;
  platformIngestAndroidPass: boolean;
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
  latestMonitorHold: StreamValidationMonitorHoldSummary | null;
  latestFaceTracking: StreamValidationFaceTrackingSummary | null;
  latestAudio: StreamValidationAudioSummary | null;
  latestChatReadout: StreamValidationChatReadoutSummary | null;
  latestQualityAutomation: StreamValidationQualityAutomationSummary | null;
  latestPlatformPublishing: StreamDiagnostics["platformPublishing"] | null;
  latestPlatformPublishingFreshness: PlatformPublishingFreshness | null;
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
export const defaultMonitorLatencyBudgetMs = 180;
export const bluetoothMonitorLatencyBudgetMs = 250;
export const defaultMonitorLatencyFailureLimitMs = 350;
export const bluetoothMonitorLatencyFailureLimitMs = 500;

export const formatStreamValidationRunAudioLabel = (run: StreamValidationRun): string | null => {
  if (!run.audio) {
    return null;
  }

  const audio = run.audio;
  const nativeMonitor = audio.nativeMonitorReported
    ? ` / native monitor ${audio.nativeMonitorRunning ? "running" : "reported"} ${audio.nativeMonitorWrittenFrames}/${audio.nativeMonitorDroppedFrames} frames ${audio.nativeMonitorOutputName}`
    : "";
  const latency = ` / latency ${audio.monitorLatencyMs === null ? "missing" : `${audio.monitorLatencyMs}ms`} ${
    audio.monitorLatencyStatus
  }/${audio.monitorLatencyBudgetMs}ms${audio.bluetoothRoute ? " bluetooth" : ""}${
    audio.monitorLatencySource ? ` ${audio.monitorLatencySource}` : ""
  }`;
  return `audio ${audio.status} / ${audio.presetId} / monitor ${audio.monitorEnabled ? "on" : "off"} / headphones-only ${
    audio.monitorHeadphonesOnly ? "yes" : "no"
  } / route ${audio.monitorRouteStatus} ${audio.outputName} / headphones ${audio.headphonesConnected ? "yes" : "no"} / stale ${
    audio.routeStale ? "yes" : "no"
  }${nativeMonitor}${latency} / samples ${audio.levelSampleCount} / peak ${Math.round(audio.peakLevel * 100)}%`;
};

export const createStreamValidationRun = ({
  diagnostics,
  devicePlatform,
  deviceName = "",
  osVersion = "",
  appBuild = "",
  networkProfile = "",
  audioMonitorTuning,
  result = defaultResultForDiagnostics(diagnostics),
  now = new Date(),
  secrets = []
}: StreamValidationRunInput): StreamValidationRun => {
  const createdAt = now.toISOString();
  const sanitizedDeviceName = sanitizeStoredText(deviceName, secrets) || defaultDeviceName(devicePlatform);
  const sanitizedOsVersion = sanitizeStoredText(osVersion, secrets) || "-";
  const sanitizedAppBuild = sanitizeStoredText(appBuild, secrets) || "-";
  const sanitizedNetworkProfile = sanitizeStoredText(networkProfile, secrets) || "private test";
  const physicalDevice = createPhysicalDeviceEvidence(devicePlatform, sanitizedDeviceName, sanitizedOsVersion, secrets);
  const nativeRuntime = createValidationNativeRuntimeSummary(diagnostics);
  const monitorHold = createMonitorHoldValidationSummary(diagnostics, secrets);
  const faceTracking = createFaceTrackingValidationSummary(diagnostics.faceTracking, secrets);
  const audio = createAudioValidationSummary(diagnostics, audioMonitorTuning, secrets);
  const chatReadout = createChatReadoutValidationSummary(diagnostics, secrets);
  const qualityAutomation = createQualityAutomationValidationSummary(diagnostics, secrets);
  const platformPublishing = diagnostics.platformPublishing;
  const platformPublishingFreshness = createPlatformPublishingValidationFreshness(diagnostics, now);
  const effectiveResult = createEffectiveValidationResult(
    result,
    devicePlatform,
    physicalDevice.physicalDeviceStatus,
    nativeRuntime,
    monitorHold,
    faceTracking,
    audio,
    chatReadout,
    platformPublishing,
    platformPublishingFreshness
  );
  const runBase = {
    createdAt,
    devicePlatform,
    deviceName: sanitizedDeviceName,
    physicalDevice: physicalDevice.physicalDevice,
    physicalDeviceStatus: physicalDevice.physicalDeviceStatus,
    targetPlatform: diagnostics.target.platform,
    transport: diagnostics.target.protocol,
    result: effectiveResult
  };

  const runWithoutFingerprint: Omit<StreamValidationRun, "fingerprint"> = {
    id: createValidationRunId(runBase),
    createdAt,
    devicePlatform,
    deviceName: sanitizedDeviceName,
    osVersion: sanitizedOsVersion,
    physicalDevice: physicalDevice.physicalDevice,
    physicalDeviceStatus: physicalDevice.physicalDeviceStatus,
    physicalDeviceSummary: physicalDevice.physicalDeviceSummary,
    physicalDeviceRecommendation: physicalDevice.physicalDeviceRecommendation,
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
    monitorHold,
    faceTracking,
    audio,
    chatReadout,
    qualityAutomation,
    platformPublishing,
    platformPublishingFreshness,
    validationItemStatuses: diagnostics.validation.items.map((item) => ({
      id: item.id,
      status: item.status
    })),
    summary: createRunSummary(
      effectiveResult,
      sanitizedDeviceName,
      diagnostics.target.platform,
      diagnostics.validation.status,
      physicalDevice,
      nativeRuntime,
      monitorHold,
      faceTracking,
      audio,
      chatReadout,
      qualityAutomation,
      platformPublishing,
      platformPublishingFreshness
    ),
    recommendation: createRunRecommendation(
      effectiveResult,
      diagnostics.validation.recommendedNextStep,
      physicalDevice,
      nativeRuntime,
      monitorHold,
      faceTracking,
      audio,
      chatReadout,
      qualityAutomation,
      platformPublishing,
      platformPublishingFreshness
    )
  };

  return {
    ...runWithoutFingerprint,
    fingerprint: createStreamValidationRunFingerprint(runWithoutFingerprint)
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
  const runManifest = normalized.map((run) =>
    createEvidenceRunManifestItem(run, {
      ageDays: ageInDays(run.createdAt, now),
      fresh: ageInDays(run.createdAt, now) <= maxAgeDays,
      matchesScope: scopedRuns.includes(run)
    })
  );
  const fingerprint = createStreamValidationEvidenceFingerprint(normalized, scopedRuns, {
    maxAgeDays,
    requiredAppBuild,
    requiredTargetPlatform,
    requiredTransport
  });
  const eligibleRuns = evaluatedRuns.filter((item) => item.isFresh).map((item) => item.run);
  const totalRuns = normalized.length;
  const eligibleRunCount = eligibleRuns.length;
  const staleRunCount = evaluatedRuns.filter((item) => !item.isFresh).length;
  const passCount = normalized.filter((run) => run.result === "pass").length;
  const warningCount = normalized.filter((run) => run.result === "warn").length;
  const failureCount = normalized.filter((run) => run.result === "fail").length;
  const physicalDeviceRuns = scopedRuns.filter((run) => run.physicalDeviceStatus);
  const physicalDeviceRunCount = physicalDeviceRuns.length;
  const physicalDeviceReadyCount = physicalDeviceRuns.filter((run) => isPhysicalDeviceEvidencePass(run)).length;
  const physicalDeviceWarningCount = physicalDeviceRuns.filter((run) => run.physicalDeviceStatus === "warn").length;
  const physicalDeviceFailureCount = physicalDeviceRuns.filter((run) => run.physicalDeviceStatus === "fail").length;
  const nativeRuntimeRuns = scopedRuns.filter((run) => run.nativeRuntime);
  const nativeRuntimeRunCount = nativeRuntimeRuns.length;
  const nativeRuntimeReadyCount = nativeRuntimeRuns.filter((run) =>
    isNativeRuntimeEvidencePass(run.nativeRuntime, run.devicePlatform)
  ).length;
  const nativeRuntimeWarningCount = nativeRuntimeRuns.filter((run) => run.nativeRuntime?.status === "warn").length;
  const nativeRuntimeFailureCount = nativeRuntimeRuns.filter((run) => run.nativeRuntime?.status === "fail").length;
  const monitorHoldRuns = scopedRuns.filter((run) => run.monitorHold);
  const monitorHoldRunCount = monitorHoldRuns.length;
  const monitorHoldReadyCount = monitorHoldRuns.filter((run) => isMonitorHoldEvidencePass(run.monitorHold)).length;
  const monitorHoldWarningCount = monitorHoldRuns.filter((run) => run.monitorHold?.status === "warn" || run.monitorHold?.status === "pending").length;
  const monitorHoldFailureCount = monitorHoldRuns.filter((run) => run.monitorHold?.status === "fail").length;
  const faceTrackingRuns = scopedRuns.filter((run) => run.faceTracking && run.faceTracking.status !== "info");
  const faceTrackingRunCount = faceTrackingRuns.length;
  const faceTrackingWarningCount = faceTrackingRuns.filter((run) => run.faceTracking?.status === "warn").length;
  const faceTrackingReadyCount = faceTrackingRuns.filter((run) => isAvatarMotionEvidencePass(run.faceTracking)).length;
  const audioRuns = scopedRuns.filter((run) => run.audio);
  const audioRunCount = audioRuns.length;
  const audioReadyCount = audioRuns.filter((run) => isAudioEvidencePass(run.audio)).length;
  const audioWarningCount = audioRuns.filter((run) => !isAudioEvidencePass(run.audio)).length;
  const chatReadoutRuns = scopedRuns.filter((run) => run.chatReadout);
  const chatReadoutRunCount = chatReadoutRuns.length;
  const chatReadoutReadyCount = chatReadoutRuns.filter((run) => isChatReadoutEvidencePass(run.chatReadout)).length;
  const chatReadoutWarningCount = chatReadoutRuns.filter((run) => !isChatReadoutEvidencePass(run.chatReadout)).length;
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
  const platformPublishingFreshnessRuns = scopedRuns.filter((run) =>
    isPlatformPublishingFreshnessRequired(getRunPlatformPublishingFreshness(run))
  );
  const platformPublishingReadyCount = platformPublishingFreshnessRuns.filter((run) =>
    isPlatformPublishingRunEvidencePass(run)
  ).length;
  const platformPublishingFreshCount = platformPublishingFreshnessRuns.filter((run) =>
    isPlatformPublishingFreshEnoughForRelease(getRunPlatformPublishingFreshness(run))
  ).length;
  const platformPublishingFreshnessWarningCount = platformPublishingFreshnessRuns.filter(
    (run) => !isPlatformPublishingFreshEnoughForRelease(getRunPlatformPublishingFreshness(run))
  ).length;
  const platformPublishingWarningCount = platformPublishingRuns.filter((run) => run.platformPublishing?.status === "warn").length;
  const platformPublishingFailureCount = platformPublishingRuns.filter((run) => run.platformPublishing?.status === "fail").length;
  const platformIngestRuns = scopedRuns.filter((run) => isPlatformIngestProofRequired(run));
  const platformIngestRunCount = platformIngestRuns.length;
  const platformIngestReadyCount = platformIngestRuns.filter((run) => getPlatformIngestEvidenceStatus(run) === "pass").length;
  const platformIngestWarningCount = platformIngestRuns.filter((run) => getPlatformIngestEvidenceStatus(run) === "warn").length;
  const platformIngestFailureCount = platformIngestRuns.filter((run) => getPlatformIngestEvidenceStatus(run) === "fail").length;
  const latestRun = normalized[0] ?? null;
  const latestEligibleRun = eligibleRuns[0] ?? null;
  const latestPassingRun = eligibleRuns.find((run) => run.result === "pass") ?? null;
  const latestNativeRuntime =
    eligibleRuns.find((run) => run.nativeRuntime)?.nativeRuntime ?? scopedRuns.find((run) => run.nativeRuntime)?.nativeRuntime ?? null;
  const latestMonitorHold =
    eligibleRuns.find((run) => run.monitorHold)?.monitorHold ?? scopedRuns.find((run) => run.monitorHold)?.monitorHold ?? null;
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
  const latestPlatformPublishingFreshness =
    getLatestPlatformPublishingFreshness(eligibleRuns) ?? getLatestPlatformPublishingFreshness(scopedRuns);
  const latestDeviceRuns = latestRunsByDevicePlatform(eligibleRuns);
  const iosLatestRun = latestDeviceRuns.find((run) => run.devicePlatform === "ios") ?? null;
  const androidLatestRun = latestDeviceRuns.find((run) => run.devicePlatform === "android") ?? null;
  const iosPass = iosLatestRun?.result === "pass";
  const androidPass = androidLatestRun?.result === "pass";
  const physicalDeviceIosPass = iosPass && isPhysicalDeviceEvidencePass(iosLatestRun);
  const physicalDeviceAndroidPass = androidPass && isPhysicalDeviceEvidencePass(androidLatestRun);
  const nativeRuntimeIosPass = iosPass && isNativeRuntimeEvidencePass(iosLatestRun?.nativeRuntime, "ios");
  const nativeRuntimeAndroidPass = androidPass && isNativeRuntimeEvidencePass(androidLatestRun?.nativeRuntime, "android");
  const monitorHoldIosPass = iosPass && isMonitorHoldEvidencePass(iosLatestRun?.monitorHold);
  const monitorHoldAndroidPass = androidPass && isMonitorHoldEvidencePass(androidLatestRun?.monitorHold);
  const faceTrackingIosPass = iosPass && isAvatarMotionEvidencePass(iosLatestRun?.faceTracking);
  const faceTrackingAndroidPass = androidPass && isAvatarMotionEvidencePass(androidLatestRun?.faceTracking);
  const audioIosPass = iosPass && isAudioEvidencePass(iosLatestRun?.audio);
  const audioAndroidPass = androidPass && isAudioEvidencePass(androidLatestRun?.audio);
  const chatReadoutIosPass = iosPass && isChatReadoutEvidencePass(iosLatestRun?.chatReadout);
  const chatReadoutAndroidPass = androidPass && isChatReadoutEvidencePass(androidLatestRun?.chatReadout);
  const platformPublishingIosPass = iosPass && isPlatformPublishingRunEvidencePass(iosLatestRun);
  const platformPublishingAndroidPass = androidPass && isPlatformPublishingRunEvidencePass(androidLatestRun);
  const platformIngestIosPass = iosPass && isPlatformIngestRunEvidencePass(iosLatestRun);
  const platformIngestAndroidPass = androidPass && isPlatformIngestRunEvidencePass(androidLatestRun);
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
    physicalDeviceIosPass,
    physicalDeviceAndroidPass,
    nativeRuntimeIosPass,
    nativeRuntimeAndroidPass,
    monitorHoldIosPass,
    monitorHoldAndroidPass,
    faceTrackingIosPass,
    faceTrackingAndroidPass,
    audioIosPass,
    audioAndroidPass,
    chatReadoutIosPass,
    chatReadoutAndroidPass,
    platformPublishingIosPass,
    platformPublishingAndroidPass,
    platformIngestIosPass,
    platformIngestAndroidPass
  });

  return {
    fingerprint,
    runManifest,
    totalRuns,
    eligibleRunCount,
    staleRunCount,
    passCount,
    warningCount,
    failureCount,
    physicalDeviceRunCount,
    physicalDeviceReadyCount,
    physicalDeviceWarningCount,
    physicalDeviceFailureCount,
    physicalDeviceIosPass,
    physicalDeviceAndroidPass,
    nativeRuntimeRunCount,
    nativeRuntimeReadyCount,
    nativeRuntimeWarningCount,
    nativeRuntimeFailureCount,
    nativeRuntimeIosPass,
    nativeRuntimeAndroidPass,
    monitorHoldRunCount,
    monitorHoldReadyCount,
    monitorHoldWarningCount,
    monitorHoldFailureCount,
    monitorHoldIosPass,
    monitorHoldAndroidPass,
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
    platformPublishingReadyCount,
    platformPublishingFreshCount,
    platformPublishingFreshnessWarningCount,
    platformPublishingWarningCount,
    platformPublishingFailureCount,
    platformPublishingIosPass,
    platformPublishingAndroidPass,
    platformIngestRunCount,
    platformIngestReadyCount,
    platformIngestWarningCount,
    platformIngestFailureCount,
    platformIngestIosPass,
    platformIngestAndroidPass,
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
    latestMonitorHold,
    latestFaceTracking,
    latestAudio,
    latestChatReadout,
    latestQualityAutomation,
    latestPlatformPublishing,
    latestPlatformPublishingFreshness,
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
      physicalDeviceIosPass,
      physicalDeviceAndroidPass,
      nativeRuntimeIosPass,
      nativeRuntimeAndroidPass,
      monitorHoldIosPass,
      monitorHoldAndroidPass,
      faceTrackingIosPass,
      faceTrackingAndroidPass,
      audioIosPass,
      audioAndroidPass,
      chatReadoutIosPass,
      chatReadoutAndroidPass,
      platformPublishingIosPass,
      platformPublishingAndroidPass,
      platformIngestIosPass,
      platformIngestAndroidPass,
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
      physicalDeviceIosPass,
      physicalDeviceAndroidPass,
      nativeRuntimeIosPass,
      nativeRuntimeAndroidPass,
      monitorHoldIosPass,
      monitorHoldAndroidPass,
      faceTrackingIosPass,
      faceTrackingAndroidPass,
      audioIosPass,
      audioAndroidPass,
      chatReadoutIosPass,
      chatReadoutAndroidPass,
      platformPublishingIosPass,
      platformPublishingAndroidPass,
      platformIngestIosPass,
      platformIngestAndroidPass
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
  const deviceName = normalizeText(value.deviceName, defaultDeviceName(devicePlatform));
  const osVersion = normalizeText(value.osVersion, "-");
  const physicalDevice = normalizePhysicalDeviceEvidence(value, devicePlatform, deviceName, osVersion);
  const checklistStatus = normalizeChecklistStatus(value.checklistStatus);
  const diagnosticStatus = normalizeDiagnosticStatus(value.diagnosticStatus);
  const sessionOutcome = normalizeSessionOutcome(value.sessionOutcome);
  const nativeRuntime = normalizeNativeRuntimeSessionSummary(value.nativeRuntime);
  const monitorHold = normalizeMonitorHoldValidationSummary(value.monitorHold);
  const faceTracking = normalizeFaceTrackingValidationSummary(value.faceTracking);
  const audio = normalizeAudioValidationSummary(value.audio);
  const chatReadout = normalizeChatReadoutValidationSummary(value.chatReadout);
  const qualityAutomation = normalizeQualityAutomationValidationSummary(value.qualityAutomation);
  const platformPublishing = normalizePlatformPublishingDiagnostics(value.platformPublishing);
  const platformPublishingFreshness = normalizePlatformPublishingFreshness(
    value.platformPublishingFreshness,
    platformPublishing,
    targetPlatform,
    createdAt
  );
  const normalizedWithoutFingerprint: Omit<StreamValidationRun, "fingerprint"> = {
    id: normalizeText(value.id, createValidationRunId({
      createdAt,
      devicePlatform,
      deviceName,
      targetPlatform,
      transport,
      result
    })),
    createdAt,
    devicePlatform,
    deviceName,
    osVersion,
    physicalDevice: physicalDevice.physicalDevice,
    physicalDeviceStatus: physicalDevice.physicalDeviceStatus,
    physicalDeviceSummary: physicalDevice.physicalDeviceSummary,
    physicalDeviceRecommendation: physicalDevice.physicalDeviceRecommendation,
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
    monitorHold,
    faceTracking,
    audio,
    chatReadout,
    qualityAutomation,
    platformPublishing,
    platformPublishingFreshness,
    validationItemStatuses: normalizeValidationItemStatuses(value.validationItemStatuses),
    summary: normalizeText(
      value.summary,
      createRunSummary(
        result,
        deviceName,
        targetPlatform,
        checklistStatus,
        physicalDevice,
        nativeRuntime,
        monitorHold,
        faceTracking,
        audio,
        chatReadout,
        qualityAutomation,
        platformPublishing,
        platformPublishingFreshness
      )
    ),
    recommendation: normalizeText(
      value.recommendation,
      createRunRecommendation(
        result,
        "Run another private validation pass.",
        physicalDevice,
        nativeRuntime,
        monitorHold,
        faceTracking,
        audio,
        chatReadout,
        qualityAutomation,
        platformPublishing,
        platformPublishingFreshness
      )
    )
  };

  return {
    ...normalizedWithoutFingerprint,
    fingerprint: createStreamValidationRunFingerprint(normalizedWithoutFingerprint)
  };
};

const createEvidenceStatus = ({
  totalRuns,
  eligibleRunCount,
  latestEligibleRun,
  latestDeviceRuns,
  iosPass,
  androidPass,
  appBuildMismatch,
  physicalDeviceIosPass,
  physicalDeviceAndroidPass,
  nativeRuntimeIosPass,
  nativeRuntimeAndroidPass,
  monitorHoldIosPass,
  monitorHoldAndroidPass,
  faceTrackingIosPass,
  faceTrackingAndroidPass,
  audioIosPass,
  audioAndroidPass,
  chatReadoutIosPass,
  chatReadoutAndroidPass,
  platformPublishingIosPass,
  platformPublishingAndroidPass,
  platformIngestIosPass,
  platformIngestAndroidPass
}: {
  totalRuns: number;
  eligibleRunCount: number;
  latestEligibleRun: StreamValidationRun | null;
  latestDeviceRuns: StreamValidationRun[];
  iosPass: boolean;
  androidPass: boolean;
  appBuildMismatch: boolean;
  physicalDeviceIosPass: boolean;
  physicalDeviceAndroidPass: boolean;
  nativeRuntimeIosPass: boolean;
  nativeRuntimeAndroidPass: boolean;
  monitorHoldIosPass: boolean;
  monitorHoldAndroidPass: boolean;
  faceTrackingIosPass: boolean;
  faceTrackingAndroidPass: boolean;
  audioIosPass: boolean;
  audioAndroidPass: boolean;
  chatReadoutIosPass: boolean;
  chatReadoutAndroidPass: boolean;
  platformPublishingIosPass: boolean;
  platformPublishingAndroidPass: boolean;
  platformIngestIosPass: boolean;
  platformIngestAndroidPass: boolean;
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
    physicalDeviceIosPass &&
    physicalDeviceAndroidPass &&
    nativeRuntimeIosPass &&
    nativeRuntimeAndroidPass &&
    monitorHoldIosPass &&
    monitorHoldAndroidPass &&
    faceTrackingIosPass &&
    faceTrackingAndroidPass &&
    audioIosPass &&
    audioAndroidPass &&
    chatReadoutIosPass &&
    chatReadoutAndroidPass &&
    platformPublishingIosPass &&
    platformPublishingAndroidPass &&
    platformIngestIosPass &&
    platformIngestAndroidPass
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

const isPhysicalDeviceEvidencePass = (run: StreamValidationRun | null | undefined): boolean =>
  run?.physicalDeviceStatus === "pass" && run.physicalDevice;

const isAvatarMotionEvidencePass = (faceTracking: StreamValidationFaceTrackingSummary | null | undefined): boolean =>
  faceTracking?.status === "pass" &&
  faceTracking.runtimeFresh &&
  faceTracking.activeMotionCount > 0 &&
  faceTracking.rigIssueCount === 0;

const isNativeRuntimeEvidencePass = (
  nativeRuntime: StreamSessionNativeRuntimeSummary | null | undefined,
  expectedPlatform: StreamValidationDevicePlatform
): boolean =>
  nativeRuntime?.status === "pass" &&
  nativeRuntime.platform === expectedPlatform &&
  nativeRuntime.sentVideoFrames > 0 &&
  nativeRuntime.sentAudioFrames > 0 &&
  nativeRuntime.bytesWritten > 0 &&
  (nativeRuntime.compositionStatus === "applied" || nativeRuntime.compositionStatus === "screen-only") &&
  nativeRuntime.stillImageAssetMissingCount === 0 &&
  nativeRuntime.stillImageAssetLoadedCount >= nativeRuntime.stillImageAssetCount;

const createValidationNativeRuntimeSummary = (
  diagnostics: StreamDiagnostics
): StreamSessionNativeRuntimeSummary | null => {
  const nativeRuntime =
    createNativeRuntimeSessionSummary(diagnostics.nativeRuntime) ??
    normalizeNativeRuntimeSessionSummary(diagnostics.session.lastSummary?.nativeRuntime);
  if (!nativeRuntime) {
    return null;
  }
  return alignNativeRuntimeWithComposition(nativeRuntime, diagnostics.nativeComposition);
};

const alignNativeRuntimeWithComposition = (
  nativeRuntime: StreamSessionNativeRuntimeSummary,
  nativeComposition: StreamDiagnostics["nativeComposition"]
): StreamSessionNativeRuntimeSummary => {
  if (nativeComposition.status === "fail") {
    return addNativeRuntimeCompositionReview(
      nativeRuntime,
      "fail",
      `Native composition preflight failed: ${nativeComposition.summary}`,
      nativeComposition.recommendedNextStep
    );
  }

  if (nativeComposition.status === "warn") {
    return addNativeRuntimeCompositionReview(
      nativeRuntime,
      "warn",
      `Native composition preflight needs review: ${nativeComposition.summary}`,
      nativeComposition.recommendedNextStep
    );
  }

  if (nativeComposition.coverage !== "native-overlays") {
    return nativeRuntime;
  }

  const expectedStillImageCount = nativeComposition.stillImageOverlayCount;
  const overlayApplied = nativeRuntime.compositionStatus === "applied";
  const runtimeDeclaredEnoughAssets = nativeRuntime.stillImageAssetCount >= expectedStillImageCount;
  const runtimeLoadedEnoughAssets = nativeRuntime.stillImageAssetLoadedCount >= expectedStillImageCount;

  if (overlayApplied && runtimeDeclaredEnoughAssets && runtimeLoadedEnoughAssets) {
    return nativeRuntime;
  }

  return addNativeRuntimeCompositionReview(
    nativeRuntime,
    "warn",
    `Native runtime did not prove the current scene overlays: composition ${nativeRuntime.compositionStatus}, assets ${nativeRuntime.stillImageAssetLoadedCount}/${expectedStillImageCount} loaded.`,
    "Repeat physical validation with the current scene and retain native compositor telemetry showing overlays applied and all required still-image assets loaded."
  );
};

const addNativeRuntimeCompositionReview = (
  nativeRuntime: StreamSessionNativeRuntimeSummary,
  status: StreamSessionNativeRuntimeSummary["status"],
  summary: string,
  recommendation: string
): StreamSessionNativeRuntimeSummary => ({
  ...nativeRuntime,
  status: strongestNativeRuntimeStatus(nativeRuntime.status, status),
  issueCount: nativeRuntime.issueCount + 1,
  summary: `${nativeRuntime.summary} ${summary}`,
  recommendation: nativeRuntime.status === "fail" ? nativeRuntime.recommendation : recommendation
});

const strongestNativeRuntimeStatus = (
  current: StreamSessionNativeRuntimeSummary["status"],
  next: StreamSessionNativeRuntimeSummary["status"]
): StreamSessionNativeRuntimeSummary["status"] => {
  if (current === "fail" || next === "fail") {
    return "fail";
  }
  if (current === "warn" || next === "warn") {
    return "warn";
  }
  return "pass";
};

const isMonitorHoldEvidencePass = (monitorHold: StreamValidationMonitorHoldSummary | null | undefined): boolean =>
  monitorHold?.status === "pass" &&
  monitorHold.sampleCount >= minimumValidationMonitorSampleCount &&
  monitorHold.durationSeconds >= minimumValidationMonitorDurationSeconds &&
  monitorHold.stability === "stable" &&
  monitorHold.droppedFrameIncrease === 0 &&
  monitorHold.observedReconnectAttempts === 0;

const isFeatureEvidencePass = (
  feature: { status: StreamValidationFeatureStatus } | null | undefined
): boolean => feature?.status === "pass";

const isChatReadoutEvidencePass = (chatReadout: StreamValidationChatReadoutSummary | null | undefined): boolean =>
  chatReadout?.status === "pass" &&
  chatReadout.spokenMessageCount > 0 &&
  chatReadout.speechFailureCount === 0;

const isAudioEvidencePass = (audio: StreamValidationAudioSummary | null | undefined): boolean =>
  audio?.status === "pass" &&
  audio.nativeMonitorReported &&
  audio.nativeMonitorWrittenFrames > 0 &&
  audio.nativeMonitorWrittenBuffers > 0 &&
  audio.nativeMonitorDroppedFrames === 0 &&
  audio.nativeMonitorDroppedBuffers === 0 &&
  audio.monitorLatencyStatus === "pass" &&
  audio.monitorLatencyMs !== null &&
  (!audio.monitorHeadphonesOnly || audio.nativeMonitorHeadphonesConnected);

const createPlatformPublishingValidationFreshness = (
  diagnostics: StreamDiagnostics,
  now: Date
): PlatformPublishingFreshness =>
  assessPlatformPublishingFreshness(
    {
      platform: resolvePlatformPublishingFreshnessPlatform(diagnostics.target.platform),
      youtube: diagnostics.platformPublishing.youtube,
      twitch: diagnostics.platformPublishing.twitch
    },
    now
  );

const getRunPlatformPublishingFreshness = (run: StreamValidationRun | null | undefined): PlatformPublishingFreshness =>
  run?.platformPublishingFreshness ??
  assessPlatformPublishingFreshness(
    {
      platform: resolvePlatformPublishingFreshnessPlatform(run?.targetPlatform),
      youtube: run?.platformPublishing?.youtube ?? null,
      twitch: run?.platformPublishing?.twitch ?? null
    },
    run?.createdAt ? new Date(run.createdAt) : new Date(0)
  );

const isPlatformPublishingFreshnessRequired = (freshness: PlatformPublishingFreshness): boolean =>
  freshness.status !== "not-applicable";

const isPlatformPublishingEvidencePass = (
  platformPublishing: StreamDiagnostics["platformPublishing"] | null | undefined,
  freshness: PlatformPublishingFreshness | null | undefined
): boolean => {
  if (!freshness) {
    return false;
  }
  if (!isPlatformPublishingFreshnessRequired(freshness)) {
    return true;
  }
  return platformPublishing?.status === "pass" && isPlatformPublishingFreshEnoughForRelease(freshness);
};

const isPlatformPublishingRunEvidencePass = (run: StreamValidationRun | null | undefined): boolean =>
  run ? isPlatformPublishingEvidencePass(run.platformPublishing, getRunPlatformPublishingFreshness(run)) : false;

const isPlatformIngestProofRequired = (run: StreamValidationRun | null | undefined): boolean => {
  const platform = resolvePlatformPublishingFreshnessPlatform(run?.targetPlatform);
  return platform === "youtube-live" || platform === "twitch";
};

const isPlatformIngestRunEvidencePass = (run: StreamValidationRun | null | undefined): boolean => {
  if (!run) {
    return false;
  }
  if (!isPlatformIngestProofRequired(run)) {
    return true;
  }
  return isNativeRuntimeEvidencePass(run.nativeRuntime, run.devicePlatform) && isPlatformPublishingRunEvidencePass(run);
};

const getPlatformIngestEvidenceStatus = (
  run: StreamValidationRun | null | undefined
): "pass" | "warn" | "fail" => {
  if (isPlatformIngestRunEvidencePass(run)) {
    return "pass";
  }
  if (run?.result === "fail" || run?.nativeRuntime?.status === "fail" || run?.platformPublishing?.status === "fail") {
    return "fail";
  }
  return "warn";
};

const getLatestPlatformPublishingFreshness = (runs: StreamValidationRun[]): PlatformPublishingFreshness | null => {
  for (const run of runs) {
    const freshness = getRunPlatformPublishingFreshness(run);
    if (isPlatformPublishingFreshnessRequired(freshness)) {
      return freshness;
    }
  }
  return null;
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
    physicalDeviceIosPass: boolean;
    physicalDeviceAndroidPass: boolean;
    nativeRuntimeIosPass: boolean;
    nativeRuntimeAndroidPass: boolean;
    monitorHoldIosPass: boolean;
    monitorHoldAndroidPass: boolean;
    faceTrackingIosPass: boolean;
    faceTrackingAndroidPass: boolean;
    audioIosPass: boolean;
    audioAndroidPass: boolean;
    chatReadoutIosPass: boolean;
    chatReadoutAndroidPass: boolean;
    platformPublishingIosPass: boolean;
    platformPublishingAndroidPass: boolean;
    platformIngestIosPass: boolean;
    platformIngestAndroidPass: boolean;
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
  if (counts.iosPass && counts.androidPass && (!counts.physicalDeviceIosPass || !counts.physicalDeviceAndroidPass)) {
    return `Physical validation is partial: iOS and Android passed, but retained device identity is incomplete: iOS ${counts.physicalDeviceIosPass ? "pass" : "missing physical-device proof"} / Android ${counts.physicalDeviceAndroidPass ? "pass" : "missing physical-device proof"}.`;
  }
  if (counts.iosPass && counts.androidPass && (!counts.nativeRuntimeIosPass || !counts.nativeRuntimeAndroidPass)) {
    return `Physical validation is partial: iOS and Android passed, but retained native publisher/compositor evidence is incomplete: iOS ${counts.nativeRuntimeIosPass ? "pass" : "missing native runtime proof"} / Android ${counts.nativeRuntimeAndroidPass ? "pass" : "missing native runtime proof"}.`;
  }
  if (counts.iosPass && counts.androidPass && (!counts.monitorHoldIosPass || !counts.monitorHoldAndroidPass)) {
    return `Physical validation is partial: iOS and Android passed, but retained stable monitor-hold evidence is incomplete: iOS ${counts.monitorHoldIosPass ? "pass" : "missing stable hold"} / Android ${counts.monitorHoldAndroidPass ? "pass" : "missing stable hold"}.`;
  }
  if (counts.iosPass && counts.androidPass && (!counts.faceTrackingIosPass || !counts.faceTrackingAndroidPass)) {
    return `Physical validation is partial: iOS and Android passed, but retained VTuber avatar-motion evidence is incomplete: iOS ${counts.faceTrackingIosPass ? "pass" : "missing"} / Android ${counts.faceTrackingAndroidPass ? "pass" : "missing"}.`;
  }
  if (counts.iosPass && counts.androidPass && (!counts.audioIosPass || !counts.audioAndroidPass)) {
    return `Physical validation is partial: iOS and Android passed, but retained mic FX/headphone monitor evidence is incomplete: iOS ${counts.audioIosPass ? "pass" : "missing native self-monitor or latency proof"} / Android ${counts.audioAndroidPass ? "pass" : "missing native self-monitor or latency proof"}.`;
  }
  if (counts.iosPass && counts.androidPass && (!counts.chatReadoutIosPass || !counts.chatReadoutAndroidPass)) {
    return `Physical validation is partial: iOS and Android passed, but retained chat readout evidence is incomplete: iOS ${counts.chatReadoutIosPass ? "pass" : "missing"} / Android ${counts.chatReadoutAndroidPass ? "pass" : "missing"}.`;
  }
  if (counts.iosPass && counts.androidPass && (!counts.platformPublishingIosPass || !counts.platformPublishingAndroidPass)) {
    return `Physical validation is partial: iOS and Android passed, but retained YouTube/Twitch dashboard evidence is incomplete: iOS ${counts.platformPublishingIosPass ? "pass" : "missing fresh dashboard proof"} / Android ${counts.platformPublishingAndroidPass ? "pass" : "missing fresh dashboard proof"}.`;
  }
  if (counts.iosPass && counts.androidPass && (!counts.platformIngestIosPass || !counts.platformIngestAndroidPass)) {
    return `Physical validation is partial: iOS and Android passed, but retained YouTube/Twitch ingest handoff proof is incomplete: iOS ${counts.platformIngestIosPass ? "pass" : "missing same-run send/receive proof"} / Android ${counts.platformIngestAndroidPass ? "pass" : "missing same-run send/receive proof"}.`;
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
    physicalDeviceIosPass: boolean;
    physicalDeviceAndroidPass: boolean;
    nativeRuntimeIosPass: boolean;
    nativeRuntimeAndroidPass: boolean;
    monitorHoldIosPass: boolean;
    monitorHoldAndroidPass: boolean;
    faceTrackingIosPass: boolean;
    faceTrackingAndroidPass: boolean;
    audioIosPass: boolean;
    audioAndroidPass: boolean;
    chatReadoutIosPass: boolean;
    chatReadoutAndroidPass: boolean;
    platformPublishingIosPass: boolean;
    platformPublishingAndroidPass: boolean;
    platformIngestIosPass: boolean;
    platformIngestAndroidPass: boolean;
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
  if (context.iosPass && context.androidPass && (!context.physicalDeviceIosPass || !context.physicalDeviceAndroidPass)) {
    return "Record fresh iOS and Android validation runs with explicit real device model/name and OS version, not Simulator, Emulator, browser, or generic test-device labels.";
  }
  if (context.iosPass && context.androidPass && (!context.nativeRuntimeIosPass || !context.nativeRuntimeAndroidPass)) {
    return "Record fresh iOS and Android validation runs with native publisher/compositor telemetry showing sent video/audio frames, bytes written, clean compositor state, and all still-image assets loaded.";
  }
  if (context.iosPass && context.androidPass && (!context.monitorHoldIosPass || !context.monitorHoldAndroidPass)) {
    return `Record fresh iOS and Android validation runs with at least ${minimumValidationMonitorDurationSeconds}s / ${minimumValidationMonitorSampleCount} samples of stable bitrate/FPS telemetry and no drops or reconnects.`;
  }
  if (context.iosPass && context.androidPass && (!context.faceTrackingIosPass || !context.faceTrackingAndroidPass)) {
    return "Record fresh iOS and Android validation runs with native camera tracking active and visible PNGTuber motion applied.";
  }
  if (context.iosPass && context.androidPass && (!context.audioIosPass || !context.audioAndroidPass)) {
    return "Record fresh iOS and Android validation runs with mic effects enabled, headphones-only self-monitoring verified, native monitor write/drop proof retained, and measured monitor latency within budget.";
  }
  if (context.iosPass && context.androidPass && (!context.chatReadoutIosPass || !context.chatReadoutAndroidPass)) {
    return "Record fresh iOS and Android validation runs with YouTube/Twitch chat connected and readout speaking a sample message.";
  }
  if (context.iosPass && context.androidPass && (!context.platformPublishingIosPass || !context.platformPublishingAndroidPass)) {
    return "Record fresh iOS and Android validation runs after refreshing YouTube Live or Twitch dashboard status within 10 minutes and retaining the live/active proof.";
  }
  if (context.iosPass && context.androidPass && (!context.platformIngestIosPass || !context.platformIngestAndroidPass)) {
    return "Record fresh iOS and Android validation runs where the same run proves native video/audio frames were sent and YouTube Live or Twitch dashboard status was receiving ingest.";
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
  devicePlatform: StreamValidationDevicePlatform,
  physicalDeviceStatus: StreamValidationFeatureStatus,
  nativeRuntime: StreamSessionNativeRuntimeSummary | null,
  monitorHold: StreamValidationMonitorHoldSummary | null,
  faceTracking: StreamValidationFaceTrackingSummary | null,
  audio: StreamValidationAudioSummary | null,
  chatReadout: StreamValidationChatReadoutSummary | null,
  platformPublishing: StreamDiagnostics["platformPublishing"] | null,
  platformPublishingFreshness: PlatformPublishingFreshness | null
): StreamValidationRunResult => {
  if (
    result === "fail" ||
    physicalDeviceStatus === "fail" ||
    nativeRuntime?.status === "fail" ||
    monitorHold?.status === "fail" ||
    audio?.status === "fail" ||
    chatReadout?.status === "fail" ||
    platformPublishing?.status === "fail"
  ) {
    return "fail";
  }
  if (
    result === "warn" ||
    physicalDeviceStatus !== "pass" ||
    !isNativeRuntimeEvidencePass(nativeRuntime, devicePlatform) ||
    !isMonitorHoldEvidencePass(monitorHold) ||
    nativeRuntime?.status === "warn" ||
    monitorHold?.status === "warn" ||
    monitorHold?.status === "pending" ||
    faceTracking?.status === "warn" ||
    !isAudioEvidencePass(audio) ||
    !isFeatureEvidencePass(chatReadout) ||
    platformPublishing?.status === "warn" ||
    !isPlatformPublishingEvidencePass(platformPublishing, platformPublishingFreshness)
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
  physicalDevice: Pick<StreamValidationRun, "physicalDeviceSummary">,
  nativeRuntime: StreamSessionNativeRuntimeSummary | null,
  monitorHold: StreamValidationMonitorHoldSummary | null,
  faceTracking: StreamValidationFaceTrackingSummary | null,
  audio: StreamValidationAudioSummary | null,
  chatReadout: StreamValidationChatReadoutSummary | null,
  qualityAutomation: StreamValidationQualityAutomationSummary | null,
  platformPublishing: StreamDiagnostics["platformPublishing"] | null,
  platformPublishingFreshness: PlatformPublishingFreshness | null
): string => {
  const prefix = result === "pass" ? "Passed" : result === "warn" ? "Needs review" : "Failed";
  return `${prefix} physical validation on ${deviceName} for ${targetPlatform}; checklist was ${checklistStatus}. ${physicalDevice.physicalDeviceSummary}${nativeRuntime ? ` ${nativeRuntime.summary}` : ""}${monitorHold ? ` ${monitorHold.summary}` : ""}${faceTracking && faceTracking.status !== "info" ? ` ${faceTracking.summary}` : ""}${audio ? ` ${audio.summary}` : ""}${chatReadout ? ` ${chatReadout.summary}` : ""}${qualityAutomation ? ` ${qualityAutomation.summary}` : ""}${platformPublishing && platformPublishing.status !== "info" ? ` ${platformPublishing.summary}` : ""}${platformPublishingFreshness && platformPublishingFreshness.status !== "not-applicable" ? ` ${platformPublishingFreshness.summary}` : ""}`;
};

const createRunRecommendation = (
  result: StreamValidationRunResult,
  fallbackRecommendation: string,
  physicalDevice: Pick<StreamValidationRun, "physicalDeviceStatus" | "physicalDeviceRecommendation">,
  nativeRuntime: StreamSessionNativeRuntimeSummary | null,
  monitorHold: StreamValidationMonitorHoldSummary | null,
  faceTracking: StreamValidationFaceTrackingSummary | null,
  audio: StreamValidationAudioSummary | null,
  chatReadout: StreamValidationChatReadoutSummary | null,
  qualityAutomation: StreamValidationQualityAutomationSummary | null,
  platformPublishing: StreamDiagnostics["platformPublishing"] | null,
  platformPublishingFreshness: PlatformPublishingFreshness | null
): string => {
  if (physicalDevice.physicalDeviceStatus === "fail") {
    return physicalDevice.physicalDeviceRecommendation;
  }
  if (nativeRuntime?.status === "fail") {
    return nativeRuntime.recommendation;
  }
  if (monitorHold?.status === "fail") {
    return monitorHold.recommendation;
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
  if (audio && audio.status !== "pass" && !isAudioLatencyOnlyWarning(audio)) {
    return audio.recommendation;
  }
  if (chatReadout && chatReadout.status !== "pass") {
    return chatReadout.recommendation;
  }
  if (monitorHold && monitorHold.status !== "pass") {
    return monitorHold.recommendation;
  }
  if (qualityAutomation?.status === "warn") {
    return qualityAutomation.recommendation;
  }
  if (platformPublishing?.status === "warn") {
    return platformPublishing.recommendation;
  }
  if (!isPlatformPublishingEvidencePass(platformPublishing, platformPublishingFreshness) && platformPublishingFreshness) {
    return platformPublishingFreshness.recommendation;
  }
  if (physicalDevice.physicalDeviceStatus !== "pass") {
    return physicalDevice.physicalDeviceRecommendation;
  }
  if (audio && audio.status !== "pass") {
    return audio.recommendation;
  }
  if (nativeRuntime) {
    return "Record native publisher/compositor telemetry matching this validation device and showing sent video/audio frames, bytes written, clean compositor state, and all still-image assets loaded.";
  }
  return fallbackRecommendation;
};

const isAudioLatencyOnlyWarning = (audio: StreamValidationAudioSummary): boolean =>
  audio.status === "warn" &&
  audio.monitorLatencyStatus !== "pass" &&
  audio.micEffectsEnabled &&
  audio.monitorEnabled &&
  audio.monitorRouteStatus === "pass" &&
  isNativeMonitorProofPass(audio, audio.monitorHeadphonesOnly);

const createMonitorHoldValidationSummary = (
  diagnostics: StreamDiagnostics,
  secrets: string[]
): StreamValidationMonitorHoldSummary => {
  const health = diagnostics.history.sampleCount > 0 ? diagnostics.history : diagnostics.session.lastSummary?.health ?? diagnostics.history;
  const outcome = diagnostics.session.lastSummary?.outcome ?? null;
  const status = createMonitorHoldStatus(health, outcome);
  const summary = createMonitorHoldSummary(health, status);
  const recommendation = createMonitorHoldRecommendation(health, status, outcome);

  return {
    status,
    sampleCount: health.sampleCount,
    durationSeconds: Math.floor(health.durationSeconds),
    stability: health.stability,
    averageBitrateKbps: health.averageBitrateKbps,
    minimumBitrateKbps: health.minimumBitrateKbps,
    averageFps: health.averageFps,
    minimumFps: health.minimumFps,
    droppedFrameIncrease: health.droppedFrameIncrease,
    observedReconnectAttempts: health.observedReconnectAttempts,
    summary: sanitizeStoredText(summary, secrets),
    recommendation: sanitizeStoredText(recommendation, secrets)
  };
};

const createMonitorHoldStatus = (
  health: StreamHealthHistorySummary,
  sessionOutcome: StreamValidationRun["sessionOutcome"]
): StreamValidationFeatureStatus => {
  if (sessionOutcome === "fail" || health.stability === "unstable" || health.observedReconnectAttempts > 0) {
    return "fail";
  }
  return isMonitorHoldEvidencePass({
    status: "pass",
    sampleCount: health.sampleCount,
    durationSeconds: Math.floor(health.durationSeconds),
    stability: health.stability,
    averageBitrateKbps: health.averageBitrateKbps,
    minimumBitrateKbps: health.minimumBitrateKbps,
    averageFps: health.averageFps,
    minimumFps: health.minimumFps,
    droppedFrameIncrease: health.droppedFrameIncrease,
    observedReconnectAttempts: health.observedReconnectAttempts,
    summary: "",
    recommendation: ""
  })
    ? "pass"
    : "warn";
};

const createMonitorHoldSummary = (
  health: StreamHealthHistorySummary,
  status: StreamValidationFeatureStatus
): string => {
  const base = `${Math.floor(health.durationSeconds)}s / ${health.sampleCount} samples / ${health.stability} / avg ${health.averageBitrateKbps} kbps / ${health.averageFps} fps / min ${health.minimumBitrateKbps} kbps / ${health.minimumFps} fps / +${health.droppedFrameIncrease} drops / ${health.observedReconnectAttempts} reconnects.`;
  if (status === "pass") {
    return `Stable monitor hold retained: ${base}`;
  }
  if (status === "fail") {
    return `Monitor hold failed: ${base}`;
  }
  return `Monitor hold needs more evidence: ${base}`;
};

const createMonitorHoldRecommendation = (
  health: StreamHealthHistorySummary,
  status: StreamValidationFeatureStatus,
  sessionOutcome: StreamValidationRun["sessionOutcome"]
): string => {
  if (status === "pass") {
    return "Keep this stable monitor hold with the release-candidate validation run.";
  }
  if (sessionOutcome === "fail" || health.stability === "unstable" || health.observedReconnectAttempts > 0) {
    return "Fix the stream instability or reconnect behavior, then repeat the private validation hold.";
  }
  return `Keep the private stream running until at least ${minimumValidationMonitorDurationSeconds}s and ${minimumValidationMonitorSampleCount} samples are retained with stable bitrate/FPS, zero drops, and zero reconnects.`;
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
  runtimeAgeMs: faceTracking.runtimeAgeMs,
  runtimeFresh: faceTracking.runtimeFresh,
  visibleAvatarCount: faceTracking.visibleAvatarCount,
  preparedPngTuberCount: faceTracking.preparedPngTuberCount,
  activeMotionCount: faceTracking.activeMotionCount,
  rigIssueCount: faceTracking.rigIssueCount,
  rigIssueSummary: sanitizeStoredText(faceTracking.rigIssueSummary, secrets),
  summary: sanitizeStoredText(faceTracking.summary, secrets),
  recommendation: sanitizeStoredText(faceTracking.recommendation, secrets)
});

const createAudioValidationSummary = (
  diagnostics: StreamDiagnostics,
  audioMonitorTuning: StreamValidationAudioMonitorTuningInput | null | undefined,
  secrets: string[]
): StreamValidationAudioSummary => {
  const item = findRunbookItem(diagnostics, "audio");
  const audioLevel = diagnostics.session.lastSummary?.audioLevel ?? null;
  const nativeMonitor = createNativeMonitorEvidence(diagnostics);
  const monitorTuning = createMonitorLatencyEvidence(diagnostics, audioMonitorTuning, secrets);
  const baseStatus = item?.status ?? "pending";
  const nativeMonitorPass = isNativeMonitorProofPass(nativeMonitor, diagnostics.audio.monitorHeadphonesOnly);
  const status = combineAudioValidationStatus(baseStatus, nativeMonitorPass, monitorTuning.monitorLatencyStatus);
  const nativeMonitorSummary = createNativeMonitorProofSummary(nativeMonitor);
  const audioRecommendation =
    baseStatus !== "pass"
      ? item?.action ?? "Repeat validation with mic effects and headphone monitoring checked."
      : baseStatus === "pass" && !nativeMonitorPass
        ? "Repeat validation until native self-monitoring reports written frames, zero drops, and headphone route proof."
        : monitorTuning.monitorLatencyStatus !== "pass"
          ? monitorTuning.recommendation
          : null;
  return {
    status,
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
    monitorLatencyMs: monitorTuning.monitorLatencyMs,
    monitorLatencyBudgetMs: monitorTuning.monitorLatencyBudgetMs,
    monitorLatencyStatus: monitorTuning.monitorLatencyStatus,
    monitorLatencySource: monitorTuning.monitorLatencySource,
    bluetoothRoute: monitorTuning.bluetoothRoute,
    monitorTuningNote: monitorTuning.monitorTuningNote,
    levelSampleCount: audioLevel?.sampleCount ?? 0,
    averageLevel: audioLevel?.averageLevel ?? 0,
    peakLevel: audioLevel?.peakLevel ?? 0,
    activeLevelPercent: audioLevel?.activePercent ?? 0,
    clippedLevelCount: audioLevel?.clippedSampleCount ?? 0,
    summary: sanitizeStoredText(
      `${audioLevel && audioLevel.sampleCount > 0 ? `${audioLevel.summary} ` : ""}${
        item?.detail ?? "No mic FX/headphone monitor validation retained."
      } ${nativeMonitorSummary} ${monitorTuning.summary}`,
      secrets
    ),
    recommendation: sanitizeStoredText(
      audioRecommendation ?? item?.action ?? "Repeat validation with mic effects and headphone monitoring checked.",
      secrets
    )
  };
};

const combineAudioValidationStatus = (
  baseStatus: StreamValidationFeatureStatus,
  nativeMonitorPass: boolean,
  latencyStatus: StreamValidationFeatureStatus
): StreamValidationFeatureStatus => {
  if (baseStatus === "fail") {
    return "fail";
  }
  if (baseStatus === "pending") {
    return "pending";
  }
  if (baseStatus === "warn" || !nativeMonitorPass) {
    return "warn";
  }
  if (latencyStatus === "fail") {
    return "fail";
  }
  if (latencyStatus !== "pass") {
    return "warn";
  }
  return "pass";
};

const createMonitorLatencyEvidence = (
  diagnostics: StreamDiagnostics,
  audioMonitorTuning: StreamValidationAudioMonitorTuningInput | null | undefined,
  secrets: string[]
): Pick<
  StreamValidationAudioSummary,
  | "monitorLatencyMs"
  | "monitorLatencyBudgetMs"
  | "monitorLatencyStatus"
  | "monitorLatencySource"
  | "bluetoothRoute"
  | "monitorTuningNote"
> & {
  summary: string;
  recommendation: string;
} => {
  const route = diagnostics.audio.monitorSafety.route;
  const nativeRoute = diagnostics.nativeRuntime?.audioProcessing?.monitorRoute ?? diagnostics.session.lastSummary?.nativeRuntime?.monitorRoute ?? "";
  const bluetoothRoute = isBluetoothMonitorRoute(route) || nativeRoute.toLowerCase().includes("bluetooth");
  const nativeLatency = resolveNativeMonitorLatencyEvidence(diagnostics);
  const manualLatencyMs = normalizeNullableCount(audioMonitorTuning?.measuredLatencyMs);
  const measuredLatencyMs = manualLatencyMs ?? nativeLatency.monitorLatencyMs;
  const monitorLatencyBudgetMs = bluetoothRoute ? bluetoothMonitorLatencyBudgetMs : defaultMonitorLatencyBudgetMs;
  const failureLimitMs = bluetoothRoute ? bluetoothMonitorLatencyFailureLimitMs : defaultMonitorLatencyFailureLimitMs;
  const monitorLatencyStatus = createMonitorLatencyStatus(measuredLatencyMs, monitorLatencyBudgetMs, failureLimitMs);
  const monitorLatencySource = manualLatencyMs !== null ? "manual" : nativeLatency.monitorLatencySource;
  const monitorTuningNote = sanitizeStoredText(audioMonitorTuning?.note ?? "", secrets);
  const routeLabel = bluetoothRoute ? "Bluetooth" : diagnostics.audio.monitorSafety.outputName;

  return {
    monitorLatencyMs: measuredLatencyMs,
    monitorLatencyBudgetMs,
    monitorLatencyStatus,
    monitorLatencySource,
    bluetoothRoute,
    monitorTuningNote,
    summary: sanitizeStoredText(
      createMonitorLatencySummary(
        measuredLatencyMs,
        monitorLatencyStatus,
        monitorLatencyBudgetMs,
        routeLabel,
        monitorTuningNote,
        monitorLatencySource
      ),
      secrets
    ),
    recommendation: sanitizeStoredText(
      createMonitorLatencyRecommendation(measuredLatencyMs, monitorLatencyStatus, monitorLatencyBudgetMs, bluetoothRoute),
      secrets
    )
  };
};

const createMonitorLatencyStatus = (
  measuredLatencyMs: number | null,
  budgetMs: number,
  failureLimitMs: number
): StreamValidationFeatureStatus => {
  if (measuredLatencyMs === null) {
    return "warn";
  }
  if (measuredLatencyMs <= budgetMs) {
    return "pass";
  }
  return measuredLatencyMs <= failureLimitMs ? "warn" : "fail";
};

const createMonitorLatencySummary = (
  measuredLatencyMs: number | null,
  status: StreamValidationFeatureStatus,
  budgetMs: number,
  routeLabel: string,
  note: string,
  source: string
): string => {
  const suffix = note ? ` Note: ${note}` : "";
  const sourceLabel = source ? ` (${source})` : "";
  if (measuredLatencyMs === null) {
    return `Monitor latency was not measured for ${routeLabel}; budget is ${budgetMs}ms.${suffix}`;
  }
  return `Monitor latency ${status}: ${measuredLatencyMs}ms on ${routeLabel}${sourceLabel} against ${budgetMs}ms budget.${suffix}`;
};

const createMonitorLatencyRecommendation = (
  measuredLatencyMs: number | null,
  status: StreamValidationFeatureStatus,
  budgetMs: number,
  bluetoothRoute: boolean
): string => {
  if (status === "pass") {
    return "Keep this monitor-latency baseline with the release-candidate validation run.";
  }
  if (measuredLatencyMs === null) {
    return `Measure processed mic self-monitor latency during the physical validation run and keep it at or below ${budgetMs}ms.`;
  }
  if (status === "fail") {
    return bluetoothRoute
      ? "Bluetooth monitor latency is too high for release evidence; retest with wired/USB headphones or tune the route before launch."
      : "Reduce monitor buffer size or disable self-monitoring for public launch, then repeat physical validation.";
  }
  return bluetoothRoute
    ? "Bluetooth monitor latency is above budget; prefer wired/USB headphones or mark the route as a reviewed limitation before release."
    : "Tune native monitor buffering and repeat the audio validation run until latency is within budget.";
};

const isBluetoothMonitorRoute = (route: AudioOutputRouteKind): boolean =>
  route === "bluetooth-a2dp" || route === "bluetooth-sco";

const resolveNativeMonitorLatencyEvidence = (
  diagnostics: StreamDiagnostics
): Pick<StreamValidationAudioSummary, "monitorLatencyMs" | "monitorLatencySource"> => {
  const current = diagnostics.nativeRuntime?.audioProcessing;
  const currentLatencyMs = normalizeNullableCount(current?.monitorEstimatedLatencyMs);
  if (currentLatencyMs !== null && currentLatencyMs > 0) {
    return {
      monitorLatencyMs: currentLatencyMs,
      monitorLatencySource: normalizeOptionalText(current?.monitorLatencySource) || "native-runtime"
    };
  }

  const retained = diagnostics.session.lastSummary?.nativeRuntime;
  const retainedLatencyMs = normalizeNullableCount(retained?.monitorEstimatedLatencyMs);
  if (retainedLatencyMs !== null && retainedLatencyMs > 0) {
    return {
      monitorLatencyMs: retainedLatencyMs,
      monitorLatencySource: normalizeOptionalText(retained?.monitorLatencySource) || "native-session-summary"
    };
  }

  return {
    monitorLatencyMs: null,
    monitorLatencySource: ""
  };
};

const isNativeMonitorProofPass = (
  nativeMonitor: Pick<
    StreamValidationAudioSummary,
    | "nativeMonitorReported"
    | "nativeMonitorHeadphonesConnected"
    | "nativeMonitorWrittenFrames"
    | "nativeMonitorDroppedFrames"
    | "nativeMonitorWrittenBuffers"
    | "nativeMonitorDroppedBuffers"
  >,
  headphonesOnly: boolean
): boolean =>
  nativeMonitor.nativeMonitorReported &&
  nativeMonitor.nativeMonitorWrittenFrames > 0 &&
  nativeMonitor.nativeMonitorWrittenBuffers > 0 &&
  nativeMonitor.nativeMonitorDroppedFrames === 0 &&
  nativeMonitor.nativeMonitorDroppedBuffers === 0 &&
  (!headphonesOnly || nativeMonitor.nativeMonitorHeadphonesConnected);

const createNativeMonitorProofSummary = (
  nativeMonitor: Pick<
    StreamValidationAudioSummary,
    | "nativeMonitorReported"
    | "nativeMonitorRunning"
    | "nativeMonitorHeadphonesConnected"
    | "nativeMonitorWrittenFrames"
    | "nativeMonitorDroppedFrames"
    | "nativeMonitorWrittenBuffers"
    | "nativeMonitorDroppedBuffers"
    | "nativeMonitorOutputName"
  >
): string =>
  nativeMonitor.nativeMonitorReported
    ? `Native monitor ${nativeMonitor.nativeMonitorRunning ? "running" : "reported"}: wrote ${nativeMonitor.nativeMonitorWrittenFrames} frame${nativeMonitor.nativeMonitorWrittenFrames === 1 ? "" : "s"} across ${nativeMonitor.nativeMonitorWrittenBuffers} buffer${nativeMonitor.nativeMonitorWrittenBuffers === 1 ? "" : "s"} with ${nativeMonitor.nativeMonitorDroppedFrames} dropped frame${nativeMonitor.nativeMonitorDroppedFrames === 1 ? "" : "s"} and ${nativeMonitor.nativeMonitorDroppedBuffers} dropped buffer${nativeMonitor.nativeMonitorDroppedBuffers === 1 ? "" : "s"} on ${nativeMonitor.nativeMonitorOutputName}; headphones ${nativeMonitor.nativeMonitorHeadphonesConnected ? "yes" : "no"}.`
    : "Native monitor write/drop proof is missing.";

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

const createStreamValidationRunFingerprint = (run: Omit<StreamValidationRun, "fingerprint">): string =>
  createStableFingerprint("svr1", toRunFingerprintPayload(run));

const createStreamValidationEvidenceFingerprint = (
  retainedRuns: StreamValidationRun[],
  scopedRuns: StreamValidationRun[],
  options: {
    maxAgeDays: number;
    requiredAppBuild: string;
    requiredTargetPlatform: string;
    requiredTransport: string;
  }
): string =>
  createStableFingerprint("sve1", {
    options,
    retainedRuns: retainedRuns.map(toEvidenceFingerprintRunRef),
    scopedRuns: scopedRuns.map(toEvidenceFingerprintRunRef)
  });

const createEvidenceRunManifestItem = (
  run: StreamValidationRun,
  {
    ageDays,
    fresh,
    matchesScope
  }: {
    ageDays: number;
    fresh: boolean;
    matchesScope: boolean;
  }
): StreamValidationEvidenceRunManifestItem => {
  const platformPublishingFreshness = getRunPlatformPublishingFreshness(run);
  return {
    id: run.id,
    fingerprint: run.fingerprint,
    createdAt: run.createdAt,
    ageDays,
    fresh,
    matchesScope,
    eligible: matchesScope && fresh,
    devicePlatform: run.devicePlatform,
    deviceName: run.deviceName,
    osVersion: run.osVersion,
    physicalDevice: run.physicalDevice,
    physicalDeviceStatus: run.physicalDeviceStatus,
    appBuild: run.appBuild,
    networkProfile: run.networkProfile,
    targetPlatform: run.targetPlatform,
    transport: run.transport,
    result: run.result,
    nativeRuntimePlatform: run.nativeRuntime?.platform ?? null,
    nativeRuntimeStatus: run.nativeRuntime?.status ?? null,
    nativeRuntimeCompositionStatus: run.nativeRuntime?.compositionStatus ?? null,
    nativeRuntimeSentVideoFrames: run.nativeRuntime?.sentVideoFrames ?? 0,
    nativeRuntimeSentAudioFrames: run.nativeRuntime?.sentAudioFrames ?? 0,
    nativeRuntimeBytesWritten: run.nativeRuntime?.bytesWritten ?? 0,
    nativeRuntimeStillImageAssetCount: run.nativeRuntime?.stillImageAssetCount ?? 0,
    nativeRuntimeStillImageAssetLoadedCount: run.nativeRuntime?.stillImageAssetLoadedCount ?? 0,
    nativeRuntimeStillImageAssetMissingCount: run.nativeRuntime?.stillImageAssetMissingCount ?? 0,
    monitorHoldStatus: run.monitorHold?.status ?? null,
    monitorHoldSampleCount: run.monitorHold?.sampleCount ?? 0,
    monitorHoldDurationSeconds: run.monitorHold?.durationSeconds ?? 0,
    monitorHoldStability: run.monitorHold?.stability ?? null,
    monitorHoldAverageBitrateKbps: run.monitorHold?.averageBitrateKbps ?? 0,
    monitorHoldMinimumBitrateKbps: run.monitorHold?.minimumBitrateKbps ?? 0,
    monitorHoldAverageFps: run.monitorHold?.averageFps ?? 0,
    monitorHoldMinimumFps: run.monitorHold?.minimumFps ?? 0,
    monitorHoldDroppedFrameIncrease: run.monitorHold?.droppedFrameIncrease ?? 0,
    monitorHoldObservedReconnectAttempts: run.monitorHold?.observedReconnectAttempts ?? 0,
    faceTrackingStatus: run.faceTracking?.status ?? null,
    faceTrackingRuntimeFresh: run.faceTracking?.runtimeFresh ?? null,
    faceTrackingRuntimeAgeMs: run.faceTracking?.runtimeAgeMs ?? null,
    faceTrackingActiveMotionCount: run.faceTracking?.activeMotionCount ?? 0,
    faceTrackingRigIssueCount: run.faceTracking?.rigIssueCount ?? 0,
    audioStatus: run.audio?.status ?? null,
    audioMonitorHeadphonesOnly: run.audio?.monitorHeadphonesOnly ?? false,
    audioNativeMonitorHeadphonesConnected: run.audio?.nativeMonitorHeadphonesConnected ?? false,
    audioNativeMonitorWrittenFrames: run.audio?.nativeMonitorWrittenFrames ?? 0,
    audioNativeMonitorDroppedFrames: run.audio?.nativeMonitorDroppedFrames ?? 0,
    audioNativeMonitorWrittenBuffers: run.audio?.nativeMonitorWrittenBuffers ?? 0,
    audioNativeMonitorDroppedBuffers: run.audio?.nativeMonitorDroppedBuffers ?? 0,
    audioMonitorLatencyStatus: run.audio?.monitorLatencyStatus ?? null,
    audioMonitorLatencyMs: run.audio?.monitorLatencyMs ?? null,
    chatReadoutStatus: run.chatReadout?.status ?? null,
    chatReadoutSpokenMessageCount: run.chatReadout?.spokenMessageCount ?? 0,
    chatReadoutSpeechFailureCount: run.chatReadout?.speechFailureCount ?? 0,
    qualityAutomationStatus: run.qualityAutomation?.status ?? null,
    platformPublishingPlatform: run.platformPublishing?.platform ?? null,
    platformPublishingStatus: run.platformPublishing?.status ?? null,
    platformPublishingFreshnessStatus: platformPublishingFreshness.status,
    platformPublishingCheckedAt: platformPublishingFreshness.checkedAt,
    platformPublishingFreshnessAgeMinutes: platformPublishingFreshness.ageMinutes,
    platformPublishingYoutubeHasBroadcastId: run.platformPublishing?.youtube?.hasBroadcastId ?? false,
    platformPublishingYoutubeHasStreamId: run.platformPublishing?.youtube?.hasStreamId ?? false,
    platformPublishingYoutubeBroadcastStatus: run.platformPublishing?.youtube?.broadcastStatus ?? "",
    platformPublishingYoutubeStreamStatus: run.platformPublishing?.youtube?.streamStatus ?? "",
    platformPublishingYoutubeHealthStatus: run.platformPublishing?.youtube?.healthStatus ?? "",
    platformPublishingYoutubeHealthIssueCount: run.platformPublishing?.youtube?.healthIssueCount ?? 0,
    platformPublishingTwitchLiveStatus: run.platformPublishing?.twitch?.liveStatus ?? "",
    platformPublishingTwitchStartedAt: run.platformPublishing?.twitch?.startedAt ?? "",
    platformPublishingTwitchHasCategoryId: run.platformPublishing?.twitch?.hasCategoryId ?? false,
    platformPublishingTwitchViewerCount: run.platformPublishing?.twitch?.viewerCount ?? 0,
    summary: run.summary,
    recommendation: run.recommendation
  };
};

const toEvidenceFingerprintRunRef = (run: StreamValidationRun) => ({
  appBuild: run.appBuild,
  createdAt: run.createdAt,
  devicePlatform: run.devicePlatform,
  fingerprint: run.fingerprint,
  id: run.id,
  physicalDevice: run.physicalDevice,
  physicalDeviceStatus: run.physicalDeviceStatus,
  result: run.result,
  targetPlatform: run.targetPlatform,
  transport: run.transport
});

const toRunFingerprintPayload = ({
  recommendation: _recommendation,
  summary: _summary,
  ...payload
}: Omit<StreamValidationRun, "fingerprint">) => payload;

const createStableFingerprint = (prefix: string, value: unknown): string => {
  const canonical = JSON.stringify(canonicalize(value));
  return `${prefix}-${hashString(canonical)}-${canonical.length.toString(36)}`;
};

type CanonicalJson = null | boolean | number | string | CanonicalJson[] | { [key: string]: CanonicalJson };

const canonicalize = (value: unknown): CanonicalJson => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isRecord(value)) {
    return Object.keys(value)
      .sort()
      .reduce<{ [key: string]: CanonicalJson }>((canonical, key) => {
        canonical[key] = canonicalize(value[key]);
        return canonical;
      }, {});
  }
  return null;
};

const hashString = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

const defaultDeviceName = (platform: StreamValidationDevicePlatform): string =>
  platform === "ios" ? "iOS device" : "Android device";

const createPhysicalDeviceEvidence = (
  platform: StreamValidationDevicePlatform,
  deviceName: string,
  osVersion: string,
  secrets: string[]
): Pick<
  StreamValidationRun,
  "physicalDevice" | "physicalDeviceStatus" | "physicalDeviceSummary" | "physicalDeviceRecommendation"
> => {
  const evidence = classifyPhysicalDeviceEvidence(platform, deviceName, osVersion);
  return {
    physicalDevice: evidence.physicalDevice,
    physicalDeviceStatus: evidence.status,
    physicalDeviceSummary: sanitizeStoredText(evidence.summary, secrets),
    physicalDeviceRecommendation: sanitizeStoredText(evidence.recommendation, secrets)
  };
};

const normalizePhysicalDeviceEvidence = (
  value: Record<string, unknown>,
  platform: StreamValidationDevicePlatform,
  deviceName: string,
  osVersion: string
): Pick<
  StreamValidationRun,
  "physicalDevice" | "physicalDeviceStatus" | "physicalDeviceSummary" | "physicalDeviceRecommendation"
> => {
  const fallback = classifyPhysicalDeviceEvidence(platform, deviceName, osVersion);
  const explicitStatus = normalizeOptionalFeatureStatus(value.physicalDeviceStatus);
  const physicalDevice =
    typeof value.physicalDevice === "boolean" ? value.physicalDevice : fallback.physicalDevice;
  const physicalDeviceStatus =
    explicitStatus ?? (physicalDevice ? "pass" : fallback.status);
  return {
    physicalDevice,
    physicalDeviceStatus,
    physicalDeviceSummary: normalizeText(value.physicalDeviceSummary, fallback.summary),
    physicalDeviceRecommendation: normalizeText(value.physicalDeviceRecommendation, fallback.recommendation)
  };
};

const classifyPhysicalDeviceEvidence = (
  platform: StreamValidationDevicePlatform,
  deviceName: string,
  osVersion: string
): {
  physicalDevice: boolean;
  status: StreamValidationFeatureStatus;
  summary: string;
  recommendation: string;
} => {
  const label = `${deviceName} ${osVersion}`.toLowerCase();
  if (virtualDevicePattern.test(label)) {
    return {
      physicalDevice: false,
      status: "fail",
      summary: `Validation device is virtual or non-release hardware: ${deviceName} / ${osVersion}.`,
      recommendation: "Repeat validation on a real iPhone/iPad or Android handset before commercial approval."
    };
  }

  if (!hasSpecificDeviceLabel(platform, deviceName, osVersion)) {
    return {
      physicalDevice: false,
      status: "warn",
      summary: `Physical device proof is incomplete: ${deviceName} / ${osVersion}.`,
      recommendation: "Enter the real device model/name and OS version from the physical validation device."
    };
  }

  return {
    physicalDevice: true,
    status: "pass",
    summary: `Physical device proof retained: ${deviceName} / ${osVersion}.`,
    recommendation: "Keep this physical-device identity with the retained release-candidate evidence."
  };
};

const virtualDevicePattern =
  /\b(simulator|emulator|android sdk|sdk_gphone|sdk phone|sdk_phone|aosp|generic|xcode|preview|browser|chrome|mock|test device|unknown)\b/i;

const hasSpecificDeviceLabel = (
  platform: StreamValidationDevicePlatform,
  deviceName: string,
  osVersion: string
): boolean => {
  const normalizedName = deviceName.trim().toLowerCase();
  const normalizedOs = osVersion.trim().toLowerCase();
  if (!normalizedName || !normalizedOs || normalizedName === defaultDeviceName(platform).toLowerCase()) {
    return false;
  }

  if (platform === "ios") {
    return /\b(iphone|ipad|ipod)\b/.test(normalizedName) && /\bios|ipados\b/.test(normalizedOs);
  }

  return (
    /\bandroid\b/.test(normalizedOs) &&
    !/^android\s*(device)?$/.test(normalizedName) &&
    normalizedName.length >= 4
  );
};

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

const normalizeOptionalText = (value: unknown): string =>
  typeof value === "string" ? clampText(value.trim()) : "";

const clampText = (value: string): string => value.slice(0, 96);

const normalizeCount = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

const normalizeNullableCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;

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
    runtimeAgeMs: normalizeNullableCount(value.runtimeAgeMs),
    runtimeFresh: value.runtimeFresh === true,
    visibleAvatarCount: normalizeCount(value.visibleAvatarCount),
    preparedPngTuberCount: normalizeCount(value.preparedPngTuberCount),
    activeMotionCount: normalizeCount(value.activeMotionCount),
    rigIssueCount: normalizeCount(value.rigIssueCount),
    rigIssueSummary: normalizeText(value.rigIssueSummary, "No still-image rig issues."),
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
  const outputRoute = normalizeAudioOutputRoute(value.outputRoute);
  const bluetoothRoute = value.bluetoothRoute === true || isBluetoothMonitorRoute(outputRoute);
  const monitorLatencyMs = normalizeNullableCount(value.monitorLatencyMs);
  const monitorLatencyBudgetMs =
    normalizeCount(value.monitorLatencyBudgetMs) || (bluetoothRoute ? bluetoothMonitorLatencyBudgetMs : defaultMonitorLatencyBudgetMs);
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
    outputRoute,
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
    monitorLatencyMs,
    monitorLatencyBudgetMs,
    monitorLatencyStatus: normalizeFeatureStatus(value.monitorLatencyStatus),
    monitorLatencySource: normalizeOptionalText(value.monitorLatencySource),
    bluetoothRoute,
    monitorTuningNote: normalizeOptionalText(value.monitorTuningNote),
    levelSampleCount: normalizeCount(value.levelSampleCount),
    averageLevel: normalizeFiniteNumber(value.averageLevel, 0, 0, 1),
    peakLevel: normalizeFiniteNumber(value.peakLevel, 0, 0, 1),
    activeLevelPercent: Math.min(100, normalizeCount(value.activeLevelPercent)),
    clippedLevelCount: normalizeCount(value.clippedLevelCount),
    summary: normalizeText(value.summary, "No mic FX/headphone monitor validation evidence retained."),
    recommendation: normalizeText(value.recommendation, "Repeat validation with mic effects and headphone monitoring checked.")
  };
};

const normalizeMonitorHoldValidationSummary = (value: unknown): StreamValidationMonitorHoldSummary | null => {
  if (!isRecord(value)) {
    return null;
  }
  return {
    status: normalizeFeatureStatus(value.status),
    sampleCount: normalizeCount(value.sampleCount),
    durationSeconds: normalizeCount(value.durationSeconds),
    stability: normalizeHealthStability(value.stability),
    averageBitrateKbps: normalizeCount(value.averageBitrateKbps),
    minimumBitrateKbps: normalizeCount(value.minimumBitrateKbps),
    averageFps: normalizeFiniteNumber(value.averageFps, 0, 0, 240),
    minimumFps: normalizeFiniteNumber(value.minimumFps, 0, 0, 240),
    droppedFrameIncrease: normalizeCount(value.droppedFrameIncrease),
    observedReconnectAttempts: normalizeCount(value.observedReconnectAttempts),
    summary: normalizeText(value.summary, "No stable monitor-hold validation evidence retained."),
    recommendation: normalizeText(value.recommendation, "Repeat validation with a stable private monitor hold.")
  };
};

const normalizeHealthStability = (value: unknown): StreamHealthHistoryStability =>
  value === "stable" || value === "watch" || value === "unstable" || value === "unknown" ? value : "unknown";

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

const normalizeOptionalFeatureStatus = (value: unknown): StreamValidationFeatureStatus | null =>
  value === "pass" || value === "warn" || value === "fail" || value === "pending" ? value : null;

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

const normalizePlatformPublishingFreshness = (
  value: unknown,
  platformPublishing: StreamDiagnostics["platformPublishing"] | null,
  targetPlatform: string,
  createdAt: string
): PlatformPublishingFreshness => {
  if (isRecord(value)) {
    const status = normalizePlatformPublishingFreshnessStatus(value.status);
    return {
      status,
      platformLabel: normalizeText(value.platformLabel, platformPublishing?.platform === "twitch" ? "Twitch" : "YouTube"),
      checkedAt: normalizeText(value.checkedAt, ""),
      ageMinutes: normalizeNullableCount(value.ageMinutes),
      summary: normalizeText(value.summary, "No platform dashboard freshness evidence retained."),
      recommendation: normalizeText(
        value.recommendation,
        "Refresh platform dashboard status during private validation."
      )
    };
  }

  return assessPlatformPublishingFreshness(
    {
      platform: resolvePlatformPublishingFreshnessPlatform(targetPlatform),
      youtube: platformPublishing?.youtube ?? null,
      twitch: platformPublishing?.twitch ?? null
    },
    new Date(createdAt)
  );
};

const normalizePlatformPublishingFreshnessStatus = (value: unknown): PlatformPublishingFreshnessStatus =>
  value === "fresh" || value === "missing" || value === "invalid" || value === "stale" || value === "not-applicable"
    ? value
    : "missing";

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
    boundStreamId: normalizeText(value.boundStreamId, ""),
    broadcastPrivacyStatus: normalizeText(value.broadcastPrivacyStatus, ""),
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
    channelTitle: normalizeText(value.channelTitle, ""),
    channelCategory: normalizeText(value.channelCategory, ""),
    channelCategoryId: normalizeText(value.channelCategoryId, ""),
    channelLanguage: normalizeText(value.channelLanguage, ""),
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
