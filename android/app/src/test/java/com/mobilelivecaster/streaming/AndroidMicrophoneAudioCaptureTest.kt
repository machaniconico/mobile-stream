package com.mobilelivecaster.streaming

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class AndroidMicrophoneAudioCaptureTest {
    @Test
    fun `consumer can poll an empty microphone buffer without waiting for a producer`() {
        val buffer = AndroidMicrophonePcmBuffer(
            capacityBytes = 64,
            frameSizeBytes = 2,
            maxReadAheadChunks = 3
        )
        val destination = ByteArray(4)

        repeat(250) {
            assertEquals(0, buffer.readInto(destination))
        }
    }

    @Test
    fun `read trims old pcm to the configured read ahead window`() {
        val buffer = AndroidMicrophonePcmBuffer(
            capacityBytes = 24,
            frameSizeBytes = 2,
            maxReadAheadChunks = 2
        )
        val source = ByteArray(20) { index -> index.toByte() }
        buffer.write(source, source.size)

        val destination = ByteArray(4)
        assertEquals(4, buffer.readInto(destination))

        assertArrayEquals(byteArrayOf(12, 13, 14, 15), destination)
        assertEquals(4, buffer.sizeBytes())
    }

    @Test
    fun `recovery clear prevents stale pcm from reaching the encoder`() {
        val buffer = AndroidMicrophonePcmBuffer(
            capacityBytes = 24,
            frameSizeBytes = 2,
            maxReadAheadChunks = 2
        )
        buffer.write(byteArrayOf(1, 2, 3, 4), 4)

        buffer.clear()

        assertEquals(0, buffer.readInto(ByteArray(4)))
        assertEquals(0, buffer.sizeBytes())
    }

    @Test
    fun `failure policy treats only bad read value as fatal`() {
        assertEquals(
            AndroidMicrophoneFailureAction.FATAL,
            AndroidMicrophoneFailurePolicy.forReadResult(-2)
        )
        assertEquals(
            AndroidMicrophoneFailureAction.RETRY,
            AndroidMicrophoneFailurePolicy.forReadResult(-6)
        )
        assertEquals(
            AndroidMicrophoneFailureAction.RETRY,
            AndroidMicrophoneFailurePolicy.forReadResult(-3)
        )
    }

    @Test
    fun `failure policy makes permission configuration and fatal errors terminal`() {
        assertEquals(
            AndroidMicrophoneFailureAction.FATAL,
            AndroidMicrophoneFailurePolicy.forThrowable(SecurityException("denied"))
        )
        assertEquals(
            AndroidMicrophoneFailureAction.FATAL,
            AndroidMicrophoneFailurePolicy.forThrowable(UnsupportedOperationException("permission"))
        )
        assertEquals(
            AndroidMicrophoneFailureAction.FATAL,
            AndroidMicrophoneFailurePolicy.forThrowable(IllegalArgumentException("bad config"))
        )
        assertEquals(
            AndroidMicrophoneFailureAction.RETRY,
            AndroidMicrophoneFailurePolicy.forThrowable(IllegalStateException("temporarily unavailable"))
        )
        assertEquals(
            AndroidMicrophoneFailureAction.FATAL,
            AndroidMicrophoneFailurePolicy.forThrowable(AssertionError("fatal"))
        )
    }
}
