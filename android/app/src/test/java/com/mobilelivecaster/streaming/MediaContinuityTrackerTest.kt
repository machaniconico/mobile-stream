package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MediaContinuityTrackerTest {
    private class TestClock {
        var elapsedMs = 0L
        var wallMs = 1_780_000_000_000L

        fun advance(milliseconds: Long) {
            elapsedMs += milliseconds
            wallMs += milliseconds
        }
    }

    private fun tracker(clock: TestClock) = MediaContinuityTracker(
        stallThresholdMs = 5_000L,
        elapsedRealtimeMs = { clock.elapsedMs },
        wallClockMs = { clock.wallMs }
    )

    @Test
    fun detectsIndependentStallsAndRetainsRecoveryEvidence() {
        val clock = TestClock()
        val tracker = tracker(clock)
        tracker.reset()

        assertEquals("inactive", tracker.record(0L, 0L, active = false).status)
        assertEquals("warming-up", tracker.record(1L, 1L, active = true).status)

        clock.advance(5_000L)
        val bothStalled = tracker.record(1L, 1L, active = true)
        assertEquals("both-stalled", bothStalled.status)
        assertEquals(1L, bothStalled.videoStallCount)
        assertEquals(1L, bothStalled.audioStallCount)

        clock.advance(2_000L)
        val videoRecovered = tracker.record(2L, 1L, active = true)
        assertEquals("audio-stalled", videoRecovered.status)
        assertFalse(videoRecovered.videoStalled)
        assertTrue(videoRecovered.audioStalled)
        assertEquals(7_000L, videoRecovered.maxAudioStallDurationMs)

        clock.advance(100L)
        val recovered = tracker.record(2L, 2L, active = true)
        assertEquals("healthy", recovered.status)
        assertEquals(1L, recovered.videoStallCount)
        assertEquals(1L, recovered.audioStallCount)
        assertEquals(5_000L, recovered.maxVideoStallDurationMs)
    }

    @Test
    fun reconnectAndCounterResetCreateANewBaselineWithoutFalseIncidents() {
        val clock = TestClock()
        val tracker = tracker(clock)
        tracker.reset()
        tracker.record(100L, 150L, active = true)

        clock.advance(12_000L)
        val reconnecting = tracker.record(100L, 150L, active = false)
        assertEquals("inactive", reconnecting.status)
        assertEquals(0L, reconnecting.videoStallCount)
        assertEquals(0L, reconnecting.audioStallCount)

        clock.advance(8_000L)
        val republished = tracker.record(1L, 1L, active = true)
        assertEquals("warming-up", republished.status)
        assertEquals(0L, republished.videoStallCount)
        assertEquals(0L, republished.audioStallCount)

        clock.advance(1_000L)
        val advancing = tracker.record(2L, 2L, active = true)
        assertEquals("healthy", advancing.status)
        assertEquals(0L, advancing.videoStallCount)
        assertEquals(0L, advancing.audioStallCount)
    }

    @Test
    fun detectsVideoOnlyStallWhileAudioContinues() {
        val clock = TestClock()
        val tracker = tracker(clock)
        tracker.reset()
        tracker.record(10L, 10L, active = true)

        repeat(5) { step ->
            clock.advance(1_000L)
            tracker.record(10L, 11L + step, active = true)
        }

        val videoStalled = tracker.record(10L, 16L, active = true)
        assertEquals("video-stalled", videoStalled.status)
        assertTrue(videoStalled.videoStalled)
        assertFalse(videoStalled.audioStalled)
        assertEquals(1L, videoStalled.videoStallCount)
        assertEquals(0L, videoStalled.audioStallCount)
    }

    @Test
    fun finalSampleExtendsMaximumAndNewSessionResetClearsHistory() {
        val clock = TestClock()
        val tracker = tracker(clock)
        tracker.reset()
        tracker.record(10L, 10L, active = true)

        clock.advance(6_000L)
        tracker.record(10L, 10L, active = true)
        clock.advance(14_000L)
        val finalSample = tracker.record(10L, 10L, active = true)
        assertEquals(20_000L, finalSample.maxVideoStallDurationMs)
        assertEquals(20_000L, finalSample.maxAudioStallDurationMs)
        assertEquals(1L, finalSample.videoStallCount)
        assertEquals(1L, finalSample.audioStallCount)

        tracker.reset()
        val nextSession = tracker.record(null, null, active = false)
        assertEquals(0L, nextSession.videoStallCount)
        assertEquals(0L, nextSession.audioStallCount)
        assertEquals(0L, nextSession.maxVideoStallDurationMs)
        assertEquals(0L, nextSession.maxAudioStallDurationMs)
    }
}
