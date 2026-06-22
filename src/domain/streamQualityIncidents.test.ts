import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile } from "./profiles";
import {
  createStreamQualityIncidents,
  createStreamQualityIncidentThresholds,
  summarizeStreamQualityIncidents,
  type StreamQualityIncidentSnapshot
} from "./streamQualityIncidents";
import { initialStreamState, type StreamHealth } from "./streamState";

const quality = createDefaultStudioProfile().quality;

const health = (update: Partial<StreamHealth> = {}): StreamHealth => ({
  ...initialStreamState.health,
  ...update
});

const snapshot = (
  status: StreamQualityIncidentSnapshot["state"]["status"],
  update: Partial<StreamHealth> = {}
): StreamQualityIncidentSnapshot => ({
  state: { status },
  health: health(update)
});

describe("stream quality incidents", () => {
  it("returns no incidents while the stream is not live", () => {
    const incidents = createStreamQualityIncidents(snapshot("idle", { bitrateKbps: 0, fps: 0, elapsedSeconds: 20 }), quality);

    expect(incidents).toEqual([]);
    expect(summarizeStreamQualityIncidents(incidents)).toBe("No active quality incidents.");
  });

  it("returns no incidents for healthy live telemetry", () => {
    const incidents = createStreamQualityIncidents(
      snapshot("live", {
        bitrateKbps: quality.videoBitrateKbps,
        fps: quality.fps,
        elapsedSeconds: 20
      }),
      quality
    );

    expect(incidents).toEqual([]);
  });

  it("calculates quality thresholds from the configured profile", () => {
    expect(createStreamQualityIncidentThresholds(quality)).toEqual({
      minimumHealthyBitrateKbps: 2625,
      minimumRecoverableBitrateKbps: 1225,
      minimumHealthyFps: 25,
      minimumRecoverableFps: 18
    });
  });

  it("reports critical missing telemetry after startup grace", () => {
    const incidents = createStreamQualityIncidents(
      snapshot("live", {
        bitrateKbps: 0,
        fps: 0,
        elapsedSeconds: 8
      }),
      quality
    );

    expect(incidents.map((incident) => incident.code)).toEqual(["bitrate-missing", "fps-missing"]);
    expect(incidents.every((incident) => incident.severity === "fail")).toBe(true);
  });

  it("reports low bitrate, low fps, dropped frames, and reconnects", () => {
    const incidents = createStreamQualityIncidents(
      snapshot("reconnecting", {
        bitrateKbps: 1400,
        fps: 22,
        droppedFrames: 4,
        reconnectAttempts: 1,
        elapsedSeconds: 30
      }),
      quality
    );

    expect(incidents.map((incident) => incident.code)).toEqual([
      "bitrate-low",
      "fps-low",
      "dropped-frames",
      "reconnects"
    ]);
    expect(summarizeStreamQualityIncidents(incidents)).toBe("4 quality warnings active.");
  });

  it("summarizes critical and warning incidents together", () => {
    const incidents = createStreamQualityIncidents(
      snapshot("live", {
        bitrateKbps: 800,
        fps: 12,
        droppedFrames: 2,
        elapsedSeconds: 30
      }),
      quality
    );

    expect(incidents.map((incident) => incident.code)).toEqual(["bitrate-critical", "fps-critical", "dropped-frames"]);
    expect(summarizeStreamQualityIncidents(incidents)).toBe("2 critical quality incidents and 1 warning active.");
  });
});
