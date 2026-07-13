package com.mobilelivecaster.streaming

import android.media.MediaCodec
import com.pedro.common.AudioCodec
import com.pedro.common.ConnectChecker
import com.pedro.common.VideoCodec
import com.pedro.rtmp.rtmp.RtmpClient
import java.nio.ByteBuffer

class AndroidMediaCodecRtmpPublisher(connectChecker: ConnectChecker) {
    companion object {
        const val VIDEO_BACKEND = "mediacodec-h264"
        const val AUDIO_BACKEND = "mediacodec-aac"
        const val TRANSPORT_BACKEND = "rtmp-client-low-level"
    }

    private val client = RtmpClient(connectChecker).apply {
        setVideoCodec(VideoCodec.H264)
        setAudioCodec(AudioCodec.AAC)
        setReTries(0)
    }
    private var configured = false
    private var configuredWidth = 0
    private var configuredHeight = 0
    private var configuredFps = 0
    private var lastError = ""
    private val mediaTimestampTracker = MediaTimestampTracker()

    fun configure(profile: LiveCasterProfile, sps: ByteBuffer, pps: ByteBuffer, audioSampleRate: Int, audioStereo: Boolean) {
        require(sps.remaining() > 0) { "H.264 SPS is required before RTMP publishing" }
        require(pps.remaining() > 0) { "H.264 PPS is required before RTMP publishing" }
        configuredWidth = profile.width
        configuredHeight = profile.height
        configuredFps = profile.fps
        mediaTimestampTracker.reset()
        client.setVideoCodec(VideoCodec.H264)
        client.setAudioCodec(AudioCodec.AAC)
        client.setVideoResolution(profile.width, profile.height)
        client.setFps(profile.fps)
        client.setAudioInfo(audioSampleRate, audioStereo)
        client.setVideoInfo(sps.asReadOnlyBuffer(), pps.asReadOnlyBuffer(), null)
        configured = true
        lastError = ""
    }

    fun connect(endpoint: String) {
        require(configured) { "Android MediaCodec RTMP publisher must be configured before connect" }
        runCatching {
            client.connect(endpoint)
            lastError = ""
        }.onFailure { error ->
            lastError = safeMessage(error)
            throw error
        }
    }

    fun disconnect() {
        runCatching { client.disconnect() }
    }

    fun reconnect(endpoint: String) {
        require(configured) { "Android MediaCodec RTMP publisher must be configured before reconnect" }
        client.reConnect(0L, endpoint)
    }

    fun sendVideo(buffer: ByteBuffer, info: MediaCodec.BufferInfo) {
        if (!client.isStreaming || info.size <= 0 || info.isCodecConfigFrame()) return
        val frame = encodedFrame(buffer, info) ?: return
        if (!frame.buffer.hasH264StartCode()) {
            lastError = "H.264 Annex B NAL start code is required before RTMP publishing"
            return
        }
        val observedAtMs = System.nanoTime() / 1_000_000L
        runCatching {
            client.sendVideo(frame.buffer, frame.info)
            mediaTimestampTracker.recordVideo(frame.info.presentationTimeUs / 1_000L, observedAtMs)
        }.onFailure { error ->
            lastError = safeMessage(error)
        }
    }

    fun sendAudio(buffer: ByteBuffer, info: MediaCodec.BufferInfo) {
        if (!client.isStreaming || info.size <= 0 || info.isCodecConfigFrame()) return
        val frame = encodedFrame(buffer, info) ?: return
        val observedAtMs = System.nanoTime() / 1_000_000L
        runCatching {
            client.sendAudio(frame.buffer, frame.info)
            mediaTimestampTracker.recordAudio(frame.info.presentationTimeUs / 1_000L, observedAtMs)
        }.onFailure { error ->
            lastError = safeMessage(error)
        }
    }

    fun snapshot(): AndroidMediaCodecRtmpPublisherSnapshot =
        AndroidMediaCodecRtmpPublisherSnapshot(
            configured = configured,
            streaming = client.isStreaming,
            videoBackend = VIDEO_BACKEND,
            audioBackend = AUDIO_BACKEND,
            transportBackend = TRANSPORT_BACKEND,
            width = configuredWidth,
            height = configuredHeight,
            fps = configuredFps,
            sentVideoFrames = client.sentVideoFrames,
            sentAudioFrames = client.sentAudioFrames,
            droppedVideoFrames = client.droppedVideoFrames,
            droppedAudioFrames = client.droppedAudioFrames,
            cacheSize = client.cacheSize,
            itemsInCache = client.getItemsInCache(),
            congested = runCatching { client.hasCongestion() }.getOrDefault(false),
            avSync = mediaTimestampTracker.snapshot(),
            lastError = lastError
        )

    private fun encodedFrame(buffer: ByteBuffer, info: MediaCodec.BufferInfo): EncodedFrame? {
        val duplicate = buffer.duplicate()
        val start = info.offset
        val end = start + info.size
        if (start < 0 || end < start || end > duplicate.limit()) {
            lastError = "Encoded MediaCodec buffer range is outside the output buffer"
            return null
        }
        duplicate.position(start)
        duplicate.limit(end)
        val slice = duplicate.slice()
        return EncodedFrame(slice, normalizedBufferInfo(info, slice.remaining()))
    }

    private fun normalizedBufferInfo(info: MediaCodec.BufferInfo, size: Int): MediaCodec.BufferInfo =
        MediaCodec.BufferInfo().apply {
            set(0, size, info.presentationTimeUs, info.flags)
        }

    private fun MediaCodec.BufferInfo.isCodecConfigFrame(): Boolean =
        flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0

    private fun ByteBuffer.hasH264StartCode(): Boolean {
        if (remaining() < 4) return false
        val index = position()
        if (get(index) != 0.toByte() || get(index + 1) != 0.toByte()) return false
        return get(index + 2) == 1.toByte() ||
            (remaining() >= 5 && get(index + 2) == 0.toByte() && get(index + 3) == 1.toByte())
    }

    private fun safeMessage(error: Throwable): String = (error.message ?: error.javaClass.simpleName).take(160)
}

private data class EncodedFrame(
    val buffer: ByteBuffer,
    val info: MediaCodec.BufferInfo
)

data class AndroidMediaCodecRtmpPublisherSnapshot(
    val configured: Boolean,
    val streaming: Boolean,
    val videoBackend: String,
    val audioBackend: String,
    val transportBackend: String,
    val width: Int,
    val height: Int,
    val fps: Int,
    val sentVideoFrames: Long,
    val sentAudioFrames: Long,
    val droppedVideoFrames: Long,
    val droppedAudioFrames: Long,
    val cacheSize: Int,
    val itemsInCache: Int,
    val congested: Boolean,
    val avSync: NativeRuntimeAvSync,
    val lastError: String
)
