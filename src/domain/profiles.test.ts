import { describe, expect, it } from "vitest";
import {
  applyDestinationPreset,
  applyMicEffectPreset,
  buildPublishUrl,
  clearStreamKey,
  createDefaultStudioProfile,
  markDestinationCustom,
  normalizeDestinationProfile,
  normalizeStudioProfile,
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
    expect(profile.avatar.id).toBe("avatar-default");
    expect(profile.micEffects.presetId).toBe("clean");
    expect(profile.micEffects.monitorHeadphonesOnly).toBe(true);
    expect(profile.faceTracking.enabled).toBe(false);
    expect(profile.faceTracking.inputMode).toBe("simulated");
    expect(profile.platformChat.enabled).toBe(false);
    expect(profile.platformChat.platform).toBe("youtube");
    expect(profile.platformPublishing.title).toBe("MobileLiveCaster Live");
    expect(profile.platformPublishing.privacyStatus).toBe("private");
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
        youtubeLiveChatId: " chat-id ",
        youtubeBroadcastStatus: " live ",
        youtubeStreamStatus: " active ",
        youtubeStreamHealthStatus: " good ",
        youtubeStreamHealthIssues: [" warning: bitrateLow ", "", " error: noAudioStream "],
        youtubeStatusCheckedAt: "2026-06-23 12:34:56Z",
        twitchCategory: " Just Chatting ",
        twitchCategoryId: " 509658 ",
        twitchLanguage: " JA ",
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
    expect(profile.platformPublishing.youtubeBroadcastStatus).toBe("live");
    expect(profile.platformPublishing.youtubeStreamStatus).toBe("active");
    expect(profile.platformPublishing.youtubeStreamHealthStatus).toBe("good");
    expect(profile.platformPublishing.youtubeStreamHealthIssues).toEqual(["warning: bitrateLow", "error: noAudioStream"]);
    expect(profile.platformPublishing.youtubeStatusCheckedAt).toBe("2026-06-23T12:34:56.000Z");
    expect(profile.platformPublishing.twitchCategoryId).toBe("509658");
    expect(profile.platformPublishing.twitchLanguage).toBe("ja");
    expect(profile.platformPublishing.twitchLiveStatus).toBe("live");
    expect(profile.platformPublishing.twitchViewerCount).toBe(13);
    expect(profile.platformPublishing.twitchStartedAt).toBe("2026-06-22T12:00:00Z");
    expect(profile.platformPublishing.twitchStatusCheckedAt).toBe("");
  });

  it("removes stream keys before persistence", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: "secret-stream-key"
      }
    };

    expect(stripSensitiveProfileData(profile).destination.streamKey).toBe("");
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
