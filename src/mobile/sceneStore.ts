import { NativeModules } from "react-native";
import { normalizeSceneDocument, stripTransientSceneRuntime, type SceneDocument } from "../domain/scene";

interface MobileSceneStoreModule {
  saveScene(sceneJson: string): Promise<boolean>;
  loadScene(): Promise<string | null>;
  clearScene(): Promise<boolean>;
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
