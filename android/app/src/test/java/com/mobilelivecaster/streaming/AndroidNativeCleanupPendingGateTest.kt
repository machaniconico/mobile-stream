package com.mobilelivecaster.streaming

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidNativeCleanupPendingGateTest {
    @Test
    fun `cleanup stays pending until every active owner completes`() {
        val state = AndroidNativeCleanupPendingGateState()
        val first = state.begin()
        val second = state.begin()

        assertNotEquals(first, second)
        assertTrue(state.isPending())
        assertTrue(state.complete(first))
        assertTrue(state.isPending())
        assertTrue(state.complete(second))
        assertFalse(state.isPending())
    }

    @Test
    fun `stale completion cannot clear a newer cleanup generation`() {
        val state = AndroidNativeCleanupPendingGateState()
        val stale = state.begin()

        assertTrue(state.complete(stale))
        val current = state.begin()

        assertFalse(state.complete(stale))
        assertTrue(state.isPending())
        assertTrue(state.complete(current))
        assertFalse(state.isPending())
    }
}
