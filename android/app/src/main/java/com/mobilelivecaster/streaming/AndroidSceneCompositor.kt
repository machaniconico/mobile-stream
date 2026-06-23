package com.mobilelivecaster.streaming

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
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

            applyTransform(filter, node.transform)
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
            "text" -> createTextFilter(node)
            "solid" -> createSolidFilter(node)
            "image" -> createImageFilter(context, node)
            else -> null
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

    private fun applyTransform(filter: BaseObjectFilterRender, transform: RenderTransform) {
        filter.setScale(
            (transform.width.coerceIn(0.01f, 1f) * 100f),
            (transform.height.coerceIn(0.01f, 1f) * 100f)
        )
        filter.setPosition(
            transform.x.coerceIn(0f, 1f) * 100f,
            transform.y.coerceIn(0f, 1f) * 100f
        )
        filter.setRotation(transform.rotation.coerceIn(-180f, 180f).roundToInt())
        filter.setAlpha(transform.opacity.coerceIn(0f, 1f))
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
