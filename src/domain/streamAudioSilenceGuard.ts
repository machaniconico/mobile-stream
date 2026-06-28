import type { BroadcastMixerProfile } from "./profiles";
import type { StreamHealthSample } from "./streamHealthHistory";
import {
  summarizeStreamAudioLevels,
  type StreamAudioLevelSample
} from "./streamSessionSummary";
import type { StreamStatus } from "./streamState";

export type BroadcastAudioSilenceGuardStatus = "pass" | "warn" | "info";

export interface BroadcastAudioSilenceGuardDiagnostics {
  status: BroadcastAudioSilenceGuardStatus;
  sampleCount: number;
  activePercent: number;
  peakLevel: number;
  micExpected: boolean;
  summary: string;
  recommendation: string;
}

export interface BroadcastAudioSilenceGuardInput {
  samples: StreamAudioLevelSample[];
  healthSamples: StreamHealthSample[];
  broadcastMixer: BroadcastMixerProfile;
  streamStatus: StreamStatus;
  elapsedSeconds: number;
}

const liveStatuses = new Set<StreamStatus>(["live", "reconnecting"]);
const minLiveElapsedSeconds = 15;
const minCurrentSamples = 3;
const silentPeakLevel = 0.03;
const lowPeakLevel = 0.08;
const lowActivePercent = 15;

export const createBroadcastAudioSilenceGuardDiagnostics = ({
  samples,
  healthSamples,
  broadcastMixer,
  streamStatus,
  elapsedSeconds
}: BroadcastAudioSilenceGuardInput): BroadcastAudioSilenceGuardDiagnostics => {
  const micExpected = !broadcastMixer.mic.muted && broadcastMixer.mic.volume > 0;
  const currentSamples = selectCurrentStreamAudioSamples(samples, healthSamples);
  const summary = summarizeStreamAudioLevels(currentSamples);
  const base = {
    sampleCount: summary.sampleCount,
    activePercent: summary.activePercent,
    peakLevel: summary.peakLevel,
    micExpected
  };

  if (!liveStatuses.has(streamStatus)) {
    return {
      ...base,
      status: "info",
      summary: "Audio silence guard starts after the stream is live.",
      recommendation: "Run a private live segment to collect current mic activity before public streaming."
    };
  }

  if (!micExpected) {
    return {
      ...base,
      status: "info",
      summary: "Mic channel is not expected in the broadcast mix.",
      recommendation: "Unmute the mic channel if voice should be included in the broadcast."
    };
  }

  if (elapsedSeconds < minLiveElapsedSeconds) {
    return {
      ...base,
      status: "info",
      summary: `Audio silence guard is warming up for the first ${minLiveElapsedSeconds} seconds of the live session.`,
      recommendation: "Keep speaking during the private preflight so the guard can retain current mic samples."
    };
  }

  if (summary.sampleCount < minCurrentSamples) {
    return {
      ...base,
      status: "warn",
      summary: `Mic channel is live, but only ${summary.sampleCount} current audio activity sample${summary.sampleCount === 1 ? "" : "s"} are retained.`,
      recommendation: "Check mic permission, input device, broadcast mixer level, and headphone monitor before staying public."
    };
  }

  if (summary.peakLevel < silentPeakLevel || summary.activePercent === 0) {
    return {
      ...base,
      status: "warn",
      summary: `Mic channel is live, but current audio activity is silent: peak ${Math.round(summary.peakLevel * 100)}%, active ${summary.activePercent}%.`,
      recommendation: "Confirm the mic source is moving, the OS permission is granted, and the broadcast mixer mic channel is audible."
    };
  }

  if (summary.peakLevel < lowPeakLevel || summary.activePercent < lowActivePercent) {
    return {
      ...base,
      status: "warn",
      summary: `Mic activity is very low: peak ${Math.round(summary.peakLevel * 100)}%, active ${summary.activePercent}%.`,
      recommendation: "Raise input gain or mixer volume slightly, then repeat the spoken private monitor check."
    };
  }

  return {
    ...base,
    status: "pass",
    summary: `Mic activity is present: ${summary.sampleCount} samples, peak ${Math.round(summary.peakLevel * 100)}%, active ${summary.activePercent}%.`,
    recommendation: "Keep this current mic activity baseline with the live validation evidence."
  };
};

const selectCurrentStreamAudioSamples = (
  samples: StreamAudioLevelSample[],
  healthSamples: StreamHealthSample[]
): StreamAudioLevelSample[] => {
  if (healthSamples.length === 0) {
    return samples;
  }

  const startedAt = healthSamples[0]?.at;
  if (!startedAt) {
    return samples;
  }

  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) {
    return samples.filter((sample) => sample.at >= startedAt);
  }

  return samples.filter((sample) => {
    const sampleAtMs = Date.parse(sample.at);
    return Number.isFinite(sampleAtMs) ? sampleAtMs >= startedAtMs : sample.at >= startedAt;
  });
};
