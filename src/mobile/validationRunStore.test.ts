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

import type { StreamValidationRun } from "../domain/streamValidationEvidence";
import { loadMobileStreamValidationRuns, saveMobileStreamValidationRuns } from "./validationRunStore";

describe("mobile validation run store", () => {
  beforeEach(() => {
    nativeStore.runsJson = null;
    nativeStore.loadValidationRuns.mockImplementation(async () => nativeStore.runsJson);
    nativeStore.saveValidationRuns.mockImplementation(async () => true);
    nativeStore.clearValidationRuns.mockImplementation(async () => true);
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
    const savedJson = nativeStore.saveValidationRuns.mock.calls[0]?.[0] as string;
    expect(savedJson).not.toContain("mobile-legacy-validation-token");
    expect(savedJson).not.toContain("mobile-legacy-code");
  });

  it("preserves unavailable encrypted native runs and returns an empty history", async () => {
    nativeStore.loadValidationRuns.mockRejectedValueOnce(new Error("authentication tag mismatch"));

    await expect(loadMobileStreamValidationRuns()).resolves.toEqual([]);
    expect(nativeStore.clearValidationRuns).not.toHaveBeenCalled();
  });

  it("removes every supplied OAuth and broadcast secret before native persistence", async () => {
    const secrets = [
      "stream-key-secret",
      "discord-webhook-secret",
      "youtube-access-secret",
      "youtube-refresh-secret",
      "twitch-access-secret",
      "twitch-refresh-secret",
      "pkce-verifier-secret",
      "oauth-state-secret",
      "device-code-secret",
      "user-code-secret"
    ];
    const run = {
      createdAt: "2026-06-23T00:00:00.000Z",
      devicePlatform: "ios",
      result: "warn",
      networkProfile: secrets.join(" "),
      recommendation: `Retry ${secrets.join(" ")}`
    } as unknown as StreamValidationRun;

    await saveMobileStreamValidationRuns([run], secrets);

    const savedJson = nativeStore.saveValidationRuns.mock.calls[0]?.[0] as string;
    for (const secret of secrets) {
      expect(savedJson).not.toContain(secret);
    }
    expect(savedJson).toContain("[redacted]");
  });
});
