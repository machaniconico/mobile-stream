import {
  qualityProfiles,
  type QualityProfile,
  type StudioProfile
} from "./profiles";
import type { StreamHealthHistorySummary } from "./streamHealthHistory";
import type { StreamQualityIncident } from "./streamQualityIncidents";
import type { StreamRecoveryStatus } from "./streamRecovery";

export type StreamQualityAdvisorAction = "maintain" | "monitor" | "lower-quality" | "reconnect" | "stop";
export type StreamQualityAdvisorSeverity = "pass" | "warn" | "fail" | "info";

export interface StreamQualityAdvisorTarget {
  profileId: string | null;
  profileName: string;
  width: number;
  height: number;
  fps: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  estimatedUploadKbps: number;
}

export interface StreamQualityAdvisorRecommendation {
  action: StreamQualityAdvisorAction;
  severity: StreamQualityAdvisorSeverity;
  summary: string;
  reason: string;
  recommendation: string;
  currentTarget: StreamQualityAdvisorTarget;
  suggestedTarget: StreamQualityAdvisorTarget | null;
}

export const createStreamQualityAdvisor = ({
  quality,
  incidents,
  history,
  recovery,
  availableProfiles = qualityProfiles
}: {
  quality: QualityProfile;
  incidents: StreamQualityIncident[];
  history: StreamHealthHistorySummary;
  recovery: StreamRecoveryStatus;
  availableProfiles?: QualityProfile[];
}): StreamQualityAdvisorRecommendation => {
  const currentTarget = toAdvisorTarget(quality);
  const suggestedTarget = createSuggestedTarget(quality, incidents, availableProfiles);
  const hasMissingTelemetry = hasAnyIncident(incidents, ["bitrate-missing", "fps-missing"]);
  const hasCriticalIncident = incidents.some((incident) => incident.severity === "fail");
  const hasWarningIncident = incidents.some((incident) => incident.severity === "warn");
  const hasReconnectRisk = hasAnyIncident(incidents, ["reconnects"]) || history.observedReconnectAttempts > 0;

  if (recovery.recommendedAction === "stop") {
    return createRecommendation({
      action: "stop",
      severity: "fail",
      summary: "Stop recommended before quality tuning.",
      reason: recovery.message,
      recommendation: "Stop the stream, verify ingest health, then restart with the suggested lower quality target.",
      currentTarget,
      suggestedTarget
    });
  }

  if (hasMissingTelemetry) {
    return createRecommendation({
      action: "reconnect",
      severity: "fail",
      summary: "Telemetry is missing during a live session.",
      reason: incidentReason(incidents) || recovery.message,
      recommendation: "Reconnect first. If missing telemetry repeats, restart with the suggested lower quality target.",
      currentTarget,
      suggestedTarget
    });
  }

  if (hasCriticalIncident || recovery.recommendedAction === "reconnect" || history.stability === "unstable") {
    return createRecommendation({
      action: "lower-quality",
      severity: hasCriticalIncident || recovery.recommendedAction === "reconnect" ? "fail" : "warn",
      summary: "Lower quality is recommended for the next attempt.",
      reason: incidentReason(incidents) || history.summary || recovery.message,
      recommendation: suggestedTarget
        ? `Use ${suggestedTarget.profileName} or an equivalent ${suggestedTarget.videoBitrateKbps} kbps / ${suggestedTarget.fps} fps target before the next long stream.`
        : "Lower bitrate and FPS before the next long stream.",
      currentTarget,
      suggestedTarget
    });
  }

  if (hasWarningIncident || hasReconnectRisk || history.stability === "watch" || recovery.recommendedAction === "monitor") {
    return createRecommendation({
      action: "monitor",
      severity: "warn",
      summary: "Monitor quality before changing profile.",
      reason: incidentReason(incidents) || history.summary || recovery.message,
      recommendation: suggestedTarget
        ? `Hold current settings briefly. If warnings persist, switch to ${suggestedTarget.profileName}.`
        : "Hold current settings briefly. If warnings persist, reduce bitrate by 20-30%.",
      currentTarget,
      suggestedTarget
    });
  }

  return createRecommendation({
    action: "maintain",
    severity: recovery.mode === "idle" ? "info" : "pass",
    summary: "Current quality target is acceptable.",
    reason: history.summary,
    recommendation: "Keep the current target as the known-good baseline.",
    currentTarget,
    suggestedTarget: null
  });
};

export const applyStreamQualityAdvisorTarget = (
  profile: StudioProfile,
  target: StreamQualityAdvisorTarget | null
): StudioProfile => {
  if (!target) {
    return profile;
  }

  const preset = target.profileId ? qualityProfiles.find((quality) => quality.id === target.profileId) : null;
  const quality = preset ?? {
    id: target.profileId ?? "quality-advisor-custom",
    name: target.profileName,
    width: target.width,
    height: target.height,
    fps: toSupportedFps(target.fps),
    videoBitrateKbps: target.videoBitrateKbps,
    audioBitrateKbps: target.audioBitrateKbps
  };

  return {
    ...profile,
    quality
  };
};

const createRecommendation = (recommendation: StreamQualityAdvisorRecommendation): StreamQualityAdvisorRecommendation =>
  recommendation;

const createSuggestedTarget = (
  quality: QualityProfile,
  incidents: StreamQualityIncident[],
  availableProfiles: QualityProfile[]
): StreamQualityAdvisorTarget | null => {
  const lowerProfile = chooseLowerProfile(quality, incidents, availableProfiles);
  if (lowerProfile) {
    return toAdvisorTarget(lowerProfile);
  }

  if (incidents.length === 0) {
    return null;
  }

  return createCustomLowerTarget(quality);
};

const chooseLowerProfile = (
  quality: QualityProfile,
  incidents: StreamQualityIncident[],
  availableProfiles: QualityProfile[]
): QualityProfile | null => {
  const preferThirtyFps = quality.fps > 30 || hasAnyIncident(incidents, ["fps-critical", "fps-low", "fps-missing"]);
  const candidates = availableProfiles
    .filter((profile) => profile.id !== quality.id)
    .filter((profile) => profile.videoBitrateKbps < quality.videoBitrateKbps)
    .filter((profile) => profile.fps <= (preferThirtyFps ? 30 : quality.fps))
    .sort((left, right) => qualityCost(right) - qualityCost(left));

  return candidates[0] ?? null;
};

const createCustomLowerTarget = (quality: QualityProfile): StreamQualityAdvisorTarget => {
  const videoBitrateKbps = roundToHundred(Math.max(900, Math.round(quality.videoBitrateKbps * 0.72)));
  const fps = quality.fps > 30 ? 30 : quality.fps;
  return {
    profileId: null,
    profileName: `Custom safer ${quality.height}p${fps}`,
    width: quality.width,
    height: quality.height,
    fps,
    videoBitrateKbps,
    audioBitrateKbps: quality.audioBitrateKbps,
    estimatedUploadKbps: estimateUploadKbps(videoBitrateKbps, quality.audioBitrateKbps)
  };
};

const toAdvisorTarget = (quality: QualityProfile): StreamQualityAdvisorTarget => ({
  profileId: quality.id,
  profileName: quality.name,
  width: quality.width,
  height: quality.height,
  fps: quality.fps,
  videoBitrateKbps: quality.videoBitrateKbps,
  audioBitrateKbps: quality.audioBitrateKbps,
  estimatedUploadKbps: estimateUploadKbps(quality.videoBitrateKbps, quality.audioBitrateKbps)
});

const estimateUploadKbps = (videoBitrateKbps: number, audioBitrateKbps: number): number =>
  Math.round((videoBitrateKbps + audioBitrateKbps) * 1.25);

const roundToHundred = (value: number): number => Math.max(100, Math.round(value / 100) * 100);

const qualityCost = (quality: QualityProfile): number =>
  quality.videoBitrateKbps + Math.round((quality.width * quality.height * quality.fps) / 10000);

const toSupportedFps = (fps: number): QualityProfile["fps"] => (fps === 60 ? 60 : 30);

const hasAnyIncident = (incidents: StreamQualityIncident[], codes: StreamQualityIncident["code"][]): boolean =>
  incidents.some((incident) => codes.includes(incident.code));

const incidentReason = (incidents: StreamQualityIncident[]): string =>
  incidents.map((incident) => `${incident.label}: ${incident.message}`).join(" ");
