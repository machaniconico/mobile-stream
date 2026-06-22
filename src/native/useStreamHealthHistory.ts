import { useEffect, useRef, useState } from "react";
import {
  appendStreamHealthSample,
  createStreamHealthSample,
  type StreamHealthSample
} from "../domain/streamHealthHistory";
import type { StreamStatus } from "../domain/streamState";
import type { NativeEngineSnapshot } from "./LiveCasterNative";

export const useStreamHealthHistory = (snapshot: NativeEngineSnapshot): StreamHealthSample[] => {
  const [samples, setSamples] = useState<StreamHealthSample[]>([]);
  const previousStatus = useRef<StreamStatus>(snapshot.state.status);

  useEffect(() => {
    if (snapshot.state.status === "preparing" && previousStatus.current !== "preparing") {
      setSamples([]);
    }

    const sample = createStreamHealthSample(snapshot);
    if (sample) {
      setSamples((current) => appendStreamHealthSample(current, sample));
    }

    previousStatus.current = snapshot.state.status;
  }, [
    snapshot,
    snapshot.health.bitrateKbps,
    snapshot.health.droppedFrames,
    snapshot.health.elapsedSeconds,
    snapshot.health.fps,
    snapshot.health.reconnectAttempts,
    snapshot.state.status
  ]);

  return samples;
};
