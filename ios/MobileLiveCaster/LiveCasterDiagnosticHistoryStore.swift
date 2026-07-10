import CryptoKit
import Foundation
import Security

private struct LiveCasterDiagnosticHistoryEnvelope: Codable {
    let schemaVersion: Int
    let algorithm: String
    let sealedData: String
}

enum LiveCasterDiagnosticHistoryStoreError: LocalizedError {
    case encodeFailed
    case invalidEnvelope
    case keyLoadFailed(OSStatus)
    case keySaveFailed(OSStatus)
    case invalidKey

    var errorDescription: String? {
        switch self {
        case .encodeFailed:
            return "Diagnostic history could not be encoded"
        case .invalidEnvelope:
            return "Diagnostic history ciphertext is invalid or has been modified"
        case .keyLoadFailed(let status):
            return "Diagnostic history encryption key load failed with status \(status)"
        case .keySaveFailed(let status):
            return "Diagnostic history encryption key save failed with status \(status)"
        case .invalidKey:
            return "Diagnostic history encryption key is invalid"
        }
    }
}

final class LiveCasterDiagnosticHistoryStore {
    private static let schemaVersion = 1
    private static let algorithm = "AES-256-GCM"
    private static let keychainService = "com.mobilelivecaster.diagnostic-history"

    private let encryptedFileName: String
    private let legacyFileName: String
    private let historyNamespace: String

    init(encryptedFileName: String, legacyFileName: String, historyNamespace: String) {
        self.encryptedFileName = encryptedFileName
        self.legacyFileName = legacyFileName
        self.historyNamespace = historyNamespace
    }

    func save(_ plaintext: String) throws {
        guard let plaintextData = plaintext.data(using: .utf8) else {
            throw LiveCasterDiagnosticHistoryStoreError.encodeFailed
        }
        let key = try loadOrCreateKey()
        let sealedBox = try AES.GCM.seal(plaintextData, using: key, authenticating: authenticatedData)
        guard let combined = sealedBox.combined else {
            throw LiveCasterDiagnosticHistoryStoreError.encodeFailed
        }
        let envelope = LiveCasterDiagnosticHistoryEnvelope(
            schemaVersion: Self.schemaVersion,
            algorithm: Self.algorithm,
            sealedData: combined.base64EncodedString()
        )
        let envelopeData = try JSONEncoder().encode(envelope)
        try writeEncryptedData(envelopeData)
        try removeLegacyFile()
    }

    func load() throws -> String? {
        if let encryptedURL, FileManager.default.fileExists(atPath: encryptedURL.path) {
            let plaintext = try decrypt(Data(contentsOf: encryptedURL))
            try removeLegacyFile()
            return plaintext
        }
        guard let legacyURL, FileManager.default.fileExists(atPath: legacyURL.path) else {
            return nil
        }
        try protectAndExcludeFromBackup(legacyURL)
        let legacyData = try Data(contentsOf: legacyURL)
        guard let plaintext = String(data: legacyData, encoding: .utf8) else {
            throw LiveCasterDiagnosticHistoryStoreError.encodeFailed
        }
        try save(plaintext)
        return plaintext
    }

    func clear() throws {
        try deleteKey()
        var firstError: Error?
        for url in [encryptedURL, legacyURL].compactMap({ $0 }) where FileManager.default.fileExists(atPath: url.path) {
            do {
                try FileManager.default.removeItem(at: url)
            } catch {
                firstError = firstError ?? error
            }
        }
        if let firstError {
            throw firstError
        }
    }

    private var encryptedURL: URL? {
        applicationSupportURL?.appendingPathComponent(encryptedFileName)
    }

    private var legacyURL: URL? {
        applicationSupportURL?.appendingPathComponent(legacyFileName)
    }

    private var applicationSupportURL: URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
    }

    private var authenticatedData: Data {
        Data("mobile-live-caster-diagnostic-history:\(historyNamespace)".utf8)
    }

    private func decrypt(_ envelopeData: Data) throws -> String {
        guard
            let envelope = try? JSONDecoder().decode(LiveCasterDiagnosticHistoryEnvelope.self, from: envelopeData),
            envelope.schemaVersion == Self.schemaVersion,
            envelope.algorithm == Self.algorithm,
            let combined = Data(base64Encoded: envelope.sealedData),
            !combined.isEmpty
        else {
            throw LiveCasterDiagnosticHistoryStoreError.invalidEnvelope
        }
        do {
            let sealedBox = try AES.GCM.SealedBox(combined: combined)
            let plaintextData = try AES.GCM.open(sealedBox, using: loadOrCreateKey(), authenticating: authenticatedData)
            guard let plaintext = String(data: plaintextData, encoding: .utf8) else {
                throw LiveCasterDiagnosticHistoryStoreError.invalidEnvelope
            }
            return plaintext
        } catch let error as LiveCasterDiagnosticHistoryStoreError {
            throw error
        } catch {
            throw LiveCasterDiagnosticHistoryStoreError.invalidEnvelope
        }
    }

    private func writeEncryptedData(_ data: Data) throws {
        guard let encryptedURL else {
            throw LiveCasterDiagnosticHistoryStoreError.encodeFailed
        }
        let directory = encryptedURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
        )
        try data.write(
            to: encryptedURL,
            options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
        )
        try protectAndExcludeFromBackup(encryptedURL)
    }

    private func protectAndExcludeFromBackup(_ url: URL) throws {
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: url.path
        )
        var protectedURL = url
        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        try protectedURL.setResourceValues(resourceValues)
    }

    private func removeLegacyFile() throws {
        guard let legacyURL, FileManager.default.fileExists(atPath: legacyURL.path) else {
            return
        }
        try protectAndExcludeFromBackup(legacyURL)
        try FileManager.default.removeItem(at: legacyURL)
    }

    private func loadOrCreateKey() throws -> SymmetricKey {
        if let data = try loadKeyData() {
            guard data.count == 32 else {
                throw LiveCasterDiagnosticHistoryStoreError.invalidKey
            }
            return SymmetricKey(data: data)
        }

        let key = SymmetricKey(size: .bits256)
        let data = key.withUnsafeBytes { Data($0) }
        var query = keychainQuery
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(query as CFDictionary, nil)
        if status == errSecDuplicateItem, let existing = try loadKeyData(), existing.count == 32 {
            return SymmetricKey(data: existing)
        }
        guard status == errSecSuccess else {
            throw LiveCasterDiagnosticHistoryStoreError.keySaveFailed(status)
        }
        return key
    }

    private func loadKeyData() throws -> Data? {
        var query = keychainQuery
        query[kSecReturnData as String] = kCFBooleanTrue
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess, let data = result as? Data else {
            throw LiveCasterDiagnosticHistoryStoreError.keyLoadFailed(status)
        }
        return data
    }

    private func deleteKey() throws {
        let status = SecItemDelete(keychainQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw LiveCasterDiagnosticHistoryStoreError.keySaveFailed(status)
        }
    }

    private var keychainQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainService,
            kSecAttrAccount as String: historyNamespace
        ]
    }
}
