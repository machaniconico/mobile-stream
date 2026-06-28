import type { PublicLaunchChecklist } from "./publicLaunchChecklist";
import { shouldApplyPublicLaunchStartLock } from "./publicLaunchChecklist";
import type { StudioProfile } from "./profiles";

export interface PublicLaunchConfirmation {
  required: true;
  platformLabel: string;
  confirmationLabel: string;
  summary: string;
  message: string;
}

export const createPublicLaunchConfirmation = (
  profile: Pick<StudioProfile, "destination" | "platformPublishing">,
  checklist: Pick<PublicLaunchChecklist, "canStart" | "status"> | null
): PublicLaunchConfirmation | null => {
  if (!checklist?.canStart || !shouldApplyPublicLaunchStartLock(profile)) {
    return null;
  }

  const platformLabel = profile.destination.platform === "twitch" ? "Twitch" : "YouTube Public";
  const confirmationLabel = `Start ${platformLabel}`;
  const summary = `${platformLabel} is platform-visible and may notify viewers.`;

  return {
    required: true,
    platformLabel,
    confirmationLabel,
    summary,
    message: [
      `${summary}`,
      "Confirm only after checking the platform dashboard, avatar tracking, mic monitor route, chat readout, and Privacy Shield access.",
      `Action: ${confirmationLabel}`
    ].join("\n\n")
  };
};

export const formatPublicLaunchConfirmationEventMessage = (
  confirmation: Pick<PublicLaunchConfirmation, "platformLabel">
): string => `${confirmation.platformLabel} launch confirmation was accepted by the operator.`;

export const formatPublicLaunchConfirmationCancelMessage = (
  confirmation: Pick<PublicLaunchConfirmation, "platformLabel">
): string => `${confirmation.platformLabel} launch confirmation was cancelled by the operator.`;
