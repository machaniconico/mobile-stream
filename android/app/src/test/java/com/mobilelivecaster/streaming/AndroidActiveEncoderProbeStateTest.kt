package com.mobilelivecaster.streaming

import android.media.MediaFormat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidActiveEncoderProbeStateTest {
    @Test
    fun `active probe passes only after both streaming codecs produce encoded output`() {
        val state = AndroidActiveEncoderProbeState()
        val videoCodec = Any()
        val audioCodec = Any()

        state.recordVideoConfigured(videoCodec, "c2.vendor.avc.encoder")
        state.recordVideoStarted(videoCodec)
        state.recordAudioConfigured(audioCodec, "c2.vendor.aac.encoder")
        state.recordAudioStarted(audioCodec)
        state.recordVideoOutputFormat(
            videoCodec,
            MediaFormat.MIMETYPE_VIDEO_AVC,
            width = 1280,
            height = 720,
            fps = 30.0,
            colorFormat = "surface",
            bitrateMode = "cbr"
        )
        state.recordAudioOutputFormat(
            audioCodec,
            MediaFormat.MIMETYPE_AUDIO_AAC,
            sampleRate = 44_100,
            channelCount = 2
        )

        val waitingForOutput = snapshot(state)
        assertEquals("unknown", waitingForOutput.status)
        assertFalse(waitingForOutput.activeEncoderInstancesVerified)
        assertEquals(0L, waitingForOutput.videoEncodedOutputCount)
        assertEquals(0L, waitingForOutput.audioEncodedOutputCount)

        state.recordVideoEncodedOutput(videoCodec)
        val waitingForAudio = snapshot(state)
        assertEquals("unknown", waitingForAudio.status)
        assertFalse(waitingForAudio.activeEncoderInstancesVerified)
        assertEquals(1L, waitingForAudio.videoEncodedOutputCount)
        assertEquals(0L, waitingForAudio.audioEncodedOutputCount)

        state.recordAudioEncodedOutput(audioCodec)
        val proof = snapshot(state)

        assertEquals("pass", proof.status)
        assertTrue(proof.activeEncoderInstancesVerified)
        assertEquals(1L, proof.videoEncodedOutputCount)
        assertEquals(1L, proof.audioEncodedOutputCount)
        assertTrue(proof.videoConfigured)
        assertTrue(proof.audioConfigured)
        assertEquals(AndroidMediaCodecRtmpPublisher.VIDEO_BACKEND, proof.videoBackend)
        assertEquals(AndroidMediaCodecRtmpPublisher.AUDIO_BACKEND, proof.audioBackend)
        assertEquals(1280, proof.videoWidth)
        assertEquals(720, proof.videoHeight)
        assertEquals(30, proof.videoFps)
        assertEquals(44_100, proof.audioSampleRate)
        assertEquals(2, proof.audioChannelCount)
    }

    @Test
    fun `output from a different codec instance fails closed`() {
        val state = AndroidActiveEncoderProbeState()

        state.recordVideoConfigured(Any(), "c2.vendor.avc.encoder")
        state.recordVideoStarted(Any())

        val proof = snapshot(state)

        assertEquals("fail", proof.status)
        assertFalse(proof.activeEncoderInstancesVerified)
        assertEquals(0L, proof.videoEncodedOutputCount)
        assertEquals(0L, proof.audioEncodedOutputCount)
        assertTrue(proof.message.contains("different encoder instance"))
    }

    @Test
    fun `identity mismatch after completed output permanently invalidates active proof`() {
        val state = AndroidActiveEncoderProbeState()
        completeProbe(state)
        assertTrue(snapshot(state).activeEncoderInstancesVerified)

        state.recordVideoEncodedOutput(Any())
        val proof = snapshot(state)

        assertEquals("fail", proof.status)
        assertFalse(proof.activeEncoderInstancesVerified)
        assertEquals(1L, proof.videoEncodedOutputCount)
        assertEquals(1L, proof.audioEncodedOutputCount)
        assertTrue(proof.message.contains("different encoder instance"))
    }

    @Test
    fun `actual output mismatch fails and preserves measured values`() {
        val state = AndroidActiveEncoderProbeState()
        completeProbe(state, width = 1920, height = 1080, fps = 60.0)

        val proof = snapshot(state)

        assertEquals("fail", proof.status)
        assertTrue(proof.activeEncoderInstancesVerified)
        assertEquals(1L, proof.videoEncodedOutputCount)
        assertEquals(1L, proof.audioEncodedOutputCount)
        assertEquals(1920, proof.videoWidth)
        assertEquals(1080, proof.videoHeight)
        assertEquals(60, proof.videoFps)
    }

    @Test
    fun `fractional output fps cannot satisfy an integer requested fps exact match`() {
        val state = AndroidActiveEncoderProbeState()
        completeProbe(state, fps = 29.97)

        val proof = snapshot(state)

        assertEquals("fail", proof.status)
        assertTrue(proof.activeEncoderInstancesVerified)
        assertEquals(30, proof.videoFps)
        assertTrue(proof.message.contains("requested output match"))
    }

    @Test
    fun `stopped streaming codecs cannot retain pass status`() {
        val state = AndroidActiveEncoderProbeState()
        completeProbe(state)
        assertEquals("pass", snapshot(state).status)

        state.recordStopped()
        val stoppedProof = snapshot(state, running = false)

        assertEquals("fail", stoppedProof.status)
        assertFalse(stoppedProof.activeEncoderInstancesVerified)
        assertEquals(1L, stoppedProof.videoEncodedOutputCount)
        assertEquals(1L, stoppedProof.audioEncodedOutputCount)
        assertFalse(stoppedProof.videoConfigured)
        assertFalse(stoppedProof.audioConfigured)
        assertEquals("none", stoppedProof.videoBackend)
        assertEquals("none", stoppedProof.audioBackend)
    }

    @Test
    fun `active encoder error invalidates completed proof`() {
        val state = AndroidActiveEncoderProbeState()
        completeProbe(state)
        assertEquals("pass", snapshot(state).status)

        state.recordFailure("video encoder drain failed")
        val failedProof = snapshot(state)

        assertEquals("fail", failedProof.status)
        assertTrue(failedProof.message.contains("video encoder drain failed"))
    }

    @Test
    fun `publisher backend mismatch fails closed`() {
        val state = AndroidActiveEncoderProbeState()
        completeProbe(state)

        val proof = snapshot(state, publisherVideoBackend = "rootencoder")

        assertEquals("fail", proof.status)
        assertEquals("rootencoder", proof.videoBackend)
        assertEquals(AndroidMediaCodecRtmpPublisher.AUDIO_BACKEND, proof.audioBackend)
    }

    private fun completeProbe(
        state: AndroidActiveEncoderProbeState,
        width: Int = 1280,
        height: Int = 720,
        fps: Double = 30.0
    ) {
        val videoCodec = Any()
        val audioCodec = Any()
        state.recordVideoConfigured(videoCodec, "c2.vendor.avc.encoder")
        state.recordVideoStarted(videoCodec)
        state.recordAudioConfigured(audioCodec, "c2.vendor.aac.encoder")
        state.recordAudioStarted(audioCodec)
        state.recordVideoOutputFormat(
            videoCodec,
            MediaFormat.MIMETYPE_VIDEO_AVC,
            width,
            height,
            fps,
            colorFormat = "surface",
            bitrateMode = "cbr"
        )
        state.recordAudioOutputFormat(
            audioCodec,
            MediaFormat.MIMETYPE_AUDIO_AAC,
            sampleRate = 44_100,
            channelCount = 2
        )
        state.recordVideoEncodedOutput(videoCodec)
        state.recordAudioEncodedOutput(audioCodec)
    }

    private fun snapshot(
        state: AndroidActiveEncoderProbeState,
        running: Boolean = true,
        publisherVideoBackend: String = AndroidMediaCodecRtmpPublisher.VIDEO_BACKEND,
        publisherAudioBackend: String = AndroidMediaCodecRtmpPublisher.AUDIO_BACKEND
    ): NativeRuntimeEncoderProbe = state.snapshot(
        running = running,
        publisherConfigured = true,
        requestedVideoWidth = 1280,
        requestedVideoHeight = 720,
        requestedVideoFps = 30,
        expectedAudioSampleRate = 44_100,
        expectedAudioChannelCount = 2,
        publisherVideoBackend = publisherVideoBackend,
        publisherAudioBackend = publisherAudioBackend,
        externalError = ""
    )
}
