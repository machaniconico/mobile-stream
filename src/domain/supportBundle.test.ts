import { describe, expect, it } from "vitest";
import { normalizeNativeRuntimeAudioProcessing } from "./nativeRuntime";
import { createDefaultStudioProfile, redactStreamKey } from "./profiles";
import { createReadinessReport } from "./readiness";
import { addSource, createDefaultScene, createSource, setVisibility, updateSource } from "./scene";
import { createStreamDiagnostics } from "./streamDiagnostics";
import { createStreamSessionSummary } from "./streamSessionSummary";
import { createStreamStartPreflightReport } from "./streamStartPreflight";
import { createStreamValidationRun } from "./streamValidationEvidence";
import {
  createSupportBundle,
  formatSupportBundle,
  serializeSupportBundle
} from "./supportBundle";
import { createStreamSafetyEvent } from "./streamSessionLog";
import { initialStreamState, type StreamHealth } from "./streamState";

const health = (update: Partial<StreamHealth> = {}): StreamHealth => ({
  ...initialStreamState.health,
  ...update
});

const streamKey = "support-demo";
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
          videoEncoderBackend: "mediacodec-h264",
          audioEncoderBackend: "mediacodec-aac",
          reconnectAttempts: 0,
          sentVideoFrames: 144,
          sentAudioFrames: 240,
          droppedVideoFrames: 1,
          droppedAudioFrames: 0,
          bytesWritten: 2_200_000,
          videoFrameIntervalSampleCount: 119,
          videoFrameIntervalAverageMs: 33.3,
          videoFrameIntervalMaxMs: 42,
          videoFrameIntervalJitterMs: 8.7,
          cacheSize: 120,
          itemsInCache: 64,
          congested: true,
          lastError: ""
        },
        composition: {
          status: "applied" as const,
          appliedCount: 4,
          appliedKinds: ["caption", "chat", "pngtuber", "text"],
          skippedCount: 0,
          skippedKinds: [],
          stillImageAssetCount: 1,
          stillImageAssetLoadedCount: 1,
          stillImageAssetMissingCount: 0,
          stillImageAssetMissingKinds: [],
          stillImageAssetDecodedCount: 1,
          stillImageAssetDecodedPixelCount: 921_600,
          stillImageAssetCompositedCount: 1,
          stillImageAssetCompositedPixelCount: 921_600,
          runtimeCompositorBackend: "android-canvas-mediacodec",
          runtimeCompositedFrameCount: 144,
          runtimeDroppedFrameCount: 1,
          runtimeCompositionFailureCount: 0,
          liveRenderGraphReloadCount: 3,
          liveRenderGraphRejectedUpdateCount: 1,
          stillImageAssetAppGroupCount: 0,
          stillImageAssetAppGroupLoadedCount: 0,
          stillImageAssetAppGroupDecodedCount: 0,
          stillImageAssetAppGroupDecodedPixelCount: 0,
          stillImageAssetAppGroupCompositedCount: 0,
          stillImageAssetAppGroupCompositedPixelCount: 0,
          vrmSourceCount: 1,
          vrmPosePayloadCount: 1,
          vrmActivePoseCount: 1,
          vrmMissingPoseCount: 0,
          vrmModelUriCount: 1,
          vrmModelVersions: ["1.0"],
          vrmHumanoidBoneCount: 55,
          vrmExpressionCount: 8,
          vrmMeshPrimitiveCount: 4,
          vrmSkinnedMeshPrimitiveCount: 4,
          vrmSkinJointCount: 55,
          vrmPositionAccessorCount: 4,
          vrmVertexCount: 12_480,
          vrmIndexCount: 36_240,
          vrmBoundsAccessorCount: 4,
          vrmSkinningAttributePrimitiveCount: 4,
          vrmTrianglePrimitiveCount: 4,
          vrmUnsupportedPrimitiveModeCount: 0,
          vrmNormalAccessorCount: 4,
          vrmTexcoordAccessorCount: 4,
          vrmMorphTargetCount: 8,
          vrmMaterialCount: 3,
          vrmTextureCount: 3,
          vrmImageCount: 3,
          vrmUnsupportedImageMimeCount: 0,
          vrmTransparentMaterialCount: 1,
          vrmPoseBoneCount: 7,
          vrmPoseBoneAppliedCount: 7,
          vrmPoseBoneUnsupportedCount: 0,
          vrmPoseExpressionCount: 3,
          vrmPoseExpressionAppliedCount: 3,
          vrmPoseExpressionUnsupportedCount: 0,
          vrmRuntimeStatuses: ["active"],
          vrmRendererStatus: "ready" as const,
          vrmRendererBackend: "opengl-es",
          vrmModelLoadedCount: 1,
          vrmRenderedSourceCount: 1,
          vrmRenderMissingCount: 0,
          vrmRenderFailureCount: 0,
          message: "Native screen capture ready"
        },
        audioProcessing: normalizeNativeRuntimeAudioProcessing({
          playbackCaptureStatus: "capturing",
          playbackCaptureBackend: "android-audio-playback-capture",
          playbackCaptureSampleRate: 44_100,
          playbackCapturedFrames: 132_300,
          playbackDroppedFrames: 441,
          playbackUnderrunFrames: 441,
          playbackBufferedFrames: 882,
          encoderRecoveryAttemptCount: 3,
          encoderRecoverySuccessCount: 1,
          encoderRecoveryFailureCount: 2,
          encoderRecoverySuppressedInputBufferCount: 4,
          encoderRecoveryDroppedInputFrameCount: 960,
          encoderRecoveryDiscardedQueuedFrameCount: 1_024,
          encoderRecoveryConsecutiveFailureCount: 2,
          encoderRecoveryPending: true,
          encoderRecoveryRetryAfterMs: 200,
          encoderRecoveryLastStatus: -50,
          encoderRecoveryLastReason: `encode-${streamKey}-failed`,
          encoderRecoveryLastRecoveryAt: Date.parse("2026-06-23T00:00:04.125Z"),
          micCaptureStatus: "capturing",
          micCaptureBackend: "android-audio-record",
          micCaptureSampleRate: 48_000,
          micCaptureFallbackFrames: 1_440,
          micCaptureLifecycleEventCount: 6,
          micCaptureRouteChangeCount: 2,
          micCaptureInterruptionCount: 1,
          micCaptureRecoveryCount: 2,
          micCaptureRecoveryFailureCount: 1,
          micCaptureUnrecoveredEventCount: 3,
          micCaptureLastRecoveryReason: `audio-route-${streamKey}-changed`,
          micCaptureLastRecoveryAt: Date.parse("2026-06-23T00:00:04.250Z"),
          micCaptureSuspended: false,
          playbackCaptureLifecycleEventCount: 5,
          playbackCaptureRouteChangeCount: 1,
          playbackCaptureInterruptionCount: 2,
          playbackCaptureRecoveryCount: 2,
          playbackCaptureRecoveryFailureCount: 1,
          playbackCaptureUnrecoveredEventCount: 4,
          playbackCaptureLastRecoveryReason: `media-projection-${streamKey}-resumed`,
          playbackCaptureLastRecoveryAt: Date.parse("2026-06-23T00:00:04.400Z"),
          playbackCaptureSuspended: false,
          monitorLifecycleEventCount: 4,
          monitorRouteChangeCount: 2,
          monitorInterruptionCount: 1,
          monitorRecoveryCount: 2,
          monitorRecoveryFailureCount: 1,
          monitorLastRecoveryReason: "route-device-removed",
          monitorLastRecoveryAt: Date.parse("2026-06-23T00:00:04.500Z"),
          monitorSuspended: false
        }),
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
          id: "platform-api-1",
          at: "2026-06-23T00:00:02.000Z",
          kind: "platform-api",
          severity: "info",
          title: "Platform publishing setup succeeded",
          message: "Platform publishing setup completed."
        },
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
    const publicLaunchEvents = [
      createStreamSafetyEvent(
        "public-launch-confirmed",
        "YouTube Public launch confirmation was accepted by the operator. Target: YouTube Live, app privacy public, dashboard privacy public, broadcast selected, stream selected, broadcast status ready. Checklist: 7 pass / 0 warn / 0 fail.",
        new Date("2026-06-23T00:00:02.500Z")
      ),
      createStreamSafetyEvent(
        "public-launch-cancelled",
        "YouTube Public launch confirmation was cancelled by the operator. Target: YouTube Live, app privacy public, dashboard privacy public, broadcast selected, stream selected, broadcast status ready. Checklist: 7 pass / 0 warn / 0 fail.",
        new Date("2026-06-23T00:00:03.500Z")
      )
    ];
    const diagnostics = createStreamDiagnostics(
      scene,
      profile,
      readiness,
      snapshot,
      publicLaunchEvents,
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

    expect(bundle.app).toEqual({ name: "MobileLiveCaster", reportVersion: 1, bundleVersion: 62 });
    expect(bundle.profile.androidPublisherMode).toBe(profile.androidPublisherMode);
    expect(bundle.generatedAt).toBe("2026-06-23T00:00:00.000Z");
    expect(bundle.summary.sourceCount).toBe(scene.sources.length);
    expect(bundle.summary.sceneFingerprint).toMatch(/^scene1-[0-9a-f]{8}-[0-9a-z]+$/);
    expect(bundle.scene.fingerprint).toBe(bundle.summary.sceneFingerprint);
    expect(bundle.summary.publicLaunchStatus).toBe(bundle.publicLaunchChecklist.status);
    expect(bundle.summary.publicLaunchCanStart).toBe(bundle.publicLaunchChecklist.canStart);
    expect(bundle.summary.publicLaunchStartLockBlocked).toBe(bundle.publicLaunchChecklist.startLock.blocked);
    expect(bundle.summary.publicLaunchConfirmationEventCount).toBe(2);
    expect(bundle.summary.publicLaunchLastConfirmationStatus).toBe("cancelled");
    expect(bundle.summary.publicLaunchLastConfirmationAt).toBe("2026-06-23T00:00:03.500Z");
    expect(bundle.summary.publicLaunchLastConfirmationMessage).toContain("Checklist: 7 pass / 0 warn / 0 fail");
    expect(bundle.publicLaunchChecklist.items.map((item) => item.id)).toContain("platform-dashboard");
    expect(bundle.publicLaunchChecklist.items.map((item) => item.id)).toContain("live-captions");
    expect(bundle.scene.sourceCounts.pngtuber).toBe(1);
    expect(bundle.profile.destination.streamKeyPreview).toBe(redactStreamKey(streamKey));
    expect(bundle.profile.platformPublishing.titleLength).toBe(profile.platformPublishing.title.length);
    expect(bundle.profile.platformPublishing.twitchChannelTitle).toBe("");
    expect(bundle.profile.platformPublishing.twitchChannelCategoryId).toBe("");
    expect(bundle.profile.platformPublishing.twitchChannelLanguage).toBe("");
    expect(bundle.summary.sessionPlatformApiEventCount).toBe(1);
    expect(bundle.summary.sessionPlatformApiFailureCount).toBe(0);
    expect(bundle.summary.lastSessionPlatformApiEventCount).toBe(1);
    expect(bundle.summary.lastSessionPlatformApiFailureCount).toBe(0);
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
    expect(bundle.summary.lastSessionNativeRuntimeVideoEncoderBackend).toBe("mediacodec-h264");
    expect(bundle.summary.lastSessionNativeRuntimeAudioEncoderBackend).toBe("mediacodec-aac");
    expect(bundle.summary).toMatchObject({
      lastSessionNativeRuntimeMicCaptureStatus: "capturing",
      lastSessionNativeRuntimeMicCaptureBackend: "android-audio-record",
      lastSessionNativeRuntimeMicCaptureSampleRate: 48_000,
      lastSessionNativeRuntimeMicCaptureFallbackFrames: 1_440,
      lastSessionNativeRuntimeMicCaptureLifecycleEventCount: 6,
      lastSessionNativeRuntimeMicCaptureRouteChangeCount: 2,
      lastSessionNativeRuntimeMicCaptureInterruptionCount: 1,
      lastSessionNativeRuntimeMicCaptureRecoveryCount: 2,
      lastSessionNativeRuntimeMicCaptureRecoveryFailureCount: 1,
      lastSessionNativeRuntimeMicCaptureUnrecoveredEventCount: 3,
      lastSessionNativeRuntimeMicCaptureLastRecoveryReason: `audio-route-${redactStreamKey(streamKey)}-changed`,
      lastSessionNativeRuntimeMicCaptureLastRecoveryAt: Date.parse("2026-06-23T00:00:04.250Z"),
      lastSessionNativeRuntimeMicCaptureSuspended: false,
      lastSessionNativeRuntimePlaybackCaptureStatus: "capturing",
      lastSessionNativeRuntimePlaybackCaptureBackend: "android-audio-playback-capture",
      lastSessionNativeRuntimePlaybackCaptureSampleRate: 44_100,
      lastSessionNativeRuntimePlaybackCaptureLifecycleEventCount: 5,
      lastSessionNativeRuntimePlaybackCaptureRouteChangeCount: 1,
      lastSessionNativeRuntimePlaybackCaptureInterruptionCount: 2,
      lastSessionNativeRuntimePlaybackCaptureRecoveryCount: 2,
      lastSessionNativeRuntimePlaybackCaptureRecoveryFailureCount: 1,
      lastSessionNativeRuntimePlaybackCaptureUnrecoveredEventCount: 4,
      lastSessionNativeRuntimePlaybackCaptureLastRecoveryReason:
        `media-projection-${redactStreamKey(streamKey)}-resumed`,
      lastSessionNativeRuntimePlaybackCaptureLastRecoveryAt: Date.parse("2026-06-23T00:00:04.400Z"),
      lastSessionNativeRuntimePlaybackCaptureSuspended: false
    });
    expect(bundle.summary.lastSessionNativeRuntimeCongested).toBe(true);
    expect(bundle.summary.lastSessionNativeRuntimeStillImageAssetCount).toBe(1);
    expect(bundle.summary.lastSessionNativeRuntimeStillImageAssetLoadedCount).toBe(1);
    expect(bundle.summary.lastSessionNativeRuntimeStillImageAssetMissingCount).toBe(0);
    expect(bundle.summary.lastSessionNativeRuntimeVrmSourceCount).toBe(1);
    expect(bundle.summary.lastSessionNativeRuntimeVrmPosePayloadCount).toBe(1);
    expect(bundle.summary.lastSessionNativeRuntimeVrmActivePoseCount).toBe(1);
    expect(bundle.summary.lastSessionNativeRuntimeVrmMissingPoseCount).toBe(0);
    expect(bundle.summary.lastSessionNativeRuntimeVrmRendererStatus).toBe("ready");
    expect(bundle.summary.lastSessionNativeRuntimeVrmRenderedSourceCount).toBe(1);
    expect(bundle.summary.lastSessionNativeRuntimeVrmMeshPrimitiveCount).toBe(4);
    expect(bundle.summary.lastSessionNativeRuntimeVrmSkinnedMeshPrimitiveCount).toBe(4);
    expect(bundle.summary.lastSessionNativeRuntimeVrmSkinJointCount).toBe(55);
    expect(bundle.summary.lastSessionNativeRuntimeVrmVertexCount).toBe(12_480);
    expect(bundle.summary.lastSessionNativeRuntimeVrmIndexCount).toBe(36_240);
    expect(bundle.summary.lastSessionNativeRuntimeVrmSkinningAttributePrimitiveCount).toBe(4);
    expect(bundle.summary.lastSessionNativeRuntimeVrmTrianglePrimitiveCount).toBe(4);
    expect(bundle.summary.lastSessionNativeRuntimeVrmNormalAccessorCount).toBe(4);
    expect(bundle.summary.lastSessionNativeRuntimeVrmTexcoordAccessorCount).toBe(4);
    expect(bundle.summary.lastSessionNativeRuntimeVrmImageCount).toBe(3);
    expect(bundle.summary.lastSessionNativeRuntimeVrmUnsupportedImageMimeCount).toBe(0);
    expect(bundle.summary.lastSessionNativeRuntimeVrmMorphTargetCount).toBe(8);
    expect(bundle.summary.validationRunbookStatus).toBe("running");
    expect(bundle.summary.validationRunbookPendingCount).toBeGreaterThan(0);
    expect(bundle.summary.rehearsalStatus).toBe("needs-run");
    expect(bundle.summary.rehearsalCanPromoteToPublic).toBe(false);
    expect(bundle.summary.rehearsalScore).toBeGreaterThanOrEqual(0);
    expect(bundle.summary.rehearsalGrade).toMatch(/^[ABCDF]$/);
    expect(bundle.summary.rehearsalWeakAreaCount).toBeGreaterThan(0);
    expect(bundle.summary.rehearsalPendingCount).toBeGreaterThan(0);
    expect(bundle.summary.rehearsalSummary).toContain("Rehearsal");
    expect(bundle.summary.qualityAdvisorAction).toBe("maintain");
    expect(bundle.summary.qualityAdvisorSeverity).toBe("pass");
    expect(bundle.summary.suggestedQualityTarget).toBeNull();
    expect(bundle.summary.faceTrackingStatus).toBe("info");
    expect(bundle.summary.faceTrackingRuntimeStatus).toBe("unavailable");
    expect(bundle.summary.faceTrackingFaceLandmarkConfidence).toBe(0);
    expect(bundle.summary.faceTrackingFaceLandmarkReady).toBe(false);
    expect(bundle.summary.faceTrackingLandmarkMotionScale).toBe(1);
    expect(bundle.summary.faceTrackingFaceControlScale).toBe(0);
    expect(bundle.summary.faceTrackingPreparedPngTuberCount).toBe(0);
    expect(bundle.summary.faceTrackingRigIssueCount).toBe(0);
    expect(bundle.summary.faceTrackingRigIssueSummary).toBe("No still-image rig issues.");
    expect(bundle.summary.faceTrackingRigQualityScore).toBe(100);
    expect(bundle.summary.faceTrackingRigQualityGrade).toBe("ready");
    expect(bundle.summary.faceTrackingRigPartSeparationScore).toBe(100);
    expect(bundle.summary.faceTrackingRigDepthContinuityScore).toBe(100);
    expect(bundle.summary.faceTrackingRigSemanticSegmentScore).toBe(100);
    expect(bundle.summary.faceTrackingRigEyeMouthSegmentScore).toBe(100);
    expect(bundle.summary.faceTrackingRigHorizontalAnchorScore).toBe(100);
    expect(bundle.summary.faceTrackingRigHighFidelityScore).toBe(100);
    expect(bundle.summary.faceTrackingRigHighFidelityGrade).toBe("ready");
    expect(bundle.summary.validationEvidenceLatestFaceTrackingFaceLandmarkConfidence).toBe(0);
    expect(bundle.summary.validationEvidenceLatestFaceTrackingFaceLandmarkReady).toBe(false);
    expect(bundle.summary.validationEvidenceLatestFaceTrackingLandmarkMotionScale).toBe(1);
    expect(bundle.summary.validationEvidenceLatestFaceTrackingFaceControlScale).toBe(0);
    expect(bundle.summary.nativeCompositionStatus).toBe("warn");
    expect(bundle.summary.nativeCompositionCoverage).toBe("preview-only-overlays");
    expect(bundle.summary.nativeCompositionNativeOverlayCount).toBe(4);
    expect(bundle.summary.nativeCompositionStillImageOverlayCount).toBe(1);
    expect(bundle.summary.nativeCompositionTextOverlayCount).toBe(2);
    expect(bundle.summary.nativeCompositionCaptionOverlayCount).toBe(1);
    expect(bundle.summary.nativeCompositionChatOverlayCount).toBe(1);
    expect(bundle.summary.nativeCompositionPreviewOnlySourceCount).toBeGreaterThan(0);
    expect(bundle.summary.nativeCompositionAssetIssueCount).toBe(1);
    expect(bundle.summary.nativeCompositionFileBackedAssetIssueCount).toBe(0);
    expect(bundle.summary.nativeCompositionRequiresCompositor).toBe(true);
    expect(bundle.summary.nativeRuntimePlatform).toBe("android");
    expect(bundle.summary.nativeRuntimeVideoEncoderBackend).toBe("mediacodec-h264");
    expect(bundle.summary.nativeRuntimeAudioEncoderBackend).toBe("mediacodec-aac");
    expect(bundle.summary.nativeRuntimeCongested).toBe(true);
    expect(bundle.summary.nativeRuntimeQueuedItems).toBe(64);
    expect(bundle.summary.nativeRuntimeCacheSize).toBe(120);
    expect(bundle.summary.nativeRuntimePlaybackCaptureReady).toBe(true);
    expect(bundle.summary.nativeRuntimePlaybackCaptureStatus).toBe("capturing");
    expect(bundle.summary.nativeRuntimePlaybackCaptureBackend).toBe("android-audio-playback-capture");
    expect(bundle.summary.nativeRuntimePlaybackCaptureDurationSeconds).toBe(3);
    expect(bundle.summary.nativeRuntimePlaybackCaptureDropRatio).toBeCloseTo(0.0033, 4);
    expect(bundle.summary.nativeRuntimePlaybackCaptureUnderrunRatio).toBeCloseTo(0.00336, 5);
    expect(bundle.summary.nativeRuntimePlaybackCaptureBufferedMs).toBe(20);
    expect(bundle.summary).toMatchObject({
      nativeRuntimeMicCaptureStatus: "capturing",
      nativeRuntimeMicCaptureBackend: "android-audio-record",
      nativeRuntimeMicCaptureSampleRate: 48_000,
      nativeRuntimeMicCaptureFallbackFrames: 1_440,
      nativeRuntimeMicCaptureLifecycleEventCount: 6,
      nativeRuntimeMicCaptureRouteChangeCount: 2,
      nativeRuntimeMicCaptureInterruptionCount: 1,
      nativeRuntimeMicCaptureRecoveryCount: 2,
      nativeRuntimeMicCaptureRecoveryFailureCount: 1,
      nativeRuntimeMicCaptureUnrecoveredEventCount: 3,
      nativeRuntimeMicCaptureLastRecoveryReason: `audio-route-${redactStreamKey(streamKey)}-changed`,
      nativeRuntimeMicCaptureLastRecoveryAt: Date.parse("2026-06-23T00:00:04.250Z"),
      nativeRuntimeMicCaptureSuspended: false,
      nativeRuntimePlaybackCaptureLifecycleEventCount: 5,
      nativeRuntimePlaybackCaptureRouteChangeCount: 1,
      nativeRuntimePlaybackCaptureInterruptionCount: 2,
      nativeRuntimePlaybackCaptureRecoveryCount: 2,
      nativeRuntimePlaybackCaptureRecoveryFailureCount: 1,
      nativeRuntimePlaybackCaptureUnrecoveredEventCount: 4,
      nativeRuntimePlaybackCaptureLastRecoveryReason: `media-projection-${redactStreamKey(streamKey)}-resumed`,
      nativeRuntimePlaybackCaptureLastRecoveryAt: Date.parse("2026-06-23T00:00:04.400Z"),
      nativeRuntimePlaybackCaptureSuspended: false
    });
    expect(bundle.summary).toMatchObject({
      nativeRuntimeMonitorLifecycleEventCount: 4,
      nativeRuntimeMonitorRouteChangeCount: 2,
      nativeRuntimeMonitorInterruptionCount: 1,
      nativeRuntimeMonitorRecoveryCount: 2,
      nativeRuntimeMonitorRecoveryFailureCount: 1,
      nativeRuntimeMonitorLastRecoveryReason: "route-device-removed",
      nativeRuntimeMonitorLastRecoveryAt: Date.parse("2026-06-23T00:00:04.500Z"),
      nativeRuntimeMonitorSuspended: false
    });
    expect(bundle.summary.nativeRuntimeStillImageAssetCount).toBe(1);
    expect(bundle.summary.nativeRuntimeStillImageAssetLoadedCount).toBe(1);
    expect(bundle.summary.nativeRuntimeStillImageAssetMissingCount).toBe(0);
    expect(bundle.summary.nativeRuntimeStillImageAssetDecodedCount).toBe(1);
    expect(bundle.summary.nativeRuntimeStillImageAssetDecodedPixelCount).toBe(921_600);
    expect(bundle.summary.nativeRuntimeStillImageAssetCompositedCount).toBe(1);
    expect(bundle.summary.nativeRuntimeStillImageAssetCompositedPixelCount).toBe(921_600);
    expect(bundle.summary.nativeRuntimeCompositionAppliedKinds).toEqual(["caption", "chat", "pngtuber", "text"]);
    expect(bundle.summary.nativeRuntimeStillImageAssetAppGroupCount).toBe(0);
    expect(bundle.summary.nativeRuntimeStillImageAssetAppGroupLoadedCount).toBe(0);
    expect(bundle.summary.nativeRuntimeStillImageAssetAppGroupDecodedCount).toBe(0);
    expect(bundle.summary.nativeRuntimeStillImageAssetAppGroupDecodedPixelCount).toBe(0);
    expect(bundle.summary.nativeRuntimeStillImageAssetAppGroupCompositedCount).toBe(0);
    expect(bundle.summary.nativeRuntimeStillImageAssetAppGroupCompositedPixelCount).toBe(0);
    expect(bundle.summary.nativeRuntimeVrmSourceCount).toBe(1);
    expect(bundle.summary.nativeRuntimeVrmPosePayloadCount).toBe(1);
    expect(bundle.summary.nativeRuntimeVrmActivePoseCount).toBe(1);
    expect(bundle.summary.nativeRuntimeVrmMissingPoseCount).toBe(0);
    expect(bundle.summary.nativeRuntimeVrmRendererStatus).toBe("ready");
    expect(bundle.summary.nativeRuntimeVrmRenderedSourceCount).toBe(1);
    expect(bundle.summary.nativeRuntimeVrmMeshPrimitiveCount).toBe(4);
    expect(bundle.summary.nativeRuntimeVrmSkinnedMeshPrimitiveCount).toBe(4);
    expect(bundle.summary.nativeRuntimeVrmSkinJointCount).toBe(55);
    expect(bundle.summary.nativeRuntimeVrmVertexCount).toBe(12_480);
    expect(bundle.summary.nativeRuntimeVrmIndexCount).toBe(36_240);
    expect(bundle.summary.nativeRuntimeVrmSkinningAttributePrimitiveCount).toBe(4);
    expect(bundle.summary.nativeRuntimeVrmTrianglePrimitiveCount).toBe(4);
    expect(bundle.summary.nativeRuntimeVrmNormalAccessorCount).toBe(4);
    expect(bundle.summary.nativeRuntimeVrmTexcoordAccessorCount).toBe(4);
    expect(bundle.summary.nativeRuntimeVrmImageCount).toBe(3);
    expect(bundle.summary.nativeRuntimeVrmUnsupportedImageMimeCount).toBe(0);
    expect(bundle.summary.nativeRuntimeVrmMorphTargetCount).toBe(8);
    expect(bundle.summary.validationStatus).toBe("needs-test");
    expect(bundle.summary.validationFailCount).toBe(0);
    expect(bundle.summary.validationWarningCount).toBeGreaterThan(0);
    expect(bundle.summary.validationEvidenceStatus).toBe("none");
    expect(bundle.summary.validationEvidenceFingerprint).toMatch(/^sve1-[0-9a-f]{8}-[0-9a-z]+$/);
    expect(bundle.summary.validationEvidenceLatestRunFingerprint).toBeNull();
    expect(bundle.summary.validationEvidenceRunManifest).toEqual([]);
    expect(bundle.summary.validationEvidenceRunCount).toBe(0);
    expect(bundle.summary.validationEvidenceEligibleRunCount).toBe(0);
    expect(bundle.summary.validationEvidenceStaleRunCount).toBe(0);
    expect(bundle.summary.validationEvidenceAndroidPublisherModeAndroidPass).toBe(false);
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
    expect(bundle.summary.textOverlayStatus).toBe("pass");
    expect(bundle.summary.textOverlayVisibleSourceCount).toBe(2);
    expect(bundle.summary.textOverlayVisibleManualSourceCount).toBe(2);
    expect(bundle.summary.textOverlayEmptyVisibleManualSourceCount).toBe(0);
    expect(bundle.summary.textOverlaySensitiveContentIssueCount).toBe(0);
    expect(bundle.summary.textOverlayLayoutRiskIssueCount).toBe(0);
    expect(bundle.summary.textOverlaySafeAreaIssueCount).toBe(0);
    expect(bundle.summary.textOverlayAvatarOverlapIssueCount).toBe(0);
    expect(bundle.summary.textOverlaySubtitleSourceCount).toBe(1);
    expect(bundle.summary.chatOverlayStatus).toBe("pass");
    expect(bundle.summary.chatOverlayVisibleSourceCount).toBe(1);
    expect(bundle.summary.chatOverlayTransparentVisibleSourceCount).toBe(1);
    expect(bundle.summary.chatOverlayUrlRedactionDisabledCount).toBe(0);
    expect(bundle.summary.chatOverlayLayoutRiskIssueCount).toBe(0);
    expect(bundle.summary.chatOverlaySafeAreaIssueCount).toBe(0);
    expect(bundle.summary.chatOverlayAvatarOverlapIssueCount).toBe(0);
    expect(bundle.summary.liveCaptionStatus).toBe("info");
    expect(bundle.summary.liveCaptionEnabled).toBe(false);
    expect(bundle.summary.liveCaptionRecognitionStatus).toBe("unavailable");
    expect(bundle.summary.liveCaptionVisibleRuntimeSourceCount).toBe(0);
    expect(bundle.summary.liveCaptionRuntimeSourceCount).toBe(0);
    expect(bundle.summary.liveCaptionFinalCueCount).toBe(0);
    expect(bundle.summary.validationEvidenceQualityAutomationRunCount).toBe(0);
    expect(bundle.summary.validationEvidenceQualityAutomationLiveUpdateCount).toBe(0);
    expect(bundle.summary.validationEvidenceLatestQualityAutomationStatus).toBeNull();
    expect(bundle.summary.nativeRuntimeAudioEncoderRecoveryAttemptCount).toBe(3);
    expect(bundle.summary.nativeRuntimeAudioEncoderRecoveryPending).toBe(true);
    expect(bundle.summary.nativeRuntimeAudioEncoderRecoveryLastStatus).toBe(-50);
    expect(bundle.summary.validationEvidencePlatformPublishingRunCount).toBe(0);
    expect(bundle.summary.validationEvidencePlatformIngestRunCount).toBe(0);
    expect(bundle.summary.validationEvidencePlatformIngestIosPass).toBe(false);
    expect(bundle.summary.validationEvidencePlatformIngestAndroidPass).toBe(false);
    expect(bundle.summary.validationEvidenceLatestPlatformPublishingStatus).toBeNull();
    expect(bundle.summary.validationEvidencePlatformPublishingFreshnessStatus).toBeNull();
    expect(bundle.summary.platformPublishingFreshnessStatus).toBe("missing");
    expect(bundle.summary.platformPublishingFreshnessCheckedAt).toBe("");
    expect(formatSupportBundle(bundle)).toContain("Completed summaries: 1");
    expect(formatSupportBundle(bundle)).toContain("Public Launch Checklist");
    expect(formatSupportBundle(bundle)).toContain("Public launch:");
    expect(formatSupportBundle(bundle)).toContain(`Scene fingerprint: ${bundle.summary.sceneFingerprint}`);
    expect(formatSupportBundle(bundle)).toContain("Start lock:");
    expect(formatSupportBundle(bundle)).toContain("Confirmation events: 2 / last cancelled at 2026-06-23T00:00:03.500Z");
    expect(formatSupportBundle(bundle)).toContain("Last confirmation evidence: YouTube Public launch confirmation was cancelled");
    expect(formatSupportBundle(bundle)).not.toContain(streamKey);
    expect(formatSupportBundle(bundle)).toContain("Clean rate: 0%");
    expect(formatSupportBundle(bundle)).toContain("Session incidents:");
    expect(formatSupportBundle(bundle)).toContain("Last incidents:");
    expect(formatSupportBundle(bundle)).toContain("Platform API history: 1 events / 0 failed");
    expect(formatSupportBundle(bundle)).toContain("Last platform API: 1 events / 0 failed");
    expect(formatSupportBundle(bundle)).toContain("Chat readout history: 1 events / 1 reconnects / 0 exhausted");
    expect(formatSupportBundle(bundle)).toContain("Last chat readout: 1 events / 1 reconnects / 0 exhausted");
    expect(formatSupportBundle(bundle)).toContain("Quality automation history: 1 events / 1 live updates / 0 next-start targets / 0 failed");
    expect(formatSupportBundle(bundle)).toContain("Last quality automation: 1 events / 1 live updates / 0 next-start targets / 0 failed");
    expect(formatSupportBundle(bundle)).toContain("Quality advisor: maintain / pass");
    expect(formatSupportBundle(bundle)).toContain("Face tracking: info / runtime unavailable");
    expect(formatSupportBundle(bundle)).toContain(
      "rig high fidelity 100/100 ready / parts 100/100 / depth 100/100 / semantic 100/100 / eye-mouth 100/100"
    );
    expect(formatSupportBundle(bundle)).toContain(
      "Text overlays: pass / visible 2/2 / manual 2/2 / live-caption 0/0 / transparent 1 / empty manual 0 / sensitive 0 / dominant backdrop 0 / layout risk 0 / safe area 0 / avatar overlap 0"
    );
    expect(formatSupportBundle(bundle)).toContain("Text overlay modes: label 1 / subtitle 1 / ticker 0 / caption 0");
    expect(formatSupportBundle(bundle)).toContain(
      "Chat overlays: pass / visible 1/1 / transparent 1 / raw URLs 0 / opaque 0 / layout risk 0 / safe area 0 / avatar overlap 0"
    );
    expect(formatSupportBundle(bundle)).toContain(
      "Live captions: info / enabled no / recognition unavailable / language - / sources 0/0 visible / cues 0 final 0 active / transcripts 0"
    );
    expect(formatSupportBundle(bundle)).toContain("Live captions summary: Live caption session state is not available.");
    expect(formatSupportBundle(bundle)).toContain("Commercial Validation");
    expect(formatSupportBundle(bundle)).toContain("Runbook: running");
    expect(formatSupportBundle(bundle)).toContain(
      "Native composition: warn / preview-only-overlays / overlays 4 / still-image 1 / text 2 / caption 1 / chat 1"
    );
    expect(formatSupportBundle(bundle)).toContain("asset issues 1 / file-backed 0");
    expect(formatSupportBundle(bundle)).toContain(
      "assets 1/1 loaded / 1 decoded / decoded pixels 921600 / 1 composited / composited pixels 921600 / runtime android-canvas-mediacodec 144 frames 1 dropped 0 failures live reloads 3 rejected 1 / app-group 0/0 loaded / 0 decoded / decoded pixels 0 / 0 composited / composited pixels 0 / 0 missing"
    );
    expect(formatSupportBundle(bundle)).toContain("congested yes / queue 64/120");
    expect(formatSupportBundle(bundle)).toContain(
      `Native audio encoder recovery: attempts 3 / recovered 1 / failed 2 / consecutive 2 / pending yes / retry 200ms / suppressed buffers 4 / dropped input frames 960 / discarded queued frames 1024 / last -50 encode-${redactStreamKey(streamKey)}-failed`
    );
    expect(formatSupportBundle(bundle)).toContain(
      "Android playback capture: ready / capturing android-audio-playback-capture / 44100 Hz / 3.0s / captured 132300 / dropped 441 (0.33%) / underrun 441 (0.34%) / buffered 882 frames (20ms)"
    );
    expect(formatSupportBundle(bundle)).toContain(
      `Mic capture recovery: capturing android-audio-record / 48000 Hz / fallback 1440 frames / events 6 / routes 2 / interruptions 1 / recovered 2 / failed 1 / unrecovered 3 / suspended no / last audio-route-${redactStreamKey(streamKey)}-changed`
    );
    expect(formatSupportBundle(bundle)).toContain(
      `Playback capture recovery: capturing android-audio-playback-capture / 44100 Hz / events 5 / routes 1 / interruptions 2 / recovered 2 / failed 1 / unrecovered 4 / suspended no / last media-projection-${redactStreamKey(streamKey)}-resumed`
    );
    expect(formatSupportBundle(bundle)).toContain(
      `Last mic capture recovery: capturing android-audio-record / 48000 Hz / fallback 1440 frames / events 6 / routes 2 / interruptions 1 / recovered 2 / failed 1 / unrecovered 3 / suspended no / last audio-route-${redactStreamKey(streamKey)}-changed`
    );
    expect(formatSupportBundle(bundle)).toContain(
      `Last playback capture recovery: capturing android-audio-playback-capture / 44100 Hz / events 5 / routes 1 / interruptions 2 / recovered 2 / failed 1 / unrecovered 4 / suspended no / last media-projection-${redactStreamKey(streamKey)}-resumed`
    );
    expect(formatSupportBundle(bundle)).toContain(
      "Audio monitor recovery: events 4 / routes 2 / interruptions 1 / recovered 2 / failed 1 / suspended no / last route-device-removed"
    );
    expect(formatSupportBundle(bundle)).toContain("Last native runtime: warn / android / encoders mediacodec-h264/mediacodec-aac / MediaCodec probe missing none/none / overlays applied 4 kinds caption/chat/pngtuber/text skipped 0 / assets 1/1 loaded / 1 decoded / decoded pixels 921600 / 1 composited / composited pixels 921600 / runtime android-canvas-mediacodec 144 frames 1 dropped 0 failures live reloads 3 rejected 1 / app-group 0/0 loaded / 0 decoded / decoded pixels 0 / 0 composited / composited pixels 0 / 0 missing / live2d 0/0 active payloads 0 missing 0 / vrm 1/1 active payloads 1 missing 0 / renderer ready opengl-es rendered 1/1 models 1 versions 1.0 bones 55 expressions 8 mesh primitives 4 triangles 4 unsupported modes 0 skinned 4 skin joints 55 position accessors 4 normals 4 uvs 4 vertices 12480 indices 36240 bounds 4 skin attrs 4 morphs 8 materials 3 transparent materials 1 textures 3 images 3 unsupported image mimes 0 pose bones 7/7 unsupported 0 pose expressions 3/3 unsupported 0 missing 0 failed 0 / congested yes / queue 64/120");
    expect(formatSupportBundle(bundle)).toContain("Evidence: none / 0 retained / 0 eligible / 0 stale");
    expect(formatSupportBundle(bundle)).toContain("Evidence fingerprint: sve1-");
    expect(formatSupportBundle(bundle)).toContain("Evidence run manifest: -");
    expect(formatSupportBundle(bundle)).toContain("Evidence physical devices: 0 retained / 0 ready / 0 warn / 0 fail / iOS missing / Android missing / Android publisher missing");
    expect(formatSupportBundle(bundle)).toContain("Evidence monitor hold: 0 retained / 0 ready / 0 warn / 0 fail / iOS missing / Android missing / latest - 0s 0 samples");
    expect(formatSupportBundle(bundle)).toContain(
      "Evidence native runtime: 0 retained / 0 ready / 0 warn / 0 fail / iOS missing / Android missing / latest - - / encoders none/none / MediaCodec probe missing none/none / sent 0 video 0 audio / bytes 0 / frame interval 0 samples avg 0ms max 0ms jitter 0ms / overlays applied 0 skipped 0 / live reloads 0 rejected 0 / assets 0/0 loaded / 0 decoded / decoded pixels 0 / 0 composited / composited pixels 0 / 0 missing / app-group 0/0 loaded / 0 decoded / decoded pixels 0 / 0 composited / composited pixels 0"
    );
    expect(formatSupportBundle(bundle)).toContain("Evidence face tracking: 0 retained / 0 ready / 0 warn / iOS missing / Android missing");
    expect(formatSupportBundle(bundle)).toContain("landmarks 0% not-ready");
    expect(formatSupportBundle(bundle)).toContain("rig quality 0/100 blocked");
    expect(formatSupportBundle(bundle)).toContain("Evidence audio: 0 retained / 0 ready / 0 warn / iOS missing / Android missing");
    expect(formatSupportBundle(bundle)).toContain("Evidence chat readout: 0 retained / 0 ready / 0 warn / iOS missing / Android missing");
    expect(formatSupportBundle(bundle)).toContain("Evidence quality automation: 0 retained / live 0 / next-start 0 / failed 0");
    expect(formatSupportBundle(bundle)).toContain("Evidence platform dashboard: 0 retained / 0 ready / 0 fresh / 0 freshness warn / 0 warn / 0 fail");
    expect(formatSupportBundle(bundle)).toContain("Evidence platform ingest: 0 retained / 0 ready / 0 warn / 0 fail / iOS missing / Android missing");
    expect(formatSupportBundle(bundle)).toContain("Evidence platform dashboard freshness: - / -");
    expect(formatSupportBundle(bundle)).toContain(
      "Publishing status freshness: missing / checked - / YouTube dashboard status has no checked-at timestamp."
    );
  });

  it("keeps blocking chat overlay readiness evidence as failed support-bundle evidence", () => {
    const scene = createDefaultScene();
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey
      }
    };
    const baseReadiness = createReadinessReport(scene, profile);
    const readiness = {
      ...baseReadiness,
      canStart: false,
      issues: [
        ...baseReadiness.issues,
        {
          code: "scene-chat-overlay-render-failed",
          severity: "error" as const,
          field: "scene" as const,
          message: "Chat overlay rendering failed."
        }
      ],
      errorCount: baseReadiness.errorCount + 1
    };
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });
    const preflight = createStreamStartPreflightReport({
      readiness,
      streamStatus: "idle"
    });

    const bundle = createSupportBundle({ scene, profile, readiness, preflight, diagnostics });

    expect(bundle.summary.chatOverlayStatus).toBe("fail");
    expect(bundle.summary.chatOverlaySummary).toBe("1 chat overlay blocker remains.");
    expect(bundle.summary.chatOverlayRecommendation).toBe(
      "Resolve blocking chat overlay readiness errors and export fresh launch evidence."
    );
    expect(formatSupportBundle(bundle)).toContain("Chat overlays: fail");
  });

  it("keeps validation dashboard freshness in support bundle summaries", () => {
    const scene = nativeReadyScene();
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
        youtubeBroadcastBoundStreamId: "stream-1",
        youtubeBroadcastStatus: "live",
        youtubeBroadcastPrivacyStatus: "private" as const,
        youtubeStreamStatus: "active",
        youtubeStreamHealthStatus: "ok",
        youtubeStreamHealthIssues: [],
        youtubeStatusCheckedAt: "2026-06-23T00:00:00.000Z"
      }
    };
    const readiness = createReadinessReport(scene, profile);
    const baseDiagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "live" },
      health: health({ bitrateKbps: 3500, fps: 30 }),
      nativeRuntime: {
        platform: "ios",
        runtimeStatus: "live",
        updatedAt: Date.parse("2026-06-23T00:00:45.000Z"),
        stale: false,
        elapsedSeconds: 45,
        videoFrames: 0,
        encodedBytes: 0,
        droppedFrames: 0,
        publisher: {
          state: "published",
          publishGeneration: 1,
          currentPublishVideoFrames: 45,
          currentPublishAudioFrames: 90,
          videoEncoderBackend: "videotoolbox-h264",
          audioEncoderBackend: "audiotoolbox-aac",
          reconnectAttempts: 0,
          sentVideoFrames: 0,
          sentAudioFrames: 0,
          droppedVideoFrames: 0,
          droppedAudioFrames: 0,
          bytesWritten: 0,
          videoFrameIntervalSampleCount: 119,
          videoFrameIntervalAverageMs: 33.3,
          videoFrameIntervalMaxMs: 42,
          videoFrameIntervalJitterMs: 8.7,
          cacheSize: 120,
          itemsInCache: 0,
          congested: false,
          lastError: ""
        },
        encoderProbe: {
          status: "pass",
          checkedAt: Date.parse("2026-06-23T00:00:44.000Z"),
          activeEncoderInstancesVerified: true,
          videoEncodedOutputCount: 120,
          audioEncodedOutputCount: 190,
          videoBackend: "videotoolbox-h264",
          audioBackend: "audiotoolbox-aac",
          videoCodecName: "VideoToolbox",
          audioCodecName: "AudioToolbox",
          videoMime: "video/avc",
          audioMime: "audio/mp4a-latm",
          videoConfigured: true,
          audioConfigured: true,
          videoColorFormat: "surface",
          videoBitrateMode: "cbr",
          videoWidth: 1280,
          videoHeight: 720,
          videoFps: 30,
          audioSampleRate: 44_100,
          audioChannelCount: 2,
          message: "Native encoder output configured for the requested profile."
        },
        composition: {
          status: "applied",
          appliedCount: 4,
          appliedKinds: ["caption", "chat", "pngtuber", "text"],
          skippedCount: 0,
          skippedKinds: [],
          stillImageAssetCount: 1,
          stillImageAssetLoadedCount: 1,
          stillImageAssetMissingCount: 0,
          stillImageAssetMissingKinds: [],
          stillImageAssetDecodedCount: 1,
          stillImageAssetDecodedPixelCount: 921_600,
          stillImageAssetCompositedCount: 1,
          stillImageAssetCompositedPixelCount: 921_600,
          runtimeCompositorBackend: "ios-replaykit-coregraphics",
          runtimeCompositedFrameCount: 45,
          runtimeDroppedFrameCount: 0,
          runtimeCompositionFailureCount: 0,
          liveRenderGraphReloadCount: 2,
          liveRenderGraphRejectedUpdateCount: 1,
          stillImageAssetAppGroupCount: 1,
          stillImageAssetAppGroupLoadedCount: 1,
          stillImageAssetAppGroupDecodedCount: 1,
          stillImageAssetAppGroupDecodedPixelCount: 921_600,
          stillImageAssetAppGroupCompositedCount: 1,
          stillImageAssetAppGroupCompositedPixelCount: 921_600,
          vrmSourceCount: 1,
          vrmPosePayloadCount: 1,
          vrmActivePoseCount: 1,
          vrmMissingPoseCount: 0,
          vrmModelUriCount: 1,
          vrmModelVersions: ["1.0"],
          vrmHumanoidBoneCount: 55,
          vrmExpressionCount: 8,
          vrmMeshPrimitiveCount: 4,
          vrmSkinnedMeshPrimitiveCount: 4,
          vrmSkinJointCount: 55,
          vrmPositionAccessorCount: 4,
          vrmVertexCount: 12_480,
          vrmIndexCount: 36_240,
          vrmBoundsAccessorCount: 4,
          vrmSkinningAttributePrimitiveCount: 4,
          vrmTrianglePrimitiveCount: 4,
          vrmUnsupportedPrimitiveModeCount: 0,
          vrmNormalAccessorCount: 4,
          vrmTexcoordAccessorCount: 4,
          vrmMorphTargetCount: 8,
          vrmMaterialCount: 3,
          vrmTextureCount: 3,
          vrmImageCount: 3,
          vrmUnsupportedImageMimeCount: 0,
          vrmTransparentMaterialCount: 1,
          vrmPoseBoneCount: 7,
          vrmPoseBoneAppliedCount: 7,
          vrmPoseBoneUnsupportedCount: 0,
          vrmPoseExpressionCount: 3,
          vrmPoseExpressionAppliedCount: 3,
          vrmPoseExpressionUnsupportedCount: 0,
          vrmRuntimeStatuses: ["active"],
          vrmRendererStatus: "ready" as const,
          vrmRendererBackend: "metal-scene-kit",
          vrmModelLoadedCount: 1,
          vrmRenderedSourceCount: 1,
          vrmRenderMissingCount: 0,
          vrmRenderFailureCount: 0,
          message: "Native overlays applied"
        },
        continuity: {
          status: "healthy",
          videoStalled: false,
          audioStalled: false,
          videoLastAdvancedAt: Date.parse("2026-06-23T00:00:45.000Z"),
          audioLastAdvancedAt: Date.parse("2026-06-23T00:00:45.000Z"),
          videoStallDurationMs: 0,
          audioStallDurationMs: 0,
          videoStallCount: 0,
          audioStallCount: 0,
          maxVideoStallDurationMs: 0,
          maxAudioStallDurationMs: 0,
          stallThresholdMs: 5_000
        },
        avSync: {
          status: "in-sync",
          latestVideoTimestampMs: 44_966,
          latestAudioTimestampMs: 44_958,
          skewMs: 8,
          maxAbsSkewMs: 34,
          sampleCount: 3_490,
          outOfSyncSampleCount: 0,
          outOfSyncIncidentCount: 0,
          criticalIncidentCount: 0,
          consecutiveOutOfSyncSamples: 0,
          maxConsecutiveOutOfSyncSamples: 0,
          warningThresholdMs: 150,
          criticalThresholdMs: 500,
          critical: false
        },
        message: "Native runtime live"
      }
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
      [run],
      null,
      { now: new Date("2026-06-23T00:20:00.000Z") }
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

    const latestRunFingerprint = diagnostics.validationEvidence.latestRun?.fingerprint ?? null;
    expect(bundle.summary.validationEvidenceFingerprint).toMatch(/^sve1-[0-9a-f]{8}-[0-9a-z]+$/);
    expect(bundle.summary.validationEvidenceLatestRunFingerprint).toBe(latestRunFingerprint);
    expect(bundle.summary.validationEvidencePlatformPublishingRunCount).toBe(1);
    expect(bundle.profile.platformPublishing.youtubeBroadcastBoundStreamId).toBe("stream-1");
    expect(bundle.profile.platformPublishing.youtubeBroadcastPrivacyStatus).toBe("private");
    expect(bundle.summary.validationEvidencePlatformIngestRunCount).toBe(1);
    expect(bundle.summary.validationEvidencePlatformIngestReadyCount).toBe(0);
    expect(bundle.summary.validationEvidencePlatformIngestWarningCount).toBe(1);
    expect(bundle.summary.validationEvidenceQualityAutomationRunCount).toBe(1);
    expect(bundle.summary.validationEvidenceQualityAutomationLiveUpdateCount).toBe(1);
    expect(bundle.summary.validationEvidenceQualityAutomationFailureCount).toBe(0);
    expect(bundle.summary.validationEvidenceLatestQualityAutomationStatus).toBe("pass");
    expect(bundle.summary.validationEvidencePlatformPublishingFreshnessStatus).toBe("fresh");
    expect(bundle.summary.validationEvidencePlatformPublishingFreshnessAgeMinutes).toBe(1);
    expect(bundle.summary.validationEvidencePlatformPublishingFreshnessSummary).toContain("1 minutes ago");
    expect(bundle.summary.platformPublishingFreshnessStatus).toBe("stale");
    expect(bundle.summary.platformPublishingFreshnessCheckedAt).toBe("2026-06-23T00:00:00.000Z");
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeSentVideoFrames).toBe(0);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeSentAudioFrames).toBe(0);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeBytesWritten).toBe(0);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeContinuityStatus).toBe("healthy");
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVideoStallCount).toBe(0);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeAudioStallCount).toBe(0);
    expect(bundle.summary.nativeRuntimeContinuityStatus).toBe("unknown");
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeLiveRenderGraphReloadCount).toBe(2);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeLiveRenderGraphRejectedUpdateCount).toBe(1);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupCount).toBe(1);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupLoadedCount).toBe(1);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupDecodedCount).toBe(1);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupDecodedPixelCount).toBe(921_600);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupCompositedCount).toBe(1);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupCompositedPixelCount).toBe(921_600);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmSourceCount).toBe(1);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmPosePayloadCount).toBe(1);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmActivePoseCount).toBe(1);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmMissingPoseCount).toBe(0);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmRendererStatus).toBe("ready");
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmRenderedSourceCount).toBe(1);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmMeshPrimitiveCount).toBe(4);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmSkinnedMeshPrimitiveCount).toBe(4);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmSkinJointCount).toBe(55);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmVertexCount).toBe(12_480);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmIndexCount).toBe(36_240);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmSkinningAttributePrimitiveCount).toBe(4);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmTrianglePrimitiveCount).toBe(4);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmNormalAccessorCount).toBe(4);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmTexcoordAccessorCount).toBe(4);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmImageCount).toBe(3);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmUnsupportedImageMimeCount).toBe(0);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeVrmMorphTargetCount).toBe(8);
    expect(bundle.summary.validationEvidenceLatestAudioMonitorLatencyStatus).toBe("warn");
    expect(bundle.summary.validationEvidenceLatestAudioMonitorLatencyMs).toBeNull();
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeEncoderProbeActiveEncoderInstancesVerified).toBe(true);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeEncoderProbeVideoEncodedOutputCount).toBe(120);
    expect(bundle.summary.validationEvidenceLatestNativeRuntimeEncoderProbeAudioEncodedOutputCount).toBe(190);
    expect(bundle.summary.validationEvidenceRunManifest).toHaveLength(1);
    expect(bundle.summary.validationEvidenceRunManifest[0]).toMatchObject({
      fingerprint: latestRunFingerprint,
      devicePlatform: "ios",
      androidPublisherMode: profile.androidPublisherMode,
      result: "warn",
      matchesScope: true,
      eligible: true,
      nativeRuntimeStatus: "pass",
      nativeRuntimePublisherState: "published",
      nativeRuntimePublisherPublishGeneration: 1,
      nativeRuntimeCurrentPublishVideoFrames: 45,
      nativeRuntimeCurrentPublishAudioFrames: 90,
      nativeRuntimeContinuityStatus: "healthy",
      nativeRuntimeVideoStallCount: 0,
      nativeRuntimeAudioStallCount: 0,
      nativeRuntimeVideoEncoderBackend: "videotoolbox-h264",
      nativeRuntimeAudioEncoderBackend: "audiotoolbox-aac",
      requestedVideoWidth: 1280,
      requestedVideoHeight: 720,
      requestedVideoFps: 30,
      nativeRuntimeEncoderProbeStatus: "pass",
      nativeRuntimeEncoderProbeActiveEncoderInstancesVerified: true,
      nativeRuntimeEncoderProbeVideoEncodedOutputCount: 120,
      nativeRuntimeEncoderProbeAudioEncodedOutputCount: 190,
      nativeRuntimeEncoderProbeVideoBackend: "videotoolbox-h264",
      nativeRuntimeEncoderProbeAudioBackend: "audiotoolbox-aac",
      nativeRuntimeEncoderProbeVideoConfigured: true,
      nativeRuntimeEncoderProbeAudioConfigured: true,
      nativeRuntimeEncoderProbeVideoWidth: 1280,
      nativeRuntimeEncoderProbeVideoHeight: 720,
      nativeRuntimeEncoderProbeVideoFps: 30,
      nativeRuntimeEncoderProbeMatchesRequestedOutput: true,
      nativeRuntimeCongested: false,
      nativeRuntimeQueuedItems: 0,
      nativeRuntimeCacheSize: 120,
      nativeRuntimeDroppedVideoFrames: 0,
      nativeRuntimeDroppedAudioFrames: 0,
      nativeRuntimeCompositorBackend: "ios-replaykit-coregraphics",
      nativeRuntimeCompositedFrameCount: 45,
      nativeRuntimeDroppedFrameCount: 0,
      nativeRuntimeCompositionFailureCount: 0,
      nativeRuntimeStillImageAssetAppGroupCount: 1,
      nativeRuntimeStillImageAssetAppGroupLoadedCount: 1,
      nativeRuntimeStillImageAssetAppGroupDecodedCount: 1,
      nativeRuntimeStillImageAssetAppGroupDecodedPixelCount: 921_600,
      nativeRuntimeStillImageAssetAppGroupCompositedCount: 1,
      nativeRuntimeStillImageAssetAppGroupCompositedPixelCount: 921_600,
      nativeRuntimeVrmSourceCount: 1,
      nativeRuntimeVrmPosePayloadCount: 1,
      nativeRuntimeVrmActivePoseCount: 1,
      nativeRuntimeVrmMissingPoseCount: 0,
      nativeRuntimeVrmRendererStatus: "ready",
      nativeRuntimeVrmRenderedSourceCount: 1,
      nativeRuntimeVrmMeshPrimitiveCount: 4,
      nativeRuntimeVrmSkinnedMeshPrimitiveCount: 4,
      nativeRuntimeVrmSkinJointCount: 55,
      nativeRuntimeVrmPositionAccessorCount: 4,
      nativeRuntimeVrmVertexCount: 12_480,
      nativeRuntimeVrmIndexCount: 36_240,
      nativeRuntimeVrmBoundsAccessorCount: 4,
      nativeRuntimeVrmSkinningAttributePrimitiveCount: 4,
      nativeRuntimeVrmTrianglePrimitiveCount: 4,
      nativeRuntimeVrmNormalAccessorCount: 4,
      nativeRuntimeVrmTexcoordAccessorCount: 4,
      nativeRuntimeVrmImageCount: 3,
      nativeRuntimeVrmUnsupportedImageMimeCount: 0,
      nativeRuntimeVrmMorphTargetCount: 8,
      audioStatus: "warn",
      platformPublishingFreshnessStatus: "fresh",
      platformPublishingCheckedAt: "2026-06-23T00:00:00.000Z"
    });
    expect(text).toContain("Evidence monitor hold: 1 retained / 0 ready / 1 warn / 0 fail / iOS missing / Android missing / latest warn 0s 0 samples");
    expect(text).toContain(`Evidence fingerprint: ${bundle.summary.validationEvidenceFingerprint} / latest ${latestRunFingerprint ?? "-"}`);
    expect(text).toContain("Evidence run manifest: ios warn eligible");
    expect(text).toContain(latestRunFingerprint ?? "-");
    const serialized = serializeSupportBundle(bundle);
    expect(serialized).toContain(latestRunFingerprint ?? "-");
    expect(JSON.parse(serialized).diagnostics.validationEvidence.latestRun.fingerprint).toBe(latestRunFingerprint);
    expect(formatSupportBundle(bundle, { secrets: [latestRunFingerprint ?? ""] })).not.toContain(latestRunFingerprint ?? "-");
    expect(text).toContain("avatar landmarks 0% not-ready attenuation motion 100% controls 0%");
    expect(text).toContain(
      "Evidence native runtime: 1 retained / 0 ready / 0 warn / 0 fail / iOS missing / Android missing / latest pass ios / encoders videotoolbox-h264/audiotoolbox-aac / MediaCodec probe pass videotoolbox-h264/audiotoolbox-aac / sent 0 video 0 audio / bytes 0 / frame interval 119 samples avg 33.3ms max 42ms jitter 8.7ms / overlays applied 4 kinds caption/chat/pngtuber/text skipped 0 / live reloads 2 rejected 1 / assets 1/1 loaded / 1 decoded / decoded pixels 921600 / 1 composited / composited pixels 921600 / 0 missing / app-group 1/1 loaded / 1 decoded / decoded pixels 921600 / 1 composited / composited pixels 921600"
    );
    expect(text).toContain("latency missing warn / source - / budget 180ms");
    expect(text).toContain("Evidence quality automation: 1 retained / live 1 / next-start 0 / failed 0");
    expect(text).toContain("Evidence platform ingest: 1 retained / 0 ready / 1 warn / 0 fail / iOS missing / Android missing");
    expect(text).toContain("Evidence platform dashboard freshness: fresh / YouTube dashboard status was checked 1 minutes ago.");
    expect(text).toContain("Publishing status freshness: stale / checked 2026-06-23T00:00:00.000Z / YouTube dashboard status is 20 minutes old.");
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
    expect(bundle.summary.sceneFingerprint).toMatch(/^scene1-[0-9a-f]{8}-[0-9a-z]+$/);
    expect(bundle.scene.sources.find((source) => source.id === "source-sensitive-label")?.payload.textLength).toBeGreaterThan(0);
  });

  it("redacts unsafe nested support-bundle export text before serialization or sharing", () => {
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
      state: { status: "idle" },
      health: health()
    });
    const preflight = createStreamStartPreflightReport({
      readiness,
      streamStatus: "idle"
    });
    const bundle = createSupportBundle({ scene, profile, readiness, preflight, diagnostics });
    const mutableBundle = bundle as unknown as {
      preflight: { summary: string; primaryAction: string };
      diagnostics: {
        session: {
          historySummary: {
            summary: string;
            recommendation: string;
          };
        };
        api: {
          serialized: string;
        };
      };
    };
    mutableBundle.preflight.summary = `Failed Authorization: Bearer support-access-token-secret with ${streamKey}`;
    mutableBundle.preflight.primaryAction =
      "Contact viewer@example.com / 090-1234-5678 / discord.gg/privateRoom / https://discord.com/api/webhooks/123456789012345678/supportWebhookTokenValue1234567890";
    mutableBundle.diagnostics.session.historySummary.summary =
      "Inspect www.example.org/private, example.tv/show, a.rtmps.youtube.com/private, and https://www.twitch.tv/activate?public=true&device-code=SUPPORT-CODE";
    mutableBundle.diagnostics.session.historySummary.recommendation =
      "callback mobilelivecaster://oauth/youtube?code=support-oauth-code-secret";
    mutableBundle.diagnostics.api = {
      serialized:
        '{"apiKey":"support-api-key-secret"} customOauthToken=support-custom-token-secret https://accounts.google.com/o/oauth2/v2/auth?client_id=yt-client&redirect_uri=com.mobilelivecaster.app%3A%2Foauth%2Fyoutube&response_type=code&state=support-state-secret&code_challenge=support-pkce-secret&code_challenge_method=S256'
    };

    const json = serializeSupportBundle(bundle, { secrets: [streamKey] });
    const text = formatSupportBundle(bundle, { secrets: [streamKey] });
    const exported = `${json}\n${text}`;

    expect(exported).toContain("[redacted]");
    expect(json).toContain("\"host\": \"a.rtmps.youtube.com\"");
    expect(text).toContain("Endpoint: a.rtmps.youtube.com/live2");
    expect(exported).not.toContain(streamKey);
    expect(exported).not.toContain("support-access-token-secret");
    expect(exported).not.toContain("support-oauth-code-secret");
    expect(exported).not.toContain("support-api-key-secret");
    expect(exported).not.toContain("support-custom-token-secret");
    expect(exported).not.toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(exported).not.toContain("support-state-secret");
    expect(exported).not.toContain("support-pkce-secret");
    expect(exported).not.toContain("www.twitch.tv/activate");
    expect(exported).not.toContain("SUPPORT-CODE");
    expect(exported).not.toContain("mobilelivecaster://oauth");
    expect(exported).not.toContain("viewer@example.com");
    expect(exported).not.toContain("090-1234-5678");
    expect(exported).not.toContain("discord.gg/privateRoom");
    expect(exported).not.toContain("supportWebhookTokenValue1234567890");
    expect(exported).not.toContain("discord.com/api/webhooks/123456789012345678");
    expect(exported).not.toContain("www.example.org");
    expect(exported).not.toContain("example.tv");
    expect(exported).not.toContain("a.rtmps.youtube.com/private");
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

  it("summarizes VRM source model readiness without exposing local paths", () => {
    const vrm = createSource("vrm");
    if (vrm.kind !== "vrm") {
      throw new Error("Expected VRM source.");
    }
    const scene = addSource(createDefaultScene(), {
      ...vrm,
      modelId: "vroid-avatar",
      modelUri: "file:///private/var/mobile/Containers/Shared/AppGroup/ABCDEF/avatar.vrm",
      motion: { ...vrm.motion, headYaw: 0.2, confidence: 0.7 }
    });
    const profile = createDefaultStudioProfile();
    const readiness = createReadinessReport(scene, profile);
    const diagnostics = createStreamDiagnostics(scene, profile, readiness, {
      state: { status: "idle" },
      health: health()
    });
    const preflight = createStreamStartPreflightReport({
      readiness,
      streamStatus: "idle"
    });

    const bundle = createSupportBundle({ scene, profile, readiness, preflight, diagnostics });
    const vrmSummary = bundle.scene.sources.find((source) => source.kind === "vrm");

    expect(bundle.scene.sourceCounts.vrm).toBe(1);
    expect(vrmSummary?.payload).toEqual({
      modelId: "vroid-avatar",
      expression: "neutral",
      hasModelUri: true,
      runtimePoseStatus: "active",
      trackingConfidence: 0.7
    });
    expect(serializeSupportBundle(bundle)).not.toContain("avatar.vrm");
  });
});
