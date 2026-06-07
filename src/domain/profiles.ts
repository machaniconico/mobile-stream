export type StreamProtocol = "rtmp" | "rtmps";
export type StreamPlatform = "custom" | "youtube-live" | "twitch";
export type DestinationPresetId =
  | "youtube-live-rtmps"
  | "twitch-auto"
  | "twitch-tokyo"
  | "custom-rtmps"
  | "custom-rtmp";

export interface DestinationPreset {
  id: DestinationPresetId;
  name: string;
  platform: StreamPlatform;
  protocol: StreamProtocol;
  serverUrl: string;
  streamKeyLabel: string;
}

export interface DestinationProfile {
  id: string;
  name: string;
  platform: StreamPlatform;
  presetId: DestinationPresetId;
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

export const destinationPresets: DestinationPreset[] = [
  {
    id: "youtube-live-rtmps",
    name: "YouTube Live",
    platform: "youtube-live",
    protocol: "rtmps",
    serverUrl: "rtmps://a.rtmps.youtube.com/live2",
    streamKeyLabel: "Stream key"
  },
  {
    id: "twitch-auto",
    name: "Twitch Auto",
    platform: "twitch",
    protocol: "rtmp",
    serverUrl: "rtmp://ingest.global-contribute.live-video.net/app",
    streamKeyLabel: "Stream key"
  },
  {
    id: "twitch-tokyo",
    name: "Twitch Tokyo",
    platform: "twitch",
    protocol: "rtmp",
    serverUrl: "rtmp://apn10.contribute.live-video.net/app",
    streamKeyLabel: "Stream key"
  },
  {
    id: "custom-rtmps",
    name: "Custom RTMPS",
    platform: "custom",
    protocol: "rtmps",
    serverUrl: "rtmps://example.com/live",
    streamKeyLabel: "Stream key"
  },
  {
    id: "custom-rtmp",
    name: "Custom RTMP",
    platform: "custom",
    protocol: "rtmp",
    serverUrl: "rtmp://example.com/live",
    streamKeyLabel: "Stream key"
  }
];

export const defaultDestinationPreset = destinationPresets[0];

export const defaultDestinationProfile: DestinationProfile = {
  id: `dest-${defaultDestinationPreset.id}`,
  name: defaultDestinationPreset.name,
  platform: defaultDestinationPreset.platform,
  presetId: defaultDestinationPreset.id,
  protocol: defaultDestinationPreset.protocol,
  serverUrl: defaultDestinationPreset.serverUrl,
  streamKey: ""
};

export const getDestinationPreset = (presetId: string | null | undefined): DestinationPreset | undefined =>
  destinationPresets.find((preset) => preset.id === presetId);

export const getCustomDestinationPreset = (protocol: StreamProtocol): DestinationPreset =>
  destinationPresets.find((preset) => preset.platform === "custom" && preset.protocol === protocol) ??
  destinationPresets[destinationPresets.length - 1];

export const inferStreamProtocol = (serverUrl: string): StreamProtocol | null => {
  const normalized = serverUrl.trim().toLowerCase();
  if (normalized.startsWith("rtmps://")) {
    return "rtmps";
  }
  if (normalized.startsWith("rtmp://")) {
    return "rtmp";
  }
  return null;
};

export const serverUrlWithProtocol = (serverUrl: string, protocol: StreamProtocol): string => {
  if (/^rtmps?:\/\//i.test(serverUrl)) {
    return serverUrl.replace(/^rtmps?:\/\//i, `${protocol}://`);
  }
  return getCustomDestinationPreset(protocol).serverUrl;
};

export const createDestinationFromPreset = (presetId: DestinationPresetId, streamKey = ""): DestinationProfile => {
  const preset = getDestinationPreset(presetId) ?? defaultDestinationPreset;

  return {
    id: `dest-${preset.id}`,
    name: preset.name,
    platform: preset.platform,
    presetId: preset.id,
    protocol: preset.protocol,
    serverUrl: preset.serverUrl,
    streamKey
  };
};

export const applyDestinationPreset = (profile: StudioProfile, presetId: DestinationPresetId): StudioProfile => ({
  ...profile,
  destination: createDestinationFromPreset(presetId, profile.destination.streamKey)
});

export const markDestinationCustom = (
  destination: DestinationProfile,
  update: Partial<Pick<DestinationProfile, "protocol" | "serverUrl">>
): DestinationProfile => {
  const protocol = update.protocol ?? inferStreamProtocol(update.serverUrl ?? destination.serverUrl) ?? destination.protocol;
  const customPreset = getCustomDestinationPreset(protocol);

  return {
    ...destination,
    ...update,
    id: `dest-${customPreset.id}`,
    name: customPreset.name,
    platform: customPreset.platform,
    presetId: customPreset.id,
    protocol
  };
};

export const buildPublishUrl = (destination: DestinationProfile): string => {
  const serverUrl = destination.serverUrl.trim().replace(/\/+$/, "");
  const streamKey = normalizeStreamKeyForServer(serverUrl, destination.streamKey);

  if (!streamKey) {
    return serverUrl;
  }

  if (/\{stream_key\}/i.test(serverUrl)) {
    return serverUrl.replace(/\{stream_key\}/gi, streamKey);
  }

  if (serverUrl.endsWith(`/${streamKey}`)) {
    return serverUrl;
  }

  return `${serverUrl}/${streamKey}`;
};

const normalizeStreamKeyForServer = (serverUrl: string, streamKey: string): string => {
  const normalizedStreamKey = streamKey.trim().replace(/^\/+/, "");
  const lastServerPathSegment = getLastServerPathSegment(serverUrl);

  if (
    lastServerPathSegment &&
    normalizedStreamKey.toLowerCase().startsWith(`${lastServerPathSegment.toLowerCase()}/`)
  ) {
    return normalizedStreamKey.slice(lastServerPathSegment.length + 1);
  }

  return normalizedStreamKey;
};

const getLastServerPathSegment = (serverUrl: string): string => {
  try {
    const staticServerUrl = serverUrl.replace(/\{stream_key\}.*/i, "").replace(/\/+$/, "");
    const pathname = new URL(staticServerUrl).pathname.replace(/\/+$/, "");
    return pathname.split("/").filter(Boolean).at(-1) ?? "";
  } catch {
    return "";
  }
};

export const legacyCustomDestinationProfile: DestinationProfile = {
  id: "dest-custom",
  name: "Custom RTMPS",
  platform: "custom",
  presetId: "custom-rtmps",
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
  destination: { ...defaultDestinationProfile },
  quality: qualityProfiles[0],
  avatar: { ...defaultAvatarProfile }
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

export const normalizeStudioProfile = (profile: Partial<StudioProfile> | null | undefined): StudioProfile => {
  const fallback = createDefaultStudioProfile();
  const quality =
    qualityProfiles.find((qualityProfile) => qualityProfile.id === profile?.quality?.id) ?? profile?.quality ?? fallback.quality;
  const persistedDestination = profile?.destination;
  const preset =
    getDestinationPreset(persistedDestination?.presetId) ??
    destinationPresets.find(
      (destinationPreset) =>
        destinationPreset.serverUrl === persistedDestination?.serverUrl &&
        destinationPreset.protocol === persistedDestination?.protocol
    ) ??
    (persistedDestination?.protocol ? getCustomDestinationPreset(persistedDestination.protocol) : defaultDestinationPreset);

  return {
    destination: {
      id: persistedDestination?.id ?? `dest-${preset.id}`,
      name: persistedDestination?.name ?? preset.name,
      platform: persistedDestination?.platform ?? preset.platform,
      presetId: persistedDestination?.presetId ?? preset.id,
      protocol: persistedDestination?.protocol ?? preset.protocol,
      serverUrl: persistedDestination?.serverUrl ?? preset.serverUrl,
      streamKey: persistedDestination?.streamKey ?? ""
    },
    quality,
    avatar: {
      ...fallback.avatar,
      ...profile?.avatar
    }
  };
};

export const stripSensitiveProfileData = (profile: StudioProfile): StudioProfile => ({
  ...profile,
  destination: {
    ...profile.destination,
    streamKey: ""
  }
});
