import { describe, expect, it } from "vitest";
import { createDefaultLiveCaptionState, ingestLiveCaptionCue, setLiveCaptionStatus, updateLiveCaptionSettings } from "./liveCaption";
import { createLiveCaptionDiagnostics } from "./liveCaptionDiagnostics";
import { createDefaultScene, createLiveCaptionTextSource, type SceneDocument } from "./scene";

const sceneWithLiveCaptionSource = (): SceneDocument => ({
  ...createDefaultScene(),
  sources: [...createDefaultScene().sources, createLiveCaptionTextSource()]
});

describe("liveCaptionDiagnostics", () => {
  it("treats disabled captions as informational", () => {
    const diagnostics = createLiveCaptionDiagnostics(createDefaultScene(), createDefaultLiveCaptionState(), 1000);

    expect(diagnostics.status).toBe("info");
    expect(diagnostics.enabled).toBe(false);
  });

  it("fails when captions are enabled without a visible runtime caption source", () => {
    const diagnostics = createLiveCaptionDiagnostics(
      createDefaultScene(),
      updateLiveCaptionSettings(createDefaultLiveCaptionState(), { enabled: true }),
      1000
    );

    expect(diagnostics.status).toBe("fail");
    expect(diagnostics.summary).toContain("no visible Live Caption");
  });

  it("fails when recognition is unsupported or errored", () => {
    const unsupported = createLiveCaptionDiagnostics(
      sceneWithLiveCaptionSource(),
      setLiveCaptionStatus(updateLiveCaptionSettings(createDefaultLiveCaptionState(), { enabled: true }), "unsupported"),
      1000
    );
    const errored = createLiveCaptionDiagnostics(
      sceneWithLiveCaptionSource(),
      setLiveCaptionStatus(updateLiveCaptionSettings(createDefaultLiveCaptionState(), { enabled: true }), "error", "denied"),
      1000
    );

    expect(unsupported.status).toBe("fail");
    expect(errored.status).toBe("fail");
    expect(errored.summary).toBe("denied");
  });

  it("warns until a final caption cue is confirmed", () => {
    const listening = setLiveCaptionStatus(updateLiveCaptionSettings(createDefaultLiveCaptionState(), { enabled: true }), "listening");
    const withInterim = ingestLiveCaptionCue(listening, { text: "draft", isFinal: false, timestampMs: 1000 }, 1000);

    expect(createLiveCaptionDiagnostics(sceneWithLiveCaptionSource(), listening, 1000).status).toBe("warn");
    expect(createLiveCaptionDiagnostics(sceneWithLiveCaptionSource(), withInterim, 1000).status).toBe("warn");
  });

  it("passes after a final caption cue is active", () => {
    const state = ingestLiveCaptionCue(
      setLiveCaptionStatus(updateLiveCaptionSettings(createDefaultLiveCaptionState(), { enabled: true }), "listening"),
      { text: "final caption", isFinal: true, timestampMs: 1000 },
      1000
    );
    const diagnostics = createLiveCaptionDiagnostics(sceneWithLiveCaptionSource(), state, 1200);

    expect(diagnostics.status).toBe("pass");
    expect(diagnostics.finalCueCount).toBe(1);
    expect(diagnostics.summary).toContain("final live caption");
  });
});
