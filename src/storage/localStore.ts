import { normalizeSceneDocument, stripTransientSceneRuntime, type SceneDocument } from "../domain/scene";
import { normalizeStudioProfile, stripSensitiveProfileData, type StudioProfile } from "../domain/profiles";
import {
  normalizeStreamSessionSummaries,
  type StreamSessionSummary
} from "../domain/streamSessionSummary";

const SCENE_KEY = "mobile-live-caster.scene";
const PROFILE_KEY = "mobile-live-caster.profile";
const STREAM_SESSION_SUMMARIES_KEY = "mobile-live-caster.stream-session-summaries";

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
  const scene = safeParse<Partial<SceneDocument>>(localStorage.getItem(SCENE_KEY));
  return scene ? normalizeSceneDocument(scene) : null;
};

export const saveScene = (scene: SceneDocument): void => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.setItem(SCENE_KEY, JSON.stringify(stripTransientSceneRuntime(normalizeSceneDocument(scene))));
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
  return normalizeStreamSessionSummaries(safeParse<unknown>(localStorage.getItem(STREAM_SESSION_SUMMARIES_KEY)));
};

export const saveStreamSessionSummaries = (summaries: StreamSessionSummary[]): void => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.setItem(STREAM_SESSION_SUMMARIES_KEY, JSON.stringify(normalizeStreamSessionSummaries(summaries)));
};
