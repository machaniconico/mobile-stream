import { NativeModules } from "react-native";
import {
  normalizeStreamSessionSummaries,
  type StreamSessionSummary
} from "../domain/streamSessionSummary";

interface MobileSessionSummaryStoreModule {
  saveSessionSummaries?(summariesJson: string): Promise<boolean>;
  loadSessionSummaries?(): Promise<string | null>;
  clearSessionSummaries?(): Promise<boolean>;
}

const nativeStore = NativeModules.LiveCasterSceneStore as MobileSessionSummaryStoreModule | undefined;

export const canUseMobileSessionSummaryStore = (): boolean =>
  Boolean(nativeStore?.saveSessionSummaries && nativeStore.loadSessionSummaries);

export const loadMobileStreamSessionSummaries = async (): Promise<StreamSessionSummary[]> => {
  if (!canUseMobileSessionSummaryStore() || !nativeStore?.loadSessionSummaries) {
    return [];
  }

  const summariesJson = await nativeStore.loadSessionSummaries();
  if (!summariesJson) {
    return [];
  }

  try {
    return normalizeStreamSessionSummaries(JSON.parse(summariesJson) as unknown);
  } catch {
    await nativeStore.clearSessionSummaries?.();
    return [];
  }
};

export const saveMobileStreamSessionSummaries = async (summaries: StreamSessionSummary[]): Promise<void> => {
  if (!canUseMobileSessionSummaryStore() || !nativeStore?.saveSessionSummaries) {
    return;
  }
  await nativeStore.saveSessionSummaries(JSON.stringify(normalizeStreamSessionSummaries(summaries)));
};

export const clearMobileStreamSessionSummaries = async (): Promise<void> => {
  if (!canUseMobileSessionSummaryStore() || !nativeStore?.clearSessionSummaries) {
    return;
  }
  await nativeStore.clearSessionSummaries();
};
