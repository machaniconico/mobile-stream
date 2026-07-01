import {
  normalizeSceneCollection,
  normalizeSceneDocument,
  selectActiveScene,
  stripTransientSceneCollectionRuntime,
  stripTransientSceneRuntime,
  type SceneCollection,
  type SceneDocument
} from "../domain/scene";
import { normalizeStudioProfile, stripSensitiveProfileData, type StudioProfile } from "../domain/profiles";
import {
  normalizeStreamSessionSummaries,
  type StreamSessionSummary
} from "../domain/streamSessionSummary";
import {
  normalizeStreamValidationRuns,
  type StreamValidationRun
} from "../domain/streamValidationEvidence";
import { redactSecretsFromPersistedValue } from "../domain/persistencePrivacy";

const SCENE_KEY = "mobile-live-caster.scene";
const PROFILE_KEY = "mobile-live-caster.profile";
const STREAM_SESSION_SUMMARIES_KEY = "mobile-live-caster.stream-session-summaries";
const STREAM_VALIDATION_RUNS_KEY = "mobile-live-caster.stream-validation-runs";

const safeParse = <T>(value: string | null): T | null => {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const hasLocalStorage = () => typeof localStorage !== "undefined";

export const loadScene = (): SceneDocument | null => {
  if (!hasLocalStorage()) {
    return null;
  }
  const storedScene = safeParse<unknown>(localStorage.getItem(SCENE_KEY));
  return storedScene ? selectActiveScene(normalizeSceneCollection(storedScene)) : null;
};

export const saveScene = (scene: SceneDocument): void => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.setItem(SCENE_KEY, JSON.stringify(stripTransientSceneRuntime(normalizeSceneDocument(scene))));
};

export const loadSceneCollection = (): SceneCollection | null => {
  if (!hasLocalStorage()) {
    return null;
  }
  const storedCollection = safeParse<unknown>(localStorage.getItem(SCENE_KEY));
  return storedCollection ? normalizeSceneCollection(storedCollection) : null;
};

export const saveSceneCollection = (collection: SceneCollection): void => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.setItem(SCENE_KEY, JSON.stringify(stripTransientSceneCollectionRuntime(normalizeSceneCollection(collection))));
};

export const loadProfile = (): StudioProfile | null => {
  if (!hasLocalStorage()) {
    return null;
  }
  const profile = safeParse<Partial<StudioProfile>>(localStorage.getItem(PROFILE_KEY));
  return profile ? normalizeStudioProfile(profile) : null;
};

export const saveProfile = (profile: StudioProfile): void => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.setItem(PROFILE_KEY, JSON.stringify(stripSensitiveProfileData(profile)));
};

export const loadStreamSessionSummaries = (): StreamSessionSummary[] => {
  if (!hasLocalStorage()) {
    return [];
  }
  return redactSecretsFromPersistedValue(
    normalizeStreamSessionSummaries(safeParse<unknown>(localStorage.getItem(STREAM_SESSION_SUMMARIES_KEY)))
  );
};

export const saveStreamSessionSummaries = (summaries: StreamSessionSummary[], secrets: string[] = []): void => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.setItem(
    STREAM_SESSION_SUMMARIES_KEY,
    JSON.stringify(redactSecretsFromPersistedValue(normalizeStreamSessionSummaries(summaries), secrets))
  );
};

export const clearStreamSessionSummaries = (): void => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.removeItem(STREAM_SESSION_SUMMARIES_KEY);
};

export const loadStreamValidationRuns = (): StreamValidationRun[] => {
  if (!hasLocalStorage()) {
    return [];
  }
  return normalizeStreamValidationRuns(safeParse<unknown>(localStorage.getItem(STREAM_VALIDATION_RUNS_KEY)));
};

export const saveStreamValidationRuns = (runs: StreamValidationRun[], secrets: string[] = []): void => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.setItem(
    STREAM_VALIDATION_RUNS_KEY,
    JSON.stringify(redactSecretsFromPersistedValue(normalizeStreamValidationRuns(runs), secrets))
  );
};

export const clearStreamValidationRuns = (): void => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.removeItem(STREAM_VALIDATION_RUNS_KEY);
};
