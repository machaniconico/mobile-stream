import { describe, expect, it } from "vitest";
import {
  applyDestinationPreset,
  applyMicEffectPreset,
  buildPublishUrl,
  createDefaultStudioProfile,
  markDestinationCustom,
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
        mouthSensitivity: 0,
        neutralRoll: -8
      }
    });

    expect(profile.faceTracking.enabled).toBe(true);
    expect(profile.faceTracking.trackingStrength).toBe(1);
    expect(profile.faceTracking.mouthSensitivity).toBe(0.2);
    expect(profile.faceTracking.neutralRoll).toBe(-1);
  });
});
