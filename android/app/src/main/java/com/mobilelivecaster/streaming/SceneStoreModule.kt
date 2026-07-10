package com.mobilelivecaster.streaming

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.webkit.MimeTypeMap
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.io.File
import java.io.FileInputStream
import java.util.UUID
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import org.json.JSONObject

@ReactModule(name = SceneStoreModule.NAME)
class SceneStoreModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "LiveCasterSceneStore"
        private const val PREFS_NAME = "mobile_live_caster_scene_store"
        private const val SCENE_JSON = "scene_json"
        private const val SESSION_SUMMARIES_JSON = "session_summaries_json"
        private const val SESSION_SUMMARIES_ENCRYPTED = "session_summaries_encrypted_v1"
        private const val SESSION_SUMMARIES_PURPOSE = "session-summaries-v1"
        private const val VALIDATION_RUNS_JSON = "validation_runs_json"
        private const val VALIDATION_RUNS_ENCRYPTED = "validation_runs_encrypted_v1"
        private const val VALIDATION_RUNS_PURPOSE = "validation-runs-v1"
        private const val SCENE_ASSETS_DIR = "scene-assets"
        private const val STILL_IMAGE_PICK_REQUEST_CODE = 42071
        private const val VRM_MODEL_PICK_REQUEST_CODE = 42072
    }

    private var pendingPickPromise: Promise? = null
    private val diagnosticHistoryCipher = DiagnosticHistoryCipher()
    private var pendingPickFilenameHint = "still-image"
    private var pendingPickAssetKind = SceneAssetKind.STILL_IMAGE
    private val activityEventListener: ActivityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode != STILL_IMAGE_PICK_REQUEST_CODE && requestCode != VRM_MODEL_PICK_REQUEST_CODE) {
                return
            }

            val promise = pendingPickPromise ?: return
            val filenameHint = pendingPickFilenameHint
            val assetKind = pendingPickAssetKind
            pendingPickPromise = null
            resetPendingPickerState()

            if (resultCode != Activity.RESULT_OK) {
                promise.resolve(null)
                return
            }

            val uri = data?.data
            if (uri == null) {
                promise.resolve(null)
                return
            }

            runCatching {
                reactContext.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            }

            try {
                promise.resolve(copySceneAsset(uri, uri.toString(), filenameHint, assetKind))
            } catch (error: Throwable) {
                promise.reject("scene_asset_copy_failed", error)
            }
        }
    }

    init {
        reactContext.addActivityEventListener(activityEventListener)
    }

    override fun getName(): String = NAME

    override fun invalidate() {
        reactContext.removeActivityEventListener(activityEventListener)
        super.invalidate()
    }

    @ReactMethod
    fun saveScene(sceneJson: String, promise: Promise) {
        try {
            prefs().edit().putString(SCENE_JSON, sceneJson).apply()
            promise.resolve(true)
        } catch (error: Throwable) {
            promise.reject("scene_store_save_failed", error)
        }
    }

    @ReactMethod
    fun loadScene(promise: Promise) {
        try {
            promise.resolve(prefs().getString(SCENE_JSON, null))
        } catch (error: Throwable) {
            promise.reject("scene_store_load_failed", error)
        }
    }

    @ReactMethod
    fun clearScene(promise: Promise) {
        prefs().edit().remove(SCENE_JSON).apply()
        promise.resolve(true)
    }

    @ReactMethod
    fun prepareStillImageAsset(sourceUri: String, filenameHint: String, promise: Promise) {
        val trimmedUri = sourceUri.trim()
        if (trimmedUri.isEmpty()) {
            promise.reject("scene_asset_empty_uri", "Still-image asset URI is empty")
            return
        }

        try {
            val uri = Uri.parse(trimmedUri)
            promise.resolve(copySceneAsset(uri, trimmedUri, filenameHint, SceneAssetKind.STILL_IMAGE))
        } catch (error: Throwable) {
            promise.reject("scene_asset_copy_failed", error)
        }
    }

    @ReactMethod
    fun pickStillImageAsset(filenameHint: String, promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("scene_asset_picker_unavailable", "No Activity is available to present the image picker")
            return
        }
        if (pendingPickPromise != null) {
            promise.reject("scene_asset_picker_busy", "A still-image picker is already open")
            return
        }

        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "image/*"
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }

        pendingPickPromise = promise
        pendingPickFilenameHint = filenameHint.trim().ifBlank { "still-image" }
        pendingPickAssetKind = SceneAssetKind.STILL_IMAGE
        try {
            activity.startActivityForResult(intent, STILL_IMAGE_PICK_REQUEST_CODE)
        } catch (error: Throwable) {
            resetPendingPickerState()
            promise.reject("scene_asset_picker_failed", error)
        }
    }

    @ReactMethod
    fun analyzeStillImageAsset(sourceUri: String, promise: Promise) {
        val trimmedUri = sourceUri.trim()
        if (trimmedUri.isEmpty()) {
            promise.resolve(null)
            return
        }

        var bitmap: Bitmap? = null
        var scaledBitmap: Bitmap? = null
        try {
            bitmap = decodeStillImageBitmap(trimmedUri)
            if (bitmap == null) {
                promise.resolve(null)
                return
            }
            scaledBitmap = scaleStillImageBitmapForAnalysis(bitmap)
            if (scaledBitmap !== bitmap) {
                bitmap?.recycle()
                bitmap = null
            }
            val result = analyzeStillImageBitmap(scaledBitmap)
            promise.resolve(result?.toString())
        } catch (error: Throwable) {
            promise.reject("scene_asset_analysis_failed", error)
        } finally {
            scaledBitmap?.let {
                if (!it.isRecycled) {
                    it.recycle()
                }
            }
            bitmap?.let {
                if (it !== scaledBitmap && !it.isRecycled) {
                    it.recycle()
                }
            }
        }
    }

    @ReactMethod
    fun prepareVrmModelAsset(sourceUri: String, filenameHint: String, promise: Promise) {
        val trimmedUri = sourceUri.trim()
        if (trimmedUri.isEmpty()) {
            promise.reject("scene_asset_empty_uri", "VRM model asset URI is empty")
            return
        }

        try {
            val uri = Uri.parse(trimmedUri)
            promise.resolve(copySceneAsset(uri, trimmedUri, filenameHint, SceneAssetKind.VRM_MODEL))
        } catch (error: Throwable) {
            promise.reject("scene_asset_copy_failed", error)
        }
    }

    @ReactMethod
    fun pickVrmModelAsset(filenameHint: String, promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("scene_asset_picker_unavailable", "No Activity is available to present the VRM model picker")
            return
        }
        if (pendingPickPromise != null) {
            promise.reject("scene_asset_picker_busy", "A scene asset picker is already open")
            return
        }

        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(
                Intent.EXTRA_MIME_TYPES,
                arrayOf("model/gltf-binary", "application/octet-stream", "application/x-vrm", "application/vnd.vrm")
            )
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }

        pendingPickPromise = promise
        pendingPickFilenameHint = filenameHint.trim().ifBlank { "avatar.vrm" }
        pendingPickAssetKind = SceneAssetKind.VRM_MODEL
        try {
            activity.startActivityForResult(intent, VRM_MODEL_PICK_REQUEST_CODE)
        } catch (error: Throwable) {
            resetPendingPickerState()
            promise.reject("scene_asset_picker_failed", error)
        }
    }

    @ReactMethod
    fun saveSessionSummaries(summariesJson: String, promise: Promise) {
        try {
            saveDiagnosticHistory(
                SESSION_SUMMARIES_ENCRYPTED,
                SESSION_SUMMARIES_JSON,
                SESSION_SUMMARIES_PURPOSE,
                summariesJson
            )
            promise.resolve(true)
        } catch (error: Throwable) {
            promise.reject("session_summary_store_save_failed", error)
        }
    }

    @ReactMethod
    fun loadSessionSummaries(promise: Promise) {
        try {
            promise.resolve(
                loadDiagnosticHistory(
                    SESSION_SUMMARIES_ENCRYPTED,
                    SESSION_SUMMARIES_JSON,
                    SESSION_SUMMARIES_PURPOSE
                )
            )
        } catch (error: Throwable) {
            promise.reject("session_summary_store_load_failed", error)
        }
    }

    @ReactMethod
    fun clearSessionSummaries(promise: Promise) {
        try {
            clearDiagnosticHistory(SESSION_SUMMARIES_ENCRYPTED, SESSION_SUMMARIES_JSON)
            promise.resolve(true)
        } catch (error: Throwable) {
            promise.reject("session_summary_store_clear_failed", error)
        }
    }

    @ReactMethod
    fun saveValidationRuns(runsJson: String, promise: Promise) {
        try {
            saveDiagnosticHistory(
                VALIDATION_RUNS_ENCRYPTED,
                VALIDATION_RUNS_JSON,
                VALIDATION_RUNS_PURPOSE,
                runsJson
            )
            promise.resolve(true)
        } catch (error: Throwable) {
            promise.reject("validation_run_store_save_failed", error)
        }
    }

    @ReactMethod
    fun loadValidationRuns(promise: Promise) {
        try {
            promise.resolve(
                loadDiagnosticHistory(
                    VALIDATION_RUNS_ENCRYPTED,
                    VALIDATION_RUNS_JSON,
                    VALIDATION_RUNS_PURPOSE
                )
            )
        } catch (error: Throwable) {
            promise.reject("validation_run_store_load_failed", error)
        }
    }

    @ReactMethod
    fun clearValidationRuns(promise: Promise) {
        try {
            clearDiagnosticHistory(VALIDATION_RUNS_ENCRYPTED, VALIDATION_RUNS_JSON)
            promise.resolve(true)
        } catch (error: Throwable) {
            promise.reject("validation_run_store_clear_failed", error)
        }
    }

    private fun prefs() = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun saveDiagnosticHistory(encryptedKey: String, legacyKey: String, purpose: String, plaintext: String) {
        val envelope = diagnosticHistoryCipher.encrypt(plaintext, purpose)
        check(prefs().edit().putString(encryptedKey, envelope).remove(legacyKey).commit()) {
            "Encrypted diagnostic history could not be committed"
        }
    }

    private fun loadDiagnosticHistory(encryptedKey: String, legacyKey: String, purpose: String): String? {
        val preferences = prefs()
        val encrypted = preferences.getString(encryptedKey, null)
        if (encrypted != null) {
            return diagnosticHistoryCipher.decrypt(encrypted, purpose)
        }
        val legacy = preferences.getString(legacyKey, null) ?: return null
        val envelope = diagnosticHistoryCipher.encrypt(legacy, purpose)
        check(preferences.edit().putString(encryptedKey, envelope).remove(legacyKey).commit()) {
            "Legacy diagnostic history could not be migrated"
        }
        return legacy
    }

    private fun clearDiagnosticHistory(encryptedKey: String, legacyKey: String) {
        check(prefs().edit().remove(encryptedKey).remove(legacyKey).commit()) {
            "Diagnostic history could not be cleared"
        }
    }

    private fun copySceneAsset(uri: Uri, rawUri: String, filenameHint: String, assetKind: SceneAssetKind): String {
        val extension = assetExtension(uri, filenameHint, assetKind)
        val baseName = safeAssetBaseName(assetBaseName(uri, filenameHint))
        val destinationDir = File(reactContext.filesDir, SCENE_ASSETS_DIR)
        destinationDir.mkdirs()
        val destination = File(destinationDir, "$baseName-${UUID.randomUUID()}.$extension")

        openSceneAssetInputStream(uri, rawUri, assetKind).use { input ->
            destination.outputStream().use { output ->
                input.copyTo(output)
            }
        }
        return Uri.fromFile(destination).toString()
    }

    private fun openSceneAssetInputStream(uri: Uri, rawUri: String, assetKind: SceneAssetKind) = when (uri.scheme?.lowercase()) {
        "content", "file" -> reactContext.contentResolver.openInputStream(uri)
            ?: throw IllegalArgumentException("${assetKind.label} asset URI could not be opened")
        null, "" -> FileInputStream(File(rawUri))
        else -> throw IllegalArgumentException("Unsupported ${assetKind.label} asset URI scheme: ${uri.scheme}")
    }

    private fun decodeStillImageBitmap(rawUri: String): Bitmap? {
        val uri = Uri.parse(rawUri)
        val orientation = readStillImageExifOrientation(uri, rawUri)
        val bounds = BitmapFactory.Options().apply {
            inJustDecodeBounds = true
        }
        openSceneAssetInputStream(uri, rawUri, SceneAssetKind.STILL_IMAGE).use { input ->
            BitmapFactory.decodeStream(input, null, bounds)
        }
        val decodeOptions = BitmapFactory.Options().apply {
            inPreferredConfig = Bitmap.Config.ARGB_8888
            inSampleSize = stillImageAnalysisSampleSize(bounds.outWidth, bounds.outHeight)
        }
        val bitmap = openSceneAssetInputStream(uri, rawUri, SceneAssetKind.STILL_IMAGE).use { input ->
            BitmapFactory.decodeStream(input, null, decodeOptions)
        }
        return applyExifOrientation(bitmap, orientation)
    }

    private fun stillImageAnalysisSampleSize(width: Int, height: Int): Int {
        val maxAnalysisSize = 512
        var sampleSize = 1
        val maxDimension = max(width, height)
        if (maxDimension <= 0) {
            return sampleSize
        }
        while (maxDimension / (sampleSize * 2) >= maxAnalysisSize) {
            sampleSize *= 2
        }
        return sampleSize
    }

    private fun readStillImageExifOrientation(uri: Uri, rawUri: String): Int = runCatching {
        openSceneAssetInputStream(uri, rawUri, SceneAssetKind.STILL_IMAGE).use { input ->
            ExifInterface(input).getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            )
        }
    }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)

    private fun applyExifOrientation(bitmap: Bitmap?, orientation: Int): Bitmap? {
        if (bitmap == null) {
            return null
        }
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> {
                matrix.postRotate(90f)
                matrix.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_TRANSVERSE -> {
                matrix.postRotate(270f)
                matrix.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            else -> return bitmap
        }
        return runCatching {
            val oriented = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            if (oriented != bitmap) {
                bitmap.recycle()
            }
            oriented
        }.getOrElse {
            bitmap
        }
    }

    private fun scaleStillImageBitmapForAnalysis(bitmap: Bitmap): Bitmap {
        val maxAnalysisSize = 512
        val maxDimension = max(bitmap.width, bitmap.height)
        if (maxDimension <= maxAnalysisSize) {
            return bitmap
        }
        val scale = maxAnalysisSize.toDouble() / maxDimension.toDouble()
        val width = max(1, (bitmap.width * scale).toInt())
        val height = max(1, (bitmap.height * scale).toInt())
        return Bitmap.createScaledBitmap(bitmap, width, height, true)
    }

    private fun analyzeStillImageBitmap(bitmap: Bitmap): JSONObject? {
        val width = bitmap.width
        val height = bitmap.height
        if (width <= 0 || height <= 0) {
            return null
        }
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
        val sampleStep = max(1, ceil(max(width, height) / 512.0).toInt())
        val bounds = analyzeForegroundBounds(pixels, width, height, sampleStep)
        val imageAspectRatio = width.toDouble() / height.toDouble()
        val imageAnalysis = JSONObject()
            .put("imageAspectRatio", imageAspectRatio)
            .put("foregroundBounds", bounds?.toJson())
            .put("foregroundCoverage", bounds?.foregroundCoverage ?: 0.0)
            .put("confidence", bounds?.confidence ?: 0.0)
        val result = JSONObject()
            .put("imageAspectRatio", imageAspectRatio)
            .put("imageAnalysis", imageAnalysis)
        val landmarkAnalysis = createPixelFeatureLandmarks(pixels, width, height, sampleStep, bounds)
        if (landmarkAnalysis != null) {
            result.put("landmarkAnalysis", landmarkAnalysis)
        }
        return result
    }

    private fun analyzeForegroundBounds(
        pixels: IntArray,
        width: Int,
        height: Int,
        sampleStep: Int
    ): NativeRigBounds? {
        var minX = width
        var maxX = -1
        var minY = height
        var maxY = -1
        var foregroundSamples = 0
        var totalSamples = 0
        for (y in 0 until height step sampleStep) {
            for (x in 0 until width step sampleStep) {
                totalSamples += 1
                if (alphaOf(pixels[y * width + x]) <= 16) {
                    continue
                }
                foregroundSamples += 1
                minX = min(minX, x)
                maxX = max(maxX, x)
                minY = min(minY, y)
                maxY = max(maxY, y)
            }
        }
        if (foregroundSamples == 0 || totalSamples == 0) {
            return null
        }
        val left = minX.toDouble() / width.toDouble()
        val right = min(1.0, (maxX + sampleStep).toDouble() / width.toDouble())
        val top = minY.toDouble() / height.toDouble()
        val bottom = min(1.0, (maxY + sampleStep).toDouble() / height.toDouble())
        val foregroundCoverage = foregroundSamples.toDouble() / totalSamples.toDouble()
        val boundWidth = max(0.0, right - left)
        val boundHeight = max(0.0, bottom - top)
        return NativeRigBounds(
            left = left,
            right = right,
            top = top,
            bottom = bottom,
            width = boundWidth,
            height = boundHeight,
            foregroundCoverage = foregroundCoverage,
            confidence = clamp01(if (boundWidth * boundHeight > 0.0) foregroundCoverage / max(boundWidth * boundHeight, 0.01) else 0.0)
        )
    }

    private fun createPixelFeatureLandmarks(
        pixels: IntArray,
        width: Int,
        height: Int,
        sampleStep: Int,
        bounds: NativeRigBounds?
    ): JSONObject? {
        val activeBounds = bounds ?: NativeRigBounds(0.0, 1.0, 0.0, 1.0, 1.0, 1.0, 1.0, 0.0)
        if (activeBounds.width < 0.08 || activeBounds.height < 0.18) {
            return null
        }
        val minX = max(0, (activeBounds.left * width).toInt())
        val maxX = min(width - 1, ceil(activeBounds.right * width).toInt())
        val minY = max(0, ((activeBounds.top + activeBounds.height * 0.12) * height).toInt())
        val maxY = min(height - 1, ceil((activeBounds.top + activeBounds.height * 0.78) * height).toInt())
        val candidates = mutableListOf<NativeRigFeatureCandidate>()
        var foregroundSamples = 0
        var darkSamples = 0
        for (y in minY..maxY step sampleStep) {
            for (x in minX..maxX step sampleStep) {
                val pixel = pixels[y * width + x]
                if (alphaOf(pixel) <= 16) {
                    continue
                }
                foregroundSamples += 1
                val red = redOf(pixel)
                val green = greenOf(pixel)
                val blue = blueOf(pixel)
                val luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
                val saturation = rgbSaturation(red, green, blue)
                val darkStroke = luma <= 112.0
                val saturatedStroke = saturation >= 0.36 && luma <= 154.0
                if (!darkStroke && !saturatedStroke) {
                    continue
                }
                darkSamples += 1
                candidates.add(
                    NativeRigFeatureCandidate(
                        x = clamp01((x + sampleStep / 2.0) / width.toDouble()),
                        y = clamp01((y + sampleStep / 2.0) / height.toDouble()),
                        weight = clamp01((255.0 - luma) / 255.0 + saturation * 0.18)
                    )
                )
            }
        }
        if (foregroundSamples == 0 || candidates.size < 8 || darkSamples.toDouble() / foregroundSamples.toDouble() > 0.42) {
            return null
        }
        val eyeLine = findFeatureLine(
            candidates,
            activeBounds.top + activeBounds.height * 0.16,
            activeBounds.top + activeBounds.height * 0.52,
            height,
            sampleStep
        ) ?: return null
        val mouthLine = findFeatureLine(
            candidates,
            max(activeBounds.top + activeBounds.height * 0.36, eyeLine.y + max(0.08, activeBounds.height * 0.12)),
            activeBounds.top + activeBounds.height * 0.76,
            height,
            sampleStep
        ) ?: return null
        val eyeMouthGap = mouthLine.y - eyeLine.y
        if (eyeMouthGap < 0.1 || eyeMouthGap > 0.34) {
            return null
        }
        val centerX = activeBounds.left + activeBounds.width / 2.0
        val leftEye = createFeaturePoint(eyeLine.candidates.filter { it.x <= centerX })
        val rightEye = createFeaturePoint(eyeLine.candidates.filter { it.x > centerX })
        val mouthCenter = createFeaturePoint(mouthLine.candidates) ?: return null
        if (leftEye == null && rightEye == null) {
            return null
        }
        val eyePairSpread = if (leftEye != null && rightEye != null) {
            clamp01((rightEye.x - leftEye.x) / max(activeBounds.width * 0.28, Double.MIN_VALUE))
        } else {
            0.45
        }
        val lineStrength = clamp01((eyeLine.weight + mouthLine.weight) / max(candidates.size * 0.34, 1.0))
        val confidence = clamp01(0.56 + lineStrength * 0.24 + eyePairSpread * 0.12 + clamp01(eyeMouthGap / 0.2) * 0.08)
        return JSONObject()
            .put("confidence", confidence)
            .put("faceCenter", NativeRigPoint(mouthCenter.x, clamp(eyeLine.y + eyeMouthGap * 0.44, activeBounds.top + 0.08, activeBounds.bottom - 0.08), confidence).toJson())
            .put("leftEye", leftEye?.copy(confidence = confidence)?.toJson())
            .put("rightEye", rightEye?.copy(confidence = confidence)?.toJson())
            .put("mouthCenter", mouthCenter.copy(confidence = confidence).toJson())
            .put("hairLineY", clamp01(max(activeBounds.top, eyeLine.y - eyeMouthGap * 0.85)))
            .put("shoulderLineY", clamp01(min(activeBounds.bottom, mouthLine.y + eyeMouthGap * 1.45)))
    }

    private fun findFeatureLine(
        candidates: List<NativeRigFeatureCandidate>,
        minY: Double,
        maxY: Double,
        imageHeight: Int,
        sampleStep: Int
    ): NativeRigFeatureLine? {
        val rows = mutableMapOf<Int, NativeRigFeatureRow>()
        candidates.forEach { candidate ->
            if (candidate.y < minY || candidate.y > maxY) {
                return@forEach
            }
            val rowKey = ((candidate.y * imageHeight.toDouble()) / max(1, sampleStep).toDouble()).toInt()
            val row = rows[rowKey] ?: NativeRigFeatureRow()
            row.y = (row.y * row.count.toDouble() + candidate.y) / (row.count + 1).toDouble()
            row.weight += candidate.weight
            row.count += 1
            rows[rowKey] = row
        }
        if (rows.isEmpty()) {
            return null
        }
        val peak = rows.values.maxByOrNull { it.weight } ?: return null
        val searchedRowCount = max(1, ceil(((maxY - minY) * imageHeight) / max(1, sampleStep).toDouble()).toInt())
        val averageWeight = rows.values.sumOf { it.weight } / searchedRowCount.toDouble()
        if (peak.count < 2 || peak.weight < averageWeight * 1.45) {
            return null
        }
        val band = max(0.012, (sampleStep / max(imageHeight, 1).toDouble()) * 2.5)
        val lineCandidates = candidates.filter { kotlin.math.abs(it.y - peak.y) <= band }
        val lineWeight = lineCandidates.sumOf { it.weight }
        if (lineCandidates.size < 2 || lineWeight <= 0.0) {
            return null
        }
        return NativeRigFeatureLine(
            y = lineCandidates.sumOf { it.y * it.weight } / lineWeight,
            weight = lineWeight,
            candidates = lineCandidates
        )
    }

    private fun createFeaturePoint(candidates: List<NativeRigFeatureCandidate>): NativeRigPoint? {
        val weight = candidates.sumOf { it.weight }
        if (candidates.isEmpty() || weight <= 0.0) {
            return null
        }
        return NativeRigPoint(
            x = clamp01(candidates.sumOf { it.x * it.weight } / weight),
            y = clamp01(candidates.sumOf { it.y * it.weight } / weight),
            confidence = clamp01(0.55 + min(0.4, weight / 18.0))
        )
    }

    private fun assetExtension(uri: Uri, filenameHint: String, assetKind: SceneAssetKind): String {
        val typeExtension = runCatching {
            reactContext.contentResolver.getType(uri)?.let { MimeTypeMap.getSingleton().getExtensionFromMimeType(it) }
        }.getOrNull()
        val candidate = listOf(
            typeExtension,
            uri.lastPathSegment?.substringAfterLast('.', missingDelimiterValue = ""),
            filenameHint.substringAfterLast('.', missingDelimiterValue = "")
        ).firstOrNull { !it.isNullOrBlank() } ?: assetKind.fallbackExtension
        val extension = candidate.lowercase().replace(Regex("[^a-z0-9]"), "").ifBlank { assetKind.fallbackExtension }
        if (assetKind == SceneAssetKind.VRM_MODEL && extension != "vrm" && extension != "glb") {
            throw IllegalArgumentException("VRM model asset must be a .vrm or .glb file")
        }
        return extension
    }

    private fun assetBaseName(uri: Uri, filenameHint: String): String =
        uri.lastPathSegment
            ?.substringAfterLast('/')
            ?.substringBeforeLast('.', missingDelimiterValue = "")
            ?.takeIf { it.isNotBlank() }
            ?: filenameHint.substringBeforeLast('.', missingDelimiterValue = filenameHint)

    private fun safeAssetBaseName(value: String): String {
        val sanitized = value.replace(Regex("[^A-Za-z0-9_-]"), "-").trim('-', '_').take(48)
        return sanitized.ifBlank { "still-image" }
    }

    private fun resetPendingPickerState() {
        pendingPickPromise = null
        pendingPickFilenameHint = "still-image"
        pendingPickAssetKind = SceneAssetKind.STILL_IMAGE
    }
}

private enum class SceneAssetKind(val label: String, val fallbackExtension: String) {
    STILL_IMAGE("Still-image", "png"),
    VRM_MODEL("VRM model", "vrm")
}

private data class NativeRigBounds(
    val left: Double,
    val right: Double,
    val top: Double,
    val bottom: Double,
    val width: Double,
    val height: Double,
    val foregroundCoverage: Double,
    val confidence: Double
) {
    fun toJson(): JSONObject = JSONObject()
        .put("left", left)
        .put("right", right)
        .put("top", top)
        .put("bottom", bottom)
        .put("width", width)
        .put("height", height)
}

private data class NativeRigFeatureCandidate(
    val x: Double,
    val y: Double,
    val weight: Double
)

private data class NativeRigFeatureLine(
    val y: Double,
    val weight: Double,
    val candidates: List<NativeRigFeatureCandidate>
)

private data class NativeRigPoint(
    val x: Double,
    val y: Double,
    val confidence: Double
) {
    fun toJson(): JSONObject = JSONObject()
        .put("x", x)
        .put("y", y)
        .put("confidence", confidence)
}

private class NativeRigFeatureRow {
    var y: Double = 0.0
    var weight: Double = 0.0
    var count: Int = 0
}

private fun alphaOf(pixel: Int): Int = pixel ushr 24 and 0xff

private fun redOf(pixel: Int): Int = pixel shr 16 and 0xff

private fun greenOf(pixel: Int): Int = pixel shr 8 and 0xff

private fun blueOf(pixel: Int): Int = pixel and 0xff

private fun rgbSaturation(red: Int, green: Int, blue: Int): Double {
    val maxValue = max(red, max(green, blue)).toDouble()
    val minValue = min(red, min(green, blue)).toDouble()
    return if (maxValue <= 0.0) 0.0 else clamp01((maxValue - minValue) / maxValue)
}

private fun clamp01(value: Double): Double = clamp(value, 0.0, 1.0)

private fun clamp(value: Double, minValue: Double, maxValue: Double): Double = max(minValue, min(maxValue, value))
