import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile, redactStreamKey } from "./profiles";
import { createReadinessReport } from "./readiness";
import { createDefaultScene } from "./scene";
import {
  createStreamDiagnosticReport,
  createStreamDiagnostics,
  formatStreamDiagnosticReport,
  serializeStreamDiagnosticReport
} from "./streamDiagnostics";
import { initialStreamState, type StreamHealth } from "./streamState";

const health = (update: Partial<StreamHealth> = {}): StreamHealth => ({
  ...initialStreamState.health,
  ...update
});
const demoStreamKey = "stream-demo";

describe("stream diagnostics", () => {
  it("combines readiness, target, and redacted publish URL details", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });

    expect(diagnostics.status).toBe("pass");
    expect(diagnostics.target.platform).toBe("YouTube Live");
    expect(diagnostics.target.host).toBe("a.rtmps.youtube.com");
    expect(diagnostics.target.publishUrlPreview).toContain(redactStreamKey(demoStreamKey));
    expect(diagnostics.target.publishUrlPreview).not.toContain(demoStreamKey);
    expect(diagnostics.quality.estimatedUploadKbps).toBe(4535);
    expect(diagnostics.recovery.mode).toBe("idle");
    expect(diagnostics.recovery.attemptsRemaining).toBe(5);
  });

  it("reports blocking checks when the stream key is missing", () => {
    const scene = createDefaultScene();
    const profile = createDefaultStudioProfile();
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });

    expect(diagnostics.status).toBe("fail");
    expect(diagnostics.checks.some((check) => check.code === "stream-key-missing")).toBe(true);
    expect(diagnostics.summary).toContain("blocking");
  });

  it("flags weak live telemetry against the configured quality target", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({
        bitrateKbps: 1200,
        fps: 18,
        droppedFrames: 3,
        reconnectAttempts: 1,
        elapsedSeconds: 12,
        message: "Live"
      })
    });

    expect(diagnostics.status).toBe("fail");
    expect(diagnostics.recovery.recommendedAction).toBe("reconnect");
    expect(diagnostics.qualityIncidents.summary).toContain("critical");
    expect(diagnostics.qualityIncidents.incidents.map((incident) => incident.code)).toEqual(
      expect.arrayContaining(["bitrate-critical", "fps-low", "dropped-frames", "reconnects"])
    );
    expect(diagnostics.checks.map((check) => check.code)).toEqual(
      expect.arrayContaining([
        "telemetry-bitrate-low",
        "telemetry-fps-low",
        "telemetry-drops-present",
        "telemetry-reconnects",
        "quality-incidents-critical",
        "recovery-watching"
      ])
    );
  });

  it("redacts stream keys that appear before the final publish URL segment", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        platform: "custom" as const,
        presetId: "custom-rtmps" as const,
        serverUrl: "rtmps://live.example.test/app/{stream_key}/primary",
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });

    expect(diagnostics.target.publishUrlPreview).toContain(redactStreamKey(demoStreamKey));
    expect(diagnostics.target.publishUrlPreview).not.toContain(demoStreamKey);
  });

  it("redacts stream keys from endpoint application paths", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        platform: "custom" as const,
        presetId: "custom-rtmps" as const,
        serverUrl: `rtmps://live.example.test/app/${demoStreamKey}`,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    }, [
      {
        id: "event-1",
        at: "2026-06-22T00:00:00.000Z",
        kind: "operation",
        severity: "fail",
        title: "Start failed",
        message: `RTMP rejected ${demoStreamKey}`
      }
    ]);
    const report = serializeStreamDiagnosticReport(createStreamDiagnosticReport(diagnostics, new Date("2026-06-22T00:00:00.000Z")));

    expect(diagnostics.target.application).toContain(redactStreamKey(demoStreamKey));
    expect(diagnostics.target.application).not.toContain(demoStreamKey);
    expect(diagnostics.session.events[0].message).toContain(redactStreamKey(demoStreamKey));
    expect(diagnostics.session.events[0].message).not.toContain(demoStreamKey);
    expect(report).not.toContain(demoStreamKey);
  });

  it("fails diagnostics when the engine snapshot is failed", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "failed" },
      health: health({ message: "RTMP handshake failed" })
    });

    expect(diagnostics.status).toBe("fail");
    expect(diagnostics.summary).toContain("blocking");
    expect(diagnostics.checks.some((check) => check.code === "engine-failed")).toBe(true);
    expect(diagnostics.recovery.mode).toBe("failed");
    expect(diagnostics.recovery.nextRetryDelayMs).toBe(1000);
  });

  it("redacts stream keys from engine health messages", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "failed" },
      health: health({ message: `RTMP handshake failed for ${demoStreamKey}` })
    });

    expect(diagnostics.telemetry.message).toContain(redactStreamKey(demoStreamKey));
    expect(diagnostics.telemetry.message).not.toContain(demoStreamKey);
    expect(diagnostics.checks.find((check) => check.code === "engine-failed")?.message).not.toContain(demoStreamKey);
  });

  it("serializes a shareable diagnostic report without raw stream keys", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({ message: `Publishing with ${demoStreamKey}`, bitrateKbps: 3600, fps: 30 })
    });

    const report = createStreamDiagnosticReport(diagnostics, new Date("2026-06-22T00:00:00.000Z"));
    const json = serializeStreamDiagnosticReport(report);
    const text = formatStreamDiagnosticReport(report);

    expect(report.app).toEqual({ name: "MobileLiveCaster", reportVersion: 1 });
    expect(report.generatedAt).toBe("2026-06-22T00:00:00.000Z");
    expect(json).toContain("MobileLiveCaster");
    expect(text).toContain("MobileLiveCaster Diagnostics");
    expect(text).toContain("Recovery");
    expect(text).toContain("Active Quality Incidents");
    expect(text).toContain("Health History");
    expect(text).toContain("Session Events");
    expect(json).toContain("backoffWindow");
    expect(json).toContain("qualityIncidents");
    expect(json).toContain("history");
    expect(json).toContain(redactStreamKey(demoStreamKey));
    expect(text).toContain(redactStreamKey(demoStreamKey));
    expect(json).not.toContain(demoStreamKey);
    expect(text).not.toContain(demoStreamKey);
  });
});
