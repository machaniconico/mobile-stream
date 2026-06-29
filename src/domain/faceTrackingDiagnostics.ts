import type { FaceTrackingRuntimeState } from "./faceTracking";
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
  preparedPngTuberCount: number;
  activeMotionCount: number;
  rigIssueCount: number;
  rigIssueSummary: string;
  rigQualityScore: number;
  rigQualityGrade: FaceTrackingRigQualityGrade;
  summary: string;
  recommendation: string;
}

export interface FaceTrackingDiagnosticsOptions {
  now?: number | Date;
  maxRuntimeAgeMs?: number;
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
  const preparedPngTubers = visiblePngTubers.filter((source) => source.imageUri.trim());
  const activeMotionCount = visibleAvatars.filter(hasActiveMotion).length;
  const rigAnalyses = visiblePngTubers.map(createPngTuberRigAnalysis);
  const rigIssues = rigAnalyses.flatMap((analysis) => analysis.issues);
  const rigQualityScore = rigAnalyses.length > 0 ? Math.min(...rigAnalyses.map((analysis) => analysis.score)) : 0;
  const rigQualityGrade = createRigQualityGrade(rigQualityScore, rigIssues.length);
  const rigIssueSummary =
    rigIssues.length === 0
      ? "No still-image rig issues."
      : `${rigIssues.length} still-image rig issue${rigIssues.length === 1 ? "" : "s"} (${rigQualityScore}/100 ${rigQualityGrade}): ${rigIssues[0]}`;
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
      preparedPngTuberCount: preparedPngTubers.length,
      activeMotionCount,
      rigIssueCount: rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
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
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
      runtimeAgeMs,
      runtimeFresh,
      faceLandmarkConfidence,
      faceLandmarkReady,
      "Face tracking is enabled, but no visible avatar source is in the scene.",
      "Add or enable a PNGTuber source above the screen capture layer before production validation."
    );
  }

  if (visiblePngTubers.length === 0 && visibleAvatars.length > 0) {
    return createWarning(
      faceTracking,
      runtimeStatus,
      visibleAvatars.length,
      visiblePngTubers.length,
      visibleLive2D.length,
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
      runtimeAgeMs,
      runtimeFresh,
      faceLandmarkConfidence,
      faceLandmarkReady,
      "Face tracking is targeting Live2D/VRM only, but native Live2D/VRM rendering is not production-ready yet.",
      "Use a prepared PNGTuber still image for production validation until native Cubism or VRM rendering lands."
    );
  }

  if (visiblePngTubers.length > 0 && preparedPngTubers.length === 0) {
    return createWarning(
      faceTracking,
      runtimeStatus,
      visibleAvatars.length,
      visiblePngTubers.length,
      visibleLive2D.length,
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
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
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
      runtimeAgeMs,
      runtimeFresh,
      faceLandmarkConfidence,
      faceLandmarkReady,
      `Still-image avatar rig needs review: ${rigIssues[0]}`,
      "Run Auto rig on the PNGTuber source, then manually tune the face, eye, mouth, and shoulder lines before physical validation."
    );
  }

  if (faceTracking.inputMode === "simulated") {
    return createWarning(
      faceTracking,
      runtimeStatus,
      visibleAvatars.length,
      visiblePngTubers.length,
      visibleLive2D.length,
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
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
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
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
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
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
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
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
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
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
      preparedPngTubers.length,
      activeMotionCount,
      rigIssues.length,
      rigIssueSummary,
      rigQualityScore,
      rigQualityGrade,
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
    preparedPngTuberCount: preparedPngTubers.length,
    activeMotionCount,
    rigIssueCount: rigIssues.length,
    rigIssueSummary,
    rigQualityScore,
    rigQualityGrade,
    summary: `Face tracking is ready with ${preparedPngTubers.length} prepared PNGTuber source${preparedPngTubers.length === 1 ? "" : "s"}.`,
    recommendation: "Keep this tracker state with the next private iOS/Android validation run."
  };
};

const createWarning = (
  faceTracking: StudioProfile["faceTracking"],
  runtimeStatus: FaceTrackingDiagnostics["runtimeStatus"],
  visibleAvatarCount: number,
  visiblePngTuberCount: number,
  visibleLive2DCount: number,
  preparedPngTuberCount: number,
  activeMotionCount: number,
  rigIssueCount: number,
  rigIssueSummary: string,
  rigQualityScore: number,
  rigQualityGrade: FaceTrackingRigQualityGrade,
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
  preparedPngTuberCount,
  activeMotionCount,
  rigIssueCount,
  rigIssueSummary,
  rigQualityScore,
  rigQualityGrade,
  summary,
  recommendation
});

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
): { issues: string[]; score: number } => {
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
  if (rig.sliceCount < 18) {
    issues.push("rig should use at least 18 slices for production pseudo mesh deformation");
    score -= Math.min(30, (18 - rig.sliceCount) * 4);
  }
  if (rig.faceRange < 0.22 || rig.faceRange > 0.64) {
    issues.push("face range should stay within 22-64% of the illustration height");
    score -= 15;
  }
  const eyeMouthGap = rig.mouthLineY - rig.eyeLineY;
  if (eyeMouthGap < 0.1 || eyeMouthGap > 0.34) {
    issues.push("eye-to-mouth spacing should stay within 10-34% of the illustration height");
    score -= 12;
  }
  if (rig.shoulderLineY - rig.mouthLineY < 0.12) {
    issues.push("shoulder line should leave at least 12% body space below the mouth line");
    score -= 10;
  }
  return { issues, score: Math.max(0, Math.min(100, Math.round(score))) };
};

const isRigLineOrderValid = (rig: AvatarIllustrationRig, tolerance: number): boolean =>
  rig.hairLineY + tolerance < rig.eyeLineY &&
  rig.eyeLineY + tolerance < rig.mouthLineY &&
  rig.mouthLineY + tolerance < rig.shoulderLineY;

const createRigQualityGrade = (score: number, issueCount: number): FaceTrackingRigQualityGrade => {
  if (score >= 90 && issueCount === 0) {
    return "ready";
  }
  return score >= 70 ? "review" : "blocked";
};
