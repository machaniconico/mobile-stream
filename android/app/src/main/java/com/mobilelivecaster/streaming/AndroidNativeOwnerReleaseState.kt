package com.mobilelivecaster.streaming

import java.util.concurrent.atomic.AtomicReference

/** Retains the first native-owner release failure while still attempting every cleanup step. */
internal class AndroidNativeOwnerReleaseState {
    private val firstFailure = AtomicReference<Throwable?>(null)

    fun execute(vararg steps: () -> Unit) {
        var fatalError: Error? = null
        steps.forEach { step ->
            try {
                step()
            } catch (error: Throwable) {
                firstFailure.compareAndSet(null, error)
                if (error is Error && fatalError == null) fatalError = error
            }
        }
        fatalError?.let { throw it }
    }

    fun failure(): Throwable? = firstFailure.get()
}
