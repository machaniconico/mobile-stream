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
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.tanh

class MicProcessingEffect(
    context: Context,
    private val settings: MicEffectsProfile,
    private val sampleRate: Int = 44100,
    private val isStereo: Boolean = true
) : CustomAudioEffect() {
    private val appContext = context.applicationContext
    private val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val channelMask = if (isStereo) AudioFormat.CHANNEL_OUT_STEREO else AudioFormat.CHANNEL_OUT_MONO
    private val channelCount = if (isStereo) 2 else 1
    private val gain = 10.0.pow(settings.inputGainDb.toDouble() / 20.0).toFloat()
    private val gateThreshold = 10.0.pow(settings.noiseGateDb.toDouble() / 20.0).toFloat()
    private val compressorThreshold = 0.42f
    private val compressorRatio = 1f + settings.compression * 7f
    private val robotStep = (2.0 * PI * 32.0 / sampleRate).toFloat()
    private var robotPhase = 0f
    private var sampleCursor = 0L
    private var monitorTrack: AudioTrack? = null

    override fun process(pcmBuffer: ByteArray): ByteArray {
        val processed = pcmBuffer.copyOf()

        if (settings.enabled) {
            processSamples(processed, settings.presetId, 1f)
        }

        writeMonitor(processed)
        return processed
    }

    fun release() {
        releaseMonitor()
    }

    private fun processSamples(pcmBuffer: ByteArray, presetId: String, outputVolume: Float) {
        var index = 0
        while (index + 1 < pcmBuffer.size) {
            val sample = ((pcmBuffer[index + 1].toInt() shl 8) or (pcmBuffer[index].toInt() and 0xff)).toShort().toInt()
            var normalized = sample / 32768f

            if (abs(normalized) < gateThreshold) {
                normalized = 0f
            }

            normalized *= gain

            if (settings.compression > 0f) {
                val direction = if (normalized < 0f) -1f else 1f
                val magnitude = abs(normalized)
                if (magnitude > compressorThreshold) {
                    normalized = direction * (compressorThreshold + (magnitude - compressorThreshold) / compressorRatio)
                }
            }

            normalized = when (presetId) {
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
        }
    }

    private fun softLimit(value: Float): Float =
        (tanh((value * 1.25f).toDouble()) / tanh(1.25)).toFloat().coerceIn(-1f, 1f)

    private fun writeMonitor(processed: ByteArray) {
        if (!settings.monitorEnabled || settings.monitorVolume <= 0f) {
            releaseMonitor()
            return
        }

        val preferredDevice = headphoneOutputDevice()
        if (settings.monitorHeadphonesOnly && preferredDevice == null) {
            releaseMonitor()
            return
        }

        val track = ensureMonitorTrack(preferredDevice) ?: return
        val monitorBuffer = processed.copyOf()
        applyVolume(monitorBuffer, settings.monitorVolume)
        track.write(monitorBuffer, 0, monitorBuffer.size, AudioTrack.WRITE_NON_BLOCKING)
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
            .setBufferSizeInBytes(max(minBufferSize, sampleRate / 5 * channelCount * 2))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()

        preferredDevice?.let { track.setPreferredDevice(it) }
        track.play()
        monitorTrack = track
        return track
    }

    private fun applyVolume(pcmBuffer: ByteArray, volume: Float) {
        var index = 0
        while (index + 1 < pcmBuffer.size) {
            val sample = ((pcmBuffer[index + 1].toInt() shl 8) or (pcmBuffer[index].toInt() and 0xff)).toShort().toInt()
            val output = (sample * volume).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
            pcmBuffer[index] = (output.toInt() and 0xff).toByte()
            pcmBuffer[index + 1] = ((output.toInt() shr 8) and 0xff).toByte()
            index += 2
        }
    }

    private fun releaseMonitor() {
        monitorTrack?.run {
            pause()
            flush()
            release()
        }
        monitorTrack = null
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
}
