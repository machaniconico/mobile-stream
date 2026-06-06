import type { SceneDocument } from "../domain/scene";
import { normalizeStudioProfile, stripSensitiveProfileData, type StudioProfile } from "../domain/profiles";

const SCENE_KEY = "mobile-live-caster.scene";
const PROFILE_KEY = "mobile-live-caster.profile";

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
  return safeParse<SceneDocument>(localStorage.getItem(SCENE_KEY));
};

export const saveScene = (scene: SceneDocument): void => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.setItem(SCENE_KEY, JSON.stringify(scene));
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
