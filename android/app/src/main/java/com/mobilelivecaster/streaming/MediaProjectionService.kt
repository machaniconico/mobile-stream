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
        private const val CHANNEL_ID = "mobile_live_caster_stream"
        private const val NOTIFICATION_ID = 4309
        private const val MAX_RECONNECT_ATTEMPTS = 5
        private const val INITIAL_RECONNECT_DELAY_MS = 1_500L
        private const val MAX_RECONNECT_DELAY_MS = 15_000L
    }

    private var mediaProjection: MediaProjection? = null
    private var genericStream: GenericStream? = null
    private var micProcessingEffect: MicProcessingEffect? = null
    private val reconnectHandler = Handler(Looper.getMainLooper())
    private var reconnectAttempts = 0
    private var userRequestedStop = false
    private var terminalFailure = false
    private val mediaProjectionManager: MediaProjectionManager by lazy {
        applicationContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_STREAM -> startStreamFromSession()
            ACTION_STOP_STREAM -> stopStream()
            ACTION_RECONNECT_STREAM -> reconnectStream()
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

            stream.changeVideoSource(ScreenSource(applicationContext, projection))
            stream.startStream(profile.endpoint)
            if (LiveCasterSession.status == LiveCasterStatus.Reconnecting) {
                LiveCasterSession.updateHealth(
                    reconnectAttempts = reconnectAttempts,
                    message = "Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})"
                )
            } else {
                LiveCasterSession.markLive("Connecting")
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
        LiveCasterSession.updateHealth(message = "Connecting")
    }

    override fun onConnectionSuccess() {
        reconnectAttempts = 0
        LiveCasterSession.markLive("Live")
    }

    override fun onConnectionFailed(reason: String) {
        scheduleReconnect(reason)
    }

    override fun onNewBitrate(bitrate: Long) {
        LiveCasterSession.updateHealth(bitrateKbps = (bitrate / 1000).toInt(), message = "Live")
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
            return
        }
        scheduleReconnect("Connection disconnected")
    }

    override fun onAuthError() {
        stopStreamAfterFailure("RTMP authentication failed")
    }

    override fun onAuthSuccess() {
        LiveCasterSession.updateHealth(message = "Authenticated")
    }
}
