import type { QualityProfile } from "./profiles";
import type { NativeRuntimeDevice, NativeRuntimeTelemetry } from "./nativeRuntime";
import type { StreamHealth, StreamStatus } from "./streamState";

export type StreamQualityIncidentCode =
  | "bitrate-missing"
  | "bitrate-critical"
  | "bitrate-low"
  | "fps-missing"
  | "fps-critical"
  | "fps-low"
  | "thermal-fair"
  | "thermal-serious"
  | "thermal-critical"
  | "battery-low"
  | "battery-critical"
  | "low-power-mode"
  | "dropped-frames"
  | "reconnects";
export type StreamQualityIncidentSeverity = "warn" | "fail";

export interface StreamQualityIncident {
  code: StreamQualityIncidentCode;
  severity: StreamQualityIncidentSeverity;
  label: string;
  message: string;
  recommendation: string;
}

export interface StreamQualityIncidentSnapshot {
  state: {
    status: StreamStatus;
  };
  health: StreamHealth;
  nativeRuntime?: Pick<NativeRuntimeTelemetry, "device"> | null;
}

export interface StreamQualityIncidentThresholds {
  minimumHealthyBitrateKbps: number;
  minimumRecoverableBitrateKbps: number;
  minimumHealthyFps: number;
  minimumRecoverableFps: number;
}

const degradedBitrateRatio = 0.75;
const criticalBitrateRatio = 0.35;
const degradedFpsTolerance = 5;
const criticalFpsTolerance = 12;
const telemetryStartupGraceSeconds = 5;

export const createStreamQualityIncidentThresholds = (
  quality: Pick<QualityProfile, "fps" | "videoBitrateKbps">
): StreamQualityIncidentThresholds => ({
  minimumHealthyBitrateKbps: Math.round(quality.videoBitrateKbps * degradedBitrateRatio),
  minimumRecoverableBitrateKbps: Math.round(quality.videoBitrateKbps * criticalBitrateRatio),
  minimumHealthyFps: Math.max(1, quality.fps - degradedFpsTolerance),
  minimumRecoverableFps: Math.max(1, quality.fps - criticalFpsTolerance)
});

export const createStreamQualityIncidents = (
  snapshot: StreamQualityIncidentSnapshot,
  quality: Pick<QualityProfile, "fps" | "videoBitrateKbps">
): StreamQualityIncident[] => {
  if (snapshot.state.status !== "live" && snapshot.state.status !== "reconnecting") {
    return [];
  }

  const thresholds = createStreamQualityIncidentThresholds(quality);
  return [
    createBitrateIncident(snapshot.health, thresholds),
    createFpsIncident(snapshot.health, quality.fps, thresholds),
    ...createDeviceResourceIncidents(snapshot.nativeRuntime?.device),
    createDroppedFramesIncident(snapshot.health),
    createReconnectIncident(snapshot.health)
  ].filter((incident): incident is StreamQualityIncident => Boolean(incident));
};

export const summarizeStreamQualityIncidents = (incidents: StreamQualityIncident[]): string => {
  if (incidents.length === 0) {
    return "No active quality incidents.";
  }

  const failures = incidents.filter((incident) => incident.severity === "fail").length;
  const warnings = incidents.length - failures;
  if (failures > 0) {
    return `${failures} critical quality incident${failures === 1 ? "" : "s"} and ${warnings} warning${warnings === 1 ? "" : "s"} active.`;
  }
  return `${warnings} quality warning${warnings === 1 ? "" : "s"} active.`;
};

const createBitrateIncident = (
  health: StreamHealth,
  thresholds: StreamQualityIncidentThresholds
): StreamQualityIncident | null => {
  if (health.elapsedSeconds >= telemetryStartupGraceSeconds && health.bitrateKbps <= 0) {
    return {
      code: "bitrate-missing",
      severity: "fail",
      label: "Bitrate missing",
      message: "No bitrate telemetry is being reported after startup grace.",
      recommendation: "Check encoder output, ingest connection, and platform stream key before continuing."
    };
  }

  if (health.bitrateKbps > 0 && health.bitrateKbps < thresholds.minimumRecoverableBitrateKbps) {
    return {
      code: "bitrate-critical",
      severity: "fail",
      label: "Bitrate critical",
      message: `${health.bitrateKbps} kbps is below the recovery threshold (${thresholds.minimumRecoverableBitrateKbps} kbps).`,
      recommendation: "Reconnect or lower the video quality target before the stream becomes unstable."
    };
  }

  if (health.bitrateKbps > 0 && health.bitrateKbps < thresholds.minimumHealthyBitrateKbps) {
    return {
      code: "bitrate-low",
      severity: "warn",
      label: "Bitrate low",
      message: `${health.bitrateKbps} kbps is below the healthy threshold (${thresholds.minimumHealthyBitrateKbps} kbps).`,
      recommendation: "Watch for continued instability and consider lowering resolution or bitrate."
    };
  }

  return null;
};

const createFpsIncident = (
  health: StreamHealth,
  targetFps: number,
  thresholds: StreamQualityIncidentThresholds
): StreamQualityIncident | null => {
  if (health.elapsedSeconds >= telemetryStartupGraceSeconds && health.fps <= 0) {
    return {
      code: "fps-missing",
      severity: "fail",
      label: "FPS missing",
      message: "No FPS telemetry is being reported after startup grace.",
      recommendation: "Check capture and encoder state before continuing."
    };
  }

  if (health.fps > 0 && health.fps < thresholds.minimumRecoverableFps) {
    return {
      code: "fps-critical",
      severity: "fail",
      label: "FPS critical",
      message: `${health.fps} fps is far below the ${targetFps} fps target.`,
      recommendation: "Reduce scene complexity, lower capture FPS, or reconnect if the encoder is stalled."
    };
  }

  if (health.fps > 0 && health.fps < thresholds.minimumHealthyFps) {
    return {
      code: "fps-low",
      severity: "warn",
      label: "FPS low",
      message: `${health.fps} fps is below the healthy threshold (${thresholds.minimumHealthyFps} fps).`,
      recommendation: "Watch CPU/GPU load and reduce scene complexity if this persists."
    };
  }

  return null;
};

const createDeviceResourceIncidents = (
  device: NativeRuntimeDevice | undefined
): StreamQualityIncident[] => {
  if (!device) {
    return [];
  }

  return [
    createThermalIncident(device),
    createBatteryIncident(device),
    createLowPowerModeIncident(device)
  ].filter((incident): incident is StreamQualityIncident => Boolean(incident));
};

const createThermalIncident = (device: NativeRuntimeDevice): StreamQualityIncident | null => {
  if (device.thermalState === "critical") {
    return {
      code: "thermal-critical",
      severity: "fail",
      label: "Thermal critical",
      message: "The operating system reports critical thermal pressure.",
      recommendation: "Stop the stream if the device does not cool immediately, remove the case, and avoid charging until temperature drops."
    };
  }

  if (device.thermalState === "serious") {
    return {
      code: "thermal-serious",
      severity: "fail",
      label: "Thermal pressure",
      message: "The operating system reports serious thermal pressure that can throttle capture and encoding.",
      recommendation: "Lower the stream to 30 fps and a safer bitrate now; stop if thermal pressure continues to rise."
    };
  }

  if (device.thermalState === "fair") {
    return {
      code: "thermal-fair",
      severity: "warn",
      label: "Device warming",
      message: "The operating system reports elevated thermal pressure.",
      recommendation: "Improve airflow and watch FPS; reduce scene complexity or quality if the device reaches serious pressure."
    };
  }

  return null;
};

const createBatteryIncident = (device: NativeRuntimeDevice): StreamQualityIncident | null => {
  const externallyPowered = device.charging || device.powerSource === "wired" || device.powerSource === "wireless";
  if (device.batteryLevelPercent < 0 || externallyPowered) {
    return null;
  }

  if (device.batteryLevelPercent <= 10) {
    return {
      code: "battery-critical",
      severity: "fail",
      label: "Battery critical",
      message: `Battery is ${device.batteryLevelPercent}% and the device is not externally powered.`,
      recommendation: "Connect a stable power source or stop the stream before the device shuts down."
    };
  }

  if (device.batteryLevelPercent <= 20) {
    return {
      code: "battery-low",
      severity: "warn",
      label: "Battery low",
      message: `Battery is ${device.batteryLevelPercent}% and the device is not externally powered.`,
      recommendation: "Connect power before a long stream and monitor temperature while charging."
    };
  }

  return null;
};

const createLowPowerModeIncident = (device: NativeRuntimeDevice): StreamQualityIncident | null =>
  device.lowPowerMode
    ? {
        code: "low-power-mode",
        severity: "warn",
        label: "Power saving enabled",
        message: "The operating system power-saving mode is active and may reduce CPU or GPU performance.",
        recommendation: "Disable power saving before a long stream or use a 30 fps quality target."
      }
    : null;

const createDroppedFramesIncident = (health: StreamHealth): StreamQualityIncident | null => {
  if (health.droppedFrames <= 0) {
    return null;
  }

  return {
    code: "dropped-frames",
    severity: "warn",
    label: "Dropped frames",
    message: `${health.droppedFrames} dropped frame${health.droppedFrames === 1 ? "" : "s"} reported this session.`,
    recommendation: "Watch network and encoder load; reduce bitrate if dropped frames keep increasing."
  };
};

const createReconnectIncident = (health: StreamHealth): StreamQualityIncident | null => {
  if (health.reconnectAttempts <= 0) {
    return null;
  }

  return {
    code: "reconnects",
    severity: "warn",
    label: "Reconnect attempts",
    message: `${health.reconnectAttempts} reconnect attempt${health.reconnectAttempts === 1 ? "" : "s"} reported.`,
    recommendation: "Inspect ingest stability and platform status before starting another long session."
  };
};
