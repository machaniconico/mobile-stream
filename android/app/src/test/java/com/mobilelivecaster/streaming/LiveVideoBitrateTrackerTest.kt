package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveVideoBitrateTrackerTest {
    @Test
    fun tracksReductionRestorationAndMinimumAppliedTarget() {
        var wallClockMs = 1_000L
        var monotonicClockMs = 100L
        val tracker = LiveVideoBitrateTracker({ wallClockMs }, { monotonicClockMs })

        tracker.reset(6_000)
        tracker.recordRequested(4_300)
        wallClockMs = 2_000L
        monotonicClockMs = 1_100L
        tracker.recordApplied(4_300)

        assertEquals(
            LiveVideoBitrateSnapshot(
                status = "reduced",
                initialTargetKbps = 6_000,
                requestedTargetKbps = 4_300,
                appliedTargetKbps = 4_300,
                minimumAppliedKbps = 4_300,
                updateCount = 1,
                failureCount = 0,
                requestGeneration = 1,
                appliedRequestGeneration = 1,
                lastUpdatedAt = 2_000
            ),
            tracker.snapshot()
        )

        wallClockMs = 3_000L
        monotonicClockMs = 2_100L
        tracker.recordApplied(6_000)
        val restored = tracker.snapshot()
        assertEquals("restored", restored.status)
        assertEquals(2, restored.updateCount)
        assertEquals(4_300, restored.minimumAppliedKbps)
    }

    @Test
    fun retainsRequestedTargetAndFailureEvidenceWithoutChangingAppliedTarget() {
        val tracker = LiveVideoBitrateTracker({ 5_000L }, { 500L })
        tracker.reset(3_500)

        val requestGeneration = tracker.recordRequested(2_500)
        tracker.recordFailure(2_500, requestGeneration)

        val snapshot = tracker.snapshot()
        assertEquals("failed", snapshot.status)
        assertEquals(2_500, snapshot.requestedTargetKbps)
        assertEquals(3_500, snapshot.appliedTargetKbps)
        assertEquals(0, snapshot.updateCount)
        assertEquals(1, snapshot.failureCount)
        assertEquals(requestGeneration, snapshot.failedRequestGeneration)
        assertEquals(5_000, snapshot.lastUpdatedAt)
    }

    @Test
    fun ignoresResultsFromSupersededRequests() {
        val tracker = LiveVideoBitrateTracker({ 5_000L }, { 500L })
        tracker.reset(3_500)
        val oldGeneration = tracker.recordRequested(3_000)
        val currentGeneration = tracker.recordRequested(1_200)

        assertFalse(tracker.recordApplied(3_000, oldGeneration))
        assertFalse(tracker.recordFailure(3_000, oldGeneration))

        val pending = tracker.snapshot()
        assertEquals("steady", pending.status)
        assertEquals(1_200, pending.requestedTargetKbps)
        assertEquals(3_500, pending.appliedTargetKbps)
        assertEquals(0, pending.updateCount)
        assertEquals(0, pending.failureCount)
        assertEquals(0, pending.appliedRequestGeneration)
        assertEquals(0, pending.failedRequestGeneration)
        assertEquals(0, pending.lastUpdatedAt)

        assertTrue(tracker.recordApplied(1_200, currentGeneration))
        val applied = tracker.snapshot()
        assertEquals(1_200, applied.appliedTargetKbps)
        assertEquals(currentGeneration, applied.appliedRequestGeneration)
        assertEquals(1, applied.updateCount)
    }

    @Test
    fun sameAppliedTargetDoesNotManufactureAnUpdate() {
        val tracker = LiveVideoBitrateTracker({ 1_000L }, { 100L })
        tracker.reset(3_500)
        tracker.recordApplied(3_500)

        assertEquals("steady", tracker.snapshot().status)
        assertEquals(0, tracker.snapshot().updateCount)
    }
}
