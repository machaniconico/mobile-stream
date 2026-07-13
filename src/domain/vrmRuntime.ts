import type { AvatarMotion, VRMSource } from "./scene";

export type VrmRuntimeStatus = "idle" | "active";
export type VrmHumanoidBoneName = "hips" | "spine" | "chest" | "neck" | "head" | "leftShoulder" | "rightShoulder";
export type VrmExpressionName =
  | "neutral"
  | "happy"
  | "angry"
  | "surprised"
  | "blink"
  | "aa"
  | "ih"
  | "ou"
  | "ee"
  | "oh"
  | "lookLeft"
  | "lookRight"
  | "lookUp"
  | "lookDown";

export interface VrmHumanoidRotation {
  bone: VrmHumanoidBoneName;
  x: number;
  y: number;
  z: number;
}

export interface VrmRuntimePose {
  schemaVersion: 1;
  rotationUnit: "degrees";
  rotationOrder: "XYZ";
  rootOffsetUnit: "model-height";
  status: VrmRuntimeStatus;
  confidence: number;
  humanoidRotations: VrmHumanoidRotation[];
  expressions: Record<VrmExpressionName, number>;
  lookAt: {
    yaw: number;
    pitch: number;
  };
  rootOffset: {
    x: number;
    y: number;
    z: number;
  };
  summary: string;
}

export interface VrmRuntimePoseOptions {
  headYawDegrees?: number;
  headPitchDegrees?: number;
  headRollDegrees?: number;
  bodyLeanDegrees?: number;
  shoulderDegrees?: number;
}

const defaultPoseOptions = {
  headYawDegrees: 28,
  headPitchDegrees: 20,
  headRollDegrees: 18,
  bodyLeanDegrees: 10,
  shoulderDegrees: 6
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

const expressionNames: readonly VrmExpressionName[] = [
  "neutral",
  "happy",
  "angry",
  "surprised",
  "blink",
  "aa",
  "ih",
  "ou",
  "ee",
  "oh",
  "lookLeft",
  "lookRight",
  "lookUp",
  "lookDown"
];

export const createVrmRuntimePose = (
  source: Pick<VRMSource, "expression" | "mouthOpen" | "blink" | "motion">,
  options: VrmRuntimePoseOptions = {}
): VrmRuntimePose => {
  const motion = normalizeMotion(source.motion);
  const limits = { ...defaultPoseOptions, ...options };
  const confidence = clamp01(motion.confidence);
  const mouthOpen = clamp01(Math.max(source.mouthOpen, motion.mouthDeform));
  const blink = clamp01(Math.max(source.blink, motion.eyeSquint));
  const yaw = clamp(motion.headYaw, -1, 1);
  const pitch = clamp(motion.headPitch, -1, 1);
  const roll = clamp(motion.headRoll, -1, 1);
  const bodyLean = clamp(motion.bodyLean, -1, 1);
  const shoulderSway = clamp(motion.shoulderSway, -1, 1);
  const active =
    confidence > 0.05 ||
    Math.abs(yaw) > 0.02 ||
    Math.abs(pitch) > 0.02 ||
    Math.abs(roll) > 0.02 ||
    mouthOpen > 0.02 ||
    blink > 0.02;

  const expressions = emptyExpressionWeights();
  const preset = normalizeExpressionPreset(source.expression);
  expressions[preset] = preset === "neutral" ? 0 : 1;
  expressions.blink = roundWeight(blink);
  expressions.aa = roundWeight(mouthOpen);
  expressions.ih = roundWeight(mouthOpen * 0.28);
  expressions.ou = roundWeight(mouthOpen * 0.18);
  expressions.ee = roundWeight(mouthOpen * 0.22 + Math.max(0, motion.mouthDeform) * 0.18);
  expressions.oh = roundWeight(mouthOpen * 0.16 + Math.max(0, -pitch) * 0.08);
  expressions.lookLeft = roundWeight(Math.max(0, -yaw));
  expressions.lookRight = roundWeight(Math.max(0, yaw));
  expressions.lookUp = roundWeight(Math.max(0, -pitch));
  expressions.lookDown = roundWeight(Math.max(0, pitch));

  const humanoidRotations: VrmHumanoidRotation[] = [
    rotation("head", -pitch * limits.headPitchDegrees, yaw * limits.headYawDegrees, roll * limits.headRollDegrees),
    rotation("neck", -pitch * limits.headPitchDegrees * 0.35, yaw * limits.headYawDegrees * 0.34, roll * limits.headRollDegrees * 0.34),
    rotation("chest", -motion.breathing * 120, yaw * 2.5, bodyLean * limits.bodyLeanDegrees),
    rotation("spine", -motion.bodyBounce * 90, yaw * 1.6, bodyLean * limits.bodyLeanDegrees * 0.45),
    rotation("hips", 0, -yaw * 1.3, -bodyLean * limits.bodyLeanDegrees * 0.18),
    rotation("leftShoulder", 0, 0, shoulderSway * limits.shoulderDegrees),
    rotation("rightShoulder", 0, 0, -shoulderSway * limits.shoulderDegrees)
  ];

  return {
    schemaVersion: 1,
    rotationUnit: "degrees",
    rotationOrder: "XYZ",
    rootOffsetUnit: "model-height",
    status: active ? "active" : "idle",
    confidence: roundWeight(confidence),
    humanoidRotations,
    expressions,
    lookAt: {
      yaw: roundSigned(yaw),
      pitch: roundSigned(pitch)
    },
    rootOffset: {
      x: roundSigned(clamp(motion.headX * 0.08 + motion.shoulderSway * 0.012, -0.12, 0.12)),
      y: roundSigned(clamp(motion.headY * 0.08 + motion.bodyBounce * 0.04 + motion.breathing * 0.03, -0.12, 0.12)),
      z: roundSigned(clamp(-motion.depthTilt * 0.08, -0.12, 0.02))
    },
    summary: active
      ? `VRM runtime pose active with ${roundWeight(confidence)} confidence and ${roundWeight(mouthOpen)} mouth weight.`
      : "VRM runtime pose is idle."
  };
};

export const serializeVrmRuntimePose = (pose: VrmRuntimePose): string =>
  JSON.stringify({
    schemaVersion: pose.schemaVersion,
    rotationUnit: pose.rotationUnit,
    rotationOrder: pose.rotationOrder,
    rootOffsetUnit: pose.rootOffsetUnit,
    status: pose.status,
    confidence: pose.confidence,
    humanoidRotations: pose.humanoidRotations,
    expressions: pose.expressions,
    lookAt: pose.lookAt,
    rootOffset: pose.rootOffset
  });

const normalizeMotion = (motion: AvatarMotion | null | undefined): AvatarMotion => motion ?? zeroMotion;

const normalizeExpressionPreset = (value: string): VrmExpressionName => {
  if (value === "happy" || value === "angry" || value === "surprised") {
    return value;
  }
  return "neutral";
};

const emptyExpressionWeights = (): Record<VrmExpressionName, number> =>
  expressionNames.reduce(
    (weights, name) => ({
      ...weights,
      [name]: 0
    }),
    {} as Record<VrmExpressionName, number>
  );

const rotation = (bone: VrmHumanoidBoneName, x: number, y: number, z: number): VrmHumanoidRotation => ({
  bone,
  x: roundSigned(x),
  y: roundSigned(y),
  z: roundSigned(z)
});

const clamp01 = (value: number): number => clamp(value, 0, 1);

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

const roundWeight = (value: number): number => Number(clamp01(value).toFixed(3));

const roundSigned = (value: number): number => Number(value.toFixed(3));
