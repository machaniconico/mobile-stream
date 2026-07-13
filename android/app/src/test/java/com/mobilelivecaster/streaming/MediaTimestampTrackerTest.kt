package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MediaTimestampTrackerTest {
    @Test
    fun normalizesIndependentTimestampOriginsAndTracksHealthyDrift() {
        val tracker = MediaTimestampTracker(monotonicClockMs = { 0L })

        assertEquals("warming-up", tracker.recordVideo(9_000L).status)
        val baseline = tracker.recordAudio(100L)
        assertEquals("in-sync", baseline.status)
        assertEquals(0L, baseline.skewMs)

        tracker.recordVideo(10_000L, observedAtMs = 1_000L)
        val aligned = tracker.recordAudio(1_090L, observedAtMs = 1_000L)
        assertEquals("in-sync", aligned.status)
        assertEquals(10L, aligned.skewMs)
        tracker.recordVideo(10_010L, observedAtMs = 1_010L)
        val nextAligned = tracker.recordAudio(1_100L, observedAtMs = 1_010L)
        assertTrue(nextAligned.sampleCount >= 3L)
        assertEquals(0L, nextAligned.outOfSyncIncidentCount)
    }

    @Test
    fun recordsDirectionCriticalIncidentsAndRecovery() {
        val tracker = MediaTimestampTracker()
        tracker.recordVideo(0L)
        tracker.recordAudio(0L)

        tracker.recordVideo(700L)
        tracker.recordAudio(10L)
        tracker.recordVideo(710L)
        tracker.recordAudio(20L)
        tracker.recordVideo(720L)
        val critical = tracker.recordAudio(30L)
        assertEquals("video-leading", critical.status)
        assertTrue(critical.critical)
        assertEquals(1L, critical.outOfSyncIncidentCount)
        assertEquals(1L, critical.criticalIncidentCount)
        assertTrue(critical.maxConsecutiveOutOfSyncSamples >= 3L)

        tracker.recordVideo(730L)
        val recovered = tracker.recordAudio(710L)
        assertEquals("in-sync", recovered.status)
        assertFalse(recovered.critical)
        assertEquals(690L, recovered.maxAbsSkewMs)
        assertEquals(1L, recovered.criticalIncidentCount)
    }

    @Test
    fun generationResetCreatesNewBaselinesAndRetainsSessionEvidence() {
        val tracker = MediaTimestampTracker()
        tracker.recordVideo(0L)
        tracker.recordAudio(0L)
        tracker.recordVideo(10L)
        tracker.recordAudio(800L)
        tracker.recordVideo(20L)
        tracker.recordAudio(810L)
        tracker.recordVideo(30L)
        tracker.recordAudio(820L)
        assertTrue(tracker.snapshot().critical)

        tracker.startGeneration()
        assertEquals("warming-up", tracker.snapshot().status)
        tracker.recordVideo(5_000_000L, observedAtMs = 2_000L)
        val republished = tracker.recordAudio(3L, observedAtMs = 2_000L)
        assertEquals("in-sync", republished.status)
        assertEquals(0L, republished.skewMs)
        assertEquals(1L, republished.criticalIncidentCount)

        tracker.reset()
        val nextSession = tracker.snapshot()
        assertEquals(0L, nextSession.sampleCount)
        assertEquals(0L, nextSession.outOfSyncIncidentCount)
        assertEquals(0L, nextSession.criticalIncidentCount)
    }

    @Test
    fun preservesTrackStartOffsetAcrossDifferentCodecClockOrigins() {
        val tracker = MediaTimestampTracker(monotonicClockMs = { 0L })
        tracker.recordVideo(5_000_000L, observedAtMs = 0L)
        tracker.recordAudio(0L, observedAtMs = 800L)
        tracker.recordVideo(5_000_100L, observedAtMs = 900L)
        tracker.recordAudio(100L, observedAtMs = 900L)
        tracker.recordVideo(5_000_200L, observedAtMs = 1_000L)
        val offset = tracker.recordAudio(200L, observedAtMs = 1_000L)

        assertEquals("audio-leading", offset.status)
        assertEquals(-800L, offset.skewMs)
        assertTrue(offset.critical)
        assertEquals(1L, offset.criticalIncidentCount)
    }

    @Test
    fun accumulatorRetainsIncidentsAcrossPublisherRecreation() {
        val accumulator = NativeRuntimeAvSyncAccumulator()
        accumulator.retain(
            NativeRuntimeAvSync(
                status = "video-leading",
                skewMs = 700L,
                maxAbsSkewMs = 720L,
                sampleCount = 50L,
                outOfSyncSampleCount = 8L,
                outOfSyncIncidentCount = 1L,
                criticalIncidentCount = 1L,
                maxConsecutiveOutOfSyncSamples = 8L,
                critical = true
            )
        )

        val republished = accumulator.combine(
            NativeRuntimeAvSync(
                status = "in-sync",
                skewMs = 8L,
                maxAbsSkewMs = 34L,
                sampleCount = 100L
            )
        )
        requireNotNull(republished)
        assertEquals("in-sync", republished.status)
        assertEquals(8L, republished.skewMs)
        assertEquals(720L, republished.maxAbsSkewMs)
        assertEquals(150L, republished.sampleCount)
        assertEquals(1L, republished.outOfSyncIncidentCount)
        assertEquals(1L, republished.criticalIncidentCount)

        accumulator.reset()
        assertEquals(0L, accumulator.combine(NativeRuntimeAvSync())?.criticalIncidentCount)
    }
}
