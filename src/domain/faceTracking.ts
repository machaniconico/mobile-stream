import type { AvatarExpression } from "./avatar";
import { defaultAvatarMotion, updateSource, type AvatarMotion, type SceneDocument, type SceneSource } from "./scene";

export type FaceTrackingInputMode = "simulated" | "native-camera";
export type FaceTrackingRigMode = "still-image-2d" | "layered-2d";

export interface FaceTrackingProfile {
  enabled: boolean;
  inputMode: FaceTrackingInputMode;
  rigMode: FaceTrackingRigMode;
  trackingStrength: number;
  smoothing: number;
  headRange: number;
  bodyRange: number;
  mouthSensitivity: number;
  blinkSensitivity: number;
  expressionSensitivity: number;
  autoExpression: boolean;
  neutralYaw: number;
  neutralPitch: number;
  neutralRoll: number;
}

export interface FaceTrackingFrame {
  yaw: number;
  pitch: number;
  roll: number;
  mouthOpen: number;
  leftBlink: number;
  rightBlink: number;
  smile: number;
  browRaise: number;
  confidence: number;
  timestamp: number;
}

export interface FaceTrackingRuntimeState {
  status: "disabled" | "tracking" | "lost";
  yaw: number;
  pitch: number;
  roll: number;
  mouthOpen: number;
  blink: number;
  smile: number;
  browRaise: number;
  confidence: number;
  expression: AvatarExpression;
  lastFrameAt: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

export const defaultFaceTrackingProfile: FaceTrackingProfile = {
  enabled: false,
  inputMode: "simulated",
  rigMode: "still-image-2d",
  trackingStrength: 0.78,
  smoothing: 0.62,
  headRange: 0.72,
  bodyRange: 0.35,
  mouthSensitivity: 1.15,
  blinkSensitivity: 1,
  expressionSensitivity: 0.72,
  autoExpression: true,
  neutralYaw: 0,
  neutralPitch: 0,
  neutralRoll: 0
};

export const createFaceTrackingRuntimeState = (now = Date.now()): FaceTrackingRuntimeState => ({
  status: "disabled",
  yaw: 0,
  pitch: 0,
  roll: 0,
  mouthOpen: 0,
  blink: 0,
  smile: 0,
  browRaise: 0,
  confidence: 0,
  expression: "neutral",
  lastFrameAt: now
});

export const normalizeFaceTrackingProfile = (
  profile: Partial<FaceTrackingProfile> | null | undefined
): FaceTrackingProfile => ({
  enabled: profile?.enabled ?? defaultFaceTrackingProfile.enabled,
  inputMode: profile?.inputMode === "native-camera" ? "native-camera" : "simulated",
  rigMode: profile?.rigMode === "layered-2d" ? "layered-2d" : "still-image-2d",
  trackingStrength: clamp01(profile?.trackingStrength ?? defaultFaceTrackingProfile.trackingStrength),
  smoothing: clamp01(profile?.smoothing ?? defaultFaceTrackingProfile.smoothing),
  headRange: clamp01(profile?.headRange ?? defaultFaceTrackingProfile.headRange),
  bodyRange: clamp01(profile?.bodyRange ?? defaultFaceTrackingProfile.bodyRange),
  mouthSensitivity: clamp(profile?.mouthSensitivity ?? defaultFaceTrackingProfile.mouthSensitivity, 0.2, 2),
  blinkSensitivity: clamp(profile?.blinkSensitivity ?? defaultFaceTrackingProfile.blinkSensitivity, 0.2, 2),
  expressionSensitivity: clamp01(profile?.expressionSensitivity ?? defaultFaceTrackingProfile.expressionSensitivity),
  autoExpression: profile?.autoExpression ?? defaultFaceTrackingProfile.autoExpression,
  neutralYaw: clamp(profile?.neutralYaw ?? defaultFaceTrackingProfile.neutralYaw, -1, 1),
  neutralPitch: clamp(profile?.neutralPitch ?? defaultFaceTrackingProfile.neutralPitch, -1, 1),
  neutralRoll: clamp(profile?.neutralRoll ?? defaultFaceTrackingProfile.neutralRoll, -1, 1)
});

export const createSimulatedFaceTrackingFrame = (now: number, profile: FaceTrackingProfile): FaceTrackingFrame => {
  const t = now / 1000;
  const confidence = profile.enabled ? 0.94 : 0;
  return {
    yaw: Math.sin(t * 0.85) * 0.42 + Math.sin(t * 0.27) * 0.16,
    pitch: Math.sin(t * 0.62 + 1.8) * 0.24,
    roll: Math.sin(t * 0.9 + 0.7) * 0.18,
    mouthOpen: clamp01(0.28 + Math.max(0, Math.sin(t * 5.1)) * 0.42 + Math.max(0, Math.sin(t * 2.35)) * 0.18),
    leftBlink: blinkPulse(t, 0),
    rightBlink: blinkPulse(t, 0.04),
    smile: clamp01(0.35 + Math.sin(t * 0.52) * 0.32),
    browRaise: clamp01(0.28 + Math.sin(t * 0.74 + 2.5) * 0.24),
    confidence,
    timestamp: now
  };
};

export const updateFaceTrackingRuntime = (
  current: FaceTrackingRuntimeState,
  frame: FaceTrackingFrame,
  profile: FaceTrackingProfile,
  now = frame.timestamp
): FaceTrackingRuntimeState => {
  if (!profile.enabled) {
    return {
      ...createFaceTrackingRuntimeState(now),
      status: "disabled"
    };
  }

  const confidence = clamp01(frame.confidence);
  const status: FaceTrackingRuntimeState["status"] = confidence < 0.25 || now - frame.timestamp > 600 ? "lost" : "tracking";
  const follow = clamp(1 - profile.smoothing, 0.08, 0.92) * (status === "tracking" ? 1 : 0.2);
  const yaw = clamp((frame.yaw - profile.neutralYaw) * profile.trackingStrength, -1, 1);
  const pitch = clamp((frame.pitch - profile.neutralPitch) * profile.trackingStrength, -1, 1);
  const roll = clamp((frame.roll - profile.neutralRoll) * profile.trackingStrength, -1, 1);
  const mouthOpen = clamp01(frame.mouthOpen * profile.mouthSensitivity);
  const blink = clamp01(((frame.leftBlink + frame.rightBlink) / 2) * profile.blinkSensitivity);
  const smile = clamp01(frame.smile);
  const browRaise = clamp01(frame.browRaise);

  const next: FaceTrackingRuntimeState = {
    status,
    yaw: lerp(current.yaw, yaw, follow),
    pitch: lerp(current.pitch, pitch, follow),
    roll: lerp(current.roll, roll, follow),
    mouthOpen: lerp(current.mouthOpen, mouthOpen, follow),
    blink: lerp(current.blink, blink, follow),
    smile: lerp(current.smile, smile, follow),
    browRaise: lerp(current.browRaise, browRaise, follow),
    confidence: lerp(current.confidence, confidence, follow),
    expression: current.expression,
    lastFrameAt: now
  };

  return {
    ...next,
    expression: profile.autoExpression ? inferExpression(next, profile) : current.expression
  };
};

export const calibrateFaceTrackingProfile = (
  profile: FaceTrackingProfile,
  runtime: FaceTrackingRuntimeState
): FaceTrackingProfile => ({
  ...profile,
  neutralYaw: clamp(runtime.yaw + profile.neutralYaw, -1, 1),
  neutralPitch: clamp(runtime.pitch + profile.neutralPitch, -1, 1),
  neutralRoll: clamp(runtime.roll + profile.neutralRoll, -1, 1)
});

export const applyFaceTrackingRuntime = (
  scene: SceneDocument,
  runtime: FaceTrackingRuntimeState,
  profile: FaceTrackingProfile
): SceneDocument => {
  let changed = false;
  let next = scene;

  for (const source of scene.sources) {
    if (!isAvatarSource(source)) {
      continue;
    }
    changed = true;
    next = updateSource(next, source.id, (current) => {
      if (!isAvatarSource(current)) {
        return current;
      }
      const motion = profile.enabled ? runtimeToMotion(runtime, profile) : defaultAvatarMotion();
      return {
        ...current,
        expression: profile.enabled && profile.autoExpression ? runtime.expression : current.expression,
        mouthOpen: profile.enabled ? runtime.mouthOpen : current.mouthOpen,
        blink: profile.enabled ? runtime.blink : current.blink,
        motion
      };
    });
  }

  return changed ? next : scene;
};

export const clearFaceTrackingMotion = (scene: SceneDocument): SceneDocument =>
  applyFaceTrackingRuntime(scene, createFaceTrackingRuntimeState(), { ...defaultFaceTrackingProfile, enabled: false });

const runtimeToMotion = (runtime: FaceTrackingRuntimeState, profile: FaceTrackingProfile): AvatarMotion => {
  const lostMultiplier = runtime.status === "tracking" ? 1 : 0.35;
  return {
    headYaw: runtime.yaw * profile.headRange * lostMultiplier,
    headPitch: runtime.pitch * profile.headRange * lostMultiplier,
    headRoll: runtime.roll * profile.headRange * lostMultiplier,
    headX: runtime.yaw * 0.035 * profile.headRange * lostMultiplier,
    headY: runtime.pitch * 0.03 * profile.headRange * lostMultiplier,
    bodyLean: runtime.roll * profile.bodyRange * lostMultiplier,
    bodyBounce: Math.abs(runtime.mouthOpen - 0.3) * 0.02 * profile.bodyRange,
    breathing: (0.5 + runtime.smile * 0.5) * 0.018 * profile.bodyRange,
    confidence: runtime.confidence
  };
};

const inferExpression = (runtime: FaceTrackingRuntimeState, profile: FaceTrackingProfile): AvatarExpression => {
  const sensitivity = profile.expressionSensitivity;
  if (runtime.browRaise > 0.68 - sensitivity * 0.22 && runtime.mouthOpen > 0.5) {
    return "surprised";
  }
  if (runtime.smile > 0.62 - sensitivity * 0.2) {
    return "happy";
  }
  if (runtime.browRaise < 0.18 + sensitivity * 0.12 && Math.abs(runtime.roll) > 0.2) {
    return "angry";
  }
  return "neutral";
};

const blinkPulse = (t: number, offset: number): number => {
  const cycle = (t + offset) % 3.7;
  if (cycle < 0.08) {
    return 1;
  }
  if (cycle < 0.16) {
    return 0.55;
  }
  return 0;
};

const isAvatarSource = (
  source: SceneSource
): source is Extract<SceneSource, { kind: "pngtuber" | "live2d" }> =>
  source.kind === "pngtuber" || source.kind === "live2d";
