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
      binaryChunkCount: 0,
      vrmExtensionVersion: "1.0",
      requiredExtensionCount: 1,
      usedExtensionCount: 1,
      unsupportedRequiredExtensionCount: 0,
      humanoidBoneCount: 2,
      expressionCount: 3,
      imageCount: 0,
      unsupportedImageMimeCount: 0
    });
  });

  it("accepts self-contained VRoid-style GLB assets with binary buffers and PNG textures", () => {
    const report = createVrmGlbHeaderReport(
      createGlb(
        {
          asset: { version: "2.0" },
          extensionsUsed: ["VRMC_vrm", "VRMC_materials_mtoon"],
          extensionsRequired: ["VRMC_vrm"],
          extensions: {
            VRMC_vrm: {
              humanoid: {
                humanBones: {
                  hips: { node: 1 },
                  spine: { node: 2 },
                  head: { node: 3 }
                }
              },
              expressions: {
                preset: {
                  happy: {},
                  aa: {}
                }
              }
            }
          },
          buffers: [{ byteLength: 32 }],
          images: [{ bufferView: 0, mimeType: "image/png" }]
        },
        32
      )
    );

    expect(report).toMatchObject({
      status: "pass",
      binaryChunkCount: 1,
      bufferUriCount: 0,
      imageCount: 1,
      imageUriCount: 0,
      externalImageUriCount: 0,
      unsupportedImageMimeCount: 0
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

  it("fails VRM GLBs that require external buffers or unsupported required extensions", () => {
    const report = createVrmGlbHeaderReport(
      createGlb({
        asset: { version: "2.0" },
        extensionsUsed: ["VRMC_vrm", "VENDOR_custom_physics"],
        extensionsRequired: ["VRMC_vrm", "VENDOR_custom_physics"],
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
                happy: {}
              }
            }
          }
        },
        buffers: [{ uri: "avatar.bin", byteLength: 32 }],
        images: [{ uri: "textures/avatar.webp", mimeType: "image/webp" }]
      })
    );

    expect(report.status).toBe("fail");
    expect(report).toMatchObject({
      unsupportedRequiredExtensionCount: 1,
      unsupportedRequiredExtensions: ["VENDOR_custom_physics"],
      bufferUriCount: 1,
      imageCount: 1,
      imageUriCount: 1,
      externalImageUriCount: 1,
      unsupportedImageMimeCount: 1
    });
    expect(report.issues.map((issue) => issue.code)).toEqual([
      "vrm-required-extension-unsupported",
      "vrm-buffer-uri",
      "vrm-image-external-uri",
      "vrm-image-mime-unsupported"
    ]);
  });

  it("fails VRM GLBs that declare embedded buffers without a BIN chunk", () => {
    const report = createVrmGlbHeaderReport(
      createGlb({
        asset: { version: "2.0" },
        extensionsUsed: ["VRMC_vrm"],
        extensionsRequired: ["VRMC_vrm"],
        extensions: {
          VRMC_vrm: {
            humanoid: {
              humanBones: {
                hips: { node: 1 }
              }
            },
            expressions: {
              preset: {
                happy: {}
              }
            }
          }
        },
        buffers: [{ byteLength: 32 }]
      })
    );

    expect(report.status).toBe("fail");
    expect(report.binaryChunkCount).toBe(0);
    expect(report.issues.map((issue) => issue.code)).toEqual(["vrm-glb-bin-chunk-missing"]);
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

const createGlb = (json: Record<string, unknown>, binaryLength = 0): Uint8Array => {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonChunkLength = align4(jsonBytes.length);
  const binaryChunkLength = binaryLength > 0 ? align4(binaryLength) : 0;
  const totalLength = 12 + 8 + jsonChunkLength + (binaryChunkLength > 0 ? 8 + binaryChunkLength : 0);
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
  if (binaryChunkLength > 0) {
    const binaryHeaderOffset = 20 + jsonChunkLength;
    view.setUint32(binaryHeaderOffset, binaryChunkLength, true);
    view.setUint32(binaryHeaderOffset + 4, 0x004e4942, true);
  }

  return bytes;
};

const align4 = (value: number): number => Math.ceil(value / 4) * 4;
