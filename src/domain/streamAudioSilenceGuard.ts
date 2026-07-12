import type { BroadcastMixerProfile } from "./profiles";
import type { StreamHealthSample } from "./streamHealthHistory";
import {
  createStreamAudioLevelSample,
  summarizeStreamAudioLevels,
  type StreamAudioLevelSample
} from "./streamSessionSummary";
import type { NativeRuntimeTelemetry } from "./nativeRuntime";
import type { StreamStatus } from "./streamState";

export type BroadcastAudioSilenceGuardStatus = "pass" | "warn" | "info";

export interface BroadcastAudioSilenceGuardDiagnostics {
  status: BroadcastAudioSilenceGuardStatus;
  evidenceSource: "native-pcm" | "simulated" | "none";
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
  nativeRuntime?: Pick<NativeRuntimeTelemetry, "platform" | "stale" | "audioProcessing"> | null;
  now?: number | Date;
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
  elapsedSeconds,
  nativeRuntime,
  now
}: BroadcastAudioSilenceGuardInput): BroadcastAudioSilenceGuardDiagnostics => {
  const micExpected = !broadcastMixer.mic.muted && broadcastMixer.mic.volume > 0;
  const nowMs = resolveAudioGuardNow(now, healthSamples, elapsedSeconds, nativeRuntime);
  const currentSamples = selectCurrentStreamAudioSamples(
    appendCurrentNativeRuntimeSample(samples, nativeRuntime),
    healthSamples,
    nowMs
  );
  const nativeSamples = currentSamples.filter((sample) => sample.source === "native-pcm");
  const nativePcmRequired = nativeRuntime?.platform === "ios" || nativeRuntime?.platform === "android";
  const effectiveSamples = nativePcmRequired || nativeSamples.length > 0 ? nativeSamples : currentSamples;
  const evidenceSource: BroadcastAudioSilenceGuardDiagnostics["evidenceSource"] = effectiveSamples.some(
    (sample) => sample.source === "native-pcm"
  )
    ? "native-pcm"
    : effectiveSamples.length > 0
      ? "simulated"
      : "none";
  const summary = summarizeStreamAudioLevels(effectiveSamples);
  const base = {
    evidenceSource,
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

  const micLevelUpdatedAt = nativeRuntime?.audioProcessing?.micLevelUpdatedAt ?? 0;
  const nativePcmMeterStale =
    nativePcmRequired &&
    (!Number.isFinite(micLevelUpdatedAt) ||
      micLevelUpdatedAt <= 0 ||
      micLevelUpdatedAt > nowMs + nativePcmFreshnessMs ||
      nowMs - micLevelUpdatedAt > nativePcmFreshnessMs);
  if (nativePcmRequired && (nativeRuntime?.stale || nativePcmMeterStale)) {
    return {
      ...base,
      status: "warn",
      summary: "Native PCM audio metering is stale or not updating while the mic channel is expected live.",
      recommendation: "Check the native broadcast extension/service and confirm audio telemetry resumes before staying public."
    };
  }

  if (summary.sampleCount < minCurrentSamples) {
    return {
      ...base,
      status: "warn",
      summary: nativePcmRequired
        ? `Mic channel is live, but only ${summary.sampleCount} current native PCM sample${summary.sampleCount === 1 ? "" : "s"} are retained.`
        : `Mic channel is live, but only ${summary.sampleCount} current audio activity sample${summary.sampleCount === 1 ? "" : "s"} are retained.`,
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

const appendCurrentNativeRuntimeSample = (
  samples: StreamAudioLevelSample[],
  nativeRuntime: BroadcastAudioSilenceGuardInput["nativeRuntime"]
): StreamAudioLevelSample[] => {
  const audio = nativeRuntime?.audioProcessing;
  const updatedAt = audio?.micLevelUpdatedAt ?? 0;
  if ((audio?.micSampleCount ?? 0) <= 0 || updatedAt <= 0 || !Number.isFinite(updatedAt)) {
    return samples;
  }

  const at = new Date(updatedAt);
  if (!Number.isFinite(at.getTime())) {
    return samples;
  }
  const atIso = at.toISOString();
  if (samples.some((sample) => sample.source === "native-pcm" && sample.at === atIso)) {
    return samples;
  }

  return [
    ...samples,
    createStreamAudioLevelSample(audio?.micRmsLevel ?? 0, "native-pcm", at, {
      peakLevel: audio?.micPeakLevel ?? audio?.micRmsLevel ?? 0,
      pcmSampleCount: audio?.micSampleCount ?? 0,
      clippedPcmSampleCount: audio?.micClippedSampleCount ?? 0
    })
  ];
};

const selectCurrentStreamAudioSamples = (
  samples: StreamAudioLevelSample[],
  healthSamples: StreamHealthSample[],
  nowMs: number
): StreamAudioLevelSample[] => {
  const startedAt = healthSamples[0]?.at;
  const startedAtMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const recentCutoffMs = Math.max(
    Number.isFinite(startedAtMs) ? startedAtMs : 0,
    nowMs - currentAudioWindowMs
  );

  return samples.filter((sample) => {
    const sampleAtMs = Date.parse(sample.at);
    return Number.isFinite(sampleAtMs) && sampleAtMs >= recentCutoffMs && sampleAtMs <= nowMs + nativePcmFreshnessMs;
  });
};

const currentAudioWindowMs = 5_000;
const nativePcmFreshnessMs = 3_000;

const resolveAudioGuardNow = (
  now: BroadcastAudioSilenceGuardInput["now"],
  healthSamples: StreamHealthSample[],
  elapsedSeconds: number,
  nativeRuntime: BroadcastAudioSilenceGuardInput["nativeRuntime"]
): number => {
  const explicitNow = now instanceof Date ? now.getTime() : now;
  if (typeof explicitNow === "number" && Number.isFinite(explicitNow)) {
    return explicitNow;
  }

  const nativeUpdatedAt = nativeRuntime?.audioProcessing?.micLevelUpdatedAt ?? 0;
  if (Number.isFinite(nativeUpdatedAt) && nativeUpdatedAt > 0) {
    return nativeUpdatedAt;
  }

  const startedAtMs = Date.parse(healthSamples[0]?.at ?? "");
  if (Number.isFinite(startedAtMs)) {
    return startedAtMs + Math.max(0, elapsedSeconds) * 1_000;
  }

  const latestSampleAt = Math.max(
    0,
    ...healthSamples.map((sample) => Date.parse(sample.at)).filter(Number.isFinite)
  );
  return latestSampleAt > 0 ? latestSampleAt : Date.now();
};
