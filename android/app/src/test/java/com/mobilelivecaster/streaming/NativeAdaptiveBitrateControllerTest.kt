package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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
    fun seriousThermalPressureUsesTheShorterHoldAndRetainsTheReason() {
        val controller = controller()
        controller.evaluate(sample(0, generation = 1))

        assertNull(controller.evaluate(sample(10, thermalState = "serious")))
        val decision = controller.evaluate(sample(11, thermalState = "serious"))

        assertEquals("reduce", decision?.type)
        assertEquals(2_800, decision?.targetKbps)
        assertEquals("The device reported sustained serious thermal pressure.", decision?.reason)
    }

    @Test
    fun criticalThermalPressureBypassesStartupGraceAndUsesTheSafetyFloor() {
        val controller = controller()

        val decision = controller.evaluate(sample(0, generation = 1, thermalState = "critical"))

        assertEquals("reduce", decision?.type)
        assertEquals(1_200, decision?.targetKbps)
        assertEquals(
            "The device reported critical thermal pressure; bitrate was reduced to the safety floor.",
            decision?.reason
        )
    }

    @Test
    fun warningMemoryPressureUsesTheShorterHoldAndRetainsTheReason() {
        val controller = controller()
        controller.evaluate(sample(0, generation = 1))

        assertNull(controller.evaluate(sample(10, memoryPressureState = "warning")))
        val decision = controller.evaluate(sample(11, memoryPressureState = "warning"))

        assertEquals("reduce", decision?.type)
        assertEquals(2_800, decision?.targetKbps)
        assertEquals("The operating system reported sustained memory pressure.", decision?.reason)
    }

    @Test
    fun criticalMemoryPressureBypassesStartupGraceAndUsesTheSafetyFloor() {
        val controller = controller()

        val decision = controller.evaluate(sample(0, generation = 1, memoryPressureState = "critical"))

        assertEquals("reduce", decision?.type)
        assertEquals(1_200, decision?.targetKbps)
        assertEquals(
            "The operating system reported critical memory pressure; bitrate was reduced to the safety floor.",
            decision?.reason
        )
    }

    @Test
    fun criticalMemoryReasonWinsWhenBothResourceSignalsAreCritical() {
        val controller = controller()

        val decision = controller.evaluate(
            sample(0, generation = 1, thermalState = "critical", memoryPressureState = "critical")
        )

        assertEquals(
            "The operating system reported critical memory pressure; bitrate was reduced to the safety floor.",
            decision?.reason
        )
    }

    @Test
    fun criticalThermalPressureBypassesAnExistingReductionCooldown() {
        val controller = controller()
        controller.evaluate(sample(0, generation = 1))
        controller.evaluate(sample(10, thermalState = "serious"))
        controller.evaluate(sample(11, thermalState = "serious"))
        controller.recordApplied(2_800)

        val decision = controller.evaluate(sample(12, thermalState = "critical"))

        assertEquals("reduce", decision?.type)
        assertEquals(1_200, decision?.targetKbps)
    }

    @Test
    fun criticalThermalPressureSupersedesPendingUpdatesAndIgnoresTheirStaleAck() {
        val controller = controller()
        controller.recordRequested(3_000)

        val decision = controller.evaluate(sample(0, generation = 1, thermalState = "critical"))

        assertEquals(1_200, decision?.targetKbps)
        controller.recordApplied(3_000)
        assertEquals(1_200, controller.snapshot(1_000).pendingTargetKbps)
        assertEquals(3_500, controller.snapshot(1_000).effectiveTargetKbps)

        controller.recordApplied(1_200)
        assertEquals(0, controller.snapshot(2_000).pendingTargetKbps)
        assertEquals(1_200, controller.snapshot(2_000).effectiveTargetKbps)
    }

    @Test
    fun criticalThermalPressurePreservesPendingManualBaselineForRecovery() {
        val controller = controller()
        controller.requestBaselineChange(2_500)

        val decision = controller.evaluate(sample(0, generation = 1, thermalState = "critical"))

        assertEquals(900, decision?.targetKbps)
        controller.recordApplied(2_500)
        assertEquals(900, controller.snapshot(1_000).pendingTargetKbps)
        assertEquals(3_500, controller.snapshot(1_000).baselineTargetKbps)

        controller.recordApplied(900)
        var snapshot = controller.snapshot(2_000)
        assertEquals(2_500, snapshot.baselineTargetKbps)
        assertEquals(900, snapshot.effectiveTargetKbps)
        assertEquals(900, snapshot.floorTargetKbps)

        var second = 30
        repeat(16) {
            if (snapshot.effectiveTargetKbps >= snapshot.baselineTargetKbps) return@repeat
            var recovery: NativeAdaptiveBitrateDecision? = null
            repeat(30) {
                recovery = controller.evaluate(
                    sample(
                        second = second,
                        bitrateKbps = snapshot.effectiveTargetKbps,
                        useMeasuredBitrate = false
                    )
                ) ?: recovery
                second += 1
            }
            val target = requireNotNull(recovery).targetKbps
            assertTrue(target <= 2_500)
            controller.recordApplied(target)
            snapshot = controller.snapshot(second * 1_000L)
        }

        assertEquals(2_500, snapshot.effectiveTargetKbps)
    }

    @Test
    fun criticalThermalPressureNeverRaisesAnAlreadyReducedTargetForAHigherPendingBaseline() {
        val controller = controller()
        assertEquals(1_200, controller.evaluate(sample(0, generation = 1, thermalState = "critical"))?.targetKbps)
        controller.recordApplied(1_200)
        controller.requestBaselineChange(6_000)

        val decision = controller.evaluate(sample(1, thermalState = "critical"))

        assertEquals(1_200, decision?.targetKbps)
        controller.recordApplied(1_200)
        val snapshot = controller.snapshot(2_000)
        assertEquals(6_000, snapshot.baselineTargetKbps)
        assertEquals(2_100, snapshot.floorTargetKbps)
        assertEquals(1_200, snapshot.effectiveTargetKbps)
    }

    @Test
    fun requiresConfirmedPublishedGenerationBeforeAutomationBecomesActive() {
        assertEquals(false, isNativeAdaptiveBitrateActive(true, 0, "connecting", true))
        assertEquals(false, isNativeAdaptiveBitrateActive(true, 0, "published", true))
        assertEquals(false, isNativeAdaptiveBitrateActive(true, 1, "connecting", true))
        assertEquals(false, isNativeAdaptiveBitrateActive(true, 1, "published", false))
        assertEquals(true, isNativeAdaptiveBitrateActive(true, 1, "published", true))
    }

    @Test
    fun pendingAdaptiveTargetSurvivesUnrelatedQualityRefreshes() {
        val controller = controller()
        controller.evaluate(sample(0, generation = 1, thermalState = "critical"))
        val snapshot = controller.snapshot(1_000)

        assertEquals(
            1_200,
            resolveNativeVideoBitrateTargetKbps(
                requestedTargetKbps = 3_500,
                baselineChanged = false,
                controller = snapshot
            )
        )
        val manualController = controller()
        manualController.requestBaselineChange(4_000)
        assertEquals(
            4_000,
            resolveNativeVideoBitrateTargetKbps(
                requestedTargetKbps = 4_000,
                baselineChanged = true,
                controller = manualController.snapshot(1_000)
            )
        )
    }

    @Test
    fun elevatedThermalStateTreatsAHigherManualBaselineAsARecoveryCeiling() {
        val controller = controller()
        controller.evaluate(sample(0, generation = 1, thermalState = "critical"))
        controller.recordApplied(1_200)

        val target = controller.requestBaselineChange(6_000, thermalState = "critical")

        assertEquals(1_200, target)
        assertEquals(
            1_200,
            resolveNativeVideoBitrateTargetKbps(
                requestedTargetKbps = 6_000,
                baselineChanged = true,
                controller = controller.snapshot(1_000)
            )
        )
        controller.recordApplied(target)
        val snapshot = controller.snapshot(2_000)
        assertEquals(6_000, snapshot.baselineTargetKbps)
        assertEquals(1_200, snapshot.effectiveTargetKbps)
    }

    @Test
    fun manualBaselineCannotWeakenAPendingCriticalReduction() {
        val controller = controller()
        controller.evaluate(sample(0, generation = 1, thermalState = "critical"))

        val target = controller.requestBaselineChange(6_000, thermalState = "critical")
        val nextHeartbeat = controller.evaluate(sample(1, thermalState = "critical"))

        assertEquals(1_200, target)
        assertEquals(null, nextHeartbeat)
        assertEquals(1_200, controller.snapshot(1_000).pendingTargetKbps)

        controller.recordApplied(target)
        val snapshot = controller.snapshot(2_000)
        assertEquals(6_000, snapshot.baselineTargetKbps)
        assertEquals(2_100, snapshot.floorTargetKbps)
        assertEquals(1_200, snapshot.effectiveTargetKbps)
        assertEquals(0, snapshot.pendingTargetKbps)
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
    fun blocksRecoveryWhileThermalPressureRemainsElevated() {
        val controller = controller()
        controller.evaluate(sample(0, generation = 1))
        controller.evaluate(sample(10, thermalState = "serious"))
        controller.evaluate(sample(11, thermalState = "serious"))
        controller.recordApplied(2_800)

        for (second in 12..50) {
            assertNull(controller.evaluate(sample(second, bitrateKbps = 2_700, thermalState = "fair")))
        }
        assertEquals(2_800, controller.snapshot(50_000).effectiveTargetKbps)

        var recovery: NativeAdaptiveBitrateDecision? = null
        for (second in 51..80) {
            recovery = controller.evaluate(sample(second, bitrateKbps = 2_700, thermalState = "nominal")) ?: recovery
        }
        assertEquals("restore", recovery?.type)
    }

    @Test
    fun blocksRecoveryWhileMemoryPressureRemainsElevated() {
        val controller = controller()
        controller.evaluate(sample(0, generation = 1, memoryPressureState = "critical"))
        controller.recordApplied(1_200)

        for (second in 1..50) {
            assertNull(controller.evaluate(sample(second, bitrateKbps = 2_700, memoryPressureState = "warning")))
        }
        assertEquals(1_200, controller.snapshot(50_000).effectiveTargetKbps)

        var recovery: NativeAdaptiveBitrateDecision? = null
        for (second in 51..80) {
            recovery = controller.evaluate(
                sample(second, bitrateKbps = 2_700, memoryPressureState = "normal")
            ) ?: recovery
        }
        assertEquals("restore", recovery?.type)
    }

    @Test
    fun elevatedMemoryPressureTreatsAHigherManualBaselineAsARecoveryCeiling() {
        val controller = controller()
        controller.evaluate(sample(0, generation = 1, memoryPressureState = "critical"))
        controller.recordApplied(1_200)

        val target = controller.requestBaselineChange(6_000, memoryPressureState = "warning")

        assertEquals(1_200, target)
        controller.recordApplied(target)
        val snapshot = controller.snapshot(2_000)
        assertEquals(6_000, snapshot.baselineTargetKbps)
        assertEquals(1_200, snapshot.effectiveTargetKbps)
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
        reconnectCount: Int = generation - 1,
        thermalState: String = "nominal",
        memoryPressureState: String = "normal"
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
        cumulativeReconnectCount = reconnectCount,
        thermalState = thermalState,
        memoryPressureState = memoryPressureState
    )
}
