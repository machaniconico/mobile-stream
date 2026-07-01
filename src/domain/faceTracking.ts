import type { AvatarExpression } from "./avatar";
import { createAvatarIllustrationRigQuality } from "./avatarIllustrationRigQuality";
import {
  type AvatarIllustrationLandmarkAnalysis,
  defaultAvatarIllustrationRig,
  defaultAvatarMotion,
  updateSource,
  type AvatarIllustrationRig,
  type AvatarMotion,
  type SceneDocument,
  type SceneSource
} from "./scene";

export type FaceTrackingInputMode = "simulated" | "native-camera";
export type FaceTrackingRigMode = "still-image-2d" | "layered-2d";

export interface FaceTrackingProfile {
  enabled: boolean;
  inputMode: FaceTrackingInputMode;
  rigMode: FaceTrackingRigMode;
  trackingStrength: number;
  smoothing: number;
  deadZone: number;
  maxMotionStep: number;
  lostReturnSpeed: number;
  headRange: number;
  bodyRange: number;
  illustrationDeform: number;
  hairSway: number;
  eyeDeform: number;
  mouthDeform: number;
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
  faceLandmarkAnalysis?: AvatarIllustrationLandmarkAnalysis | null;
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
  faceLandmarkConfidence?: number;
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
  deadZone: 0.035,
  maxMotionStep: 0.28,
  lostReturnSpeed: 0.36,
  headRange: 0.72,
  bodyRange: 0.35,
  illustrationDeform: 0.48,
  hairSway: 0.36,
  eyeDeform: 0.38,
  mouthDeform: 0.52,
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
  faceLandmarkConfidence: 0,
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
  deadZone: clamp(profile?.deadZone ?? defaultFaceTrackingProfile.deadZone, 0, 0.2),
  maxMotionStep: clamp(profile?.maxMotionStep ?? defaultFaceTrackingProfile.maxMotionStep, 0.04, 1),
  lostReturnSpeed: clamp01(profile?.lostReturnSpeed ?? defaultFaceTrackingProfile.lostReturnSpeed),
  headRange: clamp01(profile?.headRange ?? defaultFaceTrackingProfile.headRange),
  bodyRange: clamp01(profile?.bodyRange ?? defaultFaceTrackingProfile.bodyRange),
  illustrationDeform: clamp01(profile?.illustrationDeform ?? defaultFaceTrackingProfile.illustrationDeform),
  hairSway: clamp01(profile?.hairSway ?? defaultFaceTrackingProfile.hairSway),
  eyeDeform: clamp01(profile?.eyeDeform ?? defaultFaceTrackingProfile.eyeDeform),
  mouthDeform: clamp01(profile?.mouthDeform ?? defaultFaceTrackingProfile.mouthDeform),
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

export const createLostFaceTrackingFrame = (now = Date.now()): FaceTrackingFrame => ({
  yaw: 0,
  pitch: 0,
  roll: 0,
  mouthOpen: 0,
  leftBlink: 0,
  rightBlink: 0,
  smile: 0,
  browRaise: 0,
  confidence: 0,
  timestamp: now
});

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
  const trackingFollow = clamp(1 - profile.smoothing, 0.08, 0.92);
  const follow = trackingFollow * (status === "tracking" ? 1 : profile.lostReturnSpeed);
  const yaw = applyDeadZone(clamp((frame.yaw - profile.neutralYaw) * profile.trackingStrength, -1, 1), profile.deadZone);
  const pitch = applyDeadZone(clamp((frame.pitch - profile.neutralPitch) * profile.trackingStrength, -1, 1), profile.deadZone);
  const roll = applyDeadZone(clamp((frame.roll - profile.neutralRoll) * profile.trackingStrength, -1, 1), profile.deadZone);
  const mouthOpen = clamp01(frame.mouthOpen * profile.mouthSensitivity);
  const blink = clamp01(((frame.leftBlink + frame.rightBlink) / 2) * profile.blinkSensitivity);
  const smile = clamp01(frame.smile);
  const browRaise = clamp01(frame.browRaise);
  const faceLandmarkConfidence = clamp01(frame.faceLandmarkAnalysis?.confidence ?? 0);
  const poseStep = profile.maxMotionStep;
  const expressionStep = Math.max(profile.maxMotionStep, 0.42);

  const next: FaceTrackingRuntimeState = {
    status,
    yaw: limitedLerp(current.yaw, yaw, follow, poseStep),
    pitch: limitedLerp(current.pitch, pitch, follow, poseStep),
    roll: limitedLerp(current.roll, roll, follow, poseStep),
    mouthOpen: limitedLerp(current.mouthOpen, mouthOpen, follow, expressionStep),
    blink: limitedLerp(current.blink, blink, follow, expressionStep),
    smile: limitedLerp(current.smile, smile, follow, expressionStep),
    browRaise: limitedLerp(current.browRaise, browRaise, follow, expressionStep),
    confidence: limitedLerp(current.confidence, confidence, follow, expressionStep),
    faceLandmarkConfidence: limitedLerp(current.faceLandmarkConfidence ?? 0, faceLandmarkConfidence, follow, expressionStep),
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
      const rig = current.kind === "pngtuber" ? current.illustrationRig : defaultAvatarIllustrationRig();
      const motion = profile.enabled ? runtimeToMotion(runtime, profile, rig) : defaultAvatarMotion();
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

const runtimeToMotion = (
  runtime: FaceTrackingRuntimeState,
  profile: FaceTrackingProfile,
  rig: AvatarIllustrationRig = defaultAvatarIllustrationRig()
): AvatarMotion => {
  const lostMultiplier = runtime.status === "tracking" ? 1 : 0.35;
  const illustrationRigMultiplier = profile.rigMode === "still-image-2d" || profile.rigMode === "layered-2d" ? lostMultiplier : 0;
  const illustrationStrength = profile.illustrationDeform * illustrationRigMultiplier;
  const faceInfluence = clamp01((rig.faceRange - 0.08) / 0.52);
  const lowerBodyInfluence = clamp01((rig.shoulderLineY - 0.45) / 0.5);
  const hairInfluence = clamp01((0.55 - rig.hairLineY) / 0.5);
  const mouthEyeSeparation = clamp01((rig.mouthLineY - rig.eyeLineY) / 0.45);
  const rigQuality = createAvatarIllustrationRigQuality(rig);
  const partSeparationMotionScale = 0.45 + rigQuality.partSeparationFactor * 0.55;
  const depthContinuityMotionScale = 0.5 + rigQuality.depthContinuityFactor * 0.5;
  const horizontalAnchorMotionScale = 0.35 + rigQuality.horizontalAnchorFactor * 0.65;
  const landmarkMotionScale =
    profile.inputMode === "native-camera" ? 0.4 + clamp01(runtime.faceLandmarkConfidence ?? 0) * 0.6 : 1;
  const highFidelityMotionScale = 0.45 + rigQuality.highFidelityFactor * 0.55;
  const faceMotionScale = 0.84 + faceInfluence * 0.34;
  const bodyMotionScale = 0.74 + lowerBodyInfluence * 0.36;
  const hairMotionScale = 0.72 + hairInfluence * 0.46;
  const mouthMotionScale = 0.84 + mouthEyeSeparation * 0.34;
  return {
    headYaw: clamp(runtime.yaw * profile.headRange * lostMultiplier * faceMotionScale, -1, 1),
    headPitch: clamp(runtime.pitch * profile.headRange * lostMultiplier * faceMotionScale, -1, 1),
    headRoll: clamp(runtime.roll * profile.headRange * lostMultiplier * faceMotionScale, -1, 1),
    headX: clamp(
      runtime.yaw *
        0.035 *
        profile.headRange *
        lostMultiplier *
        faceMotionScale *
        horizontalAnchorMotionScale *
        landmarkMotionScale,
      -1,
      1
    ),
    headY: clamp(runtime.pitch * 0.03 * profile.headRange * lostMultiplier * faceMotionScale * landmarkMotionScale, -1, 1),
    bodyLean: clamp(runtime.roll * profile.bodyRange * lostMultiplier * bodyMotionScale, -1, 1),
    bodyBounce: Math.abs(runtime.mouthOpen - 0.3) * 0.02 * profile.bodyRange * landmarkMotionScale,
    breathing: (0.5 + runtime.smile * 0.5) * 0.018 * profile.bodyRange,
    depthTilt: clamp01(
      (Math.abs(runtime.yaw) * 0.68 + Math.abs(runtime.pitch) * 0.42) *
        illustrationStrength *
        faceMotionScale *
        depthContinuityMotionScale *
        landmarkMotionScale
    ),
    meshWarp: clamp(
      (runtime.yaw + runtime.roll * profile.bodyRange * 0.18) *
        illustrationStrength *
        faceMotionScale *
        highFidelityMotionScale *
        horizontalAnchorMotionScale *
        landmarkMotionScale,
      -1,
      1
    ),
    eyeSquint: clamp01(
      runtime.blink *
        profile.eyeDeform *
        illustrationRigMultiplier *
        partSeparationMotionScale *
        horizontalAnchorMotionScale *
        landmarkMotionScale
    ),
    mouthDeform: clamp01(
      runtime.mouthOpen *
        profile.mouthDeform *
        illustrationRigMultiplier *
        mouthMotionScale *
        partSeparationMotionScale *
        horizontalAnchorMotionScale *
        landmarkMotionScale
    ),
    hairSway: clamp(
      (-runtime.yaw * 0.72 + runtime.roll * 0.32) *
        profile.hairSway *
        illustrationRigMultiplier *
        hairMotionScale *
        depthContinuityMotionScale *
        landmarkMotionScale,
      -1,
      1
    ),
    shoulderSway: clamp(
      (runtime.roll * 0.62 + runtime.yaw * 0.2) *
        profile.bodyRange *
        illustrationRigMultiplier *
        bodyMotionScale *
        depthContinuityMotionScale *
        landmarkMotionScale,
      -1,
      1
    ),
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

const applyDeadZone = (value: number, deadZone: number): number => {
  const abs = Math.abs(value);
  if (abs <= deadZone) {
    return 0;
  }
  const scaled = (abs - deadZone) / Math.max(1 - deadZone, 0.001);
  return Math.sign(value) * clamp01(scaled);
};

const limitedLerp = (from: number, to: number, amount: number, maxStep: number): number => {
  const next = lerp(from, to, amount);
  return from + clamp(next - from, -maxStep, maxStep);
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
): source is Extract<SceneSource, { kind: "pngtuber" | "live2d" | "vrm" }> =>
  source.kind === "pngtuber" || source.kind === "live2d" || source.kind === "vrm";
