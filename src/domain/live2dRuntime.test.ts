import { describe, expect, it } from "vitest";
import { createSource } from "./scene";
import { createLive2DRuntimePose, serializeLive2DRuntimePose } from "./live2dRuntime";

describe("Live2D runtime pose mapping", () => {
  it("maps face-tracking motion to Cubism parameter weights", () => {
    const source = createSource("live2d");
    if (source.kind !== "live2d") {
      throw new Error("Expected Live2D source.");
    }

    const pose = createLive2DRuntimePose({
      ...source,
      expression: "happy",
      mouthOpen: 0.4,
      blink: 0.2,
      motion: {
        ...source.motion,
        headYaw: 0.5,
        headPitch: -0.25,
        headRoll: 0.2,
        bodyLean: 0.35,
        bodyBounce: 0.08,
        breathing: 0.04,
        eyeSquint: 0.45,
        mouthDeform: 0.72,
        shoulderSway: -0.4,
        confidence: 0.91
      }
    });

    expect(pose.status).toBe("active");
    expect(pose.confidence).toBe(0.91);
    expect(pose.expression).toBe("happy");
    expect(pose.parameters).toMatchObject({
      ParamAngleX: 15,
      ParamAngleY: 5.5,
      ParamAngleZ: 5.6,
      ParamBodyAngleX: 5,
      ParamBodyAngleY: -4.4,
      ParamEyeLOpen: 0.55,
      ParamEyeROpen: 0.55,
      ParamMouthOpenY: 0.72,
      ParamMouthForm: 0.864,
      ParamBreath: 1,
      ParamCheek: 0.45
    });
    expect(pose.lookAt).toEqual({ yaw: 0.5, pitch: -0.25 });
  });

  it("returns an idle neutral pose without tracking input", () => {
    const source = createSource("live2d");
    if (source.kind !== "live2d") {
      throw new Error("Expected Live2D source.");
    }

    const pose = createLive2DRuntimePose(source);

    expect(pose.status).toBe("idle");
    expect(pose.confidence).toBe(0);
    expect(pose.expression).toBe("neutral");
    expect(pose.parameters.ParamAngleX).toBe(0);
    expect(pose.parameters.ParamMouthOpenY).toBe(0);
    expect(pose.parameters.ParamMouthForm).toBe(-0.2);
    expect(pose.parameters.ParamEyeLOpen).toBe(1);
    expect(pose.parameters.ParamEyeROpen).toBe(1);
    expect(pose.parameters.ParamBreath).toBe(0.5);
  });

  it("serializes a compact native payload for Cubism renderers", () => {
    const source = createSource("live2d");
    if (source.kind !== "live2d") {
      throw new Error("Expected Live2D source.");
    }

    const pose = createLive2DRuntimePose({
      ...source,
      expression: "surprised",
      mouthOpen: 1,
      motion: { ...source.motion, headPitch: 0.8, confidence: 0.5 }
    });
    const payload = JSON.parse(serializeLive2DRuntimePose(pose));

    expect(payload.status).toBe("active");
    expect(payload.expression).toBe("surprised");
    expect(payload.parameters.ParamMouthOpenY).toBe(1);
    expect(payload.parameters.ParamAngleY).toBe(-17.6);
    expect(payload.lookAt).toEqual({ yaw: 0, pitch: 0.8 });
    expect(payload.summary).toBeUndefined();
  });
});
