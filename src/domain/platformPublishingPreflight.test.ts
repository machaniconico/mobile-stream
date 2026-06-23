import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile, type StudioProfile } from "./profiles";
import {
  createYouTubeBroadcastTransitionPreflightReport,
  formatPlatformPublishingPreflightBlockMessage
} from "./platformPublishingPreflight";

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
      }
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
      }
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
      }
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
      streamStatus: "live"
    });

    expect(report.canProceed).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toContain("youtube-transition-testing-health-unknown");
  });

  it("blocks complete transition while the local encoder is still active", () => {
    const report = createYouTubeBroadcastTransitionPreflightReport({
      profile: youtubeProfile({ youtubeBroadcastStatus: "live" }),
      transitionStatus: "complete",
      streamStatus: "live"
    });

    expect(report.canProceed).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toContain("youtube-transition-complete-local-active");
  });
});
