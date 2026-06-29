import type { SceneDocument } from "./scene";

export type AvatarExpression = "neutral" | "happy" | "angry" | "surprised";

export interface AvatarRuntimeState {
  expression: AvatarExpression;
  mouthOpen: number;
  blink: number;
  lastBlinkAt: number;
  nextBlinkAt: number;
}

const avatarExpressions: readonly AvatarExpression[] = ["neutral", "happy", "angry", "surprised"];
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const createAvatarRuntimeState = (now = 0): AvatarRuntimeState => ({
  expression: "neutral",
  mouthOpen: 0,
  blink: 0,
  lastBlinkAt: now,
  nextBlinkAt: now + 2800
});

export const createAvatarRuntimeStateFromScene = (scene: SceneDocument, now = 0): AvatarRuntimeState => {
  const fallback = createAvatarRuntimeState(now);
  const avatar = scene.sources.find((source) => source.kind === "pngtuber" || source.kind === "live2d" || source.kind === "vrm");
  if (!avatar) {
    return fallback;
  }
  return {
    ...fallback,
    expression: isAvatarExpression(avatar.expression) ? avatar.expression : fallback.expression,
    mouthOpen: clamp01(avatar.mouthOpen),
    blink: clamp01(avatar.blink)
  };
};

export const isAvatarExpression = (value: unknown): value is AvatarExpression =>
  typeof value === "string" && avatarExpressions.includes(value as AvatarExpression);

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
