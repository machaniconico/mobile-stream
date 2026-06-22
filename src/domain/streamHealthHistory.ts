import type { StreamHealth, StreamStatus } from "./streamState";

export type StreamHealthHistoryStability = "unknown" | "stable" | "watch" | "unstable";

export interface StreamHealthSample {
  at: string;
  status: "live" | "reconnecting";
  elapsedSeconds: number;
  bitrateKbps: number;
  fps: number;
  droppedFrames: number;
  reconnectAttempts: number;
}

export interface StreamHealthHistorySummary {
  sampleCount: number;
  durationSeconds: number;
  averageBitrateKbps: number;
  minimumBitrateKbps: number;
  maximumBitrateKbps: number;
  averageFps: number;
  minimumFps: number;
  droppedFrameIncrease: number;
  observedDroppedFrames: number;
  observedReconnectAttempts: number;
  stability: StreamHealthHistoryStability;
  summary: string;
}

export interface StreamHealthHistorySnapshot {
  state: {
    status: StreamStatus;
  };
  health: StreamHealth;
}

export const maxStreamHealthSamples = 300;

export const createStreamHealthSample = (
  snapshot: StreamHealthHistorySnapshot,
  now: Date = new Date()
): StreamHealthSample | null => {
  if (snapshot.state.status !== "live" && snapshot.state.status !== "reconnecting") {
    return null;
  }

  return {
    at: now.toISOString(),
    status: snapshot.state.status,
    elapsedSeconds: snapshot.health.elapsedSeconds,
    bitrateKbps: snapshot.health.bitrateKbps,
    fps: snapshot.health.fps,
    droppedFrames: snapshot.health.droppedFrames,
    reconnectAttempts: snapshot.health.reconnectAttempts
  };
};

export const appendStreamHealthSample = (
  samples: StreamHealthSample[],
  sample: StreamHealthSample | null,
  maxSamples = maxStreamHealthSamples
): StreamHealthSample[] => {
  if (!sample) {
    return samples;
  }

  const previous = samples.at(-1);
  if (previous && isDuplicateSample(previous, sample)) {
    return samples;
  }

  return [...samples, sample].slice(-Math.max(1, maxSamples));
};

export const summarizeStreamHealthHistory = (
  samples: StreamHealthSample[],
  target: { bitrateKbps: number; fps: number }
): StreamHealthHistorySummary => {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      durationSeconds: 0,
      averageBitrateKbps: 0,
      minimumBitrateKbps: 0,
      maximumBitrateKbps: 0,
      averageFps: 0,
      minimumFps: 0,
      droppedFrameIncrease: 0,
      observedDroppedFrames: 0,
      observedReconnectAttempts: 0,
      stability: "unknown",
      summary: "No stream health history captured yet."
    };
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const bitrateValues = samples.map((sample) => sample.bitrateKbps);
  const fpsValues = samples.map((sample) => sample.fps);
  const observedDroppedFrames = Math.max(...samples.map((sample) => sample.droppedFrames));
  const observedReconnectAttempts = Math.max(...samples.map((sample) => sample.reconnectAttempts));
  const droppedFrameIncrease = Math.max(0, last.droppedFrames - first.droppedFrames);
  const averageBitrateKbps = Math.round(average(bitrateValues));
  const averageFps = roundOneDecimal(average(fpsValues));
  const minimumBitrateKbps = Math.min(...bitrateValues);
  const minimumFps = Math.min(...fpsValues);
  const stability = summarizeStability({
    sampleCount: samples.length,
    averageBitrateKbps,
    minimumBitrateKbps,
    averageFps,
    minimumFps,
    droppedFrameIncrease,
    observedReconnectAttempts,
    target
  });

  return {
    sampleCount: samples.length,
    durationSeconds: Math.max(0, last.elapsedSeconds - first.elapsedSeconds),
    averageBitrateKbps,
    minimumBitrateKbps,
    maximumBitrateKbps: Math.max(...bitrateValues),
    averageFps,
    minimumFps,
    droppedFrameIncrease,
    observedDroppedFrames,
    observedReconnectAttempts,
    stability,
    summary: createHistorySummary(stability, averageBitrateKbps, averageFps, droppedFrameIncrease, observedReconnectAttempts)
  };
};

const isDuplicateSample = (previous: StreamHealthSample, sample: StreamHealthSample): boolean =>
  previous.status === sample.status &&
  previous.elapsedSeconds === sample.elapsedSeconds &&
  previous.bitrateKbps === sample.bitrateKbps &&
  previous.fps === sample.fps &&
  previous.droppedFrames === sample.droppedFrames &&
  previous.reconnectAttempts === sample.reconnectAttempts;

const average = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

const roundOneDecimal = (value: number): number => Math.round(value * 10) / 10;

const summarizeStability = ({
  sampleCount,
  averageBitrateKbps,
  minimumBitrateKbps,
  averageFps,
  minimumFps,
  droppedFrameIncrease,
  observedReconnectAttempts,
  target
}: {
  sampleCount: number;
  averageBitrateKbps: number;
  minimumBitrateKbps: number;
  averageFps: number;
  minimumFps: number;
  droppedFrameIncrease: number;
  observedReconnectAttempts: number;
  target: { bitrateKbps: number; fps: number };
}): StreamHealthHistoryStability => {
  if (sampleCount < 2) {
    return "unknown";
  }

  const criticalBitrate = Math.round(target.bitrateKbps * 0.35);
  const lowBitrate = Math.round(target.bitrateKbps * 0.75);
  const criticalFps = Math.max(1, target.fps - 12);
  const lowFps = Math.max(1, target.fps - 5);

  const bitrateIsCritical = minimumBitrateKbps > 0 && minimumBitrateKbps < criticalBitrate;
  const fpsIsCritical = minimumFps > 0 && minimumFps < criticalFps;

  if (bitrateIsCritical || fpsIsCritical || observedReconnectAttempts > 0) {
    return "unstable";
  }

  if (averageBitrateKbps < lowBitrate || averageFps < lowFps || droppedFrameIncrease > 0) {
    return "watch";
  }

  return "stable";
};

const createHistorySummary = (
  stability: StreamHealthHistoryStability,
  averageBitrateKbps: number,
  averageFps: number,
  droppedFrameIncrease: number,
  observedReconnectAttempts: number
): string => {
  if (stability === "unknown") {
    return "Collecting stream health history.";
  }

  const base = `Avg ${averageBitrateKbps} kbps / ${averageFps} fps, +${droppedFrameIncrease} drops, ${observedReconnectAttempts} reconnects.`;
  if (stability === "stable") {
    return `Stable history. ${base}`;
  }
  if (stability === "watch") {
    return `Watch history. ${base}`;
  }
  return `Unstable history. ${base}`;
};
