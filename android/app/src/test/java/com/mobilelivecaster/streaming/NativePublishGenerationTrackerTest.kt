package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
import org.junit.Test

class NativePublishGenerationTrackerTest {
    @Test
    fun `connection success starts a zero based publish generation`() {
        val tracker = NativePublishGenerationTracker()

        assertEquals(
            NativePublishGenerationSnapshot(
                publishGeneration = 1,
                currentPublishVideoFrames = 0L,
                currentPublishAudioFrames = 0L
            ),
            tracker.startGeneration(sentVideoFrames = 120L, sentAudioFrames = 240L)
        )
        assertEquals(
            NativePublishGenerationSnapshot(
                publishGeneration = 1,
                currentPublishVideoFrames = 7L,
                currentPublishAudioFrames = 11L
            ),
            tracker.snapshot(sentVideoFrames = 127L, sentAudioFrames = 251L)
        )
    }

    @Test
    fun `reconnect invalidates old evidence until the next success generation`() {
        val tracker = NativePublishGenerationTracker()
        tracker.startGeneration(sentVideoFrames = 10L, sentAudioFrames = 20L)
        tracker.snapshot(sentVideoFrames = 18L, sentAudioFrames = 32L)

        assertEquals(
            NativePublishGenerationSnapshot(publishGeneration = 1),
            tracker.invalidate()
        )
        assertEquals(
            NativePublishGenerationSnapshot(publishGeneration = 1),
            tracker.snapshot(sentVideoFrames = 25L, sentAudioFrames = 40L)
        )
        assertEquals(
            NativePublishGenerationSnapshot(publishGeneration = 2),
            tracker.startGeneration(sentVideoFrames = 25L, sentAudioFrames = 40L)
        )
        assertEquals(
            NativePublishGenerationSnapshot(
                publishGeneration = 2,
                currentPublishVideoFrames = 3L,
                currentPublishAudioFrames = 5L
            ),
            tracker.snapshot(sentVideoFrames = 28L, sentAudioFrames = 45L)
        )
    }

    @Test
    fun `duplicate success callback does not create another publish generation`() {
        val tracker = NativePublishGenerationTracker()
        tracker.startGeneration(sentVideoFrames = 30L, sentAudioFrames = 40L)

        assertEquals(
            NativePublishGenerationSnapshot(
                publishGeneration = 1,
                currentPublishVideoFrames = 5L,
                currentPublishAudioFrames = 7L
            ),
            tracker.startGeneration(sentVideoFrames = 35L, sentAudioFrames = 47L)
        )
        assertEquals(1, tracker.currentGeneration())
    }

    @Test
    fun `cumulative counter reset is rebased without negative generation counts`() {
        val tracker = NativePublishGenerationTracker()
        tracker.startGeneration(sentVideoFrames = 500L, sentAudioFrames = 800L)

        assertEquals(
            NativePublishGenerationSnapshot(
                publishGeneration = 1,
                currentPublishAudioFrames = 15L
            ),
            tracker.snapshot(sentVideoFrames = 2L, sentAudioFrames = 815L)
        )
        assertEquals(
            NativePublishGenerationSnapshot(
                publishGeneration = 1,
                currentPublishVideoFrames = 4L,
                currentPublishAudioFrames = 0L
            ),
            tracker.snapshot(sentVideoFrames = 6L, sentAudioFrames = 3L)
        )
        assertEquals(
            NativePublishGenerationSnapshot(
                publishGeneration = 1,
                currentPublishVideoFrames = 8L,
                currentPublishAudioFrames = 6L
            ),
            tracker.snapshot(sentVideoFrames = 10L, sentAudioFrames = 9L)
        )
    }

    @Test
    fun `new native session resets generation and evidence`() {
        val tracker = NativePublishGenerationTracker()
        tracker.startGeneration(sentVideoFrames = 0L, sentAudioFrames = 0L)
        tracker.snapshot(sentVideoFrames = 4L, sentAudioFrames = 8L)

        assertEquals(NativePublishGenerationSnapshot(), tracker.reset())
        assertEquals(
            NativePublishGenerationSnapshot(),
            tracker.snapshot(sentVideoFrames = 100L, sentAudioFrames = 200L)
        )
    }

    @Test
    fun `publisher state cannot promote before success or escape reconnecting`() {
        assertEquals(
            "connecting",
            resolveNativePublisherState(LiveCasterStatus.Preparing, "published")
        )
        assertEquals(
            "reconnecting",
            resolveNativePublisherState(LiveCasterStatus.Reconnecting, "connecting")
        )
        assertEquals(
            "reconnecting",
            resolveNativePublisherState(LiveCasterStatus.Reconnecting, "published")
        )
        assertEquals(
            "failed",
            resolveNativePublisherState(LiveCasterStatus.Reconnecting, "failed")
        )
        assertEquals(
            "published",
            resolveNativePublisherState(LiveCasterStatus.Live, "published")
        )
    }
}
