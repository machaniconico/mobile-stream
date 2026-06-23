import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile, redactStreamKey } from "./profiles";
import { createReadinessReport } from "./readiness";
import { createDefaultScene } from "./scene";
import { createStreamDiagnostics } from "./streamDiagnostics";
import { createStreamSessionSummary } from "./streamSessionSummary";
import { createStreamStartPreflightReport } from "./streamStartPreflight";
import {
  createSupportBundle,
  formatSupportBundle,
  serializeSupportBundle
} from "./supportBundle";
import { initialStreamState, type StreamHealth } from "./streamState";

const health = (update: Partial<StreamHealth> = {}): StreamHealth => ({
  ...initialStreamState.health,
  ...update
});

const streamKey = "support-demo";

describe("support bundle", () => {
  it("combines preflight, diagnostics, scene, and redacted profile summaries", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);
    const snapshot = {
      state: { status: "live" as const },
      health: health({ bitrateKbps: 3600, fps: 30, message: `Publishing ${streamKey}` })
    };
    const healthSamples = [
      {
        at: "2026-06-23T00:00:01.000Z",
        status: "live" as const,
        elapsedSeconds: 1,
        bitrateKbps: 3600,
        fps: 30,
        droppedFrames: 0,
        reconnectAttempts: 0
      },
      {
        at: "2026-06-23T00:00:05.000Z",
        status: "live" as const,
        elapsedSeconds: 5,
        bitrateKbps: 3500,
        fps: 30,
        droppedFrames: 0,
        reconnectAttempts: 0
      }
    ];
    const sessionSummary = createStreamSessionSummary({
      events: [],
      healthSamples,
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:06.000Z")
    });
    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      snapshot,
      [],
      healthSamples,
      sessionSummary ? [sessionSummary] : []
    );
    const preflight = createStreamStartPreflightReport({
      readiness,
      streamStatus: snapshot.state.status
    });

    const bundle = createSupportBundle({
      scene,
      profile,
      readiness,
      preflight,
      diagnostics,
      now: new Date("2026-06-23T00:00:00.000Z")
    });

    expect(bundle.app).toEqual({ name: "MobileLiveCaster", reportVersion: 1, bundleVersion: 1 });
    expect(bundle.generatedAt).toBe("2026-06-23T00:00:00.000Z");
    expect(bundle.summary.sourceCount).toBe(scene.sources.length);
    expect(bundle.scene.sourceCounts.pngtuber).toBe(1);
    expect(bundle.profile.destination.streamKeyPreview).toBe(redactStreamKey(streamKey));
    expect(bundle.profile.platformPublishing.titleLength).toBe(profile.platformPublishing.title.length);
    expect(bundle.diagnostics.telemetry.message).toContain(redactStreamKey(streamKey));
    expect(bundle.summary.completedSessionCount).toBe(1);
    expect(bundle.summary.sessionCleanRate).toBe(100);
    expect(bundle.summary.sessionHistoryStability).toBe("watch");
    expect(bundle.summary.lastSessionOutcome).toBe("clean");
    expect(bundle.summary.qualityAdvisorAction).toBe("maintain");
    expect(bundle.summary.qualityAdvisorSeverity).toBe("pass");
    expect(bundle.summary.suggestedQualityTarget).toBeNull();
    expect(bundle.summary.validationStatus).toBe("needs-test");
    expect(bundle.summary.validationFailCount).toBe(0);
    expect(bundle.summary.validationWarningCount).toBeGreaterThan(0);
    expect(formatSupportBundle(bundle)).toContain("Completed summaries: 1");
    expect(formatSupportBundle(bundle)).toContain("Clean rate: 100%");
    expect(formatSupportBundle(bundle)).toContain("Quality advisor: maintain / pass");
    expect(formatSupportBundle(bundle)).toContain("Commercial Validation");
  });

  it("serializes and formats without leaking raw stream keys or text source content", () => {
    const baseScene = createDefaultScene();
    const textSource = baseScene.sources.find((source) => source.kind === "text");
    if (!textSource || textSource.kind !== "text") {
      throw new Error("Default scene needs a text source for this test.");
    }
    const scene = {
      ...baseScene,
      sources: [
        ...baseScene.sources,
        {
          ...textSource,
          id: "source-sensitive-label",
          text: `private label ${streamKey}`
        }
      ]
    };
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health({ message: `Ready ${streamKey}` })
    });
    const preflight = createStreamStartPreflightReport({
      readiness,
      streamStatus: "idle"
    });

    const bundle = createSupportBundle({ scene, profile, readiness, preflight, diagnostics });
    const json = serializeSupportBundle(bundle);
    const text = formatSupportBundle(bundle);

    expect(json).toContain(redactStreamKey(streamKey));
    expect(text).toContain(redactStreamKey(streamKey));
    expect(json).not.toContain(streamKey);
    expect(text).not.toContain(streamKey);
    expect(json).not.toContain("private label");
    expect(bundle.scene.sources.find((source) => source.id === "source-sensitive-label")?.payload.textLength).toBeGreaterThan(0);
  });
});
