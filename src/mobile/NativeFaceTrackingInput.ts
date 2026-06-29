import { NativeModules } from "react-native";
import type { FaceTrackingFrame, FaceTrackingProfile } from "../domain/faceTracking";
import type { AvatarIllustrationLandmarkAnalysis, AvatarIllustrationLandmarkPoint } from "../domain/scene";

interface NativeFaceTrackingFrame {
  yaw?: number;
  pitch?: number;
  roll?: number;
  mouthOpen?: number;
  leftBlink?: number;
  rightBlink?: number;
  smile?: number;
  browRaise?: number;
  confidence?: number;
  timestamp?: number;
  faceLandmarkAnalysis?: NativeFaceLandmarkAnalysis | null;
}

interface NativeFaceLandmarkAnalysis {
  confidence?: number;
  faceCenter?: NativeFaceLandmarkPoint | null;
  leftEye?: NativeFaceLandmarkPoint | null;
  rightEye?: NativeFaceLandmarkPoint | null;
  mouthCenter?: NativeFaceLandmarkPoint | null;
  hairLineY?: number | null;
  shoulderLineY?: number | null;
}

interface NativeFaceLandmarkPoint {
  x?: number;
  y?: number;
  confidence?: number;
}

interface LiveCasterFaceTrackerModule {
  start(optionsJson: string): Promise<boolean>;
  stop(): Promise<boolean>;
  getLatestFrame(): Promise<NativeFaceTrackingFrame | null>;
}

const nativeFaceTracker = NativeModules.LiveCasterFaceTracker as LiveCasterFaceTrackerModule | undefined;

export const canUseNativeFaceTracking = (): boolean => Boolean(nativeFaceTracker);

export class NativeFaceTrackingInput {
  private running = false;
  private polling = false;
  private retryAfter = 0;
  private latestFrame: FaceTrackingFrame | null = null;

  isAvailable(): boolean {
    return canUseNativeFaceTracking();
  }

  refresh(profile: FaceTrackingProfile, now = Date.now()): void {
    if (!nativeFaceTracker || profile.inputMode !== "native-camera" || !profile.enabled) {
      this.latestFrame = null;
      if (this.running) {
        this.stop();
      }
      return;
    }

    if (!this.running && now >= this.retryAfter) {
      this.running = true;
      void nativeFaceTracker.start(JSON.stringify({ rigMode: profile.rigMode })).catch(() => {
        this.running = false;
        this.retryAfter = Date.now() + 5_000;
      });
    }

    if (this.polling) {
      return;
    }

    this.polling = true;
    void nativeFaceTracker
      .getLatestFrame()
      .then((frame) => {
        this.latestFrame = frame ? normalizeNativeFrame(frame, now) : null;
      })
      .catch(() => {
        this.latestFrame = null;
      })
      .finally(() => {
        this.polling = false;
      });
  }

  readFrame(now = Date.now()): FaceTrackingFrame | null {
    if (!this.latestFrame || now - this.latestFrame.timestamp > 800) {
      return null;
    }
    return this.latestFrame;
  }

  stop(): void {
    this.running = false;
    this.latestFrame = null;
    if (nativeFaceTracker) {
      void nativeFaceTracker.stop().catch(() => undefined);
    }
  }
}

const normalizeNativeFrame = (frame: NativeFaceTrackingFrame, now: number): FaceTrackingFrame => ({
  yaw: finiteOr(frame.yaw, 0),
  pitch: finiteOr(frame.pitch, 0),
  roll: finiteOr(frame.roll, 0),
  mouthOpen: finiteOr(frame.mouthOpen, 0),
  leftBlink: finiteOr(frame.leftBlink, 0),
  rightBlink: finiteOr(frame.rightBlink, 0),
  smile: finiteOr(frame.smile, 0),
  browRaise: finiteOr(frame.browRaise, 0),
  confidence: finiteOr(frame.confidence, 0),
  timestamp: finiteOr(frame.timestamp, now),
  faceLandmarkAnalysis: normalizeNativeLandmarkAnalysis(frame.faceLandmarkAnalysis)
});

const finiteOr = (value: number | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const normalizeNativeLandmarkAnalysis = (
  analysis: NativeFaceLandmarkAnalysis | null | undefined
): AvatarIllustrationLandmarkAnalysis | null => {
  if (!analysis) {
    return null;
  }
  const confidence = clamp01(finiteOr(analysis.confidence, 0));
  if (confidence <= 0) {
    return null;
  }
  return {
    confidence,
    faceCenter: normalizeNativeLandmarkPoint(analysis.faceCenter),
    leftEye: normalizeNativeLandmarkPoint(analysis.leftEye),
    rightEye: normalizeNativeLandmarkPoint(analysis.rightEye),
    mouthCenter: normalizeNativeLandmarkPoint(analysis.mouthCenter),
    hairLineY: normalizeNativeY(analysis.hairLineY),
    shoulderLineY: normalizeNativeY(analysis.shoulderLineY)
  };
};

const normalizeNativeLandmarkPoint = (
  point: NativeFaceLandmarkPoint | null | undefined
): AvatarIllustrationLandmarkPoint | null => {
  if (!point) {
    return null;
  }
  const x = normalizeNativeY(point.x);
  const y = normalizeNativeY(point.y);
  if (x === null || y === null) {
    return null;
  }
  return {
    x,
    y,
    confidence: clamp01(finiteOr(point.confidence, 1))
  };
};

const normalizeNativeY = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
