package com.mobilelivecaster.streaming

internal data class NativeVideoBitrateUpdateResult(
    val bitrateApplied: Boolean,
    val bitrateFailure: Throwable? = null,
    val ancillaryFailure: Throwable? = null
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
    applyBitrate: () -> Unit,
    afterBitrateApplied: () -> Unit = {},
    onBitrateApplied: (Int) -> Unit = {},
    onBitrateFailure: (Int, Throwable) -> Unit = { _, _ -> }
): NativeVideoBitrateUpdateResult {
    val result = executeNativeVideoBitrateUpdate(applyBitrate, afterBitrateApplied)
    if (result.bitrateApplied) {
        tracker.recordApplied(targetKbps)
        onBitrateApplied(targetKbps)
    } else {
        val error = result.bitrateFailure ?: IllegalStateException("Native bitrate update failed")
        tracker.recordFailure(targetKbps)
        onBitrateFailure(targetKbps, error)
    }
    return result
}
