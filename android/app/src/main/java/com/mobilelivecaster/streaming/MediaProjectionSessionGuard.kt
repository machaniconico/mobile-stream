package com.mobilelivecaster.streaming

internal data class MediaProjectionSessionToken(val generation: Long)

internal enum class MediaProjectionStopDisposition {
    EXPECTED,
    UNEXPECTED,
    STALE
}

internal class MediaProjectionSessionGuard {
    private var nextGeneration = 0L
    private var activeToken: MediaProjectionSessionToken? = null
    private var expectedStop = false

    @Synchronized
    fun attach(): MediaProjectionSessionToken {
        nextGeneration += 1
        return MediaProjectionSessionToken(nextGeneration).also { token ->
            activeToken = token
            expectedStop = false
        }
    }

    @Synchronized
    fun expectStop(token: MediaProjectionSessionToken) {
        if (activeToken == token) {
            expectedStop = true
        }
    }

    @Synchronized
    fun recordStopped(token: MediaProjectionSessionToken): MediaProjectionStopDisposition {
        if (activeToken != token) {
            return MediaProjectionStopDisposition.STALE
        }
        val disposition = if (expectedStop) {
            MediaProjectionStopDisposition.EXPECTED
        } else {
            MediaProjectionStopDisposition.UNEXPECTED
        }
        activeToken = null
        expectedStop = false
        return disposition
    }

    @Synchronized
    fun detach(token: MediaProjectionSessionToken) {
        if (activeToken == token) {
            activeToken = null
            expectedStop = false
        }
    }
}
