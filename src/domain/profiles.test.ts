import { describe, expect, it } from "vitest";
import {
  applyCustomQualitySettings,
  applyDestinationPreset,
  applyEmergencyBroadcastMute,
  applyMicEffectPreset,
  buildPublishUrl,
  clearStreamKey,
  createDefaultStudioProfile,
  markDestinationCustom,
  normalizeDestinationProfile,
  normalizeQualityProfile,
  normalizeStudioProfile,
  qualityProfiles,
  qualityResolutionOptions,
  qualitySettingsLimits,
  serverUrlWithProtocol,
  stripSensitiveProfileData
} from "./profiles";

describe("studio profiles", () => {
  it("normalizes partial persisted profile data", () => {
    const profile = normalizeStudioProfile({
      destination: {
        ...createDefaultStudioProfile().destination,
        serverUrl: "rtmps://live.example-stream.test/app"
      }
    });

    expect(profile.destination.serverUrl).toBe("rtmps://live.example-stream.test/app");
    expect(profile.destination.platform).toBe("youtube-live");
    expect(profile.destination.presetId).toBe("youtube-live-rtmps");
    expect(profile.destination.streamKey).toBe("");
    expect(profile.quality.id).toBe("quality-balanced");
    expect(profile.androidPublisherMode).toBe("rootencoder");
    expect(profile.avatar.id).toBe("avatar-default");
    expect(profile.micEffects.presetId).toBe("clean");
    expect(profile.micEffects.monitorHeadphonesOnly).toBe(true);
    expect(profile.broadcastMixer.mic).toEqual({ volume: 1, muted: false });
    expect(profile.broadcastMixer.appAudio).toEqual({ volume: 0.85, muted: false });
    expect(profile.faceTracking.enabled).toBe(false);
    expect(profile.faceTracking.inputMode).toBe("simulated");
    expect(profile.platformChat.enabled).toBe(false);
    expect(profile.platformChat.platform).toBe("youtube");
    expect(profile.platformPublishing.title).toBe("MobileLiveCaster Live");
    expect(profile.platformPublishing.privacyStatus).toBe("private");
    expect(profile.streamAnnouncement.template).toContain("{title}");
    expect(profile.streamAnnouncement.promptAfterGoLive).toBe(true);
  });

  it("normalizes Android publisher mode with RootEncoder as the compatibility default", () => {
    expect(normalizeStudioProfile({ androidPublisherMode: "mediacodec" }).androidPublisherMode).toBe("mediacodec");
    expect(normalizeStudioProfile({ androidPublisherMode: "invalid" as never }).androidPublisherMode).toBe("rootencoder");
  });

  it("exposes the supported custom quality resolutions and bitrate limits", () => {
    expect(qualityResolutionOptions).toEqual([
      { id: "540p", label: "540p", width: 960, height: 540 },
      { id: "720p", label: "720p", width: 1280, height: 720 },
      { id: "1080p", label: "1080p", width: 1920, height: 1080 }
    ]);
    expect(qualitySettingsLimits).toEqual({
      videoBitrateKbps: { min: 900, max: 12000, step: 100 },
      audioBitrateKbps: { min: 64, max: 320, step: 32 }
    });
  });

  it("applies custom quality settings without mutating the source profile", () => {
    const profile = createDefaultStudioProfile();
    const originalQuality = { ...profile.quality };

    const updated = applyCustomQualitySettings(profile, {
      width: 1921,
      height: 1081,
      fps: 60,
      videoBitrateKbps: 6000.6,
      audioBitrateKbps: 192.4
    });

    expect(updated).not.toBe(profile);
    expect(updated.quality).not.toBe(profile.quality);
    expect(updated.quality).toEqual({
      id: "quality-custom",
      name: "Custom 1082p60",
      width: 1922,
      height: 1082,
      fps: 60,
      videoBitrateKbps: 6001,
      audioBitrateKbps: 192
    });
    expect(profile.quality).toEqual(originalQuality);
  });

  it("clamps custom quality settings and retains the current fps for unsupported updates", () => {
    const updated = applyCustomQualitySettings(createDefaultStudioProfile(), {
      width: 99999,
      height: -20,
      fps: 24 as 30,
      videoBitrateKbps: 50000.9,
      audioBitrateKbps: -10.5
    });

    expect(updated.quality).toMatchObject({
      width: 3840,
      height: 360,
      fps: 30,
      videoBitrateKbps: 12000,
      audioBitrateKbps: 64
    });
  });

  it("canonicalizes known quality presets and uses Balanced when quality is missing", () => {
    const persistedPreset = {
      ...qualityProfiles[1],
      name: "Persisted override",
      width: 640,
      videoBitrateKbps: 900
    };

    expect(normalizeQualityProfile(persistedPreset)).toBe(qualityProfiles[1]);
    expect(normalizeQualityProfile(undefined)).toBe(qualityProfiles[0]);
    expect(normalizeQualityProfile(null)).toBe(qualityProfiles[0]);
    expect(normalizeQualityProfile({})).toBe(qualityProfiles[0]);
  });

  it("safely normalizes invalid persisted custom quality values", () => {
    const persistedQuality = {
      id: "legacy-custom",
      name: "Unsafe custom quality",
      width: Number.NaN,
      height: 721,
      fps: 48 as 30,
      videoBitrateKbps: Number.POSITIVE_INFINITY,
      audioBitrateKbps: -1.2
    };

    const normalized = normalizeQualityProfile(persistedQuality);
    const studioProfile = normalizeStudioProfile({ quality: persistedQuality });

    expect(normalized).toEqual({
      id: "quality-custom",
      name: "Custom 722p30",
      width: 1280,
      height: 722,
      fps: 30,
      videoBitrateKbps: 3500,
      audioBitrateKbps: 64
    });
    expect(studioProfile.quality).toEqual(normalized);
    expect(studioProfile.quality).not.toBe(persistedQuality);
    expect(persistedQuality).toEqual({
      id: "legacy-custom",
      name: "Unsafe custom quality",
      width: Number.NaN,
      height: 721,
      fps: 48,
      videoBitrateKbps: Number.POSITIVE_INFINITY,
      audioBitrateKbps: -1.2
    });
  });

  it("normalizes platform publishing settings for API limits", () => {
    const profile = normalizeStudioProfile({
      platformPublishing: {
        title: "  ".padEnd(160, "A"),
        description: "Line 1\r\nLine 2",
        privacyStatus: "public",
        scheduledStartMinutesFromNow: 0,
        madeForKids: true,
        enableAutoStart: false,
        enableAutoStop: false,
        youtubeStreamId: " stream-id ",
        youtubeBroadcastId: " broadcast-id ",
        youtubeBroadcastBoundStreamId: " bound-stream-id ",
        youtubeLiveChatId: " chat-id ",
        youtubeBroadcastStatus: " live ",
        youtubeBroadcastPrivacyStatus: " unlisted " as unknown as "unlisted",
        youtubeStreamStatus: " active ",
        youtubeStreamHealthStatus: " good ",
        youtubeStreamHealthIssues: [" warning: bitrateLow ", "", " error: noAudioStream "],
        youtubeStatusCheckedAt: "2026-06-23 12:34:56Z",
        twitchCategory: " Just Chatting ",
        twitchCategoryId: " 509658 ",
        twitchLanguage: " JA ",
        twitchChannelTitle: " Dashboard title ",
        twitchChannelCategory: " Art ",
        twitchChannelCategoryId: " 509660 ",
        twitchChannelLanguage: " EN ",
        twitchLiveStatus: " live ",
        twitchViewerCount: 12.6,
        twitchStartedAt: " 2026-06-22T12:00:00Z ",
        twitchStatusCheckedAt: "not a date"
      }
    });

    expect(profile.platformPublishing.title).toHaveLength(100);
    expect(profile.platformPublishing.description).toBe("Line 1\nLine 2");
    expect(profile.platformPublishing.scheduledStartMinutesFromNow).toBe(1);
    expect(profile.platformPublishing.youtubeStreamId).toBe("stream-id");
    expect(profile.platformPublishing.youtubeBroadcastBoundStreamId).toBe("bound-stream-id");
    expect(profile.platformPublishing.youtubeBroadcastStatus).toBe("live");
    expect(profile.platformPublishing.youtubeBroadcastPrivacyStatus).toBe("unlisted");
    expect(profile.platformPublishing.youtubeStreamStatus).toBe("active");
    expect(profile.platformPublishing.youtubeStreamHealthStatus).toBe("good");
    expect(profile.platformPublishing.youtubeStreamHealthIssues).toEqual(["warning: bitrateLow", "error: noAudioStream"]);
    expect(profile.platformPublishing.youtubeStatusCheckedAt).toBe("2026-06-23T12:34:56.000Z");
    expect(profile.platformPublishing.twitchCategoryId).toBe("509658");
    expect(profile.platformPublishing.twitchLanguage).toBe("ja");
    expect(profile.platformPublishing.twitchChannelTitle).toBe("Dashboard title");
    expect(profile.platformPublishing.twitchChannelCategory).toBe("Art");
    expect(profile.platformPublishing.twitchChannelCategoryId).toBe("509660");
    expect(profile.platformPublishing.twitchChannelLanguage).toBe("en");
    expect(profile.platformPublishing.twitchLiveStatus).toBe("live");
    expect(profile.platformPublishing.twitchViewerCount).toBe(13);
    expect(profile.platformPublishing.twitchStartedAt).toBe("2026-06-22T12:00:00Z");
    expect(profile.platformPublishing.twitchStatusCheckedAt).toBe("");
  });

  it("removes stream keys before persistence", () => {
    const webhookUrl =
      "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz.ABCDEFGHIJKLMNOPQRSTUVWXYZ_1234567890";
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: "secret-stream-key"
      },
      streamAnnouncement: {
        ...createDefaultStudioProfile().streamAnnouncement,
        autoPostEnabled: true,
        discordWebhookUrl: webhookUrl
      }
    };

    expect(stripSensitiveProfileData(profile).destination.streamKey).toBe("");
    expect(stripSensitiveProfileData(profile).streamAnnouncement.discordWebhookUrl).toBe("");
  });

  it("applies destination presets without dropping the stream key", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: "live_user_123456"
      }
    };

    const updated = applyDestinationPreset(profile, "twitch-tokyo");

    expect(updated.destination.name).toBe("Twitch Tokyo");
    expect(updated.destination.protocol).toBe("rtmp");
    expect(updated.destination.serverUrl).toBe("rtmp://apn10.contribute.live-video.net/app");
    expect(updated.destination.streamKey).toBe("live_user_123456");
  });

  it("clears stream keys without changing destination routing", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        serverUrl: "rtmps://a.rtmps.youtube.com/live2/",
        streamKey: "secret-stream-key"
      }
    };

    const updated = clearStreamKey(profile);

    expect(updated.destination.streamKey).toBe("");
    expect(updated.destination.serverUrl).toBe("rtmps://a.rtmps.youtube.com/live2/");
    expect(updated.destination.presetId).toBe(profile.destination.presetId);
  });

  it("marks edited endpoints as custom destinations", () => {
    const destination = markDestinationCustom(createDefaultStudioProfile().destination, {
      serverUrl: "rtmp://custom.example-stream.test/app"
    });

    expect(destination.platform).toBe("custom");
    expect(destination.presetId).toBe("custom-rtmp");
    expect(destination.protocol).toBe("rtmp");
  });

  it("builds publish URLs from separate server and stream key values", () => {
    const destination = {
      ...createDefaultStudioProfile().destination,
      serverUrl: "rtmps://a.rtmps.youtube.com/live2/",
      streamKey: "/abcd-1234-efgh"
    };

    expect(buildPublishUrl(destination)).toBe("rtmps://a.rtmps.youtube.com/live2/abcd-1234-efgh");
  });

  it("does not duplicate the application path when a pasted key includes it", () => {
    const destination = {
      ...createDefaultStudioProfile().destination,
      serverUrl: "rtmp://ingest.global-contribute.live-video.net/app",
      streamKey: "app/live_user_123456"
    };

    expect(buildPublishUrl(destination)).toBe("rtmp://ingest.global-contribute.live-video.net/app/live_user_123456");
  });

  it("supports Twitch ingest URL templates when pasted manually", () => {
    const destination = {
      ...createDefaultStudioProfile().destination,
      serverUrl: "rtmp://ingest.global-contribute.live-video.net/app/{stream_key}",
      streamKey: "live_user_123456"
    };

    expect(buildPublishUrl(destination)).toBe("rtmp://ingest.global-contribute.live-video.net/app/live_user_123456");
  });

  it("normalizes full YouTube publish URLs pasted into the stream key field", () => {
    const destination = normalizeDestinationProfile({
      ...createDefaultStudioProfile().destination,
      streamKey: " rtmps://a.rtmps.youtube.com/live2/abcd-1234-efgh "
    });

    expect(destination.serverUrl).toBe("rtmps://a.rtmps.youtube.com/live2");
    expect(destination.streamKey).toBe("abcd-1234-efgh");
    expect(buildPublishUrl(destination)).toBe("rtmps://a.rtmps.youtube.com/live2/abcd-1234-efgh");
  });

  it("normalizes full Twitch publish URLs pasted into the stream key field", () => {
    const twitchProfile = applyDestinationPreset(createDefaultStudioProfile(), "twitch-auto");
    const destination = normalizeDestinationProfile({
      ...twitchProfile.destination,
      streamKey: "rtmp://ingest.global-contribute.live-video.net/app/live_user_123456"
    });

    expect(destination.serverUrl).toBe("rtmp://ingest.global-contribute.live-video.net/app");
    expect(destination.streamKey).toBe("live_user_123456");
    expect(buildPublishUrl(destination)).toBe("rtmp://ingest.global-contribute.live-video.net/app/live_user_123456");
  });

  it("extracts a missing key from known platform server URLs", () => {
    const profile = normalizeStudioProfile({
      destination: {
        ...createDefaultStudioProfile().destination,
        serverUrl: "rtmps://a.rtmps.youtube.com/live2/abcd-1234-efgh",
        streamKey: ""
      }
    });

    expect(profile.destination.serverUrl).toBe("rtmps://a.rtmps.youtube.com/live2");
    expect(profile.destination.streamKey).toBe("abcd-1234-efgh");
  });

  it("preserves the current host when only the protocol is changed", () => {
    expect(serverUrlWithProtocol("rtmp://ingest.global-contribute.live-video.net/app", "rtmps")).toBe(
      "rtmps://ingest.global-contribute.live-video.net/app"
    );
  });

  it("applies mic effect presets while keeping monitor preferences", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      micEffects: {
        ...createDefaultStudioProfile().micEffects,
        monitorEnabled: true,
        monitorVolume: 0.4
      }
    };

    const updated = applyMicEffectPreset(profile, "broadcast");

    expect(updated.micEffects.presetId).toBe("broadcast");
    expect(updated.micEffects.inputGainDb).toBe(3);
    expect(updated.micEffects.compression).toBe(0.62);
    expect(updated.micEffects.monitorEnabled).toBe(true);
    expect(updated.micEffects.monitorVolume).toBe(0.4);
  });

  it("clamps persisted mic effect values into native-safe ranges", () => {
    const profile = normalizeStudioProfile({
      micEffects: {
        ...createDefaultStudioProfile().micEffects,
        inputGainDb: 80,
        noiseGateDb: -100,
        compression: 2,
        monitorVolume: 5
      }
    });

    expect(profile.micEffects.inputGainDb).toBe(12);
    expect(profile.micEffects.noiseGateDb).toBe(-70);
    expect(profile.micEffects.compression).toBe(1);
    expect(profile.micEffects.monitorVolume).toBe(1);
  });

  it("normalizes broadcast mixer channels into safe ranges", () => {
    const profile = normalizeStudioProfile({
      broadcastMixer: {
        mic: {
          volume: 5,
          muted: true
        },
        appAudio: {
          volume: -2,
          muted: false
        },
        chatReadout: {
          volume: 0.4,
          muted: true
        }
      }
    });

    expect(profile.broadcastMixer.mic).toEqual({ volume: 1, muted: true });
    expect(profile.broadcastMixer.appAudio).toEqual({ volume: 0, muted: false });
    expect(profile.broadcastMixer.chatReadout).toEqual({ volume: 0.4, muted: true });
  });

  it("applies emergency broadcast mute without changing destination settings", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: "secret-key"
      },
      micEffects: {
        ...createDefaultStudioProfile().micEffects,
        monitorEnabled: true,
        monitorVolume: 0.45
      }
    };

    const muted = applyEmergencyBroadcastMute(profile);

    expect(muted.destination.streamKey).toBe("secret-key");
    expect(muted.broadcastMixer).toEqual({
      mic: { volume: 0, muted: true },
      appAudio: { volume: 0, muted: true },
      chatReadout: { volume: 0, muted: true }
    });
    expect(muted.micEffects.monitorEnabled).toBe(false);
    expect(muted.micEffects.monitorVolume).toBe(0);
  });

  it("normalizes face tracking values for persisted profiles", () => {
    const profile = normalizeStudioProfile({
      faceTracking: {
        ...createDefaultStudioProfile().faceTracking,
        enabled: true,
        trackingStrength: 9,
        deadZone: -2,
        maxMotionStep: 3,
        lostReturnSpeed: -1,
        illustrationDeform: 2,
        hairSway: -2,
        eyeDeform: 2,
        mouthDeform: -2,
        mouthSensitivity: 0,
        neutralRoll: -8
      }
    });

    expect(profile.faceTracking.enabled).toBe(true);
    expect(profile.faceTracking.trackingStrength).toBe(1);
    expect(profile.faceTracking.deadZone).toBe(0);
    expect(profile.faceTracking.maxMotionStep).toBe(1);
    expect(profile.faceTracking.lostReturnSpeed).toBe(0);
    expect(profile.faceTracking.illustrationDeform).toBe(1);
    expect(profile.faceTracking.hairSway).toBe(0);
    expect(profile.faceTracking.eyeDeform).toBe(1);
    expect(profile.faceTracking.mouthDeform).toBe(0);
    expect(profile.faceTracking.mouthSensitivity).toBe(0.2);
    expect(profile.faceTracking.neutralRoll).toBe(-1);
  });

  it("normalizes persisted platform chat settings", () => {
    const profile = normalizeStudioProfile({
      platformChat: {
        enabled: true,
        platform: "twitch",
        youtubeLiveChatId: "",
        twitchChannel: "  @MachaChannel  "
      }
    });

    expect(profile.platformChat).toEqual({
      enabled: true,
      platform: "twitch",
      youtubeLiveChatId: "",
      twitchChannel: "machachannel"
    });
  });

  it("tolerates partial persisted platform chat settings", () => {
    const profile = normalizeStudioProfile({
      platformChat: {
        enabled: true,
        platform: "twitch"
      } as any
    });

    expect(profile.platformChat).toEqual({
      enabled: true,
      platform: "twitch",
      youtubeLiveChatId: "",
      twitchChannel: ""
    });
  });
});
