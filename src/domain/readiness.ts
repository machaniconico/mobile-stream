import type { ChatOverlaySource, SceneDocument, TextSource } from "./scene";
import type { StudioProfile, StreamProtocol } from "./profiles";
import { normalizeStudioProfile } from "./profiles";
import { createNativeCompositionReport } from "./nativeComposition";
import { createFaceTrackingDiagnostics } from "./faceTrackingDiagnostics";
import { createLive2DModelAssetReport } from "./live2dModel";
import { createVrmModelAssetReport } from "./vrmModel";

export type ReadinessSeverity = "error" | "warning";

export interface ReadinessIssue {
  code: string;
  severity: ReadinessSeverity;
  field: "serverUrl" | "streamKey" | "quality" | "scene" | "security" | "micEffects" | "faceTracking";
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
const chatOverlayBackgroundOpacityWarningThreshold = 0.05;
const textOverlayBackgroundOpacityWarningThreshold = 0.35;
const textOverlayDominantAreaWarningThreshold = 0.18;
const textOverlayVeryOpaqueWarningThreshold = 0.65;
const textOverlayVeryOpaqueAreaWarningThreshold = 0.1;

export const createReadinessReport = (scene: SceneDocument, profile: StudioProfile): ReadinessReport => {
  const sanitizedProfile = sanitizeStudioProfile(profile);
  const issues: ReadinessIssue[] = [
    ...validateDestination(sanitizedProfile),
    ...validateQuality(sanitizedProfile),
    ...validateMicEffects(sanitizedProfile),
    ...validateFaceTracking(scene, sanitizedProfile),
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

    if (serverUrlContainsPlatformStreamKey(profile, parsed)) {
      issues.push({
        code: "server-url-contains-stream-key",
        severity: "error",
        field: "serverUrl",
        message: "Server URL appears to include a stream key. Put only the ingest endpoint in Server URL."
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

    if (/^rtmps?:\/\//i.test(streamKey.trim())) {
      issues.push({
        code: "stream-key-url",
        severity: "error",
        field: "streamKey",
        message: "Stream key field contains a full RTMP URL. Paste only the stream key."
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

const serverUrlContainsPlatformStreamKey = (profile: StudioProfile, parsed: URL): boolean => {
  if (/\{stream_key\}/i.test(profile.destination.serverUrl)) {
    return false;
  }

  const pathSegments = parsed.pathname.split("/").filter(Boolean);
  if (pathSegments.length < 2) {
    return false;
  }

  if (profile.destination.platform === "youtube-live") {
    return pathSegments[0]?.toLowerCase() === "live2";
  }

  if (profile.destination.platform === "twitch") {
    return pathSegments[0]?.toLowerCase() === "app";
  }

  return false;
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
  const nativeComposition = createNativeCompositionReport(scene);

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

  if (visibleSources.some((source) => source.kind === "vrm")) {
    issues.push({
      code: "scene-vrm-preview",
      severity: "warning",
      field: "scene",
      message: "VRM/VRoid is still using the preview renderer until native VRM rendering lands."
    });
  }

  for (const source of visibleSources) {
    if (source.kind === "live2d") {
      const report = createLive2DModelAssetReport(source);
      for (const issue of report.issues) {
        issues.push({
          code: `scene-${issue.code}`,
          severity: "warning",
          field: "scene",
          message: issue.message
        });
      }
    }

    if (source.kind === "vrm") {
      const report = createVrmModelAssetReport(source);
      for (const issue of report.issues) {
        issues.push({
          code: `scene-${issue.code}`,
          severity: "warning",
          field: "scene",
          message: issue.message
        });
      }
    }
  }

  if (visibleSources.some((source) => source.kind === "image" && !source.uri.trim())) {
    issues.push({
      code: "scene-empty-image",
      severity: "warning",
      field: "scene",
      message: "An image source has no asset selected."
    });
  }

  const opaqueChatOverlays = visibleSources.filter(
    (source): source is ChatOverlaySource =>
      source.kind === "chat" && source.backgroundOpacity > chatOverlayBackgroundOpacityWarningThreshold
  );
  if (opaqueChatOverlays.length > 0) {
    const names = opaqueChatOverlays.map((source) => source.name).join(", ");
    issues.push({
      code: "scene-chat-overlay-background-opaque",
      severity: "warning",
      field: "scene",
      message: `${names} uses a non-transparent chat background that can cover gameplay or avatar overlays.`
    });
  }

  const dominantTextOverlays = visibleSources.filter(
    (source): source is TextSource => source.kind === "text" && isDominantTextOverlay(source)
  );
  if (dominantTextOverlays.length > 0) {
    const names = dominantTextOverlays.map((source) => source.name).join(", ");
    issues.push({
      code: "scene-text-overlay-background-dominant",
      severity: "warning",
      field: "scene",
      message: `${names} uses a large opaque text backdrop that can hide gameplay, avatar motion, or platform safety UI.`
    });
  }

  if (nativeComposition.status === "warn") {
    issues.push({
      code: `scene-native-composition-${nativeComposition.coverage}`,
      severity: "warning",
      field: "scene",
      message: nativeComposition.summary
    });
  }

  return issues;
};

const isDominantTextOverlay = (source: TextSource): boolean => {
  const area = source.transform.width * source.transform.height;
  if (source.backgroundOpacity >= textOverlayVeryOpaqueWarningThreshold && area >= textOverlayVeryOpaqueAreaWarningThreshold) {
    return true;
  }
  return source.backgroundOpacity >= textOverlayBackgroundOpacityWarningThreshold && area >= textOverlayDominantAreaWarningThreshold;
};

const validateFaceTracking = (scene: SceneDocument, profile: StudioProfile): ReadinessIssue[] => {
  const diagnostics = createFaceTrackingDiagnostics(scene, profile);

  if (!profile.faceTracking.enabled || diagnostics.status !== "warn") {
    return [];
  }

  return [
    {
      code: "face-tracking-not-production-ready",
      severity: "warning",
      field: "faceTracking",
      message: diagnostics.summary
    }
  ];
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
