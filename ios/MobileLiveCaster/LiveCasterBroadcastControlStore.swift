import Foundation

private let liveCasterBroadcastControlAppGroup = "group.com.mobilelivecaster.app"
private let liveCasterBroadcastControlKey = "MobileLiveCaster.broadcastControl.v1"
private let liveCasterBroadcastControlLifetimeMillis: Double = 60_000
private let liveCasterBroadcastControlFutureSkewMillis: Double = 5_000

enum LiveCasterBroadcastControlAction: String {
    case stop
}

struct LiveCasterBroadcastControlCommand: Equatable {
    let schemaVersion: Int
    let action: LiveCasterBroadcastControlAction
    let handoffID: String
    let requestID: String
    let requestedAt: Double
    let expiresAt: Double

    var payload: [String: Any] {
        [
            "schemaVersion": schemaVersion,
            "action": action.rawValue,
            "handoffId": handoffID,
            "requestId": requestID,
            "requestedAt": requestedAt,
            "expiresAt": expiresAt
        ]
    }
}

enum LiveCasterBroadcastControlStoreError: LocalizedError {
    case sharedStoreUnavailable
    case invalidHandoffID

    var errorDescription: String? {
        switch self {
        case .sharedStoreUnavailable:
            return "App Group control storage is unavailable for the broadcast extension"
        case .invalidHandoffID:
            return "Broadcast control handoff ID is invalid"
        }
    }
}

enum LiveCasterBroadcastControlStore {
    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: liveCasterBroadcastControlAppGroup)
    }

    @discardableResult
    static func request(
        _ action: LiveCasterBroadcastControlAction,
        handoffID: String,
        nowMillis: Double = Date().timeIntervalSince1970 * 1_000
    ) throws -> LiveCasterBroadcastControlCommand {
        guard UUID(uuidString: handoffID) != nil else {
            throw LiveCasterBroadcastControlStoreError.invalidHandoffID
        }
        guard let defaults else {
            throw LiveCasterBroadcastControlStoreError.sharedStoreUnavailable
        }
        let command = LiveCasterBroadcastControlCommand(
            schemaVersion: 1,
            action: action,
            handoffID: handoffID,
            requestID: UUID().uuidString.lowercased(),
            requestedAt: nowMillis,
            expiresAt: nowMillis + liveCasterBroadcastControlLifetimeMillis
        )
        defaults.set(command.payload, forKey: liveCasterBroadcastControlKey)
        defaults.synchronize()
        return command
    }

    static func consume(
        expectedHandoffID: String,
        nowMillis: Double = Date().timeIntervalSince1970 * 1_000
    ) -> LiveCasterBroadcastControlCommand? {
        guard let defaults, let payload = defaults.dictionary(forKey: liveCasterBroadcastControlKey) else {
            return nil
        }
        let payloadHandoffID = payload["handoffId"] as? String
        let expiresAt = number(payload["expiresAt"])
        if payloadHandoffID == nil || expiresAt == nil || expiresAt! < nowMillis {
            defaults.removeObject(forKey: liveCasterBroadcastControlKey)
            defaults.synchronize()
            return nil
        }
        guard payloadHandoffID == expectedHandoffID else {
            return nil
        }
        guard let command = decode(payload, expectedHandoffID: expectedHandoffID, nowMillis: nowMillis) else {
            defaults.removeObject(forKey: liveCasterBroadcastControlKey)
            defaults.synchronize()
            return nil
        }
        defaults.removeObject(forKey: liveCasterBroadcastControlKey)
        defaults.synchronize()
        return command
    }

    static func clear(handoffID: String? = nil) {
        guard let defaults else {
            return
        }
        if let handoffID {
            let storedHandoffID = defaults.dictionary(forKey: liveCasterBroadcastControlKey)?["handoffId"] as? String
            guard storedHandoffID == nil || storedHandoffID == handoffID else {
                return
            }
        }
        defaults.removeObject(forKey: liveCasterBroadcastControlKey)
        defaults.synchronize()
    }

    static func decode(
        _ payload: [String: Any],
        expectedHandoffID: String,
        nowMillis: Double
    ) -> LiveCasterBroadcastControlCommand? {
        let schemaVersion = number(payload["schemaVersion"])
        guard
            schemaVersion == 1,
            let actionValue = payload["action"] as? String,
            let action = LiveCasterBroadcastControlAction(rawValue: actionValue),
            let handoffID = payload["handoffId"] as? String,
            handoffID == expectedHandoffID,
            UUID(uuidString: handoffID) != nil,
            let requestID = payload["requestId"] as? String,
            UUID(uuidString: requestID) != nil,
            let requestedAt = number(payload["requestedAt"]),
            let expiresAt = number(payload["expiresAt"]),
            requestedAt <= nowMillis + liveCasterBroadcastControlFutureSkewMillis,
            expiresAt >= nowMillis,
            expiresAt >= requestedAt,
            expiresAt - requestedAt <= liveCasterBroadcastControlLifetimeMillis
        else {
            return nil
        }
        return LiveCasterBroadcastControlCommand(
            schemaVersion: 1,
            action: action,
            handoffID: handoffID,
            requestID: requestID,
            requestedAt: requestedAt,
            expiresAt: expiresAt
        )
    }

    private static func number(_ value: Any?) -> Double? {
        if let value = value as? NSNumber {
            return value.doubleValue
        }
        if let value = value as? Double {
            return value
        }
        if let value = value as? Int {
            return Double(value)
        }
        return nil
    }
}
