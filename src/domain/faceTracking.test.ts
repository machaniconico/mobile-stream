import { describe, expect, it } from "vitest";
import {
  applyFaceTrackingRuntime,
  calibrateFaceTrackingProfile,
  createFaceTrackingRuntimeState,
  createLostFaceTrackingFrame,
  createSimulatedFaceTrackingFrame,
  defaultFaceTrackingProfile,
  normalizeFaceTrackingProfile,
  updateFaceTrackingRuntime
} from "./faceTracking";
import { createDefaultScene } from "./scene";

describe("face tracking", () => {
  it("normalizes persisted tracking settings into supported ranges", () => {
    const profile = normalizeFaceTrackingProfile({
      enabled: true,
      inputMode: "native-camera",
      rigMode: "layered-2d",
      trackingStrength: 4,
      smoothing: -2,
      deadZone: 2,
      maxMotionStep: 0,
      lostReturnSpeed: 8,
      illustrationDeform: 8,
      hairSway: -2,
      eyeDeform: 3,
      mouthDeform: -1,
      mouthSensitivity: 9,
      blinkSensitivity: -1,
      neutralYaw: 3
    });

    expect(profile.enabled).toBe(true);
    expect(profile.inputMode).toBe("native-camera");
    expect(profile.rigMode).toBe("layered-2d");
    expect(profile.trackingStrength).toBe(1);
    expect(profile.smoothing).toBe(0);
    expect(profile.deadZone).toBe(0.2);
    expect(profile.maxMotionStep).toBe(0.04);
    expect(profile.lostReturnSpeed).toBe(1);
    expect(profile.illustrationDeform).toBe(1);
    expect(profile.hairSway).toBe(0);
    expect(profile.eyeDeform).toBe(1);
    expect(profile.mouthDeform).toBe(0);
    expect(profile.mouthSensitivity).toBe(2);
    expect(profile.blinkSensitivity).toBe(0.2);
    expect(profile.neutralYaw).toBe(1);
  });

  it("updates runtime state from a face frame with smoothing and auto expression", () => {
    const profile = {
      ...defaultFaceTrackingProfile,
      enabled: true,
      smoothing: 0,
      trackingStrength: 1,
      maxMotionStep: 1,
      expressionSensitivity: 1
    };
    const runtime = updateFaceTrackingRuntime(
      createFaceTrackingRuntimeState(1_000),
      {
        yaw: 0.5,
        pitch: -0.25,
        roll: 0.2,
        mouthOpen: 0.72,
        leftBlink: 0.9,
        rightBlink: 0.8,
        smile: 0.95,
        browRaise: 0.3,
        confidence: 0.96,
        timestamp: 1_120
      },
      profile,
      1_120
    );

    expect(runtime.status).toBe("tracking");
    expect(runtime.yaw).toBeGreaterThan(0.3);
    expect(runtime.pitch).toBeLessThan(-0.1);
    expect(runtime.mouthOpen).toBeGreaterThan(0.6);
    expect(runtime.blink).toBeGreaterThan(0.7);
    expect(runtime.expression).toBe("happy");
  });

  it("retains native semantic landmark confidence on the tracking runtime", () => {
    const profile = {
      ...defaultFaceTrackingProfile,
      enabled: true,
      smoothing: 0,
      trackingStrength: 1,
      maxMotionStep: 1
    };
    const runtime = updateFaceTrackingRuntime(
      createFaceTrackingRuntimeState(1_000),
      {
        yaw: 0.2,
        pitch: 0.1,
        roll: 0,
        mouthOpen: 0.42,
        leftBlink: 0.1,
        rightBlink: 0.12,
        smile: 0.4,
        browRaise: 0.2,
        confidence: 0.88,
        timestamp: 1_120,
        faceLandmarkAnalysis: {
          confidence: 0.84,
          faceCenter: { x: 0.5, y: 0.46, confidence: 0.84 },
          leftEye: { x: 0.42, y: 0.36, confidence: 0.84 },
          rightEye: { x: 0.58, y: 0.36, confidence: 0.84 },
          mouthCenter: { x: 0.5, y: 0.58, confidence: 0.84 },
          hairLineY: 0.12,
          shoulderLineY: 0.9
        }
      },
      profile,
      1_120
    );

    expect(runtime.status).toBe("tracking");
    expect(runtime.faceLandmarkConfidence).toBeCloseTo(0.7728, 4);
  });

  it("filters small pose jitter with a neutral dead zone", () => {
    const profile = {
      ...defaultFaceTrackingProfile,
      enabled: true,
      smoothing: 0,
      deadZone: 0.08,
      maxMotionStep: 1
    };
    const runtime = updateFaceTrackingRuntime(
      createFaceTrackingRuntimeState(1_000),
      {
        yaw: 0.04,
        pitch: -0.05,
        roll: 0.03,
        mouthOpen: 0.1,
        leftBlink: 0,
        rightBlink: 0,
        smile: 0.2,
        browRaise: 0.2,
        confidence: 0.9,
        timestamp: 1_000
      },
      profile,
      1_000
    );

    expect(runtime.yaw).toBe(0);
    expect(runtime.pitch).toBe(0);
    expect(runtime.roll).toBe(0);
  });

  it("limits sudden pose jumps from single noisy frames", () => {
    const profile = {
      ...defaultFaceTrackingProfile,
      enabled: true,
      smoothing: 0,
      deadZone: 0,
      maxMotionStep: 0.18
    };
    const runtime = updateFaceTrackingRuntime(
      createFaceTrackingRuntimeState(1_000),
      {
        yaw: 1,
        pitch: -1,
        roll: 1,
        mouthOpen: 1,
        leftBlink: 1,
        rightBlink: 1,
        smile: 1,
        browRaise: 1,
        confidence: 0.98,
        timestamp: 1_000
      },
      profile,
      1_000
    );

    expect(runtime.yaw).toBeCloseTo(0.18);
    expect(runtime.pitch).toBeCloseTo(-0.18);
    expect(runtime.roll).toBeCloseTo(0.18);
    expect(runtime.mouthOpen).toBeGreaterThan(runtime.yaw);
  });

  it("returns toward neutral when native camera tracking is lost", () => {
    const profile = {
      ...defaultFaceTrackingProfile,
      enabled: true,
      smoothing: 0,
      deadZone: 0,
      lostReturnSpeed: 0.5,
      maxMotionStep: 1
    };
    const current = {
      ...createFaceTrackingRuntimeState(2_000),
      status: "tracking" as const,
      yaw: 0.8,
      pitch: -0.6,
      roll: 0.4,
      confidence: 0.95
    };
    const runtime = updateFaceTrackingRuntime(current, createLostFaceTrackingFrame(2_160), profile, 2_160);

    expect(runtime.status).toBe("lost");
    expect(runtime.yaw).toBeGreaterThan(0);
    expect(runtime.yaw).toBeLessThan(current.yaw);
    expect(runtime.pitch).toBeLessThan(0);
    expect(runtime.pitch).toBeGreaterThan(current.pitch);
    expect(runtime.confidence).toBeLessThan(current.confidence);
  });

  it("applies face motion to avatar sources without mutating other source kinds", () => {
    const profile = {
      ...defaultFaceTrackingProfile,
      enabled: true,
      smoothing: 0,
      trackingStrength: 1,
      headRange: 1,
      maxMotionStep: 1,
      bodyRange: 1,
      illustrationDeform: 1,
      hairSway: 1,
      eyeDeform: 1,
      mouthDeform: 1
    };
    const runtime = updateFaceTrackingRuntime(
      createFaceTrackingRuntimeState(2_000),
      createSimulatedFaceTrackingFrame(2_160, profile),
      profile,
      2_160
    );
    const scene = createDefaultScene();
    const updated = applyFaceTrackingRuntime(scene, runtime, profile);
    const avatar = updated.sources.find((source) => source.kind === "pngtuber");
    const screen = updated.sources.find((source) => source.kind === "screen");

    expect(avatar?.kind).toBe("pngtuber");
    expect(avatar?.motion.confidence).toBeGreaterThan(0.5);
    expect(avatar?.motion.headYaw).not.toBe(0);
    expect(avatar?.motion.meshWarp).not.toBe(0);
    expect(avatar?.motion.depthTilt).toBeGreaterThan(0);
    expect(avatar?.motion.hairSway).not.toBe(0);
    expect(avatar?.motion.eyeSquint).toBeGreaterThanOrEqual(0);
    expect(avatar?.motion.mouthDeform).toBeGreaterThan(0);
    expect(avatar?.mouthOpen).toBeGreaterThan(0);
    expect(screen).toEqual(scene.sources.find((source) => source.kind === "screen"));
  });

  it("lets the illustration warp control disable pseudo mesh deformation", () => {
    const profile = {
      ...defaultFaceTrackingProfile,
      enabled: true,
      bodyRange: 1,
      illustrationDeform: 0,
      hairSway: 1
    };
    const runtime = {
      ...createFaceTrackingRuntimeState(2_000),
      status: "tracking" as const,
      yaw: 0.6,
      pitch: -0.4,
      roll: 0.5,
      mouthOpen: 0.7,
      blink: 0.2,
      confidence: 0.94
    };
    const updated = applyFaceTrackingRuntime(createDefaultScene(), runtime, profile);
    const avatar = updated.sources.find((source) => source.kind === "pngtuber");

    expect(avatar?.motion.depthTilt).toBe(0);
    expect(avatar?.motion.meshWarp).toBe(0);
    expect(avatar?.motion.hairSway).not.toBe(0);
  });

  it("uses inferred illustration rig landmarks to tune still-image motion", () => {
    const profile = {
      ...defaultFaceTrackingProfile,
      enabled: true,
      headRange: 1,
      bodyRange: 1,
      illustrationDeform: 1,
      hairSway: 1,
      mouthDeform: 1
    };
    const runtime = {
      ...createFaceTrackingRuntimeState(2_000),
      status: "tracking" as const,
      yaw: 0.48,
      pitch: -0.22,
      roll: 0.36,
      mouthOpen: 0.72,
      blink: 0.2,
      confidence: 0.96
    };
    const scene = createDefaultScene();
    const closeUpScene = {
      ...scene,
      sources: scene.sources.map((source) =>
        source.kind === "pngtuber"
          ? {
              ...source,
              illustrationRig: {
                ...source.illustrationRig,
                faceRange: 0.58,
                hairLineY: 0.06,
                shoulderLineY: 0.9,
                eyeLineY: 0.34,
                mouthLineY: 0.66
              }
            }
          : source
      )
    };
    const fullBodyScene = {
      ...scene,
      sources: scene.sources.map((source) =>
        source.kind === "pngtuber"
          ? {
              ...source,
              illustrationRig: {
                ...source.illustrationRig,
                faceRange: 0.12,
                hairLineY: 0.54,
                shoulderLineY: 0.46,
                eyeLineY: 0.32,
                mouthLineY: 0.4
              }
            }
          : source
      )
    };

    const closeUpAvatar = applyFaceTrackingRuntime(closeUpScene, runtime, profile).sources.find(
      (source) => source.kind === "pngtuber"
    );
    const fullBodyAvatar = applyFaceTrackingRuntime(fullBodyScene, runtime, profile).sources.find(
      (source) => source.kind === "pngtuber"
    );

    expect(Math.abs(closeUpAvatar?.motion.meshWarp ?? 0)).toBeGreaterThan(Math.abs(fullBodyAvatar?.motion.meshWarp ?? 0));
    expect(Math.abs(closeUpAvatar?.motion.hairSway ?? 0)).toBeGreaterThan(Math.abs(fullBodyAvatar?.motion.hairSway ?? 0));
    expect(Math.abs(closeUpAvatar?.motion.shoulderSway ?? 0)).toBeGreaterThan(Math.abs(fullBodyAvatar?.motion.shoulderSway ?? 0));
    expect(closeUpAvatar?.motion.mouthDeform).toBeGreaterThan(fullBodyAvatar?.motion.mouthDeform ?? 0);
  });

  it("attenuates still-image deformation when rig part separation and depth continuity are poor", () => {
    const profile = {
      ...defaultFaceTrackingProfile,
      enabled: true,
      headRange: 1,
      bodyRange: 1,
      illustrationDeform: 1,
      hairSway: 1,
      eyeDeform: 1,
      mouthDeform: 1
    };
    const runtime = {
      ...createFaceTrackingRuntimeState(2_000),
      status: "tracking" as const,
      yaw: 0.5,
      pitch: -0.25,
      roll: 0.42,
      mouthOpen: 0.74,
      blink: 0.8,
      confidence: 0.96
    };
    const scene = createDefaultScene();
    const readyRigScene = {
      ...scene,
      sources: scene.sources.map((source) =>
        source.kind === "pngtuber"
          ? {
              ...source,
              illustrationRig: {
                ...source.illustrationRig,
                faceCenterY: 0.46,
                faceRange: 0.34,
                hairLineY: 0.22,
                eyeLineY: 0.35,
                mouthLineY: 0.52,
                shoulderLineY: 0.78,
                sliceCount: 24
              }
            }
          : source
      )
    };
    const poorRigScene = {
      ...scene,
      sources: scene.sources.map((source) =>
        source.kind === "pngtuber"
          ? {
              ...source,
              illustrationRig: {
                ...source.illustrationRig,
                faceCenterY: 0.46,
                faceRange: 0.34,
                hairLineY: 0.345,
                eyeLineY: 0.35,
                mouthLineY: 0.43,
                shoulderLineY: 0.5,
                sliceCount: 12
              }
            }
          : source
      )
    };

    const readyAvatar = applyFaceTrackingRuntime(readyRigScene, runtime, profile).sources.find(
      (source) => source.kind === "pngtuber"
    );
    const poorAvatar = applyFaceTrackingRuntime(poorRigScene, runtime, profile).sources.find(
      (source) => source.kind === "pngtuber"
    );

    expect(readyAvatar?.motion.depthTilt).toBeGreaterThan(poorAvatar?.motion.depthTilt ?? 0);
    expect(Math.abs(readyAvatar?.motion.meshWarp ?? 0)).toBeGreaterThan(Math.abs(poorAvatar?.motion.meshWarp ?? 0));
    expect(readyAvatar?.motion.eyeSquint).toBeGreaterThan(poorAvatar?.motion.eyeSquint ?? 0);
    expect(readyAvatar?.motion.mouthDeform).toBeGreaterThan(poorAvatar?.motion.mouthDeform ?? 0);
    expect(Math.abs(readyAvatar?.motion.hairSway ?? 0)).toBeGreaterThan(Math.abs(poorAvatar?.motion.hairSway ?? 0));
    expect(Math.abs(readyAvatar?.motion.shoulderSway ?? 0)).toBeGreaterThan(
      Math.abs(poorAvatar?.motion.shoulderSway ?? 0)
    );
  });

  it("attenuates localized still-image deformation when horizontal face anchors are unbalanced", () => {
    const profile = {
      ...defaultFaceTrackingProfile,
      enabled: true,
      headRange: 1,
      bodyRange: 1,
      illustrationDeform: 1,
      eyeDeform: 1,
      mouthDeform: 1
    };
    const runtime = {
      ...createFaceTrackingRuntimeState(2_000),
      status: "tracking" as const,
      yaw: 0.56,
      pitch: -0.12,
      roll: 0.24,
      mouthOpen: 0.76,
      blink: 0.8,
      confidence: 0.96
    };
    const scene = createDefaultScene();
    const readyRigScene = {
      ...scene,
      sources: scene.sources.map((source) =>
        source.kind === "pngtuber"
          ? {
              ...source,
              illustrationRig: {
                ...source.illustrationRig,
                faceCenterX: 0.5,
                leftEyeX: 0.42,
                rightEyeX: 0.58,
                mouthCenterX: 0.5,
                faceCenterY: 0.47,
                faceRange: 0.38,
                hairLineY: 0.22,
                eyeLineY: 0.35,
                mouthLineY: 0.52,
                shoulderLineY: 0.78,
                sliceCount: 24
              }
            }
          : source
      )
    };
    const unbalancedRigScene = {
      ...scene,
      sources: scene.sources.map((source) =>
        source.kind === "pngtuber"
          ? {
              ...source,
              illustrationRig: {
                ...source.illustrationRig,
                faceCenterX: 0.78,
                leftEyeX: 0.47,
                rightEyeX: 0.53,
                mouthCenterX: 0.84,
                faceCenterY: 0.47,
                faceRange: 0.38,
                hairLineY: 0.22,
                eyeLineY: 0.35,
                mouthLineY: 0.52,
                shoulderLineY: 0.78,
                sliceCount: 24
              }
            }
          : source
      )
    };

    const readyAvatar = applyFaceTrackingRuntime(readyRigScene, runtime, profile).sources.find(
      (source) => source.kind === "pngtuber"
    );
    const unbalancedAvatar = applyFaceTrackingRuntime(unbalancedRigScene, runtime, profile).sources.find(
      (source) => source.kind === "pngtuber"
    );

    expect(Math.abs(readyAvatar?.motion.headYaw ?? 0)).toBeCloseTo(Math.abs(unbalancedAvatar?.motion.headYaw ?? 0));
    expect(Math.abs(readyAvatar?.motion.headX ?? 0)).toBeGreaterThan(Math.abs(unbalancedAvatar?.motion.headX ?? 0));
    expect(Math.abs(readyAvatar?.motion.meshWarp ?? 0)).toBeGreaterThan(Math.abs(unbalancedAvatar?.motion.meshWarp ?? 0));
    expect(readyAvatar?.motion.eyeSquint).toBeGreaterThan(unbalancedAvatar?.motion.eyeSquint ?? 0);
    expect(readyAvatar?.motion.mouthDeform).toBeGreaterThan(unbalancedAvatar?.motion.mouthDeform ?? 0);
  });

  it("attenuates localized still-image deformation when native landmarks have low confidence", () => {
    const profile = {
      ...defaultFaceTrackingProfile,
      enabled: true,
      inputMode: "native-camera" as const,
      headRange: 1,
      bodyRange: 1,
      illustrationDeform: 1,
      hairSway: 1,
      eyeDeform: 1,
      mouthDeform: 1
    };
    const highConfidenceRuntime = {
      ...createFaceTrackingRuntimeState(2_000),
      status: "tracking" as const,
      yaw: 0.52,
      pitch: -0.2,
      roll: 0.26,
      mouthOpen: 0.72,
      blink: 0.7,
      smile: 0.4,
      confidence: 0.96,
      faceLandmarkConfidence: 0.92
    };
    const lowConfidenceRuntime = {
      ...highConfidenceRuntime,
      faceLandmarkConfidence: 0.18
    };
    const scene = createDefaultScene();

    const highConfidenceAvatar = applyFaceTrackingRuntime(scene, highConfidenceRuntime, profile).sources.find(
      (source) => source.kind === "pngtuber"
    );
    const lowConfidenceAvatar = applyFaceTrackingRuntime(scene, lowConfidenceRuntime, profile).sources.find(
      (source) => source.kind === "pngtuber"
    );

    expect(Math.abs(highConfidenceAvatar?.motion.headYaw ?? 0)).toBeCloseTo(
      Math.abs(lowConfidenceAvatar?.motion.headYaw ?? 0)
    );
    expect(Math.abs(highConfidenceAvatar?.motion.headX ?? 0)).toBeGreaterThan(
      Math.abs(lowConfidenceAvatar?.motion.headX ?? 0)
    );
    expect(highConfidenceAvatar?.motion.depthTilt).toBeGreaterThan(lowConfidenceAvatar?.motion.depthTilt ?? 0);
    expect(Math.abs(highConfidenceAvatar?.motion.meshWarp ?? 0)).toBeGreaterThan(
      Math.abs(lowConfidenceAvatar?.motion.meshWarp ?? 0)
    );
    expect(highConfidenceAvatar?.motion.eyeSquint).toBeGreaterThan(lowConfidenceAvatar?.motion.eyeSquint ?? 0);
    expect(highConfidenceAvatar?.motion.mouthDeform).toBeGreaterThan(lowConfidenceAvatar?.motion.mouthDeform ?? 0);
    expect(Math.abs(highConfidenceAvatar?.motion.hairSway ?? 0)).toBeGreaterThan(
      Math.abs(lowConfidenceAvatar?.motion.hairSway ?? 0)
    );
    expect(highConfidenceAvatar?.mouthOpen).toBeGreaterThan(lowConfidenceAvatar?.mouthOpen ?? 0);
    expect(highConfidenceAvatar?.blink).toBeGreaterThan(lowConfidenceAvatar?.blink ?? 0);
  });

  it("calibrates neutral pose from the current runtime offset", () => {
    const calibrated = calibrateFaceTrackingProfile(defaultFaceTrackingProfile, {
      ...createFaceTrackingRuntimeState(3_000),
      yaw: 0.24,
      pitch: -0.18,
      roll: 0.12
    });

    expect(calibrated.neutralYaw).toBe(0.24);
    expect(calibrated.neutralPitch).toBe(-0.18);
    expect(calibrated.neutralRoll).toBe(0.12);
  });
});
