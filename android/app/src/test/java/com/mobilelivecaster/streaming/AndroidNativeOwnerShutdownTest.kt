package com.mobilelivecaster.streaming

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.locks.LockSupport
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class AndroidNativeOwnerShutdownTest {
    @Test
    fun `worker wait returns at deadline when a worker does not stop`() {
        val keepRunning = AtomicBoolean(true)
        val started = CountDownLatch(1)
        val worker = Thread {
            started.countDown()
            while (keepRunning.get()) {
                Thread.interrupted()
                LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(1L))
            }
        }.apply {
            isDaemon = true
            start()
        }

        try {
            assertTrue(started.await(1L, TimeUnit.SECONDS))
            val startedAt = System.nanoTime()
            val stopped = awaitAndroidWorkerThreadsUntil(
                listOf(worker),
                startedAt + TimeUnit.MILLISECONDS.toNanos(100L)
            )

            assertFalse(stopped)
            assertTrue(System.nanoTime() - startedAt < TimeUnit.SECONDS.toNanos(2L))
        } finally {
            keepRunning.set(false)
            worker.interrupt()
            worker.join(1_000L)
        }
    }

    @Test
    fun `native owner release records failure and still attempts later steps`() {
        val state = AndroidNativeOwnerReleaseState()
        val failure = IllegalStateException("release failed")
        var finalStepRan = false

        state.execute(
            { throw failure },
            { finalStepRan = true }
        )

        assertSame(failure, state.failure())
        assertTrue(finalStepRan)
    }

    @Test
    fun `native owner release rethrows fatal error after all steps`() {
        val state = AndroidNativeOwnerReleaseState()
        val fatal = AssertionError("fatal release")
        var finalStepRan = false

        try {
            state.execute(
                { throw fatal },
                { finalStepRan = true }
            )
            fail("Expected fatal release error")
        } catch (error: AssertionError) {
            assertSame(fatal, error)
        }

        assertSame(fatal, state.failure())
        assertTrue(finalStepRan)
    }

    @Test
    fun `release returns immediately after first success`() {
        var releaseCount = 0
        val failures = mutableListOf<String>()

        val released = releaseNativeOwnerWithRetry(
            ownerName = "test owner",
            release = { releaseCount += 1 },
            onFailure = failures::add,
            retryDelayMillis = 0L
        )

        assertEquals(true, released)
        assertEquals(1, releaseCount)
        assertEquals(emptyList<String>(), failures)
    }

    @Test
    fun `release retries without reporting completion after failures`() {
        var releaseCount = 0
        val failures = mutableListOf<String>()

        val released = releaseNativeOwnerWithRetry(
            ownerName = "test owner",
            release = {
                releaseCount += 1
                if (releaseCount < 3) throw IllegalStateException("busy")
            },
            onFailure = failures::add,
            retryDelayMillis = 0L
        )

        assertEquals(true, released)
        assertEquals(3, releaseCount)
        assertEquals(
            listOf(
                "test owner release failed (attempt 1/3): busy",
                "test owner release failed (attempt 2/3): busy"
            ),
            failures
        )
    }

    @Test
    fun `release returns failure after a bounded number of permanent failures`() {
        var releaseCount = 0
        val failures = mutableListOf<String>()

        val released = releaseNativeOwnerWithRetry(
            ownerName = "test owner",
            release = {
                releaseCount += 1
                throw IllegalStateException("permanent")
            },
            onFailure = failures::add,
            maxAttempts = 2,
            retryDelayMillis = 0L
        )

        assertEquals(false, released)
        assertEquals(2, releaseCount)
        assertEquals(
            listOf(
                "test owner release failed (attempt 1/2): permanent",
                "test owner release failed (attempt 2/2, exhausted): permanent"
            ),
            failures
        )
    }

    @Test
    fun `release timeout does not overlap another owner attempt`() {
        var releaseCount = 0
        val failures = mutableListOf<String>()

        val released = releaseNativeOwnerWithRetry(
            ownerName = "test owner",
            release = {
                releaseCount += 1
                throw AndroidNativeOwnerTimeoutException("test owner exceeded 100ms")
            },
            onFailure = failures::add,
            retryDelayMillis = 0L
        )

        assertFalse(released)
        assertEquals(1, releaseCount)
        assertEquals(
            "test owner release timed out (attempt 1/3): test owner exceeded 100ms",
            failures.single()
        )
    }

    @Test(expected = AssertionError::class)
    fun `release does not catch fatal errors`() {
        releaseNativeOwnerWithRetry(
            ownerName = "test owner",
            release = { throw AssertionError("fatal") },
            onFailure = {},
            retryDelayMillis = 0L
        )
    }

    @Test
    fun `release interruption restores the flag and stops retrying`() {
        var releaseCount = 0
        val failures = mutableListOf<String>()

        try {
            val released = releaseNativeOwnerWithRetry(
                ownerName = "test owner",
                release = {
                    releaseCount += 1
                    throw InterruptedException("cancelled")
                },
                onFailure = failures::add,
                retryDelayMillis = 0L
            )

            assertFalse(released)
            assertEquals(1, releaseCount)
            assertEquals("test owner release interrupted (attempt 1/3): cancelled", failures.single())
            assertTrue(Thread.currentThread().isInterrupted)
        } finally {
            Thread.interrupted()
        }
    }

    @Test
    fun `cleanup outcomes distinguish released exhausted and fatal states`() {
        assertTrue(AndroidDirectStreamCleanupResult.released().released)
        assertEquals(
            AndroidDirectStreamCleanupDisposition.EXHAUSTED,
            AndroidDirectStreamCleanupResult.exhausted("timeout").disposition
        )
        assertEquals(
            AndroidDirectStreamCleanupDisposition.FATAL,
            AndroidDirectStreamCleanupResult.fatal("fatal").disposition
        )
    }
}
