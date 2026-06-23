import { buildPublishUrl, getDestinationPreset, redactStreamKey, type StudioProfile } from "./profiles";
import type { ReadinessReport } from "./readiness";
import type { SceneDocument } from "./scene";
import {
  createDefaultStreamRecoveryPolicy,
  createStreamRecoveryStatus,
  formatRecoveryBackoff,
  formatDelay,
  type StreamRecoveryStatus
} from "./streamRecovery";
import {
  createStreamQualityIncidents,
  summarizeStreamQualityIncidents,
  type StreamQualityIncident
} from "./streamQualityIncidents";
import {
  createStreamQualityAdvisor,
  type StreamQualityAdvisorRecommendation
} from "./streamQualityAdvisor";
import {
  summarizeStreamHealthHistory,
  type StreamHealthHistorySummary,
  type StreamHealthSample
} from "./streamHealthHistory";
import type { StreamSessionEvent } from "./streamSessionLog";
import {
  createStreamSessionHistorySummary,
  type StreamSessionHistorySummary,
  type StreamSessionSummary
} from "./streamSessionSummary";
import {
  createStreamValidationChecklist,
  type StreamValidationChecklist
} from "./streamValidationChecklist";
import type { StreamHealth, StreamStatus } from "./streamState";

export type DiagnosticStatus = "pass" | "warn" | "fail" | "info";

export interface DiagnosticCheck {
  code: string;
  status: DiagnosticStatus;
  label: string;
  message: string;
}

export interface StreamDiagnostics {
  summary: string;
  status: DiagnosticStatus;
  target: {
    platform: string;
    presetName: string;
    protocol: string;
    host: string;
    application: string;
    publishUrlPreview: string;
    streamKeyPreview: string;
    secureTransport: boolean;
  };
  quality: {
    resolution: string;
    fps: number;
    targetVideoBitrateKbps: number;
    targetAudioBitrateKbps: number;
    estimatedUploadKbps: number;
  };
  telemetry: {
    streamStatus: StreamStatus;
    bitrateKbps: number;
    fps: number;
    droppedFrames: number;
    reconnectAttempts: number;
    elapsedSeconds: number;
    message: string;
  };
  recovery: StreamRecoveryStatus & {
    backoffWindow: string;
  };
  qualityIncidents: {
    summary: string;
    incidents: StreamQualityIncident[];
  };
  qualityAdvisor: StreamQualityAdvisorRecommendation;
  history: StreamHealthHistorySummary;
  session: {
    events: StreamSessionEvent[];
    summaries: StreamSessionSummary[];
    lastSummary: StreamSessionSummary | null;
    historySummary: StreamSessionHistorySummary;
  };
  validation: StreamValidationChecklist;
  checks: DiagnosticCheck[];
}

export interface StreamDiagnosticReport {
  generatedAt: string;
  app: {
    name: "MobileLiveCaster";
    reportVersion: 1;
  };
  diagnostics: StreamDiagnostics;
}

interface SnapshotLike {
  state: {
    status: StreamStatus;
  };
  health: StreamHealth;
}

const platformLabels: Record<StudioProfile["destination"]["platform"], string> = {
  custom: "Custom",
  "youtube-live": "YouTube Live",
  twitch: "Twitch"
};

export const createStreamDiagnostics = (
  scene: SceneDocument,
  profile: StudioProfile,
  readiness: ReadinessReport,
  snapshot: SnapshotLike,
  sessionEvents: StreamSessionEvent[] = [],
  healthSamples: StreamHealthSample[] = [],
  sessionSummaries: StreamSessionSummary[] = []
): StreamDiagnostics => {
  const destination = readiness.sanitizedProfile.destination;
  const quality = readiness.sanitizedProfile.quality;
  const endpoint = parseEndpoint(destination.serverUrl);
  const redactedEndpoint = {
    host: endpoint.host,
    application: redactStreamKeyOccurrences(endpoint.application, destination.streamKey)
  };
  const targetVideoBitrateKbps = quality.videoBitrateKbps;
  const targetAudioBitrateKbps = quality.audioBitrateKbps;
  const estimatedUploadKbps = Math.round((targetVideoBitrateKbps + targetAudioBitrateKbps) * 1.25);
  const sanitizedHealthMessage = redactStreamKeyOccurrences(snapshot.health.message, destination.streamKey);
  const sanitizedSessionEvents = sessionEvents.map((event) => sanitizeSessionEvent(event, destination.streamKey));
  const recoveryPolicy = createDefaultStreamRecoveryPolicy();
  const recoveryStatus = createStreamRecoveryStatus(snapshot, quality, recoveryPolicy);
  const qualityIncidents = createStreamQualityIncidents(snapshot, quality);
  const history = summarizeStreamHealthHistory(healthSamples, {
    bitrateKbps: targetVideoBitrateKbps,
    fps: quality.fps
  });
  const qualityAdvisor = createStreamQualityAdvisor({
    quality,
    incidents: qualityIncidents,
    history,
    recovery: recoveryStatus
  });
  const checks = [
    ...readiness.issues.map<DiagnosticCheck>((issue) => ({
      code: `readiness-${issue.code}`,
      status: issue.severity === "error" ? "fail" : "warn",
      label: issue.field,
      message: issue.message
    })),
    createTransportCheck(destination.protocol),
    createEndpointCheck(redactedEndpoint),
    createStreamKeyCheck(destination.streamKey),
    createSceneCheck(scene),
    createEngineStateCheck(snapshot, sanitizedHealthMessage),
    createTelemetryBitrateCheck(snapshot, targetVideoBitrateKbps),
    createTelemetryFpsCheck(snapshot, quality.fps),
    createTelemetryDropsCheck(snapshot),
    createReconnectCheck(snapshot),
    createQualityIncidentCheck(qualityIncidents),
    createQualityAdvisorCheck(qualityAdvisor),
    createHistoryCheck(history),
    createRecoveryCheck(recoveryStatus)
  ];
  const status = summaryStatus(checks);
  const sessionHistorySummary = createStreamSessionHistorySummary(sessionSummaries);
  const validation = createStreamValidationChecklist({
    readiness,
    diagnosticStatus: status,
    target: {
      platform: platformLabels[destination.platform],
      protocol: destination.protocol,
      secureTransport: destination.protocol === "rtmps"
    },
    telemetry: {
      streamStatus: snapshot.state.status,
      bitrateKbps: snapshot.health.bitrateKbps,
      fps: snapshot.health.fps,
      droppedFrames: snapshot.health.droppedFrames,
      reconnectAttempts: snapshot.health.reconnectAttempts
    },
    health: {
      sampleCount: history.sampleCount,
      stability: history.stability
    },
    session: {
      eventCount: sanitizedSessionEvents.length,
      summaryCount: sessionSummaries.length,
      historySummary: sessionHistorySummary,
      lastOutcome: sessionSummaries[0]?.outcome ?? null
    }
  });

  return {
    summary: summaryText(status, checks),
    status,
    target: {
      platform: platformLabels[destination.platform],
      presetName: getDestinationPreset(destination.presetId)?.name ?? destination.name,
      protocol: destination.protocol.toUpperCase(),
      host: redactedEndpoint.host || "Invalid endpoint",
      application: redactedEndpoint.application || "-",
      publishUrlPreview: redactPublishUrl(buildPublishUrl(destination), destination.streamKey),
      streamKeyPreview: destination.streamKey ? redactStreamKey(destination.streamKey) : "Not set",
      secureTransport: destination.protocol === "rtmps"
    },
    quality: {
      resolution: `${quality.width}x${quality.height}`,
      fps: quality.fps,
      targetVideoBitrateKbps,
      targetAudioBitrateKbps,
      estimatedUploadKbps
    },
    telemetry: {
      streamStatus: snapshot.state.status,
      bitrateKbps: snapshot.health.bitrateKbps,
      fps: snapshot.health.fps,
      droppedFrames: snapshot.health.droppedFrames,
      reconnectAttempts: snapshot.health.reconnectAttempts,
      elapsedSeconds: snapshot.health.elapsedSeconds,
      message: sanitizedHealthMessage
    },
    recovery: {
      ...recoveryStatus,
      backoffWindow: formatRecoveryBackoff(recoveryPolicy)
    },
    qualityIncidents: {
      summary: summarizeStreamQualityIncidents(qualityIncidents),
      incidents: qualityIncidents
    },
    qualityAdvisor,
    history,
    session: {
      events: sanitizedSessionEvents,
      summaries: sessionSummaries,
      lastSummary: sessionSummaries[0] ?? null,
      historySummary: sessionHistorySummary
    },
    validation,
    checks
  };
};

export const createStreamDiagnosticReport = (
  diagnostics: StreamDiagnostics,
  now: Date = new Date()
): StreamDiagnosticReport => ({
  generatedAt: now.toISOString(),
  app: {
    name: "MobileLiveCaster",
    reportVersion: 1
  },
  diagnostics
});

export const serializeStreamDiagnosticReport = (report: StreamDiagnosticReport): string => JSON.stringify(report, null, 2);

export const formatStreamDiagnosticReport = (report: StreamDiagnosticReport): string => {
  const diagnostics = report.diagnostics;
  return [
    "MobileLiveCaster Diagnostics",
    `Generated: ${report.generatedAt}`,
    `Status: ${diagnostics.status}`,
    `Summary: ${diagnostics.summary}`,
    "",
    "Target",
    `- Platform: ${diagnostics.target.platform}`,
    `- Preset: ${diagnostics.target.presetName}`,
    `- Protocol: ${diagnostics.target.protocol}`,
    `- Endpoint: ${diagnostics.target.host}/${diagnostics.target.application}`,
    `- Publish URL: ${diagnostics.target.publishUrlPreview}`,
    "",
    "Quality",
    `- Resolution: ${diagnostics.quality.resolution}`,
    `- FPS: ${diagnostics.quality.fps}`,
    `- Video bitrate: ${diagnostics.quality.targetVideoBitrateKbps} kbps`,
    `- Audio bitrate: ${diagnostics.quality.targetAudioBitrateKbps} kbps`,
    `- Upload target: ${diagnostics.quality.estimatedUploadKbps} kbps`,
    "",
    "Telemetry",
    `- State: ${diagnostics.telemetry.streamStatus}`,
    `- Bitrate: ${diagnostics.telemetry.bitrateKbps} kbps`,
    `- FPS: ${diagnostics.telemetry.fps}`,
    `- Dropped frames: ${diagnostics.telemetry.droppedFrames}`,
    `- Reconnect attempts: ${diagnostics.telemetry.reconnectAttempts}`,
    `- Message: ${diagnostics.telemetry.message || "-"}`,
    "",
    "Recovery",
    `- Mode: ${diagnostics.recovery.mode}`,
    `- Action: ${diagnostics.recovery.recommendedAction}`,
    `- Remaining attempts: ${diagnostics.recovery.attemptsRemaining}/${diagnostics.recovery.maxAttempts}`,
    `- Backoff: ${diagnostics.recovery.backoffWindow}`,
    `- Next retry: ${diagnostics.recovery.nextRetryDelayMs === null ? "-" : formatDelay(diagnostics.recovery.nextRetryDelayMs)}`,
    `- Message: ${diagnostics.recovery.message}`,
    "",
    "Active Quality Incidents",
    `- Summary: ${diagnostics.qualityIncidents.summary}`,
    ...(diagnostics.qualityIncidents.incidents.length === 0
      ? ["- No active quality incidents."]
      : diagnostics.qualityIncidents.incidents.map(
          (incident) => `- [${incident.severity.toUpperCase()}] ${incident.label}: ${incident.message} Recommendation: ${incident.recommendation}`
        )),
    "",
    "Quality Advisor",
    `- Action: ${diagnostics.qualityAdvisor.action}`,
    `- Severity: ${diagnostics.qualityAdvisor.severity}`,
    `- Summary: ${diagnostics.qualityAdvisor.summary}`,
    `- Reason: ${diagnostics.qualityAdvisor.reason || "-"}`,
    `- Recommendation: ${diagnostics.qualityAdvisor.recommendation}`,
    `- Current target: ${formatAdvisorTarget(diagnostics.qualityAdvisor.currentTarget)}`,
    `- Suggested target: ${diagnostics.qualityAdvisor.suggestedTarget ? formatAdvisorTarget(diagnostics.qualityAdvisor.suggestedTarget) : "-"}`,
    "",
    "Health History",
    `- Summary: ${diagnostics.history.summary}`,
    `- Samples: ${diagnostics.history.sampleCount}`,
    `- Duration: ${formatDelay(diagnostics.history.durationSeconds * 1000)}`,
    `- Avg bitrate: ${diagnostics.history.averageBitrateKbps} kbps`,
    `- Min bitrate: ${diagnostics.history.minimumBitrateKbps} kbps`,
    `- Avg FPS: ${diagnostics.history.averageFps}`,
    `- Min FPS: ${diagnostics.history.minimumFps}`,
    `- Drop increase: ${diagnostics.history.droppedFrameIncrease}`,
    `- Observed reconnects: ${diagnostics.history.observedReconnectAttempts}`,
    "",
    "Completed Sessions",
    `- History: ${diagnostics.session.historySummary.summary}`,
    `- Clean rate: ${diagnostics.session.historySummary.cleanRate}%`,
    `- Average duration: ${formatDelay(diagnostics.session.historySummary.averageDurationSeconds * 1000)}`,
    `- History recommendation: ${diagnostics.session.historySummary.recommendation}`,
    ...(diagnostics.session.lastSummary
      ? [
          `- Last outcome: ${diagnostics.session.lastSummary.outcome}`,
          `- Last duration: ${formatDelay(diagnostics.session.lastSummary.durationSeconds * 1000)}`,
          `- Last summary: ${diagnostics.session.lastSummary.summary}`,
          `- Recommendation: ${diagnostics.session.lastSummary.recommendation}`,
          `- Stored summaries: ${diagnostics.session.summaries.length}`
        ]
      : ["- No completed session summaries yet."]),
    "",
    "Commercial Validation",
    `- Status: ${diagnostics.validation.status}`,
    `- Summary: ${diagnostics.validation.summary}`,
    `- Next step: ${diagnostics.validation.recommendedNextStep}`,
    `- Counts: ${diagnostics.validation.passCount} pass / ${diagnostics.validation.warningCount} warn / ${diagnostics.validation.failCount} fail / ${diagnostics.validation.pendingCount} pending`,
    ...diagnostics.validation.items.map(
      (item) => `- [${item.status.toUpperCase()}] ${item.title}: ${item.detail} Action: ${item.action}`
    ),
    "",
    "Session Events",
    ...(diagnostics.session.events.length === 0
      ? ["- No session events recorded yet."]
      : diagnostics.session.events.map(
          (event) => `- [${event.severity.toUpperCase()}] ${event.at} ${event.title}: ${event.message}`
        )),
    "",
    "Checks",
    ...diagnostics.checks.map((check) => `- [${check.status.toUpperCase()}] ${check.label}: ${check.message}`)
  ].join("\n");
};

const sanitizeSessionEvent = (event: StreamSessionEvent, streamKey: string): StreamSessionEvent => ({
  ...event,
  title: redactStreamKeyOccurrences(event.title, streamKey),
  message: redactStreamKeyOccurrences(event.message, streamKey)
});

const formatAdvisorTarget = (target: StreamQualityAdvisorRecommendation["currentTarget"]): string =>
  `${target.profileName} (${target.width}x${target.height} / ${target.fps}fps / ${target.videoBitrateKbps} kbps, upload ${target.estimatedUploadKbps} kbps)`;

const parseEndpoint = (serverUrl: string): { host: string; application: string } => {
  try {
    const url = new URL(serverUrl.trim().replace(/\{stream_key\}.*/i, ""));
    return {
      host: url.host,
      application: url.pathname.replace(/^\/+|\/+$/g, "") || "-"
    };
  } catch {
    return { host: "", application: "" };
  }
};

const redactPublishUrl = (publishUrl: string, streamKey: string): string => {
  return redactStreamKeyOccurrences(publishUrl, streamKey);
};

const redactStreamKeyOccurrences = (value: string, streamKey: string): string => {
  const candidates = streamKeyCandidates(streamKey);
  if (candidates.length === 0) {
    return value;
  }

  return candidates.reduce(
    (current, candidate) => replaceAll(current, candidate, redactStreamKey(candidate)),
    value
  );
};

const streamKeyCandidates = (streamKey: string): string[] => {
  const trimmed = streamKey.trim().replace(/^\/+/, "");
  const lastSegment = trimmed.split("/").filter(Boolean).at(-1) ?? "";
  return [...new Set([trimmed, lastSegment, encodeURIComponent(trimmed), encodeURIComponent(lastSegment)].filter((item) => item.length > 0))].sort(
    (left, right) => right.length - left.length
  );
};

const replaceAll = (value: string, search: string, replacement: string): string =>
  value.replace(new RegExp(escapeRegExp(search), "g"), replacement);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const createTransportCheck = (protocol: string): DiagnosticCheck => {
  if (protocol === "rtmps") {
    return {
      code: "transport-secure",
      status: "pass",
      label: "Transport",
      message: "RTMPS is selected."
    };
  }
  return {
    code: "transport-plain-rtmp",
    status: "warn",
    label: "Transport",
    message: "RTMP is unencrypted. Prefer RTMPS when the platform supports it."
  };
};

const createEndpointCheck = (endpoint: { host: string; application: string }): DiagnosticCheck => {
  if (!endpoint.host) {
    return {
      code: "endpoint-invalid",
      status: "fail",
      label: "Endpoint",
      message: "Endpoint host could not be parsed."
    };
  }
  return {
    code: "endpoint-parsed",
    status: "pass",
    label: "Endpoint",
    message: `${endpoint.host}/${endpoint.application}`
  };
};

const createStreamKeyCheck = (streamKey: string): DiagnosticCheck => ({
  code: streamKey ? "stream-key-present" : "stream-key-missing",
  status: streamKey ? "pass" : "fail",
  label: "Stream key",
  message: streamKey ? "Stream key is present and redacted in diagnostics." : "Stream key is required before publishing."
});

const createSceneCheck = (scene: SceneDocument): DiagnosticCheck => {
  const visibleSources = scene.sources.filter((source) => source.visible);
  return {
    code: visibleSources.length > 0 ? "scene-visible" : "scene-empty",
    status: visibleSources.length > 0 ? "pass" : "fail",
    label: "Scene",
    message: `${visibleSources.length} visible source${visibleSources.length === 1 ? "" : "s"} ready.`
  };
};

const createEngineStateCheck = (snapshot: SnapshotLike, healthMessage: string): DiagnosticCheck => {
  if (snapshot.state.status === "failed") {
    return {
      code: "engine-failed",
      status: "fail",
      label: "Engine",
      message: healthMessage || "Streaming engine is in failed state."
    };
  }

  if (snapshot.state.status === "preparing" || snapshot.state.status === "stopping") {
    return {
      code: `engine-${snapshot.state.status}`,
      status: "info",
      label: "Engine",
      message: `Streaming engine is ${snapshot.state.status}.`
    };
  }

  return {
    code: `engine-${snapshot.state.status}`,
    status: "pass",
    label: "Engine",
    message: `Streaming engine state is ${snapshot.state.status}.`
  };
};

const createTelemetryBitrateCheck = (snapshot: SnapshotLike, targetVideoBitrateKbps: number): DiagnosticCheck => {
  if (snapshot.state.status !== "live" && snapshot.state.status !== "reconnecting") {
    return {
      code: "telemetry-idle",
      status: "info",
      label: "Telemetry",
      message: "Live telemetry will appear after the stream starts."
    };
  }

  const minimumHealthyBitrate = Math.round(targetVideoBitrateKbps * 0.75);
  if (snapshot.health.bitrateKbps < minimumHealthyBitrate) {
    return {
      code: "telemetry-bitrate-low",
      status: "warn",
      label: "Bitrate",
      message: `Current bitrate is below 75% of target video bitrate (${minimumHealthyBitrate} kbps).`
    };
  }

  return {
    code: "telemetry-bitrate-ok",
    status: "pass",
    label: "Bitrate",
    message: "Current bitrate is within the expected range."
  };
};

const createTelemetryFpsCheck = (snapshot: SnapshotLike, targetFps: number): DiagnosticCheck => {
  if (snapshot.state.status !== "live" && snapshot.state.status !== "reconnecting") {
    return {
      code: "telemetry-fps-idle",
      status: "info",
      label: "FPS",
      message: `${targetFps} fps target configured.`
    };
  }

  if (snapshot.health.fps < Math.max(1, targetFps - 5)) {
    return {
      code: "telemetry-fps-low",
      status: "warn",
      label: "FPS",
      message: `Current FPS is below target (${targetFps}).`
    };
  }

  return {
    code: "telemetry-fps-ok",
    status: "pass",
    label: "FPS",
    message: "Current FPS is close to target."
  };
};

const createTelemetryDropsCheck = (snapshot: SnapshotLike): DiagnosticCheck => {
  if (snapshot.state.status !== "live" && snapshot.state.status !== "reconnecting") {
    return {
      code: "telemetry-drops-idle",
      status: "info",
      label: "Dropped frames",
      message: "No dropped-frame telemetry yet."
    };
  }

  if (snapshot.health.droppedFrames > 0) {
    return {
      code: "telemetry-drops-present",
      status: "warn",
      label: "Dropped frames",
      message: `${snapshot.health.droppedFrames} dropped frame${snapshot.health.droppedFrames === 1 ? "" : "s"} reported.`
    };
  }

  return {
    code: "telemetry-drops-ok",
    status: "pass",
    label: "Dropped frames",
    message: "No dropped frames reported."
  };
};

const createReconnectCheck = (snapshot: SnapshotLike): DiagnosticCheck => {
  if (snapshot.health.reconnectAttempts > 0) {
    return {
      code: "telemetry-reconnects",
      status: "warn",
      label: "Reconnect",
      message: `${snapshot.health.reconnectAttempts} reconnect attempt${snapshot.health.reconnectAttempts === 1 ? "" : "s"} reported.`
    };
  }
  return {
    code: "telemetry-reconnects-ok",
    status: "pass",
    label: "Reconnect",
    message: "No reconnect attempts reported."
  };
};

const createQualityIncidentCheck = (incidents: StreamQualityIncident[]): DiagnosticCheck => {
  const summary = summarizeStreamQualityIncidents(incidents);
  if (incidents.some((incident) => incident.severity === "fail")) {
    return {
      code: "quality-incidents-critical",
      status: "fail",
      label: "Quality incidents",
      message: summary
    };
  }
  if (incidents.length > 0) {
    return {
      code: "quality-incidents-warn",
      status: "warn",
      label: "Quality incidents",
      message: summary
    };
  }
  return {
    code: "quality-incidents-ok",
    status: "pass",
    label: "Quality incidents",
    message: summary
  };
};

const createQualityAdvisorCheck = (advisor: StreamQualityAdvisorRecommendation): DiagnosticCheck => ({
  code: `quality-advisor-${advisor.action}`,
  status: advisor.severity,
  label: "Quality advisor",
  message: advisor.summary
});

const createHistoryCheck = (history: StreamHealthHistorySummary): DiagnosticCheck => {
  if (history.stability === "unstable") {
    return {
      code: "history-unstable",
      status: "warn",
      label: "Health history",
      message: history.summary
    };
  }
  if (history.stability === "watch") {
    return {
      code: "history-watch",
      status: "warn",
      label: "Health history",
      message: history.summary
    };
  }
  if (history.stability === "stable") {
    return {
      code: "history-stable",
      status: "pass",
      label: "Health history",
      message: history.summary
    };
  }
  return {
    code: "history-empty",
    status: "info",
    label: "Health history",
    message: history.summary
  };
};

const createRecoveryCheck = (recovery: StreamRecoveryStatus): DiagnosticCheck => ({
  code: `recovery-${recovery.mode}`,
  status: recovery.severity,
  label: "Recovery",
  message: recovery.message
});

const summaryStatus = (checks: DiagnosticCheck[]): DiagnosticStatus => {
  if (checks.some((check) => check.status === "fail")) {
    return "fail";
  }
  if (checks.some((check) => check.status === "warn")) {
    return "warn";
  }
  return "pass";
};

const summaryText = (status: DiagnosticStatus, checks: DiagnosticCheck[]): string => {
  const failures = checks.filter((check) => check.status === "fail").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  if (status === "fail") {
    return `${failures} blocking diagnostic${failures === 1 ? "" : "s"} before live.`;
  }
  if (status === "warn") {
    return `${warnings} diagnostic warning${warnings === 1 ? "" : "s"} to review.`;
  }
  return "Diagnostics are clean for the configured target.";
};
