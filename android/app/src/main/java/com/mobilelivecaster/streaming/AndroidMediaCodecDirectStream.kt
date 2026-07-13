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
import android.media.Image
import android.media.ImageReader
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.os.Bundle
import android.view.Surface
import com.pedro.common.ConnectChecker
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.locks.LockSupport
import kotlin.math.roundToInt

internal enum class AndroidDirectStreamCleanupDisposition {
    RELEASED,
    EXHAUSTED,
    FATAL
}

internal data class AndroidDirectStreamCleanupResult(
    val disposition: AndroidDirectStreamCleanupDisposition,
    val message: String
) {
    val released: Boolean
        get() = disposition == AndroidDirectStreamCleanupDisposition.RELEASED

    companion object {
        fun released(): AndroidDirectStreamCleanupResult =
            AndroidDirectStreamCleanupResult(AndroidDirectStreamCleanupDisposition.RELEASED, "")

        fun exhausted(message: String): AndroidDirectStreamCleanupResult =
            AndroidDirectStreamCleanupResult(
                AndroidDirectStreamCleanupDisposition.EXHAUSTED,
                message.ifBlank { "Native stream cleanup exhausted its retry budget" }.take(240)
            )

        fun fatal(message: String): AndroidDirectStreamCleanupResult =
            AndroidDirectStreamCleanupResult(
                AndroidDirectStreamCleanupDisposition.FATAL,
                message.ifBlank { "Native stream cleanup failed fatally" }.take(240)
            )
    }
}

internal class AndroidMediaCodecDirectStream(
    context: Context,
    connectChecker: ConnectChecker,
    private val liveVideoBitrateTracker: LiveVideoBitrateTracker,
    private val onFatalError: (AndroidMediaCodecDirectStream, String) -> Unit
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
        private const val INITIAL_WORKER_STOP_TIMEOUT_NANOS = 2_000_000_000L
        private const val ESCALATED_WORKER_STOP_TIMEOUT_NANOS = 1_000_000_000L
        private const val NATIVE_OWNER_RELEASE_TIMEOUT_MILLIS = 5_000L
    }

    private val appContext = context.applicationContext
    private val publisher = AndroidMediaCodecRtmpPublisher(connectChecker)
    private val running = AtomicBoolean(false)
    private val stopping = AtomicBoolean(false)
    private val fatalErrorReported = AtomicBoolean(false)
    private val workerFatalError = AtomicReference<Error?>(null)
    private val cleanupLock = Any()
    private val stopCallbacks = mutableListOf<(AndroidDirectStreamCleanupResult) -> Unit>()
    private var cleanupFinished = false
    private var cleanupResult = AndroidDirectStreamCleanupResult.released()
    @Volatile
    private var profile: LiveCasterProfile? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var videoEncoder: MediaCodec? = null
    private var audioEncoder: MediaCodec? = null
    private var microphoneAudioCapture: AndroidMicrophoneAudioCapture? = null
    private var playbackAudioCapture: AndroidPlaybackAudioCapture? = null
    private var videoInputSurface: Surface? = null
    private var screenImageReader: ImageReader? = null
    private var screenBitmap: Bitmap? = null
    private val screenSourceRect = Rect()
    @Volatile
    private var canvasComposition: AndroidSceneCompositor.CanvasComposition? = null
    private var videoThread: Thread? = null
    private var audioThread: Thread? = null
    private var cleanupThread: Thread? = null
    private var micProcessingEffect: MicProcessingEffect? = null
    @Volatile
    private var publisherConfigured = false
    private val encoderProbeState = AndroidActiveEncoderProbeState()
    private val counterLock = Any()
    private var videoFrames = 0L
    private var audioFrames = 0L
    private var encodedBytes = 0L
    private var compositedVideoFrames = 0L
    private var compositionDroppedFrames = 0L
    private var compositionFailures = 0L
    private var droppedVideoFrames = 0L
    private var droppedAudioFrames = 0L
    @Volatile
    private var lastError = ""
    @Volatile
    private var lastNonFatalError = ""
    @Volatile
    private var lastAudioCaptureError = ""
    private val videoEncoderCommandLock = Any()
    private var videoEncoderGeneration = 0L
    private var pendingVideoEncoderCommand: VideoEncoderCommand? = null

    @SuppressLint("MissingPermission")
    fun start(
        mediaProjection: MediaProjection,
        nextProfile: LiveCasterProfile,
        composition: AndroidSceneCompositor.CanvasComposition
    ) {
        check(!stopping.get()) { "Direct MediaCodec stream instances cannot restart after stop" }
        if (!running.compareAndSet(false, true)) {
            return
        }
        fatalErrorReported.set(false)
        workerFatalError.set(null)
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
        lastError = ""
        lastNonFatalError = ""
        lastAudioCaptureError = ""
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
            val microphoneCapture = AndroidMicrophoneAudioCapture(
                context = appContext,
                sampleRate = AUDIO_SAMPLE_RATE,
                channelMask = AUDIO_MIC_CHANNEL_MASK,
                readBufferSizeBytes = micAudioChunkSizeBytes(),
                onFatalError = ::reportFatalError
            )
            microphoneAudioCapture = microphoneCapture
            microphoneCapture.start()
            val playbackCapture = AndroidPlaybackAudioCapture.create(
                context = appContext,
                mediaProjection = mediaProjection,
                sampleRate = AUDIO_SAMPLE_RATE,
                channelMask = AUDIO_PLAYBACK_CHANNEL_MASK,
                channelCount = AUDIO_OUTPUT_CHANNEL_COUNT,
                readBufferSizeBytes = outputAudioChunkSizeBytes(),
                onFatalError = ::reportFatalError
            )
            playbackAudioCapture = playbackCapture
            playbackCapture.start()
            val captureSnapshot = playbackCapture.snapshot()
            if (captureSnapshot.status == "failed" || captureSnapshot.status == "unsupported") {
                lastAudioCaptureError = captureSnapshot.lastError
            }
            videoThread = Thread({ runEncoderThread { runVideoCompositorAndEncoder() } }, "MLC-MediaCodec-Video").also { it.start() }
            audioThread = Thread({ runEncoderThread { runAudioEncoder() } }, "MLC-MediaCodec-Audio").also { it.start() }
        }.onFailure { error ->
            if (error is Error) workerFatalError.compareAndSet(null, error)
            lastError = safeMessage(error)
            encoderProbeState.recordFailure(lastError)
            stop()
            throw error
        }
    }

    fun stop(onStopped: ((AndroidDirectStreamCleanupResult) -> Unit)? = null) {
        val completedCallback = synchronized(cleanupLock) {
            if (onStopped == null) {
                null
            } else if (cleanupFinished) {
                onStopped to cleanupResult
            } else {
                stopCallbacks += onStopped
                null
            }
        }
        if (completedCallback != null) {
            try {
                completedCallback.first(completedCallback.second)
            } catch (_: Exception) {
                // Cleanup is already complete; recoverable observer failures do not change ownership.
            }
            return
        }
        if (!stopping.compareAndSet(false, true)) return
        running.set(false)
        encoderProbeState.recordStopped()
        synchronized(videoEncoderCommandLock) {
            videoEncoderGeneration += 1
            pendingVideoEncoderCommand = null
        }
        val thread = Thread(::releaseResourcesAfterStop, "MLC-MediaCodec-Stop").apply {
            isDaemon = true
        }
        synchronized(cleanupLock) {
            cleanupThread = thread
        }
        thread.start()
    }

    private fun releaseResourcesAfterStop() {
        var fatalCleanupFailure: Throwable? = null
        var releaseExhausted = false
        var workersStopped = false

        fun retainCleanupFailure(ownerName: String, error: Throwable) {
            recordCleanupFailure("$ownerName release failed: ${safeMessage(error)}")
            releaseExhausted = true
            if (error is Error && fatalCleanupFailure == null) fatalCleanupFailure = error
        }

        try {
            val captureStopState = AndroidNativeOwnerReleaseState()
            try {
                captureStopState.execute(
                    { microphoneAudioCapture?.stop() },
                    { playbackAudioCapture?.stop() }
                )
            } catch (error: Error) {
                if (fatalCleanupFailure == null) fatalCleanupFailure = error
            }
            captureStopState.failure()?.let { retainCleanupFailure("Audio capture stop", it) }
            videoThread?.interrupt()
            audioThread?.interrupt()
            val stoppedNormally = awaitWorkersUntil(
                System.nanoTime() + INITIAL_WORKER_STOP_TIMEOUT_NANOS
            )
            workersStopped = stoppedNormally
            if (!workersStopped) {
                forceUnblockWorkers()
                workersStopped = awaitWorkersUntil(
                    System.nanoTime() + ESCALATED_WORKER_STOP_TIMEOUT_NANOS
                )
                if (!workersStopped) {
                    lastError = "MediaCodec worker shutdown exceeded the 3 second escalation deadline"
                    encoderProbeState.recordFailure(lastError)
                    releaseExhausted = true
                }
            }
        } catch (error: Throwable) {
            fatalCleanupFailure = error
            releaseExhausted = true
        }

        if (workersStopped) {
            try {
                releaseVideoInputs()?.let { retainCleanupFailure("Video inputs", it) }
            } catch (error: Throwable) {
                retainCleanupFailure("Video inputs", error)
            }
            videoThread = null
            audioThread = null
            try {
                screenBitmap?.recycle()
            } catch (error: Throwable) {
                retainCleanupFailure("Screen bitmap", error)
            }
            screenBitmap = null

            try {
                microphoneAudioCapture?.ownerReleaseFailure()?.let {
                    retainCleanupFailure("Microphone AudioRecord", it)
                }
            } catch (error: Throwable) {
                retainCleanupFailure("Microphone AudioRecord", error)
            } finally {
                microphoneAudioCapture = null
            }
            try {
                playbackAudioCapture?.ownerReleaseFailure()?.let {
                    retainCleanupFailure("Playback AudioRecord", it)
                }
            } catch (error: Throwable) {
                retainCleanupFailure("Playback AudioRecord", error)
            } finally {
                playbackAudioCapture = null
            }

            try {
                if (videoEncoder?.stopAndReleaseWithRetry("Video") == false) releaseExhausted = true
            } catch (error: Throwable) {
                retainCleanupFailure("Video MediaCodec", error)
            } finally {
                videoEncoder = null
            }
            try {
                if (audioEncoder?.stopAndReleaseWithRetry("Audio") == false) releaseExhausted = true
            } catch (error: Throwable) {
                retainCleanupFailure("Audio MediaCodec", error)
            } finally {
                audioEncoder = null
            }
            try {
                if (
                    !releaseNativeOwnerWithRetry(
                        ownerName = "RTMP publisher",
                        release = publisher::disconnectAndAwait,
                        onFailure = ::recordCleanupFailure
                    )
                ) {
                    releaseExhausted = true
                }
            } catch (error: Throwable) {
                retainCleanupFailure("RTMP publisher", error)
            }
            try {
                micProcessingEffect?.release()
            } catch (error: Throwable) {
                retainCleanupFailure("Microphone processing", error)
            } finally {
                micProcessingEffect = null
            }
            canvasComposition = null
            publisherConfigured = false
        }

        workerFatalError.get()?.let { error ->
            recordCleanupFailure("MediaCodec worker failed during shutdown: ${safeMessage(error)}")
            releaseExhausted = true
            if (fatalCleanupFailure == null) fatalCleanupFailure = error
        }

        val result = when {
            fatalCleanupFailure != null -> AndroidDirectStreamCleanupResult.fatal(
                "Native stream cleanup failed: ${safeMessage(fatalCleanupFailure)}"
            )
            releaseExhausted -> AndroidDirectStreamCleanupResult.exhausted(lastError)
            else -> AndroidDirectStreamCleanupResult.released()
        }
        val fatalCallbackFailure = completeStopCallbacks(result)
        ((fatalCleanupFailure as? Error) ?: fatalCallbackFailure ?: fatalCleanupFailure)?.let { throw it }
    }

    private fun completeStopCallbacks(result: AndroidDirectStreamCleanupResult): Error? {
        val callbacks = synchronized(cleanupLock) {
            cleanupResult = result
            cleanupFinished = true
            if (cleanupThread === Thread.currentThread()) cleanupThread = null
            stopCallbacks.toList().also { stopCallbacks.clear() }
        }
        var fatalCallbackError: Error? = null
        callbacks.forEach { callback ->
            try {
                callback(result)
            } catch (error: Error) {
                if (fatalCallbackError == null) fatalCallbackError = error
            } catch (_: Exception) {
                // All cleanup observers are drained even when one recoverable callback fails.
            }
        }
        return fatalCallbackError
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
                .ifBlank { lastAudioCaptureError }
        )
    }

    private fun audioProcessingSnapshot(): NativeRuntimeAudioProcessing? {
        val processing = micProcessingEffect?.snapshot() ?: return null
        val microphone = microphoneAudioCapture?.snapshot()
        val playback = playbackAudioCapture?.snapshot()
        return processing.copy(
            micCaptureStatus = microphone?.status ?: "unavailable",
            micCaptureBackend = microphone?.backend ?: "none",
            micCaptureSampleRate = microphone?.sampleRate ?: 0,
            micCaptureLifecycleEventCount = microphone?.lifecycleEventCount ?: 0L,
            micCaptureRouteChangeCount = microphone?.routeChangeCount ?: 0L,
            micCaptureInterruptionCount = microphone?.interruptionCount ?: 0L,
            micCaptureRecoveryCount = microphone?.recoveryCount ?: 0L,
            micCaptureRecoveryFailureCount = microphone?.recoveryFailureCount ?: 0L,
            micCaptureUnrecoveredEventCount = microphone?.unrecoveredEventCount ?: 0L,
            micCaptureFallbackFrames = microphone?.fallbackFrames ?: 0L,
            micCaptureLastRecoveryReason = microphone?.lastRecoveryReason ?: "",
            micCaptureLastRecoveryAt = microphone?.lastRecoveryAt ?: 0L,
            micCaptureSuspended = microphone?.suspended ?: false,
            playbackCaptureStatus = playback?.status ?: "unavailable",
            playbackCaptureBackend = playback?.backend ?: "none",
            playbackCaptureSampleRate = playback?.sampleRate ?: 0,
            playbackCapturedFrames = playback?.capturedFrames ?: 0L,
            playbackDroppedFrames = playback?.droppedFrames ?: 0L,
            playbackUnderrunFrames = playback?.underrunFrames ?: 0L,
            playbackBufferedFrames = playback?.bufferedFrames ?: 0,
            playbackCaptureLifecycleEventCount = playback?.lifecycleEventCount ?: 0L,
            playbackCaptureRouteChangeCount = playback?.routeChangeCount ?: 0L,
            playbackCaptureInterruptionCount = playback?.interruptionCount ?: 0L,
            playbackCaptureRecoveryCount = playback?.recoveryCount ?: 0L,
            playbackCaptureRecoveryFailureCount = playback?.recoveryFailureCount ?: 0L,
            playbackCaptureUnrecoveredEventCount = playback?.unrecoveredEventCount ?: 0L,
            playbackCaptureLastRecoveryReason = playback?.lastRecoveryReason ?: "",
            playbackCaptureLastRecoveryAt = playback?.lastRecoveryAt ?: 0L,
            playbackCaptureSuspended = playback?.suspended ?: false
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
            reportFatalError(safeMessage(error))
            if (error is Error) throw error
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
                var fatalPublishError = ""
                val outputBuffer = encoder.getOutputBuffer(outputIndex)
                val encodedMediaFrame = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0
                if (outputBuffer != null && info.size > 0 && encodedMediaFrame) {
                    encoderProbeState.recordVideoEncodedOutput(encoder)
                    val frameBytes = info.size.toLong()
                    if (publisherConfigured) {
                        val publishResult = publisher.sendVideo(outputBuffer, info)
                        if (publishResult.sent) {
                            synchronized(counterLock) {
                                videoFrames += 1
                                encodedBytes += frameBytes
                            }
                        } else {
                            synchronized(counterLock) { droppedVideoFrames += 1 }
                            fatalPublishError = publishResult.fatalError
                        }
                    } else {
                        synchronized(counterLock) { droppedVideoFrames += 1 }
                    }
                }
                encoder.releaseOutputBuffer(outputIndex, false)
                if (fatalPublishError.isNotBlank()) {
                    reportFatalError(fatalPublishError)
                    return
                }
            }
            outputIndex = encoder.dequeueOutputBuffer(info, 0)
        }
    }

    private fun runAudioEncoder() {
        val outputInfo = MediaCodec.BufferInfo()
        val micReadBuffer = ByteArray(micAudioChunkSizeBytes())
        val appAudioBuffer = ByteArray(outputAudioChunkSizeBytes())
        val cadence = AndroidAudioCadenceState(
            sampleRate = AUDIO_SAMPLE_RATE,
            frameSizeBytes = AUDIO_OUTPUT_CHANNEL_COUNT * PCM_BYTES_PER_SAMPLE,
            chunkDurationNanos = AUDIO_CHUNK_MILLIS * 1_000_000L,
            startedAtNanos = System.nanoTime()
        )
        while (running.get()) {
            queueAudioInput(micReadBuffer, appAudioBuffer, cadence)
            drainAudioOutput(outputInfo)
            val delayNanos = cadence.delayUntilNextChunkNanos(System.nanoTime())
            if (delayNanos > 0L) LockSupport.parkNanos(delayNanos)
        }
        drainAudioOutput(outputInfo)
    }

    private fun queueAudioInput(
        micReadBuffer: ByteArray,
        appAudioBuffer: ByteArray,
        cadence: AndroidAudioCadenceState
    ) {
        val encoder = audioEncoder ?: return
        val bytesRead = microphoneAudioCapture?.readInto(micReadBuffer) ?: 0
        if (!running.get()) return
        val retainedBytes = bytesRead.coerceIn(0, micReadBuffer.size)
        if (retainedBytes < micReadBuffer.size) {
            micReadBuffer.fill(0, retainedBytes, micReadBuffer.size)
            microphoneAudioCapture?.recordFallbackFrames(
                (micReadBuffer.size - retainedBytes) / (AUDIO_MIC_CHANNEL_COUNT * PCM_BYTES_PER_SAMPLE)
            )
        }
        val stereoMic = Pcm16AudioMixer.upmixMonoToStereo(micReadBuffer, micReadBuffer.size)
        val requestedAppAudioBytes = stereoMic.size.coerceAtMost(appAudioBuffer.size)
        val capturedAppAudioBytes = playbackAudioCapture?.readInto(
            appAudioBuffer,
            requestedAppAudioBytes
        ) ?: run {
            appAudioBuffer.fill(0, 0, requestedAppAudioBytes)
            0
        }
        updateAudioCaptureError()
        val effect = micProcessingEffect
        val processedMic = effect?.process(stereoMic) ?: stereoMic
        val processedAppAudio = effect?.processAppAudio(
            appAudioBuffer.copyOf(requestedAppAudioBytes),
            capturedAppAudioBytes
        ) ?: appAudioBuffer.copyOf(requestedAppAudioBytes)
        val processed = effect?.mixForBroadcast(processedMic, processedAppAudio)
            ?: Pcm16AudioMixer.mix(processedMic, processedAppAudio).pcm
        val presentationTimeUs = cadence.nextPresentationTimeUs(processed.size, System.nanoTime())
        val inputIndex = encoder.dequeueInputBuffer(AUDIO_READ_TIMEOUT_US)
        if (inputIndex < 0) {
            synchronized(counterLock) { droppedAudioFrames += 1 }
            return
        }
        val inputBuffer = encoder.getInputBuffer(inputIndex)
        if (inputBuffer == null) {
            encoder.queueInputBuffer(inputIndex, 0, 0, presentationTimeUs, 0)
            synchronized(counterLock) { droppedAudioFrames += 1 }
            return
        }
        inputBuffer.clear()
        if (inputBuffer.remaining() < processed.size) {
            encoder.queueInputBuffer(inputIndex, 0, 0, presentationTimeUs, 0)
            synchronized(counterLock) { droppedAudioFrames += 1 }
            return
        }
        inputBuffer.put(processed, 0, processed.size)
        encoder.queueInputBuffer(inputIndex, 0, processed.size, presentationTimeUs, 0)
    }

    private fun updateAudioCaptureError() {
        val microphone = microphoneAudioCapture?.snapshot()
        val playback = playbackAudioCapture?.snapshot()
        lastAudioCaptureError = when {
            microphone?.lastError?.isNotBlank() == true && microphone.suspended -> microphone.lastError
            playback?.lastError?.isNotBlank() == true && playback.suspended -> playback.lastError
            playback?.status == "unsupported" -> playback.lastError
            else -> ""
        }
    }

    private fun runEncoderThread(block: () -> Unit) {
        try {
            block()
        } catch (error: Throwable) {
            if (error is Error) workerFatalError.compareAndSet(null, error)
            reportFatalError(safeMessage(error))
            if (error is Error) throw error
        }
    }

    private fun reportFatalError(message: String) {
        if (stopping.get()) return
        val resolvedMessage = message.ifBlank { "Direct MediaCodec stream failed" }.take(160)
        lastError = resolvedMessage
        encoderProbeState.recordFailure(resolvedMessage)
        running.set(false)
        if (fatalErrorReported.compareAndSet(false, true)) {
            onFatalError(this, resolvedMessage)
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
                var fatalPublishError = ""
                val outputBuffer = encoder.getOutputBuffer(outputIndex)
                val encodedMediaFrame = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0
                if (outputBuffer != null && info.size > 0 && encodedMediaFrame) {
                    encoderProbeState.recordAudioEncodedOutput(encoder)
                    val frameBytes = info.size.toLong()
                    if (publisherConfigured) {
                        val publishResult = publisher.sendAudio(outputBuffer, info)
                        if (publishResult.sent) {
                            synchronized(counterLock) {
                                audioFrames += 1
                                encodedBytes += frameBytes
                            }
                        } else {
                            synchronized(counterLock) { droppedAudioFrames += 1 }
                            fatalPublishError = publishResult.fatalError
                        }
                    } else {
                        synchronized(counterLock) { droppedAudioFrames += 1 }
                    }
                }
                encoder.releaseOutputBuffer(outputIndex, false)
                if (fatalPublishError.isNotBlank()) {
                    reportFatalError(fatalPublishError)
                    return
                }
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
        try {
            publisher.configure(currentProfile, sps, pps, AUDIO_SAMPLE_RATE, AUDIO_OUTPUT_STEREO)
            publisher.connect(currentProfile.endpoint)
            publisherConfigured = true
        } catch (error: Throwable) {
            reportFatalError(safeMessage(error))
            if (error is Error) throw error
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
        return try {
            getInteger(key).toDouble()
        } catch (error: Exception) {
            try {
                getFloat(key).toDouble()
            } catch (fallbackError: Exception) {
                0.0
            }
        }.coerceAtLeast(0.0)
    }

    private fun MediaFormat.optionalInt(key: String): Int {
        if (!containsKey(key)) return 0
        return try {
            getInteger(key)
        } catch (error: Exception) {
            try {
                getFloat(key).roundToInt()
            } catch (fallbackError: Exception) {
                0
            }
        }
    }

    private fun MediaFormat.stringValue(key: String): String =
        if (containsKey(key)) {
            try {
                getString(key).orEmpty()
            } catch (error: Exception) {
                ""
            }
        } else {
            ""
        }

    private fun codecName(codec: MediaCodec): String = try {
        codec.name
    } catch (error: Exception) {
        ""
    }

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

    private fun awaitWorkersUntil(deadlineNanos: Long): Boolean {
        val microphoneStopped = microphoneAudioCapture?.awaitStopped(deadlineNanos) ?: true
        val playbackStopped = playbackAudioCapture?.awaitStopped(deadlineNanos) ?: true
        val threads = listOfNotNull(videoThread, audioThread)
        val encoderThreadsStopped = awaitAndroidWorkerThreadsUntil(threads, deadlineNanos)
        return microphoneStopped && playbackStopped && encoderThreadsStopped
    }

    private fun forceUnblockWorkers() {
        videoThread?.interrupt()
        audioThread?.interrupt()
        // MediaCodec.stop() is an owner operation and is only attempted after workers exit.
    }

    private fun releaseVideoInputs(): Throwable? {
        val releaseState = AndroidNativeOwnerReleaseState()
        try {
            releaseState.execute(
                { virtualDisplay?.release() },
                { screenImageReader?.close() },
                { videoInputSurface?.release() }
            )
        } finally {
            virtualDisplay = null
            screenImageReader = null
            videoInputSurface = null
        }
        return releaseState.failure()
    }

    private fun MediaCodec.stopAndReleaseWithRetry(ownerName: String): Boolean {
        var releaseConfirmed = false
        try {
            executeAndroidNativeOwnerWithinDeadline(
                ownerName = "$ownerName MediaCodec",
                timeoutMillis = NATIVE_OWNER_RELEASE_TIMEOUT_MILLIS
            ) {
                var fatalStopError: Error? = null
                try {
                    stop()
                } catch (error: Exception) {
                    recordCleanupFailure("$ownerName MediaCodec stop failed: ${safeMessage(error)}")
                } catch (error: Error) {
                    recordCleanupFailure("$ownerName MediaCodec stop failed: ${safeMessage(error)}")
                    fatalStopError = error
                }
                releaseConfirmed = releaseNativeOwnerWithRetry(
                    ownerName = "$ownerName MediaCodec",
                    release = this::release,
                    onFailure = ::recordCleanupFailure
                )
                fatalStopError?.let { throw it }
            }
        } catch (error: AndroidNativeOwnerTimeoutException) {
            recordCleanupFailure("$ownerName MediaCodec release timed out: ${safeMessage(error)}")
            return false
        } catch (error: InterruptedException) {
            Thread.currentThread().interrupt()
            recordCleanupFailure("$ownerName MediaCodec release interrupted: ${safeMessage(error)}")
            return false
        }
        return releaseConfirmed
    }

    private fun recordCleanupFailure(message: String) {
        lastError = message.take(160)
        encoderProbeState.recordFailure(lastError)
    }

    private fun safeMessage(error: Throwable): String = (error.message ?: error.javaClass.simpleName).take(160)
}

internal fun awaitAndroidWorkerThreadsUntil(threads: List<Thread>, deadlineNanos: Long): Boolean {
    for (thread in threads) {
        if (!thread.isAlive) continue
        if (Thread.currentThread() === thread) return false
        val remainingNanos = deadlineNanos - System.nanoTime()
        if (remainingNanos <= 0L) return false
        val millis = remainingNanos / 1_000_000L
        val nanos = (remainingNanos % 1_000_000L).toInt()
        try {
            thread.join(millis, nanos)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            return false
        }
    }
    return threads.none(Thread::isAlive)
}

internal fun releaseNativeOwnerWithRetry(
    ownerName: String,
    release: () -> Unit,
    onFailure: (String) -> Unit,
    maxAttempts: Int = 3,
    retryDelayMillis: Long = 100L
): Boolean {
    require(ownerName.isNotBlank()) { "Native owner name is required" }
    require(maxAttempts > 0) { "Native owner release attempts must be positive" }
    require(retryDelayMillis >= 0L) { "Native owner release retry delay cannot be negative" }
    for (attempt in 1..maxAttempts) {
        try {
            release()
            return true
        } catch (error: AndroidNativeOwnerTimeoutException) {
            val detail = (error.message ?: error.javaClass.simpleName).take(100)
            onFailure("$ownerName release timed out (attempt $attempt/$maxAttempts): $detail")
            return false
        } catch (error: InterruptedException) {
            val detail = (error.message ?: error.javaClass.simpleName).take(100)
            Thread.currentThread().interrupt()
            onFailure("$ownerName release interrupted (attempt $attempt/$maxAttempts): $detail")
            return false
        } catch (error: Exception) {
            val detail = (error.message ?: error.javaClass.simpleName).take(100)
            val exhaustion = if (attempt == maxAttempts) ", exhausted" else ""
            onFailure("$ownerName release failed (attempt $attempt/$maxAttempts$exhaustion): $detail")
            if (attempt < maxAttempts && retryDelayMillis > 0L) {
                try {
                    Thread.sleep(retryDelayMillis)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    return false
                }
            }
        }
    }
    return false
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
