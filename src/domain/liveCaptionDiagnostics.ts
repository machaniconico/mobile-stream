import type { LiveCaptionState } from "./liveCaption";
import { selectLiveCaptionCues } from "./liveCaption";
import type { SceneDocument } from "./scene";

export type LiveCaptionDiagnosticStatus = "pass" | "warn" | "fail" | "info";

export interface LiveCaptionDiagnostics {
  status: LiveCaptionDiagnosticStatus;
  enabled: boolean;
  recognitionStatus: LiveCaptionState["status"] | "unavailable";
  language: string;
  runtimeSourceCount: number;
  visibleRuntimeSourceCount: number;
  activeCueCount: number;
  finalCueCount: number;
  transcriptCount: number;
  summary: string;
  recommendation: string;
}

export const createLiveCaptionDiagnostics = (
  scene: SceneDocument,
  liveCaption: LiveCaptionState | null | undefined,
  now = Date.now()
): LiveCaptionDiagnostics => {
  const runtimeSourceCount = scene.sources.filter(
    (source) => source.kind === "text" && source.contentSource === "runtime-caption"
  ).length;
  const visibleRuntimeSourceCount = scene.sources.filter(
    (source) => source.kind === "text" && source.contentSource === "runtime-caption" && source.visible
  ).length;

  if (!liveCaption) {
    return {
      status: "info",
      enabled: false,
      recognitionStatus: "unavailable",
      language: "",
      runtimeSourceCount,
      visibleRuntimeSourceCount,
      activeCueCount: 0,
      finalCueCount: 0,
      transcriptCount: 0,
      summary: "Live caption session state is not available.",
      recommendation: "Open the studio caption controls before validating live captions."
    };
  }

  const activeCues = selectLiveCaptionCues(liveCaption, now);
  const finalCueCount = activeCues.filter((cue) => cue.isFinal !== false).length;
  const base = {
    enabled: liveCaption.settings.enabled,
    recognitionStatus: liveCaption.status,
    language: liveCaption.settings.language,
    runtimeSourceCount,
    visibleRuntimeSourceCount,
    activeCueCount: activeCues.length,
    finalCueCount,
    transcriptCount: liveCaption.transcriptCount
  };

  if (!liveCaption.settings.enabled) {
    return {
      ...base,
      status: "info",
      summary: "Live captions are disabled.",
      recommendation: "Enable live captions and add a Live Caption text source when subtitles are part of the launch plan."
    };
  }

  if (visibleRuntimeSourceCount === 0) {
    return {
      ...base,
      status: "fail",
      summary: "Live captions are enabled, but no visible Live Caption text source is in the active scene.",
      recommendation: "Add a Live Caption source to the scene or disable live captions before launch."
    };
  }

  if (liveCaption.status === "unsupported") {
    return {
      ...base,
      status: "fail",
      summary: "Live captions are enabled, but speech recognition is unsupported in this runtime.",
      recommendation: "Use the iOS or Android native app, or a browser with speech recognition support, before relying on live captions."
    };
  }

  if (liveCaption.status === "error") {
    return {
      ...base,
      status: "fail",
      summary: liveCaption.errorMessage || "Live caption speech recognition is in an error state.",
      recommendation: "Resolve microphone and speech-recognition permissions, then restart live captions before launch."
    };
  }

  if (liveCaption.status !== "listening") {
    return {
      ...base,
      status: "warn",
      summary: `Live captions are enabled, but recognition status is ${liveCaption.status}.`,
      recommendation: "Start the live caption listener and confirm it reaches listening before starting a public stream."
    };
  }

  if (liveCaption.transcriptCount === 0 || finalCueCount === 0) {
    return {
      ...base,
      status: "warn",
      summary: "Live captions are listening, but no final caption cue has been confirmed in this session.",
      recommendation: "Speak a short test phrase or use Test Caption and confirm final captions appear in the program preview."
    };
  }

  return {
    ...base,
    status: "pass",
    summary: `${finalCueCount} final live caption cue${finalCueCount === 1 ? "" : "s"} are active in the program overlay.`,
    recommendation: "Keep the live caption source visible and verify captions again during private rehearsal."
  };
};
