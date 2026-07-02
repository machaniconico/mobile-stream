import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeStore = vi.hoisted(() => ({
  runsJson: null as string | null,
  saveValidationRuns: vi.fn(async () => true),
  loadValidationRuns: vi.fn(async () => nativeStore.runsJson),
  clearValidationRuns: vi.fn(async () => true)
}));

vi.mock("react-native", () => ({
  NativeModules: {
    LiveCasterSceneStore: nativeStore
  }
}));

import { loadMobileStreamValidationRuns } from "./validationRunStore";

describe("mobile validation run store", () => {
  beforeEach(() => {
    nativeStore.runsJson = null;
    nativeStore.saveValidationRuns.mockClear();
    nativeStore.loadValidationRuns.mockClear();
    nativeStore.clearValidationRuns.mockClear();
  });

  it("redacts legacy unredacted validation runs on load", async () => {
    nativeStore.runsJson = JSON.stringify([
      {
        createdAt: "2026-06-23T00:00:00.000Z",
        devicePlatform: "ios",
        result: "warn",
        networkProfile: "Authorization: Bearer mobile-legacy-validation-token",
        recommendation: "Retry callback mobilelivecaster://oauth/twitch?code=mobile-legacy-code"
      }
    ]);

    const loaded = await loadMobileStreamValidationRuns();
    const json = JSON.stringify(loaded);

    expect(loaded).toHaveLength(1);
    expect(json).not.toContain("mobile-legacy-validation-token");
    expect(json).not.toContain("mobile-legacy-code");
    expect(json).toContain("[redacted]");
  });
});
