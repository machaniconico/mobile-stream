package com.mobilelivecaster.streaming

internal enum class AndroidStreamStartDisposition {
    ALLOW,
    OWNER_CLEANUP_FAILED,
    CLEANUP_PENDING,
    ALREADY_ACTIVE
}

internal fun resolveAndroidStreamStartDisposition(
    ownerRestartBlocked: Boolean,
    processCleanupPending: Boolean,
    directCleanupPending: Boolean,
    hasDirectStream: Boolean,
    hasGenericStream: Boolean
): AndroidStreamStartDisposition = when {
    ownerRestartBlocked -> AndroidStreamStartDisposition.OWNER_CLEANUP_FAILED
    processCleanupPending || directCleanupPending -> AndroidStreamStartDisposition.CLEANUP_PENDING
    hasDirectStream || hasGenericStream -> AndroidStreamStartDisposition.ALREADY_ACTIVE
    else -> AndroidStreamStartDisposition.ALLOW
}
