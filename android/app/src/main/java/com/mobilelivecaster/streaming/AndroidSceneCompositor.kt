package com.mobilelivecaster.streaming

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.net.Uri
import com.pedro.encoder.input.gl.render.filters.`object`.BaseObjectFilterRender
import com.pedro.encoder.input.gl.render.filters.`object`.ImageObjectFilterRender
import com.pedro.encoder.input.gl.render.filters.`object`.TextObjectFilterRender
import com.pedro.library.generic.GenericStream
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import kotlin.math.abs
import kotlin.math.roundToInt

data class AndroidVrmPoseSummary(
    val sourceCount: Int = 0,
    val posePayloadCount: Int = 0,
    val activePoseCount: Int = 0,
    val missingPoseCount: Int = 0,
    val modelUriCount: Int = 0,
    val modelVersions: Set<String> = emptySet(),
    val humanoidBoneCount: Int = 0,
    val expressionCount: Int = 0,
    val runtimeStatuses: Set<String> = emptySet(),
    val rendererStatus: String = "not-required",
    val rendererBackend: String = "none",
    val modelLoadedCount: Int = 0,
    val renderedSourceCount: Int = 0,
    val renderMissingCount: Int = 0,
    val renderFailureCount: Int = 0
)

data class AndroidCompositionResult(
    val appliedCount: Int,
    val skippedCount: Int,
    val skippedKinds: Set<String>,
    val parseFailed: Boolean = false,
    val vrmPoseSummary: AndroidVrmPoseSummary = AndroidVrmPoseSummary()
) {
    val summary: String
        get() {
            val base = when {
                parseFailed -> "Native composition skipped: invalid render graph"
                appliedCount == 0 && skippedCount == 0 -> "Native composition screen-only"
                skippedCount == 0 -> "Native overlays applied: $appliedCount"
                appliedCount == 0 -> "Native overlays pending: ${skippedKinds.joinToString("/")}"
                else -> "Native overlays applied: $appliedCount, pending: ${skippedKinds.joinToString("/")}"
            }
            return if (vrmPoseSummary.sourceCount > 0) {
                "$base; VRM poses ${vrmPoseSummary.activePoseCount}/${vrmPoseSummary.sourceCount} active, payloads ${vrmPoseSummary.posePayloadCount}, missing ${vrmPoseSummary.missingPoseCount}; VRM renderer ${vrmPoseSummary.rendererStatus} ${vrmPoseSummary.rendererBackend}, rendered ${vrmPoseSummary.renderedSourceCount}/${vrmPoseSummary.sourceCount}, models ${vrmPoseSummary.modelLoadedCount}/${vrmPoseSummary.modelUriCount}, bones ${vrmPoseSummary.humanoidBoneCount}, expressions ${vrmPoseSummary.expressionCount}, failed ${vrmPoseSummary.renderFailureCount}"
            } else {
                base
            }
        }
}

object AndroidSceneCompositor {
    fun apply(context: Context, stream: GenericStream, renderGraphJson: String): AndroidCompositionResult {
        val renderNodes = parseRenderGraph(renderGraphJson)
            ?: return AndroidCompositionResult(appliedCount = 0, skippedCount = 0, skippedKinds = emptySet(), parseFailed = true)
        val vrmPoseSummary = summarizeVrmPosePayloads(context, renderNodes)

        val primaryScreenOrder = renderNodes
            .filter { node -> node.kind == "screen" }
            .minOfOrNull { node -> node.order }
        val underlays = renderNodes
            .filter { node -> node.kind != "screen" && primaryScreenOrder != null && node.order <= primaryScreenOrder }
        val overlays = renderNodes
            .filter { node -> node.kind != "screen" && (primaryScreenOrder == null || node.order > primaryScreenOrder) }
            .sortedBy { node -> node.order }

        stream.getGlInterface().clearFilters()

        var appliedCount = 0
        var skippedCount = underlays.size
        val skippedKinds = underlays.mapTo(linkedSetOf()) { node -> node.kind }

        overlays.forEach { node ->
            val filter = createFilter(context, node)
            if (filter == null) {
                skippedCount += 1
                skippedKinds.add(node.kind)
                return@forEach
            }

            applyTransform(filter, node)
            stream.getGlInterface().addFilter(filter)
            appliedCount += 1
        }

        return AndroidCompositionResult(
            appliedCount = appliedCount,
            skippedCount = skippedCount,
            skippedKinds = skippedKinds,
            vrmPoseSummary = vrmPoseSummary
        )
    }

    private fun createFilter(context: Context, node: RenderGraphNode): BaseObjectFilterRender? {
        return when (node.kind) {
            "pngtuber" -> createPngTuberFilter(context, node)
            "text" -> createTextFilter(node)
            "chat" -> createChatFilter(node)
            "solid" -> createSolidFilter(node)
            "image" -> createImageFilter(context, node)
            else -> null
        }
    }

    private fun createPngTuberFilter(context: Context, node: RenderGraphNode): ImageObjectFilterRender {
        val imageUri = node.payload.optString("imageUri").trim()
        val motion = parsePngTuberMotion(node)
        val sourceBitmap = if (imageUri.isNotEmpty()) {
            loadBitmap(context, imageUri)
        } else {
            null
        } ?: createFallbackPngTuberBitmap(node)
        val bitmap = createIllustrationRigBitmap(sourceBitmap, motion)

        return ImageObjectFilterRender().apply {
            setImage(bitmap)
        }
    }

    private fun createTextFilter(node: RenderGraphNode): TextObjectFilterRender? {
        val text = node.payload.optString("text").trim()
        if (text.isEmpty()) {
            return null
        }

        val color = parseColor(node.payload.optString("color"), Color.WHITE)
        val fontSize = node.payload.optDouble("fontSize", 36.0).toFloat().coerceIn(8f, 220f)
        return TextObjectFilterRender().apply {
            setText(text.take(240), fontSize, color)
        }
    }

    private fun createChatFilter(node: RenderGraphNode): ImageObjectFilterRender? {
        val text = node.payload.optString("text").trim()
        if (text.isEmpty()) {
            return null
        }

        val bitmap = Bitmap.createBitmap(960, 360, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val backgroundOpacity = node.payload.optDouble("backgroundOpacity", 0.0).toFloat().coerceIn(0f, 1f)
        if (backgroundOpacity > 0f) {
            val backgroundColor = parseColor(node.payload.optString("backgroundColor"), Color.BLACK)
            paint.color = Color.argb(
                (backgroundOpacity * 255f).roundToInt(),
                Color.red(backgroundColor),
                Color.green(backgroundColor),
                Color.blue(backgroundColor)
            )
            canvas.drawRoundRect(RectF(0f, 0f, 960f, 360f), 28f, 28f, paint)
        }

        paint.color = parseColor(node.payload.optString("color"), Color.WHITE)
        paint.textSize = node.payload.optDouble("fontSize", 34.0).toFloat().coerceIn(10f, 120f)
        paint.isFakeBoldText = true
        paint.setShadowLayer(8f, 0f, 4f, Color.argb(220, 0, 0, 0))

        val maxMessages = node.payload.optInt("maxMessages", 4).coerceIn(1, 8)
        val lines = text.split("\n").map { line -> line.trim() }.filter { line -> line.isNotEmpty() }.take(maxMessages)
        val lineHeight = paint.textSize * 1.22f
        var baseline = 360f - 22f - lineHeight * (lines.size - 1)
        lines.forEach { line ->
            canvas.drawText(ellipsize(line, paint, 908f), 26f, baseline, paint)
            baseline += lineHeight
        }

        return ImageObjectFilterRender().apply {
            setImage(bitmap)
        }
    }

    private fun createSolidFilter(node: RenderGraphNode): ImageObjectFilterRender {
        val color = parseColor(node.payload.optString("color"), Color.TRANSPARENT)
        val bitmap = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888).apply {
            eraseColor(color)
        }
        return ImageObjectFilterRender().apply {
            setImage(bitmap)
        }
    }

    private fun createImageFilter(context: Context, node: RenderGraphNode): ImageObjectFilterRender? {
        val uri = node.payload.optString("uri").trim()
        if (uri.isEmpty()) {
            return null
        }

        val bitmap = loadBitmap(context, uri) ?: return null
        return ImageObjectFilterRender().apply {
            setImage(bitmap)
        }
    }

    private fun applyTransform(filter: BaseObjectFilterRender, node: RenderGraphNode) {
        val transform = node.transform
        val isPngTuber = node.kind == "pngtuber"
        val motion = if (isPngTuber) parsePngTuberMotion(node) else PngTuberMotion()
        val width = transform.width.coerceIn(0.01f, 1f)
        val height = transform.height.coerceIn(0.01f, 1f)
        val scaledWidth = (width * motion.scaleX).coerceIn(0.01f, 1f)
        val scaledHeight = (height * motion.scaleY).coerceIn(0.01f, 1f)
        val centeredX = transform.x + motion.offsetX + (width - scaledWidth) * 0.5f
        val centeredY = transform.y + motion.offsetY + (height - scaledHeight) * 0.5f

        filter.setScale(
            scaledWidth * 100f,
            scaledHeight * 100f
        )
        filter.setPosition(
            centeredX.coerceIn(0f, 1f) * 100f,
            centeredY.coerceIn(0f, 1f) * 100f
        )
        filter.setRotation((transform.rotation + motion.rotation).coerceIn(-180f, 180f).roundToInt())
        filter.setAlpha(transform.opacity.coerceIn(0f, 1f))
    }

    private fun parsePngTuberMotion(node: RenderGraphNode): PngTuberMotion {
        val headYaw = node.payload.optDouble("headYaw", 0.0).toFloat().coerceIn(-1f, 1f)
        val headPitch = node.payload.optDouble("headPitch", 0.0).toFloat().coerceIn(-1f, 1f)
        val headRoll = node.payload.optDouble("headRoll", 0.0).toFloat().coerceIn(-1f, 1f)
        val bodyLean = node.payload.optDouble("bodyLean", 0.0).toFloat().coerceIn(-1f, 1f)
        val breathing = node.payload.optDouble("breathing", 0.0).toFloat().coerceIn(-1f, 1f)
        val bodyBounce = node.payload.optDouble("bodyBounce", 0.0).toFloat().coerceIn(-1f, 1f)
        val depthTilt = node.payload.optDouble("depthTilt", 0.0).toFloat().coerceIn(0f, 1f)
        val meshWarp = node.payload.optDouble("meshWarp", 0.0).toFloat().coerceIn(-1f, 1f)
        val eyeSquint = node.payload.optDouble("eyeSquint", 0.0).toFloat().coerceIn(0f, 1f)
        val mouthDeform = node.payload.optDouble("mouthDeform", 0.0).toFloat().coerceIn(0f, 1f)
        val hairSway = node.payload.optDouble("hairSway", 0.0).toFloat().coerceIn(-1f, 1f)
        val shoulderSway = node.payload.optDouble("shoulderSway", 0.0).toFloat().coerceIn(-1f, 1f)
        val rig = parsePngTuberRig(node)
        return PngTuberMotion(
            offsetX = node.payload.optDouble("headX", 0.0).toFloat().coerceIn(-1f, 1f) * 0.025f,
            offsetY = (node.payload.optDouble("headY", 0.0).toFloat().coerceIn(-1f, 1f) + breathing - bodyBounce) * 0.025f,
            rotation = bodyLean * 10f + headRoll * 10f + headYaw * 4f,
            scaleX = (1f - abs(headYaw) * 0.08f - depthTilt * 0.04f).coerceIn(0.84f, 1.02f),
            scaleY = (1f - abs(headPitch) * 0.04f + breathing * 0.5f + mouthDeform * 0.014f).coerceIn(0.9f, 1.05f),
            depthTilt = depthTilt,
            meshWarp = meshWarp,
            eyeSquint = eyeSquint,
            mouthDeform = mouthDeform,
            hairSway = hairSway,
            shoulderSway = shoulderSway,
            rig = rig
        )
    }

    private fun parsePngTuberRig(node: RenderGraphNode): PngTuberRig =
        PngTuberRig(
            faceCenterY = node.payload.optDouble("rigFaceCenterY", 0.42).toFloat().coerceIn(0.15f, 0.85f),
            faceRange = node.payload.optDouble("rigFaceRange", 0.34).toFloat().coerceIn(0.08f, 0.6f),
            hairLineY = node.payload.optDouble("rigHairLineY", 0.34).toFloat().coerceIn(0.05f, 0.55f),
            shoulderLineY = node.payload.optDouble("rigShoulderLineY", 0.62).toFloat().coerceIn(0.45f, 0.95f),
            eyeLineY = node.payload.optDouble("rigEyeLineY", 0.35).toFloat().coerceIn(0.12f, 0.65f),
            mouthLineY = node.payload.optDouble("rigMouthLineY", 0.5).toFloat().coerceIn(0.25f, 0.85f),
            sliceCount = node.payload.optInt("rigSliceCount", 24).coerceIn(12, 40)
        )

    private fun createFallbackPngTuberBitmap(node: RenderGraphNode): Bitmap {
        val bitmap = Bitmap.createBitmap(720, 960, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val expression = node.payload.optString("expression", "neutral")
        val mouthOpen = node.payload.optDouble("mouthOpen", 0.0).toFloat().coerceIn(0f, 1f)
        val blink = node.payload.optDouble("blink", 0.0).toFloat().coerceIn(0f, 1f)
        val eyeSquint = node.payload.optDouble("eyeSquint", 0.0).toFloat().coerceIn(0f, 1f)
        val mouthDeform = node.payload.optDouble("mouthDeform", 0.0).toFloat().coerceIn(0f, 1f)
        val bodyColor = when (expression) {
            "happy" -> Color.rgb(34, 197, 94)
            "angry" -> Color.rgb(251, 113, 133)
            "surprised" -> Color.rgb(56, 189, 248)
            else -> Color.rgb(139, 92, 246)
        }

        paint.color = Color.argb(235, 45, 212, 191)
        canvas.drawRoundRect(RectF(190f, 540f, 530f, 900f), 150f, 110f, paint)
        paint.color = bodyColor
        canvas.drawOval(RectF(135f, 135f, 585f, 610f), paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 10f
        paint.color = Color.argb(220, 248, 250, 252)
        canvas.drawOval(RectF(135f, 135f, 585f, 610f), paint)
        paint.style = Paint.Style.FILL

        paint.color = Color.rgb(248, 250, 252)
        val eyeClose = if (blink > eyeSquint) blink else eyeSquint
        val eyeHeight = (42f * (1f - eyeClose)).coerceAtLeast(5f)
        canvas.drawOval(RectF(255f, 330f, 305f, 330f + eyeHeight), paint)
        canvas.drawOval(RectF(415f, 330f, 465f, 330f + eyeHeight), paint)

        paint.color = Color.rgb(24, 24, 31)
        val mouthLevel = if (mouthOpen > mouthDeform) mouthOpen else mouthDeform
        val mouthHeight = 18f + mouthLevel * 86f
        canvas.drawOval(RectF(320f, 442f, 400f, 442f + mouthHeight), paint)

        paint.color = Color.argb(210, 248, 250, 252)
        paint.textAlign = Paint.Align.CENTER
        paint.textSize = 42f
        canvas.drawText("PNGTuber", 360f, 930f, paint)

        return bitmap
    }

    private fun createIllustrationRigBitmap(bitmap: Bitmap, motion: PngTuberMotion): Bitmap {
        val intensity = abs(motion.meshWarp) + motion.depthTilt + abs(motion.hairSway) + abs(motion.shoulderSway)
        if (intensity < 0.01f) {
            return bitmap
        }

        val output = Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)
        val rig = motion.rig
        val sliceCount = rig.sliceCount
        for (index in 0 until sliceCount) {
            val top = index * bitmap.height / sliceCount
            val bottom = ((index + 1) * bitmap.height / sliceCount + 1).coerceAtMost(bitmap.height)
            val centerY = (top + bottom) * 0.5f / bitmap.height.coerceAtLeast(1)
            val faceFalloff = (1f - abs(centerY - rig.faceCenterY) / rig.faceRange).coerceIn(0f, 1f)
            val hairFalloff = if (centerY < rig.hairLineY) (1f - centerY / rig.hairLineY).coerceIn(0f, 1f) else 0f
            val shoulderFalloff = if (centerY > rig.shoulderLineY) {
                ((centerY - rig.shoulderLineY) / (1f - rig.shoulderLineY).coerceAtLeast(0.001f)).coerceIn(0f, 1f)
            } else {
                0f
            }
            val eyeFalloff = (1f - abs(centerY - rig.eyeLineY) / 0.045f).coerceIn(0f, 1f)
            val mouthFalloff = (1f - abs(centerY - rig.mouthLineY) / 0.06f).coerceIn(0f, 1f)
            val shiftX = bitmap.width * (
                motion.meshWarp * 0.026f * faceFalloff +
                    motion.hairSway * 0.024f * hairFalloff +
                    motion.shoulderSway * 0.018f * shoulderFalloff
                )
            val depthInset = bitmap.width * motion.depthTilt * 0.015f * faceFalloff
            val expressionInset = bitmap.width * (motion.eyeSquint * 0.012f * eyeFalloff - motion.mouthDeform * 0.01f * mouthFalloff)
            val src = Rect(0, top, bitmap.width, bottom)
            val dst = RectF(
                shiftX + depthInset + expressionInset,
                top.toFloat(),
                shiftX + bitmap.width - depthInset - expressionInset,
                bottom.toFloat()
            )
            canvas.drawBitmap(bitmap, src, dst, paint)
        }
        return output
    }

    private fun parseRenderGraph(renderGraphJson: String): List<RenderGraphNode>? {
        return try {
            val array = JSONArray(renderGraphJson)
            List(array.length()) { index ->
                val node = array.getJSONObject(index)
                RenderGraphNode(
                    id = node.optString("id", "node-$index"),
                    kind = node.optString("kind", "unknown"),
                    order = node.optInt("order", index),
                    transform = parseTransform(node.optJSONObject("transform")),
                    payload = node.optJSONObject("payload") ?: JSONObject()
                )
            }
        } catch (_: Throwable) {
            null
        }
    }

    private fun summarizeVrmPosePayloads(context: Context, renderNodes: List<RenderGraphNode>): AndroidVrmPoseSummary {
        val vrmNodes = renderNodes.filter { node -> node.kind == "vrm" }
        if (vrmNodes.isEmpty()) {
            return AndroidVrmPoseSummary()
        }

        var posePayloadCount = 0
        var activePoseCount = 0
        var modelUriCount = 0
        var modelLoadedCount = 0
        var modelLoadFailureCount = 0
        val modelVersions = linkedSetOf<String>()
        var humanoidBoneCount = 0
        var expressionCount = 0
        val runtimeStatuses = linkedSetOf<String>()

        vrmNodes.forEach { node ->
            val modelUri = node.payload.optString("modelUri").trim()
            if (modelUri.isNotEmpty()) {
                modelUriCount += 1
                val metadata = loadVrmModelMetadata(context, modelUri)
                if (metadata != null) {
                    modelLoadedCount += 1
                    modelVersions.add(metadata.version)
                    humanoidBoneCount += metadata.humanoidBoneCount
                    expressionCount += metadata.expressionCount
                } else {
                    modelLoadFailureCount += 1
                }
            }

            val directStatus = normalizeVrmRuntimeStatus(node.payload.optString("vrmRuntimeStatus"))
            val rawPose = node.payload.optString("vrmRuntimePoseJson").trim()
            var poseStatus = ""
            if (rawPose.isNotEmpty()) {
                try {
                    val pose = JSONObject(rawPose)
                    posePayloadCount += 1
                    poseStatus = normalizeVrmRuntimeStatus(pose.optString("status", directStatus))
                } catch (_: Throwable) {
                    runtimeStatuses.add("invalid")
                }
            }

            val status = poseStatus.ifEmpty { directStatus.ifEmpty { "missing" } }
            if (status == "active") {
                activePoseCount += 1
            }
            runtimeStatuses.add(status)
        }

        val missingPoseCount = (vrmNodes.size - posePayloadCount).coerceAtLeast(0)
        if (missingPoseCount > 0) {
            runtimeStatuses.add("missing")
        }

        return AndroidVrmPoseSummary(
            sourceCount = vrmNodes.size,
            posePayloadCount = posePayloadCount,
            activePoseCount = activePoseCount,
            missingPoseCount = missingPoseCount,
            modelUriCount = modelUriCount,
            modelVersions = modelVersions,
            humanoidBoneCount = humanoidBoneCount,
            expressionCount = expressionCount,
            runtimeStatuses = runtimeStatuses,
            rendererStatus = "unavailable",
            rendererBackend = if (modelUriCount > 0) "native-vrm-glb-loader" else "none",
            modelLoadedCount = modelLoadedCount,
            renderedSourceCount = 0,
            renderMissingCount = vrmNodes.size,
            renderFailureCount = modelLoadFailureCount
        )
    }

    private fun loadVrmModelMetadata(context: Context, rawUri: String): AndroidVrmModelMetadata? {
        return try {
            openModelInputStream(context, rawUri).use { input ->
                readVrmGlbMetadata(input)
            }
        } catch (_: Throwable) {
            null
        }
    }

    private fun openModelInputStream(context: Context, rawUri: String): InputStream {
        val uri = Uri.parse(rawUri)
        return when (uri.scheme?.lowercase()) {
            "content" -> context.contentResolver.openInputStream(uri)
                ?: throw IllegalArgumentException("VRM model URI could not be opened")
            "file" -> FileInputStream(File(uri.path ?: ""))
            null, "" -> FileInputStream(File(rawUri))
            else -> throw IllegalArgumentException("Unsupported VRM model URI scheme: ${uri.scheme}")
        }
    }

    private fun readVrmGlbMetadata(input: InputStream): AndroidVrmModelMetadata? {
        val header = input.readExact(20) ?: return null
        if (header[0] != 0x67.toByte() || header[1] != 0x6c.toByte() || header[2] != 0x54.toByte() || header[3] != 0x46.toByte()) {
            return null
        }
        if (header.littleEndianInt(4) != 2) {
            return null
        }
        val declaredLength = header.littleEndianInt(8)
        val jsonLength = header.littleEndianInt(12)
        if (declaredLength < 20 || jsonLength <= 0 || jsonLength > MAX_VRM_JSON_CHUNK_BYTES || declaredLength < 20 + jsonLength) {
            return null
        }
        if (header[16] != 0x4a.toByte() || header[17] != 0x53.toByte() || header[18] != 0x4f.toByte() || header[19] != 0x4e.toByte()) {
            return null
        }
        val jsonBytes = input.readExact(jsonLength) ?: return null
        val json = jsonBytes.toString(Charsets.UTF_8)
        val root = JSONObject(json)
        val extensions = root.optJSONObject("extensions") ?: return null
        val vrm1 = extensions.optJSONObject("VRMC_vrm")
        val vrm0 = extensions.optJSONObject("VRM")
        return when {
            vrm1 != null -> AndroidVrmModelMetadata(
                version = "1.0",
                humanoidBoneCount = countVrm1HumanoidBones(vrm1),
                expressionCount = countVrm1Expressions(vrm1)
            )
            vrm0 != null -> AndroidVrmModelMetadata(
                version = "0.x",
                humanoidBoneCount = countVrm0HumanoidBones(vrm0),
                expressionCount = countVrm0Expressions(vrm0)
            )
            else -> null
        }
    }

    private fun countVrm1HumanoidBones(vrm: JSONObject): Int {
        val humanBones = vrm.optJSONObject("humanoid")?.optJSONObject("humanBones") ?: return 0
        return humanBones.length()
    }

    private fun countVrm0HumanoidBones(vrm: JSONObject): Int {
        return vrm.optJSONObject("humanoid")?.optJSONArray("humanBones")?.length() ?: 0
    }

    private fun countVrm1Expressions(vrm: JSONObject): Int {
        val expressions = vrm.optJSONObject("expressions") ?: return 0
        val presetCount = expressions.optJSONObject("preset")?.length() ?: 0
        val customCount = expressions.optJSONObject("custom")?.length() ?: 0
        return presetCount + customCount
    }

    private fun countVrm0Expressions(vrm: JSONObject): Int {
        return vrm.optJSONObject("blendShapeMaster")?.optJSONArray("blendShapeGroups")?.length() ?: 0
    }

    private fun InputStream.readExact(byteCount: Int): ByteArray? {
        val output = ByteArrayOutputStream(byteCount)
        val buffer = ByteArray(8192)
        var remaining = byteCount
        while (remaining > 0) {
            val read = read(buffer, 0, minOf(buffer.size, remaining))
            if (read < 0) {
                return null
            }
            output.write(buffer, 0, read)
            remaining -= read
        }
        return output.toByteArray()
    }

    private fun ByteArray.littleEndianInt(offset: Int): Int {
        if (offset + 3 >= size) {
            return -1
        }
        return (this[offset].toInt() and 0xff) or
            ((this[offset + 1].toInt() and 0xff) shl 8) or
            ((this[offset + 2].toInt() and 0xff) shl 16) or
            ((this[offset + 3].toInt() and 0xff) shl 24)
    }

    private fun normalizeVrmRuntimeStatus(value: String): String {
        return value
            .trim()
            .lowercase()
            .replace(Regex("[^a-z0-9_-]"), "")
            .take(40)
    }

    private fun parseTransform(transform: JSONObject?): RenderTransform {
        if (transform == null) {
            return RenderTransform()
        }

        return RenderTransform(
            x = transform.optDouble("x", 0.0).toFloat(),
            y = transform.optDouble("y", 0.0).toFloat(),
            width = transform.optDouble("width", 1.0).toFloat(),
            height = transform.optDouble("height", 1.0).toFloat(),
            rotation = transform.optDouble("rotation", 0.0).toFloat(),
            opacity = transform.optDouble("opacity", 1.0).toFloat()
        )
    }

    private fun loadBitmap(context: Context, rawUri: String): Bitmap? {
        return try {
            val uri = Uri.parse(rawUri)
            when (uri.scheme?.lowercase()) {
                "content", "file" -> context.contentResolver.openInputStream(uri)?.use { stream ->
                    BitmapFactory.decodeStream(stream)
                }
                null, "" -> BitmapFactory.decodeFile(rawUri)
                else -> null
            }
        } catch (_: Throwable) {
            null
        }
    }

    private fun parseColor(value: String, fallback: Int): Int {
        return try {
            if (value.isBlank()) fallback else Color.parseColor(value)
        } catch (_: Throwable) {
            fallback
        }
    }

    private fun ellipsize(value: String, paint: Paint, maxWidth: Float): String {
        if (paint.measureText(value) <= maxWidth) {
            return value
        }
        var candidate = value
        while (candidate.isNotEmpty() && paint.measureText("$candidate...") > maxWidth) {
            candidate = candidate.dropLast(1)
        }
        return if (candidate.isEmpty()) "..." else "$candidate..."
    }
}

private const val MAX_VRM_JSON_CHUNK_BYTES = 2 * 1024 * 1024

private data class AndroidVrmModelMetadata(
    val version: String,
    val humanoidBoneCount: Int,
    val expressionCount: Int
)

private data class RenderGraphNode(
    val id: String,
    val kind: String,
    val order: Int,
    val transform: RenderTransform,
    val payload: JSONObject
)

private data class RenderTransform(
    val x: Float = 0f,
    val y: Float = 0f,
    val width: Float = 1f,
    val height: Float = 1f,
    val rotation: Float = 0f,
    val opacity: Float = 1f
)

private data class PngTuberMotion(
    val offsetX: Float = 0f,
    val offsetY: Float = 0f,
    val rotation: Float = 0f,
    val scaleX: Float = 1f,
    val scaleY: Float = 1f,
    val depthTilt: Float = 0f,
    val meshWarp: Float = 0f,
    val eyeSquint: Float = 0f,
    val mouthDeform: Float = 0f,
    val hairSway: Float = 0f,
    val shoulderSway: Float = 0f,
    val rig: PngTuberRig = PngTuberRig()
)

private data class PngTuberRig(
    val faceCenterY: Float = 0.42f,
    val faceRange: Float = 0.34f,
    val hairLineY: Float = 0.34f,
    val shoulderLineY: Float = 0.62f,
    val eyeLineY: Float = 0.35f,
    val mouthLineY: Float = 0.5f,
    val sliceCount: Int = 24
)
