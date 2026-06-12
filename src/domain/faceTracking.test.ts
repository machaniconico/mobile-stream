import { describe, expect, it } from "vitest";
import {
  applyFaceTrackingRuntime,
  calibrateFaceTrackingProfile,
  createFaceTrackingRuntimeState,
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
      mouthSensitivity: 9,
      blinkSensitivity: -1,
      neutralYaw: 3
    });

    expect(profile.enabled).toBe(true);
    expect(profile.inputMode).toBe("native-camera");
    expect(profile.rigMode).toBe("layered-2d");
    expect(profile.trackingStrength).toBe(1);
    expect(profile.smoothing).toBe(0);
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

  it("applies face motion to avatar sources without mutating other source kinds", () => {
    const profile = {
      ...defaultFaceTrackingProfile,
      enabled: true,
      smoothing: 0,
      trackingStrength: 1,
      headRange: 1,
      bodyRange: 1
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
    expect(avatar?.mouthOpen).toBeGreaterThan(0);
    expect(screen).toEqual(scene.sources.find((source) => source.kind === "screen"));
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
