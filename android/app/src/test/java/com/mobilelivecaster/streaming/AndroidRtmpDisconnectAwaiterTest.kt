package com.mobilelivecaster.streaming

import com.pedro.rtmp.rtmp.RtmpClient
import java.lang.reflect.InvocationTargetException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.locks.LockSupport
import kotlin.coroutines.Continuation
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class AndroidRtmpDisconnectAwaiterTest {
    @Test
    fun `pinned RootEncoder exposes the awaited disconnect contract`() {
        val method = resolveRootEncoderAwaitedDisconnectMethod()

        assertEquals("disconnect", method.name)
        assertEquals(RtmpClient::class.java, method.declaringClass)
        assertEquals(Boolean::class.javaPrimitiveType, method.parameterTypes[0])
        assertEquals(Continuation::class.java, method.parameterTypes[1])
        assertTrue(method.isAccessible)
    }

    @Test
    fun `reflected suspend invocation waits for asynchronous completion`() = runBlocking {
        val owner = TestSuspendOwner()
        val method = TestSuspendOwner::class.java.getDeclaredMethod(
            "complete",
            Boolean::class.javaPrimitiveType,
            Continuation::class.java
        ).apply {
            isAccessible = true
        }

        invokeReflectedSuspendMethod(owner, method, true)

        assertTrue(owner.completed)
    }

    @Test
    fun `reflected suspend invocation unwraps asynchronous owner failures`() = runBlocking {
        val owner = TestSuspendOwner()
        val method = TestSuspendOwner::class.java.getDeclaredMethod(
            "failAfterSuspension",
            Continuation::class.java
        ).apply {
            isAccessible = true
        }

        try {
            invokeReflectedSuspendMethod(owner, method)
            fail("Expected owner failure")
        } catch (error: IllegalStateException) {
            assertEquals("owner failed", error.message)
        }
        assertFalse(owner.completed)
    }

    @Test
    fun `reflected suspend invocation unwraps immediate reflection failures`() = runBlocking {
        val owner = TestSuspendOwner()
        val method = TestSuspendOwner::class.java.getDeclaredMethod(
            "failImmediately",
            Continuation::class.java
        ).apply {
            isAccessible = true
        }

        try {
            invokeReflectedSuspendMethod(owner, method)
            fail("Expected owner failure")
        } catch (error: IllegalArgumentException) {
            assertEquals("invalid owner", error.message)
        } catch (error: InvocationTargetException) {
            fail("InvocationTargetException was not unwrapped")
        }
    }

    @Test
    fun `native owner deadline returns after a completed operation`() {
        var completed = false

        executeAndroidNativeOwnerWithinDeadline("test owner", 1_000L) {
            completed = true
        }

        assertTrue(completed)
    }

    @Test
    fun `native owner deadline interrupts a stalled operation`() {
        val workerExited = CountDownLatch(1)
        val startedAt = System.nanoTime()

        val error = assertThrows(AndroidNativeOwnerTimeoutException::class.java) {
            executeAndroidNativeOwnerWithinDeadline("test owner", 100L) {
                try {
                    Thread.sleep(10_000L)
                } finally {
                    workerExited.countDown()
                }
            }
        }

        assertEquals("test owner exceeded 100ms", error.message)
        assertTrue(workerExited.await(1L, TimeUnit.SECONDS))
        assertTrue(System.nanoTime() - startedAt < TimeUnit.SECONDS.toNanos(2L))
    }

    @Test
    fun `native owner deadline returns when owner ignores interruption`() {
        val keepRunning = AtomicBoolean(true)
        val workerExited = CountDownLatch(1)
        val startedAt = System.nanoTime()

        try {
            assertThrows(AndroidNativeOwnerTimeoutException::class.java) {
                executeAndroidNativeOwnerWithinDeadline("uncancellable owner", 100L) {
                    try {
                        while (keepRunning.get()) {
                            Thread.interrupted()
                            LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(1L))
                        }
                    } finally {
                        workerExited.countDown()
                    }
                }
            }
            assertTrue(System.nanoTime() - startedAt < TimeUnit.SECONDS.toNanos(2L))
        } finally {
            keepRunning.set(false)
            assertTrue(workerExited.await(1L, TimeUnit.SECONDS))
        }
    }

    private class TestSuspendOwner {
        var completed = false

        private suspend fun complete(value: Boolean) {
            yield()
            completed = value
        }

        private suspend fun failAfterSuspension() {
            yield()
            throw IllegalStateException("owner failed")
        }

        @Suppress("RedundantSuspendModifier")
        private suspend fun failImmediately() {
            throw IllegalArgumentException("invalid owner")
        }
    }
}
