import type { AvatarIllustrationRig } from "./scene";

export interface AvatarIllustrationRigQuality {
  faceTop: number;
  faceBottom: number;
  partSeparationScore: number;
  depthContinuityScore: number;
  semanticSegmentScore: number;
  partSeparationFactor: number;
  depthContinuityFactor: number;
  semanticSegmentFactor: number;
  highFidelityFactor: number;
}

export type AvatarIllustrationRigQualityGrade = "ready" | "review" | "blocked";

export interface AvatarIllustrationRigTuningSummary extends AvatarIllustrationRigQuality {
  highFidelityScore: number;
  grade: AvatarIllustrationRigQualityGrade;
  issues: string[];
}

export const createAvatarIllustrationRigQuality = (rig: AvatarIllustrationRig): AvatarIllustrationRigQuality => {
  const faceTop = rig.faceCenterY - rig.faceRange / 2;
  const faceBottom = rig.faceCenterY + rig.faceRange / 2;
  const partSeparationScore = scoreAvatarIllustrationRigPartSeparation(rig, faceTop, faceBottom);
  const depthContinuityScore = scoreAvatarIllustrationRigDepthContinuity(rig, faceTop, faceBottom);
  const semanticSegmentScore = scoreAvatarIllustrationRigSemanticSegments(rig, faceTop, faceBottom);
  const partSeparationFactor = partSeparationScore / 100;
  const depthContinuityFactor = depthContinuityScore / 100;
  const semanticSegmentFactor = semanticSegmentScore / 100;
  return {
    faceTop,
    faceBottom,
    partSeparationScore,
    depthContinuityScore,
    semanticSegmentScore,
    partSeparationFactor,
    depthContinuityFactor,
    semanticSegmentFactor,
    highFidelityFactor: Math.min(partSeparationFactor, depthContinuityFactor, semanticSegmentFactor)
  };
};

export const createAvatarIllustrationRigTuningSummary = (
  rig: AvatarIllustrationRig
): AvatarIllustrationRigTuningSummary => {
  const quality = createAvatarIllustrationRigQuality(rig);
  const issues = createAvatarIllustrationRigTuningIssues(rig, quality);
  const highFidelityScore = Math.min(
    quality.partSeparationScore,
    quality.depthContinuityScore,
    quality.semanticSegmentScore
  );
  return {
    ...quality,
    highFidelityScore,
    grade: createAvatarIllustrationRigQualityGrade(highFidelityScore, issues.length),
    issues
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

export const scoreAvatarIllustrationRigSemanticSegments = (
  rig: AvatarIllustrationRig,
  faceTop: number,
  faceBottom: number
): number => {
  const hairRegion = rig.eyeLineY - rig.hairLineY;
  const eyeMouthRegion = rig.mouthLineY - rig.eyeLineY;
  const mouthBodyRegion = rig.shoulderLineY - rig.mouthLineY;
  const eyeFaceMargin = rig.eyeLineY - faceTop;
  const mouthFaceMargin = faceBottom - rig.mouthLineY;
  const faceCenterToEye = rig.faceCenterY - rig.eyeLineY;
  const mouthToFaceCenter = rig.mouthLineY - rig.faceCenterY;
  const faceCenterBalance = Math.abs(faceCenterToEye - mouthToFaceCenter);
  return Math.round(
    Math.min(
      scoreBand(hairRegion, 0.025, 0.03, 0.16, 0.24),
      scoreBand(eyeMouthRegion, 0.1, 0.12, 0.26, 0.34),
      scoreBand(mouthBodyRegion, 0.12, 0.14, 0.32, 0.42),
      scoreBand(rig.faceRange, 0.22, 0.3, 0.5, 0.64),
      scoreBand(eyeFaceMargin, 0.05, 0.07, 0.2, 0.4),
      scoreBand(mouthFaceMargin, 0.045, 0.065, 0.2, 0.36),
      scoreBand(faceCenterBalance, -0.001, 0, 0.09, 0.22)
    )
  );
};

const createAvatarIllustrationRigTuningIssues = (
  rig: AvatarIllustrationRig,
  quality: AvatarIllustrationRigQuality
): string[] => {
  const issues: string[] = [];
  const eyeMouthGap = rig.mouthLineY - rig.eyeLineY;
  const hairEyeGap = rig.eyeLineY - rig.hairLineY;
  const mouthShoulderGap = rig.shoulderLineY - rig.mouthLineY;
  if (!(rig.hairLineY < rig.eyeLineY && rig.eyeLineY < rig.mouthLineY && rig.mouthLineY < rig.shoulderLineY)) {
    issues.push("Line order must stay hair < eyes < mouth < shoulders.");
  }
  if (rig.eyeLineY < quality.faceTop || rig.mouthLineY > quality.faceBottom) {
    issues.push("Face range must cover the eye and mouth lines.");
  }
  if (eyeMouthGap < 0.12 || eyeMouthGap > 0.34) {
    issues.push("Eye and mouth lines need 12-34% vertical separation.");
  }
  if (hairEyeGap < 0.03 || hairEyeGap > 0.24) {
    issues.push("Hair line should leave 3-24% headroom above the eyes.");
  }
  if (mouthShoulderGap < 0.14 || mouthShoulderGap > 0.42) {
    issues.push("Shoulder line should stay 14-42% below the mouth.");
  }
  if (rig.faceRange < 0.22 || rig.faceRange > 0.64) {
    issues.push("Face range should stay within 22-64% of the illustration height.");
  }
  if (rig.sliceCount < 20) {
    issues.push("Rig should use at least 20 slices for production deformation.");
  }
  if (quality.semanticSegmentScore < 70) {
    issues.push("Semantic face, eye, mouth, and body regions need clearer separation for single-image tracking.");
  }
  return issues;
};

const createAvatarIllustrationRigQualityGrade = (
  score: number,
  issueCount: number
): AvatarIllustrationRigQualityGrade => {
  if (score >= 90 && issueCount === 0) {
    return "ready";
  }
  return score >= 70 ? "review" : "blocked";
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
