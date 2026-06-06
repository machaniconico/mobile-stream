export type StreamProtocol = "rtmp" | "rtmps";

export interface DestinationProfile {
  id: string;
  name: string;
  protocol: StreamProtocol;
  serverUrl: string;
  streamKey: string;
}

export interface QualityProfile {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: 30 | 60;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
}

export interface AvatarProfile {
  id: string;
  name: string;
  mode: "pngtuber" | "live2d";
  assetPath: string;
  defaultExpression: string;
  scale: number;
}

export interface StudioProfile {
  destination: DestinationProfile;
  quality: QualityProfile;
  avatar: AvatarProfile;
}

export const defaultDestinationProfile: DestinationProfile = {
  id: "dest-custom",
  name: "Custom RTMPS",
  protocol: "rtmps",
  serverUrl: "rtmps://example.com/live",
  streamKey: ""
};

export const qualityProfiles: QualityProfile[] = [
  {
    id: "quality-balanced",
    name: "Balanced 720p",
    width: 1280,
    height: 720,
    fps: 30,
    videoBitrateKbps: 3500,
    audioBitrateKbps: 128
  },
  {
    id: "quality-sharp",
    name: "Sharp 1080p",
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrateKbps: 6000,
    audioBitrateKbps: 160
  },
  {
    id: "quality-motion",
    name: "Motion 720p60",
    width: 1280,
    height: 720,
    fps: 60,
    videoBitrateKbps: 5500,
    audioBitrateKbps: 160
  }
];

export const defaultAvatarProfile: AvatarProfile = {
  id: "avatar-default",
  name: "Default PNGTuber",
  mode: "pngtuber",
  assetPath: "assets/avatar/default",
  defaultExpression: "neutral",
  scale: 1
};

export const createDefaultStudioProfile = (): StudioProfile => ({
  destination: defaultDestinationProfile,
  quality: qualityProfiles[0],
  avatar: defaultAvatarProfile
});

export const redactStreamKey = (streamKey: string): string => {
  if (!streamKey) {
    return "not set";
  }
  if (streamKey.length <= 6) {
    return "*".repeat(streamKey.length);
  }
  return `${streamKey.slice(0, 3)}${"*".repeat(Math.max(3, streamKey.length - 6))}${streamKey.slice(-3)}`;
};
