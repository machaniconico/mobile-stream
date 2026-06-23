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
        private const val CHANNEL_ID = "mobile_live_caster_stream"
        private const val NOTIFICATION_ID = 4309
        private const val MAX_RECONNECT_ATTEMPTS = 5
        private const val INITIAL_RECONNECT_DELAY_MS = 1_500L
        private const val MAX_RECONNECT_DELAY_MS = 15_000L
    }

    private var mediaProjection: MediaProjection? = null
    private var genericStream: GenericStream? = null
    private var micProcessingEffect: MicProcessingEffect? = null
    private var nativeCompositionResult: AndroidCompositionResult? = null
    private val reconnectHandler = Handler(Looper.getMainLooper())
    private var reconnectAttempts = 0
    private var userRequestedStop = false
    private var terminalFailure = false
    private var estimatedBytesWritten = 0L
    private var lastBitrateSampleAtMs: Long? = null
    private var lastKnownBitrate = 0L
    private var lastNativeFps = 0
    private val mediaProjectionManager: MediaProjectionManager by lazy {
        applicationContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_STREAM -> startStreamFromSession()
            ACTION_STOP_STREAM -> stopStream()
            ACTION_RECONNECT_STREAM -> reconnectStream()
            ACTION_UPDATE_QUALITY -> updateStreamQuality()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        reconnectHandler.removeCallbacksAndMessages(null)
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
            val projection = mediaProjectionManager.getMediaProjection(resultCode, captureData)
                ?: throw IllegalStateException("Could not create MediaProjection")
            mediaProjection?.stop()
            mediaProjection = projection

            val microphoneSource = MicrophoneSource()
            micProcessingEffect?.release()
            micProcessingEffect = MicProcessingEffect(applicationContext, profile.micEffects).also { effect ->
                if (profile.micEffects.enabled || profile.micEffects.monitorEnabled) {
                    microphoneSource.setAudioEffect(effect)
                }
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
        } catch (error: Throwable) {
            val message = error.message ?: "Android screen stream failed"
            if (LiveCasterSession.status == LiveCasterStatus.Reconnecting) {
                scheduleReconnect(message)
            } else {
                stopStreamAfterFailure(message)
            }
        }
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
        val endpoint = LiveCasterSession.profile?.endpoint
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
        releaseStreamResources()
        LiveCasterSession.markStopped()
        stopSelf()
    }

    private fun updateStreamQuality() {
        val profile = LiveCasterSession.profile ?: return
        val stream = genericStream ?: return

        try {
            stream.setVideoBitrateOnFly(profile.videoBitrate)
            stream.getGlInterface().setForceRender(true, profile.fps)
            stream.requestKeyframe()
            lastNativeFps = profile.fps
            val message = liveMessage("Live quality updated to ${profile.videoBitrate / 1000} kbps / ${profile.fps}fps")
            LiveCasterSession.updateHealth(
                fps = profile.fps,
                message = message
            )
            updateNativeRuntimeFromStream(
                publisherState = if (stream.isStreaming) "published" else null,
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
        val dropped = genericStream?.getStreamClient()?.getDroppedVideoFrames()
            ?: LiveCasterSession.health.droppedFrames.toLong()
        return dropped.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
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
        val estimatedBytes = estimatedBytesWritten.takeIf { it > 0L }
        LiveCasterSession.updateNativeRuntime(
            publisherState = publisherState,
            compositionResult = compositionResult,
            videoFrames = sentVideoFrames,
            encodedBytes = encodedBytes ?: estimatedBytes,
            sentVideoFrames = sentVideoFrames,
            sentAudioFrames = sentAudioFrames,
            droppedVideoFrames = droppedVideoFrames,
            droppedAudioFrames = droppedAudioFrames,
            bytesWritten = bytesWritten ?: estimatedBytes,
            cacheSize = client?.getCacheSize(),
            itemsInCache = client?.getItemsInCache(),
            congested = client?.hasCongestion(),
            lastError = lastError,
            audioProcessing = micProcessingEffect?.snapshot(),
            message = message
        )
    }

    private fun stopStreamAfterFailure(message: String) {
        userRequestedStop = true
        terminalFailure = true
        reconnectHandler.removeCallbacksAndMessages(null)
        releaseStreamResources()
        LiveCasterSession.fail(message)
        stopSelf()
    }

    private fun releaseStreamResources() {
        genericStream?.stopStream()
        genericStream?.release()
        genericStream = null
        micProcessingEffect?.release()
        micProcessingEffect = null
        mediaProjection?.stop()
        mediaProjection = null
        stopForeground(STOP_FOREGROUND_REMOVE)
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
        updateNativeRuntimeFromStream(
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
        updateNativeRuntimeFromStream(publisherState = "connecting", message = LiveCasterSession.health.message)
    }

    override fun onConnectionSuccess() {
        reconnectAttempts = 0
        LiveCasterSession.markLive(liveMessage("Live"))
        updateNativeRuntimeFromStream(publisherState = "published", lastError = "", message = LiveCasterSession.health.message)
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
        updateNativeRuntimeFromStream(
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
            updateNativeRuntimeFromStream(publisherState = "reconnecting", message = LiveCasterSession.health.message)
            return
        }
        scheduleReconnect("Connection disconnected")
    }

    override fun onAuthError() {
        updateNativeRuntimeFromStream(publisherState = "failed", lastError = "RTMP authentication failed")
        stopStreamAfterFailure("RTMP authentication failed")
    }

    override fun onAuthSuccess() {
        LiveCasterSession.updateHealth(message = liveMessage("Authenticated"))
        updateNativeRuntimeFromStream(publisherState = "authenticated", message = LiveCasterSession.health.message)
    }

    private fun liveMessage(prefix: String): String {
        val compositionSummary = nativeCompositionResult?.summary
        return if (compositionSummary.isNullOrBlank()) prefix else "$prefix; $compositionSummary"
    }
}
