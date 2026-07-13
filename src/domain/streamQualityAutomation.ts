import type { StreamQualityAdvisorRecommendation, StreamQualityAdvisorTarget } from "./streamQualityAdvisor";
import type { StreamStatus } from "./streamState";

export type StreamQualityAutomationCommand = "none" | "alert" | "apply-live-target" | "apply-next-target";

export interface StreamQualityAutomationDecision {
  command: StreamQualityAutomationCommand;
  key: string | null;
  severity: "info" | "warn" | "fail";
  title: string;
  summary: string;
  reason: string;
  action: string;
  currentTarget: StreamQualityAdvisorTarget;
  suggestedTarget: StreamQualityAdvisorTarget | null;
}

export interface StreamQualityAutomationDecisionInput {
  advisor: StreamQualityAdvisorRecommendation;
  streamStatus: StreamStatus;
  elapsedSeconds: number;
  canApplyLiveTarget?: boolean;
}

export const createStreamQualityAutomationDecision = ({
  advisor,
  streamStatus,
  elapsedSeconds,
  canApplyLiveTarget = false
}: StreamQualityAutomationDecisionInput): StreamQualityAutomationDecision => {
  const base = {
    currentTarget: advisor.currentTarget,
    suggestedTarget: advisor.suggestedTarget
  };

  if (advisor.severity === "pass" || advisor.severity === "info") {
    return createDecision({
      command: "none",
      key: null,
      severity: "info",
      title: "Quality automation idle",
      summary: advisor.summary,
      reason: advisor.reason,
      action: "Keep the current quality target.",
      ...base
    });
  }

  if (streamStatus === "idle" || streamStatus === "failed") {
    if (advisor.action === "lower-quality" && advisor.suggestedTarget) {
      return createDecision({
        command: "apply-next-target",
        severity: "warn",
        title: "Auto quality target lowered",
        summary: `Next stream target will use ${formatTarget(advisor.suggestedTarget)}.`,
        reason: advisor.reason || advisor.summary,
        action: "The current encoder is no longer live, so the safer target can be applied for the next start.",
        ...base
      });
    }

    return createDecision({
      command: "alert",
      severity: advisor.severity === "fail" ? "fail" : "warn",
      title: "Quality action required",
      summary: advisor.summary,
      reason: advisor.reason,
      action: advisor.recommendation,
      ...base
    });
  }

  if (streamStatus === "live" || streamStatus === "reconnecting") {
    const hasRunPastStartupGrace = elapsedSeconds >= 10 || streamStatus === "reconnecting";
    if (advisor.action === "lower-quality" && advisor.suggestedTarget && hasRunPastStartupGrace && canApplyLiveTarget) {
      return createDecision({
        command: "apply-live-target",
        severity: "warn",
        title: "Live quality target lowered",
        summary: `Live encoder target will use ${formatTarget(advisor.suggestedTarget)}.`,
        reason: advisor.reason,
        action: "The target keeps the current resolution and lowers encoder pressure while the stream stays live.",
        ...base
      });
    }

    return createDecision({
      command: "alert",
      severity: advisor.severity === "fail" ? "fail" : "warn",
      title: advisor.action === "lower-quality" && hasRunPastStartupGrace ? "Quality downgrade armed" : "Quality alert",
      summary:
        advisor.action === "lower-quality" && advisor.suggestedTarget
          ? `Live quality is unstable. ${formatTarget(advisor.suggestedTarget)} is armed for the next safe restart.`
          : advisor.summary,
      reason: advisor.reason,
      action:
        advisor.action === "lower-quality" && advisor.suggestedTarget
          ? "Keep the current encoder stable for now; the app will lower the next-start target after the live encoder stops."
          : advisor.recommendation,
      ...base
    });
  }

  return createDecision({
    command: "none",
    key: null,
    severity: "info",
    title: "Quality automation idle",
    summary: advisor.summary,
    reason: advisor.reason,
    action: "No quality automation is available for the current stream state.",
    ...base
  });
};

export const createAppliedStreamQualityAutomationDecision = (
  pendingDecision: StreamQualityAutomationDecision,
  target: StreamQualityAdvisorTarget
): StreamQualityAutomationDecision =>
  createDecision({
    command: "apply-next-target",
    severity: "warn",
    title: "Auto quality target lowered",
    summary: `Next stream target will use ${formatTarget(target)}.`,
    reason: pendingDecision.reason || pendingDecision.summary,
    action: "The current encoder is no longer live, so the safer target has been applied for the next start.",
    currentTarget: pendingDecision.currentTarget,
    suggestedTarget: target
  });

export const deferNativeOwnedBitrateDecision = (
  decision: StreamQualityAutomationDecision,
  nativeOwned: boolean
): StreamQualityAutomationDecision => {
  const target = decision.suggestedTarget;
  const changesVideoBitrate = Boolean(
    target && target.videoBitrateKbps !== decision.currentTarget.videoBitrateKbps
  );
  const bitrateOnly = Boolean(
    target &&
      target.width === decision.currentTarget.width &&
      target.height === decision.currentTarget.height &&
      target.fps === decision.currentTarget.fps &&
      target.audioBitrateKbps === decision.currentTarget.audioBitrateKbps &&
      target.videoBitrateKbps !== decision.currentTarget.videoBitrateKbps
  );
  if (!nativeOwned || decision.command !== "apply-live-target" || !target || !changesVideoBitrate) {
    return decision;
  }

  if (bitrateOnly) {
    return {
      ...decision,
      command: "none",
      key: null,
      severity: "info",
      title: "Native quality control active",
      summary: "The native publisher owns live bitrate reduction and recovery for this stream.",
      action: "Keep observing native queue pressure and the effective bitrate target."
    };
  }

  const suggestedTarget: StreamQualityAdvisorTarget = {
    ...target,
    profileId: null,
    profileName: `${target.profileName} with native bitrate control`,
    videoBitrateKbps: decision.currentTarget.videoBitrateKbps,
    estimatedUploadKbps: Math.round(
      (decision.currentTarget.videoBitrateKbps + target.audioBitrateKbps) * 1.25
    )
  };
  return {
    ...decision,
    suggestedTarget,
    summary: `Live encoder target will use ${formatTarget(suggestedTarget)} while native bitrate control remains active.`,
    action: "Apply the non-bitrate quality change while the native publisher retains its effective bitrate target."
  };
};

const createDecision = (
  decision: Omit<StreamQualityAutomationDecision, "key"> & { key?: string | null }
): StreamQualityAutomationDecision => ({
  ...decision,
  key: decision.key === undefined ? createDecisionKey(decision) : decision.key
});

const createDecisionKey = (
  decision: Omit<StreamQualityAutomationDecision, "key">
): string =>
  [
    decision.command,
    decision.severity,
    decision.title,
    decision.currentTarget.profileId ?? decision.currentTarget.profileName,
    decision.suggestedTarget?.profileId ?? decision.suggestedTarget?.profileName ?? "none"
  ].join(":");

const formatTarget = (target: StreamQualityAdvisorTarget): string =>
  `${target.profileName} (${target.videoBitrateKbps} kbps / ${target.fps}fps)`;
