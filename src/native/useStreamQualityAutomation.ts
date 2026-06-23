import { useEffect, useRef } from "react";
import type { StreamQualityAdvisorTarget } from "../domain/streamQualityAdvisor";
import {
  createAppliedStreamQualityAutomationDecision,
  type StreamQualityAutomationDecision
} from "../domain/streamQualityAutomation";
import type { StreamStatus } from "../domain/streamState";

interface StreamQualityAutomationOptions {
  decision: StreamQualityAutomationDecision;
  streamStatus: StreamStatus;
  onDecision?(decision: StreamQualityAutomationDecision): void;
  onApplyLiveTarget?(target: StreamQualityAdvisorTarget): void;
  onApplyNextTarget?(target: StreamQualityAdvisorTarget): void;
}

export const useStreamQualityAutomation = ({
  decision,
  streamStatus,
  onDecision,
  onApplyLiveTarget,
  onApplyNextTarget
}: StreamQualityAutomationOptions): void => {
  const lastDecisionKey = useRef<string | null>(null);
  const appliedNextTargetThisSession = useRef(false);
  const pendingNextTarget = useRef<StreamQualityAdvisorTarget | null>(null);
  const pendingDecision = useRef<StreamQualityAutomationDecision | null>(null);

  useEffect(() => {
    if (streamStatus === "preparing") {
      lastDecisionKey.current = null;
      appliedNextTargetThisSession.current = false;
      pendingNextTarget.current = null;
      pendingDecision.current = null;
    }
  }, [streamStatus]);

  useEffect(() => {
    if (decision.command === "none") {
      lastDecisionKey.current = null;
      pendingNextTarget.current = null;
      pendingDecision.current = null;
      return;
    }

    if (decision.command === "apply-live-target" && decision.suggestedTarget) {
      if (decision.key !== null && lastDecisionKey.current === decision.key) {
        return;
      }
      lastDecisionKey.current = decision.key;
      appliedNextTargetThisSession.current = true;
      pendingNextTarget.current = null;
      pendingDecision.current = null;
      onDecision?.(decision);
      onApplyLiveTarget?.(decision.suggestedTarget);
      return;
    }

    if (
      decision.command === "alert" &&
      decision.suggestedTarget &&
      (streamStatus === "live" || streamStatus === "reconnecting")
    ) {
      pendingNextTarget.current = decision.suggestedTarget;
      pendingDecision.current = decision;
    }

    if (
      (streamStatus === "idle" || streamStatus === "failed") &&
      pendingNextTarget.current &&
      pendingDecision.current &&
      !appliedNextTargetThisSession.current
    ) {
      const appliedDecision = createAppliedStreamQualityAutomationDecision(pendingDecision.current, pendingNextTarget.current);
      lastDecisionKey.current = appliedDecision.key;
      appliedNextTargetThisSession.current = true;
      pendingNextTarget.current = null;
      pendingDecision.current = null;
      onDecision?.(appliedDecision);
      if (appliedDecision.suggestedTarget) {
        onApplyNextTarget?.(appliedDecision.suggestedTarget);
      }
      return;
    }

    if (decision.key === null || lastDecisionKey.current === decision.key) {
      return;
    }

    if (decision.command === "apply-next-target" && appliedNextTargetThisSession.current) {
      return;
    }

    lastDecisionKey.current = decision.key;
    onDecision?.(decision);

    if (decision.command === "apply-next-target" && decision.suggestedTarget) {
      appliedNextTargetThisSession.current = true;
      onApplyNextTarget?.(decision.suggestedTarget);
    }
  }, [decision, onApplyLiveTarget, onApplyNextTarget, onDecision, streamStatus]);
};
