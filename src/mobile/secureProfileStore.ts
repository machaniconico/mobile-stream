import { NativeModules } from "react-native";
import {
  createEmptyPlatformChatOAuthCredentialStore,
  getPlatformChatOAuthCredential,
  normalizePlatformChatOAuthCredential,
  normalizePlatformChatOAuthCredentialStore,
  upsertPlatformChatOAuthCredential,
  type PlatformChatOAuthCredentialStore,
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

export const loadSecureOAuthCredentials = async (): Promise<PlatformChatOAuthCredentialStore> => {
  if (!canUseSecureProfileStore() || !nativeStore) {
    return createEmptyPlatformChatOAuthCredentialStore();
  }

  const credentialJson = await nativeStore.loadOAuthCredential();
  if (!credentialJson) {
    return createEmptyPlatformChatOAuthCredentialStore();
  }

  try {
    const credentials = normalizePlatformChatOAuthCredentialStore(
      JSON.parse(credentialJson) as Partial<PlatformChatOAuthCredentialStore> | Partial<PlatformChatOAuthCredential>
    );
    if (!credentials.youtube && !credentials.twitch) {
      await nativeStore.clearOAuthCredential();
      return createEmptyPlatformChatOAuthCredentialStore();
    }
    return credentials;
  } catch {
    await nativeStore.clearOAuthCredential();
    return createEmptyPlatformChatOAuthCredentialStore();
  }
};

export const saveSecureOAuthCredentials = async (credentials: PlatformChatOAuthCredentialStore): Promise<void> => {
  if (!canUseSecureProfileStore() || !nativeStore) {
    return;
  }
  const normalized = normalizePlatformChatOAuthCredentialStore(credentials);
  if (!normalized.youtube && !normalized.twitch) {
    await nativeStore.clearOAuthCredential();
    return;
  }
  await nativeStore.saveOAuthCredential(JSON.stringify(normalized));
};

export const loadSecureOAuthCredential = async (): Promise<PlatformChatOAuthCredential | null> => {
  const credentials = await loadSecureOAuthCredentials();
  return credentials.youtube ?? credentials.twitch;
};

export const saveSecureOAuthCredential = async (credential: PlatformChatOAuthCredential): Promise<void> => {
  const normalized = normalizePlatformChatOAuthCredential(credential);
  if (!normalized) {
    return clearSecureOAuthCredential();
  }
  const current = await loadSecureOAuthCredentials();
  await saveSecureOAuthCredentials(upsertPlatformChatOAuthCredential(current, normalized));
};

export const getSecureOAuthCredential = async (
  platform: PlatformChatOAuthCredential["platform"]
): Promise<PlatformChatOAuthCredential | null> => getPlatformChatOAuthCredential(await loadSecureOAuthCredentials(), platform);

export const clearSecureOAuthCredential = async (): Promise<void> => {
  if (!canUseSecureProfileStore() || !nativeStore) {
    return;
  }
  await nativeStore.clearOAuthCredential();
};
