import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile } from "./profiles";
import { createReadinessReport } from "./readiness";
import { createDefaultScene, queueTimedTextOverlay, showPersistentTextOverlay, showTimedTextOverlay, updateSource } from "./scene";
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
      renderVisibleSourceCount: 2,
      activeTimedManualSourceCount: 0,
      queuedTimedManualSourceCount: 0,
      expiredTimedManualSourceCount: 0,
      persistentManualSourceCount: 2,
      emptyVisibleManualSourceCount: 0,
      sensitiveContentIssueCount: 0,
      dominantBackdropIssueCount: 0,
      avatarOverlapIssueCount: 0
    });
    expect(diagnostics.modeCounts).toMatchObject({ label: 1, subtitle: 1, ticker: 0, caption: 0 });
    expect(diagnostics.summary).toContain("2/2 text overlays on program output");
  });

  it("retains active timed, queued timed, expired timed, and pinned manual text evidence", () => {
    const baseScene = {
      ...createDefaultScene(),
      sources: createDefaultScene().sources.filter((source) => source.kind !== "text")
    };
    const sceneWithExpiredText = {
      ...baseScene,
      sources: [
        ...baseScene.sources,
        {
          ...showTimedTextOverlay(baseScene, { text: "expired", nowMs: 1, durationMs: 1_000 }).sources.find(
            (source) => source.kind === "text"
          )!,
          id: "expired-text",
          name: "Expired timed text",
          activatedAtMs: 0,
          displayDurationMs: 1_000
        }
      ]
    };
    const sceneWithPinnedText = showPersistentTextOverlay(sceneWithExpiredText, { text: "pinned", nowMs: 1_000 });
    const sceneWithActiveText = showTimedTextOverlay(sceneWithPinnedText, {
      text: "active",
      nowMs: 1_000,
      durationMs: 4_000
    });
    const sceneWithQueuedText = queueTimedTextOverlay(sceneWithActiveText, {
      text: "queued",
      nowMs: 1_000,
      durationMs: 4_000
    });
    const scene = showTimedTextOverlay(sceneWithQueuedText, {
      text: "expired",
      sourceId: "expired-text",
      nowMs: 1,
      durationMs: 1_000
    });
    const readiness = createReadinessReport(scene, createDefaultStudioProfile());

    const diagnostics = createTextOverlayDiagnostics(scene, readiness, 2_000);

    expect(diagnostics).toMatchObject({
      status: "warn",
      renderVisibleSourceCount: 2,
      activeTimedManualSourceCount: 1,
      queuedTimedManualSourceCount: 1,
      expiredTimedManualSourceCount: 1,
      persistentManualSourceCount: 1
    });
    expect(diagnostics.summary).toContain("expired");
    expect(diagnostics.recommendation).toContain("Hide expired timed text overlays");
  });

  it("warns when only queued text is enabled but nothing is on the program output", () => {
    const baseScene = {
      ...createDefaultScene(),
      sources: createDefaultScene().sources.filter((source) => source.kind !== "text")
    };
    const scene = queueTimedTextOverlay(baseScene, { text: "queued", nowMs: 1_000, durationMs: 4_000 });
    const readiness = createReadinessReport(scene, createDefaultStudioProfile());

    const diagnostics = createTextOverlayDiagnostics(scene, readiness, 500);

    expect(diagnostics).toMatchObject({
      status: "warn",
      renderVisibleSourceCount: 0,
      activeTimedManualSourceCount: 0,
      queuedTimedManualSourceCount: 1,
      expiredTimedManualSourceCount: 0,
      persistentManualSourceCount: 0
    });
    expect(diagnostics.summary).toContain("queued");
    expect(diagnostics.recommendation).toContain("program output");
  });

  it("does not treat a future-dated non-queued timed overlay as queued evidence", () => {
    const baseScene = {
      ...createDefaultScene(),
      sources: createDefaultScene().sources.filter((source) => source.kind !== "text")
    };
    const scene = showTimedTextOverlay(baseScene, { text: "future quick text", nowMs: 5_000, durationMs: 4_000 });
    const readiness = createReadinessReport(scene, createDefaultStudioProfile());

    const diagnostics = createTextOverlayDiagnostics(scene, readiness, 1_000);

    expect(diagnostics).toMatchObject({
      status: "info",
      renderVisibleSourceCount: 0,
      activeTimedManualSourceCount: 0,
      queuedTimedManualSourceCount: 0,
      expiredTimedManualSourceCount: 0,
      persistentManualSourceCount: 0
    });
    expect(diagnostics.summary).toContain("enabled, but none are currently on the program output");
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
