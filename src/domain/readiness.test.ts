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
});
