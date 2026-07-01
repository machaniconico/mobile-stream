import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile } from "./profiles";
import { createReadinessReport } from "./readiness";
import { createDefaultScene, updateSource } from "./scene";
import { createTextOverlayDiagnostics } from "./textOverlayDiagnostics";

describe("textOverlayDiagnostics", () => {
  it("passes the default visible manual label and subtitle overlays", () => {
    const scene = createDefaultScene();
    const profile = createDefaultStudioProfile();
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createTextOverlayDiagnostics(scene, readiness);

    expect(diagnostics).toMatchObject({
      status: "pass",
      sourceCount: 2,
      visibleSourceCount: 2,
      manualSourceCount: 2,
      visibleManualSourceCount: 2,
      runtimeCaptionSourceCount: 0,
      visibleRuntimeCaptionSourceCount: 0,
      emptyVisibleManualSourceCount: 0,
      sensitiveContentIssueCount: 0,
      dominantBackdropIssueCount: 0,
      avatarOverlapIssueCount: 0
    });
    expect(diagnostics.modeCounts).toMatchObject({ label: 1, subtitle: 1, ticker: 0, caption: 0 });
    expect(diagnostics.summary).toContain("2/2 text overlays visible");
  });

  it("warns when a visible manual text overlay is empty", () => {
    const scene = updateSource(createDefaultScene(), "source-subtitle", (source) =>
      source.kind === "text" ? { ...source, text: "   " } : source
    );
    const readiness = createReadinessReport(scene, createDefaultStudioProfile());

    const diagnostics = createTextOverlayDiagnostics(scene, readiness);

    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.emptyVisibleManualSourceCount).toBe(1);
    expect(diagnostics.summary).toContain("visible manual text overlay");
    expect(diagnostics.recommendation).toContain("Fill or hide");
  });

  it("fails when readiness found sensitive visible text overlay content", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: "secret-stream-key-123456"
      }
    };
    const scene = updateSource(createDefaultScene(), "source-subtitle", (source) =>
      source.kind === "text" ? { ...source, text: "Starting soon secret-stream-key-123456" } : source
    );
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createTextOverlayDiagnostics(scene, readiness);

    expect(diagnostics.status).toBe("fail");
    expect(diagnostics.sensitiveContentIssueCount).toBe(1);
    expect(diagnostics.summary).toBe("1 visible text overlay may expose credentials or contact details.");
    expect(diagnostics.recommendation).not.toContain("secret-stream-key-123456");
  });

  it("fails when readiness found contact details in visible text overlay content", () => {
    const scene = updateSource(createDefaultScene(), "source-subtitle", (source) =>
      source.kind === "text"
        ? {
            ...source,
            text: "Contact viewer@example.com 090-1234-5678 discord.gg/privateRoom"
          }
        : source
    );
    const readiness = createReadinessReport(scene, createDefaultStudioProfile());

    const diagnostics = createTextOverlayDiagnostics(scene, readiness);

    expect(diagnostics.status).toBe("fail");
    expect(diagnostics.sensitiveContentIssueCount).toBe(1);
    expect(diagnostics.summary).toContain("credentials or contact details");
    expect(diagnostics.recommendation).toContain("contact details");
    expect(diagnostics.recommendation).toContain("invite links");
    expect(diagnostics.recommendation).not.toContain("viewer@example.com");
  });

  it("warns when readiness found text over avatar overlap", () => {
    const scene = updateSource(createDefaultScene(), "source-subtitle", (source) =>
      source.kind === "text"
        ? {
            ...source,
            transform: {
              ...source.transform,
              x: 0.62,
              y: 0.52,
              width: 0.28,
              height: 0.24
            }
          }
        : source
    );
    const readiness = createReadinessReport(scene, createDefaultStudioProfile());

    const diagnostics = createTextOverlayDiagnostics(scene, readiness);

    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.avatarOverlapIssueCount).toBe(1);
    expect(diagnostics.summary).toContain("overlap the avatar layer");
    expect(diagnostics.recommendation).toContain("Move text away from the avatar");
  });
});
