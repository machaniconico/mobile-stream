import { NativeModules } from "react-native";
import { normalizeSceneDocument, stripTransientSceneRuntime, type SceneDocument } from "../domain/scene";

interface MobileSceneStoreModule {
  saveScene(sceneJson: string): Promise<boolean>;
  loadScene(): Promise<string | null>;
  clearScene(): Promise<boolean>;
  prepareStillImageAsset?(sourceUri: string, filenameHint: string): Promise<string>;
  pickStillImageAsset?(filenameHint: string): Promise<string | null>;
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
    return normalizeSceneDocument(JSON.parse(sceneJson) as Partial<SceneDocument>);
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
