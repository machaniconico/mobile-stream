export type AvatarExpression = "neutral" | "happy" | "angry" | "surprised";

export interface AvatarRuntimeState {
  expression: AvatarExpression;
  mouthOpen: number;
  blink: number;
  lastBlinkAt: number;
  nextBlinkAt: number;
}

export const createAvatarRuntimeState = (now = 0): AvatarRuntimeState => ({
  expression: "neutral",
  mouthOpen: 0,
  blink: 0,
  lastBlinkAt: now,
  nextBlinkAt: now + 2800
});

export const lipSyncFromRms = (rms: number, sensitivity = 1.5): number => {
  const normalized = Math.max(0, Math.min(1, rms * sensitivity));
  return Number(normalized.toFixed(3));
};

export const tickAutoBlink = (state: AvatarRuntimeState, now: number): AvatarRuntimeState => {
  if (now < state.nextBlinkAt) {
    return { ...state, blink: Math.max(0, state.blink - 0.18) };
  }

  const blinkPhase = now - state.nextBlinkAt;
  const blink = blinkPhase < 120 ? 1 : blinkPhase < 240 ? 0.45 : 0;
  const finished = blinkPhase >= 240;

  return {
    ...state,
    blink,
    lastBlinkAt: finished ? now : state.lastBlinkAt,
    nextBlinkAt: finished ? now + 2600 + Math.round(Math.random() * 1800) : state.nextBlinkAt
  };
};

export const setExpression = (
  state: AvatarRuntimeState,
  expression: AvatarExpression
): AvatarRuntimeState => ({
  ...state,
  expression
});
