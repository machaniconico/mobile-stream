package com.mobilelivecaster.streaming

import kotlin.math.max

internal class AndroidAudioCadenceState(
    private val sampleRate: Int,
    private val frameSizeBytes: Int,
    private val chunkDurationNanos: Long,
    startedAtNanos: Long
) {
    init {
        require(sampleRate > 0) { "Audio sample rate must be positive" }
        require(frameSizeBytes > 0) { "Audio frame size must be positive" }
        require(chunkDurationNanos > 0L) { "Audio chunk duration must be positive" }
    }

    private var submittedFrames = 0L
    private val startedAtNanos = startedAtNanos
    private val nominalFramesPerChunk =
        ((sampleRate.toLong() * chunkDurationNanos) / NANOS_PER_SECOND).coerceAtLeast(1L)
    private var nextDeadlineNanos = startedAtNanos + chunkDurationNanos

    fun nextPresentationTimeUs(bytes: Int, nowNanos: Long): Long {
        val elapsedNanos = (nowNanos - startedAtNanos).coerceAtLeast(0L)
        val elapsedChunkCount = elapsedNanos / chunkDurationNanos
        submittedFrames = max(submittedFrames, elapsedChunkCount * nominalFramesPerChunk)
        val presentationTimeUs = submittedFrames * 1_000_000L / sampleRate
        submittedFrames += (bytes.coerceAtLeast(0) / frameSizeBytes).toLong()
        return presentationTimeUs
    }

    fun delayUntilNextChunkNanos(nowNanos: Long): Long {
        val delayNanos = nextDeadlineNanos - nowNanos
        nextDeadlineNanos = if (delayNanos <= -chunkDurationNanos) {
            nowNanos + chunkDurationNanos
        } else {
            nextDeadlineNanos + chunkDurationNanos
        }
        return delayNanos.coerceAtLeast(0L)
    }

    private companion object {
        const val NANOS_PER_SECOND = 1_000_000_000L
    }
}
