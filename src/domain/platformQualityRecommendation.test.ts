import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile, type QualityProfile, type StreamPlatform, type StudioProfile } from "./profiles";
import {
  applyPlatformQualityRecommendation,
  createPlatformQualityRecommendation,
  createPlatformQualitySafetyIssues
} from "./platformQualityRecommendation";

type GuidedPlatform = Exclude<StreamPlatform, "custom">;

const createProfile = (
  platform: StreamPlatform,
  qualityUpdate: Partial<QualityProfile> = {}
): StudioProfile => {
  const profile = createDefaultStudioProfile();

  return {
    ...profile,
    destination: {
      ...profile.destination,
      platform
    },
    quality: {
      ...profile.quality,
      id: "quality-test",
      name: "Test quality",
      ...qualityUpdate
    }
  };
};

const matrixCases: Array<{
  platform: GuidedPlatform;
  platformLabel: string;
  sourceLabel: string;
  targetId: string;
  height: 720 | 1080;
  width: 1280 | 1920;
  fps: 30 | 60;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
}> = [
  {
    platform: "youtube-live",
    platformLabel: "YouTube Live",
    sourceLabel: "YouTube H.264 live guidance",
    targetId: "quality-platform-youtube-live",
    width: 1280,
    height: 720,
    fps: 30,
    videoBitrateKbps: 4000,
    audioBitrateKbps: 128
  },
  {
    platform: "youtube-live",
    platformLabel: "YouTube Live",
    sourceLabel: "YouTube H.264 live guidance",
    targetId: "quality-platform-youtube-live",
    width: 1280,
    height: 720,
    fps: 60,
    videoBitrateKbps: 6000,
    audioBitrateKbps: 128
  },
  {
    platform: "youtube-live",
    platformLabel: "YouTube Live",
    sourceLabel: "YouTube H.264 live guidance",
    targetId: "quality-platform-youtube-live",
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrateKbps: 10000,
    audioBitrateKbps: 128
  },
  {
    platform: "youtube-live",
    platformLabel: "YouTube Live",
    sourceLabel: "YouTube H.264 live guidance",
    targetId: "quality-platform-youtube-live",
    width: 1920,
    height: 1080,
    fps: 60,
    videoBitrateKbps: 12000,
    audioBitrateKbps: 128
  },
  {
    platform: "twitch",
    platformLabel: "Twitch",
    sourceLabel: "Twitch classic broadcast guidance",
    targetId: "quality-platform-twitch",
    width: 1280,
    height: 720,
    fps: 30,
    videoBitrateKbps: 3000,
    audioBitrateKbps: 96
  },
  {
    platform: "twitch",
    platformLabel: "Twitch",
    sourceLabel: "Twitch classic broadcast guidance",
    targetId: "quality-platform-twitch",
    width: 1280,
    height: 720,
    fps: 60,
    videoBitrateKbps: 4500,
    audioBitrateKbps: 96
  },
  {
    platform: "twitch",
    platformLabel: "Twitch",
    sourceLabel: "Twitch classic broadcast guidance",
    targetId: "quality-platform-twitch",
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrateKbps: 4500,
    audioBitrateKbps: 96
  },
  {
    platform: "twitch",
    platformLabel: "Twitch",
    sourceLabel: "Twitch classic broadcast guidance",
    targetId: "quality-platform-twitch",
    width: 1920,
    height: 1080,
    fps: 60,
    videoBitrateKbps: 6000,
    audioBitrateKbps: 96
  }
];

describe("platform quality recommendation", () => {
  it.each(matrixCases)(
    "targets $platform $height p at $fps fps",
    ({
      platform,
      platformLabel,
      sourceLabel,
      targetId,
      width,
      height,
      fps,
      videoBitrateKbps,
      audioBitrateKbps
    }) => {
      const recommendation = createPlatformQualityRecommendation(
        createProfile(platform, {
          width,
          height,
          fps,
          videoBitrateKbps: 900,
          audioBitrateKbps: 64
        })
      );

      expect(recommendation).toMatchObject({
        platform,
        platformLabel,
        sourceLabel,
        status: "adjust",
        target: {
          id: targetId,
          name: `${platformLabel} ${height}p${fps}`,
          width,
          height,
          fps,
          videoBitrateKbps,
          audioBitrateKbps
        },
        estimatedUploadKbps: Math.round((videoBitrateKbps + audioBitrateKbps) * 1.25)
      });
    }
  );

  it.each([
    { currentHeight: 540, targetWidth: 960, targetHeight: 540, videoBitrateKbps: 4000 },
    { currentHeight: 541, targetWidth: 1280, targetHeight: 720, videoBitrateKbps: 4000 },
    { currentHeight: 720, targetWidth: 1280, targetHeight: 720, videoBitrateKbps: 4000 },
    { currentHeight: 721, targetWidth: 1920, targetHeight: 1080, videoBitrateKbps: 10000 }
  ])(
    "maps height $currentHeight to $targetHeight p",
    ({ currentHeight, targetWidth, targetHeight, videoBitrateKbps }) => {
      const recommendation = createPlatformQualityRecommendation(
        createProfile("youtube-live", { width: 1000, height: currentHeight, fps: 30 })
      );

      expect(recommendation.target).toMatchObject({
        width: targetWidth,
        height: targetHeight,
        videoBitrateKbps
      });
    }
  );

  it.each([
    { platform: "youtube-live" as const, fps: 30 as const, videoBitrateKbps: 4000 },
    { platform: "youtube-live" as const, fps: 60 as const, videoBitrateKbps: 6000 },
    { platform: "twitch" as const, fps: 30 as const, videoBitrateKbps: 3000 },
    { platform: "twitch" as const, fps: 60 as const, videoBitrateKbps: 4500 }
  ])("targets $platform 540p at $fps fps", ({ platform, fps, videoBitrateKbps }) => {
    const recommendation = createPlatformQualityRecommendation(
      createProfile(platform, { width: 960, height: 540, fps })
    );

    expect(recommendation.target).toMatchObject({
      width: 960,
      height: 540,
      fps,
      videoBitrateKbps
    });
  });

  it("returns a not-applicable custom recommendation and does not apply it", () => {
    const profile = createProfile("custom", { width: 2560, height: 1440, videoBitrateKbps: 9000 });

    expect(createPlatformQualityRecommendation(profile)).toEqual({
      platform: "custom",
      platformLabel: "Custom",
      status: "not-applicable",
      sourceLabel: null,
      summary: "Platform quality guidance does not apply to a custom destination.",
      target: null,
      changes: [],
      estimatedUploadKbps: null
    });
    expect(applyPlatformQualityRecommendation(profile)).toBe(profile);
  });

  it("recognizes an exact target and preserves the profile identity when applied", () => {
    const profile = createProfile("youtube-live", {
      width: 1920,
      height: 1080,
      fps: 60,
      videoBitrateKbps: 12000,
      audioBitrateKbps: 128
    });
    const recommendation = createPlatformQualityRecommendation(profile);

    expect(recommendation.status).toBe("matched");
    expect(recommendation.changes).toEqual([]);
    expect(applyPlatformQualityRecommendation(profile)).toBe(profile);
  });

  it("lists differing settings in a deterministic order", () => {
    const recommendation = createPlatformQualityRecommendation(
      createProfile("youtube-live", {
        width: 1600,
        height: 900,
        fps: 30,
        videoBitrateKbps: 7000,
        audioBitrateKbps: 192
      })
    );

    expect(recommendation.changes).toEqual([
      "Resolution: 1600x900 to 1920x1080",
      "Video bitrate: 7000 kbps to 10000 kbps",
      "Audio bitrate: 192 kbps to 128 kbps"
    ]);
  });

  it("immutably applies a freshly computed target", () => {
    const profile = createProfile("twitch", {
      width: 1280,
      height: 720,
      fps: 60,
      videoBitrateKbps: 5500,
      audioBitrateKbps: 160
    });
    const originalQuality = profile.quality;

    const updated = applyPlatformQualityRecommendation(profile);

    expect(updated).not.toBe(profile);
    expect(updated.destination).toBe(profile.destination);
    expect(updated.quality).not.toBe(originalQuality);
    expect(updated.quality).toEqual({
      id: "quality-platform-twitch",
      name: "Twitch 720p60",
      width: 1280,
      height: 720,
      fps: 60,
      videoBitrateKbps: 4500,
      audioBitrateKbps: 96
    });
    expect(profile.quality).toBe(originalQuality);
    expect(profile.quality.videoBitrateKbps).toBe(5500);
  });

  it("down-targets output above 1080p and estimates upload from the target", () => {
    const recommendation = createPlatformQualityRecommendation(
      createProfile("youtube-live", {
        width: 2560,
        height: 1440,
        fps: 30,
        videoBitrateKbps: 10000,
        audioBitrateKbps: 128
      })
    );

    expect(recommendation.target).toMatchObject({ width: 1920, height: 1080 });
    expect(recommendation.changes).toEqual(["Resolution: 2560x1440 to 1920x1080"]);
    expect(recommendation.estimatedUploadKbps).toBe(12660);
  });
});

describe("platform quality safety issues", () => {
  it("reports every Twitch safety issue in deterministic order", () => {
    const issues = createPlatformQualitySafetyIssues(
      createProfile("twitch", {
        width: 2560,
        height: 1440,
        videoBitrateKbps: 6001,
        audioBitrateKbps: 161
      })
    );

    expect(issues).toEqual([
      {
        code: "quality-twitch-video-bitrate",
        severity: "warning",
        message: "Twitch video bitrate exceeds the 6000 kbps classic broadcast guidance."
      },
      {
        code: "quality-twitch-audio-bitrate",
        severity: "error",
        message: "Twitch audio bitrate exceeds the 160 kbps classic broadcast limit."
      },
      {
        code: "quality-twitch-resolution",
        severity: "warning",
        message: "Twitch output exceeds the 1920x1080 classic broadcast guidance."
      }
    ]);
  });

  it("does not report Twitch issues at the exact safety thresholds", () => {
    expect(
      createPlatformQualitySafetyIssues(
        createProfile("twitch", {
          width: 1920,
          height: 1080,
          videoBitrateKbps: 6000,
          audioBitrateKbps: 160
        })
      )
    ).toEqual([]);
  });

  it("warns when either YouTube output dimension exceeds the app-tested mobile range", () => {
    expect(createPlatformQualitySafetyIssues(createProfile("youtube-live", { width: 1922, height: 1080 }))).toEqual([
      {
        code: "quality-youtube-mobile-resolution",
        severity: "warning",
        message: "YouTube output exceeds the app-tested mobile H.264 range of 1920x1080."
      }
    ]);
    expect(createPlatformQualitySafetyIssues(createProfile("youtube-live", { width: 1920, height: 1082 }))).toHaveLength(1);
  });

  it("does not add platform safety issues for custom or in-range YouTube profiles", () => {
    expect(
      createPlatformQualitySafetyIssues(
        createProfile("custom", {
          width: 3840,
          height: 2160,
          videoBitrateKbps: 12000,
          audioBitrateKbps: 320
        })
      )
    ).toEqual([]);
    expect(
      createPlatformQualitySafetyIssues(
        createProfile("youtube-live", {
          width: 1920,
          height: 1080,
          videoBitrateKbps: 12000,
          audioBitrateKbps: 320
        })
      )
    ).toEqual([]);
  });
});
