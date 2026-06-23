import { describe, expect, it } from "vitest";
import { createDefaultStudioProfile, redactStreamKey } from "./profiles";
import { createReadinessReport } from "./readiness";
import { createDefaultScene } from "./scene";
import { createStreamDiagnostics } from "./streamDiagnostics";
import { createStreamSessionSummary } from "./streamSessionSummary";
import { createStreamStartPreflightReport } from "./streamStartPreflight";
import { createStreamValidationRun } from "./streamValidationEvidence";
import {
  createSupportBundle,
  formatSupportBundle,
  serializeSupportBundle
} from "./supportBundle";
import { initialStreamState, type StreamHealth } from "./streamState";

const health = (update: Partial<StreamHealth> = {}): StreamHealth => ({
  ...initialStreamState.health,
  ...update
});

const streamKey = "support-demo";

describe("support bundle", () => {
  it("combines preflight, diagnostics, scene, and redacted profile summaries", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);
    const snapshot = {
      state: { status: "live" as const },
      health: health({ bitrateKbps: 3600, fps: 30, message: `Publishing ${streamKey}` }),
      nativeRuntime: {
        platform: "android" as const,
        runtimeStatus: "live",
        updatedAt: Date.parse("2026-06-23T00:00:05.000Z"),
        stale: false,
        elapsedSeconds: 5,
        videoFrames: 144,
        encodedBytes: 2_200_000,
        droppedFrames: 1,
        publisher: {
          state: "published",
          reconnectAttempts: 0,
          sentVideoFrames: 144,
          sentAudioFrames: 240,
          droppedVideoFrames: 1,
          droppedAudioFrames: 0,
          bytesWritten: 2_200_000,
          cacheSize: 120,
          itemsInCache: 64,
          congested: true,
          lastError: ""
        },
        composition: {
          status: "applied" as const,
          appliedCount: 1,
          skippedCount: 0,
          skippedKinds: [],
          stillImageAssetCount: 1,
          stillImageAssetLoadedCount: 1,
          stillImageAssetMissingCount: 0,
          stillImageAssetMissingKinds: [],
          message: "Native screen capture ready"
        },
        message: `Publishing ${streamKey}`
      }
    };
    const healthSamples = [
      {
        at: "2026-06-23T00:00:01.000Z",
        status: "live" as const,
        elapsedSeconds: 1,
        bitrateKbps: 3600,
        fps: 30,
        droppedFrames: 0,
        reconnectAttempts: 0
      },
      {
        at: "2026-06-23T00:00:05.000Z",
        status: "live" as const,
        elapsedSeconds: 5,
        bitrateKbps: 3500,
        fps: 30,
        droppedFrames: 0,
        reconnectAttempts: 0
      }
    ];
    const sessionSummary = createStreamSessionSummary({
      events: [
        {
          id: "chat-reconnect-1",
          at: "2026-06-23T00:00:03.000Z",
          kind: "chat",
          severity: "warn",
          title: "Chat reconnect scheduled",
          message: "YouTube chat request failed. Retrying chat in 1s (1/5)."
        },
        {
          id: "quality-live-update-1",
          at: "2026-06-23T00:00:04.000Z",
          kind: "quality",
          severity: "warn",
          title: "Live quality target lowered",
          message: "Live encoder target will use Balanced."
        }
      ],
      healthSamples,
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-23T00:00:06.000Z"),
      nativeRuntime: snapshot.nativeRuntime
    });
    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      snapshot,
      [],
      healthSamples,
      sessionSummary ? [sessionSummary] : []
    );
    const preflight = createStreamStartPreflightReport({
      readiness,
      streamStatus: snapshot.state.status
    });

    const bundle = createSupportBundle({
      scene,
      profile,
      readiness,
      preflight,
      diagnostics,
      now: new Date("2026-06-23T00:00:00.000Z")
    });

    expect(bundle.app).toEqual({ name: "MobileLiveCaster", reportVersion: 1, bundleVersion: 8 });
    expect(bundle.generatedAt).toBe("2026-06-23T00:00:00.000Z");
    expect(bundle.summary.sourceCount).toBe(scene.sources.length);
    expect(bundle.summary.publicLaunchStatus).toBe(bundle.publicLaunchChecklist.status);
    expect(bundle.summary.publicLaunchCanStart).toBe(bundle.publicLaunchChecklist.canStart);
    expect(bundle.summary.publicLaunchStartLockBlocked).toBe(bundle.publicLaunchChecklist.startLock.blocked);
    expect(bundle.publicLaunchChecklist.items.map((item) => item.id)).toContain("platform-dashboard");
    expect(bundle.scene.sourceCounts.pngtuber).toBe(1);
    expect(bundle.profile.destination.streamKeyPreview).toBe(redactStreamKey(streamKey));
    expect(bundle.profile.platformPublishing.titleLength).toBe(profile.platformPublishing.title.length);
    expect(bundle.diagnostics.telemetry.message).toContain(redactStreamKey(streamKey));
    expect(bundle.summary.completedSessionCount).toBe(1);
    expect(bundle.summary.sessionCleanRate).toBe(0);
    expect(bundle.summary.sessionHistoryStability).toBe("watch");
    expect(bundle.summary.sessionChatEventCount).toBe(1);
    expect(bundle.summary.sessionChatReconnectEventCount).toBe(1);
    expect(bundle.summary.sessionChatReconnectFailureCount).toBe(0);
    expect(bundle.summary.sessionQualityEventCount).toBe(1);
    expect(bundle.summary.sessionQualityLiveUpdateCount).toBe(1);
    expect(bundle.summary.sessionQualityUpdateFailureCount).toBe(0);
    expect(bundle.summary.lastSessionOutcome).toBe("warn");
    expect(bundle.summary.lastSessionChatEventCount).toBe(1);
    expect(bundle.summary.lastSessionChatReconnectEventCount).toBe(1);
    expect(bundle.summary.lastSessionChatReconnectFailureCount).toBe(0);
    expect(bundle.summary.lastSessionQualityEventCount).toBe(1);
    expect(bundle.summary.lastSessionQualityLiveUpdateCount).toBe(1);
    expect(bundle.summary.lastSessionQualityUpdateFailureCount).toBe(0);
    expect(bundle.summary.lastSessionNativeRuntimeStatus).toBe("warn");
    expect(bundle.summary.lastSessionNativeRuntimePlatform).toBe("android");
    expect(bundle.summary.lastSessionNativeRuntimeCongested).toBe(true);
    expect(bundle.summary.lastSessionNativeRuntimeStillImageAssetCount).toBe(1);
    expect(bundle.summary.lastSessionNativeRuntimeStillImageAssetLoadedCount).toBe(1);
    expect(bundle.summary.lastSessionNativeRuntimeStillImageAssetMissingCount).toBe(0);
    expect(bundle.summary.validationRunbookStatus).toBe("running");
    expect(bundle.summary.validationRunbookPendingCount).toBeGreaterThan(0);
    expect(bundle.summary.qualityAdvisorAction).toBe("maintain");
    expect(bundle.summary.qualityAdvisorSeverity).toBe("pass");
    expect(bundle.summary.suggestedQualityTarget).toBeNull();
    expect(bundle.summary.faceTrackingStatus).toBe("info");
    expect(bundle.summary.faceTrackingRuntimeStatus).toBe("unavailable");
    expect(bundle.summary.faceTrackingPreparedPngTuberCount).toBe(0);
    expect(bundle.summary.nativeCompositionStatus).toBe("warn");
    expect(bundle.summary.nativeCompositionCoverage).toBe("preview-only-overlays");
    expect(bundle.summary.nativeCompositionPreviewOnlySourceCount).toBeGreaterThan(0);
    expect(bundle.summary.nativeCompositionAssetIssueCount).toBe(1);
    expect(bundle.summary.nativeCompositionFileBackedAssetIssueCount).toBe(0);
    expect(bundle.summary.nativeCompositionRequiresCompositor).toBe(true);
    expect(bundle.summary.nativeRuntimePlatform).toBe("android");
    expect(bundle.summary.nativeRuntimeCongested).toBe(true);
    expect(bundle.summary.nativeRuntimeQueuedItems).toBe(64);
    expect(bundle.summary.nativeRuntimeCacheSize).toBe(120);
    expect(bundle.summary.nativeRuntimeStillImageAssetCount).toBe(1);
    expect(bundle.summary.nativeRuntimeStillImageAssetLoadedCount).toBe(1);
    expect(bundle.summary.nativeRuntimeStillImageAssetMissingCount).toBe(0);
    expect(bundle.summary.validationStatus).toBe("needs-test");
    expect(bundle.summary.validationFailCount).toBe(0);
    expect(bundle.summary.validationWarningCount).toBeGreaterThan(0);
    expect(bundle.summary.validationEvidenceStatus).toBe("none");
    expect(bundle.summary.validationEvidenceRunCount).toBe(0);
    expect(bundle.summary.validationEvidenceEligibleRunCount).toBe(0);
    expect(bundle.summary.validationEvidenceStaleRunCount).toBe(0);
    expect(bundle.summary.validationEvidenceNativeRuntimeRunCount).toBe(0);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeStatus).toBeNull();
    expect(bundle.summary.validationEvidenceFaceTrackingRunCount).toBe(0);
    expect(bundle.summary.validationEvidenceFaceTrackingIosPass).toBe(false);
    expect(bundle.summary.validationEvidenceFaceTrackingAndroidPass).toBe(false);
    expect(bundle.summary.validationEvidenceAudioRunCount).toBe(0);
    expect(bundle.summary.validationEvidenceAudioIosPass).toBe(false);
    expect(bundle.summary.validationEvidenceAudioAndroidPass).toBe(false);
    expect(bundle.summary.validationEvidenceChatReadoutRunCount).toBe(0);
    expect(bundle.summary.validationEvidenceChatReadoutIosPass).toBe(false);
    expect(bundle.summary.validationEvidenceChatReadoutAndroidPass).toBe(false);
    expect(bundle.summary.validationEvidenceQualityAutomationRunCount).toBe(0);
    expect(bundle.summary.validationEvidenceQualityAutomationLiveUpdateCount).toBe(0);
    expect(bundle.summary.validationEvidenceLatestQualityAutomationStatus).toBeNull();
    expect(bundle.summary.validationEvidencePlatformPublishingRunCount).toBe(0);
    expect(bundle.summary.validationEvidenceLatestPlatformPublishingStatus).toBeNull();
    expect(bundle.summary.validationEvidencePlatformPublishingFreshnessStatus).toBeNull();
    expect(bundle.summary.platformPublishingFreshnessStatus).toBe("missing");
    expect(formatSupportBundle(bundle)).toContain("Completed summaries: 1");
    expect(formatSupportBundle(bundle)).toContain("Public Launch Checklist");
    expect(formatSupportBundle(bundle)).toContain("Public launch:");
    expect(formatSupportBundle(bundle)).toContain("Start lock:");
    expect(formatSupportBundle(bundle)).toContain("Clean rate: 0%");
    expect(formatSupportBundle(bundle)).toContain("Chat readout history: 1 events / 1 reconnects / 0 exhausted");
    expect(formatSupportBundle(bundle)).toContain("Last chat readout: 1 events / 1 reconnects / 0 exhausted");
    expect(formatSupportBundle(bundle)).toContain("Quality automation history: 1 events / 1 live updates / 0 next-start targets / 0 failed");
    expect(formatSupportBundle(bundle)).toContain("Last quality automation: 1 events / 1 live updates / 0 next-start targets / 0 failed");
    expect(formatSupportBundle(bundle)).toContain("Quality advisor: maintain / pass");
    expect(formatSupportBundle(bundle)).toContain("Face tracking: info / runtime unavailable");
    expect(formatSupportBundle(bundle)).toContain("Commercial Validation");
    expect(formatSupportBundle(bundle)).toContain("Runbook: running");
    expect(formatSupportBundle(bundle)).toContain("Native composition: warn / preview-only-overlays");
    expect(formatSupportBundle(bundle)).toContain("asset issues 1 / file-backed 0");
    expect(formatSupportBundle(bundle)).toContain("assets 1/1 loaded / 0 missing");
    expect(formatSupportBundle(bundle)).toContain("congested yes / queue 64/120");
    expect(formatSupportBundle(bundle)).toContain("Last native runtime: warn / android / assets 1/1 loaded / 0 missing / congested yes / queue 64/120");
    expect(formatSupportBundle(bundle)).toContain("Evidence: none / 0 retained / 0 eligible / 0 stale");
    expect(formatSupportBundle(bundle)).toContain("Evidence native runtime: 0 retained / 0 warn / 0 fail");
    expect(formatSupportBundle(bundle)).toContain("Evidence face tracking: 0 retained / 0 ready / 0 warn / iOS missing / Android missing");
    expect(formatSupportBundle(bundle)).toContain("Evidence audio: 0 retained / 0 ready / 0 warn / iOS missing / Android missing");
    expect(formatSupportBundle(bundle)).toContain("Evidence chat readout: 0 retained / 0 ready / 0 warn / iOS missing / Android missing");
    expect(formatSupportBundle(bundle)).toContain("Evidence quality automation: 0 retained / live 0 / next-start 0 / failed 0");
    expect(formatSupportBundle(bundle)).toContain("Evidence platform dashboard: 0 retained / 0 warn / 0 fail");
    expect(formatSupportBundle(bundle)).toContain("Evidence platform dashboard freshness: - / -");
    expect(formatSupportBundle(bundle)).toContain("Publishing status freshness: missing / YouTube dashboard status has no checked-at timestamp.");
  });

  it("keeps validation dashboard freshness in support bundle summaries", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey
      },
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        youtubeBroadcastId: "broadcast-1",
        youtubeStreamId: "stream-1",
        youtubeBroadcastStatus: "live",
        youtubeStreamStatus: "active",
        youtubeStreamHealthStatus: "ok",
        youtubeStreamHealthIssues: [],
        youtubeStatusCheckedAt: "2026-06-23T00:00:00.000Z"
      }
    };
    const readiness = createReadinessReport(scene, profile);
    const baseDiagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({ bitrateKbps: 3500, fps: 30 })
    }, [
      {
        id: "quality-live-update-validation",
        at: "2026-06-23T00:00:30.000Z",
        kind: "quality",
        severity: "warn",
        title: "Live quality target lowered",
        message: "Live encoder target will use Balanced."
      }
    ]);
    const run = createStreamValidationRun({
      diagnostics: baseDiagnostics,
      devicePlatform: "ios",
      result: "pass",
      now: new Date("2026-06-23T00:01:00.000Z")
    });
    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "idle" },
        health: health()
      },
      [],
      [],
      [],
      [run]
    );
    const preflight = createStreamStartPreflightReport({
      readiness,
      streamStatus: "idle"
    });

    const bundle = createSupportBundle({
      scene,
      profile,
      readiness,
      preflight,
      diagnostics,
      now: new Date("2026-06-23T00:20:00.000Z")
    });
    const text = formatSupportBundle(bundle);

    expect(bundle.summary.validationEvidencePlatformPublishingRunCount).toBe(1);
    expect(bundle.summary.validationEvidenceQualityAutomationRunCount).toBe(1);
    expect(bundle.summary.validationEvidenceQualityAutomationLiveUpdateCount).toBe(1);
    expect(bundle.summary.validationEvidenceQualityAutomationFailureCount).toBe(0);
    expect(bundle.summary.validationEvidenceLatestQualityAutomationStatus).toBe("pass");
    expect(bundle.summary.validationEvidencePlatformPublishingFreshnessStatus).toBe("stale");
    expect(bundle.summary.validationEvidencePlatformPublishingFreshnessAgeMinutes).toBe(20);
    expect(bundle.summary.validationEvidencePlatformPublishingFreshnessSummary).toContain("20 minutes old");
    expect(bundle.summary.platformPublishingFreshnessStatus).toBe("stale");
    expect(text).toContain("Evidence quality automation: 1 retained / live 1 / next-start 0 / failed 0");
    expect(text).toContain("Evidence platform dashboard freshness: stale / YouTube dashboard status is 20 minutes old.");
    expect(text).toContain("Publishing status freshness: stale / YouTube dashboard status is 20 minutes old.");
  });

  it("keeps commercial validation preflight blocks in support bundles", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey
      },
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        privacyStatus: "public" as const
      }
    };
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });
    const preflight = createStreamStartPreflightReport({
      readiness,
      streamStatus: "idle",
      profile,
      validation: {
        status: "needs-test",
        recommendedNextStep: "Record iOS and Android avatar-motion evidence."
      }
    });

    const bundle = createSupportBundle({ scene, profile, readiness, preflight, diagnostics });
    const text = formatSupportBundle(bundle);

    expect(bundle.summary.preflightStatus).toBe("blocked");
    expect(bundle.summary.publicLaunchStatus).toBe("blocked");
    expect(bundle.summary.publicLaunchStartLockApplies).toBe(true);
    expect(bundle.summary.publicLaunchStartLockBlocked).toBe(true);
    expect(bundle.preflight.blocks.map((issue) => issue.code)).toContain("validation-youtube-public-not-ready");
    expect(bundle.publicLaunchChecklist.items.find((item) => item.id === "commercial-evidence")).toMatchObject({
      status: "fail"
    });
    expect(text).toContain("Preflight: blocked");
    expect(text).toContain("Public launch: blocked / can start no / lock on blocked yes");
    expect(text).toContain("YouTube Live is set to public");
  });

  it("serializes and formats without leaking raw stream keys or text source content", () => {
    const baseScene = createDefaultScene();
    const textSource = baseScene.sources.find((source) => source.kind === "text");
    if (!textSource || textSource.kind !== "text") {
      throw new Error("Default scene needs a text source for this test.");
    }
    const scene = {
      ...baseScene,
      sources: [
        ...baseScene.sources,
        {
          ...textSource,
          id: "source-sensitive-label",
          text: `private label ${streamKey}`
        }
      ]
    };
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health({ message: `Ready ${streamKey}` })
    });
    const preflight = createStreamStartPreflightReport({
      readiness,
      streamStatus: "idle"
    });

    const bundle = createSupportBundle({ scene, profile, readiness, preflight, diagnostics });
    const json = serializeSupportBundle(bundle);
    const text = formatSupportBundle(bundle);

    expect(json).toContain(redactStreamKey(streamKey));
    expect(text).toContain(redactStreamKey(streamKey));
    expect(json).not.toContain(streamKey);
    expect(text).not.toContain(streamKey);
    expect(json).not.toContain("private label");
    expect(bundle.scene.sources.find((source) => source.id === "source-sensitive-label")?.payload.textLength).toBeGreaterThan(0);
  });

  it("serializes support bundles without leaking chat author or message details", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({ bitrateKbps: 3500, fps: 30 })
    }, [
      {
        id: "chat-private-1",
        at: "2026-06-23T00:00:03.000Z",
        kind: "chat",
        severity: "warn",
        title: `Viewer Ada ${streamKey}`,
        message: `Ada says private support code 2468 and ${streamKey}`
      }
    ]);
    const preflight = createStreamStartPreflightReport({
      readiness,
      streamStatus: "idle"
    });

    const bundle = createSupportBundle({ scene, profile, readiness, preflight, diagnostics });
    const json = serializeSupportBundle(bundle);
    const text = formatSupportBundle(bundle);

    expect(bundle.diagnostics.session.events[0]).toMatchObject({
      kind: "chat",
      title: "Chat readout event",
      message: "Chat readout event details redacted for viewer privacy."
    });
    expect(json).toContain("Chat readout event details redacted for viewer privacy.");
    expect(json).not.toContain("Ada");
    expect(text).not.toContain("Ada");
    expect(json).not.toContain("2468");
    expect(text).not.toContain("2468");
    expect(json).not.toContain("private support code");
    expect(text).not.toContain("private support code");
    expect(json).not.toContain(streamKey);
    expect(text).not.toContain(streamKey);
  });
});
