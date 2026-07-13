package com.mobilelivecaster.streaming

import java.util.concurrent.atomic.AtomicReference

internal class AndroidNativeOwnerRestartGuardState {
    private val blockedReason = AtomicReference<String?>(null)

    fun block(reason: String): String {
        val normalized = reason.ifBlank {
            "Native stream cleanup was not confirmed. Restart MobileLiveCaster before streaming again."
        }.take(240)
        blockedReason.compareAndSet(null, normalized)
        return blockedReason.get() ?: normalized
    }

    fun reason(): String? = blockedReason.get()
}

internal object AndroidNativeOwnerRestartGuard {
    private val state = AndroidNativeOwnerRestartGuardState()

    fun block(reason: String): String = state.block(reason)

    fun reason(): String? = state.reason()
}
