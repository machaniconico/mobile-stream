package com.mobilelivecaster.streaming

import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.net.URI
import org.json.JSONObject

data class LiveCasterHealth(
    val bitrateKbps: Int = 0,
    val droppedFrames: Int = 0,
    val fps: Int = 0,
    val elapsedSeconds: Int = 0,
    val reconnectAttempts: Int = 0,
    val message: String = "Ready"
)

data class NativeRuntimeComposition(
    val status: String = "unknown",
    val appliedCount: Int = 0,
    val skippedCount: Int = 0,
    val skippedKinds: List<String> = emptyList(),
    val vrmSourceCount: Int = 0,
    val vrmPosePayloadCount: Int = 0,
    val vrmActivePoseCount: Int = 0,
    val vrmMissingPoseCount: Int = 0,
    val vrmModelUriCount: Int = 0,
    val vrmModelVersions: List<String> = emptyList(),
    val vrmHumanoidBoneCount: Int = 0,
    val vrmExpressionCount: Int = 0,
    val vrmMeshPrimitiveCount: Int = 0,
    val vrmSkinnedMeshPrimitiveCount: Int = 0,
    val vrmSkinJointCount: Int = 0,
    val vrmPositionAccessorCount: Int = 0,
    val vrmVertexCount: Int = 0,
    val vrmIndexCount: Int = 0,
    val vrmBoundsAccessorCount: Int = 0,
    val vrmSkinningAttributePrimitiveCount: Int = 0,
    val vrmMorphTargetCount: Int = 0,
    val vrmMaterialCount: Int = 0,
    val vrmTextureCount: Int = 0,
    val vrmPoseBoneCount: Int = 0,
    val vrmPoseBoneAppliedCount: Int = 0,
    val vrmPoseBoneUnsupportedCount: Int = 0,
    val vrmPoseExpressionCount: Int = 0,
    val vrmPoseExpressionAppliedCount: Int = 0,
    val vrmPoseExpressionUnsupportedCount: Int = 0,
    val vrmRuntimeStatuses: List<String> = emptyList(),
    val vrmRendererStatus: String = "not-required",
    val vrmRendererBackend: String = "none",
    val vrmModelLoadedCount: Int = 0,
    val vrmRenderedSourceCount: Int = 0,
    val vrmRenderMissingCount: Int = 0,
    val vrmRenderFailureCount: Int = 0,
    val message: String = ""
) {
    fun asWritableMap(): WritableMap = Arguments.createMap().apply {
        putString("status", status)
        putInt("appliedCount", appliedCount)
        putInt("skippedCount", skippedCount)
        putArray("skippedKinds", skippedKinds.toWritableArray())
        putInt("vrmSourceCount", vrmSourceCount)
        putInt("vrmPosePayloadCount", vrmPosePayloadCount)
        putInt("vrmActivePoseCount", vrmActivePoseCount)
        putInt("vrmMissingPoseCount", vrmMissingPoseCount)
        putInt("vrmModelUriCount", vrmModelUriCount)
        putArray("vrmModelVersions", vrmModelVersions.toWritableArray())
        putInt("vrmHumanoidBoneCount", vrmHumanoidBoneCount)
        putInt("vrmExpressionCount", vrmExpressionCount)
        putInt("vrmMeshPrimitiveCount", vrmMeshPrimitiveCount)
        putInt("vrmSkinnedMeshPrimitiveCount", vrmSkinnedMeshPrimitiveCount)
        putInt("vrmSkinJointCount", vrmSkinJointCount)
        putInt("vrmPositionAccessorCount", vrmPositionAccessorCount)
        putInt("vrmVertexCount", vrmVertexCount)
        putInt("vrmIndexCount", vrmIndexCount)
        putInt("vrmBoundsAccessorCount", vrmBoundsAccessorCount)
        putInt("vrmSkinningAttributePrimitiveCount", vrmSkinningAttributePrimitiveCount)
        putInt("vrmMorphTargetCount", vrmMorphTargetCount)
        putInt("vrmMaterialCount", vrmMaterialCount)
        putInt("vrmTextureCount", vrmTextureCount)
        putInt("vrmPoseBoneCount", vrmPoseBoneCount)
        putInt("vrmPoseBoneAppliedCount", vrmPoseBoneAppliedCount)
        putInt("vrmPoseBoneUnsupportedCount", vrmPoseBoneUnsupportedCount)
        putInt("vrmPoseExpressionCount", vrmPoseExpressionCount)
        putInt("vrmPoseExpressionAppliedCount", vrmPoseExpressionAppliedCount)
        putInt("vrmPoseExpressionUnsupportedCount", vrmPoseExpressionUnsupportedCount)
        putArray("vrmRuntimeStatuses", vrmRuntimeStatuses.toWritableArray())
        putString("vrmRendererStatus", vrmRendererStatus)
        putString("vrmRendererBackend", vrmRendererBackend)
        putInt("vrmModelLoadedCount", vrmModelLoadedCount)
        putInt("vrmRenderedSourceCount", vrmRenderedSourceCount)
        putInt("vrmRenderMissingCount", vrmRenderMissingCount)
        putInt("vrmRenderFailureCount", vrmRenderFailureCount)
        putString("message", message)
    }
}

private fun List<String>.toWritableArray(): WritableArray =
    Arguments.createArray().also { array ->
        forEach { item -> array.pushString(item) }
    }

private fun AndroidCompositionResult.toNativeRuntimeComposition(): NativeRuntimeComposition {
    val status = when {
        parseFailed -> "failed"
        skippedCount > 0 -> "pending"
        appliedCount > 0 -> "applied"
        else -> "screen-only"
    }
    return NativeRuntimeComposition(
        status = status,
        appliedCount = appliedCount,
        skippedCount = skippedCount,
        skippedKinds = skippedKinds.toList().sorted(),
        vrmSourceCount = vrmPoseSummary.sourceCount,
        vrmPosePayloadCount = vrmPoseSummary.posePayloadCount,
        vrmActivePoseCount = vrmPoseSummary.activePoseCount,
        vrmMissingPoseCount = vrmPoseSummary.missingPoseCount,
        vrmModelUriCount = vrmPoseSummary.modelUriCount,
        vrmModelVersions = vrmPoseSummary.modelVersions.toList().sorted(),
        vrmHumanoidBoneCount = vrmPoseSummary.humanoidBoneCount,
        vrmExpressionCount = vrmPoseSummary.expressionCount,
        vrmMeshPrimitiveCount = vrmPoseSummary.meshPrimitiveCount,
        vrmSkinnedMeshPrimitiveCount = vrmPoseSummary.skinnedMeshPrimitiveCount,
        vrmSkinJointCount = vrmPoseSummary.skinJointCount,
        vrmPositionAccessorCount = vrmPoseSummary.positionAccessorCount,
        vrmVertexCount = vrmPoseSummary.vertexCount,
        vrmIndexCount = vrmPoseSummary.indexCount,
        vrmBoundsAccessorCount = vrmPoseSummary.boundsAccessorCount,
        vrmSkinningAttributePrimitiveCount = vrmPoseSummary.skinningAttributePrimitiveCount,
        vrmMorphTargetCount = vrmPoseSummary.morphTargetCount,
        vrmMaterialCount = vrmPoseSummary.materialCount,
        vrmTextureCount = vrmPoseSummary.textureCount,
        vrmPoseBoneCount = vrmPoseSummary.poseBoneCount,
        vrmPoseBoneAppliedCount = vrmPoseSummary.poseBoneAppliedCount,
        vrmPoseBoneUnsupportedCount = vrmPoseSummary.poseBoneUnsupportedCount,
        vrmPoseExpressionCount = vrmPoseSummary.poseExpressionCount,
        vrmPoseExpressionAppliedCount = vrmPoseSummary.poseExpressionAppliedCount,
        vrmPoseExpressionUnsupportedCount = vrmPoseSummary.poseExpressionUnsupportedCount,
        vrmRuntimeStatuses = vrmPoseSummary.runtimeStatuses.toList().sorted(),
        vrmRendererStatus = vrmPoseSummary.rendererStatus,
        vrmRendererBackend = vrmPoseSummary.rendererBackend,
        vrmModelLoadedCount = vrmPoseSummary.modelLoadedCount,
        vrmRenderedSourceCount = vrmPoseSummary.renderedSourceCount,
        vrmRenderMissingCount = vrmPoseSummary.renderMissingCount,
        vrmRenderFailureCount = vrmPoseSummary.renderFailureCount,
        message = summary
    )
}

data class NativeRuntimePublisher(
    val state: String = "",
    val reconnectAttempts: Int = 0,
    val sentVideoFrames: Long = 0,
    val sentAudioFrames: Long = 0,
    val droppedVideoFrames: Long = 0,
    val droppedAudioFrames: Long = 0,
    val bytesWritten: Long = 0,
    val cacheSize: Int = 0,
    val itemsInCache: Int = 0,
    val congested: Boolean = false,
    val lastError: String = ""
) {
    fun asWritableMap(): WritableMap = Arguments.createMap().apply {
        putString("state", state)
        putInt("reconnectAttempts", reconnectAttempts)
        putDouble("sentVideoFrames", sentVideoFrames.toDouble())
        putDouble("sentAudioFrames", sentAudioFrames.toDouble())
        putDouble("droppedVideoFrames", droppedVideoFrames.toDouble())
        putDouble("droppedAudioFrames", droppedAudioFrames.toDouble())
        putDouble("bytesWritten", bytesWritten.toDouble())
        putInt("cacheSize", cacheSize)
        putInt("itemsInCache", itemsInCache)
        putBoolean("congested", congested)
        putString("lastError", lastError)
    }
}

data class NativeRuntimeAudioProcessing(
    val micEffectsEnabled: Boolean = false,
    val micEffectsPresetId: String = "clean",
    val micEffectsProcessedFrames: Long = 0,
    val micEffectsProcessedSamples: Long = 0,
    val micEffectsGatedSamples: Long = 0,
    val micEffectsLimitedSamples: Long = 0,
    val monitorEnabled: Boolean = false,
    val monitorRunning: Boolean = false,
    val monitorVolume: Float = 0f,
    val monitorHeadphonesOnly: Boolean = true,
    val monitorRoute: String = "unknown",
    val monitorOutputName: String = "Unknown",
    val monitorHeadphonesConnected: Boolean = false,
    val monitorWrittenFrames: Long = 0,
    val monitorDroppedFrames: Long = 0,
    val monitorWrittenBuffers: Long = 0,
    val monitorDroppedBuffers: Long = 0,
    val monitorEstimatedLatencyMs: Int = 0,
    val monitorLatencySource: String = "",
    val monitorLastError: String = "",
    val broadcastMicVolume: Float = 1f,
    val broadcastMicMuted: Boolean = false,
    val broadcastAppAudioVolume: Float = 0.85f,
    val broadcastAppAudioMuted: Boolean = false,
    val broadcastChatReadoutVolume: Float = 0.85f,
    val broadcastChatReadoutMuted: Boolean = false
) {
    fun asWritableMap(): WritableMap = Arguments.createMap().apply {
        putBoolean("micEffectsEnabled", micEffectsEnabled)
        putString("micEffectsPresetId", micEffectsPresetId)
        putDouble("micEffectsProcessedFrames", micEffectsProcessedFrames.toDouble())
        putDouble("micEffectsProcessedSamples", micEffectsProcessedSamples.toDouble())
        putDouble("micEffectsGatedSamples", micEffectsGatedSamples.toDouble())
        putDouble("micEffectsLimitedSamples", micEffectsLimitedSamples.toDouble())
        putBoolean("monitorEnabled", monitorEnabled)
        putBoolean("monitorRunning", monitorRunning)
        putDouble("monitorVolume", monitorVolume.toDouble())
        putBoolean("monitorHeadphonesOnly", monitorHeadphonesOnly)
        putString("monitorRoute", monitorRoute)
        putString("monitorOutputName", monitorOutputName)
        putBoolean("monitorHeadphonesConnected", monitorHeadphonesConnected)
        putDouble("monitorWrittenFrames", monitorWrittenFrames.toDouble())
        putDouble("monitorDroppedFrames", monitorDroppedFrames.toDouble())
        putDouble("monitorWrittenBuffers", monitorWrittenBuffers.toDouble())
        putDouble("monitorDroppedBuffers", monitorDroppedBuffers.toDouble())
        putInt("monitorEstimatedLatencyMs", monitorEstimatedLatencyMs)
        putString("monitorLatencySource", monitorLatencySource)
        putString("monitorLastError", monitorLastError)
        putDouble("broadcastMicVolume", broadcastMicVolume.toDouble())
        putBoolean("broadcastMicMuted", broadcastMicMuted)
        putDouble("broadcastAppAudioVolume", broadcastAppAudioVolume.toDouble())
        putBoolean("broadcastAppAudioMuted", broadcastAppAudioMuted)
        putDouble("broadcastChatReadoutVolume", broadcastChatReadoutVolume.toDouble())
        putBoolean("broadcastChatReadoutMuted", broadcastChatReadoutMuted)
    }
}

data class NativeRuntimeTelemetry(
    val platform: String = "android",
    val runtimeStatus: String,
    val updatedAt: Long = System.currentTimeMillis(),
    val stale: Boolean = false,
    val elapsedSeconds: Int = 0,
    val videoFrames: Long = 0,
    val encodedBytes: Long = 0,
    val droppedFrames: Long = 0,
    val publisher: NativeRuntimePublisher = NativeRuntimePublisher(),
    val composition: NativeRuntimeComposition = NativeRuntimeComposition(),
    val audioProcessing: NativeRuntimeAudioProcessing? = null,
    val message: String = ""
) {
    fun asWritableMap(): WritableMap = Arguments.createMap().apply {
        putString("platform", platform)
        putString("runtimeStatus", runtimeStatus)
        putDouble("updatedAt", updatedAt.toDouble())
        putBoolean("stale", stale)
        putInt("elapsedSeconds", elapsedSeconds)
        putDouble("videoFrames", videoFrames.toDouble())
        putDouble("encodedBytes", encodedBytes.toDouble())
        putDouble("droppedFrames", droppedFrames.toDouble())
        putMap("publisher", publisher.asWritableMap())
        putMap("composition", composition.asWritableMap())
        audioProcessing?.let { putMap("audioProcessing", it.asWritableMap()) }
        putString("message", message)
    }
}

enum class LiveCasterStatus(val jsValue: String) {
    Idle("idle"),
    Preparing("preparing"),
    Live("live"),
    Reconnecting("reconnecting"),
    Stopping("stopping"),
    Failed("failed")
}

data class LiveCasterProfile(
    val endpoint: String,
    val streamKey: String,
    val width: Int,
    val height: Int,
    val fps: Int,
    val videoBitrate: Int,
    val audioBitrate: Int,
    val micEffects: MicEffectsProfile,
    val broadcastMixer: BroadcastMixerProfile
)

data class MicEffectsProfile(
    val enabled: Boolean = false,
    val presetId: String = "clean",
    val inputGainDb: Float = 0f,
    val noiseGateDb: Float = -60f,
    val compression: Float = 0.15f,
    val monitorEnabled: Boolean = false,
    val monitorVolume: Float = 0.45f,
    val monitorHeadphonesOnly: Boolean = true
)

data class BroadcastMixerChannelProfile(
    val volume: Float = 1f,
    val muted: Boolean = false
) {
    fun effectiveVolume(): Float = if (muted) 0f else volume.coerceIn(0f, 1f)
}

data class BroadcastMixerProfile(
    val mic: BroadcastMixerChannelProfile = BroadcastMixerChannelProfile(),
    val appAudio: BroadcastMixerChannelProfile = BroadcastMixerChannelProfile(volume = 0.85f),
    val chatReadout: BroadcastMixerChannelProfile = BroadcastMixerChannelProfile(volume = 0.85f)
)

object LiveCasterSession {
    private data class EndpointParts(val endpoint: String, val streamKey: String)

    private val streamKeyPlaceholder = Regex("\\{stream_key\\}", RegexOption.IGNORE_CASE)
    private val bearerTokenPattern = Regex("\\b(Bearer|OAuth)\\s+[A-Za-z0-9._~+/=-]{12,}", RegexOption.IGNORE_CASE)
    private val authorizationHeaderPattern = Regex("\\b(Authorization\\s*:\\s*)(Bearer|OAuth)\\s+[^\\s,;]+", RegexOption.IGNORE_CASE)
    private val listeners = mutableSetOf<(WritableMap) -> Unit>()

    var status: LiveCasterStatus = LiveCasterStatus.Idle
        private set
    var health: LiveCasterHealth = LiveCasterHealth()
        private set
    var profile: LiveCasterProfile? = null
        private set
    var renderGraphJson: String = "[]"
        private set
    var nativeRuntime: NativeRuntimeTelemetry? = null
        private set
    var captureResultCode: Int? = null
        private set
    var captureData: Intent? = null
        private set
    private var startedAtMillis: Long? = null

    fun addListener(listener: (WritableMap) -> Unit) {
        listeners.add(listener)
        listener(snapshot())
    }

    fun removeListener(listener: (WritableMap) -> Unit) {
        listeners.remove(listener)
    }

    fun prepare(renderGraphJson: String, profileJson: String) {
        val parsedProfile = parseProfile(profileJson)
        this.renderGraphJson = renderGraphJson
        profile = parsedProfile
        captureResultCode = null
        captureData = null
        startedAtMillis = null
        nativeRuntime = null
        setStatus(LiveCasterStatus.Preparing, "Waiting for screen capture permission")
    }

    fun updateScene(renderGraphJson: String) {
        this.renderGraphJson = renderGraphJson
    }

    fun updateQuality(profileJson: String): LiveCasterProfile {
        val currentProfile = profile ?: throw IllegalStateException("Stream profile is missing")
        val nextProfile = parseProfile(profileJson)
        require(nextProfile.endpoint == currentProfile.endpoint && nextProfile.streamKey == currentProfile.streamKey) {
            "Quality update cannot change the stream destination"
        }

        val updatedProfile = currentProfile.copy(
            width = nextProfile.width,
            height = nextProfile.height,
            fps = nextProfile.fps,
            videoBitrate = nextProfile.videoBitrate,
            audioBitrate = nextProfile.audioBitrate,
            micEffects = nextProfile.micEffects,
            broadcastMixer = nextProfile.broadcastMixer
        )
        profile = updatedProfile
        updateHealth(
            fps = updatedProfile.fps,
            message = "Quality target updated to ${updatedProfile.videoBitrate / 1000} kbps / ${updatedProfile.fps}fps"
        )
        return updatedProfile
    }

    fun storeCaptureConsent(resultCode: Int, data: Intent) {
        captureResultCode = resultCode
        captureData = data
    }

    fun markStarting() {
        setStatus(LiveCasterStatus.Preparing, "Starting Android screen encoder")
    }

    fun markLive(message: String = "Live") {
        startedAtMillis = startedAtMillis ?: System.currentTimeMillis()
        status = LiveCasterStatus.Live
        updateHealth(reconnectAttempts = 0, message = message)
    }

    fun markReconnecting(attempt: Int = health.reconnectAttempts + 1, message: String = "Reconnecting") {
        status = LiveCasterStatus.Reconnecting
        health = health.copy(reconnectAttempts = attempt.coerceAtLeast(1), message = message)
        emit()
    }

    fun markStopping() {
        setStatus(LiveCasterStatus.Stopping, "Stopping")
    }

    fun markStopped() {
        status = LiveCasterStatus.Idle
        health = LiveCasterHealth(message = "Ready")
        startedAtMillis = null
        nativeRuntime = null
        captureResultCode = null
        captureData = null
        emit()
    }

    fun fail(message: String) {
        val safeMessage = redactSensitiveText(message)
        status = LiveCasterStatus.Failed
        health = health.copy(message = safeMessage)
        startedAtMillis = null
        nativeRuntime = nativeRuntime?.let { current ->
            NativeRuntimeTelemetry(
                runtimeStatus = status.jsValue,
                elapsedSeconds = health.elapsedSeconds,
                videoFrames = current.videoFrames,
                encodedBytes = current.encodedBytes,
                droppedFrames = health.droppedFrames.toLong(),
                publisher = current.publisher.copy(
                    state = "failed",
                    reconnectAttempts = health.reconnectAttempts,
                    lastError = safeMessage
                ),
                composition = current.composition,
                audioProcessing = current.audioProcessing,
                message = safeMessage
            )
        }
        emit()
    }

    fun updateNativeRuntime(
        publisherState: String? = null,
        compositionResult: AndroidCompositionResult? = null,
        videoFrames: Long? = null,
        encodedBytes: Long? = null,
        sentVideoFrames: Long? = null,
        sentAudioFrames: Long? = null,
        droppedVideoFrames: Long? = null,
        droppedAudioFrames: Long? = null,
        bytesWritten: Long? = null,
        cacheSize: Int? = null,
        itemsInCache: Int? = null,
        congested: Boolean? = null,
        lastError: String? = null,
        audioProcessing: NativeRuntimeAudioProcessing? = null,
        message: String = health.message
    ) {
        val current = nativeRuntime
        val composition = compositionResult?.toNativeRuntimeComposition()
            ?: current?.composition
            ?: NativeRuntimeComposition()
        val publisher = current?.publisher ?: NativeRuntimePublisher()
        val nextPublisher = publisher.copy(
            state = publisherState ?: publisher.state,
            reconnectAttempts = health.reconnectAttempts,
            sentVideoFrames = sentVideoFrames ?: publisher.sentVideoFrames,
            sentAudioFrames = sentAudioFrames ?: publisher.sentAudioFrames,
            droppedVideoFrames = droppedVideoFrames ?: publisher.droppedVideoFrames,
            droppedAudioFrames = droppedAudioFrames ?: publisher.droppedAudioFrames,
            bytesWritten = bytesWritten ?: publisher.bytesWritten,
            cacheSize = cacheSize ?: publisher.cacheSize,
            itemsInCache = itemsInCache ?: publisher.itemsInCache,
            congested = congested ?: publisher.congested,
            lastError = redactSensitiveText(lastError ?: publisher.lastError)
        )
        nativeRuntime = NativeRuntimeTelemetry(
            runtimeStatus = status.jsValue,
            elapsedSeconds = health.elapsedSeconds,
            videoFrames = videoFrames ?: current?.videoFrames ?: 0,
            encodedBytes = encodedBytes ?: current?.encodedBytes ?: 0,
            droppedFrames = droppedVideoFrames ?: current?.droppedFrames ?: health.droppedFrames.toLong(),
            publisher = nextPublisher,
            composition = composition,
            audioProcessing = audioProcessing ?: current?.audioProcessing,
            message = redactSensitiveText(message)
        )
        emit()
    }

    fun updateHealth(
        bitrateKbps: Int = health.bitrateKbps,
        droppedFrames: Int = health.droppedFrames,
        fps: Int = profile?.fps ?: health.fps,
        reconnectAttempts: Int = health.reconnectAttempts,
        message: String = health.message
    ) {
        val elapsed = startedAtMillis?.let { ((System.currentTimeMillis() - it) / 1000).toInt().coerceAtLeast(0) } ?: 0
        health = LiveCasterHealth(
            bitrateKbps = bitrateKbps,
            droppedFrames = droppedFrames,
            fps = fps,
            elapsedSeconds = elapsed,
            reconnectAttempts = reconnectAttempts,
            message = redactSensitiveText(message)
        )
        emit()
    }

    fun snapshot(): WritableMap {
        val healthMap = Arguments.createMap().apply {
            putInt("bitrateKbps", health.bitrateKbps)
            putInt("droppedFrames", health.droppedFrames)
            putInt("fps", health.fps)
            putInt("elapsedSeconds", health.elapsedSeconds)
            putInt("reconnectAttempts", health.reconnectAttempts)
            putString("message", health.message)
        }
        val stateMap = Arguments.createMap().apply {
            putString("status", status.jsValue)
            putDouble("startedAt", startedAtMillis?.toDouble() ?: 0.0)
            putMap("health", healthMap.copy())
            if (status == LiveCasterStatus.Failed) putString("error", health.message)
        }
        return Arguments.createMap().apply {
            putString("platform", "android")
            putMap("state", stateMap)
            putMap("health", healthMap)
            nativeRuntime?.let { putMap("nativeRuntime", it.asWritableMap()) }
        }
    }

    private fun setStatus(nextStatus: LiveCasterStatus, message: String) {
        status = nextStatus
        health = health.copy(message = redactSensitiveText(message))
        emit()
    }

    private fun emit() {
        val snapshot = snapshot()
        listeners.forEach { listener -> listener(snapshot.copy()) }
    }

    private fun parseProfile(profileJson: String): LiveCasterProfile {
        val root = JSONObject(profileJson)
        val destination = root.getJSONObject("destination")
        val quality = root.getJSONObject("quality")
        val micEffects = parseMicEffects(root.optJSONObject("micEffects"))
        val broadcastMixer = parseBroadcastMixer(root.optJSONObject("broadcastMixer"))
        val endpointParts = buildEndpointParts(
            destination.getString("serverUrl"),
            destination.optString("streamKey", "")
        )

        require(endpointParts.endpoint.startsWith("rtmp://") || endpointParts.endpoint.startsWith("rtmps://")) {
            "Only RTMP and RTMPS endpoints are supported"
        }

        return LiveCasterProfile(
            endpoint = endpointParts.endpoint,
            streamKey = endpointParts.streamKey,
            width = quality.getInt("width"),
            height = quality.getInt("height"),
            fps = quality.getInt("fps"),
            videoBitrate = quality.getInt("videoBitrateKbps") * 1000,
            audioBitrate = quality.getInt("audioBitrateKbps") * 1000,
            micEffects = micEffects,
            broadcastMixer = broadcastMixer
        )
    }

    private fun parseMicEffects(micEffects: JSONObject?): MicEffectsProfile {
        if (micEffects == null) {
            return MicEffectsProfile()
        }

        return MicEffectsProfile(
            enabled = micEffects.optBoolean("enabled", false),
            presetId = micEffects.optString("presetId", "clean"),
            inputGainDb = micEffects.optDouble("inputGainDb", 0.0).toFloat().coerceIn(-12f, 12f),
            noiseGateDb = micEffects.optDouble("noiseGateDb", -60.0).toFloat().coerceIn(-70f, -25f),
            compression = micEffects.optDouble("compression", 0.15).toFloat().coerceIn(0f, 1f),
            monitorEnabled = micEffects.optBoolean("monitorEnabled", false),
            monitorVolume = micEffects.optDouble("monitorVolume", 0.45).toFloat().coerceIn(0f, 1f),
            monitorHeadphonesOnly = micEffects.optBoolean("monitorHeadphonesOnly", true)
        )
    }

    private fun parseBroadcastMixer(mixer: JSONObject?): BroadcastMixerProfile {
        if (mixer == null) {
            return BroadcastMixerProfile()
        }
        return BroadcastMixerProfile(
            mic = parseBroadcastMixerChannel(mixer.optJSONObject("mic"), BroadcastMixerChannelProfile()),
            appAudio = parseBroadcastMixerChannel(mixer.optJSONObject("appAudio"), BroadcastMixerChannelProfile(volume = 0.85f)),
            chatReadout = parseBroadcastMixerChannel(mixer.optJSONObject("chatReadout"), BroadcastMixerChannelProfile(volume = 0.85f))
        )
    }

    private fun parseBroadcastMixerChannel(channel: JSONObject?, fallback: BroadcastMixerChannelProfile): BroadcastMixerChannelProfile {
        if (channel == null) {
            return fallback
        }
        return BroadcastMixerChannelProfile(
            volume = channel.optDouble("volume", fallback.volume.toDouble()).toFloat().coerceIn(0f, 1f),
            muted = channel.optBoolean("muted", fallback.muted)
        )
    }

    private fun buildEndpoint(serverUrl: String, streamKey: String): String {
        return buildEndpointParts(serverUrl, streamKey).endpoint
    }

    private fun buildEndpointParts(serverUrl: String, streamKey: String): EndpointParts {
        var normalizedServerUrl = serverUrl.trim().trimEnd('/')
        var normalizedStreamKey = normalizeStreamKeyForServer(normalizedServerUrl, streamKey)

        splitPublishUrl(normalizedStreamKey)?.let { parts ->
            normalizedServerUrl = parts.endpoint
            normalizedStreamKey = parts.streamKey
        }

        require(normalizedStreamKey.isNotEmpty()) {
            "Stream key is required"
        }

        if (normalizedServerUrl.endsWith("/$normalizedStreamKey")) {
            return EndpointParts(normalizedServerUrl, normalizedStreamKey)
        }

        if (streamKeyPlaceholder.containsMatchIn(normalizedServerUrl)) {
            return EndpointParts(streamKeyPlaceholder.replace(normalizedServerUrl) { normalizedStreamKey }, normalizedStreamKey)
        }

        return EndpointParts("$normalizedServerUrl/$normalizedStreamKey", normalizedStreamKey)
    }

    private fun splitPublishUrl(value: String): EndpointParts? {
        val normalized = value.trim()
        if (!normalized.startsWith("rtmp://", ignoreCase = true) && !normalized.startsWith("rtmps://", ignoreCase = true)) {
            return null
        }

        return try {
            val uri = URI(normalized)
            val scheme = uri.scheme?.lowercase()
            val host = uri.host
            if ((scheme != "rtmp" && scheme != "rtmps") || host.isNullOrBlank()) {
                return null
            }

            val segments = uri.path
                ?.trim('/')
                ?.split('/')
                ?.filter { it.isNotEmpty() }
                ?: emptyList()
            if (segments.size < 2) {
                return null
            }

            val port = if (uri.port >= 0) ":${uri.port}" else ""
            val endpointPath = segments.dropLast(1).joinToString("/")
            val query = uri.rawQuery?.takeIf { it.isNotBlank() }?.let { "?$it" } ?: ""
            val endpoint = "$scheme://$host$port/$endpointPath"
            val extractedStreamKey = "${segments.last()}$query"
            EndpointParts(endpoint, extractedStreamKey)
        } catch (_: Exception) {
            null
        }
    }

    private fun redactSensitiveText(value: String): String {
        if (value.isBlank()) {
            return value
        }

        val currentProfile = profile
        val secretCandidates = listOfNotNull(
            currentProfile?.endpoint,
            currentProfile?.streamKey
        ).filter { it.length >= 4 }

        return secretCandidates
            .fold(value) { message, secret -> message.replace(secret, "[redacted]") }
            .replace(authorizationHeaderPattern) { "${it.groupValues[1]}${it.groupValues[2]} [redacted]" }
            .replace(bearerTokenPattern) { "${it.groupValues[1]} [redacted]" }
    }

    private fun normalizeStreamKeyForServer(serverUrl: String, streamKey: String): String {
        val normalizedStreamKey = streamKey.trim().trimStart('/')
        val lastServerPathSegment = getLastServerPathSegment(serverUrl)

        if (
            lastServerPathSegment != null &&
            normalizedStreamKey.lowercase().startsWith("${lastServerPathSegment.lowercase()}/")
        ) {
            return normalizedStreamKey.substring(lastServerPathSegment.length + 1)
        }

        return normalizedStreamKey
    }

    private fun getLastServerPathSegment(serverUrl: String): String? {
        val staticServerUrl = streamKeyPlaceholder.replace(serverUrl) { "" }.trimEnd('/')
        val schemeIndex = staticServerUrl.indexOf("://")
        val pathStart = if (schemeIndex >= 0) {
            staticServerUrl.indexOf('/', schemeIndex + 3)
        } else {
            staticServerUrl.indexOf('/')
        }

        if (pathStart < 0) {
            return null
        }

        return staticServerUrl
            .substring(pathStart)
            .trim('/')
            .split('/')
            .filter { it.isNotEmpty() }
            .lastOrNull()
    }
}
