package com.mobilelivecaster.streaming

import com.pedro.common.ConnectChecker

internal data class PublisherCallbackSessionToken(val generation: Long)

internal data class PublisherCallbackSessionSnapshot(
    val activeGeneration: Long?,
    val ignoredStaleCallbackCount: Long
)

internal class PublisherCallbackSessionGuard {
    private val lock = Any()
    private var nextGeneration = 0L
    private var activeToken: PublisherCallbackSessionToken? = null
    private var ignoredStaleCallbackCount = 0L

    fun attach(): PublisherCallbackSessionToken = synchronized(lock) {
        nextGeneration += 1L
        PublisherCallbackSessionToken(nextGeneration).also { activeToken = it }
    }

    fun invalidate(token: PublisherCallbackSessionToken?): Boolean = synchronized(lock) {
        if (token == null || activeToken != token) {
            false
        } else {
            activeToken = null
            true
        }
    }

    fun dispatch(token: PublisherCallbackSessionToken, callback: () -> Unit): Boolean = synchronized(lock) {
        if (activeToken != token) {
            ignoredStaleCallbackCount += 1L
            false
        } else {
            callback()
            true
        }
    }

    fun snapshot(): PublisherCallbackSessionSnapshot = synchronized(lock) {
        PublisherCallbackSessionSnapshot(activeToken?.generation, ignoredStaleCallbackCount)
    }
}

internal class GenerationScopedConnectChecker(
    private val guard: PublisherCallbackSessionGuard,
    private val token: PublisherCallbackSessionToken,
    private val delegate: ConnectChecker
) : ConnectChecker {
    override fun onConnectionStarted(url: String) {
        guard.dispatch(token) { delegate.onConnectionStarted(url) }
    }

    override fun onConnectionSuccess() {
        guard.dispatch(token) { delegate.onConnectionSuccess() }
    }

    override fun onConnectionFailed(reason: String) {
        guard.dispatch(token) { delegate.onConnectionFailed(reason) }
    }

    override fun onNewBitrate(bitrate: Long) {
        guard.dispatch(token) { delegate.onNewBitrate(bitrate) }
    }

    override fun onDisconnect() {
        guard.dispatch(token) { delegate.onDisconnect() }
    }

    override fun onAuthError() {
        guard.dispatch(token) { delegate.onAuthError() }
    }

    override fun onAuthSuccess() {
        guard.dispatch(token) { delegate.onAuthSuccess() }
    }
}
