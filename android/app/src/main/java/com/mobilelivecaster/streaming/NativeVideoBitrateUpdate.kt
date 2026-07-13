package com.mobilelivecaster.streaming

internal data class NativeVideoBitrateUpdateResult(
    val bitrateApplied: Boolean,
    val bitrateFailure: Throwable? = null,
    val ancillaryFailure: Throwable? = null,
    val trackerAccepted: Boolean = true
)

internal fun executeNativeVideoBitrateUpdate(
    applyBitrate: () -> Unit,
    afterBitrateApplied: () -> Unit = {}
): NativeVideoBitrateUpdateResult {
    runCatching(applyBitrate).onFailure { error ->
        return NativeVideoBitrateUpdateResult(
            bitrateApplied = false,
            bitrateFailure = error
        )
    }
    val ancillaryFailure = runCatching(afterBitrateApplied).exceptionOrNull()
    return NativeVideoBitrateUpdateResult(
        bitrateApplied = true,
        ancillaryFailure = ancillaryFailure
    )
}

internal fun executeTrackedNativeVideoBitrateUpdate(
    targetKbps: Int,
    tracker: LiveVideoBitrateTracker,
    requestGeneration: Long? = null,
    applyBitrate: () -> Unit,
    afterBitrateApplied: () -> Unit = {},
    onBitrateApplied: (Int) -> Unit = {},
    onBitrateFailure: (Int, Throwable) -> Unit = { _, _ -> }
): NativeVideoBitrateUpdateResult {
    if (!tracker.isCurrentRequest(requestGeneration)) {
        return NativeVideoBitrateUpdateResult(
            bitrateApplied = false,
            trackerAccepted = false
        )
    }

    val updateResult = executeNativeVideoBitrateUpdate(applyBitrate, afterBitrateApplied)
    val trackerAccepted = if (updateResult.bitrateApplied) {
        tracker.recordApplied(targetKbps, requestGeneration)
    } else {
        tracker.recordFailure(targetKbps, requestGeneration)
    }
    val result = updateResult.copy(trackerAccepted = trackerAccepted)
    if (result.trackerAccepted) {
        if (result.bitrateApplied) {
            onBitrateApplied(targetKbps)
        } else {
            val error = result.bitrateFailure ?: IllegalStateException("Native bitrate update failed")
            onBitrateFailure(targetKbps, error)
        }
    }
    return result
}
