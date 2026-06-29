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
    profile.destination.streamKey = "yt-secret-stream-key";
    profile.platformPublishing.privacyStatus = "public";
    profile.platformPublishing.youtubeBroadcastId = "broadcast-id";
    profile.platformPublishing.youtubeStreamId = "stream-id";
    profile.platformPublishing.youtubeBroadcastPrivacyStatus = "public";
    profile.platformPublishing.youtubeBroadcastStatus = "testing";

    const confirmation = createPublicLaunchConfirmation(profile, readyChecklist);

    expect(confirmation).toMatchObject({
      required: true,
      platformLabel: "YouTube Public",
      confirmationLabel: "Start YouTube Public"
    });
    expect(confirmation?.message).toContain("may notify viewers");
    expect(confirmation?.message).toContain("Privacy Shield");
    expect(confirmation?.message).toContain("Target: YouTube Live, app privacy public");
    expect(confirmation?.message).toContain("broadcast selected");
    expect(confirmation?.message).not.toContain("yt-secret-stream-key");
  });

  it("requires explicit confirmation for Twitch starts", () => {
    const profile = createDefaultStudioProfile();
    profile.destination.platform = "twitch";
    profile.destination.name = "Twitch Auto";
    profile.destination.streamKey = "twitch-secret-stream-key";
    profile.platformPublishing.privacyStatus = "private";
    profile.platformPublishing.twitchCategory = "Just Chatting";
    profile.platformPublishing.twitchCategoryId = "509658";
    profile.platformPublishing.twitchLiveStatus = "offline";

    const confirmation = createPublicLaunchConfirmation(profile, readyChecklist);

    expect(confirmation).toMatchObject({
      platformLabel: "Twitch",
      confirmationLabel: "Start Twitch"
    });
    expect(confirmation?.message).toContain("Target: Twitch Auto, category Just Chatting");
    expect(confirmation?.message).toContain("category ID selected");
    expect(confirmation?.message).not.toContain("twitch-secret-stream-key");
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

  it("formats confirmation audit messages with target and checklist evidence", () => {
    const profile = createDefaultStudioProfile();
    profile.destination.platform = "youtube-live";
    profile.destination.streamKey = "secret-stream-key";
    profile.platformPublishing.privacyStatus = "public";
    profile.platformPublishing.youtubeBroadcastId = "broadcast-id";
    profile.platformPublishing.youtubeStreamId = "stream-id";
    profile.platformPublishing.youtubeBroadcastPrivacyStatus = "public";
    profile.platformPublishing.youtubeBroadcastStatus = "ready";

    const confirmation = createPublicLaunchConfirmation(profile, {
      canStart: true,
      status: "ready",
      passCount: 7,
      warningCount: 0,
      failCount: 0,
      summary: "7 public launch checks passed."
    });

    expect(formatPublicLaunchConfirmationEventMessage(confirmation!)).toBe(
      "YouTube Public launch confirmation was accepted by the operator. Target: YouTube Live, app privacy public, dashboard privacy public, broadcast selected, stream selected, broadcast status ready. Checklist: 7 pass / 0 warn / 0 fail, 7 public launch checks passed."
    );
    expect(formatPublicLaunchConfirmationCancelMessage(confirmation!)).not.toContain("secret-stream-key");
  });
});
