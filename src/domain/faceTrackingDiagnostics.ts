import type { FaceTrackingRuntimeState } from "./faceTracking";
import { createAvatarIllustrationRigQuality } from "./avatarIllustrationRigQuality";
import { isProductionVrmRendererBackend, type NativeRuntimeComposition } from "./nativeRuntime";
import type { StudioProfile } from "./profiles";
import type { AvatarIllustrationRig, SceneDocument, SceneSource } from "./scene";

export type FaceTrackingDiagnosticStatus = "pass" | "warn" | "info";
export type FaceTrackingRigQualityGrade = "ready" | "review" | "blocked";

export interface FaceTrackingDiagnostics {
  status: FaceTrackingDiagnosticStatus;
  enabled: boolean;
  inputMode: StudioProfile["faceTracking"]["inputMode"];
  rigMode: StudioProfile["faceTracking"]["rigMode"];
  runtimeStatus: FaceTrackingRuntimeState["status"] | "unavailable";
  runtimeAgeMs: number | null;
  runtimeFresh: boolean;
  faceLandmarkConfidence?: number;
  faceLandmarkReady?: boolean;
  visibleAvatarCount: number;
  visiblePngTuberCount: number;
  visibleLive2DCount: number;
  visibleVrmCount: number;
  nativeVrmRendererReady: boolean;
  preparedPngTuberCount: number;
  activeMotionCount: number;
  rigIssueCount: number;
  rigIssueSummary: string;
  rigQualityScore: number;
  rigQualityGrade: FaceTrackingRigQualityGrade;
  rigPartSeparationScore?: number;
  rigDepthContinuityScore?: number;
  rigSemanticSegmentScore?: number;
  rigHighFidelityScore?: number;
  rigHighFidelityGrade?: FaceTrackingRigQualityGrade;
  summary: string;
  recommendation: string;
}

export interface FaceTrackingDiagnosticsOptions {
  now?: number | Date;
  maxRuntimeAgeMs?: number;
  nativeRuntimeComposition?: NativeRuntimeComposition | null;
}

export const faceTrackingRuntimeMaxAgeMs = 1500;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export const createFaceTrackingDiagnostics = (
  scene: SceneDocument,
  profile: StudioProfile,
  runtime: FaceTrackingRuntimeState | null = null,
  options: FaceTrackingDiagnosticsOptions = {}
): FaceTrackingDiagnostics => {
  const faceTracking = profile.faceTracking;
  const visibleAvatars = scene.sources.filter(isVisibleAvatarSource);
  const visiblePngTubers = visibleAvatars.filter((source) => source.kind === "pngtuber");
  const visibleLive2D = visibleAvatars.filter((source) => source.kind === "live2d");
  const visibleVrms = visibleAvatars.filter((source) => source.kind === "vrm");
  const preparedPngTubers = visiblePngTubers.filter((source) => source.imageUri.trim());
  const nativeVrmRendererReady = hasReadyNativeVrmRenderer(options.nativeRuntimeComposition, visibleVrms.length);
  const activeMotionCount = visibleAvatars.filter(hasActiveMotion).length;
  const rigAnalyses = visiblePngTubers.map(createPngTuberRigAnalysis);
  const rigIssues = rigAnalyses.flatMap((analysis) => analysis.issues);
  const stillImageRigQualityScore = rigAnalyses.length > 0 ? Math.min(...rigAnalyses.map((analysis) => analysis.score)) : 0;
  const rigQualityScore = rigAnalyses.length === 0 && nativeVrmRendererReady ? 100 : stillImageRigQualityScore;
  const rigQualityGrade =
    rigAnalyses.length === 0 && nativeVrmRendererReady ? "ready" : createRigQualityGrade(rigQualityScore, rigIssues.length);
  const rigPartSeparationScore = createAggregatedRigScore(rigAnalyses, nativeVrmRendererReady, "partSeparationScore");
  const rigDepthContinuityScore = createAggregatedRigScore(rigAnalyses, nativeVrmRendererReady, "depthContinuityScore");
  const rigSemanticSegmentScore = createAggregatedRigScore(rigAnalyses, nativeVrmRendererReady, "semanticSegmentScore");
  const rigHighFidelityScore = createAggregatedRigScore(rigAnalyses, nativeVrmRendererReady, "highFidelityScore");
  const rigHighFidelityGrade =
    rigAnalyses.length === 0 && nativeVrmRendererReady ? "ready" : createRigQualityGrade(rigHighFidelityScore, rigIssues.length);
  const rigScoreSummary = {
    rigPartSeparationScore,
    rigDepthContinuityScore,
    rigSemanticSegmentScore,
    rigHighFidelityScore,
    rigHighFidelityGrade
  };
  const rigIssueSummary =
    rigIssues.length === 0
      ? "No still-image rig issues."
      : `${rigIssues.length} still-image rig issue${rigIssues.length === 1 ? "" : "s"} (${rigQualityScore}/100 ${rigQualityGrade}, high fidelity ${rigHighFidelityScore}/100 ${rigHighFidelityGrade}, semantic segments ${rigSemanticSegmentScore}/100): ${rigIssues.join("; ")}`;
  const runtimeStatus = runtime?.status ?? "unavailable";
  const maxRuntimeAgeMs = Math.max(0, options.maxRuntimeAgeMs ?? faceTrackingRuntimeMaxAgeMs);
  const runtimeAgeMs = runtime ? runtimeAge(runtime, options.now) : null;
  const runtimeFresh = runtimeAgeMs === null || runtimeAgeMs <= maxRuntimeAgeMs;
  const faceLandmarkConfidence = clamp01(runtime?.faceLandmarkConfidence ?? 0);
  const faceLandmarkReady = faceLandmarkConfidence >= 0.55;

  if (!faceTracking.enabled) {
    return {
      status: "info",
      enabled: false,
      inputMode: faceTracking.inputMode,
      rigMode: faceTracking.rigMode,
      runtimeStatus,
      runtimeAgeMs,
      runtimeFresh,
      faceLandmarkConfidence,
      faceLandmarkReady,
      visibleAvatarCount: visibleAvatars.length,
      visiblePngTuberCount: visiblePngTubers.length,
      visibleLive2DCount: visibleLive2D.length,
      visibleVrmCount: visibleVrms.length,
      nativeVrmRendererReady,
      preparedPngTuberCount: preparedPngTubers.length,
      activeMotionCount,
      rigIssueCount: rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
      ...rigScoreSummary,
      summary: "Face tracking is disabled.",
      recommendation: "Enable face tracking when validating VTuber avatar motion for production streams."
    };
  }

  if (visibleAvatars.length === 0) {
    return createWarning(
      faceTracking,
      runtimeStatus,
      visibleAvatars.length,
      visiblePngTubers.length,
      visibleLive2D.length,
      visibleVrms.length,
      nativeVrmRendererReady,
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
      rigScoreSummary,
      runtimeAgeMs,
      runtimeFresh,
      faceLandmarkConfidence,
      faceLandmarkReady,
      "Face tracking is enabled, but no visible avatar source is in the scene.",
      "Add or enable a PNGTuber source above the screen capture layer before production validation."
    );
  }

  if (visiblePngTubers.length === 0 && visibleAvatars.length > 0 && (visibleLive2D.length > 0 || !nativeVrmRendererReady)) {
    return createWarning(
      faceTracking,
      runtimeStatus,
      visibleAvatars.length,
      visiblePngTubers.length,
      visibleLive2D.length,
      visibleVrms.length,
      nativeVrmRendererReady,
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
      rigScoreSummary,
      runtimeAgeMs,
      runtimeFresh,
      faceLandmarkConfidence,
      faceLandmarkReady,
      visibleLive2D.length > 0
        ? "Face tracking is targeting Live2D, but native Cubism rendering is not production-ready yet."
        : "Face tracking is targeting VRM/VRoid, but native VRM renderer proof is not ready yet.",
      visibleLive2D.length > 0
        ? "Use a prepared PNGTuber still image for production validation until native Cubism rendering lands."
        : "Run a physical iOS/Android validation with the VRM renderer loaded, model rendered, and pose payload applied."
    );
  }

  if (visiblePngTubers.length > 0 && preparedPngTubers.length === 0) {
    return createWarning(
      faceTracking,
      runtimeStatus,
      visibleAvatars.length,
      visiblePngTubers.length,
      visibleLive2D.length,
      visibleVrms.length,
      nativeVrmRendererReady,
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
      rigScoreSummary,
      runtimeAgeMs,
      runtimeFresh,
      faceLandmarkConfidence,
      faceLandmarkReady,
      "Face tracking is enabled, but visible PNGTuber sources do not have prepared still-image assets.",
      "Pick and prepare a PNGTuber still image so native iOS/Android compositors can render avatar motion."
    );
  }

  if (rigIssues.length > 0) {
    return createWarning(
      faceTracking,
      runtimeStatus,
      visibleAvatars.length,
      visiblePngTubers.length,
      visibleLive2D.length,
      visibleVrms.length,
      nativeVrmRendererReady,
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
      rigScoreSummary,
      runtimeAgeMs,
      runtimeFresh,
      faceLandmarkConfidence,
      faceLandmarkReady,
      `Still-image avatar rig needs review: ${rigIssues[0]}`,
      "Run Auto rig on the PNGTuber source, then manually tune the face, eye, mouth, and shoulder lines before physical validation."
    );
  }

  if (rigAnalyses.length > 0 && rigHighFidelityGrade !== "ready") {
    return createWarning(
      faceTracking,
      runtimeStatus,
      visibleAvatars.length,
      visiblePngTubers.length,
      visibleLive2D.length,
      visibleVrms.length,
      nativeVrmRendererReady,
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
      rigScoreSummary,
      runtimeAgeMs,
      runtimeFresh,
      faceLandmarkConfidence,
      faceLandmarkReady,
      `Still-image avatar rig high-fidelity score is ${rigHighFidelityScore}/100 ${rigHighFidelityGrade}.`,
      "Tune hair, eye, mouth, shoulder, face range, semantic face/body segment coverage, and slice count until parts, pseudo-depth continuity, and semantic segments reach production-ready scores."
    );
  }

  if (faceTracking.inputMode === "simulated") {
    return createWarning(
      faceTracking,
      runtimeStatus,
      visibleAvatars.length,
      visiblePngTubers.length,
      visibleLive2D.length,
      visibleVrms.length,
      nativeVrmRendererReady,
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
      rigScoreSummary,
      runtimeAgeMs,
      runtimeFresh,
      faceLandmarkConfidence,
      faceLandmarkReady,
      "Face tracking is using simulated input.",
      "Switch to native camera input and verify tracking on a physical mobile device before release validation."
    );
  }

  if (runtimeStatus === "lost") {
    return createWarning(
      faceTracking,
      runtimeStatus,
      visibleAvatars.length,
      visiblePngTubers.length,
      visibleLive2D.length,
      visibleVrms.length,
      nativeVrmRendererReady,
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
      rigScoreSummary,
      runtimeAgeMs,
      runtimeFresh,
      faceLandmarkConfidence,
      faceLandmarkReady,
      "Native face tracking is enabled, but the latest face state is lost.",
      "Reposition the camera/lighting and confirm tracking stays stable before starting a production stream."
    );
  }

  if (runtimeStatus === "unavailable") {
    return createWarning(
      faceTracking,
      runtimeStatus,
      visibleAvatars.length,
      visiblePngTubers.length,
      visibleLive2D.length,
      visibleVrms.length,
      nativeVrmRendererReady,
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
      rigScoreSummary,
      runtimeAgeMs,
      runtimeFresh,
      faceLandmarkConfidence,
      faceLandmarkReady,
      "Native face tracking has not reported runtime status yet.",
      "Open this scene on iOS/Android and confirm the tracker reads tracking before production validation."
    );
  }

  if (!runtimeFresh) {
    return createWarning(
      faceTracking,
      runtimeStatus,
      visibleAvatars.length,
      visiblePngTubers.length,
      visibleLive2D.length,
      visibleVrms.length,
      nativeVrmRendererReady,
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
      rigScoreSummary,
      runtimeAgeMs,
      runtimeFresh,
      faceLandmarkConfidence,
      faceLandmarkReady,
      `Native face tracking runtime is stale by ${runtimeAgeMs ?? 0} ms.`,
      "Confirm the camera tracker is still publishing fresh frames before starting a production stream."
    );
  }

  if (!faceLandmarkReady) {
    return createWarning(
      faceTracking,
      runtimeStatus,
      visibleAvatars.length,
      visiblePngTubers.length,
      visibleLive2D.length,
      visibleVrms.length,
      nativeVrmRendererReady,
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
      rigScoreSummary,
      runtimeAgeMs,
      runtimeFresh,
      faceLandmarkConfidence,
      faceLandmarkReady,
      `Native face tracking is reading, but landmark confidence is ${Math.round(faceLandmarkConfidence * 100)}%.`,
      "Improve camera framing/lighting and repeat validation until native face landmark confidence is ready."
    );
  }

  if (activeMotionCount === 0) {
    return createWarning(
      faceTracking,
      runtimeStatus,
      visibleAvatars.length,
      visiblePngTubers.length,
      visibleLive2D.length,
      visibleVrms.length,
      nativeVrmRendererReady,
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
      rigScoreSummary,
      runtimeAgeMs,
      runtimeFresh,
      faceLandmarkConfidence,
      faceLandmarkReady,
      "Native face tracking is reading, but no visible avatar source has applied motion yet.",
      "Confirm the prepared PNGTuber moves with head, blink, and mouth input during physical validation."
    );
  }

  return {
    status: "pass",
    enabled: true,
    inputMode: faceTracking.inputMode,
    rigMode: faceTracking.rigMode,
    runtimeStatus,
    runtimeAgeMs,
    runtimeFresh,
    faceLandmarkConfidence,
    faceLandmarkReady,
    visibleAvatarCount: visibleAvatars.length,
    visiblePngTuberCount: visiblePngTubers.length,
    visibleLive2DCount: visibleLive2D.length,
    visibleVrmCount: visibleVrms.length,
    nativeVrmRendererReady,
    preparedPngTuberCount: preparedPngTubers.length,
    activeMotionCount,
    rigIssueCount: rigIssues.length,
    rigIssueSummary,
    rigQualityScore,
    rigQualityGrade,
    ...rigScoreSummary,
    summary: createReadySummary(preparedPngTubers.length, visibleVrms.length, nativeVrmRendererReady),
    recommendation: "Keep this tracker state with the next private iOS/Android validation run."
  };
};

const createWarning = (
  faceTracking: StudioProfile["faceTracking"],
  runtimeStatus: FaceTrackingDiagnostics["runtimeStatus"],
  visibleAvatarCount: number,
  visiblePngTuberCount: number,
  visibleLive2DCount: number,
  visibleVrmCount: number,
  nativeVrmRendererReady: boolean,
  preparedPngTuberCount: number,
  activeMotionCount: number,
  rigIssueCount: number,
  rigIssueSummary: string,
  rigQualityScore: number,
  rigQualityGrade: FaceTrackingRigQualityGrade,
  rigScoreSummary: Pick<
    FaceTrackingDiagnostics,
    | "rigPartSeparationScore"
    | "rigDepthContinuityScore"
    | "rigSemanticSegmentScore"
    | "rigHighFidelityScore"
    | "rigHighFidelityGrade"
  >,
  runtimeAgeMs: number | null,
  runtimeFresh: boolean,
  faceLandmarkConfidence: number,
  faceLandmarkReady: boolean,
  summary: string,
  recommendation: string
): FaceTrackingDiagnostics => ({
  status: "warn",
  enabled: true,
  inputMode: faceTracking.inputMode,
  rigMode: faceTracking.rigMode,
  runtimeStatus,
  runtimeAgeMs,
  runtimeFresh,
  faceLandmarkConfidence,
  faceLandmarkReady,
  visibleAvatarCount,
  visiblePngTuberCount,
  visibleLive2DCount,
  visibleVrmCount,
  nativeVrmRendererReady,
  preparedPngTuberCount,
  activeMotionCount,
  rigIssueCount,
  rigIssueSummary,
  rigQualityScore,
  rigQualityGrade,
  ...rigScoreSummary,
  summary,
  recommendation
});

const hasReadyNativeVrmRenderer = (
  composition: NativeRuntimeComposition | null | undefined,
  visibleVrmCount: number
): boolean => {
  if (visibleVrmCount <= 0 || !composition || (composition.vrmSourceCount ?? 0) <= 0) {
    return false;
  }

  return (
    composition.vrmRendererStatus === "ready" &&
    (isProductionVrmRendererBackend("ios", composition.vrmRendererBackend) ||
      isProductionVrmRendererBackend("android", composition.vrmRendererBackend)) &&
    (composition.vrmSourceCount ?? 0) >= visibleVrmCount &&
    (composition.vrmRenderedSourceCount ?? 0) >= visibleVrmCount &&
    (composition.vrmRenderMissingCount ?? 0) === 0 &&
    (composition.vrmRenderFailureCount ?? 0) === 0 &&
    (composition.vrmActivePoseCount ?? 0) >= visibleVrmCount &&
    (composition.vrmMissingPoseCount ?? 0) === 0 &&
    (composition.vrmModelLoadedCount ?? 0) > 0 &&
    (composition.vrmHumanoidBoneCount ?? 0) > 0 &&
    (composition.vrmExpressionCount ?? 0) > 0 &&
    (composition.vrmMeshPrimitiveCount ?? 0) > 0 &&
    (composition.vrmSkinnedMeshPrimitiveCount ?? 0) > 0 &&
    (composition.vrmSkinJointCount ?? 0) > 0 &&
    (composition.vrmPositionAccessorCount ?? 0) > 0 &&
    (composition.vrmVertexCount ?? 0) > 0 &&
    (composition.vrmSkinningAttributePrimitiveCount ?? 0) >= (composition.vrmSkinnedMeshPrimitiveCount ?? 0) &&
    (composition.vrmTrianglePrimitiveCount ?? 0) >= (composition.vrmMeshPrimitiveCount ?? 0) &&
    (composition.vrmUnsupportedPrimitiveModeCount ?? 0) === 0 &&
    (composition.vrmUnsupportedImageMimeCount ?? 0) === 0 &&
    ((composition.vrmImageCount ?? 0) === 0 || (composition.vrmTexcoordAccessorCount ?? 0) > 0) &&
    (composition.vrmPoseBoneUnsupportedCount ?? 0) === 0 &&
    (composition.vrmPoseExpressionUnsupportedCount ?? 0) === 0
  );
};

const createReadySummary = (
  preparedPngTuberCount: number,
  visibleVrmCount: number,
  nativeVrmRendererReady: boolean
): string => {
  if (preparedPngTuberCount > 0) {
    return `Face tracking is ready with ${preparedPngTuberCount} prepared PNGTuber source${preparedPngTuberCount === 1 ? "" : "s"}.`;
  }
  if (visibleVrmCount > 0 && nativeVrmRendererReady) {
    return `Face tracking is ready with ${visibleVrmCount} native-rendered VRM/VRoid source${visibleVrmCount === 1 ? "" : "s"}.`;
  }
  return "Face tracking is ready.";
};

const isVisibleAvatarSource = (
  source: SceneSource
): source is Extract<SceneSource, { kind: "pngtuber" | "live2d" | "vrm" }> =>
  source.visible && (source.kind === "pngtuber" || source.kind === "live2d" || source.kind === "vrm");

const runtimeAge = (runtime: FaceTrackingRuntimeState, now: FaceTrackingDiagnosticsOptions["now"]): number | null => {
  if (now === undefined) {
    return null;
  }
  const nowMs = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(nowMs) || !Number.isFinite(runtime.lastFrameAt)) {
    return null;
  }
  return Math.max(0, Math.round(nowMs - runtime.lastFrameAt));
};

const hasActiveMotion = (source: Extract<SceneSource, { kind: "pngtuber" | "live2d" | "vrm" }>): boolean => {
  const motion = source.motion;
  return (
    motion.confidence > 0.05 ||
    Math.abs(motion.headYaw) > 0.02 ||
    Math.abs(motion.headPitch) > 0.02 ||
    Math.abs(motion.headRoll) > 0.02 ||
    Math.abs(motion.headX) > 0.002 ||
    Math.abs(motion.headY) > 0.002 ||
    Math.abs(motion.bodyLean) > 0.02 ||
    Math.abs(motion.bodyBounce) > 0.002 ||
    Math.abs(motion.breathing) > 0.002
  );
};

const createPngTuberRigAnalysis = (
  source: Extract<SceneSource, { kind: "pngtuber" }>
): {
  issues: string[];
  score: number;
  partSeparationScore: number;
  depthContinuityScore: number;
  semanticSegmentScore: number;
  highFidelityScore: number;
} => {
  const rig = source.illustrationRig;
  const issues: string[] = [];
  const tolerance = 0.01;
  let score = 100;
  if (!isRigLineOrderValid(rig, tolerance)) {
    issues.push("rig lines must be ordered hair < eyes < mouth < shoulders");
    score -= 35;
  }
  const faceTop = rig.faceCenterY - rig.faceRange / 2;
  const faceBottom = rig.faceCenterY + rig.faceRange / 2;
  if (rig.eyeLineY < faceTop - tolerance || rig.mouthLineY > faceBottom + tolerance) {
    issues.push("face range must cover both eye and mouth lines");
    score -= 25;
  }
  if (rig.sliceCount < 20) {
    issues.push("rig should use at least 20 slices for production pseudo mesh deformation");
    score -= Math.min(30, (20 - rig.sliceCount) * 4);
  }
  if (rig.faceRange < 0.22 || rig.faceRange > 0.64) {
    issues.push("face range should stay within 22-64% of the illustration height");
    score -= 15;
  }
  const eyeMouthGap = rig.mouthLineY - rig.eyeLineY;
  const rigQuality = createAvatarIllustrationRigQuality(rig);
  const partSeparationScore = rigQuality.partSeparationScore;
  const depthContinuityScore = rigQuality.depthContinuityScore;
  const semanticSegmentScore = rigQuality.semanticSegmentScore;
  if (eyeMouthGap < 0.1 || eyeMouthGap > 0.34) {
    issues.push("eye-to-mouth spacing should stay within 10-34% of the illustration height");
    score -= 12;
  }
  if (eyeMouthGap >= 0.1 && eyeMouthGap < 0.12) {
    issues.push("eye and mouth lines need at least 12% separation for independent blink and mouth deformation");
    score -= 8;
  }
  if (rig.shoulderLineY - rig.mouthLineY < 0.12) {
    issues.push("shoulder line should leave at least 12% body space below the mouth line");
    score -= 10;
  }
  const hairEyeGap = rig.eyeLineY - rig.hairLineY;
  if (hairEyeGap < 0.025) {
    issues.push("hair-to-eye spacing should leave at least 2.5% headroom for blink and hair sway");
    score -= 10;
  }
  if (hairEyeGap > 0.24) {
    issues.push("hair-to-eye spacing should stay below 24% of the illustration height");
    score -= 8;
  }
  const mouthShoulderGap = rig.shoulderLineY - rig.mouthLineY;
  if (mouthShoulderGap > 0.42) {
    issues.push("mouth-to-shoulder spacing should stay below 42% so body follow-through stays anchored");
    score -= 8;
  }
  if (rig.faceCenterY <= rig.eyeLineY + 0.02 || rig.faceCenterY >= rig.mouthLineY - 0.02) {
    issues.push("face center should stay between eye and mouth lines for stable 2.5D rotation");
    score -= 12;
  }
  if (rig.eyeLineY - faceTop < 0.05 || faceBottom - rig.mouthLineY < 0.045) {
    issues.push("face range should leave deformation margin above eyes and below mouth");
    score -= 10;
  }
  if (semanticSegmentScore < 70) {
    issues.push("semantic face, eye, mouth, and body segments need clearer vertical coverage for IRIAM-style auto-rigging");
    score -= 10;
  }
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    issues,
    score: normalizedScore,
    partSeparationScore,
    depthContinuityScore,
    semanticSegmentScore,
    highFidelityScore: Math.min(normalizedScore, partSeparationScore, depthContinuityScore, semanticSegmentScore)
  };
};

const isRigLineOrderValid = (rig: AvatarIllustrationRig, tolerance: number): boolean =>
  rig.hairLineY + tolerance < rig.eyeLineY &&
  rig.eyeLineY + tolerance < rig.mouthLineY &&
  rig.mouthLineY + tolerance < rig.shoulderLineY;

const createAggregatedRigScore = (
  analyses: ReturnType<typeof createPngTuberRigAnalysis>[],
  nativeVrmRendererReady: boolean,
  field: "partSeparationScore" | "depthContinuityScore" | "semanticSegmentScore" | "highFidelityScore"
): number => {
  if (analyses.length === 0) {
    return nativeVrmRendererReady ? 100 : 0;
  }
  return Math.min(...analyses.map((analysis) => analysis[field]));
};

const createRigQualityGrade = (score: number, issueCount: number): FaceTrackingRigQualityGrade => {
  if (score >= 90 && issueCount === 0) {
    return "ready";
  }
  return score >= 70 ? "review" : "blocked";
};
