package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AndroidNativeOwnerRestartGuardTest {
    @Test
    fun `first cleanup failure permanently blocks the process state`() {
        val state = AndroidNativeOwnerRestartGuardState()

        assertNull(state.reason())
        assertEquals("first failure", state.block("first failure"))
        assertEquals("first failure", state.block("later failure"))
        assertEquals("first failure", state.reason())
    }

    @Test
    fun `blank failure gets an actionable restart instruction`() {
        val state = AndroidNativeOwnerRestartGuardState()

        assertEquals(
            "Native stream cleanup was not confirmed. Restart MobileLiveCaster before streaming again.",
            state.block("")
        )
    }
}
