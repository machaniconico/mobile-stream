export type SourceKind = "screen" | "pngtuber" | "live2d" | "image" | "solid" | "text" | "chat";

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
  depthTilt: number;
  meshWarp: number;
  eyeSquint: number;
  mouthDeform: number;
  hairSway: number;
  shoulderSway: number;
  confidence: number;
}

export interface AvatarIllustrationRig {
  faceCenterY: number;
  faceRange: number;
  hairLineY: number;
  shoulderLineY: number;
  eyeLineY: number;
  mouthLineY: number;
  sliceCount: number;
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
  illustrationRig: AvatarIllustrationRig;
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

export interface ChatOverlaySource extends BaseSource {
  kind: "chat";
  maxMessages: number;
  maxMessageLength: number;
  showAuthor: boolean;
  redactUrls: boolean;
  color: string;
  fontSize: number;
  backgroundColor: string;
  backgroundOpacity: number;
}

export type SceneSource =
  | ScreenSource
  | PNGTuberSource
  | Live2DSource
  | ImageSource
  | SolidSource
  | TextSource
  | ChatOverlaySource;

export interface ChatOverlayMessage {
  author: string;
  body: string;
  source?: string;
}

export interface RenderGraphRuntime {
  chatMessages?: ChatOverlayMessage[];
}

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

export interface AvatarIllustrationRigInferenceInput {
  canvas?: Partial<SceneDocument["canvas"]> | null;
  transform?: Partial<Transform> | null;
  imageAspectRatio?: number | null;
}

export interface RenderNode {
  id: string;
  kind: SourceKind;
  order: number;
  transform: Transform;
  payload: Record<string, string | number | boolean>;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const clampRange = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const sourceKinds: readonly SourceKind[] = ["screen", "pngtuber", "live2d", "image", "solid", "text", "chat"];
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
  depthTilt: 0,
  meshWarp: 0,
  eyeSquint: 0,
  mouthDeform: 0,
  hairSway: 0,
  shoulderSway: 0,
  confidence: 0,
  ...overrides
});

export const defaultAvatarIllustrationRig = (overrides: Partial<AvatarIllustrationRig> = {}): AvatarIllustrationRig => ({
  faceCenterY: clampRange(overrides.faceCenterY ?? 0.42, 0.15, 0.85),
  faceRange: clampRange(overrides.faceRange ?? 0.34, 0.08, 0.6),
  hairLineY: clampRange(overrides.hairLineY ?? 0.34, 0.05, 0.55),
  shoulderLineY: clampRange(overrides.shoulderLineY ?? 0.62, 0.45, 0.95),
  eyeLineY: clampRange(overrides.eyeLineY ?? 0.35, 0.12, 0.65),
  mouthLineY: clampRange(overrides.mouthLineY ?? 0.5, 0.25, 0.85),
  sliceCount: Math.round(clampRange(overrides.sliceCount ?? 24, 12, 40))
});

export const inferAvatarIllustrationRig = (
  input: AvatarIllustrationRigInferenceInput = {},
  overrides: Partial<AvatarIllustrationRig> = {}
): AvatarIllustrationRig => {
  const canvasWidth = clampRange(input.canvas?.width ?? 1920, 1, 7680);
  const canvasHeight = clampRange(input.canvas?.height ?? 1080, 1, 4320);
  const transformWidth = clampRange(input.transform?.width ?? 0.3, 0.03, 1);
  const transformHeight = clampRange(input.transform?.height ?? 0.45, 0.03, 1);
  const imageAspectRatio = finiteNumber(input.imageAspectRatio, 0);
  const renderAspect =
    imageAspectRatio > 0 ? imageAspectRatio : (transformWidth * canvasWidth) / Math.max(transformHeight * canvasHeight, 1);
  const tallOrLarge = transformHeight >= 0.58 || renderAspect < 0.74;
  const closeUp = transformHeight <= 0.28 || renderAspect > 1.32;
  const inferred = tallOrLarge
    ? {
        faceCenterY: 0.32,
        faceRange: 0.24,
        hairLineY: 0.23,
        shoulderLineY: 0.54,
        eyeLineY: 0.28,
        mouthLineY: 0.39,
        sliceCount: 32
      }
    : closeUp
      ? {
          faceCenterY: 0.46,
          faceRange: 0.48,
          hairLineY: 0.26,
          shoulderLineY: 0.82,
          eyeLineY: 0.4,
          mouthLineY: 0.58,
          sliceCount: 20
        }
      : {
          faceCenterY: 0.39,
          faceRange: 0.34,
          hairLineY: 0.31,
          shoulderLineY: 0.63,
          eyeLineY: 0.34,
          mouthLineY: 0.49,
          sliceCount: 24
        };

  return defaultAvatarIllustrationRig({ ...inferred, ...overrides });
};

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

export const createDefaultScene = (): SceneDocument => {
  const canvas = {
    width: 1920,
    height: 1080,
    fps: 30
  };
  const avatarTransform = defaultTransform({ x: 0.67, y: 0.44, width: 0.26, height: 0.45 });

  return {
    version: 1,
    id: "scene-main",
    name: "Main Scene",
    canvas,
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
      illustrationRig: inferAvatarIllustrationRig({ canvas, transform: avatarTransform }),
      expression: "neutral",
      mouthOpen: 0.18,
      blink: 0,
      motion: defaultAvatarMotion(),
      transform: avatarTransform
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
    },
    {
      id: "source-chat",
      kind: "chat",
      name: "Chat Overlay",
      visible: true,
      locked: false,
      blendMode: "normal",
      maxMessages: 4,
      maxMessageLength: 160,
      showAuthor: true,
      redactUrls: true,
      color: "#f8fafc",
      fontSize: 34,
      backgroundColor: "#000000",
      backgroundOpacity: 0,
      transform: defaultTransform({ x: 0.04, y: 0.64, width: 0.48, height: 0.28 })
    }
  ]
  };
};

export const createSource = (kind: SourceKind): SceneSource => {
  const base: BaseSource = {
    id: makeId(`source-${kind}`),
    kind,
    name:
      kind === "pngtuber" ? "PNGTuber" : kind === "live2d" ? "Live2D" : kind === "chat" ? "Chat Overlay" : `${kind} source`,
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
        illustrationRig: inferAvatarIllustrationRig({ transform: base.transform }),
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
    case "chat":
      return {
        ...base,
        kind,
        maxMessages: 4,
        maxMessageLength: 160,
        showAuthor: true,
        redactUrls: true,
        color: "#f8fafc",
        fontSize: 34,
        backgroundColor: "#000000",
        backgroundOpacity: 0,
        transform: defaultTransform({ x: 0.04, y: 0.64, width: 0.48, height: 0.28 })
      };
  }
};

export const normalizeSceneDocument = (value: unknown): SceneDocument => {
  const fallback = createDefaultScene();
  if (!isRecord(value)) {
    return fallback;
  }

  const canvas = normalizeCanvas(value.canvas, fallback.canvas);
  const sources = Array.isArray(value.sources)
    ? value.sources.flatMap((source) => {
        const normalized = normalizeSceneSource(source, canvas);
        return normalized ? [normalized] : [];
      })
    : fallback.sources;

  return {
    version: 1,
    id: stringValue(value.id, fallback.id),
    name: stringValue(value.name, fallback.name),
    canvas,
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

export const applyInferredAvatarIllustrationRig = (
  scene: SceneDocument,
  sourceId: string,
  overrides: Partial<AvatarIllustrationRig> = {},
  input: Pick<AvatarIllustrationRigInferenceInput, "imageAspectRatio"> = {}
): SceneDocument =>
  updateSource(scene, sourceId, (source) =>
    source.kind === "pngtuber"
      ? {
          ...source,
          illustrationRig: inferAvatarIllustrationRig({ canvas: scene.canvas, transform: source.transform, ...input }, overrides)
        }
      : source
  );

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

export const toRenderGraph = (scene: SceneDocument, runtime: RenderGraphRuntime = {}): RenderNode[] =>
  scene.sources
    .filter((source) => source.visible)
    .map((source, order) => ({
      id: source.id,
      kind: source.kind,
      order,
      transform: source.transform,
      payload: sourcePayload(source, runtime)
    }));

const sourcePayload = (source: SceneSource, runtime: RenderGraphRuntime): Record<string, string | number | boolean> => {
  switch (source.kind) {
    case "screen":
      return { captureMode: source.captureMode };
    case "pngtuber": {
      const pngMotion = source.motion ?? defaultAvatarMotion();
      const rig = source.illustrationRig ?? defaultAvatarIllustrationRig();
      return {
        avatarId: source.avatarId,
        imageUri: source.imageUri,
        rigFaceCenterY: rig.faceCenterY,
        rigFaceRange: rig.faceRange,
        rigHairLineY: rig.hairLineY,
        rigShoulderLineY: rig.shoulderLineY,
        rigEyeLineY: rig.eyeLineY,
        rigMouthLineY: rig.mouthLineY,
        rigSliceCount: rig.sliceCount,
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
        depthTilt: pngMotion.depthTilt,
        meshWarp: pngMotion.meshWarp,
        eyeSquint: pngMotion.eyeSquint,
        mouthDeform: pngMotion.mouthDeform,
        hairSway: pngMotion.hairSway,
        shoulderSway: pngMotion.shoulderSway,
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
        depthTilt: live2dMotion.depthTilt,
        meshWarp: live2dMotion.meshWarp,
        eyeSquint: live2dMotion.eyeSquint,
        mouthDeform: live2dMotion.mouthDeform,
        hairSway: live2dMotion.hairSway,
        shoulderSway: live2dMotion.shoulderSway,
        trackingConfidence: live2dMotion.confidence
      };
    }
    case "image":
      return { uri: source.uri };
    case "solid":
      return { color: source.color };
    case "text":
      return { text: source.text, color: source.color, fontSize: source.fontSize };
    case "chat": {
      const messages = serializeChatOverlayMessages(runtime.chatMessages ?? [], source);
      return {
        text: messages.map((message) => formatChatOverlayLine(message, source.showAuthor)).join("\n"),
        messagesJson: JSON.stringify(messages),
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
    depthTilt: clampedNumber(value.depthTilt, 0, 0, 1),
    meshWarp: clampedNumber(value.meshWarp, 0, -1, 1),
    eyeSquint: clampedNumber(value.eyeSquint, 0, 0, 1),
    mouthDeform: clampedNumber(value.mouthDeform, 0, 0, 1),
    hairSway: clampedNumber(value.hairSway, 0, -1, 1),
    shoulderSway: clampedNumber(value.shoulderSway, 0, -1, 1),
    confidence: clampedNumber(value.confidence, 0, 0, 1)
  });
};

const normalizeIllustrationRigValue = (
  value: unknown,
  transform: Transform,
  canvas: SceneDocument["canvas"]
): AvatarIllustrationRig => {
  if (!isRecord(value)) {
    return inferAvatarIllustrationRig({ canvas, transform });
  }
  return defaultAvatarIllustrationRig({
    faceCenterY: clampedNumber(value.faceCenterY, 0.42, 0.15, 0.85),
    faceRange: clampedNumber(value.faceRange, 0.34, 0.08, 0.6),
    hairLineY: clampedNumber(value.hairLineY, 0.34, 0.05, 0.55),
    shoulderLineY: clampedNumber(value.shoulderLineY, 0.62, 0.45, 0.95),
    eyeLineY: clampedNumber(value.eyeLineY, 0.35, 0.12, 0.65),
    mouthLineY: clampedNumber(value.mouthLineY, 0.5, 0.25, 0.85),
    sliceCount: Math.round(clampedNumber(value.sliceCount, 24, 12, 40))
  });
};

const normalizeSceneSource = (value: unknown, canvas: SceneDocument["canvas"] = createDefaultScene().canvas): SceneSource | null => {
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
        illustrationRig: normalizeIllustrationRigValue(value.illustrationRig, base.transform, canvas),
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
    case "chat": {
      const sourceFallback = createSource("chat") as ChatOverlaySource;
      return {
        ...base,
        kind: "chat",
        maxMessages: Math.round(clampedNumber(value.maxMessages, sourceFallback.maxMessages, 1, 8)),
        maxMessageLength: Math.round(clampedNumber(value.maxMessageLength, sourceFallback.maxMessageLength, 40, 240)),
        showAuthor: booleanValue(value.showAuthor, sourceFallback.showAuthor),
        redactUrls: booleanValue(value.redactUrls, sourceFallback.redactUrls),
        color: stringValue(value.color, sourceFallback.color),
        fontSize: clampedNumber(value.fontSize, sourceFallback.fontSize, 10, 120),
        backgroundColor: typeof value.backgroundColor === "string" ? value.backgroundColor : sourceFallback.backgroundColor,
        backgroundOpacity: clampedNumber(value.backgroundOpacity, sourceFallback.backgroundOpacity, 0, 1)
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

const serializeChatOverlayMessages = (messages: ChatOverlayMessage[], source: ChatOverlaySource): ChatOverlayMessage[] =>
  messages
    .map((message) => ({
      author: normalizeOverlayText(message.author).slice(0, 48) || "viewer",
      body: truncateOverlayText(source.redactUrls ? redactOverlayUrls(message.body) : message.body, source.maxMessageLength),
      source: normalizeOverlayText(message.source ?? "").slice(0, 24)
    }))
    .filter((message) => message.body.length > 0)
    .slice(0, source.maxMessages);

const formatChatOverlayLine = (message: ChatOverlayMessage, showAuthor: boolean): string =>
  showAuthor ? `${message.author}: ${message.body}` : message.body;

const normalizeOverlayText = (value: string): string =>
  value
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const redactOverlayUrls = (value: string): string => value.replace(/https?:\/\/\S+/gi, "[link]");

const truncateOverlayText = (value: string, maxLength: number): string => {
  const clean = normalizeOverlayText(value);
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
};
