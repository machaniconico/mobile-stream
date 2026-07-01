import type { ReadinessReport } from "./readiness";
import type { SceneDocument, TextSourceMode } from "./scene";

export type TextOverlayDiagnosticStatus = "pass" | "warn" | "fail" | "info";

export interface TextOverlayDiagnostics {
  status: TextOverlayDiagnosticStatus;
  sourceCount: number;
  visibleSourceCount: number;
  manualSourceCount: number;
  visibleManualSourceCount: number;
  runtimeCaptionSourceCount: number;
  visibleRuntimeCaptionSourceCount: number;
  emptyVisibleManualSourceCount: number;
  transparentVisibleSourceCount: number;
  dominantBackdropIssueCount: number;
  sensitiveContentIssueCount: number;
  modeCounts: Record<TextSourceMode, number>;
  summary: string;
  recommendation: string;
}

export const createTextOverlayDiagnostics = (
  scene: SceneDocument,
  readiness: Pick<ReadinessReport, "issues">
): TextOverlayDiagnostics => {
  const textSources = scene.sources.filter((source) => source.kind === "text");
  const visibleTextSources = textSources.filter((source) => source.visible);
  const manualSources = textSources.filter((source) => source.contentSource === "manual");
  const visibleManualSources = manualSources.filter((source) => source.visible);
  const runtimeCaptionSources = textSources.filter((source) => source.contentSource === "runtime-caption");
  const visibleRuntimeCaptionSources = runtimeCaptionSources.filter((source) => source.visible);
  const emptyVisibleManualSources = visibleManualSources.filter((source) => source.text.trim().length === 0);
  const transparentVisibleSources = visibleTextSources.filter((source) => source.backgroundOpacity === 0);
  const dominantBackdropIssueCount = readiness.issues.filter(
    (issue) => issue.code === "scene-text-overlay-background-dominant"
  ).length;
  const sensitiveContentIssueCount = readiness.issues.filter(
    (issue) => issue.code === "scene-text-overlay-sensitive-content"
  ).length;
  const modeCounts = textSources.reduce<Record<TextSourceMode, number>>(
    (counts, source) => ({
      ...counts,
      [source.mode]: counts[source.mode] + 1
    }),
    {
      label: 0,
      subtitle: 0,
      ticker: 0,
      caption: 0
    }
  );
  const status = createTextOverlayStatus({
    visibleSourceCount: visibleTextSources.length,
    emptyVisibleManualSourceCount: emptyVisibleManualSources.length,
    dominantBackdropIssueCount,
    sensitiveContentIssueCount
  });

  return {
    status,
    sourceCount: textSources.length,
    visibleSourceCount: visibleTextSources.length,
    manualSourceCount: manualSources.length,
    visibleManualSourceCount: visibleManualSources.length,
    runtimeCaptionSourceCount: runtimeCaptionSources.length,
    visibleRuntimeCaptionSourceCount: visibleRuntimeCaptionSources.length,
    emptyVisibleManualSourceCount: emptyVisibleManualSources.length,
    transparentVisibleSourceCount: transparentVisibleSources.length,
    dominantBackdropIssueCount,
    sensitiveContentIssueCount,
    modeCounts,
    summary: createTextOverlaySummary({
      status,
      sourceCount: textSources.length,
      visibleSourceCount: visibleTextSources.length,
      visibleManualSourceCount: visibleManualSources.length,
      visibleRuntimeCaptionSourceCount: visibleRuntimeCaptionSources.length,
      emptyVisibleManualSourceCount: emptyVisibleManualSources.length,
      dominantBackdropIssueCount,
      sensitiveContentIssueCount
    }),
    recommendation: createTextOverlayRecommendation({
      status,
      sourceCount: textSources.length,
      visibleSourceCount: visibleTextSources.length,
      emptyVisibleManualSourceCount: emptyVisibleManualSources.length,
      dominantBackdropIssueCount,
      sensitiveContentIssueCount
    })
  };
};

const createTextOverlayStatus = ({
  visibleSourceCount,
  emptyVisibleManualSourceCount,
  dominantBackdropIssueCount,
  sensitiveContentIssueCount
}: {
  visibleSourceCount: number;
  emptyVisibleManualSourceCount: number;
  dominantBackdropIssueCount: number;
  sensitiveContentIssueCount: number;
}): TextOverlayDiagnosticStatus => {
  if (sensitiveContentIssueCount > 0) {
    return "fail";
  }
  if (dominantBackdropIssueCount > 0 || emptyVisibleManualSourceCount > 0) {
    return "warn";
  }
  if (visibleSourceCount > 0) {
    return "pass";
  }
  return "info";
};

const createTextOverlaySummary = ({
  status,
  sourceCount,
  visibleSourceCount,
  visibleManualSourceCount,
  visibleRuntimeCaptionSourceCount,
  emptyVisibleManualSourceCount,
  dominantBackdropIssueCount,
  sensitiveContentIssueCount
}: {
  status: TextOverlayDiagnosticStatus;
  sourceCount: number;
  visibleSourceCount: number;
  visibleManualSourceCount: number;
  visibleRuntimeCaptionSourceCount: number;
  emptyVisibleManualSourceCount: number;
  dominantBackdropIssueCount: number;
  sensitiveContentIssueCount: number;
}): string => {
  if (sensitiveContentIssueCount > 0) {
    return `${sensitiveContentIssueCount} visible text overlay${sensitiveContentIssueCount === 1 ? "" : "s"} may expose credentials.`;
  }
  if (dominantBackdropIssueCount > 0) {
    return `${dominantBackdropIssueCount} visible text overlay${dominantBackdropIssueCount === 1 ? "" : "s"} use large opaque backdrops.`;
  }
  if (emptyVisibleManualSourceCount > 0) {
    return `${emptyVisibleManualSourceCount} visible manual text overlay${emptyVisibleManualSourceCount === 1 ? "" : "s"} are empty.`;
  }
  if (visibleSourceCount > 0) {
    return `${visibleSourceCount}/${sourceCount} text overlay${sourceCount === 1 ? "" : "s"} visible: ${visibleManualSourceCount} manual and ${visibleRuntimeCaptionSourceCount} live-caption source${visibleRuntimeCaptionSourceCount === 1 ? "" : "s"}.`;
  }
  if (sourceCount > 0) {
    return `${sourceCount} text overlay${sourceCount === 1 ? "" : "s"} configured, but none are visible.`;
  }
  return status === "info" ? "No text overlays are configured in the active scene." : "Text overlay status is unavailable.";
};

const createTextOverlayRecommendation = ({
  status,
  sourceCount,
  visibleSourceCount,
  emptyVisibleManualSourceCount,
  dominantBackdropIssueCount,
  sensitiveContentIssueCount
}: {
  status: TextOverlayDiagnosticStatus;
  sourceCount: number;
  visibleSourceCount: number;
  emptyVisibleManualSourceCount: number;
  dominantBackdropIssueCount: number;
  sensitiveContentIssueCount: number;
}): string => {
  if (sensitiveContentIssueCount > 0) {
    return "Remove stream keys, OAuth tokens, callback URLs, and API credentials from visible text overlays before launch.";
  }
  if (dominantBackdropIssueCount > 0) {
    return "Reduce text backdrop opacity or size, then confirm the game screen and avatar remain visible on device.";
  }
  if (emptyVisibleManualSourceCount > 0) {
    return "Fill or hide empty manual text overlays before exporting launch evidence.";
  }
  if (visibleSourceCount > 0) {
    return "Keep text positions, transparency, font size, and outline settings unchanged for the retained launch evidence.";
  }
  if (sourceCount > 0) {
    return "Show the intended text overlays before public launch, or remove unused hidden text sources from the scene.";
  }
  return status === "info"
    ? "Add a subtitle, ticker, label, or live-caption text source when stream copy must appear on the program output."
    : "Review text overlay setup before launch.";
};
