import {
  getQualityOrientation,
  type QualityOrientation,
  type QualityProfile,
  type StreamPlatform,
  type StudioProfile
} from "./profiles";

export type PlatformQualityRecommendationStatus = "not-applicable" | "matched" | "adjust";

export interface PlatformQualityRecommendation {
  platform: StreamPlatform;
  platformLabel: string;
  status: PlatformQualityRecommendationStatus;
  sourceLabel: string | null;
  summary: string;
  target: QualityProfile | null;
  changes: string[];
  estimatedUploadKbps: number | null;
}

export interface PlatformQualitySafetyIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
}

type GuidedPlatform = Exclude<StreamPlatform, "custom">;
type ResolutionTier = "up-to-720" | "1080";

interface PlatformGuidance {
  platformLabel: string;
  sourceLabel: string;
  targetId: string;
  audioBitrateKbps: number;
  videoBitrateKbps: Record<ResolutionTier, Record<QualityProfile["fps"], number>>;
}

interface ResolutionTarget {
  width: number;
  height: number;
  shortEdge: 540 | 720 | 1080;
  tier: ResolutionTier;
  orientation: QualityOrientation;
}

const guidanceByPlatform: Record<GuidedPlatform, PlatformGuidance> = {
  "youtube-live": {
    platformLabel: "YouTube Live",
    sourceLabel: "YouTube H.264 live guidance",
    targetId: "quality-platform-youtube-live",
    audioBitrateKbps: 128,
    videoBitrateKbps: {
      "up-to-720": { 30: 4000, 60: 6000 },
      "1080": { 30: 10000, 60: 12000 }
    }
  },
  twitch: {
    platformLabel: "Twitch",
    sourceLabel: "Twitch classic broadcast guidance",
    targetId: "quality-platform-twitch",
    audioBitrateKbps: 96,
    videoBitrateKbps: {
      "up-to-720": { 30: 3000, 60: 4500 },
      "1080": { 30: 4500, 60: 6000 }
    }
  }
};

export const createPlatformQualityRecommendation = (
  profile: StudioProfile
): PlatformQualityRecommendation => {
  const platform = profile.destination.platform;

  if (platform === "custom") {
    return {
      platform,
      platformLabel: "Custom",
      status: "not-applicable",
      sourceLabel: null,
      summary: "Platform quality guidance does not apply to a custom destination.",
      target: null,
      changes: [],
      estimatedUploadKbps: null
    };
  }

  const guidance = guidanceByPlatform[platform];
  const resolution = resolutionTargetForQuality(profile.quality);
  const target: QualityProfile = {
    id: guidance.targetId,
    name: `${guidance.platformLabel} ${resolution.shortEdge}p${profile.quality.fps}${
      resolution.orientation === "portrait" ? " Portrait" : ""
    }`,
    width: resolution.width,
    height: resolution.height,
    fps: profile.quality.fps,
    videoBitrateKbps: guidance.videoBitrateKbps[resolution.tier][profile.quality.fps],
    audioBitrateKbps: guidance.audioBitrateKbps
  };
  const changes = describeQualityChanges(profile.quality, target);
  const status: PlatformQualityRecommendationStatus = changes.length === 0 ? "matched" : "adjust";

  return {
    platform,
    platformLabel: guidance.platformLabel,
    status,
    sourceLabel: guidance.sourceLabel,
    summary:
      status === "matched"
        ? `Current quality matches ${guidance.platformLabel} guidance.`
        : `Adjust quality to ${target.name}.`,
    target,
    changes,
    estimatedUploadKbps: Math.round((target.videoBitrateKbps + target.audioBitrateKbps) * 1.25)
  };
};

export const applyPlatformQualityRecommendation = (profile: StudioProfile): StudioProfile => {
  const recommendation = createPlatformQualityRecommendation(profile);

  if (!recommendation.target || recommendation.status === "matched") {
    return profile;
  }

  return {
    ...profile,
    quality: recommendation.target
  };
};

export const createPlatformQualitySafetyIssues = (profile: StudioProfile): PlatformQualitySafetyIssue[] => {
  const { platform } = profile.destination;
  const { quality } = profile;
  const orientation = getQualityOrientation(quality);
  const longEdge = Math.max(quality.width, quality.height);
  const shortEdge = Math.min(quality.width, quality.height);
  const exceeds1080p = longEdge > 1920 || shortEdge > 1080;

  if (platform === "twitch") {
    const issues: PlatformQualitySafetyIssue[] = [];

    if (quality.videoBitrateKbps > 6000) {
      issues.push({
        code: "quality-twitch-video-bitrate",
        severity: "warning",
        message: "Twitch video bitrate exceeds the 6000 kbps classic broadcast guidance."
      });
    }

    if (quality.audioBitrateKbps > 160) {
      issues.push({
        code: "quality-twitch-audio-bitrate",
        severity: "error",
        message: "Twitch audio bitrate exceeds the 160 kbps classic broadcast limit."
      });
    }

    if (exceeds1080p) {
      issues.push({
        code: "quality-twitch-resolution",
        severity: "warning",
        message: "Twitch output exceeds the 1920x1080 classic broadcast guidance."
      });
    }

    if (orientation === "portrait") {
      issues.push({
        code: "quality-twitch-portrait-single-track",
        severity: "warning",
        message:
          "Portrait output is a single classic RTMP track; it does not enable Twitch Dual Format/Enhanced Broadcasting."
      });
    }

    return issues;
  }

  if (platform === "youtube-live" && exceeds1080p) {
    return [
      {
        code: "quality-youtube-mobile-resolution",
        severity: "warning",
        message: "YouTube output exceeds the app-tested mobile H.264 range of 1920x1080."
      }
    ];
  }

  return [];
};

const resolutionTargetForQuality = (
  quality: Pick<QualityProfile, "width" | "height">
): ResolutionTarget => {
  const orientation = getQualityOrientation(quality);
  const shortEdge = Math.min(quality.width, quality.height);

  if (shortEdge <= 540) {
    return createResolutionTarget(960, 540, "up-to-720", orientation);
  }

  if (shortEdge <= 720) {
    return createResolutionTarget(1280, 720, "up-to-720", orientation);
  }

  return createResolutionTarget(1920, 1080, "1080", orientation);
};

const createResolutionTarget = (
  landscapeWidth: number,
  landscapeHeight: 540 | 720 | 1080,
  tier: ResolutionTier,
  orientation: QualityOrientation
): ResolutionTarget => ({
  width: orientation === "portrait" ? landscapeHeight : landscapeWidth,
  height: orientation === "portrait" ? landscapeWidth : landscapeHeight,
  shortEdge: landscapeHeight,
  tier,
  orientation
});

const describeQualityChanges = (current: QualityProfile, target: QualityProfile): string[] => {
  const changes: string[] = [];

  if (current.width !== target.width || current.height !== target.height) {
    changes.push(`Resolution: ${current.width}x${current.height} to ${target.width}x${target.height}`);
  }
  if (current.fps !== target.fps) {
    changes.push(`Frame rate: ${current.fps} fps to ${target.fps} fps`);
  }
  if (current.videoBitrateKbps !== target.videoBitrateKbps) {
    changes.push(`Video bitrate: ${current.videoBitrateKbps} kbps to ${target.videoBitrateKbps} kbps`);
  }
  if (current.audioBitrateKbps !== target.audioBitrateKbps) {
    changes.push(`Audio bitrate: ${current.audioBitrateKbps} kbps to ${target.audioBitrateKbps} kbps`);
  }

  return changes;
};
