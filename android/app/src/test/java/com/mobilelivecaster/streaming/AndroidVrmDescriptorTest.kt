package com.mobilelivecaster.streaming

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidVrmDescriptorTest {
    @Test
    fun `parses VRM 1 humanoid expressions and MToon compatibility`() {
        val descriptor = VrmModelDescriptor.parseGlb(
            glb(
                """{
                  "asset":{"version":"2.0"},
                  "extensionsUsed":["VRMC_vrm","VRMC_materials_mtoon"],
                  "nodes":[{"name":"hips"},{"name":"head"}],
                  "extensions":{"VRMC_vrm":{
                    "humanoid":{"humanBones":{"head":{"node":1}}},
                    "expressions":{"preset":{"happy":{"morphTargetBinds":[
                      {"node":1,"index":2,"weight":0.75}
                    ]}}}
                  }}
                }"""
            )
        )

        assertEquals(1, descriptor.boneNodeIndices["head"])
        assertEquals(MorphBind(nodeIndex = 1, targetIndex = 2, weight = 0.75f), descriptor.expressionBinds["happy"]?.single())
        assertEquals(1.0, descriptor.cameraZSign, 0.0)
        assertTrue(descriptor.requiresMtoonFallback)
        descriptor.requireValidNodeIndices(2)
    }

    @Test
    fun `parses VRM 0 mesh blend shapes and legacy camera direction`() {
        val descriptor = VrmModelDescriptor.parseGlb(
            glb(
                """{
                  "asset":{"version":"2.0"},
                  "nodes":[{"name":"face","mesh":0},{"name":"body","mesh":1}],
                  "extensions":{"VRM":{
                    "humanoid":{"humanBones":[{"bone":"head","node":0}]},
                    "blendShapeMaster":{"blendShapeGroups":[{
                      "presetName":"A",
                      "binds":[{"mesh":0,"index":1,"weight":50}]
                    }]},
                    "materialProperties":[{}]
                  }}
                }"""
            )
        )

        assertEquals(0, descriptor.boneNodeIndices["head"])
        assertEquals(MorphBind(nodeIndex = 0, targetIndex = 1, weight = 0.5f), descriptor.expressionBinds["aa"]?.single())
        assertEquals(-1.0, descriptor.cameraZSign, 0.0)
        assertTrue(descriptor.requiresMtoonFallback)
        descriptor.requireValidNodeIndices(2)
    }

    @Test
    fun `resolves glTF node indices by unique names instead of Filament entity order`() {
        val resolved = VrmNodeEntityResolver.resolve(
            nodeLookupNames = mapOf(1 to "prepared-head", 2 to "prepared-face"),
            allowedEntities = setOf(700, 900),
            entitiesForName = { name ->
                when (name) {
                    "prepared-head" -> intArrayOf(900)
                    "prepared-face" -> intArrayOf(700)
                    else -> intArrayOf()
                }
            }
        )

        assertEquals(mapOf(1 to 900, 2 to 700), resolved)
    }

    @Test
    fun `prepares internal names for unnamed and duplicate VRM rig nodes`() {
        val binary = byteArrayOf(4, 3, 2, 1)
        val prepared = prepareVrmModelForFilament(
            glb(
                """{
                  "asset":{"version":"2.0"},
                  "nodes":[{}, {"name":"duplicate"}, {"name":"duplicate"}],
                  "extensions":{"VRMC_vrm":{
                    "humanoid":{"humanBones":{"head":{"node":0}}},
                    "expressions":{"preset":{"happy":{"morphTargetBinds":[
                      {"node":1,"index":0,"weight":1}
                    ]}}}
                  }}
                }""",
                binary
            )
        )

        assertEquals(setOf(0, 1), prepared.nodeLookupNames.keys)
        assertEquals(2, prepared.nodeLookupNames.values.toSet().size)
        assertTrue(prepared.nodeLookupNames.values.all(String::isNotBlank))
        val reparsed = VrmModelDescriptor.parseGlb(prepared.modelData)
        assertEquals(0, reparsed.boneNodeIndices["head"])
        assertEquals(1, reparsed.expressionBinds["happy"]?.single()?.nodeIndex)
        val buffer = ByteBuffer.wrap(prepared.modelData.bytes).order(ByteOrder.LITTLE_ENDIAN)
        val preparedJsonLength = buffer.getInt(12)
        val binaryChunkOffset = 20 + preparedJsonLength
        assertEquals(binary.size, buffer.getInt(binaryChunkOffset))
        assertEquals(0x004E4942, buffer.getInt(binaryChunkOffset + 4))
        assertArrayEquals(binary, prepared.modelData.bytes.copyOfRange(binaryChunkOffset + 8, binaryChunkOffset + 12))
    }

    @Test
    fun `rejects an ambiguous prepared entity lookup`() {
        assertThrows(IllegalArgumentException::class.java) {
            VrmNodeEntityResolver.resolve(
                nodeLookupNames = mapOf(0 to "prepared-head"),
                allowedEntities = setOf(10, 11),
                entitiesForName = { intArrayOf(10, 11) }
            )
        }
    }

    @Test
    fun `failed model retry ignores pose churn until backoff expires`() {
        assertFalse(
            VrmRenderRetryPolicy.shouldSchedule(
                currentModelUri = "avatar.vrm",
                currentPoseJson = "pose-1",
                currentStatus = "failed",
                lastAttemptAtMs = 1_000L,
                nextModelUri = "avatar.vrm",
                nextPoseJson = "pose-2",
                nowMs = 3_999L,
                retryDelayMs = 3_000L
            )
        )
        assertTrue(
            VrmRenderRetryPolicy.shouldSchedule(
                currentModelUri = "avatar.vrm",
                currentPoseJson = "pose-1",
                currentStatus = "failed",
                lastAttemptAtMs = 1_000L,
                nextModelUri = "avatar.vrm",
                nextPoseJson = "pose-2",
                nowMs = 4_000L,
                retryDelayMs = 3_000L
            )
        )
    }

    private fun glb(json: String, binary: ByteArray = byteArrayOf()): VrmModelData {
        val compact = json.trimIndent().replace("\n", "").toByteArray(StandardCharsets.UTF_8)
        val paddedLength = (compact.size + 3) and -4
        val binaryChunkLength = if (binary.isEmpty()) 0 else 8 + binary.size
        val bytes = ByteArray(20 + paddedLength + binaryChunkLength) { index ->
            if (index >= 20) ' '.code.toByte() else 0
        }
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).apply {
            putInt(0x46546C67)
            putInt(2)
            putInt(bytes.size)
            putInt(paddedLength)
            putInt(0x4E4F534A)
            put(compact)
            if (binary.isNotEmpty()) {
                position(20 + paddedLength)
                putInt(binary.size)
                putInt(0x004E4942)
                put(binary)
            }
        }
        return VrmModelData(bytes, bytes.size)
    }
}
