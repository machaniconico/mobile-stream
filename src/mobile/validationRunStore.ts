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

export const canUseMobileValidationRunStore = (): boolean =>
  Boolean(nativeStore?.saveValidationRuns && nativeStore.loadValidationRuns);

export const loadMobileStreamValidationRuns = async (): Promise<StreamValidationRun[]> => {
  if (!canUseMobileValidationRunStore() || !nativeStore?.loadValidationRuns) {
    return [];
  }

  const runsJson = await nativeStore.loadValidationRuns();
  if (!runsJson) {
    return [];
  }

  try {
    return redactSecretsFromPersistedValue(normalizeStreamValidationRuns(JSON.parse(runsJson) as unknown));
  } catch {
    await nativeStore.clearValidationRuns?.();
    return [];
  }
};

export const saveMobileStreamValidationRuns = async (runs: StreamValidationRun[], secrets: string[] = []): Promise<void> => {
  if (!canUseMobileValidationRunStore() || !nativeStore?.saveValidationRuns) {
    return;
  }
  await nativeStore.saveValidationRuns(
    JSON.stringify(redactSecretsFromPersistedValue(normalizeStreamValidationRuns(runs), secrets))
  );
};

export const clearMobileStreamValidationRuns = async (): Promise<void> => {
  if (!canUseMobileValidationRunStore() || !nativeStore?.clearValidationRuns) {
    return;
  }
  await nativeStore.clearValidationRuns();
};
