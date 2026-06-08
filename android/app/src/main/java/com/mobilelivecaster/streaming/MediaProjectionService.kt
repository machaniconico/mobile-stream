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
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.mobilelivecaster.R
import com.pedro.common.ConnectChecker
import com.pedro.encoder.input.sources.audio.MicrophoneSource
import com.pedro.encoder.input.sources.video.NoVideoSource
import com.pedro.encoder.input.sources.video.ScreenSource
import com.pedro.library.generic.GenericStream

class MediaProjectionService : Service(), ConnectChecker {
    companion object {
        const val ACTION_START_STREAM = "com.mobilelivecaster.streaming.START_STREAM"
        const val ACTION_STOP_STREAM = "com.mobilelivecaster.streaming.STOP_STREAM"
        const val ACTION_RECONNECT_STREAM = "com.mobilelivecaster.streaming.RECONNECT_STREAM"
        private const val CHANNEL_ID = "mobile_live_caster_stream"
        private const val NOTIFICATION_ID = 4309
    }

    private var mediaProjection: MediaProjection? = null
    private var genericStream: GenericStream? = null
    private var micProcessingEffect: MicProcessingEffect? = null
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
        genericStream?.stopStream()
        genericStream?.release()
        genericStream = null
        micProcessingEffect?.release()
        micProcessingEffect = null
        mediaProjection?.stop()
        mediaProjection = null
        super.onDestroy()
    }

    private fun startStreamFromSession() {
        val profile = LiveCasterSession.profile
        val resultCode = LiveCasterSession.captureResultCode
        val captureData = LiveCasterSession.captureData

        if (profile == null || resultCode == null || captureData == null) {
            LiveCasterSession.fail("Screen capture consent or stream profile is missing")
            stopSelf()
            return
        }

        try {
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
            LiveCasterSession.markLive("Connecting")
        } catch (error: Throwable) {
            LiveCasterSession.fail(error.message ?: "Android screen stream failed")
            stopStream()
        }
    }

    private fun reconnectStream() {
        val stream = genericStream
        val endpoint = LiveCasterSession.profile?.endpoint
        if (stream == null || endpoint == null) {
            startStreamFromSession()
            return
        }
        try {
            if (stream.isStreaming) stream.stopStream()
            stream.startStream(endpoint)
        } catch (error: Throwable) {
            LiveCasterSession.fail(error.message ?: "Reconnect failed")
        }
    }

    private fun stopStream() {
        genericStream?.stopStream()
        genericStream?.release()
        genericStream = null
        micProcessingEffect?.release()
        micProcessingEffect = null
        mediaProjection?.stop()
        mediaProjection = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        LiveCasterSession.markStopped()
        stopSelf()
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
        LiveCasterSession.markLive("Live")
    }

    override fun onConnectionFailed(reason: String) {
        LiveCasterSession.fail(reason)
        stopStream()
    }

    override fun onNewBitrate(bitrate: Long) {
        LiveCasterSession.updateHealth(bitrateKbps = (bitrate / 1000).toInt(), message = "Live")
    }

    override fun onDisconnect() {
        LiveCasterSession.markStopped()
    }

    override fun onAuthError() {
        LiveCasterSession.fail("RTMP authentication failed")
    }

    override fun onAuthSuccess() {
        LiveCasterSession.updateHealth(message = "Authenticated")
    }
}
