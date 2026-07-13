package com.mobilelivecaster.streaming

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sign
import kotlin.math.sqrt
import kotlin.math.tanh

internal data class PcmLevelStats(
    val squaredLevelSum: Double,
    val peakLevel: Float,
    val sampleCount: Long,
    val clippedSampleCount: Long
) {
    val rmsLevel: Float
        get() = if (sampleCount <= 0L) {
            0f
        } else {
            sqrt(squaredLevelSum / sampleCount.toDouble()).toFloat().coerceIn(0f, 1f)
        }
}

internal data class Pcm16MixResult(
    val pcm: ByteArray,
    val levels: PcmLevelStats
)

internal object Pcm16AudioMixer {
    private const val PCM_SCALE = 32_768f
    private const val SOFT_LIMIT_START = 0.9f

    fun upmixMonoToStereo(mono: ByteArray, validBytes: Int): ByteArray {
        var alignedBytes = validBytes.coerceIn(0, mono.size)
        alignedBytes -= alignedBytes % 2
        val stereo = ByteArray(alignedBytes * 2)
        var inputIndex = 0
        var outputIndex = 0
        while (inputIndex + 1 < alignedBytes) {
            val low = mono[inputIndex]
            val high = mono[inputIndex + 1]
            stereo[outputIndex] = low
            stereo[outputIndex + 1] = high
            stereo[outputIndex + 2] = low
            stereo[outputIndex + 3] = high
            inputIndex += 2
            outputIndex += 4
        }
        return stereo
    }

    fun mix(mic: ByteArray, appAudio: ByteArray): Pcm16MixResult {
        var byteCount = minOf(mic.size, appAudio.size)
        byteCount -= byteCount % 2
        val output = ByteArray(byteCount)
        var squaredLevelSum = 0.0
        var peakLevel = 0f
        var sampleCount = 0L
        var clippedSampleCount = 0L
        var index = 0
        while (index + 1 < byteCount) {
            val micSample = readSample(mic, index)
            val appSample = readSample(appAudio, index)
            val rawMix = (micSample + appSample) / PCM_SCALE
            if (abs(rawMix) > 1f) {
                clippedSampleCount += 1
            }
            val limited = softLimit(rawMix)
            val outputValue = (limited * PCM_SCALE).toInt().coerceIn(
                Short.MIN_VALUE.toInt(),
                Short.MAX_VALUE.toInt()
            )
            writeSample(output, index, outputValue.toShort())
            val level = abs(outputValue / PCM_SCALE).coerceIn(0f, 1f)
            squaredLevelSum += level.toDouble() * level.toDouble()
            peakLevel = max(peakLevel, level)
            sampleCount += 1
            index += 2
        }
        return Pcm16MixResult(
            pcm = output,
            levels = PcmLevelStats(
                squaredLevelSum = squaredLevelSum,
                peakLevel = peakLevel,
                sampleCount = sampleCount,
                clippedSampleCount = clippedSampleCount
            )
        )
    }

    private fun readSample(buffer: ByteArray, index: Int): Int =
        ((buffer[index + 1].toInt() shl 8) or (buffer[index].toInt() and 0xff)).toShort().toInt()

    private fun writeSample(buffer: ByteArray, index: Int, sample: Short) {
        buffer[index] = (sample.toInt() and 0xff).toByte()
        buffer[index + 1] = ((sample.toInt() shr 8) and 0xff).toByte()
    }

    private fun softLimit(value: Float): Float {
        val magnitude = abs(value)
        if (magnitude <= SOFT_LIMIT_START) {
            return value
        }
        val excess = magnitude - SOFT_LIMIT_START
        val compressedExcess = (1f - SOFT_LIMIT_START) *
            (tanh((excess * 5f).toDouble()) / tanh(0.5)).toFloat()
        return value.sign * (SOFT_LIMIT_START + compressedExcess).coerceAtMost(1f)
    }
}
