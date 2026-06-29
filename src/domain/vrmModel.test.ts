import { describe, expect, it } from "vitest";
import {
  createVrmGlbHeaderReport,
  createVrmModelAssetReport,
  normalizeVrmModelUri
} from "./vrmModel";

describe("VRM model assets", () => {
  it("normalizes VRM model URIs", () => {
    expect(normalizeVrmModelUri(" \nfile:///models/avatar.vrm\t")).toBe("file:///models/avatar.vrm");
    expect(normalizeVrmModelUri(null)).toBe("");
  });

  it("accepts local VRM and GLB model URIs", () => {
    expect(
      createVrmModelAssetReport({
        name: "VRoid",
        modelUri: "file:///models/vroid/avatar.vrm"
      })
    ).toMatchObject({
      status: "pass",
      issueCount: 0
    });

    expect(
      createVrmModelAssetReport({
        name: "VRoid",
        modelUri: "/private/var/mobile/Containers/Shared/AppGroup/model.glb?cache=1"
      })
    ).toMatchObject({
      status: "pass",
      issueCount: 0
    });
  });

  it("warns for missing, remote, relative, and non-model VRM URIs", () => {
    expect(
      createVrmModelAssetReport({
        name: "VRoid",
        modelUri: ""
      }).issues.map((issue) => issue.code)
    ).toEqual(["vrm-model-missing"]);

    expect(
      createVrmModelAssetReport({
        name: "VRoid",
        modelUri: "https://example.test/avatar.vrm"
      }).issues.map((issue) => issue.code)
    ).toEqual(["vrm-model-remote"]);

    expect(
      createVrmModelAssetReport({
        name: "VRoid",
        modelUri: "models/avatar.vrm"
      }).issues.map((issue) => issue.code)
    ).toEqual(["vrm-model-relative"]);

    expect(
      createVrmModelAssetReport({
        name: "VRoid",
        modelUri: "file:///models/avatar.bin"
      }).issues.map((issue) => issue.code)
    ).toEqual(["vrm-model-extension"]);
  });

  it("validates VRM 1.0 GLB headers", () => {
    const report = createVrmGlbHeaderReport(
      createGlb({
        asset: { version: "2.0" },
        extensionsUsed: ["VRMC_vrm"],
        extensionsRequired: ["VRMC_vrm"],
        extensions: {
          VRMC_vrm: {
            humanoid: {
              humanBones: {
                hips: { node: 1 },
                head: { node: 2 }
              }
            },
            expressions: {
              preset: {
                happy: {},
                angry: {}
              },
              custom: {
                wink: {}
              }
            }
          }
        }
      })
    );

    expect(report).toMatchObject({
      status: "pass",
      version: 2,
      vrmExtensionVersion: "1.0",
      requiredExtensionCount: 1,
      usedExtensionCount: 1,
      humanoidBoneCount: 2,
      expressionCount: 3
    });
  });

  it("validates VRM 0.x GLB headers with warnings for incomplete metadata", () => {
    const report = createVrmGlbHeaderReport(
      createGlb({
        asset: { version: "2.0" },
        extensionsUsed: ["VRM"],
        extensions: {
          VRM: {
            humanoid: {
              humanBones: [{ bone: "hips", node: 1 }]
            },
            blendShapeMaster: {
              blendShapeGroups: []
            }
          }
        }
      })
    );

    expect(report.status).toBe("warn");
    expect(report.vrmExtensionVersion).toBe("0.x");
    expect(report.humanoidBoneCount).toBe(1);
    expect(report.issues.map((issue) => issue.code)).toEqual(["vrm-expressions-missing"]);
  });

  it("fails non-VRM or malformed GLB files", () => {
    expect(createVrmGlbHeaderReport([0, 1, 2]).issues.map((issue) => issue.code)).toEqual(["vrm-glb-too-small"]);

    const plainGlb = createVrmGlbHeaderReport(
      createGlb({
        asset: { version: "2.0" },
        extensionsUsed: ["KHR_materials_unlit"],
        extensions: {}
      })
    );
    expect(plainGlb.status).toBe("fail");
    expect(plainGlb.issues.map((issue) => issue.code)).toContain("vrm-extension-missing");
  });
});

const createGlb = (json: Record<string, unknown>): Uint8Array => {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonChunkLength = align4(jsonBytes.length);
  const totalLength = 12 + 8 + jsonChunkLength;
  const bytes = new Uint8Array(totalLength);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonChunkLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(jsonBytes, 20);
  for (let index = 20 + jsonBytes.length; index < bytes.length; index += 1) {
    bytes[index] = 0x20;
  }

  return bytes;
};

const align4 = (value: number): number => Math.ceil(value / 4) * 4;
