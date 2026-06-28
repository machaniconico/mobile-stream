import { errorToSafeMessage } from "./sensitiveText";

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

export class StreamOperationCancelledError extends Error {
  constructor(message = "Stream operation cancelled.") {
    super(message);
    this.name = "StreamOperationCancelledError";
  }
}

export const isStreamOperationCancelledError = (error: unknown): error is StreamOperationCancelledError =>
  error instanceof StreamOperationCancelledError;

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
  return errorToSafeMessage(error, "Unexpected streaming control error");
};
