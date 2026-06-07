import { describe, expect, it } from "vitest";
import {
  applyDestinationPreset,
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
});
