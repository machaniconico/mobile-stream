import type { SceneDocument } from "./scene";
import type { StudioProfile, StreamProtocol } from "./profiles";
import { normalizeStudioProfile } from "./profiles";

export type ReadinessSeverity = "error" | "warning";

export interface ReadinessIssue {
  code: string;
  severity: ReadinessSeverity;
  field: "serverUrl" | "streamKey" | "quality" | "scene" | "security" | "micEffects";
  message: string;
}

export interface ReadinessReport {
  canStart: boolean;
  issues: ReadinessIssue[];
  errorCount: number;
  warningCount: number;
  sanitizedProfile: StudioProfile;
}

const supportedProtocols = new Set(["rtmp:", "rtmps:"]);

export const createReadinessReport = (scene: SceneDocument, profile: StudioProfile): ReadinessReport => {
  const sanitizedProfile = sanitizeStudioProfile(profile);
  const issues: ReadinessIssue[] = [
    ...validateDestination(sanitizedProfile),
    ...validateQuality(sanitizedProfile),
    ...validateMicEffects(sanitizedProfile),
    ...validateScene(scene)
  ];
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;

  return {
    canStart: errorCount === 0,
    issues,
    errorCount,
    warningCount,
    sanitizedProfile
  };
};

export const sanitizeStudioProfile = (profile: StudioProfile): StudioProfile => {
  const normalized = normalizeStudioProfile(profile);

  return {
    ...normalized,
    destination: {
      ...normalized.destination,
      serverUrl: normalized.destination.serverUrl.trim(),
      streamKey: normalized.destination.streamKey.trim()
    },
    micEffects: {
      ...normalized.micEffects
    }
  };
};

const validateDestination = (profile: StudioProfile): ReadinessIssue[] => {
  const issues: ReadinessIssue[] = [];
  const serverUrl = profile.destination.serverUrl;
  const streamKey = profile.destination.streamKey;
  const parsed = parseUrl(serverUrl);

  if (!serverUrl) {
    issues.push({
      code: "server-url-required",
      severity: "error",
      field: "serverUrl",
      message: "Server URL is required."
    });
  } else if (!parsed) {
    issues.push({
      code: "server-url-invalid",
      severity: "error",
      field: "serverUrl",
      message: "Server URL must be a valid RTMP or RTMPS URL."
    });
  } else {
    const protocol = protocolFromUrl(parsed);

    if (!supportedProtocols.has(parsed.protocol)) {
      issues.push({
        code: "server-url-protocol",
        severity: "error",
        field: "serverUrl",
        message: "Only RTMP and RTMPS endpoints are supported."
      });
    }

    if (protocol && protocol !== profile.destination.protocol) {
      issues.push({
        code: "protocol-mismatch",
        severity: "error",
        field: "serverUrl",
        message: `Protocol selector is ${profile.destination.protocol.toUpperCase()}, but the URL is ${protocol.toUpperCase()}.`
      });
    }

    if (parsed.hostname === "example.com") {
      issues.push({
        code: "placeholder-endpoint",
        severity: "error",
        field: "serverUrl",
        message: "Replace the sample endpoint before going live."
      });
    }

    if (parsed.protocol === "rtmp:") {
      issues.push({
        code: "rtmp-not-encrypted",
        severity: "warning",
        field: "security",
        message: "RTMP is unencrypted. Use RTMPS when the destination supports it."
      });
    }
  }

  if (!streamKey) {
    issues.push({
      code: "stream-key-required",
      severity: "error",
      field: "streamKey",
      message: "Stream key is required."
    });
  } else {
    if (/[\r\n\t]/.test(streamKey)) {
      issues.push({
        code: "stream-key-control-char",
        severity: "error",
        field: "streamKey",
        message: "Stream key cannot include tabs or line breaks."
      });
    }

    if (streamKey.length < 6) {
      issues.push({
        code: "stream-key-short",
        severity: "warning",
        field: "streamKey",
        message: "Stream key looks unusually short. Confirm it was pasted completely."
      });
    }
  }

  return issues;
};

const validateMicEffects = (profile: StudioProfile): ReadinessIssue[] => {
  const issues: ReadinessIssue[] = [];
  const { micEffects } = profile;

  if (micEffects.inputGainDb > 9) {
    issues.push({
      code: "mic-gain-hot",
      severity: "warning",
      field: "micEffects",
      message: "Mic input gain is very high and may clip."
    });
  }

  if (micEffects.monitorEnabled && !micEffects.monitorHeadphonesOnly) {
    issues.push({
      code: "mic-monitor-speaker-feedback",
      severity: "warning",
      field: "micEffects",
      message: "Mic monitor can feed back through speakers unless headphones-only mode is enabled."
    });
  }

  if (micEffects.monitorEnabled && micEffects.monitorVolume > 0.85) {
    issues.push({
      code: "mic-monitor-loud",
      severity: "warning",
      field: "micEffects",
      message: "Mic monitor volume is very high."
    });
  }

  return issues;
};

const validateQuality = (profile: StudioProfile): ReadinessIssue[] => {
  const issues: ReadinessIssue[] = [];
  const { quality } = profile;

  if (quality.width < 640 || quality.height < 360) {
    issues.push({
      code: "quality-resolution-low",
      severity: "warning",
      field: "quality",
      message: "Resolution is below 360p and may look soft on streaming platforms."
    });
  }

  if (quality.videoBitrateKbps < 900 || quality.videoBitrateKbps > 12000) {
    issues.push({
      code: "quality-video-bitrate",
      severity: "error",
      field: "quality",
      message: "Video bitrate must stay between 900 and 12000 kbps."
    });
  }

  if (quality.audioBitrateKbps < 64 || quality.audioBitrateKbps > 320) {
    issues.push({
      code: "quality-audio-bitrate",
      severity: "error",
      field: "quality",
      message: "Audio bitrate must stay between 64 and 320 kbps."
    });
  }

  if (quality.fps === 60 && quality.videoBitrateKbps < 4500) {
    issues.push({
      code: "quality-60fps-bitrate",
      severity: "warning",
      field: "quality",
      message: "60 fps streams usually need at least 4500 kbps."
    });
  }

  return issues;
};

const validateScene = (scene: SceneDocument): ReadinessIssue[] => {
  const issues: ReadinessIssue[] = [];
  const visibleSources = scene.sources.filter((source) => source.visible);

  if (visibleSources.length === 0) {
    issues.push({
      code: "scene-empty",
      severity: "error",
      field: "scene",
      message: "At least one visible source is required."
    });
  }

  if (!visibleSources.some((source) => source.kind === "screen")) {
    issues.push({
      code: "scene-no-screen",
      severity: "warning",
      field: "scene",
      message: "No visible screen capture source is enabled."
    });
  }

  if (visibleSources.some((source) => source.kind === "live2d")) {
    issues.push({
      code: "scene-live2d-preview",
      severity: "warning",
      field: "scene",
      message: "Live2D is still using the preview renderer until Cubism SDK integration lands."
    });
  }

  if (visibleSources.some((source) => source.kind === "image" && !source.uri.trim())) {
    issues.push({
      code: "scene-empty-image",
      severity: "warning",
      field: "scene",
      message: "An image source has no asset selected."
    });
  }

  return issues;
};

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const protocolFromUrl = (url: URL): StreamProtocol | null => {
  if (url.protocol === "rtmp:") {
    return "rtmp";
  }
  if (url.protocol === "rtmps:") {
    return "rtmps";
  }
  return null;
};
