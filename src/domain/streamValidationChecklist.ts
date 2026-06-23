import type { ReadinessIssue, ReadinessReport } from "./readiness";
import type { FaceTrackingDiagnostics } from "./faceTrackingDiagnostics";
import type { StreamHealthHistorySummary } from "./streamHealthHistory";
import type {
  StreamSessionHistorySummary,
  StreamSessionOutcome
} from "./streamSessionSummary";
import type { StreamValidationEvidenceSummary } from "./streamValidationEvidence";
import type { StreamStatus } from "./streamState";

export type StreamValidationChecklistStatus = "blocked" | "needs-test" | "ready";
export type StreamValidationChecklistItemStatus = "pass" | "warn" | "fail" | "pending";
export type StreamValidationChecklistArea =
  | "readiness"
  | "transport"
  | "ingest"
  | "platform"
  | "device"
  | "avatar"
  | "session"
  | "evidence";

export interface StreamValidationChecklistItem {
  id: string;
  area: StreamValidationChecklistArea;
  status: StreamValidationChecklistItemStatus;
  title: string;
  detail: string;
  action: string;
}

export interface StreamValidationChecklist {
  status: StreamValidationChecklistStatus;
  summary: string;
  recommendedNextStep: string;
  passCount: number;
  warningCount: number;
  failCount: number;
  pendingCount: number;
  items: StreamValidationChecklistItem[];
}

export interface StreamValidationChecklistInput {
  readiness: ReadinessReport;
  diagnosticStatus: "pass" | "warn" | "fail" | "info";
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
  };
  health: {
    sampleCount: number;
    stability: StreamHealthHistorySummary["stability"];
  };
  session: {
    eventCount: number;
    summaryCount: number;
    historySummary: StreamSessionHistorySummary;
    lastOutcome: StreamSessionOutcome | null;
  };
  evidence: StreamValidationEvidenceSummary;
  faceTracking?: FaceTrackingDiagnostics;
}

export const createStreamValidationChecklist = ({
  readiness,
  diagnosticStatus,
  target,
  telemetry,
  health,
  session,
  evidence,
  faceTracking
}: StreamValidationChecklistInput): StreamValidationChecklist => {
  const items = [
    createReadinessItem(readiness),
    createTransportItem(target),
    createIngestItem(diagnosticStatus, telemetry, health),
    createPlatformItem(target.platform, telemetry, health, evidence),
    createDeviceItem(session, evidence),
    createAvatarMotionItem(faceTracking),
    createSessionBaselineItem(session),
    createEvidenceItem(readiness, health, session, evidence)
  ].filter((item): item is StreamValidationChecklistItem => item !== null);
  const passCount = countStatus(items, "pass");
  const warningCount = countStatus(items, "warn");
  const failCount = countStatus(items, "fail");
  const pendingCount = countStatus(items, "pending");
  const status: StreamValidationChecklistStatus =
    failCount > 0 ? "blocked" : warningCount > 0 || pendingCount > 0 ? "needs-test" : "ready";

  return {
    status,
    summary: createChecklistSummary(status, { failCount, warningCount, pendingCount }),
    recommendedNextStep: createRecommendedNextStep(items),
    passCount,
    warningCount,
    failCount,
    pendingCount,
    items
  };
};

const createReadinessItem = (readiness: ReadinessReport): StreamValidationChecklistItem => {
  if (readiness.errorCount > 0) {
    const firstError = readiness.issues.find((issue) => issue.severity === "error");
    return {
      id: "readiness-blocks",
      area: "readiness",
      status: "fail",
      title: "Configuration readiness",
      detail: `${readiness.errorCount} configuration blocker${readiness.errorCount === 1 ? "" : "s"} before validation.`,
      action: readinessAction(firstError)
    };
  }

  if (readiness.warningCount > 0) {
    const firstWarning = readiness.issues.find((issue) => issue.severity === "warning");
    return {
      id: "readiness-warnings",
      area: "readiness",
      status: "warn",
      title: "Configuration readiness",
      detail: `${readiness.warningCount} configuration warning${readiness.warningCount === 1 ? "" : "s"} to review.`,
      action: readinessAction(firstWarning)
    };
  }

  return {
    id: "readiness-ready",
    area: "readiness",
    status: "pass",
    title: "Configuration readiness",
    detail: "Required destination, quality, audio, and scene checks pass.",
    action: "Keep this profile locked while running private test streams."
  };
};

const readinessAction = (issue: ReadinessIssue | undefined): string => {
  switch (issue?.field) {
    case "serverUrl":
      return "Set a valid YouTube Live, Twitch, or custom RTMP(S) ingest endpoint.";
    case "streamKey":
      return "Paste the full stream key from the destination platform before validation.";
    case "quality":
      return "Pick a supported resolution, FPS, and bitrate profile for the target platform.";
    case "scene":
      return "Enable at least one visible scene source and confirm the program preview.";
    case "security":
      return "Prefer RTMPS for production streams when the platform supports it.";
    case "micEffects":
      return "Lower risky monitor or gain settings before validation.";
    case "faceTracking":
      return "Confirm a prepared PNGTuber source and stable native camera tracking before validation.";
    default:
      return "Resolve configuration readiness issues before validation.";
  }
};

const createTransportItem = (
  target: StreamValidationChecklistInput["target"]
): StreamValidationChecklistItem => {
  if (target.secureTransport) {
    return {
      id: "transport-secure",
      area: "transport",
      status: "pass",
      title: "Transport security",
      detail: `${target.protocol.toUpperCase()} is selected for the publish target.`,
      action: "Keep RTMPS as the default for production destinations."
    };
  }

  return {
    id: "transport-plain-rtmp",
    area: "transport",
    status: "warn",
    title: "Transport security",
    detail: `${target.protocol.toUpperCase()} is not encrypted.`,
    action: "Switch to RTMPS before public streams when the destination supports it."
  };
};

const createIngestItem = (
  diagnosticStatus: StreamValidationChecklistInput["diagnosticStatus"],
  telemetry: StreamValidationChecklistInput["telemetry"],
  health: StreamValidationChecklistInput["health"]
): StreamValidationChecklistItem => {
  if (telemetry.streamStatus === "failed") {
    return {
      id: "ingest-failed",
      area: "ingest",
      status: "fail",
      title: "Private ingest smoke test",
      detail: "The stream engine is in a failed state.",
      action: "Review diagnostics, fix the ingest failure, then repeat a private RTMP(S) smoke test."
    };
  }

  if (telemetry.streamStatus === "reconnecting") {
    return {
      id: "ingest-reconnecting",
      area: "ingest",
      status: "warn",
      title: "Private ingest smoke test",
      detail: "Live telemetry is in recovery and reconnecting.",
      action: "Keep the stream private until reconnect recovery stops repeating."
    };
  }

  if (telemetry.streamStatus === "live" && health.sampleCount > 0) {
    if (diagnosticStatus === "fail") {
      return {
        id: "ingest-live-blocked",
        area: "ingest",
        status: "fail",
        title: "Private ingest smoke test",
        detail: "Live telemetry exists, but diagnostics still have blocking issues.",
        action: "Resolve the blocking diagnostics before treating this ingest as production-ready."
      };
    }

    if (
      diagnosticStatus === "warn" ||
      telemetry.droppedFrames > 0 ||
      telemetry.reconnectAttempts > 0 ||
      health.stability === "watch" ||
      health.stability === "unstable"
    ) {
      return {
        id: "ingest-live-watch",
        area: "ingest",
        status: "warn",
        title: "Private ingest smoke test",
        detail: `Live telemetry is present at ${telemetry.bitrateKbps} kbps / ${telemetry.fps} fps, but quality still needs watch.`,
        action: "Run another private stream after lowering bitrate/FPS or stabilizing the network."
      };
    }

    return {
      id: "ingest-live-clean",
      area: "ingest",
      status: "pass",
      title: "Private ingest smoke test",
      detail: `Live telemetry is clean at ${telemetry.bitrateKbps} kbps / ${telemetry.fps} fps.`,
      action: "Keep this destination and quality target for the next baseline run."
    };
  }

  return {
    id: "ingest-not-run",
    area: "ingest",
    status: "pending",
    title: "Private ingest smoke test",
    detail: "No live RTMP(S) telemetry has been captured in this session.",
    action: "Start a private or unlisted stream from a physical device and confirm bitrate/FPS telemetry."
  };
};

const createPlatformItem = (
  platform: string,
  telemetry: StreamValidationChecklistInput["telemetry"],
  health: StreamValidationChecklistInput["health"],
  evidence: StreamValidationEvidenceSummary
): StreamValidationChecklistItem => {
  const platformLabel = platform || "Custom";

  if (evidence.passedTargetPlatforms.includes(platformLabel)) {
    return {
      id: "platform-ingest-validated",
      area: "platform",
      status: "pass",
      title: "Destination ingest dashboard",
      detail: `${platformLabel} has a retained passing physical validation run.`,
      action: "Keep the destination dashboard evidence refreshed for each release candidate."
    };
  }

  if (evidence.latestRun?.targetPlatform === platformLabel && evidence.latestRun.result === "fail") {
    return {
      id: "platform-ingest-validation-failed",
      area: "platform",
      status: "fail",
      title: "Destination ingest dashboard",
      detail: `${platformLabel} latest physical validation run failed.`,
      action: "Fix the destination ingest failure and record a passing private validation run."
    };
  }

  if (evidence.latestRun?.targetPlatform === platformLabel && evidence.latestRun.result === "warn") {
    return {
      id: "platform-ingest-validation-watch",
      area: "platform",
      status: "warn",
      title: "Destination ingest dashboard",
      detail: `${platformLabel} has a retained validation run that still needs review.`,
      action: "Repeat the destination dashboard validation until it passes cleanly."
    };
  }

  if (evidence.status === "stale" && evidence.latestRun?.targetPlatform === platformLabel) {
    return {
      id: "platform-ingest-validation-stale",
      area: "platform",
      status: "warn",
      title: "Destination ingest dashboard",
      detail: `${platformLabel} has retained validation evidence, but it is stale for the current release window.`,
      action: evidence.recommendation
    };
  }

  if (telemetry.streamStatus === "failed") {
    return {
      id: "platform-ingest-failed",
      area: "platform",
      status: "fail",
      title: "Destination ingest dashboard",
      detail: `${platformLabel} ingest could not be proven because the stream failed.`,
      action: "Fix the stream failure before checking the destination dashboard."
    };
  }

  if (telemetry.streamStatus === "live" && health.sampleCount > 0) {
    return {
      id: "platform-ingest-live-unretained",
      area: "platform",
      status: "warn",
      title: "Destination ingest dashboard",
      detail: `${platformLabel} is receiving a live publish session, but no retained validation run confirms dashboard health.`,
      action: "Record a physical validation run after confirming the destination dashboard is healthy."
    };
  }

  return {
    id: "platform-ingest-pending",
    area: "platform",
    status: "pending",
    title: "Destination ingest dashboard",
    detail: `${platformLabel} dashboard health has not been exercised by a live app session yet.`,
    action: "Run a private YouTube Live, Twitch, or custom ingest test and capture the dashboard result."
  };
};

const createDeviceItem = (
  session: StreamValidationChecklistInput["session"],
  evidence: StreamValidationEvidenceSummary
): StreamValidationChecklistItem => {
  if (evidence.status === "ready") {
    return {
      id: "device-validation-ready",
      area: "device",
      status: "pass",
      title: "Physical device audio/video pass",
      detail: "Passing validation runs are retained for both iOS and Android.",
      action: "Repeat the validation baseline on each release candidate build."
    };
  }

  if (evidence.status === "failing") {
    return {
      id: "device-validation-failing",
      area: "device",
      status: "fail",
      title: "Physical device audio/video pass",
      detail: evidence.summary,
      action: evidence.recommendation
    };
  }

  if (evidence.status === "partial") {
    return {
      id: evidence.appBuildMismatch ? "device-validation-build-mismatch" : "device-validation-partial",
      area: "device",
      status: "warn",
      title: "Physical device audio/video pass",
      detail: evidence.summary,
      action: evidence.recommendation
    };
  }

  if (evidence.status === "stale") {
    return {
      id: "device-validation-stale",
      area: "device",
      status: "warn",
      title: "Physical device audio/video pass",
      detail: evidence.summary,
      action: evidence.recommendation
    };
  }

  if (session.historySummary.stability === "baseline") {
    return {
      id: "device-session-baseline-only",
      area: "device",
      status: "warn",
      title: "Physical device audio/video pass",
      detail: `${session.historySummary.totalSessions} clean completed sessions are retained, but no explicit physical validation run exists.`,
      action: "Record passing validation runs on both iOS and Android devices before store release."
    };
  }

  if (session.historySummary.stability === "unstable") {
    return {
      id: "device-unstable",
      area: "device",
      status: "fail",
      title: "Physical device audio/video pass",
      detail: session.historySummary.summary,
      action: "Fix failed or unstable device sessions before public launch."
    };
  }

  if (session.summaryCount > 0) {
    return {
      id: "device-watch",
      area: "device",
      status: "warn",
      title: "Physical device audio/video pass",
      detail: session.historySummary.summary,
      action: "Capture at least three clean sessions with mic monitor, screen capture, and avatar motion enabled."
    };
  }

  return {
    id: "device-pending",
    area: "device",
    status: "pending",
    title: "Physical device audio/video pass",
    detail: "No completed physical-device stream session is retained yet.",
    action: "Complete private iOS and Android sessions with headphones, mic FX, and avatar motion enabled."
  };
};

const createAvatarMotionItem = (
  faceTracking: FaceTrackingDiagnostics | undefined
): StreamValidationChecklistItem | null => {
  if (!faceTracking) {
    return null;
  }

  if (faceTracking.status === "pass") {
    return {
      id: "avatar-motion-ready",
      area: "avatar",
      status: "pass",
      title: "VTuber avatar motion",
      detail: `${faceTracking.preparedPngTuberCount} prepared PNGTuber source${faceTracking.preparedPngTuberCount === 1 ? "" : "s"} with ${faceTracking.runtimeStatus} tracking.`,
      action: "Keep the prepared avatar asset and tracker state with the release-candidate validation run."
    };
  }

  if (faceTracking.status === "warn") {
    return {
      id: "avatar-motion-needs-review",
      area: "avatar",
      status: "warn",
      title: "VTuber avatar motion",
      detail: faceTracking.summary,
      action: faceTracking.recommendation
    };
  }

  return {
    id: "avatar-motion-not-validated",
    area: "avatar",
    status: "pending",
    title: "VTuber avatar motion",
    detail: "Face tracking is not enabled for this validation profile.",
    action: "Enable face tracking and validate a prepared PNGTuber source when shipping VTuber mode."
  };
};

const createSessionBaselineItem = (
  session: StreamValidationChecklistInput["session"]
): StreamValidationChecklistItem => {
  if (session.historySummary.stability === "baseline") {
    return {
      id: "session-baseline",
      area: "session",
      status: "pass",
      title: "Retained session baseline",
      detail: session.historySummary.summary,
      action: "Use this as the known-good baseline for future regressions."
    };
  }

  if (session.historySummary.stability === "unstable") {
    return {
      id: "session-unstable",
      area: "session",
      status: "fail",
      title: "Retained session baseline",
      detail: session.historySummary.summary,
      action: session.historySummary.recommendation
    };
  }

  if (session.historySummary.totalSessions > 0) {
    return {
      id: "session-watch",
      area: "session",
      status: "warn",
      title: "Retained session baseline",
      detail: session.historySummary.summary,
      action: session.historySummary.recommendation
    };
  }

  return {
    id: "session-pending",
    area: "session",
    status: "pending",
    title: "Retained session baseline",
    detail: "No completed stream history has been retained yet.",
    action: session.historySummary.recommendation
  };
};

const createEvidenceItem = (
  readiness: ReadinessReport,
  health: StreamValidationChecklistInput["health"],
  session: StreamValidationChecklistInput["session"],
  evidence: StreamValidationEvidenceSummary
): StreamValidationChecklistItem => {
  if (readiness.errorCount > 0) {
    return {
      id: "evidence-blocked",
      area: "evidence",
      status: "fail",
      title: "Support evidence bundle",
      detail: `${readiness.errorCount} readiness error${readiness.errorCount === 1 ? "" : "s"} must be resolved before evidence is useful.`,
      action: "Resolve readiness errors, then export a support bundle after a private test stream."
    };
  }

  if (evidence.status === "ready" && health.sampleCount > 0 && session.summaryCount > 0) {
    return {
      id: "evidence-release-candidate",
      area: "evidence",
      status: "pass",
      title: "Support evidence bundle",
      detail: "Physical validation runs, health telemetry, and completed session summaries are ready for export.",
      action: "Export diagnostics and support bundle for every release-candidate validation pass."
    };
  }

  if (evidence.status === "failing") {
    return {
      id: "evidence-validation-failing",
      area: "evidence",
      status: "fail",
      title: "Support evidence bundle",
      detail: evidence.summary,
      action: evidence.recommendation
    };
  }

  if (evidence.status === "stale") {
    return {
      id: "evidence-validation-stale",
      area: "evidence",
      status: "warn",
      title: "Support evidence bundle",
      detail: evidence.summary,
      action: evidence.recommendation
    };
  }

  if (evidence.totalRuns > 0) {
    return {
      id: evidence.appBuildMismatch ? "evidence-validation-build-mismatch" : "evidence-validation-partial",
      area: "evidence",
      status: "warn",
      title: "Support evidence bundle",
      detail: evidence.summary,
      action: evidence.recommendation
    };
  }

  if (health.sampleCount > 0 && session.summaryCount > 0) {
    return {
      id: "evidence-session-retained",
      area: "evidence",
      status: "warn",
      title: "Support evidence bundle",
      detail: "Health telemetry and a completed session summary are available, but physical validation evidence is not retained.",
      action: "Record physical iOS and Android validation runs, then export diagnostics and support bundle."
    };
  }

  if (health.sampleCount > 0 || session.eventCount > 0) {
    return {
      id: "evidence-partial",
      area: "evidence",
      status: "warn",
      title: "Support evidence bundle",
      detail: "Some live evidence exists, but no completed session summary has been retained.",
      action: "Stop the private stream cleanly so the completed session summary is saved."
    };
  }

  return {
    id: "evidence-pending",
    area: "evidence",
    status: "pending",
    title: "Support evidence bundle",
    detail: "No live telemetry or completed session evidence is available yet.",
    action: "Run a private test stream, stop it cleanly, then export diagnostics and support bundle."
  };
};

const countStatus = (
  items: StreamValidationChecklistItem[],
  status: StreamValidationChecklistItemStatus
): number => items.filter((item) => item.status === status).length;

const createChecklistSummary = (
  status: StreamValidationChecklistStatus,
  counts: { failCount: number; warningCount: number; pendingCount: number }
): string => {
  if (status === "blocked") {
    return `${counts.failCount} commercial validation blocker${counts.failCount === 1 ? "" : "s"} found.`;
  }

  if (status === "needs-test") {
    const reviewCount = counts.warningCount + counts.pendingCount;
    return `${reviewCount} validation item${reviewCount === 1 ? "" : "s"} still need evidence before public launch.`;
  }

  return "Commercial validation checklist is ready for this target profile.";
};

const createRecommendedNextStep = (items: StreamValidationChecklistItem[]): string => {
  const nextItem =
    items.find((item) => item.status === "fail") ??
    items.find((item) => item.status === "pending") ??
    items.find((item) => item.status === "warn");

  return nextItem?.action ?? "Keep exporting diagnostics after release-candidate streams.";
};
