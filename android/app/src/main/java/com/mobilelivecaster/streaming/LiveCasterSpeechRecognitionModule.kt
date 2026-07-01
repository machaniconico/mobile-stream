package com.mobilelivecaster.streaming

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import com.facebook.react.module.annotations.ReactModule
import java.util.Locale

@ReactModule(name = LiveCasterSpeechRecognitionModule.NAME)
class LiveCasterSpeechRecognitionModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext),
    RecognitionListener {

    companion object {
        const val NAME = "LiveCasterSpeechRecognition"
        private const val REQUEST_RECORD_AUDIO = 48041
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var speechRecognizer: SpeechRecognizer? = null
    private var stopRequested = true
    private var currentLanguage = Locale.getDefault().toLanguageTag()
    private var currentInterimResults = true

    override fun getName(): String = NAME

    override fun invalidate() {
        mainHandler.post {
            stopRequested = true
            destroyRecognizer()
        }
        super.invalidate()
    }

    @ReactMethod
    fun start(language: String, interimResults: Boolean, promise: Promise) {
        mainHandler.post {
            currentLanguage = normalizeLanguage(language)
            currentInterimResults = interimResults
            stopRequested = false

            if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
                stopRequested = true
                emitStatus("unsupported", "Android speech recognition service is not available on this device.")
                promise.resolve(false)
                return@post
            }

            if (hasRecordAudioPermission()) {
                startListening(promise)
            } else {
                requestRecordAudioPermission(promise)
            }
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        mainHandler.post {
            stopRequested = true
            destroyRecognizer()
            emitStatus("idle")
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Int) = Unit

    private fun requestRecordAudioPermission(promise: Promise) {
        val activity = reactApplicationContext.currentActivity as? PermissionAwareActivity
        if (activity == null) {
            stopRequested = true
            val message = "Microphone permission is required for live captions."
            emitStatus("error", message)
            promise.reject("audio_permission_unavailable", message)
            return
        }

        activity.requestPermissions(
            arrayOf(Manifest.permission.RECORD_AUDIO),
            REQUEST_RECORD_AUDIO,
            PermissionListener { requestCode, _, grantResults ->
                if (requestCode != REQUEST_RECORD_AUDIO) {
                    return@PermissionListener false
                }
                mainHandler.post {
                    val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
                    if (granted) {
                        startListening(promise)
                    } else {
                        stopRequested = true
                        val message = "Microphone permission is required for live captions."
                        emitStatus("error", message)
                        promise.reject("audio_permission_denied", message)
                    }
                }
                true
            }
        )
    }

    private fun hasRecordAudioPermission(): Boolean =
        ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun startListening(promise: Promise? = null) {
        try {
            destroyRecognizer()
            val recognizer = SpeechRecognizer.createSpeechRecognizer(reactContext)
            speechRecognizer = recognizer
            recognizer.setRecognitionListener(this)
            recognizer.startListening(createRecognizerIntent())
            emitStatus("listening")
            promise?.resolve(true)
        } catch (error: Throwable) {
            stopRequested = true
            destroyRecognizer()
            val message = error.localizedMessage ?: "Android speech recognition failed to start."
            emitStatus("error", message)
            promise?.reject("speech_recognition_start_failed", message, error)
        }
    }

    private fun restartListening(delayMs: Long = 250) {
        if (stopRequested) {
            return
        }
        mainHandler.removeCallbacksAndMessages(RESTART_TOKEN)
        val restart = Runnable {
            if (!stopRequested) {
                startListening()
            }
        }
        mainHandler.postAtTime(restart, RESTART_TOKEN, SystemClock.uptimeMillis() + delayMs)
    }

    private fun createRecognizerIntent(): Intent =
        Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, currentLanguage)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, currentInterimResults)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, reactContext.packageName)
        }

    private fun destroyRecognizer() {
        mainHandler.removeCallbacksAndMessages(RESTART_TOKEN)
        speechRecognizer?.setRecognitionListener(null)
        try {
            speechRecognizer?.cancel()
        } catch (_: Throwable) {
            // Ignore recognizer cancellation races.
        }
        try {
            speechRecognizer?.destroy()
        } catch (_: Throwable) {
            // Ignore recognizer destruction races.
        }
        speechRecognizer = null
    }

    override fun onReadyForSpeech(params: Bundle?) {
        emitStatus("listening")
    }

    override fun onBeginningOfSpeech() = Unit

    override fun onRmsChanged(rmsdB: Float) = Unit

    override fun onBufferReceived(buffer: ByteArray?) = Unit

    override fun onEndOfSpeech() = Unit

    override fun onError(error: Int) {
        if (stopRequested) {
            return
        }

        when (error) {
            SpeechRecognizer.ERROR_NO_MATCH,
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT,
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> restartListening(350)
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                stopRequested = true
                destroyRecognizer()
                emitStatus("error", "Microphone permission is required for live captions.")
            }
            SpeechRecognizer.ERROR_CLIENT -> restartListening(500)
            else -> {
                emitStatus("error", speechErrorMessage(error))
                restartListening(1000)
            }
        }
    }

    override fun onResults(results: Bundle?) {
        emitBestResult(results, isFinal = true)
        restartListening(250)
    }

    override fun onPartialResults(partialResults: Bundle?) {
        if (currentInterimResults) {
            emitBestResult(partialResults, isFinal = false)
        }
    }

    override fun onEvent(eventType: Int, params: Bundle?) = Unit

    private fun emitBestResult(results: Bundle?, isFinal: Boolean) {
        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
        val text = matches.firstOrNull()?.trim().orEmpty()
        if (text.isEmpty()) {
            return
        }
        val confidences = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
        val confidence = confidences?.firstOrNull()?.takeIf { it.isFinite() }?.coerceIn(0f, 1f) ?: 1f
        emitCue(text, confidence.toDouble(), isFinal)
    }

    private fun emitCue(text: String, confidence: Double, isFinal: Boolean) {
        val payload = Arguments.createMap().apply {
            putString("text", text)
            putString("language", currentLanguage)
            putDouble("confidence", confidence)
            putBoolean("isFinal", isFinal)
            putDouble("timestampMs", System.currentTimeMillis().toDouble())
        }
        emitEvent("LiveCaptionCue", payload)
    }

    private fun emitStatus(status: String, message: String? = null) {
        val payload = Arguments.createMap().apply {
            putString("status", status)
            if (!message.isNullOrBlank()) {
                putString("message", message)
            }
        }
        emitEvent("LiveCaptionStatus", payload)
    }

    private fun emitEvent(eventName: String, payload: Any) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, payload)
    }

    private fun normalizeLanguage(language: String): String {
        val clean = language.trim().replace('_', '-')
        return if (Regex("^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$").matches(clean)) clean else Locale.getDefault().toLanguageTag()
    }

    private fun speechErrorMessage(error: Int): String =
        when (error) {
            SpeechRecognizer.ERROR_AUDIO -> "Audio recording failed during speech recognition."
            SpeechRecognizer.ERROR_NETWORK -> "Network error occurred during speech recognition."
            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Speech recognition network request timed out."
            SpeechRecognizer.ERROR_SERVER -> "Speech recognition service returned an error."
            SpeechRecognizer.ERROR_TOO_MANY_REQUESTS -> "Speech recognition is temporarily rate limited."
            SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED -> "Requested caption language is not supported on this device."
            SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "Requested caption language is unavailable on this device."
            else -> "Speech recognition failed with Android error code $error."
        }

    private object RESTART_TOKEN
}
