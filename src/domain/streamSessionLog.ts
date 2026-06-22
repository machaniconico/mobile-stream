import type { StreamRecoveryAutomationDecision } from "./streamRecovery";
import type { StreamControlAction, StreamOperationStatus } from "./streamOperation";
import type { StreamHealth, StreamStatus } from "./streamState";

export type StreamSessionEventSeverity = "info" | "warn" | "fail";
export type StreamSessionEventKind = "status" | "operation" | "recovery";

export interface StreamSessionEvent {
  id: string;
  at: string;
  kind: StreamSessionEventKind;
  severity: StreamSessionEventSeverity;
  title: string;
  message: string;
}

export interface StreamSessionSnapshot {
  state: {
    status: StreamStatus;
  };
  health: StreamHealth;
}

export const maxStreamSessionEvents = 50;

export const appendStreamSessionEvent = (
  events: StreamSessionEvent[],
  event: StreamSessionEvent,
  maxEvents = maxStreamSessionEvents
): StreamSessionEvent[] => [...events, event].slice(-Math.max(1, maxEvents));

export const createStreamStatusEvent = (
  previous: StreamSessionSnapshot | null,
  next: StreamSessionSnapshot,
  now: Date = new Date()
): StreamSessionEvent | null => {
  const previousStatus = previous?.state.status ?? null;
  if (previousStatus === next.state.status) {
    return null;
  }

  return {
    id: createEventId(now, "status", next.state.status, next.health.reconnectAttempts),
    at: now.toISOString(),
    kind: "status",
    severity: statusSeverity(next.state.status),
    title: `Stream ${next.state.status}`,
    message: statusMessage(previousStatus, next.state.status, next.health.message)
  };
};

export const createStreamOperationEvent = (
  action: StreamControlAction,
  phase: "started" | "succeeded" | "failed",
  message: string,
  now: Date = new Date()
): StreamSessionEvent => ({
  id: createEventId(now, "operation", action, phase),
  at: now.toISOString(),
  kind: "operation",
  severity: phase === "failed" ? "fail" : "info",
  title: `${operationLabel(action)} ${phase}`,
  message
});

export const createStreamRecoveryEvent = (
  decision: StreamRecoveryAutomationDecision,
  now: Date = new Date()
): StreamSessionEvent | null => {
  if (decision.command !== "schedule-reconnect" && decision.command !== "stop" && decision.command !== "cancel") {
    return null;
  }

  if (decision.command === "cancel" && decision.recovery.recommendedAction !== "reconnect") {
    return null;
  }

  return {
    id: createEventId(now, "recovery", decision.command, decision.key ?? "none"),
    at: now.toISOString(),
    kind: "recovery",
    severity: decision.command === "stop" ? "fail" : "warn",
    title: recoveryTitle(decision.command),
    message: recoveryMessage(decision)
  };
};

const statusSeverity = (status: StreamStatus): StreamSessionEventSeverity => {
  if (status === "failed") {
    return "fail";
  }
  if (status === "reconnecting") {
    return "warn";
  }
  return "info";
};

const statusMessage = (previousStatus: StreamStatus | null, nextStatus: StreamStatus, healthMessage: string): string => {
  const prefix = previousStatus ? `${previousStatus} -> ${nextStatus}` : `initial -> ${nextStatus}`;
  return healthMessage ? `${prefix}: ${healthMessage}` : prefix;
};

const operationLabel = (action: StreamControlAction): string => {
  switch (action) {
    case "start":
      return "Start";
    case "stop":
      return "Stop";
    case "reconnect":
      return "Reconnect";
  }
};

const recoveryTitle = (command: StreamRecoveryAutomationDecision["command"]): string => {
  switch (command) {
    case "schedule-reconnect":
      return "Auto recovery scheduled";
    case "stop":
      return "Auto recovery stopped stream";
    case "cancel":
      return "Auto recovery cancelled";
    case "none":
      return "Auto recovery idle";
  }
};

const recoveryMessage = (decision: StreamRecoveryAutomationDecision): string => {
  const retry = decision.delayMs === null ? "" : ` Delay ${decision.delayMs}ms.`;
  return `${decision.reason}${retry} Attempts ${decision.recovery.attemptsUsed}/${decision.recovery.maxAttempts}.`;
};

const createEventId = (now: Date, ...parts: Array<string | number>): string =>
  [now.toISOString(), ...parts].join(":");
