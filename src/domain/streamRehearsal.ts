import type { StreamStatus } from "./streamState";
import type { StreamValidationChecklist } from "./streamValidationChecklist";
import type { StreamValidationEvidenceSummary } from "./streamValidationEvidence";
import type { StreamValidationRunbook } from "./streamValidationRunbook";

export type StreamRehearsalStatus = "ready" | "needs-run" | "blocked";
export type StreamRehearsalItemStatus = "pass" | "warn" | "fail" | "pending";
export type StreamRehearsalGrade = "A" | "B" | "C" | "D" | "F";
export type StreamRehearsalItemId =
  | "target"
  | "private-ingest"
  | "runbook"
  | "feature-proof"
  | "release-evidence";

export interface StreamRehearsalItem {
  id: StreamRehearsalItemId;
  status: StreamRehearsalItemStatus;
  label: string;
  detail: string;
  action: string;
}

export interface StreamRehearsalReport {
  status: StreamRehearsalStatus;
  canPromoteToPublic: boolean;
  summary: string;
  primaryAction: string;
  score: number;
  grade: StreamRehearsalGrade;
  weakAreaCount: number;
  passCount: number;
  warningCount: number;
  failCount: number;
  pendingCount: number;
  items: StreamRehearsalItem[];
}

export interface StreamRehearsalInput {
  target: {
    platform: string;
    protocol: string;
    secureTransport: boolean;
  };
  telemetry: {
    streamStatus: StreamStatus;
    bitrateKbps: number;
    fps: number;
    elapsedSeconds: number;
  };
  validation: Pick<StreamValidationChecklist, "status" | "summary" | "recommendedNextStep">;
  runbook: Pick<StreamValidationRunbook, "status" | "summary" | "nextAction" | "failCount" | "pendingCount" | "warningCount">;
  evidence: Pick<
    StreamValidationEvidenceSummary,
    | "status"
    | "summary"
    | "recommendation"
    | "physicalDeviceIosPass"
    | "physicalDeviceAndroidPass"
    | "nativeRuntimeIosPass"
    | "nativeRuntimeAndroidPass"
    | "monitorHoldIosPass"
    | "monitorHoldAndroidPass"
    | "faceTrackingIosPass"
    | "faceTrackingAndroidPass"
    | "audioIosPass"
    | "audioAndroidPass"
    | "chatReadoutIosPass"
    | "chatReadoutAndroidPass"
    | "platformPublishingIosPass"
    | "platformPublishingAndroidPass"
  >;
}

export const createStreamRehearsalReport = (input: StreamRehearsalInput): StreamRehearsalReport => {
  const items = [
    createTargetItem(input),
    createPrivateIngestItem(input),
    createRunbookItem(input),
    createFeatureProofItem(input),
    createReleaseEvidenceItem(input)
  ];
  const passCount = countStatus(items, "pass");
  const warningCount = countStatus(items, "warn");
  const failCount = countStatus(items, "fail");
  const pendingCount = countStatus(items, "pending");
  const score = scoreRehearsalItems(items);
  const status: StreamRehearsalStatus =
    failCount > 0 ? "blocked" : warningCount > 0 || pendingCount > 0 ? "needs-run" : "ready";

  return {
    status,
    canPromoteToPublic: status === "ready",
    summary: createSummary(status, { failCount, warningCount, pendingCount }),
    primaryAction: createPrimaryAction(items),
    score,
    grade: gradeRehearsalScore(score),
    weakAreaCount: items.length - passCount,
    passCount,
    warningCount,
    failCount,
    pendingCount,
    items
  };
};

const createTargetItem = ({ target }: StreamRehearsalInput): StreamRehearsalItem => {
  if (!target.secureTransport) {
    return {
      id: "target",
      status: "warn",
      label: "Rehearsal target",
      detail: `${target.platform} is configured with ${target.protocol.toUpperCase()}, so the rehearsal does not prove encrypted ingest.`,
      action: "Use RTMPS for the rehearsal when the destination supports it."
    };
  }

  return {
    id: "target",
    status: "pass",
    label: "Rehearsal target",
    detail: `${target.platform} is configured with ${target.protocol.toUpperCase()}.`,
    action: "Keep the destination and protocol unchanged through release approval."
  };
};

const createPrivateIngestItem = ({ telemetry }: StreamRehearsalInput): StreamRehearsalItem => {
  if (telemetry.streamStatus === "failed") {
    return {
      id: "private-ingest",
      status: "fail",
      label: "Private ingest",
      detail: "The stream engine is failed.",
      action: "Fix the start failure and repeat the rehearsal before public launch."
    };
  }

  if (telemetry.streamStatus === "reconnecting") {
    return {
      id: "private-ingest",
      status: "warn",
      label: "Private ingest",
      detail: "The rehearsal stream is reconnecting.",
      action: "Let recovery settle, then repeat the rehearsal if reconnects continue."
    };
  }

  if (telemetry.streamStatus === "live") {
    return {
      id: "private-ingest",
      status: "pass",
      label: "Private ingest",
      detail: `Live telemetry is present at ${telemetry.bitrateKbps} kbps / ${telemetry.fps} fps for ${telemetry.elapsedSeconds}s.`,
      action: "Keep the stream private until runbook and evidence checks pass."
    };
  }

  return {
    id: "private-ingest",
    status: "pending",
    label: "Private ingest",
    detail: "No active private RTMP(S) rehearsal stream is running.",
    action: "Start a private or unlisted rehearsal stream from a physical iOS or Android device."
  };
};

const createRunbookItem = ({ runbook }: StreamRehearsalInput): StreamRehearsalItem => {
  if (runbook.status === "blocked") {
    return {
      id: "runbook",
      status: "fail",
      label: "Rehearsal runbook",
      detail: runbook.summary,
      action: runbook.nextAction
    };
  }

  if (runbook.status === "complete") {
    return {
      id: "runbook",
      status: "pass",
      label: "Rehearsal runbook",
      detail: runbook.summary,
      action: "Archive this completed rehearsal with the release evidence."
    };
  }

  return {
    id: "runbook",
    status: "pending",
    label: "Rehearsal runbook",
    detail: `${runbook.summary} ${runbook.pendingCount} pending / ${runbook.warningCount} warning / ${runbook.failCount} fail.`,
    action: runbook.nextAction
  };
};

const createFeatureProofItem = ({ target, evidence }: StreamRehearsalInput): StreamRehearsalItem => {
  const missing = missingFeatureProof(target, evidence);
  if (missing.length === 0) {
    return {
      id: "feature-proof",
      status: "pass",
      label: "Feature proof",
      detail: "iOS and Android evidence covers device, native runtime, monitor hold, avatar motion, audio monitor, chat readout, and destination dashboard checks.",
      action: "Keep the current scene and profile unchanged before public launch."
    };
  }

  return {
    id: "feature-proof",
    status: evidence.status === "failing" ? "fail" : "pending",
    label: "Feature proof",
    detail: `Missing rehearsal proof for ${missing.join(", ")}.`,
    action: "Repeat private validation until both iOS and Android runs cover every release-critical feature."
  };
};

const createReleaseEvidenceItem = ({ validation, evidence }: StreamRehearsalInput): StreamRehearsalItem => {
  if (validation.status === "blocked" || evidence.status === "failing") {
    return {
      id: "release-evidence",
      status: "fail",
      label: "Release evidence",
      detail: validation.status === "blocked" ? validation.summary : evidence.summary,
      action: validation.status === "blocked" ? validation.recommendedNextStep : evidence.recommendation
    };
  }

  if (validation.status === "ready" && evidence.status === "ready") {
    return {
      id: "release-evidence",
      status: "pass",
      label: "Release evidence",
      detail: "Commercial validation and retained physical-device evidence are ready.",
      action: "Export a support bundle immediately after this rehearsal."
    };
  }

  return {
    id: "release-evidence",
    status: "pending",
    label: "Release evidence",
    detail: `${validation.summary} ${evidence.summary}`,
    action: validation.status === "ready" ? evidence.recommendation : validation.recommendedNextStep
  };
};

const missingFeatureProof = (
  target: StreamRehearsalInput["target"],
  evidence: StreamRehearsalInput["evidence"]
): string[] => [
  evidence.physicalDeviceIosPass && evidence.physicalDeviceAndroidPass ? "" : "physical devices",
  evidence.nativeRuntimeIosPass && evidence.nativeRuntimeAndroidPass ? "" : "native publisher/compositor",
  evidence.monitorHoldIosPass && evidence.monitorHoldAndroidPass ? "" : "stable monitor hold",
  evidence.faceTrackingIosPass && evidence.faceTrackingAndroidPass ? "" : "avatar motion",
  evidence.audioIosPass && evidence.audioAndroidPass ? "" : "mic FX/headphone monitor",
  evidence.chatReadoutIosPass && evidence.chatReadoutAndroidPass ? "" : "chat readout",
  shouldRequireDashboardProof(target) && (!evidence.platformPublishingIosPass || !evidence.platformPublishingAndroidPass)
    ? "destination dashboard"
    : ""
].filter(Boolean);

const shouldRequireDashboardProof = (target: StreamRehearsalInput["target"]): boolean =>
  target.platform === "YouTube Live" || target.platform === "Twitch";

const createSummary = (
  status: StreamRehearsalStatus,
  counts: { failCount: number; warningCount: number; pendingCount: number }
): string => {
  if (status === "ready") {
    return "Rehearsal is ready to promote to a platform-visible launch.";
  }
  if (status === "blocked") {
    return `Rehearsal is blocked by ${counts.failCount} failure${counts.failCount === 1 ? "" : "s"}.`;
  }
  return `Rehearsal still needs ${counts.pendingCount + counts.warningCount} check${counts.pendingCount + counts.warningCount === 1 ? "" : "s"}.`;
};

const createPrimaryAction = (items: StreamRehearsalItem[]): string =>
  items.find((item) => item.status === "fail")?.action ??
  items.find((item) => item.status === "pending")?.action ??
  items.find((item) => item.status === "warn")?.action ??
  "Export a support bundle and keep the rehearsed profile unchanged.";

const countStatus = (items: StreamRehearsalItem[], status: StreamRehearsalItemStatus): number =>
  items.filter((item) => item.status === status).length;

const rehearsalItemWeights: Record<StreamRehearsalItemId, number> = {
  target: 10,
  "private-ingest": 25,
  runbook: 20,
  "feature-proof": 25,
  "release-evidence": 20
};

const rehearsalStatusFactors: Record<StreamRehearsalItemStatus, number> = {
  pass: 1,
  warn: 0.7,
  pending: 0.35,
  fail: 0
};

export const scoreRehearsalItems = (items: StreamRehearsalItem[]): number => {
  const totalWeight = items.reduce((total, item) => total + (rehearsalItemWeights[item.id] ?? 0), 0);
  if (totalWeight <= 0) {
    return 0;
  }

  const weightedScore = items.reduce(
    (total, item) => total + (rehearsalItemWeights[item.id] ?? 0) * rehearsalStatusFactors[item.status],
    0
  );
  return Math.round((weightedScore / totalWeight) * 100);
};

export const gradeRehearsalScore = (score: number): StreamRehearsalGrade => {
  if (score >= 95) {
    return "A";
  }
  if (score >= 85) {
    return "B";
  }
  if (score >= 70) {
    return "C";
  }
  if (score >= 50) {
    return "D";
  }
  return "F";
};
