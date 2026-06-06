package com.mobilelivecaster.streaming

import android.app.Service
import android.content.Intent
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.IBinder

class MediaProjectionService : Service() {
    private var mediaProjection: MediaProjection? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // TODO: Promote to a foreground service before starting capture.
        // TODO: Extract MediaProjection consent data from intent and initialize capture.
        return START_NOT_STICKY
    }

    fun startProjection(manager: MediaProjectionManager, resultCode: Int, data: Intent) {
        mediaProjection = manager.getMediaProjection(resultCode, data)
        // TODO: Create VirtualDisplay, feed frames to compositor, encode with MediaCodec,
        // and publish through RTMP/RTMPS transport.
    }

    override fun onDestroy() {
        mediaProjection?.stop()
        mediaProjection = null
        super.onDestroy()
    }
}
