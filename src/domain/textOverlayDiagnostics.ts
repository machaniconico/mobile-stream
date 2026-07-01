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
  renderVisibleSourceCount: number;
  activeTimedManualSourceCount: number;
  queuedTimedManualSourceCount: number;
  expiredTimedManualSourceCount: number;
  persistentManualSourceCount: number;
  emptyVisibleManualSourceCount: number;
  transparentVisibleSourceCount: number;
  dominantBackdropIssueCount: number;
  layoutRiskIssueCount: number;
  safeAreaIssueCount: number;
  avatarOverlapIssueCount: number;
  sensitiveContentIssueCount: number;
  modeCounts: Record<TextSourceMode, number>;
  summary: string;
  recommendation: string;
}

export const createTextOverlayDiagnostics = (
  scene: SceneDocument,
  readiness: Pick<ReadinessReport, "issues">,
  now = Date.now()
): TextOverlayDiagnostics => {
  const nowMs = Number.isFinite(now) ? Math.max(0, Math.round(now)) : Date.now();
  const textSources = scene.sources.filter((source) => source.kind === "text");
  const visibleTextSources = textSources.filter((source) => source.visible);
  const manualSources = textSources.filter((source) => source.contentSource === "manual");
  const visibleManualSources = manualSources.filter((source) => source.visible);
  const runtimeCaptionSources = textSources.filter((source) => source.contentSource === "runtime-caption");
  const visibleRuntimeCaptionSources = runtimeCaptionSources.filter((source) => source.visible);
  const renderVisibleSources = visibleTextSources.filter((source) => isTextSourceRenderVisible(source, nowMs));
  const activeTimedManualSources = visibleManualSources.filter((source) => isTimedTextSourceActive(source, nowMs));
  const queuedTimedManualSources = visibleManualSources.filter((source) => isTimedTextSourceQueued(source, nowMs));
  const expiredTimedManualSources = visibleManualSources.filter((source) => isTimedTextSourceExpired(source, nowMs));
  const persistentManualSources = visibleManualSources.filter((source) => source.visibilityMode === "always");
  const emptyVisibleManualSources = visibleManualSources.filter((source) => source.text.trim().length === 0);
  const transparentVisibleSources = visibleTextSources.filter((source) => source.backgroundOpacity === 0);
  const dominantBackdropIssueCount = readiness.issues.filter(
    (issue) => issue.code === "scene-text-overlay-background-dominant"
  ).length;
  const layoutRiskIssueCount = readiness.issues.filter(
    (issue) => issue.code === "scene-text-overlay-layout-risk"
  ).length;
  const safeAreaIssueCount = readiness.issues.filter(
    (issue) => issue.code === "scene-text-overlay-safe-area-risk"
  ).length;
  const avatarOverlapIssueCount = readiness.issues.filter(
    (issue) => issue.code === "scene-text-overlay-avatar-overlap-risk"
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
    renderVisibleSourceCount: renderVisibleSources.length,
    queuedTimedManualSourceCount: queuedTimedManualSources.length,
    expiredTimedManualSourceCount: expiredTimedManualSources.length,
    emptyVisibleManualSourceCount: emptyVisibleManualSources.length,
    dominantBackdropIssueCount,
    layoutRiskIssueCount,
    safeAreaIssueCount,
    avatarOverlapIssueCount,
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
    renderVisibleSourceCount: renderVisibleSources.length,
    activeTimedManualSourceCount: activeTimedManualSources.length,
    queuedTimedManualSourceCount: queuedTimedManualSources.length,
    expiredTimedManualSourceCount: expiredTimedManualSources.length,
    persistentManualSourceCount: persistentManualSources.length,
    emptyVisibleManualSourceCount: emptyVisibleManualSources.length,
    transparentVisibleSourceCount: transparentVisibleSources.length,
    dominantBackdropIssueCount,
    layoutRiskIssueCount,
    safeAreaIssueCount,
    avatarOverlapIssueCount,
    sensitiveContentIssueCount,
    modeCounts,
    summary: createTextOverlaySummary({
      status,
      sourceCount: textSources.length,
      visibleSourceCount: visibleTextSources.length,
      renderVisibleSourceCount: renderVisibleSources.length,
      visibleManualSourceCount: visibleManualSources.length,
      visibleRuntimeCaptionSourceCount: visibleRuntimeCaptionSources.length,
      activeTimedManualSourceCount: activeTimedManualSources.length,
      queuedTimedManualSourceCount: queuedTimedManualSources.length,
      expiredTimedManualSourceCount: expiredTimedManualSources.length,
      persistentManualSourceCount: persistentManualSources.length,
      emptyVisibleManualSourceCount: emptyVisibleManualSources.length,
      dominantBackdropIssueCount,
      layoutRiskIssueCount,
      safeAreaIssueCount,
      avatarOverlapIssueCount,
      sensitiveContentIssueCount
    }),
    recommendation: createTextOverlayRecommendation({
      status,
      sourceCount: textSources.length,
      renderVisibleSourceCount: renderVisibleSources.length,
      queuedTimedManualSourceCount: queuedTimedManualSources.length,
      expiredTimedManualSourceCount: expiredTimedManualSources.length,
      emptyVisibleManualSourceCount: emptyVisibleManualSources.length,
      dominantBackdropIssueCount,
      layoutRiskIssueCount,
      safeAreaIssueCount,
      avatarOverlapIssueCount,
      sensitiveContentIssueCount
    })
  };
};

const createTextOverlayStatus = ({
  renderVisibleSourceCount,
  queuedTimedManualSourceCount,
  expiredTimedManualSourceCount,
  emptyVisibleManualSourceCount,
  dominantBackdropIssueCount,
  layoutRiskIssueCount,
  safeAreaIssueCount,
  avatarOverlapIssueCount,
  sensitiveContentIssueCount
}: {
  renderVisibleSourceCount: number;
  queuedTimedManualSourceCount: number;
  expiredTimedManualSourceCount: number;
  emptyVisibleManualSourceCount: number;
  dominantBackdropIssueCount: number;
  layoutRiskIssueCount: number;
  safeAreaIssueCount: number;
  avatarOverlapIssueCount: number;
  sensitiveContentIssueCount: number;
}): TextOverlayDiagnosticStatus => {
  if (sensitiveContentIssueCount > 0) {
    return "fail";
  }
  if (
    queuedTimedManualSourceCount > 0 ||
    expiredTimedManualSourceCount > 0 ||
    dominantBackdropIssueCount > 0 ||
    layoutRiskIssueCount > 0 ||
    safeAreaIssueCount > 0 ||
    avatarOverlapIssueCount > 0 ||
    emptyVisibleManualSourceCount > 0
  ) {
    return "warn";
  }
  if (renderVisibleSourceCount > 0) {
    return "pass";
  }
  return "info";
};

const createTextOverlaySummary = ({
  status,
  sourceCount,
  visibleSourceCount,
  renderVisibleSourceCount,
  visibleManualSourceCount,
  visibleRuntimeCaptionSourceCount,
  activeTimedManualSourceCount,
  queuedTimedManualSourceCount,
  expiredTimedManualSourceCount,
  persistentManualSourceCount,
  emptyVisibleManualSourceCount,
  dominantBackdropIssueCount,
  layoutRiskIssueCount,
  safeAreaIssueCount,
  avatarOverlapIssueCount,
  sensitiveContentIssueCount
}: {
  status: TextOverlayDiagnosticStatus;
  sourceCount: number;
  visibleSourceCount: number;
  renderVisibleSourceCount: number;
  visibleManualSourceCount: number;
  visibleRuntimeCaptionSourceCount: number;
  activeTimedManualSourceCount: number;
  queuedTimedManualSourceCount: number;
  expiredTimedManualSourceCount: number;
  persistentManualSourceCount: number;
  emptyVisibleManualSourceCount: number;
  dominantBackdropIssueCount: number;
  layoutRiskIssueCount: number;
  safeAreaIssueCount: number;
  avatarOverlapIssueCount: number;
  sensitiveContentIssueCount: number;
}): string => {
  if (sensitiveContentIssueCount > 0) {
    return `${sensitiveContentIssueCount} visible text overlay${sensitiveContentIssueCount === 1 ? "" : "s"} may expose credentials or contact details.`;
  }
  if (dominantBackdropIssueCount > 0) {
    return `${dominantBackdropIssueCount} visible text overlay${dominantBackdropIssueCount === 1 ? "" : "s"} use large opaque backdrops.`;
  }
  if (layoutRiskIssueCount > 0) {
    return `${layoutRiskIssueCount} visible text overlay${layoutRiskIssueCount === 1 ? "" : "s"} may clip or be unreadable on mobile output.`;
  }
  if (safeAreaIssueCount > 0) {
    return `${safeAreaIssueCount} visible text overlay${safeAreaIssueCount === 1 ? "" : "s"} are too close to the program edge.`;
  }
  if (avatarOverlapIssueCount > 0) {
    return `${avatarOverlapIssueCount} visible text overlay${avatarOverlapIssueCount === 1 ? "" : "s"} overlap the avatar layer.`;
  }
  if (expiredTimedManualSourceCount > 0) {
    return `${expiredTimedManualSourceCount} visible timed text overlay${expiredTimedManualSourceCount === 1 ? "" : "s"} have expired and are no longer on the program output.`;
  }
  if (queuedTimedManualSourceCount > 0 && renderVisibleSourceCount === 0) {
    return `${queuedTimedManualSourceCount} timed text overlay${queuedTimedManualSourceCount === 1 ? "" : "s"} are queued, but no text is currently on the program output.`;
  }
  if (emptyVisibleManualSourceCount > 0) {
    return `${emptyVisibleManualSourceCount} visible manual text overlay${emptyVisibleManualSourceCount === 1 ? "" : "s"} are empty.`;
  }
  if (renderVisibleSourceCount > 0) {
    const renderVisibleManualSourceCount = persistentManualSourceCount + activeTimedManualSourceCount;
    return `${renderVisibleSourceCount}/${sourceCount} text overlay${sourceCount === 1 ? "" : "s"} on program output: ${renderVisibleManualSourceCount} manual (${persistentManualSourceCount} pinned, ${activeTimedManualSourceCount} timed active, ${queuedTimedManualSourceCount} queued) and ${visibleRuntimeCaptionSourceCount} live-caption source${visibleRuntimeCaptionSourceCount === 1 ? "" : "s"}.`;
  }
  if (visibleSourceCount > 0) {
    return `${visibleSourceCount}/${sourceCount} text overlay${sourceCount === 1 ? "" : "s"} enabled, but none are currently on the program output.`;
  }
  if (sourceCount > 0) {
    return `${sourceCount} text overlay${sourceCount === 1 ? "" : "s"} configured, but none are visible.`;
  }
  return status === "info" ? "No text overlays are configured in the active scene." : "Text overlay status is unavailable.";
};

const createTextOverlayRecommendation = ({
  status,
  sourceCount,
  renderVisibleSourceCount,
  queuedTimedManualSourceCount,
  expiredTimedManualSourceCount,
  emptyVisibleManualSourceCount,
  dominantBackdropIssueCount,
  layoutRiskIssueCount,
  safeAreaIssueCount,
  avatarOverlapIssueCount,
  sensitiveContentIssueCount
}: {
  status: TextOverlayDiagnosticStatus;
  sourceCount: number;
  renderVisibleSourceCount: number;
  queuedTimedManualSourceCount: number;
  expiredTimedManualSourceCount: number;
  emptyVisibleManualSourceCount: number;
  dominantBackdropIssueCount: number;
  layoutRiskIssueCount: number;
  safeAreaIssueCount: number;
  avatarOverlapIssueCount: number;
  sensitiveContentIssueCount: number;
}): string => {
  if (sensitiveContentIssueCount > 0) {
    return "Remove stream keys, OAuth tokens, callback URLs, API credentials, contact details, and invite links from visible text overlays before launch.";
  }
  if (dominantBackdropIssueCount > 0) {
    return "Reduce text backdrop opacity or size, then confirm the game screen and avatar remain visible on device.";
  }
  if (layoutRiskIssueCount > 0) {
    return "Increase the text box, reduce font size or max lines, then verify subtitles and labels on a target phone screen.";
  }
  if (safeAreaIssueCount > 0) {
    return "Move non-ticker text away from program edges, then verify phone safe areas and platform overlays do not cover it.";
  }
  if (avatarOverlapIssueCount > 0) {
    return "Move text away from the avatar or reduce the text box size, then verify the model remains visible during gameplay.";
  }
  if (expiredTimedManualSourceCount > 0) {
    return "Hide expired timed text overlays or trigger the intended subtitle/text again before exporting launch evidence.";
  }
  if (queuedTimedManualSourceCount > 0 && renderVisibleSourceCount === 0) {
    return "Start the queued text item or pin the intended text before Go Live so the launch evidence matches the program output.";
  }
  if (emptyVisibleManualSourceCount > 0) {
    return "Fill or hide empty manual text overlays before exporting launch evidence.";
  }
  if (renderVisibleSourceCount > 0) {
    return "Keep text positions, transparency, font size, and outline settings unchanged for the retained launch evidence.";
  }
  if (sourceCount > 0) {
    return "Show the intended text overlays before public launch, or remove unused hidden text sources from the scene.";
  }
  return status === "info"
    ? "Add a subtitle, ticker, label, or live-caption text source when stream copy must appear on the program output."
    : "Review text overlay setup before launch.";
};

const isTextSourceRenderVisible = (source: SceneDocument["sources"][number], nowMs: number): boolean => {
  if (source.kind !== "text") {
    return false;
  }
  if (source.visibilityMode !== "timed") {
    return true;
  }
  return isTimedTextSourceActive(source, nowMs);
};

const isTimedTextSourceActive = (source: SceneDocument["sources"][number], nowMs: number): boolean =>
  source.kind === "text" &&
  source.visibilityMode === "timed" &&
  source.activatedAtMs > 0 &&
  nowMs >= source.activatedAtMs &&
  nowMs < source.activatedAtMs + Math.max(0, Math.round(source.displayDurationMs));

const isTimedTextSourceQueued = (source: SceneDocument["sources"][number], nowMs: number): boolean =>
  source.kind === "text" &&
  source.visibilityMode === "timed" &&
  source.activatedAtMs > nowMs &&
  isExplicitQueuedTextOverlaySource(source);

const isTimedTextSourceExpired = (source: SceneDocument["sources"][number], nowMs: number): boolean =>
  source.kind === "text" &&
  source.visibilityMode === "timed" &&
  source.activatedAtMs > 0 &&
  nowMs >= source.activatedAtMs + Math.max(0, Math.round(source.displayDurationMs));

const isExplicitQueuedTextOverlaySource = (source: SceneDocument["sources"][number]): boolean =>
  source.kind === "text" &&
  (source.id.startsWith("source-queued-subtitle-") || source.name.trim().toLowerCase() === "queued subtitle");
