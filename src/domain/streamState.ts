export type StreamStatus = "idle" | "preparing" | "live" | "reconnecting" | "stopping" | "failed";

export interface StreamHealth {
  bitrateKbps: number;
  droppedFrames: number;
  fps: number;
  elapsedSeconds: number;
  message: string;
}

export interface StreamState {
  status: StreamStatus;
  startedAt: number | null;
  health: StreamHealth;
  error?: string;
}

export type StreamEvent =
  | { type: "prepare"; now: number }
  | { type: "start"; now: number }
  | { type: "health"; now: number; bitrateKbps: number; droppedFrames: number; fps: number; message?: string }
  | { type: "reconnect"; now: number }
  | { type: "stop"; now: number }
  | { type: "stopped" }
  | { type: "fail"; error: string };

export const initialStreamState: StreamState = {
  status: "idle",
  startedAt: null,
  health: {
    bitrateKbps: 0,
    droppedFrames: 0,
    fps: 0,
    elapsedSeconds: 0,
    message: "Ready"
  }
};

export const streamReducer = (state: StreamState, event: StreamEvent): StreamState => {
  switch (event.type) {
    case "prepare":
      if (state.status !== "idle" && state.status !== "failed") {
        return state;
      }
      return {
        ...state,
        status: "preparing",
        error: undefined,
        health: { ...state.health, message: "Preparing encoder" }
      };
    case "start":
      if (state.status !== "preparing" && state.status !== "reconnecting") {
        return state;
      }
      return {
        ...state,
        status: "live",
        startedAt: state.startedAt ?? event.now,
        health: { ...state.health, message: "Live" }
      };
    case "health": {
      const startedAt = state.startedAt ?? event.now;
      return {
        ...state,
        health: {
          bitrateKbps: event.bitrateKbps,
          droppedFrames: event.droppedFrames,
          fps: event.fps,
          elapsedSeconds: Math.max(0, Math.floor((event.now - startedAt) / 1000)),
          message: event.message ?? state.health.message
        }
      };
    }
    case "reconnect":
      if (state.status !== "live") {
        return state;
      }
      return {
        ...state,
        status: "reconnecting",
        health: { ...state.health, message: "Reconnecting" }
      };
    case "stop":
      if (state.status === "idle") {
        return state;
      }
      return {
        ...state,
        status: "stopping",
        health: { ...state.health, message: "Stopping" }
      };
    case "stopped":
      return initialStreamState;
    case "fail":
      return {
        ...state,
        status: "failed",
        error: event.error,
        health: { ...state.health, message: event.error }
      };
  }
};
