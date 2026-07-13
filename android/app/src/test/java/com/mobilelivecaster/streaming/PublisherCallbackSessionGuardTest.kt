package com.mobilelivecaster.streaming

import com.pedro.common.ConnectChecker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PublisherCallbackSessionGuardTest {
    @Test
    fun `callbacks from a replaced publisher generation are ignored`() {
        val guard = PublisherCallbackSessionGuard()
        val delegate = RecordingConnectChecker()
        val first = GenerationScopedConnectChecker(guard, guard.attach(), delegate)
        val secondToken = guard.attach()
        val second = GenerationScopedConnectChecker(guard, secondToken, delegate)

        first.onConnectionStarted("rtmps://stale.example/live")
        first.onConnectionSuccess()
        first.onConnectionFailed("stale failure")
        first.onNewBitrate(9_000_000L)
        first.onDisconnect()
        first.onAuthError()
        first.onAuthSuccess()

        assertEquals(0, delegate.callbackCount)
        assertEquals(7L, guard.snapshot().ignoredStaleCallbackCount)

        second.onConnectionStarted("rtmps://current.example/live")
        second.onConnectionSuccess()
        second.onNewBitrate(4_500_000L)
        second.onAuthSuccess()

        assertEquals(4, delegate.callbackCount)
        assertEquals(secondToken.generation, guard.snapshot().activeGeneration)
    }

    @Test
    fun `teardown invalidation blocks disconnect and auth callbacks`() {
        val guard = PublisherCallbackSessionGuard()
        val delegate = RecordingConnectChecker()
        val token = guard.attach()
        val checker = GenerationScopedConnectChecker(guard, token, delegate)

        assertTrue(guard.invalidate(token))
        assertFalse(guard.invalidate(token))
        checker.onDisconnect()
        checker.onAuthError()
        checker.onConnectionSuccess()

        assertEquals(0, delegate.callbackCount)
        assertNull(guard.snapshot().activeGeneration)
        assertEquals(3L, guard.snapshot().ignoredStaleCallbackCount)
    }

    @Test
    fun `callback can invalidate its own generation without admitting nested teardown events`() {
        val guard = PublisherCallbackSessionGuard()
        lateinit var checker: GenerationScopedConnectChecker
        val token = guard.attach()
        val delegate = object : RecordingConnectChecker() {
            override fun onAuthError() {
                super.onAuthError()
                guard.invalidate(token)
                checker.onDisconnect()
            }
        }
        checker = GenerationScopedConnectChecker(guard, token, delegate)

        checker.onAuthError()

        assertEquals(1, delegate.callbackCount)
        assertEquals(1L, guard.snapshot().ignoredStaleCallbackCount)
    }

    @Test
    fun `deferred callbacks recheck their generation when the dispatcher executes`() {
        val guard = PublisherCallbackSessionGuard()
        val delegate = RecordingConnectChecker()
        val token = guard.attach()
        val pending = mutableListOf<() -> Unit>()
        val checker = GenerationScopedConnectChecker(guard, token, delegate) { callback ->
            pending += callback
        }

        checker.onConnectionSuccess()
        assertEquals(0, delegate.callbackCount)
        assertTrue(guard.invalidate(token))

        pending.single().invoke()

        assertEquals(0, delegate.callbackCount)
        assertEquals(1L, guard.snapshot().ignoredStaleCallbackCount)
    }

    private open class RecordingConnectChecker : ConnectChecker {
        var callbackCount = 0

        override fun onConnectionStarted(url: String) {
            callbackCount += 1
        }

        override fun onConnectionSuccess() {
            callbackCount += 1
        }

        override fun onConnectionFailed(reason: String) {
            callbackCount += 1
        }

        override fun onNewBitrate(bitrate: Long) {
            callbackCount += 1
        }

        override fun onDisconnect() {
            callbackCount += 1
        }

        override fun onAuthError() {
            callbackCount += 1
        }

        override fun onAuthSuccess() {
            callbackCount += 1
        }
    }
}
