import type { ChatOverlaySource, SceneDocument, TextSource } from "./scene";
import type { StudioProfile, StreamProtocol } from "./profiles";
import { normalizeStudioProfile } from "./profiles";
import { createNativeCompositionReport } from "./nativeComposition";
import { createFaceTrackingDiagnostics } from "./faceTrackingDiagnostics";
import { createLive2DModelAssetReport } from "./live2dModel";
import { createVrmModelAssetReport } from "./vrmModel";
import { redactSecretsFromText } from "./persistencePrivacy";

type SceneSource = SceneDocument["sources"][number];
type AvatarSceneSource = Extract<SceneSource, { kind: "pngtuber" | "live2d" | "vrm" }>;
type ProgramOverlaySource = TextSource | ChatOverlaySource;

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
const chatOverlayLineHeightRatio = 1.18;
const chatOverlaySafeAreaMargin = 0.025;
const textOverlayBackgroundOpacityWarningThreshold = 0.35;
const textOverlayDominantAreaWarningThreshold = 0.18;
const textOverlayVeryOpaqueWarningThreshold = 0.65;
const textOverlayVeryOpaqueAreaWarningThreshold = 0.1;
const textOverlayMinimumReadableFontRatio = 0.022;
const textOverlayMinimumReadableFontSize = 18;
const textOverlayLineHeightRatio = 1.22;
const textOverlaySafeAreaMargin = 0.025;
const overlayAvatarOverlapWarningThreshold = 0.22;
const sceneTotalSourceWarningThreshold = 24;
const sceneVisibleSourceWarningThreshold = 12;
const sceneVisibleOverlayWarningThreshold = 9;
const sceneVisibleTextOverlayWarningThreshold = 6;
const sceneVisibleChatOverlayWarningThreshold = 2;

export const createReadinessReport = (scene: SceneDocument, profile: StudioProfile): ReadinessReport => {
  const sanitizedProfile = sanitizeStudioProfile(profile);
  const issues: ReadinessIssue[] = [
    ...validateDestination(sanitizedProfile),
    ...validateQuality(sanitizedProfile),
    ...validateMicEffects(sanitizedProfile),
    ...validateFaceTracking(scene, sanitizedProfile),
    ...validateScene(scene, sanitizedProfile)
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

const validateScene = (scene: SceneDocument, profile: StudioProfile): ReadinessIssue[] => {
  const issues: ReadinessIssue[] = [];
  const visibleSources = scene.sources.filter((source) => source.visible);
  const visibleOverlaySources = visibleSources.filter((source) => source.kind !== "screen");
  const visibleTextSources = visibleSources.filter((source) => source.kind === "text");
  const visibleChatSources = visibleSources.filter((source) => source.kind === "chat");
  const visibleAvatarSources = visibleSources.filter(isAvatarSource);
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

  if (scene.sources.length > sceneTotalSourceWarningThreshold) {
    issues.push({
      code: "scene-complexity-total-source-count",
      severity: "warning",
      field: "scene",
      message: `${scene.sources.length} scene sources are configured. Keep mobile production scenes at ${sceneTotalSourceWarningThreshold} sources or fewer unless physical validation proves the target devices remain stable.`
    });
  }

  if (visibleSources.length > sceneVisibleSourceWarningThreshold) {
    issues.push({
      code: "scene-complexity-visible-source-count",
      severity: "warning",
      field: "scene",
      message: `${visibleSources.length} visible sources are enabled. Reduce visible layers before public launch or retain physical-device evidence for this exact scene complexity.`
    });
  }

  if (visibleOverlaySources.length > sceneVisibleOverlayWarningThreshold) {
    issues.push({
      code: "scene-complexity-visible-overlay-count",
      severity: "warning",
      field: "scene",
      message: `${visibleOverlaySources.length} visible overlay sources are stacked above or around screen capture. Mobile native compositors should stay at ${sceneVisibleOverlayWarningThreshold} overlays or fewer for release-critical streams unless retained physical-device evidence proves this exact composition is stable.`
    });
  }

  if (visibleTextSources.length > sceneVisibleTextOverlayWarningThreshold) {
    issues.push({
      code: "scene-complexity-text-overlay-count",
      severity: "warning",
      field: "scene",
      message: `${visibleTextSources.length} visible text overlays are enabled. Consolidate titles, subtitles, badges, and tickers before public launch to reduce layout and thermal risk.`
    });
  }

  if (visibleChatSources.length > sceneVisibleChatOverlayWarningThreshold) {
    issues.push({
      code: "scene-complexity-chat-overlay-count",
      severity: "warning",
      field: "scene",
      message: `${visibleChatSources.length} visible chat overlays are enabled. Use one primary chat source for public streams unless the duplicate overlays are physically validated.`
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

  const unredactedChatOverlays = visibleSources.filter(
    (source): source is ChatOverlaySource => source.kind === "chat" && source.redactUrls === false
  );
  if (unredactedChatOverlays.length > 0) {
    const names = unredactedChatOverlays.map((source) => source.name).join(", ");
    issues.push({
      code: "scene-chat-overlay-url-redaction-disabled",
      severity: "warning",
      field: "scene",
      message: `${names} can display raw comment URLs on the stream overlay.`
    });
  }

  const layoutRiskChatOverlays = visibleSources.filter(
    (source): source is ChatOverlaySource => source.kind === "chat" && isChatOverlayLayoutRisk(source, scene)
  );
  if (layoutRiskChatOverlays.length > 0) {
    const names = layoutRiskChatOverlays.map((source) => source.name).join(", ");
    issues.push({
      code: "scene-chat-overlay-layout-risk",
      severity: "warning",
      field: "scene",
      message: `${names} may clip comments or render unreadably on mobile output.`
    });
  }

  const safeAreaChatOverlays = visibleSources.filter(
    (source): source is ChatOverlaySource => source.kind === "chat" && isChatOverlaySafeAreaRisk(source)
  );
  if (safeAreaChatOverlays.length > 0) {
    const names = safeAreaChatOverlays.map((source) => source.name).join(", ");
    issues.push({
      code: "scene-chat-overlay-safe-area-risk",
      severity: "warning",
      field: "scene",
      message: `${names} is too close to the program edge for phone and platform overlay safe areas.`
    });
  }

  const avatarOverlapChatOverlays = visibleSources.filter(
    (source): source is ChatOverlaySource =>
      source.kind === "chat" && hasOverlayAvatarOverlapRisk(scene, source, visibleAvatarSources)
  );
  if (avatarOverlapChatOverlays.length > 0) {
    const names = avatarOverlapChatOverlays.map((source) => source.name).join(", ");
    issues.push({
      code: "scene-chat-overlay-avatar-overlap-risk",
      severity: "warning",
      field: "scene",
      message: `${names} overlaps a visible avatar layer and may cover the model during gameplay.`
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

  const layoutRiskTextOverlays = visibleSources.filter(
    (source): source is TextSource => source.kind === "text" && isTextOverlayLayoutRisk(source, scene)
  );
  if (layoutRiskTextOverlays.length > 0) {
    const names = layoutRiskTextOverlays.map((source) => source.name).join(", ");
    issues.push({
      code: "scene-text-overlay-layout-risk",
      severity: "warning",
      field: "scene",
      message: `${names} may clip or render unreadable text on mobile output.`
    });
  }

  const safeAreaTextOverlays = visibleSources.filter(
    (source): source is TextSource => source.kind === "text" && isTextOverlaySafeAreaRisk(source)
  );
  if (safeAreaTextOverlays.length > 0) {
    const names = safeAreaTextOverlays.map((source) => source.name).join(", ");
    issues.push({
      code: "scene-text-overlay-safe-area-risk",
      severity: "warning",
      field: "scene",
      message: `${names} is too close to the program edge for phone and platform overlay safe areas.`
    });
  }

  const avatarOverlapTextOverlays = visibleSources.filter(
    (source): source is TextSource =>
      source.kind === "text" && hasOverlayAvatarOverlapRisk(scene, source, visibleAvatarSources)
  );
  if (avatarOverlapTextOverlays.length > 0) {
    const names = avatarOverlapTextOverlays.map((source) => source.name).join(", ");
    issues.push({
      code: "scene-text-overlay-avatar-overlap-risk",
      severity: "warning",
      field: "scene",
      message: `${names} overlaps a visible avatar layer and may cover the model during gameplay.`
    });
  }

  const sensitiveTextOverlays = visibleSources.filter(
    (source): source is TextSource => source.kind === "text" && hasSensitiveOverlayText(source, profile)
  );
  if (sensitiveTextOverlays.length > 0) {
    const names = sensitiveTextOverlays.map((source) => source.name).join(", ");
    issues.push({
      code: "scene-text-overlay-sensitive-content",
      severity: "error",
      field: "security",
      message: `${names} appears to contain a stream key, OAuth token, or API credential.`
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

const isChatOverlayLayoutRisk = (source: ChatOverlaySource, scene: SceneDocument): boolean => {
  const boxHeight = Math.max(1, source.transform.height * scene.canvas.height);
  const boxWidth = Math.max(1, source.transform.width * scene.canvas.width);
  const lineHeight = source.fontSize * chatOverlayLineHeightRatio;
  const verticalSafetyPadding = Math.max(source.fontSize * 0.3, 8);
  const requiredHeight = source.maxMessages * lineHeight + verticalSafetyPadding;

  return requiredHeight > boxHeight || boxWidth < source.fontSize * 8;
};

const isChatOverlaySafeAreaRisk = (source: ChatOverlaySource): boolean => {
  const right = source.transform.x + source.transform.width;
  const bottom = source.transform.y + source.transform.height;
  return (
    source.transform.x < chatOverlaySafeAreaMargin ||
    source.transform.y < chatOverlaySafeAreaMargin ||
    right > 1 - chatOverlaySafeAreaMargin ||
    bottom > 1 - chatOverlaySafeAreaMargin
  );
};

const isTextOverlayLayoutRisk = (source: TextSource, scene: SceneDocument): boolean => {
  const minReadableFontSize = Math.max(textOverlayMinimumReadableFontSize, scene.canvas.height * textOverlayMinimumReadableFontRatio);
  if (source.fontSize < minReadableFontSize) {
    return true;
  }

  const boxHeight = Math.max(1, source.transform.height * scene.canvas.height);
  const boxWidth = Math.max(1, source.transform.width * scene.canvas.width);
  const lineLimit = source.mode === "ticker" ? 1 : source.maxLines;
  const lineHeight = source.fontSize * textOverlayLineHeightRatio;
  const verticalSafetyPadding = Math.max(source.fontSize * 0.18, source.outlineWidth * 2);
  const requiredHeight = lineLimit * lineHeight + verticalSafetyPadding;

  return requiredHeight > boxHeight || boxWidth < source.fontSize * 4;
};

const isTextOverlaySafeAreaRisk = (source: TextSource): boolean => {
  if (source.mode === "ticker") {
    return false;
  }
  const right = source.transform.x + source.transform.width;
  const bottom = source.transform.y + source.transform.height;
  return (
    source.transform.x < textOverlaySafeAreaMargin ||
    source.transform.y < textOverlaySafeAreaMargin ||
    right > 1 - textOverlaySafeAreaMargin ||
    bottom > 1 - textOverlaySafeAreaMargin
  );
};

const isAvatarSource = (source: SceneSource): source is AvatarSceneSource =>
  source.kind === "pngtuber" || source.kind === "live2d" || source.kind === "vrm";

const hasOverlayAvatarOverlapRisk = (
  scene: SceneDocument,
  overlay: ProgramOverlaySource,
  avatars: AvatarSceneSource[]
): boolean =>
  avatars.some(
    (avatar) =>
      isOverlayStackedAboveSource(scene, overlay, avatar) &&
      transformOverlapRatio(overlay.transform, avatar.transform) >= overlayAvatarOverlapWarningThreshold
  );

const isOverlayStackedAboveSource = (scene: SceneDocument, overlay: ProgramOverlaySource, target: AvatarSceneSource): boolean => {
  const overlayIndex = scene.sources.findIndex((source) => source.id === overlay.id);
  const targetIndex = scene.sources.findIndex((source) => source.id === target.id);
  return overlayIndex >= 0 && targetIndex >= 0 && overlayIndex > targetIndex;
};

const transformOverlapRatio = (
  a: ProgramOverlaySource["transform"],
  b: AvatarSceneSource["transform"]
): number => {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const intersectionArea = width * height;
  const smallerArea = Math.min(a.width * a.height, b.width * b.height);
  return smallerArea > 0 ? intersectionArea / smallerArea : 0;
};

const hasSensitiveOverlayText = (source: TextSource, profile: StudioProfile): boolean =>
  source.text.length > 0 && redactSecretsFromText(source.text, [profile.destination.streamKey]) !== source.text;

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
