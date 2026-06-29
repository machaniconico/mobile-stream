import type { FaceTrackingDiagnostics } from "./faceTrackingDiagnostics";
import type { AudioMonitorSafetyStatus } from "./audioRoute";
import type { NativeCompositionReport } from "./nativeComposition";
import type { NativeRuntimeTelemetry } from "./nativeRuntime";
import {
  assessPlatformPublishingFreshness,
  isPlatformPublishingFreshEnoughForRelease,
  resolvePlatformPublishingFreshnessPlatform
} from "./platformPublishingFreshness";
import type { ReadinessReport } from "./readiness";
import type { StreamHealthHistorySummary } from "./streamHealthHistory";
import type {
  StreamSessionHistorySummary,
  StreamSessionOutcome
} from "./streamSessionSummary";
import type { StreamStatus } from "./streamState";
import type { StreamValidationEvidenceSummary } from "./streamValidationEvidence";
import {
  minimumValidationMonitorDurationSeconds,
  minimumValidationMonitorSampleCount
} from "./streamValidationThresholds";

export type StreamValidationRunbookStatus = "blocked" | "setup" | "running" | "record" | "complete";
export type StreamValidationRunbookItemStatus = "pass" | "warn" | "fail" | "pending";
export type StreamValidationRunbookPhase =
  | "setup"
  | "start"
  | "audio"
  | "chat"
  | "monitor"
  | "quality"
  | "dashboard"
  | "stop"
  | "record";

export interface StreamValidationRunbookItem {
  id: string;
  phase: StreamValidationRunbookPhase;
  status: StreamValidationRunbookItemStatus;
  title: string;
  detail: string;
  action: string;
}

export interface StreamValidationRunbook {
  status: StreamValidationRunbookStatus;
  summary: string;
  nextAction: string;
  passCount: number;
  warningCount: number;
  failCount: number;
  pendingCount: number;
  items: StreamValidationRunbookItem[];
}

export interface StreamValidationRunbookInput {
  readiness: ReadinessReport;
  target: {
    platform: string;
    protocol: string;
    secureTransport: boolean;
  };
  telemetry: {
    streamStatus: StreamStatus;
    bitrateKbps: number;
    fps: number;
    droppedFrames: number;
    reconnectAttempts: number;
    elapsedSeconds: number;
  };
  health: StreamHealthHistorySummary;
  session: {
    summaryCount: number;
    historySummary: StreamSessionHistorySummary;
    lastOutcome: StreamSessionOutcome | null;
  };
  nativeRuntime: NativeRuntimeTelemetry | null;
  nativeComposition: NativeCompositionReport;
  faceTracking: FaceTrackingDiagnostics;
  audio: {
    micEffectsEnabled: boolean;
    presetId: string;
    inputGainDb: number;
    compression: number;
    monitorEnabled: boolean;
    monitorVolume: number;
    monitorHeadphonesOnly: boolean;
    monitorSafety: AudioMonitorSafetyStatus;
  };
  chatReadout: {
    platformChatEnabled: boolean;
    readerEnabled: boolean;
    connectionPhase: string;
    connectionLabel: string;
    connectionMessage: string;
  };
  platformPublishing: {
    platform?: "youtube-live" | "twitch" | "custom" | string;
    status: "pass" | "warn" | "fail" | "info";
    summary: string;
    recommendation: string;
    youtube?: {
      statusCheckedAt: string;
    } | null;
    twitch?: {
      statusCheckedAt: string;
    } | null;
  };
  evidence: StreamValidationEvidenceSummary;
  now?: Date;
}

export const createStreamValidationRunbook = (input: StreamValidationRunbookInput): StreamValidationRunbook => {
  const items = [
    createSetupItem(input),
    createStartItem(input),
    createAudioItem(input),
    createChatReadoutItem(input),
    createMonitorItem(input),
    createQualityStressItem(input),
    createNativeRuntimeItem(input),
    createDashboardItem(input),
    createStopItem(input),
    createRecordItem(input)
  ];
  const passCount = countStatus(items, "pass");
  const warningCount = countStatus(items, "warn");
  const failCount = countStatus(items, "fail");
  const pendingCount = countStatus(items, "pending");
  const status = createRunbookStatus(input, { failCount, warningCount, pendingCount });

  return {
    status,
    summary: createSummary(status, { failCount, warningCount, pendingCount }),
    nextAction: createNextAction(items),
    passCount,
    warningCount,
    failCount,
    pendingCount,
    items
  };
};

const createSetupItem = ({ readiness, target, nativeComposition }: StreamValidationRunbookInput): StreamValidationRunbookItem => {
  if (readiness.errorCount > 0) {
    return {
      id: "runbook-setup-blocked",
      phase: "setup",
      status: "fail",
      title: "Prepare private target",
      detail: `${readiness.errorCount} launch blocker${readiness.errorCount === 1 ? "" : "s"} must be fixed before device validation.`,
      action: "Fix readiness blockers before starting the physical-device RTMP(S) run."
    };
  }

  if (!target.secureTransport) {
    return {
      id: "runbook-setup-rtmp",
      phase: "setup",
      status: "warn",
      title: "Prepare private target",
      detail: `${target.protocol.toUpperCase()} is configured for ${target.platform}, but the commercial baseline should prefer RTMPS.`,
      action: "Use a private RTMPS endpoint unless this platform only accepts RTMP."
    };
  }

  if (nativeComposition.assetIssueCount > 0) {
    return {
      id: "runbook-setup-native-assets",
      phase: "setup",
      status: "warn",
      title: "Prepare private target",
      detail: `${nativeComposition.assetIssueCount} still-image asset issue${nativeComposition.assetIssueCount === 1 ? "" : "s"} can prevent native overlay rendering.`,
      action: nativeComposition.recommendedNextStep
    };
  }

  if (readiness.warningCount > 0) {
    return {
      id: "runbook-setup-warnings",
      phase: "setup",
      status: "warn",
      title: "Prepare private target",
      detail: `${readiness.warningCount} configuration warning${readiness.warningCount === 1 ? "" : "s"} should be reviewed before the baseline.`,
      action: "Review warnings, then keep the profile unchanged while recording the validation run."
    };
  }

  return {
    id: "runbook-setup-ready",
    phase: "setup",
    status: "pass",
    title: "Prepare private target",
    detail: `${target.platform} is configured with ${target.protocol.toUpperCase()} and launch readiness passes.`,
    action: "Keep destination, quality, scene, mic effects, and avatar settings fixed for the run."
  };
};

const createStartItem = ({ telemetry, session }: StreamValidationRunbookInput): StreamValidationRunbookItem => {
  if (telemetry.streamStatus === "failed") {
    return {
      id: "runbook-start-failed",
      phase: "start",
      status: "fail",
      title: "Start private stream",
      detail: "The stream engine is failed.",
      action: "Fix the start failure, then restart the private validation run."
    };
  }

  if (telemetry.streamStatus === "live") {
    return {
      id: "runbook-start-live",
      phase: "start",
      status: "pass",
      title: "Start private stream",
      detail: `Live telemetry is present at ${telemetry.bitrateKbps} kbps / ${telemetry.fps} fps.`,
      action: "Keep the stream private while collecting the monitor hold."
    };
  }

  if (telemetry.streamStatus === "reconnecting") {
    return {
      id: "runbook-start-reconnecting",
      phase: "start",
      status: "warn",
      title: "Start private stream",
      detail: "The stream is reconnecting during startup.",
      action: "Wait for reconnect recovery to settle, or restart the run if it repeats."
    };
  }

  if (session.summaryCount > 0) {
    return {
      id: "runbook-start-retained",
      phase: "start",
      status: "pass",
      title: "Start private stream",
      detail: "A completed private stream session is retained.",
      action: "Use the retained session for monitor, stop, and evidence checks."
    };
  }

  return {
    id: "runbook-start-pending",
    phase: "start",
    status: "pending",
    title: "Start private stream",
    detail: "No active native RTMP(S) publish session is running.",
    action: "Start the stream from a physical iOS or Android device against the private endpoint."
  };
};

const createAudioItem = ({ audio }: StreamValidationRunbookInput): StreamValidationRunbookItem => {
  if (!audio.micEffectsEnabled) {
    return {
      id: "runbook-audio-effects-disabled",
      phase: "audio",
      status: "warn",
      title: "Validate mic FX and monitor",
      detail: "Mic effects are disabled, so the validation run only covers dry microphone audio.",
      action: "Enable a mic effect preset, record a short spoken sample, and keep the preset unchanged during the private run."
    };
  }

  if (!audio.monitorEnabled) {
    return {
      id: "runbook-audio-monitor-disabled",
      phase: "audio",
      status: "warn",
      title: "Validate mic FX and monitor",
      detail: `${audio.presetId} mic effects are enabled, but headphone self-monitoring is off.`,
      action: "Enable self-monitoring with headphones connected so the processed voice can be checked before going live."
    };
  }

  if (audio.monitorVolume <= 0) {
    return {
      id: "runbook-audio-monitor-muted",
      phase: "audio",
      status: "warn",
      title: "Validate mic FX and monitor",
      detail: `${audio.presetId} mic effects and monitoring are enabled, but monitor volume is muted.`,
      action: "Raise monitor volume to an audible level and verify the processed voice in headphones."
    };
  }

  if (!audio.monitorHeadphonesOnly) {
    return {
      id: "runbook-audio-monitor-open",
      phase: "audio",
      status: "warn",
      title: "Validate mic FX and monitor",
      detail: "Self-monitoring is not limited to headphones, which can create feedback on device speakers.",
      action: "Switch monitoring to headphones-only before recording commercial validation evidence."
    };
  }

  if (audio.monitorSafety.status === "fail") {
    return {
      id: "runbook-audio-route-unsafe",
      phase: "audio",
      status: "fail",
      title: "Validate mic FX and monitor",
      detail: audio.monitorSafety.summary,
      action: audio.monitorSafety.recommendation
    };
  }

  if (audio.monitorSafety.status === "warn") {
    return {
      id: "runbook-audio-route-unconfirmed",
      phase: "audio",
      status: "warn",
      title: "Validate mic FX and monitor",
      detail: audio.monitorSafety.summary,
      action: audio.monitorSafety.recommendation
    };
  }

  return {
    id: "runbook-audio-ready",
    phase: "audio",
    status: "pass",
    title: "Validate mic FX and monitor",
    detail: `${audio.presetId} mic effects are active with ${Math.round(audio.monitorVolume * 100)}% headphones-only monitoring on ${audio.monitorSafety.outputName}.`,
    action: "Keep input gain, compression, preset, and monitor routing unchanged for the private stream."
  };
};

const createChatReadoutItem = ({ chatReadout }: StreamValidationRunbookInput): StreamValidationRunbookItem => {
  if (!chatReadout.platformChatEnabled) {
    return {
      id: "runbook-chat-platform-disabled",
      phase: "chat",
      status: "warn",
      title: "Validate chat readout",
      detail: "Platform chat is disabled, so YouTube/Twitch message fetch and readout are not covered by this run.",
      action: "Enable platform chat, connect the selected platform, and test one sample message before starting the private stream."
    };
  }

  if (!chatReadout.readerEnabled) {
    return {
      id: "runbook-chat-reader-disabled",
      phase: "chat",
      status: "warn",
      title: "Validate chat readout",
      detail: "Platform chat is configured, but speech readout is disabled.",
      action: "Turn chat readout on and confirm messages are queued and spoken at the intended volume."
    };
  }

  if (chatReadout.connectionPhase === "connected") {
    return {
      id: "runbook-chat-connected",
      phase: "chat",
      status: "pass",
      title: "Validate chat readout",
      detail: chatReadout.connectionMessage || `${chatReadout.connectionLabel || "Platform chat"} is connected.`,
      action: "Keep the chat connection active and retain chat session events with validation evidence."
    };
  }

  if (chatReadout.connectionPhase === "connecting") {
    return {
      id: "runbook-chat-connecting",
      phase: "chat",
      status: "pending",
      title: "Validate chat readout",
      detail: chatReadout.connectionMessage || "Platform chat is connecting.",
      action: "Wait for the chat connection to reach connected before recording a pass."
    };
  }

  return {
    id: "runbook-chat-needs-connection",
    phase: "chat",
    status: "warn",
    title: "Validate chat readout",
    detail:
      chatReadout.connectionMessage ||
      `Platform chat readout is not connected yet (${chatReadout.connectionPhase || "unknown"}).`,
    action: "Connect YouTube Live or Twitch chat and ingest a sample message before retaining release evidence."
  };
};

const createMonitorItem = ({ telemetry, health, session }: StreamValidationRunbookInput): StreamValidationRunbookItem => {
  if (telemetry.streamStatus === "failed" || session.lastOutcome === "fail") {
    return {
      id: "runbook-monitor-failed",
      phase: "monitor",
      status: "fail",
      title: "Hold stable telemetry",
      detail: "The latest stream run failed before a stable monitor hold was retained.",
      action: "Fix the failure and repeat a private run with clean bitrate, FPS, drop, and reconnect telemetry."
    };
  }

  if (session.lastOutcome === "clean" && session.summaryCount > 0) {
    return {
      id: "runbook-monitor-retained",
      phase: "monitor",
      status: "pass",
      title: "Hold stable telemetry",
      detail: "A clean completed session is retained for this validation flow.",
      action: "Use the retained session as the baseline when recording physical validation evidence."
    };
  }

  if (telemetry.streamStatus === "live") {
    const durationReady = health.durationSeconds >= minimumValidationMonitorDurationSeconds;
    const samplesReady = health.sampleCount >= minimumValidationMonitorSampleCount;
    const telemetryClean =
      telemetry.droppedFrames === 0 &&
      telemetry.reconnectAttempts === 0 &&
      (health.stability === "stable" || health.stability === "unknown");

    if (durationReady && samplesReady && telemetryClean) {
      return {
        id: "runbook-monitor-clean",
        phase: "monitor",
        status: "pass",
        title: "Hold stable telemetry",
        detail: `${Math.round(health.durationSeconds)}s of clean telemetry is available.`,
        action: "Stop the private stream cleanly so the completed session summary is retained."
      };
    }

    return {
      id: "runbook-monitor-running",
      phase: "monitor",
      status: "warn",
      title: "Hold stable telemetry",
      detail: `${Math.round(health.durationSeconds)}s / ${health.sampleCount} samples captured; target is ${minimumValidationMonitorDurationSeconds}s and ${minimumValidationMonitorSampleCount} samples with no drops or reconnects.`,
      action: "Keep the stream private and stable until the monitor hold is clean."
    };
  }

  if (session.lastOutcome === "warn") {
    return {
      id: "runbook-monitor-warning",
      phase: "monitor",
      status: "warn",
      title: "Hold stable telemetry",
      detail: session.historySummary.summary,
      action: session.historySummary.recommendation
    };
  }

  return {
    id: "runbook-monitor-pending",
    phase: "monitor",
    status: "pending",
    title: "Hold stable telemetry",
    detail: "No stable private stream monitor hold is retained yet.",
    action: "Run the private stream long enough to capture stable bitrate/FPS samples before stopping."
  };
};

const createNativeRuntimeItem = ({ nativeRuntime }: StreamValidationRunbookInput): StreamValidationRunbookItem => {
  if (!nativeRuntime) {
    return {
      id: "runbook-native-runtime-pending",
      phase: "monitor",
      status: "pending",
      title: "Confirm native runtime",
      detail: "Native publisher/compositor telemetry is not available yet.",
      action: "Run this validation from the native iOS or Android app, not only the web prototype."
    };
  }

  const failed =
    nativeRuntime.runtimeStatus === "failed" ||
    nativeRuntime.publisher.state === "failed" ||
    Boolean(nativeRuntime.publisher.lastError) ||
    nativeRuntime.composition.status === "failed";
  if (failed) {
    return {
      id: "runbook-native-runtime-failed",
      phase: "monitor",
      status: "fail",
      title: "Confirm native runtime",
      detail: nativeRuntime.publisher.lastError || nativeRuntime.message || "Native runtime reported a failure.",
      action: "Fix the native publisher or compositor failure before retaining validation evidence."
    };
  }

  const missingAssets = nativeRuntime.composition.stillImageAssetMissingCount ?? 0;
  const stillImageAssetCount = nativeRuntime.composition.stillImageAssetCount ?? 0;
  const decodedStillImageAssetCount = nativeRuntime.composition.stillImageAssetDecodedCount ?? 0;
  const decodedStillImageAssetPixels = nativeRuntime.composition.stillImageAssetDecodedPixelCount ?? 0;
  const missingDecodedAssets =
    stillImageAssetCount > 0 &&
    (decodedStillImageAssetCount < stillImageAssetCount || decodedStillImageAssetPixels <= 0);
  const compositedStillImageAssetCount = nativeRuntime.composition.stillImageAssetCompositedCount ?? 0;
  const compositedStillImageAssetPixels = nativeRuntime.composition.stillImageAssetCompositedPixelCount ?? 0;
  const missingCompositedAssets =
    stillImageAssetCount > 0 &&
    (compositedStillImageAssetCount < stillImageAssetCount || compositedStillImageAssetPixels <= 0);
  const missingVrmPoses = nativeRuntime.composition.vrmMissingPoseCount ?? 0;
  const vrmSourceCount = nativeRuntime.composition.vrmSourceCount ?? 0;
  const vrmRendererStatus = nativeRuntime.composition.vrmRendererStatus ?? (vrmSourceCount > 0 ? "unavailable" : "not-required");
  const vrmRenderedSourceCount = nativeRuntime.composition.vrmRenderedSourceCount ?? 0;
  const missingVrmModelMetadata =
    (nativeRuntime.composition.vrmModelLoadedCount ?? 0) > 0 &&
    ((nativeRuntime.composition.vrmHumanoidBoneCount ?? 0) === 0 || (nativeRuntime.composition.vrmExpressionCount ?? 0) === 0);
  const missingVrmRenderability =
    (nativeRuntime.composition.vrmModelLoadedCount ?? 0) > 0 &&
    ((nativeRuntime.composition.vrmMeshPrimitiveCount ?? 0) === 0 ||
      (nativeRuntime.composition.vrmSkinnedMeshPrimitiveCount ?? 0) === 0 ||
      (nativeRuntime.composition.vrmSkinJointCount ?? 0) === 0 ||
      (nativeRuntime.composition.vrmPositionAccessorCount ?? 0) === 0 ||
      (nativeRuntime.composition.vrmVertexCount ?? 0) === 0 ||
      (nativeRuntime.composition.vrmTrianglePrimitiveCount ?? 0) <
        (nativeRuntime.composition.vrmMeshPrimitiveCount ?? 0) ||
      (nativeRuntime.composition.vrmUnsupportedPrimitiveModeCount ?? 0) > 0 ||
      (nativeRuntime.composition.vrmUnsupportedImageMimeCount ?? 0) > 0 ||
      ((nativeRuntime.composition.vrmImageCount ?? 0) > 0 &&
        (nativeRuntime.composition.vrmTexcoordAccessorCount ?? 0) === 0) ||
      (nativeRuntime.composition.vrmSkinningAttributePrimitiveCount ?? 0) <
        (nativeRuntime.composition.vrmSkinnedMeshPrimitiveCount ?? 0));
  const missingVrmPoseMapping =
    (nativeRuntime.composition.vrmModelLoadedCount ?? 0) > 0 &&
    ((nativeRuntime.composition.vrmPoseBoneUnsupportedCount ?? 0) > 0 ||
      (nativeRuntime.composition.vrmPoseExpressionUnsupportedCount ?? 0) > 0);
  const missingVrmRenders =
    vrmSourceCount > 0 &&
    (vrmRendererStatus !== "ready" ||
      vrmRenderedSourceCount < vrmSourceCount ||
      (nativeRuntime.composition.vrmRenderMissingCount ?? 0) > 0 ||
      (nativeRuntime.composition.vrmRenderFailureCount ?? 0) > 0 ||
      missingVrmModelMetadata ||
      missingVrmRenderability ||
      missingVrmPoseMapping);
  if (
    nativeRuntime.stale ||
    nativeRuntime.publisher.congested ||
    nativeRuntime.composition.status === "pending" ||
    missingAssets > 0 ||
    missingDecodedAssets ||
    missingCompositedAssets ||
    missingVrmPoses > 0 ||
    missingVrmRenders
  ) {
    return {
      id: "runbook-native-runtime-review",
      phase: "monitor",
      status: "warn",
      title: "Confirm native runtime",
      detail: nativeRuntime.composition.message || nativeRuntime.message || "Native runtime needs review.",
      action:
        missingAssets > 0
          ? "Prepare App Group/native-readable still-image assets again, then repeat the iOS compositor validation."
          : missingDecodedAssets
            ? "Repeat native compositor validation until every still-image asset decodes to non-zero pixels."
            : missingCompositedAssets
              ? "Repeat native compositor validation until every still-image asset is composited with non-zero pixel proof."
              : missingVrmPoses > 0
              ? "Confirm VRM runtime pose payloads are included in the render graph before recording a pass."
              : missingVrmModelMetadata
                ? "Prepare a VRM/GLB model with humanoid bones and expression metadata before recording a pass."
                : missingVrmRenderability
                  ? "Prepare a VRM/GLB model with triangle primitives, POSITION vertices, UVs for textured models, supported PNG/JPEG images, skinned meshes, skin joints, and JOINTS_0/WEIGHTS_0 attributes before recording a pass."
                  : missingVrmPoseMapping
                    ? "Confirm the delivered VRM pose bones and expression weights are supported by the imported model before recording a pass."
                    : missingVrmRenders
                      ? "Integrate or enable the native VRM renderer, then repeat validation until every visible VRM source is rendered."
                      : "Review native runtime congestion, stale telemetry, or pending compositor state before recording a pass."
    };
  }

  return {
    id: "runbook-native-runtime-ready",
    phase: "monitor",
    status: "pass",
    title: "Confirm native runtime",
    detail: `${nativeRuntime.platform} publisher/compositor telemetry is current and clean.`,
    action: "Keep this native runtime snapshot with the validation evidence."
  };
};

const createQualityStressItem = ({
  telemetry,
  health,
  session,
  evidence
}: StreamValidationRunbookInput): StreamValidationRunbookItem => {
  const failureCount = Math.max(
    evidence.qualityAutomationFailureCount,
    session.historySummary.totalQualityUpdateFailures
  );
  const liveUpdateCount = Math.max(
    evidence.qualityAutomationLiveUpdateCount,
    session.historySummary.totalQualityLiveUpdates
  );
  const nextTargetCount = Math.max(
    evidence.qualityAutomationNextTargetCount,
    session.historySummary.totalQualityNextTargets
  );

  if (failureCount > 0) {
    return {
      id: "runbook-quality-stress-failed",
      phase: "quality",
      status: "fail",
      title: "Validate quality stress fallback",
      detail: `${failureCount} native live quality update failure${failureCount === 1 ? "" : "s"} retained.`,
      action: "Fix native bitrate/FPS update handling, then repeat the weak-network private validation run."
    };
  }

  if (liveUpdateCount > 0) {
    return {
      id: "runbook-quality-stress-live-update",
      phase: "quality",
      status: "pass",
      title: "Validate quality stress fallback",
      detail: `${liveUpdateCount} live quality update${liveUpdateCount === 1 ? "" : "s"} retained from weak-network validation.`,
      action: "Keep this evidence with the release-candidate run and repeat it after encoder or network changes."
    };
  }

  if (nextTargetCount > 0) {
    return {
      id: "runbook-quality-stress-next-target",
      phase: "quality",
      status: "pass",
      title: "Validate quality stress fallback",
      detail: `${nextTargetCount} next-start quality fallback${nextTargetCount === 1 ? "" : "s"} retained from weak-network validation.`,
      action: "Keep this evidence; on Android also retain a same-resolution live bitrate/FPS update when practical."
    };
  }

  const qualityPressureVisible =
    telemetry.droppedFrames > 0 ||
    telemetry.reconnectAttempts > 0 ||
    health.stability === "watch" ||
    health.stability === "unstable";
  if ((telemetry.streamStatus === "live" || telemetry.streamStatus === "reconnecting") && qualityPressureVisible) {
    return {
      id: "runbook-quality-stress-waiting",
      phase: "quality",
      status: "warn",
      title: "Validate quality stress fallback",
      detail: "Quality pressure is visible, but no automatic quality relief event has been retained yet.",
      action: "Keep the stream private and wait for the quality advisor to lower bitrate/FPS, or record this run as warn evidence."
    };
  }

  if (session.summaryCount > 0 || evidence.totalRuns > 0) {
    return {
      id: "runbook-quality-stress-missing",
      phase: "quality",
      status: "warn",
      title: "Validate quality stress fallback",
      detail: "No weak-network quality automation event is retained for this release-candidate baseline.",
      action: "Run a controlled weak-network private stream and retain live quality update or next-start fallback evidence."
    };
  }

  return {
    id: "runbook-quality-stress-pending",
    phase: "quality",
    status: "pending",
    title: "Validate quality stress fallback",
    detail: "Quality automation stress behavior has not been exercised yet.",
    action: "After the basic private run works, repeat under controlled weak-network conditions to prove bitrate/FPS relief."
  };
};

const createDashboardItem = ({
  platformPublishing,
  target,
  now = new Date()
}: StreamValidationRunbookInput): StreamValidationRunbookItem => {
  if (platformPublishing.status === "pass") {
    const freshness = assessPlatformPublishingFreshness(
      {
        ...platformPublishing,
        platform: platformPublishing.platform ?? resolvePlatformPublishingFreshnessPlatform(target.platform)
      },
      now
    );

    if (!isPlatformPublishingFreshEnoughForRelease(freshness)) {
      return {
        id: `runbook-dashboard-${freshness.status}`,
        phase: "dashboard",
        status: "warn",
        title: "Check destination dashboard",
        detail: `${platformPublishing.summary} ${freshness.summary}`,
        action: freshness.recommendation
      };
    }

    return {
      id: "runbook-dashboard-ready",
      phase: "dashboard",
      status: "pass",
      title: "Check destination dashboard",
      detail: `${platformPublishing.summary} ${freshness.summary}`,
      action: "Keep this dashboard snapshot with the release-candidate validation run."
    };
  }

  if (platformPublishing.status === "fail") {
    return {
      id: "runbook-dashboard-failed",
      phase: "dashboard",
      status: "fail",
      title: "Check destination dashboard",
      detail: platformPublishing.summary,
      action: platformPublishing.recommendation
    };
  }

  if (platformPublishing.status === "warn") {
    return {
      id: "runbook-dashboard-review",
      phase: "dashboard",
      status: "warn",
      title: "Check destination dashboard",
      detail: platformPublishing.summary,
      action: platformPublishing.recommendation
    };
  }

  return {
    id: "runbook-dashboard-pending",
    phase: "dashboard",
    status: "pending",
    title: "Check destination dashboard",
    detail: `${target.platform} dashboard health has not been captured for this run.`,
    action: "Refresh YouTube/Twitch live status or capture custom ingest health while the private stream is live."
  };
};

const createStopItem = ({ telemetry, session }: StreamValidationRunbookInput): StreamValidationRunbookItem => {
  if (session.lastOutcome === "clean") {
    return {
      id: "runbook-stop-clean",
      phase: "stop",
      status: "pass",
      title: "Stop and retain session",
      detail: "The latest completed stream session ended cleanly.",
      action: "Record the physical validation run before changing destination or scene settings."
    };
  }

  if (session.lastOutcome === "fail") {
    return {
      id: "runbook-stop-failed",
      phase: "stop",
      status: "fail",
      title: "Stop and retain session",
      detail: session.historySummary.summary,
      action: "Repeat the private stream until the completed session ends cleanly."
    };
  }

  if (session.lastOutcome === "warn") {
    return {
      id: "runbook-stop-warning",
      phase: "stop",
      status: "warn",
      title: "Stop and retain session",
      detail: session.historySummary.summary,
      action: "Review the warning, then repeat or record as warn evidence if the issue is acceptable."
    };
  }

  if (telemetry.streamStatus === "live") {
    return {
      id: "runbook-stop-pending-live",
      phase: "stop",
      status: "pending",
      title: "Stop and retain session",
      detail: "The private stream is still live.",
      action: "After the monitor hold and dashboard check pass, stop the stream cleanly to retain the session summary."
    };
  }

  return {
    id: "runbook-stop-pending",
    phase: "stop",
    status: "pending",
    title: "Stop and retain session",
    detail: "No completed session summary exists for the current validation flow.",
    action: "Complete and stop a private stream so diagnostics can retain the session summary."
  };
};

const createRecordItem = ({ evidence }: StreamValidationRunbookInput): StreamValidationRunbookItem => {
  if (evidence.status === "ready") {
    return {
      id: "runbook-record-ready",
      phase: "record",
      status: "pass",
      title: "Record release evidence",
      detail: evidence.summary,
      action: "Export diagnostics and support bundle for the release-candidate archive."
    };
  }

  if (evidence.status === "failing") {
    return {
      id: "runbook-record-failed",
      phase: "record",
      status: "fail",
      title: "Record release evidence",
      detail: evidence.summary,
      action: evidence.recommendation
    };
  }

  if (evidence.status === "partial" || evidence.status === "stale") {
    return {
      id: "runbook-record-review",
      phase: "record",
      status: "warn",
      title: "Record release evidence",
      detail: evidence.summary,
      action: evidence.recommendation
    };
  }

  return {
    id: "runbook-record-pending",
    phase: "record",
    status: "pending",
    title: "Record release evidence",
    detail: "No retained physical validation run is stored yet.",
    action: "Record evidence after the private stream is stopped and the session summary is retained."
  };
};

const createRunbookStatus = (
  input: StreamValidationRunbookInput,
  counts: { failCount: number; warningCount: number; pendingCount: number }
): StreamValidationRunbookStatus => {
  if (counts.failCount > 0) {
    return "blocked";
  }
  if (counts.pendingCount === 0 && counts.warningCount === 0) {
    return "complete";
  }
  if (input.telemetry.streamStatus === "live" || input.telemetry.streamStatus === "reconnecting") {
    return "running";
  }
  if (input.session.summaryCount > 0 || input.evidence.totalRuns > 0) {
    return "record";
  }
  return "setup";
};

const createSummary = (
  status: StreamValidationRunbookStatus,
  counts: { failCount: number; warningCount: number; pendingCount: number }
): string => {
  switch (status) {
    case "blocked":
      return `${counts.failCount} validation runbook blocker${counts.failCount === 1 ? "" : "s"} must be fixed before recording evidence.`;
    case "complete":
      return "Private RTMP(S) validation runbook is complete for this target.";
    case "running":
      return `${counts.warningCount + counts.pendingCount} validation step${counts.warningCount + counts.pendingCount === 1 ? "" : "s"} remain while the private stream is running.`;
    case "record":
      return `${counts.warningCount + counts.pendingCount} validation step${counts.warningCount + counts.pendingCount === 1 ? "" : "s"} remain before release evidence is complete.`;
    case "setup":
    default:
      return `${counts.pendingCount} validation step${counts.pendingCount === 1 ? "" : "s"} pending before the private stream starts.`;
  }
};

const createNextAction = (items: StreamValidationRunbookItem[]): string =>
  items.find((item) => item.status === "fail")?.action ??
  items.find((item) => item.status === "warn")?.action ??
  items.find((item) => item.status === "pending")?.action ??
  "Export diagnostics and support bundle for the retained release-candidate validation run.";

const countStatus = (items: StreamValidationRunbookItem[], status: StreamValidationRunbookItemStatus): number =>
  items.filter((item) => item.status === status).length;
