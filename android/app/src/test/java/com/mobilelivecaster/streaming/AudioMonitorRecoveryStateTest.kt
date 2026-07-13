package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class AudioMonitorRecoveryStateTest {
    @Test
    fun `initial connected-device callback does not create a false recovery`() {
        val state = AudioMonitorRecoveryState { 1_000L }
        state.activate(setOf(10, 11))

        assertNull(state.recordAudioDevicesAdded(setOf(10, 11)))
        state.markAvailableWithoutRecovery()

        assertEquals(AudioMonitorRecoverySnapshot(), state.snapshot())
    }

    @Test
    fun `split initial-device callbacks do not create a false recovery`() {
        val state = AudioMonitorRecoveryState()
        state.activate(setOf(10, 11))

        assertNull(state.recordAudioDevicesAdded(setOf(10)))
        assertNull(state.recordAudioDevicesAdded(setOf(11)))

        assertEquals(AudioMonitorRecoverySnapshot(), state.snapshot())
    }

    @Test
    fun `new device requests recovery and records success`() {
        var nowMs = 1_000L
        val state = AudioMonitorRecoveryState { nowMs }
        state.activate(setOf(10))
        state.recordAudioDevicesAdded(setOf(10))

        val request = checkNotNull(state.recordAudioDevicesAdded(setOf(12)))
        assertEquals("audio-device-added", request.reason)
        assertTrue(state.snapshot().suspended)

        nowMs = 1_250L
        assertTrue(state.recordRecoverySuccess(request))
        assertEquals(
            AudioMonitorRecoverySnapshot(
                lifecycleEventCount = 1L,
                routeChangeCount = 1L,
                recoveryCount = 1L,
                lastRecoveryReason = "audio-device-added",
                lastRecoveryAt = 1_250L
            ),
            state.snapshot()
        )
    }

    @Test
    fun `stale recovery completion cannot clear a newer route change`() {
        val state = AudioMonitorRecoveryState { 2_000L }
        state.activate(emptySet())
        val added = checkNotNull(state.recordAudioDevicesAdded(setOf(20)))
        val removed = checkNotNull(state.recordAudioDevicesRemoved(setOf(20)))

        assertFalse(state.recordRecoverySuccess(added))
        assertEquals(removed, state.pendingRecovery())
        assertTrue(state.recordRecoverySuccess(removed))
        assertEquals(2L, state.snapshot().routeChangeCount)
        assertEquals(1L, state.snapshot().recoveryCount)
    }

    @Test
    fun `stopped track remains suspended across failure and then recovers`() {
        var nowMs = 3_000L
        val state = AudioMonitorRecoveryState { nowMs }
        state.activate(emptySet())

        val request = checkNotNull(state.recordInterruption("audio-track-stopped"))
        assertSame(request, state.recordInterruption("audio-track-stopped"))
        assertEquals(1L, state.snapshot().interruptionCount)

        assertTrue(state.recordRecoveryFailure(request))
        assertEquals(1L, state.snapshot().recoveryFailureCount)
        assertTrue(state.snapshot().suspended)

        nowMs = 3_500L
        assertTrue(state.recordRecoverySuccess(request))
        val snapshot = state.snapshot()
        assertEquals(1L, snapshot.recoveryCount)
        assertEquals("audio-track-stopped", snapshot.lastRecoveryReason)
        assertEquals(3_500L, snapshot.lastRecoveryAt)
        assertFalse(snapshot.suspended)
    }

    @Test
    fun `observed route change does not duplicate a callback recovery request`() {
        val state = AudioMonitorRecoveryState()
        state.activate(emptySet())
        val callbackRequest = checkNotNull(state.recordAudioDevicesAdded(setOf(30)))

        assertSame(callbackRequest, state.recordObservedOutputDeviceChange())
        assertEquals(1L, state.snapshot().routeChangeCount)
    }

    @Test
    fun `disable and release are idempotent and ignore later callbacks`() {
        val state = AudioMonitorRecoveryState()
        state.activate(emptySet())
        state.recordAudioDevicesAdded(setOf(40))

        state.deactivate()
        state.deactivate()
        assertNull(state.pendingRecovery())
        assertFalse(state.snapshot().suspended)

        state.activate(setOf(40))
        state.release()
        state.release()
        assertNull(state.recordAudioDevicesRemoved(setOf(40)))
        assertEquals(1L, state.snapshot().lifecycleEventCount)
        assertEquals(1L, state.snapshot().routeChangeCount)
    }
}
