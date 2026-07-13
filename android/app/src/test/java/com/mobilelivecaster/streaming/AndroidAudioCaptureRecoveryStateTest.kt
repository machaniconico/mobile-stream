package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidAudioCaptureRecoveryStateTest {
    @Test
    fun `first routed device is a baseline and a later route requests recovery`() {
        val state = state()
        state.activate()

        assertNull(state.recordRoute(10))
        val request = checkNotNull(state.recordRoute(11))

        assertEquals("capture-route-changed", request.reason)
        assertEquals(1L, state.snapshot().routeChangeCount)
        assertEquals(1L, state.snapshot().unrecoveredEventCount)
        assertTrue(state.snapshot().suspended)
    }

    @Test
    fun `dead object requests immediate recreation`() {
        val state = state()
        state.activate(10)

        val request = checkNotNull(state.recordReadResult(-6))

        assertEquals("capture-dead-object", request.reason)
        assertEquals(request, state.pendingRecovery())
        assertEquals(1L, state.snapshot().interruptionCount)
        assertEquals(1L, state.snapshot().unrecoveredEventCount)
    }

    @Test
    fun `bad value is fatal and never schedules recreation`() {
        val state = state()
        state.activate(10)

        assertNull(state.recordReadResult(-2))

        assertEquals("failed", state.snapshot().status)
        assertEquals("capture-bad-value", state.snapshot().lastRecoveryReason)
        assertNull(state.pendingRecovery())
        assertFalse(state.snapshot().suspended)
    }

    @Test
    fun `zero reads must persist before they are treated as a stall`() {
        var monotonicMs = 3_000L
        val state = state(monotonicNowMs = { monotonicMs })
        state.activate()

        assertNull(state.recordReadResult(0))
        monotonicMs += AndroidAudioCaptureRecoveryState.ZERO_READ_STALL_MS - 1
        assertNull(state.recordReadResult(0))
        monotonicMs += 1

        assertEquals("capture-zero-read-stall", checkNotNull(state.recordReadResult(0)).reason)
    }

    @Test
    fun `successful reads clear a pending zero-read timer`() {
        var monotonicMs = 4_000L
        val state = state(monotonicNowMs = { monotonicMs })
        state.activate()

        state.recordReadResult(0)
        monotonicMs += 800L
        state.recordReadResult(4_096)
        monotonicMs += 800L

        assertNull(state.recordReadResult(0))
        assertEquals(0L, state.snapshot().interruptionCount)
    }

    @Test
    fun `client silenced capture waits and rebuilds only after unsilencing`() {
        val state = state()
        state.activate(20)

        assertNull(state.recordSilenced(true))
        assertNull(state.pendingRecovery())
        assertEquals("silenced", state.snapshot().status)
        assertTrue(state.snapshot().suspended)

        val request = checkNotNull(state.recordSilenced(false))
        assertEquals("capture-unsilenced", request.reason)
        assertEquals(request, state.pendingRecovery())
        assertEquals(1L, state.snapshot().interruptionCount)
        assertEquals(1L, state.snapshot().unrecoveredEventCount)
    }

    @Test
    fun `policy silence suppresses route recovery and normal mode requests one rebuild`() {
        val state = state()
        state.activate(20)

        assertNull(state.recordPolicySilenced(true))
        assertNull(state.recordRoute(21))
        assertNull(state.pendingRecovery())
        assertEquals("policy-silenced", state.snapshot().status)
        assertEquals(1L, state.snapshot().routeChangeCount)

        val normalModeRequest = checkNotNull(state.recordPolicySilenced(false))
        val duplicateNormalModeRequest = state.recordPolicySilenced(false)

        assertEquals("capture-policy-unsilenced", normalModeRequest.reason)
        assertNull(duplicateNormalModeRequest)
        assertEquals(normalModeRequest, state.pendingRecovery())
    }

    @Test
    fun `baseline callbacks do not reuse an existing startup recovery request`() {
        val state = state()
        state.activate(capturing = false)
        val startupRequest = checkNotNull(state.requestInitialCapture())

        assertNull(state.recordRoute(21))
        assertNull(state.recordRoute(21))
        assertNull(state.recordSilenced(false))
        assertNull(state.recordPolicySilenced(false))
        assertEquals(startupRequest, state.pendingRecovery())
    }

    @Test
    fun `dead object still forces recreation while capture is client silenced`() {
        val state = state()
        state.activate(25)
        state.recordSilenced(true)

        val request = checkNotNull(state.recordReadResult(-6))

        assertEquals("capture-dead-object", request.reason)
        assertEquals(request, state.pendingRecovery())
        assertTrue(state.snapshot().suspended)
    }

    @Test
    fun `failed recreation uses bounded exponential backoff`() {
        var monotonicMs = 6_000L
        val state = state(monotonicNowMs = { monotonicMs })
        state.activate()
        val request = checkNotNull(state.recordStopped())

        val delays = mutableListOf<Long>()
        repeat(AndroidAudioCaptureRecoveryState.MAX_CONSECUTIVE_RECOVERY_FAILURES - 1) {
            delays += state.recordRecoveryFailure(request)
            assertNull(state.pendingRecovery())
            monotonicMs += delays.last()
            assertEquals(request, state.pendingRecovery())
        }

        assertEquals(listOf(250L, 500L, 1_000L, 2_000L, 4_000L), delays)
        assertEquals(5L, state.snapshot().recoveryFailureCount)
    }

    @Test
    fun `retry limit opens circuit and leaves capture failed`() {
        var monotonicMs = 10_000L
        val state = state(
            monotonicNowMs = { monotonicMs },
            maxConsecutiveRecoveryFailures = 3
        )
        state.activate()
        val request = checkNotNull(state.recordStopped())

        assertEquals(250L, state.recordRecoveryFailure(request))
        monotonicMs += 250L
        assertEquals(500L, state.recordRecoveryFailure(request))
        monotonicMs += 500L
        assertEquals(0L, state.recordRecoveryFailure(request))

        assertEquals("failed", state.snapshot().status)
        assertEquals("capture-recovery-circuit-open", state.snapshot().lastRecoveryReason)
        assertEquals(3L, state.snapshot().recoveryFailureCount)
        assertNull(state.pendingRecovery())
    }

    @Test
    fun `recovery telemetry uses epoch wall clock instead of monotonic time`() {
        var monotonicMs = 11_000L
        var epochMs = 1_735_689_600_000L
        val state = state(
            monotonicNowMs = { monotonicMs },
            wallClockNowMs = { epochMs }
        )
        state.activate()
        val request = checkNotNull(state.recordStopped())

        val delay = state.recordRecoveryFailure(request)
        assertEquals(epochMs, state.snapshot().lastRecoveryAt)

        monotonicMs += delay
        epochMs += 25L
        assertTrue(state.recordRecoverySuccess(request, 30))
        assertEquals(epochMs, state.snapshot().lastRecoveryAt)
    }

    @Test
    fun `stale completion cannot clear a newer recovery request`() {
        val state = state()
        state.activate(30)
        val stopped = checkNotNull(state.recordStopped())
        val route = checkNotNull(state.recordRoute(31))

        assertFalse(state.recordRecoverySuccess(stopped))
        assertTrue(state.recordRecoverySuccess(route, 31))
        assertEquals(1L, state.snapshot().recoveryCount)
        assertEquals(0L, state.snapshot().unrecoveredEventCount)
        assertFalse(state.snapshot().suspended)
    }

    @Test
    fun `deactivation preserves an unresolved final event for release evidence`() {
        val state = state()
        state.activate(30)
        val recovered = checkNotNull(state.recordStopped())
        assertTrue(state.recordRecoverySuccess(recovered, 30))
        state.recordSilenced(true)

        state.deactivate()

        assertEquals("stopped", state.snapshot().status)
        assertFalse(state.snapshot().suspended)
        assertEquals(1L, state.snapshot().unrecoveredEventCount)
    }

    @Test
    fun `a successful recovery clears all unresolved events`() {
        val state = state()
        state.activate(30)
        state.recordRoute(31)
        state.recordSilenced(true)
        val request = checkNotNull(state.recordSilenced(false))

        assertEquals(2L, state.snapshot().unrecoveredEventCount)
        assertTrue(state.recordRecoverySuccess(request, 31))
        assertEquals(0L, state.snapshot().unrecoveredEventCount)
    }

    @Test
    fun `deactivate and activate invalidate requests from the previous session`() {
        val state = state()
        state.activate(30)
        val oldRequest = checkNotNull(state.recordStopped())

        state.deactivate()
        state.activate(31)
        val newRequest = checkNotNull(state.recordStopped())

        assertNotEquals(oldRequest.generation, newRequest.generation)
        assertFalse(state.recordRecoverySuccess(oldRequest))
        assertTrue(state.recordRecoverySuccess(newRequest, 31))
    }

    @Test
    fun `deactivated capture ignores late callbacks`() {
        val state = state()
        state.activate(40)
        state.deactivate()

        assertNull(state.recordRoute(41))
        assertNull(state.recordReadException())
        assertNull(state.recordSilenced(true))
        assertNull(state.recordPolicySilenced(true))
        assertEquals("stopped", state.snapshot().status)
    }

    @Test
    fun `fatal state remains observable after deactivation`() {
        val state = state()
        state.activate(40)
        state.recordFatal("capture-permission-denied")

        state.deactivate()

        assertEquals("failed", state.snapshot().status)
        assertEquals("capture-permission-denied", state.snapshot().lastRecoveryReason)
    }

    private fun state(
        monotonicNowMs: () -> Long = { 1_000L },
        wallClockNowMs: () -> Long = { 1_700_000_000_000L },
        maxConsecutiveRecoveryFailures: Int =
            AndroidAudioCaptureRecoveryState.MAX_CONSECUTIVE_RECOVERY_FAILURES
    ): AndroidAudioCaptureRecoveryState = AndroidAudioCaptureRecoveryState(
        monotonicNowMs = monotonicNowMs,
        wallClockNowMs = wallClockNowMs,
        maxConsecutiveRecoveryFailures = maxConsecutiveRecoveryFailures
    )
}
