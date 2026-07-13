package com.mobilelivecaster.streaming

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class PcmByteRingBufferTest {
    @Test
    fun `ring preserves stereo frame order across wraparound`() {
        val ring = PcmByteRingBuffer(capacityBytes = 16, frameSizeBytes = 4)
        val firstRead = ByteArray(8)
        val secondRead = ByteArray(12)

        assertEquals(0, ring.write(bytes(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11), 12))
        assertEquals(8, ring.read(firstRead, firstRead.size))
        assertArrayEquals(bytes(0, 1, 2, 3, 4, 5, 6, 7), firstRead)
        assertEquals(0, ring.write(bytes(12, 13, 14, 15, 16, 17, 18, 19), 8))
        assertEquals(12, ring.read(secondRead, secondRead.size))
        assertArrayEquals(bytes(8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19), secondRead)
    }

    @Test
    fun `ring drops oldest complete frames on overflow`() {
        val ring = PcmByteRingBuffer(capacityBytes = 12, frameSizeBytes = 4)
        val output = ByteArray(12)

        ring.write(bytes(0, 1, 2, 3, 4, 5, 6, 7), 8)
        assertEquals(4, ring.write(bytes(8, 9, 10, 11, 12, 13, 14, 15), 8))
        assertEquals(12, ring.read(output, output.size))
        assertArrayEquals(bytes(4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15), output)
    }

    @Test
    fun `trim bounds read ahead to a complete frame budget`() {
        val ring = PcmByteRingBuffer(capacityBytes = 20, frameSizeBytes = 4)
        val output = ByteArray(8)
        ring.write(bytes(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15), 16)

        assertEquals(8, ring.trimTo(8))
        assertEquals(8, ring.read(output, output.size))
        assertArrayEquals(bytes(8, 9, 10, 11, 12, 13, 14, 15), output)
    }

    private fun bytes(vararg values: Int): ByteArray = ByteArray(values.size) { index -> values[index].toByte() }
}
