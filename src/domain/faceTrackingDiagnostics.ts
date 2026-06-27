import type { FaceTrackingRuntimeState } from "./faceTracking";
import type { StudioProfile } from "./profiles";
import type { AvatarIllustrationRig, SceneDocument, SceneSource } from "./scene";

export type FaceTrackingDiagnosticStatus = "pass" | "warn" | "info";

export interface FaceTrackingDiagnostics {
  status: FaceTrackingDiagnosticStatus;
  enabled: boolean;
  inputMode: StudioProfile["faceTracking"]["inputMode"];
  rigMode: StudioProfile["faceTracking"]["rigMode"];
  runtimeStatus: FaceTrackingRuntimeState["status"] | "unavailable";
  runtimeAgeMs: number | null;
  runtimeFresh: boolean;
  visibleAvatarCount: number;
  visiblePngTuberCount: number;
  visibleLive2DCount: number;
  preparedPngTuberCount: number;
  activeMotionCount: number;
  rigIssueCount: number;
  rigIssueSummary: string;
  summary: string;
  recommendation: string;
}

export interface FaceTrackingDiagnosticsOptions {
  now?: number | Date;
  maxRuntimeAgeMs?: number;
}

export const faceTrackingRuntimeMaxAgeMs = 1500;

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
  const rigIssues = visiblePngTubers.flatMap(createPngTuberRigIssues);
  const rigIssueSummary =
    rigIssues.length === 0
      ? "No still-image rig issues."
      : `${rigIssues.length} still-image rig issue${rigIssues.length === 1 ? "" : "s"}: ${rigIssues[0]}`;
  const runtimeStatus = runtime?.status ?? "unavailable";
  const maxRuntimeAgeMs = Math.max(0, options.maxRuntimeAgeMs ?? faceTrackingRuntimeMaxAgeMs);
  const runtimeAgeMs = runtime ? runtimeAge(runtime, options.now) : null;
  const runtimeFresh = runtimeAgeMs === null || runtimeAgeMs <= maxRuntimeAgeMs;

  if (!faceTracking.enabled) {
    return {
      status: "info",
      enabled: false,
      inputMode: faceTracking.inputMode,
      rigMode: faceTracking.rigMode,
      runtimeStatus,
      runtimeAgeMs,
      runtimeFresh,
      visibleAvatarCount: visibleAvatars.length,
      visiblePngTuberCount: visiblePngTubers.length,
      visibleLive2DCount: visibleLive2D.length,
      preparedPngTuberCount: preparedPngTubers.length,
      activeMotionCount,
      rigIssueCount: rigIssues.length,
      rigIssueSummary,
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
      runtimeAgeMs,
      runtimeFresh,
      "Face tracking is enabled, but no visible avatar source is in the scene.",
      "Add or enable a PNGTuber source above the screen capture layer before production validation."
    );
  }

  if (visiblePngTubers.length === 0 && visibleLive2D.length > 0) {
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
      runtimeAgeMs,
      runtimeFresh,
      "Face tracking is targeting Live2D only, but native Live2D rendering is not production-ready yet.",
      "Use a prepared PNGTuber still image for production validation until Cubism SDK integration lands."
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
      runtimeAgeMs,
      runtimeFresh,
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
      runtimeAgeMs,
      runtimeFresh,
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
      runtimeAgeMs,
      runtimeFresh,
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
      runtimeAgeMs,
      runtimeFresh,
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
      runtimeAgeMs,
      runtimeFresh,
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
      runtimeAgeMs,
      runtimeFresh,
      `Native face tracking runtime is stale by ${runtimeAgeMs ?? 0} ms.`,
      "Confirm the camera tracker is still publishing fresh frames before starting a production stream."
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
      runtimeAgeMs,
      runtimeFresh,
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
    visibleAvatarCount: visibleAvatars.length,
    visiblePngTuberCount: visiblePngTubers.length,
    visibleLive2DCount: visibleLive2D.length,
    preparedPngTuberCount: preparedPngTubers.length,
    activeMotionCount,
    rigIssueCount: rigIssues.length,
    rigIssueSummary,
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
  runtimeAgeMs: number | null,
  runtimeFresh: boolean,
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
  visibleAvatarCount,
  visiblePngTuberCount,
  visibleLive2DCount,
  preparedPngTuberCount,
  activeMotionCount,
  rigIssueCount,
  rigIssueSummary,
  summary,
  recommendation
});

const isVisibleAvatarSource = (
  source: SceneSource
): source is Extract<SceneSource, { kind: "pngtuber" | "live2d" }> =>
  source.visible && (source.kind === "pngtuber" || source.kind === "live2d");

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

const hasActiveMotion = (source: Extract<SceneSource, { kind: "pngtuber" | "live2d" }>): boolean => {
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

const createPngTuberRigIssues = (source: Extract<SceneSource, { kind: "pngtuber" }>): string[] => {
  const rig = source.illustrationRig;
  const issues: string[] = [];
  const tolerance = 0.01;
  if (!isRigLineOrderValid(rig, tolerance)) {
    issues.push("rig lines must be ordered hair < eyes < mouth < shoulders");
  }
  const faceTop = rig.faceCenterY - rig.faceRange / 2;
  const faceBottom = rig.faceCenterY + rig.faceRange / 2;
  if (rig.eyeLineY < faceTop - tolerance || rig.mouthLineY > faceBottom + tolerance) {
    issues.push("face range must cover both eye and mouth lines");
  }
  if (rig.sliceCount < 18) {
    issues.push("rig should use at least 18 slices for production pseudo mesh deformation");
  }
  return issues;
};

const isRigLineOrderValid = (rig: AvatarIllustrationRig, tolerance: number): boolean =>
  rig.hairLineY + tolerance < rig.eyeLineY &&
  rig.eyeLineY + tolerance < rig.mouthLineY &&
  rig.mouthLineY + tolerance < rig.shoulderLineY;
