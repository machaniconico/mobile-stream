package com.mobilelivecaster.streaming

import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
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
    val message: String = ""
) {
    fun asWritableMap(): WritableMap = Arguments.createMap().apply {
        putString("status", status)
        putInt("appliedCount", appliedCount)
        putInt("skippedCount", skippedCount)
        putArray("skippedKinds", skippedKinds.toWritableArray())
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
    val width: Int,
    val height: Int,
    val fps: Int,
    val videoBitrate: Int,
    val audioBitrate: Int,
    val micEffects: MicEffectsProfile
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

object LiveCasterSession {
    private val streamKeyPlaceholder = Regex("\\{stream_key\\}", RegexOption.IGNORE_CASE)
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
        status = LiveCasterStatus.Failed
        health = health.copy(message = message)
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
                    lastError = message
                ),
                composition = current.composition,
                message = message
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
            lastError = lastError ?: publisher.lastError
        )
        nativeRuntime = NativeRuntimeTelemetry(
            runtimeStatus = status.jsValue,
            elapsedSeconds = health.elapsedSeconds,
            videoFrames = videoFrames ?: current?.videoFrames ?: 0,
            encodedBytes = encodedBytes ?: current?.encodedBytes ?: 0,
            droppedFrames = droppedVideoFrames ?: current?.droppedFrames ?: health.droppedFrames.toLong(),
            publisher = nextPublisher,
            composition = composition,
            message = message
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
            message = message
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
        health = health.copy(message = message)
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
        val endpoint = buildEndpoint(
            destination.getString("serverUrl"),
            destination.optString("streamKey", "")
        )

        require(endpoint.startsWith("rtmp://") || endpoint.startsWith("rtmps://")) {
            "Only RTMP and RTMPS endpoints are supported"
        }

        return LiveCasterProfile(
            endpoint = endpoint,
            width = quality.getInt("width"),
            height = quality.getInt("height"),
            fps = quality.getInt("fps"),
            videoBitrate = quality.getInt("videoBitrateKbps") * 1000,
            audioBitrate = quality.getInt("audioBitrateKbps") * 1000,
            micEffects = micEffects
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

    private fun buildEndpoint(serverUrl: String, streamKey: String): String {
        val normalizedServerUrl = serverUrl.trim().trimEnd('/')
        val normalizedStreamKey = normalizeStreamKeyForServer(normalizedServerUrl, streamKey)

        require(normalizedStreamKey.isNotEmpty()) {
            "Stream key is required"
        }

        if (normalizedServerUrl.endsWith("/$normalizedStreamKey")) {
            return normalizedServerUrl
        }

        if (streamKeyPlaceholder.containsMatchIn(normalizedServerUrl)) {
            return streamKeyPlaceholder.replace(normalizedServerUrl) { normalizedStreamKey }
        }

        return "$normalizedServerUrl/$normalizedStreamKey"
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
