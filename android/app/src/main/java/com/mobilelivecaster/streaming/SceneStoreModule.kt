package com.mobilelivecaster.streaming

import android.app.Activity
import android.content.Context
import android.content.Intent
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

@ReactModule(name = SceneStoreModule.NAME)
class SceneStoreModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "LiveCasterSceneStore"
        private const val PREFS_NAME = "mobile_live_caster_scene_store"
        private const val SCENE_JSON = "scene_json"
        private const val SESSION_SUMMARIES_JSON = "session_summaries_json"
        private const val VALIDATION_RUNS_JSON = "validation_runs_json"
        private const val SCENE_ASSETS_DIR = "scene-assets"
        private const val STILL_IMAGE_PICK_REQUEST_CODE = 42071
    }

    private var pendingPickPromise: Promise? = null
    private var pendingPickFilenameHint = "still-image"
    private val activityEventListener: ActivityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode != STILL_IMAGE_PICK_REQUEST_CODE) {
                return
            }

            val promise = pendingPickPromise ?: return
            val filenameHint = pendingPickFilenameHint
            pendingPickPromise = null
            pendingPickFilenameHint = "still-image"

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
                promise.resolve(copyStillImageAsset(uri, uri.toString(), filenameHint))
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
            promise.resolve(copyStillImageAsset(uri, trimmedUri, filenameHint))
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
        try {
            activity.startActivityForResult(intent, STILL_IMAGE_PICK_REQUEST_CODE)
        } catch (error: Throwable) {
            pendingPickPromise = null
            pendingPickFilenameHint = "still-image"
            promise.reject("scene_asset_picker_failed", error)
        }
    }

    @ReactMethod
    fun saveSessionSummaries(summariesJson: String, promise: Promise) {
        try {
            prefs().edit().putString(SESSION_SUMMARIES_JSON, summariesJson).apply()
            promise.resolve(true)
        } catch (error: Throwable) {
            promise.reject("session_summary_store_save_failed", error)
        }
    }

    @ReactMethod
    fun loadSessionSummaries(promise: Promise) {
        try {
            promise.resolve(prefs().getString(SESSION_SUMMARIES_JSON, null))
        } catch (error: Throwable) {
            promise.reject("session_summary_store_load_failed", error)
        }
    }

    @ReactMethod
    fun clearSessionSummaries(promise: Promise) {
        prefs().edit().remove(SESSION_SUMMARIES_JSON).apply()
        promise.resolve(true)
    }

    @ReactMethod
    fun saveValidationRuns(runsJson: String, promise: Promise) {
        try {
            prefs().edit().putString(VALIDATION_RUNS_JSON, runsJson).apply()
            promise.resolve(true)
        } catch (error: Throwable) {
            promise.reject("validation_run_store_save_failed", error)
        }
    }

    @ReactMethod
    fun loadValidationRuns(promise: Promise) {
        try {
            promise.resolve(prefs().getString(VALIDATION_RUNS_JSON, null))
        } catch (error: Throwable) {
            promise.reject("validation_run_store_load_failed", error)
        }
    }

    @ReactMethod
    fun clearValidationRuns(promise: Promise) {
        prefs().edit().remove(VALIDATION_RUNS_JSON).apply()
        promise.resolve(true)
    }

    private fun prefs() = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun copyStillImageAsset(uri: Uri, rawUri: String, filenameHint: String): String {
        val extension = stillImageExtension(uri, filenameHint)
        val baseName = safeAssetBaseName(assetBaseName(uri, filenameHint))
        val destinationDir = File(reactContext.filesDir, SCENE_ASSETS_DIR)
        destinationDir.mkdirs()
        val destination = File(destinationDir, "$baseName-${UUID.randomUUID()}.$extension")

        openStillImageInputStream(uri, rawUri).use { input ->
            destination.outputStream().use { output ->
                input.copyTo(output)
            }
        }
        return Uri.fromFile(destination).toString()
    }

    private fun openStillImageInputStream(uri: Uri, rawUri: String) = when (uri.scheme?.lowercase()) {
        "content", "file" -> reactContext.contentResolver.openInputStream(uri)
            ?: throw IllegalArgumentException("Still-image asset URI could not be opened")
        null, "" -> FileInputStream(File(rawUri))
        else -> throw IllegalArgumentException("Unsupported still-image asset URI scheme: ${uri.scheme}")
    }

    private fun stillImageExtension(uri: Uri, filenameHint: String): String {
        val typeExtension = runCatching {
            reactContext.contentResolver.getType(uri)?.let { MimeTypeMap.getSingleton().getExtensionFromMimeType(it) }
        }.getOrNull()
        val candidate = listOf(
            typeExtension,
            uri.lastPathSegment?.substringAfterLast('.', missingDelimiterValue = ""),
            filenameHint.substringAfterLast('.', missingDelimiterValue = "")
        ).firstOrNull { !it.isNullOrBlank() } ?: "png"
        return candidate.lowercase().replace(Regex("[^a-z0-9]"), "").ifBlank { "png" }
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
}
