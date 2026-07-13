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
import kotlin.math.roundToInt

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
    private val encoderProbeState = AndroidActiveEncoderProbeState()
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
        encoderProbeState.reset()
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
            videoEncoder = encoder
            encoderProbeState.recordVideoConfigured(encoder, codecName(encoder))
            val surface = encoder.createInputSurface()
            videoInputSurface = surface
            encoder.start()
            encoderProbeState.recordVideoStarted(encoder)
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

            val activeAudioEncoder = createAudioEncoder(nextProfile)
            audioEncoder = activeAudioEncoder
            encoderProbeState.recordAudioConfigured(activeAudioEncoder, codecName(activeAudioEncoder))
            activeAudioEncoder.start()
            encoderProbeState.recordAudioStarted(activeAudioEncoder)
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
            encoderProbeState.recordFailure(lastError)
            stop()
            throw error
        }
    }

    fun stop() {
        running.set(false)
        encoderProbeState.recordStopped()
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
        val effectiveError = lastError.ifBlank { publisherSnapshot.lastError }
        val currentProfile = profile
        val encoderProbe = encoderProbeState.snapshot(
            running = running.get(),
            publisherConfigured = configured && publisherSnapshot.configured,
            requestedVideoWidth = currentProfile?.width ?: 0,
            requestedVideoHeight = currentProfile?.height ?: 0,
            requestedVideoFps = currentProfile?.fps ?: 0,
            expectedAudioSampleRate = AUDIO_SAMPLE_RATE,
            expectedAudioChannelCount = AUDIO_OUTPUT_CHANNEL_COUNT,
            publisherVideoBackend = publisherSnapshot.videoBackend,
            publisherAudioBackend = publisherSnapshot.audioBackend,
            externalError = effectiveError
        )
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
            videoEncoderBackend = publisherSnapshot.videoBackend,
            audioEncoderBackend = publisherSnapshot.audioBackend,
            encoderProbe = encoderProbe,
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
            lastError = effectiveError
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
            encoderProbeState.recordFailure(lastError)
            running.set(false)
            false
        }
    }

    private fun drainVideoEncoderOutput(info: MediaCodec.BufferInfo, timeoutUs: Long) {
        val encoder = videoEncoder ?: return
        var outputIndex = encoder.dequeueOutputBuffer(info, timeoutUs)
        while (outputIndex != MediaCodec.INFO_TRY_AGAIN_LATER) {
            if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                val outputFormat = encoder.outputFormat
                recordVideoOutputFormat(encoder, outputFormat)
                configurePublisherFromVideoFormat(outputFormat)
                outputIndex = encoder.dequeueOutputBuffer(info, 0)
                continue
            }
            if (outputIndex >= 0) {
                val outputBuffer = encoder.getOutputBuffer(outputIndex)
                val encodedMediaFrame = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0
                if (outputBuffer != null && info.size > 0 && encodedMediaFrame) {
                    encoderProbeState.recordVideoEncodedOutput(encoder)
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
            encoderProbeState.recordFailure(lastError)
            running.set(false)
        }
    }

    private fun drainAudioOutput(info: MediaCodec.BufferInfo) {
        val encoder = audioEncoder ?: return
        var outputIndex = encoder.dequeueOutputBuffer(info, 0)
        while (outputIndex != MediaCodec.INFO_TRY_AGAIN_LATER) {
            if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                recordAudioOutputFormat(encoder, encoder.outputFormat)
                outputIndex = encoder.dequeueOutputBuffer(info, 0)
                continue
            }
            if (outputIndex >= 0) {
                val outputBuffer = encoder.getOutputBuffer(outputIndex)
                val encodedMediaFrame = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0
                if (outputBuffer != null && info.size > 0 && encodedMediaFrame) {
                    encoderProbeState.recordAudioEncodedOutput(encoder)
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
            encoderProbeState.recordFailure(lastError)
        }
    }

    private fun recordVideoOutputFormat(encoder: MediaCodec, outputFormat: MediaFormat) {
        encoderProbeState.recordVideoOutputFormat(
            codecIdentity = encoder,
            mime = outputFormat.stringValue(MediaFormat.KEY_MIME),
            width = outputFormat.positiveInt(MediaFormat.KEY_WIDTH),
            height = outputFormat.positiveInt(MediaFormat.KEY_HEIGHT),
            fps = outputFormat.positiveDouble(MediaFormat.KEY_FRAME_RATE),
            colorFormat = colorFormatName(outputFormat.optionalInt(MediaFormat.KEY_COLOR_FORMAT)),
            bitrateMode = bitrateModeName(outputFormat.optionalInt(MediaFormat.KEY_BITRATE_MODE))
        )
    }

    private fun recordAudioOutputFormat(encoder: MediaCodec, outputFormat: MediaFormat) {
        encoderProbeState.recordAudioOutputFormat(
            codecIdentity = encoder,
            mime = outputFormat.stringValue(MediaFormat.KEY_MIME),
            sampleRate = outputFormat.positiveInt(MediaFormat.KEY_SAMPLE_RATE),
            channelCount = outputFormat.positiveInt(MediaFormat.KEY_CHANNEL_COUNT)
        )
    }

    private fun MediaFormat.positiveInt(key: String): Int = optionalInt(key).coerceAtLeast(0)

    private fun MediaFormat.positiveDouble(key: String): Double {
        if (!containsKey(key)) return 0.0
        return runCatching { getInteger(key).toDouble() }
            .recoverCatching { getFloat(key).toDouble() }
            .getOrDefault(0.0)
            .coerceAtLeast(0.0)
    }

    private fun MediaFormat.optionalInt(key: String): Int {
        if (!containsKey(key)) return 0
        return runCatching { getInteger(key) }
            .recoverCatching { getFloat(key).roundToInt() }
            .getOrDefault(0)
    }

    private fun MediaFormat.stringValue(key: String): String =
        if (containsKey(key)) runCatching { getString(key).orEmpty() }.getOrDefault("") else ""

    private fun codecName(codec: MediaCodec): String = runCatching { codec.name }.getOrDefault("")

    private fun colorFormatName(value: Int): String = when (value) {
        0 -> ""
        MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface -> "surface"
        else -> value.toString()
    }

    private fun bitrateModeName(value: Int): String = when (value) {
        MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR -> "cbr"
        MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR -> "vbr"
        MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CQ -> "cq"
        else -> ""
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

internal class AndroidActiveEncoderProbeState {
    companion object {
        private const val VIDEO_MIME = MediaFormat.MIMETYPE_VIDEO_AVC
        private const val AUDIO_MIME = MediaFormat.MIMETYPE_AUDIO_AAC
    }

    private var videoCodecIdentity: Any? = null
    private var audioCodecIdentity: Any? = null
    private var videoCodecName = ""
    private var audioCodecName = ""
    private var videoConfigured = false
    private var audioConfigured = false
    private var videoStarted = false
    private var audioStarted = false
    private var videoOutputFormatObserved = false
    private var audioOutputFormatObserved = false
    private var videoEncodedOutputCount = 0L
    private var audioEncodedOutputCount = 0L
    private var videoMime = ""
    private var audioMime = ""
    private var videoWidth = 0
    private var videoHeight = 0
    private var videoFps = 0.0
    private var audioSampleRate = 0
    private var audioChannelCount = 0
    private var videoColorFormat = ""
    private var videoBitrateMode = ""
    private var checkedAt = 0L
    private var stopped = false
    private var activeEncoderIdentityMismatch = false
    private var failureMessage = ""

    @Synchronized
    fun reset() {
        videoCodecIdentity = null
        audioCodecIdentity = null
        videoCodecName = ""
        audioCodecName = ""
        videoConfigured = false
        audioConfigured = false
        videoStarted = false
        audioStarted = false
        videoOutputFormatObserved = false
        audioOutputFormatObserved = false
        videoEncodedOutputCount = 0L
        audioEncodedOutputCount = 0L
        videoMime = ""
        audioMime = ""
        videoWidth = 0
        videoHeight = 0
        videoFps = 0.0
        audioSampleRate = 0
        audioChannelCount = 0
        videoColorFormat = ""
        videoBitrateMode = ""
        checkedAt = 0L
        stopped = false
        activeEncoderIdentityMismatch = false
        failureMessage = ""
    }

    @Synchronized
    fun recordVideoConfigured(codecIdentity: Any, codecName: String) {
        if (videoCodecIdentity != null && videoCodecIdentity !== codecIdentity) {
            recordIdentityFailure("video", "configure")
            return
        }
        videoCodecIdentity = codecIdentity
        videoCodecName = codecName
        videoConfigured = true
        stopped = false
        touch()
    }

    @Synchronized
    fun recordAudioConfigured(codecIdentity: Any, codecName: String) {
        if (audioCodecIdentity != null && audioCodecIdentity !== codecIdentity) {
            recordIdentityFailure("audio", "configure")
            return
        }
        audioCodecIdentity = codecIdentity
        audioCodecName = codecName
        audioConfigured = true
        stopped = false
        touch()
    }

    @Synchronized
    fun recordVideoStarted(codecIdentity: Any) {
        if (!matchesVideoCodec(codecIdentity, "start") || !videoConfigured) return
        videoStarted = true
        touch()
    }

    @Synchronized
    fun recordAudioStarted(codecIdentity: Any) {
        if (!matchesAudioCodec(codecIdentity, "start") || !audioConfigured) return
        audioStarted = true
        touch()
    }

    @Synchronized
    fun recordVideoOutputFormat(
        codecIdentity: Any,
        mime: String,
        width: Int,
        height: Int,
        fps: Double,
        colorFormat: String,
        bitrateMode: String
    ) {
        if (!matchesVideoCodec(codecIdentity, "output format") || !videoStarted) return
        videoOutputFormatObserved = true
        videoMime = mime
        videoWidth = width
        videoHeight = height
        videoFps = fps
        videoColorFormat = colorFormat
        videoBitrateMode = bitrateMode
        touch()
    }

    @Synchronized
    fun recordAudioOutputFormat(
        codecIdentity: Any,
        mime: String,
        sampleRate: Int,
        channelCount: Int
    ) {
        if (!matchesAudioCodec(codecIdentity, "output format") || !audioStarted) return
        audioOutputFormatObserved = true
        audioMime = mime
        audioSampleRate = sampleRate
        audioChannelCount = channelCount
        touch()
    }

    @Synchronized
    fun recordVideoEncodedOutput(codecIdentity: Any) {
        if (!matchesVideoCodec(codecIdentity, "encoded output") || !videoStarted) return
        videoEncodedOutputCount += 1
        touch()
    }

    @Synchronized
    fun recordAudioEncodedOutput(codecIdentity: Any) {
        if (!matchesAudioCodec(codecIdentity, "encoded output") || !audioStarted) return
        audioEncodedOutputCount += 1
        touch()
    }

    @Synchronized
    fun recordFailure(message: String) {
        failureMessage = message.ifBlank { "Active MediaCodec encoder failed" }.take(160)
        touch()
    }

    @Synchronized
    fun recordStopped() {
        stopped = true
        touch()
    }

    @Synchronized
    fun snapshot(
        running: Boolean,
        publisherConfigured: Boolean,
        requestedVideoWidth: Int,
        requestedVideoHeight: Int,
        requestedVideoFps: Int,
        expectedAudioSampleRate: Int,
        expectedAudioChannelCount: Int,
        publisherVideoBackend: String,
        publisherAudioBackend: String,
        externalError: String
    ): NativeRuntimeEncoderProbe {
        val activeVideoConfigured = running && videoConfigured && videoStarted
        val activeAudioConfigured = running && audioConfigured && audioStarted
        val videoOutputMatchesRequest =
            videoWidth == requestedVideoWidth &&
                videoHeight == requestedVideoHeight &&
                videoFps == requestedVideoFps.toDouble()
        val audioOutputMatchesRequest =
            audioSampleRate == expectedAudioSampleRate &&
                audioChannelCount == expectedAudioChannelCount
        val outputMatchesRequest = videoOutputMatchesRequest && audioOutputMatchesRequest
        val backendsMatchPublisher =
            publisherVideoBackend == AndroidMediaCodecRtmpPublisher.VIDEO_BACKEND &&
                publisherAudioBackend == AndroidMediaCodecRtmpPublisher.AUDIO_BACKEND
        val videoFormatValid =
            videoOutputFormatObserved &&
                videoMime.equals(VIDEO_MIME, ignoreCase = true) &&
                videoWidth > 0 &&
                videoHeight > 0 &&
                videoFps > 0.0
        val audioFormatValid =
            audioOutputFormatObserved &&
                audioMime.equals(AUDIO_MIME, ignoreCase = true) &&
                audioSampleRate > 0 &&
                audioChannelCount > 0
        val formatsValid = videoFormatValid && audioFormatValid
        val positiveEncodedOutputCounts =
            videoEncodedOutputCount > 0L &&
                audioEncodedOutputCount > 0L
        val activeEncoderInstancesVerified =
            running &&
                !stopped &&
                !activeEncoderIdentityMismatch &&
                videoCodecIdentity != null &&
                audioCodecIdentity != null &&
                videoConfigured &&
                videoStarted &&
                videoOutputFormatObserved &&
                audioConfigured &&
                audioStarted &&
                audioOutputFormatObserved &&
                positiveEncodedOutputCounts
        val lifecycleComplete =
            activeVideoConfigured &&
                activeAudioConfigured &&
                positiveEncodedOutputCounts
        val resolvedError = externalError.ifBlank { failureMessage }
        val passed =
            !stopped &&
                resolvedError.isBlank() &&
                publisherConfigured &&
                activeEncoderInstancesVerified &&
                videoEncodedOutputCount > 0L &&
                audioEncodedOutputCount > 0L &&
                lifecycleComplete &&
                formatsValid &&
                outputMatchesRequest &&
                backendsMatchPublisher
        val definitiveFormatFailure =
            (videoOutputFormatObserved && (!videoFormatValid || !videoOutputMatchesRequest)) ||
                (audioOutputFormatObserved && (!audioFormatValid || !audioOutputMatchesRequest))
        val status = when {
            passed -> "pass"
            resolvedError.isNotBlank() ||
                stopped ||
                activeEncoderIdentityMismatch ||
                definitiveFormatFailure ||
                !backendsMatchPublisher -> "fail"
            else -> "unknown"
        }
        val missingEvidence = mutableListOf<String>().apply {
            if (!running) add("active stream")
            if (!videoConfigured) add("video configure")
            if (!videoStarted) add("video start")
            if (!videoOutputFormatObserved) add("video output format")
            if (videoEncodedOutputCount <= 0L) add("video encoded output")
            if (!audioConfigured) add("audio configure")
            if (!audioStarted) add("audio start")
            if (!audioOutputFormatObserved) add("audio output format")
            if (audioEncodedOutputCount <= 0L) add("audio encoded output")
            if (!activeEncoderInstancesVerified) add("active encoder identity verification")
            if (!publisherConfigured) add("publisher configuration")
            if (formatsValid && !outputMatchesRequest) add("requested output match")
            if (!backendsMatchPublisher) add("publisher backend match")
        }
        val message = when (status) {
            "pass" -> "Active direct MediaCodec H.264/AAC encoders produced matching output formats and encoded media."
            "fail" -> "Active direct MediaCodec encoder proof failed: ${resolvedError.ifBlank {
                if (stopped) "stream stopped" else missingEvidence.joinToString(", ").ifBlank { "output format mismatch" }
            }}"
            else -> "Waiting for active direct MediaCodec encoder proof: ${missingEvidence.joinToString(", ")}"
        }

        return NativeRuntimeEncoderProbe(
            status = status,
            checkedAt = checkedAt,
            activeEncoderInstancesVerified = activeEncoderInstancesVerified,
            videoEncodedOutputCount = videoEncodedOutputCount,
            audioEncodedOutputCount = audioEncodedOutputCount,
            videoBackend = if (activeVideoConfigured) publisherVideoBackend else "none",
            audioBackend = if (activeAudioConfigured) publisherAudioBackend else "none",
            videoCodecName = videoCodecName,
            audioCodecName = audioCodecName,
            videoMime = videoMime,
            audioMime = audioMime,
            videoConfigured = activeVideoConfigured,
            audioConfigured = activeAudioConfigured,
            videoColorFormat = videoColorFormat,
            videoBitrateMode = videoBitrateMode,
            videoWidth = videoWidth,
            videoHeight = videoHeight,
            videoFps = videoFps.roundToInt(),
            audioSampleRate = audioSampleRate,
            audioChannelCount = audioChannelCount,
            message = message.take(240)
        )
    }

    private fun matchesVideoCodec(codecIdentity: Any, stage: String): Boolean {
        if (videoCodecIdentity === codecIdentity) return true
        recordIdentityFailure("video", stage)
        return false
    }

    private fun matchesAudioCodec(codecIdentity: Any, stage: String): Boolean {
        if (audioCodecIdentity === codecIdentity) return true
        recordIdentityFailure("audio", stage)
        return false
    }

    private fun recordIdentityFailure(mediaType: String, stage: String) {
        activeEncoderIdentityMismatch = true
        failureMessage = "Active $mediaType MediaCodec $stage came from a different encoder instance"
        touch()
    }

    private fun touch() {
        checkedAt = System.currentTimeMillis()
    }
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
    val encoderProbe: NativeRuntimeEncoderProbe,
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
