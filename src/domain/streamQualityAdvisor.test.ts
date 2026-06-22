import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile, qualityProfiles, type QualityProfile } from "./profiles";
import { createStreamHealthSample, summarizeStreamHealthHistory } from "./streamHealthHistory";
import {
  applyStreamQualityAdvisorTarget,
  createStreamQualityAdvisor
} from "./streamQualityAdvisor";
import { createStreamQualityIncidents } from "./streamQualityIncidents";
import { createStreamRecoveryStatus } from "./streamRecovery";
import { initialStreamState, type StreamHealth } from "./streamState";
import type { StreamHealthSample } from "./streamHealthHistory";

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

const advisorFor = (target: QualityProfile, health: Partial<StreamHealth> = {}) => {
  const liveSnapshot = snapshot(target, health);
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
});
