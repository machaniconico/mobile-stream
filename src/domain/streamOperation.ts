export type StreamControlAction = "start" | "stop" | "reconnect";

export interface StreamOperationStatus {
  kind: "pending" | "error";
  action: StreamControlAction;
  message: string;
}

const actionLabels: Record<StreamControlAction, string> = {
  start: "Start",
  stop: "Stop",
  reconnect: "Reconnect"
};

const pendingMessages: Record<StreamControlAction, string> = {
  start: "Starting stream",
  stop: "Stopping stream",
  reconnect: "Reconnecting stream"
};

export const createPendingStreamOperation = (action: StreamControlAction): StreamOperationStatus => ({
  kind: "pending",
  action,
  message: pendingMessages[action]
});

export const createFailedStreamOperation = (
  action: StreamControlAction,
  error: unknown
): StreamOperationStatus => ({
  kind: "error",
  action,
  message: `${actionLabels[action]} failed: ${errorMessage(error)}`
});

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return "Unexpected streaming control error";
};
