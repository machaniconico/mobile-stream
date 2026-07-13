package com.mobilelivecaster.streaming

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import com.mobilelivecaster.R
import com.pedro.common.ConnectChecker
import com.pedro.encoder.input.sources.audio.MicrophoneSource
import com.pedro.encoder.input.sources.video.NoVideoSource
import com.pedro.encoder.input.sources.video.ScreenSource
import com.pedro.library.generic.GenericStream
import kotlin.math.min

class MediaProjectionService : Service(), ConnectChecker {
    companion object {
        const val ACTION_START_STREAM = "com.mobilelivecaster.streaming.START_STREAM"
        const val ACTION_STOP_STREAM = "com.mobilelivecaster.streaming.STOP_STREAM"
        const val ACTION_RECONNECT_STREAM = "com.mobilelivecaster.streaming.RECONNECT_STREAM"
        const val ACTION_UPDATE_QUALITY = "com.mobilelivecaster.streaming.UPDATE_QUALITY"
        const val ACTION_UPDATE_SCENE = "com.mobilelivecaster.streaming.UPDATE_SCENE"
        private const val CHANNEL_ID = "mobile_live_caster_stream"
        private const val NOTIFICATION_ID = 4309
        private const val MAX_RECONNECT_ATTEMPTS = 5
        private const val INITIAL_RECONNECT_DELAY_MS = 1_500L
        private const val MAX_RECONNECT_DELAY_MS = 15_000L
        private const val CONTINUITY_HEARTBEAT_INTERVAL_MS = 1_000L
    }

    private var mediaProjection: MediaProjection? = null
    private var genericStream: GenericStream? = null
    private var directMediaCodecStream: AndroidMediaCodecDirectStream? = null
    private var micProcessingEffect: MicProcessingEffect? = null
    private var nativeCompositionResult: AndroidCompositionResult? = null
    private val reconnectHandler = Handler(Looper.getMainLooper())
    private val continuityHandler = Handler(Looper.getMainLooper())
    private var reconnectAttempts = 0
    private var userRequestedStop = false
    private var terminalFailure = false
    private var estimatedBytesWritten = 0L
    private var lastBitrateSampleAtMs: Long? = null
    private var lastKnownBitrate = 0L
    private var lastNativeFps = 0
    private val videoFrameIntervalTracker = VideoFrameIntervalTracker()
    private val mediaContinuityTracker = MediaContinuityTracker()
    private val deviceResourceMonitor by lazy { DeviceResourceMonitor(applicationContext) }
    private val mediaProjectionManager: MediaProjectionManager by lazy {
        applicationContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    }
    private val continuityHeartbeat = object : Runnable {
        override fun run() {
            if (userRequestedStop || terminalFailure || (genericStream == null && directMediaCodecStream == null)) {
                return
            }
            updateNativeRuntimeFromActiveStream(message = LiveCasterSession.health.message)
            continuityHandler.postDelayed(this, CONTINUITY_HEARTBEAT_INTERVAL_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_STREAM -> startStreamFromSession()
            ACTION_STOP_STREAM -> stopStream()
            ACTION_RECONNECT_STREAM -> reconnectStream()
            ACTION_UPDATE_QUALITY -> updateStreamQuality()
            ACTION_UPDATE_SCENE -> updateStreamScene()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        reconnectHandler.removeCallbacksAndMessages(null)
        stopContinuityHeartbeat()
        releaseStreamResources()
        super.onDestroy()
    }

    private fun startStreamFromSession(resetReconnectAttempts: Boolean = true) {
        val profile = LiveCasterSession.profile
        val resultCode = LiveCasterSession.captureResultCode
        val captureData = LiveCasterSession.captureData

        if (profile == null || resultCode == null || captureData == null) {
            LiveCasterSession.fail("Screen capture consent or stream profile is missing")
            stopSelf()
            return
        }

        try {
            userRequestedStop = false
            terminalFailure = false
            if (resetReconnectAttempts) {
                reconnectAttempts = 0
                resetNativeRuntimeCounters()
            }
            startForegroundCompat()
            val encoderProbe = AndroidMediaCodecProbe.inspect(profile)
            LiveCasterSession.updateNativeRuntime(
                publisherState = "preparing",
                encoderProbe = encoderProbe,
                continuity = mediaContinuityTracker.record(null, null, active = false),
                device = deviceResourceMonitor.snapshot(),
                message = encoderProbe.message
            )
            val projection = mediaProjectionManager.getMediaProjection(resultCode, captureData)
                ?: throw IllegalStateException("Could not create MediaProjection")
            mediaProjection?.stop()
            mediaProjection = projection

            if (profile.androidPublisherMode == "mediacodec") {
                startDirectMediaCodecStream(projection, profile)
                return
            }

            val microphoneSource = MicrophoneSource()
            micProcessingEffect?.release()
            micProcessingEffect = MicProcessingEffect(applicationContext, profile.micEffects, profile.broadcastMixer).also { effect ->
                microphoneSource.setAudioEffect(effect)
            }

            val stream = GenericStream(baseContext, this, NoVideoSource(), microphoneSource).apply {
                getGlInterface().setForceRender(true, profile.fps)
                setFpsListener { fps ->
                    lastNativeFps = fps
                    LiveCasterSession.updateHealth(fps = fps, message = LiveCasterSession.health.message)
                    updateNativeRuntimeFromStream(message = LiveCasterSession.health.message)
                }
            }
            genericStream?.release()
            genericStream = stream

            val preparedVideo = stream.prepareVideo(
                profile.width,
                profile.height,
                profile.videoBitrate,
                fps = profile.fps,
                rotation = 0
            )
            val preparedAudio = stream.prepareAudio(
                sampleRate = 44100,
                isStereo = true,
                bitrate = profile.audioBitrate,
                echoCanceler = true,
                noiseSuppressor = true
            )
            if (!preparedVideo || !preparedAudio) {
                throw IllegalStateException("Encoder prepare failed")
            }

            nativeCompositionResult = AndroidSceneCompositor.apply(
                applicationContext,
                stream,
                LiveCasterSession.renderGraphJson
            )
            updateNativeRuntimeFromStream(
                publisherState = "preparing",
                compositionResult = nativeCompositionResult,
                message = liveMessage("Preparing native stream")
            )
            stream.changeVideoSource(ScreenSource(applicationContext, projection))
            stream.startStream(profile.endpoint)
            if (LiveCasterSession.status == LiveCasterStatus.Reconnecting) {
                LiveCasterSession.updateHealth(
                    reconnectAttempts = reconnectAttempts,
                    message = liveMessage("Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})")
                )
            } else {
                LiveCasterSession.markLive(liveMessage("Connecting"))
            }
            startContinuityHeartbeat()
        } catch (error: Throwable) {
            val message = error.message ?: "Android screen stream failed"
            if (LiveCasterSession.status == LiveCasterStatus.Reconnecting) {
                scheduleReconnect(message)
            } else {
                stopStreamAfterFailure(message)
            }
        }
    }

    private fun startDirectMediaCodecStream(projection: MediaProjection, profile: LiveCasterProfile) {
        genericStream?.release()
        genericStream = null
        micProcessingEffect?.release()
        micProcessingEffect = null
        val directComposition = AndroidSceneCompositor.prepareCanvas(applicationContext, LiveCasterSession.renderGraphJson)
        nativeCompositionResult = directComposition.result
        val directStream = AndroidMediaCodecDirectStream(applicationContext, this)
        directMediaCodecStream?.stop()
        directMediaCodecStream = directStream
        lastNativeFps = profile.fps
        updateNativeRuntimeFromDirectStream(
            publisherState = "preparing",
            compositionResult = nativeCompositionResult,
            message = liveMessage("Preparing direct MediaCodec stream")
        )
        directStream.start(projection, profile, directComposition)
        if (LiveCasterSession.status == LiveCasterStatus.Reconnecting) {
            LiveCasterSession.updateHealth(
                reconnectAttempts = reconnectAttempts,
                message = liveMessage("Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})")
            )
        } else {
            LiveCasterSession.markLive(liveMessage("Connecting"))
        }
        updateNativeRuntimeFromDirectStream(publisherState = "connecting", message = LiveCasterSession.health.message)
        startContinuityHeartbeat()
    }

    private fun updateStreamScene() {
        val directStream = directMediaCodecStream
        if (directStream != null) {
            val composition = AndroidSceneCompositor.prepareCanvas(applicationContext, LiveCasterSession.renderGraphJson)
            nativeCompositionResult = composition.result
            directStream.updateComposition(composition)
            val message = liveMessage("Live scene updated")
            LiveCasterSession.updateHealth(message = message)
            updateNativeRuntimeFromDirectStream(
                publisherState = directStream.snapshot().publisherState,
                compositionResult = nativeCompositionResult,
                message = message
            )
            return
        }

        val stream = genericStream ?: return
        nativeCompositionResult = AndroidSceneCompositor.apply(
            applicationContext,
            stream,
            LiveCasterSession.renderGraphJson
        )
        val message = liveMessage("Live scene updated")
        LiveCasterSession.updateHealth(message = message)
        updateNativeRuntimeFromStream(
            compositionResult = nativeCompositionResult,
            message = message
        )
    }

    private fun reconnectStream() {
        userRequestedStop = false
        terminalFailure = false
        reconnectHandler.removeCallbacksAndMessages(null)
        if (LiveCasterSession.status != LiveCasterStatus.Reconnecting) {
            reconnectAttempts = (reconnectAttempts + 1).coerceAtLeast(1)
            LiveCasterSession.markReconnecting(reconnectAttempts, "Reconnecting")
        } else {
            reconnectAttempts = reconnectAttempts.coerceAtLeast(LiveCasterSession.health.reconnectAttempts)
        }

        val stream = genericStream
        val directStream = directMediaCodecStream
        val endpoint = LiveCasterSession.profile?.endpoint
        if (directStream != null) {
            directStream.stop()
            directMediaCodecStream = null
            startStreamFromSession(resetReconnectAttempts = false)
            return
        }
        if (stream == null || endpoint == null) {
            startStreamFromSession(resetReconnectAttempts = false)
            return
        }
        try {
            if (stream.isStreaming) stream.stopStream()
            stream.startStream(endpoint)
            LiveCasterSession.updateHealth(
                reconnectAttempts = reconnectAttempts,
                message = "Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})"
            )
            updateNativeRuntimeFromStream(publisherState = "reconnecting", message = LiveCasterSession.health.message)
        } catch (error: Throwable) {
            scheduleReconnect(error.message ?: "Reconnect failed")
        }
    }

    private fun stopStream() {
        userRequestedStop = true
        terminalFailure = false
        reconnectHandler.removeCallbacksAndMessages(null)
        reconnectAttempts = 0
        stopContinuityHeartbeat()
        captureFinalContinuitySample()
        releaseStreamResources()
        LiveCasterSession.markStopped()
        stopSelf()
    }

    private fun updateStreamQuality() {
        val profile = LiveCasterSession.profile ?: return
        val directStream = directMediaCodecStream
        if (directStream != null) {
            directStream.updateProfile(profile)
            lastNativeFps = profile.fps
            val message = liveMessage("Live quality updated to ${profile.videoBitrate / 1000} kbps / ${profile.fps}fps")
            LiveCasterSession.updateHealth(
                fps = profile.fps,
                message = message
            )
            updateNativeRuntimeFromDirectStream(
                publisherState = directStream.snapshot().publisherState,
                message = message
            )
            return
        }
        val stream = genericStream ?: return

        try {
            stream.setVideoBitrateOnFly(profile.videoBitrate)
            stream.getGlInterface().setForceRender(true, profile.fps)
            micProcessingEffect?.updateProfile(profile.micEffects, profile.broadcastMixer)
            stream.requestKeyframe()
            lastNativeFps = profile.fps
            val message = liveMessage("Live quality updated to ${profile.videoBitrate / 1000} kbps / ${profile.fps}fps")
            LiveCasterSession.updateHealth(
                fps = profile.fps,
                message = message
            )
            updateNativeRuntimeFromStream(
                message = message
            )
        } catch (error: Throwable) {
            updateNativeRuntimeFromStream(
                lastError = error.message ?: "Live quality update failed",
                message = LiveCasterSession.health.message
            )
        }
    }

    private fun resetNativeRuntimeCounters() {
        estimatedBytesWritten = 0L
        lastBitrateSampleAtMs = null
        lastKnownBitrate = 0L
        lastNativeFps = 0
        videoFrameIntervalTracker.reset()
        mediaContinuityTracker.reset()
    }

    private fun recordBitrateSample(bitrate: Long): Long {
        val normalizedBitrate = bitrate.coerceAtLeast(0L)
        val now = System.currentTimeMillis()
        val previousAt = lastBitrateSampleAtMs
        if (previousAt != null) {
            val elapsedMs = (now - previousAt).coerceAtLeast(0L)
            val effectiveBitrate = if (lastKnownBitrate > 0L) {
                (lastKnownBitrate + normalizedBitrate) / 2L
            } else {
                normalizedBitrate
            }
            estimatedBytesWritten += ((effectiveBitrate * elapsedMs) / 8_000L).coerceAtLeast(0L)
        }
        lastKnownBitrate = normalizedBitrate
        lastBitrateSampleAtMs = now
        return estimatedBytesWritten
    }

    private fun currentDroppedVideoFrames(): Int {
        directMediaCodecStream?.snapshot()?.let { directSnapshot ->
            return directSnapshot.droppedVideoFrames.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
        }
        val dropped = genericStream?.getStreamClient()?.getDroppedVideoFrames()
            ?: LiveCasterSession.health.droppedFrames.toLong()
        return dropped.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    }

    private fun updateNativeRuntimeFromActiveStream(
        publisherState: String? = null,
        encodedBytes: Long? = null,
        bytesWritten: Long? = null,
        lastError: String? = null,
        message: String = LiveCasterSession.health.message
    ) {
        if (directMediaCodecStream != null) {
            updateNativeRuntimeFromDirectStream(
                publisherState = publisherState,
                encodedBytes = encodedBytes,
                bytesWritten = bytesWritten,
                lastError = lastError,
                message = message
            )
        } else {
            updateNativeRuntimeFromStream(
                publisherState = publisherState,
                encodedBytes = encodedBytes,
                bytesWritten = bytesWritten,
                lastError = lastError,
                message = message
            )
        }
    }

    private fun updateNativeRuntimeFromDirectStream(
        publisherState: String? = null,
        compositionResult: AndroidCompositionResult? = null,
        encodedBytes: Long? = null,
        bytesWritten: Long? = null,
        lastError: String? = null,
        message: String = LiveCasterSession.health.message
    ) {
        val snapshot = directMediaCodecStream?.snapshot()
        val resolvedPublisherState = publisherState
            ?: snapshot?.publisherState
            ?: LiveCasterSession.nativeRuntime?.publisher?.state
            ?: ""
        val continuity = mediaContinuityTracker.record(
            snapshot?.sentVideoFrames,
            snapshot?.sentAudioFrames,
            active = LiveCasterSession.status == LiveCasterStatus.Live && resolvedPublisherState == "published"
        )
        val videoFrameInterval = videoFrameIntervalTracker.record(snapshot?.sentVideoFrames)
        LiveCasterSession.updateNativeRuntime(
            publisherState = resolvedPublisherState,
            compositionResult = compositionResult ?: nativeCompositionResult,
            runtimeCompositorBackend = snapshot?.runtimeCompositorBackend,
            runtimeCompositedFrameCount = snapshot?.runtimeCompositedFrameCount,
            runtimeDroppedFrameCount = snapshot?.runtimeDroppedFrameCount,
            runtimeCompositionFailureCount = snapshot?.runtimeCompositionFailureCount,
            videoFrames = snapshot?.videoFrames,
            encodedBytes = encodedBytes ?: snapshot?.encodedBytes,
            sentVideoFrames = snapshot?.sentVideoFrames,
            sentAudioFrames = snapshot?.sentAudioFrames,
            videoEncoderBackend = snapshot?.videoEncoderBackend ?: AndroidMediaCodecRtmpPublisher.VIDEO_BACKEND,
            audioEncoderBackend = snapshot?.audioEncoderBackend ?: AndroidMediaCodecRtmpPublisher.AUDIO_BACKEND,
            droppedVideoFrames = snapshot?.droppedVideoFrames,
            droppedAudioFrames = snapshot?.droppedAudioFrames,
            bytesWritten = bytesWritten ?: snapshot?.encodedBytes,
            videoFrameIntervalSampleCount = videoFrameInterval.sampleCount,
            videoFrameIntervalAverageMs = videoFrameInterval.averageMs,
            videoFrameIntervalMaxMs = videoFrameInterval.maxMs,
            videoFrameIntervalJitterMs = videoFrameInterval.jitterMs,
            cacheSize = snapshot?.cacheSize,
            itemsInCache = snapshot?.itemsInCache,
            congested = snapshot?.congested,
            lastError = lastError ?: snapshot?.lastError,
            audioProcessing = snapshot?.audioProcessing,
            continuity = continuity,
            device = deviceResourceMonitor.snapshot(),
            message = message
        )
    }

    private fun updateNativeRuntimeFromStream(
        publisherState: String? = null,
        compositionResult: AndroidCompositionResult? = null,
        encodedBytes: Long? = null,
        bytesWritten: Long? = null,
        lastError: String? = null,
        message: String = LiveCasterSession.health.message
    ) {
        val client = genericStream?.getStreamClient()
        val sentVideoFrames = client?.getSentVideoFrames()
        val sentAudioFrames = client?.getSentAudioFrames()
        val droppedVideoFrames = client?.getDroppedVideoFrames()
        val droppedAudioFrames = client?.getDroppedAudioFrames()
        val previousPublisherState = LiveCasterSession.nativeRuntime?.publisher?.state.orEmpty()
        val resolvedPublisherState = publisherState
            ?: previousPublisherState.takeIf { it.isNotBlank() }
            ?: if (genericStream?.isStreaming == true) "connecting" else ""
        val continuity = mediaContinuityTracker.record(
            sentVideoFrames,
            sentAudioFrames,
            active = LiveCasterSession.status == LiveCasterStatus.Live && resolvedPublisherState == "published"
        )
        val videoFrameInterval = videoFrameIntervalTracker.record(sentVideoFrames)
        val estimatedBytes = estimatedBytesWritten.takeIf { it > 0L }
        LiveCasterSession.updateNativeRuntime(
            publisherState = resolvedPublisherState,
            compositionResult = compositionResult,
            runtimeCompositorBackend = "rootencoder-gl",
            runtimeCompositedFrameCount = sentVideoFrames,
            runtimeDroppedFrameCount = droppedVideoFrames,
            runtimeCompositionFailureCount = 0L,
            videoFrames = sentVideoFrames,
            encodedBytes = encodedBytes ?: estimatedBytes,
            sentVideoFrames = sentVideoFrames,
            sentAudioFrames = sentAudioFrames,
            videoEncoderBackend = "rootencoder",
            audioEncoderBackend = "rootencoder",
            droppedVideoFrames = droppedVideoFrames,
            droppedAudioFrames = droppedAudioFrames,
            bytesWritten = bytesWritten ?: estimatedBytes,
            videoFrameIntervalSampleCount = videoFrameInterval.sampleCount,
            videoFrameIntervalAverageMs = videoFrameInterval.averageMs,
            videoFrameIntervalMaxMs = videoFrameInterval.maxMs,
            videoFrameIntervalJitterMs = videoFrameInterval.jitterMs,
            cacheSize = client?.getCacheSize(),
            itemsInCache = client?.getItemsInCache(),
            congested = client?.hasCongestion(),
            lastError = lastError,
            audioProcessing = micProcessingEffect?.snapshot(),
            continuity = continuity,
            device = deviceResourceMonitor.snapshot(),
            message = message
        )
    }

    private fun stopStreamAfterFailure(message: String) {
        userRequestedStop = true
        terminalFailure = true
        reconnectHandler.removeCallbacksAndMessages(null)
        stopContinuityHeartbeat()
        captureFinalContinuitySample()
        releaseStreamResources()
        LiveCasterSession.fail(message)
        stopSelf()
    }

    private fun releaseStreamResources() {
        directMediaCodecStream?.stop()
        directMediaCodecStream = null
        genericStream?.stopStream()
        genericStream?.release()
        genericStream = null
        micProcessingEffect?.release()
        micProcessingEffect = null
        mediaProjection?.stop()
        mediaProjection = null
        stopForeground(STOP_FOREGROUND_REMOVE)
    }

    private fun startContinuityHeartbeat() {
        continuityHandler.removeCallbacks(continuityHeartbeat)
        continuityHandler.postDelayed(continuityHeartbeat, CONTINUITY_HEARTBEAT_INTERVAL_MS)
    }

    private fun stopContinuityHeartbeat() {
        continuityHandler.removeCallbacks(continuityHeartbeat)
    }

    private fun captureFinalContinuitySample() {
        if (genericStream != null || directMediaCodecStream != null) {
            updateNativeRuntimeFromActiveStream(message = LiveCasterSession.health.message)
        }
    }

    private fun scheduleReconnect(reason: String) {
        if (userRequestedStop) {
            return
        }

        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            stopStreamAfterFailure("Connection lost after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts: $reason")
            return
        }

        reconnectAttempts += 1
        val delayMs = min(
            MAX_RECONNECT_DELAY_MS,
            INITIAL_RECONNECT_DELAY_MS * (1L shl (reconnectAttempts - 1))
        )
        LiveCasterSession.markReconnecting(
            reconnectAttempts,
            "Reconnecting in ${delayMs / 1000}s (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}): ${reason.take(96)}"
        )
        updateNativeRuntimeFromActiveStream(
            publisherState = "reconnecting",
            lastError = reason.take(160),
            message = LiveCasterSession.health.message
        )
        reconnectHandler.removeCallbacksAndMessages(null)
        reconnectHandler.postDelayed({ reconnectStream() }, delayMs)
    }

    private fun startForegroundCompat() {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "MobileLiveCaster streaming",
                NotificationManager.IMPORTANCE_LOW
            )
            notificationManager.createNotificationChannel(channel)
        }
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("MobileLiveCaster")
            .setContentText("Screen streaming is active")
            .setOngoing(true)
            .setSilent(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onConnectionStarted(url: String) {
        LiveCasterSession.updateHealth(message = liveMessage("Connecting"))
        updateNativeRuntimeFromActiveStream(publisherState = "connecting", message = LiveCasterSession.health.message)
    }

    override fun onConnectionSuccess() {
        reconnectAttempts = 0
        LiveCasterSession.markLive(liveMessage("Live"))
        updateNativeRuntimeFromActiveStream(publisherState = "published", lastError = "", message = LiveCasterSession.health.message)
    }

    override fun onConnectionFailed(reason: String) {
        scheduleReconnect(reason)
    }

    override fun onNewBitrate(bitrate: Long) {
        val bytesWritten = recordBitrateSample(bitrate)
        val droppedVideoFrames = currentDroppedVideoFrames()
        LiveCasterSession.updateHealth(
            bitrateKbps = (bitrate / 1000).toInt(),
            droppedFrames = droppedVideoFrames,
            fps = if (lastNativeFps > 0) lastNativeFps else LiveCasterSession.health.fps,
            message = "Live"
        )
        updateNativeRuntimeFromActiveStream(
            publisherState = "published",
            encodedBytes = bytesWritten,
            bytesWritten = bytesWritten,
            message = LiveCasterSession.health.message
        )
    }

    override fun onDisconnect() {
        if (terminalFailure) {
            return
        }
        if (userRequestedStop) {
            LiveCasterSession.markStopped()
            return
        }
        if (LiveCasterSession.status == LiveCasterStatus.Reconnecting) {
            LiveCasterSession.updateHealth(message = "Reconnecting")
            updateNativeRuntimeFromActiveStream(publisherState = "reconnecting", message = LiveCasterSession.health.message)
            return
        }
        scheduleReconnect("Connection disconnected")
    }

    override fun onAuthError() {
        updateNativeRuntimeFromActiveStream(publisherState = "failed", lastError = "RTMP authentication failed")
        stopStreamAfterFailure("RTMP authentication failed")
    }

    override fun onAuthSuccess() {
        LiveCasterSession.updateHealth(message = liveMessage("Authenticated"))
        updateNativeRuntimeFromActiveStream(publisherState = "authenticated", message = LiveCasterSession.health.message)
    }

    private fun liveMessage(prefix: String): String {
        val compositionSummary = nativeCompositionResult?.summary
        return if (compositionSummary.isNullOrBlank()) prefix else "$prefix; $compositionSummary"
    }
}

private data class VideoFrameIntervalSnapshot(
    val sampleCount: Long = 0,
    val averageMs: Double = 0.0,
    val maxMs: Double = 0.0,
    val jitterMs: Double = 0.0
)

private class VideoFrameIntervalTracker {
    private var lastSentVideoFrames: Long? = null
    private var lastSampleAtMs: Long? = null
    private var sampleCount = 0L
    private var totalIntervalMs = 0.0
    private var minIntervalMs = Double.POSITIVE_INFINITY
    private var maxIntervalMs = 0.0

    fun reset() {
        lastSentVideoFrames = null
        lastSampleAtMs = null
        sampleCount = 0L
        totalIntervalMs = 0.0
        minIntervalMs = Double.POSITIVE_INFINITY
        maxIntervalMs = 0.0
    }

    fun record(sentVideoFrames: Long?): VideoFrameIntervalSnapshot {
        val totalFrames = sentVideoFrames ?: return snapshot()
        val nowMs = SystemClock.elapsedRealtime()
        val previousFrames = lastSentVideoFrames
        val previousAtMs = lastSampleAtMs
        if (previousFrames != null && previousAtMs != null && totalFrames > previousFrames) {
            val frameDelta = totalFrames - previousFrames
            val elapsedMs = (nowMs - previousAtMs).coerceAtLeast(1L)
            val intervalMs = elapsedMs.toDouble() / frameDelta.toDouble()
            sampleCount += frameDelta
            totalIntervalMs += intervalMs * frameDelta.toDouble()
            minIntervalMs = minOf(minIntervalMs, intervalMs)
            maxIntervalMs = maxOf(maxIntervalMs, intervalMs)
        }
        lastSentVideoFrames = totalFrames
        lastSampleAtMs = nowMs
        return snapshot()
    }

    private fun snapshot(): VideoFrameIntervalSnapshot {
        if (sampleCount <= 0L) {
            return VideoFrameIntervalSnapshot()
        }
        val averageMs = totalIntervalMs / sampleCount.toDouble()
        val safeMinMs = if (minIntervalMs.isFinite()) minIntervalMs else 0.0
        return VideoFrameIntervalSnapshot(
            sampleCount = sampleCount,
            averageMs = averageMs,
            maxMs = maxIntervalMs,
            jitterMs = (maxIntervalMs - safeMinMs).coerceAtLeast(0.0)
        )
    }
}

internal class MediaContinuityTracker(
    private val stallThresholdMs: Long = 5_000L,
    private val elapsedRealtimeMs: () -> Long = SystemClock::elapsedRealtime,
    private val wallClockMs: () -> Long = System::currentTimeMillis
) {
    private var initialized = false
    private var wasActive = false
    private var activeSinceElapsedMs = 0L
    private var lastVideoFrames: Long? = null
    private var lastAudioFrames: Long? = null
    private var lastVideoAdvancedElapsedMs = 0L
    private var lastAudioAdvancedElapsedMs = 0L
    private var videoLastAdvancedAt = 0L
    private var audioLastAdvancedAt = 0L
    private var videoStalled = false
    private var audioStalled = false
    private var videoStallCount = 0L
    private var audioStallCount = 0L
    private var maxVideoStallDurationMs = 0L
    private var maxAudioStallDurationMs = 0L

    @Synchronized
    fun reset() {
        val nowElapsedMs = elapsedRealtimeMs()
        val nowWallMs = wallClockMs()
        initialized = true
        wasActive = false
        activeSinceElapsedMs = nowElapsedMs
        lastVideoFrames = null
        lastAudioFrames = null
        lastVideoAdvancedElapsedMs = nowElapsedMs
        lastAudioAdvancedElapsedMs = nowElapsedMs
        videoLastAdvancedAt = nowWallMs
        audioLastAdvancedAt = nowWallMs
        videoStalled = false
        audioStalled = false
        videoStallCount = 0L
        audioStallCount = 0L
        maxVideoStallDurationMs = 0L
        maxAudioStallDurationMs = 0L
    }

    @Synchronized
    fun record(videoFrames: Long?, audioFrames: Long?, active: Boolean): NativeRuntimeContinuity {
        if (!initialized) {
            reset()
        }
        val nowElapsedMs = elapsedRealtimeMs()
        val nowWallMs = wallClockMs()

        if (!active) {
            wasActive = false
            lastVideoFrames = videoFrames ?: lastVideoFrames
            lastAudioFrames = audioFrames ?: lastAudioFrames
            activeSinceElapsedMs = nowElapsedMs
            lastVideoAdvancedElapsedMs = nowElapsedMs
            lastAudioAdvancedElapsedMs = nowElapsedMs
            videoLastAdvancedAt = nowWallMs
            audioLastAdvancedAt = nowWallMs
            videoStalled = false
            audioStalled = false
            return snapshot("inactive", 0L, 0L)
        }

        if (!wasActive) {
            wasActive = true
            activeSinceElapsedMs = nowElapsedMs
            lastVideoFrames = videoFrames
            lastAudioFrames = audioFrames
            lastVideoAdvancedElapsedMs = nowElapsedMs
            lastAudioAdvancedElapsedMs = nowElapsedMs
            videoLastAdvancedAt = nowWallMs
            audioLastAdvancedAt = nowWallMs
            videoStalled = false
            audioStalled = false
            return snapshot("warming-up", 0L, 0L)
        }

        val previousVideoFrames = lastVideoFrames
        if (videoFrames != null) {
            if (previousVideoFrames == null || videoFrames != previousVideoFrames) {
                lastVideoAdvancedElapsedMs = nowElapsedMs
                videoLastAdvancedAt = nowWallMs
                videoStalled = false
            }
            lastVideoFrames = videoFrames
        }
        val previousAudioFrames = lastAudioFrames
        if (audioFrames != null) {
            if (previousAudioFrames == null || audioFrames != previousAudioFrames) {
                lastAudioAdvancedElapsedMs = nowElapsedMs
                audioLastAdvancedAt = nowWallMs
                audioStalled = false
            }
            lastAudioFrames = audioFrames
        }

        val videoDurationMs = (nowElapsedMs - lastVideoAdvancedElapsedMs).coerceAtLeast(0L)
        val audioDurationMs = (nowElapsedMs - lastAudioAdvancedElapsedMs).coerceAtLeast(0L)
        val nextVideoStalled = videoDurationMs >= stallThresholdMs
        val nextAudioStalled = audioDurationMs >= stallThresholdMs
        if (nextVideoStalled && !videoStalled) videoStallCount += 1L
        if (nextAudioStalled && !audioStalled) audioStallCount += 1L
        videoStalled = nextVideoStalled
        audioStalled = nextAudioStalled
        if (nextVideoStalled) maxVideoStallDurationMs = maxOf(maxVideoStallDurationMs, videoDurationMs)
        if (nextAudioStalled) maxAudioStallDurationMs = maxOf(maxAudioStallDurationMs, audioDurationMs)

        val warmingUp = nowElapsedMs - activeSinceElapsedMs < stallThresholdMs &&
            (lastVideoFrames ?: 0L) <= 0L &&
            (lastAudioFrames ?: 0L) <= 0L
        val status = when {
            videoStalled && audioStalled -> "both-stalled"
            videoStalled -> "video-stalled"
            audioStalled -> "audio-stalled"
            warmingUp -> "warming-up"
            else -> "healthy"
        }
        return snapshot(status, videoDurationMs, audioDurationMs)
    }

    private fun snapshot(status: String, videoDurationMs: Long, audioDurationMs: Long) = NativeRuntimeContinuity(
        status = status,
        videoStalled = videoStalled,
        audioStalled = audioStalled,
        videoLastAdvancedAt = videoLastAdvancedAt,
        audioLastAdvancedAt = audioLastAdvancedAt,
        videoStallDurationMs = videoDurationMs,
        audioStallDurationMs = audioDurationMs,
        videoStallCount = videoStallCount,
        audioStallCount = audioStallCount,
        maxVideoStallDurationMs = maxVideoStallDurationMs,
        maxAudioStallDurationMs = maxAudioStallDurationMs,
        stallThresholdMs = stallThresholdMs
    )
}
