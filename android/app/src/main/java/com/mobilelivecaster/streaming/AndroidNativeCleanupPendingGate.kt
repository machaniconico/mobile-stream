package com.mobilelivecaster.streaming

internal data class AndroidNativeCleanupToken(val generation: Long)

internal class AndroidNativeCleanupPendingGateState {
    private var nextGeneration = 0L
    private val activeGenerations = mutableSetOf<Long>()

    @Synchronized
    fun begin(): AndroidNativeCleanupToken {
        val token = AndroidNativeCleanupToken(++nextGeneration)
        activeGenerations += token.generation
        return token
    }

    @Synchronized
    fun complete(token: AndroidNativeCleanupToken): Boolean =
        activeGenerations.remove(token.generation)

    @Synchronized
    fun isPending(): Boolean = activeGenerations.isNotEmpty()
}

internal object AndroidNativeCleanupPendingGate {
    private val state = AndroidNativeCleanupPendingGateState()

    fun begin(): AndroidNativeCleanupToken = state.begin()

    fun complete(token: AndroidNativeCleanupToken): Boolean = state.complete(token)

    fun isPending(): Boolean = state.isPending()
}
