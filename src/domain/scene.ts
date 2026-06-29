import { normalizeLive2DModelJsonUri } from "./live2dModel";
import { normalizeVrmModelUri } from "./vrmModel";
import { createVrmRuntimePose, serializeVrmRuntimePose } from "./vrmRuntime";

export type SourceKind = "screen" | "pngtuber" | "live2d" | "vrm" | "image" | "solid" | "text" | "chat";

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

export interface AvatarIllustrationForegroundBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface AvatarIllustrationImageAnalysis {
  imageAspectRatio: number;
  foregroundBounds: AvatarIllustrationForegroundBounds | null;
  foregroundCoverage: number;
  confidence: number;
}

export interface AvatarIllustrationLandmarkPoint {
  /** Normalized horizontal position. Values outside 0-1 are retained for detector diagnostics but ignored by rig inference. */
  x: number;
  /** Normalized vertical position in the still-image coordinate space, from top 0 to bottom 1. */
  y: number;
  confidence?: number;
}

export interface AvatarIllustrationLandmarkAnalysis {
  confidence: number;
  faceCenter?: AvatarIllustrationLandmarkPoint | null;
  leftEye?: AvatarIllustrationLandmarkPoint | null;
  rightEye?: AvatarIllustrationLandmarkPoint | null;
  mouthCenter?: AvatarIllustrationLandmarkPoint | null;
  hairLineY?: number | null;
  shoulderLineY?: number | null;
}

export type AvatarIllustrationDetectorLandmarkType = "eye" | "mouth" | "nose";

export interface AvatarIllustrationDetectorLandmark {
  type: AvatarIllustrationDetectorLandmarkType | string;
  locations: AvatarIllustrationLandmarkPoint[];
  confidence?: number;
}

export interface AvatarIllustrationDetectorFace {
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence?: number;
  landmarks?: AvatarIllustrationDetectorLandmark[] | null;
}

export interface AvatarIllustrationDetectorInput {
  width: number;
  height: number;
  faces: AvatarIllustrationDetectorFace[];
}

export interface AvatarIllustrationAlphaMaskInput {
  width: number;
  height: number;
  data: ArrayLike<number>;
  pixelStride?: number;
  alphaOffset?: number;
  alphaThreshold?: number;
  sampleStep?: number;
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
  modelJsonUri: string;
  expression: string;
  mouthOpen: number;
  blink: number;
  motion: AvatarMotion;
}

export interface VRMSource extends BaseSource {
  kind: "vrm";
  modelId: string;
  modelUri: string;
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
  | VRMSource
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

export type SceneTemplateId = "main" | "starting-soon" | "break" | "privacy-shield";
export type SceneTransitionKind = "cut" | "fade";

export interface SceneTransitionSettings {
  kind: SceneTransitionKind;
  durationMs: number;
}

export interface SceneTransitionPreview {
  scene: SceneDocument;
  startedAt: number;
  settings: SceneTransitionSettings;
}

export interface SceneCollection {
  version: 1;
  activeSceneId: string;
  transition: SceneTransitionSettings;
  scenes: SceneDocument[];
}

export interface AvatarIllustrationRigInferenceInput {
  canvas?: Partial<SceneDocument["canvas"]> | null;
  transform?: Partial<Transform> | null;
  imageAspectRatio?: number | null;
  imageAnalysis?: AvatarIllustrationImageAnalysis | null;
  landmarkAnalysis?: AvatarIllustrationLandmarkAnalysis | null;
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
const sourceKinds: readonly SourceKind[] = ["screen", "pngtuber", "live2d", "vrm", "image", "solid", "text", "chat"];
const blendModes: readonly BlendMode[] = ["normal", "multiply", "screen"];
const sceneTransitionKinds: readonly SceneTransitionKind[] = ["cut", "fade"];

const clampTransform = (transform: Transform): Transform => ({
  x: clamp01(transform.x),
  y: clamp01(transform.y),
  width: clamp01(transform.width),
  height: clamp01(transform.height),
  rotation: Math.max(-180, Math.min(180, transform.rotation)),
  opacity: clamp01(transform.opacity)
});

const makeId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export const defaultSceneTransitionSettings = (
  overrides: Partial<SceneTransitionSettings> = {}
): SceneTransitionSettings => ({
  kind: sceneTransitionKinds.includes(overrides.kind as SceneTransitionKind) ? (overrides.kind as SceneTransitionKind) : "fade",
  durationMs: Math.round(clampRange(overrides.durationMs ?? 300, 0, 2000))
});

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

export const analyzeAvatarIllustrationAlphaMask = (
  input: AvatarIllustrationAlphaMaskInput
): AvatarIllustrationImageAnalysis | null => {
  const width = Math.floor(finiteNumber(input.width, 0));
  const height = Math.floor(finiteNumber(input.height, 0));
  const pixelStride = Math.max(1, Math.floor(finiteNumber(input.pixelStride, 4)));
  const alphaOffset = Math.max(0, Math.floor(finiteNumber(input.alphaOffset, 3)));
  const alphaThreshold = clampRange(finiteNumber(input.alphaThreshold, 16), 0, 255);
  const sampleStep = Math.max(
    1,
    Math.floor(finiteNumber(input.sampleStep, Math.ceil(Math.max(width, height) / 512)))
  );
  const expectedLength = width * height * pixelStride;
  if (width <= 0 || height <= 0 || input.data.length < expectedLength || alphaOffset >= pixelStride) {
    return null;
  }

  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  let foregroundSamples = 0;
  let totalSamples = 0;
  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      totalSamples += 1;
      const alpha = input.data[(y * width + x) * pixelStride + alphaOffset] ?? 0;
      if (alpha <= alphaThreshold) {
        continue;
      }
      foregroundSamples += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  const imageAspectRatio = width / height;
  if (foregroundSamples === 0 || totalSamples === 0) {
    return {
      imageAspectRatio,
      foregroundBounds: null,
      foregroundCoverage: 0,
      confidence: 0
    };
  }

  const left = minX / width;
  const right = Math.min(1, (maxX + sampleStep) / width);
  const top = minY / height;
  const bottom = Math.min(1, (maxY + sampleStep) / height);
  const foregroundCoverage = foregroundSamples / totalSamples;
  const bounds = {
    left,
    right,
    top,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };

  return {
    imageAspectRatio,
    foregroundBounds: bounds,
    foregroundCoverage,
    confidence: clamp01(bounds.width * bounds.height > 0 ? foregroundCoverage / Math.max(bounds.width * bounds.height, 0.01) : 0)
  };
};

export const createAvatarIllustrationLandmarkAnalysisFromDetector = (
  input: AvatarIllustrationDetectorInput
): AvatarIllustrationLandmarkAnalysis | null => {
  const width = finiteNumber(input.width, 0);
  const height = finiteNumber(input.height, 0);
  if (width <= 0 || height <= 0 || input.faces.length === 0) {
    return null;
  }

  const face = input.faces
    .map((candidate) => normalizeDetectorFace(candidate, width, height))
    .filter((candidate): candidate is NormalizedDetectorFace => candidate !== null)
    .sort((left, right) => right.area * right.confidence - left.area * left.confidence)[0];
  if (!face) {
    return null;
  }

  const eyes = face.landmarks
    .filter((landmark) => landmark.type === "eye")
    .map((landmark) => averageLandmarkLocations(landmark.locations, landmark.confidence))
    .filter((point): point is AvatarIllustrationLandmarkPoint => point !== null)
    .sort((left, right) => left.x - right.x);
  const mouth = face.landmarks
    .filter((landmark) => landmark.type === "mouth")
    .map((landmark) => averageLandmarkLocations(landmark.locations, landmark.confidence))
    .filter((point): point is AvatarIllustrationLandmarkPoint => point !== null)
    .sort((left, right) => (right.confidence ?? 0) - (left.confidence ?? 0))[0];
  const hasDetectorLandmarks = eyes.length > 0 || Boolean(mouth);
  const fallbackConfidence = hasDetectorLandmarks ? 0.78 : 0.62;
  const confidence = clamp01(Math.max(fallbackConfidence, face.confidence));
  const eyeConfidence = hasDetectorLandmarks ? confidence : confidence * 0.72;
  const mouthConfidence = mouth ? (mouth.confidence ?? confidence) : confidence * 0.7;
  const box = face.boundingBox;
  const leftEye =
    eyes.length >= 2
      ? eyes[0]
      : eyes[0] ?? {
          x: clamp01(box.x + box.width * 0.34),
          y: clamp01(box.y + box.height * 0.42),
          confidence: eyeConfidence
        };
  const rightEye =
    eyes.length >= 2
      ? eyes[eyes.length - 1]
      : eyes[0]
        ? null
        : {
            x: clamp01(box.x + box.width * 0.66),
            y: clamp01(box.y + box.height * 0.42),
            confidence: eyeConfidence
          };

  return {
    confidence,
    faceCenter: {
      x: clamp01(box.x + box.width / 2),
      y: clamp01(box.y + box.height * 0.54),
      confidence
    },
    leftEye,
    rightEye,
    mouthCenter: mouth ?? {
      x: clamp01(box.x + box.width / 2),
      y: clamp01(box.y + box.height * 0.74),
      confidence: mouthConfidence
    },
    hairLineY: clamp01(box.y - box.height * 0.18),
    shoulderLineY: clamp01(box.y + box.height * 1.58)
  };
};

export const inferAvatarIllustrationRig = (
  input: AvatarIllustrationRigInferenceInput = {},
  overrides: Partial<AvatarIllustrationRig> = {}
): AvatarIllustrationRig => {
  const canvasWidth = clampRange(input.canvas?.width ?? 1920, 1, 7680);
  const canvasHeight = clampRange(input.canvas?.height ?? 1080, 1, 4320);
  const transformWidth = clampRange(input.transform?.width ?? 0.3, 0.03, 1);
  const transformHeight = clampRange(input.transform?.height ?? 0.45, 0.03, 1);
  const imageAspectRatio = finiteNumber(input.imageAspectRatio, 0);
  const analysisRig = inferAvatarIllustrationRigFromImageAnalysis(input.imageAnalysis ?? null);
  const landmarkRig = inferAvatarIllustrationRigFromLandmarks(input.landmarkAnalysis ?? null, input.imageAnalysis ?? null);
  const renderAspect =
    input.imageAnalysis?.imageAspectRatio && input.imageAnalysis.imageAspectRatio > 0
      ? input.imageAnalysis.imageAspectRatio
      : imageAspectRatio > 0
        ? imageAspectRatio
        : (transformWidth * canvasWidth) / Math.max(transformHeight * canvasHeight, 1);
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

  return defaultAvatarIllustrationRig({ ...inferred, ...analysisRig, ...landmarkRig, ...overrides });
};

const inferAvatarIllustrationRigFromLandmarks = (
  landmarks: AvatarIllustrationLandmarkAnalysis | null,
  imageAnalysis: AvatarIllustrationImageAnalysis | null
): Partial<AvatarIllustrationRig> => {
  if (!landmarks || clamp01(finiteNumber(landmarks.confidence, 0)) < 0.55) {
    return {};
  }
  const leftEye = normalizedPoint(landmarks.leftEye);
  const rightEye = normalizedPoint(landmarks.rightEye);
  const mouth = normalizedPoint(landmarks.mouthCenter);
  if (!mouth || (!leftEye && !rightEye)) {
    return {};
  }
  const eyeLineY = averageNumbers([leftEye?.y, rightEye?.y]);
  if (eyeLineY === null) {
    return {};
  }
  const faceCenter = normalizedPoint(landmarks.faceCenter);
  const foregroundBounds = imageAnalysis?.foregroundBounds;
  const topLimit = foregroundBounds?.top ?? 0;
  const bottomLimit = foregroundBounds?.bottom ?? 1;
  const eyeMouthGap = Math.max(0.08, mouth.y - eyeLineY);
  const measuredHairLineY = normalizedY(landmarks.hairLineY);
  const measuredShoulderLineY = normalizedY(landmarks.shoulderLineY);
  const hairLineY = Math.min(
    measuredHairLineY ?? clampRange(eyeLineY - eyeMouthGap * 0.85, topLimit, eyeLineY - 0.03),
    eyeLineY - 0.03
  );
  const mouthLineY = Math.max(mouth.y, eyeLineY + 0.11);
  const shoulderLineY = Math.max(
    measuredShoulderLineY ?? clampRange(mouthLineY + eyeMouthGap * 1.45, mouthLineY + 0.12, bottomLimit),
    mouthLineY + 0.12
  );
  const inferredFaceCenterY = faceCenter?.y ?? clampRange(eyeLineY + eyeMouthGap * 0.42, topLimit + 0.08, bottomLimit - 0.08);
  const lowerFaceReach = Math.max(mouthLineY - hairLineY, eyeMouthGap * 1.6);
  const faceRange = clampRange(lowerFaceReach * 1.15, 0.22, 0.64);
  const confidence = clamp01(finiteNumber(landmarks.confidence, 0));
  return {
    faceCenterY: inferredFaceCenterY,
    faceRange,
    hairLineY,
    shoulderLineY,
    eyeLineY,
    mouthLineY,
    sliceCount: confidence >= 0.82 ? 36 : 32
  };
};

const normalizedPoint = (point: AvatarIllustrationLandmarkPoint | null | undefined): AvatarIllustrationLandmarkPoint | null => {
  if (!point) {
    return null;
  }
  const y = normalizedY(point.y);
  const confidence = point.confidence === undefined ? 1 : clamp01(finiteNumber(point.confidence, 0));
  return y === null || confidence < 0.35 ? null : { x: clamp01(finiteNumber(point.x, 0.5)), y, confidence };
};

const normalizedY = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;

const averageNumbers = (values: Array<number | null | undefined>): number | null => {
  const finiteValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (finiteValues.length === 0) {
    return null;
  }
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
};

interface NormalizedDetectorFace {
  boundingBox: AvatarIllustrationDetectorFace["boundingBox"];
  confidence: number;
  landmarks: AvatarIllustrationDetectorLandmark[];
  area: number;
}

const normalizeDetectorFace = (
  face: AvatarIllustrationDetectorFace,
  frameWidth: number,
  frameHeight: number
): NormalizedDetectorFace | null => {
  const x = finiteNumber(face.boundingBox.x, Number.NaN) / frameWidth;
  const y = finiteNumber(face.boundingBox.y, Number.NaN) / frameHeight;
  const width = finiteNumber(face.boundingBox.width, Number.NaN) / frameWidth;
  const height = finiteNumber(face.boundingBox.height, Number.NaN) / frameHeight;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }
  const left = clamp01(x);
  const top = clamp01(y);
  const right = clamp01(x + width);
  const bottom = clamp01(y + height);
  const boundingBox = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
  if (boundingBox.width <= 0 || boundingBox.height <= 0) {
    return null;
  }
  return {
    boundingBox,
    confidence: clamp01(finiteNumber(face.confidence, 0.74)),
    landmarks: (face.landmarks ?? []).map((landmark) => ({
      type: landmark.type,
      confidence: landmark.confidence,
      locations: landmark.locations
        .map((point) => ({
          x: finiteNumber(point.x, Number.NaN) / frameWidth,
          y: finiteNumber(point.y, Number.NaN) / frameHeight,
          confidence: point.confidence
        }))
        .filter((point) => normalizedPoint(point) !== null)
    })),
    area: boundingBox.width * boundingBox.height
  };
};

const averageLandmarkLocations = (
  locations: AvatarIllustrationLandmarkPoint[],
  confidence: number | undefined
): AvatarIllustrationLandmarkPoint | null => {
  const points = locations
    .map((point) => normalizedPoint(point))
    .filter((point): point is AvatarIllustrationLandmarkPoint => point !== null);
  if (points.length === 0) {
    return null;
  }
  return {
    x: averageNumbers(points.map((point) => point.x)) ?? 0.5,
    y: averageNumbers(points.map((point) => point.y)) ?? 0.5,
    confidence: clamp01(finiteNumber(confidence, averageNumbers(points.map((point) => point.confidence)) ?? 0.72))
  };
};

const inferAvatarIllustrationRigFromImageAnalysis = (
  analysis: AvatarIllustrationImageAnalysis | null
): Partial<AvatarIllustrationRig> => {
  const bounds = analysis?.foregroundBounds;
  if (!bounds || analysis.confidence < 0.25 || bounds.height < 0.18 || bounds.width < 0.08) {
    return {};
  }
  if (bounds.width > 0.96 && bounds.height > 0.96 && analysis.foregroundCoverage > 0.9) {
    return {};
  }
  const foregroundAspectRatio = bounds.width / Math.max(bounds.height, 0.01);
  const fullBody = foregroundAspectRatio < 0.46 || bounds.height > 0.78;
  const closeUp = foregroundAspectRatio > 1.15 || bounds.height < 0.38;
  const preset = fullBody
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
          sliceCount: 24
        }
      : {
          faceCenterY: 0.39,
          faceRange: 0.34,
          hairLineY: 0.31,
          shoulderLineY: 0.63,
          eyeLineY: 0.34,
          mouthLineY: 0.49,
          sliceCount: 28
        };
  const mapY = (value: number) => bounds.top + value * bounds.height;
  return {
    faceCenterY: mapY(preset.faceCenterY),
    faceRange: preset.faceRange * bounds.height,
    hairLineY: mapY(preset.hairLineY),
    shoulderLineY: mapY(preset.shoulderLineY),
    eyeLineY: mapY(preset.eyeLineY),
    mouthLineY: mapY(preset.mouthLineY),
    sliceCount: analysis.confidence >= 0.65 ? preset.sliceCount : Math.max(20, preset.sliceCount - 4)
  };
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

export const privacyShieldSceneId = "scene-privacy-shield";

const templateLabels: Record<SceneTemplateId, string> = {
  main: "Main Scene",
  "starting-soon": "Starting Soon",
  break: "Break",
  "privacy-shield": "Privacy Shield"
};

export const sceneTemplateIds: readonly SceneTemplateId[] = ["main", "starting-soon", "break", "privacy-shield"];

const defaultSource = <Kind extends SourceKind>(kind: Kind): Extract<SceneSource, { kind: Kind }> => {
  const source = createDefaultScene().sources.find((item): item is Extract<SceneSource, { kind: Kind }> => item.kind === kind);
  if (!source) {
    throw new Error(`Missing default ${kind} source.`);
  }
  return source;
};

export const createSceneFromTemplate = (templateId: SceneTemplateId): SceneDocument => {
  if (templateId === "main") {
    return createDefaultScene();
  }

  const canvas = createDefaultScene().canvas;
  const background = defaultSource("solid");
  const label = defaultSource("text");
  const avatar = defaultSource("pngtuber");
  const chat = defaultSource("chat");
  const isBreak = templateId === "break";

  if (templateId === "privacy-shield") {
    return {
      version: 1,
      id: privacyShieldSceneId,
      name: templateLabels[templateId],
      canvas,
      sources: [
        {
          ...background,
          id: "source-privacy-shield-background",
          name: "Privacy Background",
          color: "#050506",
          transform: defaultTransform({ x: 0, y: 0, width: 1, height: 1 })
        },
        {
          ...label,
          id: "source-privacy-shield-label",
          name: "Privacy Label",
          text: "Privacy Shield",
          color: "#f8fafc",
          fontSize: 72,
          transform: defaultTransform({ x: 0.16, y: 0.38, width: 0.68, height: 0.16 })
        }
      ]
    };
  }

  return {
    version: 1,
    id: `scene-${templateId}`,
    name: templateLabels[templateId],
    canvas,
    sources: [
      {
        ...background,
        id: `source-${templateId}-background`,
        name: isBreak ? "Break Background" : "Waiting Background",
        color: isBreak ? "#15151c" : "#0f172a"
      },
      {
        ...label,
        id: `source-${templateId}-label`,
        name: isBreak ? "Break Label" : "Waiting Label",
        text: isBreak ? "Be right back" : "Starting soon",
        fontSize: isBreak ? 70 : 76,
        transform: defaultTransform({ x: 0.08, y: 0.18, width: 0.72, height: 0.18 })
      },
      {
        ...avatar,
        id: `source-${templateId}-avatar`,
        name: "PNGTuber",
        transform: defaultTransform({ x: 0.68, y: 0.42, width: 0.24, height: 0.46 })
      },
      {
        ...chat,
        id: `source-${templateId}-chat`,
        name: "Chat Overlay",
        maxMessages: 5,
        transform: defaultTransform({ x: 0.08, y: 0.58, width: 0.44, height: 0.3 })
      }
    ]
  };
};

export const createDefaultSceneCollection = (): SceneCollection => ({
  version: 1,
  activeSceneId: "scene-main",
  transition: defaultSceneTransitionSettings(),
  scenes: sceneTemplateIds.map(createSceneFromTemplate)
});

export const createSource = (kind: SourceKind): SceneSource => {
  const base: BaseSource = {
    id: makeId(`source-${kind}`),
    kind,
    name:
      kind === "pngtuber"
        ? "PNGTuber"
        : kind === "live2d"
          ? "Live2D"
          : kind === "vrm"
            ? "VRM"
            : kind === "chat"
              ? "Chat Overlay"
              : `${kind} source`,
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
        modelJsonUri: "",
        expression: "neutral",
        mouthOpen: 0,
        blink: 0,
        motion: defaultAvatarMotion()
      };
    case "vrm":
      return {
        ...base,
        kind,
        modelId: "default-vrm",
        modelUri: "",
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

export const normalizeSceneCollection = (value: unknown): SceneCollection => {
  if (!isRecord(value)) {
    return createDefaultSceneCollection();
  }

  if (!Array.isArray(value.scenes) && Array.isArray(value.sources)) {
    const scene = normalizeSceneDocument(value);
    return {
      version: 1,
      activeSceneId: scene.id,
      transition: defaultSceneTransitionSettings(),
      scenes: [scene]
    };
  }

  const rawScenes = Array.isArray(value.scenes) ? value.scenes : [];
  const scenes = ensureUniqueSceneIds(rawScenes.map(normalizeSceneDocument));
  if (scenes.length === 0) {
    return createDefaultSceneCollection();
  }

  const activeSceneId = scenes.some((scene) => scene.id === value.activeSceneId)
    ? String(value.activeSceneId)
    : scenes[0].id;

  return {
    version: 1,
    activeSceneId,
    transition: normalizeSceneTransitionSettings(value.transition),
    scenes
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

export const stripTransientSceneCollectionRuntime = (collection: SceneCollection): SceneCollection => {
  const normalized = normalizeSceneCollection(collection);
  return {
    ...normalized,
    scenes: normalized.scenes.map(stripTransientSceneRuntime)
  };
};

export const selectActiveScene = (collection: SceneCollection): SceneDocument =>
  collection.scenes.find((scene) => scene.id === collection.activeSceneId) ?? collection.scenes[0] ?? createDefaultScene();

export const setActiveScene = (collection: SceneCollection, sceneId: string): SceneCollection => {
  const normalized = normalizeSceneCollection(collection);
  if (!normalized.scenes.some((scene) => scene.id === sceneId)) {
    return normalized;
  }
  return {
    ...normalized,
    activeSceneId: sceneId
  };
};

export const activatePrivacyShieldScene = (collection: SceneCollection): SceneCollection => {
  const normalized = normalizeSceneCollection(collection);
  const shieldSceneId =
    normalized.scenes.find((scene) => scene.id === privacyShieldSceneId)?.id ??
    normalized.scenes.find((scene) => scene.name.trim().toLowerCase() === "privacy shield")?.id;

  if (shieldSceneId) {
    return setActiveScene(normalized, shieldSceneId);
  }

  return addSceneToCollection(normalized, createSceneFromTemplate("privacy-shield"));
};

export const updateSceneTransition = (
  collection: SceneCollection,
  settings: Partial<SceneTransitionSettings>
): SceneCollection => {
  const normalized = normalizeSceneCollection(collection);
  return {
    ...normalized,
    transition: defaultSceneTransitionSettings({
      ...normalized.transition,
      ...settings
    })
  };
};

export const updateActiveScene = (collection: SceneCollection, scene: SceneDocument): SceneCollection => {
  const normalized = normalizeSceneCollection(collection);
  const nextScene = normalizeSceneDocument(scene);
  const activeIndex = normalized.scenes.findIndex((current) => current.id === normalized.activeSceneId);
  const replaceIndex = activeIndex >= 0 ? activeIndex : 0;
  const scenes = normalized.scenes.map((current, index) => (index === replaceIndex ? nextScene : current));
  const uniqueScenes = ensureUniqueSceneIds(scenes);
  const activeSceneId = uniqueScenes[replaceIndex]?.id ?? uniqueScenes[0]?.id ?? createDefaultScene().id;
  return {
    ...normalized,
    activeSceneId,
    scenes: uniqueScenes.length > 0 ? uniqueScenes : [createDefaultScene()]
  };
};

export const addSceneToCollection = (collection: SceneCollection, scene: SceneDocument): SceneCollection => {
  const normalized = normalizeSceneCollection(collection);
  const nextScene = createUniqueScene(normalizeSceneDocument(scene), new Set(normalized.scenes.map((candidate) => candidate.id)));
  return {
    version: 1,
    activeSceneId: nextScene.id,
    transition: normalized.transition,
    scenes: [...normalized.scenes, nextScene]
  };
};

export const duplicateActiveScene = (collection: SceneCollection): SceneCollection => {
  const normalized = normalizeSceneCollection(collection);
  const activeScene = selectActiveScene(normalized);
  const duplicate = {
    ...stripTransientSceneRuntime(activeScene),
    id: makeId("scene"),
    name: `${activeScene.name} Copy`,
    sources: activeScene.sources.map((source) => ({
      ...source,
      id: makeId(`source-${source.kind}`)
    }))
  };
  return addSceneToCollection(normalized, duplicate);
};

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
  input: Pick<AvatarIllustrationRigInferenceInput, "imageAspectRatio" | "imageAnalysis" | "landmarkAnalysis"> = {}
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
        modelJsonUri: source.modelJsonUri,
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
    case "vrm": {
      const vrmMotion = source.motion ?? defaultAvatarMotion();
      const vrmRuntimePose = createVrmRuntimePose(source);
      return {
        modelId: source.modelId,
        modelUri: source.modelUri,
        expression: source.expression,
        mouthOpen: source.mouthOpen,
        blink: source.blink,
        headYaw: vrmMotion.headYaw,
        headPitch: vrmMotion.headPitch,
        headRoll: vrmMotion.headRoll,
        headX: vrmMotion.headX,
        headY: vrmMotion.headY,
        bodyLean: vrmMotion.bodyLean,
        bodyBounce: vrmMotion.bodyBounce,
        breathing: vrmMotion.breathing,
        depthTilt: vrmMotion.depthTilt,
        meshWarp: vrmMotion.meshWarp,
        eyeSquint: vrmMotion.eyeSquint,
        mouthDeform: vrmMotion.mouthDeform,
        hairSway: vrmMotion.hairSway,
        shoulderSway: vrmMotion.shoulderSway,
        trackingConfidence: vrmMotion.confidence,
        vrmRuntimeStatus: vrmRuntimePose.status,
        vrmRuntimePoseJson: serializeVrmRuntimePose(vrmRuntimePose),
        vrmLookAtYaw: vrmRuntimePose.lookAt.yaw,
        vrmLookAtPitch: vrmRuntimePose.lookAt.pitch,
        vrmRootOffsetX: vrmRuntimePose.rootOffset.x,
        vrmRootOffsetY: vrmRuntimePose.rootOffset.y,
        vrmRootOffsetZ: vrmRuntimePose.rootOffset.z
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

const normalizeSceneTransitionSettings = (value: unknown): SceneTransitionSettings => {
  if (!isRecord(value)) {
    return defaultSceneTransitionSettings();
  }
  return defaultSceneTransitionSettings({
    kind: isSceneTransitionKind(value.kind) ? value.kind : undefined,
    durationMs: finiteNumber(value.durationMs, 300)
  });
};

const ensureUniqueSceneIds = (scenes: SceneDocument[]): SceneDocument[] => {
  const used = new Set<string>();
  return scenes.map((scene, index) => {
    const uniqueScene = createUniqueScene(
      { ...scene, id: scene.id.trim() || `scene-${index + 1}` },
      used
    );
    used.add(uniqueScene.id);
    return uniqueScene;
  });
};

const createUniqueScene = (scene: SceneDocument, used: Set<string>): SceneDocument => {
  const baseId = scene.id.trim() || "scene";
  let nextId = baseId;
  let suffix = 2;
  while (used.has(nextId)) {
    nextId = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return nextId === scene.id ? scene : { ...scene, id: nextId };
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
        modelJsonUri: normalizeLive2DModelJsonUri(value.modelJsonUri),
        expression: stringValue(value.expression, sourceFallback.expression),
        mouthOpen: clampedNumber(value.mouthOpen, sourceFallback.mouthOpen, 0, 1),
        blink: clampedNumber(value.blink, sourceFallback.blink, 0, 1),
        motion: normalizeMotionValue(value.motion)
      };
    }
    case "vrm": {
      const sourceFallback = createSource("vrm") as VRMSource;
      return {
        ...base,
        kind: "vrm",
        modelId: stringValue(value.modelId, sourceFallback.modelId),
        modelUri: normalizeVrmModelUri(value.modelUri),
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

const isSceneTransitionKind = (value: unknown): value is SceneTransitionKind =>
  typeof value === "string" && sceneTransitionKinds.includes(value as SceneTransitionKind);

const isAvatarSource = (source: SceneSource): source is PNGTuberSource | Live2DSource | VRMSource =>
  source.kind === "pngtuber" || source.kind === "live2d" || source.kind === "vrm";

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
