package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidVideoFrameCadenceTest {
    @Test
    fun `renders immediately and then holds the configured frame rate`() {
        val cadence = AndroidVideoFrameCadence(fps = 30, startNanos = 1_000_000_000L)

        assertTrue(cadence.shouldRender(1_000_000_000L))
        cadence.advanceAfterRender(1_000_000_000L)

        assertFalse(cadence.shouldRender(1_033_333_332L))
        assertTrue(cadence.shouldRender(1_033_333_333L))
        assertEquals(10_000L, cadence.encoderDrainTimeoutUs(1_000_000_000L, 10_000L))
    }

    @Test
    fun `skips missed deadlines instead of emitting a burst of catch-up frames`() {
        val cadence = AndroidVideoFrameCadence(fps = 60, startNanos = 0L)

        cadence.advanceAfterRender(100_000_000L)

        assertFalse(cadence.shouldRender(100_000_000L))
        assertTrue(cadence.encoderDrainTimeoutUs(100_000_000L, 10_000L) > 0L)
    }

    @Test
    fun `rejects frame rates outside the native encoder contract`() {
        assertThrows(IllegalArgumentException::class.java) {
            AndroidVideoFrameCadence(fps = 0, startNanos = 0L)
        }
        assertThrows(IllegalArgumentException::class.java) {
            AndroidVideoFrameCadence(fps = 121, startNanos = 0L)
        }
    }
}
