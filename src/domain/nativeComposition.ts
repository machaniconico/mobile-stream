import type { SceneDocument, SceneSource, SourceKind } from "./scene";

export type NativeCompositionStatus = "pass" | "warn" | "fail";
export type NativeCompositionCoverage = "empty" | "screen-only" | "preview-only-overlays" | "no-screen-capture";

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

export const createNativeCompositionReport = (scene: SceneDocument): NativeCompositionReport => {
  const visibleSources = scene.sources.filter((source) => source.visible);
  const screenSources = visibleSources.filter((source) => source.kind === "screen");
  const previewOnlySources = visibleSources.filter((source) => source.kind !== "screen");
  const issues = previewOnlySources.map(createPreviewOnlyIssue);
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
    return {
      status: "warn",
      coverage: "no-screen-capture",
      summary: "Native publishing has no screen capture source; all visible sources require a compositor pass.",
      recommendedNextStep: "Add native image/text/avatar composition or enable a screen source for device ingest tests.",
      visibleSourceCount: visibleSources.length,
      screenSourceCount: 0,
      avatarSourceCount: countAvatarSources(visibleSources),
      previewOnlySourceCount: previewOnlySources.length,
      requiresNativeCompositor: previewOnlySources.length > 0,
      unsupportedSourceKinds,
      issues
    };
  }

  if (previewOnlySources.length > 0) {
    return {
      status: "warn",
      coverage: "preview-only-overlays",
      summary: `${previewOnlySources.length} visible overlay source${previewOnlySources.length === 1 ? "" : "s"} need native composition before they are guaranteed in the RTMP output.`,
      recommendedNextStep: "Implement the native compositor draw pass before treating avatar or overlay output as release-ready.",
      visibleSourceCount: visibleSources.length,
      screenSourceCount: screenSources.length,
      avatarSourceCount: countAvatarSources(visibleSources),
      previewOnlySourceCount: previewOnlySources.length,
      requiresNativeCompositor: true,
      unsupportedSourceKinds,
      issues
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

const createPreviewOnlyIssue = (source: SceneSource): NativeCompositionIssue => ({
  code: `native-compositor-${source.kind}`,
  sourceId: source.id,
  sourceName: source.name,
  sourceKind: source.kind,
  status: "warn",
  message: `${source.name} (${source.kind}) is visible in preview but not yet guaranteed in native RTMP output.`,
  action: nativeCompositionAction(source.kind)
});

const nativeCompositionAction = (kind: SourceKind): string => {
  switch (kind) {
    case "pngtuber":
      return "Android can render this as a native still-image PNGTuber with expression, blink, lip-sync, and face-motion transforms; add iOS compositor validation before claiming cross-platform release readiness.";
    case "live2d":
      return "Integrate a native Live2D Cubism renderer before relying on this source in production output.";
    case "image":
      return "Android can render this through native overlay filters; add iOS compositor validation before claiming cross-platform release readiness.";
    case "solid":
      return "Android can render this through native overlay filters; add iOS compositor validation before claiming cross-platform release readiness.";
    case "text":
      return "Android can render this through native overlay filters; add iOS compositor validation before claiming cross-platform release readiness.";
    case "screen":
      return "Screen capture is already handled by the native capture source.";
  }
};
