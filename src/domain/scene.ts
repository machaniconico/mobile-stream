export type SourceKind = "screen" | "pngtuber" | "live2d" | "image" | "solid" | "text";

export type BlendMode = "normal" | "multiply" | "screen";

export interface Transform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

export interface AvatarMotion {
  headYaw: number;
  headPitch: number;
  headRoll: number;
  headX: number;
  headY: number;
  bodyLean: number;
  bodyBounce: number;
  breathing: number;
  confidence: number;
}

export interface BaseSource {
  id: string;
  kind: SourceKind;
  name: string;
  visible: boolean;
  locked: boolean;
  transform: Transform;
  blendMode: BlendMode;
}

export interface ScreenSource extends BaseSource {
  kind: "screen";
  captureMode: "android-media-projection" | "ios-replaykit";
}

export interface PNGTuberSource extends BaseSource {
  kind: "pngtuber";
  avatarId: string;
  imageUri: string;
  expression: string;
  mouthOpen: number;
  blink: number;
  motion: AvatarMotion;
}

export interface Live2DSource extends BaseSource {
  kind: "live2d";
  modelId: string;
  expression: string;
  mouthOpen: number;
  blink: number;
  motion: AvatarMotion;
}

export interface ImageSource extends BaseSource {
  kind: "image";
  uri: string;
}

export interface SolidSource extends BaseSource {
  kind: "solid";
  color: string;
}

export interface TextSource extends BaseSource {
  kind: "text";
  text: string;
  color: string;
  fontSize: number;
}

export type SceneSource =
  | ScreenSource
  | PNGTuberSource
  | Live2DSource
  | ImageSource
  | SolidSource
  | TextSource;

export interface SceneDocument {
  version: 1;
  id: string;
  name: string;
  canvas: {
    width: number;
    height: number;
    fps: number;
  };
  sources: SceneSource[];
}

export interface RenderNode {
  id: string;
  kind: SourceKind;
  order: number;
  transform: Transform;
  payload: Record<string, string | number | boolean>;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const sourceKinds: readonly SourceKind[] = ["screen", "pngtuber", "live2d", "image", "solid", "text"];
const blendModes: readonly BlendMode[] = ["normal", "multiply", "screen"];

const clampTransform = (transform: Transform): Transform => ({
  x: clamp01(transform.x),
  y: clamp01(transform.y),
  width: clamp01(transform.width),
  height: clamp01(transform.height),
  rotation: Math.max(-180, Math.min(180, transform.rotation)),
  opacity: clamp01(transform.opacity)
});

const makeId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export const defaultAvatarMotion = (overrides: Partial<AvatarMotion> = {}): AvatarMotion => ({
  headYaw: 0,
  headPitch: 0,
  headRoll: 0,
  headX: 0,
  headY: 0,
  bodyLean: 0,
  bodyBounce: 0,
  breathing: 0,
  confidence: 0,
  ...overrides
});

export const defaultTransform = (overrides: Partial<Transform> = {}): Transform =>
  clampTransform({
    x: 0.05,
    y: 0.05,
    width: 0.3,
    height: 0.3,
    rotation: 0,
    opacity: 1,
    ...overrides
  });

export const createDefaultScene = (): SceneDocument => ({
  version: 1,
  id: "scene-main",
  name: "Main Scene",
  canvas: {
    width: 1920,
    height: 1080,
    fps: 30
  },
  sources: [
    {
      id: "source-background",
      kind: "solid",
      name: "Background",
      visible: true,
      locked: true,
      blendMode: "normal",
      color: "#101015",
      transform: defaultTransform({ x: 0, y: 0, width: 1, height: 1 })
    },
    {
      id: "source-screen",
      kind: "screen",
      name: "Screen Capture",
      visible: true,
      locked: true,
      blendMode: "normal",
      captureMode: "android-media-projection",
      transform: defaultTransform({ x: 0, y: 0, width: 1, height: 1 })
    },
    {
      id: "source-avatar",
      kind: "pngtuber",
      name: "PNGTuber",
      visible: true,
      locked: false,
      blendMode: "normal",
      avatarId: "default-pngtuber",
      imageUri: "",
      expression: "neutral",
      mouthOpen: 0.18,
      blink: 0,
      motion: defaultAvatarMotion(),
      transform: defaultTransform({ x: 0.67, y: 0.44, width: 0.26, height: 0.45 })
    },
    {
      id: "source-label",
      kind: "text",
      name: "Stream Label",
      visible: true,
      locked: false,
      blendMode: "normal",
      text: "MobileLiveCaster",
      color: "#f8fafc",
      fontSize: 44,
      transform: defaultTransform({ x: 0.04, y: 0.05, width: 0.55, height: 0.14 })
    }
  ]
});

export const createSource = (kind: SourceKind): SceneSource => {
  const base: BaseSource = {
    id: makeId(`source-${kind}`),
    kind,
    name: kind === "pngtuber" ? "PNGTuber" : kind === "live2d" ? "Live2D" : `${kind} source`,
    visible: true,
    locked: false,
    blendMode: "normal",
    transform: defaultTransform({ x: 0.12, y: 0.12, width: 0.32, height: 0.24 })
  };

  switch (kind) {
    case "screen":
      return { ...base, kind, captureMode: "android-media-projection" };
    case "pngtuber":
      return {
        ...base,
        kind,
        avatarId: "default-pngtuber",
        imageUri: "",
        expression: "neutral",
        mouthOpen: 0,
        blink: 0,
        motion: defaultAvatarMotion()
      };
    case "live2d":
      return {
        ...base,
        kind,
        modelId: "default-live2d",
        expression: "neutral",
        mouthOpen: 0,
        blink: 0,
        motion: defaultAvatarMotion()
      };
    case "image":
      return { ...base, kind, uri: "" };
    case "solid":
      return { ...base, kind, color: "#27272a" };
    case "text":
      return { ...base, kind, text: "Text", color: "#f8fafc", fontSize: 36 };
  }
};

export const normalizeSceneDocument = (value: unknown): SceneDocument => {
  const fallback = createDefaultScene();
  if (!isRecord(value)) {
    return fallback;
  }

  const sources = Array.isArray(value.sources)
    ? value.sources.flatMap((source) => {
        const normalized = normalizeSceneSource(source);
        return normalized ? [normalized] : [];
      })
    : fallback.sources;

  return {
    version: 1,
    id: stringValue(value.id, fallback.id),
    name: stringValue(value.name, fallback.name),
    canvas: normalizeCanvas(value.canvas, fallback.canvas),
    sources: sources.length > 0 ? sources : fallback.sources
  };
};

export const stripTransientSceneRuntime = (scene: SceneDocument): SceneDocument => ({
  ...scene,
  sources: scene.sources.map((source) => {
    if (!isAvatarSource(source)) {
      return source;
    }
    return {
      ...source,
      mouthOpen: 0,
      blink: 0,
      motion: defaultAvatarMotion()
    };
  })
});

export const addSource = (scene: SceneDocument, source: SceneSource): SceneDocument => ({
  ...scene,
  sources: [...scene.sources, source]
});

export const updateSource = (
  scene: SceneDocument,
  sourceId: string,
  update: (source: SceneSource) => SceneSource
): SceneDocument => ({
  ...scene,
  sources: scene.sources.map((source) => (source.id === sourceId ? update(source) : source))
});

export const updateTransform = (
  scene: SceneDocument,
  sourceId: string,
  transform: Partial<Transform>
): SceneDocument =>
  updateSource(scene, sourceId, (source) => ({
    ...source,
    transform: clampTransform({ ...source.transform, ...transform })
  }));

export const setVisibility = (scene: SceneDocument, sourceId: string, visible: boolean): SceneDocument =>
  updateSource(scene, sourceId, (source) => ({ ...source, visible }));

export const setLocked = (scene: SceneDocument, sourceId: string, locked: boolean): SceneDocument =>
  updateSource(scene, sourceId, (source) => ({ ...source, locked }));

export const reorderSource = (scene: SceneDocument, sourceId: string, direction: -1 | 1): SceneDocument => {
  const index = scene.sources.findIndex((source) => source.id === sourceId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= scene.sources.length) {
    return scene;
  }
  const sources = [...scene.sources];
  const [source] = sources.splice(index, 1);
  sources.splice(nextIndex, 0, source);
  return { ...scene, sources };
};

export const toRenderGraph = (scene: SceneDocument): RenderNode[] =>
  scene.sources
    .filter((source) => source.visible)
    .map((source, order) => ({
      id: source.id,
      kind: source.kind,
      order,
      transform: source.transform,
      payload: sourcePayload(source)
    }));

const sourcePayload = (source: SceneSource): Record<string, string | number | boolean> => {
  switch (source.kind) {
    case "screen":
      return { captureMode: source.captureMode };
    case "pngtuber": {
      const pngMotion = source.motion ?? defaultAvatarMotion();
      return {
        avatarId: source.avatarId,
        imageUri: source.imageUri,
        expression: source.expression,
        mouthOpen: source.mouthOpen,
        blink: source.blink,
        headYaw: pngMotion.headYaw,
        headPitch: pngMotion.headPitch,
        headRoll: pngMotion.headRoll,
        headX: pngMotion.headX,
        headY: pngMotion.headY,
        bodyLean: pngMotion.bodyLean,
        bodyBounce: pngMotion.bodyBounce,
        breathing: pngMotion.breathing,
        trackingConfidence: pngMotion.confidence
      };
    }
    case "live2d": {
      const live2dMotion = source.motion ?? defaultAvatarMotion();
      return {
        modelId: source.modelId,
        expression: source.expression,
        mouthOpen: source.mouthOpen,
        blink: source.blink,
        headYaw: live2dMotion.headYaw,
        headPitch: live2dMotion.headPitch,
        headRoll: live2dMotion.headRoll,
        headX: live2dMotion.headX,
        headY: live2dMotion.headY,
        bodyLean: live2dMotion.bodyLean,
        bodyBounce: live2dMotion.bodyBounce,
        breathing: live2dMotion.breathing,
        trackingConfidence: live2dMotion.confidence
      };
    }
    case "image":
      return { uri: source.uri };
    case "solid":
      return { color: source.color };
    case "text":
      return { text: source.text, color: source.color, fontSize: source.fontSize };
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim().length > 0 ? value : fallback;

const booleanValue = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const clampedNumber = (value: unknown, fallback: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, finiteNumber(value, fallback)));

const normalizeCanvas = (value: unknown, fallback: SceneDocument["canvas"]): SceneDocument["canvas"] => {
  if (!isRecord(value)) {
    return fallback;
  }
  return {
    width: Math.round(clampedNumber(value.width, fallback.width, 1, 7680)),
    height: Math.round(clampedNumber(value.height, fallback.height, 1, 4320)),
    fps: Math.round(clampedNumber(value.fps, fallback.fps, 1, 120))
  };
};

const normalizeTransformValue = (value: unknown, fallback: Transform): Transform => {
  if (!isRecord(value)) {
    return fallback;
  }
  return clampTransform({
    x: finiteNumber(value.x, fallback.x),
    y: finiteNumber(value.y, fallback.y),
    width: finiteNumber(value.width, fallback.width),
    height: finiteNumber(value.height, fallback.height),
    rotation: finiteNumber(value.rotation, fallback.rotation),
    opacity: finiteNumber(value.opacity, fallback.opacity)
  });
};

const normalizeMotionValue = (value: unknown): AvatarMotion => {
  if (!isRecord(value)) {
    return defaultAvatarMotion();
  }
  return defaultAvatarMotion({
    headYaw: clampedNumber(value.headYaw, 0, -1, 1),
    headPitch: clampedNumber(value.headPitch, 0, -1, 1),
    headRoll: clampedNumber(value.headRoll, 0, -1, 1),
    headX: clampedNumber(value.headX, 0, -1, 1),
    headY: clampedNumber(value.headY, 0, -1, 1),
    bodyLean: clampedNumber(value.bodyLean, 0, -1, 1),
    bodyBounce: clampedNumber(value.bodyBounce, 0, -1, 1),
    breathing: clampedNumber(value.breathing, 0, -1, 1),
    confidence: clampedNumber(value.confidence, 0, 0, 1)
  });
};

const normalizeSceneSource = (value: unknown): SceneSource | null => {
  if (!isRecord(value) || !isSourceKind(value.kind)) {
    return null;
  }

  const fallback = createSource(value.kind);
  const base = {
    id: stringValue(value.id, fallback.id),
    name: stringValue(value.name, fallback.name),
    visible: booleanValue(value.visible, fallback.visible),
    locked: booleanValue(value.locked, fallback.locked),
    transform: normalizeTransformValue(value.transform, fallback.transform),
    blendMode: isBlendMode(value.blendMode) ? value.blendMode : fallback.blendMode
  };

  switch (value.kind) {
    case "screen":
      return {
        ...base,
        kind: "screen",
        captureMode: value.captureMode === "ios-replaykit" ? "ios-replaykit" : "android-media-projection"
      };
    case "pngtuber": {
      const sourceFallback = createSource("pngtuber") as PNGTuberSource;
      return {
        ...base,
        kind: "pngtuber",
        avatarId: stringValue(value.avatarId, sourceFallback.avatarId),
        imageUri: typeof value.imageUri === "string" ? value.imageUri : sourceFallback.imageUri,
        expression: stringValue(value.expression, sourceFallback.expression),
        mouthOpen: clampedNumber(value.mouthOpen, sourceFallback.mouthOpen, 0, 1),
        blink: clampedNumber(value.blink, sourceFallback.blink, 0, 1),
        motion: normalizeMotionValue(value.motion)
      };
    }
    case "live2d": {
      const sourceFallback = createSource("live2d") as Live2DSource;
      return {
        ...base,
        kind: "live2d",
        modelId: stringValue(value.modelId, sourceFallback.modelId),
        expression: stringValue(value.expression, sourceFallback.expression),
        mouthOpen: clampedNumber(value.mouthOpen, sourceFallback.mouthOpen, 0, 1),
        blink: clampedNumber(value.blink, sourceFallback.blink, 0, 1),
        motion: normalizeMotionValue(value.motion)
      };
    }
    case "image": {
      const sourceFallback = createSource("image") as ImageSource;
      return { ...base, kind: "image", uri: typeof value.uri === "string" ? value.uri : sourceFallback.uri };
    }
    case "solid": {
      const sourceFallback = createSource("solid") as SolidSource;
      return { ...base, kind: "solid", color: stringValue(value.color, sourceFallback.color) };
    }
    case "text": {
      const sourceFallback = createSource("text") as TextSource;
      return {
        ...base,
        kind: "text",
        text: typeof value.text === "string" ? value.text : sourceFallback.text,
        color: stringValue(value.color, sourceFallback.color),
        fontSize: clampedNumber(value.fontSize, sourceFallback.fontSize, 8, 180)
      };
    }
  }
};

const isSourceKind = (value: unknown): value is SourceKind =>
  typeof value === "string" && sourceKinds.includes(value as SourceKind);

const isBlendMode = (value: unknown): value is BlendMode =>
  typeof value === "string" && blendModes.includes(value as BlendMode);

const isAvatarSource = (source: SceneSource): source is PNGTuberSource | Live2DSource =>
  source.kind === "pngtuber" || source.kind === "live2d";
