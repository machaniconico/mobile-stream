import { NativeModules } from "react-native";
import {
  normalizeSceneCollection,
  normalizeSceneDocument,
  selectActiveScene,
  stripTransientSceneCollectionRuntime,
  stripTransientSceneRuntime,
  type SceneCollection,
  type SceneDocument
} from "../domain/scene";

interface MobileSceneStoreModule {
  saveScene(sceneJson: string): Promise<boolean>;
  loadScene(): Promise<string | null>;
  clearScene(): Promise<boolean>;
  prepareStillImageAsset?(sourceUri: string, filenameHint: string): Promise<string>;
  pickStillImageAsset?(filenameHint: string): Promise<string | null>;
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
