import type { SceneDocument, SceneSource, SourceKind } from "./scene";

export type NativeCompositionStatus = "pass" | "warn" | "fail";
export type NativeCompositionCoverage =
  | "empty"
  | "screen-only"
  | "native-overlays"
  | "preview-only-overlays"
  | "no-screen-capture";

export interface NativeCompositionIssue {
  code: string;
  sourceId: string;
  sourceName: string;
  sourceKind: SourceKind;
  status: NativeCompositionStatus;
  message: string;
  action: string;
}

export interface NativeCompositionReport {
  status: NativeCompositionStatus;
  coverage: NativeCompositionCoverage;
  summary: string;
  recommendedNextStep: string;
  visibleSourceCount: number;
  screenSourceCount: number;
  avatarSourceCount: number;
  stillImageOverlayCount: number;
  previewOnlySourceCount: number;
  assetIssueCount: number;
  fileBackedAssetIssueCount: number;
  requiresNativeCompositor: boolean;
  unsupportedSourceKinds: SourceKind[];
  issues: NativeCompositionIssue[];
}

const avatarKinds = new Set<SourceKind>(["pngtuber", "live2d"]);
const nativeOverlayKinds = new Set<SourceKind>(["pngtuber", "image", "solid", "text", "chat"]);
const nativeStillImageKinds = new Set<SourceKind>(["pngtuber", "image"]);
const iosBroadcastAppGroup = "group.com.mobilelivecaster.app";

export const createNativeCompositionReport = (scene: SceneDocument): NativeCompositionReport => {
  const visibleSources = scene.sources.filter((source) => source.visible);
  const screenSources = visibleSources.filter((source) => source.kind === "screen");
  const firstScreenIndex = visibleSources.findIndex((source) => source.kind === "screen");
  const visibleNonScreenSources = visibleSources.filter((source) => source.kind !== "screen");
  const underlaySources =
    firstScreenIndex >= 0 ? visibleSources.slice(0, firstScreenIndex).filter((source) => source.kind !== "screen") : [];
  const overlaySources =
    firstScreenIndex >= 0 ? visibleSources.slice(firstScreenIndex + 1).filter((source) => source.kind !== "screen") : visibleNonScreenSources;
  const nativeOverlaySources = overlaySources.filter((source) => nativeOverlayKinds.has(source.kind));
  const stillImageOverlayCount = nativeOverlaySources.filter((source) => nativeStillImageKinds.has(source.kind)).length;
  const unsupportedOverlaySources = overlaySources.filter((source) => !nativeOverlayKinds.has(source.kind));
  const previewOnlySources = [...underlaySources, ...unsupportedOverlaySources];
  const previewIssues = [
    ...underlaySources.map((source) => createPreviewOnlyIssue(source, "underlay")),
    ...unsupportedOverlaySources.map((source) => createPreviewOnlyIssue(source, "unsupported"))
  ];
  const assetIssues = nativeOverlaySources.flatMap((source) => createNativeStillImageAssetIssue(source));
  const issues = [...previewIssues, ...assetIssues];
  const fileBackedAssetIssueCount = assetIssues.filter((issue) => issue.code === "native-compositor-asset-file-sandbox").length;
  const unsupportedSourceKinds = [...new Set(previewOnlySources.map((source) => source.kind))];

  if (visibleSources.length === 0) {
    return {
      status: "fail",
      coverage: "empty",
      summary: "No visible sources are available for native publishing.",
      recommendedNextStep: "Enable at least one visible source before testing native streaming.",
      visibleSourceCount: 0,
      screenSourceCount: 0,
      avatarSourceCount: 0,
      stillImageOverlayCount: 0,
      previewOnlySourceCount: 0,
      assetIssueCount: 0,
      fileBackedAssetIssueCount: 0,
      requiresNativeCompositor: false,
      unsupportedSourceKinds: [],
      issues: []
    };
  }

  if (screenSources.length === 0) {
    const noScreenIssues = visibleNonScreenSources.map((source) => createPreviewOnlyIssue(source, "no-screen"));
    return {
      status: "warn",
      coverage: "no-screen-capture",
      summary: "Native publishing has no visible screen capture source; scene preview and native output can drift.",
      recommendedNextStep: "Enable a screen source before physical ingest validation, then keep supported avatar/image/text overlays above it.",
      visibleSourceCount: visibleSources.length,
      screenSourceCount: 0,
      avatarSourceCount: countAvatarSources(visibleSources),
      stillImageOverlayCount,
      previewOnlySourceCount: visibleNonScreenSources.length,
      assetIssueCount: assetIssues.length,
      fileBackedAssetIssueCount,
      requiresNativeCompositor: visibleNonScreenSources.length > 0,
      unsupportedSourceKinds: [...new Set(visibleNonScreenSources.map((source) => source.kind))],
      issues: [...noScreenIssues, ...assetIssues]
    };
  }

  if (previewOnlySources.length > 0) {
    return {
      status: "warn",
      coverage: "preview-only-overlays",
      summary: `${previewOnlySources.length} visible source${previewOnlySources.length === 1 ? "" : "s"} are not covered by the current native RTMP compositor order or source support.`,
      recommendedNextStep: "Move supported overlays above the screen source, and keep Live2D out of release-critical output until Cubism SDK integration lands.",
      visibleSourceCount: visibleSources.length,
      screenSourceCount: screenSources.length,
      avatarSourceCount: countAvatarSources(visibleSources),
      stillImageOverlayCount,
      previewOnlySourceCount: previewOnlySources.length,
      assetIssueCount: assetIssues.length,
      fileBackedAssetIssueCount,
      requiresNativeCompositor: true,
      unsupportedSourceKinds,
      issues
    };
  }

  if (nativeOverlaySources.length > 0) {
    if (assetIssues.length > 0) {
      return {
        status: "warn",
        coverage: "native-overlays",
        summary: `${nativeOverlaySources.length} visible overlay source${nativeOverlaySources.length === 1 ? "" : "s"} are native-supported, but ${assetIssues.length} still-image asset${assetIssues.length === 1 ? "" : "s"} need extension-accessible local storage before iOS ReplayKit publishing.`,
        recommendedNextStep: "Copy PNGTuber and image assets into the App Group container before physical ingest validation.",
        visibleSourceCount: visibleSources.length,
        screenSourceCount: screenSources.length,
        avatarSourceCount: countAvatarSources(visibleSources),
        stillImageOverlayCount,
        previewOnlySourceCount: 0,
        assetIssueCount: assetIssues.length,
        fileBackedAssetIssueCount,
        requiresNativeCompositor: false,
        unsupportedSourceKinds: [],
        issues: assetIssues
      };
    }

    return {
      status: "pass",
      coverage: "native-overlays",
      summary: `${nativeOverlaySources.length} visible overlay source${nativeOverlaySources.length === 1 ? "" : "s"} are covered by the Android MediaProjection and iOS ReplayKit native compositors.`,
      recommendedNextStep: "Run physical-device ingest validation for the configured destination with overlays enabled.",
      visibleSourceCount: visibleSources.length,
      screenSourceCount: screenSources.length,
      avatarSourceCount: countAvatarSources(visibleSources),
      stillImageOverlayCount,
      previewOnlySourceCount: 0,
      assetIssueCount: 0,
      fileBackedAssetIssueCount: 0,
      requiresNativeCompositor: false,
      unsupportedSourceKinds: [],
      issues: []
    };
  }

  return {
    status: "pass",
    coverage: "screen-only",
    summary: "Native publishing is screen-only and does not require overlay composition.",
    recommendedNextStep: "Run physical-device ingest validation for the configured destination.",
    visibleSourceCount: visibleSources.length,
    screenSourceCount: screenSources.length,
    avatarSourceCount: 0,
    stillImageOverlayCount: 0,
    previewOnlySourceCount: 0,
    assetIssueCount: 0,
    fileBackedAssetIssueCount: 0,
    requiresNativeCompositor: false,
    unsupportedSourceKinds: [],
    issues: []
  };
};

const createNativeStillImageAssetIssue = (source: SceneSource): NativeCompositionIssue[] => {
  if (!nativeStillImageKinds.has(source.kind)) {
    return [];
  }

  const uri = nativeStillImageUri(source);
  const base = {
    sourceId: source.id,
    sourceName: source.name,
    sourceKind: source.kind,
    status: "warn" as const
  };

  if (!uri) {
    return [
      {
        ...base,
        code: "native-compositor-asset-missing",
        message: `${source.name} (${source.kind}) has no still-image asset URI for native overlay rendering.`,
        action: "Select a still-image asset and store it in extension-accessible app storage before physical validation."
      }
    ];
  }

  const scheme = uriScheme(uri);
  if (scheme === "file") {
    const path = fileUriPath(uri);
    if (path && isIosBroadcastAppGroupPath(path)) {
      return [];
    }
    return [
      {
        ...base,
        code: "native-compositor-asset-file-sandbox",
        message: `${source.name} (${source.kind}) points to a file URL that may be inside the host app sandbox and unreadable by the iOS Broadcast Upload Extension.`,
        action: "Copy the asset into the App Group container and save that file URL in the scene before release-critical streams."
      }
    ];
  }

  if (!scheme && uri.startsWith("/")) {
    if (isIosBroadcastAppGroupPath(uri)) {
      return [];
    }
    return [
      {
        ...base,
        code: "native-compositor-asset-file-sandbox",
        message: `${source.name} (${source.kind}) points to an absolute file path that may be outside the iOS Broadcast Upload Extension sandbox.`,
        action: "Use an App Group container path for still-image overlays shared with the ReplayKit extension."
      }
    ];
  }

  if (scheme === "content") {
    return [
      {
        ...base,
        code: "native-compositor-asset-uri-scheme",
        message: `${source.name} (${source.kind}) uses an Android content URI that the iOS ReplayKit extension cannot load.`,
        action: "Mirror the selected asset into extension-accessible file storage and keep platform-specific native URI records."
      }
    ];
  }

  if (scheme === "http" || scheme === "https" || scheme === "data") {
    return [
      {
        ...base,
        code: "native-compositor-asset-uri-scheme",
        message: `${source.name} (${source.kind}) uses a ${scheme} URI, but the current iOS native compositor only loads local files.`,
        action: "Download or materialize the image into the App Group container before starting a native iOS broadcast."
      }
    ];
  }

  if (!scheme) {
    return [
      {
        ...base,
        code: "native-compositor-asset-relative-path",
        message: `${source.name} (${source.kind}) uses a relative asset path that is not guaranteed to exist inside the iOS Broadcast Upload Extension bundle.`,
        action: "Resolve the asset to a real App Group file URL during import or profile preparation."
      }
    ];
  }

  return [
    {
      ...base,
      code: "native-compositor-asset-uri-scheme",
      message: `${source.name} (${source.kind}) uses an unsupported ${scheme} URI for native still-image overlay rendering.`,
      action: "Store the still image as an extension-accessible local file before physical-device ingest validation."
    }
  ];
};

const nativeStillImageUri = (source: SceneSource): string => {
  if (source.kind === "pngtuber") {
    return source.imageUri.trim();
  }
  if (source.kind === "image") {
    return source.uri.trim();
  }
  return "";
};

const uriScheme = (uri: string): string | null => {
  const match = uri.match(/^([a-z][a-z0-9+.-]*):/i);
  return match ? match[1].toLowerCase() : null;
};

const fileUriPath = (uri: string): string | null => {
  try {
    return safeDecodeURIComponent(new URL(uri).pathname);
  } catch {
    return null;
  }
};

const isIosBroadcastAppGroupPath = (path: string): boolean => {
  const normalizedPath = safeDecodeURIComponent(path);
  return (
    normalizedPath.includes("/Shared/AppGroup/") ||
    normalizedPath.includes(`/Group Containers/${iosBroadcastAppGroup}/`) ||
    normalizedPath.includes(`/${iosBroadcastAppGroup}/`)
  );
};

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const countAvatarSources = (sources: SceneSource[]): number =>
  sources.filter((source) => avatarKinds.has(source.kind)).length;

type NativeCompositionIssueReason = "underlay" | "unsupported" | "no-screen";

const createPreviewOnlyIssue = (source: SceneSource, reason: NativeCompositionIssueReason): NativeCompositionIssue => {
  const base = {
    code: `native-compositor-${source.kind}`,
    sourceId: source.id,
    sourceName: source.name,
    sourceKind: source.kind,
    status: "warn" as const
  };

  if (reason === "underlay") {
    return {
      ...base,
      message: `${source.name} (${source.kind}) is below the screen source and will not appear in the native RTMP overlay pass.`,
      action: "Move this source above the screen capture layer, or bake it into the captured app content for release streams."
    };
  }

  if (reason === "no-screen") {
    return {
      ...base,
      message: `${source.name} (${source.kind}) is visible without a screen source, so preview and native screen capture can diverge.`,
      action: "Enable a screen source, then place supported avatar/image/text/chat/solid sources above it."
    };
  }

  return {
    ...base,
    message: `${source.name} (${source.kind}) is visible in preview but not yet guaranteed in native RTMP output.`,
    action: nativeCompositionAction(source.kind)
  };
};

const nativeCompositionAction = (kind: SourceKind): string => {
  switch (kind) {
    case "pngtuber":
      return "iOS and Android can render this as a native still-image PNGTuber with expression, blink, lip-sync, face-motion position/rotation, 2.5D scale, and lightweight pseudo mesh deformation when it is above the screen source.";
    case "live2d":
      return "Integrate a native Live2D Cubism renderer before relying on this source in production output.";
    case "image":
      return "iOS and Android can render this through native overlay filters when the asset is available to the native app or broadcast extension.";
    case "solid":
      return "iOS and Android can render this through native overlay filters when it is above the screen source.";
    case "text":
      return "iOS and Android can render this through native overlay filters when it is above the screen source.";
    case "chat":
      return "iOS and Android can render transparent-background chat comments through native overlay filters when it is above the screen source.";
    case "screen":
      return "Screen capture is already handled by the native capture source.";
  }
};
