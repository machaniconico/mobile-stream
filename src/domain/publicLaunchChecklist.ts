import type { PlatformPublishingFreshness } from "./platformPublishingFreshness";
import type { StreamDiagnostics } from "./streamDiagnostics";
import type {
  StreamStartPreflightArea,
  StreamStartPreflightIssue,
  StreamStartPreflightReport
} from "./streamStartPreflight";

export type PublicLaunchChecklistStatus = "ready" | "warning" | "blocked";
export type PublicLaunchChecklistItemStatus = "pass" | "warn" | "fail";
export type PublicLaunchChecklistItemId =
  | "destination"
  | "platform-dashboard"
  | "chat-readout"
  | "mic-monitor"
  | "commercial-evidence"
  | "engine";

export interface PublicLaunchChecklistItem {
  id: PublicLaunchChecklistItemId;
  status: PublicLaunchChecklistItemStatus;
  label: string;
  detail: string;
  action: string;
}

export interface PublicLaunchChecklist {
  status: PublicLaunchChecklistStatus;
  summary: string;
  primaryAction: string;
  passCount: number;
  warningCount: number;
  failCount: number;
  items: PublicLaunchChecklistItem[];
}

export interface PublicLaunchChecklistInput {
  preflight: StreamStartPreflightReport;
  diagnostics: Pick<
    StreamDiagnostics,
    "target" | "telemetry" | "audio" | "chatReadout" | "platformPublishing" | "validation"
  >;
  platformPublishingFreshness: PlatformPublishingFreshness;
}

export const createPublicLaunchChecklist = ({
  preflight,
  diagnostics,
  platformPublishingFreshness
}: PublicLaunchChecklistInput): PublicLaunchChecklist => {
  const items = [
    createDestinationItem(preflight, diagnostics),
    createPlatformDashboardItem(preflight, diagnostics, platformPublishingFreshness),
    createChatReadoutItem(preflight, diagnostics),
    createMicMonitorItem(preflight, diagnostics),
    createCommercialEvidenceItem(preflight, diagnostics),
    createEngineItem(preflight, diagnostics)
  ];
  const passCount = countItems(items, "pass");
  const warningCount = countItems(items, "warn");
  const failCount = countItems(items, "fail");
  const status: PublicLaunchChecklistStatus = failCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "ready";

  return {
    status,
    summary: createSummary(status, { failCount, warningCount }),
    primaryAction: createPrimaryAction(status, items),
    passCount,
    warningCount,
    failCount,
    items
  };
};

const createDestinationItem = (
  preflight: StreamStartPreflightReport,
  diagnostics: PublicLaunchChecklistInput["diagnostics"]
): PublicLaunchChecklistItem => {
  const issue = findMostSevereIssue(preflight, ["destination", "security", "quality", "scene"]);
  if (issue) {
    return issueItem("destination", "Destination and scene", issue);
  }

  return {
    id: "destination",
    status: "pass",
    label: "Destination and scene",
    detail: `${diagnostics.target.platform} is set to ${diagnostics.target.protocol.toUpperCase()} at ${diagnostics.target.publishUrlPreview}.`,
    action: "Keep the destination, stream key, quality target, and visible scene unchanged before launch."
  };
};

const createPlatformDashboardItem = (
  preflight: StreamStartPreflightReport,
  diagnostics: PublicLaunchChecklistInput["diagnostics"],
  freshness: PlatformPublishingFreshness
): PublicLaunchChecklistItem => {
  const issue = findMostSevereIssue(preflight, ["publishing"]);
  if (issue) {
    return issueItem("platform-dashboard", "Platform dashboard", issue);
  }

  if (freshness.status === "invalid") {
    return {
      id: "platform-dashboard",
      status: "fail",
      label: "Platform dashboard",
      detail: freshness.summary,
      action: freshness.recommendation
    };
  }

  if (freshness.status === "missing" || freshness.status === "stale") {
    return {
      id: "platform-dashboard",
      status: "warn",
      label: "Platform dashboard",
      detail: freshness.summary,
      action: freshness.recommendation
    };
  }

  return {
    id: "platform-dashboard",
    status: "pass",
    label: "Platform dashboard",
    detail: `${diagnostics.platformPublishing.summary} ${freshness.summary}`,
    action: "Keep the latest platform dashboard snapshot with the launch evidence."
  };
};

const createChatReadoutItem = (
  preflight: StreamStartPreflightReport,
  diagnostics: PublicLaunchChecklistInput["diagnostics"]
): PublicLaunchChecklistItem => {
  const issue = findMostSevereIssue(preflight, ["chat"]);
  if (issue) {
    return issueItem("chat-readout", "Chat readout", issue);
  }

  const chat = diagnostics.chatReadout;
  if (!chat.platformChatEnabled) {
    return {
      id: "chat-readout",
      status: "warn",
      label: "Chat readout",
      detail: "Platform chat is disabled, so YouTube Live or Twitch comments will not be fetched for readout.",
      action: "Enable platform chat and connect the selected platform before a public stream if spoken comments are required."
    };
  }

  if (!chat.readerEnabled) {
    return {
      id: "chat-readout",
      status: "warn",
      label: "Chat readout",
      detail: "Platform chat is configured, but spoken comment readout is disabled.",
      action: "Turn on chat readout and verify one sample message is queued and spoken."
    };
  }

  if (chat.connectionPhase !== "connected") {
    return {
      id: "chat-readout",
      status: "warn",
      label: "Chat readout",
      detail: chat.connectionMessage || `Platform chat is ${chat.connectionPhase || "not connected"}.`,
      action: "Connect YouTube Live or Twitch chat and ingest a sample message before public launch."
    };
  }

  return {
    id: "chat-readout",
    status: "pass",
    label: "Chat readout",
    detail: chat.connectionMessage || `${chat.connectionLabel || "Platform chat"} is connected for spoken comments.`,
    action: "Keep the chat connection active and retain a sample readout event with launch evidence."
  };
};

const createMicMonitorItem = (
  preflight: StreamStartPreflightReport,
  diagnostics: PublicLaunchChecklistInput["diagnostics"]
): PublicLaunchChecklistItem => {
  const issue = findMostSevereIssue(preflight, ["audio"]);
  if (issue) {
    return issueItem("mic-monitor", "Mic FX monitor", issue);
  }

  const audio = diagnostics.audio;
  if (!audio.micEffectsEnabled) {
    return {
      id: "mic-monitor",
      status: "warn",
      label: "Mic FX monitor",
      detail: "Mic effects are disabled, so the public voice chain is not being monitored.",
      action: "Enable the intended mic FX preset and listen through headphones before public launch."
    };
  }

  if (!audio.monitorEnabled) {
    return {
      id: "mic-monitor",
      status: "warn",
      label: "Mic FX monitor",
      detail: `${audio.presetId} mic effects are enabled, but self-monitoring is off.`,
      action: "Enable headphone monitoring so the processed voice can be checked before Go Live."
    };
  }

  if (audio.monitorVolume <= 0) {
    return {
      id: "mic-monitor",
      status: "warn",
      label: "Mic FX monitor",
      detail: "Self-monitoring is enabled but muted.",
      action: "Raise monitor volume to an audible level and confirm the processed voice in headphones."
    };
  }

  if (!audio.monitorHeadphonesOnly) {
    return {
      id: "mic-monitor",
      status: "warn",
      label: "Mic FX monitor",
      detail: "Self-monitoring is not limited to headphones.",
      action: "Switch monitoring to headphones-only to avoid speaker feedback during public streams."
    };
  }

  if (audio.monitorSafety.status === "fail") {
    return {
      id: "mic-monitor",
      status: "fail",
      label: "Mic FX monitor",
      detail: audio.monitorSafety.summary,
      action: audio.monitorSafety.recommendation
    };
  }

  if (audio.monitorSafety.status === "warn") {
    return {
      id: "mic-monitor",
      status: "warn",
      label: "Mic FX monitor",
      detail: audio.monitorSafety.summary,
      action: audio.monitorSafety.recommendation
    };
  }

  return {
    id: "mic-monitor",
    status: "pass",
    label: "Mic FX monitor",
    detail: `${audio.presetId} is monitored at ${Math.round(audio.monitorVolume * 100)}% through ${audio.monitorSafety.outputName}.`,
    action: "Keep the preset, gain, compression, and monitor route unchanged for launch."
  };
};

const createCommercialEvidenceItem = (
  preflight: StreamStartPreflightReport,
  diagnostics: PublicLaunchChecklistInput["diagnostics"]
): PublicLaunchChecklistItem => {
  const issue = findMostSevereIssue(preflight, ["validation"]);
  if (issue) {
    return issueItem("commercial-evidence", "Commercial evidence", issue);
  }

  if (diagnostics.validation.status === "blocked") {
    return {
      id: "commercial-evidence",
      status: "fail",
      label: "Commercial evidence",
      detail: diagnostics.validation.summary,
      action: diagnostics.validation.recommendedNextStep
    };
  }

  if (diagnostics.validation.status === "needs-test") {
    return {
      id: "commercial-evidence",
      status: "warn",
      label: "Commercial evidence",
      detail: diagnostics.validation.summary,
      action: diagnostics.validation.recommendedNextStep
    };
  }

  return {
    id: "commercial-evidence",
    status: "pass",
    label: "Commercial evidence",
    detail: diagnostics.validation.summary,
    action: "Retain the support bundle and validation run before changing app build, platform, or stream settings."
  };
};

const createEngineItem = (
  preflight: StreamStartPreflightReport,
  diagnostics: PublicLaunchChecklistInput["diagnostics"]
): PublicLaunchChecklistItem => {
  const issue = findMostSevereIssue(preflight, ["engine", "operation"]);
  if (issue) {
    return issueItem("engine", "Engine state", issue);
  }

  return {
    id: "engine",
    status: "pass",
    label: "Engine state",
    detail: `Encoder state is ${diagnostics.telemetry.streamStatus}.`,
    action: "Start only when the encoder is idle and no previous operation is pending."
  };
};

const findMostSevereIssue = (
  preflight: StreamStartPreflightReport,
  areas: StreamStartPreflightArea[]
): StreamStartPreflightIssue | undefined =>
  preflight.blocks.find((issue) => areas.includes(issue.area)) ??
  preflight.warnings.find((issue) => areas.includes(issue.area));

const issueItem = (
  id: PublicLaunchChecklistItemId,
  label: string,
  issue: StreamStartPreflightIssue
): PublicLaunchChecklistItem => ({
  id,
  status: issue.severity === "block" ? "fail" : "warn",
  label,
  detail: issue.message,
  action: issue.recommendation
});

const countItems = (items: PublicLaunchChecklistItem[], status: PublicLaunchChecklistItemStatus): number =>
  items.filter((item) => item.status === status).length;

const createSummary = (
  status: PublicLaunchChecklistStatus,
  counts: { failCount: number; warningCount: number }
): string => {
  if (status === "blocked") {
    return `${counts.failCount} public launch block${counts.failCount === 1 ? "" : "s"} remain.`;
  }
  if (status === "warning") {
    return `${counts.warningCount} public launch warning${counts.warningCount === 1 ? "" : "s"} to review.`;
  }
  return "Public launch checklist is ready.";
};

const createPrimaryAction = (
  status: PublicLaunchChecklistStatus,
  items: PublicLaunchChecklistItem[]
): string => {
  if (status === "blocked") {
    return items.find((item) => item.status === "fail")?.action ?? "Resolve public launch blockers before going visible.";
  }
  if (status === "warning") {
    return items.find((item) => item.status === "warn")?.action ?? "Review warnings before public launch.";
  }
  return "Go live when the platform dashboard and operator checks are still fresh.";
};
