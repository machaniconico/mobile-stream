import Foundation
import Security

private struct LiveCasterBroadcastCredential: Codable {
    let schemaVersion: Int
    let handoffID: String
    let publishURL: String
    let expiresAt: Double

    enum CodingKeys: String, CodingKey {
        case schemaVersion
        case handoffID = "handoffId"
        case publishURL = "publishUrl"
        case expiresAt
    }
}

enum LiveCasterBroadcastCredentialStoreError: LocalizedError {
    case invalidHandoffID
    case invalidPublishURL
    case invalidExpiration
    case encodeFailed
    case saveFailed(OSStatus)
    case loadFailed(OSStatus)
    case decodeFailed
    case handoffMismatch
    case clearFailed(OSStatus)

    var errorDescription: String? {
        switch self {
        case .invalidHandoffID:
            return "Broadcast credential handoff identifier is invalid"
        case .invalidPublishURL:
            return "Broadcast destination is empty"
        case .invalidExpiration:
            return "Broadcast credential expiration is invalid"
        case .encodeFailed:
            return "Broadcast credential could not be encoded"
        case .saveFailed(let status):
            return "Broadcast credential save failed with status \(status)"
        case .loadFailed(let status):
            return "Broadcast credential load failed with status \(status)"
        case .decodeFailed:
            return "Broadcast credential could not be decoded"
        case .handoffMismatch:
            return "Broadcast credential does not match the active handoff"
        case .clearFailed(let status):
            return "Broadcast credential clear failed with status \(status)"
        }
    }
}

enum LiveCasterBroadcastCredentialStore {
    private static let service = "com.mobilelivecaster.broadcast-handoff"
    private static let accountPrefix = "publish-url."
    private static let legacyAccount = "publish-url"
    private static let accessGroup = "group.com.mobilelivecaster.app"
    private static let schemaVersion = 1

    static func savePublishURL(_ publishURL: String, handoffID: String, expiresAt: Double) throws {
        let normalizedHandoffID = try normalizeHandoffID(handoffID)
        guard !publishURL.isEmpty else {
            throw LiveCasterBroadcastCredentialStoreError.invalidPublishURL
        }
        guard expiresAt.isFinite, expiresAt > Date().timeIntervalSince1970 * 1000 else {
            throw LiveCasterBroadcastCredentialStoreError.invalidExpiration
        }

        try clearExpiredCredentials()
        let credential = LiveCasterBroadcastCredential(
            schemaVersion: schemaVersion,
            handoffID: normalizedHandoffID,
            publishURL: publishURL,
            expiresAt: expiresAt
        )
        guard let data = try? JSONEncoder().encode(credential) else {
            throw LiveCasterBroadcastCredentialStoreError.encodeFailed
        }

        let account = accountName(handoffID: normalizedHandoffID)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        let updateStatus = SecItemUpdate(baseQuery(account: account) as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess {
            return
        }
        guard updateStatus == errSecItemNotFound else {
            throw LiveCasterBroadcastCredentialStoreError.saveFailed(updateStatus)
        }

        var addQuery = baseQuery(account: account)
        for (key, value) in attributes {
            addQuery[key] = value
        }
        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw LiveCasterBroadcastCredentialStoreError.saveFailed(addStatus)
        }
    }

    static func consumePublishURL(
        handoffID: String,
        expectedExpiresAt: Double,
        nowMillis: Double = Date().timeIntervalSince1970 * 1000
    ) throws -> String? {
        let normalizedHandoffID = try normalizeHandoffID(handoffID)
        guard let credential = try loadCredential(handoffID: normalizedHandoffID) else {
            return nil
        }
        guard
            credential.schemaVersion == schemaVersion,
            credential.handoffID == normalizedHandoffID,
            abs(credential.expiresAt - expectedExpiresAt) < 1
        else {
            try clear(handoffID: normalizedHandoffID)
            throw LiveCasterBroadcastCredentialStoreError.handoffMismatch
        }
        guard credential.expiresAt >= nowMillis else {
            try clear(handoffID: normalizedHandoffID)
            return nil
        }
        guard !credential.publishURL.isEmpty else {
            try clear(handoffID: normalizedHandoffID)
            throw LiveCasterBroadcastCredentialStoreError.decodeFailed
        }

        try clear(handoffID: normalizedHandoffID)
        return credential.publishURL
    }

    static func clear(handoffID: String) throws {
        let normalizedHandoffID = try normalizeHandoffID(handoffID)
        try delete(account: accountName(handoffID: normalizedHandoffID))
    }

    static func clearExpiredCredentials(nowMillis: Double = Date().timeIntervalSince1970 * 1000) throws {
        var query = baseServiceQuery()
        query[kSecReturnAttributes as String] = kCFBooleanTrue
        query[kSecReturnData as String] = kCFBooleanTrue
        query[kSecMatchLimit as String] = kSecMatchLimitAll

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status != errSecItemNotFound {
            guard status == errSecSuccess else {
                throw LiveCasterBroadcastCredentialStoreError.loadFailed(status)
            }
            for item in credentialItems(from: result) {
                guard
                    let account = item[kSecAttrAccount as String] as? String,
                    account.hasPrefix(accountPrefix)
                else {
                    continue
                }
                let data = item[kSecValueData as String] as? Data
                let credential = data.flatMap { try? JSONDecoder().decode(LiveCasterBroadcastCredential.self, from: $0) }
                let accountHandoffID = String(account.dropFirst(accountPrefix.count))
                let shouldClear = credential == nil ||
                    credential?.schemaVersion != schemaVersion ||
                    credential?.handoffID != accountHandoffID ||
                    (credential?.expiresAt ?? 0) < nowMillis
                if shouldClear {
                    try delete(account: account)
                }
            }
        }

        try delete(account: legacyAccount)
    }

    private static func loadCredential(handoffID: String) throws -> LiveCasterBroadcastCredential? {
        var query = baseQuery(account: accountName(handoffID: handoffID))
        query[kSecReturnData as String] = kCFBooleanTrue
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess, let data = result as? Data else {
            throw LiveCasterBroadcastCredentialStoreError.loadFailed(status)
        }
        guard let credential = try? JSONDecoder().decode(LiveCasterBroadcastCredential.self, from: data) else {
            throw LiveCasterBroadcastCredentialStoreError.decodeFailed
        }
        return credential
    }

    private static func delete(account: String) throws {
        var lastStatus = errSecSuccess
        for attempt in 0..<3 {
            let status = SecItemDelete(baseQuery(account: account) as CFDictionary)
            if status == errSecSuccess || status == errSecItemNotFound {
                return
            }
            lastStatus = status
            guard attempt < 2, status == errSecNotAvailable || status == errSecInteractionNotAllowed else {
                break
            }
            Thread.sleep(forTimeInterval: 0.05 * Double(attempt + 1))
        }
        throw LiveCasterBroadcastCredentialStoreError.clearFailed(lastStatus)
    }

    private static func credentialItems(from result: CFTypeRef?) -> [[String: Any]] {
        if let items = result as? [[String: Any]] {
            return items
        }
        if let item = result as? [String: Any] {
            return [item]
        }
        return []
    }

    private static func normalizeHandoffID(_ handoffID: String) throws -> String {
        guard let uuid = UUID(uuidString: handoffID) else {
            throw LiveCasterBroadcastCredentialStoreError.invalidHandoffID
        }
        return uuid.uuidString.lowercased()
    }

    private static func accountName(handoffID: String) -> String {
        "\(accountPrefix)\(handoffID)"
    }

    private static func baseQuery(account: String) -> [String: Any] {
        var query = baseServiceQuery()
        query[kSecAttrAccount as String] = account
        return query
    }

    private static func baseServiceQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccessGroup as String: accessGroup
        ]
    }
}
