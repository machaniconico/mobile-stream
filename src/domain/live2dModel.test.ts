import { describe, expect, it } from "vitest";
import {
  createLive2DModel3ManifestReport,
  createLive2DModelAssetReport,
  normalizeLive2DModelJsonUri
} from "./live2dModel";

describe("Live2D model assets", () => {
  it("normalizes model3 JSON URIs for scene persistence", () => {
    expect(normalizeLive2DModelJsonUri(" \nfile:///models/hiyori/hiyori.model3.json\t")).toBe(
      "file:///models/hiyori/hiyori.model3.json"
    );
    expect(normalizeLive2DModelJsonUri(null)).toBe("");
  });

  it("accepts local model3 JSON package URIs", () => {
    const report = createLive2DModelAssetReport({
      name: "Live2D",
      modelJsonUri: "file:///private/var/mobile/Containers/Shared/AppGroup/ABCDEF/hiyori.model3.json"
    });

    expect(report.status).toBe("pass");
    expect(report.issueCount).toBe(0);
  });

  it("warns for missing or remote model3 JSON package URIs", () => {
    expect(
      createLive2DModelAssetReport({
        name: "Live2D",
        modelJsonUri: ""
      }).issues.map((issue) => issue.code)
    ).toContain("live2d-model-json-missing");

    expect(
      createLive2DModelAssetReport({
        name: "Live2D",
        modelJsonUri: "https://example.test/hiyori.model3.json"
      }).issues.map((issue) => issue.code)
    ).toContain("live2d-model-json-remote");
  });

  it("validates a Cubism model3 manifest with expression and motion files", () => {
    const report = createLive2DModel3ManifestReport({
      Version: 3,
      FileReferences: {
        Moc: "hiyori.moc3",
        Textures: ["textures/texture_00.png", "textures/texture_01.png"],
        Physics: "hiyori.physics3.json",
        Expressions: [{ Name: "happy", File: "expressions/happy.exp3.json" }],
        Motions: {
          Idle: [{ File: "motions/idle.motion3.json" }]
        }
      }
    });

    expect(report.status).toBe("pass");
    expect(report.mocPath).toBe("hiyori.moc3");
    expect(report.textureCount).toBe(2);
    expect(report.expressionCount).toBe(1);
    expect(report.motionFileCount).toBe(1);
  });

  it("fails model3 manifests without moc, textures, or safe package-local references", () => {
    const report = createLive2DModel3ManifestReport({
      Version: 3,
      FileReferences: {
        Textures: ["https://cdn.example.test/texture.png"],
        Expressions: [{ Name: "happy", File: "../outside.exp3.json" }],
        Motions: {
          Idle: [{ File: "/tmp/idle.motion3.json" }]
        }
      }
    });

    expect(report.status).toBe("fail");
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["live2d-model3-moc-missing", "live2d-model3-unsafe-reference"])
    );
  });
});
