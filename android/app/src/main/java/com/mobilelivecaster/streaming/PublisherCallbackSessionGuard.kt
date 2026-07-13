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
    private val delegate: ConnectChecker,
    private val callbackDispatcher: ((() -> Unit) -> Unit) = { callback -> callback() }
) : ConnectChecker {
    override fun onConnectionStarted(url: String) {
        dispatch { delegate.onConnectionStarted(url) }
    }

    override fun onConnectionSuccess() {
        dispatch { delegate.onConnectionSuccess() }
    }

    override fun onConnectionFailed(reason: String) {
        dispatch { delegate.onConnectionFailed(reason) }
    }

    override fun onNewBitrate(bitrate: Long) {
        dispatch { delegate.onNewBitrate(bitrate) }
    }

    override fun onDisconnect() {
        dispatch { delegate.onDisconnect() }
    }

    override fun onAuthError() {
        dispatch { delegate.onAuthError() }
    }

    override fun onAuthSuccess() {
        dispatch { delegate.onAuthSuccess() }
    }

    private fun dispatch(callback: () -> Unit) {
        callbackDispatcher {
            guard.dispatch(token, callback)
        }
    }
}
