package com.mobilelivecaster.streaming

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class AndroidVrmMathTest {
    @Test
    fun identityLeavesTransformsUnchanged() {
        val transform = floatArrayOf(
            1f, 0f, 0f, 0f,
            0f, 1f, 0f, 0f,
            0f, 0f, 1f, 0f,
            2f, 3f, 4f, 1f
        )

        assertArrayEquals(transform, AndroidVrmMath.multiply(transform, AndroidVrmMath.identityMatrix()), 0.0001f)
    }

    @Test
    fun xyzRotationUsesDegreesAndRightHandedAxes() {
        val rotation = AndroidVrmMath.rotationMatrixXyz(90f, 0f, 0f)
        val point = transformPoint(rotation, floatArrayOf(0f, 1f, 0f))

        assertEquals(0f, point[0], 0.0001f)
        assertEquals(0f, point[1], 0.0001f)
        assertEquals(1f, point[2], 0.0001f)
    }

    @Test
    fun localBoneRotationPreservesRestTranslation() {
        val rest = AndroidVrmMath.identityMatrix().apply {
            this[12] = 0.5f
            this[13] = 1.25f
            this[14] = -0.75f
        }
        val posed = AndroidVrmMath.multiply(rest, AndroidVrmMath.rotationMatrixXyz(5f, 14f, 3.6f))

        assertEquals(rest[12], posed[12], 0.0001f)
        assertEquals(rest[13], posed[13], 0.0001f)
        assertEquals(rest[14], posed[14], 0.0001f)
    }

    private fun transformPoint(matrix: FloatArray, point: FloatArray): FloatArray =
        floatArrayOf(
            matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
            matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
            matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14]
        )
}
