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
  previewOnlySourceCount: number;
  requiresNativeCompositor: boolean;
  unsupportedSourceKinds: SourceKind[];
  issues: NativeCompositionIssue[];
}

const avatarKinds = new Set<SourceKind>(["pngtuber", "live2d"]);
const nativeOverlayKinds = new Set<SourceKind>(["pngtuber", "image", "solid", "text"]);

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
  const unsupportedOverlaySources = overlaySources.filter((source) => !nativeOverlayKinds.has(source.kind));
  const previewOnlySources = [...underlaySources, ...unsupportedOverlaySources];
  const issues = [
    ...underlaySources.map((source) => createPreviewOnlyIssue(source, "underlay")),
    ...unsupportedOverlaySources.map((source) => createPreviewOnlyIssue(source, "unsupported"))
  ];
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
      previewOnlySourceCount: 0,
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
      previewOnlySourceCount: visibleNonScreenSources.length,
      requiresNativeCompositor: visibleNonScreenSources.length > 0,
      unsupportedSourceKinds: [...new Set(visibleNonScreenSources.map((source) => source.kind))],
      issues: noScreenIssues
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
      previewOnlySourceCount: previewOnlySources.length,
      requiresNativeCompositor: true,
      unsupportedSourceKinds,
      issues
    };
  }

  if (nativeOverlaySources.length > 0) {
    return {
      status: "pass",
      coverage: "native-overlays",
      summary: `${nativeOverlaySources.length} visible overlay source${nativeOverlaySources.length === 1 ? "" : "s"} are covered by the Android MediaProjection and iOS ReplayKit native compositors.`,
      recommendedNextStep: "Run physical-device ingest validation for the configured destination with overlays enabled.",
      visibleSourceCount: visibleSources.length,
      screenSourceCount: screenSources.length,
      avatarSourceCount: countAvatarSources(visibleSources),
      previewOnlySourceCount: 0,
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
    previewOnlySourceCount: 0,
    requiresNativeCompositor: false,
    unsupportedSourceKinds: [],
    issues: []
  };
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
      action: "Enable a screen source, then place supported avatar/image/text/solid sources above it."
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
      return "iOS and Android can render this as a native still-image PNGTuber with expression, blink, lip-sync, and face-motion transforms when it is above the screen source.";
    case "live2d":
      return "Integrate a native Live2D Cubism renderer before relying on this source in production output.";
    case "image":
      return "iOS and Android can render this through native overlay filters when the asset is available to the native app or broadcast extension.";
    case "solid":
      return "iOS and Android can render this through native overlay filters when it is above the screen source.";
    case "text":
      return "iOS and Android can render this through native overlay filters when it is above the screen source.";
    case "screen":
      return "Screen capture is already handled by the native capture source.";
  }
};
