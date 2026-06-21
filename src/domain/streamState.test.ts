import { describe, expect, it } from "vitest";
import { initialStreamState, streamReducer } from "./streamState";

describe("stream state machine", () => {
  it("moves from idle to live through preparing", () => {
    const preparing = streamReducer(initialStreamState, { type: "prepare", now: 1000 });
    const live = streamReducer(preparing, { type: "start", now: 1500 });

    expect(preparing.status).toBe("preparing");
    expect(live.status).toBe("live");
    expect(live.startedAt).toBe(1500);
  });

  it("ignores invalid start events", () => {
    const next = streamReducer(initialStreamState, { type: "start", now: 1000 });
    expect(next).toBe(initialStreamState);
  });

  it("tracks elapsed health and dropped frames", () => {
    const live = streamReducer(streamReducer(initialStreamState, { type: "prepare", now: 1000 }), {
      type: "start",
      now: 1000
    });
    const health = streamReducer(live, {
      type: "health",
      now: 6500,
      bitrateKbps: 3500,
      droppedFrames: 2,
      fps: 30
    });

    expect(health.health.elapsedSeconds).toBe(5);
    expect(health.health.droppedFrames).toBe(2);
    expect(health.health.bitrateKbps).toBe(3500);
  });

  it("can reconnect and stop", () => {
    const live = streamReducer(streamReducer(initialStreamState, { type: "prepare", now: 1000 }), {
      type: "start",
      now: 1000
    });
    const reconnecting = streamReducer(live, { type: "reconnect", now: 2000 });
    const stopping = streamReducer(reconnecting, { type: "stop", now: 3000 });
    const stopped = streamReducer(stopping, { type: "stopped" });

    expect(reconnecting.status).toBe("reconnecting");
    expect(reconnecting.health.reconnectAttempts).toBe(1);
    expect(stopping.status).toBe("stopping");
    expect(stopped.status).toBe("idle");
  });

  it("resets reconnect attempts after the stream is live again", () => {
    const live = streamReducer(streamReducer(initialStreamState, { type: "prepare", now: 1000 }), {
      type: "start",
      now: 1000
    });
    const reconnecting = streamReducer(live, {
      type: "reconnect",
      now: 2000,
      attempt: 3,
      message: "Reconnecting in 8s"
    });
    const recovered = streamReducer(reconnecting, { type: "start", now: 3000 });

    expect(reconnecting.health.reconnectAttempts).toBe(3);
    expect(reconnecting.health.message).toBe("Reconnecting in 8s");
    expect(recovered.status).toBe("live");
    expect(recovered.health.reconnectAttempts).toBe(0);
  });
});
