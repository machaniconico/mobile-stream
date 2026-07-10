import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamSessionSummary } from "../domain/streamSessionSummary";

const nativeStore = vi.hoisted(() => ({
  summariesJson: null as string | null,
  saveSessionSummaries: vi.fn(async () => true),
  loadSessionSummaries: vi.fn(async () => nativeStore.summariesJson),
  clearSessionSummaries: vi.fn(async () => true)
}));

vi.mock("react-native", () => ({
  NativeModules: {
    LiveCasterSceneStore: nativeStore
  }
}));

import { loadMobileStreamSessionSummaries, saveMobileStreamSessionSummaries } from "./sessionSummaryStore";

describe("mobile session summary store", () => {
  beforeEach(() => {
    nativeStore.summariesJson = null;
    nativeStore.loadSessionSummaries.mockImplementation(async () => nativeStore.summariesJson);
    nativeStore.saveSessionSummaries.mockImplementation(async () => true);
    nativeStore.clearSessionSummaries.mockImplementation(async () => true);
    nativeStore.saveSessionSummaries.mockClear();
    nativeStore.loadSessionSummaries.mockClear();
    nativeStore.clearSessionSummaries.mockClear();
  });

  it("redacts and rewrites legacy unredacted summaries after native migration", async () => {
    nativeStore.summariesJson = JSON.stringify([
      {
        id: "legacy-summary",
        startedAt: "2026-06-23T00:00:00.000Z",
        endedAt: "2026-06-23T00:01:00.000Z",
        endReason: "failed",
        outcome: "fail",
        health: {
          stability: "unstable",
          summary: "Authorization: Bearer mobile-legacy-summary-token"
        },
        summary: "Authorization: Bearer mobile-legacy-summary-token",
        recommendation: "Retry callback mobilelivecaster://oauth/twitch?code=mobile-legacy-summary-code"
      }
    ]);

    const loaded = await loadMobileStreamSessionSummaries();
    const savedJson = nativeStore.saveSessionSummaries.mock.calls[0]?.[0] as string;

    expect(loaded).toHaveLength(1);
    expect(savedJson).toContain("[redacted]");
    expect(savedJson).not.toContain("mobile-legacy-summary-token");
    expect(savedJson).not.toContain("mobile-legacy-summary-code");
  });

  it("preserves unavailable encrypted native summaries and returns an empty history", async () => {
    nativeStore.loadSessionSummaries.mockRejectedValueOnce(new Error("authentication tag mismatch"));

    await expect(loadMobileStreamSessionSummaries()).resolves.toEqual([]);
    expect(nativeStore.clearSessionSummaries).not.toHaveBeenCalled();
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
    const summary = {
      id: "session-secret-test",
      startedAt: "2026-06-23T00:00:00.000Z",
      endedAt: "2026-06-23T00:01:00.000Z",
      endReason: "failed",
      outcome: "fail",
      health: {
        stability: "unstable",
        summary: secrets.join(" ")
      },
      summary: secrets.join(" "),
      recommendation: `Retry ${secrets.join(" ")}`
    } as unknown as StreamSessionSummary;

    await saveMobileStreamSessionSummaries([summary], secrets);

    const savedJson = nativeStore.saveSessionSummaries.mock.calls[0]?.[0] as string;
    for (const secret of secrets) {
      expect(savedJson).not.toContain(secret);
    }
    expect(savedJson).toContain("[redacted]");
  });
});
