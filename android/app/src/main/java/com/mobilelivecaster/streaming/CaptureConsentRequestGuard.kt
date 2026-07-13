package com.mobilelivecaster.streaming

internal data class CaptureConsentRequestToken(
    val generation: Long,
    val requestCode: Int
)

internal class CaptureConsentRequestSequence(initialGeneration: Long = 0L) {
    private val lock = Any()
    private var generation = initialGeneration

    fun next(): Long = synchronized(lock) {
        generation = if (generation == Long.MAX_VALUE) 1L else generation + 1L
        generation
    }
}

private val processCaptureConsentRequestSequence = CaptureConsentRequestSequence()

internal class CaptureConsentRequestGuard<T>(
    private val minimumRequestCode: Int = 7400,
    private val maximumRequestCode: Int = 32760,
    private val sequence: CaptureConsentRequestSequence = processCaptureConsentRequestSequence
) {
    private data class ActiveRequest<T>(
        val token: CaptureConsentRequestToken,
        val payload: T
    )

    private val lock = Any()
    private var activeRequest: ActiveRequest<T>? = null

    init {
        require(minimumRequestCode in 0..maximumRequestCode)
        require(maximumRequestCode <= 0xffff)
    }

    fun begin(payload: T): CaptureConsentRequestToken = synchronized(lock) {
        createRequest(payload)
    }

    fun beginIfIdle(payload: T): CaptureConsentRequestToken? = synchronized(lock) {
        if (activeRequest != null) {
            null
        } else {
            createRequest(payload)
        }
    }

    private fun createRequest(payload: T): CaptureConsentRequestToken {
        val generation = sequence.next()
        val requestCodeSpan = maximumRequestCode - minimumRequestCode + 1
        val requestCode = minimumRequestCode + ((generation - 1L) % requestCodeSpan).toInt()
        return CaptureConsentRequestToken(generation, requestCode).also {
            activeRequest = ActiveRequest(it, payload)
        }
    }

    fun complete(
        requestCode: Int,
        action: (CaptureConsentRequestToken, T) -> Unit
    ): Boolean = synchronized(lock) {
        val request = activeRequest?.takeIf { it.token.requestCode == requestCode } ?: return false
        try {
            action(request.token, request.payload)
        } finally {
            if (activeRequest === request) {
                activeRequest = null
            }
        }
        true
    }

    fun cancel(): T? = synchronized(lock) {
        activeRequest?.payload.also { activeRequest = null }
    }
}
