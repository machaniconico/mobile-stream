package com.mobilelivecaster.streaming

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.util.Locale
import java.util.UUID

@ReactModule(name = LiveCasterSpeechModule.NAME)
class LiveCasterSpeechModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext),
    TextToSpeech.OnInitListener {

    companion object {
        const val NAME = "LiveCasterSpeech"
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val pendingPromises = mutableMapOf<String, Promise>()
    private val pendingRequests = mutableListOf<SpeechRequest>()
    private var textToSpeech: TextToSpeech? = null
    private var ready = false

    init {
        textToSpeech = TextToSpeech(reactContext, this)
    }

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        textToSpeech?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit

            override fun onDone(utteranceId: String?) {
                resolveUtterance(utteranceId, true)
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                resolveUtterance(utteranceId, false)
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                resolveUtterance(utteranceId, false)
            }
        })
    }

    override fun invalidate() {
        pendingRequests.forEach { request -> request.promise.resolve(false) }
        pendingRequests.clear()
        pendingPromises.values.forEach { promise -> promise.resolve(false) }
        pendingPromises.clear()
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        textToSpeech = null
        ready = false
        super.invalidate()
    }

    override fun onInit(status: Int) {
        ready = status == TextToSpeech.SUCCESS
        if (ready) {
            textToSpeech?.language = Locale.getDefault()
            val requests = pendingRequests.toList()
            pendingRequests.clear()
            requests.forEach { request ->
                speakNow(request.text, request.rate, request.pitch, request.volume, request.promise)
            }
        } else {
            pendingRequests.forEach { request ->
                request.promise.reject("speech_not_ready", "Text-to-speech engine is not available")
            }
            pendingRequests.clear()
        }
    }

    @ReactMethod
    fun speak(text: String, rate: Double, pitch: Double, volume: Double, promise: Promise) {
        if (!ready) {
            pendingRequests.add(SpeechRequest(text, rate, pitch, volume, promise))
            return
        }
        speakNow(text, rate, pitch, volume, promise)
    }

    @ReactMethod
    fun stop(promise: Promise) {
        textToSpeech?.stop()
        pendingRequests.forEach { request -> request.promise.resolve(false) }
        pendingRequests.clear()
        pendingPromises.values.forEach { pending -> pending.resolve(false) }
        pendingPromises.clear()
        promise.resolve(true)
    }

    private fun speakNow(text: String, rate: Double, pitch: Double, volume: Double, promise: Promise) {
        val speech = textToSpeech
        if (speech == null) {
            promise.reject("speech_not_ready", "Text-to-speech engine is not ready")
            return
        }
        val utteranceId = UUID.randomUUID().toString()
        pendingPromises[utteranceId] = promise
        speech.setSpeechRate(rate.toFloat().coerceIn(0.5f, 1.5f))
        speech.setPitch(pitch.toFloat().coerceIn(0.5f, 1.5f))

        val params = Bundle().apply {
            putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume.toFloat().coerceIn(0f, 1f))
        }
        val result = speech.speak(text.take(400), TextToSpeech.QUEUE_ADD, params, utteranceId)
        if (result == TextToSpeech.ERROR) {
            pendingPromises.remove(utteranceId)
            promise.reject("speech_failed", "Text-to-speech engine rejected the utterance")
        }
    }

    private fun resolveUtterance(utteranceId: String?, success: Boolean) {
        if (utteranceId == null) {
            return
        }
        val promise = pendingPromises.remove(utteranceId) ?: return
        mainHandler.post {
            promise.resolve(success)
        }
    }

    private data class SpeechRequest(
        val text: String,
        val rate: Double,
        val pitch: Double,
        val volume: Double,
        val promise: Promise
    )
}
