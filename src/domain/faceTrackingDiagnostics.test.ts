import { describe, expect, it } from "vitest";
import type { NativeRuntimeComposition } from "./nativeRuntime";
import { createDefaultStudioProfile } from "./profiles";
import { createDefaultScene, createSource, updateSource } from "./scene";
import { createFaceTrackingDiagnostics } from "./faceTrackingDiagnostics";

const readyVrmComposition = (): NativeRuntimeComposition => ({
  status: "applied",
  appliedCount: 1,
  skippedCount: 0,
  skippedKinds: [],
  vrmSourceCount: 1,
  vrmPosePayloadCount: 1,
  vrmActivePoseCount: 1,
  vrmMissingPoseCount: 0,
  vrmModelUriCount: 1,
  vrmModelVersions: ["1.0"],
  vrmHumanoidBoneCount: 55,
  vrmExpressionCount: 8,
  vrmMeshPrimitiveCount: 4,
  vrmSkinnedMeshPrimitiveCount: 4,
  vrmSkinJointCount: 55,
  vrmPositionAccessorCount: 4,
  vrmVertexCount: 12_480,
  vrmIndexCount: 36_240,
  vrmBoundsAccessorCount: 4,
  vrmSkinningAttributePrimitiveCount: 4,
  vrmTrianglePrimitiveCount: 4,
  vrmUnsupportedPrimitiveModeCount: 0,
  vrmNormalAccessorCount: 4,
  vrmTexcoordAccessorCount: 4,
  vrmMorphTargetCount: 8,
  vrmMaterialCount: 3,
  vrmTextureCount: 3,
  vrmImageCount: 3,
  vrmUnsupportedImageMimeCount: 0,
  vrmTransparentMaterialCount: 1,
  vrmPoseBoneCount: 7,
  vrmPoseBoneAppliedCount: 7,
  vrmPoseBoneUnsupportedCount: 0,
  vrmPoseExpressionCount: 3,
  vrmPoseExpressionAppliedCount: 3,
  vrmPoseExpressionUnsupportedCount: 0,
  vrmRuntimeStatuses: ["active"],
  vrmRendererStatus: "ready",
  vrmRendererBackend: "metal-scene-kit",
  vrmModelLoadedCount: 1,
  vrmRenderedSourceCount: 1,
  vrmRenderMissingCount: 0,
  vrmRenderFailureCount: 0,
  message: "Native VRM renderer applied"
});

describe("face tracking diagnostics", () => {
  it("stays informational when face tracking is disabled", () => {
    const diagnostics = createFaceTrackingDiagnostics(createDefaultScene(), createDefaultStudioProfile());

    expect(diagnostics.status).toBe("info");
    expect(diagnostics.summary).toBe("Face tracking is disabled.");
  });

  it("warns when enabled tracking still uses simulated input", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      faceTracking: {
        ...createDefaultStudioProfile().faceTracking,
        enabled: true,
        inputMode: "simulated" as const
      }
    };
    const scene = updateSource(createDefaultScene(), "source-avatar", (source) =>
      source.kind === "pngtuber" ? { ...source, imageUri: "file:///shared/avatar.png" } : source
    );

    const diagnostics = createFaceTrackingDiagnostics(scene, profile);

    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.summary).toContain("simulated input");
    expect(diagnostics.preparedPngTuberCount).toBe(1);
  });

  it("passes when native camera tracking has a prepared PNGTuber and active runtime", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      faceTracking: {
        ...createDefaultStudioProfile().faceTracking,
        enabled: true,
        inputMode: "native-camera" as const
      }
    };
    const scene = updateSource(createDefaultScene(), "source-avatar", (source) =>
      source.kind === "pngtuber"
        ? {
            ...source,
            imageUri: "file:///shared/avatar.png",
            motion: { ...source.motion, headYaw: 0.2, confidence: 0.92 }
          }
        : source
    );

    const diagnostics = createFaceTrackingDiagnostics(scene, profile, {
      status: "tracking",
      yaw: 0.2,
      pitch: 0.1,
      roll: 0,
      mouthOpen: 0.4,
      blink: 0,
      smile: 0.4,
      browRaise: 0.2,
      confidence: 0.92,
      faceLandmarkConfidence: 0.81,
      expression: "neutral",
      lastFrameAt: 1_000
    });

    expect(diagnostics.status).toBe("pass");
    expect(diagnostics.runtimeStatus).toBe("tracking");
    expect(diagnostics.runtimeAgeMs).toBeNull();
    expect(diagnostics.runtimeFresh).toBe(true);
    expect(diagnostics.activeMotionCount).toBe(1);
    expect(diagnostics.rigIssueCount).toBe(0);
    expect(diagnostics.rigQualityScore).toBe(100);
    expect(diagnostics.rigQualityGrade).toBe("ready");
    expect(diagnostics.faceLandmarkConfidence).toBeCloseTo(0.81, 3);
    expect(diagnostics.faceLandmarkReady).toBe(true);
  });

  it("passes for VRM-only avatar motion when native VRM renderer proof is ready", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      faceTracking: {
        ...createDefaultStudioProfile().faceTracking,
        enabled: true,
        inputMode: "native-camera" as const
      }
    };
    const vrm = createSource("vrm");
    if (vrm.kind !== "vrm") {
      throw new Error("Expected VRM source.");
    }
    const scene = updateSource(createDefaultScene(), "source-avatar", (source) =>
      source.kind === "pngtuber"
        ? {
            ...vrm,
            id: source.id,
            transform: source.transform,
            modelUri: "file:///shared/avatar.vrm",
            motion: { ...source.motion, headYaw: 0.22, mouthDeform: 0.31, confidence: 0.91 }
          }
        : source
    );

    const diagnostics = createFaceTrackingDiagnostics(
      scene,
      profile,
      {
        status: "tracking",
        yaw: 0.2,
        pitch: 0.1,
        roll: 0,
        mouthOpen: 0.4,
        blink: 0,
        smile: 0.4,
        browRaise: 0.2,
        confidence: 0.92,
        faceLandmarkConfidence: 0.81,
        expression: "neutral",
        lastFrameAt: 1_000
      },
      { nativeRuntimeComposition: readyVrmComposition() }
    );

    expect(diagnostics.status).toBe("pass");
    expect(diagnostics.visiblePngTuberCount).toBe(0);
    expect(diagnostics.visibleVrmCount).toBe(1);
    expect(diagnostics.nativeVrmRendererReady).toBe(true);
    expect(diagnostics.preparedPngTuberCount).toBe(0);
    expect(diagnostics.rigQualityScore).toBe(100);
    expect(diagnostics.rigQualityGrade).toBe("ready");
    expect(diagnostics.summary).toContain("native-rendered VRM/VRoid");
  });

  it("warns when native camera tracking has weak face landmark confidence", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      faceTracking: {
        ...createDefaultStudioProfile().faceTracking,
        enabled: true,
        inputMode: "native-camera" as const
      }
    };
    const scene = updateSource(createDefaultScene(), "source-avatar", (source) =>
      source.kind === "pngtuber"
        ? {
            ...source,
            imageUri: "file:///shared/avatar.png",
            motion: { ...source.motion, headYaw: 0.2, confidence: 0.92 }
          }
        : source
    );

    const diagnostics = createFaceTrackingDiagnostics(scene, profile, {
      status: "tracking",
      yaw: 0.2,
      pitch: 0.1,
      roll: 0,
      mouthOpen: 0.4,
      blink: 0,
      smile: 0.4,
      browRaise: 0.2,
      confidence: 0.92,
      faceLandmarkConfidence: 0.42,
      expression: "neutral",
      lastFrameAt: 1_000
    });

    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.faceLandmarkReady).toBe(false);
    expect(diagnostics.summary).toContain("landmark confidence is 42%");
  });

  it("warns when prepared PNGTuber rig lines are not production-safe", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      faceTracking: {
        ...createDefaultStudioProfile().faceTracking,
        enabled: true,
        inputMode: "native-camera" as const
      }
    };
    const scene = updateSource(createDefaultScene(), "source-avatar", (source) =>
      source.kind === "pngtuber"
        ? {
            ...source,
            imageUri: "file:///shared/avatar.png",
            illustrationRig: {
              ...source.illustrationRig,
              hairLineY: 0.42,
              eyeLineY: 0.34,
              mouthLineY: 0.38,
              shoulderLineY: 0.39,
              sliceCount: 12
            },
            motion: { ...source.motion, headYaw: 0.2, confidence: 0.92 }
          }
        : source
    );

    const diagnostics = createFaceTrackingDiagnostics(scene, profile, {
      status: "tracking",
      yaw: 0.2,
      pitch: 0.1,
      roll: 0,
      mouthOpen: 0.4,
      blink: 0,
      smile: 0.4,
      browRaise: 0.2,
      confidence: 0.92,
      faceLandmarkConfidence: 0.81,
      expression: "neutral",
      lastFrameAt: 1_000
    });

    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.rigIssueCount).toBeGreaterThan(0);
    expect(diagnostics.rigQualityScore).toBeLessThan(90);
    expect(diagnostics.rigQualityGrade).not.toBe("ready");
    expect(diagnostics.summary).toContain("Still-image avatar rig needs review");
    expect(diagnostics.rigIssueSummary).toContain("rig lines");
  });

  it("warns when the native camera runtime stops reporting fresh frames", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      faceTracking: {
        ...createDefaultStudioProfile().faceTracking,
        enabled: true,
        inputMode: "native-camera" as const
      }
    };
    const scene = updateSource(createDefaultScene(), "source-avatar", (source) =>
      source.kind === "pngtuber"
        ? {
            ...source,
            imageUri: "file:///shared/avatar.png",
            motion: { ...source.motion, headYaw: 0.2, confidence: 0.92 }
          }
        : source
    );

    const diagnostics = createFaceTrackingDiagnostics(
      scene,
      profile,
      {
        status: "tracking",
        yaw: 0.2,
        pitch: 0.1,
        roll: 0,
        mouthOpen: 0.4,
        blink: 0,
        smile: 0.4,
        browRaise: 0.2,
        confidence: 0.92,
        expression: "neutral",
        lastFrameAt: 1_000
      },
      { now: 2_700 }
    );

    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.runtimeAgeMs).toBe(1700);
    expect(diagnostics.runtimeFresh).toBe(false);
    expect(diagnostics.summary).toContain("runtime is stale");
  });

  it("warns when native tracking is active but no avatar motion is applied", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      faceTracking: {
        ...createDefaultStudioProfile().faceTracking,
        enabled: true,
        inputMode: "native-camera" as const
      }
    };
    const scene = updateSource(createDefaultScene(), "source-avatar", (source) =>
      source.kind === "pngtuber" ? { ...source, imageUri: "file:///shared/avatar.png" } : source
    );

    const diagnostics = createFaceTrackingDiagnostics(scene, profile, {
      status: "tracking",
      yaw: 0.2,
      pitch: 0.1,
      roll: 0,
      mouthOpen: 0.4,
      blink: 0,
      smile: 0.4,
      browRaise: 0.2,
      confidence: 0.92,
      faceLandmarkConfidence: 0.81,
      expression: "neutral",
      lastFrameAt: 1_000
    });

    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.activeMotionCount).toBe(0);
    expect(diagnostics.summary).toContain("no visible avatar source has applied motion");
  });
});
