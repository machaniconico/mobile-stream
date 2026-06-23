import { getDestinationPreset, type StudioProfile } from "./profiles";
import type { ReadinessReport } from "./readiness";
import type { SceneDocument, SceneSource, SourceKind, Transform } from "./scene";
import type { StreamDiagnostics } from "./streamDiagnostics";
import type { StreamStartPreflightReport } from "./streamStartPreflight";

export interface SupportBundleSourceSummary {
  id: string;
  kind: SourceKind;
  name: string;
  visible: boolean;
  locked: boolean;
  transform: Transform;
  payload: Record<string, string | number | boolean>;
}

export interface SupportBundle {
  generatedAt: string;
  app: {
    name: "MobileLiveCaster";
    reportVersion: 1;
    bundleVersion: 1;
  };
  summary: {
    status: StreamDiagnostics["status"];
    preflightStatus: StreamStartPreflightReport["status"];
    diagnosticStatus: StreamDiagnostics["status"];
    launchBlockCount: number;
    launchWarningCount: number;
    diagnosticCheckCount: number;
    healthSampleCount: number;
    healthStability: StreamDiagnostics["history"]["stability"];
    sessionEventCount: number;
    completedSessionCount: number;
    sessionCleanRate: number;
    sessionHistoryStability: StreamDiagnostics["session"]["historySummary"]["stability"];
    lastSessionOutcome: NonNullable<StreamDiagnostics["session"]["lastSummary"]>["outcome"] | null;
    validationStatus: StreamDiagnostics["validation"]["status"];
    validationPendingCount: number;
    validationWarningCount: number;
    validationFailCount: number;
    validationEvidenceStatus: StreamDiagnostics["validationEvidence"]["status"];
    validationEvidenceRunCount: number;
    validationEvidenceEligibleRunCount: number;
    validationEvidenceStaleRunCount: number;
    validationEvidencePassCount: number;
    validationEvidenceFailureCount: number;
    validationEvidenceIosPass: boolean;
    validationEvidenceAndroidPass: boolean;
    validationEvidenceAppBuildMismatch: boolean;
    validationEvidenceConsistentAppBuild: string | null;
    qualityAdvisorAction: StreamDiagnostics["qualityAdvisor"]["action"];
    qualityAdvisorSeverity: StreamDiagnostics["qualityAdvisor"]["severity"];
    suggestedQualityTarget: string | null;
    nativeCompositionStatus: StreamDiagnostics["nativeComposition"]["status"];
    nativeCompositionCoverage: StreamDiagnostics["nativeComposition"]["coverage"];
    nativeCompositionPreviewOnlySourceCount: number;
    nativeCompositionRequiresCompositor: boolean;
    nativeRuntimePlatform: string | null;
    nativeRuntimeStatus: string | null;
    nativeRuntimePublisherState: string | null;
    nativeRuntimeCompositionStatus: string | null;
    nativeRuntimeStale: boolean;
    nativeRuntimeCongested: boolean;
    nativeRuntimeQueuedItems: number;
    nativeRuntimeCacheSize: number;
    sourceCount: number;
    visibleSourceCount: number;
  };
  target: StreamDiagnostics["target"];
  quality: StreamDiagnostics["quality"];
  preflight: StreamStartPreflightReport;
  diagnostics: StreamDiagnostics;
  scene: {
    id: string;
    name: string;
    canvas: SceneDocument["canvas"];
    sourceCounts: Record<SourceKind, number>;
    visibleSourceCount: number;
    lockedSourceCount: number;
    emptyImageSourceCount: number;
    live2dSourceCount: number;
    sources: SupportBundleSourceSummary[];
  };
  profile: {
    destination: {
      platform: StudioProfile["destination"]["platform"];
      presetId: StudioProfile["destination"]["presetId"];
      presetName: string;
      protocol: StudioProfile["destination"]["protocol"];
      host: string;
      application: string;
      publishUrlPreview: string;
      streamKeyPreview: string;
    };
    micEffects: StudioProfile["micEffects"];
    faceTracking: StudioProfile["faceTracking"];
    platformChat: {
      enabled: boolean;
      platform: StudioProfile["platformChat"]["platform"];
      hasYouTubeLiveChatId: boolean;
      hasTwitchChannel: boolean;
    };
    platformPublishing: {
      titleLength: number;
      descriptionLength: number;
      privacyStatus: StudioProfile["platformPublishing"]["privacyStatus"];
      scheduledStartMinutesFromNow: number;
      madeForKids: boolean;
      enableAutoStart: boolean;
      enableAutoStop: boolean;
      hasYouTubeStreamId: boolean;
      hasYouTubeBroadcastId: boolean;
      youtubeBroadcastStatus: string;
      youtubeStreamStatus: string;
      youtubeStreamHealthStatus: string;
      youtubeStreamHealthIssueCount: number;
      twitchCategory: string;
      twitchLanguage: string;
      twitchLiveStatus: string;
      twitchViewerCount: number;
    };
  };
}

export const createSupportBundle = ({
  scene,
  profile,
  readiness,
  preflight,
  diagnostics,
  now = new Date()
}: {
  scene: SceneDocument;
  profile: StudioProfile;
  readiness: ReadinessReport;
  preflight: StreamStartPreflightReport;
  diagnostics: StreamDiagnostics;
  now?: Date;
}): SupportBundle => {
  const sourceCounts = countSources(scene.sources);
  const visibleSourceCount = scene.sources.filter((source) => source.visible).length;
  const lockedSourceCount = scene.sources.filter((source) => source.locked).length;

  return {
    generatedAt: now.toISOString(),
    app: {
      name: "MobileLiveCaster",
      reportVersion: 1,
      bundleVersion: 1
    },
    summary: {
      status: diagnostics.status,
      preflightStatus: preflight.status,
      diagnosticStatus: diagnostics.status,
      launchBlockCount: preflight.blocks.length,
      launchWarningCount: preflight.warnings.length,
      diagnosticCheckCount: diagnostics.checks.length,
      healthSampleCount: diagnostics.history.sampleCount,
      healthStability: diagnostics.history.stability,
      sessionEventCount: diagnostics.session.events.length,
      completedSessionCount: diagnostics.session.summaries.length,
      sessionCleanRate: diagnostics.session.historySummary.cleanRate,
      sessionHistoryStability: diagnostics.session.historySummary.stability,
      lastSessionOutcome: diagnostics.session.lastSummary?.outcome ?? null,
      validationStatus: diagnostics.validation.status,
      validationPendingCount: diagnostics.validation.pendingCount,
      validationWarningCount: diagnostics.validation.warningCount,
      validationFailCount: diagnostics.validation.failCount,
      validationEvidenceStatus: diagnostics.validationEvidence.status,
      validationEvidenceRunCount: diagnostics.validationEvidence.totalRuns,
      validationEvidenceEligibleRunCount: diagnostics.validationEvidence.eligibleRunCount,
      validationEvidenceStaleRunCount: diagnostics.validationEvidence.staleRunCount,
      validationEvidencePassCount: diagnostics.validationEvidence.passCount,
      validationEvidenceFailureCount: diagnostics.validationEvidence.failureCount,
      validationEvidenceIosPass: diagnostics.validationEvidence.iosPass,
      validationEvidenceAndroidPass: diagnostics.validationEvidence.androidPass,
      validationEvidenceAppBuildMismatch: diagnostics.validationEvidence.appBuildMismatch,
      validationEvidenceConsistentAppBuild: diagnostics.validationEvidence.consistentAppBuild,
      qualityAdvisorAction: diagnostics.qualityAdvisor.action,
      qualityAdvisorSeverity: diagnostics.qualityAdvisor.severity,
      suggestedQualityTarget: diagnostics.qualityAdvisor.suggestedTarget
        ? formatQualityAdvisorTarget(diagnostics.qualityAdvisor.suggestedTarget)
        : null,
      nativeCompositionStatus: diagnostics.nativeComposition.status,
      nativeCompositionCoverage: diagnostics.nativeComposition.coverage,
      nativeCompositionPreviewOnlySourceCount: diagnostics.nativeComposition.previewOnlySourceCount,
      nativeCompositionRequiresCompositor: diagnostics.nativeComposition.requiresNativeCompositor,
      nativeRuntimePlatform: diagnostics.nativeRuntime?.platform ?? null,
      nativeRuntimeStatus: diagnostics.nativeRuntime?.runtimeStatus ?? null,
      nativeRuntimePublisherState: diagnostics.nativeRuntime?.publisher.state ?? null,
      nativeRuntimeCompositionStatus: diagnostics.nativeRuntime?.composition.status ?? null,
      nativeRuntimeStale: diagnostics.nativeRuntime?.stale ?? false,
      nativeRuntimeCongested: diagnostics.nativeRuntime?.publisher.congested ?? false,
      nativeRuntimeQueuedItems: diagnostics.nativeRuntime?.publisher.itemsInCache ?? 0,
      nativeRuntimeCacheSize: diagnostics.nativeRuntime?.publisher.cacheSize ?? 0,
      sourceCount: scene.sources.length,
      visibleSourceCount
    },
    target: diagnostics.target,
    quality: diagnostics.quality,
    preflight,
    diagnostics,
    scene: {
      id: scene.id,
      name: scene.name,
      canvas: scene.canvas,
      sourceCounts,
      visibleSourceCount,
      lockedSourceCount,
      emptyImageSourceCount: scene.sources.filter((source) => source.kind === "image" && !source.uri.trim()).length,
      live2dSourceCount: sourceCounts.live2d,
      sources: scene.sources.map(toSourceSummary)
    },
    profile: {
      destination: {
        platform: profile.destination.platform,
        presetId: profile.destination.presetId,
        presetName: getDestinationPreset(profile.destination.presetId)?.name ?? profile.destination.name,
        protocol: profile.destination.protocol,
        host: diagnostics.target.host,
        application: diagnostics.target.application,
        publishUrlPreview: diagnostics.target.publishUrlPreview,
        streamKeyPreview: diagnostics.target.streamKeyPreview
      },
      micEffects: { ...profile.micEffects },
      faceTracking: { ...profile.faceTracking },
      platformChat: {
        enabled: profile.platformChat.enabled,
        platform: profile.platformChat.platform,
        hasYouTubeLiveChatId: Boolean(profile.platformChat.youtubeLiveChatId.trim()),
        hasTwitchChannel: Boolean(profile.platformChat.twitchChannel.trim())
      },
      platformPublishing: {
        titleLength: profile.platformPublishing.title.length,
        descriptionLength: profile.platformPublishing.description.length,
        privacyStatus: profile.platformPublishing.privacyStatus,
        scheduledStartMinutesFromNow: profile.platformPublishing.scheduledStartMinutesFromNow,
        madeForKids: profile.platformPublishing.madeForKids,
        enableAutoStart: profile.platformPublishing.enableAutoStart,
        enableAutoStop: profile.platformPublishing.enableAutoStop,
        hasYouTubeStreamId: Boolean(profile.platformPublishing.youtubeStreamId.trim()),
        hasYouTubeBroadcastId: Boolean(profile.platformPublishing.youtubeBroadcastId.trim()),
        youtubeBroadcastStatus: profile.platformPublishing.youtubeBroadcastStatus,
        youtubeStreamStatus: profile.platformPublishing.youtubeStreamStatus,
        youtubeStreamHealthStatus: profile.platformPublishing.youtubeStreamHealthStatus,
        youtubeStreamHealthIssueCount: profile.platformPublishing.youtubeStreamHealthIssues.length,
        twitchCategory: profile.platformPublishing.twitchCategory,
        twitchLanguage: profile.platformPublishing.twitchLanguage,
        twitchLiveStatus: profile.platformPublishing.twitchLiveStatus,
        twitchViewerCount: profile.platformPublishing.twitchViewerCount
      }
    }
  };
};

export const serializeSupportBundle = (bundle: SupportBundle): string => JSON.stringify(bundle, null, 2);

export const formatSupportBundle = (bundle: SupportBundle): string => {
  return [
    "MobileLiveCaster Support Bundle",
    `Generated: ${bundle.generatedAt}`,
    `Status: ${bundle.summary.status}`,
    `Preflight: ${bundle.summary.preflightStatus} (${bundle.summary.launchBlockCount} blocks, ${bundle.summary.launchWarningCount} warnings)`,
    `Diagnostics: ${bundle.summary.diagnosticStatus} (${bundle.summary.diagnosticCheckCount} checks)`,
    "",
    "Target",
    `- Platform: ${bundle.target.platform}`,
    `- Preset: ${bundle.target.presetName}`,
    `- Protocol: ${bundle.target.protocol}`,
    `- Endpoint: ${bundle.target.host}/${bundle.target.application}`,
    `- Publish URL: ${bundle.target.publishUrlPreview}`,
    "",
    "Scene",
    `- Canvas: ${bundle.scene.canvas.width}x${bundle.scene.canvas.height} / ${bundle.scene.canvas.fps}fps`,
    `- Sources: ${bundle.summary.sourceCount} total / ${bundle.summary.visibleSourceCount} visible / ${bundle.scene.lockedSourceCount} locked`,
    `- Source counts: ${formatSourceCounts(bundle.scene.sourceCounts)}`,
    "",
    "Launch Preflight",
    `- Summary: ${bundle.preflight.summary}`,
    `- Action: ${bundle.preflight.primaryAction}`,
    ...(bundle.preflight.issues.length === 0
      ? ["- No launch preflight issues."]
      : bundle.preflight.issues.map(
          (issue) => `- [${issue.severity.toUpperCase()}] ${issue.label}: ${issue.message} Recommendation: ${issue.recommendation}`
        )),
    "",
    "Session",
    `- Events: ${bundle.summary.sessionEventCount}`,
    `- Completed summaries: ${bundle.summary.completedSessionCount}`,
    `- History stability: ${bundle.summary.sessionHistoryStability}`,
    `- Clean rate: ${bundle.summary.sessionCleanRate}%`,
    `- History summary: ${bundle.diagnostics.session.historySummary.summary}`,
    `- History recommendation: ${bundle.diagnostics.session.historySummary.recommendation}`,
    `- Last outcome: ${bundle.summary.lastSessionOutcome ?? "-"}`,
    `- Last summary: ${bundle.diagnostics.session.lastSummary?.summary ?? "-"}`,
    `- Last recommendation: ${bundle.diagnostics.session.lastSummary?.recommendation ?? "-"}`,
    `- Health history: ${bundle.diagnostics.history.summary}`,
    `- Quality incidents: ${bundle.diagnostics.qualityIncidents.summary}`,
    `- Quality advisor: ${bundle.summary.qualityAdvisorAction} / ${bundle.summary.qualityAdvisorSeverity}`,
    `- Suggested quality: ${bundle.summary.suggestedQualityTarget ?? "-"}`,
    `- Recovery: ${bundle.diagnostics.recovery.mode} / ${bundle.diagnostics.recovery.recommendedAction}`,
    `- Native composition: ${bundle.summary.nativeCompositionStatus} / ${bundle.summary.nativeCompositionCoverage} / preview-only ${bundle.summary.nativeCompositionPreviewOnlySourceCount}`,
    `- Native compositor required: ${bundle.summary.nativeCompositionRequiresCompositor ? "yes" : "no"}`,
    `- Native runtime: ${bundle.summary.nativeRuntimePlatform ?? "-"} / ${bundle.summary.nativeRuntimeStatus ?? "-"} / publisher ${bundle.summary.nativeRuntimePublisherState ?? "-"} / composition ${bundle.summary.nativeRuntimeCompositionStatus ?? "-"} / stale ${bundle.summary.nativeRuntimeStale ? "yes" : "no"} / congested ${bundle.summary.nativeRuntimeCongested ? "yes" : "no"} / queue ${bundle.summary.nativeRuntimeQueuedItems}/${bundle.summary.nativeRuntimeCacheSize}`,
    "",
    "Commercial Validation",
    `- Status: ${bundle.summary.validationStatus}`,
    `- Pending: ${bundle.summary.validationPendingCount}`,
    `- Warnings: ${bundle.summary.validationWarningCount}`,
    `- Failures: ${bundle.summary.validationFailCount}`,
    `- Summary: ${bundle.diagnostics.validation.summary}`,
    `- Next step: ${bundle.diagnostics.validation.recommendedNextStep}`,
    `- Evidence: ${bundle.summary.validationEvidenceStatus} / ${bundle.summary.validationEvidenceRunCount} retained / ${bundle.summary.validationEvidenceEligibleRunCount} eligible / ${bundle.summary.validationEvidenceStaleRunCount} stale`,
    `- Evidence outcomes: ${bundle.summary.validationEvidencePassCount} pass / ${bundle.summary.validationEvidenceFailureCount} fail`,
    `- Physical coverage: iOS ${bundle.summary.validationEvidenceIosPass ? "pass" : "missing"} / Android ${bundle.summary.validationEvidenceAndroidPass ? "pass" : "missing"}`,
    `- Validation build: ${bundle.summary.validationEvidenceConsistentAppBuild ?? (bundle.summary.validationEvidenceAppBuildMismatch ? "mismatch" : "-")}`,
    `- Evidence summary: ${bundle.diagnostics.validationEvidence.summary}`,
    `- Evidence recommendation: ${bundle.diagnostics.validationEvidence.recommendation}`,
    ...bundle.diagnostics.validation.items.map(
      (item) => `- [${item.status.toUpperCase()}] ${item.title}: ${item.detail} Action: ${item.action}`
    ),
    "",
    "Profile",
    `- Mic effects: ${bundle.profile.micEffects.enabled ? bundle.profile.micEffects.presetId : "off"}`,
    `- Mic monitor: ${bundle.profile.micEffects.monitorEnabled ? "on" : "off"} / headphones-only ${bundle.profile.micEffects.monitorHeadphonesOnly ? "on" : "off"}`,
    `- Face tracking: ${bundle.profile.faceTracking.enabled ? bundle.profile.faceTracking.inputMode : "off"} / ${bundle.profile.faceTracking.rigMode}`,
    `- Platform chat: ${bundle.profile.platformChat.enabled ? bundle.profile.platformChat.platform : "off"}`,
    `- Publishing: title ${bundle.profile.platformPublishing.titleLength} chars / description ${bundle.profile.platformPublishing.descriptionLength} chars`
  ].join("\n");
};

const countSources = (sources: SceneSource[]): Record<SourceKind, number> => {
  const counts: Record<SourceKind, number> = {
    screen: 0,
    pngtuber: 0,
    live2d: 0,
    image: 0,
    solid: 0,
    text: 0
  };

  for (const source of sources) {
    counts[source.kind] += 1;
  }

  return counts;
};

const formatQualityAdvisorTarget = (target: NonNullable<StreamDiagnostics["qualityAdvisor"]["suggestedTarget"]>): string =>
  `${target.profileName} ${target.width}x${target.height}/${target.fps}fps/${target.videoBitrateKbps}kbps`;

const toSourceSummary = (source: SceneSource): SupportBundleSourceSummary => ({
  id: source.id,
  kind: source.kind,
  name: source.name,
  visible: source.visible,
  locked: source.locked,
  transform: source.transform,
  payload: sourcePayloadSummary(source)
});

const sourcePayloadSummary = (source: SceneSource): Record<string, string | number | boolean> => {
  switch (source.kind) {
    case "screen":
      return { captureMode: source.captureMode };
    case "pngtuber":
      return { avatarId: source.avatarId, expression: source.expression, hasImageUri: Boolean(source.imageUri.trim()) };
    case "live2d":
      return { modelId: source.modelId, expression: source.expression };
    case "image":
      return { hasUri: Boolean(source.uri.trim()) };
    case "solid":
      return { color: source.color };
    case "text":
      return { textLength: source.text.length, color: source.color, fontSize: source.fontSize };
  }
};

const formatSourceCounts = (sourceCounts: Record<SourceKind, number>): string =>
  Object.entries(sourceCounts)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(", ");
