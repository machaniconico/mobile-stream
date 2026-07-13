package com.mobilelivecaster.streaming

import android.os.SystemClock

internal data class LiveVideoBitrateSnapshot(
    val status: String = "unknown",
    val initialTargetKbps: Int = 0,
    val requestedTargetKbps: Int = 0,
    val appliedTargetKbps: Int = 0,
    val minimumAppliedKbps: Int = 0,
    val updateCount: Long = 0,
    val failureCount: Long = 0,
    val lastUpdatedAt: Long = 0
)

internal class LiveVideoBitrateTracker(
    private val wallClockMs: () -> Long = System::currentTimeMillis,
    private val monotonicClockMs: () -> Long = SystemClock::elapsedRealtime
) {
    private var initialTargetKbps = 0
    private var requestedTargetKbps = 0
    private var appliedTargetKbps = 0
    private var minimumAppliedKbps = 0
    private var updateCount = 0L
    private var failureCount = 0L
    private var lastUpdatedAt = 0L
    private var lastEventElapsedMs = 0L

    @Synchronized
    fun reset(initialTargetKbps: Int) {
        val target = normalize(initialTargetKbps)
        this.initialTargetKbps = target
        requestedTargetKbps = target
        appliedTargetKbps = target
        minimumAppliedKbps = target
        updateCount = 0
        failureCount = 0
        lastUpdatedAt = 0
        lastEventElapsedMs = monotonicClockMs()
    }

    @Synchronized
    fun recordRequested(targetKbps: Int) {
        requestedTargetKbps = normalize(targetKbps)
    }

    @Synchronized
    fun recordApplied(targetKbps: Int) {
        val target = normalize(targetKbps)
        if (initialTargetKbps <= 0) {
            reset(target)
            return
        }
        val changed = target != appliedTargetKbps
        requestedTargetKbps = target
        if (changed) {
            updateCount += 1
        }
        appliedTargetKbps = target
        minimumAppliedKbps = if (minimumAppliedKbps > 0) minOf(minimumAppliedKbps, target) else target
        if (changed) {
            recordEventTime()
        }
    }

    @Synchronized
    fun recordFailure(targetKbps: Int) {
        requestedTargetKbps = normalize(targetKbps)
        failureCount += 1
        recordEventTime()
    }

    @Synchronized
    fun snapshot(): LiveVideoBitrateSnapshot = LiveVideoBitrateSnapshot(
        status = when {
            initialTargetKbps <= 0 || appliedTargetKbps <= 0 -> "unknown"
            failureCount > 0 -> "failed"
            appliedTargetKbps < initialTargetKbps -> "reduced"
            updateCount > 0 -> "restored"
            else -> "steady"
        },
        initialTargetKbps = initialTargetKbps,
        requestedTargetKbps = requestedTargetKbps,
        appliedTargetKbps = appliedTargetKbps,
        minimumAppliedKbps = minimumAppliedKbps,
        updateCount = updateCount,
        failureCount = failureCount,
        lastUpdatedAt = lastUpdatedAt
    )

    private fun recordEventTime() {
        val nowElapsed = monotonicClockMs()
        val elapsedDelta = (nowElapsed - lastEventElapsedMs).coerceAtLeast(0L)
        lastUpdatedAt = maxOf(wallClockMs(), lastUpdatedAt + elapsedDelta)
        lastEventElapsedMs = nowElapsed
    }

    private fun normalize(value: Int): Int = value.coerceAtLeast(0)
}
