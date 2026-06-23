import type { YouTubeBroadcastTransitionStatus } from "./platformPublishing";
import {
  assessPlatformChatOAuthCredentialHealth,
  getPlatformChatOAuthCredential,
  YOUTUBE_LIVE_MANAGE_SCOPE,
  type PlatformChatOAuthCredential,
  type PlatformChatOAuthCredentialStore
} from "./platformChatOAuth";
import type { StudioProfile } from "./profiles";
import type { PublicLaunchChecklist } from "./publicLaunchChecklist";
import type { StreamStatus } from "./streamState";
import type { StreamValidationChecklist } from "./streamValidationChecklist";

export type PlatformPublishingPreflightStatus = "ready" | "warning" | "blocked";
export type PlatformPublishingPreflightSeverity = "block" | "warning";

export interface PlatformPublishingPreflightIssue {
  code: string;
  severity: PlatformPublishingPreflightSeverity;
  label: string;
  message: string;
  recommendation: string;
}

export interface PlatformPublishingPreflightReport {
  canProceed: boolean;
  status: PlatformPublishingPreflightStatus;
  summary: string;
  primaryAction: string;
  blocks: PlatformPublishingPreflightIssue[];
  warnings: PlatformPublishingPreflightIssue[];
  issues: PlatformPublishingPreflightIssue[];
}

export interface YouTubeBroadcastTransitionPreflightInput {
  profile: Pick<StudioProfile, "destination" | "platformPublishing">;
  transitionStatus: YouTubeBroadcastTransitionStatus;
  streamStatus: StreamStatus;
  validation?: Pick<StreamValidationChecklist, "status" | "recommendedNextStep"> | null;
  publicLaunchChecklist?: PublicLaunchChecklist | null;
  platformChatOAuthCredentials?: PlatformChatOAuthCredentialStore | null;
  platformChatOAuthCredential?: PlatformChatOAuthCredential | null;
  now?: Date;
}

export const youtubeBroadcastTransitionStatusMaxAgeMinutes = 10;

export const createYouTubeBroadcastTransitionPreflightReport = ({
  profile,
  transitionStatus,
  streamStatus,
  validation = null,
  publicLaunchChecklist = null,
  platformChatOAuthCredentials = null,
  platformChatOAuthCredential = null,
  now = new Date()
}: YouTubeBroadcastTransitionPreflightInput): PlatformPublishingPreflightReport => {
  const issues = createYouTubeBroadcastTransitionIssues(
    profile,
    transitionStatus,
    streamStatus,
    validation,
    publicLaunchChecklist,
    platformChatOAuthCredentials,
    platformChatOAuthCredential,
    now
  );
  const blocks = issues.filter((issue) => issue.severity === "block");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const status: PlatformPublishingPreflightStatus = blocks.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready";

  return {
    canProceed: blocks.length === 0,
    status,
    summary: createSummary(status, transitionStatus, blocks.length, warnings.length),
    primaryAction: createPrimaryAction(status, blocks, warnings, transitionStatus),
    blocks,
    warnings,
    issues
  };
};

export const formatPlatformPublishingPreflightBlockMessage = (report: PlatformPublishingPreflightReport): string => {
  if (report.canProceed) {
    return "Platform publishing preflight passed.";
  }

  const visibleBlocks = report.blocks.slice(0, 3).map((issue) => issue.message);
  const remainingCount = report.blocks.length - visibleBlocks.length;
  const suffix = remainingCount > 0 ? ` (+${remainingCount} more)` : "";
  return `Platform publishing preflight blocked: ${visibleBlocks.join("; ")}${suffix}`;
};

const createYouTubeBroadcastTransitionIssues = (
  profile: YouTubeBroadcastTransitionPreflightInput["profile"],
  transitionStatus: YouTubeBroadcastTransitionStatus,
  streamStatus: StreamStatus,
  validation: YouTubeBroadcastTransitionPreflightInput["validation"],
  publicLaunchChecklist: YouTubeBroadcastTransitionPreflightInput["publicLaunchChecklist"],
  platformChatOAuthCredentials: YouTubeBroadcastTransitionPreflightInput["platformChatOAuthCredentials"],
  platformChatOAuthCredential: YouTubeBroadcastTransitionPreflightInput["platformChatOAuthCredential"],
  now: Date
): PlatformPublishingPreflightIssue[] => {
  const settings = profile.platformPublishing;
  const broadcastStatus = settings.youtubeBroadcastStatus.trim().toLowerCase();
  const streamHealthStatus = settings.youtubeStreamHealthStatus.trim().toLowerCase();
  const issues: PlatformPublishingPreflightIssue[] = [];

  if (profile.destination.platform !== "youtube-live") {
    return [
      {
        code: "youtube-transition-wrong-destination",
        severity: "block",
        label: "Destination",
        message: "YouTube broadcast transitions require a YouTube Live destination.",
        recommendation: "Switch the destination to YouTube Live before changing broadcast lifecycle state."
      }
    ];
  }

  const oauthIssue = createYouTubeTransitionOAuthIssue(
    resolveYouTubeTransitionCredential(platformChatOAuthCredentials, platformChatOAuthCredential),
    now
  );
  if (oauthIssue) {
    issues.push(oauthIssue);
  }

  if (!settings.youtubeBroadcastId.trim()) {
    issues.push({
      code: "youtube-transition-missing-broadcast",
      severity: "block",
      label: "Broadcast",
      message: "No YouTube broadcast is selected.",
      recommendation: "Create and bind a YouTube broadcast before changing lifecycle state."
    });
  }

  if ((transitionStatus === "testing" || transitionStatus === "live") && !settings.youtubeStreamId.trim()) {
    issues.push({
      code: "youtube-transition-missing-stream",
      severity: "block",
      label: "Stream",
      message: "No YouTube live stream is bound to this broadcast.",
      recommendation: "Create or sync a YouTube stream key, then create a bound broadcast."
    });
  }

  if (transitionStatus === "testing") {
    issues.push(...createYouTubeStatusFreshnessIssues(settings.youtubeStatusCheckedAt, now, "warning"));
    issues.push(...createTestingTransitionIssues(broadcastStatus, streamHealthStatus, settings.youtubeStreamHealthIssues.length));
  }

  if (transitionStatus === "live") {
    issues.push(...createYouTubeStatusFreshnessIssues(settings.youtubeStatusCheckedAt, now, "block"));
    issues.push(
      ...createLiveTransitionIssues(
        profile,
        broadcastStatus,
        settings.youtubeStreamStatus.trim().toLowerCase(),
        streamHealthStatus,
        settings.youtubeStreamHealthIssues.length,
        streamStatus,
        validation,
        publicLaunchChecklist
      )
    );
  }

  if (transitionStatus === "complete") {
    issues.push(...createYouTubeStatusFreshnessIssues(settings.youtubeStatusCheckedAt, now, "warning"));
    issues.push(...createCompleteTransitionIssues(broadcastStatus, streamStatus));
  }

  return issues;
};

const resolveYouTubeTransitionCredential = (
  store: YouTubeBroadcastTransitionPreflightInput["platformChatOAuthCredentials"],
  singleCredential: YouTubeBroadcastTransitionPreflightInput["platformChatOAuthCredential"]
): PlatformChatOAuthCredential | null => {
  const storedCredential = store ? getPlatformChatOAuthCredential(store, "youtube") : null;
  if (storedCredential) {
    return storedCredential;
  }
  return singleCredential?.platform === "youtube" ? singleCredential : null;
};

const createYouTubeTransitionOAuthIssue = (
  credential: YouTubeBroadcastTransitionPreflightInput["platformChatOAuthCredential"],
  now: Date
): PlatformPublishingPreflightIssue | null => {
  const health = assessPlatformChatOAuthCredentialHealth(credential, {
    platform: "youtube",
    requiredScopes: [YOUTUBE_LIVE_MANAGE_SCOPE],
    purposeLabel: "YouTube broadcast lifecycle control",
    now: now.getTime(),
    missingCredentialSeverity: "fail",
    unknownScopesSeverity: "fail"
  });
  if (health.status === "ready") {
    return null;
  }

  return {
    code: `youtube-transition-oauth-${health.status}`,
    severity: health.severity === "fail" ? "block" : "warning",
    label: "YouTube OAuth",
    message: health.message,
    recommendation: health.recommendation
  };
};

const createYouTubeStatusFreshnessIssues = (
  checkedAt: string,
  now: Date,
  staleSeverity: PlatformPublishingPreflightSeverity
): PlatformPublishingPreflightIssue[] => {
  if (!checkedAt.trim()) {
    return [
      {
        code: "youtube-transition-status-unchecked",
        severity: staleSeverity,
        label: "Status",
        message: "YouTube broadcast and ingest status have not been refreshed in this profile.",
        recommendation: "Refresh YouTube status before changing the broadcast lifecycle state."
      }
    ];
  }

  const checkedTimestamp = Date.parse(checkedAt);
  const nowTimestamp = now.getTime();
  if (!Number.isFinite(checkedTimestamp) || !Number.isFinite(nowTimestamp)) {
    return [
      {
        code: "youtube-transition-status-invalid",
        severity: staleSeverity,
        label: "Status",
        message: "YouTube status timestamp is invalid.",
        recommendation: "Refresh YouTube status before changing the broadcast lifecycle state."
      }
    ];
  }

  const ageMinutes = Math.floor(Math.max(0, nowTimestamp - checkedTimestamp) / 60000);
  if (ageMinutes <= youtubeBroadcastTransitionStatusMaxAgeMinutes) {
    return [];
  }

  return [
    {
      code: "youtube-transition-status-stale",
      severity: staleSeverity,
      label: "Status",
      message: `YouTube broadcast and ingest status are ${ageMinutes} minutes old.`,
      recommendation: `Refresh YouTube status within ${youtubeBroadcastTransitionStatusMaxAgeMinutes} minutes of changing broadcast lifecycle state.`
    }
  ];
};

const createTestingTransitionIssues = (
  broadcastStatus: string,
  streamHealthStatus: string,
  healthIssueCount: number
): PlatformPublishingPreflightIssue[] => {
  const issues: PlatformPublishingPreflightIssue[] = [];
  if (broadcastStatus === "complete") {
    issues.push({
      code: "youtube-transition-testing-after-complete",
      severity: "block",
      label: "Broadcast",
      message: "This YouTube broadcast is already complete.",
      recommendation: "Create a new broadcast before running another test transition."
    });
  }
  if (broadcastStatus === "live") {
    issues.push({
      code: "youtube-transition-testing-while-live",
      severity: "block",
      label: "Broadcast",
      message: "This YouTube broadcast is already live.",
      recommendation: "Use Complete when you are ready to end the live broadcast."
    });
  }
  if (!streamHealthStatus || streamHealthStatus === "unknown") {
    issues.push({
      code: "youtube-transition-testing-health-unknown",
      severity: "warning",
      label: "Health",
      message: "YouTube ingest health has not been refreshed yet.",
      recommendation: "Refresh YouTube status after starting the encoder so the monitor stream health is visible."
    });
  } else if (!isHealthyYouTubeIngest(streamHealthStatus) || healthIssueCount > 0) {
    issues.push({
      code: "youtube-transition-testing-health-warning",
      severity: "warning",
      label: "Health",
      message: "YouTube ingest health is reporting warnings.",
      recommendation: "Review the YouTube health issues before moving from test to live."
    });
  }
  return issues;
};

const createLiveTransitionIssues = (
  profile: YouTubeBroadcastTransitionPreflightInput["profile"],
  broadcastStatus: string,
  youtubeStreamStatus: string,
  streamHealthStatus: string,
  healthIssueCount: number,
  streamStatus: StreamStatus,
  validation: YouTubeBroadcastTransitionPreflightInput["validation"],
  publicLaunchChecklist: YouTubeBroadcastTransitionPreflightInput["publicLaunchChecklist"]
): PlatformPublishingPreflightIssue[] => {
  const issues: PlatformPublishingPreflightIssue[] = [];
  const validationReady = validation?.status === "ready";

  if (profile.platformPublishing.privacyStatus === "public" && !validationReady) {
    issues.push({
      code: "youtube-transition-live-public-validation",
      severity: "block",
      label: "Validation",
      message: "This public YouTube broadcast cannot go live until commercial validation is ready.",
      recommendation: validation?.recommendedNextStep ?? "Record fresh iOS and Android validation evidence before going public."
    });
  } else if (profile.platformPublishing.privacyStatus === "unlisted" && !validationReady) {
    issues.push({
      code: "youtube-transition-live-unlisted-validation",
      severity: "warning",
      label: "Validation",
      message: "This unlisted YouTube broadcast is not fully commercially validated.",
      recommendation: "Keep the stream controlled and avoid sharing it until commercial validation is ready."
    });
  }

  if (profile.platformPublishing.privacyStatus === "public") {
    issues.push(...createPublicVisibilityChecklistIssues(publicLaunchChecklist));
  }

  if (broadcastStatus !== "testing") {
    issues.push({
      code: "youtube-transition-live-needs-testing",
      severity: "block",
      label: "Broadcast",
      message: "YouTube Live transition requires the broadcast to be in testing first.",
      recommendation: "Move the broadcast to Test, confirm preview and ingest health, then go Live."
    });
  }

  if (streamStatus !== "live" && streamStatus !== "reconnecting") {
    issues.push({
      code: "youtube-transition-live-local-not-streaming",
      severity: "block",
      label: "Encoder",
      message: "The local encoder is not streaming to YouTube yet.",
      recommendation: "Press Go Live and wait for the local stream to become live before transitioning the YouTube broadcast."
    });
  }

  if (youtubeStreamStatus !== "active") {
    issues.push({
      code: "youtube-transition-live-ingest-inactive",
      severity: "block",
      label: "Ingest",
      message: "YouTube ingest is not active.",
      recommendation: "Refresh YouTube status after the encoder is live and wait for stream status to become active."
    });
  }

  if (!isHealthyYouTubeIngest(streamHealthStatus) || healthIssueCount > 0) {
    issues.push({
      code: "youtube-transition-live-health-not-ok",
      severity: "block",
      label: "Health",
      message: "YouTube ingest health is not clean enough for a live transition.",
      recommendation: "Resolve YouTube health warnings before transitioning the broadcast to live."
    });
  }

  return issues;
};

const publicVisibilityIgnoredItemIds = new Set(["engine"]);

const createPublicVisibilityChecklistIssues = (
  publicLaunchChecklist: YouTubeBroadcastTransitionPreflightInput["publicLaunchChecklist"]
): PlatformPublishingPreflightIssue[] => {
  if (!publicLaunchChecklist) {
    return [
      {
        code: "youtube-transition-live-public-checklist-missing",
        severity: "block",
        label: "Public checklist",
        message: "The public launch checklist was not available for this Live transition.",
        recommendation: "Refresh diagnostics and confirm the public launch checklist before making the broadcast visible."
      }
    ];
  }

  const failures = publicLaunchChecklist.items.filter(
    (item) => item.status === "fail" && !publicVisibilityIgnoredItemIds.has(item.id)
  );
  if (failures.length === 0) {
    return [];
  }

  const firstFailure = failures[0];
  return [
    {
      code: "youtube-transition-live-public-checklist-blocked",
      severity: "block",
      label: "Public checklist",
      message: `Public launch checklist still has ${failures.length} public visibility blocker${failures.length === 1 ? "" : "s"}: ${firstFailure.label}: ${firstFailure.detail}`,
      recommendation: firstFailure.action
    }
  ];
};

const createCompleteTransitionIssues = (broadcastStatus: string, streamStatus: StreamStatus): PlatformPublishingPreflightIssue[] => {
  const issues: PlatformPublishingPreflightIssue[] = [];
  if (broadcastStatus === "complete") {
    issues.push({
      code: "youtube-transition-already-complete",
      severity: "block",
      label: "Broadcast",
      message: "This YouTube broadcast is already complete.",
      recommendation: "Create a new broadcast for the next stream."
    });
  }
  if (streamStatus === "live" || streamStatus === "reconnecting" || streamStatus === "preparing") {
    issues.push({
      code: "youtube-transition-complete-local-active",
      severity: "block",
      label: "Encoder",
      message: "The local encoder is still active.",
      recommendation: "Stop the local stream before completing the YouTube broadcast."
    });
  }
  if (broadcastStatus !== "live" && broadcastStatus !== "testing") {
    issues.push({
      code: "youtube-transition-complete-status-unknown",
      severity: "warning",
      label: "Broadcast",
      message: "The current YouTube broadcast lifecycle state has not been confirmed as live or testing.",
      recommendation: "Refresh YouTube status before completing the broadcast."
    });
  }
  return issues;
};

const isHealthyYouTubeIngest = (status: string): boolean => status === "ok" || status === "good" || status === "excellent";

const createSummary = (
  status: PlatformPublishingPreflightStatus,
  transitionStatus: YouTubeBroadcastTransitionStatus,
  blockCount: number,
  warningCount: number
): string => {
  const label = transitionLabel(transitionStatus);
  if (status === "blocked") {
    return `${label} transition blocked by ${blockCount} issue${blockCount === 1 ? "" : "s"}.`;
  }
  if (status === "warning") {
    return `${label} transition has ${warningCount} warning${warningCount === 1 ? "" : "s"}.`;
  }
  return `${label} transition is ready.`;
};

const createPrimaryAction = (
  status: PlatformPublishingPreflightStatus,
  blocks: PlatformPublishingPreflightIssue[],
  warnings: PlatformPublishingPreflightIssue[],
  transitionStatus: YouTubeBroadcastTransitionStatus
): string => {
  if (status === "blocked") {
    return blocks[0]?.recommendation ?? "Resolve blocked YouTube lifecycle checks before continuing.";
  }
  if (status === "warning") {
    return warnings[0]?.recommendation ?? "Review YouTube lifecycle warnings before continuing.";
  }
  return `Proceed with ${transitionLabel(transitionStatus)} when the operator is ready.`;
};

const transitionLabel = (status: YouTubeBroadcastTransitionStatus): string =>
  status === "testing" ? "Test" : status === "live" ? "Live" : "Complete";
