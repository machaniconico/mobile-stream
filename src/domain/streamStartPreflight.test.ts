import { describe, expect, it } from "vitest";
import { createDefaultScene, createSource, setVisibility, updateSource, type SceneDocument } from "./scene";
import { applyDestinationPreset, createDefaultStudioProfile, type StudioProfile } from "./profiles";
import { createFaceTrackingDiagnostics } from "./faceTrackingDiagnostics";
import { createReadinessReport } from "./readiness";
import {
  TWITCH_CHANNEL_MANAGE_SCOPE,
  TWITCH_CHAT_SCOPE,
  YOUTUBE_LIVE_CHAT_SCOPE,
  YOUTUBE_LIVE_MANAGE_SCOPE,
  type PlatformChatOAuthCredential
} from "./platformChatOAuth";
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

const youtubeCredential = (scopes: string[] = [YOUTUBE_LIVE_CHAT_SCOPE, YOUTUBE_LIVE_MANAGE_SCOPE]): PlatformChatOAuthCredential => ({
  platform: "youtube",
  accessToken: "youtube-access",
  refreshToken: "youtube-refresh",
  expiresAt: Date.parse("2099-01-01T00:00:00.000Z"),
  scopes,
  twitchLogin: null,
  twitchUserId: null,
  validatedAt: Date.parse("2026-06-23T00:00:00.000Z"),
  clientId: "youtube-client",
  redirectUri: "com.mobilelivecaster.app:/oauth/youtube"
});

const twitchCredential = (scopes: string[] = [TWITCH_CHAT_SCOPE, TWITCH_CHANNEL_MANAGE_SCOPE]): PlatformChatOAuthCredential => ({
  platform: "twitch",
  accessToken: "twitch-access",
  refreshToken: "twitch-refresh",
  expiresAt: Date.parse("2099-01-01T00:00:00.000Z"),
  scopes,
  twitchLogin: "streamer",
  twitchUserId: "123",
  validatedAt: Date.parse("2026-06-23T00:00:00.000Z"),
  clientId: "twitch-client",
  redirectUri: "mobilelivecaster://oauth/twitch"
});

const createScreenOnlyScene = (): SceneDocument =>
  createDefaultScene().sources
    .filter((source) => source.kind !== "screen")
    .reduce((scene, source) => setVisibility(scene, source.id, false), createDefaultScene());

const createLive2DScene = (): SceneDocument =>
  updateSource(
    setVisibility(createDefaultScene(), "source-background", false),
    "source-avatar",
    (source) =>
      source.kind === "pngtuber"
        ? {
            ...createSource("live2d"),
            id: source.id,
            name: "Production Live2D",
            visible: true,
            transform: source.transform
          }
        : source
  );

const createHostSandboxAvatarScene = (): SceneDocument =>
  updateSource(
    setVisibility(createDefaultScene(), "source-background", false),
    "source-avatar",
    (source) =>
      source.kind === "pngtuber"
        ? {
            ...source,
            imageUri: "file:///var/mobile/Containers/Data/Application/APP/Documents/avatar.png"
          }
        : source
  );

const createPreparedTrackedAvatarScene = (): SceneDocument =>
  updateSource(
    setVisibility(createScreenOnlyScene(), "source-avatar", true),
    "source-avatar",
    (source) =>
      source.kind === "pngtuber"
        ? {
            ...source,
            imageUri: "file:///private/var/mobile/Containers/Shared/AppGroup/ABCDEF/avatar.png",
            motion: { ...source.motion, headYaw: 0.22, mouthDeform: 0.31, confidence: 0.91 }
          }
        : source
  );

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

  it("uses current face tracking diagnostics instead of stale readiness warnings", () => {
    const profile = {
      ...validProfile(),
      faceTracking: {
        ...validProfile().faceTracking,
        enabled: true,
        inputMode: "native-camera" as const
      }
    };
    const scene = createPreparedTrackedAvatarScene();
    const readiness = createReadinessReport(scene, profile);
    const faceTracking = createFaceTrackingDiagnostics(scene, profile, {
      status: "tracking",
      yaw: 0.2,
      pitch: 0.1,
      roll: 0,
      mouthOpen: 0.4,
      blink: 0,
      smile: 0.4,
      browRaise: 0.2,
      confidence: 0.91,
      expression: "neutral",
      lastFrameAt: 1_000
    });

    expect(readiness.issues.map((issue) => issue.code)).toContain("face-tracking-not-production-ready");

    const report = createStreamStartPreflightReport({
      readiness,
      streamStatus: "idle",
      profile,
      faceTracking
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.issues.map((issue) => issue.code)).not.toContain("readiness-face-tracking-not-production-ready");
    expect(report.issues.map((issue) => issue.area)).not.toContain("avatar");
  });

  it("warns when a visible avatar has face tracking disabled", () => {
    const scene = createPreparedTrackedAvatarScene();
    const profile = validProfile();
    const faceTracking = createFaceTrackingDiagnostics(scene, profile);
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(scene, profile),
      streamStatus: "idle",
      profile,
      faceTracking
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings).toContainEqual(
      expect.objectContaining({
        code: "avatar-face-tracking-disabled",
        area: "avatar"
      })
    );
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
      platformChatOAuthCredential: youtubeCredential([YOUTUBE_LIVE_MANAGE_SCOPE]),
      now: new Date("2026-06-23T00:05:00.000Z")
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.issues.map((issue) => issue.code)).not.toContain("validation-youtube-public-not-ready");
  });

  it("blocks public YouTube launches while visible Live2D is preview-only", () => {
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
      readiness: createReadinessReport(createLive2DScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      },
      platformChatOAuthCredential: youtubeCredential([YOUTUBE_LIVE_MANAGE_SCOPE]),
      now: new Date("2026-06-23T00:05:00.000Z")
    });

    expect(report.canStart).toBe(false);
    expect(report.status).toBe("blocked");
    expect(report.blocks).toContainEqual(
      expect.objectContaining({
        code: "readiness-scene-live2d-preview",
        area: "scene",
        recommendation: expect.stringContaining("prepared PNGTuber")
      })
    );
  });

  it("keeps private Live2D validation starts as warnings", () => {
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createLive2DScene(), validProfile()),
      streamStatus: "idle",
      profile: validProfile(),
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      }
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toContain("readiness-scene-live2d-preview");
  });

  it("blocks Twitch launches while visible Live2D is preview-only", () => {
    const baseProfile = applyDestinationPreset(validProfile(), "twitch-auto");
    const profile = {
      ...baseProfile,
      destination: {
        ...baseProfile.destination,
        streamKey: "placeholder-twitch-key"
      },
      platformPublishing: {
        ...baseProfile.platformPublishing,
        twitchLiveStatus: "offline",
        twitchStatusCheckedAt: "2026-06-23T00:00:00.000Z"
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createLive2DScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      },
      platformChatOAuthCredential: twitchCredential([TWITCH_CHANNEL_MANAGE_SCOPE]),
      now: new Date("2026-06-23T00:05:00.000Z")
    });

    expect(report.canStart).toBe(false);
    expect(report.status).toBe("blocked");
    expect(report.blocks.map((issue) => issue.code)).toContain("readiness-scene-live2d-preview");
  });

  it("blocks public YouTube launches when native still-image assets are not iOS extension-readable", () => {
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
      readiness: createReadinessReport(createHostSandboxAvatarScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      },
      platformChatOAuthCredential: youtubeCredential([YOUTUBE_LIVE_MANAGE_SCOPE]),
      now: new Date("2026-06-23T00:05:00.000Z")
    });

    expect(report.canStart).toBe(false);
    expect(report.status).toBe("blocked");
    expect(report.blocks).toContainEqual(
      expect.objectContaining({
        code: "readiness-scene-native-composition-native-overlays",
        area: "scene",
        recommendation: expect.stringContaining("App Group")
      })
    );
  });

  it("keeps private native still-image asset checks as warnings", () => {
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createHostSandboxAvatarScene(), validProfile()),
      streamStatus: "idle",
      profile: validProfile(),
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      }
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toContain("readiness-scene-native-composition-native-overlays");
  });

  it("blocks Twitch launches when native still-image assets are not iOS extension-readable", () => {
    const baseProfile = applyDestinationPreset(validProfile(), "twitch-auto");
    const profile = {
      ...baseProfile,
      destination: {
        ...baseProfile.destination,
        streamKey: "placeholder-twitch-key"
      },
      platformPublishing: {
        ...baseProfile.platformPublishing,
        twitchLiveStatus: "offline",
        twitchStatusCheckedAt: "2026-06-23T00:00:00.000Z"
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createHostSandboxAvatarScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      },
      platformChatOAuthCredential: twitchCredential([TWITCH_CHANNEL_MANAGE_SCOPE]),
      now: new Date("2026-06-23T00:05:00.000Z")
    });

    expect(report.canStart).toBe(false);
    expect(report.status).toBe("blocked");
    expect(report.blocks.map((issue) => issue.code)).toContain("readiness-scene-native-composition-native-overlays");
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
      platformChatOAuthCredential: youtubeCredential([YOUTUBE_LIVE_MANAGE_SCOPE]),
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
      },
      platformChatOAuthCredential: youtubeCredential([YOUTUBE_LIVE_MANAGE_SCOPE])
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
      },
      platformChatOAuthCredential: youtubeCredential([YOUTUBE_LIVE_MANAGE_SCOPE])
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
      platformChatOAuthCredential: twitchCredential([TWITCH_CHANNEL_MANAGE_SCOPE]),
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
      platformChatOAuthCredential: twitchCredential([TWITCH_CHANNEL_MANAGE_SCOPE]),
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
      platformChatOAuthCredential: youtubeCredential([YOUTUBE_LIVE_CHAT_SCOPE]),
      platformChatConnection: {
        phase: "connected",
        message: "Connected."
      }
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.issues.map((issue) => issue.area)).not.toContain("chat");
  });

  it("warns when chat safety controls are disabled before platform chat start", () => {
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
      chatReader: { enabled: true, redactUrls: false, skipCommandMessages: false },
      platformChatAuth: {
        youtubeAccessToken: "",
        twitchOauthToken: "oauth-placeholder",
        twitchLogin: "streamer"
      },
      platformChatOAuthCredential: twitchCredential([TWITCH_CHAT_SCOPE]),
      platformChatConnection: {
        phase: "connected",
        message: "Connected."
      }
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["chat-reader-url-redaction-disabled", "chat-reader-command-skip-disabled"])
    );
  });

  it("blocks platform chat readout when retained OAuth scopes are incomplete", () => {
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
      platformChatOAuthCredential: youtubeCredential([YOUTUBE_LIVE_MANAGE_SCOPE]),
      platformChatConnection: {
        phase: "connected",
        message: "Connected."
      }
    });

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toContain("chat-youtube-oauth-missing-scopes");
  });

  it("does not hard-block mixed-platform setups when the retained credential belongs to another platform", () => {
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
      chatReader: { enabled: true },
      platformChatAuth: {
        youtubeAccessToken: "",
        twitchOauthToken: "oauth-placeholder",
        twitchLogin: "streamer"
      },
      platformChatOAuthCredential: youtubeCredential([YOUTUBE_LIVE_MANAGE_SCOPE]),
      platformChatConnection: {
        phase: "connected",
        message: "Connected."
      }
    });

    expect(report.canStart).toBe(true);
    expect(report.warnings.map((issue) => issue.code)).toContain("chat-twitch-oauth-missing-credential");
    expect(report.blocks.map((issue) => issue.code)).not.toContain("chat-twitch-oauth-wrong-platform");
  });

  it("uses platform-specific OAuth credentials for mixed YouTube publishing and Twitch chat", () => {
    const profile = {
      ...validProfile(),
      platformPublishing: {
        ...validProfile().platformPublishing,
        privacyStatus: "public" as const,
        youtubeBroadcastId: "broadcast-id",
        youtubeStreamId: "stream-id",
        youtubeBroadcastStatus: "testing",
        youtubeStatusCheckedAt: "2026-06-23T00:00:00.000Z"
      },
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
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      },
      chatReader: { enabled: true },
      platformChatAuth: {
        youtubeAccessToken: "",
        twitchOauthToken: "oauth-placeholder",
        twitchLogin: "streamer"
      },
      platformChatOAuthCredentials: {
        youtube: youtubeCredential([YOUTUBE_LIVE_MANAGE_SCOPE]),
        twitch: twitchCredential([TWITCH_CHAT_SCOPE])
      },
      platformChatConnection: {
        phase: "connected",
        message: "Connected."
      },
      now: new Date("2026-06-23T00:05:00.000Z")
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.issues.map((issue) => issue.code)).not.toEqual(
      expect.arrayContaining(["publishing-youtube-oauth-missing-credential", "chat-twitch-oauth-missing-credential"])
    );
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
