import { describe, expect, it } from "vitest";
import { createSource } from "./scene";
import { createVrmRuntimePose, serializeVrmRuntimePose } from "./vrmRuntime";

describe("VRM runtime pose mapping", () => {
  it("maps face-tracking motion to VRM humanoid rotations and expression weights", () => {
    const source = createSource("vrm");
    if (source.kind !== "vrm") {
      throw new Error("Expected VRM source.");
    }

    const pose = createVrmRuntimePose({
      ...source,
      expression: "happy",
      mouthOpen: 0.4,
      blink: 0.2,
      motion: {
        ...source.motion,
        headYaw: 0.5,
        headPitch: -0.25,
        headRoll: 0.2,
        headX: 0.3,
        headY: -0.2,
        bodyLean: 0.35,
        bodyBounce: 0.08,
        breathing: 0.04,
        depthTilt: 0.3,
        eyeSquint: 0.45,
        mouthDeform: 0.72,
        shoulderSway: -0.4,
        confidence: 0.91
      }
    });

    expect(pose.status).toBe("active");
    expect(pose.confidence).toBe(0.91);
    expect(pose.expressions).toMatchObject({
      happy: 1,
      blink: 0.45,
      aa: 0.72,
      lookRight: 0.5,
      lookUp: 0.25
    });
    expect(pose.humanoidRotations.find((rotation) => rotation.bone === "head")).toEqual({
      bone: "head",
      x: 5,
      y: 14,
      z: 3.6
    });
    expect(pose.humanoidRotations.find((rotation) => rotation.bone === "leftShoulder")?.z).toBe(-2.4);
    expect(pose.rootOffset).toEqual({ x: 0.019, y: -0.012, z: -0.024 });
  });

  it("returns an idle neutral pose without tracking input", () => {
    const source = createSource("vrm");
    if (source.kind !== "vrm") {
      throw new Error("Expected VRM source.");
    }

    const pose = createVrmRuntimePose(source);

    expect(pose.status).toBe("idle");
    expect(pose.confidence).toBe(0);
    expect(pose.expressions.neutral).toBe(0);
    expect(pose.expressions.aa).toBe(0);
    expect(pose.humanoidRotations.every((rotation) => rotation.x === 0 && rotation.y === 0 && rotation.z === 0)).toBe(true);
  });

  it("serializes a compact native payload for renderers", () => {
    const source = createSource("vrm");
    if (source.kind !== "vrm") {
      throw new Error("Expected VRM source.");
    }

    const pose = createVrmRuntimePose({
      ...source,
      expression: "surprised",
      mouthOpen: 1,
      motion: { ...source.motion, headPitch: 0.8, confidence: 0.5 }
    });
    const payload = JSON.parse(serializeVrmRuntimePose(pose));

    expect(payload).toMatchObject({
      schemaVersion: 1,
      rotationUnit: "degrees",
      rotationOrder: "XYZ",
      rootOffsetUnit: "model-height"
    });
    expect(payload.status).toBe("active");
    expect(payload.expressions.surprised).toBe(1);
    expect(payload.expressions.lookDown).toBe(0.8);
    expect(payload.humanoidRotations).toHaveLength(7);
    expect(payload.rootOffset).toEqual({ x: 0, y: 0, z: 0 });
  });
});
