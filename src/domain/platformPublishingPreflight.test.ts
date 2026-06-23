import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile, type StudioProfile } from "./profiles";
import {
  createYouTubeBroadcastTransitionPreflightReport,
  formatPlatformPublishingPreflightBlockMessage
} from "./platformPublishingPreflight";
import type { PublicLaunchChecklist } from "./publicLaunchChecklist";

const transitionNow = new Date("2026-06-23T00:05:00.000Z");

const youtubeProfile = (update: Partial<StudioProfile["platformPublishing"]> = {}): StudioProfile => ({
  ...createDefaultStudioProfile(),
  destination: {
    ...createDefaultStudioProfile().destination,
    streamKey: "stream-key"
  },
  platformPublishing: {
    ...createDefaultStudioProfile().platformPublishing,
    youtubeStreamId: "stream-id",
    youtubeBroadcastId: "broadcast-id",
    youtubeBroadcastStatus: "testing",
    youtubeStreamStatus: "active",
    youtubeStreamHealthStatus: "ok",
    youtubeStreamHealthIssues: [],
    youtubeStatusCheckedAt: "2026-06-23T00:00:00.000Z",
    ...update
  }
});

const publicLaunchChecklist = (
  items: PublicLaunchChecklist["items"] = []
): PublicLaunchChecklist => {
  const failCount = items.filter((item) => item.status === "fail").length;
  const warningCount = items.filter((item) => item.status === "warn").length;
  const passCount = items.filter((item) => item.status === "pass").length;
  const status = failCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "ready";
  return {
    canStart: failCount === 0,
    status,
    summary: status === "ready" ? "Public launch checklist is ready." : "Public launch checklist needs attention.",
    primaryAction: "Review public launch checklist.",
    startLock: {
      applies: true,
      blocked: failCount > 0,
      summary: failCount > 0 ? "Public start lock is active because launch blockers remain." : "Public start lock is clear.",
      action: "Review public launch checklist."
    },
    passCount,
    warningCount,
    failCount,
    items
  };
};

describe("platform publishing preflight", () => {
  it("allows a private YouTube live transition when encoder and ingest are ready", () => {
    const report = createYouTubeBroadcastTransitionPreflightReport({
      profile: youtubeProfile({ privacyStatus: "private" }),
      transitionStatus: "live",
      streamStatus: "live",
      validation: {
        status: "needs-test",
        recommendedNextStep: "Keep private validation controlled."
      },
      now: transitionNow
    });

    expect(report.canProceed).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.summary).toBe("Live transition is ready.");
  });

  it("blocks public live transition when the public launch checklist has visibility blockers", () => {
    const report = createYouTubeBroadcastTransitionPreflightReport({
      profile: youtubeProfile({ privacyStatus: "public" }),
      transitionStatus: "live",
      streamStatus: "live",
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation fresh."
      },
      publicLaunchChecklist: publicLaunchChecklist([
        {
          id: "chat-readout",
          status: "fail",
          label: "Chat readout",
          detail: "Platform chat is not connected.",
          action: "Connect YouTube Live chat before public launch."
        }
      ]),
      now: transitionNow
    });

    expect(report.canProceed).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toContain("youtube-transition-live-public-checklist-blocked");
    expect(formatPlatformPublishingPreflightBlockMessage(report)).toContain("Public launch checklist still has");
  });

  it("allows public live transition when only the public checklist engine item is blocked by the already-live encoder", () => {
    const report = createYouTubeBroadcastTransitionPreflightReport({
      profile: youtubeProfile({ privacyStatus: "public" }),
      transitionStatus: "live",
      streamStatus: "live",
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation fresh."
      },
      publicLaunchChecklist: publicLaunchChecklist([
        {
          id: "engine",
          status: "fail",
          label: "Engine state",
          detail: "A stream is already live.",
          action: "Use the transition preflight encoder checks."
        }
      ]),
      now: transitionNow
    });

    expect(report.canProceed).toBe(true);
    expect(report.blocks.map((issue) => issue.code)).not.toContain("youtube-transition-live-public-checklist-blocked");
  });

  it("blocks public YouTube live transition until validation is ready", () => {
    const report = createYouTubeBroadcastTransitionPreflightReport({
      profile: youtubeProfile({ privacyStatus: "public" }),
      transitionStatus: "live",
      streamStatus: "live",
      validation: {
        status: "needs-test",
        recommendedNextStep: "Record iOS and Android evidence."
      },
      now: transitionNow
    });

    expect(report.canProceed).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toContain("youtube-transition-live-public-validation");
    expect(formatPlatformPublishingPreflightBlockMessage(report)).toContain("public YouTube broadcast cannot go live");
  });

  it("blocks live transition until the local encoder is streaming and YouTube ingest is active", () => {
    const report = createYouTubeBroadcastTransitionPreflightReport({
      profile: youtubeProfile({
        youtubeBroadcastStatus: "ready",
        youtubeStreamStatus: "inactive",
        youtubeStreamHealthStatus: "unknown"
      }),
      transitionStatus: "live",
      streamStatus: "idle",
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation fresh."
      },
      now: transitionNow
    });

    expect(report.canProceed).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "youtube-transition-live-needs-testing",
        "youtube-transition-live-local-not-streaming",
        "youtube-transition-live-ingest-inactive",
        "youtube-transition-live-health-not-ok"
      ])
    );
  });

  it("warns on test transition when YouTube health has not been refreshed", () => {
    const report = createYouTubeBroadcastTransitionPreflightReport({
      profile: youtubeProfile({
        youtubeBroadcastStatus: "ready",
        youtubeStreamHealthStatus: ""
      }),
      transitionStatus: "testing",
      streamStatus: "live",
      now: transitionNow
    });

    expect(report.canProceed).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toContain("youtube-transition-testing-health-unknown");
  });

  it("blocks complete transition while the local encoder is still active", () => {
    const report = createYouTubeBroadcastTransitionPreflightReport({
      profile: youtubeProfile({ youtubeBroadcastStatus: "live" }),
      transitionStatus: "complete",
      streamStatus: "live",
      now: transitionNow
    });

    expect(report.canProceed).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toContain("youtube-transition-complete-local-active");
  });

  it("blocks live transition when the YouTube status snapshot is stale", () => {
    const report = createYouTubeBroadcastTransitionPreflightReport({
      profile: youtubeProfile({
        youtubeStatusCheckedAt: "2026-06-23T00:00:00.000Z"
      }),
      transitionStatus: "live",
      streamStatus: "live",
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation fresh."
      },
      now: new Date("2026-06-23T00:16:00.000Z")
    });

    expect(report.canProceed).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toContain("youtube-transition-status-stale");
    expect(formatPlatformPublishingPreflightBlockMessage(report)).toContain("YouTube broadcast and ingest status are 16 minutes old");
  });

  it("warns but allows test transition when the YouTube status snapshot is missing", () => {
    const report = createYouTubeBroadcastTransitionPreflightReport({
      profile: youtubeProfile({
        youtubeStatusCheckedAt: ""
      }),
      transitionStatus: "testing",
      streamStatus: "idle",
      now: transitionNow
    });

    expect(report.canProceed).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toContain("youtube-transition-status-unchecked");
  });
});
