package com.mobilelivecaster.streaming

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@ReactModule(name = SecureProfileStoreModule.NAME)
class SecureProfileStoreModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "LiveCasterSecureStore"
        private const val KEY_ALIAS = "mobile_live_caster_profile_key"
        private const val PREFS_NAME = "mobile_live_caster_secure_store"
        private const val PROFILE_CIPHERTEXT = "profile_ciphertext"
        private const val PROFILE_IV = "profile_iv"
        private const val GCM_TAG_BITS = 128
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun saveProfile(profileJson: String, promise: Promise) {
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
            val ciphertext = cipher.doFinal(profileJson.toByteArray(StandardCharsets.UTF_8))
            prefs()
                .edit()
                .putString(PROFILE_CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .putString(PROFILE_IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
                .apply()
            promise.resolve(true)
        } catch (error: Throwable) {
            promise.reject("secure_profile_save_failed", error)
        }
    }

    @ReactMethod
    fun loadProfile(promise: Promise) {
        try {
            val ciphertextValue = prefs().getString(PROFILE_CIPHERTEXT, null)
            val ivValue = prefs().getString(PROFILE_IV, null)
            if (ciphertextValue == null || ivValue == null) {
                promise.resolve(null)
                return
            }

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            val iv = Base64.decode(ivValue, Base64.NO_WRAP)
            val ciphertext = Base64.decode(ciphertextValue, Base64.NO_WRAP)
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
            val plaintext = cipher.doFinal(ciphertext)
            promise.resolve(String(plaintext, StandardCharsets.UTF_8))
        } catch (error: Throwable) {
            prefs().edit().remove(PROFILE_CIPHERTEXT).remove(PROFILE_IV).apply()
            promise.reject("secure_profile_load_failed", error)
        }
    }

    @ReactMethod
    fun clearProfile(promise: Promise) {
        prefs().edit().remove(PROFILE_CIPHERTEXT).remove(PROFILE_IV).apply()
        promise.resolve(true)
    }

    private fun prefs() = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existingKey = keyStore.getKey(KEY_ALIAS, null)
        if (existingKey is SecretKey) {
            return existingKey
        }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build()
        generator.init(spec)
        return generator.generateKey()
    }
}
