package com.mobilelivecaster.streaming

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
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
    private var monitorTrack: AudioTrack? = null
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

        writeMonitor(processed, currentSettings)
        val levelStats = applyVolume(processed, currentMixer.mic.effectiveVolume(), measureLevel = true)
        accumulateMicLevelWindow(levelStats)
        return processed
    }

    fun snapshot(): NativeRuntimeAudioProcessing {
        val currentSettings = settings
        val currentMixer = broadcastMixer
        val preferredDevice = headphoneOutputDevice()
        val outputDevice = preferredDevice ?: currentOutputDevice()
        val estimatedLatencyMs = monitorEstimatedLatencyMs()
        val currentMicLevel = micLevelSnapshot
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
            monitorEnabled = currentSettings.monitorEnabled,
            monitorRunning = monitorTrack?.playState == AudioTrack.PLAYSTATE_PLAYING,
            monitorVolume = currentSettings.monitorVolume,
            monitorHeadphonesOnly = currentSettings.monitorHeadphonesOnly,
            monitorRoute = outputDevice?.routeKind() ?: "unknown",
            monitorOutputName = outputDevice?.productName?.toString()?.takeIf { it.isNotBlank() } ?: "Unknown",
            monitorHeadphonesConnected = preferredDevice != null,
            monitorWrittenFrames = monitorWrittenFrames,
            monitorDroppedFrames = monitorDroppedFrames,
            monitorWrittenBuffers = monitorWrittenBuffers,
            monitorDroppedBuffers = monitorDroppedBuffers,
            monitorEstimatedLatencyMs = estimatedLatencyMs,
            monitorLatencySource = if (estimatedLatencyMs > 0) "android-audiotrack-buffer" else "",
            monitorLastError = monitorLastError,
            broadcastMicVolume = currentMixer.mic.volume,
            broadcastMicMuted = currentMixer.mic.muted,
            broadcastAppAudioVolume = currentMixer.appAudio.volume,
            broadcastAppAudioMuted = currentMixer.appAudio.muted,
            broadcastChatReadoutVolume = currentMixer.chatReadout.volume,
            broadcastChatReadoutMuted = currentMixer.chatReadout.muted
        )
    }

    fun updateProfile(nextSettings: MicEffectsProfile, nextBroadcastMixer: BroadcastMixerProfile) {
        settings = nextSettings
        broadcastMixer = nextBroadcastMixer
        if (!nextSettings.monitorEnabled || nextSettings.monitorVolume <= 0f) {
            releaseMonitor()
        }
    }

    fun release() {
        releaseMonitor()
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

    private fun writeMonitor(processed: ByteArray, currentSettings: MicEffectsProfile) {
        if (!currentSettings.monitorEnabled || currentSettings.monitorVolume <= 0f) {
            monitorLastError = ""
            releaseMonitor()
            return
        }

        val frameCount = (processed.size / bytesPerFrame()).coerceAtLeast(0)
        val preferredDevice = headphoneOutputDevice()
        if (currentSettings.monitorHeadphonesOnly && preferredDevice == null) {
            monitorDroppedFrames += frameCount.toLong()
            monitorDroppedBuffers += 1
            monitorLastError = "Headphones-only monitor blocked without a headphone output."
            releaseMonitor()
            return
        }

        val track = ensureMonitorTrack(preferredDevice)
        if (track == null) {
            monitorDroppedFrames += frameCount.toLong()
            monitorDroppedBuffers += 1
            monitorLastError = "AudioTrack monitor output is unavailable."
            return
        }
        val monitorBuffer = processed.copyOf()
        applyVolume(monitorBuffer, currentSettings.monitorVolume)
        val writtenBytes = track.write(monitorBuffer, 0, monitorBuffer.size, AudioTrack.WRITE_NON_BLOCKING)
        if (writtenBytes > 0) {
            val writtenFrames = (writtenBytes / bytesPerFrame()).coerceAtLeast(0)
            monitorWrittenFrames += writtenFrames.toLong()
            monitorWrittenBuffers += 1
            val droppedFrames = frameCount - writtenFrames
            if (droppedFrames > 0) {
                monitorDroppedFrames += droppedFrames.toLong()
                monitorDroppedBuffers += 1
                monitorLastError = "Monitor write was partially accepted."
            } else {
                monitorLastError = ""
            }
        } else {
            monitorDroppedFrames += frameCount.toLong()
            monitorDroppedBuffers += 1
            monitorLastError = "Monitor write was not accepted by AudioTrack."
        }
    }

    private fun ensureMonitorTrack(preferredDevice: AudioDeviceInfo?): AudioTrack? {
        val currentTrack = monitorTrack
        if (currentTrack != null && currentTrack.state == AudioTrack.STATE_INITIALIZED) {
            preferredDevice?.let { currentTrack.setPreferredDevice(it) }
            return currentTrack
        }

        val minBufferSize = AudioTrack.getMinBufferSize(sampleRate, channelMask, AudioFormat.ENCODING_PCM_16BIT)
        if (minBufferSize <= 0) {
            return null
        }

        val bufferSizeInBytes = max(minBufferSize, sampleRate / 5 * channelCount * 2)
        val track = AudioTrack.Builder()
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

        preferredDevice?.let { track.setPreferredDevice(it) }
        track.play()
        monitorTrack = track
        monitorBufferSizeInBytes = bufferSizeInBytes
        return track
    }

    private fun applyVolume(
        pcmBuffer: ByteArray,
        volume: Float,
        measureLevel: Boolean = false
    ): MicLevelStats {
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
            if (measureLevel) {
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

    private fun releaseMonitor() {
        monitorTrack?.run {
            pause()
            flush()
            release()
        }
        monitorTrack = null
        monitorBufferSizeInBytes = 0
    }

    private fun headphoneOutputDevice(): AudioDeviceInfo? =
        audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull { device ->
            when (device.type) {
                AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
                AudioDeviceInfo.TYPE_WIRED_HEADSET,
                AudioDeviceInfo.TYPE_USB_HEADSET,
                AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
                AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> true
                else -> false
            }
        }

    private fun currentOutputDevice(): AudioDeviceInfo? =
        audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull()

    private fun monitorEstimatedLatencyMs(): Int {
        if (monitorBufferSizeInBytes <= 0 || sampleRate <= 0) {
            return 0
        }
        val bufferFrames = monitorBufferSizeInBytes.toDouble() / bytesPerFrame().toDouble()
        return ceil(bufferFrames * 1000.0 / sampleRate.toDouble()).toInt()
    }

    private fun bytesPerFrame(): Int = channelCount * 2

    private fun AudioDeviceInfo.routeKind(): String =
        when (type) {
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
            AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "receiver"
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
            AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired-headphones"
            AudioDeviceInfo.TYPE_USB_HEADSET -> "usb-headset"
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetooth-a2dp"
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bluetooth-sco"
            AudioDeviceInfo.TYPE_HDMI -> "hdmi"
            else -> "other"
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
}
