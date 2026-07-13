package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AndroidPlaybackAudioCaptureReadTest {
    @Test
    fun returnsSuccessfulReadCount() {
        val result = readAndroidPlaybackAudioSafely { 4_096 }

        assertEquals(4_096, result.bytesRead)
        assertEquals("", result.failureMessage)
    }

    @Test
    fun convertsReaderExceptionsIntoBoundedFailureTelemetry() {
        val message = "capture read failed " + "x".repeat(200)

        val result = readAndroidPlaybackAudioSafely { throw SecurityException(message) }

        assertNull(result.bytesRead)
        assertEquals(160, result.failureMessage.length)
        assertEquals(message.take(160), result.failureMessage)
    }

    @Test(expected = AssertionError::class)
    fun preservesFatalReaderErrors() {
        readAndroidPlaybackAudioSafely { throw AssertionError("fatal read") }
    }
}
