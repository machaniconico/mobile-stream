import { NativeModules } from "react-native";
import {
  normalizeStreamSessionSummaries,
  type StreamSessionSummary
} from "../domain/streamSessionSummary";
import { redactSecretsFromPersistedValue } from "../domain/persistencePrivacy";

interface MobileSessionSummaryStoreModule {
  saveSessionSummaries?(summariesJson: string): Promise<boolean>;
  loadSessionSummaries?(): Promise<string | null>;
  clearSessionSummaries?(): Promise<boolean>;
}

const nativeStore = NativeModules.LiveCasterSceneStore as MobileSessionSummaryStoreModule | undefined;
let storeGeneration = 0;

export const canUseMobileSessionSummaryStore = (): boolean =>
  Boolean(nativeStore?.saveSessionSummaries && nativeStore.loadSessionSummaries);

export const loadMobileStreamSessionSummaries = async (): Promise<StreamSessionSummary[]> => {
  if (!canUseMobileSessionSummaryStore() || !nativeStore?.loadSessionSummaries) {
    return [];
  }

  let summariesJson: string | null;
  const loadGeneration = storeGeneration;
  try {
    summariesJson = await nativeStore.loadSessionSummaries();
  } catch {
    return [];
  }
  if (!summariesJson) {
    return [];
  }

  try {
    const summaries = redactSecretsFromPersistedValue(
      normalizeStreamSessionSummaries(JSON.parse(summariesJson) as unknown)
    );
    const sanitizedJson = JSON.stringify(summaries);
    if (sanitizedJson !== summariesJson && loadGeneration === storeGeneration) {
      try {
        await nativeStore.saveSessionSummaries?.(sanitizedJson);
      } catch {}
    }
    return summaries;
  } catch {
    return [];
  }
};

export const saveMobileStreamSessionSummaries = async (
  summaries: StreamSessionSummary[],
  secrets: string[] = []
): Promise<void> => {
  if (!canUseMobileSessionSummaryStore() || !nativeStore?.saveSessionSummaries) {
    return;
  }
  storeGeneration += 1;
  await nativeStore.saveSessionSummaries(
    JSON.stringify(redactSecretsFromPersistedValue(normalizeStreamSessionSummaries(summaries), secrets))
  );
};

export const clearMobileStreamSessionSummaries = async (): Promise<void> => {
  if (!canUseMobileSessionSummaryStore() || !nativeStore?.clearSessionSummaries) {
    return;
  }
  storeGeneration += 1;
  await nativeStore.clearSessionSummaries();
};
