package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class CaptureConsentRequestGuardTest {
    @Test
    fun `stale activity result cannot complete a newer capture request`() {
        val sequence = CaptureConsentRequestSequence()
        val guard = CaptureConsentRequestGuard<String>(7400, 7402, sequence)
        val first = guard.begin("first")
        val second = guard.begin("second")
        var completedPayload: String? = null

        assertFalse(guard.complete(first.requestCode) { _, payload -> completedPayload = payload })
        assertTrue(guard.complete(second.requestCode) { _, payload -> completedPayload = payload })
        assertEquals("second", completedPayload)
    }

    @Test
    fun `cancel invalidates the active request before a delayed result`() {
        val guard = CaptureConsentRequestGuard<String>()
        val token = guard.begin("pending")

        assertEquals("pending", guard.cancel())
        assertFalse(guard.complete(token.requestCode) { _, _ -> })
        assertNull(guard.cancel())
    }

    @Test
    fun `begin if idle preserves the first pending request`() {
        val guard = CaptureConsentRequestGuard<String>()

        val first = guard.beginIfIdle("first")
        val second = guard.beginIfIdle("second")

        assertTrue(first != null)
        assertNull(second)
        assertEquals("first", guard.cancel())
    }

    @Test
    fun `completion keeps cancellation serialized until side effects finish`() {
        val guard = CaptureConsentRequestGuard<String>()
        val token = guard.begin("pending")
        val actionStarted = CountDownLatch(1)
        val allowActionToFinish = CountDownLatch(1)
        val cancelFinished = CountDownLatch(1)
        var cancelResult: String? = "not-called"
        val completionThread = Thread {
            guard.complete(token.requestCode) { _, payload ->
                assertEquals("pending", payload)
                actionStarted.countDown()
                assertTrue(allowActionToFinish.await(2, TimeUnit.SECONDS))
            }
        }
        val cancelThread = Thread {
            assertTrue(actionStarted.await(2, TimeUnit.SECONDS))
            cancelResult = guard.cancel()
            cancelFinished.countDown()
        }

        completionThread.start()
        cancelThread.start()
        assertTrue(actionStarted.await(2, TimeUnit.SECONDS))
        assertFalse(cancelFinished.await(100, TimeUnit.MILLISECONDS))
        allowActionToFinish.countDown()
        completionThread.join(2_000)
        cancelThread.join(2_000)

        assertFalse(completionThread.isAlive)
        assertFalse(cancelThread.isAlive)
        assertNull(cancelResult)
        assertNull(guard.cancel())
    }

    @Test
    fun `request codes rotate within the Android activity result range`() {
        val sequence = CaptureConsentRequestSequence()
        val guard = CaptureConsentRequestGuard<String>(12, 13, sequence)

        assertEquals(12, guard.begin("first").requestCode)
        assertEquals(13, guard.begin("second").requestCode)
        assertEquals(12, guard.begin("third").requestCode)
    }

    @Test
    fun `module guard recreation does not immediately reuse a request code`() {
        val first = CaptureConsentRequestGuard<String>().begin("first")
        val second = CaptureConsentRequestGuard<String>().begin("second")

        assertNotEquals(first.requestCode, second.requestCode)
        assertNotEquals(first.generation, second.generation)
    }
}
