import { describe, expect, it } from "vitest";
import { createNativeCompositionReport } from "./nativeComposition";
import { createDefaultScene, createSource, setVisibility, updateSource } from "./scene";

const appGroupAvatarUri = "file:///private/var/mobile/Containers/Shared/AppGroup/ABCDEF/avatar.png";

describe("native composition report", () => {
  it("warns when a visible source is below the native screen capture layer", () => {
    const report = createNativeCompositionReport(createDefaultScene());

    expect(report.status).toBe("warn");
    expect(report.coverage).toBe("preview-only-overlays");
    expect(report.requiresNativeCompositor).toBe(true);
    expect(report.screenSourceCount).toBe(1);
    expect(report.avatarSourceCount).toBe(1);
    expect(report.nativeOverlayCount).toBe(4);
    expect(report.stillImageOverlayCount).toBe(1);
    expect(report.textOverlayCount).toBe(2);
    expect(report.captionOverlayCount).toBe(1);
    expect(report.chatOverlayCount).toBe(1);
    expect(report.previewOnlySourceCount).toBe(1);
    expect(report.unsupportedSourceKinds).toEqual(["solid"]);
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["native-compositor-solid"])
    );
  });

  it("passes when native-supported overlays are above the screen layer", () => {
    const scene = updateSource(
      setVisibility(createDefaultScene(), "source-background", false),
      "source-avatar",
      (source) => (source.kind === "pngtuber" ? { ...source, imageUri: appGroupAvatarUri } : source)
    );

    const report = createNativeCompositionReport(scene);

    expect(report.status).toBe("pass");
    expect(report.coverage).toBe("native-overlays");
    expect(report.requiresNativeCompositor).toBe(false);
    expect(report.nativeOverlayCount).toBe(4);
    expect(report.stillImageOverlayCount).toBe(1);
    expect(report.textOverlayCount).toBe(2);
    expect(report.captionOverlayCount).toBe(1);
    expect(report.chatOverlayCount).toBe(1);
    expect(report.previewOnlySourceCount).toBe(0);
    expect(report.assetIssueCount).toBe(0);
    expect(report.fileBackedAssetIssueCount).toBe(0);
    expect(report.issues).toHaveLength(0);
  });

  it("warns when native still-image overlays use host-sandbox file URLs", () => {
    const scene = updateSource(
      setVisibility(createDefaultScene(), "source-background", false),
      "source-avatar",
      (source) =>
        source.kind === "pngtuber"
          ? {
              ...source,
              imageUri: "file:///var/mobile/Containers/Data/Application/APP/Documents/avatar.png"
            }
          : source
    );

    const report = createNativeCompositionReport(scene);

    expect(report.status).toBe("warn");
    expect(report.coverage).toBe("native-overlays");
    expect(report.assetIssueCount).toBe(1);
    expect(report.fileBackedAssetIssueCount).toBe(1);
    expect(report.issues.map((issue) => issue.code)).toEqual(["native-compositor-asset-file-sandbox"]);
    expect(report.recommendedNextStep).toContain("App Group");
  });

  it("counts VRM as an avatar but keeps it preview-only until native rendering lands", () => {
    const scene = updateSource(
      setVisibility(createDefaultScene(), "source-background", false),
      "source-avatar",
      (source) =>
        source.kind === "pngtuber"
          ? {
              ...createSource("vrm"),
              id: source.id,
              visible: true,
              transform: source.transform
            }
          : source
    );

    const report = createNativeCompositionReport(scene);

    expect(report.status).toBe("warn");
    expect(report.avatarSourceCount).toBe(1);
    expect(report.unsupportedSourceKinds).toEqual(["vrm"]);
    expect(report.issues.map((issue) => issue.code)).toContain("native-compositor-vrm");
  });

  it("warns when native still-image overlays use URI schemes the iOS extension cannot load", () => {
    const scene = updateSource(
      setVisibility(createDefaultScene(), "source-background", false),
      "source-avatar",
      (source) =>
        source.kind === "pngtuber"
          ? {
              ...source,
              imageUri: "content://media/external/images/media/42"
            }
          : source
    );

    const report = createNativeCompositionReport(scene);

    expect(report.status).toBe("warn");
    expect(report.assetIssueCount).toBe(1);
    expect(report.fileBackedAssetIssueCount).toBe(0);
    expect(report.issues[0]?.code).toBe("native-compositor-asset-uri-scheme");
    expect(report.issues[0]?.message).toContain("Android content URI");
  });

  it("keeps diagnostics stable when file paths contain literal percent characters", () => {
    const scene = updateSource(
      setVisibility(createDefaultScene(), "source-background", false),
      "source-avatar",
      (source) =>
        source.kind === "pngtuber"
          ? {
              ...source,
              imageUri: "/var/mobile/Containers/Data/Application/APP/Documents/100%ready/avatar.png"
            }
          : source
    );

    const report = createNativeCompositionReport(scene);

    expect(report.status).toBe("warn");
    expect(report.assetIssueCount).toBe(1);
    expect(report.issues[0]?.code).toBe("native-compositor-asset-file-sandbox");
  });

  it("passes for screen-only native publishing", () => {
    const scene = createDefaultScene().sources
      .filter((source) => source.kind !== "screen")
      .reduce((currentScene, source) => setVisibility(currentScene, source.id, false), createDefaultScene());

    const report = createNativeCompositionReport(scene);

    expect(report.status).toBe("pass");
    expect(report.coverage).toBe("screen-only");
    expect(report.requiresNativeCompositor).toBe(false);
    expect(report.nativeOverlayCount).toBe(0);
    expect(report.textOverlayCount).toBe(0);
    expect(report.captionOverlayCount).toBe(0);
    expect(report.chatOverlayCount).toBe(0);
    expect(report.previewOnlySourceCount).toBe(0);
    expect(report.issues).toHaveLength(0);
  });

  it("warns when every visible source needs native composition", () => {
    const scene = setVisibility(createDefaultScene(), "source-screen", false);

    const report = createNativeCompositionReport(scene);

    expect(report.status).toBe("warn");
    expect(report.coverage).toBe("no-screen-capture");
    expect(report.screenSourceCount).toBe(0);
    expect(report.nativeOverlayCount).toBe(5);
    expect(report.textOverlayCount).toBe(2);
    expect(report.captionOverlayCount).toBe(1);
    expect(report.chatOverlayCount).toBe(1);
    expect(report.requiresNativeCompositor).toBe(true);
  });
});
