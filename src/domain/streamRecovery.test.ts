import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile } from "./profiles";
import {
  createStreamRecoveryStatus,
  formatDelay,
  formatRecoveryBackoff,
  getReconnectDelayMs,
  type StreamRecoverySnapshot
} from "./streamRecovery";
import { initialStreamState, type StreamHealth } from "./streamState";

const quality = createDefaultStudioProfile().quality;

const health = (update: Partial<StreamHealth> = {}): StreamHealth => ({
  ...initialStreamState.health,
  ...update
});

const snapshot = (status: StreamRecoverySnapshot["state"]["status"], update: Partial<StreamHealth> = {}): StreamRecoverySnapshot => ({
  state: { status },
  health: health(update)
});

describe("stream recovery policy", () => {
  it("arms recovery while live telemetry is healthy", () => {
    const recovery = createStreamRecoveryStatus(
      snapshot("live", {
        bitrateKbps: quality.videoBitrateKbps,
        fps: quality.fps,
        elapsedSeconds: 30
      }),
      quality
    );

    expect(recovery.mode).toBe("healthy");
    expect(recovery.severity).toBe("pass");
    expect(recovery.recommendedAction).toBe("none");
    expect(recovery.attemptsRemaining).toBe(5);
  });

  it("monitors degraded telemetry before recommending a reconnect", () => {
    const recovery = createStreamRecoveryStatus(
      snapshot("live", {
        bitrateKbps: Math.round(quality.videoBitrateKbps * 0.6),
        fps: quality.fps - 3,
        droppedFrames: 1,
        elapsedSeconds: 30
      }),
      quality
    );

    expect(recovery.mode).toBe("watching");
    expect(recovery.severity).toBe("warn");
    expect(recovery.recommendedAction).toBe("monitor");
    expect(recovery.triggers).toEqual(expect.arrayContaining(["bitrate-degraded", "dropped-frames"]));
  });

  it("recommends reconnect when live telemetry falls below the recovery threshold", () => {
    const recovery = createStreamRecoveryStatus(
      snapshot("live", {
        bitrateKbps: Math.round(quality.videoBitrateKbps * 0.2),
        fps: quality.fps - 15,
        elapsedSeconds: 30
      }),
      quality
    );

    expect(recovery.mode).toBe("watching");
    expect(recovery.severity).toBe("warn");
    expect(recovery.recommendedAction).toBe("reconnect");
    expect(recovery.nextRetryDelayMs).toBe(1000);
    expect(recovery.triggers).toEqual(expect.arrayContaining(["bitrate-critical", "fps-critical"]));
  });

  it("treats missing live telemetry as recoverable after startup grace", () => {
    const recovery = createStreamRecoveryStatus(
      snapshot("live", {
        bitrateKbps: 0,
        fps: 0,
        elapsedSeconds: 8
      }),
      quality
    );

    expect(recovery.recommendedAction).toBe("reconnect");
    expect(recovery.triggers).toEqual(expect.arrayContaining(["bitrate-missing", "fps-missing"]));
  });

  it("plans bounded exponential retry delays for failed streams", () => {
    const recovery = createStreamRecoveryStatus(snapshot("failed", { reconnectAttempts: 2 }), quality);

    expect(recovery.mode).toBe("failed");
    expect(recovery.recommendedAction).toBe("reconnect");
    expect(recovery.attemptsRemaining).toBe(3);
    expect(recovery.nextRetryDelayMs).toBe(4000);
  });

  it("marks recovery as exhausted when the retry budget is consumed", () => {
    const recovery = createStreamRecoveryStatus(snapshot("reconnecting", { reconnectAttempts: 5 }), quality);

    expect(recovery.mode).toBe("exhausted");
    expect(recovery.severity).toBe("fail");
    expect(recovery.recommendedAction).toBe("stop");
    expect(recovery.nextRetryDelayMs).toBeNull();
  });

  it("does not recommend reconnect when critical live telemetry has no retry budget left", () => {
    const recovery = createStreamRecoveryStatus(
      snapshot("live", {
        bitrateKbps: Math.round(quality.videoBitrateKbps * 0.2),
        fps: quality.fps - 15,
        elapsedSeconds: 30,
        reconnectAttempts: 5
      }),
      quality
    );

    expect(recovery.mode).toBe("exhausted");
    expect(recovery.severity).toBe("fail");
    expect(recovery.recommendedAction).toBe("stop");
    expect(recovery.triggers).toEqual(expect.arrayContaining(["bitrate-critical", "fps-critical", "retry-limit"]));
  });

  it("displays reconnecting as the first attempt when native telemetry has not counted yet", () => {
    const recovery = createStreamRecoveryStatus(snapshot("reconnecting", { reconnectAttempts: 0 }), quality);

    expect(recovery.mode).toBe("reconnecting");
    expect(recovery.message).toContain("1/5");
    expect(recovery.nextRetryDelayMs).toBe(1000);
  });

  it("formats retry timing for diagnostics", () => {
    expect(getReconnectDelayMs(6)).toBe(30000);
    expect(formatDelay(1500)).toBe("1.5s");
    expect(formatRecoveryBackoff()).toBe("1s-30s");
  });
});
