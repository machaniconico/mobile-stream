package com.mobilelivecaster.streaming

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
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

@ReactModule(name = LiveCasterNativeModule.NAME)
class LiveCasterNativeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "LiveCasterNative"
        private const val SCREEN_CAPTURE_REQUEST = 7301
    }

    private var startPromise: Promise? = null
    private val sessionListener: (WritableMap) -> Unit = { snapshot ->
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("LiveCasterSnapshot", snapshot)
        }
    }

    private val activityEventListener: ActivityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode != SCREEN_CAPTURE_REQUEST) return
            val promise = startPromise
            startPromise = null

            if (resultCode != Activity.RESULT_OK || data == null) {
                LiveCasterSession.fail("Screen capture permission was cancelled")
                promise?.reject("screen_capture_cancelled", "Screen capture permission was cancelled")
                return
            }

            LiveCasterSession.storeCaptureConsent(resultCode, data)
            LiveCasterSession.markStarting()
            val serviceIntent = Intent(reactContext, MediaProjectionService::class.java).apply {
                action = MediaProjectionService.ACTION_START_STREAM
            }
            ContextCompat.startForegroundService(reactContext, serviceIntent)
            promise?.resolve(LiveCasterSession.snapshot())
        }
    }

    init {
        reactContext.addActivityEventListener(activityEventListener)
        LiveCasterSession.addListener(sessionListener)
    }

    override fun getName(): String = NAME

    override fun invalidate() {
        LiveCasterSession.removeListener(sessionListener)
        reactContext.removeActivityEventListener(activityEventListener)
        super.invalidate()
    }

    @ReactMethod
    fun getSnapshot(promise: Promise) {
        promise.resolve(LiveCasterSession.snapshot())
    }

    @ReactMethod
    fun prepare(renderGraphJson: String, profileJson: String, promise: Promise) {
        try {
            LiveCasterSession.prepare(renderGraphJson, profileJson)
            promise.resolve(LiveCasterSession.snapshot())
        } catch (error: Throwable) {
            LiveCasterSession.fail(error.message ?: "Invalid stream profile")
            promise.reject("prepare_failed", error)
        }
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
        if (startPromise != null) {
            promise.reject("capture_pending", "Screen capture permission is already pending")
            return
        }

        startPromise = promise
        val manager = reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        activity.startActivityForResult(manager.createScreenCaptureIntent(), SCREEN_CAPTURE_REQUEST)
    }

    @ReactMethod
    fun stop(promise: Promise) {
        LiveCasterSession.markStopping()
        val serviceIntent = Intent(reactContext, MediaProjectionService::class.java).apply {
            action = MediaProjectionService.ACTION_STOP_STREAM
        }
        reactContext.startService(serviceIntent)
        promise.resolve(LiveCasterSession.snapshot())
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
        promise.resolve(LiveCasterSession.snapshot())
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required by NativeEventEmitter.
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required by NativeEventEmitter.
    }
}
