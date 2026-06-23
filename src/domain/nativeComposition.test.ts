import { describe, expect, it } from "vitest";
import { createNativeCompositionReport } from "./nativeComposition";
import { createDefaultScene, setVisibility } from "./scene";

describe("native composition report", () => {
  it("warns when a visible source is below the native screen capture layer", () => {
    const report = createNativeCompositionReport(createDefaultScene());

    expect(report.status).toBe("warn");
    expect(report.coverage).toBe("preview-only-overlays");
    expect(report.requiresNativeCompositor).toBe(true);
    expect(report.screenSourceCount).toBe(1);
    expect(report.avatarSourceCount).toBe(1);
    expect(report.previewOnlySourceCount).toBe(1);
    expect(report.unsupportedSourceKinds).toEqual(["solid"]);
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["native-compositor-solid"])
    );
  });

  it("passes when native-supported overlays are above the screen layer", () => {
    const scene = setVisibility(createDefaultScene(), "source-background", false);

    const report = createNativeCompositionReport(scene);

    expect(report.status).toBe("pass");
    expect(report.coverage).toBe("native-overlays");
    expect(report.requiresNativeCompositor).toBe(false);
    expect(report.previewOnlySourceCount).toBe(0);
    expect(report.issues).toHaveLength(0);
  });

  it("passes for screen-only native publishing", () => {
    const scene = createDefaultScene().sources
      .filter((source) => source.kind !== "screen")
      .reduce((currentScene, source) => setVisibility(currentScene, source.id, false), createDefaultScene());

    const report = createNativeCompositionReport(scene);

    expect(report.status).toBe("pass");
    expect(report.coverage).toBe("screen-only");
    expect(report.requiresNativeCompositor).toBe(false);
    expect(report.previewOnlySourceCount).toBe(0);
    expect(report.issues).toHaveLength(0);
  });

  it("warns when every visible source needs native composition", () => {
    const scene = setVisibility(createDefaultScene(), "source-screen", false);

    const report = createNativeCompositionReport(scene);

    expect(report.status).toBe("warn");
    expect(report.coverage).toBe("no-screen-capture");
    expect(report.screenSourceCount).toBe(0);
    expect(report.requiresNativeCompositor).toBe(true);
  });
});
