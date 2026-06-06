import { describe, expect, it } from "vitest";
import { createAvatarRuntimeState, lipSyncFromRms, setExpression, tickAutoBlink } from "./avatar";

describe("avatar runtime", () => {
  it("maps microphone RMS into a clamped mouth-open value", () => {
    expect(lipSyncFromRms(0)).toBe(0);
    expect(lipSyncFromRms(0.4)).toBe(0.6);
    expect(lipSyncFromRms(2)).toBe(1);
  });

  it("changes expression without resetting blink or mouth state", () => {
    const state = { ...createAvatarRuntimeState(1000), mouthOpen: 0.4, blink: 0.7 };
    const next = setExpression(state, "happy");

    expect(next.expression).toBe("happy");
    expect(next.mouthOpen).toBe(0.4);
    expect(next.blink).toBe(0.7);
  });

  it("does not blink before the scheduled blink time", () => {
    const state = createAvatarRuntimeState(1000);
    const next = tickAutoBlink(state, 1200);

    expect(next.blink).toBe(0);
    expect(next.nextBlinkAt).toBe(state.nextBlinkAt);
  });
});
