import type { MicEffectsProfile } from "./profiles";

export type AudioOutputRouteKind =
  | "unknown"
  | "speaker"
  | "receiver"
  | "wired-headphones"
  | "wired-headset"
  | "usb-headset"
  | "bluetooth-a2dp"
  | "bluetooth-sco"
  | "airplay"
  | "hdmi"
  | "other";

export type AudioRouteMonitorStatus = "pass" | "warn" | "fail" | "info";

export interface AudioRouteState {
  route: AudioOutputRouteKind;
  outputName: string;
  headphonesConnected: boolean;
  checkedAt: string | null;
  stale: boolean;
  summary: string;
  recommendation: string;
}

export interface AudioMonitorSafetyStatus {
  status: AudioRouteMonitorStatus;
  route: AudioOutputRouteKind;
  outputName: string;
  headphonesConnected: boolean;
  checkedAt: string | null;
  stale: boolean;
  summary: string;
  recommendation: string;
}

const headphoneRouteKinds = new Set<AudioOutputRouteKind>([
  "wired-headphones",
  "wired-headset",
  "usb-headset",
  "bluetooth-a2dp",
  "bluetooth-sco"
]);

const routeLabels: Record<AudioOutputRouteKind, string> = {
  unknown: "Unknown output",
  speaker: "Speaker",
  receiver: "Receiver",
  "wired-headphones": "Wired headphones",
  "wired-headset": "Wired headset",
  "usb-headset": "USB headset",
  "bluetooth-a2dp": "Bluetooth headphones",
  "bluetooth-sco": "Bluetooth headset",
  airplay: "AirPlay",
  hdmi: "HDMI",
  other: "Other output"
};

export const createDefaultAudioRouteState = (now: Date = new Date()): AudioRouteState =>
  normalizeAudioRouteState({
    route: "unknown",
    outputName: "",
    headphonesConnected: false,
    checkedAt: now.toISOString(),
    stale: true
  });

export const normalizeAudioRouteState = (value: Partial<AudioRouteState> | null | undefined): AudioRouteState => {
  const route = normalizeRoute(value?.route);
  const headphonesConnected = value?.headphonesConnected ?? headphoneRouteKinds.has(route);
  const outputName = sanitizeOutputName(value?.outputName) || routeLabels[route];
  const checkedAt = normalizeCheckedAt(value?.checkedAt);
  const stale = value?.stale ?? !checkedAt;

  return {
    route,
    outputName,
    headphonesConnected,
    checkedAt,
    stale,
    summary: sanitizeText(value?.summary) || createRouteSummary(route, outputName, headphonesConnected, stale),
    recommendation:
      sanitizeText(value?.recommendation) ||
      (headphonesConnected
        ? "Keep headphone routing connected while self-monitoring is enabled."
        : route === "unknown" || stale
          ? "Refresh route detection on the physical device before enabling self-monitoring."
          : "Connect wired, USB, or Bluetooth headphones before enabling self-monitoring.")
  };
};

export const createAudioMonitorSafetyStatus = (
  micEffects: Pick<MicEffectsProfile, "monitorEnabled" | "monitorHeadphonesOnly" | "monitorVolume">,
  routeState: AudioRouteState
): AudioMonitorSafetyStatus => {
  const route = normalizeAudioRouteState(routeState);

  if (!micEffects.monitorEnabled || micEffects.monitorVolume <= 0) {
    return {
      status: "info",
      route: route.route,
      outputName: route.outputName,
      headphonesConnected: route.headphonesConnected,
      checkedAt: route.checkedAt,
      stale: route.stale,
      summary: "Self-monitoring is off, so output route safety is not active.",
      recommendation: "Enable headphones-only self-monitoring when checking the processed microphone signal."
    };
  }

  if (!micEffects.monitorHeadphonesOnly) {
    return {
      status: "warn",
      route: route.route,
      outputName: route.outputName,
      headphonesConnected: route.headphonesConnected,
      checkedAt: route.checkedAt,
      stale: route.stale,
      summary: "Self-monitoring is not restricted to headphone routes.",
      recommendation: "Switch monitor routing to headphones-only before production validation."
    };
  }

  if (route.stale || route.route === "unknown" || !route.checkedAt) {
    return {
      status: "warn",
      route: route.route,
      outputName: route.outputName,
      headphonesConnected: route.headphonesConnected,
      checkedAt: route.checkedAt,
      stale: true,
      summary: "Headphones-only monitoring is enabled, but the current output route is unknown.",
      recommendation: "Refresh route detection on the physical device and confirm headphones are connected before going live."
    };
  }

  if (!route.headphonesConnected) {
    return {
      status: "fail",
      route: route.route,
      outputName: route.outputName,
      headphonesConnected: false,
      checkedAt: route.checkedAt,
      stale: route.stale,
      summary: `Headphones-only monitoring is enabled, but output is routed to ${route.outputName}.`,
      recommendation: "Connect headphones or turn monitoring off before starting a stream."
    };
  }

  return {
    status: "pass",
    route: route.route,
    outputName: route.outputName,
    headphonesConnected: true,
    checkedAt: route.checkedAt,
    stale: route.stale,
    summary: `Headphones-only monitoring is routed to ${route.outputName}.`,
    recommendation: "Keep this route connected during the private validation run."
  };
};

const normalizeRoute = (value: unknown): AudioOutputRouteKind =>
  value === "speaker" ||
  value === "receiver" ||
  value === "wired-headphones" ||
  value === "wired-headset" ||
  value === "usb-headset" ||
  value === "bluetooth-a2dp" ||
  value === "bluetooth-sco" ||
  value === "airplay" ||
  value === "hdmi" ||
  value === "other" ||
  value === "unknown"
    ? value
    : "unknown";

const normalizeCheckedAt = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

const createRouteSummary = (
  route: AudioOutputRouteKind,
  outputName: string,
  headphonesConnected: boolean,
  stale: boolean
): string => {
  if (stale || route === "unknown") {
    return "Audio output route has not been confirmed on this device.";
  }
  return `${outputName} route is active; headphones ${headphonesConnected ? "connected" : "not connected"}.`;
};

const sanitizeOutputName = (value: unknown): string =>
  typeof value === "string" ? value.trim().slice(0, 64) : "";

const sanitizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim().slice(0, 160) : "";
