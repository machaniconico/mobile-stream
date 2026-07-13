package com.mobilelivecaster.streaming

internal data class AudioMonitorRecoveryRequest(
    val generation: Long,
    val reason: String
)

internal data class AudioMonitorRecoverySnapshot(
    val lifecycleEventCount: Long = 0L,
    val routeChangeCount: Long = 0L,
    val interruptionCount: Long = 0L,
    val recoveryCount: Long = 0L,
    val recoveryFailureCount: Long = 0L,
    val lastRecoveryReason: String = "",
    val lastRecoveryAt: Long = 0L,
    val suspended: Boolean = false
)

internal class AudioMonitorRecoveryState(
    private val wallClockMs: () -> Long = System::currentTimeMillis
) {
    private enum class Trigger {
        ROUTE_CHANGE,
        INTERRUPTION
    }

    private var active = false
    private var released = false
    private var initialDeviceIds = emptySet<Int>()
    private var nextGeneration = 0L
    private var pendingRecovery: AudioMonitorRecoveryRequest? = null
    private var pendingTrigger: Trigger? = null
    private var lifecycleEventCount = 0L
    private var routeChangeCount = 0L
    private var interruptionCount = 0L
    private var recoveryCount = 0L
    private var recoveryFailureCount = 0L
    private var lastRecoveryReason = ""
    private var lastRecoveryAt = 0L
    private var suspended = false

    @Synchronized
    fun activate(connectedDeviceIds: Set<Int>) {
        if (active || released) {
            return
        }
        active = true
        initialDeviceIds = connectedDeviceIds.toSet()
        pendingRecovery = null
        pendingTrigger = null
        suspended = false
    }

    @Synchronized
    fun deactivate() {
        if (!active) {
            return
        }
        active = false
        initialDeviceIds = emptySet()
        pendingRecovery = null
        pendingTrigger = null
        suspended = false
    }

    @Synchronized
    fun release() {
        if (released) {
            return
        }
        released = true
        active = false
        initialDeviceIds = emptySet()
        pendingRecovery = null
        pendingTrigger = null
        suspended = false
    }

    @Synchronized
    fun recordAudioDevicesAdded(deviceIds: Set<Int>): AudioMonitorRecoveryRequest? {
        if (!active || deviceIds.isEmpty()) {
            return null
        }
        if (initialDeviceIds.isNotEmpty()) {
            val unexpectedDeviceIds = deviceIds - initialDeviceIds
            initialDeviceIds = initialDeviceIds - deviceIds
            if (unexpectedDeviceIds.isEmpty()) {
                return null
            }
            initialDeviceIds = emptySet()
        }
        return requestRouteRecovery("audio-device-added")
    }

    @Synchronized
    fun recordAudioDevicesRemoved(deviceIds: Set<Int>): AudioMonitorRecoveryRequest? {
        if (!active || deviceIds.isEmpty()) {
            return null
        }
        initialDeviceIds = emptySet()
        return requestRouteRecovery("audio-device-removed")
    }

    @Synchronized
    fun recordObservedOutputDeviceChange(
        reason: String = "output-device-changed"
    ): AudioMonitorRecoveryRequest? {
        if (!active) {
            return null
        }
        if (pendingRecovery != null && pendingTrigger == Trigger.ROUTE_CHANGE) {
            return pendingRecovery
        }
        return requestRouteRecovery(reason)
    }

    @Synchronized
    fun recordInterruption(reason: String): AudioMonitorRecoveryRequest? {
        if (!active) {
            return null
        }
        if (pendingRecovery != null && pendingTrigger == Trigger.INTERRUPTION) {
            return pendingRecovery
        }
        lifecycleEventCount += 1L
        interruptionCount += 1L
        return requestRecovery(reason, Trigger.INTERRUPTION)
    }

    @Synchronized
    fun pendingRecovery(): AudioMonitorRecoveryRequest? = pendingRecovery

    @Synchronized
    fun recordRecoverySuccess(request: AudioMonitorRecoveryRequest): Boolean {
        if (!active || pendingRecovery?.generation != request.generation) {
            return false
        }
        recoveryCount += 1L
        lastRecoveryReason = request.reason
        lastRecoveryAt = wallClockMs()
        pendingRecovery = null
        pendingTrigger = null
        suspended = false
        return true
    }

    @Synchronized
    fun recordRecoveryFailure(request: AudioMonitorRecoveryRequest): Boolean {
        if (!active || pendingRecovery?.generation != request.generation) {
            return false
        }
        recoveryFailureCount += 1L
        lastRecoveryReason = request.reason
        lastRecoveryAt = wallClockMs()
        suspended = true
        return true
    }

    @Synchronized
    fun markUnavailable() {
        if (active) {
            suspended = true
        }
    }

    @Synchronized
    fun markAvailableWithoutRecovery() {
        if (active && pendingRecovery == null) {
            suspended = false
        }
    }

    @Synchronized
    fun snapshot(): AudioMonitorRecoverySnapshot = AudioMonitorRecoverySnapshot(
        lifecycleEventCount = lifecycleEventCount,
        routeChangeCount = routeChangeCount,
        interruptionCount = interruptionCount,
        recoveryCount = recoveryCount,
        recoveryFailureCount = recoveryFailureCount,
        lastRecoveryReason = lastRecoveryReason,
        lastRecoveryAt = lastRecoveryAt,
        suspended = suspended
    )

    private fun requestRouteRecovery(reason: String): AudioMonitorRecoveryRequest {
        lifecycleEventCount += 1L
        routeChangeCount += 1L
        return requestRecovery(reason, Trigger.ROUTE_CHANGE)
    }

    private fun requestRecovery(reason: String, trigger: Trigger): AudioMonitorRecoveryRequest {
        nextGeneration += 1L
        return AudioMonitorRecoveryRequest(nextGeneration, reason).also { request ->
            pendingRecovery = request
            pendingTrigger = trigger
            suspended = true
        }
    }
}
