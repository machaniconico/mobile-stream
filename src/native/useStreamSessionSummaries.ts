import { useEffect, useRef, useState } from "react";
import type { QualityProfile } from "../domain/profiles";
import type { StreamHealthSample } from "../domain/streamHealthHistory";
import type { StreamSessionEvent } from "../domain/streamSessionLog";
import {
  appendStreamSessionSummary,
  createStreamSessionSummary,
  mergeStreamSessionSummaries,
  normalizeStreamSessionSummaries,
  type StreamSessionEndReason,
  type StreamSessionSummary
} from "../domain/streamSessionSummary";
import type { StreamStatus } from "../domain/streamState";
import type { NativeEngineSnapshot } from "./LiveCasterNative";

export interface StreamSessionSummaries {
  summaries: StreamSessionSummary[];
  lastSummary: StreamSessionSummary | null;
}

export const useStreamSessionSummaries = ({
  snapshot,
  events,
  healthSamples,
  quality,
  initialSummaries = [],
  initialSummariesReady = true,
  onSummariesChange
}: {
  snapshot: NativeEngineSnapshot;
  events: StreamSessionEvent[];
  healthSamples: StreamHealthSample[];
  quality: QualityProfile;
  initialSummaries?: StreamSessionSummary[];
  initialSummariesReady?: boolean;
  onSummariesChange?(summaries: StreamSessionSummary[]): void;
}): StreamSessionSummaries => {
  const [summaries, setSummaries] = useState<StreamSessionSummary[]>(() =>
    initialSummariesReady ? normalizeStreamSessionSummaries(initialSummaries) : []
  );
  const [summariesHydrated, setSummariesHydrated] = useState(initialSummariesReady);
  const [pendingEndReason, setPendingEndReason] = useState<StreamSessionEndReason | null>(null);
  const previousStatus = useRef<StreamStatus>(snapshot.state.status);
  const terminalReason = useRef<StreamSessionEndReason>("stopped");
  const summaryRequestedForSession = useRef(false);
  const lastEmittedSummariesKey = useRef<string | null>(null);

  useEffect(() => {
    if (!initialSummariesReady || summariesHydrated) {
      return;
    }

    setSummaries((current) => mergeStreamSessionSummaries(current, initialSummaries));
    setSummariesHydrated(true);
  }, [
    initialSummaries,
    initialSummariesReady,
    summariesHydrated
  ]);

  useEffect(() => {
    const previous = previousStatus.current;
    const next = snapshot.state.status;

    if (next === "failed" && previous !== "failed" && !summaryRequestedForSession.current) {
      terminalReason.current = "failed";
      summaryRequestedForSession.current = true;
      setPendingEndReason("failed");
    } else if (next === "stopping") {
      terminalReason.current = previous === "failed" ? "failed" : "stopped";
    } else if (next === "idle" && previous !== "idle" && previous !== "preparing" && !summaryRequestedForSession.current) {
      summaryRequestedForSession.current = true;
      setPendingEndReason(terminalReason.current);
      terminalReason.current = "stopped";
    } else if (next === "preparing" && previous !== "preparing") {
      terminalReason.current = "stopped";
      summaryRequestedForSession.current = false;
      setPendingEndReason(null);
    }

    previousStatus.current = next;
  }, [snapshot.state.status]);

  useEffect(() => {
    if (!pendingEndReason) {
      return;
    }

    const summary = createStreamSessionSummary({
      events,
      healthSamples,
      target: {
        bitrateKbps: quality.videoBitrateKbps,
        fps: quality.fps
      },
      endReason: pendingEndReason
    });

    setSummaries((current) => appendStreamSessionSummary(current, summary));
    setPendingEndReason(null);
  }, [
    events,
    healthSamples,
    pendingEndReason,
    quality.fps,
    quality.videoBitrateKbps
  ]);

  useEffect(() => {
    if (!initialSummariesReady || !summariesHydrated || !onSummariesChange) {
      return;
    }

    const summariesKey = summaries.map((summary) => summary.id).join("|");
    if (summariesKey === lastEmittedSummariesKey.current) {
      return;
    }

    lastEmittedSummariesKey.current = summariesKey;
    onSummariesChange(summaries);
  }, [
    initialSummariesReady,
    onSummariesChange,
    summaries,
    summariesHydrated
  ]);

  return {
    summaries,
    lastSummary: summaries[0] ?? null
  };
};
