package com.mobilelivecaster.streaming

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
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

    @Test
    fun trackedUpdatesDoNotPublishSupersededAsyncResults() {
        val tracker = LiveVideoBitrateTracker({ 5_000L }, { 500L }).also { it.reset(3_500) }
        val staleGeneration = tracker.recordRequested(3_000)
        val currentGeneration = tracker.recordRequested(1_200)
        var appliedCallbackCount = 0
        var failureCallbackCount = 0
        var staleApplyCount = 0

        val staleSuccess = executeTrackedNativeVideoBitrateUpdate(
            targetKbps = 3_000,
            tracker = tracker,
            requestGeneration = staleGeneration,
            applyBitrate = { staleApplyCount += 1 },
            onBitrateApplied = { appliedCallbackCount += 1 }
        )
        val staleFailure = executeTrackedNativeVideoBitrateUpdate(
            targetKbps = 3_000,
            tracker = tracker,
            requestGeneration = staleGeneration,
            applyBitrate = { error("stale failure") },
            onBitrateFailure = { _, _ -> failureCallbackCount += 1 }
        )

        assertFalse(staleSuccess.bitrateApplied)
        assertFalse(staleFailure.bitrateApplied)
        assertFalse(staleSuccess.trackerAccepted)
        assertFalse(staleFailure.trackerAccepted)
        assertEquals(0, staleApplyCount)
        assertNull(staleFailure.bitrateFailure)
        assertEquals(0, appliedCallbackCount)
        assertEquals(0, failureCallbackCount)
        assertEquals(0L, tracker.snapshot().failureCount)
        assertEquals(3_500, tracker.snapshot().appliedTargetKbps)

        val currentSuccess = executeTrackedNativeVideoBitrateUpdate(
            targetKbps = 1_200,
            tracker = tracker,
            requestGeneration = currentGeneration,
            applyBitrate = {},
            onBitrateApplied = { appliedCallbackCount += 1 }
        )

        assertTrue(currentSuccess.trackerAccepted)
        assertEquals(1, appliedCallbackCount)
        assertEquals(1_200, tracker.snapshot().appliedTargetKbps)
        assertEquals(currentGeneration, tracker.snapshot().appliedRequestGeneration)
    }

    @Test
    fun trackedEncoderWorkDoesNotHoldTheTrackerLock() {
        val tracker = LiveVideoBitrateTracker({ 5_000L }, { 500L }).also { it.reset(3_500) }
        val firstGeneration = tracker.recordRequested(3_000)
        val applyStarted = CountDownLatch(1)
        val releaseApply = CountDownLatch(1)
        val requestFinished = CountDownLatch(1)
        val result = AtomicReference<NativeVideoBitrateUpdateResult?>()
        val updateThread = Thread {
            result.set(
                executeTrackedNativeVideoBitrateUpdate(
                    targetKbps = 3_000,
                    tracker = tracker,
                    requestGeneration = firstGeneration,
                    applyBitrate = {
                        applyStarted.countDown()
                        releaseApply.await()
                    }
                )
            )
        }
        updateThread.start()
        assertTrue(applyStarted.await(1, TimeUnit.SECONDS))

        val requestThread = Thread {
            tracker.recordRequested(1_200)
            requestFinished.countDown()
        }
        requestThread.start()
        val advancedWhileEncoderWasBusy = requestFinished.await(1, TimeUnit.SECONDS)
        releaseApply.countDown()
        updateThread.join(1_000)
        requestThread.join(1_000)

        assertTrue(advancedWhileEncoderWasBusy)
        assertFalse(updateThread.isAlive)
        assertFalse(requestThread.isAlive)
        assertTrue(requireNotNull(result.get()).bitrateApplied)
        assertFalse(requireNotNull(result.get()).trackerAccepted)
        assertEquals(3_500, tracker.snapshot().appliedTargetKbps)
        assertEquals(1_200, tracker.snapshot().requestedTargetKbps)
    }
}
