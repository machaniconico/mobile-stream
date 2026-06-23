import { describe, expect, it } from "vitest";
import { createDefaultScene, setVisibility, type SceneDocument } from "./scene";
import { applyDestinationPreset, createDefaultStudioProfile, type StudioProfile } from "./profiles";
import { createReadinessReport } from "./readiness";
import {
  createStreamStartPreflightReport,
  formatStreamStartPreflightBlockMessage
} from "./streamStartPreflight";

const validReadiness = () =>
  createReadinessReport(createScreenOnlyScene(), validProfile());

const validProfile = (): StudioProfile => ({
  ...createDefaultStudioProfile(),
  destination: {
    ...createDefaultStudioProfile().destination,
    serverUrl: "rtmps://live.example-stream.test/app",
    streamKey: "dummy-stream-value"
  }
});

const monitorProfile = (): StudioProfile => ({
  ...validProfile(),
  micEffects: {
    ...validProfile().micEffects,
    enabled: true,
    monitorEnabled: true,
    monitorVolume: 0.5,
    monitorHeadphonesOnly: true
  }
});

const createScreenOnlyScene = (): SceneDocument =>
  createDefaultScene().sources
    .filter((source) => source.kind !== "screen")
    .reduce((scene, source) => setVisibility(scene, source.id, false), createDefaultScene());

describe("stream start preflight", () => {
  it("blocks start when readiness has errors", () => {
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createDefaultScene(), createDefaultStudioProfile()),
      streamStatus: "idle"
    });

    expect(report.canStart).toBe(false);
    expect(report.status).toBe("blocked");
    expect(report.blocks.map((issue) => issue.code)).toContain("readiness-stream-key-required");
  });

  it("allows an idle valid setup to start", () => {
    const report = createStreamStartPreflightReport({
      readiness: validReadiness(),
      streamStatus: "idle"
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.summary).toBe("Launch preflight is ready.");
  });

  it("allows private YouTube validation streams before commercial validation is ready", () => {
    const report = createStreamStartPreflightReport({
      readiness: validReadiness(),
      streamStatus: "idle",
      profile: validProfile(),
      validation: {
        status: "needs-test",
        recommendedNextStep: "Record private validation evidence."
      }
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.issues.map((issue) => issue.code)).not.toContain("validation-youtube-public-not-ready");
  });

  it("blocks public YouTube launches until commercial validation is ready", () => {
    const profile = {
      ...validProfile(),
      platformPublishing: {
        ...validProfile().platformPublishing,
        privacyStatus: "public" as const
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "needs-test",
        recommendedNextStep: "Record iOS and Android avatar-motion evidence."
      }
    });

    expect(report.canStart).toBe(false);
    expect(report.status).toBe("blocked");
    expect(report.blocks.map((issue) => issue.code)).toContain("validation-youtube-public-not-ready");
    expect(formatStreamStartPreflightBlockMessage(report)).toContain("YouTube Live is set to public");
  });

  it("allows public YouTube launches after commercial validation is ready", () => {
    const profile = {
      ...validProfile(),
      platformPublishing: {
        ...validProfile().platformPublishing,
        privacyStatus: "public" as const,
        youtubeBroadcastId: "broadcast-id",
        youtubeStreamId: "stream-id",
        youtubeBroadcastStatus: "testing",
        youtubeStatusCheckedAt: "2026-06-23T00:00:00.000Z"
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      },
      now: new Date("2026-06-23T00:05:00.000Z")
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.issues.map((issue) => issue.code)).not.toContain("validation-youtube-public-not-ready");
  });

  it("warns when platform-visible YouTube status has not been refreshed before launch", () => {
    const profile = {
      ...validProfile(),
      platformPublishing: {
        ...validProfile().platformPublishing,
        privacyStatus: "public" as const,
        youtubeBroadcastId: "broadcast-id",
        youtubeStreamId: "stream-id",
        youtubeBroadcastStatus: "testing",
        youtubeStatusCheckedAt: "2026-06-23T00:00:00.000Z"
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      },
      now: new Date("2026-06-23T00:16:00.000Z")
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toContain("publishing-youtube-status-stale");
  });

  it("blocks platform-visible YouTube launches without a bound broadcast after validation is ready", () => {
    const profile = {
      ...validProfile(),
      platformPublishing: {
        ...validProfile().platformPublishing,
        privacyStatus: "public" as const,
        youtubeBroadcastId: "",
        youtubeStreamId: ""
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      }
    });

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["publishing-youtube-broadcast-required", "publishing-youtube-stream-required"])
    );
    expect(formatStreamStartPreflightBlockMessage(report)).toContain("no bound broadcast is selected");
  });

  it("blocks platform-visible YouTube launches when the selected broadcast is already complete", () => {
    const profile = {
      ...validProfile(),
      platformPublishing: {
        ...validProfile().platformPublishing,
        privacyStatus: "unlisted" as const,
        youtubeBroadcastId: "broadcast-id",
        youtubeStreamId: "stream-id",
        youtubeBroadcastStatus: "complete"
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      }
    });

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toContain("publishing-youtube-broadcast-complete");
  });

  it("blocks Twitch launches until commercial validation is ready", () => {
    const baseProfile = applyDestinationPreset(validProfile(), "twitch-auto");
    const profile = {
      ...baseProfile,
      destination: {
        ...baseProfile.destination,
        streamKey: "placeholder-twitch-key"
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "needs-test",
        recommendedNextStep: "Record iOS and Android avatar-motion evidence."
      }
    });

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toContain("validation-twitch-public-not-ready");
  });

  it("blocks Twitch launches when the channel is already live", () => {
    const baseProfile = applyDestinationPreset(validProfile(), "twitch-auto");
    const profile = {
      ...baseProfile,
      destination: {
        ...baseProfile.destination,
        streamKey: "placeholder-twitch-key"
      },
      platformPublishing: {
        ...baseProfile.platformPublishing,
        twitchLiveStatus: "live",
        twitchStatusCheckedAt: "2026-06-23T00:00:00.000Z"
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      },
      now: new Date("2026-06-23T00:05:00.000Z")
    });

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toContain("publishing-twitch-already-live");
  });

  it("warns when Twitch status has never been refreshed before launch", () => {
    const baseProfile = applyDestinationPreset(validProfile(), "twitch-auto");
    const profile = {
      ...baseProfile,
      destination: {
        ...baseProfile.destination,
        streamKey: "placeholder-twitch-key"
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      },
      now: new Date("2026-06-23T00:05:00.000Z")
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toContain("publishing-twitch-status-unchecked");
  });

  it("warns for unlisted YouTube launches before commercial validation is ready", () => {
    const profile = {
      ...validProfile(),
      platformPublishing: {
        ...validProfile().platformPublishing,
        privacyStatus: "unlisted" as const
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "needs-test",
        recommendedNextStep: "Record iOS and Android avatar-motion evidence."
      }
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toContain("validation-youtube-unlisted-not-ready");
  });

  it("warns for custom ingest when visibility is unknown and validation is not ready", () => {
    const profile = {
      ...validProfile(),
      destination: {
        ...validProfile().destination,
        platform: "custom" as const,
        presetId: "custom-rtmps" as const,
        name: "Custom RTMPS"
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "needs-test",
        recommendedNextStep: "Record iOS and Android avatar-motion evidence."
      }
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toContain("validation-custom-not-ready");
  });

  it("blocks platform chat readout when chat is enabled without a target", () => {
    const profile = {
      ...validProfile(),
      platformChat: {
        ...validProfile().platformChat,
        enabled: true,
        platform: "youtube" as const,
        youtubeLiveChatId: ""
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      chatReader: { enabled: true }
    });

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toContain("chat-platform-needs-configuration");
  });

  it("blocks platform chat readout when OAuth is missing", () => {
    const profile = {
      ...validProfile(),
      platformChat: {
        ...validProfile().platformChat,
        enabled: true,
        platform: "youtube" as const,
        youtubeLiveChatId: "live-chat-id"
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      chatReader: { enabled: true },
      platformChatAuth: {
        youtubeAccessToken: "",
        twitchOauthToken: "",
        twitchLogin: ""
      }
    });

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toContain("chat-platform-needs-auth");
  });

  it("warns when platform chat readout is configured but not connected", () => {
    const profile = {
      ...validProfile(),
      platformChat: {
        ...validProfile().platformChat,
        enabled: true,
        platform: "youtube" as const,
        youtubeLiveChatId: "live-chat-id"
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      chatReader: { enabled: true },
      platformChatAuth: {
        youtubeAccessToken: "oauth-placeholder",
        twitchOauthToken: "",
        twitchLogin: ""
      },
      platformChatConnection: {
        phase: "idle",
        message: "Not connected."
      }
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toContain("chat-platform-not-connected");
  });

  it("passes platform chat readout when chat is connected", () => {
    const profile = {
      ...validProfile(),
      platformChat: {
        ...validProfile().platformChat,
        enabled: true,
        platform: "youtube" as const,
        youtubeLiveChatId: "live-chat-id"
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      chatReader: { enabled: true },
      platformChatAuth: {
        youtubeAccessToken: "oauth-placeholder",
        twitchOauthToken: "",
        twitchLogin: ""
      },
      platformChatConnection: {
        phase: "connected",
        message: "Connected."
      }
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.issues.map((issue) => issue.area)).not.toContain("chat");
  });

  it("warns when platform chat is enabled but readout is disabled", () => {
    const profile = {
      ...validProfile(),
      platformChat: {
        ...validProfile().platformChat,
        enabled: true,
        platform: "twitch" as const,
        twitchChannel: "streamer"
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      chatReader: { enabled: false }
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toContain("chat-reader-disabled");
  });

  it("keeps warnings visible without blocking start", () => {
    const readiness = createReadinessReport(createDefaultScene(), {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        protocol: "rtmp",
        serverUrl: "rtmp://live.example-stream.test/app",
        streamKey: "dummy-stream-value"
      }
    });
    const report = createStreamStartPreflightReport({
      readiness,
      streamStatus: "failed"
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["readiness-rtmp-not-encrypted", "engine-previous-failure"])
    );
  });

  it("blocks duplicate launch attempts while already live", () => {
    const report = createStreamStartPreflightReport({
      readiness: validReadiness(),
      streamStatus: "live"
    });

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toContain("engine-live");
  });

  it("blocks launch while another stream operation is pending", () => {
    const report = createStreamStartPreflightReport({
      readiness: validReadiness(),
      streamStatus: "idle",
      operationStatus: {
        kind: "pending",
        action: "stop",
        message: "Stopping stream"
      }
    });

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toContain("operation-stop-pending");
  });

  it("blocks headphone self-monitoring when the device route is speaker", () => {
    const profile = monitorProfile();
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      audioRoute: {
        route: "speaker",
        outputName: "Speaker",
        headphonesConnected: false,
        checkedAt: "2026-06-23T00:00:00.000Z",
        stale: false,
        summary: "Speaker route is active; headphones not connected.",
        recommendation: "Connect headphones before starting."
      }
    });

    expect(report.canStart).toBe(false);
    expect(report.status).toBe("blocked");
    expect(report.blocks.map((issue) => issue.code)).toContain("audio-monitor-route-unsafe");
  });

  it("warns when headphone self-monitoring route has not been confirmed", () => {
    const profile = monitorProfile();
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile,
      audioRoute: {
        route: "unknown",
        outputName: "Unknown output",
        headphonesConnected: false,
        checkedAt: null,
        stale: true,
        summary: "Audio output route has not been confirmed on this device.",
        recommendation: "Refresh route detection."
      }
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toContain("audio-monitor-route-unconfirmed");
  });

  it("formats blocking failures for operation errors", () => {
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createDefaultScene(), createDefaultStudioProfile()),
      streamStatus: "live"
    });

    expect(formatStreamStartPreflightBlockMessage(report)).toContain("Launch preflight blocked:");
    expect(formatStreamStartPreflightBlockMessage(report)).toContain("Stream key is required.");
  });
});
