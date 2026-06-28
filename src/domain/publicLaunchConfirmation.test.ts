import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile } from "./profiles";
import {
  createPublicLaunchConfirmation,
  formatPublicLaunchConfirmationCancelMessage,
  formatPublicLaunchConfirmationEventMessage
} from "./publicLaunchConfirmation";
import type { PublicLaunchChecklist } from "./publicLaunchChecklist";

const readyChecklist: Pick<PublicLaunchChecklist, "canStart" | "status"> = {
  canStart: true,
  status: "ready"
};

describe("publicLaunchConfirmation", () => {
  it("requires explicit confirmation for YouTube Public starts", () => {
    const profile = createDefaultStudioProfile();
    profile.destination.platform = "youtube-live";
    profile.platformPublishing.privacyStatus = "public";

    const confirmation = createPublicLaunchConfirmation(profile, readyChecklist);

    expect(confirmation).toMatchObject({
      required: true,
      platformLabel: "YouTube Public",
      confirmationLabel: "Start YouTube Public"
    });
    expect(confirmation?.message).toContain("may notify viewers");
    expect(confirmation?.message).toContain("Privacy Shield");
  });

  it("requires explicit confirmation for Twitch starts", () => {
    const profile = createDefaultStudioProfile();
    profile.destination.platform = "twitch";
    profile.platformPublishing.privacyStatus = "private";

    expect(createPublicLaunchConfirmation(profile, readyChecklist)).toMatchObject({
      platformLabel: "Twitch",
      confirmationLabel: "Start Twitch"
    });
  });

  it("does not prompt for private, unlisted, custom, or blocked starts", () => {
    const profile = createDefaultStudioProfile();
    profile.destination.platform = "youtube-live";
    profile.platformPublishing.privacyStatus = "unlisted";

    expect(createPublicLaunchConfirmation(profile, readyChecklist)).toBeNull();

    profile.platformPublishing.privacyStatus = "private";
    expect(createPublicLaunchConfirmation(profile, readyChecklist)).toBeNull();

    profile.destination.platform = "custom";
    expect(createPublicLaunchConfirmation(profile, readyChecklist)).toBeNull();

    profile.destination.platform = "youtube-live";
    profile.platformPublishing.privacyStatus = "public";
    expect(createPublicLaunchConfirmation(profile, { canStart: false, status: "blocked" })).toBeNull();
  });

  it("formats audit messages without sensitive values", () => {
    const confirmation = {
      platformLabel: "YouTube Public"
    };

    expect(formatPublicLaunchConfirmationEventMessage(confirmation)).toBe(
      "YouTube Public launch confirmation was accepted by the operator."
    );
    expect(formatPublicLaunchConfirmationCancelMessage(confirmation)).toBe(
      "YouTube Public launch confirmation was cancelled by the operator."
    );
  });
});
