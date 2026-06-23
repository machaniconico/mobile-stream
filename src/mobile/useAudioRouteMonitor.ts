import { useEffect, useState } from "react";
import { NativeModules } from "react-native";
import {
  createDefaultAudioRouteState,
  normalizeAudioRouteState,
  type AudioRouteState
} from "../domain/audioRoute";

interface NativeAudioRouteModule {
  getAudioRoute?: () => Promise<Partial<AudioRouteState>>;
}

const nativeModule = NativeModules.LiveCasterNative as NativeAudioRouteModule | undefined;

const unsupportedRoute = (): AudioRouteState =>
  normalizeAudioRouteState({
    route: "unknown",
    outputName: "Unknown output",
    headphonesConnected: false,
    checkedAt: null,
    stale: true,
    summary: "Native audio route detection is not linked in this build.",
    recommendation: "Run on a physical iOS or Android build to confirm headphones-only monitoring."
  });

export const useAudioRouteMonitor = (refreshMs = 2000): AudioRouteState => {
  const [route, setRoute] = useState<AudioRouteState>(() =>
    nativeModule?.getAudioRoute ? createDefaultAudioRouteState() : unsupportedRoute()
  );

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (!nativeModule?.getAudioRoute) {
        if (!cancelled) {
          setRoute(unsupportedRoute());
        }
        return;
      }

      try {
        const nextRoute = normalizeAudioRouteState(await nativeModule.getAudioRoute());
        if (!cancelled) {
          setRoute(nextRoute);
        }
      } catch {
        if (!cancelled) {
          setRoute(
            normalizeAudioRouteState({
              route: "unknown",
              outputName: "Unknown output",
              headphonesConnected: false,
              checkedAt: null,
              stale: true,
              summary: "Native audio route detection failed.",
              recommendation: "Reconnect headphones or restart the app before enabling self-monitoring."
            })
          );
        }
      }
    };

    void refresh();
    const timer = setInterval(refresh, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshMs]);

  return route;
};
