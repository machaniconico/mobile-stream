package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
import org.junit.Test

class AndroidAudioCadenceStateTest {
    @Test
    fun `five seconds of fallback audio keeps exact twenty millisecond timestamps`() {
        val cadence = AndroidAudioCadenceState(
            sampleRate = 44_100,
            frameSizeBytes = 4,
            chunkDurationNanos = 20_000_000L,
            startedAtNanos = 0L
        )
        val stereoChunkBytes = 882 * 4

        val timestamps = List(250) { index ->
            cadence.nextPresentationTimeUs(stereoChunkBytes, index * 20_000_000L)
        }

        assertEquals(0L, timestamps.first())
        assertEquals(4_980_000L, timestamps.last())
        timestamps.zipWithNext().forEach { (previous, next) ->
            assertEquals(20_000L, next - previous)
        }
    }

    @Test
    fun `late work resets the deadline without a catch-up burst`() {
        val cadence = AndroidAudioCadenceState(
            sampleRate = 44_100,
            frameSizeBytes = 4,
            chunkDurationNanos = 20_000_000L,
            startedAtNanos = 0L
        )

        assertEquals(15_000_000L, cadence.delayUntilNextChunkNanos(5_000_000L))
        assertEquals(0L, cadence.delayUntilNextChunkNanos(65_000_000L))
        assertEquals(19_000_000L, cadence.delayUntilNextChunkNanos(66_000_000L))
    }

    @Test
    fun `presentation time skips stalled wall-clock slots without a catch-up burst`() {
        val cadence = AndroidAudioCadenceState(
            sampleRate = 44_100,
            frameSizeBytes = 4,
            chunkDurationNanos = 20_000_000L,
            startedAtNanos = 1_000_000_000L
        )
        val stereoChunkBytes = 882 * 4

        assertEquals(0L, cadence.nextPresentationTimeUs(stereoChunkBytes, 1_000_000_000L))
        assertEquals(20_000L, cadence.nextPresentationTimeUs(stereoChunkBytes, 1_020_000_000L))
        assertEquals(1_000_000L, cadence.nextPresentationTimeUs(stereoChunkBytes, 2_000_000_000L))
        assertEquals(1_020_000L, cadence.nextPresentationTimeUs(stereoChunkBytes, 2_020_000_000L))
    }

    @Test
    fun `presentation time remains monotonic when clock samples arrive early`() {
        val cadence = AndroidAudioCadenceState(
            sampleRate = 44_100,
            frameSizeBytes = 4,
            chunkDurationNanos = 20_000_000L,
            startedAtNanos = 0L
        )
        val stereoChunkBytes = 882 * 4

        assertEquals(0L, cadence.nextPresentationTimeUs(stereoChunkBytes, 0L))
        assertEquals(20_000L, cadence.nextPresentationTimeUs(stereoChunkBytes, 5_000_000L))
        assertEquals(40_000L, cadence.nextPresentationTimeUs(stereoChunkBytes, 19_000_000L))
    }
}
