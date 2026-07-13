package com.mobilelivecaster.streaming

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.PixelFormat
import android.graphics.Rect
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.Image
import android.media.ImageReader
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

internal class AndroidMediaCodecDirectStream(
    context: Context,
    connectChecker: ConnectChecker,
    private val liveVideoBitrateTracker: LiveVideoBitrateTracker
) {
    companion object {
        private const val VIDEO_MIME = MediaFormat.MIMETYPE_VIDEO_AVC
        private const val AUDIO_MIME = MediaFormat.MIMETYPE_AUDIO_AAC
        private const val AUDIO_SAMPLE_RATE = 44_100
        private const val AUDIO_MIC_CHANNEL_COUNT = 1
        private const val AUDIO_OUTPUT_CHANNEL_COUNT = 2
        private const val AUDIO_MIC_CHANNEL_MASK = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_PLAYBACK_CHANNEL_MASK = AudioFormat.CHANNEL_IN_STEREO
        private const val AUDIO_OUTPUT_STEREO = true
        private const val AUDIO_CHUNK_MILLIS = 20
        private const val PCM_BYTES_PER_SAMPLE = 2
        private const val AUDIO_READ_TIMEOUT_US = 10_000L
        private const val VIDEO_DRAIN_TIMEOUT_US = 10_000L
        private const val I_FRAME_INTERVAL_SECONDS = 2
        private const val COMPOSITOR_BACKEND = "android-canvas-mediacodec"
    }

    private val appContext = context.applicationContext
    private val publisher = AndroidMediaCodecRtmpPublisher(connectChecker)
    private val running = AtomicBoolean(false)
    @Volatile
    private var profile: LiveCasterProfile? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var videoEncoder: MediaCodec? = null
    private var audioEncoder: MediaCodec? = null
    private var audioRecord: AudioRecord? = null
    private var playbackAudioCapture: AndroidPlaybackAudioCapture? = null
    private var videoInputSurface: Surface? = null
    private var screenImageReader: ImageReader? = null
    private var screenBitmap: Bitmap? = null
    private val screenSourceRect = Rect()
    @Volatile
    private var canvasComposition: AndroidSceneCompositor.CanvasComposition? = null
    private var videoThread: Thread? = null
    private var audioThread: Thread? = null
    private var micProcessingEffect: MicProcessingEffect? = null
    @Volatile
    private var publisherConfigured = false
    private val counterLock = Any()
    private var videoFrames = 0L
    private var audioFrames = 0L
    private var encodedBytes = 0L
    private var audioSubmittedFrames = 0L
    private var compositedVideoFrames = 0L
    private var compositionDroppedFrames = 0L
    private var compositionFailures = 0L
    private var droppedVideoFrames = 0L
    private var droppedAudioFrames = 0L
    @Volatile
    private var lastError = ""
    @Volatile
    private var lastNonFatalError = ""
    private val videoEncoderCommandLock = Any()
    private var videoEncoderGeneration = 0L
    private var pendingVideoEncoderCommand: VideoEncoderCommand? = null

    @SuppressLint("MissingPermission")
    fun start(
        mediaProjection: MediaProjection,
        nextProfile: LiveCasterProfile,
        composition: AndroidSceneCompositor.CanvasComposition
    ) {
        if (!running.compareAndSet(false, true)) {
            return
        }
        profile = nextProfile
        synchronized(videoEncoderCommandLock) {
            videoEncoderGeneration += 1
            pendingVideoEncoderCommand = null
        }
        canvasComposition = composition
        publisherConfigured = false
        synchronized(counterLock) {
            videoFrames = 0L
            audioFrames = 0L
            encodedBytes = 0L
            compositedVideoFrames = 0L
            compositionDroppedFrames = 0L
            compositionFailures = 0L
            droppedVideoFrames = 0L
            droppedAudioFrames = 0L
        }
        audioSubmittedFrames = 0L
        lastError = ""
        lastNonFatalError = ""
        micProcessingEffect = MicProcessingEffect(
            appContext,
            nextProfile.micEffects,
            nextProfile.broadcastMixer,
            AUDIO_SAMPLE_RATE,
            isStereo = true
        )

        runCatching {
            val encoder = createVideoEncoder(nextProfile)
            val surface = encoder.createInputSurface()
            videoEncoder = encoder
            videoInputSurface = surface
            encoder.start()
            liveVideoBitrateTracker.recordApplied(nextProfile.videoBitrate / 1_000)
            val imageReader = ImageReader.newInstance(
                nextProfile.width,
                nextProfile.height,
                PixelFormat.RGBA_8888,
                2
            )
            screenImageReader = imageReader
            virtualDisplay = mediaProjection.createVirtualDisplay(
                "MobileLiveCasterMediaCodec",
                nextProfile.width,
                nextProfile.height,
                appContext.resources.displayMetrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.surface,
                null,
                null
            )

            audioEncoder = createAudioEncoder(nextProfile).also { it.start() }
            audioRecord = createMicAudioRecord().also { it.startRecording() }
            playbackAudioCapture = AndroidPlaybackAudioCapture.create(
                mediaProjection = mediaProjection,
                sampleRate = AUDIO_SAMPLE_RATE,
                channelMask = AUDIO_PLAYBACK_CHANNEL_MASK,
                channelCount = AUDIO_OUTPUT_CHANNEL_COUNT,
                readBufferSizeBytes = outputAudioChunkSizeBytes()
            ).also { capture ->
                capture.start()
                val captureSnapshot = capture.snapshot()
                if (captureSnapshot.status == "failed" || captureSnapshot.status == "unsupported") {
                    lastNonFatalError = captureSnapshot.lastError
                }
            }
            videoThread = Thread({ runEncoderThread { runVideoCompositorAndEncoder() } }, "MLC-MediaCodec-Video").also { it.start() }
            audioThread = Thread({ runEncoderThread { runAudioEncoder() } }, "MLC-MediaCodec-Audio").also { it.start() }
        }.onFailure { error ->
            lastError = safeMessage(error)
            stop()
            throw error
        }
    }

    fun stop() {
        running.set(false)
        synchronized(videoEncoderCommandLock) {
            videoEncoderGeneration += 1
            pendingVideoEncoderCommand = null
        }
        audioRecord?.runCatchingStop()
        playbackAudioCapture?.stop()
        videoThread?.joinQuietly()
        audioThread?.joinQuietly()
        videoThread = null
        audioThread = null
        virtualDisplay?.release()
        virtualDisplay = null
        screenImageReader?.close()
        screenImageReader = null
        screenBitmap?.recycle()
        screenBitmap = null
        videoInputSurface?.release()
        videoInputSurface = null
        audioRecord?.runCatchingRelease()
        audioRecord = null
        playbackAudioCapture = null
        videoEncoder?.runCatchingStopAndRelease()
        videoEncoder = null
        audioEncoder?.runCatchingStopAndRelease()
        audioEncoder = null
        publisher.disconnect()
        micProcessingEffect?.release()
        micProcessingEffect = null
        canvasComposition = null
        publisherConfigured = false
    }

    fun updateComposition(composition: AndroidSceneCompositor.CanvasComposition) {
        canvasComposition = composition
    }

    fun updateProfile(nextProfile: LiveCasterProfile, requestGeneration: Long) {
        val currentProfile = profile ?: throw IllegalStateException("Direct MediaCodec profile is unavailable")
        require(requestGeneration > 0) { "Direct MediaCodec bitrate updates require a request generation" }
        require(
            currentProfile.width == nextProfile.width &&
                currentProfile.height == nextProfile.height &&
                currentProfile.fps == nextProfile.fps &&
                currentProfile.audioBitrate == nextProfile.audioBitrate
        ) {
            "Direct MediaCodec live quality updates only support video bitrate changes"
        }
        profile = nextProfile
        micProcessingEffect?.updateProfile(nextProfile.micEffects, nextProfile.broadcastMixer)
        synchronized(videoEncoderCommandLock) {
            pendingVideoEncoderCommand = VideoEncoderCommand(
                generation = videoEncoderGeneration,
                requestGeneration = requestGeneration,
                videoBitrate = nextProfile.videoBitrate,
                requestKeyFrame = true
            )
        }
    }

    fun requestKeyFrame() {
        synchronized(videoEncoderCommandLock) {
            val pending = pendingVideoEncoderCommand
            pendingVideoEncoderCommand = VideoEncoderCommand(
                generation = videoEncoderGeneration,
                requestGeneration = pending
                    ?.takeIf { it.generation == videoEncoderGeneration }
                    ?.requestGeneration,
                videoBitrate = pending?.takeIf { it.generation == videoEncoderGeneration }?.videoBitrate,
                requestKeyFrame = true
            )
        }
    }

    fun reconnectPublisher() {
        val currentProfile = profile ?: throw IllegalStateException("Direct MediaCodec profile is unavailable")
        check(running.get()) { "Direct MediaCodec stream is not running" }
        check(publisherConfigured) { "Direct MediaCodec publisher is not configured" }
        publisher.reconnect(currentProfile.endpoint)
        requestKeyFrame()
    }

    fun snapshot(): AndroidMediaCodecDirectStreamSnapshot {
        val publisherSnapshot = publisher.snapshot()
        val counters = synchronized(counterLock) {
            DirectStreamCounters(
                videoFrames = videoFrames,
                audioFrames = audioFrames,
                encodedBytes = encodedBytes,
                compositedVideoFrames = compositedVideoFrames,
                compositionDroppedFrames = compositionDroppedFrames,
                compositionFailures = compositionFailures,
                droppedVideoFrames = droppedVideoFrames,
                droppedAudioFrames = droppedAudioFrames
            )
        }
        val configured = publisherConfigured
        return AndroidMediaCodecDirectStreamSnapshot(
            running = running.get(),
            configured = configured,
            publisherState = when {
                lastError.isNotBlank() -> "failed"
                publisherSnapshot.streaming -> "published"
                configured -> "connecting"
                running.get() -> "preparing"
                else -> "idle"
            },
            videoEncoderBackend = AndroidMediaCodecRtmpPublisher.VIDEO_BACKEND,
            audioEncoderBackend = AndroidMediaCodecRtmpPublisher.AUDIO_BACKEND,
            videoFrames = counters.videoFrames,
            audioFrames = counters.audioFrames,
            encodedBytes = counters.encodedBytes,
            runtimeCompositorBackend = COMPOSITOR_BACKEND,
            runtimeCompositedFrameCount = counters.compositedVideoFrames,
            runtimeDroppedFrameCount = counters.compositionDroppedFrames,
            runtimeCompositionFailureCount = counters.compositionFailures,
            sentVideoFrames = publisherSnapshot.sentVideoFrames,
            sentAudioFrames = publisherSnapshot.sentAudioFrames,
            droppedVideoFrames = counters.droppedVideoFrames + counters.compositionDroppedFrames + publisherSnapshot.droppedVideoFrames,
            publisherDroppedVideoFrames = publisherSnapshot.droppedVideoFrames,
            droppedAudioFrames = counters.droppedAudioFrames + publisherSnapshot.droppedAudioFrames,
            cacheSize = publisherSnapshot.cacheSize,
            itemsInCache = publisherSnapshot.itemsInCache,
            congested = publisherSnapshot.congested,
            avSync = publisherSnapshot.avSync,
            audioProcessing = audioProcessingSnapshot(),
            lastError = lastError
                .ifBlank { publisherSnapshot.lastError }
                .ifBlank { lastNonFatalError }
        )
    }

    private fun audioProcessingSnapshot(): NativeRuntimeAudioProcessing? {
        val processing = micProcessingEffect?.snapshot() ?: return null
        val playback = playbackAudioCapture?.snapshot() ?: return processing
        return processing.copy(
            playbackCaptureStatus = playback.status,
            playbackCaptureBackend = playback.backend,
            playbackCaptureSampleRate = playback.sampleRate,
            playbackCapturedFrames = playback.capturedFrames,
            playbackDroppedFrames = playback.droppedFrames,
            playbackUnderrunFrames = playback.underrunFrames,
            playbackBufferedFrames = playback.bufferedFrames
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
        val format = MediaFormat.createAudioFormat(AUDIO_MIME, AUDIO_SAMPLE_RATE, AUDIO_OUTPUT_CHANNEL_COUNT).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, currentProfile.audioBitrate)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, outputAudioChunkSizeBytes())
        }
        return MediaCodec.createEncoderByType(AUDIO_MIME).apply {
            configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        }
    }

    @SuppressLint("MissingPermission")
    private fun createMicAudioRecord(): AudioRecord {
        val bufferSize = micAudioRecordBufferSize()
        val audioFormat = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(AUDIO_SAMPLE_RATE)
            .setChannelMask(AUDIO_MIC_CHANNEL_MASK)
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

    private fun micAudioRecordBufferSize(): Int {
        val minSize = AudioRecord.getMinBufferSize(
            AUDIO_SAMPLE_RATE,
            AUDIO_MIC_CHANNEL_MASK,
            AudioFormat.ENCODING_PCM_16BIT
        )
        return max(minSize.coerceAtLeast(0), micAudioChunkSizeBytes() * 4)
    }

    private fun micAudioChunkSizeBytes(): Int =
        AUDIO_SAMPLE_RATE * AUDIO_CHUNK_MILLIS / 1_000 * AUDIO_MIC_CHANNEL_COUNT * PCM_BYTES_PER_SAMPLE

    private fun outputAudioChunkSizeBytes(): Int =
        AUDIO_SAMPLE_RATE * AUDIO_CHUNK_MILLIS / 1_000 * AUDIO_OUTPUT_CHANNEL_COUNT * PCM_BYTES_PER_SAMPLE

    private fun runVideoCompositorAndEncoder() {
        val info = MediaCodec.BufferInfo()
        val currentProfile = checkNotNull(profile) { "Direct MediaCodec profile is unavailable" }
        val cadence = AndroidVideoFrameCadence(currentProfile.fps, System.nanoTime())
        while (running.get()) {
            applyPendingVideoEncoderCommand()
            updateLatestScreenFrame()

            val nowNanos = System.nanoTime()
            if (cadence.shouldRender(nowNanos)) {
                if (!renderCompositeFrame(screenBitmap)) {
                    synchronized(counterLock) { compositionDroppedFrames += 1 }
                }
                cadence.advanceAfterRender(nowNanos)
                drainVideoEncoderOutput(info, 0L)
            } else {
                drainVideoEncoderOutput(
                    info,
                    cadence.encoderDrainTimeoutUs(nowNanos, VIDEO_DRAIN_TIMEOUT_US)
                )
            }
        }
        drainVideoEncoderOutput(info, 0L)
    }

    private fun applyPendingVideoEncoderCommand() {
        val command = synchronized(videoEncoderCommandLock) {
            pendingVideoEncoderCommand
                ?.takeIf { it.generation == videoEncoderGeneration }
                ?.also { pendingVideoEncoderCommand = null }
        } ?: return
        val encoder = videoEncoder
        if (encoder == null) {
            command.videoBitrate?.let { bitrate ->
                liveVideoBitrateTracker.recordFailure(bitrate / 1_000, command.requestGeneration)
            }
            lastError = "Direct MediaCodec video encoder is unavailable"
            return
        }
        val bitrate = command.videoBitrate
        val result = if (bitrate != null) {
            executeTrackedNativeVideoBitrateUpdate(
                targetKbps = bitrate / 1_000,
                tracker = liveVideoBitrateTracker,
                requestGeneration = command.requestGeneration,
                applyBitrate = {
                    encoder.setParameters(Bundle().apply {
                        putInt(MediaCodec.PARAMETER_KEY_VIDEO_BITRATE, bitrate)
                    })
                },
                afterBitrateApplied = { requestVideoKeyFrame(encoder, command.requestKeyFrame) }
            )
        } else {
            executeNativeVideoBitrateUpdate(
                applyBitrate = {},
                afterBitrateApplied = { requestVideoKeyFrame(encoder, command.requestKeyFrame) }
            )
        }
        if (result.trackerAccepted) {
            result.bitrateFailure?.let { error ->
                lastNonFatalError = safeMessage(error)
            }
            if (result.bitrateApplied) {
                lastNonFatalError = result.ancillaryFailure?.let(::safeMessage) ?: ""
            }
        }
    }

    private fun requestVideoKeyFrame(encoder: MediaCodec, requested: Boolean) {
        if (requested) {
            encoder.setParameters(Bundle().apply {
                putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0)
            })
        }
    }

    private fun updateLatestScreenFrame() {
        val reader = screenImageReader ?: return
        val image = reader.acquireLatestImage() ?: return
        try {
            if (copyScreenImageToBitmap(image) == null) {
                synchronized(counterLock) { compositionDroppedFrames += 1 }
            }
        } finally {
            image.close()
        }
    }

    private fun copyScreenImageToBitmap(image: Image): Bitmap? {
        val plane = image.planes.firstOrNull() ?: return null
        val pixelStride = plane.pixelStride
        val rowStride = plane.rowStride
        if (pixelStride <= 0 || rowStride <= 0) {
            return null
        }
        val bitmapWidth = (rowStride / pixelStride).coerceAtLeast(image.width)
        val currentBitmap = screenBitmap
        val reusableBitmap = if (currentBitmap == null || currentBitmap.width != bitmapWidth || currentBitmap.height != image.height) {
            currentBitmap?.recycle()
            Bitmap.createBitmap(bitmapWidth, image.height, Bitmap.Config.ARGB_8888).also { screenBitmap = it }
        } else {
            currentBitmap
        }
        val buffer = plane.buffer
        buffer.rewind()
        reusableBitmap.copyPixelsFromBuffer(buffer)
        screenSourceRect.set(0, 0, image.width, image.height)
        return reusableBitmap
    }

    private fun renderCompositeFrame(screenBitmap: Bitmap?): Boolean {
        val surface = videoInputSurface ?: return false
        val currentProfile = profile ?: return false
        val composition = canvasComposition ?: return false
        return try {
            val canvas: Canvas = surface.lockCanvas(null)
            try {
                composition.draw(
                    canvas,
                    screenBitmap,
                    screenSourceRect.takeIf { screenBitmap != null },
                    currentProfile.width,
                    currentProfile.height
                )
                synchronized(counterLock) { compositedVideoFrames += 1 }
                true
            } finally {
                surface.unlockCanvasAndPost(canvas)
            }
        } catch (error: Throwable) {
            synchronized(counterLock) { compositionFailures += 1 }
            lastError = safeMessage(error)
            running.set(false)
            false
        }
    }

    private fun drainVideoEncoderOutput(info: MediaCodec.BufferInfo, timeoutUs: Long) {
        val encoder = videoEncoder ?: return
        var outputIndex = encoder.dequeueOutputBuffer(info, timeoutUs)
        while (outputIndex != MediaCodec.INFO_TRY_AGAIN_LATER) {
            if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                configurePublisherFromVideoFormat(encoder.outputFormat)
                outputIndex = encoder.dequeueOutputBuffer(info, 0)
                continue
            }
            if (outputIndex >= 0) {
                val outputBuffer = encoder.getOutputBuffer(outputIndex)
                if (outputBuffer != null && info.size > 0) {
                    val frameBytes = info.size.toLong()
                    if (publisherConfigured) {
                        publisher.sendVideo(outputBuffer, info)
                        synchronized(counterLock) {
                            videoFrames += 1
                            encodedBytes += frameBytes
                        }
                    } else {
                        synchronized(counterLock) { droppedVideoFrames += 1 }
                    }
                }
                encoder.releaseOutputBuffer(outputIndex, false)
            }
            outputIndex = encoder.dequeueOutputBuffer(info, 0)
        }
    }

    private fun runAudioEncoder() {
        val outputInfo = MediaCodec.BufferInfo()
        val micReadBuffer = ByteArray(micAudioChunkSizeBytes())
        val appAudioBuffer = ByteArray(outputAudioChunkSizeBytes())
        while (running.get()) {
            queueAudioInput(micReadBuffer, appAudioBuffer)
            drainAudioOutput(outputInfo)
        }
        drainAudioOutput(outputInfo)
    }

    private fun queueAudioInput(micReadBuffer: ByteArray, appAudioBuffer: ByteArray) {
        val record = audioRecord ?: return
        val encoder = audioEncoder ?: return
        val bytesRead = record.read(micReadBuffer, 0, micReadBuffer.size, AudioRecord.READ_BLOCKING)
        if (bytesRead <= 0) {
            if (!running.get()) {
                return
            }
            synchronized(counterLock) { droppedAudioFrames += 1 }
            runCatching { Thread.sleep(5) }
            return
        }
        val stereoMic = Pcm16AudioMixer.upmixMonoToStereo(micReadBuffer, bytesRead)
        val requestedAppAudioBytes = stereoMic.size.coerceAtMost(appAudioBuffer.size)
        val capturedAppAudioBytes = playbackAudioCapture?.readInto(
            appAudioBuffer,
            requestedAppAudioBytes
        ) ?: run {
            appAudioBuffer.fill(0, 0, requestedAppAudioBytes)
            0
        }
        playbackAudioCapture?.snapshot()?.let { captureSnapshot ->
            if (captureSnapshot.status == "failed" && captureSnapshot.lastError.isNotBlank()) {
                lastNonFatalError = captureSnapshot.lastError
            }
        }
        val effect = micProcessingEffect
        val processedMic = effect?.process(stereoMic) ?: stereoMic
        val processedAppAudio = effect?.processAppAudio(
            appAudioBuffer.copyOf(requestedAppAudioBytes),
            capturedAppAudioBytes
        ) ?: appAudioBuffer.copyOf(requestedAppAudioBytes)
        val processed = effect?.mixForBroadcast(processedMic, processedAppAudio)
            ?: Pcm16AudioMixer.mix(processedMic, processedAppAudio).pcm
        val inputIndex = encoder.dequeueInputBuffer(AUDIO_READ_TIMEOUT_US)
        if (inputIndex < 0) {
            nextAudioPresentationTimeUs(processed.size)
            synchronized(counterLock) { droppedAudioFrames += 1 }
            return
        }
        val inputBuffer = encoder.getInputBuffer(inputIndex)
        if (inputBuffer == null) {
            encoder.queueInputBuffer(inputIndex, 0, 0, nextAudioPresentationTimeUs(0), 0)
            synchronized(counterLock) { droppedAudioFrames += 1 }
            return
        }
        inputBuffer.clear()
        if (inputBuffer.remaining() < processed.size) {
            encoder.queueInputBuffer(inputIndex, 0, 0, nextAudioPresentationTimeUs(processed.size), 0)
            synchronized(counterLock) { droppedAudioFrames += 1 }
            return
        }
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
                        synchronized(counterLock) {
                            audioFrames += 1
                            encodedBytes += frameBytes
                        }
                    } else {
                        synchronized(counterLock) { droppedAudioFrames += 1 }
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
        val addedFrames = bytes / (AUDIO_OUTPUT_CHANNEL_COUNT * PCM_BYTES_PER_SAMPLE)
        audioSubmittedFrames += addedFrames.toLong()
        return currentFrames * 1_000_000L / AUDIO_SAMPLE_RATE
    }

    private fun Thread.joinQuietly() {
        if (Thread.currentThread() === this) {
            return
        }
        runCatching { join(700) }
    }

    private fun AudioRecord.runCatchingStop() {
        runCatching {
            if (recordingState == AudioRecord.RECORDSTATE_RECORDING) stop()
        }
    }

    private fun AudioRecord.runCatchingRelease() {
        runCatching { release() }
    }

    private fun MediaCodec.runCatchingStopAndRelease() {
        runCatching { stop() }
        runCatching { release() }
    }

    private fun safeMessage(error: Throwable): String = (error.message ?: error.javaClass.simpleName).take(160)
}

internal class AndroidVideoFrameCadence(
    fps: Int,
    startNanos: Long
) {
    init {
        require(fps in 1..120) { "Video frame rate must be between 1 and 120 fps" }
    }

    internal val frameIntervalNanos = NANOS_PER_SECOND / fps
    private var nextFrameDeadlineNanos = startNanos

    fun shouldRender(nowNanos: Long): Boolean = nowNanos >= nextFrameDeadlineNanos

    fun advanceAfterRender(nowNanos: Long) {
        val elapsedNanos = (nowNanos - nextFrameDeadlineNanos).coerceAtLeast(0L)
        val elapsedIntervals = elapsedNanos / frameIntervalNanos
        nextFrameDeadlineNanos += (elapsedIntervals + 1L) * frameIntervalNanos
    }

    fun encoderDrainTimeoutUs(nowNanos: Long, maxTimeoutUs: Long): Long {
        require(maxTimeoutUs >= 0L) { "Encoder drain timeout cannot be negative" }
        val remainingNanos = nextFrameDeadlineNanos - nowNanos
        if (remainingNanos <= 0L || maxTimeoutUs == 0L) {
            return 0L
        }
        return ((remainingNanos + NANOS_PER_MICROSECOND - 1L) / NANOS_PER_MICROSECOND)
            .coerceAtMost(maxTimeoutUs)
    }

    private companion object {
        const val NANOS_PER_SECOND = 1_000_000_000L
        const val NANOS_PER_MICROSECOND = 1_000L
    }
}

private data class VideoEncoderCommand(
    val generation: Long,
    val requestGeneration: Long?,
    val videoBitrate: Int?,
    val requestKeyFrame: Boolean
)

private data class DirectStreamCounters(
    val videoFrames: Long,
    val audioFrames: Long,
    val encodedBytes: Long,
    val compositedVideoFrames: Long,
    val compositionDroppedFrames: Long,
    val compositionFailures: Long,
    val droppedVideoFrames: Long,
    val droppedAudioFrames: Long
)

data class AndroidMediaCodecDirectStreamSnapshot(
    val running: Boolean,
    val configured: Boolean,
    val publisherState: String,
    val videoEncoderBackend: String,
    val audioEncoderBackend: String,
    val videoFrames: Long,
    val audioFrames: Long,
    val encodedBytes: Long,
    val runtimeCompositorBackend: String,
    val runtimeCompositedFrameCount: Long,
    val runtimeDroppedFrameCount: Long,
    val runtimeCompositionFailureCount: Long,
    val sentVideoFrames: Long,
    val sentAudioFrames: Long,
    val droppedVideoFrames: Long,
    val publisherDroppedVideoFrames: Long,
    val droppedAudioFrames: Long,
    val cacheSize: Int,
    val itemsInCache: Int,
    val congested: Boolean,
    val avSync: NativeRuntimeAvSync,
    val audioProcessing: NativeRuntimeAudioProcessing?,
    val lastError: String
)
