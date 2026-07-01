import type { AvatarMotion, Live2DSource } from "./scene";

export type Live2DRuntimeStatus = "idle" | "active";
export type Live2DExpressionPreset = "neutral" | "happy" | "angry" | "surprised";
export type Live2DParameterId =
  | "ParamAngleX"
  | "ParamAngleY"
  | "ParamAngleZ"
  | "ParamBodyAngleX"
  | "ParamBodyAngleY"
  | "ParamEyeLOpen"
  | "ParamEyeROpen"
  | "ParamMouthOpenY"
  | "ParamMouthForm"
  | "ParamBreath"
  | "ParamCheek";

export interface Live2DRuntimePose {
  status: Live2DRuntimeStatus;
  confidence: number;
  expression: Live2DExpressionPreset;
  parameters: Record<Live2DParameterId, number>;
  lookAt: {
    yaw: number;
    pitch: number;
  };
  summary: string;
}

export interface Live2DRuntimePoseOptions {
  angleXDegrees?: number;
  angleYDegrees?: number;
  angleZDegrees?: number;
  bodyAngleDegrees?: number;
}

const defaultPoseOptions = {
  angleXDegrees: 30,
  angleYDegrees: 22,
  angleZDegrees: 28,
  bodyAngleDegrees: 10
} as const;

const zeroMotion: AvatarMotion = {
  headYaw: 0,
  headPitch: 0,
  headRoll: 0,
  headX: 0,
  headY: 0,
  bodyLean: 0,
  bodyBounce: 0,
  breathing: 0,
  depthTilt: 0,
  meshWarp: 0,
  eyeSquint: 0,
  mouthDeform: 0,
  hairSway: 0,
  shoulderSway: 0,
  confidence: 0
};

const parameterIds: readonly Live2DParameterId[] = [
  "ParamAngleX",
  "ParamAngleY",
  "ParamAngleZ",
  "ParamBodyAngleX",
  "ParamBodyAngleY",
  "ParamEyeLOpen",
  "ParamEyeROpen",
  "ParamMouthOpenY",
  "ParamMouthForm",
  "ParamBreath",
  "ParamCheek"
];

export const createLive2DRuntimePose = (
  source: Pick<Live2DSource, "expression" | "mouthOpen" | "blink" | "motion">,
  options: Live2DRuntimePoseOptions = {}
): Live2DRuntimePose => {
  const motion = source.motion ?? zeroMotion;
  const limits = { ...defaultPoseOptions, ...options };
  const confidence = clamp01(motion.confidence);
  const yaw = clamp(motion.headYaw, -1, 1);
  const pitch = clamp(motion.headPitch, -1, 1);
  const roll = clamp(motion.headRoll, -1, 1);
  const mouthOpen = clamp01(Math.max(source.mouthOpen, motion.mouthDeform));
  const blink = clamp01(Math.max(source.blink, motion.eyeSquint));
  const smile = normalizeExpressionPreset(source.expression) === "happy" ? 1 : clamp01(mouthOpen * 0.18 + confidence * 0.08);
  const active =
    confidence > 0.05 ||
    Math.abs(yaw) > 0.02 ||
    Math.abs(pitch) > 0.02 ||
    Math.abs(roll) > 0.02 ||
    mouthOpen > 0.02 ||
    blink > 0.02;

  const parameters = emptyParameters();
  parameters.ParamAngleX = roundSigned(yaw * limits.angleXDegrees);
  parameters.ParamAngleY = roundSigned(-pitch * limits.angleYDegrees);
  parameters.ParamAngleZ = roundSigned(roll * limits.angleZDegrees);
  parameters.ParamBodyAngleX = roundSigned(clamp(motion.bodyLean * limits.bodyAngleDegrees + yaw * 3, -15, 15));
  parameters.ParamBodyAngleY = roundSigned(clamp(motion.shoulderSway * 5 - motion.bodyBounce * 30, -12, 12));
  parameters.ParamEyeLOpen = roundWeight(1 - blink);
  parameters.ParamEyeROpen = roundWeight(1 - blink);
  parameters.ParamMouthOpenY = roundWeight(mouthOpen);
  parameters.ParamMouthForm = roundSigned(clamp(smile - 0.2 + Math.max(0, motion.mouthDeform - source.mouthOpen) * 0.2, -1, 1));
  parameters.ParamBreath = roundWeight(0.5 + clamp(motion.breathing * 16, -0.5, 0.5));
  parameters.ParamCheek = roundWeight(smile * 0.45);

  return {
    status: active ? "active" : "idle",
    confidence: roundWeight(confidence),
    expression: normalizeExpressionPreset(source.expression),
    parameters,
    lookAt: {
      yaw: roundSigned(yaw),
      pitch: roundSigned(pitch)
    },
    summary: active
      ? `Live2D runtime pose active with ${roundWeight(confidence)} confidence and ${roundWeight(mouthOpen)} mouth weight.`
      : "Live2D runtime pose is idle."
  };
};

export const serializeLive2DRuntimePose = (pose: Live2DRuntimePose): string =>
  JSON.stringify({
    status: pose.status,
    confidence: pose.confidence,
    expression: pose.expression,
    parameters: pose.parameters,
    lookAt: pose.lookAt
  });

const normalizeExpressionPreset = (value: string): Live2DExpressionPreset => {
  if (value === "happy" || value === "angry" || value === "surprised") {
    return value;
  }
  return "neutral";
};

const emptyParameters = (): Record<Live2DParameterId, number> =>
  parameterIds.reduce(
    (parameters, id) => ({
      ...parameters,
      [id]: 0
    }),
    {} as Record<Live2DParameterId, number>
  );

const clamp01 = (value: number): number => clamp(value, 0, 1);

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

const roundWeight = (value: number): number => Number(clamp01(value).toFixed(3));

const roundSigned = (value: number): number => Number(value.toFixed(3));
