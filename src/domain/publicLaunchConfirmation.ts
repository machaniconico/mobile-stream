import type { PublicLaunchChecklist } from "./publicLaunchChecklist";
import { shouldApplyPublicLaunchStartLock } from "./publicLaunchChecklist";
import type { StudioProfile } from "./profiles";

export interface PublicLaunchConfirmation {
  required: true;
  platformLabel: string;
  confirmationLabel: string;
  summary: string;
  targetSummary: string;
  checklistSummary: string;
  message: string;
}

type PublicLaunchConfirmationChecklist = Pick<PublicLaunchChecklist, "canStart" | "status"> &
  Partial<Pick<PublicLaunchChecklist, "passCount" | "warningCount" | "failCount" | "summary">>;

export const createPublicLaunchConfirmation = (
  profile: Pick<StudioProfile, "destination" | "platformPublishing">,
  checklist: PublicLaunchConfirmationChecklist | null
): PublicLaunchConfirmation | null => {
  if (!checklist?.canStart || !shouldApplyPublicLaunchStartLock(profile)) {
    return null;
  }

  const platformLabel = profile.destination.platform === "twitch" ? "Twitch" : "YouTube Public";
  const confirmationLabel = `Start ${platformLabel}`;
  const summary = `${platformLabel} is platform-visible and may notify viewers.`;
  const targetSummary = createTargetSummary(profile);
  const checklistSummary = createChecklistSummary(checklist);

  return {
    required: true,
    platformLabel,
    confirmationLabel,
    summary,
    targetSummary,
    checklistSummary,
    message: [
      `${summary}`,
      `Target: ${targetSummary}`,
      `Checklist: ${checklistSummary}`,
      "Confirm only after checking the platform dashboard, avatar tracking, mic monitor route, chat readout, and Privacy Shield access.",
      `Action: ${confirmationLabel}`
    ].join("\n\n")
  };
};

export const formatPublicLaunchConfirmationEventMessage = (
  confirmation: Pick<PublicLaunchConfirmation, "platformLabel"> &
    Partial<Pick<PublicLaunchConfirmation, "targetSummary" | "checklistSummary">>
): string =>
  [
    `${confirmation.platformLabel} launch confirmation was accepted by the operator.`,
    createAuditEvidenceFragment("Target", confirmation.targetSummary),
    createAuditEvidenceFragment("Checklist", confirmation.checklistSummary)
  ]
    .filter(Boolean)
    .join(" ");

export const formatPublicLaunchConfirmationCancelMessage = (
  confirmation: Pick<PublicLaunchConfirmation, "platformLabel"> &
    Partial<Pick<PublicLaunchConfirmation, "targetSummary" | "checklistSummary">>
): string =>
  [
    `${confirmation.platformLabel} launch confirmation was cancelled by the operator.`,
    createAuditEvidenceFragment("Target", confirmation.targetSummary),
    createAuditEvidenceFragment("Checklist", confirmation.checklistSummary)
  ]
    .filter(Boolean)
    .join(" ");

const createTargetSummary = (profile: Pick<StudioProfile, "destination" | "platformPublishing">): string => {
  const destinationName = normalizeAuditText(profile.destination.name) || "Unnamed destination";
  if (profile.destination.platform === "youtube-live") {
    const settings = profile.platformPublishing;
    const broadcastState = settings.youtubeBroadcastId.trim() ? "broadcast selected" : "broadcast missing";
    const streamState = settings.youtubeStreamId.trim() ? "stream selected" : "stream missing";
    const dashboardPrivacy = settings.youtubeBroadcastPrivacyStatus || "unknown";
    const dashboardStatus = normalizeAuditText(settings.youtubeBroadcastStatus) || "unknown";
    return `${destinationName}, app privacy ${settings.privacyStatus}, dashboard privacy ${dashboardPrivacy}, ${broadcastState}, ${streamState}, broadcast status ${dashboardStatus}`;
  }

  const settings = profile.platformPublishing;
  const category = normalizeAuditText(settings.twitchCategory) || "unknown category";
  const categoryIdState = settings.twitchCategoryId.trim() ? "category ID selected" : "category ID missing";
  const channelStatus = normalizeAuditText(settings.twitchLiveStatus) || "unknown";
  return `${destinationName}, category ${category}, ${categoryIdState}, channel status ${channelStatus}`;
};

const createChecklistSummary = (checklist: PublicLaunchConfirmationChecklist): string => {
  const countSummary =
    typeof checklist.passCount === "number" && typeof checklist.warningCount === "number" && typeof checklist.failCount === "number"
      ? `${checklist.passCount} pass / ${checklist.warningCount} warn / ${checklist.failCount} fail`
      : checklist.status;
  const summary = checklist.summary ? `, ${normalizeAuditText(checklist.summary)}` : "";
  return `${countSummary}${summary}`;
};

const normalizeAuditText = (value: string): string => value.trim().replace(/\s+/g, " ");

const createAuditEvidenceFragment = (label: string, value: string | undefined): string =>
  value ? `${label}: ${value.replace(/[.。]+$/u, "")}.` : "";
