import Foundation
import React
import Security

@objc(LiveCasterSecureStore)
final class LiveCasterSecureStore: NSObject {
    private let service = "com.mobilelivecaster.secure-profile"
    private let profileAccount = "stream-profile"
    private let oauthAccount = "platform-chat-oauth"

    @objc
    static func requiresMainQueueSetup() -> Bool {
        false
    }

    @objc(saveProfile:resolver:rejecter:)
    func saveProfile(
        _ profileJson: String,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        saveValue(
            profileJson,
            account: profileAccount,
            encodeFailureCode: "secure_profile_encode_failed",
            saveFailureCode: "secure_profile_save_failed",
            resolver: resolve,
            rejecter: reject
        )
    }

    @objc(loadProfile:rejecter:)
    func loadProfile(
        _ resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        loadValue(account: profileAccount, failureCode: "secure_profile_load_failed", resolver: resolve, rejecter: reject)
    }

    @objc(clearProfile:rejecter:)
    func clearProfile(
        _ resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        clearValue(account: profileAccount, failureCode: "secure_profile_clear_failed", resolver: resolve, rejecter: reject)
    }

    @objc(saveOAuthCredential:resolver:rejecter:)
    func saveOAuthCredential(
        _ credentialJson: String,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        saveValue(
            credentialJson,
            account: oauthAccount,
            encodeFailureCode: "secure_oauth_encode_failed",
            saveFailureCode: "secure_oauth_save_failed",
            resolver: resolve,
            rejecter: reject
        )
    }

    @objc(loadOAuthCredential:rejecter:)
    func loadOAuthCredential(
        _ resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        loadValue(account: oauthAccount, failureCode: "secure_oauth_load_failed", resolver: resolve, rejecter: reject)
    }

    @objc(clearOAuthCredential:rejecter:)
    func clearOAuthCredential(
        _ resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        clearValue(account: oauthAccount, failureCode: "secure_oauth_clear_failed", resolver: resolve, rejecter: reject)
    }

    private func saveValue(
        _ value: String,
        account: String,
        encodeFailureCode: String,
        saveFailureCode: String,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        guard let data = value.data(using: .utf8) else {
            reject(encodeFailureCode, "Value could not be encoded as UTF-8", nil)
            return
        }

        var query = baseQuery(account: account)
        SecItemDelete(query as CFDictionary)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            reject(saveFailureCode, "Keychain save failed with status \(status)", nil)
            return
        }

        resolve(true)
    }

    private func loadValue(
        account: String,
        failureCode: String,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = kCFBooleanTrue
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecItemNotFound {
            resolve(nil)
            return
        }

        guard status == errSecSuccess, let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
            reject(failureCode, "Keychain load failed with status \(status)", nil)
            return
        }

        resolve(value)
    }

    private func clearValue(
        account: String,
        failureCode: String,
        resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        let status = SecItemDelete(baseQuery(account: account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            reject(failureCode, "Keychain clear failed with status \(status)", nil)
            return
        }
        resolve(true)
    }

    private func baseQuery(account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }
}
