import { describe, expect, it } from "vitest";
import { assessPlatformPublishingFreshness } from "./platformPublishingFreshness";
import { createDefaultStudioProfile, redactStreamKey } from "./profiles";
import { createPublicLaunchChecklist } from "./publicLaunchChecklist";
import { createReadinessReport } from "./readiness";
import { createDefaultScene, setVisibility, updateSource } from "./scene";
import {
  createStreamDiagnosticReport,
  createStreamDiagnostics,
  formatStreamDiagnosticReport,
  serializeStreamDiagnosticReport
} from "./streamDiagnostics";
import { createStreamSessionSummary } from "./streamSessionSummary";
import { createStreamStartPreflightReport } from "./streamStartPreflight";
import { createStreamValidationRun } from "./streamValidationEvidence";
import { initialStreamState, type StreamHealth } from "./streamState";

const health = (update: Partial<StreamHealth> = {}): StreamHealth => ({
  ...initialStreamState.health,
  ...update
});
const demoStreamKey = "stream-demo";
const nativeReadyAvatarUri = "file:///private/var/mobile/Containers/Shared/AppGroup/ABCDEF/avatar.png";
const nativeReadyScene = () =>
  updateSource(setVisibility(createDefaultScene(), "source-background", false), "source-avatar", (source) =>
    source.kind === "pngtuber"
      ? {
          ...source,
          imageUri: nativeReadyAvatarUri
        }
      : source
  );

describe("stream diagnostics", () => {
  it("combines readiness, target, and redacted publish URL details", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });

    expect(diagnostics.status).toBe("warn");
    expect(diagnostics.target.platform).toBe("YouTube Live");
    expect(diagnostics.target.host).toBe("a.rtmps.youtube.com");
    expect(diagnostics.target.publishUrlPreview).toContain(redactStreamKey(demoStreamKey));
    expect(diagnostics.target.publishUrlPreview).not.toContain(demoStreamKey);
    expect(diagnostics.telemetry.enginePlatform).toBe("unknown");
    expect(diagnostics.quality.estimatedUploadKbps).toBe(4535);
    expect(diagnostics.recovery.mode).toBe("idle");
    expect(diagnostics.recovery.attemptsRemaining).toBe(5);
    expect(diagnostics.platformPublishing.status).toBe("info");
    expect(diagnostics.platformPublishing.summary).toContain("No YouTube dashboard");
    expect(diagnostics.validation.status).toBe("needs-test");
    expect(diagnostics.validation.items.find((item) => item.id === "ingest-not-run")?.status).toBe("pending");
    expect(diagnostics.validationEvidence.status).toBe("none");
    expect(diagnostics.validationEvidence.totalRuns).toBe(0);
    expect(diagnostics.nativeComposition.status).toBe("warn");
    expect(diagnostics.nativeComposition.coverage).toBe("preview-only-overlays");
    expect(diagnostics.nativeComposition.assetIssueCount).toBe(1);
    expect(diagnostics.checks.some((check) => check.code === "native-composition-preview-only-overlays")).toBe(true);
  });

  it("retains the active engine platform from the native snapshot", () => {
    const scene = createDefaultScene();
    const profile = createDefaultStudioProfile();
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      platform: "mock",
      state: { status: "idle" },
      health: health()
    });

    expect(diagnostics.telemetry.enginePlatform).toBe("mock");
  });

  it("summarizes YouTube dashboard status for validation evidence", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
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

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({ bitrateKbps: 3500, fps: 30 })
    });
    const report = formatStreamDiagnosticReport(createStreamDiagnosticReport(diagnostics, new Date("2026-06-23T00:05:00.000Z")));

    expect(diagnostics.platformPublishing.status).toBe("pass");
    expect(diagnostics.platformPublishing.youtube?.healthStatus).toBe("ok");
    expect(diagnostics.platformPublishing.youtube?.statusCheckedAt).toBe("2026-06-23T00:00:00.000Z");
    expect(report).toContain("Platform Publishing");
    expect(report).toContain("YouTube dashboard: broadcast live, stream active, health ok, issues 0, checked 2026-06-23T00:00:00.000Z.");
    expect(report).toContain("- Freshness: fresh / YouTube dashboard status was checked 5 minutes ago.");
  });

  it("exports retained native runtime proof frame and byte counts in validation evidence", () => {
    const scene = nativeReadyScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);
    const nativeRuntime = {
      platform: "ios" as const,
      runtimeStatus: "live" as const,
      updatedAt: Date.parse("2026-06-23T00:00:45.000Z"),
      stale: false,
      elapsedSeconds: 45,
      videoFrames: 0,
      encodedBytes: 0,
      droppedFrames: 0,
      publisher: {
        state: "published" as const,
        reconnectAttempts: 0,
        sentVideoFrames: 0,
        sentAudioFrames: 0,
        droppedVideoFrames: 0,
        droppedAudioFrames: 0,
        bytesWritten: 0,
        cacheSize: 120,
        itemsInCache: 0,
        congested: false,
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
        message: "Native overlays applied"
      },
      message: "Native runtime live"
    };
    const baseDiagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({ bitrateKbps: 3500, fps: 30 }),
      nativeRuntime
    });
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
    const report = formatStreamDiagnosticReport(createStreamDiagnosticReport(diagnostics, new Date("2026-06-23T00:05:00.000Z")));

    expect(diagnostics.validationEvidence.nativeRuntimeRunCount).toBe(1);
    expect(diagnostics.validationEvidence.nativeRuntimeReadyCount).toBe(0);
    expect(report).toContain(
      "Evidence monitor hold: 1 retained / 0 ready / 1 warn / 0 fail / iOS missing / Android missing / latest warn 0s 0 samples"
    );
    expect(report).toContain(
      "Evidence native runtime: 1 retained / 0 ready / 0 warn / 0 fail / iOS missing / Android missing / latest pass ios / sent 0 video 0 audio / bytes 0"
    );
  });

  it("reports blocking checks when the stream key is missing", () => {
    const scene = createDefaultScene();
    const profile = createDefaultStudioProfile();
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });

    expect(diagnostics.status).toBe("fail");
    expect(diagnostics.checks.some((check) => check.code === "stream-key-missing")).toBe(true);
    expect(diagnostics.summary).toContain("blocking");
  });

  it("surfaces face tracking production diagnostics", () => {
    const scene = updateSource(createDefaultScene(), "source-avatar", (source) =>
      source.kind === "pngtuber"
        ? {
            ...source,
            imageUri: "file:///shared/avatar.png",
            motion: { ...source.motion, headYaw: 0.24, confidence: 0.9 }
          }
        : source
    );
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      },
      faceTracking: {
        ...createDefaultStudioProfile().faceTracking,
        enabled: true,
        inputMode: "native-camera" as const
      }
    };
    const readiness = createReadinessReport(scene, profile);

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
      [],
      {
        status: "tracking",
        yaw: 0.24,
        pitch: 0.08,
        roll: 0.02,
        mouthOpen: 0.42,
        blink: 0,
        smile: 0.4,
        browRaise: 0.3,
        confidence: 0.9,
        expression: "neutral",
        lastFrameAt: 2_000
      },
      { now: 2_200 }
    );
    const report = formatStreamDiagnosticReport(createStreamDiagnosticReport(diagnostics));

    expect(diagnostics.faceTracking.status).toBe("pass");
    expect(diagnostics.faceTracking.preparedPngTuberCount).toBe(1);
    expect(diagnostics.checks.find((check) => check.code === "face-tracking-ready")?.status).toBe("pass");
    expect(report).toContain("Face Tracking");
    expect(report).toContain("- Runtime: tracking");
    expect(report).toContain("- Runtime age: 200 ms / fresh yes");
  });

  it("flags weak live telemetry against the configured quality target", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({
        bitrateKbps: 1200,
        fps: 18,
        droppedFrames: 3,
        reconnectAttempts: 1,
        elapsedSeconds: 12,
        message: "Live"
      })
    });

    expect(diagnostics.status).toBe("fail");
    expect(diagnostics.recovery.recommendedAction).toBe("reconnect");
    expect(diagnostics.qualityIncidents.summary).toContain("critical");
    expect(diagnostics.qualityAdvisor.action).toBe("lower-quality");
    expect(diagnostics.qualityAdvisor.suggestedTarget?.profileId).toBeNull();
    expect(diagnostics.qualityAdvisor.suggestedTarget?.videoBitrateKbps).toBe(2500);
    expect(diagnostics.qualityIncidents.incidents.map((incident) => incident.code)).toEqual(
      expect.arrayContaining(["bitrate-critical", "fps-low", "dropped-frames", "reconnects"])
    );
    expect(diagnostics.checks.map((check) => check.code)).toEqual(
      expect.arrayContaining([
        "telemetry-bitrate-low",
        "telemetry-fps-low",
        "telemetry-drops-present",
        "telemetry-reconnects",
        "quality-incidents-critical",
        "quality-advisor-lower-quality",
        "recovery-watching"
      ])
    );
  });

  it("surfaces native runtime telemetry without leaking stream keys", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({
        bitrateKbps: 4500,
        fps: 30,
        elapsedSeconds: 20,
        message: "Live"
      }),
      nativeRuntime: {
        platform: "ios",
        runtimeStatus: "live",
        updatedAt: Date.now(),
        stale: false,
        elapsedSeconds: 20,
        videoFrames: 600,
        encodedBytes: 10_000_000,
        droppedFrames: 0,
        publisher: {
          state: "published",
          reconnectAttempts: 0,
          sentVideoFrames: 600,
          sentAudioFrames: 940,
          droppedVideoFrames: 0,
          droppedAudioFrames: 0,
          bytesWritten: 10_000_000,
          cacheSize: 100,
          itemsInCache: 0,
          congested: false,
          lastError: ""
        },
        composition: {
          status: "applied",
          appliedCount: 2,
          skippedCount: 0,
          skippedKinds: [],
          stillImageAssetCount: 2,
          stillImageAssetLoadedCount: 2,
          stillImageAssetMissingCount: 0,
          stillImageAssetMissingKinds: [],
          message: `Native overlays applied for ${demoStreamKey}`
        },
        message: `iOS extension live for ${demoStreamKey}`
      }
    });

    expect(diagnostics.nativeRuntime?.platform).toBe("ios");
    expect(diagnostics.nativeRuntime?.message).toContain(redactStreamKey(demoStreamKey));
    expect(diagnostics.nativeRuntime?.message).not.toContain(demoStreamKey);
    expect(diagnostics.nativeRuntime?.composition.message).toContain(redactStreamKey(demoStreamKey));
    expect(diagnostics.checks.find((check) => check.code === "native-runtime-ios")?.status).toBe("pass");
    const report = formatStreamDiagnosticReport(createStreamDiagnosticReport(diagnostics));
    expect(report).toContain("Native Runtime");
    expect(report).toContain("Composition assets: 2/2 loaded / 0 missing");
  });

  it("warns when the native runtime reports missing still-image assets", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({ bitrateKbps: 3200, fps: 30, message: "Live" }),
      nativeRuntime: {
        platform: "ios",
        runtimeStatus: "live",
        updatedAt: Date.now(),
        stale: false,
        elapsedSeconds: 12,
        videoFrames: 330,
        encodedBytes: 4_400_000,
        droppedFrames: 0,
        publisher: {
          state: "published",
          reconnectAttempts: 0,
          sentVideoFrames: 330,
          sentAudioFrames: 500,
          droppedVideoFrames: 0,
          droppedAudioFrames: 0,
          bytesWritten: 4_400_000,
          cacheSize: 100,
          itemsInCache: 0,
          congested: false,
          lastError: ""
        },
        composition: {
          status: "pending",
          appliedCount: 2,
          skippedCount: 0,
          skippedKinds: [],
          stillImageAssetCount: 2,
          stillImageAssetLoadedCount: 1,
          stillImageAssetMissingCount: 1,
          stillImageAssetMissingKinds: ["pngtuber"],
          message: "Native overlays applied: 2; image assets 1/2, missing 1: pngtuber"
        },
        message: "iOS extension live"
      }
    });

    const nativeCheck = diagnostics.checks.find((check) => check.code === "native-runtime-composition-pending");
    expect(nativeCheck?.status).toBe("warn");
    expect(nativeCheck?.message).toContain("missing 1");
    expect(formatStreamDiagnosticReport(createStreamDiagnosticReport(diagnostics))).toContain("Composition assets: 1/2 loaded / 1 missing");
  });

  it("keeps native runtime failures blocking even when telemetry is stale", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "failed" },
      health: health({
        bitrateKbps: 0,
        fps: 0,
        message: "Failed"
      }),
      nativeRuntime: {
        platform: "android",
        runtimeStatus: "failed",
        updatedAt: Date.now() - 30_000,
        stale: true,
        elapsedSeconds: 5,
        videoFrames: 0,
        encodedBytes: 0,
        droppedFrames: 0,
        publisher: {
          state: "failed",
          reconnectAttempts: 0,
          sentVideoFrames: 0,
          sentAudioFrames: 0,
          droppedVideoFrames: 0,
          droppedAudioFrames: 0,
          bytesWritten: 0,
          cacheSize: 100,
          itemsInCache: 0,
          congested: false,
          lastError: `RTMP auth failed for ${demoStreamKey}`
        },
        composition: {
          status: "applied",
          appliedCount: 1,
          skippedCount: 0,
          skippedKinds: [],
          message: "Native screen capture ready"
        },
        message: "Android native runtime failed"
      }
    });

    const nativeCheck = diagnostics.checks.find((check) => check.code === "native-runtime-failed");
    expect(nativeCheck?.status).toBe("fail");
    expect(nativeCheck?.message).toContain(redactStreamKey(demoStreamKey));
    expect(nativeCheck?.message).not.toContain(demoStreamKey);
    expect(diagnostics.checks.some((check) => check.code === "native-runtime-stale")).toBe(false);
  });

  it("warns when the native publisher reports congestion", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({
        bitrateKbps: 4500,
        fps: 30,
        elapsedSeconds: 20,
        message: "Live"
      }),
      nativeRuntime: {
        platform: "android",
        runtimeStatus: "live",
        updatedAt: Date.now(),
        stale: false,
        elapsedSeconds: 20,
        videoFrames: 540,
        encodedBytes: 9_200_000,
        droppedFrames: 2,
        publisher: {
          state: "published",
          reconnectAttempts: 0,
          sentVideoFrames: 540,
          sentAudioFrames: 910,
          droppedVideoFrames: 2,
          droppedAudioFrames: 1,
          bytesWritten: 9_200_000,
          cacheSize: 120,
          itemsInCache: 80,
          congested: true,
          lastError: ""
        },
        composition: {
          status: "applied",
          appliedCount: 1,
          skippedCount: 0,
          skippedKinds: [],
          message: "Native screen capture ready"
        },
        message: "Android native runtime live"
      }
    });

    const nativeCheck = diagnostics.checks.find((check) => check.code === "native-runtime-congested");
    expect(nativeCheck?.status).toBe("warn");
    expect(nativeCheck?.message).toContain("80/120");
  });

  it("redacts stream keys that appear before the final publish URL segment", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        platform: "custom" as const,
        presetId: "custom-rtmps" as const,
        serverUrl: "rtmps://live.example.test/app/{stream_key}/primary",
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });

    expect(diagnostics.target.publishUrlPreview).toContain(redactStreamKey(demoStreamKey));
    expect(diagnostics.target.publishUrlPreview).not.toContain(demoStreamKey);
  });

  it("normalizes likely embedded stream keys from server URLs before diagnostics", () => {
    const embeddedStreamKey = "demo-1234-segment";
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        platform: "youtube-live" as const,
        presetId: "youtube-live-rtmps" as const,
        serverUrl: `rtmps://a.rtmps.youtube.com/live2/${embeddedStreamKey}`,
        streamKey: ""
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health({ message: "Waiting for stream key cleanup." })
    });
    const report = createStreamDiagnosticReport(diagnostics, new Date("2026-06-22T00:00:00.000Z"));
    const json = serializeStreamDiagnosticReport(report);
    const text = formatStreamDiagnosticReport(report);

    expect(readiness.sanitizedProfile.destination.serverUrl).toBe("rtmps://a.rtmps.youtube.com/live2");
    expect(readiness.sanitizedProfile.destination.streamKey).toBe(embeddedStreamKey);
    expect(diagnostics.target.application).toBe("live2");
    expect(diagnostics.target.streamKeyPreview).toContain(redactStreamKey(embeddedStreamKey));
    expect(diagnostics.target.publishUrlPreview).toContain(redactStreamKey(embeddedStreamKey));
    expect(json).not.toContain(embeddedStreamKey);
    expect(text).not.toContain(embeddedStreamKey);
  });

  it("redacts stream keys from endpoint application paths", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        platform: "custom" as const,
        presetId: "custom-rtmps" as const,
        serverUrl: `rtmps://live.example.test/app/${demoStreamKey}`,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    }, [
      {
        id: "event-1",
        at: "2026-06-22T00:00:00.000Z",
        kind: "operation",
        severity: "fail",
        title: "Start failed",
        message: `RTMP rejected ${demoStreamKey}`
      }
    ]);
    const report = serializeStreamDiagnosticReport(createStreamDiagnosticReport(diagnostics, new Date("2026-06-22T00:00:00.000Z")));

    expect(diagnostics.target.application).toContain(redactStreamKey(demoStreamKey));
    expect(diagnostics.target.application).not.toContain(demoStreamKey);
    expect(diagnostics.session.events[0].message).toContain(redactStreamKey(demoStreamKey));
    expect(diagnostics.session.events[0].message).not.toContain(demoStreamKey);
    expect(report).not.toContain(demoStreamKey);
  });

  it("redacts chat event details from diagnostic exports", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({ bitrateKbps: 3500, fps: 30 })
    }, [
      {
        id: "chat-private-1",
        at: "2026-06-22T00:00:00.000Z",
        kind: "chat",
        severity: "warn",
        title: `Viewer Alice ${demoStreamKey}`,
        message: `Alice says private phone 555-1234 and ${demoStreamKey}`
      }
    ]);
    const report = createStreamDiagnosticReport(diagnostics, new Date("2026-06-22T00:00:00.000Z"));
    const json = serializeStreamDiagnosticReport(report);
    const text = formatStreamDiagnosticReport(report);

    expect(diagnostics.session.events[0]).toMatchObject({
      kind: "chat",
      severity: "warn",
      title: "Chat readout event",
      message: "Chat readout event details redacted for viewer privacy."
    });
    expect(json).toContain("Chat readout event details redacted for viewer privacy.");
    expect(text).toContain("Chat readout event details redacted for viewer privacy.");
    expect(json).not.toContain("Alice");
    expect(text).not.toContain("Alice");
    expect(json).not.toContain("555-1234");
    expect(text).not.toContain("555-1234");
    expect(json).not.toContain("private phone");
    expect(text).not.toContain("private phone");
    expect(json).not.toContain(demoStreamKey);
    expect(text).not.toContain(demoStreamKey);
  }, 10_000);

  it("keeps stream-stop chat disconnect events while redacting details", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    }, [
      {
        id: "chat-stop-1",
        at: "2026-06-22T00:00:00.000Z",
        kind: "chat",
        severity: "info",
        title: "Chat auto-disconnect stopped",
        message: `Stopped chat with private moderator note and ${demoStreamKey}`
      }
    ]);
    const report = createStreamDiagnosticReport(diagnostics, new Date("2026-06-22T00:00:00.000Z"));
    const text = formatStreamDiagnosticReport(report);

    expect(diagnostics.session.events[0]).toMatchObject({
      title: "Chat auto-disconnect stopped",
      message: "Chat readout disconnected when the stream stopped. Details redacted for viewer privacy."
    });
    expect(text).toContain("Chat auto-disconnect stopped");
    expect(text).not.toContain("private moderator note");
    expect(text).not.toContain(demoStreamKey);
  });

  it("fails diagnostics when the engine snapshot is failed", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "failed" },
      health: health({ message: "RTMP handshake failed" })
    });

    expect(diagnostics.status).toBe("fail");
    expect(diagnostics.summary).toContain("blocking");
    expect(diagnostics.checks.some((check) => check.code === "engine-failed")).toBe(true);
    expect(diagnostics.recovery.mode).toBe("failed");
    expect(diagnostics.recovery.nextRetryDelayMs).toBe(1000);
  });

  it("redacts stream keys from engine health messages", () => {
    const baseScene = createDefaultScene();
    const scene = {
      ...baseScene,
      sources: baseScene.sources.map((source) =>
        source.id === "source-background" ? { ...source, name: `background ${demoStreamKey}` } : source
      )
    };
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "failed" },
      health: health({ message: `RTMP handshake failed for ${demoStreamKey}` })
    });

    expect(diagnostics.telemetry.message).toContain(redactStreamKey(demoStreamKey));
    expect(diagnostics.telemetry.message).not.toContain(demoStreamKey);
    expect(diagnostics.checks.find((check) => check.code === "engine-failed")?.message).not.toContain(demoStreamKey);
    expect(diagnostics.nativeComposition.issues.find((issue) => issue.sourceId === "source-background")?.sourceName).toContain(
      redactStreamKey(demoStreamKey)
    );
    expect(diagnostics.nativeComposition.issues.find((issue) => issue.sourceId === "source-background")?.sourceName).not.toContain(
      demoStreamKey
    );
  });

  it("redacts OAuth and API secrets from diagnostics messages and session events", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);

    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "failed" },
        health: health({
          message:
            `Authorization: Bearer engine-access-token-secret ${demoStreamKey} mobilelivecaster://oauth/youtube?code=engine-code-secret`
        })
      },
      [
        {
          id: "platform-api-secret",
          at: "2026-06-22T00:00:02.000Z",
          kind: "platform-api",
          severity: "fail",
          title: "OAuth callback exchange failed",
          message:
            "Authorization: Bearer session-access-token-secret refresh_token=session-refresh-secret client_secret=session-client-secret"
        }
      ]
    );
    const json = JSON.stringify(diagnostics);

    expect(json).not.toContain("engine-access-token-secret");
    expect(json).not.toContain("engine-code-secret");
    expect(json).not.toContain("session-access-token-secret");
    expect(json).not.toContain("session-refresh-secret");
    expect(json).not.toContain("session-client-secret");
    expect(json).not.toContain(demoStreamKey);
    expect(diagnostics.telemetry.message).toContain("Authorization: Bearer [redacted]");
    expect(diagnostics.telemetry.message).toContain("code=[redacted]");
    expect(diagnostics.session.events[0]?.message).toContain("refresh_token=[redacted]");
    expect(diagnostics.session.events[0]?.message).toContain("client_secret=[redacted]");
  });

  it("serializes a shareable diagnostic report without raw stream keys", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey: demoStreamKey
      }
    };
    const readiness = createReadinessReport(scene, profile);
    const healthSamples = [
      {
        at: "2026-06-22T00:00:01.000Z",
        status: "live" as const,
        elapsedSeconds: 1,
        bitrateKbps: 3600,
        fps: 30,
        droppedFrames: 0,
        reconnectAttempts: 0
      },
      {
        at: "2026-06-22T00:00:05.000Z",
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
          id: "platform-api-started",
          at: "2026-06-22T00:00:02.000Z",
          kind: "platform-api",
          severity: "info",
          title: "Platform publishing status refresh started",
          message: "Platform publishing status refresh started."
        },
        {
          id: "platform-api-succeeded",
          at: "2026-06-22T00:00:03.000Z",
          kind: "platform-api",
          severity: "info",
          title: "Platform publishing status refresh succeeded",
          message: "Platform publishing status refresh completed."
        }
      ],
      healthSamples,
      target: { bitrateKbps: 3500, fps: 30 },
      endReason: "stopped",
      endedAt: new Date("2026-06-22T00:00:06.000Z")
    });
    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      {
        state: { status: "live" },
        health: health({ message: `Publishing with ${demoStreamKey}`, bitrateKbps: 3600, fps: 30 })
      },
      [],
      healthSamples,
      sessionSummary ? [sessionSummary] : []
    );

    const preflight = createStreamStartPreflightReport({
      readiness,
      streamStatus: "idle",
      profile,
      validation: diagnostics.validation
    });
    const publicLaunchChecklist = createPublicLaunchChecklist({
      preflight,
      diagnostics,
      platformPublishingFreshness: assessPlatformPublishingFreshness(diagnostics.platformPublishing, new Date("2026-06-22T00:00:00.000Z")),
      profile
    });
    const report = createStreamDiagnosticReport(diagnostics, new Date("2026-06-22T00:00:00.000Z"), publicLaunchChecklist);
    const json = serializeStreamDiagnosticReport(report);
    const text = formatStreamDiagnosticReport(report);

    expect(report.app).toEqual({ name: "MobileLiveCaster", reportVersion: 2 });
    expect(report.generatedAt).toBe("2026-06-22T00:00:00.000Z");
    expect(report.publicLaunchChecklist?.status).toBe(publicLaunchChecklist.status);
    expect(json).toContain("MobileLiveCaster");
    expect(text).toContain("MobileLiveCaster Diagnostics");
    expect(text).toContain("Public Launch Checklist");
    expect(text).toContain("Start lock: off / blocked no");
    expect(text).toContain("Recovery");
    expect(text).toContain("Active Quality Incidents");
    expect(text).toContain("Quality Advisor");
    expect(text).toContain("Health History");
    expect(text).toContain("Audio Validation");
    expect(text).toContain("Chat Readout");
    expect(text).toContain("Completed Sessions");
    expect(text).toContain("Platform API: 2 events / 0 failed");
    expect(text).toContain("Chat readout: 0 events / 0 reconnects / 0 exhausted");
    expect(text).toContain("Last platform API: 2 events / 0 failed");
    expect(text).toContain("Last chat readout: 0 events / 0 reconnects / 0 exhausted");
    expect(text).toContain("Commercial Validation");
    expect(text).toContain("Validate mic FX and monitor");
    expect(text).toContain("Validate chat readout");
    expect(text).toContain("Evidence audio");
    expect(text).toContain("Evidence chat readout");
    expect(text).toContain("Evidence run manifest: -");
    expect(text).toContain("Session Events");
    expect(json).toContain("backoffWindow");
    expect(json).toContain("qualityIncidents");
    expect(json).toContain("qualityAdvisor");
    expect(json).toContain("history");
    expect(json).toContain("historySummary");
    expect(json).toContain("lastSummary");
    expect(json).toContain("validation");
    expect(json).toContain("validationEvidence");
    expect(json).toContain("runManifest");
    expect(report.diagnostics.session.lastSummary?.outcome).toBe("clean");
    expect(report.diagnostics.session.historySummary.totalSessions).toBe(1);
    expect(report.diagnostics.session.historySummary.cleanRate).toBe(100);
    expect(report.diagnostics.validation.status).toBe("needs-test");
    expect(report.diagnostics.validationEvidence.summary).toContain("No physical validation");
    expect(text).toContain("History recommendation");
    expect(json).toContain(redactStreamKey(demoStreamKey));
    expect(text).toContain(redactStreamKey(demoStreamKey));
    expect(json).not.toContain(demoStreamKey);
    expect(text).not.toContain(demoStreamKey);
  });
});
