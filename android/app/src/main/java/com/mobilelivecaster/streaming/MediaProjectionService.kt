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

internal data class AndroidMediaProjectionReleaseResult(
    val released: Boolean,
    val failure: Throwable?
)

class MediaProjectionService : Service() {
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
    private var mediaProjectionCallback: MediaProjection.Callback? = null
    private var mediaProjectionSessionToken: MediaProjectionSessionToken? = null
    private val mediaProjectionSessionGuard = MediaProjectionSessionGuard()
    private val publisherCallbackSessionGuard = PublisherCallbackSessionGuard()
    private var publisherCallbackSessionToken: PublisherCallbackSessionToken? = null
    private var genericStream: GenericStream? = null
    private var directMediaCodecStream: AndroidMediaCodecDirectStream? = null
    private var directCleanupPending = false
    private var nativeCleanupToken: AndroidNativeCleanupToken? = null
    private var sharedStreamResourcesReleased = true
    private val streamResourceReleaseCallbacks = mutableListOf<() -> Unit>()
    private var micProcessingEffect: MicProcessingEffect? = null
    private var nativeCompositionResult: AndroidCompositionResult? = null
    private val reconnectHandler = Handler(Looper.getMainLooper())
    private val continuityHandler = Handler(Looper.getMainLooper())
    private var reconnectAttempts = 0
    private var userRequestedStop = false
    private var terminalFailure = false
    private var estimatedBytesWritten = 0L
    private var lastBitrateSampleAtMs: Long? = null
    @Volatile
    private var lastKnownBitrate = 0L
    private var lastNativeFps = 0
    private val videoFrameIntervalTracker = VideoFrameIntervalTracker()
    private val mediaContinuityTracker = MediaContinuityTracker()
    private val avSyncAccumulator = NativeRuntimeAvSyncAccumulator()
    private val liveVideoBitrateTracker = LiveVideoBitrateTracker()
    private val adaptiveBitrateController = NativeAdaptiveBitrateController()
    private val publishGenerationTracker = NativePublishGenerationTracker()
    @Volatile
    private var cumulativeReconnectCount = 0
    private var observedBitrateUpdateFailureCount = 0L
    private val deviceResourceMonitor by lazy { DeviceResourceMonitor(applicationContext) }
    private val mediaProjectionManager: MediaProjectionManager by lazy {
        applicationContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    }
    private val publisherCallbackDelegate = object : ConnectChecker {
        override fun onConnectionStarted(url: String) = handleConnectionStarted()
        override fun onConnectionSuccess() = handleConnectionSuccess()
        override fun onConnectionFailed(reason: String) = handleConnectionFailed(reason)
        override fun onNewBitrate(bitrate: Long) = handleNewBitrate(bitrate)
        override fun onDisconnect() = handleDisconnect()
        override fun onAuthError() = handleAuthError()
        override fun onAuthSuccess() = handleAuthSuccess()
    }
    private val continuityHeartbeat = object : Runnable {
        override fun run() {
            if (userRequestedStop || terminalFailure || (genericStream == null && directMediaCodecStream == null)) {
                return
            }
            try {
                runAdaptiveBitrateHeartbeat()
                updateNativeRuntimeFromActiveStream(message = LiveCasterSession.health.message)
                continuityHandler.postDelayed(this, CONTINUITY_HEARTBEAT_INTERVAL_MS)
            } catch (error: Error) {
                stopAfterFatalError(error, error.message ?: "Native continuity heartbeat failed")
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        AndroidSceneCompositor.setVrmFrameReadyListener {
            continuityHandler.post {
                if (!userRequestedStop && !terminalFailure && (genericStream != null || directMediaCodecStream != null)) {
                    updateStreamScene()
                }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_STREAM -> startStreamFromSession()
            ACTION_STOP_STREAM -> stopStream()
            ACTION_RECONNECT_STREAM -> reconnectStream("Manual reconnect requested")
            ACTION_UPDATE_QUALITY -> updateStreamQuality()
            ACTION_UPDATE_SCENE -> updateStreamScene()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        AndroidSceneCompositor.setVrmFrameReadyListener(null)
        reconnectHandler.removeCallbacksAndMessages(null)
        stopContinuityHeartbeat()
        releaseStreamResources()
        super.onDestroy()
    }

    private fun startStreamFromSession(resetReconnectAttempts: Boolean = true) {
        when (
            resolveAndroidStreamStartDisposition(
                ownerRestartBlocked = AndroidNativeOwnerRestartGuard.reason() != null,
                processCleanupPending = AndroidNativeCleanupPendingGate.isPending(),
                directCleanupPending = directCleanupPending,
                hasDirectStream = directMediaCodecStream != null,
                hasGenericStream = genericStream != null
            )
        ) {
            AndroidStreamStartDisposition.OWNER_CLEANUP_FAILED -> {
                LiveCasterSession.fail(
                    AndroidNativeOwnerRestartGuard.reason()
                        ?: "Native stream cleanup was not confirmed. Restart MobileLiveCaster before streaming again."
                )
                stopSelf()
                return
            }
            AndroidStreamStartDisposition.CLEANUP_PENDING -> {
                LiveCasterSession.fail("Previous native stream is still stopping. Try again in a moment")
                return
            }
            AndroidStreamStartDisposition.ALREADY_ACTIVE -> {
                LiveCasterSession.updateHealth(message = liveMessage("A stream is already active"))
                return
            }
            AndroidStreamStartDisposition.ALLOW -> Unit
        }
        val profile = LiveCasterSession.profile
        val captureConsent = LiveCasterSession.consumeCaptureConsent()

        if (profile == null || captureConsent == null) {
            LiveCasterSession.fail("Screen capture consent expired. Start again and approve screen sharing")
            stopSelf()
            return
        }

        try {
            userRequestedStop = false
            terminalFailure = false
            sharedStreamResourcesReleased = false
            if (resetReconnectAttempts) {
                reconnectAttempts = 0
                resetNativeRuntimeCounters()
                liveVideoBitrateTracker.reset(profile.videoBitrate / 1_000)
                adaptiveBitrateController.reset(profile.videoBitrate / 1_000, SystemClock.elapsedRealtime())
                cumulativeReconnectCount = 0
                observedBitrateUpdateFailureCount = 0
            }
            val effectiveTargetKbps = adaptiveBitrateController
                .snapshot(SystemClock.elapsedRealtime())
                .effectiveTargetKbps
                .takeIf { it > 0 }
                ?: profile.videoBitrate / 1_000
            val streamProfile = profile.copy(videoBitrate = effectiveTargetKbps * 1_000)
            startForegroundCompat()
            val encoderPreflight = AndroidMediaCodecProbe.inspect(streamProfile)
            LiveCasterSession.updateNativeRuntime(
                publisherState = "preparing",
                continuity = mediaContinuityTracker.record(null, null, active = false),
                device = deviceResourceMonitor.snapshot(),
                message = encoderPreflight.message
            )
            val projection = mediaProjectionManager.getMediaProjection(captureConsent.resultCode, captureConsent.data)
                ?: throw IllegalStateException("Could not create MediaProjection")
            attachMediaProjection(projection)

            if (streamProfile.androidPublisherMode == "mediacodec") {
                startDirectMediaCodecStream(projection, streamProfile)
                return
            }

            val microphoneSource = MicrophoneSource()
            micProcessingEffect?.release()
            micProcessingEffect = MicProcessingEffect(applicationContext, streamProfile.micEffects, streamProfile.broadcastMixer).also { effect ->
                microphoneSource.setAudioEffect(effect)
            }

            val connectChecker = beginPublisherCallbackSession()
            val callbackToken = checkNotNull(publisherCallbackSessionToken) {
                "Publisher callback session token is unavailable"
            }
            val stream = GenericStream(
                baseContext,
                connectChecker,
                NoVideoSource(),
                microphoneSource
            ).apply {
                getStreamClient().setReTries(MAX_RECONNECT_ATTEMPTS)
                getGlInterface().setForceRender(true, streamProfile.fps)
                setFpsListener { fps ->
                    dispatchPublisherCallback(callbackToken) {
                        lastNativeFps = fps
                        LiveCasterSession.updateHealth(fps = fps, message = LiveCasterSession.health.message)
                        updateNativeRuntimeFromStream(message = LiveCasterSession.health.message)
                    }
                }
            }
            genericStream?.release()
            genericStream = stream

            val preparedVideo = stream.prepareVideo(
                streamProfile.width,
                streamProfile.height,
                streamProfile.videoBitrate,
                fps = streamProfile.fps,
                rotation = 0
            )
            val preparedAudio = stream.prepareAudio(
                sampleRate = 44100,
                isStereo = true,
                bitrate = streamProfile.audioBitrate,
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
            liveVideoBitrateTracker.recordApplied(streamProfile.videoBitrate / 1_000)
            adaptiveBitrateController.recordApplied(streamProfile.videoBitrate / 1_000)
            when (LiveCasterSession.status) {
                LiveCasterStatus.Reconnecting -> LiveCasterSession.updateHealth(
                    reconnectAttempts = reconnectAttempts,
                    message = liveMessage("Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})")
                )
                LiveCasterStatus.Live -> Unit
                else -> LiveCasterSession.updateHealth(message = liveMessage("Connecting"))
            }
            startContinuityHeartbeat()
        } catch (error: Exception) {
            val message = error.message ?: "Android screen stream failed"
            if (LiveCasterSession.status == LiveCasterStatus.Reconnecting) {
                scheduleReconnect(message)
            } else {
                stopStreamAfterFailure(message)
            }
        } catch (error: Error) {
            stopAfterFatalError(error, error.message ?: "Android screen stream failed")
        }
    }

    private fun startDirectMediaCodecStream(projection: MediaProjection, profile: LiveCasterProfile) {
        check(directMediaCodecStream == null) { "A direct MediaCodec stream is already active" }
        genericStream?.release()
        genericStream = null
        micProcessingEffect?.release()
        micProcessingEffect = null
        val directComposition = AndroidSceneCompositor.prepareCanvas(applicationContext, LiveCasterSession.renderGraphJson)
        nativeCompositionResult = directComposition.result
        val directStream = AndroidMediaCodecDirectStream(
            applicationContext,
            beginPublisherCallbackSession(),
            liveVideoBitrateTracker,
            ::handleDirectStreamFatalError
        )
        directMediaCodecStream = directStream
        lastNativeFps = profile.fps
        updateNativeRuntimeFromDirectStream(
            publisherState = "preparing",
            compositionResult = nativeCompositionResult,
            message = liveMessage("Preparing direct MediaCodec stream")
        )
        directStream.start(projection, profile, directComposition)
        when (LiveCasterSession.status) {
            LiveCasterStatus.Reconnecting -> LiveCasterSession.updateHealth(
                reconnectAttempts = reconnectAttempts,
                message = liveMessage("Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})")
            )
            LiveCasterStatus.Live -> Unit
            else -> LiveCasterSession.updateHealth(message = liveMessage("Connecting"))
        }
        val publisherState = when (LiveCasterSession.status) {
            LiveCasterStatus.Live -> "published"
            LiveCasterStatus.Reconnecting -> "reconnecting"
            else -> "connecting"
        }
        updateNativeRuntimeFromDirectStream(publisherState = publisherState, message = LiveCasterSession.health.message)
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

    private fun reconnectStream(reason: String) {
        userRequestedStop = false
        terminalFailure = false
        reconnectHandler.removeCallbacksAndMessages(null)
        publishGenerationTracker.invalidate()
        if (LiveCasterSession.status != LiveCasterStatus.Reconnecting) {
            reconnectAttempts = (reconnectAttempts + 1).coerceAtLeast(1)
            cumulativeReconnectCount += 1
            LiveCasterSession.markReconnecting(reconnectAttempts, "Reconnecting")
        } else {
            reconnectAttempts = reconnectAttempts.coerceAtLeast(LiveCasterSession.health.reconnectAttempts)
        }

        val stream = genericStream
        val directStream = directMediaCodecStream
        if (directStream != null) {
            try {
                directStream.reconnectPublisher()
                if (LiveCasterSession.status != LiveCasterStatus.Live) {
                    LiveCasterSession.updateHealth(
                        reconnectAttempts = reconnectAttempts,
                        message = "Reconnecting publisher (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})"
                    )
                    updateNativeRuntimeFromDirectStream(
                        publisherState = "reconnecting",
                        message = LiveCasterSession.health.message
                    )
                }
            } catch (error: Exception) {
                scheduleReconnect(error.message ?: "Direct publisher reconnect failed")
            } catch (error: Error) {
                stopAfterFatalError(error, error.message ?: "Direct publisher reconnect failed")
            }
            return
        }
        if (stream == null) {
            stopStreamAfterFailure("Publisher session is unavailable. Start again and approve screen sharing")
            return
        }
        try {
            val retryAccepted = stream.getStreamClient().reTry(0L, reason)
            if (!retryAccepted) {
                stopStreamAfterFailure("Publisher reconnect was rejected. Start again and approve screen sharing")
                return
            }
            if (LiveCasterSession.status != LiveCasterStatus.Live) {
                LiveCasterSession.updateHealth(
                    reconnectAttempts = reconnectAttempts,
                    message = "Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})"
                )
                updateNativeRuntimeFromStream(publisherState = "reconnecting", message = LiveCasterSession.health.message)
            }
        } catch (error: Exception) {
            scheduleReconnect(error.message ?: "Reconnect failed")
        } catch (error: Error) {
            stopAfterFatalError(error, error.message ?: "Reconnect failed")
        }
    }

    private fun stopStream() {
        beginNativeCleanup()
        var fatalStopError: Error? = null
        try {
            val preparationState = AndroidNativeOwnerReleaseState()
            try {
                preparationState.execute(
                    {
                        userRequestedStop = true
                        terminalFailure = false
                        reconnectHandler.removeCallbacksAndMessages(null)
                        reconnectAttempts = 0
                        publishGenerationTracker.invalidate()
                        stopContinuityHeartbeat()
                    },
                    { captureFinalContinuitySample() }
                )
            } catch (error: Error) {
                fatalStopError = mergeFatalError(fatalStopError, error)
            }
        } finally {
            try {
                releaseStreamResources {
                    val restartRequired = AndroidNativeOwnerRestartGuard.reason()
                    if (restartRequired == null) {
                        LiveCasterSession.markStopped()
                    } else {
                        LiveCasterSession.fail(restartRequired)
                    }
                    stopSelf()
                }
            } catch (error: Error) {
                fatalStopError = mergeFatalError(fatalStopError, error)
            }
        }
        fatalStopError?.let { throw it }
    }

    private fun updateStreamQuality() {
        val profile = LiveCasterSession.profile ?: return
        val directStream = directMediaCodecStream
        val stream = genericStream
        val requestedTargetKbps = profile.videoBitrate / 1_000
        if (directStream == null && stream == null) {
            adaptiveBitrateController.requestBaselineChange(requestedTargetKbps)
            adaptiveBitrateController.recordApplied(requestedTargetKbps)
            return
        }
        var controllerSnapshot = adaptiveBitrateController.snapshot(SystemClock.elapsedRealtime())
        val baselineChanged = controllerSnapshot.baselineTargetKbps != requestedTargetKbps
        if (baselineChanged) {
            val deviceSnapshot = deviceResourceMonitor.snapshot()
            adaptiveBitrateController.requestBaselineChange(
                baselineKbps = requestedTargetKbps,
                thermalState = deviceSnapshot.thermalState,
                memoryPressureState = deviceSnapshot.memoryPressureState
            )
            controllerSnapshot = adaptiveBitrateController.snapshot(SystemClock.elapsedRealtime())
        }
        val effectiveTargetKbps = resolveNativeVideoBitrateTargetKbps(
            requestedTargetKbps = requestedTargetKbps,
            baselineChanged = baselineChanged,
            controller = controllerSnapshot
        )
        val effectiveProfile = profile.copy(videoBitrate = effectiveTargetKbps * 1_000)
        val requestGeneration = liveVideoBitrateTracker.recordRequested(effectiveTargetKbps)
        if (directStream != null) {
            try {
                directStream.updateProfile(effectiveProfile, requestGeneration)
                lastNativeFps = profile.fps
                val message = liveMessage("Live quality update requested at $effectiveTargetKbps kbps / ${profile.fps}fps")
                LiveCasterSession.updateHealth(
                    fps = profile.fps,
                    message = message
                )
                updateNativeRuntimeFromDirectStream(
                    publisherState = directStream.snapshot().publisherState,
                    message = message
                )
            } catch (error: Exception) {
                try {
                    if (liveVideoBitrateTracker.recordFailure(effectiveTargetKbps, requestGeneration)) {
                        adaptiveBitrateController.recordFailure(
                            error.message ?: "Live quality update failed",
                            System.currentTimeMillis()
                        )
                    }
                    observedBitrateUpdateFailureCount = liveVideoBitrateTracker.snapshot().failureCount
                    updateNativeRuntimeFromDirectStream(
                        lastError = error.message ?: "Live quality update failed",
                        message = LiveCasterSession.health.message
                    )
                } catch (telemetryError: Error) {
                    stopAfterFatalError(telemetryError, telemetryError.message ?: "Live quality telemetry failed")
                }
            } catch (error: Error) {
                stopAfterFatalError(error, error.message ?: "Live quality update failed")
            }
            return
        }
        val activeStream = stream ?: return

        val updateResult = executeTrackedNativeVideoBitrateUpdate(
            targetKbps = effectiveTargetKbps,
            tracker = liveVideoBitrateTracker,
            requestGeneration = requestGeneration,
            applyBitrate = { activeStream.setVideoBitrateOnFly(effectiveProfile.videoBitrate) },
            afterBitrateApplied = {
                activeStream.getGlInterface().setForceRender(true, profile.fps)
                lastNativeFps = profile.fps
                micProcessingEffect?.updateProfile(profile.micEffects, profile.broadcastMixer)
                activeStream.requestKeyframe()
            },
            onBitrateApplied = adaptiveBitrateController::recordApplied,
            onBitrateFailure = { _, error ->
                adaptiveBitrateController.recordFailure(
                    error.message ?: "Live quality update failed",
                    System.currentTimeMillis()
                )
            }
        )
        if (!updateResult.trackerAccepted) {
            return
        }
        if (updateResult.bitrateApplied) {
            val message = liveMessage("Live quality updated to $effectiveTargetKbps kbps / ${profile.fps}fps")
            LiveCasterSession.updateHealth(
                fps = profile.fps,
                message = message
            )
            updateNativeRuntimeFromStream(
                lastError = updateResult.ancillaryFailure?.message ?: "",
                message = message
            )
        } else {
            val error = updateResult.bitrateFailure ?: IllegalStateException("Live bitrate update failed")
            observedBitrateUpdateFailureCount = liveVideoBitrateTracker.snapshot().failureCount
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
        avSyncAccumulator.reset()
        publishGenerationTracker.reset()
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

    private fun runAdaptiveBitrateHeartbeat() {
        val nowElapsedMs = SystemClock.elapsedRealtime()
        val trackerSnapshot = liveVideoBitrateTracker.snapshot()
        var controllerSnapshot = adaptiveBitrateController.snapshot(nowElapsedMs)
        if (
            controllerSnapshot.pendingTargetKbps > 0 &&
            trackerSnapshot.requestGeneration > 0 &&
            trackerSnapshot.appliedRequestGeneration == trackerSnapshot.requestGeneration &&
            trackerSnapshot.appliedTargetKbps == controllerSnapshot.pendingTargetKbps
        ) {
            val appliedTargetKbps = trackerSnapshot.appliedTargetKbps
            val direction = if (appliedTargetKbps < controllerSnapshot.baselineTargetKbps) "lowered" else "restored"
            adaptiveBitrateController.recordApplied(trackerSnapshot.appliedTargetKbps)
            controllerSnapshot = adaptiveBitrateController.snapshot(nowElapsedMs)
            LiveCasterSession.updateHealth(
                message = liveMessage("Native adaptive bitrate $direction and confirmed at $appliedTargetKbps kbps")
            )
        }
        if (
            trackerSnapshot.failureCount > observedBitrateUpdateFailureCount &&
            trackerSnapshot.failedRequestGeneration == trackerSnapshot.requestGeneration &&
            controllerSnapshot.controllerState != "failed"
        ) {
            adaptiveBitrateController.recordFailure(
                "Native encoder rejected the adaptive bitrate target",
                System.currentTimeMillis()
            )
        }
        observedBitrateUpdateFailureCount = trackerSnapshot.failureCount

        val directSnapshot = directMediaCodecStream?.snapshot()
        val stream = genericStream
        val client = stream?.getStreamClient()
        val deviceSnapshot = deviceResourceMonitor.snapshot()
        val publisherState = directSnapshot?.publisherState
            ?: LiveCasterSession.nativeRuntime?.publisher?.state
            ?: ""
        val transportActive = when {
            directSnapshot != null -> directSnapshot.publisherState == "published"
            stream != null -> stream.isStreaming
            else -> false
        }
        val publishGeneration = publishGenerationTracker.currentGeneration()
        val active = isNativeAdaptiveBitrateActive(
            sessionLive = LiveCasterSession.status == LiveCasterStatus.Live,
            publishGeneration = publishGeneration,
            publisherState = publisherState,
            transportActive = transportActive
        )
        val decision = adaptiveBitrateController.evaluate(
            NativeAdaptiveBitrateSample(
                nowElapsedMs = nowElapsedMs,
                nowWallMs = System.currentTimeMillis(),
                active = active,
                publishGeneration = publishGeneration,
                congested = directSnapshot?.congested
                    ?: try {
                        client?.hasCongestion() == true
                    } catch (_: Exception) {
                        false
                    },
                queuedItems = directSnapshot?.itemsInCache ?: client?.getItemsInCache() ?: 0,
                cacheSize = directSnapshot?.cacheSize ?: client?.getCacheSize() ?: 0,
                measuredBitrateKbps = (lastKnownBitrate / 1_000L).coerceAtMost(Int.MAX_VALUE.toLong()).toInt(),
                // Encoder output rate drops on low-motion scenes even when the network is healthy.
                useMeasuredBitrate = false,
                droppedVideoFrames = directSnapshot?.publisherDroppedVideoFrames
                    ?: client?.getDroppedVideoFrames()
                    ?: 0L,
                cumulativeReconnectCount = cumulativeReconnectCount,
                thermalState = deviceSnapshot.thermalState,
                memoryPressureState = deviceSnapshot.memoryPressureState
            )
        ) ?: return

        val baselineProfile = LiveCasterSession.profile ?: return
        val effectiveProfile = baselineProfile.copy(videoBitrate = decision.targetKbps * 1_000)
        val requestGeneration = liveVideoBitrateTracker.recordRequested(decision.targetKbps)
        val usesDirectMediaCodec = directMediaCodecStream != null
        val messagePrefix = if (usesDirectMediaCodec) {
            "Native adaptive bitrate ${decision.type} requested at ${decision.targetKbps} kbps"
        } else if (decision.type == "reduce") {
            "Native adaptive bitrate lowered to ${decision.targetKbps} kbps"
        } else {
            "Native adaptive bitrate restored to ${decision.targetKbps} kbps"
        }
        val message = liveMessage("$messagePrefix: ${decision.reason}")

        try {
            val directStream = directMediaCodecStream
            if (directStream != null) {
                directStream.updateProfile(effectiveProfile, requestGeneration)
            } else {
                val activeStream = genericStream ?: throw IllegalStateException("Native stream is unavailable")
                val updateResult = executeTrackedNativeVideoBitrateUpdate(
                    targetKbps = decision.targetKbps,
                    tracker = liveVideoBitrateTracker,
                    requestGeneration = requestGeneration,
                    applyBitrate = { activeStream.setVideoBitrateOnFly(effectiveProfile.videoBitrate) },
                    afterBitrateApplied = { activeStream.requestKeyframe() },
                    onBitrateApplied = adaptiveBitrateController::recordApplied,
                    onBitrateFailure = { _, error ->
                        adaptiveBitrateController.recordFailure(
                            error.message ?: "Native adaptive bitrate update failed",
                            System.currentTimeMillis()
                        )
                    }
                )
                if (!updateResult.trackerAccepted) {
                    return
                }
                updateResult.bitrateFailure?.let { bitrateError ->
                    observedBitrateUpdateFailureCount = liveVideoBitrateTracker.snapshot().failureCount
                    updateNativeRuntimeFromStream(
                        lastError = bitrateError.message ?: "Native adaptive bitrate update failed",
                        message = LiveCasterSession.health.message
                    )
                    return
                }
                updateResult.ancillaryFailure?.let { ancillaryError ->
                    updateNativeRuntimeFromStream(
                        lastError = ancillaryError.message ?: "Native keyframe request failed",
                        message = message
                    )
                }
            }
            LiveCasterSession.updateHealth(message = message)
        } catch (error: Exception) {
            try {
                val safeError = (error.message ?: "Native adaptive bitrate update failed").take(160)
                if (liveVideoBitrateTracker.recordFailure(decision.targetKbps, requestGeneration)) {
                    adaptiveBitrateController.recordFailure(safeError, System.currentTimeMillis())
                }
                observedBitrateUpdateFailureCount = liveVideoBitrateTracker.snapshot().failureCount
                updateNativeRuntimeFromActiveStream(lastError = safeError, message = LiveCasterSession.health.message)
            } catch (telemetryError: Error) {
                stopAfterFatalError(telemetryError, telemetryError.message ?: "Adaptive bitrate telemetry failed")
            }
        } catch (error: Error) {
            stopAfterFatalError(error, error.message ?: "Native adaptive bitrate update failed")
        }
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

    private fun currentPublishEvidence(
        sentVideoFrames: Long?,
        sentAudioFrames: Long?,
        publisherState: String
    ): NativePublishGenerationSnapshot {
        val evidence = publishGenerationTracker.snapshot(sentVideoFrames, sentAudioFrames)
        return if (LiveCasterSession.status == LiveCasterStatus.Live && publisherState == "published") {
            evidence
        } else {
            evidence.copy(currentPublishVideoFrames = 0L, currentPublishAudioFrames = 0L)
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
        val observedPublisherState = publisherState
            ?: snapshot?.publisherState
            ?: LiveCasterSession.nativeRuntime?.publisher?.state
            ?: ""
        val resolvedPublisherState = resolveNativePublisherState(LiveCasterSession.status, observedPublisherState)
        val publishEvidence = currentPublishEvidence(
            snapshot?.sentVideoFrames,
            snapshot?.sentAudioFrames,
            resolvedPublisherState
        )
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
            publishGeneration = publishEvidence.publishGeneration,
            currentPublishVideoFrames = publishEvidence.currentPublishVideoFrames,
            currentPublishAudioFrames = publishEvidence.currentPublishAudioFrames,
            videoEncoderBackend = snapshot?.videoEncoderBackend ?: AndroidMediaCodecRtmpPublisher.VIDEO_BACKEND,
            audioEncoderBackend = snapshot?.audioEncoderBackend ?: AndroidMediaCodecRtmpPublisher.AUDIO_BACKEND,
            encoderProbe = snapshot?.encoderProbe,
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
            bitrateAdaptation = liveVideoBitrateTracker.snapshot().toNativeRuntimeBitrateAdaptation(
                adaptiveBitrateController.snapshot(SystemClock.elapsedRealtime())
            ),
            lastError = lastError ?: snapshot?.lastError,
            audioProcessing = snapshot?.audioProcessing,
            continuity = continuity,
            avSync = avSyncAccumulator.combine(snapshot?.avSync),
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
        val observedPublisherState = publisherState
            ?: previousPublisherState.takeIf { it.isNotBlank() }
            ?: if (genericStream?.isStreaming == true) "connecting" else ""
        val resolvedPublisherState = resolveNativePublisherState(LiveCasterSession.status, observedPublisherState)
        val publishEvidence = currentPublishEvidence(sentVideoFrames, sentAudioFrames, resolvedPublisherState)
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
            publishGeneration = publishEvidence.publishGeneration,
            currentPublishVideoFrames = publishEvidence.currentPublishVideoFrames,
            currentPublishAudioFrames = publishEvidence.currentPublishAudioFrames,
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
            bitrateAdaptation = liveVideoBitrateTracker.snapshot().toNativeRuntimeBitrateAdaptation(
                adaptiveBitrateController.snapshot(SystemClock.elapsedRealtime())
            ),
            lastError = lastError,
            audioProcessing = micProcessingEffect?.snapshot(),
            continuity = continuity,
            device = deviceResourceMonitor.snapshot(),
            message = message
        )
    }

    private fun stopStreamAfterFailure(message: String) {
        beginNativeCleanup()
        var fatalStopError: Error? = null
        try {
            val preparationState = AndroidNativeOwnerReleaseState()
            try {
                preparationState.execute(
                    {
                        userRequestedStop = true
                        terminalFailure = true
                        reconnectHandler.removeCallbacksAndMessages(null)
                        publishGenerationTracker.invalidate()
                        stopContinuityHeartbeat()
                    },
                    { captureFinalContinuitySample() },
                    { LiveCasterSession.clearCaptureConsent() },
                    { LiveCasterSession.fail(message) }
                )
            } catch (error: Error) {
                fatalStopError = mergeFatalError(fatalStopError, error)
            }
        } finally {
            try {
                releaseStreamResources {
                    stopSelf()
                }
            } catch (error: Error) {
                fatalStopError = mergeFatalError(fatalStopError, error)
            }
        }
        fatalStopError?.let { throw it }
    }

    private fun stopAfterFatalError(error: Error, message: String): Nothing {
        try {
            stopStreamAfterFailure(message)
        } catch (cleanupError: Error) {
            if (cleanupError !== error) error.addSuppressed(cleanupError)
        }
        throw error
    }

    private fun mergeFatalError(current: Error?, next: Error): Error {
        if (current == null) return next
        if (current !== next) current.addSuppressed(next)
        return current
    }

    private fun handleDirectStreamFatalError(
        failedStream: AndroidMediaCodecDirectStream,
        message: String
    ) {
        continuityHandler.post {
            if (userRequestedStop || terminalFailure || directMediaCodecStream !== failedStream) {
                return@post
            }
            var fatalTelemetryError: Error? = null
            try {
                updateNativeRuntimeFromDirectStream(
                    publisherState = "failed",
                    lastError = message,
                    message = message
                )
            } catch (error: Error) {
                fatalTelemetryError = error
            } finally {
                try {
                    stopStreamAfterFailure(message)
                } catch (cleanupError: Error) {
                    fatalTelemetryError = mergeFatalError(fatalTelemetryError, cleanupError)
                }
            }
            fatalTelemetryError?.let { throw it }
        }
    }

    private fun releaseStreamResources(onReleased: (() -> Unit)? = null) {
        beginNativeCleanup()
        var fatalReleaseError: Error? = null
        try {
            if (onReleased != null) streamResourceReleaseCallbacks += onReleased
        } catch (error: Error) {
            fatalReleaseError = mergeFatalError(fatalReleaseError, error)
        }
        try {
            invalidatePublisherCallbackSession()
        } catch (error: Error) {
            fatalReleaseError = mergeFatalError(fatalReleaseError, error)
        }
        val directStream = directMediaCodecStream
        directMediaCodecStream = null
        directStream?.let {
            val activeEncoderProbe = try {
                directStream.snapshot().encoderProbe
            } catch (error: Exception) {
                try {
                    LiveCasterSession.updateNativeRuntime(
                        lastError = "Direct stream cleanup snapshot failed: ${(error.message ?: error.javaClass.simpleName).take(100)}",
                        message = LiveCasterSession.health.message
                    )
                } catch (telemetryError: Error) {
                    fatalReleaseError = mergeFatalError(fatalReleaseError, telemetryError)
                }
                null
            } catch (error: Error) {
                fatalReleaseError = mergeFatalError(fatalReleaseError, error)
                null
            }
            directCleanupPending = true
            try {
                directStream.stop { cleanupResult ->
                    val posted = try {
                        continuityHandler.post {
                        var fatalCallbackError: Error? = null
                        try {
                            val finalSnapshot = directStream.snapshot()
                            LiveCasterSession.updateNativeRuntime(
                                encoderProbe = finalSnapshot.encoderProbe,
                                lastError = finalSnapshot.lastError.takeIf(String::isNotBlank),
                                message = LiveCasterSession.health.message
                            )
                        } catch (error: Exception) {
                            try {
                                LiveCasterSession.updateNativeRuntime(
                                    lastError = "Direct stream final snapshot failed: ${(error.message ?: error.javaClass.simpleName).take(100)}",
                                    message = LiveCasterSession.health.message
                                )
                            } catch (telemetryError: Error) {
                                fatalCallbackError = mergeFatalError(fatalCallbackError, telemetryError)
                            }
                        } catch (error: Error) {
                            fatalCallbackError = mergeFatalError(fatalCallbackError, error)
                        }
                        try {
                            if (!cleanupResult.released) {
                                blockNativeRestartForCleanup(
                                    "Native stream cleanup was not confirmed (${cleanupResult.disposition.name.lowercase()}): " +
                                        "${cleanupResult.message}. Restart MobileLiveCaster before streaming again."
                                )
                            }
                        } catch (error: Error) {
                            fatalCallbackError = mergeFatalError(fatalCallbackError, error)
                        } finally {
                            directCleanupPending = false
                            if (directMediaCodecStream == null) {
                                try {
                                    finishSharedStreamResourceRelease()
                                } catch (error: Error) {
                                    fatalCallbackError = mergeFatalError(fatalCallbackError, error)
                                }
                            }
                        }
                            fatalCallbackError?.let { throw it }
                        }
                    } catch (error: Error) {
                        try {
                            finalizeRejectedDirectCleanupHandoff(
                                "Native cleanup completion could not reach the service thread. Restart MobileLiveCaster before streaming again."
                            )
                        } catch (cleanupError: Error) {
                            if (cleanupError !== error) error.addSuppressed(cleanupError)
                        }
                        throw error
                    }
                    if (!posted) {
                        finalizeRejectedDirectCleanupHandoff(
                            "Native cleanup completion could not reach the service thread. Restart MobileLiveCaster before streaming again."
                        )
                    }
                }
            } catch (error: Error) {
                fatalReleaseError = mergeFatalError(fatalReleaseError, error)
                try {
                    finalizeRejectedDirectCleanupHandoff(
                        "Native stream cleanup could not be started. Restart MobileLiveCaster before streaming again."
                    )
                } catch (cleanupError: Error) {
                    fatalReleaseError = mergeFatalError(fatalReleaseError, cleanupError)
                }
            }
            try {
                LiveCasterSession.updateNativeRuntime(
                    encoderProbe = activeEncoderProbe,
                    lastActiveEncoderProbe = activeEncoderProbe?.takeIf { it.status == "pass" },
                    message = LiveCasterSession.health.message
                )
            } catch (error: Error) {
                fatalReleaseError = mergeFatalError(fatalReleaseError, error)
            }
        }
        val sharedOwnerReleaseState = AndroidNativeOwnerReleaseState()
        try {
            sharedOwnerReleaseState.execute(
                { genericStream?.stopStream() },
                { genericStream?.release() },
                { micProcessingEffect?.release() }
            )
        } catch (error: Error) {
            fatalReleaseError = mergeFatalError(fatalReleaseError, error)
            AndroidNativeOwnerRestartGuard.block(
                "Native shared stream cleanup failed fatally: ${(error.message ?: error.javaClass.simpleName).take(120)}. " +
                    "Restart MobileLiveCaster before streaming again."
            )
        } finally {
            genericStream = null
            micProcessingEffect = null
        }
        sharedOwnerReleaseState.failure()?.let { error ->
            AndroidNativeOwnerRestartGuard.block(
                "Native shared stream cleanup was not confirmed: ${(error.message ?: error.javaClass.simpleName).take(120)}. " +
                    "Restart MobileLiveCaster before streaming again."
            )
        }
        if (directStream == null && !directCleanupPending) {
            try {
                finishSharedStreamResourceRelease()
            } catch (error: Error) {
                fatalReleaseError = mergeFatalError(fatalReleaseError, error)
            }
        } else if (!directCleanupPending) {
            try {
                finishSharedStreamResourceRelease()
            } catch (error: Error) {
                fatalReleaseError = mergeFatalError(fatalReleaseError, error)
            }
        }
        fatalReleaseError?.let { throw it }
    }

    private fun finalizeRejectedDirectCleanupHandoff(message: String) {
        AndroidNativeOwnerRestartGuard.block(message)
        directCleanupPending = false
        if (directMediaCodecStream == null) finishSharedStreamResourceRelease()
    }

    private fun finishSharedStreamResourceRelease() {
        var fatalReleaseError: Error? = null
        var fatalCallbackError: Error? = null
        try {
            if (!sharedStreamResourcesReleased) {
                val releaseState = AndroidNativeOwnerReleaseState()
                var projectionRelease = AndroidMediaProjectionReleaseResult(released = true, failure = null)
                try {
                    releaseState.execute(
                        { AndroidSceneCompositor.release() },
                        { projectionRelease = releaseMediaProjection() },
                        { stopForeground(STOP_FOREGROUND_REMOVE) }
                    )
                } catch (error: Error) {
                    fatalReleaseError = error
                } finally {
                    sharedStreamResourcesReleased = true
                }
                val releaseFailure = releaseState.failure() ?: projectionRelease.failure
                if (releaseFailure != null || !projectionRelease.released) {
                    blockNativeRestartForCleanup(
                        "Native shared resource cleanup was not confirmed: " +
                            "${(releaseFailure?.message ?: releaseFailure?.javaClass?.simpleName ?: "MediaProjection stop failed").take(120)}. " +
                            "Restart MobileLiveCaster before streaming again."
                    )
                }
            }
            val callbacks = streamResourceReleaseCallbacks.toList()
            streamResourceReleaseCallbacks.clear()
            callbacks.forEach { callback ->
                try {
                    callback()
                } catch (error: Error) {
                    if (fatalCallbackError == null) fatalCallbackError = error
                } catch (error: Exception) {
                    LiveCasterSession.updateNativeRuntime(
                        lastError = "Stream release callback failed: ${(error.message ?: error.javaClass.simpleName).take(100)}",
                        message = LiveCasterSession.health.message
                    )
                }
            }
        } finally {
            completeNativeCleanup()
        }
        (fatalReleaseError ?: fatalCallbackError)?.let { throw it }
    }

    @Synchronized
    private fun beginNativeCleanup() {
        if (nativeCleanupToken == null) {
            nativeCleanupToken = AndroidNativeCleanupPendingGate.begin()
        }
    }

    @Synchronized
    private fun completeNativeCleanup() {
        val token = nativeCleanupToken ?: return
        AndroidNativeCleanupPendingGate.complete(token)
        nativeCleanupToken = null
    }

    private fun attachMediaProjection(projection: MediaProjection) {
        val previousRelease = releaseMediaProjection()
        if (!previousRelease.released || previousRelease.failure != null) {
            blockNativeRestartForCleanup(
                "Previous MediaProjection release was not confirmed. Restart MobileLiveCaster before streaming again."
            )
        }
        check(previousRelease.released && previousRelease.failure == null) {
            "Previous MediaProjection release was not confirmed"
        }
        val token = mediaProjectionSessionGuard.attach()
        val callback = object : MediaProjection.Callback() {
            override fun onStop() {
                if (mediaProjectionSessionGuard.recordStopped(token) != MediaProjectionStopDisposition.UNEXPECTED) {
                    return
                }
                handleUnexpectedMediaProjectionStop()
            }
        }
        projection.registerCallback(callback, continuityHandler)
        mediaProjection = projection
        mediaProjectionCallback = callback
        mediaProjectionSessionToken = token
    }

    private fun releaseMediaProjection(): AndroidMediaProjectionReleaseResult {
        val projection = mediaProjection
        val callback = mediaProjectionCallback
        val token = mediaProjectionSessionToken
        val releaseState = AndroidNativeOwnerReleaseState()
        var projectionStopConfirmed = projection == null
        if (projection != null && token != null) {
            mediaProjectionSessionGuard.expectStop(token)
        }
        try {
            releaseState.execute(
                {
                    if (projection != null && callback != null) {
                        projection.unregisterCallback(callback)
                    }
                },
                {
                    projection?.stop()
                    projectionStopConfirmed = true
                },
                {
                    if (token != null) mediaProjectionSessionGuard.detach(token)
                }
            )
        } finally {
            mediaProjection = null
            mediaProjectionCallback = null
            mediaProjectionSessionToken = null
        }
        return AndroidMediaProjectionReleaseResult(
            released = projectionStopConfirmed,
            failure = releaseState.failure()
        )
    }

    private fun blockNativeRestartForCleanup(message: String): String {
        val reason = AndroidNativeOwnerRestartGuard.block(message)
        LiveCasterSession.updateNativeRuntime(
            lastError = reason,
            message = LiveCasterSession.health.message
        )
        return reason
    }

    private fun handleUnexpectedMediaProjectionStop() {
        if (userRequestedStop || terminalFailure) {
            return
        }
        stopStreamAfterFailure("Screen sharing ended or the device was locked. Start again and approve screen sharing")
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
        publishGenerationTracker.invalidate()

        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            stopStreamAfterFailure("Connection lost after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts: $reason")
            return
        }

        reconnectAttempts += 1
        cumulativeReconnectCount += 1
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
        reconnectHandler.postDelayed({ reconnectStream(reason) }, delayMs)
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

    private fun beginPublisherCallbackSession(): ConnectChecker {
        invalidatePublisherCallbackSession()
        val token = publisherCallbackSessionGuard.attach()
        publisherCallbackSessionToken = token
        return GenerationScopedConnectChecker(
            publisherCallbackSessionGuard,
            token,
            publisherCallbackDelegate,
            callbackDispatcher = { callback -> dispatchPublisherCallback(callback) }
        )
    }

    private fun invalidatePublisherCallbackSession() {
        publisherCallbackSessionGuard.invalidate(publisherCallbackSessionToken)
        publisherCallbackSessionToken = null
    }

    private fun dispatchPublisherCallback(callback: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            callback()
        } else {
            continuityHandler.post { callback() }
        }
    }

    private fun dispatchPublisherCallback(
        token: PublisherCallbackSessionToken,
        callback: () -> Unit
    ) {
        dispatchPublisherCallback {
            publisherCallbackSessionGuard.dispatch(token, callback)
        }
    }

    private fun handleConnectionStarted() {
        publishGenerationTracker.invalidate()
        val reconnecting = LiveCasterSession.status == LiveCasterStatus.Reconnecting
        val message = if (reconnecting) LiveCasterSession.health.message else liveMessage("Connecting")
        LiveCasterSession.updateHealth(message = message)
        updateNativeRuntimeFromActiveStream(
            publisherState = if (reconnecting) "reconnecting" else "connecting",
            message = LiveCasterSession.health.message
        )
    }

    private fun handleConnectionSuccess() {
        reconnectAttempts = 0
        genericStream?.getStreamClient()?.setReTries(MAX_RECONNECT_ATTEMPTS)
        val (sentVideoFrames, sentAudioFrames) = currentSentFrameTotals()
        publishGenerationTracker.startGeneration(sentVideoFrames, sentAudioFrames)
        directMediaCodecStream?.requestKeyFrame()
        LiveCasterSession.markLive(liveMessage("Live"))
        updateNativeRuntimeFromActiveStream(publisherState = "published", lastError = "", message = LiveCasterSession.health.message)
    }

    private fun handleConnectionFailed(reason: String) {
        scheduleReconnect(reason)
    }

    private fun handleNewBitrate(bitrate: Long) {
        val bytesWritten = recordBitrateSample(bitrate)
        val droppedVideoFrames = currentDroppedVideoFrames()
        val live = LiveCasterSession.status == LiveCasterStatus.Live
        LiveCasterSession.updateHealth(
            bitrateKbps = (bitrate / 1000).toInt(),
            droppedFrames = droppedVideoFrames,
            fps = if (lastNativeFps > 0) lastNativeFps else LiveCasterSession.health.fps,
            message = if (live) "Live" else LiveCasterSession.health.message
        )
        updateNativeRuntimeFromActiveStream(
            publisherState = if (live) "published" else LiveCasterSession.nativeRuntime?.publisher?.state,
            encodedBytes = bytesWritten,
            bytesWritten = bytesWritten,
            message = LiveCasterSession.health.message
        )
    }

    private fun handleDisconnect() {
        publishGenerationTracker.invalidate()
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

    private fun handleAuthError() {
        updateNativeRuntimeFromActiveStream(publisherState = "failed", lastError = "RTMP authentication failed")
        stopStreamAfterFailure("RTMP authentication failed")
    }

    private fun handleAuthSuccess() {
        val reconnecting = LiveCasterSession.status == LiveCasterStatus.Reconnecting
        if (!reconnecting) {
            LiveCasterSession.updateHealth(message = liveMessage("Authenticated"))
        }
        updateNativeRuntimeFromActiveStream(
            publisherState = when {
                reconnecting -> "reconnecting"
                LiveCasterSession.status == LiveCasterStatus.Live -> "published"
                else -> "authenticated"
            },
            message = LiveCasterSession.health.message
        )
    }

    private fun currentSentFrameTotals(): Pair<Long?, Long?> {
        directMediaCodecStream?.snapshot()?.let { snapshot ->
            return snapshot.sentVideoFrames to snapshot.sentAudioFrames
        }
        val client = genericStream?.getStreamClient()
        return client?.getSentVideoFrames() to client?.getSentAudioFrames()
    }

    private fun liveMessage(prefix: String): String {
        val compositionSummary = nativeCompositionResult?.summary
        return if (compositionSummary.isNullOrBlank()) prefix else "$prefix; $compositionSummary"
    }
}

internal fun resolveNativePublisherState(sessionStatus: LiveCasterStatus, observedState: String): String = when {
    observedState == "failed" -> "failed"
    sessionStatus == LiveCasterStatus.Reconnecting -> "reconnecting"
    sessionStatus == LiveCasterStatus.Preparing && observedState == "published" -> "connecting"
    else -> observedState
}

internal data class NativePublishGenerationSnapshot(
    val publishGeneration: Int = 0,
    val currentPublishVideoFrames: Long = 0,
    val currentPublishAudioFrames: Long = 0
)

internal class NativePublishGenerationTracker {
    private var publishGeneration = 0
    private var active = false
    private var videoBaseline: Long? = null
    private var audioBaseline: Long? = null

    @Synchronized
    fun reset(): NativePublishGenerationSnapshot {
        publishGeneration = 0
        active = false
        videoBaseline = null
        audioBaseline = null
        return NativePublishGenerationSnapshot()
    }

    @Synchronized
    fun invalidate(): NativePublishGenerationSnapshot {
        active = false
        videoBaseline = null
        audioBaseline = null
        return NativePublishGenerationSnapshot(publishGeneration = publishGeneration)
    }

    @Synchronized
    fun startGeneration(
        sentVideoFrames: Long?,
        sentAudioFrames: Long?
    ): NativePublishGenerationSnapshot {
        if (active) {
            return snapshotLocked(sentVideoFrames, sentAudioFrames)
        }
        publishGeneration = if (publishGeneration == Int.MAX_VALUE) 1 else publishGeneration + 1
        active = true
        videoBaseline = sentVideoFrames?.coerceAtLeast(0L)
        audioBaseline = sentAudioFrames?.coerceAtLeast(0L)
        return snapshotLocked(sentVideoFrames, sentAudioFrames)
    }

    @Synchronized
    fun snapshot(sentVideoFrames: Long?, sentAudioFrames: Long?): NativePublishGenerationSnapshot =
        snapshotLocked(sentVideoFrames, sentAudioFrames)

    @Synchronized
    fun currentGeneration(): Int = publishGeneration

    private fun snapshotLocked(
        sentVideoFrames: Long?,
        sentAudioFrames: Long?
    ): NativePublishGenerationSnapshot {
        if (!active) {
            return NativePublishGenerationSnapshot(publishGeneration = publishGeneration)
        }
        return NativePublishGenerationSnapshot(
            publishGeneration = publishGeneration,
            currentPublishVideoFrames = videoDelta(sentVideoFrames),
            currentPublishAudioFrames = audioDelta(sentAudioFrames)
        )
    }

    private fun videoDelta(sentVideoFrames: Long?): Long {
        val total = sentVideoFrames?.coerceAtLeast(0L) ?: return 0L
        val baseline = videoBaseline
        if (baseline == null || total < baseline) {
            videoBaseline = total
            return 0L
        }
        return total - baseline
    }

    private fun audioDelta(sentAudioFrames: Long?): Long {
        val total = sentAudioFrames?.coerceAtLeast(0L) ?: return 0L
        val baseline = audioBaseline
        if (baseline == null || total < baseline) {
            audioBaseline = total
            return 0L
        }
        return total - baseline
    }
}

private fun LiveVideoBitrateSnapshot.toNativeRuntimeBitrateAdaptation(
    controller: NativeAdaptiveBitrateSnapshot
): NativeRuntimeBitrateAdaptation =
    NativeRuntimeBitrateAdaptation(
        status = status,
        initialTargetKbps = initialTargetKbps,
        requestedTargetKbps = requestedTargetKbps,
        appliedTargetKbps = appliedTargetKbps,
        minimumAppliedKbps = minimumAppliedKbps,
        updateCount = updateCount,
        failureCount = failureCount,
        lastUpdatedAt = lastUpdatedAt,
        controlOwner = controller.controlOwner,
        controllerState = controller.controllerState,
        baselineTargetKbps = controller.baselineTargetKbps,
        effectiveTargetKbps = controller.effectiveTargetKbps,
        floorTargetKbps = controller.floorTargetKbps,
        pendingTargetKbps = controller.pendingTargetKbps,
        automaticReductionCount = controller.automaticReductionCount,
        automaticRestorationCount = controller.automaticRestorationCount,
        pressureSampleCount = controller.pressureSampleCount,
        healthySampleCount = controller.healthySampleCount,
        cooldownRemainingMs = controller.cooldownRemainingMs,
        recoveryEligibleInMs = controller.recoveryEligibleInMs,
        publishGeneration = controller.publishGeneration,
        cumulativeReconnectCount = controller.cumulativeReconnectCount,
        lastDecisionAt = controller.lastDecisionAt,
        lastDecisionReason = controller.lastDecisionReason
    )

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
