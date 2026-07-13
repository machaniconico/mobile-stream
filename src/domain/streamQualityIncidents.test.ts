import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile } from "./profiles";
import {
  createStreamQualityIncidents,
  createStreamQualityIncidentThresholds,
  summarizeStreamQualityIncidents,
  type StreamQualityIncidentSnapshot
} from "./streamQualityIncidents";
import { initialStreamState, type StreamHealth } from "./streamState";
import type { NativeRuntimeDevice } from "./nativeRuntime";

const quality = createDefaultStudioProfile().quality;

const health = (update: Partial<StreamHealth> = {}): StreamHealth => ({
  ...initialStreamState.health,
  ...update
});

const snapshot = (
  status: StreamQualityIncidentSnapshot["state"]["status"],
  update: Partial<StreamHealth> = {},
  device?: NativeRuntimeDevice
): StreamQualityIncidentSnapshot => ({
  state: { status },
  health: health(update),
  nativeRuntime: device ? { device } : null
});

const device = (update: Partial<NativeRuntimeDevice> = {}): NativeRuntimeDevice => ({
  thermalState: "nominal",
  thermalStatusCode: 0,
  batteryLevelPercent: 80,
  charging: false,
  lowPowerMode: false,
  powerSource: "battery",
  memoryPressureState: "normal",
  availableMemoryBytes: 512 * 1024 * 1024,
  memoryThresholdBytes: 128 * 1024 * 1024,
  sampledAt: Date.parse("2026-07-13T00:00:00.000Z"),
  ...update
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

  it("reports warming, low battery, and power-saving pressure", () => {
    const incidents = createStreamQualityIncidents(
      snapshot(
        "live",
        { bitrateKbps: quality.videoBitrateKbps, fps: quality.fps, elapsedSeconds: 30 },
        device({ thermalState: "fair", batteryLevelPercent: 18, lowPowerMode: true })
      ),
      quality
    );

    expect(incidents.map((incident) => incident.code)).toEqual([
      "thermal-fair",
      "battery-low",
      "low-power-mode"
    ]);
    expect(incidents.every((incident) => incident.severity === "warn")).toBe(true);
  });

  it("treats serious thermal pressure as a critical quality incident", () => {
    const incidents = createStreamQualityIncidents(
      snapshot(
        "live",
        { bitrateKbps: quality.videoBitrateKbps, fps: quality.fps, elapsedSeconds: 30 },
        device({ thermalState: "serious" })
      ),
      quality
    );

    expect(incidents).toContainEqual(expect.objectContaining({ code: "thermal-serious", severity: "fail" }));
  });

  it("reports warning and critical operating-system memory pressure", () => {
    const warning = createStreamQualityIncidents(
      snapshot(
        "live",
        { bitrateKbps: quality.videoBitrateKbps, fps: quality.fps, elapsedSeconds: 30 },
        device({ memoryPressureState: "warning", availableMemoryBytes: 96 * 1024 * 1024 })
      ),
      quality
    );
    const critical = createStreamQualityIncidents(
      snapshot(
        "live",
        { bitrateKbps: quality.videoBitrateKbps, fps: quality.fps, elapsedSeconds: 30 },
        device({ memoryPressureState: "critical", availableMemoryBytes: 48 * 1024 * 1024 })
      ),
      quality
    );

    expect(warning).toContainEqual(
      expect.objectContaining({ code: "memory-warning", severity: "warn", message: expect.stringContaining("96 MiB") })
    );
    expect(critical).toContainEqual(
      expect.objectContaining({ code: "memory-critical", severity: "fail", message: expect.stringContaining("48 MiB") })
    );
  });

  it("fails closed for critical heat and an unplugged critical battery", () => {
    const incidents = createStreamQualityIncidents(
      snapshot(
        "reconnecting",
        { bitrateKbps: quality.videoBitrateKbps, fps: quality.fps, elapsedSeconds: 30 },
        device({ thermalState: "critical", batteryLevelPercent: 5 })
      ),
      quality
    );

    expect(incidents.map((incident) => incident.code)).toEqual(["thermal-critical", "battery-critical"]);
    expect(incidents.every((incident) => incident.severity === "fail")).toBe(true);
  });

  it("does not warn about low battery while externally powered or when the stream is idle", () => {
    const powered = createStreamQualityIncidents(
      snapshot(
        "live",
        { bitrateKbps: quality.videoBitrateKbps, fps: quality.fps, elapsedSeconds: 30 },
        device({ batteryLevelPercent: 5, charging: false, powerSource: "wired" })
      ),
      quality
    );
    const idle = createStreamQualityIncidents(
      snapshot("idle", { elapsedSeconds: 30 }, device({ thermalState: "critical", batteryLevelPercent: 5 })),
      quality
    );

    expect(powered).toEqual([]);
    expect(idle).toEqual([]);
  });
});
