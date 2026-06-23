import { describe, expect, it } from "vitest";
import { createAudioMonitorSafetyStatus, normalizeAudioRouteState } from "./audioRoute";
import { createDefaultStudioProfile } from "./profiles";

describe("audio route", () => {
  it("passes headphones-only monitoring when headphones are connected", () => {
    const profile = {
      ...createDefaultStudioProfile().micEffects,
      monitorEnabled: true,
      monitorVolume: 0.5,
      monitorHeadphonesOnly: true
    };
    const route = normalizeAudioRouteState({
      route: "bluetooth-a2dp",
      outputName: "AirPods",
      checkedAt: "2026-06-23T00:00:00.000Z",
      stale: false
    });

    const safety = createAudioMonitorSafetyStatus(profile, route);

    expect(safety.status).toBe("pass");
    expect(safety.headphonesConnected).toBe(true);
    expect(safety.outputName).toBe("AirPods");
  });

  it("fails headphones-only monitoring when output is speaker", () => {
    const profile = {
      ...createDefaultStudioProfile().micEffects,
      monitorEnabled: true,
      monitorVolume: 0.5,
      monitorHeadphonesOnly: true
    };
    const route = normalizeAudioRouteState({
      route: "speaker",
      outputName: "Speaker",
      headphonesConnected: false,
      checkedAt: "2026-06-23T00:00:00.000Z",
      stale: false
    });

    const safety = createAudioMonitorSafetyStatus(profile, route);

    expect(safety.status).toBe("fail");
    expect(safety.summary).toContain("Speaker");
  });

  it("warns when monitoring is on but route detection is stale", () => {
    const profile = {
      ...createDefaultStudioProfile().micEffects,
      monitorEnabled: true,
      monitorVolume: 0.5,
      monitorHeadphonesOnly: true
    };

    const safety = createAudioMonitorSafetyStatus(
      profile,
      normalizeAudioRouteState({
        route: "unknown",
        checkedAt: null,
        stale: true
      })
    );

    expect(safety.status).toBe("warn");
    expect(safety.recommendation).toContain("Refresh route detection");
  });
});
