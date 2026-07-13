package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeVideoBitrateUpdateTest {
    @Test
    fun reportsBitrateFailureWithoutRunningAncillaryWork() {
        var ancillaryCalled = false

        val result = executeNativeVideoBitrateUpdate(
            applyBitrate = { error("bitrate rejected") },
            afterBitrateApplied = { ancillaryCalled = true }
        )

        assertFalse(result.bitrateApplied)
        assertEquals("bitrate rejected", result.bitrateFailure?.message)
        assertNull(result.ancillaryFailure)
        assertFalse(ancillaryCalled)
    }

    @Test
    fun keepsConfirmedBitrateWhenAncillaryWorkFails() {
        var bitrateApplied = false

        val result = executeNativeVideoBitrateUpdate(
            applyBitrate = { bitrateApplied = true },
            afterBitrateApplied = { error("keyframe rejected") }
        )

        assertTrue(bitrateApplied)
        assertTrue(result.bitrateApplied)
        assertNull(result.bitrateFailure)
        assertEquals("keyframe rejected", result.ancillaryFailure?.message)
    }

    @Test
    fun reportsCompleteSuccess() {
        val result = executeNativeVideoBitrateUpdate(applyBitrate = {})

        assertTrue(result.bitrateApplied)
        assertNull(result.bitrateFailure)
        assertNull(result.ancillaryFailure)
    }

    @Test
    fun trackedAncillaryFailureCommitsTrackerAndController() {
        val tracker = LiveVideoBitrateTracker({ 5_000L }, { 500L }).also { it.reset(3_500) }
        val controller = NativeAdaptiveBitrateController().also {
            it.reset(3_500)
            it.requestBaselineChange(2_500)
        }

        val result = executeTrackedNativeVideoBitrateUpdate(
            targetKbps = 2_500,
            tracker = tracker,
            applyBitrate = {},
            afterBitrateApplied = { error("keyframe rejected") },
            onBitrateApplied = controller::recordApplied,
            onBitrateFailure = { _, error -> controller.recordFailure(error.message ?: "failed", 2_000) }
        )

        assertTrue(result.bitrateApplied)
        assertEquals("keyframe rejected", result.ancillaryFailure?.message)
        assertEquals(2_500, tracker.snapshot().appliedTargetKbps)
        assertEquals(0L, tracker.snapshot().failureCount)
        assertEquals(2_500, controller.snapshot(2_000).baselineTargetKbps)
        assertEquals(2_500, controller.snapshot(2_000).effectiveTargetKbps)
    }

    @Test
    fun trackedBitrateFailureUpdatesTrackerAndKeepsConfirmedControllerTarget() {
        val tracker = LiveVideoBitrateTracker({ 5_000L }, { 500L }).also { it.reset(3_500) }
        val controller = NativeAdaptiveBitrateController().also {
            it.reset(3_500)
            it.requestBaselineChange(2_500)
        }

        val result = executeTrackedNativeVideoBitrateUpdate(
            targetKbps = 2_500,
            tracker = tracker,
            applyBitrate = { error("bitrate rejected") },
            onBitrateApplied = controller::recordApplied,
            onBitrateFailure = { _, error -> controller.recordFailure(error.message ?: "failed", 2_000) }
        )

        assertFalse(result.bitrateApplied)
        assertEquals(1L, tracker.snapshot().failureCount)
        assertEquals(3_500, controller.snapshot(2_000).baselineTargetKbps)
        assertEquals(3_500, controller.snapshot(2_000).effectiveTargetKbps)
        assertEquals("failed", controller.snapshot(2_000).controllerState)
    }
}
