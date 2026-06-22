import { useEffect, useRef } from "react";
import type { QualityProfile } from "../domain/profiles";
import {
  createInitialStreamRecoveryAutomationState,
  createStreamRecoveryAutomationDecision,
  type StreamRecoveryAutomationDecision
} from "../domain/streamRecovery";
import type { StreamControlAction } from "../domain/streamOperation";
import type { LiveCasterNative, NativeEngineSnapshot } from "./LiveCasterNative";

interface StreamAutoRecoveryOptions {
  engine: LiveCasterNative;
  snapshot: NativeEngineSnapshot;
  quality: Pick<QualityProfile, "fps" | "videoBitrateKbps">;
  canStart: boolean;
  operationInFlight: { current: boolean };
  runStreamOperation(action: StreamControlAction, operation: () => Promise<void>): Promise<void>;
  onRecoveryDecision?(decision: StreamRecoveryAutomationDecision): void;
}

export const useStreamAutoRecovery = ({
  engine,
  snapshot,
  quality,
  canStart,
  operationInFlight,
  runStreamOperation,
  onRecoveryDecision
}: StreamAutoRecoveryOptions): void => {
  const recoveryState = useRef(createInitialStreamRecoveryAutomationState());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerKey = useRef<string | null>(null);

  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    timerKey.current = null;
  };

  useEffect(() => () => clearTimer(), []);

  useEffect(() => {
    const decision = createStreamRecoveryAutomationDecision({
      snapshot,
      quality,
      canStart,
      operationInFlight: operationInFlight.current,
      now: Date.now(),
      state: recoveryState.current
    });
    recoveryState.current = decision.state;

    if (decision.command === "cancel") {
      clearTimer();
      return;
    }

    if (decision.command === "stop") {
      clearTimer();
      onRecoveryDecision?.(decision);
      if (!operationInFlight.current) {
        void runStreamOperation("stop", () => engine.stop());
      }
      return;
    }

    if (decision.command !== "schedule-reconnect" || decision.key === null) {
      return;
    }

    if (timerKey.current === decision.key) {
      return;
    }

    clearTimer();
    onRecoveryDecision?.(decision);
    timerKey.current = decision.key;
    timer.current = setTimeout(() => {
      timer.current = null;
      timerKey.current = null;
      recoveryState.current = {
        ...recoveryState.current,
        scheduledKey: null
      };

      if (!operationInFlight.current) {
        void runStreamOperation("reconnect", () => engine.reconnect());
      }
    }, Math.max(0, decision.delayMs ?? 0));
  }, [
    canStart,
    engine,
    operationInFlight,
    onRecoveryDecision,
    quality.fps,
    quality.videoBitrateKbps,
    runStreamOperation,
    snapshot.health.bitrateKbps,
    snapshot.health.droppedFrames,
    snapshot.health.elapsedSeconds,
    snapshot.health.fps,
    snapshot.health.reconnectAttempts,
    snapshot.state.status
  ]);
};
