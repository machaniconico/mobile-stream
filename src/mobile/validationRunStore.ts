import { NativeModules } from "react-native";
import {
  normalizeStreamValidationRuns,
  type StreamValidationRun
} from "../domain/streamValidationEvidence";
import { redactSecretsFromPersistedValue } from "../domain/persistencePrivacy";

interface MobileValidationRunStoreModule {
  saveValidationRuns?(runsJson: string): Promise<boolean>;
  loadValidationRuns?(): Promise<string | null>;
  clearValidationRuns?(): Promise<boolean>;
}

const nativeStore = NativeModules.LiveCasterSceneStore as MobileValidationRunStoreModule | undefined;
let storeGeneration = 0;

export const canUseMobileValidationRunStore = (): boolean =>
  Boolean(nativeStore?.saveValidationRuns && nativeStore.loadValidationRuns);

export const loadMobileStreamValidationRuns = async (): Promise<StreamValidationRun[]> => {
  if (!canUseMobileValidationRunStore() || !nativeStore?.loadValidationRuns) {
    return [];
  }

  let runsJson: string | null;
  const loadGeneration = storeGeneration;
  try {
    runsJson = await nativeStore.loadValidationRuns();
  } catch {
    return [];
  }
  if (!runsJson) {
    return [];
  }

  try {
    const runs = redactSecretsFromPersistedValue(normalizeStreamValidationRuns(JSON.parse(runsJson) as unknown));
    const sanitizedJson = JSON.stringify(runs);
    if (sanitizedJson !== runsJson && loadGeneration === storeGeneration) {
      try {
        await nativeStore.saveValidationRuns?.(sanitizedJson);
      } catch {}
    }
    return runs;
  } catch {
    return [];
  }
};

export const saveMobileStreamValidationRuns = async (runs: StreamValidationRun[], secrets: string[] = []): Promise<void> => {
  if (!canUseMobileValidationRunStore() || !nativeStore?.saveValidationRuns) {
    return;
  }
  storeGeneration += 1;
  await nativeStore.saveValidationRuns(
    JSON.stringify(redactSecretsFromPersistedValue(normalizeStreamValidationRuns(runs), secrets))
  );
};

export const clearMobileStreamValidationRuns = async (): Promise<void> => {
  if (!canUseMobileValidationRunStore() || !nativeStore?.clearValidationRuns) {
    return;
  }
  storeGeneration += 1;
  await nativeStore.clearValidationRuns();
};
