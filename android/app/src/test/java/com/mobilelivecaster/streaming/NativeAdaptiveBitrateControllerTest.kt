package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NativeAdaptiveBitrateControllerTest {
    @Test
    fun reducesAfterSustainedPressureAndHonorsCooldown() {
        val controller = controller()
        assertNull(controller.evaluate(sample(0, generation = 1)))
        for (second in 10..11) {
            assertNull(controller.evaluate(sample(second, congested = true, queuedItems = 100)))
        }
        val first = controller.evaluate(sample(12, congested = true, queuedItems = 100))
        assertEquals("reduce", first?.type)
        assertEquals(2_800, first?.targetKbps)
        assertEquals(3_500, controller.snapshot(12_000).effectiveTargetKbps)
        assertEquals(0L, controller.snapshot(12_000).automaticReductionCount)
        controller.recordApplied(2_800)
        assertEquals(1L, controller.snapshot(12_000).automaticReductionCount)

        for (second in 13..19) {
            assertNull(controller.evaluate(sample(second, congested = true, queuedItems = 100)))
        }
        val second = controller.evaluate(sample(20, congested = true, queuedItems = 100))
        assertEquals(2_200, second?.targetKbps)
    }

    @Test
    fun ignoresTransientPressureAndDuplicateStartupGenerations() {
        val controller = controller()
        assertNull(controller.evaluate(sample(0, generation = 1)))
        assertNull(controller.evaluate(sample(10, congested = true)))
        assertNull(controller.evaluate(sample(11)))
        assertNull(controller.evaluate(sample(12, congested = true)))
        assertNull(controller.evaluate(sample(13)))
        assertEquals(3_500, controller.snapshot(13_000).effectiveTargetKbps)
    }

    @Test
    fun criticalPressureUsesTheShorterHold() {
        val controller = controller()
        controller.evaluate(sample(0, generation = 1))
        assertNull(controller.evaluate(sample(10, congested = true, queuedItems = 160)))
        assertEquals(2_800, controller.evaluate(sample(11, congested = true, queuedItems = 160))?.targetKbps)
    }

    @Test
    fun restoresInBoundedStepsAfterThirtyHealthySamples() {
        val controller = controller()
        controller.evaluate(sample(0, generation = 1))
        for (second in 10..12) controller.evaluate(sample(second, congested = true, queuedItems = 100))
        controller.recordApplied(2_800)

        var decision: NativeAdaptiveBitrateDecision? = null
        for (second in 13..42) {
            decision = controller.evaluate(sample(second, bitrateKbps = 2_700)) ?: decision
        }
        assertEquals("restore", decision?.type)
        assertEquals(3_100, decision?.targetKbps)
    }

    @Test
    fun preservesReducedTargetAcrossRepublishAndBlocksImmediateRecovery() {
        val controller = controller()
        controller.evaluate(sample(0, generation = 1))
        for (second in 10..12) controller.evaluate(sample(second, congested = true, queuedItems = 100))
        controller.recordApplied(2_800)

        assertNull(controller.evaluate(sample(20, generation = 2, bitrateKbps = 2_700, reconnectCount = 0)))
        for (second in 30..49) {
            assertNull(controller.evaluate(sample(second, generation = 2, bitrateKbps = 2_700, reconnectCount = 0)))
        }
        assertEquals(2_800, controller.snapshot(49_000).effectiveTargetKbps)
    }

    @Test
    fun stopsAfterNativeApplicationFailure() {
        val controller = controller()
        controller.recordFailure("encoder rejected target", 5_000)
        assertNull(controller.evaluate(sample(20, congested = true, queuedItems = 160)))
        assertEquals("failed", controller.snapshot(20_000).controllerState)
    }

    @Test
    fun failedAutomaticApplicationKeepsTheLastConfirmedTarget() {
        val controller = controller()
        controller.evaluate(sample(0, generation = 1))
        controller.evaluate(sample(10, congested = true, queuedItems = 160))
        controller.evaluate(sample(11, congested = true, queuedItems = 160))

        assertEquals(2_800, controller.snapshot(11_000).pendingTargetKbps)
        controller.recordFailure("encoder rejected target", 11_000)

        val snapshot = controller.snapshot(12_000)
        assertEquals(3_500, snapshot.effectiveTargetKbps)
        assertEquals(0L, snapshot.automaticReductionCount)
        assertEquals(0, snapshot.pendingTargetKbps)
    }

    @Test
    fun carriesReconnectPressureAcrossInactiveAndStartupHeartbeats() {
        val controller = controller()
        controller.evaluate(sample(0, generation = 1, reconnectCount = 0))
        assertNull(controller.evaluate(sample(12, active = false, generation = 1, reconnectCount = 1)))
        assertNull(controller.evaluate(sample(20, generation = 2, reconnectCount = 1)))
        assertNull(controller.evaluate(sample(30, generation = 2, reconnectCount = 1)))

        val decision = controller.evaluate(sample(31, generation = 2, reconnectCount = 1))
        assertEquals("reduce", decision?.type)
        assertEquals(2_800, decision?.targetKbps)
    }

    @Test
    fun ignoresLowEncoderOutputWhenMeasuredBitrateIsNotANetworkSignal() {
        val controller = controller()
        controller.evaluate(sample(0, generation = 1))
        for (second in 10..20) {
            assertNull(controller.evaluate(sample(second, bitrateKbps = 400, useMeasuredBitrate = false)))
        }
        assertEquals(3_500, controller.snapshot(20_000).effectiveTargetKbps)
    }

    @Test
    fun waitsForOwnerThreadConfirmationOfAnExternalRequest() {
        val controller = controller()
        controller.recordRequested(3_000)

        assertEquals(3_000, controller.snapshot(1_000).pendingTargetKbps)
        assertNull(controller.evaluate(sample(20, congested = true, queuedItems = 160)))

        controller.recordApplied(3_000)
        val snapshot = controller.snapshot(21_000)
        assertEquals(0, snapshot.pendingTargetKbps)
        assertEquals(3_000, snapshot.effectiveTargetKbps)
        assertEquals("reduced", snapshot.controllerState)
    }

    @Test
    fun commitsBaselineOnlyAfterEncoderConfirmation() {
        val controller = controller()

        controller.requestBaselineChange(2_500)
        val pending = controller.snapshot(1_000)
        assertEquals(3_500, pending.baselineTargetKbps)
        assertEquals(3_500, pending.effectiveTargetKbps)
        assertEquals(2_500, pending.pendingTargetKbps)

        controller.recordApplied(2_500)
        val applied = controller.snapshot(2_000)
        assertEquals(2_500, applied.baselineTargetKbps)
        assertEquals(2_500, applied.effectiveTargetKbps)
        assertEquals(0, applied.pendingTargetKbps)
    }

    @Test
    fun failedBaselineChangeKeepsLastConfirmedTargets() {
        val controller = controller()

        controller.requestBaselineChange(2_500)
        controller.recordFailure("encoder rejected target", 2_000)

        val snapshot = controller.snapshot(2_000)
        assertEquals(3_500, snapshot.baselineTargetKbps)
        assertEquals(3_500, snapshot.effectiveTargetKbps)
        assertEquals(0, snapshot.pendingTargetKbps)
        assertEquals("failed", snapshot.controllerState)
    }

    @Test
    fun doesNotGoBelowTheBaselineFloor() {
        val controller = controller(1_000)
        controller.evaluate(sample(0, generation = 1, bitrateKbps = 1_000))
        for (second in 10..12) controller.evaluate(sample(second, congested = true, queuedItems = 100, bitrateKbps = 1_000))
        assertEquals(900, controller.snapshot(12_000).pendingTargetKbps)
        controller.recordApplied(900)
        for (second in 20..22) assertNull(controller.evaluate(sample(second, congested = true, queuedItems = 100, bitrateKbps = 900)))
    }

    private fun controller(baselineKbps: Int = 3_500) = NativeAdaptiveBitrateController().also {
        it.reset(baselineKbps)
    }

    private fun sample(
        second: Int,
        generation: Int = 1,
        active: Boolean = true,
        congested: Boolean = false,
        queuedItems: Int = 0,
        bitrateKbps: Int = 3_400,
        useMeasuredBitrate: Boolean = true,
        reconnectCount: Int = generation - 1
    ) = NativeAdaptiveBitrateSample(
        nowElapsedMs = second * 1_000L,
        nowWallMs = 1_700_000_000_000L + second * 1_000L,
        active = active,
        publishGeneration = generation,
        congested = congested,
        queuedItems = queuedItems,
        cacheSize = 180,
        measuredBitrateKbps = bitrateKbps,
        useMeasuredBitrate = useMeasuredBitrate,
        droppedVideoFrames = 0,
        cumulativeReconnectCount = reconnectCount
    )
}
