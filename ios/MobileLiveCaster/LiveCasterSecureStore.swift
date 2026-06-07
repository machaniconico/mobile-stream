import Foundation
import React
import Security

@objc(LiveCasterSecureStore)
final class LiveCasterSecureStore: NSObject {
    private let service = "com.mobilelivecaster.secure-profile"
    private let account = "stream-profile"

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
        guard let data = profileJson.data(using: .utf8) else {
            reject("secure_profile_encode_failed", "Profile could not be encoded as UTF-8", nil)
            return
        }

        var query = baseQuery()
        SecItemDelete(query as CFDictionary)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            reject("secure_profile_save_failed", "Keychain save failed with status \(status)", nil)
            return
        }

        resolve(true)
    }

    @objc(loadProfile:rejecter:)
    func loadProfile(
        _ resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        var query = baseQuery()
        query[kSecReturnData as String] = kCFBooleanTrue
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecItemNotFound {
            resolve(nil)
            return
        }

        guard status == errSecSuccess, let data = result as? Data, let profileJson = String(data: data, encoding: .utf8) else {
            reject("secure_profile_load_failed", "Keychain load failed with status \(status)", nil)
            return
        }

        resolve(profileJson)
    }

    @objc(clearProfile:rejecter:)
    func clearProfile(
        _ resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            reject("secure_profile_clear_failed", "Keychain clear failed with status \(status)", nil)
            return
        }
        resolve(true)
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }
}
