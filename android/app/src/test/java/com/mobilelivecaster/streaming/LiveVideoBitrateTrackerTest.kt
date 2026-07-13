package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
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

        tracker.recordRequested(2_500)
        tracker.recordFailure(2_500)

        val snapshot = tracker.snapshot()
        assertEquals("failed", snapshot.status)
        assertEquals(2_500, snapshot.requestedTargetKbps)
        assertEquals(3_500, snapshot.appliedTargetKbps)
        assertEquals(0, snapshot.updateCount)
        assertEquals(1, snapshot.failureCount)
        assertEquals(5_000, snapshot.lastUpdatedAt)
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
