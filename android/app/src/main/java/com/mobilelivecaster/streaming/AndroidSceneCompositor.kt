package com.mobilelivecaster.streaming

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import com.pedro.encoder.input.gl.render.filters.`object`.BaseObjectFilterRender
import com.pedro.encoder.input.gl.render.filters.`object`.ImageObjectFilterRender
import com.pedro.encoder.input.gl.render.filters.`object`.TextObjectFilterRender
import com.pedro.library.generic.GenericStream
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.roundToInt

data class AndroidCompositionResult(
    val appliedCount: Int,
    val skippedCount: Int,
    val skippedKinds: Set<String>,
    val parseFailed: Boolean = false
) {
    val summary: String
        get() = when {
            parseFailed -> "Native composition skipped: invalid render graph"
            appliedCount == 0 && skippedCount == 0 -> "Native composition screen-only"
            skippedCount == 0 -> "Native overlays applied: $appliedCount"
            appliedCount == 0 -> "Native overlays pending: ${skippedKinds.joinToString("/")}"
            else -> "Native overlays applied: $appliedCount, pending: ${skippedKinds.joinToString("/")}"
        }
}

object AndroidSceneCompositor {
    fun apply(context: Context, stream: GenericStream, renderGraphJson: String): AndroidCompositionResult {
        val renderNodes = parseRenderGraph(renderGraphJson)
            ?: return AndroidCompositionResult(appliedCount = 0, skippedCount = 0, skippedKinds = emptySet(), parseFailed = true)

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
            skippedKinds = skippedKinds
        )
    }

    private fun createFilter(context: Context, node: RenderGraphNode): BaseObjectFilterRender? {
        return when (node.kind) {
            "pngtuber" -> createPngTuberFilter(context, node)
            "text" -> createTextFilter(node)
            "solid" -> createSolidFilter(node)
            "image" -> createImageFilter(context, node)
            else -> null
        }
    }

    private fun createPngTuberFilter(context: Context, node: RenderGraphNode): ImageObjectFilterRender {
        val imageUri = node.payload.optString("imageUri").trim()
        val bitmap = if (imageUri.isNotEmpty()) {
            loadBitmap(context, imageUri)
        } else {
            null
        } ?: createFallbackPngTuberBitmap(node)

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
        val motionX = if (isPngTuber) node.payload.optDouble("headX", 0.0).toFloat() * 0.025f else 0f
        val motionY = if (isPngTuber) {
            (
                node.payload.optDouble("headY", 0.0) +
                    node.payload.optDouble("breathing", 0.0) -
                    node.payload.optDouble("bodyBounce", 0.0)
                ).toFloat() * 0.025f
        } else {
            0f
        }
        val motionRotation = if (isPngTuber) {
            (
                node.payload.optDouble("bodyLean", 0.0) * 10.0 +
                    node.payload.optDouble("headRoll", 0.0) * 10.0 +
                    node.payload.optDouble("headYaw", 0.0) * 4.0
                ).toFloat()
        } else {
            0f
        }

        filter.setScale(
            (transform.width.coerceIn(0.01f, 1f) * 100f),
            (transform.height.coerceIn(0.01f, 1f) * 100f)
        )
        filter.setPosition(
            (transform.x + motionX).coerceIn(0f, 1f) * 100f,
            (transform.y + motionY).coerceIn(0f, 1f) * 100f
        )
        filter.setRotation((transform.rotation + motionRotation).coerceIn(-180f, 180f).roundToInt())
        filter.setAlpha(transform.opacity.coerceIn(0f, 1f))
    }

    private fun createFallbackPngTuberBitmap(node: RenderGraphNode): Bitmap {
        val bitmap = Bitmap.createBitmap(720, 960, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val expression = node.payload.optString("expression", "neutral")
        val mouthOpen = node.payload.optDouble("mouthOpen", 0.0).toFloat().coerceIn(0f, 1f)
        val blink = node.payload.optDouble("blink", 0.0).toFloat().coerceIn(0f, 1f)
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
        val eyeHeight = (42f * (1f - blink)).coerceAtLeast(5f)
        canvas.drawOval(RectF(255f, 330f, 305f, 330f + eyeHeight), paint)
        canvas.drawOval(RectF(415f, 330f, 465f, 330f + eyeHeight), paint)

        paint.color = Color.rgb(24, 24, 31)
        val mouthHeight = 18f + mouthOpen * 86f
        canvas.drawOval(RectF(320f, 442f, 400f, 442f + mouthHeight), paint)

        paint.color = Color.argb(210, 248, 250, 252)
        paint.textAlign = Paint.Align.CENTER
        paint.textSize = 42f
        canvas.drawText("PNGTuber", 360f, 930f, paint)

        return bitmap
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
}

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
