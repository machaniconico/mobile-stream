import { NativeModules } from "react-native";
import {
  normalizeSceneCollection,
  normalizeSceneDocument,
  selectActiveScene,
  stripTransientSceneCollectionRuntime,
  stripTransientSceneRuntime,
  type AvatarIllustrationRigInferenceInput,
  type SceneCollection,
  type SceneDocument
} from "../domain/scene";

interface MobileSceneStoreModule {
  saveScene(sceneJson: string): Promise<boolean>;
  loadScene(): Promise<string | null>;
  clearScene(): Promise<boolean>;
  prepareStillImageAsset?(sourceUri: string, filenameHint: string): Promise<string>;
  pickStillImageAsset?(filenameHint: string): Promise<string | null>;
  analyzeStillImageAsset?(sourceUri: string): Promise<string | null>;
  prepareVrmModelAsset?(sourceUri: string, filenameHint: string): Promise<string>;
  pickVrmModelAsset?(filenameHint: string): Promise<string | null>;
}

const nativeStore = NativeModules.LiveCasterSceneStore as MobileSceneStoreModule | undefined;

export const canUseMobileSceneStore = (): boolean => Boolean(nativeStore);

export const loadMobileScene = async (): Promise<SceneDocument | null> => {
  if (!canUseMobileSceneStore() || !nativeStore) {
    return null;
  }

  const sceneJson = await nativeStore.loadScene();
  if (!sceneJson) {
    return null;
  }

  try {
    return selectActiveScene(normalizeSceneCollection(JSON.parse(sceneJson) as unknown));
  } catch {
    await nativeStore.clearScene();
    return null;
  }
};

export const saveMobileScene = async (scene: SceneDocument): Promise<void> => {
  if (!canUseMobileSceneStore() || !nativeStore) {
    return;
  }
  const persistableScene = stripTransientSceneRuntime(normalizeSceneDocument(scene));
  await nativeStore.saveScene(JSON.stringify(persistableScene));
};

export const loadMobileSceneCollection = async (): Promise<SceneCollection | null> => {
  if (!canUseMobileSceneStore() || !nativeStore) {
    return null;
  }

  const sceneJson = await nativeStore.loadScene();
  if (!sceneJson) {
    return null;
  }

  try {
    return normalizeSceneCollection(JSON.parse(sceneJson) as unknown);
  } catch {
    await nativeStore.clearScene();
    return null;
  }
};

export const saveMobileSceneCollection = async (collection: SceneCollection): Promise<void> => {
  if (!canUseMobileSceneStore() || !nativeStore) {
    return;
  }
  const persistableCollection = stripTransientSceneCollectionRuntime(normalizeSceneCollection(collection));
  await nativeStore.saveScene(JSON.stringify(persistableCollection));
};

export const clearMobileScene = async (): Promise<void> => {
  if (!canUseMobileSceneStore() || !nativeStore) {
    return;
  }
  await nativeStore.clearScene();
};

export const prepareStillImageAsset = async (sourceUri: string, filenameHint = "still-image"): Promise<string> => {
  const trimmedUri = sourceUri.trim();
  if (!trimmedUri) {
    return "";
  }
  if (!canUseMobileSceneStore() || !nativeStore?.prepareStillImageAsset) {
    return trimmedUri;
  }
  return nativeStore.prepareStillImageAsset(trimmedUri, filenameHint);
};

export const pickStillImageAsset = async (filenameHint = "still-image"): Promise<string | null> => {
  if (!canUseMobileSceneStore() || !nativeStore?.pickStillImageAsset) {
    return null;
  }
  return nativeStore.pickStillImageAsset(filenameHint);
};

export const analyzeStillImageAsset = async (
  sourceUri: string
): Promise<Pick<AvatarIllustrationRigInferenceInput, "imageAspectRatio" | "imageAnalysis" | "landmarkAnalysis">> => {
  const trimmedUri = sourceUri.trim();
  if (!trimmedUri || !canUseMobileSceneStore() || !nativeStore?.analyzeStillImageAsset) {
    return {};
  }
  try {
    return normalizeNativeStillImageAnalysis(await nativeStore.analyzeStillImageAsset(trimmedUri));
  } catch {
    return {};
  }
};

export const prepareVrmModelAsset = async (sourceUri: string, filenameHint = "avatar.vrm"): Promise<string> => {
  const trimmedUri = sourceUri.trim();
  if (!trimmedUri) {
    return "";
  }
  if (!canUseMobileSceneStore() || !nativeStore?.prepareVrmModelAsset) {
    return trimmedUri;
  }
  return nativeStore.prepareVrmModelAsset(trimmedUri, filenameHint);
};

export const pickVrmModelAsset = async (filenameHint = "avatar.vrm"): Promise<string | null> => {
  if (!canUseMobileSceneStore() || !nativeStore?.pickVrmModelAsset) {
    return null;
  }
  return nativeStore.pickVrmModelAsset(filenameHint);
};

const normalizeNativeStillImageAnalysis = (
  value: string | null
): Pick<AvatarIllustrationRigInferenceInput, "imageAspectRatio" | "imageAnalysis" | "landmarkAnalysis"> => {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const imageAspectRatio = normalizedPositiveNumber(parsed.imageAspectRatio);
    const imageAnalysis = normalizeNativeImageAnalysis(parsed.imageAnalysis);
    const landmarkAnalysis = normalizeNativeLandmarkAnalysis(parsed.landmarkAnalysis);
    return {
      ...(imageAspectRatio === null ? {} : { imageAspectRatio }),
      ...(imageAnalysis ? { imageAnalysis } : {}),
      ...(landmarkAnalysis ? { landmarkAnalysis } : {})
    };
  } catch {
    return {};
  }
};

const normalizeNativeImageAnalysis = (value: unknown): NonNullable<AvatarIllustrationRigInferenceInput["imageAnalysis"]> | null => {
  if (!isRecord(value)) {
    return null;
  }
  const imageAspectRatio = normalizedPositiveNumber(value.imageAspectRatio);
  const foregroundCoverage = normalizedUnitNumber(value.foregroundCoverage);
  const confidence = normalizedUnitNumber(value.confidence);
  if (imageAspectRatio === null || foregroundCoverage === null || confidence === null) {
    return null;
  }
  return {
    imageAspectRatio,
    foregroundBounds: normalizeNativeForegroundBounds(value.foregroundBounds),
    foregroundCoverage,
    confidence
  };
};

const normalizeNativeForegroundBounds = (
  value: unknown
): NonNullable<NonNullable<AvatarIllustrationRigInferenceInput["imageAnalysis"]>["foregroundBounds"]> | null => {
  if (!isRecord(value)) {
    return null;
  }
  const left = normalizedUnitNumber(value.left);
  const right = normalizedUnitNumber(value.right);
  const top = normalizedUnitNumber(value.top);
  const bottom = normalizedUnitNumber(value.bottom);
  const width = normalizedUnitNumber(value.width);
  const height = normalizedUnitNumber(value.height);
  if (left === null || right === null || top === null || bottom === null || width === null || height === null) {
    return null;
  }
  return { left, right, top, bottom, width, height };
};

const normalizeNativeLandmarkAnalysis = (
  value: unknown
): NonNullable<AvatarIllustrationRigInferenceInput["landmarkAnalysis"]> | null => {
  if (!isRecord(value)) {
    return null;
  }
  const confidence = normalizedUnitNumber(value.confidence);
  if (confidence === null) {
    return null;
  }
  return {
    confidence,
    faceCenter: normalizeNativeLandmarkPoint(value.faceCenter),
    leftEye: normalizeNativeLandmarkPoint(value.leftEye),
    rightEye: normalizeNativeLandmarkPoint(value.rightEye),
    mouthCenter: normalizeNativeLandmarkPoint(value.mouthCenter),
    hairLineY: normalizedUnitNumber(value.hairLineY),
    shoulderLineY: normalizedUnitNumber(value.shoulderLineY)
  };
};

const normalizeNativeLandmarkPoint = (
  value: unknown
): NonNullable<NonNullable<AvatarIllustrationRigInferenceInput["landmarkAnalysis"]>["faceCenter"]> | null => {
  if (!isRecord(value)) {
    return null;
  }
  const x = normalizedUnitNumber(value.x);
  const y = normalizedUnitNumber(value.y);
  if (x === null || y === null) {
    return null;
  }
  const confidence = normalizedUnitNumber(value.confidence);
  return { x, y, ...(confidence === null ? {} : { confidence }) };
};

const normalizedPositiveNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

const normalizedUnitNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
