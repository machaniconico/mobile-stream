package com.mobilelivecaster.streaming

import android.annotation.SuppressLint
import android.content.Context
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.os.Bundle
import android.view.Surface
import com.pedro.common.ConnectChecker
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

class AndroidMediaCodecDirectStream(
    context: Context,
    connectChecker: ConnectChecker
) {
    companion object {
        private const val VIDEO_MIME = MediaFormat.MIMETYPE_VIDEO_AVC
        private const val AUDIO_MIME = MediaFormat.MIMETYPE_AUDIO_AAC
        private const val AUDIO_SAMPLE_RATE = 44_100
        private const val AUDIO_CHANNEL_COUNT = 1
        private const val AUDIO_CHANNEL_MASK = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_OUTPUT_STEREO = false
        private const val AUDIO_READ_TIMEOUT_US = 10_000L
        private const val VIDEO_DRAIN_TIMEOUT_US = 10_000L
        private const val I_FRAME_INTERVAL_SECONDS = 2
    }

    private val appContext = context.applicationContext
    private val publisher = AndroidMediaCodecRtmpPublisher(connectChecker)
    private val running = AtomicBoolean(false)
    private var profile: LiveCasterProfile? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var videoEncoder: MediaCodec? = null
    private var audioEncoder: MediaCodec? = null
    private var audioRecord: AudioRecord? = null
    private var videoInputSurface: Surface? = null
    private var videoThread: Thread? = null
    private var audioThread: Thread? = null
    private var micProcessingEffect: MicProcessingEffect? = null
    private var publisherConfigured = false
    private var videoFrames = 0L
    private var audioFrames = 0L
    private var encodedBytes = 0L
    private var audioSubmittedFrames = 0L
    private var droppedVideoFrames = 0L
    private var droppedAudioFrames = 0L
    private var lastError = ""

    @SuppressLint("MissingPermission")
    fun start(mediaProjection: MediaProjection, nextProfile: LiveCasterProfile) {
        if (!running.compareAndSet(false, true)) {
            return
        }
        profile = nextProfile
        publisherConfigured = false
        videoFrames = 0L
        audioFrames = 0L
        encodedBytes = 0L
        audioSubmittedFrames = 0L
        droppedVideoFrames = 0L
        droppedAudioFrames = 0L
        lastError = ""
        micProcessingEffect = MicProcessingEffect(
            appContext,
            nextProfile.micEffects,
            nextProfile.broadcastMixer,
            AUDIO_SAMPLE_RATE,
            AUDIO_OUTPUT_STEREO
        )

        runCatching {
            val encoder = createVideoEncoder(nextProfile)
            val surface = encoder.createInputSurface()
            videoEncoder = encoder
            videoInputSurface = surface
            encoder.start()
            virtualDisplay = mediaProjection.createVirtualDisplay(
                "MobileLiveCasterMediaCodec",
                nextProfile.width,
                nextProfile.height,
                appContext.resources.displayMetrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                surface,
                null,
                null
            )

            audioEncoder = createAudioEncoder(nextProfile).also { it.start() }
            audioRecord = createAudioRecord().also { it.startRecording() }
            videoThread = Thread({ runEncoderThread { drainVideoEncoder() } }, "MLC-MediaCodec-Video").also { it.start() }
            audioThread = Thread({ runEncoderThread { runAudioEncoder() } }, "MLC-MediaCodec-Audio").also { it.start() }
        }.onFailure { error ->
            lastError = safeMessage(error)
            stop()
            throw error
        }
    }

    fun stop() {
        running.set(false)
        videoThread?.joinQuietly()
        audioThread?.joinQuietly()
        videoThread = null
        audioThread = null
        virtualDisplay?.release()
        virtualDisplay = null
        videoInputSurface?.release()
        videoInputSurface = null
        audioRecord?.runCatchingStopAndRelease()
        audioRecord = null
        videoEncoder?.runCatchingStopAndRelease()
        videoEncoder = null
        audioEncoder?.runCatchingStopAndRelease()
        audioEncoder = null
        publisher.disconnect()
        micProcessingEffect?.release()
        micProcessingEffect = null
        publisherConfigured = false
    }

    fun updateProfile(nextProfile: LiveCasterProfile) {
        profile = nextProfile
        micProcessingEffect?.updateProfile(nextProfile.micEffects, nextProfile.broadcastMixer)
        runCatching {
            videoEncoder?.setParameters(Bundle().apply {
                putInt(MediaCodec.PARAMETER_KEY_VIDEO_BITRATE, nextProfile.videoBitrate)
            })
            requestKeyFrame()
        }.onFailure { error ->
            lastError = safeMessage(error)
        }
    }

    fun requestKeyFrame() {
        runCatching {
            videoEncoder?.setParameters(Bundle().apply {
                putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0)
            })
        }.onFailure { error ->
            lastError = safeMessage(error)
        }
    }

    fun snapshot(): AndroidMediaCodecDirectStreamSnapshot {
        val publisherSnapshot = publisher.snapshot()
        return AndroidMediaCodecDirectStreamSnapshot(
            running = running.get(),
            configured = publisherConfigured,
            publisherState = when {
                lastError.isNotBlank() -> "failed"
                publisherSnapshot.streaming -> "published"
                publisherConfigured -> "connecting"
                running.get() -> "preparing"
                else -> "idle"
            },
            videoEncoderBackend = AndroidMediaCodecRtmpPublisher.VIDEO_BACKEND,
            audioEncoderBackend = AndroidMediaCodecRtmpPublisher.AUDIO_BACKEND,
            videoFrames = videoFrames,
            audioFrames = audioFrames,
            encodedBytes = encodedBytes,
            sentVideoFrames = publisherSnapshot.sentVideoFrames,
            sentAudioFrames = publisherSnapshot.sentAudioFrames,
            droppedVideoFrames = droppedVideoFrames + publisherSnapshot.droppedVideoFrames,
            droppedAudioFrames = droppedAudioFrames + publisherSnapshot.droppedAudioFrames,
            cacheSize = publisherSnapshot.cacheSize,
            itemsInCache = publisherSnapshot.itemsInCache,
            congested = publisherSnapshot.congested,
            audioProcessing = micProcessingEffect?.snapshot(),
            lastError = lastError.ifBlank { publisherSnapshot.lastError }
        )
    }

    private fun createVideoEncoder(currentProfile: LiveCasterProfile): MediaCodec {
        val format = MediaFormat.createVideoFormat(VIDEO_MIME, currentProfile.width, currentProfile.height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, currentProfile.videoBitrate)
            setInteger(MediaFormat.KEY_FRAME_RATE, currentProfile.fps)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, I_FRAME_INTERVAL_SECONDS)
            setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR)
        }
        return MediaCodec.createEncoderByType(VIDEO_MIME).apply {
            configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        }
    }

    private fun createAudioEncoder(currentProfile: LiveCasterProfile): MediaCodec {
        val format = MediaFormat.createAudioFormat(AUDIO_MIME, AUDIO_SAMPLE_RATE, AUDIO_CHANNEL_COUNT).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, currentProfile.audioBitrate)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, audioInputBufferSize())
        }
        return MediaCodec.createEncoderByType(AUDIO_MIME).apply {
            configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        }
    }

    @SuppressLint("MissingPermission")
    private fun createAudioRecord(): AudioRecord {
        val bufferSize = audioInputBufferSize()
        val audioFormat = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(AUDIO_SAMPLE_RATE)
            .setChannelMask(AUDIO_CHANNEL_MASK)
            .build()
        return AudioRecord.Builder()
            .setAudioSource(MediaRecorder.AudioSource.MIC)
            .setAudioFormat(audioFormat)
            .setBufferSizeInBytes(bufferSize)
            .build()
            .also { record ->
                require(record.state == AudioRecord.STATE_INITIALIZED) { "AudioRecord initialization failed" }
            }
    }

    private fun audioInputBufferSize(): Int {
        val minSize = AudioRecord.getMinBufferSize(
            AUDIO_SAMPLE_RATE,
            AUDIO_CHANNEL_MASK,
            AudioFormat.ENCODING_PCM_16BIT
        )
        return max(minSize.coerceAtLeast(0), AUDIO_SAMPLE_RATE / 5 * AUDIO_CHANNEL_COUNT * 2)
    }

    private fun drainVideoEncoder() {
        val info = MediaCodec.BufferInfo()
        while (running.get()) {
            val encoder = videoEncoder ?: break
            when (val outputIndex = encoder.dequeueOutputBuffer(info, VIDEO_DRAIN_TIMEOUT_US)) {
                MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> configurePublisherFromVideoFormat(encoder.outputFormat)
                MediaCodec.INFO_TRY_AGAIN_LATER -> Unit
                else -> if (outputIndex >= 0) {
                    val outputBuffer = encoder.getOutputBuffer(outputIndex)
                    if (outputBuffer != null && info.size > 0) {
                        val frameBytes = info.size.toLong()
                        if (publisherConfigured) {
                            publisher.sendVideo(outputBuffer, info)
                            videoFrames += 1
                            encodedBytes += frameBytes
                        } else {
                            droppedVideoFrames += 1
                        }
                    }
                    encoder.releaseOutputBuffer(outputIndex, false)
                }
            }
        }
    }

    private fun runAudioEncoder() {
        val outputInfo = MediaCodec.BufferInfo()
        val readBuffer = ByteArray(audioInputBufferSize())
        while (running.get()) {
            queueAudioInput(readBuffer)
            drainAudioOutput(outputInfo)
        }
        drainAudioOutput(outputInfo)
    }

    private fun queueAudioInput(readBuffer: ByteArray) {
        val record = audioRecord ?: return
        val encoder = audioEncoder ?: return
        val bytesRead = record.read(readBuffer, 0, readBuffer.size, AudioRecord.READ_BLOCKING)
        if (bytesRead <= 0) {
            droppedAudioFrames += 1
            runCatching { Thread.sleep(5) }
            return
        }
        val processed = micProcessingEffect?.process(readBuffer.copyOf(bytesRead)) ?: readBuffer.copyOf(bytesRead)
        val inputIndex = encoder.dequeueInputBuffer(AUDIO_READ_TIMEOUT_US)
        if (inputIndex < 0) {
            droppedAudioFrames += 1
            return
        }
        val inputBuffer = encoder.getInputBuffer(inputIndex)
        if (inputBuffer == null) {
            encoder.queueInputBuffer(inputIndex, 0, 0, nextAudioPresentationTimeUs(0), 0)
            droppedAudioFrames += 1
            return
        }
        inputBuffer.clear()
        inputBuffer.put(processed, 0, processed.size)
        encoder.queueInputBuffer(inputIndex, 0, processed.size, nextAudioPresentationTimeUs(processed.size), 0)
    }

    private fun runEncoderThread(block: () -> Unit) {
        runCatching { block() }.onFailure { error ->
            lastError = safeMessage(error)
            running.set(false)
        }
    }

    private fun drainAudioOutput(info: MediaCodec.BufferInfo) {
        val encoder = audioEncoder ?: return
        var outputIndex = encoder.dequeueOutputBuffer(info, 0)
        while (outputIndex != MediaCodec.INFO_TRY_AGAIN_LATER) {
            if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                outputIndex = encoder.dequeueOutputBuffer(info, 0)
                continue
            }
            if (outputIndex >= 0) {
                val outputBuffer = encoder.getOutputBuffer(outputIndex)
                if (outputBuffer != null && info.size > 0) {
                    val frameBytes = info.size.toLong()
                    if (publisherConfigured) {
                        publisher.sendAudio(outputBuffer, info)
                        audioFrames += 1
                        encodedBytes += frameBytes
                    } else {
                        droppedAudioFrames += 1
                    }
                }
                encoder.releaseOutputBuffer(outputIndex, false)
            }
            outputIndex = encoder.dequeueOutputBuffer(info, 0)
        }
    }

    private fun configurePublisherFromVideoFormat(format: MediaFormat) {
        if (publisherConfigured) {
            return
        }
        val currentProfile = profile ?: return
        val sps = format.getByteBuffer("csd-0") ?: return
        val pps = format.getByteBuffer("csd-1") ?: return
        runCatching {
            publisher.configure(currentProfile, sps, pps, AUDIO_SAMPLE_RATE, AUDIO_OUTPUT_STEREO)
            publisher.connect(currentProfile.endpoint)
            publisherConfigured = true
        }.onFailure { error ->
            lastError = safeMessage(error)
        }
    }

    private fun nextAudioPresentationTimeUs(bytes: Int): Long {
        val currentFrames = audioSubmittedFrames
        val addedFrames = bytes / (AUDIO_CHANNEL_COUNT * 2)
        audioSubmittedFrames += addedFrames.toLong()
        return currentFrames * 1_000_000L / AUDIO_SAMPLE_RATE
    }

    private fun Thread.joinQuietly() {
        if (Thread.currentThread() === this) {
            return
        }
        runCatching { join(700) }
    }

    private fun AudioRecord.runCatchingStopAndRelease() {
        runCatching {
            if (recordingState == AudioRecord.RECORDSTATE_RECORDING) stop()
        }
        runCatching { release() }
    }

    private fun MediaCodec.runCatchingStopAndRelease() {
        runCatching { stop() }
        runCatching { release() }
    }

    private fun safeMessage(error: Throwable): String = (error.message ?: error.javaClass.simpleName).take(160)
}

data class AndroidMediaCodecDirectStreamSnapshot(
    val running: Boolean,
    val configured: Boolean,
    val publisherState: String,
    val videoEncoderBackend: String,
    val audioEncoderBackend: String,
    val videoFrames: Long,
    val audioFrames: Long,
    val encodedBytes: Long,
    val sentVideoFrames: Long,
    val sentAudioFrames: Long,
    val droppedVideoFrames: Long,
    val droppedAudioFrames: Long,
    val cacheSize: Int,
    val itemsInCache: Int,
    val congested: Boolean,
    val audioProcessing: NativeRuntimeAudioProcessing?,
    val lastError: String
)
