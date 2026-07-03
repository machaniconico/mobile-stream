import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeStore = vi.hoisted(() => ({
  profileJson: null as string | null,
  saveProfile: vi.fn(async (profileJson: string) => {
    nativeStore.profileJson = profileJson;
    return true;
  }),
  loadProfile: vi.fn(async () => nativeStore.profileJson),
  clearProfile: vi.fn(async () => {
    nativeStore.profileJson = null;
    return true;
  }),
  saveOAuthCredential: vi.fn(async () => true),
  loadOAuthCredential: vi.fn(async () => null),
  clearOAuthCredential: vi.fn(async () => true)
}));

vi.mock("react-native", () => ({
  NativeModules: {
    LiveCasterSecureStore: nativeStore
  }
}));

import { createDefaultStudioProfile } from "../domain/profiles";
import { loadSecureProfile, saveSecureProfile } from "./secureProfileStore";

const webhookUrl =
  "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz.ABCDEFGHIJKLMNOPQRSTUVWXYZ_1234567890";

describe("secure profile store", () => {
  beforeEach(() => {
    nativeStore.profileJson = null;
    nativeStore.saveProfile.mockClear();
    nativeStore.loadProfile.mockClear();
    nativeStore.clearProfile.mockClear();
  });

  it("round-trips stream announcement Discord webhook settings through secure mobile storage", async () => {
    const profile = {
      ...createDefaultStudioProfile(),
      streamAnnouncement: {
        ...createDefaultStudioProfile().streamAnnouncement,
        autoPostEnabled: true,
        discordWebhookUrl: webhookUrl
      }
    };

    await saveSecureProfile(profile);

    expect(nativeStore.profileJson).toContain(webhookUrl);
    await expect(loadSecureProfile()).resolves.toMatchObject({
      streamAnnouncement: {
        autoPostEnabled: true,
        discordWebhookUrl: webhookUrl
      }
    });
  });

  it("drops invalid webhook URLs before secure persistence", async () => {
    await saveSecureProfile({
      ...createDefaultStudioProfile(),
      streamAnnouncement: {
        ...createDefaultStudioProfile().streamAnnouncement,
        autoPostEnabled: true,
        discordWebhookUrl: "https://discord.com/api/webhooks/not-valid/not-valid"
      }
    });

    expect(nativeStore.profileJson).not.toContain("not-valid");
    await expect(loadSecureProfile()).resolves.toMatchObject({
      streamAnnouncement: {
        autoPostEnabled: true,
        discordWebhookUrl: ""
      }
    });
  });
});
