package com.mobilelivecaster.streaming

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class Pcm16AudioMixerTest {
    @Test
    fun `upmix duplicates every mono sample without changing order`() {
        val mono = pcm(1_000, -2_000, 3_000)

        val stereo = Pcm16AudioMixer.upmixMonoToStereo(mono, mono.size)

        assertArrayEquals(pcm(1_000, 1_000, -2_000, -2_000, 3_000, 3_000), stereo)
    }

    @Test
    fun `mix preserves quiet sources and reports output levels`() {
        val result = Pcm16AudioMixer.mix(
            pcm(4_000, -4_000, 2_000, -2_000),
            pcm(3_000, -3_000, -1_000, 1_000)
        )

        assertArrayEquals(pcm(7_000, -7_000, 1_000, -1_000), result.pcm)
        assertEquals(4L, result.levels.sampleCount)
        assertEquals(0L, result.levels.clippedSampleCount)
        assertTrue(result.levels.rmsLevel > 0f)
        assertTrue(result.levels.peakLevel > 0f)
    }

    @Test
    fun `mix soft limits overload and counts potential clipping`() {
        val result = Pcm16AudioMixer.mix(
            pcm(30_000, -30_000),
            pcm(30_000, -30_000)
        )
        val samples = samples(result.pcm)

        assertEquals(2L, result.levels.clippedSampleCount)
        assertTrue(samples[0] in 29_490..32_767)
        assertTrue(samples[1] in -32_768..-29_490)
        assertTrue(result.levels.peakLevel <= 1f)
    }

    private fun pcm(vararg samples: Int): ByteArray = ByteArray(samples.size * 2).also { output ->
        samples.forEachIndexed { index, sample ->
            val value = sample.toShort().toInt()
            output[index * 2] = (value and 0xff).toByte()
            output[index * 2 + 1] = ((value shr 8) and 0xff).toByte()
        }
    }

    private fun samples(buffer: ByteArray): List<Int> = buffer.indices
        .step(2)
        .map { index ->
            ((buffer[index + 1].toInt() shl 8) or (buffer[index].toInt() and 0xff)).toShort().toInt()
        }
}
