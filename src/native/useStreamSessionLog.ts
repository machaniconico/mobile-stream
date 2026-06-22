import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendStreamSessionEvent,
  createStreamStatusEvent,
  type StreamSessionEvent,
  type StreamSessionSnapshot
} from "../domain/streamSessionLog";
import type { NativeEngineSnapshot } from "./LiveCasterNative";

export interface StreamSessionLog {
  events: StreamSessionEvent[];
  recordEvent(event: StreamSessionEvent | null): void;
}

export const useStreamSessionLog = (snapshot: NativeEngineSnapshot): StreamSessionLog => {
  const [events, setEvents] = useState<StreamSessionEvent[]>([]);
  const previousSnapshot = useRef<StreamSessionSnapshot | null>(null);

  const recordEvent = useCallback((event: StreamSessionEvent | null) => {
    if (!event) {
      return;
    }
    setEvents((current) => appendStreamSessionEvent(current, event));
  }, []);

  useEffect(() => {
    const event = createStreamStatusEvent(previousSnapshot.current, snapshot);
    previousSnapshot.current = snapshot;
    recordEvent(event);
  }, [
    recordEvent,
    snapshot,
    snapshot.health.message,
    snapshot.health.reconnectAttempts,
    snapshot.state.status
  ]);

  return { events, recordEvent };
};
