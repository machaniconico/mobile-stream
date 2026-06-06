import type { SceneDocument } from "../domain/scene";
import type { StudioProfile } from "../domain/profiles";

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

export const loadScene = (): SceneDocument | null => safeParse<SceneDocument>(localStorage.getItem(SCENE_KEY));

export const saveScene = (scene: SceneDocument): void => {
  localStorage.setItem(SCENE_KEY, JSON.stringify(scene));
};

export const loadProfile = (): StudioProfile | null => safeParse<StudioProfile>(localStorage.getItem(PROFILE_KEY));

export const saveProfile = (profile: StudioProfile): void => {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
};
