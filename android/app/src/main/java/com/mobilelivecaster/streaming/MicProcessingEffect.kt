package com.mobilelivecaster.streaming

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.SystemClock
import com.pedro.encoder.input.audio.CustomAudioEffect
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tanh

class MicProcessingEffect(
    context: Context,
    @Volatile private var settings: MicEffectsProfile,
    @Volatile private var broadcastMixer: BroadcastMixerProfile = BroadcastMixerProfile(),
    private val sampleRate: Int = 44100,
    private val isStereo: Boolean = true
) : CustomAudioEffect() {
    private val appContext = context.applicationContext
    private val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val channelMask = if (isStereo) AudioFormat.CHANNEL_OUT_STEREO else AudioFormat.CHANNEL_OUT_MONO
    private val channelCount = if (isStereo) 2 else 1
    private val compressorThreshold = 0.42f
    private val robotStep = (2.0 * PI * 32.0 / sampleRate).toFloat()
    private var robotPhase = 0f
    private var sampleCursor = 0L
    private val monitorTrackLock = Any()
    private val monitorCallbackLock = Any()
    private val monitorRecoveryState = AudioMonitorRecoveryState()
    @Volatile private var monitorReleased = false
    private var monitorDeviceCallbackRegistered = false
    private var monitorTrack: AudioTrack? = null
    private var monitorPreferredDeviceId: Int? = null
    private var monitorRoutedDeviceId: Int? = null
    private var monitorCreateRetryAfterElapsedMs = 0L
    private var micEffectsProcessedFrames = 0L
    private var micEffectsProcessedSamples = 0L
    private var micEffectsGatedSamples = 0L
    private var micEffectsLimitedSamples = 0L
    private var monitorWrittenFrames = 0L
    private var monitorDroppedFrames = 0L
    private var monitorWrittenBuffers = 0L
    private var monitorDroppedBuffers = 0L
    private var monitorBufferSizeInBytes = 0
    private var monitorLastError = ""
    private val micLevelWindowTargetSampleCount = sampleRate.toLong() * channelCount.toLong()
    private var micLevelWindowSquaredLevelSum = 0.0
    private var micLevelWindowPeakLevel = 0f
    private var micLevelWindowSampleCount = 0L
    private var micLevelWindowClippedSampleCount = 0L
    @Volatile private var micLevelSnapshot = MicLevelSnapshot()
    private var appAudioLevelWindowSquaredLevelSum = 0.0
    private var appAudioLevelWindowPeakLevel = 0f
    private var appAudioLevelWindowSampleCount = 0L
    private var appAudioLevelWindowClippedSampleCount = 0L
    @Volatile private var appAudioLevelSnapshot = MicLevelSnapshot()
    private var mixedAudioLevelWindowSquaredLevelSum = 0.0
    private var mixedAudioLevelWindowPeakLevel = 0f
    private var mixedAudioLevelWindowSampleCount = 0L
    private var mixedAudioLevelWindowClippedSampleCount = 0L
    @Volatile private var mixedAudioLevelSnapshot = MicLevelSnapshot()

    private val audioDeviceCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
            monitorRecoveryState.recordAudioDevicesAdded(
                addedDevices.asSequence().filter { it.isSink }.map { it.id }.toSet()
            )
        }

        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
            monitorRecoveryState.recordAudioDevicesRemoved(
                removedDevices.asSequence().filter { it.isSink }.map { it.id }.toSet()
            )
        }
    }

    init {
        if (isMonitorActive(settings)) {
            activateMonitor()
        }
    }

    override fun process(pcmBuffer: ByteArray): ByteArray {
        val processed = pcmBuffer.copyOf()
        val currentSettings = settings
        val currentMixer = broadcastMixer

        if (currentSettings.enabled) {
            val stats = processSamples(processed, currentSettings, 1f)
            micEffectsProcessedFrames += 1
            micEffectsProcessedSamples += stats.processedSamples.toLong()
            micEffectsGatedSamples += stats.gatedSamples.toLong()
            micEffectsLimitedSamples += stats.limitedSamples.toLong()
        }

        writeMonitor(processed)
        val levelStats = applyVolume(processed, currentMixer.mic.effectiveVolume(), measureLevel = true)
        accumulateMicLevelWindow(levelStats)
        return processed
    }

    fun processAppAudio(pcmBuffer: ByteArray, capturedByteCount: Int): ByteArray {
        val processed = pcmBuffer.copyOf()
        val currentMixer = broadcastMixer
        val levelStats = applyVolume(
            processed,
            currentMixer.appAudio.effectiveVolume(),
            measureLevel = true,
            measuredByteCount = capturedByteCount
        )
        accumulateAppAudioLevelWindow(levelStats)
        return processed
    }

    fun mixForBroadcast(micBuffer: ByteArray, appAudioBuffer: ByteArray): ByteArray {
        val result = Pcm16AudioMixer.mix(micBuffer, appAudioBuffer)
        accumulateMixedAudioLevelWindow(result.levels)
        return result.pcm
    }

    fun snapshot(): NativeRuntimeAudioProcessing {
        val currentSettings = settings
        val currentMixer = broadcastMixer
        val monitorRuntime = monitorRuntimeSnapshot()
        val monitorRecovery = monitorRecoveryState.snapshot()
        val currentMicLevel = micLevelSnapshot
        val currentAppAudioLevel = appAudioLevelSnapshot
        val currentMixedAudioLevel = mixedAudioLevelSnapshot
        return NativeRuntimeAudioProcessing(
            micEffectsEnabled = currentSettings.enabled,
            micEffectsPresetId = currentSettings.presetId,
            micEffectsProcessedFrames = micEffectsProcessedFrames,
            micEffectsProcessedSamples = micEffectsProcessedSamples,
            micEffectsGatedSamples = micEffectsGatedSamples,
            micEffectsLimitedSamples = micEffectsLimitedSamples,
            micRmsLevel = currentMicLevel.rmsLevel,
            micPeakLevel = currentMicLevel.peakLevel,
            micSampleCount = currentMicLevel.sampleCount,
            micClippedSampleCount = currentMicLevel.clippedSampleCount,
            micLevelUpdatedAt = currentMicLevel.updatedAt,
            appAudioRmsLevel = currentAppAudioLevel.rmsLevel,
            appAudioPeakLevel = currentAppAudioLevel.peakLevel,
            appAudioSampleCount = currentAppAudioLevel.sampleCount,
            appAudioClippedSampleCount = currentAppAudioLevel.clippedSampleCount,
            appAudioLevelUpdatedAt = currentAppAudioLevel.updatedAt,
            mixedAudioRmsLevel = currentMixedAudioLevel.rmsLevel,
            mixedAudioPeakLevel = currentMixedAudioLevel.peakLevel,
            mixedAudioSampleCount = currentMixedAudioLevel.sampleCount,
            mixedAudioClippedSampleCount = currentMixedAudioLevel.clippedSampleCount,
            mixedAudioLevelUpdatedAt = currentMixedAudioLevel.updatedAt,
            monitorEnabled = currentSettings.monitorEnabled,
            monitorRunning = monitorRuntime.running && !monitorRecovery.suspended,
            monitorVolume = currentSettings.monitorVolume,
            monitorHeadphonesOnly = currentSettings.monitorHeadphonesOnly,
            monitorRoute = monitorRuntime.route,
            monitorOutputName = monitorRuntime.outputName,
            monitorHeadphonesConnected = monitorRuntime.headphonesConnected,
            monitorWrittenFrames = monitorRuntime.writtenFrames,
            monitorDroppedFrames = monitorRuntime.droppedFrames,
            monitorWrittenBuffers = monitorRuntime.writtenBuffers,
            monitorDroppedBuffers = monitorRuntime.droppedBuffers,
            monitorEstimatedLatencyMs = monitorRuntime.estimatedLatencyMs,
            monitorLatencySource = if (monitorRuntime.estimatedLatencyMs > 0) "android-audiotrack-buffer" else "",
            monitorLastError = monitorRuntime.lastError,
            monitorLifecycleEventCount = monitorRecovery.lifecycleEventCount,
            monitorRouteChangeCount = monitorRecovery.routeChangeCount,
            monitorInterruptionCount = monitorRecovery.interruptionCount,
            monitorRecoveryCount = monitorRecovery.recoveryCount,
            monitorRecoveryFailureCount = monitorRecovery.recoveryFailureCount,
            monitorLastRecoveryReason = monitorRecovery.lastRecoveryReason,
            monitorLastRecoveryAt = monitorRecovery.lastRecoveryAt,
            monitorSuspended = monitorRecovery.suspended,
            broadcastMicVolume = currentMixer.mic.volume,
            broadcastMicMuted = currentMixer.mic.muted,
            broadcastAppAudioVolume = currentMixer.appAudio.volume,
            broadcastAppAudioMuted = currentMixer.appAudio.muted,
            broadcastChatReadoutVolume = currentMixer.chatReadout.volume,
            broadcastChatReadoutMuted = currentMixer.chatReadout.muted
        )
    }

    @Synchronized
    fun updateProfile(nextSettings: MicEffectsProfile, nextBroadcastMixer: BroadcastMixerProfile) {
        val wasMonitorActive = isMonitorActive(settings)
        val willMonitorBeActive = isMonitorActive(nextSettings)
        broadcastMixer = nextBroadcastMixer
        if (!wasMonitorActive && willMonitorBeActive) {
            activateMonitor()
            settings = nextSettings
            return
        }
        settings = nextSettings
        if (!willMonitorBeActive) {
            deactivateMonitor()
        }
    }

    @Synchronized
    fun release() {
        monitorReleased = true
        monitorRecoveryState.release()
        unregisterAudioDeviceCallback()
        synchronized(monitorTrackLock) {
            releaseMonitorTrackLocked()
        }
    }

    private fun processSamples(pcmBuffer: ByteArray, currentSettings: MicEffectsProfile, outputVolume: Float): MicProcessingStats {
        val gain = 10.0.pow(currentSettings.inputGainDb.toDouble() / 20.0).toFloat()
        val gateThreshold = 10.0.pow(currentSettings.noiseGateDb.toDouble() / 20.0).toFloat()
        val compressorRatio = 1f + currentSettings.compression * 7f
        var index = 0
        var processedSamples = 0
        var gatedSamples = 0
        var limitedSamples = 0
        while (index + 1 < pcmBuffer.size) {
            val sample = ((pcmBuffer[index + 1].toInt() shl 8) or (pcmBuffer[index].toInt() and 0xff)).toShort().toInt()
            var normalized = sample / 32768f

            if (abs(normalized) < gateThreshold) {
                normalized = 0f
                gatedSamples += 1
            }

            normalized *= gain

            if (currentSettings.compression > 0f) {
                val direction = if (normalized < 0f) -1f else 1f
                val magnitude = abs(normalized)
                if (magnitude > compressorThreshold) {
                    normalized = direction * (compressorThreshold + (magnitude - compressorThreshold) / compressorRatio)
                    limitedSamples += 1
                }
            }

            normalized = when (currentSettings.presetId) {
                "bright" -> normalized + normalized * abs(normalized) * 0.16f
                "robot" -> {
                    if (sampleCursor % channelCount.toLong() == 0L) {
                        robotPhase = (robotPhase + robotStep) % (2f * PI.toFloat())
                    }
                    normalized * (0.55f + 0.45f * sin(robotPhase.toDouble()).toFloat())
                }
                else -> normalized
            }

            normalized = softLimit(normalized) * outputVolume
            val output = (normalized.coerceIn(-1f, 1f) * Short.MAX_VALUE).toInt().toShort()
            pcmBuffer[index] = (output.toInt() and 0xff).toByte()
            pcmBuffer[index + 1] = ((output.toInt() shr 8) and 0xff).toByte()
            index += 2
            sampleCursor += 1
            processedSamples += 1
        }
        return MicProcessingStats(processedSamples, gatedSamples, limitedSamples)
    }

    private fun softLimit(value: Float): Float =
        (tanh((value * 1.25f).toDouble()) / tanh(1.25)).toFloat().coerceIn(-1f, 1f)

    private fun writeMonitor(processed: ByteArray) {
        synchronized(monitorTrackLock) {
            val currentSettings = settings
            if (monitorReleased || !isMonitorActive(currentSettings)) {
                monitorLastError = ""
                releaseMonitorTrackLocked()
                return@synchronized
            }

            val frameCount = (processed.size / bytesPerFrame()).coerceAtLeast(0)
            val preferredDevice = headphoneOutputDevice()
            if (currentSettings.monitorHeadphonesOnly && preferredDevice == null) {
                monitorDroppedFrames += frameCount.toLong()
                monitorDroppedBuffers += 1L
                monitorLastError = "Headphones-only monitor blocked without a headphone output."
                monitorRecoveryState.markUnavailable()
                releaseMonitorTrackLocked()
                return@synchronized
            }

            val track = ensureMonitorTrackLocked(
                preferredDevice = preferredDevice,
                requireHeadphones = currentSettings.monitorHeadphonesOnly
            )
            if (track == null) {
                monitorDroppedFrames += frameCount.toLong()
                monitorDroppedBuffers += 1L
                if (monitorLastError.isBlank()) {
                    monitorLastError = "AudioTrack monitor output is unavailable."
                }
                return@synchronized
            }

            val monitorBuffer = processed.copyOf()
            applyVolume(monitorBuffer, currentSettings.monitorVolume)
            val writeResult = runCatching {
                track.write(monitorBuffer, 0, monitorBuffer.size, AudioTrack.WRITE_NON_BLOCKING)
            }
            if (writeResult.isFailure) {
                monitorDroppedFrames += frameCount.toLong()
                monitorDroppedBuffers += 1L
                monitorLastError = "Monitor write failed: ${writeResult.exceptionOrNull()?.message ?: "unknown error"}"
                monitorRecoveryState.recordInterruption("audio-track-write-failed")
                releaseMonitorTrackLocked()
                return@synchronized
            }

            val writtenBytes = writeResult.getOrThrow()
            if (writtenBytes > 0) {
                val writtenFrames = (writtenBytes / bytesPerFrame()).coerceAtLeast(0)
                monitorWrittenFrames += writtenFrames.toLong()
                monitorWrittenBuffers += 1L
                val droppedFrames = frameCount - writtenFrames
                if (droppedFrames > 0) {
                    monitorDroppedFrames += droppedFrames.toLong()
                    monitorDroppedBuffers += 1L
                    monitorLastError = "Monitor write was partially accepted."
                } else {
                    monitorLastError = ""
                }
            } else {
                monitorDroppedFrames += frameCount.toLong()
                monitorDroppedBuffers += 1L
                monitorLastError = "Monitor write was not accepted by AudioTrack."
                if (writtenBytes < 0) {
                    monitorRecoveryState.recordInterruption("audio-track-write-failed")
                    releaseMonitorTrackLocked()
                }
                return@synchronized
            }

            monitorTrackInvalidReason(track)?.let { reason ->
                monitorRecoveryState.recordInterruption(reason)
                releaseMonitorTrackLocked()
                return@synchronized
            }
            val routedDeviceId = routedDeviceId(track)
            if (
                monitorRoutedDeviceId != null &&
                routedDeviceId != null &&
                monitorRoutedDeviceId != routedDeviceId
            ) {
                monitorRecoveryState.recordObservedOutputDeviceChange()
                releaseMonitorTrackLocked()
            } else if (monitorRoutedDeviceId == null) {
                monitorRoutedDeviceId = routedDeviceId
            }
        }
    }

    private fun ensureMonitorTrackLocked(
        preferredDevice: AudioDeviceInfo?,
        requireHeadphones: Boolean
    ): AudioTrack? {
        val currentTrack = monitorTrack
        if (currentTrack != null) {
            val invalidReason = monitorTrackInvalidReason(currentTrack)
            val preferredDeviceChanged = monitorPreferredDeviceId != preferredDevice?.id
            val currentRoutedDevice = routedDevice(currentTrack)
            val currentRoutedDeviceId = currentRoutedDevice?.id
            val routedDeviceChanged = monitorRoutedDeviceId != null &&
                currentRoutedDeviceId != null &&
                monitorRoutedDeviceId != currentRoutedDeviceId
            when {
                invalidReason != null -> {
                    monitorRecoveryState.recordInterruption(invalidReason)
                    releaseMonitorTrackLocked()
                }
                preferredDeviceChanged || routedDeviceChanged -> {
                    monitorRecoveryState.recordObservedOutputDeviceChange()
                    releaseMonitorTrackLocked()
                }
                requireHeadphones && currentRoutedDevice?.isHeadphoneOutput() != true -> {
                    monitorLastError = "AudioTrack did not confirm a headphone output route."
                    monitorRecoveryState.recordObservedOutputDeviceChange("unsafe-output-route")
                    releaseMonitorTrackLocked()
                }
                monitorRecoveryState.pendingRecovery() != null -> releaseMonitorTrackLocked()
                else -> {
                    if (monitorRoutedDeviceId == null) {
                        monitorRoutedDeviceId = currentRoutedDeviceId
                    }
                    return currentTrack
                }
            }
        }

        if (SystemClock.elapsedRealtime() < monitorCreateRetryAfterElapsedMs) {
            return null
        }
        val recoveryRequest = monitorRecoveryState.pendingRecovery()
        val createdTrack = createMonitorTrackLocked(preferredDevice, requireHeadphones)
        if (createdTrack == null) {
            recoveryRequest?.let(monitorRecoveryState::recordRecoveryFailure)
            monitorRecoveryState.markUnavailable()
            monitorCreateRetryAfterElapsedMs = SystemClock.elapsedRealtime() + MONITOR_CREATE_RETRY_DELAY_MS
            return null
        }
        if (recoveryRequest != null) {
            if (!monitorRecoveryState.recordRecoverySuccess(recoveryRequest)) {
                safelyReleaseTrack(createdTrack.track)
                return null
            }
        } else if (monitorRecoveryState.pendingRecovery() != null) {
            safelyReleaseTrack(createdTrack.track)
            return null
        }

        monitorTrack = createdTrack.track
        monitorBufferSizeInBytes = createdTrack.bufferSizeInBytes
        monitorPreferredDeviceId = preferredDevice?.id
        monitorRoutedDeviceId = createdTrack.routedDeviceId
        monitorCreateRetryAfterElapsedMs = 0L
        monitorRecoveryState.markAvailableWithoutRecovery()
        return createdTrack.track
    }

    private fun createMonitorTrackLocked(
        preferredDevice: AudioDeviceInfo?,
        requireHeadphones: Boolean
    ): CreatedMonitorTrack? {
        val minBufferSize = AudioTrack.getMinBufferSize(sampleRate, channelMask, AudioFormat.ENCODING_PCM_16BIT)
        if (minBufferSize <= 0) {
            monitorLastError = "AudioTrack minimum buffer size is unavailable."
            return null
        }

        val bufferSizeInBytes = max(minBufferSize, sampleRate / 5 * channelCount * 2)
        val trackResult = runCatching {
            AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(channelMask)
                        .build()
                )
                .setBufferSizeInBytes(bufferSizeInBytes)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
        }
        val track = trackResult.getOrElse { error ->
            monitorLastError = "AudioTrack creation failed: ${error.message ?: "unknown error"}"
            return null
        }
        if (track.state != AudioTrack.STATE_INITIALIZED) {
            monitorLastError = "AudioTrack monitor output is uninitialized."
            safelyReleaseTrack(track)
            return null
        }
        if (preferredDevice != null && !runCatching { track.setPreferredDevice(preferredDevice) }.getOrDefault(false)) {
            monitorLastError = "AudioTrack could not select the requested output device."
            safelyReleaseTrack(track)
            return null
        }
        val playResult = runCatching { track.play() }
        if (playResult.isFailure || track.playState != AudioTrack.PLAYSTATE_PLAYING) {
            monitorLastError = "AudioTrack monitor output could not start."
            safelyReleaseTrack(track)
            return null
        }
        val routedDevice = if (requireHeadphones) {
            resolveHeadphoneRoute(track)
        } else {
            routedDevice(track)
        }
        if (requireHeadphones && routedDevice?.isHeadphoneOutput() != true) {
            monitorLastError = "AudioTrack did not confirm a headphone output route."
            safelyReleaseTrack(track)
            return null
        }
        return CreatedMonitorTrack(track, bufferSizeInBytes, routedDevice?.id)
    }

    private fun monitorTrackInvalidReason(track: AudioTrack): String? = when {
        runCatching { track.state }.getOrDefault(AudioTrack.STATE_UNINITIALIZED) != AudioTrack.STATE_INITIALIZED ->
            "audio-track-uninitialized"
        runCatching { track.playState }.getOrDefault(AudioTrack.PLAYSTATE_STOPPED) != AudioTrack.PLAYSTATE_PLAYING ->
            "audio-track-stopped"
        else -> null
    }

    private fun resolveHeadphoneRoute(track: AudioTrack): AudioDeviceInfo? {
        routedDevice(track)?.let { return it }
        val silence = ByteArray(bytesPerFrame() * MONITOR_ROUTE_PROBE_FRAMES)
        val writtenBytes = runCatching {
            track.write(silence, 0, silence.size, AudioTrack.WRITE_BLOCKING)
        }.getOrDefault(AudioTrack.ERROR)
        return if (writtenBytes > 0) routedDevice(track) else null
    }

    private fun routedDevice(track: AudioTrack): AudioDeviceInfo? =
        runCatching { track.routedDevice }.getOrNull()

    private fun routedDeviceId(track: AudioTrack): Int? = routedDevice(track)?.id

    private fun applyVolume(
        pcmBuffer: ByteArray,
        volume: Float,
        measureLevel: Boolean = false,
        measuredByteCount: Int = pcmBuffer.size
    ): MicLevelStats {
        val alignedMeasuredByteCount = measuredByteCount
            .coerceIn(0, pcmBuffer.size)
            .let { it - it % 2 }
        var index = 0
        var sampleCount = 0L
        var clippedSampleCount = 0L
        var squaredLevelSum = 0.0
        var peakLevel = 0f
        while (index + 1 < pcmBuffer.size) {
            val sample = ((pcmBuffer[index + 1].toInt() shl 8) or (pcmBuffer[index].toInt() and 0xff)).toShort().toInt()
            val scaledSample = sample * volume
            val outputValue = scaledSample.toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
            val output = outputValue.toShort()
            pcmBuffer[index] = (output.toInt() and 0xff).toByte()
            pcmBuffer[index + 1] = ((output.toInt() shr 8) and 0xff).toByte()
            if (measureLevel && index < alignedMeasuredByteCount) {
                val normalizedLevel = abs(outputValue / 32768f).coerceIn(0f, 1f)
                squaredLevelSum += normalizedLevel.toDouble() * normalizedLevel.toDouble()
                peakLevel = max(peakLevel, normalizedLevel)
                sampleCount += 1
                if (
                    abs(scaledSample) > Short.MAX_VALUE.toFloat() ||
                    outputValue == Short.MIN_VALUE.toInt() ||
                    outputValue == Short.MAX_VALUE.toInt()
                ) {
                    clippedSampleCount += 1
                }
            }
            index += 2
        }
        return MicLevelStats(
            squaredLevelSum = squaredLevelSum,
            peakLevel = peakLevel.coerceIn(0f, 1f),
            sampleCount = sampleCount,
            clippedSampleCount = clippedSampleCount
        )
    }

    private fun accumulateMicLevelWindow(stats: MicLevelStats) {
        if (stats.sampleCount == 0L) {
            return
        }
        micLevelWindowSquaredLevelSum += stats.squaredLevelSum
        micLevelWindowPeakLevel = max(micLevelWindowPeakLevel, stats.peakLevel)
        micLevelWindowSampleCount += stats.sampleCount
        micLevelWindowClippedSampleCount += stats.clippedSampleCount

        if (micLevelWindowSampleCount < micLevelWindowTargetSampleCount) {
            return
        }

        val rmsLevel = sqrt(
            micLevelWindowSquaredLevelSum / micLevelWindowSampleCount.toDouble()
        ).toFloat().coerceIn(0f, 1f)
        micLevelSnapshot = MicLevelSnapshot(
            rmsLevel = rmsLevel,
            peakLevel = micLevelWindowPeakLevel.coerceIn(0f, 1f),
            sampleCount = micLevelWindowSampleCount,
            clippedSampleCount = micLevelWindowClippedSampleCount,
            updatedAt = System.currentTimeMillis()
        )
        micLevelWindowSquaredLevelSum = 0.0
        micLevelWindowPeakLevel = 0f
        micLevelWindowSampleCount = 0L
        micLevelWindowClippedSampleCount = 0L
    }

    private fun accumulateAppAudioLevelWindow(stats: MicLevelStats) {
        if (stats.sampleCount == 0L) {
            return
        }
        appAudioLevelWindowSquaredLevelSum += stats.squaredLevelSum
        appAudioLevelWindowPeakLevel = max(appAudioLevelWindowPeakLevel, stats.peakLevel)
        appAudioLevelWindowSampleCount += stats.sampleCount
        appAudioLevelWindowClippedSampleCount += stats.clippedSampleCount
        if (appAudioLevelWindowSampleCount < micLevelWindowTargetSampleCount) {
            return
        }
        appAudioLevelSnapshot = MicLevelSnapshot(
            rmsLevel = sqrt(
                appAudioLevelWindowSquaredLevelSum / appAudioLevelWindowSampleCount.toDouble()
            ).toFloat().coerceIn(0f, 1f),
            peakLevel = appAudioLevelWindowPeakLevel.coerceIn(0f, 1f),
            sampleCount = appAudioLevelWindowSampleCount,
            clippedSampleCount = appAudioLevelWindowClippedSampleCount,
            updatedAt = System.currentTimeMillis()
        )
        appAudioLevelWindowSquaredLevelSum = 0.0
        appAudioLevelWindowPeakLevel = 0f
        appAudioLevelWindowSampleCount = 0L
        appAudioLevelWindowClippedSampleCount = 0L
    }

    private fun accumulateMixedAudioLevelWindow(stats: PcmLevelStats) {
        if (stats.sampleCount == 0L) {
            return
        }
        mixedAudioLevelWindowSquaredLevelSum += stats.squaredLevelSum
        mixedAudioLevelWindowPeakLevel = max(mixedAudioLevelWindowPeakLevel, stats.peakLevel)
        mixedAudioLevelWindowSampleCount += stats.sampleCount
        mixedAudioLevelWindowClippedSampleCount += stats.clippedSampleCount
        if (mixedAudioLevelWindowSampleCount < micLevelWindowTargetSampleCount) {
            return
        }
        mixedAudioLevelSnapshot = MicLevelSnapshot(
            rmsLevel = sqrt(
                mixedAudioLevelWindowSquaredLevelSum / mixedAudioLevelWindowSampleCount.toDouble()
            ).toFloat().coerceIn(0f, 1f),
            peakLevel = mixedAudioLevelWindowPeakLevel.coerceIn(0f, 1f),
            sampleCount = mixedAudioLevelWindowSampleCount,
            clippedSampleCount = mixedAudioLevelWindowClippedSampleCount,
            updatedAt = System.currentTimeMillis()
        )
        mixedAudioLevelWindowSquaredLevelSum = 0.0
        mixedAudioLevelWindowPeakLevel = 0f
        mixedAudioLevelWindowSampleCount = 0L
        mixedAudioLevelWindowClippedSampleCount = 0L
    }

    private fun activateMonitor() {
        if (monitorReleased) {
            return
        }
        monitorRecoveryState.activate(connectedOutputDeviceIds())
        synchronized(monitorTrackLock) {
            monitorCreateRetryAfterElapsedMs = 0L
        }
        registerAudioDeviceCallback()
    }

    private fun deactivateMonitor() {
        monitorRecoveryState.deactivate()
        unregisterAudioDeviceCallback()
        synchronized(monitorTrackLock) {
            monitorLastError = ""
            monitorCreateRetryAfterElapsedMs = 0L
            releaseMonitorTrackLocked()
        }
    }

    private fun registerAudioDeviceCallback() {
        synchronized(monitorCallbackLock) {
            if (monitorReleased || monitorDeviceCallbackRegistered) {
                return
            }
            runCatching {
                audioManager.registerAudioDeviceCallback(audioDeviceCallback, null)
            }.onSuccess {
                monitorDeviceCallbackRegistered = true
            }.onFailure { error ->
                synchronized(monitorTrackLock) {
                    monitorLastError = "Audio device monitoring is unavailable: ${error.message ?: "unknown error"}"
                }
            }
        }
    }

    private fun unregisterAudioDeviceCallback() {
        synchronized(monitorCallbackLock) {
            if (!monitorDeviceCallbackRegistered) {
                return
            }
            runCatching { audioManager.unregisterAudioDeviceCallback(audioDeviceCallback) }
            monitorDeviceCallbackRegistered = false
        }
    }

    private fun connectedOutputDeviceIds(): Set<Int> =
        runCatching {
            audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
                .asSequence()
                .filter { it.isSink }
                .map { it.id }
                .toSet()
        }.getOrDefault(emptySet())

    private fun releaseMonitorTrackLocked() {
        monitorTrack?.let(::safelyReleaseTrack)
        monitorTrack = null
        monitorBufferSizeInBytes = 0
        monitorPreferredDeviceId = null
        monitorRoutedDeviceId = null
    }

    private fun safelyReleaseTrack(track: AudioTrack) {
        runCatching { track.pause() }
        runCatching { track.flush() }
        runCatching { track.release() }
    }

    private fun monitorRuntimeSnapshot(): MonitorRuntimeSnapshot = synchronized(monitorTrackLock) {
        val preferredDevice = headphoneOutputDevice()
        val routedDevice = monitorTrack?.let { track -> runCatching { track.routedDevice }.getOrNull() }
        val outputDevice = routedDevice ?: preferredDevice ?: currentOutputDevice()
        MonitorRuntimeSnapshot(
            running = monitorTrack?.let { track ->
                runCatching {
                    track.state == AudioTrack.STATE_INITIALIZED && track.playState == AudioTrack.PLAYSTATE_PLAYING
                }.getOrDefault(false)
            } ?: false,
            route = outputDevice?.routeKind() ?: "unknown",
            outputName = outputDevice?.productName?.toString()?.takeIf { it.isNotBlank() } ?: "Unknown",
            headphonesConnected = preferredDevice != null,
            writtenFrames = monitorWrittenFrames,
            droppedFrames = monitorDroppedFrames,
            writtenBuffers = monitorWrittenBuffers,
            droppedBuffers = monitorDroppedBuffers,
            estimatedLatencyMs = monitorEstimatedLatencyMsLocked(),
            lastError = monitorLastError
        )
    }

    private fun headphoneOutputDevice(): AudioDeviceInfo? =
        audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull { device ->
            when (device.type) {
                AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
                AudioDeviceInfo.TYPE_WIRED_HEADSET,
                AudioDeviceInfo.TYPE_USB_HEADSET,
                AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
                AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
                AudioDeviceInfo.TYPE_HEARING_AID,
                AudioDeviceInfo.TYPE_BLE_HEADSET -> true
                else -> false
            }
        }

    private fun currentOutputDevice(): AudioDeviceInfo? =
        audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull()

    private fun monitorEstimatedLatencyMsLocked(): Int {
        if (monitorBufferSizeInBytes <= 0 || sampleRate <= 0) {
            return 0
        }
        val bufferFrames = monitorBufferSizeInBytes.toDouble() / bytesPerFrame().toDouble()
        return ceil(bufferFrames * 1000.0 / sampleRate.toDouble()).toInt()
    }

    private fun bytesPerFrame(): Int = channelCount * 2

    private fun isMonitorActive(profile: MicEffectsProfile): Boolean =
        profile.monitorEnabled && profile.monitorVolume > 0f

    private fun AudioDeviceInfo.routeKind(): String =
        when (type) {
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
            AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "receiver"
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
            AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired-headphones"
            AudioDeviceInfo.TYPE_USB_HEADSET -> "usb-headset"
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetooth-a2dp"
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
            AudioDeviceInfo.TYPE_BLE_HEADSET,
            AudioDeviceInfo.TYPE_HEARING_AID -> "bluetooth-sco"
            AudioDeviceInfo.TYPE_HDMI -> "hdmi"
            else -> "other"
        }

    private fun AudioDeviceInfo.isHeadphoneOutput(): Boolean =
        when (type) {
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
            AudioDeviceInfo.TYPE_WIRED_HEADSET,
            AudioDeviceInfo.TYPE_USB_HEADSET,
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
            AudioDeviceInfo.TYPE_HEARING_AID,
            AudioDeviceInfo.TYPE_BLE_HEADSET -> true
            else -> false
        }

    private data class MicProcessingStats(
        val processedSamples: Int,
        val gatedSamples: Int,
        val limitedSamples: Int
    )

    private data class MicLevelStats(
        val squaredLevelSum: Double,
        val peakLevel: Float,
        val sampleCount: Long,
        val clippedSampleCount: Long
    )

    private data class MicLevelSnapshot(
        val rmsLevel: Float = 0f,
        val peakLevel: Float = 0f,
        val sampleCount: Long = 0L,
        val clippedSampleCount: Long = 0L,
        val updatedAt: Long = 0L
    )

    private data class CreatedMonitorTrack(
        val track: AudioTrack,
        val bufferSizeInBytes: Int,
        val routedDeviceId: Int?
    )

    private data class MonitorRuntimeSnapshot(
        val running: Boolean,
        val route: String,
        val outputName: String,
        val headphonesConnected: Boolean,
        val writtenFrames: Long,
        val droppedFrames: Long,
        val writtenBuffers: Long,
        val droppedBuffers: Long,
        val estimatedLatencyMs: Int,
        val lastError: String
    )

    private companion object {
        const val MONITOR_CREATE_RETRY_DELAY_MS = 500L
        const val MONITOR_ROUTE_PROBE_FRAMES = 64
    }
}
