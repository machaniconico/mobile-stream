import { NativeModules } from "react-native";
import {
  normalizePlatformChatOAuthCredential,
  type PlatformChatOAuthCredential
} from "../domain/platformChatOAuth";
import { normalizeStudioProfile, type StudioProfile } from "../domain/profiles";

interface SecureProfileStoreModule {
  saveProfile(profileJson: string): Promise<boolean>;
  loadProfile(): Promise<string | null>;
  clearProfile(): Promise<boolean>;
  saveOAuthCredential(credentialJson: string): Promise<boolean>;
  loadOAuthCredential(): Promise<string | null>;
  clearOAuthCredential(): Promise<boolean>;
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

export const loadSecureOAuthCredential = async (): Promise<PlatformChatOAuthCredential | null> => {
  if (!canUseSecureProfileStore() || !nativeStore) {
    return null;
  }

  const credentialJson = await nativeStore.loadOAuthCredential();
  if (!credentialJson) {
    return null;
  }

  try {
    const credential = normalizePlatformChatOAuthCredential(JSON.parse(credentialJson) as Partial<PlatformChatOAuthCredential>);
    if (!credential) {
      await nativeStore.clearOAuthCredential();
      return null;
    }
    return credential;
  } catch {
    await nativeStore.clearOAuthCredential();
    return null;
  }
};

export const saveSecureOAuthCredential = async (credential: PlatformChatOAuthCredential): Promise<void> => {
  if (!canUseSecureProfileStore() || !nativeStore) {
    return;
  }
  const normalized = normalizePlatformChatOAuthCredential(credential);
  if (!normalized) {
    await nativeStore.clearOAuthCredential();
    return;
  }
  await nativeStore.saveOAuthCredential(JSON.stringify(normalized));
};

export const clearSecureOAuthCredential = async (): Promise<void> => {
  if (!canUseSecureProfileStore() || !nativeStore) {
    return;
  }
  await nativeStore.clearOAuthCredential();
};
