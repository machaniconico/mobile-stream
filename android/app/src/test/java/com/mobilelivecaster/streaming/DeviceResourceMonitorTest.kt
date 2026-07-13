package com.mobilelivecaster.streaming

import android.app.ActivityManager
import org.junit.Assert.assertEquals
import org.junit.Test

class DeviceResourceMonitorTest {
    @Test
    fun classifyMemoryTelemetryReturnsUnknownForInvalidValues() {
        assertEquals(MemoryTelemetry(), classifyMemoryTelemetry(-1, 1, lowMemory = false))
        assertEquals(MemoryTelemetry(), classifyMemoryTelemetry(1, -1, lowMemory = false))
    }

    @Test
    fun classifyMemoryTelemetryReturnsCriticalWhenLowMemoryOrAtThreshold() {
        assertEquals(
            MemoryTelemetry(
                memoryPressureState = "critical",
                availableMemoryBytes = 512,
                memoryThresholdBytes = 256
            ),
            classifyMemoryTelemetry(512, 256, lowMemory = true)
        )
        assertEquals(
            MemoryTelemetry(
                memoryPressureState = "critical",
                availableMemoryBytes = 256,
                memoryThresholdBytes = 256
            ),
            classifyMemoryTelemetry(256, 256, lowMemory = false)
        )
    }

    @Test
    fun classifyMemoryTelemetryReturnsWarningWithinTwiceThresholdWithoutOverflow() {
        assertEquals(
            MemoryTelemetry(
                memoryPressureState = "warning",
                availableMemoryBytes = 513,
                memoryThresholdBytes = 257
            ),
            classifyMemoryTelemetry(513, 257, lowMemory = false)
        )
        assertEquals(
            MemoryTelemetry(
                memoryPressureState = "warning",
                availableMemoryBytes = Long.MAX_VALUE,
                memoryThresholdBytes = (Long.MAX_VALUE / 2) + 1
            ),
            classifyMemoryTelemetry(Long.MAX_VALUE, (Long.MAX_VALUE / 2) + 1, lowMemory = false)
        )
    }

    @Test
    fun classifyMemoryTelemetryReturnsNormalAboveWarningBand() {
        assertEquals(
            MemoryTelemetry(
                memoryPressureState = "normal",
                availableMemoryBytes = 1_024,
                memoryThresholdBytes = 256
            ),
            classifyMemoryTelemetry(1_024, 256, lowMemory = false)
        )
    }

    @Test
    fun sampleMemoryTelemetryReadsActivityManagerMemoryInfo() {
        val info = ActivityManager.MemoryInfo().apply {
            availMem = 700
            threshold = 400
            lowMemory = false
        }

        assertEquals(
            MemoryTelemetry(
                memoryPressureState = "warning",
                availableMemoryBytes = 700,
                memoryThresholdBytes = 400
            ),
            sampleMemoryTelemetry(info)
        )
    }

    @Test
    fun sampleMemoryTelemetryReturnsUnknownWhenActivityManagerIsUnavailable() {
        assertEquals(MemoryTelemetry(), sampleMemoryTelemetry(null))
    }
}
