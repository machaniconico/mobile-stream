import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile, type StudioProfile } from "./profiles";
import {
  createYouTubeBroadcastTransitionPreflightReport,
  formatPlatformPublishingPreflightBlockMessage
} from "./platformPublishingPreflight";

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
