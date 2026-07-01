import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultStudioProfile } from "../domain/profiles";
import { createReadinessReport } from "../domain/readiness";
import { createDefaultScene, createDefaultSceneCollection, selectActiveScene } from "../domain/scene";
import { type StreamHealthSample } from "../domain/streamHealthHistory";
import { createStreamDiagnostics } from "../domain/streamDiagnostics";
import { createStreamSessionSummary } from "../domain/streamSessionSummary";
import { createStreamValidationRun } from "../domain/streamValidationEvidence";
import { initialStreamState } from "../domain/streamState";
import {
  clearStreamSessionSummaries,
  clearStreamValidationRuns,
  loadScene,
  loadSceneCollection,
  loadProfile,
  loadStreamSessionSummaries,
  loadStreamValidationRuns,
  saveSceneCollection,
  saveProfile,
  saveStreamSessionSummaries,
  saveStreamValidationRuns
} from "./localStore";

const sceneStorageKey = "mobile-live-caster.scene";
const profileStorageKey = "mobile-live-caster.profile";
const sessionSummaryStorageKey = "mobile-live-caster.stream-session-summaries";
const validationRunsStorageKey = "mobile-live-caster.stream-validation-runs";

const createMemoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
};

const sample = (elapsedSeconds: number): StreamHealthSample => ({
  at: new Date(Date.UTC(2026, 5, 23, 0, 0, elapsedSeconds)).toISOString(),
  status: "live",
  elapsedSeconds,
  bitrateKbps: 3500,
  fps: 30,
  droppedFrames: 0,
  reconnectAttempts: 0
});

describe("local stream session summary store", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves, loads, and clears completed stream session summaries", () => {
    const storage = createMemoryStorage();
    vi.stubGlobal("localStorage", storage);
    const summary = createStreamSessionSummary({
      events: [],
      healthSamples: [sample(1), sample(4)],
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:05.000Z")
    });
    if (!summary) {
      throw new Error("Expected session summary.");
    }

    saveStreamSessionSummaries([summary]);

    expect(loadStreamSessionSummaries()).toHaveLength(1);
    expect(storage.getItem(sessionSummaryStorageKey)).toContain(summary.id);

    clearStreamSessionSummaries();

    expect(loadStreamSessionSummaries()).toEqual([]);
    expect(storage.getItem(sessionSummaryStorageKey)).toBeNull();
  });

  it("loads legacy scene persistence as an active scene collection", () => {
    const storage = createMemoryStorage();
    vi.stubGlobal("localStorage", storage);
    const scene = {
      ...createDefaultScene(),
      id: "legacy-scene",
      name: "Legacy Scene"
    };
    storage.setItem(sceneStorageKey, JSON.stringify(scene));

    const collection = loadSceneCollection();

    expect(collection?.activeSceneId).toBe("legacy-scene");
    expect(collection?.transition).toEqual({ kind: "fade", durationMs: 300 });
    expect(collection?.scenes).toHaveLength(1);
    expect(loadScene()?.name).toBe("Legacy Scene");
  });

  it("saves and loads scene collections without transient avatar runtime", () => {
    const storage = createMemoryStorage();
    vi.stubGlobal("localStorage", storage);
    const collection = createDefaultSceneCollection();
    const withRuntime = {
      ...collection,
      activeSceneId: "scene-break",
      transition: { kind: "cut" as const, durationMs: 0 },
      scenes: collection.scenes.map((scene) => ({
        ...scene,
        sources: scene.sources.map((source) =>
          source.kind === "pngtuber" ? { ...source, mouthOpen: 0.9, blink: 0.7 } : source
        )
      }))
    };

    saveSceneCollection(withRuntime);
    const loaded = loadSceneCollection();

    expect(loaded?.scenes).toHaveLength(4);
    expect(loaded?.activeSceneId).toBe("scene-break");
    expect(loaded?.transition).toEqual({ kind: "cut", durationMs: 0 });
    const activeAvatar = selectActiveScene(loaded!).sources.find((source) => source.kind === "pngtuber");
    expect(activeAvatar?.mouthOpen).toBe(0);
    expect(activeAvatar?.blink).toBe(0);
    expect(storage.getItem(sceneStorageKey)).toContain("scene-starting-soon");
    expect(storage.getItem(sceneStorageKey)).toContain("scene-privacy-shield");
  });

  it("saves, loads, and clears physical validation runs", () => {
    const storage = createMemoryStorage();
    vi.stubGlobal("localStorage", storage);
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: "validation-key"
      }
    };
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: initialStreamState.health
    });
    const run = createStreamValidationRun({
      diagnostics,
      devicePlatform: "android",
      result: "warn",
      now: new Date("2026-06-23T00:00:00.000Z")
    });

    const unsafeRun = {
      ...run,
      deviceName: `Pixel ${profile.destination.streamKey}`,
      summary: `Summary ${profile.destination.streamKey}`,
      recommendation: `Retest ${profile.destination.streamKey}`,
      networkProfile:
        "Authorization: Bearer validation-oauth-token mobilelivecaster://oauth/youtube?code=validation-code www.example.org/room example.tv/show"
    };

    saveStreamValidationRuns([unsafeRun], [profile.destination.streamKey]);

    expect(loadStreamValidationRuns()).toHaveLength(1);
    expect(storage.getItem(validationRunsStorageKey)).toContain(run.id);
    expect(storage.getItem(validationRunsStorageKey)).not.toContain(profile.destination.streamKey);
    expect(storage.getItem(validationRunsStorageKey)).not.toContain("validation-oauth-token");
    expect(storage.getItem(validationRunsStorageKey)).not.toContain("validation-code");
    expect(storage.getItem(validationRunsStorageKey)).not.toContain("www.example.org");
    expect(storage.getItem(validationRunsStorageKey)).not.toContain("example.tv");
    expect(storage.getItem(validationRunsStorageKey)).toContain("[redacted]");

    clearStreamValidationRuns();

    expect(loadStreamValidationRuns()).toEqual([]);
    expect(storage.getItem(validationRunsStorageKey)).toBeNull();
  });

  it("strips stream keys from saved browser profiles", () => {
    const storage = createMemoryStorage();
    vi.stubGlobal("localStorage", storage);
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: "browser-profile-secret"
      }
    };

    saveProfile(profile);

    expect(storage.getItem(profileStorageKey)).not.toContain("browser-profile-secret");
    expect(loadProfile()?.destination.streamKey).toBe("");
  });
});
