import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile, qualityProfiles, type QualityProfile } from "./profiles";
import { createStreamHealthSample, summarizeStreamHealthHistory } from "./streamHealthHistory";
import {
  applyStreamQualityAdvisorTarget,
  canApplyStreamQualityAdvisorTargetLive,
  createStreamQualityAdvisor
} from "./streamQualityAdvisor";
import { createStreamQualityIncidents } from "./streamQualityIncidents";
import { createStreamRecoveryStatus } from "./streamRecovery";
import { initialStreamState, type StreamHealth } from "./streamState";
import type { StreamHealthSample } from "./streamHealthHistory";
import type { NativeRuntimeDevice } from "./nativeRuntime";

const quality = (id: QualityProfile["id"]): QualityProfile => {
  const profile = qualityProfiles.find((item) => item.id === id);
  if (!profile) {
    throw new Error(`Missing quality profile ${id}`);
  }
  return profile;
};

const snapshot = (target: QualityProfile, update: Partial<StreamHealth> = {}) => ({
  state: { status: "live" as const },
  health: {
    ...initialStreamState.health,
    bitrateKbps: target.videoBitrateKbps,
    fps: target.fps,
    elapsedSeconds: 12,
    ...update
  }
});

const historyFor = (target: QualityProfile, health: Partial<StreamHealth> = {}) => {
  const first = createStreamHealthSample(snapshot(target, { elapsedSeconds: 1 }), new Date("2026-06-23T00:00:01.000Z"));
  const last = createStreamHealthSample(snapshot(target, { elapsedSeconds: 6, ...health }), new Date("2026-06-23T00:00:06.000Z"));
  return summarizeStreamHealthHistory([first, last].filter((sample): sample is StreamHealthSample => Boolean(sample)), {
    bitrateKbps: target.videoBitrateKbps,
    fps: target.fps
  });
};

const advisorFor = (
  target: QualityProfile,
  health: Partial<StreamHealth> = {},
  device?: NativeRuntimeDevice
) => {
  const liveSnapshot = {
    ...snapshot(target, health),
    nativeRuntime: device ? { device } : null
  };
  const incidents = createStreamQualityIncidents(liveSnapshot, target);
  const recovery = createStreamRecoveryStatus(liveSnapshot, target);
  const history = historyFor(target, health);
  return createStreamQualityAdvisor({
    quality: target,
    incidents,
    history,
    recovery
  });
};

const device = (update: Partial<NativeRuntimeDevice> = {}): NativeRuntimeDevice => ({
  thermalState: "nominal",
  thermalStatusCode: 0,
  batteryLevelPercent: 80,
  charging: false,
  lowPowerMode: false,
  powerSource: "battery",
  memoryPressureState: "normal",
  availableMemoryBytes: 512 * 1024 * 1024,
  memoryThresholdBytes: 128 * 1024 * 1024,
  sampledAt: Date.parse("2026-07-13T00:00:00.000Z"),
  ...update
});

describe("stream quality advisor", () => {
  it("maintains a healthy live quality target", () => {
    const target = createDefaultStudioProfile().quality;
    const recommendation = advisorFor(target);

    expect(recommendation.action).toBe("maintain");
    expect(recommendation.severity).toBe("pass");
    expect(recommendation.suggestedTarget).toBeNull();
  });

  it("recommends a lower existing profile for critical 1080p telemetry", () => {
    const recommendation = advisorFor(quality("quality-sharp"), {
      bitrateKbps: 1200,
      fps: 18,
      droppedFrames: 2
    });

    expect(recommendation.action).toBe("lower-quality");
    expect(recommendation.severity).toBe("fail");
    expect(recommendation.suggestedTarget?.profileId).toBe("quality-balanced");
    expect(recommendation.recommendation).toContain("Balanced 720p");
  });

  it("creates a custom safer target when already on the lowest profile", () => {
    const recommendation = advisorFor(quality("quality-balanced"), {
      bitrateKbps: 2500,
      droppedFrames: 1
    });

    expect(recommendation.action).toBe("monitor");
    expect(recommendation.severity).toBe("warn");
    expect(recommendation.suggestedTarget?.profileId).toBeNull();
    expect(recommendation.suggestedTarget?.videoBitrateKbps).toBe(2500);
  });

  it("prefers reconnect when live telemetry is missing", () => {
    const recommendation = advisorFor(quality("quality-balanced"), {
      bitrateKbps: 0,
      fps: 0,
      elapsedSeconds: 12
    });

    expect(recommendation.action).toBe("reconnect");
    expect(recommendation.severity).toBe("fail");
    expect(recommendation.summary).toContain("Telemetry is missing");
  });

  it("lowers a 60 fps target under serious thermal pressure", () => {
    const recommendation = advisorFor(
      quality("quality-motion"),
      {},
      device({ thermalState: "serious" })
    );

    expect(recommendation.action).toBe("lower-quality");
    expect(recommendation.severity).toBe("fail");
    expect(recommendation.suggestedTarget?.profileId).toBe("quality-balanced");
    expect(recommendation.reason).toContain("Thermal pressure");
  });

  it("recommends stopping for critical thermal or battery shutdown risk", () => {
    for (const deviceState of [
      device({ thermalState: "critical" }),
      device({ batteryLevelPercent: 5 })
    ]) {
      const recommendation = advisorFor(quality("quality-motion"), {}, deviceState);

      expect(recommendation.action).toBe("stop");
      expect(recommendation.severity).toBe("fail");
      expect(recommendation.summary).toBe("Stop recommended for device safety.");
    }
  });

  it("recommends stopping before critical memory pressure terminates the publisher", () => {
    const recommendation = advisorFor(
      quality("quality-motion"),
      {},
      device({ memoryPressureState: "critical", availableMemoryBytes: 48 * 1024 * 1024 })
    );

    expect(recommendation.action).toBe("stop");
    expect(recommendation.severity).toBe("fail");
    expect(recommendation.summary).toBe("Stop recommended for critical memory pressure.");
    expect(recommendation.suggestedTarget?.fps).toBe(30);
  });

  it("applies an existing suggested quality profile to the studio profile", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      quality: quality("quality-sharp")
    };
    const recommendation = advisorFor(profile.quality, {
      bitrateKbps: 1200,
      fps: 18
    });

    const updated = applyStreamQualityAdvisorTarget(profile, recommendation.suggestedTarget);

    expect(updated.quality.id).toBe("quality-balanced");
    expect(updated.quality.name).toBe("Balanced 720p");
  });

  it("applies a custom safer target when no lower preset exists", () => {
    const profile = createDefaultStudioProfile();
    const recommendation = advisorFor(profile.quality, {
      bitrateKbps: 1200,
      fps: 18
    });

    const updated = applyStreamQualityAdvisorTarget(profile, recommendation.suggestedTarget);

    expect(updated.quality.id).toBe("quality-advisor-custom");
    expect(updated.quality.name).toContain("Custom safer");
    expect(updated.quality.fps).toBe(30);
    expect(updated.quality.videoBitrateKbps).toBe(2500);
  });

  it("labels custom portrait fallback targets by their short edge", () => {
    const portrait: QualityProfile = {
      id: "quality-custom-portrait",
      name: "Custom portrait",
      width: 540,
      height: 960,
      fps: 60,
      videoBitrateKbps: 1800,
      audioBitrateKbps: 128
    };
    const recommendation = advisorFor(portrait, {}, device({ thermalState: "serious" }));

    expect(recommendation.suggestedTarget?.profileName).toBe("Custom safer 540p30 Portrait");
  });

  it("allows live changes only when every changed encoder setting is supported", () => {
    const motionProfile = {
      ...createDefaultStudioProfile(),
      quality: quality("quality-motion")
    };
    const sharpProfile = {
      ...createDefaultStudioProfile(),
      quality: quality("quality-sharp")
    };

    const motionTarget = advisorFor(quality("quality-motion"), {
      bitrateKbps: 1200,
      fps: 18
    }).suggestedTarget;
    const sharpTarget = advisorFor(quality("quality-sharp"), {
      bitrateKbps: 1200,
      fps: 18
    }).suggestedTarget;
    const bitrateOnlyTarget = {
      ...advisorFor(quality("quality-balanced"), { droppedFrames: 1 }).suggestedTarget!,
      width: motionProfile.quality.width,
      height: motionProfile.quality.height,
      fps: motionProfile.quality.fps,
      audioBitrateKbps: motionProfile.quality.audioBitrateKbps
    };

    expect(canApplyStreamQualityAdvisorTargetLive(motionProfile, motionTarget)).toBe(false);
    expect(
      canApplyStreamQualityAdvisorTargetLive(motionProfile, motionTarget, {
        videoBitrate: true,
        audioBitrate: true,
        fps: true
      })
    ).toBe(true);
    expect(
      canApplyStreamQualityAdvisorTargetLive(motionProfile, motionTarget, {
        videoBitrate: true,
        audioBitrate: false,
        fps: false
      })
    ).toBe(false);
    expect(
      canApplyStreamQualityAdvisorTargetLive(motionProfile, bitrateOnlyTarget, {
        videoBitrate: true,
        audioBitrate: false,
        fps: false
      })
    ).toBe(true);
    expect(
      canApplyStreamQualityAdvisorTargetLive(sharpProfile, sharpTarget, {
        videoBitrate: true,
        audioBitrate: true,
        fps: true
      })
    ).toBe(false);
  });
});
