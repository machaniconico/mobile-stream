import type { QualityProfile, StreamPlatform, StudioProfile } from "./profiles";

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
  tier: ResolutionTier;
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
  const resolution = resolutionTargetForHeight(profile.quality.height);
  const target: QualityProfile = {
    id: guidance.targetId,
    name: `${guidance.platformLabel} ${resolution.height}p${profile.quality.fps}`,
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
  const exceeds1080p = quality.width > 1920 || quality.height > 1080;

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

const resolutionTargetForHeight = (height: number): ResolutionTarget => {
  if (height <= 540) {
    return { width: 960, height: 540, tier: "up-to-720" };
  }

  if (height <= 720) {
    return { width: 1280, height: 720, tier: "up-to-720" };
  }

  return { width: 1920, height: 1080, tier: "1080" };
};

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
