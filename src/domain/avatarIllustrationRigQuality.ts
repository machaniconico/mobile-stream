import type { AvatarIllustrationRig } from "./scene";

export interface AvatarIllustrationRigQuality {
  faceTop: number;
  faceBottom: number;
  partSeparationScore: number;
  depthContinuityScore: number;
  partSeparationFactor: number;
  depthContinuityFactor: number;
  highFidelityFactor: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export const createAvatarIllustrationRigQuality = (rig: AvatarIllustrationRig): AvatarIllustrationRigQuality => {
  const faceTop = rig.faceCenterY - rig.faceRange / 2;
  const faceBottom = rig.faceCenterY + rig.faceRange / 2;
  const partSeparationScore = scoreAvatarIllustrationRigPartSeparation(rig, faceTop, faceBottom);
  const depthContinuityScore = scoreAvatarIllustrationRigDepthContinuity(rig, faceTop, faceBottom);
  const partSeparationFactor = partSeparationScore / 100;
  const depthContinuityFactor = depthContinuityScore / 100;
  return {
    faceTop,
    faceBottom,
    partSeparationScore,
    depthContinuityScore,
    partSeparationFactor,
    depthContinuityFactor,
    highFidelityFactor: Math.min(partSeparationFactor, depthContinuityFactor)
  };
};

export const scoreAvatarIllustrationRigPartSeparation = (
  rig: AvatarIllustrationRig,
  faceTop: number,
  faceBottom: number
): number => {
  const eyeMouthGap = rig.mouthLineY - rig.eyeLineY;
  const centerGap = Math.min(Math.abs(rig.faceCenterY - rig.eyeLineY), Math.abs(rig.mouthLineY - rig.faceCenterY));
  return Math.round(
    Math.min(
      scoreBand(eyeMouthGap, 0.1, 0.12, 0.24, 0.34),
      scoreBand(centerGap, 0.02, 0.04, 0.12, 0.28),
      scoreBand(rig.eyeLineY - faceTop, 0.05, 0.07, 0.18, 0.4),
      scoreBand(faceBottom - rig.mouthLineY, 0.045, 0.065, 0.18, 0.36)
    )
  );
};

export const scoreAvatarIllustrationRigDepthContinuity = (
  rig: AvatarIllustrationRig,
  faceTop: number,
  faceBottom: number
): number => {
  const hairEyeGap = rig.eyeLineY - rig.hairLineY;
  const mouthShoulderGap = rig.shoulderLineY - rig.mouthLineY;
  return Math.round(
    Math.min(
      scoreBand(hairEyeGap, 0.025, 0.03, 0.15, 0.24),
      scoreBand(mouthShoulderGap, 0.12, 0.14, 0.3, 0.42),
      scoreBand(rig.faceRange, 0.22, 0.3, 0.5, 0.64),
      scoreBand(rig.eyeLineY - faceTop, 0.05, 0.07, 0.18, 0.4),
      scoreBand(faceBottom - rig.mouthLineY, 0.045, 0.065, 0.18, 0.36),
      rig.sliceCount >= 24 ? 100 : rig.sliceCount >= 20 ? 90 : Math.max(0, Math.round((rig.sliceCount / 20) * 80))
    )
  );
};

const scoreBand = (value: number, min: number, idealMin: number, idealMax: number, max: number): number => {
  if (!Number.isFinite(value) || value <= min || value >= max) {
    return 0;
  }
  if (value >= idealMin && value <= idealMax) {
    return 100;
  }
  if (value < idealMin) {
    return Math.round(70 + ((value - min) / Math.max(idealMin - min, Number.EPSILON)) * 30);
  }
  return Math.round(70 + ((max - value) / Math.max(max - idealMax, Number.EPSILON)) * 30);
};
