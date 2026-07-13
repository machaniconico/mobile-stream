package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
import org.junit.Test

class MediaProjectionSessionGuardTest {
    @Test
    fun unexpectedSystemStopIsReportedOnce() {
        val guard = MediaProjectionSessionGuard()
        val token = guard.attach()

        assertEquals(MediaProjectionStopDisposition.UNEXPECTED, guard.recordStopped(token))
        assertEquals(MediaProjectionStopDisposition.STALE, guard.recordStopped(token))
    }

    @Test
    fun intentionalReleaseDoesNotBecomeAFailure() {
        val guard = MediaProjectionSessionGuard()
        val token = guard.attach()

        guard.expectStop(token)

        assertEquals(MediaProjectionStopDisposition.EXPECTED, guard.recordStopped(token))
    }

    @Test
    fun callbackFromReplacedProjectionCannotStopCurrentSession() {
        val guard = MediaProjectionSessionGuard()
        val oldToken = guard.attach()
        guard.expectStop(oldToken)
        guard.detach(oldToken)
        val currentToken = guard.attach()

        assertEquals(MediaProjectionStopDisposition.STALE, guard.recordStopped(oldToken))
        assertEquals(MediaProjectionStopDisposition.UNEXPECTED, guard.recordStopped(currentToken))
    }
}
