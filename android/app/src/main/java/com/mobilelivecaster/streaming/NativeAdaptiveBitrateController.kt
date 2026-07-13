package com.mobilelivecaster.streaming

import kotlin.math.roundToInt

internal data class NativeAdaptiveBitrateSample(
    val nowElapsedMs: Long,
    val nowWallMs: Long,
    val active: Boolean,
    val publishGeneration: Int,
    val congested: Boolean,
    val queuedItems: Int,
    val cacheSize: Int,
    val measuredBitrateKbps: Int,
    val useMeasuredBitrate: Boolean,
    val droppedVideoFrames: Long,
    val cumulativeReconnectCount: Int,
    val thermalState: String = "unknown"
)

internal data class NativeAdaptiveBitrateDecision(
    val type: String,
    val targetKbps: Int,
    val reason: String
)

internal data class NativeAdaptiveBitrateSnapshot(
    val controlOwner: String = "native",
    val controllerState: String = "idle",
    val baselineTargetKbps: Int = 0,
    val effectiveTargetKbps: Int = 0,
    val floorTargetKbps: Int = 0,
    val pendingTargetKbps: Int = 0,
    val automaticReductionCount: Long = 0,
    val automaticRestorationCount: Long = 0,
    val pressureSampleCount: Int = 0,
    val healthySampleCount: Int = 0,
    val cooldownRemainingMs: Long = 0,
    val recoveryEligibleInMs: Long = 0,
    val publishGeneration: Int = 0,
    val cumulativeReconnectCount: Int = 0,
    val lastDecisionAt: Long = 0,
    val lastDecisionReason: String = ""
)

internal fun isNativeAdaptiveBitrateActive(
    sessionLive: Boolean,
    publishGeneration: Int,
    publisherState: String,
    transportActive: Boolean
): Boolean = sessionLive && publishGeneration > 0 && publisherState == "published" && transportActive

internal fun resolveNativeVideoBitrateTargetKbps(
    requestedTargetKbps: Int,
    baselineChanged: Boolean,
    controller: NativeAdaptiveBitrateSnapshot
): Int = controller.pendingTargetKbps.takeIf { it > 0 }
    ?: if (baselineChanged) requestedTargetKbps else controller.effectiveTargetKbps.takeIf { it > 0 }
    ?: requestedTargetKbps

internal class NativeAdaptiveBitrateController {
    companion object {
        const val STARTUP_GRACE_MS = 10_000L
        const val REDUCTION_COOLDOWN_MS = 8_000L
        const val RECOVERY_COOLDOWN_MS = 20_000L
        const val RECOVERY_AFTER_REPUBLISH_MS = 30_000L
        const val PRESSURE_SAMPLES = 3
        const val CRITICAL_PRESSURE_SAMPLES = 2
        const val HEALTHY_SAMPLES = 30
        const val ABSOLUTE_MINIMUM_KBPS = 900
        const val MINIMUM_BASELINE_PERCENT = 35
    }

    private var controllerState = "idle"
    private var baselineTargetKbps = 0
    private var effectiveTargetKbps = 0
    private var floorTargetKbps = 0
    private var pendingTargetKbps = 0
    private var pendingBaselineTargetKbps: Int? = null
    private var pendingDecisionType: String? = null
    private var automaticReductionCount = 0L
    private var automaticRestorationCount = 0L
    private var pressureSampleCount = 0
    private var criticalPressureSampleCount = 0
    private var healthySampleCount = 0
    private var cooldownUntilElapsedMs = 0L
    private var recoveryEligibleElapsedMs = 0L
    private var publishedAtElapsedMs = 0L
    private var publishGeneration = 0
    private var cumulativeReconnectCount = 0
    private var reconnectPressurePending = false
    private var lastDroppedVideoFrames = 0L
    private var lastDecisionAt = 0L
    private var lastDecisionReason = ""

    fun reset(baselineKbps: Int, nowElapsedMs: Long = 0L) {
        baselineTargetKbps = normalizeTarget(baselineKbps)
        effectiveTargetKbps = baselineTargetKbps
        floorTargetKbps = floorForBaseline(baselineTargetKbps)
        pendingTargetKbps = 0
        pendingBaselineTargetKbps = null
        pendingDecisionType = null
        automaticReductionCount = 0
        automaticRestorationCount = 0
        pressureSampleCount = 0
        criticalPressureSampleCount = 0
        healthySampleCount = 0
        cooldownUntilElapsedMs = 0
        recoveryEligibleElapsedMs = nowElapsedMs.coerceAtLeast(0L)
        publishedAtElapsedMs = 0
        publishGeneration = 0
        cumulativeReconnectCount = 0
        reconnectPressurePending = false
        lastDroppedVideoFrames = 0
        lastDecisionAt = 0
        lastDecisionReason = ""
        controllerState = "idle"
    }

    fun requestBaselineChange(baselineKbps: Int, thermalState: String = "unknown"): Int {
        val target = normalizeTarget(baselineKbps)
        val normalizedThermalState = thermalState.trim().lowercase()
        val currentTarget = listOfNotNull(
            effectiveTargetKbps.takeIf { it > 0 },
            pendingTargetKbps.takeIf { it > 0 }
        ).minOrNull() ?: target
        pendingTargetKbps = when (normalizedThermalState) {
            "critical" -> minOf(floorForBaseline(target), currentTarget)
            "fair", "serious" -> minOf(target, currentTarget)
            else -> target
        }
        pendingBaselineTargetKbps = target
        pendingDecisionType = null
        reconnectPressurePending = false
        clearWindows()
        controllerState = "cooldown"
        return pendingTargetKbps
    }

    fun recordApplied(targetKbps: Int) {
        val normalizedTarget = normalizeTarget(targetKbps)
        if (pendingTargetKbps > 0 && normalizedTarget != pendingTargetKbps) {
            return
        }
        val confirmsPendingTarget = normalizedTarget == pendingTargetKbps
        val confirmedBaseline = pendingBaselineTargetKbps?.takeIf { confirmsPendingTarget }
        if (confirmedBaseline != null) {
            baselineTargetKbps = confirmedBaseline
            floorTargetKbps = floorForBaseline(confirmedBaseline)
        }
        val minimumTargetKbps = listOfNotNull(
            floorTargetKbps,
            effectiveTargetKbps,
            baselineTargetKbps,
            pendingTargetKbps.takeIf { it > 0 }
        ).minOrNull() ?: floorTargetKbps
        val target = normalizedTarget.coerceIn(minimumTargetKbps, baselineTargetKbps)
        val appliedDecisionType = pendingDecisionType?.takeIf { confirmsPendingTarget }
        effectiveTargetKbps = target
        if (appliedDecisionType == "reduce") {
            automaticReductionCount += 1
        } else if (appliedDecisionType == "restore") {
            automaticRestorationCount += 1
        }
        pendingTargetKbps = 0
        pendingBaselineTargetKbps = null
        pendingDecisionType = null
        controllerState = if (effectiveTargetKbps < baselineTargetKbps) "reduced" else "observing"
    }

    fun recordRequested(targetKbps: Int) {
        pendingTargetKbps = normalizeTarget(targetKbps).coerceIn(floorTargetKbps, baselineTargetKbps)
        pendingBaselineTargetKbps = null
        pendingDecisionType = null
        clearWindows()
        controllerState = "cooldown"
    }

    fun recordFailure(reason: String, nowWallMs: Long) {
        pendingTargetKbps = 0
        pendingBaselineTargetKbps = null
        pendingDecisionType = null
        reconnectPressurePending = false
        clearWindows()
        controllerState = "failed"
        lastDecisionAt = nowWallMs.coerceAtLeast(lastDecisionAt)
        lastDecisionReason = reason.take(160)
    }

    fun evaluate(sample: NativeAdaptiveBitrateSample): NativeAdaptiveBitrateDecision? {
        if (controllerState == "failed") return null
        val nowElapsedMs = sample.nowElapsedMs.coerceAtLeast(0L)
        val nowWallMs = sample.nowWallMs.coerceAtLeast(0L)
        val droppedVideoFrames = sample.droppedVideoFrames.coerceAtLeast(0L)
        val droppedIncrease = (droppedVideoFrames - lastDroppedVideoFrames).coerceAtLeast(0L)
        val reconnectIncrease = (sample.cumulativeReconnectCount - cumulativeReconnectCount).coerceAtLeast(0)
        val thermalState = sample.thermalState.trim().lowercase()
        val thermalCritical = thermalState == "critical"
        val thermalSerious = thermalState == "serious"
        val thermalRecoveryBlocked = thermalState == "fair" || thermalSerious || thermalCritical
        val thermalFloorTargetKbps = floorForBaseline(pendingBaselineTargetKbps ?: baselineTargetKbps)
        val thermalSafetyTargetKbps = listOfNotNull(
            thermalFloorTargetKbps,
            effectiveTargetKbps.takeIf { it > 0 },
            pendingTargetKbps.takeIf { it > 0 }
        ).minOrNull() ?: thermalFloorTargetKbps
        if (reconnectIncrease > 0) {
            reconnectPressurePending = true
        }
        lastDroppedVideoFrames = droppedVideoFrames
        cumulativeReconnectCount = sample.cumulativeReconnectCount.coerceAtLeast(cumulativeReconnectCount)

        if (!sample.active) {
            clearWindows()
            controllerState = if (effectiveTargetKbps < baselineTargetKbps) "reduced" else "idle"
            return null
        }

        if (sample.publishGeneration != publishGeneration) {
            publishGeneration = sample.publishGeneration.coerceAtLeast(0)
            publishedAtElapsedMs = nowElapsedMs
            recoveryEligibleElapsedMs = nowElapsedMs + RECOVERY_AFTER_REPUBLISH_MS
            clearWindows()
            controllerState = "startup"
            if (!thermalCritical) return null
        }

        if (thermalCritical && pendingTargetKbps > 0 && pendingTargetKbps != thermalSafetyTargetKbps) {
            return decide(
                "reduce",
                thermalSafetyTargetKbps,
                pressureReason(sample, 0.0, 1.0, 0, 0),
                nowElapsedMs,
                nowWallMs,
                preservePendingBaseline = true
            )
        }

        if ((nowElapsedMs - publishedAtElapsedMs < STARTUP_GRACE_MS && !thermalCritical) || pendingTargetKbps > 0) {
            clearWindows()
            controllerState = if (pendingTargetKbps > 0) "cooldown" else "startup"
            return null
        }

        val queueRatio = queueRatio(sample.queuedItems, sample.cacheSize)
        val measuredRatio = if (sample.useMeasuredBitrate && sample.measuredBitrateKbps > 0 && effectiveTargetKbps > 0) {
            sample.measuredBitrateKbps.toDouble() / effectiveTargetKbps.toDouble()
        } else {
            1.0
        }
        val reconnectPressure = reconnectPressurePending
        val pressured = thermalSerious || thermalCritical || sample.congested || queueRatio >= 0.5 ||
            measuredRatio < 0.65 || droppedIncrease > 0 || reconnectPressure
        val critical = thermalSerious || thermalCritical || queueRatio >= 0.8 || measuredRatio < 0.4 ||
            droppedIncrease >= 3 || reconnectPressure

        if (pressured) {
            pressureSampleCount += 1
            criticalPressureSampleCount = if (critical) criticalPressureSampleCount + 1 else 0
            healthySampleCount = 0
            controllerState = "pressure"
            val holdReady = thermalCritical || pressureSampleCount >= PRESSURE_SAMPLES ||
                criticalPressureSampleCount >= CRITICAL_PRESSURE_SAMPLES
            val cooldownReady = thermalCritical || nowElapsedMs >= cooldownUntilElapsedMs
            val minimumTargetKbps = if (thermalCritical) thermalFloorTargetKbps else floorTargetKbps
            if (holdReady && cooldownReady && effectiveTargetKbps > minimumTargetKbps) {
                val target = if (thermalCritical) {
                    minimumTargetKbps
                } else {
                    maxOf(minimumTargetKbps, roundToHundred(effectiveTargetKbps * 0.8))
                }
                if (target < effectiveTargetKbps) {
                    return decide(
                        "reduce",
                        target,
                        pressureReason(sample, queueRatio, measuredRatio, droppedIncrease, if (reconnectPressure) 1 else 0),
                        nowElapsedMs,
                        nowWallMs,
                        preservePendingBaseline = thermalCritical
                    )
                }
            }
            if (holdReady && cooldownReady && effectiveTargetKbps <= minimumTargetKbps) {
                reconnectPressurePending = false
            }
            return null
        }

        clearPressure()
        val measuredHealthy = !sample.useMeasuredBitrate ||
            (sample.measuredBitrateKbps > 0 && measuredRatio >= 0.85)
        val healthy = effectiveTargetKbps < baselineTargetKbps && queueRatio <= 0.1 && measuredHealthy &&
            !thermalRecoveryBlocked
        if (!healthy) {
            healthySampleCount = 0
            controllerState = if (effectiveTargetKbps < baselineTargetKbps) "reduced" else "observing"
            return null
        }

        healthySampleCount += 1
        controllerState = "recovering"
        val recoveryReady = healthySampleCount >= HEALTHY_SAMPLES &&
            nowElapsedMs >= recoveryEligibleElapsedMs &&
            nowElapsedMs >= cooldownUntilElapsedMs
        if (!recoveryReady) return null
        val target = minOf(baselineTargetKbps, maxOf(effectiveTargetKbps + 100, roundToHundred(effectiveTargetKbps * 1.1)))
        return if (target > effectiveTargetKbps) {
            decide(
                "restore",
                target,
                "Native publisher remained uncongested through the recovery hold.",
                nowElapsedMs,
                nowWallMs
            )
        } else {
            null
        }
    }

    fun snapshot(nowElapsedMs: Long): NativeAdaptiveBitrateSnapshot = NativeAdaptiveBitrateSnapshot(
        controllerState = controllerState,
        baselineTargetKbps = baselineTargetKbps,
        effectiveTargetKbps = effectiveTargetKbps,
        floorTargetKbps = floorTargetKbps,
        pendingTargetKbps = pendingTargetKbps,
        automaticReductionCount = automaticReductionCount,
        automaticRestorationCount = automaticRestorationCount,
        pressureSampleCount = pressureSampleCount,
        healthySampleCount = healthySampleCount,
        cooldownRemainingMs = (cooldownUntilElapsedMs - nowElapsedMs).coerceAtLeast(0L),
        recoveryEligibleInMs = (recoveryEligibleElapsedMs - nowElapsedMs).coerceAtLeast(0L),
        publishGeneration = publishGeneration,
        cumulativeReconnectCount = cumulativeReconnectCount,
        lastDecisionAt = lastDecisionAt,
        lastDecisionReason = lastDecisionReason
    )

    private fun decide(
        type: String,
        targetKbps: Int,
        reason: String,
        nowElapsedMs: Long,
        nowWallMs: Long,
        preservePendingBaseline: Boolean = false
    ): NativeAdaptiveBitrateDecision {
        val retainedPendingBaseline = pendingBaselineTargetKbps.takeIf { preservePendingBaseline }
        pendingTargetKbps = targetKbps
        pendingBaselineTargetKbps = retainedPendingBaseline
        pendingDecisionType = type
        if (type == "reduce") {
            cooldownUntilElapsedMs = nowElapsedMs + REDUCTION_COOLDOWN_MS
        } else {
            cooldownUntilElapsedMs = nowElapsedMs + RECOVERY_COOLDOWN_MS
        }
        reconnectPressurePending = false
        lastDecisionAt = maxOf(lastDecisionAt, nowWallMs)
        lastDecisionReason = reason.take(160)
        clearWindows()
        controllerState = "cooldown"
        return NativeAdaptiveBitrateDecision(type, targetKbps, lastDecisionReason)
    }

    private fun clearWindows() {
        clearPressure()
        healthySampleCount = 0
    }

    private fun clearPressure() {
        pressureSampleCount = 0
        criticalPressureSampleCount = 0
    }

    private fun normalizeTarget(value: Int): Int = roundToHundred(value.coerceAtLeast(0).toDouble())

    private fun floorForBaseline(baselineKbps: Int): Int = minOf(
        baselineKbps,
        maxOf(ABSOLUTE_MINIMUM_KBPS, roundToHundred(baselineKbps * MINIMUM_BASELINE_PERCENT / 100.0))
    )

    private fun roundToHundred(value: Double): Int = ((value / 100.0).roundToInt() * 100).coerceAtLeast(0)

    private fun queueRatio(items: Int, capacity: Int): Double = if (capacity > 0) {
        (items.coerceAtLeast(0).toDouble() / capacity.toDouble()).coerceIn(0.0, 1.0)
    } else {
        0.0
    }

    private fun pressureReason(
        sample: NativeAdaptiveBitrateSample,
        queueRatio: Double,
        measuredRatio: Double,
        droppedIncrease: Long,
        reconnectIncrease: Int
    ): String = when {
        sample.thermalState.trim().equals("critical", ignoreCase = true) ->
            "The device reported critical thermal pressure; bitrate was reduced to the safety floor."
        sample.thermalState.trim().equals("serious", ignoreCase = true) ->
            "The device reported sustained serious thermal pressure."
        reconnectIncrease > 0 -> "A transport reconnect occurred during the active session."
        droppedIncrease > 0 -> "$droppedIncrease new publisher video frame drop(s) were observed."
        sample.congested || queueRatio >= 0.5 -> "Publisher queue pressure reached ${(queueRatio * 100).roundToInt()}%."
        measuredRatio < 0.65 -> "Measured send bitrate stayed at ${(measuredRatio * 100).roundToInt()}% of target."
        else -> "Sustained native publisher pressure was observed."
    }
}
