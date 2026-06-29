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
import type { StreamValidationEvidenceRunManifestItem } from "./streamValidationEvidence";

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

const vrmRendererManifestRun = (
  devicePlatform: StreamValidationEvidenceRunManifestItem["devicePlatform"]
): StreamValidationEvidenceRunManifestItem =>
  ({
    id: `svr1-${devicePlatform}`,
    fingerprint: `svr1-${devicePlatform}`,
    createdAt: "2026-06-23T00:00:00.000Z",
    ageDays: 0,
    fresh: true,
    matchesScope: true,
    eligible: true,
    devicePlatform,
    result: "pass",
    nativeRuntimeStatus: "pass",
    nativeRuntimeCompositionStatus: "applied",
    nativeRuntimeCompositionAppliedCount: 0,
    nativeRuntimeCompositionSkippedCount: 0,
    nativeRuntimeCompositionSkippedKinds: [],
    nativeRuntimeVrmSourceCount: 1,
    nativeRuntimeVrmPosePayloadCount: 1,
    nativeRuntimeVrmActivePoseCount: 1,
    nativeRuntimeVrmMissingPoseCount: 0,
    nativeRuntimeVrmRendererStatus: "ready",
    nativeRuntimeVrmModelLoadedCount: 1,
    nativeRuntimeVrmHumanoidBoneCount: 55,
    nativeRuntimeVrmExpressionCount: 8,
    nativeRuntimeVrmMeshPrimitiveCount: 4,
    nativeRuntimeVrmSkinnedMeshPrimitiveCount: 4,
    nativeRuntimeVrmSkinJointCount: 55,
    nativeRuntimeVrmPositionAccessorCount: 4,
    nativeRuntimeVrmVertexCount: 12_480,
    nativeRuntimeVrmSkinningAttributePrimitiveCount: 4,
    nativeRuntimeVrmTrianglePrimitiveCount: 4,
    nativeRuntimeVrmUnsupportedPrimitiveModeCount: 0,
    nativeRuntimeVrmTexcoordAccessorCount: 4,
    nativeRuntimeVrmImageCount: 3,
    nativeRuntimeVrmUnsupportedImageMimeCount: 0,
    nativeRuntimeVrmPoseBoneUnsupportedCount: 0,
    nativeRuntimeVrmPoseExpressionUnsupportedCount: 0,
    nativeRuntimeVrmRenderedSourceCount: 1,
    nativeRuntimeVrmRenderMissingCount: 0,
    nativeRuntimeVrmRenderFailureCount: 0
  }) as unknown as StreamValidationEvidenceRunManifestItem;

const vrmRendererValidationEvidence = () => ({
  nativeRuntimeIosPass: true,
  nativeRuntimeAndroidPass: true,
  runManifest: [vrmRendererManifestRun("ios"), vrmRendererManifestRun("android")]
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

const createVrmScene = (): SceneDocument =>
  updateSource(
    setVisibility(createDefaultScene(), "source-background", false),
    "source-avatar",
    (source) =>
      source.kind === "pngtuber"
        ? {
            ...createSource("vrm"),
            id: source.id,
            name: "Production VRoid",
            visible: true,
            transform: source.transform
          }
        : source
  );

const createRenderableVrmScene = (): SceneDocument =>
  updateSource(createVrmScene(), "source-avatar", (source) =>
    source.kind === "vrm"
      ? {
          ...source,
          modelUri: "file:///private/var/mobile/Containers/Shared/AppGroup/ABCDEF/avatar.vrm"
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

const createShallowDepthTrackedAvatarScene = (): SceneDocument =>
  updateSource(createPreparedTrackedAvatarScene(), "source-avatar", (source) =>
    source.kind === "pngtuber"
      ? {
          ...source,
          illustrationRig: {
            ...source.illustrationRig,
            hairLineY: 0.31,
            eyeLineY: 0.34,
            mouthLineY: 0.49,
            shoulderLineY: 0.611,
            sliceCount: 24
          }
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

  it("warns before start when the chat overlay background is not transparent", () => {
    const profile = validProfile();
    const scene = updateSource(createScreenOnlyScene(), "source-chat", (source) =>
      source.kind === "chat"
        ? {
            ...source,
            visible: true,
            backgroundOpacity: 0.35
          }
        : source
    );

    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(scene, profile),
      streamStatus: "idle",
      profile
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings).toContainEqual(
      expect.objectContaining({
        code: "readiness-scene-chat-overlay-background-opaque",
        recommendation: expect.stringContaining("background opacity at 0")
      })
    );
  });

  it("blocks start when every broadcast mixer channel is silent", () => {
    const profile: StudioProfile = {
      ...validProfile(),
      broadcastMixer: {
        mic: { volume: 0, muted: true },
        appAudio: { volume: 0, muted: true },
        chatReadout: { volume: 0, muted: true }
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile
    });

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toContain("broadcast-mixer-silent");
  });

  it("warns before start when the broadcast mic channel is silent", () => {
    const profile: StudioProfile = {
      ...validProfile(),
      broadcastMixer: {
        ...validProfile().broadcastMixer,
        mic: { volume: 0, muted: true }
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toContain("broadcast-mixer-mic-muted");
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
      faceLandmarkConfidence: 0.81,
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

  it("warns before start when a PNGTuber rig lacks high-fidelity pseudo-depth continuity", () => {
    const profile = {
      ...validProfile(),
      faceTracking: {
        ...validProfile().faceTracking,
        enabled: true,
        inputMode: "native-camera" as const
      }
    };
    const scene = createShallowDepthTrackedAvatarScene();
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
      faceLandmarkConfidence: 0.81,
      expression: "neutral",
      lastFrameAt: 1_000
    });

    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(scene, profile),
      streamStatus: "idle",
      profile,
      faceTracking
    });

    expect(faceTracking.status).toBe("warn");
    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings).toContainEqual(
      expect.objectContaining({
        code: "avatar-face-tracking-not-production-ready",
        area: "avatar",
        message: expect.stringContaining("high-fidelity score")
      })
    );
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

  it("blocks YouTube starts when dashboard privacy differs from the app setting", () => {
    const profile = {
      ...validProfile(),
      platformPublishing: {
        ...validProfile().platformPublishing,
        privacyStatus: "public" as const,
        youtubeBroadcastId: "broadcast-id",
        youtubeStreamId: "stream-id",
        youtubeBroadcastStatus: "testing",
        youtubeBroadcastPrivacyStatus: "unlisted" as const,
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

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toEqual(["publishing-youtube-privacy-mismatch"]);
    expect(report.blocks[0]?.message).toContain("YouTube broadcast privacy is unlisted");
  });

  it("blocks private validation starts when the saved YouTube broadcast is public", () => {
    const profile = {
      ...validProfile(),
      platformPublishing: {
        ...validProfile().platformPublishing,
        privacyStatus: "private" as const,
        youtubeBroadcastId: "broadcast-id",
        youtubeBroadcastPrivacyStatus: "public" as const
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      profile
    });

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toEqual(["publishing-youtube-privacy-mismatch"]);
    expect(formatStreamStartPreflightBlockMessage(report)).toContain("app is configured for private");
  });

  it("blocks YouTube starts when the broadcast is bound to a different stream ID", () => {
    const profile = {
      ...validProfile(),
      platformPublishing: {
        ...validProfile().platformPublishing,
        privacyStatus: "public" as const,
        youtubeBroadcastId: "broadcast-id",
        youtubeStreamId: "saved-stream",
        youtubeBroadcastBoundStreamId: "bound-stream",
        youtubeBroadcastStatus: "testing",
        youtubeBroadcastPrivacyStatus: "public" as const,
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

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toEqual(["publishing-youtube-bound-stream-mismatch"]);
    expect(formatStreamStartPreflightBlockMessage(report)).toContain("bound to stream bound-stream");
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

  it("blocks public YouTube launches while visible VRM is preview-only", () => {
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
      readiness: createReadinessReport(createVrmScene(), profile),
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
    expect(report.blocks.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["readiness-scene-vrm-preview", "readiness-scene-vrm-model-missing"])
    );
  });

  it("allows public YouTube preflight scene checks for VRM with retained native renderer proof", () => {
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
      readiness: createReadinessReport(createRenderableVrmScene(), profile),
      streamStatus: "idle",
      profile,
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      },
      validationEvidence: vrmRendererValidationEvidence(),
      faceTracking: {
        status: "pass",
        enabled: true,
        inputMode: "native-camera",
        rigMode: "still-image-2d",
        runtimeStatus: "tracking",
        runtimeAgeMs: 120,
        runtimeFresh: true,
        faceLandmarkConfidence: 0.82,
        faceLandmarkReady: true,
        visibleAvatarCount: 1,
        visiblePngTuberCount: 0,
        visibleLive2DCount: 0,
        visibleVrmCount: 1,
        nativeVrmRendererReady: true,
        preparedPngTuberCount: 0,
        activeMotionCount: 1,
        rigIssueCount: 0,
        rigIssueSummary: "No still-image rig issues.",
        rigQualityScore: 100,
        rigQualityGrade: "ready",
        summary: "Face tracking is ready with 1 native-rendered VRM/VRoid source.",
        recommendation: "Keep this tracker state with the next private iOS/Android validation run."
      },
      platformChatOAuthCredential: youtubeCredential([YOUTUBE_LIVE_MANAGE_SCOPE]),
      now: new Date("2026-06-23T00:05:00.000Z")
    });

    expect(report.blocks.map((issue) => issue.code)).not.toContain("readiness-scene-vrm-preview");
    expect(report.issues.map((issue) => issue.code)).not.toContain("readiness-scene-vrm-preview");
    expect(report.canStart).toBe(true);
  });

  it("keeps private VRM validation starts as warnings", () => {
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createVrmScene(), validProfile()),
      streamStatus: "idle",
      profile: validProfile(),
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      }
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toContain("readiness-scene-vrm-preview");
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
        twitchChannelTitle: baseProfile.platformPublishing.title,
        twitchChannelCategory: baseProfile.platformPublishing.twitchCategory,
        twitchChannelCategoryId: baseProfile.platformPublishing.twitchCategoryId,
        twitchChannelLanguage: baseProfile.platformPublishing.twitchLanguage,
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

  it("blocks public YouTube starts when the native engine is not active", () => {
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
      enginePlatform: "mock",
      profile,
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      },
      platformChatOAuthCredential: youtubeCredential([YOUTUBE_LIVE_MANAGE_SCOPE]),
      now: new Date("2026-06-23T00:05:00.000Z")
    });

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toEqual(["engine-native-required"]);
    expect(formatStreamStartPreflightBlockMessage(report)).toContain("current engine platform is mock");
  });

  it("blocks Twitch starts when engine platform evidence is missing", () => {
    const baseProfile = applyDestinationPreset(validProfile(), "twitch-auto");
    const profile = {
      ...baseProfile,
      destination: {
        ...baseProfile.destination,
        streamKey: "placeholder-twitch-key"
      },
      platformPublishing: {
        ...baseProfile.platformPublishing,
        twitchChannelTitle: baseProfile.platformPublishing.title,
        twitchChannelCategory: baseProfile.platformPublishing.twitchCategory,
        twitchChannelCategoryId: baseProfile.platformPublishing.twitchCategoryId,
        twitchChannelLanguage: baseProfile.platformPublishing.twitchLanguage,
        twitchLiveStatus: "offline",
        twitchStatusCheckedAt: "2026-06-23T00:00:00.000Z"
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      enginePlatform: "unknown",
      profile,
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      },
      platformChatOAuthCredential: twitchCredential([TWITCH_CHANNEL_MANAGE_SCOPE]),
      now: new Date("2026-06-23T00:05:00.000Z")
    });

    expect(report.canStart).toBe(false);
    expect(report.blocks.map((issue) => issue.code)).toEqual(["engine-native-required"]);
    expect(report.blocks[0]?.message).toContain("current engine platform is unknown");
  });

  it("keeps private YouTube validation starts available on the mock engine", () => {
    const report = createStreamStartPreflightReport({
      readiness: validReadiness(),
      streamStatus: "idle",
      enginePlatform: "mock",
      profile: validProfile()
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.issues.map((issue) => issue.code)).not.toContain("engine-native-required");
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

  it("blocks Twitch launches when dashboard metadata differs from the app settings", () => {
    const baseProfile = applyDestinationPreset(validProfile(), "twitch-auto");
    const profile = {
      ...baseProfile,
      destination: {
        ...baseProfile.destination,
        streamKey: "placeholder-twitch-key"
      },
      platformPublishing: {
        ...baseProfile.platformPublishing,
        title: "App title",
        twitchCategory: "Just Chatting",
        twitchCategoryId: "509658",
        twitchLanguage: "ja",
        twitchChannelTitle: "Dashboard title",
        twitchChannelCategory: "Art",
        twitchChannelCategoryId: "509660",
        twitchChannelLanguage: "en",
        twitchLiveStatus: "offline",
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
    expect(report.blocks.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "publishing-twitch-title-mismatch",
        "publishing-twitch-category-mismatch",
        "publishing-twitch-language-mismatch"
      ])
    );
  });

  it("blocks Twitch launches when refreshed dashboard metadata is empty", () => {
    const baseProfile = applyDestinationPreset(validProfile(), "twitch-auto");
    const profile = {
      ...baseProfile,
      destination: {
        ...baseProfile.destination,
        streamKey: "placeholder-twitch-key"
      },
      platformPublishing: {
        ...baseProfile.platformPublishing,
        title: "App title",
        twitchCategory: "Just Chatting",
        twitchCategoryId: "",
        twitchLanguage: "ja",
        twitchChannelTitle: "",
        twitchChannelCategory: "",
        twitchChannelCategoryId: "",
        twitchChannelLanguage: "",
        twitchLiveStatus: "offline",
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
    expect(report.blocks.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "publishing-twitch-title-mismatch",
        "publishing-twitch-category-mismatch",
        "publishing-twitch-language-mismatch"
      ])
    );
  });

  it("does not block Twitch launches when category IDs match but display names differ", () => {
    const baseProfile = applyDestinationPreset(validProfile(), "twitch-auto");
    const profile = {
      ...baseProfile,
      destination: {
        ...baseProfile.destination,
        streamKey: "placeholder-twitch-key"
      },
      platformPublishing: {
        ...baseProfile.platformPublishing,
        title: "App title",
        twitchCategory: "Stale local category name",
        twitchCategoryId: "509660",
        twitchLanguage: "ja",
        twitchChannelTitle: "App title",
        twitchChannelCategory: "Art",
        twitchChannelCategoryId: "509660",
        twitchChannelLanguage: "ja",
        twitchLiveStatus: "offline",
        twitchStatusCheckedAt: "2026-06-23T00:00:00.000Z"
      }
    };
    const report = createStreamStartPreflightReport({
      readiness: createReadinessReport(createScreenOnlyScene(), profile),
      streamStatus: "idle",
      enginePlatform: "android",
      profile,
      validation: {
        status: "ready",
        recommendedNextStep: "Keep validation evidence fresh."
      },
      platformChatOAuthCredential: twitchCredential([TWITCH_CHANNEL_MANAGE_SCOPE]),
      now: new Date("2026-06-23T00:05:00.000Z")
    });

    expect(report.blocks.map((issue) => issue.code)).not.toContain("publishing-twitch-category-mismatch");
    expect(report.canStart).toBe(true);
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
      platformChatAuth: {
        youtubeAccessToken: "",
        twitchOauthToken: "oauth-placeholder",
        twitchLogin: "streamer"
      },
      platformChatOAuthCredential: twitchCredential([TWITCH_CHAT_SCOPE]),
      platformChatConnection: {
        phase: "connected",
        message: "Connected."
      },
      chatReader: {
        enabled: true,
        redactUrls: false,
        skipCommandMessages: false,
        moderationEnabled: false,
        blockExcessiveCaps: false,
        maxMessagesPerAuthorPerMinute: 24
      }
    });

    expect(report.canStart).toBe(true);
    expect(report.status).toBe("warning");
    expect(report.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "chat-reader-url-redaction-disabled",
        "chat-reader-command-skip-disabled",
        "chat-reader-moderation-disabled",
        "chat-reader-caps-filter-disabled",
        "chat-reader-author-rate-limit-loose"
      ])
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
