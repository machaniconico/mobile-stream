import type { ReadinessIssue, ReadinessReport } from "./readiness";
import type { StreamOperationStatus } from "./streamOperation";
import type { StreamStatus } from "./streamState";

export type StreamStartPreflightStatus = "ready" | "warning" | "blocked";
export type StreamStartPreflightSeverity = "block" | "warning";
export type StreamStartPreflightArea = "destination" | "quality" | "scene" | "security" | "audio" | "engine" | "operation";

export interface StreamStartPreflightIssue {
  code: string;
  severity: StreamStartPreflightSeverity;
  area: StreamStartPreflightArea;
  label: string;
  message: string;
  recommendation: string;
}

export interface StreamStartPreflightReport {
  canStart: boolean;
  status: StreamStartPreflightStatus;
  summary: string;
  primaryAction: string;
  blocks: StreamStartPreflightIssue[];
  warnings: StreamStartPreflightIssue[];
  issues: StreamStartPreflightIssue[];
}

export interface StreamStartPreflightInput {
  readiness: ReadinessReport;
  streamStatus: StreamStatus;
  operationStatus?: StreamOperationStatus | null;
}

export const createStreamStartPreflightReport = ({
  readiness,
  streamStatus,
  operationStatus = null
}: StreamStartPreflightInput): StreamStartPreflightReport => {
  const issues = [
    ...readiness.issues.map(toPreflightIssue),
    ...createEngineStateIssues(streamStatus),
    ...createOperationIssues(operationStatus)
  ];
  const blocks = issues.filter((issue) => issue.severity === "block");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const status: StreamStartPreflightStatus = blocks.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready";

  return {
    canStart: blocks.length === 0,
    status,
    summary: createSummary(status, blocks.length, warnings.length),
    primaryAction: createPrimaryAction(status, blocks, warnings),
    blocks,
    warnings,
    issues
  };
};

export const formatStreamStartPreflightBlockMessage = (report: StreamStartPreflightReport): string => {
  if (report.canStart) {
    return "Launch preflight passed.";
  }

  const visibleBlocks = report.blocks.slice(0, 3).map((issue) => issue.message);
  const remainingCount = report.blocks.length - visibleBlocks.length;
  const suffix = remainingCount > 0 ? ` (+${remainingCount} more)` : "";
  return `Launch preflight blocked: ${visibleBlocks.join("; ")}${suffix}`;
};

const toPreflightIssue = (issue: ReadinessIssue): StreamStartPreflightIssue => ({
  code: `readiness-${issue.code}`,
  severity: issue.severity === "error" ? "block" : "warning",
  area: readinessArea(issue),
  label: readinessLabel(issue),
  message: issue.message,
  recommendation: readinessRecommendation(issue)
});

const readinessArea = (issue: ReadinessIssue): StreamStartPreflightArea => {
  if (issue.field === "serverUrl" || issue.field === "streamKey") {
    return "destination";
  }
  if (issue.field === "micEffects") {
    return "audio";
  }
  return issue.field;
};

const readinessLabel = (issue: ReadinessIssue): string => {
  if (issue.field === "serverUrl") {
    return "Endpoint";
  }
  if (issue.field === "streamKey") {
    return "Stream key";
  }
  if (issue.field === "micEffects") {
    return "Mic";
  }
  return capitalize(issue.field);
};

const readinessRecommendation = (issue: ReadinessIssue): string => {
  switch (issue.field) {
    case "serverUrl":
      return "Set a valid YouTube Live, Twitch, or custom RTMP(S) ingest endpoint.";
    case "streamKey":
      return "Paste the full stream key from the destination platform before starting.";
    case "quality":
      return "Pick a supported resolution, FPS, and bitrate profile for the target platform.";
    case "scene":
      return "Enable at least one visible scene source and confirm the program preview.";
    case "security":
      return "Prefer RTMPS for production streams when the platform supports it.";
    case "micEffects":
      return "Lower risky monitor or gain settings before going live.";
  }
};

const createEngineStateIssues = (status: StreamStatus): StreamStartPreflightIssue[] => {
  if (status === "idle") {
    return [];
  }

  if (status === "failed") {
    return [
      {
        code: "engine-previous-failure",
        severity: "warning",
        area: "engine",
        label: "Engine",
        message: "Previous stream attempt ended in a failed state.",
        recommendation: "Retry only after checking the last error in diagnostics."
      }
    ];
  }

  const messages: Record<Exclude<StreamStatus, "idle" | "failed">, string> = {
    preparing: "Stream encoder is still preparing.",
    live: "A stream is already live.",
    reconnecting: "Stream recovery is reconnecting.",
    stopping: "Stream shutdown is still in progress."
  };

  return [
    {
      code: `engine-${status}`,
      severity: "block",
      area: "engine",
      label: "Engine",
      message: messages[status],
      recommendation: "Wait for the current stream operation to finish before starting again."
    }
  ];
};

const createOperationIssues = (operationStatus: StreamOperationStatus | null): StreamStartPreflightIssue[] => {
  if (!operationStatus) {
    return [];
  }

  if (operationStatus.kind === "pending") {
    return [
      {
        code: `operation-${operationStatus.action}-pending`,
        severity: "block",
        area: "operation",
        label: "Operation",
        message: operationStatus.message,
        recommendation: "Wait for the active operation to complete before starting a new stream."
      }
    ];
  }

  return [
    {
      code: `operation-${operationStatus.action}-failed`,
      severity: "warning",
      area: "operation",
      label: "Last operation",
      message: operationStatus.message,
      recommendation: "Review the failure message and retry when the setup looks correct."
    }
  ];
};

const createSummary = (status: StreamStartPreflightStatus, blockCount: number, warningCount: number): string => {
  if (status === "blocked") {
    return `${blockCount} launch block${blockCount === 1 ? "" : "s"} before Go Live.`;
  }
  if (status === "warning") {
    return `${warningCount} launch warning${warningCount === 1 ? "" : "s"} to review.`;
  }
  return "Launch preflight is ready.";
};

const createPrimaryAction = (
  status: StreamStartPreflightStatus,
  blocks: StreamStartPreflightIssue[],
  warnings: StreamStartPreflightIssue[]
): string => {
  if (status === "blocked") {
    return blocks[0]?.recommendation ?? "Resolve launch blocks before going live.";
  }
  if (status === "warning") {
    return warnings[0]?.recommendation ?? "Review warnings, then start when ready.";
  }
  return "Start the stream when you are ready.";
};

const capitalize = (value: string): string => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
