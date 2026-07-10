package com.mobilelivecaster.streaming

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

internal class DiagnosticHistoryCipher {
    companion object {
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val KEY_ALIAS = "mobile_live_caster_diagnostic_history_v1"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val ALGORITHM = "AES-256-GCM"
        private const val ENVELOPE_VERSION = 1
        private const val GCM_TAG_BITS = 128
        private const val GCM_IV_BYTES = 12
    }

    fun encrypt(plaintext: String, purpose: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        cipher.updateAAD(authenticatedData(purpose))
        val ciphertext = cipher.doFinal(plaintext.toByteArray(StandardCharsets.UTF_8))
        val iv = cipher.iv
        check(iv.size == GCM_IV_BYTES) { "Android Keystore returned an invalid AES-GCM IV" }
        return JSONObject()
            .put("schemaVersion", ENVELOPE_VERSION)
            .put("algorithm", ALGORITHM)
            .put("iv", Base64.encodeToString(iv, Base64.NO_WRAP))
            .put("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
            .toString()
    }

    fun decrypt(envelopeJson: String, purpose: String): String {
        val envelope = JSONObject(envelopeJson)
        require(envelope.optInt("schemaVersion", -1) == ENVELOPE_VERSION) {
            "Diagnostic history encryption envelope version is invalid"
        }
        require(envelope.optString("algorithm") == ALGORITHM) {
            "Diagnostic history encryption algorithm is invalid"
        }
        val iv = Base64.decode(envelope.getString("iv"), Base64.NO_WRAP)
        val ciphertext = Base64.decode(envelope.getString("ciphertext"), Base64.NO_WRAP)
        require(iv.size == GCM_IV_BYTES && ciphertext.size >= GCM_TAG_BITS / 8) {
            "Diagnostic history ciphertext is invalid"
        }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
        cipher.updateAAD(authenticatedData(purpose))
        return String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8)
    }

    @Synchronized
    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        val existing = keyStore.getKey(KEY_ALIAS, null)
        if (existing is SecretKey) {
            return existing
        }
        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
        keyGenerator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build()
        )
        return keyGenerator.generateKey()
    }

    private fun authenticatedData(purpose: String): ByteArray =
        "mobile-live-caster-diagnostic-history:$purpose".toByteArray(StandardCharsets.UTF_8)
}
