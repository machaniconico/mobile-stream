package com.mobilelivecaster.streaming

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidMediaPublishPolicyTest {
    @Test
    fun `successful transport send is counted as sent`() {
        var invoked = false

        val result = executeAndroidMediaPublish {
            invoked = true
        }

        assertTrue(invoked)
        assertTrue(result.sent)
        assertEquals("", result.fatalError)
    }

    @Test
    fun `validation failure is fatal and transport is not invoked`() {
        var invoked = false

        val result = executeAndroidMediaPublish("H.264 Annex B payload is invalid") {
            invoked = true
        }

        assertFalse(invoked)
        assertFalse(result.sent)
        assertEquals("H.264 Annex B payload is invalid", result.fatalError)
    }

    @Test
    fun `transport exception becomes a fatal result`() {
        val result = executeAndroidMediaPublish {
            throw IllegalStateException("socket write failed")
        }

        assertFalse(result.sent)
        assertEquals("socket write failed", result.fatalError)
    }

    @Test
    fun `fatal VM errors are not converted into publish results`() {
        assertThrows(AssertionError::class.java) {
            executeAndroidMediaPublish {
                throw AssertionError("fatal")
            }
        }
    }
}
