import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile, qualityProfiles, type QualityProfile } from "./profiles";
import { createStreamHealthSample, summarizeStreamHealthHistory, type StreamHealthSample } from "./streamHealthHistory";
import { createStreamQualityAdvisor } from "./streamQualityAdvisor";
import {
  createAppliedStreamQualityAutomationDecision,
  createStreamQualityAutomationDecision,
  deferNativeOwnedBitrateDecision
} from "./streamQualityAutomation";
import { createStreamQualityIncidents } from "./streamQualityIncidents";
import { createStreamRecoveryStatus } from "./streamRecovery";
import { initialStreamState, type StreamHealth } from "./streamState";
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
  const samples = [
    createStreamHealthSample(snapshot(target, { elapsedSeconds: 1 }), new Date("2026-06-23T00:00:01.000Z")),
    createStreamHealthSample(liveSnapshot, new Date("2026-06-23T00:00:12.000Z"))
  ].filter((sample): sample is StreamHealthSample => Boolean(sample));

  return createStreamQualityAdvisor({
    quality: target,
    incidents,
    history: summarizeStreamHealthHistory(samples, {
      bitrateKbps: target.videoBitrateKbps,
      fps: target.fps
    }),
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
  sampledAt: Date.parse("2026-07-13T00:00:00.000Z"),
  ...update
});

describe("stream quality automation", () => {
  it("stays idle for a healthy quality target", () => {
    const advisor = advisorFor(createDefaultStudioProfile().quality);
    const decision = createStreamQualityAutomationDecision({
      advisor,
      streamStatus: "live",
      elapsedSeconds: 20
    });

    expect(decision.command).toBe("none");
    expect(decision.key).toBeNull();
  });

  it("alerts while the live encoder is still running", () => {
    const advisor = advisorFor(quality("quality-sharp"), {
      bitrateKbps: 1200,
      fps: 18,
      droppedFrames: 2
    });
    const decision = createStreamQualityAutomationDecision({
      advisor,
      streamStatus: "live",
      elapsedSeconds: 20
    });

    expect(decision.command).toBe("alert");
    expect(decision.severity).toBe("fail");
    expect(decision.title).toBe("Quality downgrade armed");
    expect(decision.suggestedTarget?.profileId).toBe("quality-balanced");
  });

  it("applies a live target when the safer target keeps the same resolution", () => {
    const advisor = advisorFor(quality("quality-motion"), {
      bitrateKbps: 1200,
      fps: 18,
      droppedFrames: 2
    });
    const decision = createStreamQualityAutomationDecision({
      advisor,
      streamStatus: "live",
      elapsedSeconds: 20,
      canApplyLiveTarget: true
    });

    expect(decision.command).toBe("apply-live-target");
    expect(decision.severity).toBe("warn");
    expect(decision.suggestedTarget?.profileId).toBe("quality-balanced");
  });

  it("defers bitrate-only live changes to the native session controller", () => {
    const advisor = advisorFor(quality("quality-balanced"), {
      bitrateKbps: 900,
      fps: 30,
      droppedFrames: 3
    });
    const decision = createStreamQualityAutomationDecision({
      advisor,
      streamStatus: "live",
      elapsedSeconds: 20,
      canApplyLiveTarget: true
    });

    expect(decision.command).toBe("apply-live-target");
    const deferred = deferNativeOwnedBitrateDecision(decision, true);
    expect(deferred.command).toBe("none");
    expect(deferred.key).toBeNull();
    expect(deferred.title).toBe("Native quality control active");
  });

  it("removes the bitrate change while retaining a live FPS decision", () => {
    const advisor = advisorFor(quality("quality-motion"), {
      bitrateKbps: 1200,
      fps: 18,
      droppedFrames: 2
    });
    const decision = createStreamQualityAutomationDecision({
      advisor,
      streamStatus: "live",
      elapsedSeconds: 20,
      canApplyLiveTarget: true
    });

    expect(decision.suggestedTarget?.fps).not.toBe(decision.currentTarget.fps);
    const delegated = deferNativeOwnedBitrateDecision(decision, true);
    expect(delegated.command).toBe("apply-live-target");
    expect(delegated.suggestedTarget).toMatchObject({
      profileId: null,
      fps: 30,
      videoBitrateKbps: decision.currentTarget.videoBitrateKbps
    });
    expect(delegated.summary).toContain("native bitrate control remains active");
  });

  it("arms a 30 fps restart target when live FPS changes are unsupported", () => {
    const advisor = advisorFor(
      quality("quality-motion"),
      {},
      device({ thermalState: "serious" })
    );
    const decision = createStreamQualityAutomationDecision({
      advisor,
      streamStatus: "live",
      elapsedSeconds: 20,
      canApplyLiveTarget: false
    });

    expect(decision.command).toBe("alert");
    expect(decision.title).toBe("Quality downgrade armed");
    expect(decision.suggestedTarget?.profileId).toBe("quality-balanced");
    expect(decision.reason).toContain("Thermal pressure");
  });

  it("alerts instead of auto-changing quality for critical device shutdown risk", () => {
    const advisor = advisorFor(
      quality("quality-motion"),
      {},
      device({ thermalState: "critical" })
    );
    const decision = createStreamQualityAutomationDecision({
      advisor,
      streamStatus: "live",
      elapsedSeconds: 20,
      canApplyLiveTarget: true
    });

    expect(decision.command).toBe("alert");
    expect(decision.severity).toBe("fail");
    expect(decision.action).toContain("Cool the device");
  });

  it("keeps live downgrade armed when the safer target changes resolution", () => {
    const advisor = advisorFor(quality("quality-sharp"), {
      bitrateKbps: 1200,
      fps: 18,
      droppedFrames: 2
    });
    const decision = createStreamQualityAutomationDecision({
      advisor,
      streamStatus: "live",
      elapsedSeconds: 20,
      canApplyLiveTarget: false
    });

    expect(decision.command).toBe("alert");
    expect(decision.title).toBe("Quality downgrade armed");
  });

  it("applies the lower target only once the encoder is no longer live", () => {
    const advisor = advisorFor(quality("quality-sharp"), {
      bitrateKbps: 1200,
      fps: 18,
      droppedFrames: 2
    });
    const decision = createStreamQualityAutomationDecision({
      advisor,
      streamStatus: "failed",
      elapsedSeconds: 0
    });

    expect(decision.command).toBe("apply-next-target");
    expect(decision.severity).toBe("warn");
    expect(decision.suggestedTarget?.profileId).toBe("quality-balanced");
    expect(decision.summary).toContain("Next stream target");
  });

  it("creates an applied next-target decision from a live armed downgrade", () => {
    const advisor = advisorFor(quality("quality-sharp"), {
      bitrateKbps: 1200,
      fps: 18,
      droppedFrames: 2
    });
    const armed = createStreamQualityAutomationDecision({
      advisor,
      streamStatus: "live",
      elapsedSeconds: 20
    });
    const applied = createAppliedStreamQualityAutomationDecision(armed, armed.suggestedTarget!);

    expect(armed.command).toBe("alert");
    expect(applied.command).toBe("apply-next-target");
    expect(applied.title).toBe("Auto quality target lowered");
    expect(applied.suggestedTarget?.profileId).toBe("quality-balanced");
  });

  it("keeps missing telemetry as an operator alert instead of changing quality blindly", () => {
    const advisor = advisorFor(quality("quality-balanced"), {
      bitrateKbps: 0,
      fps: 0,
      elapsedSeconds: 12
    });
    const decision = createStreamQualityAutomationDecision({
      advisor,
      streamStatus: "failed",
      elapsedSeconds: 0
    });

    expect(decision.command).toBe("alert");
    expect(decision.severity).toBe("fail");
    expect(decision.action).toContain("Reconnect first");
  });
});
