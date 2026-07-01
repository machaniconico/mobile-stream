import { createVrmRuntimePose } from "./vrmRuntime";
import type { SceneDocument, SceneSource, SourceKind, Transform } from "./scene";

export interface SceneCompositionSourceSummary {
  id: string;
  kind: SourceKind;
  name: string;
  visible: boolean;
  locked: boolean;
  blendMode: SceneSource["blendMode"];
  transform: Transform;
  payload: Record<string, string | number | boolean>;
}

export const createSceneCompositionFingerprint = (scene: SceneDocument): string =>
  createStableFingerprint("scene1", {
    id: scene.id,
    name: scene.name,
    canvas: scene.canvas,
    sources: scene.sources.map((source, order) => ({
      order,
      ...createSceneCompositionSourceSummary(source)
    }))
  });

export const createSceneCompositionSourceSummary = (source: SceneSource): SceneCompositionSourceSummary => ({
  id: source.id,
  kind: source.kind,
  name: source.name,
  visible: source.visible,
  locked: source.locked,
  blendMode: source.blendMode,
  transform: source.transform,
  payload: createSceneCompositionSourcePayloadSummary(source)
});

export const createSceneCompositionSourcePayloadSummary = (
  source: SceneSource
): Record<string, string | number | boolean> => {
  switch (source.kind) {
    case "screen":
      return { captureMode: source.captureMode };
    case "pngtuber":
      return { avatarId: source.avatarId, expression: source.expression, hasImageUri: Boolean(source.imageUri.trim()) };
    case "live2d":
      return { modelId: source.modelId, expression: source.expression, hasModelJsonUri: Boolean(source.modelJsonUri.trim()) };
    case "vrm": {
      const pose = createVrmRuntimePose(source);
      return {
        modelId: source.modelId,
        expression: source.expression,
        hasModelUri: Boolean(source.modelUri.trim()),
        runtimePoseStatus: pose.status,
        trackingConfidence: pose.confidence
      };
    }
    case "image":
      return { hasUri: Boolean(source.uri.trim()) };
    case "solid":
      return { color: source.color };
    case "text":
      return {
        textLength: source.text.length,
        mode: source.mode,
        contentSource: source.contentSource,
        align: source.align,
        showCaptionSpeaker: source.showCaptionSpeaker,
        visibilityMode: source.visibilityMode,
        displayDurationMs: source.displayDurationMs,
        color: source.color,
        fontSize: source.fontSize,
        backgroundColor: source.backgroundColor,
        backgroundOpacity: source.backgroundOpacity,
        outlineColor: source.outlineColor,
        outlineWidth: source.outlineWidth,
        maxLines: source.maxLines
      };
    case "chat":
      return {
        maxMessages: source.maxMessages,
        maxMessageLength: source.maxMessageLength,
        showAuthor: source.showAuthor,
        redactUrls: source.redactUrls,
        color: source.color,
        fontSize: source.fontSize,
        backgroundColor: source.backgroundColor,
        backgroundOpacity: source.backgroundOpacity
      };
  }
};

type CanonicalJson = string | number | boolean | null | CanonicalJson[] | { [key: string]: CanonicalJson };

const createStableFingerprint = (prefix: string, value: unknown): string => {
  const canonical = JSON.stringify(canonicalize(value));
  return `${prefix}-${hashString(canonical)}-${canonical.length.toString(36)}`;
};

const canonicalize = (value: unknown): CanonicalJson => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)])
    );
  }
  return null;
};

const hashString = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};
