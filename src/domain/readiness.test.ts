import { describe, expect, it } from "vitest";
import { createDefaultScene } from "./scene";
import { applyDestinationPreset, createDefaultStudioProfile, legacyCustomDestinationProfile } from "./profiles";
import { createReadinessReport } from "./readiness";

describe("stream readiness", () => {
  it("blocks the default profile until a stream key is set", () => {
    const report = createReadinessReport(createDefaultScene(), createDefaultStudioProfile());

    expect(report.canStart).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("stream-key-required");
  });

  it("blocks placeholder custom endpoints from going live", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...legacyCustomDestinationProfile,
        streamKey: "abcd-1234-efgh"
      }
    };

    const report = createReadinessReport(createDefaultScene(), profile);

    expect(report.canStart).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("placeholder-endpoint");
  });

  it("accepts a valid RTMPS profile", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        serverUrl: "rtmps://live.example-stream.test/app",
        streamKey: "abcd-1234-efgh"
      }
    };

    const report = createReadinessReport(createDefaultScene(), profile);

    expect(report.canStart).toBe(true);
    expect(report.errorCount).toBe(0);
    expect(report.issues.map((issue) => issue.code)).toContain("scene-native-composition-preview-only-overlays");
  });

  it("accepts the YouTube Live preset with a stream key", () => {
    const profile = {
      ...applyDestinationPreset(createDefaultStudioProfile(), "youtube-live-rtmps"),
      destination: {
        ...applyDestinationPreset(createDefaultStudioProfile(), "youtube-live-rtmps").destination,
        streamKey: "abcd-1234-efgh"
      }
    };

    const report = createReadinessReport(createDefaultScene(), profile);

    expect(report.canStart).toBe(true);
    expect(report.errorCount).toBe(0);
  });

  it("accepts the Twitch preset while warning about RTMP transport", () => {
    const profile = {
      ...applyDestinationPreset(createDefaultStudioProfile(), "twitch-auto"),
      destination: {
        ...applyDestinationPreset(createDefaultStudioProfile(), "twitch-auto").destination,
        streamKey: "live_user_123456"
      }
    };

    const report = createReadinessReport(createDefaultScene(), profile);

    expect(report.canStart).toBe(true);
    expect(report.errorCount).toBe(0);
    expect(report.issues.map((issue) => issue.code)).toContain("rtmp-not-encrypted");
  });

  it("blocks protocol mismatches", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        protocol: "rtmp" as const,
        serverUrl: "rtmps://live.example-stream.test/app",
        streamKey: "abcd-1234-efgh"
      }
    };

    const report = createReadinessReport(createDefaultScene(), profile);

    expect(report.canStart).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("protocol-mismatch");
  });

  it("trims destination values before start", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        serverUrl: "  rtmps://live.example-stream.test/app  ",
        streamKey: "  key-123456  "
      }
    };

    const report = createReadinessReport(createDefaultScene(), profile);

    expect(report.sanitizedProfile.destination.serverUrl).toBe("rtmps://live.example-stream.test/app");
    expect(report.sanitizedProfile.destination.streamKey).toBe("key-123456");
  });

  it("extracts a missing YouTube stream key from a pasted publish URL before start", () => {
    const profile = {
      ...applyDestinationPreset(createDefaultStudioProfile(), "youtube-live-rtmps"),
      destination: {
        ...applyDestinationPreset(createDefaultStudioProfile(), "youtube-live-rtmps").destination,
        serverUrl: "rtmps://a.rtmps.youtube.com/live2/demo-1234-segment",
        streamKey: ""
      }
    };

    const report = createReadinessReport(createDefaultScene(), profile);

    expect(report.canStart).toBe(true);
    expect(report.sanitizedProfile.destination.serverUrl).toBe("rtmps://a.rtmps.youtube.com/live2");
    expect(report.sanitizedProfile.destination.streamKey).toBe("demo-1234-segment");
    expect(report.issues.map((issue) => issue.code)).not.toContain("server-url-contains-stream-key");
    expect(report.issues.map((issue) => issue.code)).not.toContain("stream-key-required");
  });

  it("extracts a YouTube stream key from a full publish URL pasted into the key field", () => {
    const profile = {
      ...applyDestinationPreset(createDefaultStudioProfile(), "youtube-live-rtmps"),
      destination: {
        ...applyDestinationPreset(createDefaultStudioProfile(), "youtube-live-rtmps").destination,
        streamKey: "rtmps://a.rtmps.youtube.com/live2/demo-1234-segment"
      }
    };

    const report = createReadinessReport(createDefaultScene(), profile);

    expect(report.canStart).toBe(true);
    expect(report.sanitizedProfile.destination.serverUrl).toBe("rtmps://a.rtmps.youtube.com/live2");
    expect(report.sanitizedProfile.destination.streamKey).toBe("demo-1234-segment");
    expect(report.issues.map((issue) => issue.code)).not.toContain("stream-key-url");
  });

  it("blocks platform server URLs that appear to include a stream key", () => {
    const profile = {
      ...applyDestinationPreset(createDefaultStudioProfile(), "youtube-live-rtmps"),
      destination: {
        ...applyDestinationPreset(createDefaultStudioProfile(), "youtube-live-rtmps").destination,
        serverUrl: "rtmps://a.rtmps.youtube.com/live2/demo-1234-segment",
        streamKey: "separate-key"
      }
    };

    const report = createReadinessReport(createDefaultScene(), profile);

    expect(report.canStart).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("server-url-contains-stream-key");
  });

  it("blocks full RTMP URLs pasted into the stream key field", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        serverUrl: "rtmps://live.example-stream.test/app",
        streamKey: "rtmps://live.example-stream.test/app/demo-1234-segment"
      }
    };

    const report = createReadinessReport(createDefaultScene(), profile);

    expect(report.canStart).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("stream-key-url");
  });

  it("warns when mic monitor is allowed through speakers", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      micEffects: {
        ...createDefaultStudioProfile().micEffects,
        monitorEnabled: true,
        monitorHeadphonesOnly: false
      }
    };

    const report = createReadinessReport(createDefaultScene(), profile);

    expect(report.issues.map((issue) => issue.code)).toContain("mic-monitor-speaker-feedback");
  });

  it("warns when mic gain and monitor volume are very high", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      micEffects: {
        ...createDefaultStudioProfile().micEffects,
        inputGainDb: 10,
        monitorEnabled: true,
        monitorVolume: 0.9
      }
    };

    const report = createReadinessReport(createDefaultScene(), profile);

    expect(report.issues.map((issue) => issue.code)).toContain("mic-gain-hot");
    expect(report.issues.map((issue) => issue.code)).toContain("mic-monitor-loud");
  });

  it("warns when face tracking is enabled but not production-ready", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      faceTracking: {
        ...createDefaultStudioProfile().faceTracking,
        enabled: true,
        inputMode: "simulated" as const
      }
    };

    const report = createReadinessReport(createDefaultScene(), profile);

    expect(report.issues.map((issue) => issue.code)).toContain("face-tracking-not-production-ready");
    expect(report.issues.find((issue) => issue.code === "face-tracking-not-production-ready")?.field).toBe("faceTracking");
  });
});
