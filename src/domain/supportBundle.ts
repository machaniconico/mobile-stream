import { broadcastMixerChannels, getDestinationPreset, type StudioProfile } from "./profiles";
import {
  assessPlatformPublishingFreshness,
  type PlatformPublishingFreshnessStatus
} from "./platformPublishingFreshness";
import {
  createPublicLaunchChecklist,
  type PublicLaunchChecklist
} from "./publicLaunchChecklist";
import type { ReadinessReport } from "./readiness";
import type { SceneDocument, SceneSource, SourceKind, Transform } from "./scene";
import type { StreamDiagnostics } from "./streamDiagnostics";
import type { StreamStartPreflightReport } from "./streamStartPreflight";
import { createVrmRuntimePose } from "./vrmRuntime";

export interface SupportBundleSourceSummary {
  id: string;
  kind: SourceKind;
  name: string;
  visible: boolean;
  locked: boolean;
  transform: Transform;
  payload: Record<string, string | number | boolean>;
}

export interface SupportBundle {
  generatedAt: string;
  app: {
    name: "MobileLiveCaster";
    reportVersion: 1;
    bundleVersion: 41;
  };
  summary: {
    status: StreamDiagnostics["status"];
    preflightStatus: StreamStartPreflightReport["status"];
    publicLaunchStatus: PublicLaunchChecklist["status"];
    publicLaunchCanStart: boolean;
    publicLaunchPassCount: number;
    publicLaunchWarningCount: number;
    publicLaunchFailCount: number;
    publicLaunchStartLockApplies: boolean;
    publicLaunchStartLockBlocked: boolean;
    publicLaunchStartLockSummary: string;
    publicLaunchStartLockAction: string;
    diagnosticStatus: StreamDiagnostics["status"];
    launchBlockCount: number;
    launchWarningCount: number;
    diagnosticCheckCount: number;
    healthSampleCount: number;
    healthStability: StreamDiagnostics["history"]["stability"];
    sessionEventCount: number;
    completedSessionCount: number;
    sessionCleanRate: number;
    sessionHistoryStability: StreamDiagnostics["session"]["historySummary"]["stability"];
    sessionPlatformApiEventCount: number;
    sessionPlatformApiFailureCount: number;
    sessionChatEventCount: number;
    sessionChatReconnectEventCount: number;
    sessionChatReconnectFailureCount: number;
    sessionChatSpeechSpokenCount: number;
    sessionChatSpeechFailureCount: number;
    sessionQualityEventCount: number;
    sessionQualityLiveUpdateCount: number;
    sessionQualityNextTargetCount: number;
    sessionQualityUpdateFailureCount: number;
    lastSessionOutcome: NonNullable<StreamDiagnostics["session"]["lastSummary"]>["outcome"] | null;
    lastSessionPlatformApiEventCount: number;
    lastSessionPlatformApiFailureCount: number;
    lastSessionChatEventCount: number;
    lastSessionChatReconnectEventCount: number;
    lastSessionChatReconnectFailureCount: number;
    lastSessionChatSpeechSpokenCount: number;
    lastSessionChatSpeechFailureCount: number;
    lastSessionQualityEventCount: number;
    lastSessionQualityLiveUpdateCount: number;
    lastSessionQualityNextTargetCount: number;
    lastSessionQualityUpdateFailureCount: number;
    lastSessionAudioLevelSampleCount: number;
    lastSessionAudioPeakLevel: number;
    lastSessionAudioActivePercent: number;
    lastSessionAudioClippedSampleCount: number;
    lastSessionNativeRuntimeStatus: NonNullable<NonNullable<StreamDiagnostics["session"]["lastSummary"]>["nativeRuntime"]>["status"] | null;
    lastSessionNativeRuntimePlatform: NonNullable<NonNullable<StreamDiagnostics["session"]["lastSummary"]>["nativeRuntime"]>["platform"] | null;
    lastSessionNativeRuntimeCongested: boolean;
    lastSessionNativeRuntimeQueuedItems: number;
    lastSessionNativeRuntimeCacheSize: number;
    lastSessionNativeRuntimeCompositionAppliedCount: number;
    lastSessionNativeRuntimeCompositionSkippedCount: number;
    lastSessionNativeRuntimeCompositionSkippedKinds: string[];
    lastSessionNativeRuntimeStillImageAssetCount: number;
    lastSessionNativeRuntimeStillImageAssetLoadedCount: number;
    lastSessionNativeRuntimeStillImageAssetMissingCount: number;
    lastSessionNativeRuntimeStillImageAssetDecodedCount: number;
    lastSessionNativeRuntimeStillImageAssetDecodedPixelCount: number;
    lastSessionNativeRuntimeStillImageAssetCompositedCount: number;
    lastSessionNativeRuntimeStillImageAssetCompositedPixelCount: number;
    lastSessionNativeRuntimeStillImageAssetAppGroupCount: number;
    lastSessionNativeRuntimeStillImageAssetAppGroupLoadedCount: number;
    lastSessionNativeRuntimeStillImageAssetAppGroupDecodedCount: number;
    lastSessionNativeRuntimeStillImageAssetAppGroupDecodedPixelCount: number;
    lastSessionNativeRuntimeStillImageAssetAppGroupCompositedCount: number;
    lastSessionNativeRuntimeStillImageAssetAppGroupCompositedPixelCount: number;
    lastSessionNativeRuntimeVrmSourceCount: number;
    lastSessionNativeRuntimeVrmPosePayloadCount: number;
    lastSessionNativeRuntimeVrmActivePoseCount: number;
    lastSessionNativeRuntimeVrmMissingPoseCount: number;
    lastSessionNativeRuntimeVrmRendererStatus: string;
    lastSessionNativeRuntimeVrmRendererBackend: string;
    lastSessionNativeRuntimeVrmModelLoadedCount: number;
    lastSessionNativeRuntimeVrmModelVersions: string[];
    lastSessionNativeRuntimeVrmHumanoidBoneCount: number;
    lastSessionNativeRuntimeVrmExpressionCount: number;
    lastSessionNativeRuntimeVrmMeshPrimitiveCount: number;
    lastSessionNativeRuntimeVrmSkinnedMeshPrimitiveCount: number;
    lastSessionNativeRuntimeVrmSkinJointCount: number;
    lastSessionNativeRuntimeVrmPositionAccessorCount: number;
    lastSessionNativeRuntimeVrmVertexCount: number;
    lastSessionNativeRuntimeVrmIndexCount: number;
    lastSessionNativeRuntimeVrmBoundsAccessorCount: number;
    lastSessionNativeRuntimeVrmSkinningAttributePrimitiveCount: number;
    lastSessionNativeRuntimeVrmTrianglePrimitiveCount: number;
    lastSessionNativeRuntimeVrmUnsupportedPrimitiveModeCount: number;
    lastSessionNativeRuntimeVrmNormalAccessorCount: number;
    lastSessionNativeRuntimeVrmTexcoordAccessorCount: number;
    lastSessionNativeRuntimeVrmMorphTargetCount: number;
    lastSessionNativeRuntimeVrmMaterialCount: number;
    lastSessionNativeRuntimeVrmTextureCount: number;
    lastSessionNativeRuntimeVrmImageCount: number;
    lastSessionNativeRuntimeVrmUnsupportedImageMimeCount: number;
    lastSessionNativeRuntimeVrmTransparentMaterialCount: number;
    lastSessionNativeRuntimeVrmPoseBoneCount: number;
    lastSessionNativeRuntimeVrmPoseBoneAppliedCount: number;
    lastSessionNativeRuntimeVrmPoseBoneUnsupportedCount: number;
    lastSessionNativeRuntimeVrmPoseExpressionCount: number;
    lastSessionNativeRuntimeVrmPoseExpressionAppliedCount: number;
    lastSessionNativeRuntimeVrmPoseExpressionUnsupportedCount: number;
    lastSessionNativeRuntimeVrmRenderedSourceCount: number;
    lastSessionNativeRuntimeVrmRenderMissingCount: number;
    lastSessionNativeRuntimeVrmRenderFailureCount: number;
    audioMonitorRouteStatus: StreamDiagnostics["audio"]["monitorSafety"]["status"];
    audioMonitorRouteOutputName: string;
    audioMonitorRouteHeadphonesConnected: boolean;
    audioMonitorRouteStale: boolean;
    validationStatus: StreamDiagnostics["validation"]["status"];
    validationPendingCount: number;
    validationWarningCount: number;
    validationFailCount: number;
    validationRunbookStatus: StreamDiagnostics["validationRunbook"]["status"];
    validationRunbookPendingCount: number;
    validationRunbookWarningCount: number;
    validationRunbookFailCount: number;
    validationRunbookNextAction: string;
    rehearsalStatus: StreamDiagnostics["rehearsal"]["status"];
    rehearsalCanPromoteToPublic: boolean;
    rehearsalScore: number;
    rehearsalGrade: StreamDiagnostics["rehearsal"]["grade"];
    rehearsalWeakAreaCount: number;
    rehearsalSummary: string;
    rehearsalPrimaryAction: string;
    rehearsalPendingCount: number;
    rehearsalWarningCount: number;
    rehearsalFailCount: number;
    validationEvidenceStatus: StreamDiagnostics["validationEvidence"]["status"];
    validationEvidenceFingerprint: string;
    validationEvidenceLatestRunFingerprint: string | null;
    validationEvidenceRunManifest: StreamDiagnostics["validationEvidence"]["runManifest"];
    validationEvidenceRunCount: number;
    validationEvidenceEligibleRunCount: number;
    validationEvidenceStaleRunCount: number;
    validationEvidencePassCount: number;
    validationEvidenceFailureCount: number;
    validationEvidencePhysicalDeviceRunCount: number;
    validationEvidencePhysicalDeviceReadyCount: number;
    validationEvidencePhysicalDeviceWarningCount: number;
    validationEvidencePhysicalDeviceFailureCount: number;
    validationEvidencePhysicalDeviceIosPass: boolean;
    validationEvidencePhysicalDeviceAndroidPass: boolean;
    validationEvidenceNativeRuntimeRunCount: number;
    validationEvidenceNativeRuntimeReadyCount: number;
    validationEvidenceNativeRuntimeWarningCount: number;
    validationEvidenceNativeRuntimeFailureCount: number;
    validationEvidenceNativeRuntimeIosPass: boolean;
    validationEvidenceNativeRuntimeAndroidPass: boolean;
    validationEvidenceMonitorHoldRunCount: number;
    validationEvidenceMonitorHoldReadyCount: number;
    validationEvidenceMonitorHoldWarningCount: number;
    validationEvidenceMonitorHoldFailureCount: number;
    validationEvidenceMonitorHoldIosPass: boolean;
    validationEvidenceMonitorHoldAndroidPass: boolean;
    validationEvidenceLatestMonitorHoldStatus: NonNullable<StreamDiagnostics["validationEvidence"]["latestMonitorHold"]>["status"] | null;
    validationEvidenceLatestMonitorHoldSampleCount: number;
    validationEvidenceLatestMonitorHoldDurationSeconds: number;
    validationEvidenceLatestMonitorHoldStability: NonNullable<StreamDiagnostics["validationEvidence"]["latestMonitorHold"]>["stability"] | null;
    validationEvidenceLatestMonitorHoldAverageBitrateKbps: number;
    validationEvidenceLatestMonitorHoldMinimumBitrateKbps: number;
    validationEvidenceLatestMonitorHoldAverageFps: number;
    validationEvidenceLatestMonitorHoldMinimumFps: number;
    validationEvidenceLatestMonitorHoldDroppedFrameIncrease: number;
    validationEvidenceLatestMonitorHoldObservedReconnectAttempts: number;
    validationEvidenceLatestNativeRuntimeStatus: NonNullable<StreamDiagnostics["validationEvidence"]["latestNativeRuntime"]>["status"] | null;
    validationEvidenceLatestNativeRuntimePlatform: NonNullable<StreamDiagnostics["validationEvidence"]["latestNativeRuntime"]>["platform"] | null;
    validationEvidenceLatestNativeRuntimeCongested: boolean;
    validationEvidenceLatestNativeRuntimeQueuedItems: number;
    validationEvidenceLatestNativeRuntimeCacheSize: number;
    validationEvidenceLatestNativeRuntimeSentVideoFrames: number;
    validationEvidenceLatestNativeRuntimeSentAudioFrames: number;
    validationEvidenceLatestNativeRuntimeBytesWritten: number;
    validationEvidenceLatestNativeRuntimeVideoFrameIntervalSampleCount: number;
    validationEvidenceLatestNativeRuntimeVideoFrameIntervalAverageMs: number;
    validationEvidenceLatestNativeRuntimeVideoFrameIntervalMaxMs: number;
    validationEvidenceLatestNativeRuntimeVideoFrameIntervalJitterMs: number;
    validationEvidenceLatestNativeRuntimeCompositionAppliedCount: number;
    validationEvidenceLatestNativeRuntimeCompositionSkippedCount: number;
    validationEvidenceLatestNativeRuntimeCompositionSkippedKinds: string[];
    validationEvidenceLatestNativeRuntimeStillImageAssetCount: number;
    validationEvidenceLatestNativeRuntimeStillImageAssetLoadedCount: number;
    validationEvidenceLatestNativeRuntimeStillImageAssetMissingCount: number;
    validationEvidenceLatestNativeRuntimeStillImageAssetDecodedCount: number;
    validationEvidenceLatestNativeRuntimeStillImageAssetDecodedPixelCount: number;
    validationEvidenceLatestNativeRuntimeStillImageAssetCompositedCount: number;
    validationEvidenceLatestNativeRuntimeStillImageAssetCompositedPixelCount: number;
    validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupCount: number;
    validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupLoadedCount: number;
    validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupDecodedCount: number;
    validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupDecodedPixelCount: number;
    validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupCompositedCount: number;
    validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupCompositedPixelCount: number;
    validationEvidenceLatestNativeRuntimeVrmSourceCount: number;
    validationEvidenceLatestNativeRuntimeVrmPosePayloadCount: number;
    validationEvidenceLatestNativeRuntimeVrmActivePoseCount: number;
    validationEvidenceLatestNativeRuntimeVrmMissingPoseCount: number;
    validationEvidenceLatestNativeRuntimeVrmRendererStatus: string;
    validationEvidenceLatestNativeRuntimeVrmRendererBackend: string;
    validationEvidenceLatestNativeRuntimeVrmModelLoadedCount: number;
    validationEvidenceLatestNativeRuntimeVrmModelVersions: string[];
    validationEvidenceLatestNativeRuntimeVrmHumanoidBoneCount: number;
    validationEvidenceLatestNativeRuntimeVrmExpressionCount: number;
    validationEvidenceLatestNativeRuntimeVrmMeshPrimitiveCount: number;
    validationEvidenceLatestNativeRuntimeVrmSkinnedMeshPrimitiveCount: number;
    validationEvidenceLatestNativeRuntimeVrmSkinJointCount: number;
    validationEvidenceLatestNativeRuntimeVrmPositionAccessorCount: number;
    validationEvidenceLatestNativeRuntimeVrmVertexCount: number;
    validationEvidenceLatestNativeRuntimeVrmIndexCount: number;
    validationEvidenceLatestNativeRuntimeVrmBoundsAccessorCount: number;
    validationEvidenceLatestNativeRuntimeVrmSkinningAttributePrimitiveCount: number;
    validationEvidenceLatestNativeRuntimeVrmTrianglePrimitiveCount: number;
    validationEvidenceLatestNativeRuntimeVrmUnsupportedPrimitiveModeCount: number;
    validationEvidenceLatestNativeRuntimeVrmNormalAccessorCount: number;
    validationEvidenceLatestNativeRuntimeVrmTexcoordAccessorCount: number;
    validationEvidenceLatestNativeRuntimeVrmMorphTargetCount: number;
    validationEvidenceLatestNativeRuntimeVrmMaterialCount: number;
    validationEvidenceLatestNativeRuntimeVrmTextureCount: number;
    validationEvidenceLatestNativeRuntimeVrmImageCount: number;
    validationEvidenceLatestNativeRuntimeVrmUnsupportedImageMimeCount: number;
    validationEvidenceLatestNativeRuntimeVrmTransparentMaterialCount: number;
    validationEvidenceLatestNativeRuntimeVrmPoseBoneCount: number;
    validationEvidenceLatestNativeRuntimeVrmPoseBoneAppliedCount: number;
    validationEvidenceLatestNativeRuntimeVrmPoseBoneUnsupportedCount: number;
    validationEvidenceLatestNativeRuntimeVrmPoseExpressionCount: number;
    validationEvidenceLatestNativeRuntimeVrmPoseExpressionAppliedCount: number;
    validationEvidenceLatestNativeRuntimeVrmPoseExpressionUnsupportedCount: number;
    validationEvidenceLatestNativeRuntimeVrmRenderedSourceCount: number;
    validationEvidenceLatestNativeRuntimeVrmRenderMissingCount: number;
    validationEvidenceLatestNativeRuntimeVrmRenderFailureCount: number;
    validationEvidenceFaceTrackingRunCount: number;
    validationEvidenceFaceTrackingReadyCount: number;
    validationEvidenceFaceTrackingWarningCount: number;
    validationEvidenceFaceTrackingIosPass: boolean;
    validationEvidenceFaceTrackingAndroidPass: boolean;
    validationEvidenceLatestFaceTrackingStatus: NonNullable<StreamDiagnostics["validationEvidence"]["latestFaceTracking"]>["status"] | null;
    validationEvidenceLatestFaceTrackingRuntimeStatus: NonNullable<StreamDiagnostics["validationEvidence"]["latestFaceTracking"]>["runtimeStatus"] | null;
    validationEvidenceLatestFaceTrackingRuntimeAgeMs: number | null;
    validationEvidenceLatestFaceTrackingRuntimeFresh: boolean;
    validationEvidenceLatestFaceTrackingFaceLandmarkConfidence: number;
    validationEvidenceLatestFaceTrackingFaceLandmarkReady: boolean;
    validationEvidenceLatestFaceTrackingPreparedPngTuberCount: number;
    validationEvidenceLatestFaceTrackingVisibleVrmCount: number;
    validationEvidenceLatestFaceTrackingNativeVrmRendererReady: boolean;
    validationEvidenceLatestFaceTrackingActiveMotionCount: number;
    validationEvidenceLatestFaceTrackingRigQualityScore: number;
    validationEvidenceLatestFaceTrackingRigQualityGrade: NonNullable<StreamDiagnostics["validationEvidence"]["latestFaceTracking"]>["rigQualityGrade"] | null;
    validationEvidenceAudioRunCount: number;
    validationEvidenceAudioReadyCount: number;
    validationEvidenceAudioWarningCount: number;
    validationEvidenceAudioIosPass: boolean;
    validationEvidenceAudioAndroidPass: boolean;
    validationEvidenceLatestAudioStatus: NonNullable<StreamDiagnostics["validationEvidence"]["latestAudio"]>["status"] | null;
    validationEvidenceLatestAudioPresetId: string | null;
    validationEvidenceLatestAudioMonitorEnabled: boolean;
    validationEvidenceLatestAudioMonitorHeadphonesOnly: boolean;
    validationEvidenceLatestAudioMonitorRouteStatus: NonNullable<StreamDiagnostics["validationEvidence"]["latestAudio"]>["monitorRouteStatus"] | null;
    validationEvidenceLatestAudioOutputName: string | null;
    validationEvidenceLatestAudioHeadphonesConnected: boolean;
    validationEvidenceLatestAudioRouteStale: boolean;
    validationEvidenceLatestAudioNativeMonitorReported: boolean;
    validationEvidenceLatestAudioNativeMonitorRunning: boolean;
    validationEvidenceLatestAudioNativeMonitorWrittenFrames: number;
    validationEvidenceLatestAudioNativeMonitorDroppedFrames: number;
    validationEvidenceLatestAudioNativeMonitorWrittenBuffers: number;
    validationEvidenceLatestAudioNativeMonitorDroppedBuffers: number;
    validationEvidenceLatestAudioNativeMonitorOutputName: string | null;
    validationEvidenceLatestAudioMonitorLatencyStatus: NonNullable<StreamDiagnostics["validationEvidence"]["latestAudio"]>["monitorLatencyStatus"] | null;
    validationEvidenceLatestAudioMonitorLatencyMs: number | null;
    validationEvidenceLatestAudioMonitorLatencyBudgetMs: number;
    validationEvidenceLatestAudioMonitorLatencySource: string | null;
    validationEvidenceLatestAudioBluetoothRoute: boolean;
    validationEvidenceLatestAudioBluetoothTuningReviewed: boolean;
    validationEvidenceLatestAudioMonitorTuningNote: string | null;
    validationEvidenceLatestAudioLevelSampleCount: number;
    validationEvidenceLatestAudioPeakLevel: number;
    validationEvidenceLatestAudioClippedLevelCount: number;
    validationEvidenceChatReadoutRunCount: number;
    validationEvidenceChatReadoutReadyCount: number;
    validationEvidenceChatReadoutWarningCount: number;
    validationEvidenceChatReadoutIosPass: boolean;
    validationEvidenceChatReadoutAndroidPass: boolean;
    validationEvidenceLatestChatReadoutStatus: NonNullable<StreamDiagnostics["validationEvidence"]["latestChatReadout"]>["status"] | null;
    validationEvidenceLatestChatReadoutConnectionPhase: string | null;
    validationEvidenceLatestChatReadoutSpokenMessageCount: number;
    validationEvidenceLatestChatReadoutSpeechFailureCount: number;
    validationEvidenceQualityAutomationRunCount: number;
    validationEvidenceQualityAutomationLiveUpdateCount: number;
    validationEvidenceQualityAutomationNextTargetCount: number;
    validationEvidenceQualityAutomationFailureCount: number;
    validationEvidenceLatestQualityAutomationStatus: NonNullable<StreamDiagnostics["validationEvidence"]["latestQualityAutomation"]>["status"] | null;
    validationEvidenceLatestQualityAutomationSummary: string | null;
    validationEvidencePlatformPublishingRunCount: number;
    validationEvidencePlatformPublishingReadyCount: number;
    validationEvidencePlatformPublishingFreshCount: number;
    validationEvidencePlatformPublishingFreshnessWarningCount: number;
    validationEvidencePlatformPublishingWarningCount: number;
    validationEvidencePlatformPublishingFailureCount: number;
    validationEvidencePlatformPublishingIosPass: boolean;
    validationEvidencePlatformPublishingAndroidPass: boolean;
    validationEvidencePlatformIngestRunCount: number;
    validationEvidencePlatformIngestReadyCount: number;
    validationEvidencePlatformIngestWarningCount: number;
    validationEvidencePlatformIngestFailureCount: number;
    validationEvidencePlatformIngestIosPass: boolean;
    validationEvidencePlatformIngestAndroidPass: boolean;
    validationEvidenceLatestPlatformPublishingStatus: StreamDiagnostics["platformPublishing"]["status"] | null;
    validationEvidenceLatestPlatformPublishingSummary: string | null;
    validationEvidencePlatformPublishingFreshnessStatus: PlatformPublishingFreshnessStatus | null;
    validationEvidencePlatformPublishingFreshnessAgeMinutes: number | null;
    validationEvidencePlatformPublishingFreshnessSummary: string | null;
    validationEvidencePlatformPublishingFreshnessRecommendation: string | null;
    validationEvidenceIosPass: boolean;
    validationEvidenceAndroidPass: boolean;
    validationEvidenceAppBuildMismatch: boolean;
    validationEvidenceConsistentAppBuild: string | null;
    qualityAdvisorAction: StreamDiagnostics["qualityAdvisor"]["action"];
    qualityAdvisorSeverity: StreamDiagnostics["qualityAdvisor"]["severity"];
    suggestedQualityTarget: string | null;
    faceTrackingStatus: StreamDiagnostics["faceTracking"]["status"];
    faceTrackingRuntimeStatus: StreamDiagnostics["faceTracking"]["runtimeStatus"];
    faceTrackingRuntimeAgeMs: number | null;
    faceTrackingRuntimeFresh: boolean;
    faceTrackingFaceLandmarkConfidence: number;
    faceTrackingFaceLandmarkReady: boolean;
    faceTrackingPreparedPngTuberCount: number;
    faceTrackingVisibleVrmCount: number;
    faceTrackingNativeVrmRendererReady: boolean;
    faceTrackingActiveMotionCount: number;
    faceTrackingRigIssueCount: number;
    faceTrackingRigIssueSummary: string;
    faceTrackingRigQualityScore: number;
    faceTrackingRigQualityGrade: StreamDiagnostics["faceTracking"]["rigQualityGrade"];
    faceTrackingRigPartSeparationScore: number;
    faceTrackingRigDepthContinuityScore: number;
    faceTrackingRigHighFidelityScore: number;
    faceTrackingRigHighFidelityGrade: StreamDiagnostics["faceTracking"]["rigQualityGrade"];
    faceTrackingSummary: string;
    faceTrackingRecommendation: string;
    nativeCompositionStatus: StreamDiagnostics["nativeComposition"]["status"];
    nativeCompositionCoverage: StreamDiagnostics["nativeComposition"]["coverage"];
    nativeCompositionPreviewOnlySourceCount: number;
    nativeCompositionAssetIssueCount: number;
    nativeCompositionFileBackedAssetIssueCount: number;
    nativeCompositionRequiresCompositor: boolean;
    nativeRuntimePlatform: string | null;
    nativeRuntimeStatus: string | null;
    nativeRuntimePublisherState: string | null;
    nativeRuntimeCompositionStatus: string | null;
    nativeRuntimeCompositionAppliedCount: number;
    nativeRuntimeCompositionSkippedCount: number;
    nativeRuntimeCompositionSkippedKinds: string[];
    nativeRuntimeStillImageAssetCount: number;
    nativeRuntimeStillImageAssetLoadedCount: number;
    nativeRuntimeStillImageAssetMissingCount: number;
    nativeRuntimeStillImageAssetDecodedCount: number;
    nativeRuntimeStillImageAssetDecodedPixelCount: number;
    nativeRuntimeStillImageAssetCompositedCount: number;
    nativeRuntimeStillImageAssetCompositedPixelCount: number;
    nativeRuntimeStillImageAssetAppGroupCount: number;
    nativeRuntimeStillImageAssetAppGroupLoadedCount: number;
    nativeRuntimeStillImageAssetAppGroupDecodedCount: number;
    nativeRuntimeStillImageAssetAppGroupDecodedPixelCount: number;
    nativeRuntimeStillImageAssetAppGroupCompositedCount: number;
    nativeRuntimeStillImageAssetAppGroupCompositedPixelCount: number;
    nativeRuntimeVrmSourceCount: number;
    nativeRuntimeVrmPosePayloadCount: number;
    nativeRuntimeVrmActivePoseCount: number;
    nativeRuntimeVrmMissingPoseCount: number;
    nativeRuntimeVrmRendererStatus: string;
    nativeRuntimeVrmRendererBackend: string;
    nativeRuntimeVrmModelLoadedCount: number;
    nativeRuntimeVrmModelVersions: string[];
    nativeRuntimeVrmHumanoidBoneCount: number;
    nativeRuntimeVrmExpressionCount: number;
    nativeRuntimeVrmMeshPrimitiveCount: number;
    nativeRuntimeVrmSkinnedMeshPrimitiveCount: number;
    nativeRuntimeVrmSkinJointCount: number;
    nativeRuntimeVrmPositionAccessorCount: number;
    nativeRuntimeVrmVertexCount: number;
    nativeRuntimeVrmIndexCount: number;
    nativeRuntimeVrmBoundsAccessorCount: number;
    nativeRuntimeVrmSkinningAttributePrimitiveCount: number;
    nativeRuntimeVrmTrianglePrimitiveCount: number;
    nativeRuntimeVrmUnsupportedPrimitiveModeCount: number;
    nativeRuntimeVrmNormalAccessorCount: number;
    nativeRuntimeVrmTexcoordAccessorCount: number;
    nativeRuntimeVrmMorphTargetCount: number;
    nativeRuntimeVrmMaterialCount: number;
    nativeRuntimeVrmTextureCount: number;
    nativeRuntimeVrmImageCount: number;
    nativeRuntimeVrmUnsupportedImageMimeCount: number;
    nativeRuntimeVrmTransparentMaterialCount: number;
    nativeRuntimeVrmPoseBoneCount: number;
    nativeRuntimeVrmPoseBoneAppliedCount: number;
    nativeRuntimeVrmPoseBoneUnsupportedCount: number;
    nativeRuntimeVrmPoseExpressionCount: number;
    nativeRuntimeVrmPoseExpressionAppliedCount: number;
    nativeRuntimeVrmPoseExpressionUnsupportedCount: number;
    nativeRuntimeVrmRenderedSourceCount: number;
    nativeRuntimeVrmRenderMissingCount: number;
    nativeRuntimeVrmRenderFailureCount: number;
    nativeRuntimeStale: boolean;
    nativeRuntimeCongested: boolean;
    nativeRuntimeQueuedItems: number;
    nativeRuntimeCacheSize: number;
    platformPublishingFreshnessStatus: PlatformPublishingFreshnessStatus;
    platformPublishingFreshnessAgeMinutes: number | null;
    platformPublishingFreshnessSummary: string;
    platformPublishingFreshnessRecommendation: string;
    sourceCount: number;
    visibleSourceCount: number;
  };
  target: StreamDiagnostics["target"];
  quality: StreamDiagnostics["quality"];
  preflight: StreamStartPreflightReport;
  publicLaunchChecklist: PublicLaunchChecklist;
  diagnostics: StreamDiagnostics;
  scene: {
    id: string;
    name: string;
    canvas: SceneDocument["canvas"];
    sourceCounts: Record<SourceKind, number>;
    visibleSourceCount: number;
    lockedSourceCount: number;
    emptyImageSourceCount: number;
    live2dSourceCount: number;
    sources: SupportBundleSourceSummary[];
  };
  profile: {
    destination: {
      platform: StudioProfile["destination"]["platform"];
      presetId: StudioProfile["destination"]["presetId"];
      presetName: string;
      protocol: StudioProfile["destination"]["protocol"];
      host: string;
      application: string;
      publishUrlPreview: string;
      streamKeyPreview: string;
    };
    micEffects: StudioProfile["micEffects"];
    broadcastMixer: StudioProfile["broadcastMixer"];
    faceTracking: StudioProfile["faceTracking"];
    platformChat: {
      enabled: boolean;
      platform: StudioProfile["platformChat"]["platform"];
      hasYouTubeLiveChatId: boolean;
      hasTwitchChannel: boolean;
    };
    platformPublishing: {
      titleLength: number;
      descriptionLength: number;
      privacyStatus: StudioProfile["platformPublishing"]["privacyStatus"];
      scheduledStartMinutesFromNow: number;
      madeForKids: boolean;
      enableAutoStart: boolean;
      enableAutoStop: boolean;
      hasYouTubeStreamId: boolean;
      hasYouTubeBroadcastId: boolean;
      youtubeBroadcastBoundStreamId: string;
      youtubeBroadcastStatus: string;
      youtubeBroadcastPrivacyStatus: string;
      youtubeStreamStatus: string;
      youtubeStreamHealthStatus: string;
      youtubeStreamHealthIssueCount: number;
      youtubeStatusCheckedAt: string;
      twitchCategory: string;
      twitchCategoryId: string;
      twitchLanguage: string;
      twitchChannelTitle: string;
      twitchChannelCategory: string;
      twitchChannelCategoryId: string;
      twitchChannelLanguage: string;
      twitchLiveStatus: string;
      twitchViewerCount: number;
      twitchStatusCheckedAt: string;
    };
  };
}

export const createSupportBundle = ({
  scene,
  profile,
  readiness,
  preflight,
  diagnostics,
  now = new Date()
}: {
  scene: SceneDocument;
  profile: StudioProfile;
  readiness: ReadinessReport;
  preflight: StreamStartPreflightReport;
  diagnostics: StreamDiagnostics;
  now?: Date;
}): SupportBundle => {
  const sourceCounts = countSources(scene.sources);
  const visibleSourceCount = scene.sources.filter((source) => source.visible).length;
  const lockedSourceCount = scene.sources.filter((source) => source.locked).length;
  const platformPublishingFreshness = assessPlatformPublishingFreshness(diagnostics.platformPublishing, now);
  const publicLaunchChecklist = createPublicLaunchChecklist({
    preflight,
    diagnostics,
    platformPublishingFreshness,
    profile
  });
  const validationEvidencePlatformPublishingFreshness =
    diagnostics.validationEvidence.latestPlatformPublishingFreshness ??
    (diagnostics.validationEvidence.latestPlatformPublishing
      ? assessPlatformPublishingFreshness(diagnostics.validationEvidence.latestPlatformPublishing, now)
      : null);
  const nativeRuntimeComposition = diagnostics.nativeRuntime?.composition;
  const nativeRuntimeVrmSourceCount = nativeRuntimeComposition?.vrmSourceCount ?? 0;
  const nativeRuntimeVrmRenderedSourceCount = nativeRuntimeComposition?.vrmRenderedSourceCount ?? 0;
  const nativeRuntimeVrmRendererStatus =
    nativeRuntimeComposition?.vrmRendererStatus ?? (nativeRuntimeVrmSourceCount > 0 ? "unavailable" : "not-required");
  const nativeRuntimeVrmRenderMissingCount =
    nativeRuntimeComposition?.vrmRenderMissingCount ?? Math.max(0, nativeRuntimeVrmSourceCount - nativeRuntimeVrmRenderedSourceCount);

  return {
    generatedAt: now.toISOString(),
    app: {
      name: "MobileLiveCaster",
      reportVersion: 1,
      bundleVersion: 41
    },
    summary: {
      status: diagnostics.status,
      preflightStatus: preflight.status,
      publicLaunchStatus: publicLaunchChecklist.status,
      publicLaunchCanStart: publicLaunchChecklist.canStart,
      publicLaunchPassCount: publicLaunchChecklist.passCount,
      publicLaunchWarningCount: publicLaunchChecklist.warningCount,
      publicLaunchFailCount: publicLaunchChecklist.failCount,
      publicLaunchStartLockApplies: publicLaunchChecklist.startLock.applies,
      publicLaunchStartLockBlocked: publicLaunchChecklist.startLock.blocked,
      publicLaunchStartLockSummary: publicLaunchChecklist.startLock.summary,
      publicLaunchStartLockAction: publicLaunchChecklist.startLock.action,
      diagnosticStatus: diagnostics.status,
      launchBlockCount: preflight.blocks.length,
      launchWarningCount: preflight.warnings.length,
      diagnosticCheckCount: diagnostics.checks.length,
      healthSampleCount: diagnostics.history.sampleCount,
      healthStability: diagnostics.history.stability,
      sessionEventCount: diagnostics.session.events.length,
      completedSessionCount: diagnostics.session.summaries.length,
      sessionCleanRate: diagnostics.session.historySummary.cleanRate,
      sessionHistoryStability: diagnostics.session.historySummary.stability,
      sessionPlatformApiEventCount: diagnostics.session.historySummary.totalPlatformApiEvents,
      sessionPlatformApiFailureCount: diagnostics.session.historySummary.totalPlatformApiFailures,
      sessionChatEventCount: diagnostics.session.historySummary.totalChatEvents,
      sessionChatReconnectEventCount: diagnostics.session.historySummary.totalChatReconnectEvents,
      sessionChatReconnectFailureCount: diagnostics.session.historySummary.totalChatReconnectFailures,
      sessionChatSpeechSpokenCount: diagnostics.session.historySummary.totalChatSpeechSpoken,
      sessionChatSpeechFailureCount: diagnostics.session.historySummary.totalChatSpeechFailures,
      sessionQualityEventCount: diagnostics.session.historySummary.totalQualityEvents,
      sessionQualityLiveUpdateCount: diagnostics.session.historySummary.totalQualityLiveUpdates,
      sessionQualityNextTargetCount: diagnostics.session.historySummary.totalQualityNextTargets,
      sessionQualityUpdateFailureCount: diagnostics.session.historySummary.totalQualityUpdateFailures,
      lastSessionOutcome: diagnostics.session.lastSummary?.outcome ?? null,
      lastSessionPlatformApiEventCount: diagnostics.session.lastSummary?.platformApiEventCount ?? 0,
      lastSessionPlatformApiFailureCount: diagnostics.session.lastSummary?.platformApiFailureCount ?? 0,
      lastSessionChatEventCount: diagnostics.session.lastSummary?.chatEventCount ?? 0,
      lastSessionChatReconnectEventCount: diagnostics.session.lastSummary?.chatReconnectEventCount ?? 0,
      lastSessionChatReconnectFailureCount: diagnostics.session.lastSummary?.chatReconnectFailureCount ?? 0,
      lastSessionChatSpeechSpokenCount: diagnostics.session.lastSummary?.chatSpeechSpokenCount ?? 0,
      lastSessionChatSpeechFailureCount: diagnostics.session.lastSummary?.chatSpeechFailureCount ?? 0,
      lastSessionQualityEventCount: diagnostics.session.lastSummary?.qualityEventCount ?? 0,
      lastSessionQualityLiveUpdateCount: diagnostics.session.lastSummary?.qualityLiveUpdateCount ?? 0,
      lastSessionQualityNextTargetCount: diagnostics.session.lastSummary?.qualityNextTargetCount ?? 0,
      lastSessionQualityUpdateFailureCount: diagnostics.session.lastSummary?.qualityUpdateFailureCount ?? 0,
      lastSessionAudioLevelSampleCount: diagnostics.session.lastSummary?.audioLevel.sampleCount ?? 0,
      lastSessionAudioPeakLevel: diagnostics.session.lastSummary?.audioLevel.peakLevel ?? 0,
      lastSessionAudioActivePercent: diagnostics.session.lastSummary?.audioLevel.activePercent ?? 0,
      lastSessionAudioClippedSampleCount: diagnostics.session.lastSummary?.audioLevel.clippedSampleCount ?? 0,
      lastSessionNativeRuntimeStatus: diagnostics.session.lastSummary?.nativeRuntime?.status ?? null,
      lastSessionNativeRuntimePlatform: diagnostics.session.lastSummary?.nativeRuntime?.platform ?? null,
      lastSessionNativeRuntimeCongested: diagnostics.session.lastSummary?.nativeRuntime?.congested ?? false,
      lastSessionNativeRuntimeQueuedItems: diagnostics.session.lastSummary?.nativeRuntime?.queuedItems ?? 0,
      lastSessionNativeRuntimeCacheSize: diagnostics.session.lastSummary?.nativeRuntime?.cacheSize ?? 0,
      lastSessionNativeRuntimeCompositionAppliedCount:
        diagnostics.session.lastSummary?.nativeRuntime?.compositionAppliedCount ?? 0,
      lastSessionNativeRuntimeCompositionSkippedCount:
        diagnostics.session.lastSummary?.nativeRuntime?.compositionSkippedCount ?? 0,
      lastSessionNativeRuntimeCompositionSkippedKinds:
        diagnostics.session.lastSummary?.nativeRuntime?.compositionSkippedKinds ?? [],
      lastSessionNativeRuntimeStillImageAssetCount: diagnostics.session.lastSummary?.nativeRuntime?.stillImageAssetCount ?? 0,
      lastSessionNativeRuntimeStillImageAssetLoadedCount: diagnostics.session.lastSummary?.nativeRuntime?.stillImageAssetLoadedCount ?? 0,
      lastSessionNativeRuntimeStillImageAssetMissingCount: diagnostics.session.lastSummary?.nativeRuntime?.stillImageAssetMissingCount ?? 0,
      lastSessionNativeRuntimeStillImageAssetDecodedCount: diagnostics.session.lastSummary?.nativeRuntime?.stillImageAssetDecodedCount ?? 0,
      lastSessionNativeRuntimeStillImageAssetDecodedPixelCount:
        diagnostics.session.lastSummary?.nativeRuntime?.stillImageAssetDecodedPixelCount ?? 0,
      lastSessionNativeRuntimeStillImageAssetCompositedCount:
        diagnostics.session.lastSummary?.nativeRuntime?.stillImageAssetCompositedCount ?? 0,
      lastSessionNativeRuntimeStillImageAssetCompositedPixelCount:
        diagnostics.session.lastSummary?.nativeRuntime?.stillImageAssetCompositedPixelCount ?? 0,
      lastSessionNativeRuntimeStillImageAssetAppGroupCount:
        diagnostics.session.lastSummary?.nativeRuntime?.stillImageAssetAppGroupCount ?? 0,
      lastSessionNativeRuntimeStillImageAssetAppGroupLoadedCount:
        diagnostics.session.lastSummary?.nativeRuntime?.stillImageAssetAppGroupLoadedCount ?? 0,
      lastSessionNativeRuntimeStillImageAssetAppGroupDecodedCount:
        diagnostics.session.lastSummary?.nativeRuntime?.stillImageAssetAppGroupDecodedCount ?? 0,
      lastSessionNativeRuntimeStillImageAssetAppGroupDecodedPixelCount:
        diagnostics.session.lastSummary?.nativeRuntime?.stillImageAssetAppGroupDecodedPixelCount ?? 0,
      lastSessionNativeRuntimeStillImageAssetAppGroupCompositedCount:
        diagnostics.session.lastSummary?.nativeRuntime?.stillImageAssetAppGroupCompositedCount ?? 0,
      lastSessionNativeRuntimeStillImageAssetAppGroupCompositedPixelCount:
        diagnostics.session.lastSummary?.nativeRuntime?.stillImageAssetAppGroupCompositedPixelCount ?? 0,
      lastSessionNativeRuntimeVrmSourceCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmSourceCount ?? 0,
      lastSessionNativeRuntimeVrmPosePayloadCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmPosePayloadCount ?? 0,
      lastSessionNativeRuntimeVrmActivePoseCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmActivePoseCount ?? 0,
      lastSessionNativeRuntimeVrmMissingPoseCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmMissingPoseCount ?? 0,
      lastSessionNativeRuntimeVrmRendererStatus: diagnostics.session.lastSummary?.nativeRuntime?.vrmRendererStatus ?? "not-required",
      lastSessionNativeRuntimeVrmRendererBackend: diagnostics.session.lastSummary?.nativeRuntime?.vrmRendererBackend ?? "none",
      lastSessionNativeRuntimeVrmModelLoadedCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmModelLoadedCount ?? 0,
      lastSessionNativeRuntimeVrmModelVersions: diagnostics.session.lastSummary?.nativeRuntime?.vrmModelVersions ?? [],
      lastSessionNativeRuntimeVrmHumanoidBoneCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmHumanoidBoneCount ?? 0,
      lastSessionNativeRuntimeVrmExpressionCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmExpressionCount ?? 0,
      lastSessionNativeRuntimeVrmMeshPrimitiveCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmMeshPrimitiveCount ?? 0,
      lastSessionNativeRuntimeVrmSkinnedMeshPrimitiveCount:
        diagnostics.session.lastSummary?.nativeRuntime?.vrmSkinnedMeshPrimitiveCount ?? 0,
      lastSessionNativeRuntimeVrmSkinJointCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmSkinJointCount ?? 0,
      lastSessionNativeRuntimeVrmPositionAccessorCount:
        diagnostics.session.lastSummary?.nativeRuntime?.vrmPositionAccessorCount ?? 0,
      lastSessionNativeRuntimeVrmVertexCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmVertexCount ?? 0,
      lastSessionNativeRuntimeVrmIndexCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmIndexCount ?? 0,
      lastSessionNativeRuntimeVrmBoundsAccessorCount:
        diagnostics.session.lastSummary?.nativeRuntime?.vrmBoundsAccessorCount ?? 0,
      lastSessionNativeRuntimeVrmSkinningAttributePrimitiveCount:
        diagnostics.session.lastSummary?.nativeRuntime?.vrmSkinningAttributePrimitiveCount ?? 0,
      lastSessionNativeRuntimeVrmTrianglePrimitiveCount:
        diagnostics.session.lastSummary?.nativeRuntime?.vrmTrianglePrimitiveCount ?? 0,
      lastSessionNativeRuntimeVrmUnsupportedPrimitiveModeCount:
        diagnostics.session.lastSummary?.nativeRuntime?.vrmUnsupportedPrimitiveModeCount ?? 0,
      lastSessionNativeRuntimeVrmNormalAccessorCount:
        diagnostics.session.lastSummary?.nativeRuntime?.vrmNormalAccessorCount ?? 0,
      lastSessionNativeRuntimeVrmTexcoordAccessorCount:
        diagnostics.session.lastSummary?.nativeRuntime?.vrmTexcoordAccessorCount ?? 0,
      lastSessionNativeRuntimeVrmMorphTargetCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmMorphTargetCount ?? 0,
      lastSessionNativeRuntimeVrmMaterialCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmMaterialCount ?? 0,
      lastSessionNativeRuntimeVrmTextureCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmTextureCount ?? 0,
      lastSessionNativeRuntimeVrmImageCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmImageCount ?? 0,
      lastSessionNativeRuntimeVrmUnsupportedImageMimeCount:
        diagnostics.session.lastSummary?.nativeRuntime?.vrmUnsupportedImageMimeCount ?? 0,
      lastSessionNativeRuntimeVrmTransparentMaterialCount:
        diagnostics.session.lastSummary?.nativeRuntime?.vrmTransparentMaterialCount ?? 0,
      lastSessionNativeRuntimeVrmPoseBoneCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmPoseBoneCount ?? 0,
      lastSessionNativeRuntimeVrmPoseBoneAppliedCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmPoseBoneAppliedCount ?? 0,
      lastSessionNativeRuntimeVrmPoseBoneUnsupportedCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmPoseBoneUnsupportedCount ?? 0,
      lastSessionNativeRuntimeVrmPoseExpressionCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmPoseExpressionCount ?? 0,
      lastSessionNativeRuntimeVrmPoseExpressionAppliedCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmPoseExpressionAppliedCount ?? 0,
      lastSessionNativeRuntimeVrmPoseExpressionUnsupportedCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmPoseExpressionUnsupportedCount ?? 0,
      lastSessionNativeRuntimeVrmRenderedSourceCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmRenderedSourceCount ?? 0,
      lastSessionNativeRuntimeVrmRenderMissingCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmRenderMissingCount ?? 0,
      lastSessionNativeRuntimeVrmRenderFailureCount: diagnostics.session.lastSummary?.nativeRuntime?.vrmRenderFailureCount ?? 0,
      audioMonitorRouteStatus: diagnostics.audio.monitorSafety.status,
      audioMonitorRouteOutputName: diagnostics.audio.monitorSafety.outputName,
      audioMonitorRouteHeadphonesConnected: diagnostics.audio.monitorSafety.headphonesConnected,
      audioMonitorRouteStale: diagnostics.audio.monitorSafety.stale,
      validationStatus: diagnostics.validation.status,
      validationPendingCount: diagnostics.validation.pendingCount,
      validationWarningCount: diagnostics.validation.warningCount,
      validationFailCount: diagnostics.validation.failCount,
      validationRunbookStatus: diagnostics.validationRunbook.status,
      validationRunbookPendingCount: diagnostics.validationRunbook.pendingCount,
      validationRunbookWarningCount: diagnostics.validationRunbook.warningCount,
      validationRunbookFailCount: diagnostics.validationRunbook.failCount,
      validationRunbookNextAction: diagnostics.validationRunbook.nextAction,
      rehearsalStatus: diagnostics.rehearsal.status,
      rehearsalCanPromoteToPublic: diagnostics.rehearsal.canPromoteToPublic,
      rehearsalScore: diagnostics.rehearsal.score,
      rehearsalGrade: diagnostics.rehearsal.grade,
      rehearsalWeakAreaCount: diagnostics.rehearsal.weakAreaCount,
      rehearsalSummary: diagnostics.rehearsal.summary,
      rehearsalPrimaryAction: diagnostics.rehearsal.primaryAction,
      rehearsalPendingCount: diagnostics.rehearsal.pendingCount,
      rehearsalWarningCount: diagnostics.rehearsal.warningCount,
      rehearsalFailCount: diagnostics.rehearsal.failCount,
      validationEvidenceStatus: diagnostics.validationEvidence.status,
      validationEvidenceFingerprint: diagnostics.validationEvidence.fingerprint,
      validationEvidenceLatestRunFingerprint: diagnostics.validationEvidence.latestRun?.fingerprint ?? null,
      validationEvidenceRunManifest: diagnostics.validationEvidence.runManifest,
      validationEvidenceRunCount: diagnostics.validationEvidence.totalRuns,
      validationEvidenceEligibleRunCount: diagnostics.validationEvidence.eligibleRunCount,
      validationEvidenceStaleRunCount: diagnostics.validationEvidence.staleRunCount,
      validationEvidencePassCount: diagnostics.validationEvidence.passCount,
      validationEvidenceFailureCount: diagnostics.validationEvidence.failureCount,
      validationEvidencePhysicalDeviceRunCount: diagnostics.validationEvidence.physicalDeviceRunCount,
      validationEvidencePhysicalDeviceReadyCount: diagnostics.validationEvidence.physicalDeviceReadyCount,
      validationEvidencePhysicalDeviceWarningCount: diagnostics.validationEvidence.physicalDeviceWarningCount,
      validationEvidencePhysicalDeviceFailureCount: diagnostics.validationEvidence.physicalDeviceFailureCount,
      validationEvidencePhysicalDeviceIosPass: diagnostics.validationEvidence.physicalDeviceIosPass,
      validationEvidencePhysicalDeviceAndroidPass: diagnostics.validationEvidence.physicalDeviceAndroidPass,
      validationEvidenceNativeRuntimeRunCount: diagnostics.validationEvidence.nativeRuntimeRunCount,
      validationEvidenceNativeRuntimeReadyCount: diagnostics.validationEvidence.nativeRuntimeReadyCount,
      validationEvidenceNativeRuntimeWarningCount: diagnostics.validationEvidence.nativeRuntimeWarningCount,
      validationEvidenceNativeRuntimeFailureCount: diagnostics.validationEvidence.nativeRuntimeFailureCount,
      validationEvidenceNativeRuntimeIosPass: diagnostics.validationEvidence.nativeRuntimeIosPass,
      validationEvidenceNativeRuntimeAndroidPass: diagnostics.validationEvidence.nativeRuntimeAndroidPass,
      validationEvidenceMonitorHoldRunCount: diagnostics.validationEvidence.monitorHoldRunCount,
      validationEvidenceMonitorHoldReadyCount: diagnostics.validationEvidence.monitorHoldReadyCount,
      validationEvidenceMonitorHoldWarningCount: diagnostics.validationEvidence.monitorHoldWarningCount,
      validationEvidenceMonitorHoldFailureCount: diagnostics.validationEvidence.monitorHoldFailureCount,
      validationEvidenceMonitorHoldIosPass: diagnostics.validationEvidence.monitorHoldIosPass,
      validationEvidenceMonitorHoldAndroidPass: diagnostics.validationEvidence.monitorHoldAndroidPass,
      validationEvidenceLatestMonitorHoldStatus: diagnostics.validationEvidence.latestMonitorHold?.status ?? null,
      validationEvidenceLatestMonitorHoldSampleCount: diagnostics.validationEvidence.latestMonitorHold?.sampleCount ?? 0,
      validationEvidenceLatestMonitorHoldDurationSeconds: diagnostics.validationEvidence.latestMonitorHold?.durationSeconds ?? 0,
      validationEvidenceLatestMonitorHoldStability: diagnostics.validationEvidence.latestMonitorHold?.stability ?? null,
      validationEvidenceLatestMonitorHoldAverageBitrateKbps: diagnostics.validationEvidence.latestMonitorHold?.averageBitrateKbps ?? 0,
      validationEvidenceLatestMonitorHoldMinimumBitrateKbps: diagnostics.validationEvidence.latestMonitorHold?.minimumBitrateKbps ?? 0,
      validationEvidenceLatestMonitorHoldAverageFps: diagnostics.validationEvidence.latestMonitorHold?.averageFps ?? 0,
      validationEvidenceLatestMonitorHoldMinimumFps: diagnostics.validationEvidence.latestMonitorHold?.minimumFps ?? 0,
      validationEvidenceLatestMonitorHoldDroppedFrameIncrease: diagnostics.validationEvidence.latestMonitorHold?.droppedFrameIncrease ?? 0,
      validationEvidenceLatestMonitorHoldObservedReconnectAttempts: diagnostics.validationEvidence.latestMonitorHold?.observedReconnectAttempts ?? 0,
      validationEvidenceLatestNativeRuntimeStatus: diagnostics.validationEvidence.latestNativeRuntime?.status ?? null,
      validationEvidenceLatestNativeRuntimePlatform: diagnostics.validationEvidence.latestNativeRuntime?.platform ?? null,
      validationEvidenceLatestNativeRuntimeCongested: diagnostics.validationEvidence.latestNativeRuntime?.congested ?? false,
      validationEvidenceLatestNativeRuntimeQueuedItems: diagnostics.validationEvidence.latestNativeRuntime?.queuedItems ?? 0,
      validationEvidenceLatestNativeRuntimeCacheSize: diagnostics.validationEvidence.latestNativeRuntime?.cacheSize ?? 0,
      validationEvidenceLatestNativeRuntimeSentVideoFrames: diagnostics.validationEvidence.latestNativeRuntime?.sentVideoFrames ?? 0,
      validationEvidenceLatestNativeRuntimeSentAudioFrames: diagnostics.validationEvidence.latestNativeRuntime?.sentAudioFrames ?? 0,
      validationEvidenceLatestNativeRuntimeBytesWritten: diagnostics.validationEvidence.latestNativeRuntime?.bytesWritten ?? 0,
      validationEvidenceLatestNativeRuntimeVideoFrameIntervalSampleCount:
        diagnostics.validationEvidence.latestNativeRuntime?.videoFrameIntervalSampleCount ?? 0,
      validationEvidenceLatestNativeRuntimeVideoFrameIntervalAverageMs:
        diagnostics.validationEvidence.latestNativeRuntime?.videoFrameIntervalAverageMs ?? 0,
      validationEvidenceLatestNativeRuntimeVideoFrameIntervalMaxMs:
        diagnostics.validationEvidence.latestNativeRuntime?.videoFrameIntervalMaxMs ?? 0,
      validationEvidenceLatestNativeRuntimeVideoFrameIntervalJitterMs:
        diagnostics.validationEvidence.latestNativeRuntime?.videoFrameIntervalJitterMs ?? 0,
      validationEvidenceLatestNativeRuntimeCompositionAppliedCount:
        diagnostics.validationEvidence.latestNativeRuntime?.compositionAppliedCount ?? 0,
      validationEvidenceLatestNativeRuntimeCompositionSkippedCount:
        diagnostics.validationEvidence.latestNativeRuntime?.compositionSkippedCount ?? 0,
      validationEvidenceLatestNativeRuntimeCompositionSkippedKinds:
        diagnostics.validationEvidence.latestNativeRuntime?.compositionSkippedKinds ?? [],
      validationEvidenceLatestNativeRuntimeStillImageAssetCount: diagnostics.validationEvidence.latestNativeRuntime?.stillImageAssetCount ?? 0,
      validationEvidenceLatestNativeRuntimeStillImageAssetLoadedCount: diagnostics.validationEvidence.latestNativeRuntime?.stillImageAssetLoadedCount ?? 0,
      validationEvidenceLatestNativeRuntimeStillImageAssetMissingCount: diagnostics.validationEvidence.latestNativeRuntime?.stillImageAssetMissingCount ?? 0,
      validationEvidenceLatestNativeRuntimeStillImageAssetDecodedCount:
        diagnostics.validationEvidence.latestNativeRuntime?.stillImageAssetDecodedCount ?? 0,
      validationEvidenceLatestNativeRuntimeStillImageAssetDecodedPixelCount:
        diagnostics.validationEvidence.latestNativeRuntime?.stillImageAssetDecodedPixelCount ?? 0,
      validationEvidenceLatestNativeRuntimeStillImageAssetCompositedCount:
        diagnostics.validationEvidence.latestNativeRuntime?.stillImageAssetCompositedCount ?? 0,
      validationEvidenceLatestNativeRuntimeStillImageAssetCompositedPixelCount:
        diagnostics.validationEvidence.latestNativeRuntime?.stillImageAssetCompositedPixelCount ?? 0,
      validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupCount:
        diagnostics.validationEvidence.latestNativeRuntime?.stillImageAssetAppGroupCount ?? 0,
      validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupLoadedCount:
        diagnostics.validationEvidence.latestNativeRuntime?.stillImageAssetAppGroupLoadedCount ?? 0,
      validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupDecodedCount:
        diagnostics.validationEvidence.latestNativeRuntime?.stillImageAssetAppGroupDecodedCount ?? 0,
      validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupDecodedPixelCount:
        diagnostics.validationEvidence.latestNativeRuntime?.stillImageAssetAppGroupDecodedPixelCount ?? 0,
      validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupCompositedCount:
        diagnostics.validationEvidence.latestNativeRuntime?.stillImageAssetAppGroupCompositedCount ?? 0,
      validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupCompositedPixelCount:
        diagnostics.validationEvidence.latestNativeRuntime?.stillImageAssetAppGroupCompositedPixelCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmSourceCount: diagnostics.validationEvidence.latestNativeRuntime?.vrmSourceCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmPosePayloadCount: diagnostics.validationEvidence.latestNativeRuntime?.vrmPosePayloadCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmActivePoseCount: diagnostics.validationEvidence.latestNativeRuntime?.vrmActivePoseCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmMissingPoseCount: diagnostics.validationEvidence.latestNativeRuntime?.vrmMissingPoseCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmRendererStatus: diagnostics.validationEvidence.latestNativeRuntime?.vrmRendererStatus ?? "not-required",
      validationEvidenceLatestNativeRuntimeVrmRendererBackend: diagnostics.validationEvidence.latestNativeRuntime?.vrmRendererBackend ?? "none",
      validationEvidenceLatestNativeRuntimeVrmModelLoadedCount: diagnostics.validationEvidence.latestNativeRuntime?.vrmModelLoadedCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmModelVersions: diagnostics.validationEvidence.latestNativeRuntime?.vrmModelVersions ?? [],
      validationEvidenceLatestNativeRuntimeVrmHumanoidBoneCount: diagnostics.validationEvidence.latestNativeRuntime?.vrmHumanoidBoneCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmExpressionCount: diagnostics.validationEvidence.latestNativeRuntime?.vrmExpressionCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmMeshPrimitiveCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmMeshPrimitiveCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmSkinnedMeshPrimitiveCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmSkinnedMeshPrimitiveCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmSkinJointCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmSkinJointCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmPositionAccessorCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmPositionAccessorCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmVertexCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmVertexCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmIndexCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmIndexCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmBoundsAccessorCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmBoundsAccessorCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmSkinningAttributePrimitiveCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmSkinningAttributePrimitiveCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmTrianglePrimitiveCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmTrianglePrimitiveCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmUnsupportedPrimitiveModeCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmUnsupportedPrimitiveModeCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmNormalAccessorCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmNormalAccessorCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmTexcoordAccessorCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmTexcoordAccessorCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmMorphTargetCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmMorphTargetCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmMaterialCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmMaterialCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmTextureCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmTextureCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmImageCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmImageCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmUnsupportedImageMimeCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmUnsupportedImageMimeCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmTransparentMaterialCount:
        diagnostics.validationEvidence.latestNativeRuntime?.vrmTransparentMaterialCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmPoseBoneCount: diagnostics.validationEvidence.latestNativeRuntime?.vrmPoseBoneCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmPoseBoneAppliedCount: diagnostics.validationEvidence.latestNativeRuntime?.vrmPoseBoneAppliedCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmPoseBoneUnsupportedCount: diagnostics.validationEvidence.latestNativeRuntime?.vrmPoseBoneUnsupportedCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmPoseExpressionCount: diagnostics.validationEvidence.latestNativeRuntime?.vrmPoseExpressionCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmPoseExpressionAppliedCount: diagnostics.validationEvidence.latestNativeRuntime?.vrmPoseExpressionAppliedCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmPoseExpressionUnsupportedCount: diagnostics.validationEvidence.latestNativeRuntime?.vrmPoseExpressionUnsupportedCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmRenderedSourceCount: diagnostics.validationEvidence.latestNativeRuntime?.vrmRenderedSourceCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmRenderMissingCount: diagnostics.validationEvidence.latestNativeRuntime?.vrmRenderMissingCount ?? 0,
      validationEvidenceLatestNativeRuntimeVrmRenderFailureCount: diagnostics.validationEvidence.latestNativeRuntime?.vrmRenderFailureCount ?? 0,
      validationEvidenceFaceTrackingRunCount: diagnostics.validationEvidence.faceTrackingRunCount,
      validationEvidenceFaceTrackingReadyCount: diagnostics.validationEvidence.faceTrackingReadyCount,
      validationEvidenceFaceTrackingWarningCount: diagnostics.validationEvidence.faceTrackingWarningCount,
      validationEvidenceFaceTrackingIosPass: diagnostics.validationEvidence.faceTrackingIosPass,
      validationEvidenceFaceTrackingAndroidPass: diagnostics.validationEvidence.faceTrackingAndroidPass,
      validationEvidenceLatestFaceTrackingStatus: diagnostics.validationEvidence.latestFaceTracking?.status ?? null,
      validationEvidenceLatestFaceTrackingRuntimeStatus: diagnostics.validationEvidence.latestFaceTracking?.runtimeStatus ?? null,
      validationEvidenceLatestFaceTrackingRuntimeAgeMs: diagnostics.validationEvidence.latestFaceTracking?.runtimeAgeMs ?? null,
      validationEvidenceLatestFaceTrackingRuntimeFresh: diagnostics.validationEvidence.latestFaceTracking?.runtimeFresh ?? false,
      validationEvidenceLatestFaceTrackingFaceLandmarkConfidence:
        diagnostics.validationEvidence.latestFaceTracking?.faceLandmarkConfidence ?? 0,
      validationEvidenceLatestFaceTrackingFaceLandmarkReady:
        diagnostics.validationEvidence.latestFaceTracking?.faceLandmarkReady ?? false,
      validationEvidenceLatestFaceTrackingPreparedPngTuberCount: diagnostics.validationEvidence.latestFaceTracking?.preparedPngTuberCount ?? 0,
      validationEvidenceLatestFaceTrackingVisibleVrmCount: diagnostics.validationEvidence.latestFaceTracking?.visibleVrmCount ?? 0,
      validationEvidenceLatestFaceTrackingNativeVrmRendererReady:
        diagnostics.validationEvidence.latestFaceTracking?.nativeVrmRendererReady ?? false,
      validationEvidenceLatestFaceTrackingActiveMotionCount: diagnostics.validationEvidence.latestFaceTracking?.activeMotionCount ?? 0,
      validationEvidenceLatestFaceTrackingRigQualityScore: diagnostics.validationEvidence.latestFaceTracking?.rigQualityScore ?? 0,
      validationEvidenceLatestFaceTrackingRigQualityGrade: diagnostics.validationEvidence.latestFaceTracking?.rigQualityGrade ?? null,
      validationEvidenceAudioRunCount: diagnostics.validationEvidence.audioRunCount,
      validationEvidenceAudioReadyCount: diagnostics.validationEvidence.audioReadyCount,
      validationEvidenceAudioWarningCount: diagnostics.validationEvidence.audioWarningCount,
      validationEvidenceAudioIosPass: diagnostics.validationEvidence.audioIosPass,
      validationEvidenceAudioAndroidPass: diagnostics.validationEvidence.audioAndroidPass,
      validationEvidenceLatestAudioStatus: diagnostics.validationEvidence.latestAudio?.status ?? null,
      validationEvidenceLatestAudioPresetId: diagnostics.validationEvidence.latestAudio?.presetId ?? null,
      validationEvidenceLatestAudioMonitorEnabled: diagnostics.validationEvidence.latestAudio?.monitorEnabled ?? false,
      validationEvidenceLatestAudioMonitorHeadphonesOnly: diagnostics.validationEvidence.latestAudio?.monitorHeadphonesOnly ?? false,
      validationEvidenceLatestAudioMonitorRouteStatus: diagnostics.validationEvidence.latestAudio?.monitorRouteStatus ?? null,
      validationEvidenceLatestAudioOutputName: diagnostics.validationEvidence.latestAudio?.outputName ?? null,
      validationEvidenceLatestAudioHeadphonesConnected: diagnostics.validationEvidence.latestAudio?.headphonesConnected ?? false,
      validationEvidenceLatestAudioRouteStale: diagnostics.validationEvidence.latestAudio?.routeStale ?? false,
      validationEvidenceLatestAudioNativeMonitorReported: diagnostics.validationEvidence.latestAudio?.nativeMonitorReported ?? false,
      validationEvidenceLatestAudioNativeMonitorRunning: diagnostics.validationEvidence.latestAudio?.nativeMonitorRunning ?? false,
      validationEvidenceLatestAudioNativeMonitorWrittenFrames: diagnostics.validationEvidence.latestAudio?.nativeMonitorWrittenFrames ?? 0,
      validationEvidenceLatestAudioNativeMonitorDroppedFrames: diagnostics.validationEvidence.latestAudio?.nativeMonitorDroppedFrames ?? 0,
      validationEvidenceLatestAudioNativeMonitorWrittenBuffers: diagnostics.validationEvidence.latestAudio?.nativeMonitorWrittenBuffers ?? 0,
      validationEvidenceLatestAudioNativeMonitorDroppedBuffers: diagnostics.validationEvidence.latestAudio?.nativeMonitorDroppedBuffers ?? 0,
      validationEvidenceLatestAudioNativeMonitorOutputName: diagnostics.validationEvidence.latestAudio?.nativeMonitorOutputName ?? null,
      validationEvidenceLatestAudioMonitorLatencyStatus: diagnostics.validationEvidence.latestAudio?.monitorLatencyStatus ?? null,
      validationEvidenceLatestAudioMonitorLatencyMs: diagnostics.validationEvidence.latestAudio?.monitorLatencyMs ?? null,
      validationEvidenceLatestAudioMonitorLatencyBudgetMs: diagnostics.validationEvidence.latestAudio?.monitorLatencyBudgetMs ?? 0,
      validationEvidenceLatestAudioMonitorLatencySource: diagnostics.validationEvidence.latestAudio?.monitorLatencySource || null,
      validationEvidenceLatestAudioBluetoothRoute: diagnostics.validationEvidence.latestAudio?.bluetoothRoute ?? false,
      validationEvidenceLatestAudioBluetoothTuningReviewed: diagnostics.validationEvidence.latestAudio?.bluetoothTuningReviewed ?? false,
      validationEvidenceLatestAudioMonitorTuningNote: diagnostics.validationEvidence.latestAudio?.monitorTuningNote || null,
      validationEvidenceLatestAudioLevelSampleCount: diagnostics.validationEvidence.latestAudio?.levelSampleCount ?? 0,
      validationEvidenceLatestAudioPeakLevel: diagnostics.validationEvidence.latestAudio?.peakLevel ?? 0,
      validationEvidenceLatestAudioClippedLevelCount: diagnostics.validationEvidence.latestAudio?.clippedLevelCount ?? 0,
      validationEvidenceChatReadoutRunCount: diagnostics.validationEvidence.chatReadoutRunCount,
      validationEvidenceChatReadoutReadyCount: diagnostics.validationEvidence.chatReadoutReadyCount,
      validationEvidenceChatReadoutWarningCount: diagnostics.validationEvidence.chatReadoutWarningCount,
      validationEvidenceChatReadoutIosPass: diagnostics.validationEvidence.chatReadoutIosPass,
      validationEvidenceChatReadoutAndroidPass: diagnostics.validationEvidence.chatReadoutAndroidPass,
      validationEvidenceLatestChatReadoutStatus: diagnostics.validationEvidence.latestChatReadout?.status ?? null,
      validationEvidenceLatestChatReadoutConnectionPhase: diagnostics.validationEvidence.latestChatReadout?.connectionPhase ?? null,
      validationEvidenceLatestChatReadoutSpokenMessageCount: diagnostics.validationEvidence.latestChatReadout?.spokenMessageCount ?? 0,
      validationEvidenceLatestChatReadoutSpeechFailureCount: diagnostics.validationEvidence.latestChatReadout?.speechFailureCount ?? 0,
      validationEvidenceQualityAutomationRunCount: diagnostics.validationEvidence.qualityAutomationRunCount,
      validationEvidenceQualityAutomationLiveUpdateCount: diagnostics.validationEvidence.qualityAutomationLiveUpdateCount,
      validationEvidenceQualityAutomationNextTargetCount: diagnostics.validationEvidence.qualityAutomationNextTargetCount,
      validationEvidenceQualityAutomationFailureCount: diagnostics.validationEvidence.qualityAutomationFailureCount,
      validationEvidenceLatestQualityAutomationStatus: diagnostics.validationEvidence.latestQualityAutomation?.status ?? null,
      validationEvidenceLatestQualityAutomationSummary: diagnostics.validationEvidence.latestQualityAutomation?.summary ?? null,
      validationEvidencePlatformPublishingRunCount: diagnostics.validationEvidence.platformPublishingRunCount,
      validationEvidencePlatformPublishingReadyCount: diagnostics.validationEvidence.platformPublishingReadyCount,
      validationEvidencePlatformPublishingFreshCount: diagnostics.validationEvidence.platformPublishingFreshCount,
      validationEvidencePlatformPublishingFreshnessWarningCount: diagnostics.validationEvidence.platformPublishingFreshnessWarningCount,
      validationEvidencePlatformPublishingWarningCount: diagnostics.validationEvidence.platformPublishingWarningCount,
      validationEvidencePlatformPublishingFailureCount: diagnostics.validationEvidence.platformPublishingFailureCount,
      validationEvidencePlatformPublishingIosPass: diagnostics.validationEvidence.platformPublishingIosPass,
      validationEvidencePlatformPublishingAndroidPass: diagnostics.validationEvidence.platformPublishingAndroidPass,
      validationEvidencePlatformIngestRunCount: diagnostics.validationEvidence.platformIngestRunCount,
      validationEvidencePlatformIngestReadyCount: diagnostics.validationEvidence.platformIngestReadyCount,
      validationEvidencePlatformIngestWarningCount: diagnostics.validationEvidence.platformIngestWarningCount,
      validationEvidencePlatformIngestFailureCount: diagnostics.validationEvidence.platformIngestFailureCount,
      validationEvidencePlatformIngestIosPass: diagnostics.validationEvidence.platformIngestIosPass,
      validationEvidencePlatformIngestAndroidPass: diagnostics.validationEvidence.platformIngestAndroidPass,
      validationEvidenceLatestPlatformPublishingStatus: diagnostics.validationEvidence.latestPlatformPublishing?.status ?? null,
      validationEvidenceLatestPlatformPublishingSummary: diagnostics.validationEvidence.latestPlatformPublishing?.summary ?? null,
      validationEvidencePlatformPublishingFreshnessStatus: validationEvidencePlatformPublishingFreshness?.status ?? null,
      validationEvidencePlatformPublishingFreshnessAgeMinutes: validationEvidencePlatformPublishingFreshness?.ageMinutes ?? null,
      validationEvidencePlatformPublishingFreshnessSummary: validationEvidencePlatformPublishingFreshness?.summary ?? null,
      validationEvidencePlatformPublishingFreshnessRecommendation: validationEvidencePlatformPublishingFreshness?.recommendation ?? null,
      validationEvidenceIosPass: diagnostics.validationEvidence.iosPass,
      validationEvidenceAndroidPass: diagnostics.validationEvidence.androidPass,
      validationEvidenceAppBuildMismatch: diagnostics.validationEvidence.appBuildMismatch,
      validationEvidenceConsistentAppBuild: diagnostics.validationEvidence.consistentAppBuild,
      qualityAdvisorAction: diagnostics.qualityAdvisor.action,
      qualityAdvisorSeverity: diagnostics.qualityAdvisor.severity,
      suggestedQualityTarget: diagnostics.qualityAdvisor.suggestedTarget
        ? formatQualityAdvisorTarget(diagnostics.qualityAdvisor.suggestedTarget)
        : null,
      faceTrackingStatus: diagnostics.faceTracking.status,
      faceTrackingRuntimeStatus: diagnostics.faceTracking.runtimeStatus,
      faceTrackingRuntimeAgeMs: diagnostics.faceTracking.runtimeAgeMs,
      faceTrackingRuntimeFresh: diagnostics.faceTracking.runtimeFresh,
      faceTrackingFaceLandmarkConfidence: diagnostics.faceTracking.faceLandmarkConfidence ?? 0,
      faceTrackingFaceLandmarkReady: diagnostics.faceTracking.faceLandmarkReady ?? false,
      faceTrackingPreparedPngTuberCount: diagnostics.faceTracking.preparedPngTuberCount,
      faceTrackingVisibleVrmCount: diagnostics.faceTracking.visibleVrmCount,
      faceTrackingNativeVrmRendererReady: diagnostics.faceTracking.nativeVrmRendererReady,
      faceTrackingActiveMotionCount: diagnostics.faceTracking.activeMotionCount,
      faceTrackingRigIssueCount: diagnostics.faceTracking.rigIssueCount,
      faceTrackingRigIssueSummary: diagnostics.faceTracking.rigIssueSummary,
      faceTrackingRigQualityScore: diagnostics.faceTracking.rigQualityScore,
      faceTrackingRigQualityGrade: diagnostics.faceTracking.rigQualityGrade,
      faceTrackingRigPartSeparationScore: diagnostics.faceTracking.rigPartSeparationScore ?? 0,
      faceTrackingRigDepthContinuityScore: diagnostics.faceTracking.rigDepthContinuityScore ?? 0,
      faceTrackingRigHighFidelityScore: diagnostics.faceTracking.rigHighFidelityScore ?? 0,
      faceTrackingRigHighFidelityGrade: diagnostics.faceTracking.rigHighFidelityGrade ?? "blocked",
      faceTrackingSummary: diagnostics.faceTracking.summary,
      faceTrackingRecommendation: diagnostics.faceTracking.recommendation,
      nativeCompositionStatus: diagnostics.nativeComposition.status,
      nativeCompositionCoverage: diagnostics.nativeComposition.coverage,
      nativeCompositionPreviewOnlySourceCount: diagnostics.nativeComposition.previewOnlySourceCount,
      nativeCompositionAssetIssueCount: diagnostics.nativeComposition.assetIssueCount,
      nativeCompositionFileBackedAssetIssueCount: diagnostics.nativeComposition.fileBackedAssetIssueCount,
      nativeCompositionRequiresCompositor: diagnostics.nativeComposition.requiresNativeCompositor,
      nativeRuntimePlatform: diagnostics.nativeRuntime?.platform ?? null,
      nativeRuntimeStatus: diagnostics.nativeRuntime?.runtimeStatus ?? null,
      nativeRuntimePublisherState: diagnostics.nativeRuntime?.publisher.state ?? null,
      nativeRuntimeCompositionStatus: diagnostics.nativeRuntime?.composition.status ?? null,
      nativeRuntimeCompositionAppliedCount: diagnostics.nativeRuntime?.composition.appliedCount ?? 0,
      nativeRuntimeCompositionSkippedCount: diagnostics.nativeRuntime?.composition.skippedCount ?? 0,
      nativeRuntimeCompositionSkippedKinds: diagnostics.nativeRuntime?.composition.skippedKinds ?? [],
      nativeRuntimeStillImageAssetCount: diagnostics.nativeRuntime?.composition.stillImageAssetCount ?? 0,
      nativeRuntimeStillImageAssetLoadedCount: diagnostics.nativeRuntime?.composition.stillImageAssetLoadedCount ?? 0,
      nativeRuntimeStillImageAssetMissingCount: diagnostics.nativeRuntime?.composition.stillImageAssetMissingCount ?? 0,
      nativeRuntimeStillImageAssetDecodedCount: diagnostics.nativeRuntime?.composition.stillImageAssetDecodedCount ?? 0,
      nativeRuntimeStillImageAssetDecodedPixelCount: diagnostics.nativeRuntime?.composition.stillImageAssetDecodedPixelCount ?? 0,
      nativeRuntimeStillImageAssetCompositedCount: diagnostics.nativeRuntime?.composition.stillImageAssetCompositedCount ?? 0,
      nativeRuntimeStillImageAssetCompositedPixelCount: diagnostics.nativeRuntime?.composition.stillImageAssetCompositedPixelCount ?? 0,
      nativeRuntimeStillImageAssetAppGroupCount: diagnostics.nativeRuntime?.composition.stillImageAssetAppGroupCount ?? 0,
      nativeRuntimeStillImageAssetAppGroupLoadedCount: diagnostics.nativeRuntime?.composition.stillImageAssetAppGroupLoadedCount ?? 0,
      nativeRuntimeStillImageAssetAppGroupDecodedCount: diagnostics.nativeRuntime?.composition.stillImageAssetAppGroupDecodedCount ?? 0,
      nativeRuntimeStillImageAssetAppGroupDecodedPixelCount:
        diagnostics.nativeRuntime?.composition.stillImageAssetAppGroupDecodedPixelCount ?? 0,
      nativeRuntimeStillImageAssetAppGroupCompositedCount:
        diagnostics.nativeRuntime?.composition.stillImageAssetAppGroupCompositedCount ?? 0,
      nativeRuntimeStillImageAssetAppGroupCompositedPixelCount:
        diagnostics.nativeRuntime?.composition.stillImageAssetAppGroupCompositedPixelCount ?? 0,
      nativeRuntimeVrmSourceCount,
      nativeRuntimeVrmPosePayloadCount: diagnostics.nativeRuntime?.composition.vrmPosePayloadCount ?? 0,
      nativeRuntimeVrmActivePoseCount: diagnostics.nativeRuntime?.composition.vrmActivePoseCount ?? 0,
      nativeRuntimeVrmMissingPoseCount: diagnostics.nativeRuntime?.composition.vrmMissingPoseCount ?? 0,
      nativeRuntimeVrmRendererStatus,
      nativeRuntimeVrmRendererBackend: diagnostics.nativeRuntime?.composition.vrmRendererBackend ?? "none",
      nativeRuntimeVrmModelLoadedCount: diagnostics.nativeRuntime?.composition.vrmModelLoadedCount ?? 0,
      nativeRuntimeVrmModelVersions: diagnostics.nativeRuntime?.composition.vrmModelVersions ?? [],
      nativeRuntimeVrmHumanoidBoneCount: diagnostics.nativeRuntime?.composition.vrmHumanoidBoneCount ?? 0,
      nativeRuntimeVrmExpressionCount: diagnostics.nativeRuntime?.composition.vrmExpressionCount ?? 0,
      nativeRuntimeVrmMeshPrimitiveCount: diagnostics.nativeRuntime?.composition.vrmMeshPrimitiveCount ?? 0,
      nativeRuntimeVrmSkinnedMeshPrimitiveCount: diagnostics.nativeRuntime?.composition.vrmSkinnedMeshPrimitiveCount ?? 0,
      nativeRuntimeVrmSkinJointCount: diagnostics.nativeRuntime?.composition.vrmSkinJointCount ?? 0,
      nativeRuntimeVrmPositionAccessorCount: diagnostics.nativeRuntime?.composition.vrmPositionAccessorCount ?? 0,
      nativeRuntimeVrmVertexCount: diagnostics.nativeRuntime?.composition.vrmVertexCount ?? 0,
      nativeRuntimeVrmIndexCount: diagnostics.nativeRuntime?.composition.vrmIndexCount ?? 0,
      nativeRuntimeVrmBoundsAccessorCount: diagnostics.nativeRuntime?.composition.vrmBoundsAccessorCount ?? 0,
      nativeRuntimeVrmSkinningAttributePrimitiveCount:
        diagnostics.nativeRuntime?.composition.vrmSkinningAttributePrimitiveCount ?? 0,
      nativeRuntimeVrmTrianglePrimitiveCount: diagnostics.nativeRuntime?.composition.vrmTrianglePrimitiveCount ?? 0,
      nativeRuntimeVrmUnsupportedPrimitiveModeCount:
        diagnostics.nativeRuntime?.composition.vrmUnsupportedPrimitiveModeCount ?? 0,
      nativeRuntimeVrmNormalAccessorCount: diagnostics.nativeRuntime?.composition.vrmNormalAccessorCount ?? 0,
      nativeRuntimeVrmTexcoordAccessorCount: diagnostics.nativeRuntime?.composition.vrmTexcoordAccessorCount ?? 0,
      nativeRuntimeVrmMorphTargetCount: diagnostics.nativeRuntime?.composition.vrmMorphTargetCount ?? 0,
      nativeRuntimeVrmMaterialCount: diagnostics.nativeRuntime?.composition.vrmMaterialCount ?? 0,
      nativeRuntimeVrmTextureCount: diagnostics.nativeRuntime?.composition.vrmTextureCount ?? 0,
      nativeRuntimeVrmImageCount: diagnostics.nativeRuntime?.composition.vrmImageCount ?? 0,
      nativeRuntimeVrmUnsupportedImageMimeCount: diagnostics.nativeRuntime?.composition.vrmUnsupportedImageMimeCount ?? 0,
      nativeRuntimeVrmTransparentMaterialCount: diagnostics.nativeRuntime?.composition.vrmTransparentMaterialCount ?? 0,
      nativeRuntimeVrmPoseBoneCount: diagnostics.nativeRuntime?.composition.vrmPoseBoneCount ?? 0,
      nativeRuntimeVrmPoseBoneAppliedCount: diagnostics.nativeRuntime?.composition.vrmPoseBoneAppliedCount ?? 0,
      nativeRuntimeVrmPoseBoneUnsupportedCount: diagnostics.nativeRuntime?.composition.vrmPoseBoneUnsupportedCount ?? 0,
      nativeRuntimeVrmPoseExpressionCount: diagnostics.nativeRuntime?.composition.vrmPoseExpressionCount ?? 0,
      nativeRuntimeVrmPoseExpressionAppliedCount: diagnostics.nativeRuntime?.composition.vrmPoseExpressionAppliedCount ?? 0,
      nativeRuntimeVrmPoseExpressionUnsupportedCount: diagnostics.nativeRuntime?.composition.vrmPoseExpressionUnsupportedCount ?? 0,
      nativeRuntimeVrmRenderedSourceCount,
      nativeRuntimeVrmRenderMissingCount: nativeRuntimeVrmRenderMissingCount,
      nativeRuntimeVrmRenderFailureCount: diagnostics.nativeRuntime?.composition.vrmRenderFailureCount ?? 0,
      nativeRuntimeStale: diagnostics.nativeRuntime?.stale ?? false,
      nativeRuntimeCongested: diagnostics.nativeRuntime?.publisher.congested ?? false,
      nativeRuntimeQueuedItems: diagnostics.nativeRuntime?.publisher.itemsInCache ?? 0,
      nativeRuntimeCacheSize: diagnostics.nativeRuntime?.publisher.cacheSize ?? 0,
      platformPublishingFreshnessStatus: platformPublishingFreshness.status,
      platformPublishingFreshnessAgeMinutes: platformPublishingFreshness.ageMinutes,
      platformPublishingFreshnessSummary: platformPublishingFreshness.summary,
      platformPublishingFreshnessRecommendation: platformPublishingFreshness.recommendation,
      sourceCount: scene.sources.length,
      visibleSourceCount
    },
    target: diagnostics.target,
    quality: diagnostics.quality,
    preflight,
    publicLaunchChecklist,
    diagnostics,
    scene: {
      id: scene.id,
      name: scene.name,
      canvas: scene.canvas,
      sourceCounts,
      visibleSourceCount,
      lockedSourceCount,
      emptyImageSourceCount: scene.sources.filter((source) => source.kind === "image" && !source.uri.trim()).length,
      live2dSourceCount: sourceCounts.live2d,
      sources: scene.sources.map(toSourceSummary)
    },
    profile: {
      destination: {
        platform: profile.destination.platform,
        presetId: profile.destination.presetId,
        presetName: getDestinationPreset(profile.destination.presetId)?.name ?? profile.destination.name,
        protocol: profile.destination.protocol,
        host: diagnostics.target.host,
        application: diagnostics.target.application,
        publishUrlPreview: diagnostics.target.publishUrlPreview,
        streamKeyPreview: diagnostics.target.streamKeyPreview
      },
      micEffects: { ...profile.micEffects },
      broadcastMixer: {
        mic: { ...profile.broadcastMixer.mic },
        appAudio: { ...profile.broadcastMixer.appAudio },
        chatReadout: { ...profile.broadcastMixer.chatReadout }
      },
      faceTracking: { ...profile.faceTracking },
      platformChat: {
        enabled: profile.platformChat.enabled,
        platform: profile.platformChat.platform,
        hasYouTubeLiveChatId: Boolean(profile.platformChat.youtubeLiveChatId.trim()),
        hasTwitchChannel: Boolean(profile.platformChat.twitchChannel.trim())
      },
      platformPublishing: {
        titleLength: profile.platformPublishing.title.length,
        descriptionLength: profile.platformPublishing.description.length,
        privacyStatus: profile.platformPublishing.privacyStatus,
        scheduledStartMinutesFromNow: profile.platformPublishing.scheduledStartMinutesFromNow,
        madeForKids: profile.platformPublishing.madeForKids,
        enableAutoStart: profile.platformPublishing.enableAutoStart,
        enableAutoStop: profile.platformPublishing.enableAutoStop,
        hasYouTubeStreamId: Boolean(profile.platformPublishing.youtubeStreamId.trim()),
        hasYouTubeBroadcastId: Boolean(profile.platformPublishing.youtubeBroadcastId.trim()),
        youtubeBroadcastBoundStreamId: profile.platformPublishing.youtubeBroadcastBoundStreamId,
        youtubeBroadcastStatus: profile.platformPublishing.youtubeBroadcastStatus,
        youtubeBroadcastPrivacyStatus: profile.platformPublishing.youtubeBroadcastPrivacyStatus,
        youtubeStreamStatus: profile.platformPublishing.youtubeStreamStatus,
        youtubeStreamHealthStatus: profile.platformPublishing.youtubeStreamHealthStatus,
        youtubeStreamHealthIssueCount: profile.platformPublishing.youtubeStreamHealthIssues.length,
        youtubeStatusCheckedAt: profile.platformPublishing.youtubeStatusCheckedAt,
        twitchCategory: profile.platformPublishing.twitchCategory,
        twitchCategoryId: profile.platformPublishing.twitchCategoryId,
        twitchLanguage: profile.platformPublishing.twitchLanguage,
        twitchChannelTitle: profile.platformPublishing.twitchChannelTitle,
        twitchChannelCategory: profile.platformPublishing.twitchChannelCategory,
        twitchChannelCategoryId: profile.platformPublishing.twitchChannelCategoryId,
        twitchChannelLanguage: profile.platformPublishing.twitchChannelLanguage,
        twitchLiveStatus: profile.platformPublishing.twitchLiveStatus,
        twitchViewerCount: profile.platformPublishing.twitchViewerCount,
        twitchStatusCheckedAt: profile.platformPublishing.twitchStatusCheckedAt
      }
    }
  };
};

export const serializeSupportBundle = (bundle: SupportBundle): string => JSON.stringify(bundle, null, 2);

export const formatSupportBundle = (bundle: SupportBundle): string => {
  return [
    "MobileLiveCaster Support Bundle",
    `Generated: ${bundle.generatedAt}`,
    `Status: ${bundle.summary.status}`,
    `Preflight: ${bundle.summary.preflightStatus} (${bundle.summary.launchBlockCount} blocks, ${bundle.summary.launchWarningCount} warnings)`,
    `Public launch: ${bundle.summary.publicLaunchStatus} / can start ${bundle.summary.publicLaunchCanStart ? "yes" : "no"} / lock ${bundle.summary.publicLaunchStartLockApplies ? "on" : "off"} blocked ${bundle.summary.publicLaunchStartLockBlocked ? "yes" : "no"}`,
    `Diagnostics: ${bundle.summary.diagnosticStatus} (${bundle.summary.diagnosticCheckCount} checks)`,
    "",
    "Target",
    `- Platform: ${bundle.target.platform}`,
    `- Preset: ${bundle.target.presetName}`,
    `- Protocol: ${bundle.target.protocol}`,
    `- Endpoint: ${bundle.target.host}/${bundle.target.application}`,
    `- Publish URL: ${bundle.target.publishUrlPreview}`,
    "",
    "Scene",
    `- Canvas: ${bundle.scene.canvas.width}x${bundle.scene.canvas.height} / ${bundle.scene.canvas.fps}fps`,
    `- Sources: ${bundle.summary.sourceCount} total / ${bundle.summary.visibleSourceCount} visible / ${bundle.scene.lockedSourceCount} locked`,
    `- Source counts: ${formatSourceCounts(bundle.scene.sourceCounts)}`,
    "",
    "Launch Preflight",
    `- Summary: ${bundle.preflight.summary}`,
    `- Action: ${bundle.preflight.primaryAction}`,
    ...(bundle.preflight.issues.length === 0
      ? ["- No launch preflight issues."]
      : bundle.preflight.issues.map(
          (issue) => `- [${issue.severity.toUpperCase()}] ${issue.label}: ${issue.message} Recommendation: ${issue.recommendation}`
        )),
    "",
    "Public Launch Checklist",
    `- Status: ${bundle.publicLaunchChecklist.status}`,
    `- Can start: ${bundle.publicLaunchChecklist.canStart ? "yes" : "no"}`,
    `- Start lock: ${bundle.publicLaunchChecklist.startLock.applies ? "on" : "off"} / blocked ${bundle.publicLaunchChecklist.startLock.blocked ? "yes" : "no"}`,
    `- Lock summary: ${bundle.publicLaunchChecklist.startLock.summary}`,
    `- Lock action: ${bundle.publicLaunchChecklist.startLock.action}`,
    `- Counts: ${bundle.publicLaunchChecklist.passCount} pass / ${bundle.publicLaunchChecklist.warningCount} warn / ${bundle.publicLaunchChecklist.failCount} fail`,
    `- Summary: ${bundle.publicLaunchChecklist.summary}`,
    `- Action: ${bundle.publicLaunchChecklist.primaryAction}`,
    ...bundle.publicLaunchChecklist.items.map(
      (item) => `- [${item.status.toUpperCase()}] ${item.label}: ${item.detail} Action: ${item.action}`
    ),
    "",
    "Session",
    `- Events: ${bundle.summary.sessionEventCount}`,
    `- Completed summaries: ${bundle.summary.completedSessionCount}`,
    `- History stability: ${bundle.summary.sessionHistoryStability}`,
    `- Clean rate: ${bundle.summary.sessionCleanRate}%`,
    `- Platform API history: ${bundle.summary.sessionPlatformApiEventCount} events / ${bundle.summary.sessionPlatformApiFailureCount} failed`,
    `- Chat readout history: ${bundle.summary.sessionChatEventCount} events / ${bundle.summary.sessionChatReconnectEventCount} reconnects / ${bundle.summary.sessionChatReconnectFailureCount} exhausted`,
    `- Chat speech history: ${bundle.summary.sessionChatSpeechSpokenCount} spoken / ${bundle.summary.sessionChatSpeechFailureCount} failed`,
    `- Quality automation history: ${bundle.summary.sessionQualityEventCount} events / ${bundle.summary.sessionQualityLiveUpdateCount} live updates / ${bundle.summary.sessionQualityNextTargetCount} next-start targets / ${bundle.summary.sessionQualityUpdateFailureCount} failed`,
    `- History summary: ${bundle.diagnostics.session.historySummary.summary}`,
    `- History recommendation: ${bundle.diagnostics.session.historySummary.recommendation}`,
    `- Last outcome: ${bundle.summary.lastSessionOutcome ?? "-"}`,
    `- Last platform API: ${bundle.summary.lastSessionPlatformApiEventCount} events / ${bundle.summary.lastSessionPlatformApiFailureCount} failed`,
    `- Last chat readout: ${bundle.summary.lastSessionChatEventCount} events / ${bundle.summary.lastSessionChatReconnectEventCount} reconnects / ${bundle.summary.lastSessionChatReconnectFailureCount} exhausted`,
    `- Last chat speech: ${bundle.summary.lastSessionChatSpeechSpokenCount} spoken / ${bundle.summary.lastSessionChatSpeechFailureCount} failed`,
    `- Last quality automation: ${bundle.summary.lastSessionQualityEventCount} events / ${bundle.summary.lastSessionQualityLiveUpdateCount} live updates / ${bundle.summary.lastSessionQualityNextTargetCount} next-start targets / ${bundle.summary.lastSessionQualityUpdateFailureCount} failed`,
    `- Last audio meter: ${bundle.summary.lastSessionAudioLevelSampleCount} samples / peak ${Math.round(bundle.summary.lastSessionAudioPeakLevel * 100)}% / active ${bundle.summary.lastSessionAudioActivePercent}% / clipped ${bundle.summary.lastSessionAudioClippedSampleCount}`,
    `- Last summary: ${bundle.diagnostics.session.lastSummary?.summary ?? "-"}`,
    `- Last native runtime: ${bundle.summary.lastSessionNativeRuntimeStatus ?? "-"} / ${bundle.summary.lastSessionNativeRuntimePlatform ?? "-"} / overlays applied ${bundle.summary.lastSessionNativeRuntimeCompositionAppliedCount} skipped ${bundle.summary.lastSessionNativeRuntimeCompositionSkippedCount}${formatKinds(bundle.summary.lastSessionNativeRuntimeCompositionSkippedKinds)} / assets ${bundle.summary.lastSessionNativeRuntimeStillImageAssetLoadedCount}/${bundle.summary.lastSessionNativeRuntimeStillImageAssetCount} loaded / ${bundle.summary.lastSessionNativeRuntimeStillImageAssetDecodedCount} decoded / decoded pixels ${bundle.summary.lastSessionNativeRuntimeStillImageAssetDecodedPixelCount} / ${bundle.summary.lastSessionNativeRuntimeStillImageAssetCompositedCount} composited / composited pixels ${bundle.summary.lastSessionNativeRuntimeStillImageAssetCompositedPixelCount} / app-group ${bundle.summary.lastSessionNativeRuntimeStillImageAssetAppGroupLoadedCount}/${bundle.summary.lastSessionNativeRuntimeStillImageAssetAppGroupCount} loaded / ${bundle.summary.lastSessionNativeRuntimeStillImageAssetAppGroupDecodedCount} decoded / decoded pixels ${bundle.summary.lastSessionNativeRuntimeStillImageAssetAppGroupDecodedPixelCount} / ${bundle.summary.lastSessionNativeRuntimeStillImageAssetAppGroupCompositedCount} composited / composited pixels ${bundle.summary.lastSessionNativeRuntimeStillImageAssetAppGroupCompositedPixelCount} / ${bundle.summary.lastSessionNativeRuntimeStillImageAssetMissingCount} missing / vrm ${bundle.summary.lastSessionNativeRuntimeVrmActivePoseCount}/${bundle.summary.lastSessionNativeRuntimeVrmSourceCount} active payloads ${bundle.summary.lastSessionNativeRuntimeVrmPosePayloadCount} missing ${bundle.summary.lastSessionNativeRuntimeVrmMissingPoseCount} / renderer ${bundle.summary.lastSessionNativeRuntimeVrmRendererStatus} ${bundle.summary.lastSessionNativeRuntimeVrmRendererBackend} rendered ${bundle.summary.lastSessionNativeRuntimeVrmRenderedSourceCount}/${bundle.summary.lastSessionNativeRuntimeVrmSourceCount} models ${bundle.summary.lastSessionNativeRuntimeVrmModelLoadedCount} versions ${bundle.summary.lastSessionNativeRuntimeVrmModelVersions.join("/") || "-"} bones ${bundle.summary.lastSessionNativeRuntimeVrmHumanoidBoneCount} expressions ${bundle.summary.lastSessionNativeRuntimeVrmExpressionCount} mesh primitives ${bundle.summary.lastSessionNativeRuntimeVrmMeshPrimitiveCount} triangles ${bundle.summary.lastSessionNativeRuntimeVrmTrianglePrimitiveCount} unsupported modes ${bundle.summary.lastSessionNativeRuntimeVrmUnsupportedPrimitiveModeCount} skinned ${bundle.summary.lastSessionNativeRuntimeVrmSkinnedMeshPrimitiveCount} skin joints ${bundle.summary.lastSessionNativeRuntimeVrmSkinJointCount} position accessors ${bundle.summary.lastSessionNativeRuntimeVrmPositionAccessorCount} normals ${bundle.summary.lastSessionNativeRuntimeVrmNormalAccessorCount} uvs ${bundle.summary.lastSessionNativeRuntimeVrmTexcoordAccessorCount} vertices ${bundle.summary.lastSessionNativeRuntimeVrmVertexCount} indices ${bundle.summary.lastSessionNativeRuntimeVrmIndexCount} bounds ${bundle.summary.lastSessionNativeRuntimeVrmBoundsAccessorCount} skin attrs ${bundle.summary.lastSessionNativeRuntimeVrmSkinningAttributePrimitiveCount} morphs ${bundle.summary.lastSessionNativeRuntimeVrmMorphTargetCount} materials ${bundle.summary.lastSessionNativeRuntimeVrmMaterialCount} transparent materials ${bundle.summary.lastSessionNativeRuntimeVrmTransparentMaterialCount} textures ${bundle.summary.lastSessionNativeRuntimeVrmTextureCount} images ${bundle.summary.lastSessionNativeRuntimeVrmImageCount} unsupported image mimes ${bundle.summary.lastSessionNativeRuntimeVrmUnsupportedImageMimeCount} pose bones ${bundle.summary.lastSessionNativeRuntimeVrmPoseBoneAppliedCount}/${bundle.summary.lastSessionNativeRuntimeVrmPoseBoneCount} unsupported ${bundle.summary.lastSessionNativeRuntimeVrmPoseBoneUnsupportedCount} pose expressions ${bundle.summary.lastSessionNativeRuntimeVrmPoseExpressionAppliedCount}/${bundle.summary.lastSessionNativeRuntimeVrmPoseExpressionCount} unsupported ${bundle.summary.lastSessionNativeRuntimeVrmPoseExpressionUnsupportedCount} missing ${bundle.summary.lastSessionNativeRuntimeVrmRenderMissingCount} failed ${bundle.summary.lastSessionNativeRuntimeVrmRenderFailureCount} / congested ${bundle.summary.lastSessionNativeRuntimeCongested ? "yes" : "no"} / queue ${bundle.summary.lastSessionNativeRuntimeQueuedItems}/${bundle.summary.lastSessionNativeRuntimeCacheSize}`,
    `- Last recommendation: ${bundle.diagnostics.session.lastSummary?.recommendation ?? "-"}`,
    `- Health history: ${bundle.diagnostics.history.summary}`,
    `- Quality incidents: ${bundle.diagnostics.qualityIncidents.summary}`,
    `- Quality advisor: ${bundle.summary.qualityAdvisorAction} / ${bundle.summary.qualityAdvisorSeverity}`,
    `- Suggested quality: ${bundle.summary.suggestedQualityTarget ?? "-"}`,
    `- Face tracking: ${bundle.summary.faceTrackingStatus} / runtime ${bundle.summary.faceTrackingRuntimeStatus} / age ${bundle.summary.faceTrackingRuntimeAgeMs === null ? "-" : `${bundle.summary.faceTrackingRuntimeAgeMs} ms`} / fresh ${bundle.summary.faceTrackingRuntimeFresh ? "yes" : "no"} / landmarks ${Math.round(bundle.summary.faceTrackingFaceLandmarkConfidence * 100)}% ${bundle.summary.faceTrackingFaceLandmarkReady ? "ready" : "not-ready"} / prepared PNGTuber ${bundle.summary.faceTrackingPreparedPngTuberCount} / VRM ${bundle.summary.faceTrackingVisibleVrmCount} renderer ${bundle.summary.faceTrackingNativeVrmRendererReady ? "ready" : "not-ready"} / moving ${bundle.summary.faceTrackingActiveMotionCount} / rig quality ${bundle.summary.faceTrackingRigQualityScore}/100 ${bundle.summary.faceTrackingRigQualityGrade} / rig high fidelity ${bundle.summary.faceTrackingRigHighFidelityScore}/100 ${bundle.summary.faceTrackingRigHighFidelityGrade} / parts ${bundle.summary.faceTrackingRigPartSeparationScore}/100 / depth ${bundle.summary.faceTrackingRigDepthContinuityScore}/100 / rig issues ${bundle.summary.faceTrackingRigIssueCount}`,
    `- Face tracking rig: ${bundle.summary.faceTrackingRigIssueSummary}`,
    `- Face tracking recommendation: ${bundle.summary.faceTrackingRecommendation}`,
    `- Recovery: ${bundle.diagnostics.recovery.mode} / ${bundle.diagnostics.recovery.recommendedAction}`,
    `- Native composition: ${bundle.summary.nativeCompositionStatus} / ${bundle.summary.nativeCompositionCoverage} / preview-only ${bundle.summary.nativeCompositionPreviewOnlySourceCount} / asset issues ${bundle.summary.nativeCompositionAssetIssueCount} / file-backed ${bundle.summary.nativeCompositionFileBackedAssetIssueCount}`,
    `- Native compositor required: ${bundle.summary.nativeCompositionRequiresCompositor ? "yes" : "no"}`,
    `- Native runtime: ${bundle.summary.nativeRuntimePlatform ?? "-"} / ${bundle.summary.nativeRuntimeStatus ?? "-"} / publisher ${bundle.summary.nativeRuntimePublisherState ?? "-"} / composition ${bundle.summary.nativeRuntimeCompositionStatus ?? "-"} / overlays applied ${bundle.summary.nativeRuntimeCompositionAppliedCount} skipped ${bundle.summary.nativeRuntimeCompositionSkippedCount}${formatKinds(bundle.summary.nativeRuntimeCompositionSkippedKinds)} / assets ${bundle.summary.nativeRuntimeStillImageAssetLoadedCount}/${bundle.summary.nativeRuntimeStillImageAssetCount} loaded / ${bundle.summary.nativeRuntimeStillImageAssetDecodedCount} decoded / decoded pixels ${bundle.summary.nativeRuntimeStillImageAssetDecodedPixelCount} / ${bundle.summary.nativeRuntimeStillImageAssetCompositedCount} composited / composited pixels ${bundle.summary.nativeRuntimeStillImageAssetCompositedPixelCount} / app-group ${bundle.summary.nativeRuntimeStillImageAssetAppGroupLoadedCount}/${bundle.summary.nativeRuntimeStillImageAssetAppGroupCount} loaded / ${bundle.summary.nativeRuntimeStillImageAssetAppGroupDecodedCount} decoded / decoded pixels ${bundle.summary.nativeRuntimeStillImageAssetAppGroupDecodedPixelCount} / ${bundle.summary.nativeRuntimeStillImageAssetAppGroupCompositedCount} composited / composited pixels ${bundle.summary.nativeRuntimeStillImageAssetAppGroupCompositedPixelCount} / ${bundle.summary.nativeRuntimeStillImageAssetMissingCount} missing / vrm ${bundle.summary.nativeRuntimeVrmActivePoseCount}/${bundle.summary.nativeRuntimeVrmSourceCount} active payloads ${bundle.summary.nativeRuntimeVrmPosePayloadCount} missing ${bundle.summary.nativeRuntimeVrmMissingPoseCount} / renderer ${bundle.summary.nativeRuntimeVrmRendererStatus} ${bundle.summary.nativeRuntimeVrmRendererBackend} rendered ${bundle.summary.nativeRuntimeVrmRenderedSourceCount}/${bundle.summary.nativeRuntimeVrmSourceCount} models ${bundle.summary.nativeRuntimeVrmModelLoadedCount} versions ${bundle.summary.nativeRuntimeVrmModelVersions.join("/") || "-"} bones ${bundle.summary.nativeRuntimeVrmHumanoidBoneCount} expressions ${bundle.summary.nativeRuntimeVrmExpressionCount} mesh primitives ${bundle.summary.nativeRuntimeVrmMeshPrimitiveCount} triangles ${bundle.summary.nativeRuntimeVrmTrianglePrimitiveCount} unsupported modes ${bundle.summary.nativeRuntimeVrmUnsupportedPrimitiveModeCount} skinned ${bundle.summary.nativeRuntimeVrmSkinnedMeshPrimitiveCount} skin joints ${bundle.summary.nativeRuntimeVrmSkinJointCount} position accessors ${bundle.summary.nativeRuntimeVrmPositionAccessorCount} normals ${bundle.summary.nativeRuntimeVrmNormalAccessorCount} uvs ${bundle.summary.nativeRuntimeVrmTexcoordAccessorCount} vertices ${bundle.summary.nativeRuntimeVrmVertexCount} indices ${bundle.summary.nativeRuntimeVrmIndexCount} bounds ${bundle.summary.nativeRuntimeVrmBoundsAccessorCount} skin attrs ${bundle.summary.nativeRuntimeVrmSkinningAttributePrimitiveCount} morphs ${bundle.summary.nativeRuntimeVrmMorphTargetCount} materials ${bundle.summary.nativeRuntimeVrmMaterialCount} transparent materials ${bundle.summary.nativeRuntimeVrmTransparentMaterialCount} textures ${bundle.summary.nativeRuntimeVrmTextureCount} images ${bundle.summary.nativeRuntimeVrmImageCount} unsupported image mimes ${bundle.summary.nativeRuntimeVrmUnsupportedImageMimeCount} pose bones ${bundle.summary.nativeRuntimeVrmPoseBoneAppliedCount}/${bundle.summary.nativeRuntimeVrmPoseBoneCount} unsupported ${bundle.summary.nativeRuntimeVrmPoseBoneUnsupportedCount} pose expressions ${bundle.summary.nativeRuntimeVrmPoseExpressionAppliedCount}/${bundle.summary.nativeRuntimeVrmPoseExpressionCount} unsupported ${bundle.summary.nativeRuntimeVrmPoseExpressionUnsupportedCount} missing ${bundle.summary.nativeRuntimeVrmRenderMissingCount} failed ${bundle.summary.nativeRuntimeVrmRenderFailureCount} / stale ${bundle.summary.nativeRuntimeStale ? "yes" : "no"} / congested ${bundle.summary.nativeRuntimeCongested ? "yes" : "no"} / queue ${bundle.summary.nativeRuntimeQueuedItems}/${bundle.summary.nativeRuntimeCacheSize}`,
    `- Audio monitor route: ${bundle.summary.audioMonitorRouteStatus} / ${bundle.summary.audioMonitorRouteOutputName} / headphones ${bundle.summary.audioMonitorRouteHeadphonesConnected ? "yes" : "no"} / stale ${bundle.summary.audioMonitorRouteStale ? "yes" : "no"}`,
    "",
    "Commercial Validation",
    `- Status: ${bundle.summary.validationStatus}`,
    `- Runbook: ${bundle.summary.validationRunbookStatus} / ${bundle.summary.validationRunbookWarningCount} warn / ${bundle.summary.validationRunbookFailCount} fail / ${bundle.summary.validationRunbookPendingCount} pending`,
    `- Runbook next: ${bundle.summary.validationRunbookNextAction}`,
    `- Rehearsal: ${bundle.summary.rehearsalStatus} / score ${bundle.summary.rehearsalScore}/100 grade ${bundle.summary.rehearsalGrade} / promote ${bundle.summary.rehearsalCanPromoteToPublic ? "yes" : "no"} / weak ${bundle.summary.rehearsalWeakAreaCount} / ${bundle.summary.rehearsalWarningCount} warn / ${bundle.summary.rehearsalFailCount} fail / ${bundle.summary.rehearsalPendingCount} pending`,
    `- Rehearsal summary: ${bundle.summary.rehearsalSummary}`,
    `- Rehearsal action: ${bundle.summary.rehearsalPrimaryAction}`,
    `- Pending: ${bundle.summary.validationPendingCount}`,
    `- Warnings: ${bundle.summary.validationWarningCount}`,
    `- Failures: ${bundle.summary.validationFailCount}`,
    `- Summary: ${bundle.diagnostics.validation.summary}`,
    `- Next step: ${bundle.diagnostics.validation.recommendedNextStep}`,
    `- Evidence: ${bundle.summary.validationEvidenceStatus} / ${bundle.summary.validationEvidenceRunCount} retained / ${bundle.summary.validationEvidenceEligibleRunCount} eligible / ${bundle.summary.validationEvidenceStaleRunCount} stale`,
    `- Evidence fingerprint: ${bundle.summary.validationEvidenceFingerprint} / latest ${bundle.summary.validationEvidenceLatestRunFingerprint ?? "-"}`,
    `- Evidence run manifest: ${formatValidationEvidenceRunManifest(bundle.summary.validationEvidenceRunManifest)}`,
    `- Evidence outcomes: ${bundle.summary.validationEvidencePassCount} pass / ${bundle.summary.validationEvidenceFailureCount} fail`,
    `- Evidence physical devices: ${bundle.summary.validationEvidencePhysicalDeviceRunCount} retained / ${bundle.summary.validationEvidencePhysicalDeviceReadyCount} ready / ${bundle.summary.validationEvidencePhysicalDeviceWarningCount} warn / ${bundle.summary.validationEvidencePhysicalDeviceFailureCount} fail / iOS ${bundle.summary.validationEvidencePhysicalDeviceIosPass ? "pass" : "missing"} / Android ${bundle.summary.validationEvidencePhysicalDeviceAndroidPass ? "pass" : "missing"}`,
    `- Evidence monitor hold: ${bundle.summary.validationEvidenceMonitorHoldRunCount} retained / ${bundle.summary.validationEvidenceMonitorHoldReadyCount} ready / ${bundle.summary.validationEvidenceMonitorHoldWarningCount} warn / ${bundle.summary.validationEvidenceMonitorHoldFailureCount} fail / iOS ${bundle.summary.validationEvidenceMonitorHoldIosPass ? "pass" : "missing"} / Android ${bundle.summary.validationEvidenceMonitorHoldAndroidPass ? "pass" : "missing"} / latest ${bundle.summary.validationEvidenceLatestMonitorHoldStatus ?? "-"} ${bundle.summary.validationEvidenceLatestMonitorHoldDurationSeconds}s ${bundle.summary.validationEvidenceLatestMonitorHoldSampleCount} samples / ${bundle.summary.validationEvidenceLatestMonitorHoldStability ?? "-"} / avg ${bundle.summary.validationEvidenceLatestMonitorHoldAverageBitrateKbps} kbps ${bundle.summary.validationEvidenceLatestMonitorHoldAverageFps} fps / min ${bundle.summary.validationEvidenceLatestMonitorHoldMinimumBitrateKbps} kbps ${bundle.summary.validationEvidenceLatestMonitorHoldMinimumFps} fps / drops ${bundle.summary.validationEvidenceLatestMonitorHoldDroppedFrameIncrease} / reconnects ${bundle.summary.validationEvidenceLatestMonitorHoldObservedReconnectAttempts}`,
    `- Evidence native runtime: ${bundle.summary.validationEvidenceNativeRuntimeRunCount} retained / ${bundle.summary.validationEvidenceNativeRuntimeReadyCount} ready / ${bundle.summary.validationEvidenceNativeRuntimeWarningCount} warn / ${bundle.summary.validationEvidenceNativeRuntimeFailureCount} fail / iOS ${bundle.summary.validationEvidenceNativeRuntimeIosPass ? "pass" : "missing"} / Android ${bundle.summary.validationEvidenceNativeRuntimeAndroidPass ? "pass" : "missing"} / latest ${bundle.summary.validationEvidenceLatestNativeRuntimeStatus ?? "-"} ${bundle.summary.validationEvidenceLatestNativeRuntimePlatform ?? "-"} / sent ${bundle.summary.validationEvidenceLatestNativeRuntimeSentVideoFrames} video ${bundle.summary.validationEvidenceLatestNativeRuntimeSentAudioFrames} audio / bytes ${bundle.summary.validationEvidenceLatestNativeRuntimeBytesWritten} / frame interval ${bundle.summary.validationEvidenceLatestNativeRuntimeVideoFrameIntervalSampleCount} samples avg ${bundle.summary.validationEvidenceLatestNativeRuntimeVideoFrameIntervalAverageMs}ms max ${bundle.summary.validationEvidenceLatestNativeRuntimeVideoFrameIntervalMaxMs}ms jitter ${bundle.summary.validationEvidenceLatestNativeRuntimeVideoFrameIntervalJitterMs}ms / overlays applied ${bundle.summary.validationEvidenceLatestNativeRuntimeCompositionAppliedCount} skipped ${bundle.summary.validationEvidenceLatestNativeRuntimeCompositionSkippedCount}${formatKinds(bundle.summary.validationEvidenceLatestNativeRuntimeCompositionSkippedKinds)} / assets ${bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetLoadedCount}/${bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetCount} loaded / ${bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetDecodedCount} decoded / decoded pixels ${bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetDecodedPixelCount} / ${bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetCompositedCount} composited / composited pixels ${bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetCompositedPixelCount} / ${bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetMissingCount} missing / app-group ${bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupLoadedCount}/${bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupCount} loaded / ${bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupDecodedCount} decoded / decoded pixels ${bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupDecodedPixelCount} / ${bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupCompositedCount} composited / composited pixels ${bundle.summary.validationEvidenceLatestNativeRuntimeStillImageAssetAppGroupCompositedPixelCount} / vrm ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmActivePoseCount}/${bundle.summary.validationEvidenceLatestNativeRuntimeVrmSourceCount} active payloads ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmPosePayloadCount} missing ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmMissingPoseCount} / renderer ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmRendererStatus} ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmRendererBackend} rendered ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmRenderedSourceCount}/${bundle.summary.validationEvidenceLatestNativeRuntimeVrmSourceCount} models ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmModelLoadedCount} versions ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmModelVersions.join("/") || "-"} bones ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmHumanoidBoneCount} expressions ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmExpressionCount} mesh primitives ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmMeshPrimitiveCount} triangles ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmTrianglePrimitiveCount} unsupported modes ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmUnsupportedPrimitiveModeCount} skinned ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmSkinnedMeshPrimitiveCount} skin joints ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmSkinJointCount} position accessors ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmPositionAccessorCount} normals ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmNormalAccessorCount} uvs ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmTexcoordAccessorCount} vertices ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmVertexCount} indices ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmIndexCount} bounds ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmBoundsAccessorCount} skin attrs ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmSkinningAttributePrimitiveCount} morphs ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmMorphTargetCount} materials ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmMaterialCount} transparent materials ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmTransparentMaterialCount} textures ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmTextureCount} images ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmImageCount} unsupported image mimes ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmUnsupportedImageMimeCount} pose bones ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmPoseBoneAppliedCount}/${bundle.summary.validationEvidenceLatestNativeRuntimeVrmPoseBoneCount} unsupported ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmPoseBoneUnsupportedCount} pose expressions ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmPoseExpressionAppliedCount}/${bundle.summary.validationEvidenceLatestNativeRuntimeVrmPoseExpressionCount} unsupported ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmPoseExpressionUnsupportedCount} missing ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmRenderMissingCount} failed ${bundle.summary.validationEvidenceLatestNativeRuntimeVrmRenderFailureCount} / congested ${bundle.summary.validationEvidenceLatestNativeRuntimeCongested ? "yes" : "no"} / queue ${bundle.summary.validationEvidenceLatestNativeRuntimeQueuedItems}/${bundle.summary.validationEvidenceLatestNativeRuntimeCacheSize}`,
    `- Evidence face tracking: ${bundle.summary.validationEvidenceFaceTrackingRunCount} retained / ${bundle.summary.validationEvidenceFaceTrackingReadyCount} ready / ${bundle.summary.validationEvidenceFaceTrackingWarningCount} warn / iOS ${bundle.summary.validationEvidenceFaceTrackingIosPass ? "pass" : "missing"} / Android ${bundle.summary.validationEvidenceFaceTrackingAndroidPass ? "pass" : "missing"} / latest ${bundle.summary.validationEvidenceLatestFaceTrackingStatus ?? "-"} ${bundle.summary.validationEvidenceLatestFaceTrackingRuntimeStatus ?? "-"} / age ${bundle.summary.validationEvidenceLatestFaceTrackingRuntimeAgeMs === null ? "-" : `${bundle.summary.validationEvidenceLatestFaceTrackingRuntimeAgeMs} ms`} / fresh ${bundle.summary.validationEvidenceLatestFaceTrackingRuntimeFresh ? "yes" : "no"} / landmarks ${Math.round(bundle.summary.validationEvidenceLatestFaceTrackingFaceLandmarkConfidence * 100)}% ${bundle.summary.validationEvidenceLatestFaceTrackingFaceLandmarkReady ? "ready" : "not-ready"} / prepared ${bundle.summary.validationEvidenceLatestFaceTrackingPreparedPngTuberCount} / VRM ${bundle.summary.validationEvidenceLatestFaceTrackingVisibleVrmCount} renderer ${bundle.summary.validationEvidenceLatestFaceTrackingNativeVrmRendererReady ? "ready" : "not-ready"} / moving ${bundle.summary.validationEvidenceLatestFaceTrackingActiveMotionCount} / rig quality ${bundle.summary.validationEvidenceLatestFaceTrackingRigQualityScore}/100 ${bundle.summary.validationEvidenceLatestFaceTrackingRigQualityGrade ?? "blocked"}`,
    `- Evidence audio: ${bundle.summary.validationEvidenceAudioRunCount} retained / ${bundle.summary.validationEvidenceAudioReadyCount} ready / ${bundle.summary.validationEvidenceAudioWarningCount} warn / iOS ${bundle.summary.validationEvidenceAudioIosPass ? "pass" : "missing"} / Android ${bundle.summary.validationEvidenceAudioAndroidPass ? "pass" : "missing"} / latest ${bundle.summary.validationEvidenceLatestAudioStatus ?? "-"} ${bundle.summary.validationEvidenceLatestAudioPresetId ?? "-"} / monitor ${bundle.summary.validationEvidenceLatestAudioMonitorEnabled ? "on" : "off"} / headphones-only ${bundle.summary.validationEvidenceLatestAudioMonitorHeadphonesOnly ? "yes" : "no"} / route ${bundle.summary.validationEvidenceLatestAudioMonitorRouteStatus ?? "-"} ${bundle.summary.validationEvidenceLatestAudioOutputName ?? "-"} / headphones ${bundle.summary.validationEvidenceLatestAudioHeadphonesConnected ? "yes" : "no"} / stale ${bundle.summary.validationEvidenceLatestAudioRouteStale ? "yes" : "no"} / native monitor ${bundle.summary.validationEvidenceLatestAudioNativeMonitorReported ? (bundle.summary.validationEvidenceLatestAudioNativeMonitorRunning ? "running" : "reported") : "missing"} ${bundle.summary.validationEvidenceLatestAudioNativeMonitorWrittenFrames}/${bundle.summary.validationEvidenceLatestAudioNativeMonitorDroppedFrames} frames ${bundle.summary.validationEvidenceLatestAudioNativeMonitorOutputName ?? "-"} / buffers ${bundle.summary.validationEvidenceLatestAudioNativeMonitorWrittenBuffers}/${bundle.summary.validationEvidenceLatestAudioNativeMonitorDroppedBuffers} / latency ${bundle.summary.validationEvidenceLatestAudioMonitorLatencyMs === null ? "missing" : `${bundle.summary.validationEvidenceLatestAudioMonitorLatencyMs}ms`} ${bundle.summary.validationEvidenceLatestAudioMonitorLatencyStatus ?? "-"} / source ${bundle.summary.validationEvidenceLatestAudioMonitorLatencySource ?? "-"} / budget ${bundle.summary.validationEvidenceLatestAudioMonitorLatencyBudgetMs}ms / bluetooth ${bundle.summary.validationEvidenceLatestAudioBluetoothRoute ? "yes" : "no"} / bluetooth reviewed ${bundle.summary.validationEvidenceLatestAudioBluetoothTuningReviewed ? "yes" : "no"} / tuning ${bundle.summary.validationEvidenceLatestAudioMonitorTuningNote ?? "-"} / samples ${bundle.summary.validationEvidenceLatestAudioLevelSampleCount} / peak ${Math.round(bundle.summary.validationEvidenceLatestAudioPeakLevel * 100)}% / clipped ${bundle.summary.validationEvidenceLatestAudioClippedLevelCount}`,
    `- Evidence chat readout: ${bundle.summary.validationEvidenceChatReadoutRunCount} retained / ${bundle.summary.validationEvidenceChatReadoutReadyCount} ready / ${bundle.summary.validationEvidenceChatReadoutWarningCount} warn / iOS ${bundle.summary.validationEvidenceChatReadoutIosPass ? "pass" : "missing"} / Android ${bundle.summary.validationEvidenceChatReadoutAndroidPass ? "pass" : "missing"} / latest ${bundle.summary.validationEvidenceLatestChatReadoutStatus ?? "-"} ${bundle.summary.validationEvidenceLatestChatReadoutConnectionPhase ?? "-"} / spoken ${bundle.summary.validationEvidenceLatestChatReadoutSpokenMessageCount} / failed ${bundle.summary.validationEvidenceLatestChatReadoutSpeechFailureCount}`,
    `- Evidence quality automation: ${bundle.summary.validationEvidenceQualityAutomationRunCount} retained / live ${bundle.summary.validationEvidenceQualityAutomationLiveUpdateCount} / next-start ${bundle.summary.validationEvidenceQualityAutomationNextTargetCount} / failed ${bundle.summary.validationEvidenceQualityAutomationFailureCount} / latest ${bundle.summary.validationEvidenceLatestQualityAutomationStatus ?? "-"} ${bundle.summary.validationEvidenceLatestQualityAutomationSummary ?? "-"}`,
    `- Evidence platform dashboard: ${bundle.summary.validationEvidencePlatformPublishingRunCount} retained / ${bundle.summary.validationEvidencePlatformPublishingReadyCount} ready / ${bundle.summary.validationEvidencePlatformPublishingFreshCount} fresh / ${bundle.summary.validationEvidencePlatformPublishingFreshnessWarningCount} freshness warn / ${bundle.summary.validationEvidencePlatformPublishingWarningCount} warn / ${bundle.summary.validationEvidencePlatformPublishingFailureCount} fail / iOS ${bundle.summary.validationEvidencePlatformPublishingIosPass ? "pass" : "missing"} / Android ${bundle.summary.validationEvidencePlatformPublishingAndroidPass ? "pass" : "missing"} / latest ${bundle.summary.validationEvidenceLatestPlatformPublishingStatus ?? "-"} ${bundle.summary.validationEvidenceLatestPlatformPublishingSummary ?? "-"}`,
    `- Evidence platform ingest: ${bundle.summary.validationEvidencePlatformIngestRunCount} retained / ${bundle.summary.validationEvidencePlatformIngestReadyCount} ready / ${bundle.summary.validationEvidencePlatformIngestWarningCount} warn / ${bundle.summary.validationEvidencePlatformIngestFailureCount} fail / iOS ${bundle.summary.validationEvidencePlatformIngestIosPass ? "pass" : "missing"} / Android ${bundle.summary.validationEvidencePlatformIngestAndroidPass ? "pass" : "missing"}`,
    `- Evidence platform dashboard freshness: ${bundle.summary.validationEvidencePlatformPublishingFreshnessStatus ?? "-"} / ${bundle.summary.validationEvidencePlatformPublishingFreshnessSummary ?? "-"}`,
    `- Physical coverage: iOS ${bundle.summary.validationEvidenceIosPass ? "pass" : "missing"} / Android ${bundle.summary.validationEvidenceAndroidPass ? "pass" : "missing"}`,
    `- Validation build: ${bundle.summary.validationEvidenceConsistentAppBuild ?? (bundle.summary.validationEvidenceAppBuildMismatch ? "mismatch" : "-")}`,
    `- Evidence summary: ${bundle.diagnostics.validationEvidence.summary}`,
    `- Evidence recommendation: ${bundle.diagnostics.validationEvidence.recommendation}`,
    ...bundle.diagnostics.validation.items.map(
      (item) => `- [${item.status.toUpperCase()}] ${item.title}: ${item.detail} Action: ${item.action}`
    ),
    "",
    "Profile",
    `- Mic effects: ${bundle.profile.micEffects.enabled ? bundle.profile.micEffects.presetId : "off"}`,
    `- Broadcast mix: ${formatBroadcastMixerSummary(bundle.profile.broadcastMixer)}`,
    `- Audio peak guard: ${bundle.diagnostics.audio.audioGuard.status} / ${bundle.diagnostics.audio.audioGuard.summary}`,
    `- Mic monitor: ${bundle.profile.micEffects.monitorEnabled ? "on" : "off"} / headphones-only ${bundle.profile.micEffects.monitorHeadphonesOnly ? "on" : "off"}`,
    `- Face tracking: ${bundle.profile.faceTracking.enabled ? bundle.profile.faceTracking.inputMode : "off"} / ${bundle.profile.faceTracking.rigMode}`,
    `- Platform chat: ${bundle.profile.platformChat.enabled ? bundle.profile.platformChat.platform : "off"}`,
    `- Publishing: title ${bundle.profile.platformPublishing.titleLength} chars / description ${bundle.profile.platformPublishing.descriptionLength} chars`,
    `- Publishing status checked: YouTube ${bundle.profile.platformPublishing.youtubeStatusCheckedAt || "-"} / Twitch ${bundle.profile.platformPublishing.twitchStatusCheckedAt || "-"}`,
    `- Publishing status freshness: ${bundle.summary.platformPublishingFreshnessStatus} / ${bundle.summary.platformPublishingFreshnessSummary}`,
    `- Publishing freshness action: ${bundle.summary.platformPublishingFreshnessRecommendation}`
  ].join("\n");
};

const formatBroadcastMixerSummary = (mixer: StudioProfile["broadcastMixer"]): string =>
  broadcastMixerChannels
    .map((channel) => {
      const settings = mixer[channel.id];
      const level = settings.muted || settings.volume <= 0 ? "muted" : `${Math.round(settings.volume * 100)}%`;
      return `${channel.shortLabel} ${level}`;
    })
    .join(" / ");

const formatKinds = (kinds: string[] | undefined): string => (kinds && kinds.length > 0 ? ` kinds ${kinds.join("/")}` : "");

const formatValidationEvidenceRunManifest = (
  manifest: StreamDiagnostics["validationEvidence"]["runManifest"]
): string => {
  if (manifest.length === 0) {
    return "-";
  }

  return manifest
    .map((run) => {
      const scopeStatus = run.eligible ? "eligible" : run.matchesScope ? "stale" : "out-of-scope";
      return [
        `${run.devicePlatform} ${run.result} ${scopeStatus}`,
        `device ${run.physicalDevice ? "physical" : run.physicalDeviceStatus}`,
        `build ${run.appBuild}`,
        `${run.targetPlatform}/${run.transport}`,
        `${run.ageDays}d`,
        run.fingerprint,
        `native ${run.nativeRuntimeStatus ?? "-"} ${run.nativeRuntimePlatform ?? "-"} ${run.nativeRuntimeCompositionStatus ?? "-"} frames ${run.nativeRuntimeSentVideoFrames}/${run.nativeRuntimeSentAudioFrames} bytes ${run.nativeRuntimeBytesWritten} frame interval ${run.nativeRuntimeVideoFrameIntervalSampleCount} avg ${run.nativeRuntimeVideoFrameIntervalAverageMs}ms max ${run.nativeRuntimeVideoFrameIntervalMaxMs}ms jitter ${run.nativeRuntimeVideoFrameIntervalJitterMs}ms overlays applied ${run.nativeRuntimeCompositionAppliedCount} skipped ${run.nativeRuntimeCompositionSkippedCount}${formatKinds(run.nativeRuntimeCompositionSkippedKinds)} assets ${run.nativeRuntimeStillImageAssetLoadedCount}/${run.nativeRuntimeStillImageAssetCount} decoded ${run.nativeRuntimeStillImageAssetDecodedCount} decoded pixels ${run.nativeRuntimeStillImageAssetDecodedPixelCount} composited ${run.nativeRuntimeStillImageAssetCompositedCount} composited pixels ${run.nativeRuntimeStillImageAssetCompositedPixelCount} app-group ${run.nativeRuntimeStillImageAssetAppGroupLoadedCount}/${run.nativeRuntimeStillImageAssetAppGroupCount} loaded ${run.nativeRuntimeStillImageAssetAppGroupDecodedCount} decoded pixels ${run.nativeRuntimeStillImageAssetAppGroupDecodedPixelCount} ${run.nativeRuntimeStillImageAssetAppGroupCompositedCount} composited pixels ${run.nativeRuntimeStillImageAssetAppGroupCompositedPixelCount} missing ${run.nativeRuntimeStillImageAssetMissingCount} vrm ${run.nativeRuntimeVrmActivePoseCount}/${run.nativeRuntimeVrmSourceCount} payloads ${run.nativeRuntimeVrmPosePayloadCount} missing ${run.nativeRuntimeVrmMissingPoseCount} renderer ${run.nativeRuntimeVrmRendererStatus ?? "-"} ${run.nativeRuntimeVrmRendererBackend ?? "-"} rendered ${run.nativeRuntimeVrmRenderedSourceCount}/${run.nativeRuntimeVrmSourceCount} models ${run.nativeRuntimeVrmModelLoadedCount} versions ${run.nativeRuntimeVrmModelVersions.join("/") || "-"} bones ${run.nativeRuntimeVrmHumanoidBoneCount} expressions ${run.nativeRuntimeVrmExpressionCount} mesh primitives ${run.nativeRuntimeVrmMeshPrimitiveCount} triangles ${run.nativeRuntimeVrmTrianglePrimitiveCount} unsupported modes ${run.nativeRuntimeVrmUnsupportedPrimitiveModeCount} skinned ${run.nativeRuntimeVrmSkinnedMeshPrimitiveCount} skin joints ${run.nativeRuntimeVrmSkinJointCount} position accessors ${run.nativeRuntimeVrmPositionAccessorCount} normals ${run.nativeRuntimeVrmNormalAccessorCount} uvs ${run.nativeRuntimeVrmTexcoordAccessorCount} vertices ${run.nativeRuntimeVrmVertexCount} indices ${run.nativeRuntimeVrmIndexCount} bounds ${run.nativeRuntimeVrmBoundsAccessorCount} skin attrs ${run.nativeRuntimeVrmSkinningAttributePrimitiveCount} morphs ${run.nativeRuntimeVrmMorphTargetCount} materials ${run.nativeRuntimeVrmMaterialCount} transparent materials ${run.nativeRuntimeVrmTransparentMaterialCount} textures ${run.nativeRuntimeVrmTextureCount} images ${run.nativeRuntimeVrmImageCount} unsupported image mimes ${run.nativeRuntimeVrmUnsupportedImageMimeCount} pose bones ${run.nativeRuntimeVrmPoseBoneAppliedCount}/${run.nativeRuntimeVrmPoseBoneCount} unsupported ${run.nativeRuntimeVrmPoseBoneUnsupportedCount} pose expressions ${run.nativeRuntimeVrmPoseExpressionAppliedCount}/${run.nativeRuntimeVrmPoseExpressionCount} unsupported ${run.nativeRuntimeVrmPoseExpressionUnsupportedCount} missing ${run.nativeRuntimeVrmRenderMissingCount} failed ${run.nativeRuntimeVrmRenderFailureCount}`,
        `avatar prepared ${run.faceTrackingPreparedPngTuberCount} vrm ${run.faceTrackingVisibleVrmCount} renderer ${run.faceTrackingNativeVrmRendererReady ? "ready" : "not-ready"} moving ${run.faceTrackingActiveMotionCount} rig ${run.faceTrackingRigQualityScore}/100 ${run.faceTrackingRigQualityGrade ?? "blocked"}`,
        `hold ${run.monitorHoldStatus ?? "-"} samples ${run.monitorHoldSampleCount} duration ${run.monitorHoldDurationSeconds}s stability ${run.monitorHoldStability ?? "-"} bitrate ${run.monitorHoldAverageBitrateKbps}/${run.monitorHoldMinimumBitrateKbps} fps ${run.monitorHoldAverageFps}/${run.monitorHoldMinimumFps} drops ${run.monitorHoldDroppedFrameIncrease} reconnects ${run.monitorHoldObservedReconnectAttempts}`,
        `audio ${run.audioStatus ?? "-"} monitor frames ${run.audioNativeMonitorWrittenFrames}/${run.audioNativeMonitorDroppedFrames} buffers ${run.audioNativeMonitorWrittenBuffers}/${run.audioNativeMonitorDroppedBuffers} headphones ${run.audioNativeMonitorHeadphonesConnected ? "yes" : "no"} latency ${run.audioMonitorLatencyMs === null ? "-" : `${run.audioMonitorLatencyMs}ms`} ${run.audioMonitorLatencyStatus ?? "-"} bluetooth ${run.audioBluetoothRoute ? "yes" : "no"} reviewed ${run.audioBluetoothTuningReviewed ? "yes" : "no"}`,
        `chat ${run.chatReadoutStatus ?? "-"} spoken ${run.chatReadoutSpokenMessageCount} failed ${run.chatReadoutSpeechFailureCount}`,
        `quality ${run.qualityAutomationStatus ?? "-"} live ${run.qualityAutomationLiveUpdateCount} next ${run.qualityAutomationNextTargetCount} failed ${run.qualityAutomationFailureCount}`,
        `dashboard ${run.platformPublishingPlatform ?? "-"} ${run.platformPublishingStatus ?? "-"}/${run.platformPublishingFreshnessStatus ?? "-"} checked ${run.platformPublishingCheckedAt || "-"} age ${run.platformPublishingFreshnessAgeMinutes ?? "-"}m youtube broadcast ${run.platformPublishingYoutubeHasBroadcastId ? "yes" : "no"} ${run.platformPublishingYoutubeBroadcastStatus || "-"} stream ${run.platformPublishingYoutubeHasStreamId ? "yes" : "no"} ${run.platformPublishingYoutubeStreamStatus || "-"} health ${run.platformPublishingYoutubeHealthStatus || "-"} issues ${run.platformPublishingYoutubeHealthIssueCount} twitch ${run.platformPublishingTwitchLiveStatus || "-"} started ${run.platformPublishingTwitchStartedAt || "-"} category ${run.platformPublishingTwitchHasCategoryId ? "yes" : "no"} ${run.platformPublishingTwitchChannelCategory || "-"} (${run.platformPublishingTwitchChannelCategoryId || "-"}) title ${run.platformPublishingTwitchChannelTitle || "-"} language ${run.platformPublishingTwitchChannelLanguage || "-"} viewers ${run.platformPublishingTwitchViewerCount}`
      ].join(" ");
    })
    .join(" | ");
};

const countSources = (sources: SceneSource[]): Record<SourceKind, number> => {
  const counts: Record<SourceKind, number> = {
    screen: 0,
    pngtuber: 0,
    live2d: 0,
    vrm: 0,
    image: 0,
    solid: 0,
    text: 0,
    chat: 0
  };

  for (const source of sources) {
    counts[source.kind] += 1;
  }

  return counts;
};

const formatQualityAdvisorTarget = (target: NonNullable<StreamDiagnostics["qualityAdvisor"]["suggestedTarget"]>): string =>
  `${target.profileName} ${target.width}x${target.height}/${target.fps}fps/${target.videoBitrateKbps}kbps`;

const toSourceSummary = (source: SceneSource): SupportBundleSourceSummary => ({
  id: source.id,
  kind: source.kind,
  name: source.name,
  visible: source.visible,
  locked: source.locked,
  transform: source.transform,
  payload: sourcePayloadSummary(source)
});

const sourcePayloadSummary = (source: SceneSource): Record<string, string | number | boolean> => {
  switch (source.kind) {
    case "screen":
      return { captureMode: source.captureMode };
    case "pngtuber":
      return { avatarId: source.avatarId, expression: source.expression, hasImageUri: Boolean(source.imageUri.trim()) };
    case "live2d":
      return { modelId: source.modelId, expression: source.expression, hasModelJsonUri: Boolean(source.modelJsonUri.trim()) };
    case "vrm": {
      const pose = createVrmRuntimePose(source);
      return {
        modelId: source.modelId,
        expression: source.expression,
        hasModelUri: Boolean(source.modelUri.trim()),
        runtimePoseStatus: pose.status,
        trackingConfidence: pose.confidence
      };
    }
    case "image":
      return { hasUri: Boolean(source.uri.trim()) };
    case "solid":
      return { color: source.color };
    case "text":
      return { textLength: source.text.length, color: source.color, fontSize: source.fontSize };
    case "chat":
      return {
        maxMessages: source.maxMessages,
        maxMessageLength: source.maxMessageLength,
        showAuthor: source.showAuthor,
        redactUrls: source.redactUrls,
        color: source.color,
        fontSize: source.fontSize,
        backgroundOpacity: source.backgroundOpacity
      };
  }
};

const formatSourceCounts = (sourceCounts: Record<SourceKind, number>): string =>
  Object.entries(sourceCounts)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(", ");
