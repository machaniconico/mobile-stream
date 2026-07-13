package com.mobilelivecaster.streaming

import android.os.SystemClock

internal data class AndroidAudioCaptureRecoveryRequest(
    val generation: Long,
    val reason: String
)

internal data class AndroidAudioCaptureRecoverySnapshot(
    val status: String = "unavailable",
    val lifecycleEventCount: Long = 0L,
    val routeChangeCount: Long = 0L,
    val interruptionCount: Long = 0L,
    val recoveryCount: Long = 0L,
    val recoveryFailureCount: Long = 0L,
    val unrecoveredEventCount: Long = 0L,
    val lastRecoveryReason: String = "",
    val lastRecoveryAt: Long = 0L,
    val suspended: Boolean = false
)

/**
 * Thread-safe capture lifecycle state. Platform callbacks only request recovery;
 * the thread that owns AudioRecord performs the actual release and recreation.
 */
internal class AndroidAudioCaptureRecoveryState(
    private val monotonicNowMs: () -> Long = SystemClock::elapsedRealtime,
    private val wallClockNowMs: () -> Long = System::currentTimeMillis,
    private val maxConsecutiveRecoveryFailures: Int = MAX_CONSECUTIVE_RECOVERY_FAILURES
) {
    companion object {
        const val ZERO_READ_STALL_MS = 1_000L
        const val BASE_RETRY_DELAY_MS = 250L
        const val MAX_RETRY_DELAY_MS = 4_000L
        const val MAX_CONSECUTIVE_RECOVERY_FAILURES = 6
    }

    init {
        require(maxConsecutiveRecoveryFailures > 0) {
            "Maximum consecutive capture recovery failures must be positive"
        }
    }

    private var active = false
    private var clientSilenced = false
    private var policySilenced = false
    private var routeInitialized = false
    private var routedDeviceId: Int? = null
    private var status = "unavailable"
    private var lifecycleEventCount = 0L
    private var routeChangeCount = 0L
    private var interruptionCount = 0L
    private var recoveryCount = 0L
    private var recoveryFailureCount = 0L
    private var unrecoveredEventCount = 0L
    private var lastRecoveryReason = ""
    private var lastRecoveryAt = 0L
    private var pendingRecovery: AndroidAudioCaptureRecoveryRequest? = null
    private var recoveryGeneration = 0L
    private var consecutiveRecoveryFailures = 0
    private var retryAfterMs = 0L
    private var zeroReadStartedAtMs = 0L

    @Synchronized
    fun activate(initialRouteId: Int? = null, capturing: Boolean = true) {
        invalidatePendingLocked()
        active = true
        clientSilenced = false
        policySilenced = false
        routeInitialized = initialRouteId != null
        routedDeviceId = initialRouteId
        status = if (capturing) "capturing" else "recovering"
        lifecycleEventCount = 0L
        routeChangeCount = 0L
        interruptionCount = 0L
        recoveryCount = 0L
        recoveryFailureCount = 0L
        unrecoveredEventCount = 0L
        lastRecoveryReason = ""
        lastRecoveryAt = 0L
        consecutiveRecoveryFailures = 0
        retryAfterMs = 0L
        zeroReadStartedAtMs = 0L
    }

    @Synchronized
    fun deactivate() {
        active = false
        clientSilenced = false
        policySilenced = false
        invalidatePendingLocked()
        retryAfterMs = 0L
        zeroReadStartedAtMs = 0L
        if (status != "failed") status = "stopped"
    }

    @Synchronized
    fun requestInitialCapture(): AndroidAudioCaptureRecoveryRequest? {
        if (!active || status == "failed" || isSilencedLocked()) return null
        return requestRecoveryLocked("capture-start", replacePending = false)
    }

    @Synchronized
    fun recordRoute(routeId: Int?): AndroidAudioCaptureRecoveryRequest? {
        if (!active || status == "failed") return null
        if (!routeInitialized) {
            if (routeId != null) {
                routeInitialized = true
                routedDeviceId = routeId
            }
            return null
        }
        if (routeId == routedDeviceId) return null

        routedDeviceId = routeId
        lifecycleEventCount += 1L
        routeChangeCount += 1L
        unrecoveredEventCount += 1L
        lastRecoveryReason = "capture-route-changed"
        return if (isSilencedLocked()) {
            null
        } else {
            requestRecoveryLocked("capture-route-changed", replacePending = true)
        }
    }

    @Synchronized
    fun recordSilenced(isSilenced: Boolean): AndroidAudioCaptureRecoveryRequest? {
        if (!active || status == "failed") return null
        if (clientSilenced == isSilenced) return null
        clientSilenced = isSilenced
        lifecycleEventCount += 1L
        zeroReadStartedAtMs = 0L
        return if (isSilenced) {
            interruptionCount += 1L
            unrecoveredEventCount += 1L
            lastRecoveryReason = "capture-silenced"
            invalidatePendingLocked()
            retryAfterMs = 0L
            status = if (policySilenced) "policy-silenced" else "silenced"
            null
        } else if (policySilenced) {
            status = "policy-silenced"
            null
        } else {
            requestRecoveryLocked("capture-unsilenced", replacePending = true)
        }
    }

    @Synchronized
    fun recordPolicySilenced(isSilenced: Boolean): AndroidAudioCaptureRecoveryRequest? {
        if (!active || status == "failed") return null
        if (policySilenced == isSilenced) return null
        policySilenced = isSilenced
        lifecycleEventCount += 1L
        zeroReadStartedAtMs = 0L
        return if (isSilenced) {
            interruptionCount += 1L
            unrecoveredEventCount += 1L
            lastRecoveryReason = "capture-policy-silenced"
            invalidatePendingLocked()
            retryAfterMs = 0L
            status = "policy-silenced"
            null
        } else if (clientSilenced) {
            status = "silenced"
            null
        } else {
            requestRecoveryLocked("capture-policy-unsilenced", replacePending = true)
        }
    }

    @Synchronized
    fun recordReadResult(bytesRead: Int): AndroidAudioCaptureRecoveryRequest? {
        if (!active || status == "failed") return null
        if (bytesRead > 0) {
            zeroReadStartedAtMs = 0L
            if (!isSilencedLocked() && pendingRecovery == null) status = "capturing"
            return pendingRecovery
        }
        if (bytesRead == -2) {
            recordFatalLocked("capture-bad-value")
            return null
        }
        if (bytesRead < 0) {
            return recordInterruptionLocked(readFailureReason(bytesRead))
        }
        if (isSilencedLocked()) {
            zeroReadStartedAtMs = 0L
            return pendingRecovery
        }

        val now = monotonicNowMs()
        if (zeroReadStartedAtMs == 0L) {
            zeroReadStartedAtMs = now.coerceAtLeast(1L)
            return pendingRecovery
        }
        if (now - zeroReadStartedAtMs >= ZERO_READ_STALL_MS) {
            return recordInterruptionLocked("capture-zero-read-stall")
        }
        return pendingRecovery
    }

    @Synchronized
    fun recordReadException(): AndroidAudioCaptureRecoveryRequest? =
        recordInterruptionLocked("capture-read-exception")

    @Synchronized
    fun recordStopped(): AndroidAudioCaptureRecoveryRequest? =
        recordInterruptionLocked("capture-stopped")

    @Synchronized
    fun recordInitializationFailure(): AndroidAudioCaptureRecoveryRequest? =
        recordInterruptionLocked("capture-initialization-failed")

    @Synchronized
    fun recordFatal(reason: String): Boolean {
        if (!active || status == "failed") return false
        recordFatalLocked(reason)
        return true
    }

    @Synchronized
    fun pendingRecovery(): AndroidAudioCaptureRecoveryRequest? {
        if (!active || status == "failed" || isSilencedLocked()) return null
        if (monotonicNowMs() < retryAfterMs) return null
        return pendingRecovery
    }

    @Synchronized
    fun recordRecoverySuccess(
        request: AndroidAudioCaptureRecoveryRequest,
        routeId: Int? = null
    ): Boolean {
        if (
            !active ||
            status == "failed" ||
            isSilencedLocked() ||
            pendingRecovery?.generation != request.generation
        ) {
            return false
        }
        pendingRecovery = null
        retryAfterMs = 0L
        consecutiveRecoveryFailures = 0
        zeroReadStartedAtMs = 0L
        status = "capturing"
        if (routeId != null) {
            routeInitialized = true
            routedDeviceId = routeId
        }
        recoveryCount += 1L
        unrecoveredEventCount = 0L
        lastRecoveryReason = request.reason
        lastRecoveryAt = wallClockNowMs()
        return true
    }

    @Synchronized
    fun recordRecoveryFailure(request: AndroidAudioCaptureRecoveryRequest): Long {
        if (
            !active ||
            status == "failed" ||
            pendingRecovery?.generation != request.generation
        ) {
            return 0L
        }
        consecutiveRecoveryFailures += 1
        recoveryFailureCount += 1L
        lastRecoveryReason = request.reason
        lastRecoveryAt = wallClockNowMs()
        if (consecutiveRecoveryFailures >= maxConsecutiveRecoveryFailures) {
            recordFatalLocked("capture-recovery-circuit-open")
            return 0L
        }

        val exponent = (consecutiveRecoveryFailures - 1).coerceAtMost(4)
        val retryDelayMs = (BASE_RETRY_DELAY_MS shl exponent).coerceAtMost(MAX_RETRY_DELAY_MS)
        retryAfterMs = monotonicNowMs() + retryDelayMs
        status = "recovering"
        return retryDelayMs
    }

    @Synchronized
    fun snapshot(): AndroidAudioCaptureRecoverySnapshot = AndroidAudioCaptureRecoverySnapshot(
        status = status,
        lifecycleEventCount = lifecycleEventCount,
        routeChangeCount = routeChangeCount,
        interruptionCount = interruptionCount,
        recoveryCount = recoveryCount,
        recoveryFailureCount = recoveryFailureCount,
        unrecoveredEventCount = unrecoveredEventCount,
        lastRecoveryReason = lastRecoveryReason,
        lastRecoveryAt = lastRecoveryAt,
        suspended = active && status != "failed" && (isSilencedLocked() || pendingRecovery != null)
    )

    private fun recordInterruptionLocked(reason: String): AndroidAudioCaptureRecoveryRequest? {
        if (!active || status == "failed") return null
        if (pendingRecovery?.reason == reason) return pendingRecovery
        clientSilenced = false
        lifecycleEventCount += 1L
        interruptionCount += 1L
        unrecoveredEventCount += 1L
        zeroReadStartedAtMs = 0L
        if (policySilenced) {
            invalidatePendingLocked()
            lastRecoveryReason = reason
            status = "policy-silenced"
            return null
        }
        return requestRecoveryLocked(reason, replacePending = true)
    }

    private fun requestRecoveryLocked(
        reason: String,
        replacePending: Boolean
    ): AndroidAudioCaptureRecoveryRequest {
        if (!replacePending) pendingRecovery?.let { return it }
        recoveryGeneration = nextGeneration(recoveryGeneration)
        return AndroidAudioCaptureRecoveryRequest(recoveryGeneration, reason).also { request ->
            pendingRecovery = request
            retryAfterMs = 0L
            lastRecoveryReason = reason
            status = "recovering"
        }
    }

    private fun recordFatalLocked(reason: String) {
        invalidatePendingLocked()
        retryAfterMs = 0L
        zeroReadStartedAtMs = 0L
        lastRecoveryReason = reason
        lastRecoveryAt = wallClockNowMs()
        status = "failed"
    }

    private fun invalidatePendingLocked() {
        recoveryGeneration = nextGeneration(recoveryGeneration)
        pendingRecovery = null
    }

    private fun isSilencedLocked(): Boolean = clientSilenced || policySilenced

    private fun readFailureReason(bytesRead: Int): String = when (bytesRead) {
        -6 -> "capture-dead-object"
        -3 -> "capture-invalid-operation"
        else -> "capture-read-failed"
    }

    private fun nextGeneration(current: Long): Long = if (current == Long.MAX_VALUE) 1L else current + 1L
}
