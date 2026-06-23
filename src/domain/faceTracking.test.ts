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
