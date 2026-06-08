package com.mobilelivecaster.streaming

import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import org.json.JSONObject

data class LiveCasterHealth(
    val bitrateKbps: Int = 0,
    val droppedFrames: Int = 0,
    val fps: Int = 0,
    val elapsedSeconds: Int = 0,
    val message: String = "Ready"
)

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
        updateHealth(message = message)
    }

    fun markReconnecting() {
        setStatus(LiveCasterStatus.Reconnecting, "Reconnecting")
    }

    fun markStopping() {
        setStatus(LiveCasterStatus.Stopping, "Stopping")
    }

    fun markStopped() {
        status = LiveCasterStatus.Idle
        health = LiveCasterHealth(message = "Ready")
        startedAtMillis = null
        captureResultCode = null
        captureData = null
        emit()
    }

    fun fail(message: String) {
        status = LiveCasterStatus.Failed
        health = health.copy(message = message)
        startedAtMillis = null
        emit()
    }

    fun updateHealth(
        bitrateKbps: Int = health.bitrateKbps,
        droppedFrames: Int = health.droppedFrames,
        fps: Int = profile?.fps ?: health.fps,
        message: String = health.message
    ) {
        val elapsed = startedAtMillis?.let { ((System.currentTimeMillis() - it) / 1000).toInt().coerceAtLeast(0) } ?: 0
        health = LiveCasterHealth(
            bitrateKbps = bitrateKbps,
            droppedFrames = droppedFrames,
            fps = fps,
            elapsedSeconds = elapsed,
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
