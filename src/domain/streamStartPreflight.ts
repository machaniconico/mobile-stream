import type { ChatReaderSettings } from "./chatReader";
import type { FaceTrackingDiagnostics } from "./faceTrackingDiagnostics";
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
  getPlatformChatOAuthCredential,
  type PlatformChatOAuthCredential,
  type PlatformChatOAuthCredentialStore
} from "./platformChatOAuth";
import type { ReadinessIssue, ReadinessReport } from "./readiness";
import { broadcastMixerChannels, type StudioProfile } from "./profiles";
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
  enginePlatform?: string | null;
  operationStatus?: StreamOperationStatus | null;
  profile?: Pick<StudioProfile, "destination" | "platformPublishing" | "platformChat" | "micEffects" | "broadcastMixer">;
  validation?: Pick<StreamValidationChecklist, "status" | "recommendedNextStep"> | null;
  chatReader?: (
    Pick<ChatReaderSettings, "enabled"> &
      Partial<
        Pick<
          ChatReaderSettings,
          "redactUrls" | "skipCommandMessages" | "moderationEnabled" | "blockExcessiveCaps" | "maxMessagesPerAuthorPerMinute"
        >
      >
  ) | null;
  platformChatAuth?: PlatformChatAuthSession | null;
  platformChatOAuthCredentials?: PlatformChatOAuthCredentialStore | null;
  platformChatOAuthCredential?: PlatformChatOAuthCredential | null;
  platformChatConnection?: Pick<PlatformChatConnectionState, "phase" | "message"> | null;
  audioRoute?: AudioRouteState | null;
  faceTracking?: FaceTrackingDiagnostics | null;
  now?: Date;
}

export const platformPublishingStatusMaxAgeMinutes = 10;

export const createStreamStartPreflightReport = ({
  readiness,
  streamStatus,
  enginePlatform = null,
  operationStatus = null,
  profile,
  validation = null,
  chatReader = null,
  platformChatAuth = null,
  platformChatOAuthCredentials = null,
  platformChatOAuthCredential = null,
  platformChatConnection = null,
  audioRoute = null,
  faceTracking = null,
  now = new Date()
}: StreamStartPreflightInput): StreamStartPreflightReport => {
  const issues = [
    ...readiness.issues
      .filter((issue) => !shouldReplaceReadinessFaceTrackingIssue(issue, faceTracking))
      .map((issue) => toPreflightIssue(issue, profile)),
    ...createFaceTrackingIssues(faceTracking),
    ...createBroadcastMixerIssues(profile),
    ...createAudioMonitorRouteIssues(profile, audioRoute),
    ...createChatReadoutIssues(profile, chatReader, platformChatAuth, platformChatOAuthCredentials, platformChatOAuthCredential, platformChatConnection, now),
    ...createCommercialValidationIssues(profile, validation),
    ...createPlatformPublishingIssues(profile, validation, now, platformChatOAuthCredentials, platformChatOAuthCredential),
    ...createEnginePlatformIssues(profile, enginePlatform),
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

const toPreflightIssue = (
  issue: ReadinessIssue,
  profile: StreamStartPreflightInput["profile"]
): StreamStartPreflightIssue => ({
  code: `readiness-${issue.code}`,
  severity: readinessSeverity(issue, profile),
  area: readinessArea(issue),
  label: readinessLabel(issue),
  message: issue.message,
  recommendation: readinessRecommendation(issue)
});

const shouldReplaceReadinessFaceTrackingIssue = (
  issue: ReadinessIssue,
  faceTracking: FaceTrackingDiagnostics | null
): boolean => issue.field === "faceTracking" && faceTracking !== null;

const createFaceTrackingIssues = (
  faceTracking: FaceTrackingDiagnostics | null
): StreamStartPreflightIssue[] => {
  if (!faceTracking || faceTracking.status === "pass") {
    return [];
  }

  if (faceTracking.status === "warn") {
    return [
      {
        code: "avatar-face-tracking-not-production-ready",
        severity: "warning",
        area: "avatar",
        label: "Avatar tracking",
        message: faceTracking.summary,
        recommendation: faceTracking.recommendation
      }
    ];
  }

  if (!faceTracking.enabled && faceTracking.visibleAvatarCount > 0) {
    return [
      {
        code: "avatar-face-tracking-disabled",
        severity: "warning",
        area: "avatar",
        label: "Avatar tracking",
        message: "A visible avatar source is in the scene, but face tracking is disabled.",
        recommendation: faceTracking.recommendation
      }
    ];
  }

  return [];
};

const readinessSeverity = (
  issue: ReadinessIssue,
  profile: StreamStartPreflightInput["profile"]
): StreamStartPreflightSeverity => {
  if (issue.severity === "error") {
    return "block";
  }
  if (isReleaseCriticalSceneReadinessIssue(issue) && isPlatformVisibleProductionTarget(profile)) {
    return "block";
  }
  return "warning";
};

const isReleaseCriticalSceneReadinessIssue = (issue: ReadinessIssue): boolean =>
  issue.code === "scene-live2d-preview" ||
  issue.code === "scene-native-composition-preview-only-overlays" ||
  issue.code === "scene-native-composition-native-overlays" ||
  issue.code === "scene-native-composition-no-screen-capture";

const isPlatformVisibleProductionTarget = (profile: StreamStartPreflightInput["profile"]): boolean => {
  if (!profile) {
    return false;
  }
  if (profile.destination.platform === "twitch") {
    return true;
  }
  return profile.destination.platform === "youtube-live" && profile.platformPublishing.privacyStatus === "public";
};

const isNativeEnginePlatform = (enginePlatform: string | null | undefined): boolean =>
  enginePlatform === "ios" || enginePlatform === "android";

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
  if (issue.code === "scene-live2d-preview") {
    return "Use a prepared PNGTuber source for platform-visible production streams until native Live2D Cubism rendering is integrated and validated.";
  }
  if (issue.code === "scene-native-composition-native-overlays") {
    return "Prepare PNGTuber and image assets with the mobile asset picker so iOS ReplayKit can load App Group file URLs before public or Twitch launch.";
  }
  if (issue.code === "scene-native-composition-preview-only-overlays") {
    return "Keep release-critical output to supported overlays above the screen source, and remove preview-only underlays or unsupported sources before public or Twitch launch.";
  }
  if (issue.code === "scene-native-composition-no-screen-capture") {
    return "Enable a screen source and confirm the native compositor output before public or Twitch launch.";
  }
  if (issue.code === "scene-chat-overlay-background-opaque") {
    return "Keep chat overlay background opacity at 0 for transparent comment overlays unless an intentional lower-third design has been validated on device.";
  }
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

const createEnginePlatformIssues = (
  profile: StreamStartPreflightInput["profile"],
  enginePlatform: StreamStartPreflightInput["enginePlatform"]
): StreamStartPreflightIssue[] => {
  if (!isPlatformVisibleProductionTarget(profile) || enginePlatform === null || enginePlatform === undefined) {
    return [];
  }

  if (isNativeEnginePlatform(enginePlatform)) {
    return [];
  }

  return [
    {
      code: "engine-native-required",
      severity: "block",
      area: "engine",
      label: "Native engine",
      message: `Native streaming engine is required for platform-visible streams, but current engine platform is ${enginePlatform}.`,
      recommendation: "Run the iOS or Android app with the native LiveCaster module linked before starting YouTube Public or Twitch streams."
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
  platformChatOAuthCredentials: StreamStartPreflightInput["platformChatOAuthCredentials"],
  platformChatOAuthCredential: StreamStartPreflightInput["platformChatOAuthCredential"]
): StreamStartPreflightIssue[] => {
  if (!profile) {
    return [];
  }

  if (profile.destination.platform === "youtube-live") {
    return createYouTubePublishingIssues(profile, validation, now, platformChatOAuthCredentials, platformChatOAuthCredential);
  }

  if (profile.destination.platform === "twitch") {
    return createTwitchPublishingIssues(profile, now, platformChatOAuthCredentials, platformChatOAuthCredential);
  }

  return [];
};

const createYouTubePublishingIssues = (
  profile: NonNullable<StreamStartPreflightInput["profile"]>,
  validation: StreamStartPreflightInput["validation"],
  now: Date,
  platformChatOAuthCredentials: StreamStartPreflightInput["platformChatOAuthCredentials"],
  platformChatOAuthCredential: StreamStartPreflightInput["platformChatOAuthCredential"]
): StreamStartPreflightIssue[] => {
  const settings = profile.platformPublishing;
  const issues: StreamStartPreflightIssue[] = [];
  const privacyMismatchIssue = createYouTubeBroadcastPrivacyMismatchIssue(profile);
  if (privacyMismatchIssue) {
    issues.push(privacyMismatchIssue);
  }
  const boundStreamMismatchIssue = createYouTubeBoundStreamMismatchIssue(profile);
  if (boundStreamMismatchIssue) {
    issues.push(boundStreamMismatchIssue);
  }

  const visibilityRequiresManagedBroadcast = settings.privacyStatus !== "private" && validation?.status === "ready";
  if (!visibilityRequiresManagedBroadcast) {
    return issues;
  }

  const oauthIssue = createOAuthScopeIssue({
    credential: resolvePreflightCredential(platformChatOAuthCredentials, platformChatOAuthCredential, "youtube"),
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

const createYouTubeBroadcastPrivacyMismatchIssue = (
  profile: NonNullable<StreamStartPreflightInput["profile"]>
): StreamStartPreflightIssue | null => {
  const settings = profile.platformPublishing;
  if (!settings.youtubeBroadcastId.trim() || !settings.youtubeBroadcastPrivacyStatus) {
    return null;
  }

  if (settings.youtubeBroadcastPrivacyStatus === settings.privacyStatus) {
    return null;
  }

  return {
    code: "publishing-youtube-privacy-mismatch",
    severity: "block",
    area: "publishing",
    label: "YouTube privacy",
    message: `YouTube broadcast privacy is ${settings.youtubeBroadcastPrivacyStatus}, but the app is configured for ${settings.privacyStatus}.`,
    recommendation: "Refresh or recreate the YouTube broadcast so the dashboard privacy matches the app setting before starting."
  };
};

const createYouTubeBoundStreamMismatchIssue = (
  profile: NonNullable<StreamStartPreflightInput["profile"]>
): StreamStartPreflightIssue | null => {
  const settings = profile.platformPublishing;
  if (!settings.youtubeBroadcastId.trim() || !settings.youtubeStreamId.trim() || !settings.youtubeBroadcastBoundStreamId.trim()) {
    return null;
  }

  if (settings.youtubeBroadcastBoundStreamId === settings.youtubeStreamId) {
    return null;
  }

  return {
    code: "publishing-youtube-bound-stream-mismatch",
    severity: "block",
    area: "publishing",
    label: "YouTube stream binding",
    message: `YouTube broadcast is bound to stream ${settings.youtubeBroadcastBoundStreamId}, but the app stream key is for ${settings.youtubeStreamId}.`,
    recommendation: "Recreate or rebind the YouTube broadcast after syncing the stream key so the broadcast uses the same stream ID before starting."
  };
};

const createTwitchPublishingIssues = (
  profile: NonNullable<StreamStartPreflightInput["profile"]>,
  now: Date,
  platformChatOAuthCredentials: StreamStartPreflightInput["platformChatOAuthCredentials"],
  platformChatOAuthCredential: StreamStartPreflightInput["platformChatOAuthCredential"]
): StreamStartPreflightIssue[] => {
  const freshnessIssue = createStatusFreshnessIssue("twitch", profile.platformPublishing.twitchStatusCheckedAt, now);
  const issues: StreamStartPreflightIssue[] = createTwitchMetadataMismatchIssues(profile);
  const oauthIssue = createOAuthScopeIssue({
    credential: resolvePreflightCredential(platformChatOAuthCredentials, platformChatOAuthCredential, "twitch"),
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

const createTwitchMetadataMismatchIssues = (
  profile: NonNullable<StreamStartPreflightInput["profile"]>
): StreamStartPreflightIssue[] => {
  const settings = profile.platformPublishing;
  const issues: StreamStartPreflightIssue[] = [];
  const appTitle = normalizeTwitchDisplayValue(settings.title);
  const channelTitle = normalizeTwitchDisplayValue(settings.twitchChannelTitle);
  const appCategory = normalizeTwitchComparableValue(settings.twitchCategory);
  const channelCategory = normalizeTwitchComparableValue(settings.twitchChannelCategory);
  const appCategoryId = normalizeTwitchComparableValue(settings.twitchCategoryId);
  const channelCategoryId = normalizeTwitchComparableValue(settings.twitchChannelCategoryId);
  const appLanguage = normalizeTwitchComparableValue(settings.twitchLanguage);
  const channelLanguage = normalizeTwitchComparableValue(settings.twitchChannelLanguage);
  const hasMetadataSnapshot = Boolean(
    settings.twitchStatusCheckedAt.trim() ||
      channelTitle ||
      channelCategory ||
      channelCategoryId ||
      channelLanguage
  );
  const categoryIdMismatch = Boolean(
    hasMetadataSnapshot && appCategoryId && (!channelCategoryId || channelCategoryId !== appCategoryId)
  );
  const matchingCategoryIds = Boolean(channelCategoryId && appCategoryId && channelCategoryId === appCategoryId);
  const categoryNameMismatch = Boolean(
    hasMetadataSnapshot && !categoryIdMismatch && !matchingCategoryIds && appCategory && channelCategory !== appCategory
  );

  if (hasMetadataSnapshot && appTitle && channelTitle !== appTitle) {
    issues.push({
      code: "publishing-twitch-title-mismatch",
      severity: "block",
      area: "publishing",
      label: "Twitch title",
      message: `Twitch dashboard title is "${settings.twitchChannelTitle}", but the app is configured for "${settings.title}".`,
      recommendation: "Apply Twitch metadata or update the app title so both match before starting."
    });
  }

  if (categoryIdMismatch || categoryNameMismatch) {
    issues.push({
      code: "publishing-twitch-category-mismatch",
      severity: "block",
      area: "publishing",
      label: "Twitch category",
      message: `Twitch dashboard category is ${formatTwitchCategoryForMessage(settings.twitchChannelCategory, settings.twitchChannelCategoryId)}, but the app is configured for ${formatTwitchCategoryForMessage(settings.twitchCategory, settings.twitchCategoryId)}.`,
      recommendation: "Apply Twitch metadata or refresh the dashboard status after changing the category."
    });
  }

  if (hasMetadataSnapshot && appLanguage && channelLanguage !== appLanguage) {
    issues.push({
      code: "publishing-twitch-language-mismatch",
      severity: "block",
      area: "publishing",
      label: "Twitch language",
      message: `Twitch dashboard language is ${settings.twitchChannelLanguage}, but the app is configured for ${settings.twitchLanguage}.`,
      recommendation: "Apply Twitch metadata or update the app language so both match before starting."
    });
  }

  return issues;
};

const normalizeTwitchDisplayValue = (value: string): string => value.trim().replace(/\s+/g, " ");

const normalizeTwitchComparableValue = (value: string): string => normalizeTwitchDisplayValue(value).toLowerCase();

const formatTwitchCategoryForMessage = (category: string, categoryId: string): string =>
  `${category || "unknown"}${categoryId ? ` (${categoryId})` : ""}`;

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

const createBroadcastMixerIssues = (profile: StreamStartPreflightInput["profile"]): StreamStartPreflightIssue[] => {
  if (!profile?.broadcastMixer) {
    return [];
  }

  const { broadcastMixer } = profile;
  const micLive = !broadcastMixer.mic.muted && broadcastMixer.mic.volume > 0;
  const appLive = !broadcastMixer.appAudio.muted && broadcastMixer.appAudio.volume > 0;
  const chatLive = !broadcastMixer.chatReadout.muted && broadcastMixer.chatReadout.volume > 0;
  const summary = formatBroadcastMixerSummary(broadcastMixer);

  if (!micLive && !appLive && !chatLive) {
    return [
      {
        code: "broadcast-mixer-silent",
        severity: "block",
        area: "audio",
        label: "Broadcast mixer",
        message: `All broadcast audio channels are muted or set to zero. ${summary}`,
        recommendation: "Unmute at least one broadcast audio channel before starting."
      }
    ];
  }

  if (!micLive) {
    return [
      {
        code: "broadcast-mixer-mic-muted",
        severity: "warning",
        area: "audio",
        label: "Broadcast mixer",
        message: `The mic channel is muted or set to zero in the broadcast mix. ${summary}`,
        recommendation: "Unmute the mic channel if the stream should include your voice."
      }
    ];
  }

  return [];
};

const formatBroadcastMixerSummary = (mixer: StudioProfile["broadcastMixer"]): string =>
  broadcastMixerChannels
    .map((channel) => {
      const settings = mixer[channel.id];
      const level = settings.muted || settings.volume <= 0 ? "muted" : `${Math.round(settings.volume * 100)}%`;
      return `${channel.shortLabel} ${level}`;
    })
    .join(" / ");

const createChatReadoutIssues = (
  profile: StreamStartPreflightInput["profile"],
  chatReader: StreamStartPreflightInput["chatReader"],
  platformChatAuth: StreamStartPreflightInput["platformChatAuth"],
  platformChatOAuthCredentials: StreamStartPreflightInput["platformChatOAuthCredentials"],
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

  const issues: StreamStartPreflightIssue[] = [];
  if (chatReader.redactUrls === false) {
    issues.push({
      code: "chat-reader-url-redaction-disabled",
      severity: "warning",
      area: "chat",
      label: "Chat safety",
      message: "Chat readout URL redaction is turned off.",
      recommendation: "Turn URL redaction on before public streams so spoken comments do not read unsafe or private links aloud."
    });
  }
  if (chatReader.skipCommandMessages === false) {
    issues.push({
      code: "chat-reader-command-skip-disabled",
      severity: "warning",
      area: "chat",
      label: "Chat safety",
      message: "Chat command skipping is turned off.",
      recommendation: "Turn command skipping on before public streams so bot commands and giveaway entries are not spoken aloud."
    });
  }
  if (chatReader.moderationEnabled === false) {
    issues.push({
      code: "chat-reader-moderation-disabled",
      severity: "warning",
      area: "chat",
      label: "Chat safety",
      message: "Chat moderation filtering is turned off.",
      recommendation: "Turn moderation filtering on before public streams so spam bursts are kept out of readout and overlays."
    });
  }
  if (chatReader.blockExcessiveCaps === false) {
    issues.push({
      code: "chat-reader-caps-filter-disabled",
      severity: "warning",
      area: "chat",
      label: "Chat safety",
      message: "Excessive-caps chat filtering is turned off.",
      recommendation: "Turn excessive-caps filtering on before public streams so shouty spam is not spoken aloud or shown on the overlay."
    });
  }
  if (chatReader.maxMessagesPerAuthorPerMinute && chatReader.maxMessagesPerAuthorPerMinute > 12) {
    issues.push({
      code: "chat-reader-author-rate-limit-loose",
      severity: "warning",
      area: "chat",
      label: "Chat safety",
      message: `Per-viewer chat rate limit is loose at ${chatReader.maxMessagesPerAuthorPerMinute} messages per minute.`,
      recommendation: "Use a per-viewer limit of 12 messages per minute or lower before public streams."
    });
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
      ...issues,
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

  const oauthIssue = createOAuthScopeIssue({
    credential: resolvePreflightCredential(platformChatOAuthCredentials, platformChatOAuthCredential, profile.platformChat.platform),
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

const resolvePreflightCredential = (
  store: StreamStartPreflightInput["platformChatOAuthCredentials"],
  singleCredential: StreamStartPreflightInput["platformChatOAuthCredential"],
  platform: PlatformChatOAuthCredential["platform"]
): PlatformChatOAuthCredential | null => {
  const storedCredential = store ? getPlatformChatOAuthCredential(store, platform) : null;
  if (storedCredential) {
    return storedCredential;
  }
  return singleCredential?.platform === platform ? singleCredential : null;
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
