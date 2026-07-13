package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
import org.junit.Test

class AndroidStreamStartGuardTest {
    @Test
    fun `allows start only when no stream or cleanup owns resources`() {
        assertEquals(
            AndroidStreamStartDisposition.ALLOW,
            resolveAndroidStreamStartDisposition(
                ownerRestartBlocked = false,
                processCleanupPending = false,
                directCleanupPending = false,
                hasDirectStream = false,
                hasGenericStream = false
            )
        )
    }

    @Test
    fun `failed native owner cleanup permanently takes precedence`() {
        assertEquals(
            AndroidStreamStartDisposition.OWNER_CLEANUP_FAILED,
            resolveAndroidStreamStartDisposition(
                ownerRestartBlocked = true,
                processCleanupPending = true,
                directCleanupPending = true,
                hasDirectStream = true,
                hasGenericStream = true
            )
        )
    }

    @Test
    fun `cleanup pending takes precedence over active state`() {
        assertEquals(
            AndroidStreamStartDisposition.CLEANUP_PENDING,
            resolveAndroidStreamStartDisposition(
                ownerRestartBlocked = false,
                processCleanupPending = false,
                directCleanupPending = true,
                hasDirectStream = true,
                hasGenericStream = true
            )
        )
    }

    @Test
    fun `process cleanup pending blocks a new service instance`() {
        assertEquals(
            AndroidStreamStartDisposition.CLEANUP_PENDING,
            resolveAndroidStreamStartDisposition(
                ownerRestartBlocked = false,
                processCleanupPending = true,
                directCleanupPending = false,
                hasDirectStream = false,
                hasGenericStream = false
            )
        )
    }

    @Test
    fun `rejects an existing direct stream`() {
        assertEquals(
            AndroidStreamStartDisposition.ALREADY_ACTIVE,
            resolveAndroidStreamStartDisposition(
                ownerRestartBlocked = false,
                processCleanupPending = false,
                directCleanupPending = false,
                hasDirectStream = true,
                hasGenericStream = false
            )
        )
    }

    @Test
    fun `rejects an existing compatibility stream`() {
        assertEquals(
            AndroidStreamStartDisposition.ALREADY_ACTIVE,
            resolveAndroidStreamStartDisposition(
                ownerRestartBlocked = false,
                processCleanupPending = false,
                directCleanupPending = false,
                hasDirectStream = false,
                hasGenericStream = true
            )
        )
    }
}
