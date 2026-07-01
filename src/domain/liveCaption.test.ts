import { describe, expect, it } from "vitest";
import {
  clearLiveCaptionCues,
  createDefaultLiveCaptionState,
  ingestLiveCaptionCue,
  selectLiveCaptionCues,
  setLiveCaptionStatus,
  updateLiveCaptionSettings
} from "./liveCaption";

describe("liveCaption", () => {
  it("keeps captions disabled by default", () => {
    const state = createDefaultLiveCaptionState();
    const next = ingestLiveCaptionCue(state, { text: "hello", timestampMs: 1000 }, 1000);

    expect(state.settings.enabled).toBe(false);
    expect(next.cues).toHaveLength(0);
    expect(selectLiveCaptionCues(next, 1000)).toHaveLength(0);
  });

  it("ingests sanitized final caption cues while redacting secrets and urls", () => {
    const state = updateLiveCaptionSettings(createDefaultLiveCaptionState(), {
      enabled: true,
      language: "ja-JP"
    });
    const next = ingestLiveCaptionCue(
      state,
      {
        speaker: "Bearer speaker-secret-token-12345",
        text:
          "Authorization: Bearer caption-secret-token-12345 open https://example.com/private",
        confidence: 2,
        timestampMs: 2000
      },
      2000
    );

    expect(next.status).toBe("listening");
    expect(next.transcriptCount).toBe(1);
    expect(next.cues[0]).toMatchObject({
      speaker: "Bearer [redacted]",
      text: "Authorization: Bearer [redacted] open [link]",
      language: "ja-JP",
      confidence: 1,
      isFinal: true,
      timestampMs: 2000
    });
    expect(JSON.stringify(next)).not.toContain("speaker-secret-token-12345");
    expect(JSON.stringify(next)).not.toContain("caption-secret-token-12345");
    expect(JSON.stringify(next)).not.toContain("example.com");
  });

  it("keeps only the latest interim cue until a final cue arrives", () => {
    const state = updateLiveCaptionSettings(createDefaultLiveCaptionState(), {
      enabled: true,
      interimResults: true
    });
    const first = ingestLiveCaptionCue(state, { text: "hello wor", isFinal: false, timestampMs: 1000 }, 1000);
    const second = ingestLiveCaptionCue(first, { text: "hello world", isFinal: false, timestampMs: 1200 }, 1200);
    const final = ingestLiveCaptionCue(second, { text: "hello world", isFinal: true, timestampMs: 1400 }, 1400);

    expect(first.cues.map((cue) => cue.text)).toEqual(["hello wor"]);
    expect(second.cues.map((cue) => cue.text)).toEqual(["hello world"]);
    expect(second.transcriptCount).toBe(0);
    expect(final.cues.map((cue) => cue.text)).toEqual(["hello world"]);
    expect(final.transcriptCount).toBe(1);
  });

  it("drops interim cues when interim results are disabled", () => {
    const state = updateLiveCaptionSettings(createDefaultLiveCaptionState(), {
      enabled: true,
      interimResults: false
    });
    const next = ingestLiveCaptionCue(state, { text: "draft", isFinal: false, timestampMs: 1000 }, 1000);

    expect(next.cues).toHaveLength(0);
  });

  it("filters stale cues from render selection", () => {
    const state = ingestLiveCaptionCue(
      updateLiveCaptionSettings(createDefaultLiveCaptionState(), {
        enabled: true,
        staleCueMillis: 1500
      }),
      { text: "fresh enough", timestampMs: 1000 },
      1000
    );

    expect(selectLiveCaptionCues(state, 2400)).toHaveLength(1);
    expect(selectLiveCaptionCues(state, 2600)).toHaveLength(0);
  });

  it("clears cues and normalizes disabled state", () => {
    const state = ingestLiveCaptionCue(
      updateLiveCaptionSettings(createDefaultLiveCaptionState(), { enabled: true }),
      { text: "caption", timestampMs: 1000 },
      1000
    );
    const cleared = clearLiveCaptionCues(state);
    const disabled = updateLiveCaptionSettings(setLiveCaptionStatus(cleared, "error", "failed"), { enabled: false });

    expect(cleared.cues).toHaveLength(0);
    expect(cleared.transcriptCount).toBe(0);
    expect(disabled.status).toBe("idle");
    expect(disabled.errorMessage).toBe("");
  });
});
