import Darwin
import Foundation

private let liveCasterBroadcastControlAppGroup = "group.com.mobilelivecaster.app"
private let liveCasterBroadcastControlKey = "MobileLiveCaster.broadcastControl.v1"
private let liveCasterBroadcastLifecycleLockName = ".mobilelivecaster-broadcast-lifecycle.lock"
private let liveCasterBroadcastExtensionLeaseName = ".mobilelivecaster-broadcast-extension.lock"
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
    case lifecycleLockUnavailable

    var errorDescription: String? {
        switch self {
        case .sharedStoreUnavailable:
            return "App Group control storage is unavailable for the broadcast extension"
        case .invalidHandoffID:
            return "Broadcast control handoff ID is invalid"
        case .lifecycleLockUnavailable:
            return "Broadcast lifecycle coordination is unavailable"
        }
    }
}

final class LiveCasterBroadcastExtensionLease {
    private var descriptor: Int32?

    fileprivate init(descriptor: Int32) {
        self.descriptor = descriptor
    }

    func release() {
        guard let descriptor else {
            return
        }
        self.descriptor = nil
        _ = flock(descriptor, LOCK_UN)
        _ = Darwin.close(descriptor)
    }

    deinit {
        release()
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
        return try withExclusiveLifecycleLock {
            guard let defaults else {
                throw LiveCasterBroadcastControlStoreError.sharedStoreUnavailable
            }
            if
                let existing = peekUnlocked(
                    defaults: defaults,
                    expectedHandoffID: handoffID,
                    nowMillis: nowMillis
                ),
                existing.action == action
            {
                return existing
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
    }

    static func peek(
        expectedHandoffID: String,
        nowMillis: Double = Date().timeIntervalSince1970 * 1_000
    ) -> LiveCasterBroadcastControlCommand? {
        try? withExclusiveLifecycleLock {
            guard let defaults else {
                return nil
            }
            return peekUnlocked(
                defaults: defaults,
                expectedHandoffID: expectedHandoffID,
                nowMillis: nowMillis
            )
        }
    }

    static func withExclusiveLifecycleCommand<T>(
        expectedHandoffID: String,
        _ action: (LiveCasterBroadcastControlCommand?) throws -> T
    ) throws -> T {
        try withExclusiveLifecycleLock {
            guard let defaults else {
                throw LiveCasterBroadcastControlStoreError.sharedStoreUnavailable
            }
            let command = peekUnlocked(
                defaults: defaults,
                expectedHandoffID: expectedHandoffID,
                nowMillis: Date().timeIntervalSince1970 * 1_000
            )
            return try action(command)
        }
    }

    static func acquireExtensionLease() throws -> LiveCasterBroadcastExtensionLease {
        let descriptor = try openLockFile(named: liveCasterBroadcastExtensionLeaseName)
        guard flock(descriptor, LOCK_EX | LOCK_NB) == 0 else {
            _ = Darwin.close(descriptor)
            throw LiveCasterBroadcastControlStoreError.lifecycleLockUnavailable
        }
        return LiveCasterBroadcastExtensionLease(descriptor: descriptor)
    }

    static func isExtensionLeaseActive() -> Bool {
        guard let descriptor = try? openLockFile(named: liveCasterBroadcastExtensionLeaseName) else {
            return true
        }
        defer { _ = Darwin.close(descriptor) }
        if flock(descriptor, LOCK_EX | LOCK_NB) == 0 {
            _ = flock(descriptor, LOCK_UN)
            return false
        }
        return true
    }

    static func clear(handoffID: String, requestID: String) {
        try? withExclusiveLifecycleLock {
            guard
                let defaults,
                let payload = defaults.dictionary(forKey: liveCasterBroadcastControlKey),
                payload["handoffId"] as? String == handoffID,
                payload["requestId"] as? String == requestID
            else {
                return
            }
            defaults.removeObject(forKey: liveCasterBroadcastControlKey)
            defaults.synchronize()
        }
    }

    private static func peekUnlocked(
        defaults: UserDefaults,
        expectedHandoffID: String,
        nowMillis: Double
    ) -> LiveCasterBroadcastControlCommand? {
        guard let payload = defaults.dictionary(forKey: liveCasterBroadcastControlKey) else {
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
        return command
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

    private static func withExclusiveLifecycleLock<T>(_ action: () throws -> T) throws -> T {
        let descriptor = try openLockFile(named: liveCasterBroadcastLifecycleLockName)
        var lockResult: Int32
        repeat {
            lockResult = flock(descriptor, LOCK_EX)
        } while lockResult != 0 && errno == EINTR
        guard lockResult == 0 else {
            _ = Darwin.close(descriptor)
            throw LiveCasterBroadcastControlStoreError.lifecycleLockUnavailable
        }
        defer {
            _ = flock(descriptor, LOCK_UN)
            _ = Darwin.close(descriptor)
        }
        defaults?.synchronize()
        return try action()
    }

    private static func openLockFile(named name: String) throws -> Int32 {
        guard
            let containerURL = FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: liveCasterBroadcastControlAppGroup
            )
        else {
            throw LiveCasterBroadcastControlStoreError.sharedStoreUnavailable
        }
        let url = containerURL.appendingPathComponent(name, isDirectory: false)
        let descriptor = Darwin.open(url.path, O_CREAT | O_RDWR, mode_t(0o600))
        guard descriptor >= 0 else {
            throw LiveCasterBroadcastControlStoreError.lifecycleLockUnavailable
        }
        return descriptor
    }
}
