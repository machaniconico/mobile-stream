package com.mobilelivecaster.streaming

import android.app.Activity
import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import com.facebook.react.bridge.Arguments
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

@ReactModule(name = LiveCasterNativeModule.NAME)
class LiveCasterNativeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private data class PendingCaptureStart(
        val promise: Promise,
        val preparationGeneration: Long
    )

    companion object {
        const val NAME = "LiveCasterNative"
        private const val START_PERMISSIONS_REQUEST = 7302
    }

    private val captureConsentRequestGuard = CaptureConsentRequestGuard<PendingCaptureStart>()
    private var permissionPromise: Promise? = null
    private val sessionListener: (WritableMap) -> Unit = { snapshot ->
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("LiveCasterSnapshot", snapshot)
        }
    }

    private val permissionListener = PermissionListener { requestCode, _, _ ->
        if (requestCode != START_PERMISSIONS_REQUEST) return@PermissionListener false
        val promise = permissionPromise
        permissionPromise = null
        val report = createPermissionReport()
        if (missingStartPermissions().isNotEmpty()) {
            LiveCasterSession.fail("Microphone and notification permissions are required before going live")
        }
        promise?.resolve(report)
        true
    }

    private val activityEventListener: ActivityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            captureConsentRequestGuard.complete(requestCode) { _, pendingStart ->
                val promise = pendingStart.promise
                if (resultCode != Activity.RESULT_OK || data == null) {
                    LiveCasterSession.fail("Screen capture permission was cancelled")
                    promise.reject("screen_capture_cancelled", "Screen capture permission was cancelled")
                } else {
                    try {
                        check(
                            LiveCasterSession.commitCaptureConsent(
                                preparationGeneration = pendingStart.preparationGeneration,
                                resultCode = resultCode,
                                data = data
                            )
                        ) { "Screen capture request was replaced before approval" }
                        LiveCasterSession.markStarting()
                        val serviceIntent = Intent(reactContext, MediaProjectionService::class.java).apply {
                            action = MediaProjectionService.ACTION_START_STREAM
                        }
                        ContextCompat.startForegroundService(reactContext, serviceIntent)
                        promise.resolve(LiveCasterSession.snapshot())
                    } catch (error: Throwable) {
                        LiveCasterSession.fail(error.message ?: "Screen capture service could not be started")
                        promise.reject("screen_capture_start_failed", error)
                    }
                }
            }
        }
    }

    init {
        reactContext.addActivityEventListener(activityEventListener)
        LiveCasterSession.addListener(sessionListener)
    }

    override fun getName(): String = NAME

    override fun invalidate() {
        captureConsentRequestGuard.cancel()?.promise?.reject(
            "module_invalidated",
            "Screen capture request was cancelled because the native module was invalidated"
        )
        LiveCasterSession.removeListener(sessionListener)
        reactContext.removeActivityEventListener(activityEventListener)
        super.invalidate()
    }

    @ReactMethod
    fun getSnapshot(promise: Promise) {
        promise.resolve(LiveCasterSession.snapshot())
    }

    @ReactMethod
    fun getAudioRoute(promise: Promise) {
        try {
            promise.resolve(createAudioRouteReport())
        } catch (error: Throwable) {
            promise.reject("audio_route_failed", error)
        }
    }

    @ReactMethod
    fun prepare(renderGraphJson: String, profileJson: String, promise: Promise) {
        cancelPendingCaptureRequest(
            code = "capture_replaced",
            message = "Screen capture request was replaced by a new stream preparation"
        )
        try {
            LiveCasterSession.prepare(renderGraphJson, profileJson)
            promise.resolve(LiveCasterSession.snapshot())
        } catch (error: Throwable) {
            if (LiveCasterSession.isStreamStartCommitted()) {
                promise.reject("prepare_while_stream_active", error)
            } else {
                LiveCasterSession.fail(error.message ?: "Invalid stream profile")
                promise.reject("prepare_failed", error)
            }
        }
    }

    @ReactMethod
    fun ensurePermissions(promise: Promise) {
        val missing = missingStartPermissions()
        if (missing.isEmpty()) {
            promise.resolve(createPermissionReport())
            return
        }

        val activity = reactApplicationContext.currentActivity
        if (activity !is PermissionAwareActivity) {
            val message = "Android activity cannot request runtime permissions"
            LiveCasterSession.fail(message)
            promise.reject("permission_activity_unavailable", message)
            return
        }

        if (permissionPromise != null) {
            promise.reject("permission_request_pending", "Runtime permission request is already pending")
            return
        }

        permissionPromise = promise
        activity.requestPermissions(missing.toTypedArray(), START_PERMISSIONS_REQUEST, permissionListener)
    }

    @ReactMethod
    fun start(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            LiveCasterSession.fail("Android activity is not available")
            promise.reject("activity_unavailable", "Android activity is not available")
            return
        }
        if (LiveCasterSession.profile == null) {
            LiveCasterSession.fail("Stream profile is missing")
            promise.reject("profile_missing", "Stream profile is missing")
            return
        }
        val missingPermissions = missingStartPermissions()
        if (missingPermissions.isNotEmpty()) {
            LiveCasterSession.fail("Microphone and notification permissions are required before going live")
            promise.reject(
                "permissions_missing",
                "Missing permissions: ${missingPermissions.joinToString(", ")}"
            )
            return
        }

        val requestToken = captureConsentRequestGuard.beginIfIdle(
            PendingCaptureStart(
                promise = promise,
                preparationGeneration = LiveCasterSession.currentPreparationGeneration()
            )
        )
        if (requestToken == null) {
            promise.reject("capture_pending", "Screen capture permission is already pending")
            return
        }
        val manager = reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        try {
            activity.startActivityForResult(manager.createScreenCaptureIntent(), requestToken.requestCode)
        } catch (error: Throwable) {
            val cancelledStart = captureConsentRequestGuard.cancel()
            if (cancelledStart != null) {
                LiveCasterSession.fail(error.message ?: "Screen capture permission could not be requested")
                cancelledStart.promise.reject("screen_capture_request_failed", error)
            }
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        cancelPendingCaptureRequest(
            code = "screen_capture_cancelled",
            message = "Screen capture request was stopped before approval"
        )
        LiveCasterSession.markStopping()
        val serviceIntent = Intent(reactContext, MediaProjectionService::class.java).apply {
            action = MediaProjectionService.ACTION_STOP_STREAM
        }
        reactContext.startService(serviceIntent)
        promise.resolve(LiveCasterSession.snapshot())
    }

    private fun cancelPendingCaptureRequest(code: String, message: String) {
        captureConsentRequestGuard.cancel()?.promise?.reject(code, message)
    }

    @ReactMethod
    fun reconnect(promise: Promise) {
        LiveCasterSession.markReconnecting()
        val serviceIntent = Intent(reactContext, MediaProjectionService::class.java).apply {
            action = MediaProjectionService.ACTION_RECONNECT_STREAM
        }
        ContextCompat.startForegroundService(reactContext, serviceIntent)
        promise.resolve(LiveCasterSession.snapshot())
    }

    @ReactMethod
    fun updateScene(renderGraphJson: String, promise: Promise) {
        LiveCasterSession.updateScene(renderGraphJson)
        if (LiveCasterSession.status == LiveCasterStatus.Live || LiveCasterSession.status == LiveCasterStatus.Reconnecting) {
            val serviceIntent = Intent(reactContext, MediaProjectionService::class.java).apply {
                action = MediaProjectionService.ACTION_UPDATE_SCENE
            }
            ContextCompat.startForegroundService(reactContext, serviceIntent)
        }
        promise.resolve(LiveCasterSession.snapshot())
    }

    @ReactMethod
    fun updateQuality(profileJson: String, promise: Promise) {
        try {
            LiveCasterSession.updateQuality(profileJson)
            if (LiveCasterSession.status == LiveCasterStatus.Live || LiveCasterSession.status == LiveCasterStatus.Reconnecting) {
                val serviceIntent = Intent(reactContext, MediaProjectionService::class.java).apply {
                    action = MediaProjectionService.ACTION_UPDATE_QUALITY
                }
                ContextCompat.startForegroundService(reactContext, serviceIntent)
            }
            promise.resolve(LiveCasterSession.snapshot())
        } catch (error: Throwable) {
            promise.reject("quality_update_failed", error)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required by NativeEventEmitter.
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required by NativeEventEmitter.
    }

    private fun missingStartPermissions(): List<String> {
        val permissions = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        return permissions.filter { permission ->
            ContextCompat.checkSelfPermission(reactContext, permission) != PackageManager.PERMISSION_GRANTED
        }
    }

    private fun createPermissionReport(): WritableMap {
        val missing = missingStartPermissions()
        val missingArray = Arguments.createArray()
        missing.forEach { permission -> missingArray.pushString(permission) }
        return Arguments.createMap().apply {
            putBoolean("granted", missing.isEmpty())
            putArray("missing", missingArray)
            putString(
                "message",
                if (missing.isEmpty()) "Streaming permissions granted" else "Streaming permissions are missing"
            )
        }
    }

    private fun createAudioRouteReport(): WritableMap {
        val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val outputDevices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
        val headphonesConnected = outputDevices.any { isHeadphoneDevice(it) }
        val device = outputDevices.firstOrNull { isHeadphoneDevice(it) }
            ?: outputDevices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
            ?: outputDevices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE }
            ?: outputDevices.firstOrNull()
        val route = routeKind(device)
        val outputName = device?.productName?.toString()?.trim()?.takeIf { it.isNotEmpty() } ?: routeLabel(route)
        val stale = device == null

        return Arguments.createMap().apply {
            putString("route", route)
            putString("outputName", outputName)
            putBoolean("headphonesConnected", headphonesConnected)
            putString("checkedAt", isoNow())
            putBoolean("stale", stale)
            putString(
                "summary",
                if (stale) {
                    "Android audio output route could not be resolved."
                } else {
                    "$outputName route is active; headphones ${if (headphonesConnected) "connected" else "not connected"}."
                }
            )
            putString(
                "recommendation",
                if (headphonesConnected) {
                    "Keep headphones connected while self-monitoring is enabled."
                } else {
                    "Connect wired, USB, or Bluetooth headphones before enabling self-monitoring."
                }
            )
        }
    }

    private fun isHeadphoneDevice(device: AudioDeviceInfo): Boolean =
        when (device.type) {
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
            AudioDeviceInfo.TYPE_WIRED_HEADSET,
            AudioDeviceInfo.TYPE_USB_HEADSET,
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> true
            else -> false
        }

    private fun routeKind(device: AudioDeviceInfo?): String =
        when (device?.type) {
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
            AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "receiver"
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "wired-headphones"
            AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired-headset"
            AudioDeviceInfo.TYPE_USB_HEADSET -> "usb-headset"
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetooth-a2dp"
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bluetooth-sco"
            AudioDeviceInfo.TYPE_HDMI -> "hdmi"
            null -> "unknown"
            else -> "other"
        }

    private fun routeLabel(route: String): String =
        when (route) {
            "speaker" -> "Speaker"
            "receiver" -> "Receiver"
            "wired-headphones" -> "Wired headphones"
            "wired-headset" -> "Wired headset"
            "usb-headset" -> "USB headset"
            "bluetooth-a2dp" -> "Bluetooth headphones"
            "bluetooth-sco" -> "Bluetooth headset"
            "hdmi" -> "HDMI"
            else -> "Unknown output"
        }

    private fun isoNow(): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
}
