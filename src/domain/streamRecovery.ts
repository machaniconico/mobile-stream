import type { QualityProfile } from "./profiles";
import type { StreamHealth, StreamStatus } from "./streamState";

export type StreamRecoveryMode = "idle" | "healthy" | "watching" | "reconnecting" | "failed" | "exhausted";
export type StreamRecoverySeverity = "pass" | "warn" | "fail" | "info";
export type StreamRecoveryAction = "none" | "monitor" | "reconnect" | "stop";

export interface StreamRecoveryPolicy {
  enabled: boolean;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  degradedBitrateRatio: number;
  criticalBitrateRatio: number;
  degradedFpsTolerance: number;
  criticalFpsTolerance: number;
}

export interface StreamRecoveryStatus {
  mode: StreamRecoveryMode;
  severity: StreamRecoverySeverity;
  recommendedAction: StreamRecoveryAction;
  attemptsUsed: number;
  attemptsRemaining: number;
  maxAttempts: number;
  nextRetryDelayMs: number | null;
  message: string;
  triggers: string[];
}

export interface StreamRecoverySnapshot {
  state: {
    status: StreamStatus;
  };
  health: StreamHealth;
}

export const defaultStreamRecoveryPolicy: StreamRecoveryPolicy = {
  enabled: true,
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  degradedBitrateRatio: 0.75,
  criticalBitrateRatio: 0.35,
  degradedFpsTolerance: 5,
  criticalFpsTolerance: 12
};

export const createDefaultStreamRecoveryPolicy = (): StreamRecoveryPolicy => ({ ...defaultStreamRecoveryPolicy });

export const createStreamRecoveryStatus = (
  snapshot: StreamRecoverySnapshot,
  quality: Pick<QualityProfile, "fps" | "videoBitrateKbps">,
  policy: StreamRecoveryPolicy = defaultStreamRecoveryPolicy
): StreamRecoveryStatus => {
  const attemptsUsed = clampAttempts(snapshot.health.reconnectAttempts, policy.maxAttempts);
  const attemptsRemaining = Math.max(0, policy.maxAttempts - attemptsUsed);
  const base = {
    attemptsUsed,
    attemptsRemaining,
    maxAttempts: policy.maxAttempts
  };

  if (!policy.enabled) {
    return {
      ...base,
      mode: "idle",
      severity: "info",
      recommendedAction: "none",
      nextRetryDelayMs: null,
      message: "Automatic recovery policy is disabled.",
      triggers: []
    };
  }

  if (snapshot.state.status === "idle" || snapshot.state.status === "preparing" || snapshot.state.status === "stopping") {
    return {
      ...base,
      mode: "idle",
      severity: "info",
      recommendedAction: "none",
      nextRetryDelayMs: null,
      message: `Recovery policy is standing by while the engine is ${snapshot.state.status}.`,
      triggers: []
    };
  }

  if (attemptsRemaining === 0 && (snapshot.state.status === "failed" || snapshot.state.status === "reconnecting")) {
    return {
      ...base,
      mode: "exhausted",
      severity: "fail",
      recommendedAction: "stop",
      nextRetryDelayMs: null,
      message: `Recovery attempts exhausted after ${attemptsUsed}/${policy.maxAttempts} retries.`,
      triggers: ["retry-limit"]
    };
  }

  if (snapshot.state.status === "failed") {
    const nextRetryDelayMs = getReconnectDelayMs(attemptsUsed + 1, policy);
    return {
      ...base,
      mode: "failed",
      severity: "warn",
      recommendedAction: "reconnect",
      nextRetryDelayMs,
      message: `Engine failed. Reconnect can be attempted in ${formatDelay(nextRetryDelayMs)}.`,
      triggers: ["engine-failed"]
    };
  }

  if (snapshot.state.status === "reconnecting") {
    const currentAttempt = Math.max(1, attemptsUsed);
    const nextRetryDelayMs = getReconnectDelayMs(currentAttempt, policy);
    return {
      ...base,
      mode: "reconnecting",
      severity: "warn",
      recommendedAction: "monitor",
      nextRetryDelayMs,
      message: `Reconnect attempt ${currentAttempt}/${policy.maxAttempts} is in progress.`,
      triggers: ["engine-reconnecting"]
    };
  }

  const healthTriggers = createLiveHealthTriggers(snapshot.health, quality, policy);
  if (healthTriggers.critical.length > 0) {
    if (attemptsRemaining === 0) {
      return {
        ...base,
        mode: "exhausted",
        severity: "fail",
        recommendedAction: "stop",
        nextRetryDelayMs: null,
        message: `Recovery attempts exhausted after ${attemptsUsed}/${policy.maxAttempts} retries.`,
        triggers: [...healthTriggers.critical, "retry-limit"]
      };
    }

    return {
      ...base,
      mode: "watching",
      severity: "warn",
      recommendedAction: "reconnect",
      nextRetryDelayMs: getReconnectDelayMs(attemptsUsed + 1, policy),
      message: "Live telemetry is below the recovery threshold; reconnect if this persists.",
      triggers: healthTriggers.critical
    };
  }

  if (healthTriggers.degraded.length > 0 || attemptsUsed > 0) {
    return {
      ...base,
      mode: "watching",
      severity: "warn",
      recommendedAction: "monitor",
      nextRetryDelayMs: attemptsUsed > 0 ? getReconnectDelayMs(attemptsUsed + 1, policy) : null,
      message: "Recovery policy is monitoring degraded live telemetry.",
      triggers: [...healthTriggers.degraded, ...(attemptsUsed > 0 ? ["prior-reconnect"] : [])]
    };
  }

  return {
    ...base,
    mode: "healthy",
    severity: "pass",
    recommendedAction: "none",
    nextRetryDelayMs: null,
    message: "Recovery policy is armed and live telemetry is healthy.",
    triggers: []
  };
};

export const getReconnectDelayMs = (attemptNumber: number, policy: StreamRecoveryPolicy = defaultStreamRecoveryPolicy): number => {
  const normalizedAttempt = Math.max(1, Math.floor(attemptNumber));
  const delay = policy.baseDelayMs * 2 ** (normalizedAttempt - 1);
  return Math.min(policy.maxDelayMs, Math.max(policy.baseDelayMs, delay));
};

export const formatRecoveryBackoff = (policy: StreamRecoveryPolicy = defaultStreamRecoveryPolicy): string =>
  `${formatDelay(policy.baseDelayMs)}-${formatDelay(policy.maxDelayMs)}`;

export const formatDelay = (delayMs: number): string => {
  if (delayMs < 1000) {
    return `${delayMs}ms`;
  }

  const seconds = delayMs / 1000;
  return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
};

const createLiveHealthTriggers = (
  health: StreamHealth,
  quality: Pick<QualityProfile, "fps" | "videoBitrateKbps">,
  policy: StreamRecoveryPolicy
): { degraded: string[]; critical: string[] } => {
  const degraded: string[] = [];
  const critical: string[] = [];
  const minimumHealthyBitrate = Math.round(quality.videoBitrateKbps * policy.degradedBitrateRatio);
  const minimumRecoverableBitrate = Math.round(quality.videoBitrateKbps * policy.criticalBitrateRatio);
  const minimumHealthyFps = Math.max(1, quality.fps - policy.degradedFpsTolerance);
  const minimumRecoverableFps = Math.max(1, quality.fps - policy.criticalFpsTolerance);

  if (health.elapsedSeconds >= 5 && health.bitrateKbps <= 0) {
    critical.push("bitrate-missing");
  } else if (health.bitrateKbps > 0 && health.bitrateKbps < minimumRecoverableBitrate) {
    critical.push("bitrate-critical");
  } else if (health.bitrateKbps > 0 && health.bitrateKbps < minimumHealthyBitrate) {
    degraded.push("bitrate-degraded");
  }

  if (health.elapsedSeconds >= 5 && health.fps <= 0) {
    critical.push("fps-missing");
  } else if (health.fps > 0 && health.fps < minimumRecoverableFps) {
    critical.push("fps-critical");
  } else if (health.fps > 0 && health.fps < minimumHealthyFps) {
    degraded.push("fps-degraded");
  }

  if (health.droppedFrames > 0) {
    degraded.push("dropped-frames");
  }

  return { degraded, critical };
};

const clampAttempts = (attempts: number, maxAttempts: number): number =>
  Math.min(Math.max(0, Math.floor(attempts)), Math.max(0, Math.floor(maxAttempts)));
