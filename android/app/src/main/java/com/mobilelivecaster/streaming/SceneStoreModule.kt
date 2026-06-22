package com.mobilelivecaster.streaming

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = SceneStoreModule.NAME)
class SceneStoreModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "LiveCasterSceneStore"
        private const val PREFS_NAME = "mobile_live_caster_scene_store"
        private const val SCENE_JSON = "scene_json"
    }

    override fun getName(): String = NAME

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

    private fun prefs() = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}
