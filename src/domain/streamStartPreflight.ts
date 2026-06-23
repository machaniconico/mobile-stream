import type { ChatReaderSettings } from "./chatReader";
import {
  createAudioMonitorSafetyStatus,
  createDefaultAudioRouteState,
  normalizeAudioRouteState,
  type AudioRouteState
} from "./audioRoute";
import {
  getPlatformChatNetworkReadiness,
  type PlatformChatAuthSession,
  type PlatformChatConnectionState
} from "./platformChatConnection";
import {
  assessPlatformChatOAuthCredentialHealth,
  TWITCH_CHANNEL_MANAGE_SCOPE,
  TWITCH_CHAT_SCOPE,
  YOUTUBE_LIVE_CHAT_SCOPE,
  YOUTUBE_LIVE_MANAGE_SCOPE,
  type PlatformChatOAuthCredential
} from "./platformChatOAuth";
import type { ReadinessIssue, ReadinessReport } from "./readiness";
import type { StudioProfile } from "./profiles";
import type { StreamOperationStatus } from "./streamOperation";
import type { StreamStatus } from "./streamState";
import type { StreamValidationChecklist } from "./streamValidationChecklist";

export type StreamStartPreflightStatus = "ready" | "warning" | "blocked";
export type StreamStartPreflightSeverity = "block" | "warning";
export type StreamStartPreflightArea =
  | "destination"
  | "quality"
  | "scene"
  | "security"
  | "audio"
  | "avatar"
  | "chat"
  | "validation"
  | "publishing"
  | "engine"
  | "operation";

export interface StreamStartPreflightIssue {
  code: string;
  severity: StreamStartPreflightSeverity;
  area: StreamStartPreflightArea;
  label: string;
  message: string;
  recommendation: string;
}

export interface StreamStartPreflightReport {
  canStart: boolean;
  status: StreamStartPreflightStatus;
  summary: string;
  primaryAction: string;
  blocks: StreamStartPreflightIssue[];
  warnings: StreamStartPreflightIssue[];
  issues: StreamStartPreflightIssue[];
}

export interface StreamStartPreflightInput {
  readiness: ReadinessReport;
  streamStatus: StreamStatus;
  operationStatus?: StreamOperationStatus | null;
  profile?: Pick<StudioProfile, "destination" | "platformPublishing" | "platformChat" | "micEffects">;
  validation?: Pick<StreamValidationChecklist, "status" | "recommendedNextStep"> | null;
  chatReader?: Pick<ChatReaderSettings, "enabled"> | null;
  platformChatAuth?: PlatformChatAuthSession | null;
  platformChatOAuthCredential?: PlatformChatOAuthCredential | null;
  platformChatConnection?: Pick<PlatformChatConnectionState, "phase" | "message"> | null;
  audioRoute?: AudioRouteState | null;
  now?: Date;
}

export const platformPublishingStatusMaxAgeMinutes = 10;

export const createStreamStartPreflightReport = ({
  readiness,
  streamStatus,
  operationStatus = null,
  profile,
  validation = null,
  chatReader = null,
  platformChatAuth = null,
  platformChatOAuthCredential = null,
  platformChatConnection = null,
  audioRoute = null,
  now = new Date()
}: StreamStartPreflightInput): StreamStartPreflightReport => {
  const issues = [
    ...readiness.issues.map(toPreflightIssue),
    ...createAudioMonitorRouteIssues(profile, audioRoute),
    ...createChatReadoutIssues(profile, chatReader, platformChatAuth, platformChatOAuthCredential, platformChatConnection, now),
    ...createCommercialValidationIssues(profile, validation),
    ...createPlatformPublishingIssues(profile, validation, now, platformChatOAuthCredential),
    ...createEngineStateIssues(streamStatus),
    ...createOperationIssues(operationStatus)
  ];
  const blocks = issues.filter((issue) => issue.severity === "block");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const status: StreamStartPreflightStatus = blocks.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready";

  return {
    canStart: blocks.length === 0,
    status,
    summary: createSummary(status, blocks.length, warnings.length),
    primaryAction: createPrimaryAction(status, blocks, warnings),
    blocks,
    warnings,
    issues
  };
};

export const formatStreamStartPreflightBlockMessage = (report: StreamStartPreflightReport): string => {
  if (report.canStart) {
    return "Launch preflight passed.";
  }

  const visibleBlocks = report.blocks.slice(0, 3).map((issue) => issue.message);
  const remainingCount = report.blocks.length - visibleBlocks.length;
  const suffix = remainingCount > 0 ? ` (+${remainingCount} more)` : "";
  return `Launch preflight blocked: ${visibleBlocks.join("; ")}${suffix}`;
};

const toPreflightIssue = (issue: ReadinessIssue): StreamStartPreflightIssue => ({
  code: `readiness-${issue.code}`,
  severity: issue.severity === "error" ? "block" : "warning",
  area: readinessArea(issue),
  label: readinessLabel(issue),
  message: issue.message,
  recommendation: readinessRecommendation(issue)
});

const readinessArea = (issue: ReadinessIssue): StreamStartPreflightArea => {
  if (issue.field === "serverUrl" || issue.field === "streamKey") {
    return "destination";
  }
  if (issue.field === "micEffects") {
    return "audio";
  }
  if (issue.field === "faceTracking") {
    return "avatar";
  }
  return issue.field;
};

const readinessLabel = (issue: ReadinessIssue): string => {
  if (issue.field === "serverUrl") {
    return "Endpoint";
  }
  if (issue.field === "streamKey") {
    return "Stream key";
  }
  if (issue.field === "micEffects") {
    return "Mic";
  }
  if (issue.field === "faceTracking") {
    return "Face tracking";
  }
  return capitalize(issue.field);
};

const readinessRecommendation = (issue: ReadinessIssue): string => {
  switch (issue.field) {
    case "serverUrl":
      return "Set a valid YouTube Live, Twitch, or custom RTMP(S) ingest endpoint.";
    case "streamKey":
      return "Paste the full stream key from the destination platform before starting.";
    case "quality":
      return "Pick a supported resolution, FPS, and bitrate profile for the target platform.";
    case "scene":
      return "Enable at least one visible scene source and confirm the program preview.";
    case "security":
      return "Prefer RTMPS for production streams when the platform supports it.";
    case "micEffects":
      return "Lower risky monitor or gain settings before going live.";
    case "faceTracking":
      return "Confirm a prepared PNGTuber source and stable native camera tracking before production validation.";
  }
};

const createEngineStateIssues = (status: StreamStatus): StreamStartPreflightIssue[] => {
  if (status === "idle") {
    return [];
  }

  if (status === "failed") {
    return [
      {
        code: "engine-previous-failure",
        severity: "warning",
        area: "engine",
        label: "Engine",
        message: "Previous stream attempt ended in a failed state.",
        recommendation: "Retry only after checking the last error in diagnostics."
      }
    ];
  }

  const messages: Record<Exclude<StreamStatus, "idle" | "failed">, string> = {
    preparing: "Stream encoder is still preparing.",
    live: "A stream is already live.",
    reconnecting: "Stream recovery is reconnecting.",
    stopping: "Stream shutdown is still in progress."
  };

  return [
    {
      code: `engine-${status}`,
      severity: "block",
      area: "engine",
      label: "Engine",
      message: messages[status],
      recommendation: "Wait for the current stream operation to finish before starting again."
    }
  ];
};

const createOperationIssues = (operationStatus: StreamOperationStatus | null): StreamStartPreflightIssue[] => {
  if (!operationStatus) {
    return [];
  }

  if (operationStatus.kind === "pending") {
    return [
      {
        code: `operation-${operationStatus.action}-pending`,
        severity: "block",
        area: "operation",
        label: "Operation",
        message: operationStatus.message,
        recommendation: "Wait for the active operation to complete before starting a new stream."
      }
    ];
  }

  return [
    {
      code: `operation-${operationStatus.action}-failed`,
      severity: "warning",
      area: "operation",
      label: "Last operation",
      message: operationStatus.message,
      recommendation: "Review the failure message and retry when the setup looks correct."
    }
  ];
};

const createCommercialValidationIssues = (
  profile: StreamStartPreflightInput["profile"],
  validation: StreamStartPreflightInput["validation"]
): StreamStartPreflightIssue[] => {
  if (!profile) {
    return [];
  }

  const validationReady = validation?.status === "ready";
  const recommendation =
    validation?.recommendedNextStep ??
    "Complete commercial validation before starting public or platform-visible streams.";

  if (validationReady) {
    return [];
  }

  if (profile.destination.platform === "youtube-live" && profile.platformPublishing.privacyStatus === "public") {
    return [
      {
        code: "validation-youtube-public-not-ready",
        severity: "block",
        area: "validation",
        label: "Commercial validation",
        message: "YouTube Live is set to public, but commercial validation is not ready.",
        recommendation
      }
    ];
  }

  if (profile.destination.platform === "twitch") {
    return [
      {
        code: "validation-twitch-public-not-ready",
        severity: "block",
        area: "validation",
        label: "Commercial validation",
        message: "Twitch streams are platform-visible, but commercial validation is not ready.",
        recommendation
      }
    ];
  }

  if (profile.destination.platform === "youtube-live" && profile.platformPublishing.privacyStatus === "unlisted") {
    return [
      {
        code: "validation-youtube-unlisted-not-ready",
        severity: "warning",
        area: "validation",
        label: "Commercial validation",
        message: "YouTube Live is unlisted, but commercial validation is not ready.",
        recommendation: "Keep this as a controlled validation stream; switch to public only after commercial validation is ready."
      }
    ];
  }

  if (profile.destination.platform === "custom") {
    return [
      {
        code: "validation-custom-not-ready",
        severity: "warning",
        area: "validation",
        label: "Commercial validation",
        message: "Custom ingest visibility is unknown, and commercial validation is not ready.",
        recommendation: "Use a private endpoint or staging ingest until commercial validation is ready."
      }
    ];
  }

  return [];
};

const createPlatformPublishingIssues = (
  profile: StreamStartPreflightInput["profile"],
  validation: StreamStartPreflightInput["validation"],
  now: Date,
  platformChatOAuthCredential: StreamStartPreflightInput["platformChatOAuthCredential"]
): StreamStartPreflightIssue[] => {
  if (!profile) {
    return [];
  }

  if (profile.destination.platform === "youtube-live") {
    return createYouTubePublishingIssues(profile, validation, now, platformChatOAuthCredential);
  }

  if (profile.destination.platform === "twitch") {
    return createTwitchPublishingIssues(profile, now, platformChatOAuthCredential);
  }

  return [];
};

const createYouTubePublishingIssues = (
  profile: NonNullable<StreamStartPreflightInput["profile"]>,
  validation: StreamStartPreflightInput["validation"],
  now: Date,
  platformChatOAuthCredential: StreamStartPreflightInput["platformChatOAuthCredential"]
): StreamStartPreflightIssue[] => {
  const settings = profile.platformPublishing;
  const visibilityRequiresManagedBroadcast = settings.privacyStatus !== "private" && validation?.status === "ready";
  if (!visibilityRequiresManagedBroadcast) {
    return [];
  }

  const issues: StreamStartPreflightIssue[] = [];
  const oauthIssue = createOAuthScopeIssue({
    credential: platformChatOAuthCredential,
    platform: "youtube",
    requiredScopes: [YOUTUBE_LIVE_MANAGE_SCOPE],
    purposeLabel: "YouTube broadcast management",
    codePrefix: "publishing-youtube-oauth",
    area: "publishing",
    label: "YouTube OAuth",
    missingCredentialSeverity: "warning",
    unknownScopesSeverity: "warning",
    now
  });
  if (oauthIssue) {
    issues.push(oauthIssue);
  }
  const freshnessIssue = createStatusFreshnessIssue("youtube", settings.youtubeStatusCheckedAt, now);
  if (freshnessIssue) {
    issues.push(freshnessIssue);
  }
  if (!settings.youtubeBroadcastId.trim()) {
    issues.push({
      code: "publishing-youtube-broadcast-required",
      severity: "block",
      area: "publishing",
      label: "YouTube broadcast",
      message: "YouTube Live is platform-visible, but no bound broadcast is selected.",
      recommendation: "Create and bind a YouTube broadcast before starting a platform-visible stream."
    });
  }
  if (!settings.youtubeStreamId.trim()) {
    issues.push({
      code: "publishing-youtube-stream-required",
      severity: "block",
      area: "publishing",
      label: "YouTube stream",
      message: "YouTube Live is platform-visible, but no YouTube stream ID is saved.",
      recommendation: "Create or sync a reusable YouTube stream key, then bind it to a broadcast."
    });
  }

  const broadcastStatus = settings.youtubeBroadcastStatus.trim().toLowerCase();
  if (broadcastStatus === "complete") {
    issues.push({
      code: "publishing-youtube-broadcast-complete",
      severity: "block",
      area: "publishing",
      label: "YouTube broadcast",
      message: "The selected YouTube broadcast is already complete.",
      recommendation: "Create a new YouTube broadcast before starting another platform-visible stream."
    });
  } else if (broadcastStatus === "live") {
    issues.push({
      code: "publishing-youtube-broadcast-already-live",
      severity: "warning",
      area: "publishing",
      label: "YouTube broadcast",
      message: "The selected YouTube broadcast is already live.",
      recommendation: "Refresh YouTube status and confirm the previous broadcast is not still active before starting the local encoder."
    });
  }

  return issues;
};

const createTwitchPublishingIssues = (
  profile: NonNullable<StreamStartPreflightInput["profile"]>,
  now: Date,
  platformChatOAuthCredential: StreamStartPreflightInput["platformChatOAuthCredential"]
): StreamStartPreflightIssue[] => {
  const freshnessIssue = createStatusFreshnessIssue("twitch", profile.platformPublishing.twitchStatusCheckedAt, now);
  const issues: StreamStartPreflightIssue[] = [];
  const oauthIssue = createOAuthScopeIssue({
    credential: platformChatOAuthCredential,
    platform: "twitch",
    requiredScopes: [TWITCH_CHANNEL_MANAGE_SCOPE],
    purposeLabel: "Twitch channel management",
    codePrefix: "publishing-twitch-oauth",
    area: "publishing",
    label: "Twitch OAuth",
    missingCredentialSeverity: "warning",
    unknownScopesSeverity: "warning",
    now
  });
  if (oauthIssue) {
    issues.push(oauthIssue);
  }
  if (freshnessIssue) {
    issues.push(freshnessIssue);
  }

  if (profile.platformPublishing.twitchLiveStatus.trim().toLowerCase() !== "live") {
    return issues;
  }

  return [
    ...issues,
    {
      code: "publishing-twitch-already-live",
      severity: "block",
      area: "publishing",
      label: "Twitch status",
      message: "Twitch channel status is already live.",
      recommendation: "Refresh Twitch status or stop the existing live stream before starting another encoder session."
    }
  ];
};

const createStatusFreshnessIssue = (
  platform: "youtube" | "twitch",
  checkedAt: string,
  now: Date
): StreamStartPreflightIssue | null => {
  const label = platform === "youtube" ? "YouTube status" : "Twitch status";
  const platformName = platform === "youtube" ? "YouTube" : "Twitch";
  if (!checkedAt.trim()) {
    return {
      code: `publishing-${platform}-status-unchecked`,
      severity: "warning",
      area: "publishing",
      label,
      message: `${platformName} dashboard status has not been refreshed in this profile.`,
      recommendation: `Refresh ${platformName} status before starting a production stream.`
    };
  }

  const checkedTimestamp = Date.parse(checkedAt);
  const nowTimestamp = now.getTime();
  if (!Number.isFinite(checkedTimestamp) || !Number.isFinite(nowTimestamp)) {
    return {
      code: `publishing-${platform}-status-invalid`,
      severity: "warning",
      area: "publishing",
      label,
      message: `${platformName} dashboard status timestamp is invalid.`,
      recommendation: `Refresh ${platformName} status before starting a production stream.`
    };
  }

  const ageMinutes = Math.floor(Math.max(0, nowTimestamp - checkedTimestamp) / 60000);
  if (ageMinutes <= platformPublishingStatusMaxAgeMinutes) {
    return null;
  }

  return {
    code: `publishing-${platform}-status-stale`,
    severity: "warning",
    area: "publishing",
    label,
    message: `${platformName} dashboard status is ${ageMinutes} minutes old.`,
    recommendation: `Refresh ${platformName} status within ${platformPublishingStatusMaxAgeMinutes} minutes of starting a production stream.`
  };
};

const createAudioMonitorRouteIssues = (
  profile: StreamStartPreflightInput["profile"],
  audioRoute: StreamStartPreflightInput["audioRoute"]
): StreamStartPreflightIssue[] => {
  if (!profile?.micEffects.monitorEnabled || !profile.micEffects.monitorHeadphonesOnly || profile.micEffects.monitorVolume <= 0) {
    return [];
  }

  const route = normalizeAudioRouteState(audioRoute ?? createDefaultAudioRouteState());
  const safety = createAudioMonitorSafetyStatus(profile.micEffects, route);
  if (safety.status === "fail") {
    return [
      {
        code: "audio-monitor-route-unsafe",
        severity: "block",
        area: "audio",
        label: "Monitor route",
        message: safety.summary,
        recommendation: safety.recommendation
      }
    ];
  }

  if (safety.status === "warn") {
    return [
      {
        code: "audio-monitor-route-unconfirmed",
        severity: "warning",
        area: "audio",
        label: "Monitor route",
        message: safety.summary,
        recommendation: safety.recommendation
      }
    ];
  }

  return [];
};

const createChatReadoutIssues = (
  profile: StreamStartPreflightInput["profile"],
  chatReader: StreamStartPreflightInput["chatReader"],
  platformChatAuth: StreamStartPreflightInput["platformChatAuth"],
  platformChatOAuthCredential: StreamStartPreflightInput["platformChatOAuthCredential"],
  platformChatConnection: StreamStartPreflightInput["platformChatConnection"],
  now: Date
): StreamStartPreflightIssue[] => {
  if (!profile?.platformChat.enabled) {
    return [];
  }

  if (!chatReader?.enabled) {
    return [
      {
        code: "chat-reader-disabled",
        severity: "warning",
        area: "chat",
        label: "Chat readout",
        message: "Platform chat is enabled, but chat readout is turned off.",
        recommendation: "Turn on chat readout before production streams if comments should be spoken aloud."
      }
    ];
  }

  const networkReadiness = getPlatformChatNetworkReadiness(
    profile.platformChat,
    platformChatAuth ?? {
      youtubeAccessToken: "",
      twitchOauthToken: "",
      twitchLogin: ""
    }
  );

  if (networkReadiness.status === "needs-configuration" || networkReadiness.status === "needs-auth") {
    return [
      {
        code: `chat-platform-${networkReadiness.status}`,
        severity: "block",
        area: "chat",
        label: "Platform chat",
        message: networkReadiness.message,
        recommendation:
          networkReadiness.status === "needs-auth"
            ? "Connect the platform OAuth session before starting a stream with chat readout enabled."
            : "Set the YouTube live chat ID or Twitch channel before starting a stream with chat readout enabled."
      }
    ];
  }

  const issues: StreamStartPreflightIssue[] = [];
  const oauthIssue = createOAuthScopeIssue({
    credential: platformChatOAuthCredential,
    platform: profile.platformChat.platform,
    requiredScopes: profile.platformChat.platform === "youtube" ? [YOUTUBE_LIVE_CHAT_SCOPE] : [TWITCH_CHAT_SCOPE],
    purposeLabel: `${profile.platformChat.platform === "youtube" ? "YouTube" : "Twitch"} chat readout`,
    codePrefix: `chat-${profile.platformChat.platform}-oauth`,
    area: "chat",
    label: "Platform chat OAuth",
    missingCredentialSeverity: "warning",
    unknownScopesSeverity: "warning",
    now
  });
  if (oauthIssue) {
    issues.push(oauthIssue);
  }

  const phase = platformChatConnection?.phase ?? "idle";
  if (networkReadiness.status === "ready" && phase !== "connected") {
    issues.push({
      code: phase === "failed" ? "chat-platform-connection-failed" : "chat-platform-not-connected",
      severity: "warning",
      area: "chat",
      label: "Platform chat",
      message:
        phase === "failed"
          ? platformChatConnection?.message || "Platform chat connection is failed."
          : "Platform chat is configured but not connected.",
      recommendation:
        phase === "connecting"
          ? "Wait for chat connection to finish before production validation."
          : "Connect and test platform chat before production validation so comments can be read aloud."
    });
  }

  return issues;
};

const createOAuthScopeIssue = ({
  credential,
  platform,
  requiredScopes,
  purposeLabel,
  codePrefix,
  area,
  label,
  missingCredentialSeverity,
  unknownScopesSeverity,
  now
}: {
  credential: PlatformChatOAuthCredential | null | undefined;
  platform: PlatformChatOAuthCredential["platform"];
  requiredScopes: string[];
  purposeLabel: string;
  codePrefix: string;
  area: StreamStartPreflightArea;
  label: string;
  missingCredentialSeverity: StreamStartPreflightSeverity;
  unknownScopesSeverity: StreamStartPreflightSeverity;
  now: Date;
}): StreamStartPreflightIssue | null => {
  const matchingCredential = credential?.platform === platform ? credential : null;
  const health = assessPlatformChatOAuthCredentialHealth(matchingCredential, {
    platform,
    requiredScopes,
    purposeLabel,
    now: now.getTime(),
    missingCredentialSeverity: missingCredentialSeverity === "block" ? "fail" : "warn",
    unknownScopesSeverity: unknownScopesSeverity === "block" ? "fail" : "warn"
  });
  if (health.status === "ready") {
    return null;
  }

  return {
    code: `${codePrefix}-${health.status}`,
    severity: health.severity === "fail" ? "block" : "warning",
    area,
    label,
    message: health.message,
    recommendation: health.recommendation
  };
};

const createSummary = (status: StreamStartPreflightStatus, blockCount: number, warningCount: number): string => {
  if (status === "blocked") {
    return `${blockCount} launch block${blockCount === 1 ? "" : "s"} before Go Live.`;
  }
  if (status === "warning") {
    return `${warningCount} launch warning${warningCount === 1 ? "" : "s"} to review.`;
  }
  return "Launch preflight is ready.";
};

const createPrimaryAction = (
  status: StreamStartPreflightStatus,
  blocks: StreamStartPreflightIssue[],
  warnings: StreamStartPreflightIssue[]
): string => {
  if (status === "blocked") {
    return blocks[0]?.recommendation ?? "Resolve launch blocks before going live.";
  }
  if (status === "warning") {
    return warnings[0]?.recommendation ?? "Review warnings, then start when ready.";
  }
  return "Start the stream when you are ready.";
};

const capitalize = (value: string): string => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
