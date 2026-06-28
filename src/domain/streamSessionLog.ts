import type { StreamRecoveryAutomationDecision } from "./streamRecovery";
import type { StreamQualityAutomationDecision } from "./streamQualityAutomation";
import type { StreamControlAction, StreamOperationStatus } from "./streamOperation";
import type { StreamHealth, StreamStatus } from "./streamState";
import type { PlatformChatReconnectDecision } from "./platformChatConnection";

export type StreamSessionEventSeverity = "info" | "warn" | "fail";
export type StreamSessionEventKind = "status" | "operation" | "recovery" | "quality" | "chat" | "platform-api" | "safety";

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

export type StreamChatEventPhase =
  | "auto-connect-started"
  | "auto-connect-skipped"
  | "auto-disconnect-stopped"
  | "auto-reconnect-scheduled"
  | "auto-reconnect-exhausted"
  | "speech-started"
  | "speech-spoken"
  | "speech-failed";

export interface StreamChatSpeechEventInput {
  messageSource: "manual" | "youtube" | "twitch" | "mock";
  textLength: number;
}

export type StreamPlatformApiOperationPhase = "started" | "succeeded" | "failed" | "skipped";

export interface StreamPlatformApiOperationEventInput {
  label: string;
  phase: StreamPlatformApiOperationPhase;
  message?: string;
  retryDelayLabel?: string | null;
}

export type StreamSafetyEventPhase =
  | "privacy-shield-armed"
  | "privacy-shield-failed"
  | "public-launch-confirmed"
  | "public-launch-cancelled";

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
  phase: "started" | "succeeded" | "failed" | "cancelled",
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

export const createStreamQualityAutomationEvent = (
  decision: StreamQualityAutomationDecision,
  now: Date = new Date()
): StreamSessionEvent | null => {
  if (decision.command === "none") {
    return null;
  }

  return {
    id: createEventId(now, "quality", decision.command, decision.key ?? "none"),
    at: now.toISOString(),
    kind: "quality",
    severity: decision.severity,
    title: decision.title,
    message: `${decision.summary} ${decision.action}${decision.reason ? ` Reason: ${decision.reason}` : ""}`
  };
};

export const createStreamChatEvent = (
  phase: StreamChatEventPhase,
  message: string,
  severity: StreamSessionEventSeverity = "info",
  now: Date = new Date()
): StreamSessionEvent => ({
  id: createEventId(now, "chat", phase),
  at: now.toISOString(),
  kind: "chat",
  severity,
  title: chatEventTitle(phase),
  message
});

export const createStreamChatReconnectEvent = (
  decision: PlatformChatReconnectDecision,
  now: Date = new Date()
): StreamSessionEvent | null => {
  if (decision.command === "schedule-reconnect") {
    const delaySeconds = decision.delayMs === null ? 0 : Math.round(decision.delayMs / 1000);
    return createStreamChatEvent(
      "auto-reconnect-scheduled",
      `${decision.reason} Retrying chat in ${delaySeconds}s (${decision.attemptsUsed}/${decision.maxAttempts}).`,
      "warn",
      now
    );
  }

  if (decision.command === "give-up") {
    return createStreamChatEvent(
      "auto-reconnect-exhausted",
      decision.reason,
      "fail",
      now
    );
  }

  return null;
};

export const createStreamChatSpeechEvent = (
  phase: Extract<StreamChatEventPhase, "speech-started" | "speech-spoken" | "speech-failed">,
  input: StreamChatSpeechEventInput,
  now: Date = new Date()
): StreamSessionEvent => {
  const source = input.messageSource;
  const textLength = Math.max(0, Math.floor(input.textLength));
  const action =
    phase === "speech-started"
      ? "started"
      : phase === "speech-spoken"
        ? "finished"
        : "failed";
  return createStreamChatEvent(
    phase,
    `Chat readout ${action} speaking a ${source} message (${textLength} chars).`,
    phase === "speech-failed" ? "warn" : "info",
    now
  );
};

export const createStreamPlatformApiOperationEvent = (
  input: StreamPlatformApiOperationEventInput,
  now: Date = new Date()
): StreamSessionEvent => {
  const label = sanitizeSingleLine(input.label) || "Platform API operation";
  const message = sanitizeSingleLine(input.message ?? "");
  const retryDelay = sanitizeSingleLine(input.retryDelayLabel ?? "");
  return {
    id: createEventId(now, "platform-api", input.phase, label),
    at: now.toISOString(),
    kind: "platform-api",
    severity: platformApiOperationSeverity(input.phase),
    title: `${label} ${input.phase}`,
    message: [
      message || defaultPlatformApiOperationMessage(label, input.phase),
      input.phase === "failed" && retryDelay ? `Retry guidance: wait ${retryDelay}.` : ""
    ].filter(Boolean).join(" ")
  };
};

export const createStreamSafetyEvent = (
  phase: StreamSafetyEventPhase,
  message: string,
  now: Date = new Date()
): StreamSessionEvent => ({
  id: createEventId(now, "safety", phase),
  at: now.toISOString(),
  kind: "safety",
  severity: safetyEventSeverity(phase),
  title: safetyEventTitle(phase),
  message: sanitizeSingleLine(message)
});

const safetyEventSeverity = (phase: StreamSafetyEventPhase): StreamSessionEventSeverity => {
  if (phase === "privacy-shield-failed") {
    return "fail";
  }
  return phase === "public-launch-confirmed" ? "info" : "warn";
};

const safetyEventTitle = (phase: StreamSafetyEventPhase): string => {
  switch (phase) {
    case "privacy-shield-armed":
      return "Privacy shield armed";
    case "privacy-shield-failed":
      return "Privacy shield failed";
    case "public-launch-confirmed":
      return "Public launch confirmed";
    case "public-launch-cancelled":
      return "Public launch cancelled";
  }
};

const chatEventTitle = (phase: StreamChatEventPhase): string => {
  switch (phase) {
    case "auto-connect-started":
      return "Chat auto-connect started";
    case "auto-connect-skipped":
      return "Chat auto-connect skipped";
    case "auto-disconnect-stopped":
      return "Chat auto-disconnect stopped";
    case "auto-reconnect-scheduled":
      return "Chat reconnect scheduled";
    case "auto-reconnect-exhausted":
      return "Chat reconnect exhausted";
    case "speech-started":
      return "Chat speech started";
    case "speech-spoken":
      return "Chat speech spoken";
    case "speech-failed":
      return "Chat speech failed";
  }
};

const platformApiOperationSeverity = (phase: StreamPlatformApiOperationPhase): StreamSessionEventSeverity => {
  if (phase === "failed") {
    return "fail";
  }
  if (phase === "skipped") {
    return "warn";
  }
  return "info";
};

const defaultPlatformApiOperationMessage = (label: string, phase: StreamPlatformApiOperationPhase): string => {
  switch (phase) {
    case "started":
      return `${label} started.`;
    case "succeeded":
      return `${label} completed.`;
    case "failed":
      return `${label} failed.`;
    case "skipped":
      return `${label} skipped.`;
  }
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

const sanitizeSingleLine = (value: string): string => value.replace(/\s+/g, " ").trim();
