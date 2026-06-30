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
import java.util.Locale
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
    val meshPrimitiveCount: Int = 0,
    val skinnedMeshPrimitiveCount: Int = 0,
    val skinJointCount: Int = 0,
    val positionAccessorCount: Int = 0,
    val vertexCount: Int = 0,
    val indexCount: Int = 0,
    val boundsAccessorCount: Int = 0,
    val skinningAttributePrimitiveCount: Int = 0,
    val trianglePrimitiveCount: Int = 0,
    val unsupportedPrimitiveModeCount: Int = 0,
    val normalAccessorCount: Int = 0,
    val texcoordAccessorCount: Int = 0,
    val morphTargetCount: Int = 0,
    val materialCount: Int = 0,
    val textureCount: Int = 0,
    val imageCount: Int = 0,
    val unsupportedImageMimeCount: Int = 0,
    val transparentMaterialCount: Int = 0,
    val poseBoneCount: Int = 0,
    val poseBoneAppliedCount: Int = 0,
    val poseBoneUnsupportedCount: Int = 0,
    val poseExpressionCount: Int = 0,
    val poseExpressionAppliedCount: Int = 0,
    val poseExpressionUnsupportedCount: Int = 0,
    val runtimeStatuses: Set<String> = emptySet(),
    val rendererStatus: String = "not-required",
    val rendererBackend: String = "none",
    val modelLoadedCount: Int = 0,
    val renderedSourceCount: Int = 0,
    val renderMissingCount: Int = 0,
    val renderFailureCount: Int = 0
)

data class AndroidStillImageAssetEvidence(
    val loaded: Boolean = false,
    val decodedPixelCount: Long = 0,
    val compositedPixelCount: Long = 0
)

data class AndroidCompositionResult(
    val appliedCount: Int,
    val skippedCount: Int,
    val skippedKinds: Set<String>,
    val parseFailed: Boolean = false,
    val stillImageAssetCount: Int = 0,
    val stillImageAssetLoadedCount: Int = 0,
    val stillImageAssetMissingCount: Int = 0,
    val stillImageAssetMissingKinds: Set<String> = emptySet(),
    val stillImageAssetDecodedCount: Int = 0,
    val stillImageAssetDecodedPixelCount: Long = 0,
    val stillImageAssetCompositedCount: Int = 0,
    val stillImageAssetCompositedPixelCount: Long = 0,
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
            val evidenceMessages = mutableListOf<String>()
            if (stillImageAssetCount > 0) {
                val missingSuffix = if (stillImageAssetMissingCount > 0) {
                    ", missing $stillImageAssetMissingCount: ${stillImageAssetMissingKinds.joinToString("/")}"
                } else {
                    ""
                }
                evidenceMessages.add("image assets $stillImageAssetLoadedCount/$stillImageAssetCount, decoded $stillImageAssetDecodedCount, pixels $stillImageAssetDecodedPixelCount, composited $stillImageAssetCompositedCount, pixels $stillImageAssetCompositedPixelCount$missingSuffix")
            }
            if (vrmPoseSummary.sourceCount > 0) {
                evidenceMessages.add("VRM poses ${vrmPoseSummary.activePoseCount}/${vrmPoseSummary.sourceCount} active, payloads ${vrmPoseSummary.posePayloadCount}, missing ${vrmPoseSummary.missingPoseCount}; VRM renderer ${vrmPoseSummary.rendererStatus} ${vrmPoseSummary.rendererBackend}, rendered ${vrmPoseSummary.renderedSourceCount}/${vrmPoseSummary.sourceCount}, models ${vrmPoseSummary.modelLoadedCount}/${vrmPoseSummary.modelUriCount}, bones ${vrmPoseSummary.humanoidBoneCount}, expressions ${vrmPoseSummary.expressionCount}, primitives ${vrmPoseSummary.meshPrimitiveCount}, triangles ${vrmPoseSummary.trianglePrimitiveCount}, unsupported modes ${vrmPoseSummary.unsupportedPrimitiveModeCount}, skinned ${vrmPoseSummary.skinnedMeshPrimitiveCount}, joints ${vrmPoseSummary.skinJointCount}, position accessors ${vrmPoseSummary.positionAccessorCount}, normals ${vrmPoseSummary.normalAccessorCount}, uvs ${vrmPoseSummary.texcoordAccessorCount}, vertices ${vrmPoseSummary.vertexCount}, indices ${vrmPoseSummary.indexCount}, bounds ${vrmPoseSummary.boundsAccessorCount}, skin attrs ${vrmPoseSummary.skinningAttributePrimitiveCount}, morphs ${vrmPoseSummary.morphTargetCount}, materials ${vrmPoseSummary.materialCount}, transparent materials ${vrmPoseSummary.transparentMaterialCount}, textures ${vrmPoseSummary.textureCount}, images ${vrmPoseSummary.imageCount}, unsupported image mimes ${vrmPoseSummary.unsupportedImageMimeCount}, pose bones ${vrmPoseSummary.poseBoneAppliedCount}/${vrmPoseSummary.poseBoneCount}, pose expressions ${vrmPoseSummary.poseExpressionAppliedCount}/${vrmPoseSummary.poseExpressionCount}, failed ${vrmPoseSummary.renderFailureCount}")
            }
            return if (evidenceMessages.isEmpty()) base else "$base; ${evidenceMessages.joinToString("; ")}"
        }
}

object AndroidSceneCompositor {
    fun prepareCanvas(context: Context, renderGraphJson: String): CanvasComposition {
        val renderNodes = parseRenderGraph(renderGraphJson)
            ?: return CanvasComposition(
                result = AndroidCompositionResult(appliedCount = 0, skippedCount = 0, skippedKinds = emptySet(), parseFailed = true),
                overlays = emptyList()
            )
        val vrmPoseSummary = summarizeVrmPosePayloads(context, renderNodes)

        val primaryScreenOrder = renderNodes
            .filter { node -> node.kind == "screen" }
            .minOfOrNull { node -> node.order }
        val underlays = renderNodes
            .filter { node -> node.kind != "screen" && primaryScreenOrder != null && node.order <= primaryScreenOrder }
        val overlays = renderNodes
            .filter { node -> node.kind != "screen" && (primaryScreenOrder == null || node.order > primaryScreenOrder) }
            .sortedBy { node -> node.order }

        var appliedCount = 0
        var skippedCount = underlays.size
        val skippedKinds = underlays.mapTo(linkedSetOf()) { node -> node.kind }
        val stillImageNodes = overlays.filter(::requiresStillImageAsset)
        val stillImageEvidence = linkedMapOf<String, AndroidStillImageAssetEvidence>()
        val canvasOverlays = mutableListOf<CanvasOverlayItem>()

        overlays.forEach { node ->
            val bitmap = createCanvasBitmap(context, node, stillImageEvidence)
            if (bitmap == null) {
                skippedCount += 1
                skippedKinds.add(node.kind)
                return@forEach
            }

            recordStillImageAssetComposited(stillImageEvidence, node)
            canvasOverlays.add(CanvasOverlayItem(bitmap, resolveOverlayTransform(node)))
            appliedCount += 1
        }
        val missingStillImageNodes = stillImageNodes.filter { node ->
            stillImageEvidence[assetEvidenceKey(node)]?.loaded != true
        }

        return CanvasComposition(
            result = AndroidCompositionResult(
                appliedCount = appliedCount,
                skippedCount = skippedCount,
                skippedKinds = skippedKinds,
                stillImageAssetCount = stillImageNodes.size,
                stillImageAssetLoadedCount = stillImageEvidence.values.count { evidence -> evidence.loaded },
                stillImageAssetMissingCount = missingStillImageNodes.size,
                stillImageAssetMissingKinds = missingStillImageNodes.mapTo(linkedSetOf()) { node -> node.kind },
                stillImageAssetDecodedCount = stillImageEvidence.values.count { evidence -> evidence.loaded && evidence.decodedPixelCount > 0 },
                stillImageAssetDecodedPixelCount = stillImageEvidence.values.sumOf { evidence -> evidence.decodedPixelCount },
                stillImageAssetCompositedCount = stillImageEvidence.values.count { evidence -> evidence.loaded && evidence.compositedPixelCount > 0 },
                stillImageAssetCompositedPixelCount = stillImageEvidence.values.sumOf { evidence -> evidence.compositedPixelCount },
                vrmPoseSummary = vrmPoseSummary
            ),
            overlays = canvasOverlays
        )
    }

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
        val stillImageNodes = overlays.filter(::requiresStillImageAsset)
        val stillImageEvidence = linkedMapOf<String, AndroidStillImageAssetEvidence>()

        overlays.forEach { node ->
            val filter = createFilter(context, node, stillImageEvidence)
            if (filter == null) {
                skippedCount += 1
                skippedKinds.add(node.kind)
                return@forEach
            }

            applyTransform(filter, node)
            stream.getGlInterface().addFilter(filter)
            recordStillImageAssetComposited(stillImageEvidence, node)
            appliedCount += 1
        }
        val missingStillImageNodes = stillImageNodes.filter { node ->
            stillImageEvidence[assetEvidenceKey(node)]?.loaded != true
        }

        return AndroidCompositionResult(
            appliedCount = appliedCount,
            skippedCount = skippedCount,
            skippedKinds = skippedKinds,
            stillImageAssetCount = stillImageNodes.size,
            stillImageAssetLoadedCount = stillImageEvidence.values.count { evidence -> evidence.loaded },
            stillImageAssetMissingCount = missingStillImageNodes.size,
            stillImageAssetMissingKinds = missingStillImageNodes.mapTo(linkedSetOf()) { node -> node.kind },
            stillImageAssetDecodedCount = stillImageEvidence.values.count { evidence -> evidence.loaded && evidence.decodedPixelCount > 0 },
            stillImageAssetDecodedPixelCount = stillImageEvidence.values.sumOf { evidence -> evidence.decodedPixelCount },
            stillImageAssetCompositedCount = stillImageEvidence.values.count { evidence -> evidence.loaded && evidence.compositedPixelCount > 0 },
            stillImageAssetCompositedPixelCount = stillImageEvidence.values.sumOf { evidence -> evidence.compositedPixelCount },
            vrmPoseSummary = vrmPoseSummary
        )
    }

    private fun createFilter(
        context: Context,
        node: RenderGraphNode,
        stillImageEvidence: MutableMap<String, AndroidStillImageAssetEvidence>
    ): BaseObjectFilterRender? {
        return when (node.kind) {
            "pngtuber" -> createPngTuberFilter(context, node, stillImageEvidence)
            "text" -> createTextFilter(node)
            "chat" -> createChatFilter(node)
            "solid" -> createSolidFilter(node)
            "image" -> createImageFilter(context, node, stillImageEvidence)
            else -> null
        }
    }

    private fun createPngTuberFilter(
        context: Context,
        node: RenderGraphNode,
        stillImageEvidence: MutableMap<String, AndroidStillImageAssetEvidence>
    ): ImageObjectFilterRender {
        val bitmap = createPngTuberBitmap(context, node, stillImageEvidence)
        return ImageObjectFilterRender().apply {
            setImage(bitmap)
        }
    }

    private fun createPngTuberBitmap(
        context: Context,
        node: RenderGraphNode,
        stillImageEvidence: MutableMap<String, AndroidStillImageAssetEvidence>
    ): Bitmap {
        val imageUri = node.payload.optString("imageUri").trim()
        val motion = parsePngTuberMotion(node)
        val loadedBitmap = if (imageUri.isNotEmpty()) {
            loadBitmap(context, imageUri)
        } else {
            null
        }
        recordStillImageAssetEvidence(stillImageEvidence, node, loadedBitmap)
        val sourceBitmap = loadedBitmap ?: createFallbackPngTuberBitmap(node)
        return createIllustrationRigBitmap(sourceBitmap, motion)
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
        val bitmap = createChatBitmap(node) ?: return null
        return ImageObjectFilterRender().apply {
            setImage(bitmap)
        }
    }

    private fun createChatBitmap(node: RenderGraphNode): Bitmap? {
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

        return bitmap
    }

    private fun createSolidFilter(node: RenderGraphNode): ImageObjectFilterRender {
        val bitmap = createSolidBitmap(node)
        return ImageObjectFilterRender().apply {
            setImage(bitmap)
        }
    }

    private fun createSolidBitmap(node: RenderGraphNode): Bitmap {
        val color = parseColor(node.payload.optString("color"), Color.TRANSPARENT)
        return Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888).apply {
            eraseColor(color)
        }
    }

    private fun createImageFilter(
        context: Context,
        node: RenderGraphNode,
        stillImageEvidence: MutableMap<String, AndroidStillImageAssetEvidence>
    ): ImageObjectFilterRender? {
        val bitmap = createImageBitmap(context, node, stillImageEvidence) ?: return null
        return ImageObjectFilterRender().apply {
            setImage(bitmap)
        }
    }

    private fun createImageBitmap(
        context: Context,
        node: RenderGraphNode,
        stillImageEvidence: MutableMap<String, AndroidStillImageAssetEvidence>
    ): Bitmap? {
        val uri = node.payload.optString("uri").trim()
        if (uri.isEmpty()) {
            recordStillImageAssetEvidence(stillImageEvidence, node, null)
            return null
        }

        val bitmap = loadBitmap(context, uri)
        recordStillImageAssetEvidence(stillImageEvidence, node, bitmap)
        if (bitmap == null) {
            return null
        }
        return bitmap
    }

    private fun applyTransform(filter: BaseObjectFilterRender, node: RenderGraphNode) {
        val resolved = resolveOverlayTransform(node)
        filter.setScale(
            resolved.width * 100f,
            resolved.height * 100f
        )
        filter.setPosition(
            resolved.x * 100f,
            resolved.y * 100f
        )
        filter.setRotation(resolved.rotation.roundToInt())
        filter.setAlpha(resolved.opacity)
    }

    private fun createCanvasBitmap(
        context: Context,
        node: RenderGraphNode,
        stillImageEvidence: MutableMap<String, AndroidStillImageAssetEvidence>
    ): Bitmap? =
        when (node.kind) {
            "pngtuber" -> createPngTuberBitmap(context, node, stillImageEvidence)
            "text" -> createTextBitmap(node)
            "chat" -> createChatBitmap(node)
            "solid" -> createSolidBitmap(node)
            "image" -> createImageBitmap(context, node, stillImageEvidence)
            else -> null
        }

    private fun createTextBitmap(node: RenderGraphNode): Bitmap? {
        val text = node.payload.optString("text").trim()
        if (text.isEmpty()) {
            return null
        }

        val bitmap = Bitmap.createBitmap(960, 240, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.color = parseColor(node.payload.optString("color"), Color.WHITE)
        paint.textSize = node.payload.optDouble("fontSize", 36.0).toFloat().coerceIn(8f, 220f)
        paint.isFakeBoldText = true
        paint.setShadowLayer(6f, 0f, 3f, Color.argb(210, 0, 0, 0))
        val baseline = 120f - (paint.descent() + paint.ascent()) * 0.5f
        canvas.drawText(ellipsize(text.take(240), paint, 900f), 30f, baseline, paint)
        return bitmap
    }

    private fun resolveOverlayTransform(node: RenderGraphNode): ResolvedOverlayTransform {
        val transform = node.transform
        val isPngTuber = node.kind == "pngtuber"
        val motion = if (isPngTuber) parsePngTuberMotion(node) else PngTuberMotion()
        val width = transform.width.coerceIn(0.01f, 1f)
        val height = transform.height.coerceIn(0.01f, 1f)
        val scaledWidth = (width * motion.scaleX).coerceIn(0.01f, 1f)
        val scaledHeight = (height * motion.scaleY).coerceIn(0.01f, 1f)
        val centeredX = transform.x + motion.offsetX + (width - scaledWidth) * 0.5f
        val centeredY = transform.y + motion.offsetY + (height - scaledHeight) * 0.5f

        return ResolvedOverlayTransform(
            x = centeredX.coerceIn(0f, 1f),
            y = centeredY.coerceIn(0f, 1f),
            width = scaledWidth,
            height = scaledHeight,
            rotation = (transform.rotation + motion.rotation).coerceIn(-180f, 180f),
            opacity = transform.opacity.coerceIn(0f, 1f)
        )
    }

    class CanvasComposition internal constructor(
        val result: AndroidCompositionResult,
        private val overlays: List<CanvasOverlayItem>
    ) {
        private val screenPaint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)
        private val overlayPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)

        fun draw(
            canvas: Canvas,
            screenBitmap: Bitmap?,
            screenSource: Rect?,
            targetWidth: Int,
            targetHeight: Int
        ) {
            canvas.drawColor(Color.BLACK)
            if (screenBitmap != null) {
                val source = screenSource ?: Rect(0, 0, screenBitmap.width, screenBitmap.height)
                canvas.drawBitmap(
                    screenBitmap,
                    source,
                    RectF(0f, 0f, targetWidth.toFloat(), targetHeight.toFloat()),
                    screenPaint
                )
            }

            overlays.forEach { overlay ->
                val transform = overlay.transform
                val left = transform.x * targetWidth
                val top = transform.y * targetHeight
                val right = left + transform.width * targetWidth
                val bottom = top + transform.height * targetHeight
                val destination = RectF(left, top, right, bottom)
                overlayPaint.alpha = (transform.opacity * 255f).roundToInt().coerceIn(0, 255)
                canvas.save()
                canvas.rotate(transform.rotation, destination.centerX(), destination.centerY())
                canvas.drawBitmap(overlay.bitmap, null, destination, overlayPaint)
                canvas.restore()
            }
            overlayPaint.alpha = 255
        }
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
        var meshPrimitiveCount = 0
        var skinnedMeshPrimitiveCount = 0
        var skinJointCount = 0
        var positionAccessorCount = 0
        var vertexCount = 0
        var indexCount = 0
        var boundsAccessorCount = 0
        var skinningAttributePrimitiveCount = 0
        var trianglePrimitiveCount = 0
        var unsupportedPrimitiveModeCount = 0
        var normalAccessorCount = 0
        var texcoordAccessorCount = 0
        var morphTargetCount = 0
        var materialCount = 0
        var textureCount = 0
        var imageCount = 0
        var unsupportedImageMimeCount = 0
        var transparentMaterialCount = 0
        var poseBoneCount = 0
        var poseBoneAppliedCount = 0
        var poseExpressionCount = 0
        var poseExpressionAppliedCount = 0
        val runtimeStatuses = linkedSetOf<String>()

        vrmNodes.forEach { node ->
            val modelUri = node.payload.optString("modelUri").trim()
            var modelMetadata: AndroidVrmModelMetadata? = null
            if (modelUri.isNotEmpty()) {
                modelUriCount += 1
                val metadata = loadVrmModelMetadata(context, modelUri)
                if (metadata != null) {
                    modelMetadata = metadata
                    modelLoadedCount += 1
                    modelVersions.add(metadata.version)
                    humanoidBoneCount += metadata.humanoidBoneNames.size
                    expressionCount += metadata.expressionNames.size
                    meshPrimitiveCount += metadata.meshPrimitiveCount
                    skinnedMeshPrimitiveCount += metadata.skinnedMeshPrimitiveCount
                    skinJointCount += metadata.skinJointCount
                    positionAccessorCount += metadata.positionAccessorCount
                    vertexCount += metadata.vertexCount
                    indexCount += metadata.indexCount
                    boundsAccessorCount += metadata.boundsAccessorCount
                    skinningAttributePrimitiveCount += metadata.skinningAttributePrimitiveCount
                    trianglePrimitiveCount += metadata.trianglePrimitiveCount
                    unsupportedPrimitiveModeCount += metadata.unsupportedPrimitiveModeCount
                    normalAccessorCount += metadata.normalAccessorCount
                    texcoordAccessorCount += metadata.texcoordAccessorCount
                    morphTargetCount += metadata.morphTargetCount
                    materialCount += metadata.materialCount
                    textureCount += metadata.textureCount
                    imageCount += metadata.imageCount
                    unsupportedImageMimeCount += metadata.unsupportedImageMimeCount
                    transparentMaterialCount += metadata.transparentMaterialCount
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
                    val poseBones = extractVrmPoseBoneNames(pose)
                    val poseExpressions = extractActiveVrmPoseExpressionNames(pose)
                    val appliedBones = modelMetadata?.let { metadata -> poseBones.count { metadata.humanoidBoneNames.contains(it) } } ?: 0
                    val appliedExpressions = modelMetadata?.let { metadata ->
                        poseExpressions.count { metadata.expressionNames.contains(it) }
                    } ?: 0
                    poseBoneCount += poseBones.size
                    poseBoneAppliedCount += appliedBones
                    poseExpressionCount += poseExpressions.size
                    poseExpressionAppliedCount += appliedExpressions
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
            meshPrimitiveCount = meshPrimitiveCount,
            skinnedMeshPrimitiveCount = skinnedMeshPrimitiveCount,
            skinJointCount = skinJointCount,
            positionAccessorCount = positionAccessorCount,
            vertexCount = vertexCount,
            indexCount = indexCount,
            boundsAccessorCount = boundsAccessorCount,
            skinningAttributePrimitiveCount = skinningAttributePrimitiveCount,
            trianglePrimitiveCount = trianglePrimitiveCount,
            unsupportedPrimitiveModeCount = unsupportedPrimitiveModeCount,
            normalAccessorCount = normalAccessorCount,
            texcoordAccessorCount = texcoordAccessorCount,
            morphTargetCount = morphTargetCount,
            materialCount = materialCount,
            textureCount = textureCount,
            imageCount = imageCount,
            unsupportedImageMimeCount = unsupportedImageMimeCount,
            transparentMaterialCount = transparentMaterialCount,
            poseBoneCount = poseBoneCount,
            poseBoneAppliedCount = poseBoneAppliedCount,
            poseBoneUnsupportedCount = (poseBoneCount - poseBoneAppliedCount).coerceAtLeast(0),
            poseExpressionCount = poseExpressionCount,
            poseExpressionAppliedCount = poseExpressionAppliedCount,
            poseExpressionUnsupportedCount = (poseExpressionCount - poseExpressionAppliedCount).coerceAtLeast(0),
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
        val renderability = summarizeVrmGlbRenderability(root)
        return when {
            vrm1 != null -> AndroidVrmModelMetadata(
                version = "1.0",
                humanoidBoneNames = extractVrm1HumanoidBoneNames(vrm1),
                expressionNames = extractVrm1ExpressionNames(vrm1),
                meshPrimitiveCount = renderability.meshPrimitiveCount,
                skinnedMeshPrimitiveCount = renderability.skinnedMeshPrimitiveCount,
                skinJointCount = renderability.skinJointCount,
                positionAccessorCount = renderability.positionAccessorCount,
                vertexCount = renderability.vertexCount,
                indexCount = renderability.indexCount,
                boundsAccessorCount = renderability.boundsAccessorCount,
                skinningAttributePrimitiveCount = renderability.skinningAttributePrimitiveCount,
                trianglePrimitiveCount = renderability.trianglePrimitiveCount,
                unsupportedPrimitiveModeCount = renderability.unsupportedPrimitiveModeCount,
                normalAccessorCount = renderability.normalAccessorCount,
                texcoordAccessorCount = renderability.texcoordAccessorCount,
                morphTargetCount = renderability.morphTargetCount,
                materialCount = renderability.materialCount,
                textureCount = renderability.textureCount,
                imageCount = renderability.imageCount,
                unsupportedImageMimeCount = renderability.unsupportedImageMimeCount,
                transparentMaterialCount = renderability.transparentMaterialCount
            )
            vrm0 != null -> AndroidVrmModelMetadata(
                version = "0.x",
                humanoidBoneNames = extractVrm0HumanoidBoneNames(vrm0),
                expressionNames = extractVrm0ExpressionNames(vrm0),
                meshPrimitiveCount = renderability.meshPrimitiveCount,
                skinnedMeshPrimitiveCount = renderability.skinnedMeshPrimitiveCount,
                skinJointCount = renderability.skinJointCount,
                positionAccessorCount = renderability.positionAccessorCount,
                vertexCount = renderability.vertexCount,
                indexCount = renderability.indexCount,
                boundsAccessorCount = renderability.boundsAccessorCount,
                skinningAttributePrimitiveCount = renderability.skinningAttributePrimitiveCount,
                trianglePrimitiveCount = renderability.trianglePrimitiveCount,
                unsupportedPrimitiveModeCount = renderability.unsupportedPrimitiveModeCount,
                normalAccessorCount = renderability.normalAccessorCount,
                texcoordAccessorCount = renderability.texcoordAccessorCount,
                morphTargetCount = renderability.morphTargetCount,
                materialCount = renderability.materialCount,
                textureCount = renderability.textureCount,
                imageCount = renderability.imageCount,
                unsupportedImageMimeCount = renderability.unsupportedImageMimeCount,
                transparentMaterialCount = renderability.transparentMaterialCount
            )
            else -> null
        }
    }

    private fun summarizeVrmGlbRenderability(root: JSONObject): AndroidVrmRenderabilityMetadata {
        val meshes = root.optJSONArray("meshes")
        val accessors = root.optJSONArray("accessors")
        val meshPrimitiveCounts = mutableMapOf<Int, Int>()
        var meshPrimitiveCount = 0
        var positionAccessorCount = 0
        var vertexCount = 0
        var indexCount = 0
        var boundsAccessorCount = 0
        var skinningAttributePrimitiveCount = 0
        var trianglePrimitiveCount = 0
        var unsupportedPrimitiveModeCount = 0
        var normalAccessorCount = 0
        var texcoordAccessorCount = 0
        var morphTargetCount = 0
        if (meshes != null) {
            for (meshIndex in 0 until meshes.length()) {
                val primitives = meshes.optJSONObject(meshIndex)?.optJSONArray("primitives")
                val primitiveCount = primitives?.length() ?: 0
                meshPrimitiveCounts[meshIndex] = primitiveCount
                meshPrimitiveCount += primitiveCount
                if (primitives != null) {
                    for (primitiveIndex in 0 until primitives.length()) {
                        val primitive = primitives.optJSONObject(primitiveIndex) ?: continue
                        val attributes = primitive.optJSONObject("attributes")
                        if (primitive.optInt("mode", 4) == 4) {
                            trianglePrimitiveCount += 1
                        } else {
                            unsupportedPrimitiveModeCount += 1
                        }
                        val positionAccessorIndex = attributes?.optInt("POSITION", -1) ?: -1
                        if (positionAccessorIndex >= 0) {
                            val positionAccessor = accessors?.optJSONObject(positionAccessorIndex)
                            positionAccessorCount += 1
                            vertexCount += positionAccessor?.optInt("count", 0) ?: 0
                            val min = positionAccessor?.optJSONArray("min")
                            val max = positionAccessor?.optJSONArray("max")
                            if ((min?.length() ?: 0) >= 3 && (max?.length() ?: 0) >= 3) {
                                boundsAccessorCount += 1
                            }
                        }
                        val normalAccessorIndex = attributes?.optInt("NORMAL", -1) ?: -1
                        if (normalAccessorIndex >= 0 && accessors?.optJSONObject(normalAccessorIndex) != null) {
                            normalAccessorCount += 1
                        }
                        val texcoordAccessorIndex = attributes?.optInt("TEXCOORD_0", -1) ?: -1
                        if (texcoordAccessorIndex >= 0 && accessors?.optJSONObject(texcoordAccessorIndex) != null) {
                            texcoordAccessorCount += 1
                        }
                        val indexAccessorIndex = primitive.optInt("indices", -1)
                        if (indexAccessorIndex >= 0) {
                            indexCount += accessors?.optJSONObject(indexAccessorIndex)?.optInt("count", 0) ?: 0
                        }
                        if (attributes?.has("JOINTS_0") == true && attributes.has("WEIGHTS_0")) {
                            skinningAttributePrimitiveCount += 1
                        }
                        morphTargetCount += primitive.optJSONArray("targets")?.length() ?: 0
                    }
                }
            }
        }

        var skinnedMeshPrimitiveCount = 0
        root.optJSONArray("nodes")?.let { nodes ->
            for (index in 0 until nodes.length()) {
                val node = nodes.optJSONObject(index) ?: continue
                if (node.has("skin")) {
                    val meshIndex = node.optInt("mesh", -1)
                    skinnedMeshPrimitiveCount += meshPrimitiveCounts[meshIndex] ?: 0
                }
            }
        }

        var skinJointCount = 0
        root.optJSONArray("skins")?.let { skins ->
            for (index in 0 until skins.length()) {
                skinJointCount += skins.optJSONObject(index)?.optJSONArray("joints")?.length() ?: 0
            }
        }

        val materials = root.optJSONArray("materials")
        var transparentMaterialCount = 0
        if (materials != null) {
            for (index in 0 until materials.length()) {
                val alphaMode = materials.optJSONObject(index)?.optString("alphaMode", "OPAQUE")
                    ?.trim()
                    ?.uppercase(Locale.US)
                    ?: "OPAQUE"
                if (alphaMode.isNotEmpty() && alphaMode != "OPAQUE") {
                    transparentMaterialCount += 1
                }
            }
        }

        val images = root.optJSONArray("images")
        val imageCount = images?.length() ?: 0
        val unsupportedImageMimeCount = countUnsupportedVrmImageMimes(images)

        return AndroidVrmRenderabilityMetadata(
            meshPrimitiveCount = meshPrimitiveCount,
            skinnedMeshPrimitiveCount = skinnedMeshPrimitiveCount,
            skinJointCount = skinJointCount,
            positionAccessorCount = positionAccessorCount,
            vertexCount = vertexCount,
            indexCount = indexCount,
            boundsAccessorCount = boundsAccessorCount,
            skinningAttributePrimitiveCount = skinningAttributePrimitiveCount,
            trianglePrimitiveCount = trianglePrimitiveCount,
            unsupportedPrimitiveModeCount = unsupportedPrimitiveModeCount,
            normalAccessorCount = normalAccessorCount,
            texcoordAccessorCount = texcoordAccessorCount,
            morphTargetCount = morphTargetCount,
            materialCount = materials?.length() ?: 0,
            textureCount = maxOf(root.optJSONArray("textures")?.length() ?: 0, imageCount),
            imageCount = imageCount,
            unsupportedImageMimeCount = unsupportedImageMimeCount,
            transparentMaterialCount = transparentMaterialCount
        )
    }

    private fun countUnsupportedVrmImageMimes(images: JSONArray?): Int {
        if (images == null) {
            return 0
        }
        var unsupported = 0
        for (index in 0 until images.length()) {
            val image = images.optJSONObject(index) ?: continue
            val mimeType = image.optString("mimeType", "").trim().lowercase(Locale.US)
            val uri = image.optString("uri", "").trim().lowercase(Locale.US)
            val supportedMime = mimeType == "image/png" || mimeType == "image/jpeg"
            val supportedUri = uri.endsWith(".png") || uri.endsWith(".jpg") || uri.endsWith(".jpeg")
            if (!supportedMime && !supportedUri) {
                unsupported += 1
            }
        }
        return unsupported
    }

    private fun extractVrm1HumanoidBoneNames(vrm: JSONObject): Set<String> {
        val humanBones = vrm.optJSONObject("humanoid")?.optJSONObject("humanBones") ?: return emptySet()
        return jsonObjectKeys(humanBones)
    }

    private fun extractVrm0HumanoidBoneNames(vrm: JSONObject): Set<String> {
        val humanBones = vrm.optJSONObject("humanoid")?.optJSONArray("humanBones") ?: return emptySet()
        return buildSet {
            for (index in 0 until humanBones.length()) {
                val bone = humanBones.optJSONObject(index)?.optString("bone")?.trim().orEmpty()
                if (bone.isNotEmpty()) {
                    add(bone)
                }
            }
        }
    }

    private fun extractVrm1ExpressionNames(vrm: JSONObject): Set<String> {
        val expressions = vrm.optJSONObject("expressions") ?: return emptySet()
        return buildSet {
            expressions.optJSONObject("preset")?.let { addAll(jsonObjectKeys(it).map(::normalizeVrmExpressionName)) }
            expressions.optJSONObject("custom")?.let { addAll(jsonObjectKeys(it).map(::normalizeVrmExpressionName)) }
        }
    }

    private fun extractVrm0ExpressionNames(vrm: JSONObject): Set<String> {
        val blendShapeGroups = vrm.optJSONObject("blendShapeMaster")?.optJSONArray("blendShapeGroups") ?: return emptySet()
        return buildSet {
            for (index in 0 until blendShapeGroups.length()) {
                val group = blendShapeGroups.optJSONObject(index) ?: continue
                listOf(group.optString("presetName"), group.optString("name")).forEach { rawName ->
                    val name = normalizeVrmExpressionName(rawName)
                    if (name.isNotEmpty() && name != "unknown") {
                        add(name)
                    }
                }
            }
        }
    }

    private fun extractVrmPoseBoneNames(pose: JSONObject): Set<String> {
        val rotations = pose.optJSONArray("humanoidRotations") ?: return emptySet()
        return buildSet {
            for (index in 0 until rotations.length()) {
                val bone = rotations.optJSONObject(index)?.optString("bone")?.trim().orEmpty()
                if (bone.isNotEmpty()) {
                    add(bone)
                }
            }
        }
    }

    private fun extractActiveVrmPoseExpressionNames(pose: JSONObject): Set<String> {
        val expressions = pose.optJSONObject("expressions") ?: return emptySet()
        return buildSet {
            expressions.keys().forEach { rawName ->
                val name = normalizeVrmExpressionName(rawName)
                val weight = expressions.optDouble(rawName, 0.0)
                if (name.isNotEmpty() && name != "neutral" && weight > 0.001) {
                    add(name)
                }
            }
        }
    }

    private fun jsonObjectKeys(value: JSONObject): Set<String> = buildSet {
        value.keys().forEach { key ->
            val clean = key.trim()
            if (clean.isNotEmpty()) {
                add(clean)
            }
        }
    }

    private fun normalizeVrmExpressionName(rawName: String): String {
        return when (rawName.trim().lowercase(Locale.US)) {
            "a", "aa" -> "aa"
            "i", "ih" -> "ih"
            "u", "ou" -> "ou"
            "e", "ee" -> "ee"
            "o", "oh" -> "oh"
            "joy", "happy" -> "happy"
            "fun", "surprise", "surprised" -> "surprised"
            else -> rawName.trim()
        }
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

    private fun requiresStillImageAsset(node: RenderGraphNode): Boolean =
        node.kind == "pngtuber" || node.kind == "image"

    private fun assetEvidenceKey(node: RenderGraphNode): String = "${node.kind}:${node.id}"

    private fun recordStillImageAssetEvidence(
        stillImageEvidence: MutableMap<String, AndroidStillImageAssetEvidence>,
        node: RenderGraphNode,
        bitmap: Bitmap?
    ) {
        if (!requiresStillImageAsset(node)) {
            return
        }
        stillImageEvidence[assetEvidenceKey(node)] = AndroidStillImageAssetEvidence(
            loaded = bitmap != null,
            decodedPixelCount = bitmap?.let { image -> image.width.toLong() * image.height.toLong() } ?: 0L,
            compositedPixelCount = if (bitmap != null) stillImageEvidence[assetEvidenceKey(node)]?.compositedPixelCount ?: 0L else 0L
        )
    }

    private fun recordStillImageAssetComposited(
        stillImageEvidence: MutableMap<String, AndroidStillImageAssetEvidence>,
        node: RenderGraphNode
    ) {
        if (!requiresStillImageAsset(node)) {
            return
        }
        val key = assetEvidenceKey(node)
        val current = stillImageEvidence[key] ?: return
        if (!current.loaded || current.decodedPixelCount <= 0L) {
            return
        }
        stillImageEvidence[key] = current.copy(compositedPixelCount = current.decodedPixelCount)
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
    val humanoidBoneNames: Set<String>,
    val expressionNames: Set<String>,
    val meshPrimitiveCount: Int,
    val skinnedMeshPrimitiveCount: Int,
    val skinJointCount: Int,
    val positionAccessorCount: Int,
    val vertexCount: Int,
    val indexCount: Int,
    val boundsAccessorCount: Int,
    val skinningAttributePrimitiveCount: Int,
    val trianglePrimitiveCount: Int,
    val unsupportedPrimitiveModeCount: Int,
    val normalAccessorCount: Int,
    val texcoordAccessorCount: Int,
    val morphTargetCount: Int,
    val materialCount: Int,
    val textureCount: Int,
    val imageCount: Int,
    val unsupportedImageMimeCount: Int,
    val transparentMaterialCount: Int
)

private data class AndroidVrmRenderabilityMetadata(
    val meshPrimitiveCount: Int,
    val skinnedMeshPrimitiveCount: Int,
    val skinJointCount: Int,
    val positionAccessorCount: Int,
    val vertexCount: Int,
    val indexCount: Int,
    val boundsAccessorCount: Int,
    val skinningAttributePrimitiveCount: Int,
    val trianglePrimitiveCount: Int,
    val unsupportedPrimitiveModeCount: Int,
    val normalAccessorCount: Int,
    val texcoordAccessorCount: Int,
    val morphTargetCount: Int,
    val materialCount: Int,
    val textureCount: Int,
    val imageCount: Int,
    val unsupportedImageMimeCount: Int,
    val transparentMaterialCount: Int
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

internal data class CanvasOverlayItem(
    val bitmap: Bitmap,
    val transform: ResolvedOverlayTransform
)

internal data class ResolvedOverlayTransform(
    val x: Float,
    val y: Float,
    val width: Float,
    val height: Float,
    val rotation: Float,
    val opacity: Float
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
