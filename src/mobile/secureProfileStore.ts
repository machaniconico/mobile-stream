import { NativeModules } from "react-native";
import { normalizeStudioProfile, type StudioProfile } from "../domain/profiles";

interface SecureProfileStoreModule {
  saveProfile(profileJson: string): Promise<boolean>;
  loadProfile(): Promise<string | null>;
  clearProfile(): Promise<boolean>;
}

const nativeStore = NativeModules.LiveCasterSecureStore as SecureProfileStoreModule | undefined;

export const canUseSecureProfileStore = (): boolean => Boolean(nativeStore);

export const loadSecureProfile = async (): Promise<StudioProfile | null> => {
  if (!canUseSecureProfileStore() || !nativeStore) {
    return null;
  }

  const profileJson = await nativeStore.loadProfile();
  if (!profileJson) {
    return null;
  }

  try {
    return normalizeStudioProfile(JSON.parse(profileJson) as Partial<StudioProfile>);
  } catch {
    await nativeStore.clearProfile();
    return null;
  }
};

export const saveSecureProfile = async (profile: StudioProfile): Promise<void> => {
  if (!canUseSecureProfileStore() || !nativeStore) {
    return;
  }
  await nativeStore.saveProfile(JSON.stringify(normalizeStudioProfile(profile)));
};

export const clearSecureProfile = async (): Promise<void> => {
  if (!canUseSecureProfileStore() || !nativeStore) {
    return;
  }
  await nativeStore.clearProfile();
};
