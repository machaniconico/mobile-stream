import Foundation
import AVFoundation
import React
import ReplayKit
import UIKit
import os

private let liveCasterAppGroup = "group.com.mobilelivecaster.app"
private let liveCasterBroadcastExtensionId = "com.mobilelivecaster.app.BroadcastUpload"
private let broadcastConfigurationKey = "MobileLiveCaster.broadcastConfiguration.v1"
private let broadcastRuntimeStateKey = "MobileLiveCaster.broadcastRuntimeState.v1"
private let broadcastRuntimeStateStaleMillis: Double = 10_000
private let broadcastCredentialLifetimeMillis: Double = 10 * 60 * 1000
private let broadcastStopAcknowledgementTimeoutMillis: Double = 12_000
private let liveCasterMemoryCriticalThresholdBytes: UInt64 = 64 * 1_024 * 1_024
private let liveCasterMemoryWarningThresholdBytes: UInt64 = 128 * 1_024 * 1_024

enum LiveCasterStatus: String {
    case idle
    case preparing
    case live
    case reconnecting
    case stopping
    case failed

    init?(runtimeStatus: String) {
        switch runtimeStatus {
        case "idle", "stopped":
            self = .idle
        case "preparing", "starting":
            self = .preparing
        case "live", "running", "paused":
            self = .live
        case "reconnecting":
            self = .reconnecting
        case "stopping":
            self = .stopping
        case "failed":
            self = .failed
        default:
            return nil
        }
    }
}

struct LiveCasterHealth {
    var bitrateKbps: Int = 0
    var droppedFrames: Int = 0
    var fps: Int = 0
    var elapsedSeconds: Int = 0
    var reconnectAttempts: Int = 0
    var message: String = "Ready"

    func asDictionary(elapsedSeconds: Int? = nil) -> [String: Any] {
        [
            "bitrateKbps": bitrateKbps,
            "droppedFrames": droppedFrames,
            "fps": fps,
            "elapsedSeconds": elapsedSeconds ?? self.elapsedSeconds,
            "reconnectAttempts": reconnectAttempts,
            "message": message
        ]
    }
}

enum LiveCasterNativeError: LocalizedError {
    case invalidProfile
    case streamKeyMissing
    case invalidDestination
    case sharedStoreUnavailable
    case profileMissing
    case presentationUnavailable
    case broadcastButtonUnavailable
    case qualityDestinationChange
    case broadcastStopPending
    case broadcastAlreadyActive

    var errorDescription: String? {
        switch self {
        case .invalidProfile:
            return "Stream profile JSON is invalid"
        case .streamKeyMissing:
            return "Stream key is required"
        case .invalidDestination:
            return "Only valid RTMP and RTMPS destinations are supported"
        case .sharedStoreUnavailable:
            return "App Group storage is unavailable for the broadcast extension"
        case .profileMissing:
            return "Prepare a stream profile before starting"
        case .presentationUnavailable:
            return "Could not present the iOS broadcast picker"
        case .broadcastButtonUnavailable:
            return "Could not open the iOS broadcast picker"
        case .qualityDestinationChange:
            return "Quality update cannot change the stream destination"
        case .broadcastStopPending:
            return "Wait for the current iOS broadcast to finish stopping before starting again"
        case .broadcastAlreadyActive:
            return "Stop the current iOS broadcast before preparing another one"
        }
    }

    var code: String {
        switch self {
        case .invalidProfile:
            return "invalid_profile"
        case .streamKeyMissing:
            return "stream_key_missing"
        case .invalidDestination:
            return "invalid_destination"
        case .sharedStoreUnavailable:
            return "shared_store_unavailable"
        case .profileMissing:
            return "profile_missing"
        case .presentationUnavailable:
            return "presentation_unavailable"
        case .broadcastButtonUnavailable:
            return "broadcast_button_unavailable"
        case .qualityDestinationChange:
            return "quality_destination_change"
        case .broadcastStopPending:
            return "broadcast_stop_pending"
        case .broadcastAlreadyActive:
            return "broadcast_already_active"
        }
    }
}

struct LiveCasterPreparedConfiguration {
    let destinationName: String
    let serverURL: String
    let streamKey: String
    let publishURL: String
    let width: Int
    let height: Int
    let fps: Int
    let videoBitrateKbps: Int
    let audioBitrateKbps: Int
    let micEffects: LiveCasterMicEffectsConfiguration
    let broadcastMixer: LiveCasterBroadcastMixerConfiguration

    init(profileJSON: String) throws {
        guard
            let data = profileJSON.data(using: .utf8),
            let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let destination = root["destination"] as? [String: Any],
            let quality = root["quality"] as? [String: Any]
        else {
            throw LiveCasterNativeError.invalidProfile
        }

        let rawServerURL = Self.stringValue(destination["serverUrl"])
        let rawStreamKey = Self.stringValue(destination["streamKey"])
        let normalizedDestination = Self.normalizeDestination(serverURL: rawServerURL, streamKey: rawStreamKey)
        guard !normalizedDestination.streamKey.isEmpty else {
            throw LiveCasterNativeError.streamKeyMissing
        }

        let endpoint = Self.buildPublishURL(serverURL: normalizedDestination.serverURL, streamKey: normalizedDestination.streamKey)
        guard
            let url = URL(string: endpoint),
            let scheme = url.scheme?.lowercased(),
            scheme == "rtmp" || scheme == "rtmps",
            url.host?.isEmpty == false
        else {
            throw LiveCasterNativeError.invalidDestination
        }

        destinationName = Self.stringValue(destination["presetId"], fallback: "custom-rtmps")
        serverURL = normalizedDestination.serverURL
        streamKey = normalizedDestination.streamKey
        publishURL = endpoint
        width = Self.intValue(quality["width"], fallback: 1280, range: 360...3840)
        height = Self.intValue(quality["height"], fallback: 720, range: 360...2160)
        fps = Self.intValue(quality["fps"], fallback: 30, range: 15...60)
        videoBitrateKbps = Self.intValue(quality["videoBitrateKbps"], fallback: 4500, range: 800...20000)
        audioBitrateKbps = Self.intValue(quality["audioBitrateKbps"], fallback: 128, range: 64...320)
        micEffects = LiveCasterMicEffectsConfiguration(payload: root["micEffects"] as? [String: Any])
        broadcastMixer = LiveCasterBroadcastMixerConfiguration(payload: root["broadcastMixer"] as? [String: Any])
    }

    func payload(renderGraphJSON: String, handoffID: String, expiresAt: Double) -> [String: Any] {
        let now = Date().timeIntervalSince1970 * 1000
        return [
            "schemaVersion": 1,
            "createdAt": now,
            "expiresAt": expiresAt,
            "handoffId": handoffID,
            "preferredExtension": liveCasterBroadcastExtensionId,
            "destinationName": destinationName,
            "width": width,
            "height": height,
            "fps": fps,
            "videoBitrateKbps": videoBitrateKbps,
            "audioBitrateKbps": audioBitrateKbps,
            "micEffects": micEffects.payload,
            "broadcastMixer": broadcastMixer.payload,
            "renderGraphUpdatedAt": now,
            "renderGraph": renderGraphJSON
        ]
    }

    func hasSameDestination(as other: LiveCasterPreparedConfiguration) -> Bool {
        serverURL == other.serverURL && streamKey == other.streamKey && publishURL == other.publishURL
    }

    private static func normalizeDestination(serverURL: String, streamKey: String) -> (serverURL: String, streamKey: String) {
        let normalizedServerURL = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedStreamKey = streamKey.trimmingCharacters(in: .whitespacesAndNewlines).trimmingLeadingSlashes()
        if let splitURL = splitPublishURL(normalizedStreamKey) {
            return splitURL
        }
        return (normalizedServerURL, normalizedStreamKey)
    }

    private static func buildPublishURL(serverURL: String, streamKey: String) -> String {
        let normalizedServerURL = serverURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingTrailingSlashes()
        if let placeholderRange = normalizedServerURL.range(of: "{stream_key}", options: [.caseInsensitive]) {
            return normalizedServerURL.replacingCharacters(in: placeholderRange, with: streamKey)
        }
        if normalizedServerURL.hasSuffix("/\(streamKey)") {
            return normalizedServerURL
        }
        return "\(normalizedServerURL)/\(streamKey)"
    }

    private static func splitPublishURL(_ rawValue: String) -> (serverURL: String, streamKey: String)? {
        let normalized = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard
            normalized.lowercased().hasPrefix("rtmp://") || normalized.lowercased().hasPrefix("rtmps://"),
            let url = URL(string: normalized),
            let scheme = url.scheme?.lowercased(),
            scheme == "rtmp" || scheme == "rtmps",
            let host = url.host,
            !host.isEmpty
        else {
            return nil
        }

        let segments = url.path.split(separator: "/").map(String.init)
        guard segments.count >= 2 else {
            return nil
        }

        let port = url.port.map { ":\($0)" } ?? ""
        let endpointPath = segments.dropLast().joined(separator: "/")
        let query = url.query.map { "?\($0)" } ?? ""
        let streamKey = "\(segments.last ?? "")\(query)"
        return ("\(scheme)://\(host)\(port)/\(endpointPath)", streamKey)
    }

    private static func stringValue(_ value: Any?, fallback: String = "") -> String {
        if let stringValue = value as? String {
            return stringValue
        }
        if let numberValue = value as? NSNumber {
            return numberValue.stringValue
        }
        return fallback
    }

    private static func intValue(_ value: Any?, fallback: Int, range: ClosedRange<Int>) -> Int {
        let parsed: Int?
        if let numberValue = value as? NSNumber {
            parsed = numberValue.intValue
        } else if let stringValue = value as? String {
            parsed = Int(stringValue)
        } else {
            parsed = nil
        }
        guard let parsed else {
            return fallback
        }
        return min(max(parsed, range.lowerBound), range.upperBound)
    }
}

struct LiveCasterMicEffectsConfiguration {
    let enabled: Bool
    let presetId: String
    let inputGainDb: Double
    let noiseGateDb: Double
    let compression: Double
    let monitorEnabled: Bool
    let monitorVolume: Double
    let monitorHeadphonesOnly: Bool

    init(payload: [String: Any]?) {
        enabled = Self.boolValue(payload?["enabled"], fallback: false)
        presetId = Self.stringValue(payload?["presetId"], fallback: "clean")
        inputGainDb = Self.doubleValue(payload?["inputGainDb"], fallback: 0, range: -12...12)
        noiseGateDb = Self.doubleValue(payload?["noiseGateDb"], fallback: -60, range: (-70)...(-25))
        compression = Self.doubleValue(payload?["compression"], fallback: 0.15, range: 0...1)
        monitorEnabled = Self.boolValue(payload?["monitorEnabled"], fallback: false)
        monitorVolume = Self.doubleValue(payload?["monitorVolume"], fallback: 0.45, range: 0...1)
        monitorHeadphonesOnly = Self.boolValue(payload?["monitorHeadphonesOnly"], fallback: true)
    }

    var payload: [String: Any] {
        [
            "enabled": enabled,
            "presetId": presetId,
            "inputGainDb": inputGainDb,
            "noiseGateDb": noiseGateDb,
            "compression": compression,
            "monitorEnabled": monitorEnabled,
            "monitorVolume": monitorVolume,
            "monitorHeadphonesOnly": monitorHeadphonesOnly
        ]
    }

    private static func stringValue(_ value: Any?, fallback: String) -> String {
        if let stringValue = value as? String {
            let normalized = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            return normalized.isEmpty ? fallback : normalized
        }
        if let numberValue = value as? NSNumber {
            return numberValue.stringValue
        }
        return fallback
    }

    private static func boolValue(_ value: Any?, fallback: Bool) -> Bool {
        if let boolValue = value as? Bool {
            return boolValue
        }
        if let numberValue = value as? NSNumber {
            return numberValue.boolValue
        }
        if let stringValue = value as? String {
            switch stringValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
            case "true", "1", "yes":
                return true
            case "false", "0", "no":
                return false
            default:
                break
            }
        }
        return fallback
    }

    private static func doubleValue(_ value: Any?, fallback: Double, range: ClosedRange<Double>) -> Double {
        let parsed: Double?
        if let numberValue = value as? NSNumber {
            parsed = numberValue.doubleValue
        } else if let stringValue = value as? String {
            parsed = Double(stringValue)
        } else {
            parsed = nil
        }
        guard let parsed else {
            return fallback
        }
        return min(max(parsed, range.lowerBound), range.upperBound)
    }
}

struct LiveCasterBroadcastMixerConfiguration {
    let mic: LiveCasterBroadcastMixerChannelConfiguration
    let appAudio: LiveCasterBroadcastMixerChannelConfiguration
    let chatReadout: LiveCasterBroadcastMixerChannelConfiguration

    init(payload: [String: Any]?) {
        mic = LiveCasterBroadcastMixerChannelConfiguration(payload: payload?["mic"] as? [String: Any], fallbackVolume: 1)
        appAudio = LiveCasterBroadcastMixerChannelConfiguration(payload: payload?["appAudio"] as? [String: Any], fallbackVolume: 0.85)
        chatReadout = LiveCasterBroadcastMixerChannelConfiguration(payload: payload?["chatReadout"] as? [String: Any], fallbackVolume: 0.85)
    }

    var payload: [String: Any] {
        [
            "mic": mic.payload,
            "appAudio": appAudio.payload,
            "chatReadout": chatReadout.payload
        ]
    }
}

struct LiveCasterBroadcastMixerChannelConfiguration {
    let volume: Double
    let muted: Bool

    var effectiveVolume: Double {
        muted ? 0 : volume
    }

    init(payload: [String: Any]?, fallbackVolume: Double) {
        volume = Self.doubleValue(payload?["volume"], fallback: fallbackVolume, range: 0...1)
        muted = Self.boolValue(payload?["muted"], fallback: false)
    }

    var payload: [String: Any] {
        [
            "volume": volume,
            "muted": muted
        ]
    }

    private static func doubleValue(_ value: Any?, fallback: Double, range: ClosedRange<Double>) -> Double {
        let parsed: Double?
        if let doubleValue = value as? Double {
            parsed = doubleValue
        } else if let numberValue = value as? NSNumber {
            parsed = numberValue.doubleValue
        } else if let stringValue = value as? String {
            parsed = Double(stringValue.trimmingCharacters(in: .whitespacesAndNewlines))
        } else {
            parsed = nil
        }
        guard let parsed else {
            return fallback
        }
        return min(max(parsed, range.lowerBound), range.upperBound)
    }

    private static func boolValue(_ value: Any?, fallback: Bool) -> Bool {
        if let boolValue = value as? Bool {
            return boolValue
        }
        if let numberValue = value as? NSNumber {
            return numberValue.boolValue
        }
        if let stringValue = value as? String {
            let normalized = stringValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if ["true", "yes", "1"].contains(normalized) {
                return true
            }
            if ["false", "no", "0"].contains(normalized) {
                return false
            }
        }
        return fallback
    }
}

private struct LiveCasterPersistedBroadcastHandoff {
    let handoffID: String
    let expiresAt: Double
}

final class LiveCasterSharedStore {
    private var defaults: UserDefaults? {
        UserDefaults(suiteName: liveCasterAppGroup)
    }

    func saveConfiguration(
        _ configuration: LiveCasterPreparedConfiguration,
        renderGraphJSON: String,
        handoffID: String,
        expiresAt: Double
    ) throws {
        guard let defaults else {
            throw LiveCasterNativeError.sharedStoreUnavailable
        }
        try LiveCasterBroadcastCredentialStore.savePublishURL(
            configuration.publishURL,
            handoffID: handoffID,
            expiresAt: expiresAt
        )
        defaults.set(
            configuration.payload(renderGraphJSON: renderGraphJSON, handoffID: handoffID, expiresAt: expiresAt),
            forKey: broadcastConfigurationKey
        )
        defaults.synchronize()
    }

    func saveConfigurationMetadata(
        _ configuration: LiveCasterPreparedConfiguration,
        renderGraphJSON: String,
        handoffID: String,
        expiresAt: Double
    ) throws {
        guard let defaults else {
            throw LiveCasterNativeError.sharedStoreUnavailable
        }
        defaults.set(
            configuration.payload(renderGraphJSON: renderGraphJSON, handoffID: handoffID, expiresAt: expiresAt),
            forKey: broadcastConfigurationKey
        )
        defaults.synchronize()
    }

    func clearConfiguration(handoffID: String) throws {
        if let defaults {
            let storedHandoffID = defaults.dictionary(forKey: broadcastConfigurationKey)?["handoffId"] as? String
            if storedHandoffID == nil || storedHandoffID == handoffID {
                defaults.removeObject(forKey: broadcastConfigurationKey)
                defaults.synchronize()
            }
        }
        try LiveCasterBroadcastCredentialStore.clear(handoffID: handoffID)
    }

    func clearCredential(handoffID: String) throws {
        try LiveCasterBroadcastCredentialStore.clear(handoffID: handoffID)
    }

    func cleanupExpiredCredentials() throws {
        let now = Date().timeIntervalSince1970 * 1000
        try LiveCasterBroadcastCredentialStore.clearExpiredCredentials(nowMillis: now)
        guard let defaults, let payload = defaults.dictionary(forKey: broadcastConfigurationKey) else {
            return
        }
        let handoffID = payload["handoffId"] as? String
        let expiresAt = (payload["expiresAt"] as? NSNumber)?.doubleValue ?? 0
        guard handoffID == nil || expiresAt < now else {
            return
        }
        defaults.removeObject(forKey: broadcastConfigurationKey)
        defaults.synchronize()
    }

    func loadRuntimeState() -> [String: Any]? {
        defaults?.dictionary(forKey: broadcastRuntimeStateKey)
    }

    fileprivate func loadPersistedBroadcastHandoff() -> LiveCasterPersistedBroadcastHandoff? {
        guard
            let payload = defaults?.dictionary(forKey: broadcastConfigurationKey),
            (payload["schemaVersion"] as? NSNumber)?.intValue == 1,
            payload["preferredExtension"] as? String == liveCasterBroadcastExtensionId,
            let rawHandoffID = payload["handoffId"] as? String,
            let handoffUUID = UUID(uuidString: rawHandoffID),
            let expiresAt = (payload["expiresAt"] as? NSNumber)?.doubleValue,
            expiresAt.isFinite,
            expiresAt > 0
        else {
            return nil
        }
        return LiveCasterPersistedBroadcastHandoff(
            handoffID: handoffUUID.uuidString.lowercased(),
            expiresAt: expiresAt
        )
    }

    func clearRuntimeState() {
        guard let defaults else {
            return
        }
        defaults.removeObject(forKey: broadcastRuntimeStateKey)
        defaults.synchronize()
    }

    @discardableResult
    func saveControlAction(
        _ action: LiveCasterBroadcastControlAction,
        handoffID: String
    ) throws -> LiveCasterBroadcastControlCommand {
        try LiveCasterBroadcastControlStore.request(action, handoffID: handoffID)
    }

    func clearControlAction(handoffID: String, requestID: String) {
        LiveCasterBroadcastControlStore.clear(handoffID: handoffID, requestID: requestID)
    }

    func clearControlAction(handoffID: String) {
        guard let command = LiveCasterBroadcastControlStore.peek(expectedHandoffID: handoffID) else {
            return
        }
        LiveCasterBroadcastControlStore.clear(
            handoffID: handoffID,
            requestID: command.requestID
        )
    }
}

@objc(LiveCasterNative)
final class LiveCasterNative: RCTEventEmitter {
    private let stateQueue = DispatchQueue(label: "MobileLiveCaster.iosLiveCaster.state")
    private let sharedStore = LiveCasterSharedStore()
    private var hasListeners = false
    private var status: LiveCasterStatus = .idle
    private var health = LiveCasterHealth()
    private var startedAt: Date?
    private var preparedConfiguration: LiveCasterPreparedConfiguration?
    private var renderGraphJSON = "[]"
    private var runtimePoller: DispatchSourceTimer?
    private var broadcastHandoffID: String?
    private var broadcastHandoffExpiresAt: Double?
    private var credentialCleanupWorkItem: DispatchWorkItem?
    private var stopAcknowledgementWorkItem: DispatchWorkItem?
    private var pendingStopHandoffID: String?
    private var pendingStopRequestID: String?
    private var stopAcknowledgementTimedOut = false
    private var lastRuntimeUpdatedAt: Double = 0
    private var nativeRuntime: [String: Any]?

    deinit {
        runtimePoller?.cancel()
        credentialCleanupWorkItem?.cancel()
        stopAcknowledgementWorkItem?.cancel()
    }

    @objc
    override static func requiresMainQueueSetup() -> Bool {
        true
    }

    override func supportedEvents() -> [String]! {
        ["LiveCasterSnapshot"]
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    @objc(getSnapshot:rejecter:)
    func getSnapshot(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        stateQueue.async { [weak self] in
            guard let self else {
                resolve(nil)
                return
            }
            _ = self.restorePersistedBroadcastStateLocked()
            _ = self.refreshRuntimeStateFromStoreLocked(allowStale: false, emitSnapshot: false)
            resolve(self.snapshotLocked())
        }
    }

    @objc(getAudioRoute:rejecter:)
    func getAudioRoute(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        resolve(Self.audioRouteMap())
    }

    @objc(prepare:profileJson:resolver:rejecter:)
    func prepare(
        _ nextRenderGraphJSON: String,
        profileJson: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        stateQueue.async { [weak self] in
            guard let self else {
                resolve(nil)
                return
            }
            _ = self.restorePersistedBroadcastStateLocked()
            guard self.pendingStopHandoffID == nil else {
                let error = LiveCasterNativeError.broadcastStopPending
                reject(error.code, error.localizedDescription, error)
                return
            }
            guard !self.hasActiveBroadcastHandoffLocked() else {
                let error = LiveCasterNativeError.broadcastAlreadyActive
                reject(error.code, error.localizedDescription, error)
                return
            }
            do {
                let configuration = try LiveCasterPreparedConfiguration(profileJSON: profileJson)
                self.stopRuntimePollingLocked()
                self.sharedStore.clearRuntimeState()
                try self.clearBroadcastHandoffLocked()
                self.preparedConfiguration = configuration
                self.renderGraphJSON = nextRenderGraphJSON
                self.startedAt = nil
                self.lastRuntimeUpdatedAt = 0
                self.nativeRuntime = nil
                self.status = .preparing
                self.health = LiveCasterHealth(
                    bitrateKbps: 0,
                    droppedFrames: 0,
                    fps: configuration.fps,
                    elapsedSeconds: 0,
                    reconnectAttempts: 0,
                    message: "Ready to open iOS broadcast picker"
                )
                let snapshot = self.snapshotLocked()
                self.emitSnapshot(snapshot)
                resolve(snapshot)
            } catch {
                try? self.clearBroadcastHandoffLocked()
                let message = self.redactSensitiveTextLocked(error.localizedDescription)
                self.failLocked(message)
                reject((error as? LiveCasterNativeError)?.code ?? "prepare_failed", message, error)
            }
        }
    }

    @objc(start:rejecter:)
    func start(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        stateQueue.async { [weak self] in
            guard let self else {
                resolve(nil)
                return
            }
            guard self.pendingStopHandoffID == nil else {
                let error = LiveCasterNativeError.broadcastStopPending
                reject(error.code, error.localizedDescription, error)
                return
            }
            guard let preparedConfiguration = self.preparedConfiguration else {
                self.failLocked(LiveCasterNativeError.profileMissing.localizedDescription)
                reject(LiveCasterNativeError.profileMissing.code, LiveCasterNativeError.profileMissing.localizedDescription, nil)
                return
            }

            do {
                try self.beginBroadcastHandoffLocked(preparedConfiguration, renderGraphJSON: self.renderGraphJSON)
            } catch {
                let message = self.redactSensitiveTextLocked(error.localizedDescription)
                self.failLocked(message)
                reject("broadcast_credential_save_failed", message, error)
                return
            }

            self.status = .preparing
            self.startedAt = nil
            self.health.message = "Opening iOS broadcast picker"
            self.sharedStore.clearRuntimeState()
            self.lastRuntimeUpdatedAt = 0
            self.nativeRuntime = nil
            let pendingSnapshot = self.snapshotLocked()
            self.emitSnapshot(pendingSnapshot)

            DispatchQueue.main.async { [weak self] in
                guard let self else {
                    resolve(nil)
                    return
                }
                do {
                    try self.openBroadcastPicker()
                    self.stateQueue.async {
                        self.health.message = "Broadcast picker opened; confirm Start Broadcast in iOS"
                        self.startRuntimePollingLocked()
                        let snapshot = self.snapshotLocked()
                        self.emitSnapshot(snapshot)
                        resolve(snapshot)
                    }
                } catch {
                    self.stateQueue.async {
                        try? self.clearBroadcastHandoffLocked()
                        let message = self.redactSensitiveTextLocked(error.localizedDescription)
                        self.failLocked(message)
                        reject((error as? LiveCasterNativeError)?.code ?? "start_failed", message, error)
                    }
                }
            }
        }
    }

    @objc(stop:rejecter:)
    func stop(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        stateQueue.async { [weak self] in
            guard let self else {
                resolve(nil)
                return
            }
            _ = self.restorePersistedBroadcastStateLocked()
            guard let handoffID = self.broadcastHandoffID else {
                self.stopRuntimePollingLocked()
                self.status = .idle
                self.startedAt = nil
                self.health = LiveCasterHealth(message: "Ready")
                let snapshot = self.snapshotLocked()
                self.emitSnapshot(snapshot)
                resolve(snapshot)
                return
            }
            do {
                let command = try self.sharedStore.saveControlAction(.stop, handoffID: handoffID)
                self.pendingStopRequestID = command.requestID
            } catch {
                let message = self.redactSensitiveTextLocked(error.localizedDescription)
                reject("broadcast_stop_request_failed", message, error)
                return
            }
            self.pendingStopHandoffID = handoffID
            self.stopAcknowledgementTimedOut = false
            self.status = .stopping
            self.health.message = "Stopping iOS broadcast and waiting for extension confirmation"
            self.startRuntimePollingLocked()
            self.scheduleStopAcknowledgementTimeoutLocked(
                handoffID: handoffID,
                requestID: self.pendingStopRequestID
            )
            let snapshot = self.snapshotLocked()
            self.emitSnapshot(snapshot)
            resolve(snapshot)
        }
    }

    @objc(reconnect:rejecter:)
    func reconnect(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        stateQueue.async { [weak self] in
            guard let self else {
                resolve(nil)
                return
            }
            guard self.pendingStopHandoffID == nil else {
                let error = LiveCasterNativeError.broadcastStopPending
                reject(error.code, error.localizedDescription, error)
                return
            }
            guard let preparedConfiguration = self.preparedConfiguration else {
                self.failLocked(LiveCasterNativeError.profileMissing.localizedDescription)
                reject(LiveCasterNativeError.profileMissing.code, LiveCasterNativeError.profileMissing.localizedDescription, nil)
                return
            }
            do {
                try self.beginBroadcastHandoffLocked(preparedConfiguration, renderGraphJSON: self.renderGraphJSON)
            } catch {
                let message = self.redactSensitiveTextLocked(error.localizedDescription)
                self.failLocked(message)
                reject("broadcast_credential_save_failed", message, error)
                return
            }
            self.status = .reconnecting
            self.health.reconnectAttempts += 1
            self.health.message = "Reopening iOS broadcast picker"
            self.sharedStore.clearRuntimeState()
            self.lastRuntimeUpdatedAt = 0
            self.nativeRuntime = nil
            let snapshot = self.snapshotLocked()
            self.emitSnapshot(snapshot)
            DispatchQueue.main.async { [weak self] in
                guard let self else {
                    resolve(nil)
                    return
                }
                do {
                    try self.openBroadcastPicker()
                    self.stateQueue.async {
                        self.health.message = "Broadcast picker reopened"
                        self.startRuntimePollingLocked()
                        let snapshot = self.snapshotLocked()
                        self.emitSnapshot(snapshot)
                        resolve(snapshot)
                    }
                } catch {
                    self.stateQueue.async {
                        try? self.clearBroadcastHandoffLocked()
                        let message = self.redactSensitiveTextLocked(error.localizedDescription)
                        self.failLocked(message)
                        reject((error as? LiveCasterNativeError)?.code ?? "reconnect_failed", message, error)
                    }
                }
            }
        }
    }

    @objc(updateScene:resolver:rejecter:)
    func updateScene(
        _ nextRenderGraphJSON: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        stateQueue.async { [weak self] in
            guard let self else {
                resolve(nil)
                return
            }
            self.renderGraphJSON = nextRenderGraphJSON
            if
                let preparedConfiguration = self.preparedConfiguration,
                let handoffID = self.broadcastHandoffID,
                let expiresAt = self.broadcastHandoffExpiresAt,
                self.status != .idle,
                self.status != .failed
            {
                try? self.sharedStore.saveConfigurationMetadata(
                    preparedConfiguration,
                    renderGraphJSON: nextRenderGraphJSON,
                    handoffID: handoffID,
                    expiresAt: expiresAt
                )
            }
            let snapshot = self.snapshotLocked()
            resolve(snapshot)
        }
    }

    @objc(updateQuality:resolver:rejecter:)
    func updateQuality(
        _ profileJson: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        stateQueue.async { [weak self] in
            guard let self else {
                resolve(nil)
                return
            }
            do {
                let nextConfiguration = try LiveCasterPreparedConfiguration(profileJSON: profileJson)
                if let currentConfiguration = self.preparedConfiguration,
                   !nextConfiguration.hasSameDestination(as: currentConfiguration) {
                    throw LiveCasterNativeError.qualityDestinationChange
                }

                self.preparedConfiguration = nextConfiguration
                if
                    let handoffID = self.broadcastHandoffID,
                    let expiresAt = self.broadcastHandoffExpiresAt,
                    self.status != .idle,
                    self.status != .failed
                {
                    try self.sharedStore.saveConfigurationMetadata(
                        nextConfiguration,
                        renderGraphJSON: self.renderGraphJSON,
                        handoffID: handoffID,
                        expiresAt: expiresAt
                    )
                }
                self.health.fps = nextConfiguration.fps
                self.health.message =
                    self.status == .live || self.status == .reconnecting
                    ? "Quality target sent to the iOS broadcast extension"
                    : "Quality target updated"
                let snapshot = self.snapshotLocked()
                self.emitSnapshot(snapshot)
                resolve(snapshot)
            } catch {
                let message = self.redactSensitiveTextLocked(error.localizedDescription)
                reject((error as? LiveCasterNativeError)?.code ?? "quality_update_failed", message, error)
            }
        }
    }

    @discardableResult
    private func restorePersistedBroadcastStateLocked() -> Bool {
        if broadcastHandoffID != nil {
            return true
        }
        guard let persistedHandoff = sharedStore.loadPersistedBroadcastHandoff() else {
            return false
        }

        let runtimeState = sharedStore.loadRuntimeState()
        let matchingRuntimeState = runtimeState.flatMap { state in
            state.stringValue("handoffId") == persistedHandoff.handoffID ? state : nil
        }
        if let matchingRuntimeState {
            let runtimeStatus = matchingRuntimeState.stringValue("status")
            let reportedStatus = Self.effectiveRuntimeStatus(
                LiveCasterStatus(runtimeStatus: runtimeStatus),
                runtimeState: matchingRuntimeState
            )
            if reportedStatus == .idle || reportedStatus == .failed {
                sharedStore.clearControlAction(handoffID: persistedHandoff.handoffID)
                try? sharedStore.clearConfiguration(handoffID: persistedHandoff.handoffID)
                status = reportedStatus ?? .idle
                startedAt = nil
                health.message = reportedStatus == .failed
                    ? "Previous iOS broadcast extension ended with a failure"
                    : "Ready"
                return false
            }
        }

        broadcastHandoffID = persistedHandoff.handoffID
        broadcastHandoffExpiresAt = persistedHandoff.expiresAt
        if let matchingRuntimeState, Self.isRuntimeStateFresh(matchingRuntimeState) {
            applyRuntimeStateLocked(matchingRuntimeState)
        } else {
            status = .reconnecting
            startedAt = nil
            health.message = "Restored previous iOS broadcast; waiting for extension telemetry"
            if let matchingRuntimeState {
                nativeRuntime = Self.nativeRuntimeMap(
                    matchingRuntimeState,
                    status: status,
                    stale: true,
                    message: health.message,
                    streamKey: "",
                    publishURL: ""
                )
            }
        }
        startRuntimePollingLocked()
        return true
    }

    private func hasActiveBroadcastHandoffLocked() -> Bool {
        guard broadcastHandoffID != nil else {
            return false
        }
        return status == .live ||
            status == .preparing ||
            status == .reconnecting ||
            status == .stopping
    }

    private func beginBroadcastHandoffLocked(
        _ configuration: LiveCasterPreparedConfiguration,
        renderGraphJSON: String
    ) throws {
        guard pendingStopHandoffID == nil else {
            throw LiveCasterNativeError.broadcastStopPending
        }
        try sharedStore.cleanupExpiredCredentials()
        if broadcastHandoffID != nil {
            try clearBroadcastHandoffLocked()
        }

        let handoffID = UUID().uuidString.lowercased()
        let expiresAt = Date().timeIntervalSince1970 * 1000 + broadcastCredentialLifetimeMillis
        do {
            try sharedStore.saveConfiguration(
                configuration,
                renderGraphJSON: renderGraphJSON,
                handoffID: handoffID,
                expiresAt: expiresAt
            )
        } catch {
            try? sharedStore.clearConfiguration(handoffID: handoffID)
            throw error
        }

        broadcastHandoffID = handoffID
        broadcastHandoffExpiresAt = expiresAt
        scheduleCredentialCleanupLocked(handoffID: handoffID, deadlineMillis: expiresAt, retryAttempt: 0)
    }

    private func clearBroadcastHandoffLocked() throws {
        guard let handoffID = broadcastHandoffID else {
            try sharedStore.cleanupExpiredCredentials()
            return
        }
        do {
            try sharedStore.clearConfiguration(handoffID: handoffID)
            credentialCleanupWorkItem?.cancel()
            credentialCleanupWorkItem = nil
            broadcastHandoffID = nil
            broadcastHandoffExpiresAt = nil
        } catch {
            scheduleCredentialCleanupLocked(
                handoffID: handoffID,
                deadlineMillis: Date().timeIntervalSince1970 * 1000 + 1_000,
                retryAttempt: 1
            )
            throw error
        }
    }

    private func scheduleStopAcknowledgementTimeoutLocked(handoffID: String, requestID: String?) {
        stopAcknowledgementWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            guard
                let self,
                self.pendingStopHandoffID == handoffID,
                self.pendingStopRequestID == requestID
            else {
                return
            }
            _ = self.refreshRuntimeStateFromStoreLocked(allowStale: true, emitSnapshot: false)
            guard self.pendingStopHandoffID == handoffID else {
                self.emitSnapshot(self.snapshotLocked())
                return
            }
            guard
                self.hasFreshActiveRuntimeLocked(handoffID: handoffID) ||
                    LiveCasterBroadcastControlStore.isExtensionLeaseActive()
            else {
                self.recoverUnresponsiveStopLocked(handoffID: handoffID)
                self.emitSnapshot(self.snapshotLocked())
                return
            }
            self.stopAcknowledgementTimedOut = true
            self.status = .failed
            self.health.message = "iOS broadcast stop was not confirmed. Retry Stop or use the iOS system broadcast control"
            self.emitSnapshot(self.snapshotLocked())
        }
        stopAcknowledgementWorkItem = workItem
        stateQueue.asyncAfter(
            deadline: .now() + .milliseconds(Int(broadcastStopAcknowledgementTimeoutMillis)),
            execute: workItem
        )
    }

    private func hasFreshActiveRuntimeLocked(handoffID: String) -> Bool {
        guard
            let runtimeState = sharedStore.loadRuntimeState(),
            runtimeState.stringValue("handoffId") == handoffID,
            Self.isRuntimeStateFresh(runtimeState)
        else {
            return false
        }
        guard let runtimeStatus = LiveCasterStatus(runtimeStatus: runtimeState.stringValue("status")) else {
            return true
        }
        return runtimeStatus != .idle && runtimeStatus != .failed
    }

    private func recoverUnresponsiveStopLocked(handoffID: String) {
        let requestID = pendingStopRequestID
        pendingStopHandoffID = nil
        pendingStopRequestID = nil
        stopAcknowledgementTimedOut = false
        stopAcknowledgementWorkItem?.cancel()
        stopAcknowledgementWorkItem = nil
        if let requestID {
            sharedStore.clearControlAction(handoffID: handoffID, requestID: requestID)
        }
        var cleanupRequiresRetry = false
        if broadcastHandoffID == handoffID {
            do {
                try clearBroadcastHandoffLocked()
            } catch {
                cleanupRequiresRetry = true
            }
        }
        sharedStore.clearRuntimeState()
        lastRuntimeUpdatedAt = 0
        nativeRuntime = nil
        status = .idle
        startedAt = nil
        stopRuntimePollingLocked()
        health = LiveCasterHealth(
            message: cleanupRequiresRetry
                ? "Unresponsive iOS broadcast state cleared; credential cleanup will retry"
                : "Unresponsive iOS broadcast state cleared; ready to start again"
        )
    }

    private func completeStopAcknowledgementLocked() {
        let handoffID = pendingStopHandoffID
        let requestID = pendingStopRequestID
        pendingStopHandoffID = nil
        pendingStopRequestID = nil
        stopAcknowledgementTimedOut = false
        stopAcknowledgementWorkItem?.cancel()
        stopAcknowledgementWorkItem = nil
        if let handoffID, let requestID {
            sharedStore.clearControlAction(handoffID: handoffID, requestID: requestID)
        }
        if broadcastHandoffID == handoffID {
            do {
                try clearBroadcastHandoffLocked()
            } catch {
                health.message = "Broadcast stopped; credential cleanup will retry"
            }
        }
        status = .idle
        startedAt = nil
        stopRuntimePollingLocked()
        if !health.message.contains("cleanup") {
            health.message = "iOS broadcast extension confirmed stop"
        }
    }

    private func runtimePollingRequiredLocked() -> Bool {
        pendingStopHandoffID != nil ||
            status == .live ||
            status == .preparing ||
            status == .reconnecting ||
            status == .stopping
    }

    private func stopConfirmationMessageLocked(waitingMessage: String) -> String {
        if stopAcknowledgementTimedOut {
            return "iOS broadcast stop was not confirmed. Retry Stop or use the iOS system broadcast control"
        }
        return pendingStopHandoffID == nil ? waitingMessage : "Waiting for iOS broadcast extension stop confirmation"
    }

    private func scheduleCredentialCleanupLocked(
        handoffID: String,
        deadlineMillis: Double,
        retryAttempt: Int
    ) {
        credentialCleanupWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            guard let self, self.broadcastHandoffID == handoffID else {
                return
            }
            do {
                try self.sharedStore.clearCredential(handoffID: handoffID)
                self.credentialCleanupWorkItem = nil
            } catch {
                guard retryAttempt < 3 else {
                    self.credentialCleanupWorkItem = nil
                    self.health.message = "Broadcast credential cleanup requires another app retry"
                    self.emitSnapshot(self.snapshotLocked())
                    return
                }
                let retryDelayMillis = Double(30_000 * (1 << retryAttempt))
                self.scheduleCredentialCleanupLocked(
                    handoffID: handoffID,
                    deadlineMillis: Date().timeIntervalSince1970 * 1000 + retryDelayMillis,
                    retryAttempt: retryAttempt + 1
                )
            }
        }
        credentialCleanupWorkItem = workItem
        let delayMillis = max(0, deadlineMillis - Date().timeIntervalSince1970 * 1000)
        stateQueue.asyncAfter(deadline: .now() + .milliseconds(Int(delayMillis)), execute: workItem)
    }

    private func openBroadcastPicker() throws {
        guard let rootView = Self.rootView() else {
            throw LiveCasterNativeError.presentationUnavailable
        }

        let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 44, height: 44))
        picker.preferredExtension = liveCasterBroadcastExtensionId
        picker.showsMicrophoneButton = true
        picker.alpha = 0.01
        rootView.addSubview(picker)

        guard let button = picker.subviews.compactMap({ $0 as? UIButton }).first else {
            picker.removeFromSuperview()
            throw LiveCasterNativeError.broadcastButtonUnavailable
        }

        button.sendActions(for: .touchUpInside)
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            picker.removeFromSuperview()
        }
    }

    private static func rootView() -> UIView? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }?
            .rootViewController?
            .view
    }

    private static func audioRouteMap() -> [String: Any] {
        let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
        let headphonesConnected = outputs.contains { isHeadphonePort($0.portType) }
        let output = outputs.first { isHeadphonePort($0.portType) }
            ?? outputs.first { $0.portType == .builtInSpeaker }
            ?? outputs.first { $0.portType == .builtInReceiver }
            ?? outputs.first
        let route = routeKind(output?.portType)
        let outputName = output?.portName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? output?.portName ?? routeLabel(route)
            : routeLabel(route)
        let stale = output == nil

        return [
            "route": route,
            "outputName": outputName,
            "headphonesConnected": headphonesConnected,
            "checkedAt": ISO8601DateFormatter().string(from: Date()),
            "stale": stale,
            "summary": stale
                ? "iOS audio output route could not be resolved."
                : "\(outputName) route is active; headphones \(headphonesConnected ? "connected" : "not connected").",
            "recommendation": headphonesConnected
                ? "Keep headphones connected while self-monitoring is enabled."
                : "Connect wired, USB, AirPods, or Bluetooth headphones before enabling self-monitoring."
        ]
    }

    private static func isHeadphonePort(_ port: AVAudioSession.Port) -> Bool {
        switch port {
        case .headphones, .bluetoothA2DP, .bluetoothHFP, .bluetoothLE, .usbAudio:
            return true
        default:
            return false
        }
    }

    private static func routeKind(_ port: AVAudioSession.Port?) -> String {
        switch port {
        case .builtInSpeaker:
            return "speaker"
        case .builtInReceiver:
            return "receiver"
        case .headphones:
            return "wired-headphones"
        case .usbAudio:
            return "usb-headset"
        case .bluetoothA2DP:
            return "bluetooth-a2dp"
        case .bluetoothHFP, .bluetoothLE:
            return "bluetooth-sco"
        case .airPlay:
            return "airplay"
        case .HDMI:
            return "hdmi"
        case nil:
            return "unknown"
        default:
            return "other"
        }
    }

    private static func routeLabel(_ route: String) -> String {
        switch route {
        case "speaker":
            return "Speaker"
        case "receiver":
            return "Receiver"
        case "wired-headphones":
            return "Wired headphones"
        case "usb-headset":
            return "USB headset"
        case "bluetooth-a2dp":
            return "Bluetooth headphones"
        case "bluetooth-sco":
            return "Bluetooth headset"
        case "airplay":
            return "AirPlay"
        case "hdmi":
            return "HDMI"
        default:
            return "Unknown output"
        }
    }

    private func failLocked(_ message: String) {
        stopRuntimePollingLocked()
        status = .failed
        health.message = redactSensitiveTextLocked(message)
        startedAt = nil
        let snapshot = snapshotLocked()
        emitSnapshot(snapshot)
    }

    private func startRuntimePollingLocked() {
        guard runtimePoller == nil else {
            return
        }

        let poller = DispatchSource.makeTimerSource(queue: stateQueue)
        poller.schedule(deadline: .now(), repeating: .seconds(1), leeway: .milliseconds(150))
        poller.setEventHandler { [weak self] in
            self?.pollRuntimeStateLocked()
        }
        runtimePoller = poller
        poller.resume()
    }

    private func stopRuntimePollingLocked() {
        runtimePoller?.cancel()
        runtimePoller = nil
    }

    private func pollRuntimeStateLocked() {
        guard let runtimeState = sharedStore.loadRuntimeState() else {
            if runtimePollingRequiredLocked() {
                health.message = stopConfirmationMessageLocked(
                    waitingMessage: "Waiting for iOS broadcast extension telemetry"
                )
                emitSnapshot(snapshotLocked())
            }
            return
        }
        guard runtimeStateMatchesCurrentHandoffLocked(runtimeState) else {
            if runtimePollingRequiredLocked() {
                health.message = stopConfirmationMessageLocked(
                    waitingMessage: "Waiting for current iOS broadcast handoff telemetry"
                )
                emitSnapshot(snapshotLocked())
            }
            return
        }

        if !Self.isRuntimeStateFresh(runtimeState), runtimePollingRequiredLocked() {
            health.message = stopConfirmationMessageLocked(
                waitingMessage: "iOS broadcast extension telemetry is stale"
            )
            nativeRuntime = Self.nativeRuntimeMap(
                runtimeState,
                status: status,
                stale: true,
                message: health.message,
                streamKey: preparedConfiguration?.streamKey ?? "",
                publishURL: preparedConfiguration?.publishURL ?? ""
            )
            emitSnapshot(snapshotLocked())
            return
        }

        _ = refreshRuntimeStateFromStoreLocked(allowStale: true, emitSnapshot: true)
    }

    @discardableResult
    private func refreshRuntimeStateFromStoreLocked(allowStale: Bool, emitSnapshot shouldEmitSnapshot: Bool) -> Bool {
        guard let runtimeState = sharedStore.loadRuntimeState() else {
            return false
        }
        guard runtimeStateMatchesCurrentHandoffLocked(runtimeState) else {
            return false
        }
        guard allowStale || Self.isRuntimeStateFresh(runtimeState) else {
            return false
        }

        applyRuntimeStateLocked(runtimeState)
        if runtimePollingRequiredLocked() {
            startRuntimePollingLocked()
        }
        if shouldEmitSnapshot {
            emitSnapshot(snapshotLocked())
        }
        return true
    }

    private func runtimeStateMatchesCurrentHandoffLocked(_ runtimeState: [String: Any]) -> Bool {
        guard let expectedHandoffID = broadcastHandoffID else {
            return false
        }
        return runtimeState.stringValue("handoffId") == expectedHandoffID
    }

    private func runtimeAcknowledgesPendingStopLocked(_ runtimeState: [String: Any]) -> Bool {
        guard let pendingStopRequestID else {
            return false
        }
        if runtimeState.stringValue("stopRequestId") == pendingStopRequestID {
            return true
        }
        return runtimeState.doubleValue("extensionFinishedAt") > 0 &&
            !LiveCasterBroadcastControlStore.isExtensionLeaseActive()
    }

    private static func effectiveRuntimeStatus(
        _ reportedStatus: LiveCasterStatus?,
        runtimeState: [String: Any]
    ) -> LiveCasterStatus? {
        guard reportedStatus == .live else {
            return reportedStatus
        }

        let publisher = runtimeState.dictionaryValue("publisher")
        let publisherState = publisher.stringValue("state")
        switch publisherState {
        case "failed":
            return .failed
        case "reconnecting":
            return .reconnecting
        default:
            break
        }

        let hasCurrentPublishEvidence =
            publisherState == "published" &&
            publisher.intValue("publishGeneration") > 0 &&
            publisher.intValue("currentPublishVideoMessagesSent") > 0 &&
            publisher.intValue("currentPublishAudioMessagesSent") > 0
        return hasCurrentPublishEvidence ? .live : .preparing
    }

    private func applyRuntimeStateLocked(_ runtimeState: [String: Any]) {
        let updatedAt = runtimeState.doubleValue("updatedAt")
        let shouldRefreshCounters = updatedAt == 0 || updatedAt != lastRuntimeUpdatedAt
        if updatedAt > 0 {
            lastRuntimeUpdatedAt = updatedAt
        }

        let runtimeStatus = runtimeState.stringValue("status", fallback: status.rawValue)
        let reportedStatus = Self.effectiveRuntimeStatus(
            LiveCasterStatus(runtimeStatus: runtimeStatus),
            runtimeState: runtimeState
        )
        let stopAcknowledged = runtimeAcknowledgesPendingStopLocked(runtimeState)
        if pendingStopHandoffID != nil {
            if reportedStatus == .idle && stopAcknowledged {
                status = .idle
            } else if reportedStatus == .failed || stopAcknowledgementTimedOut {
                status = .failed
            } else {
                status = .stopping
            }
        } else if !(status == .reconnecting && reportedStatus == .preparing) {
            status = reportedStatus ?? status
        }
        if status == .live, startedAt == nil {
            startedAt = Date()
        }

        let stats = runtimeState.dictionaryValue("stats")
        let videoEncoder = runtimeState.dictionaryValue("videoEncoder")
        let publisher = runtimeState.dictionaryValue("publisher")
        let sceneComposition = runtimeState.dictionaryValue("sceneComposition")
        let elapsedSeconds = stats.intValue("elapsedSeconds", fallback: health.elapsedSeconds)
        let videoFrames = stats.intValue("videoFrames")
        let encodedBytes = videoEncoder.intValue("encodedBytes", fallback: publisher.intValue("videoBytesSent"))
        let droppedFrames = stats.intValue("droppedSamples") + publisher.intValue("droppedVideoFrames")
        let reconnectAttempts = publisher.intValue("reconnectAttempts", fallback: health.reconnectAttempts)
        let configuredFps = runtimeState.intValue("fps", fallback: preparedConfiguration?.fps ?? health.fps)
        let measuredFps = elapsedSeconds > 0 && videoFrames > 0 ? max(1, Int((Double(videoFrames) / Double(elapsedSeconds)).rounded())) : configuredFps
        let bitrateKbps = elapsedSeconds > 0 && encodedBytes > 0 ? max(1, Int((Double(encodedBytes) * 8 / 1000 / Double(elapsedSeconds)).rounded())) : 0
        let publisherState = redactSensitiveTextLocked(publisher.stringValue("state"))
        let compositionMessage = redactSensitiveTextLocked(sceneComposition.stringValue("message"))
        let errorMessage = redactSensitiveTextLocked(runtimeState.stringValue("error", fallback: publisher.stringValue("lastError")))
        let runtimeMessage = Self.runtimeHealthMessage(
            status: status,
            runtimeStatus: runtimeStatus,
            publisherState: publisherState,
            compositionMessage: compositionMessage,
            errorMessage: errorMessage,
            refreshedCounters: shouldRefreshCounters
        )

        health = LiveCasterHealth(
            bitrateKbps: bitrateKbps,
            droppedFrames: droppedFrames,
            fps: measuredFps,
            elapsedSeconds: elapsedSeconds,
            reconnectAttempts: reconnectAttempts,
            message: runtimeMessage
        )
        nativeRuntime = Self.nativeRuntimeMap(
            runtimeState,
            status: status,
            stale: false,
            message: runtimeMessage,
            streamKey: preparedConfiguration?.streamKey ?? "",
            publishURL: preparedConfiguration?.publishURL ?? ""
        )

        if pendingStopHandoffID != nil && status == .stopping {
            health.message = "Stopping iOS broadcast and waiting for extension confirmation"
        } else if pendingStopHandoffID != nil && stopAcknowledgementTimedOut {
            health.message = "iOS broadcast stop was not confirmed. Stop it from the iOS system broadcast control before starting again"
        }

        if status == .idle, pendingStopHandoffID != nil, stopAcknowledged {
            completeStopAcknowledgementLocked()
        } else if status == .failed, pendingStopHandoffID == nil {
            health.message = errorMessage.isEmpty ? health.message : errorMessage
            stopRuntimePollingLocked()
        } else if status == .idle {
            startedAt = nil
            stopRuntimePollingLocked()
        }
    }

    private static func runtimeHealthMessage(
        status: LiveCasterStatus,
        runtimeStatus: String,
        publisherState: String,
        compositionMessage: String,
        errorMessage: String,
        refreshedCounters: Bool
    ) -> String {
        if status == .failed {
            return errorMessage.isEmpty ? "iOS broadcast extension failed" : errorMessage
        }
        if status == .idle {
            return "iOS broadcast extension stopped"
        }

        let publisherSummary = publisherState.isEmpty ? runtimeStatus : publisherState
        let telemetryPrefix = refreshedCounters ? "iOS extension" : "iOS extension telemetry unchanged"
        if !compositionMessage.isEmpty {
            return "\(telemetryPrefix): \(publisherSummary); \(compositionMessage)"
        }
        return "\(telemetryPrefix): \(publisherSummary)"
    }

    private static func deviceResourceMap() -> [String: Any] {
        let sample = {
            let processInfo = ProcessInfo.processInfo
            let thermalState = processInfo.thermalState
            let normalizedThermalState: String
            switch thermalState {
            case .nominal:
                normalizedThermalState = "nominal"
            case .fair:
                normalizedThermalState = "fair"
            case .serious:
                normalizedThermalState = "serious"
            case .critical:
                normalizedThermalState = "critical"
            @unknown default:
                normalizedThermalState = "unknown"
            }
            let availableMemoryBytes = UInt64(os_proc_available_memory())
            let memoryPressureState: String
            if availableMemoryBytes == 0 {
                memoryPressureState = "unknown"
            } else if availableMemoryBytes <= liveCasterMemoryCriticalThresholdBytes {
                memoryPressureState = "critical"
            } else if availableMemoryBytes <= liveCasterMemoryWarningThresholdBytes {
                memoryPressureState = "warning"
            } else {
                memoryPressureState = "normal"
            }

            let device = UIDevice.current
            if !device.isBatteryMonitoringEnabled {
                device.isBatteryMonitoringEnabled = true
            }
            let batteryState = device.batteryState
            let batteryLevel = device.batteryLevel
            let batteryLevelPercent = batteryState == .unknown || !batteryLevel.isFinite || batteryLevel < 0
                ? -1
                : Swift.min(100, Swift.max(0, Int((batteryLevel * 100).rounded())))
            let charging = batteryState == .charging || batteryState == .full
            let powerSource: String
            switch batteryState {
            case .unplugged:
                powerSource = "battery"
            case .charging, .full, .unknown:
                powerSource = "unknown"
            @unknown default:
                powerSource = "unknown"
            }

            return [
                "thermalState": normalizedThermalState,
                "thermalStatusCode": thermalState.rawValue,
                "memoryPressureState": memoryPressureState,
                "availableMemoryBytes": availableMemoryBytes,
                "memoryThresholdBytes": liveCasterMemoryWarningThresholdBytes,
                "batteryLevelPercent": batteryLevelPercent,
                "charging": charging,
                "lowPowerMode": processInfo.isLowPowerModeEnabled,
                "powerSource": powerSource,
                "sampledAt": Date().timeIntervalSince1970 * 1000
            ]
        }

        // UIDevice battery properties are UIKit state and must be read on the main queue.
        if Thread.isMainThread {
            return sample()
        }
        return DispatchQueue.main.sync(execute: sample)
    }

    private static func validExtensionDeviceResourceMap(
        _ runtimeState: [String: Any],
        stale: Bool,
        nowMillis: Double = Date().timeIntervalSince1970 * 1_000
    ) -> [String: Any]? {
        guard !stale else {
            return nil
        }
        let device = runtimeState.dictionaryValue("device")
        guard
            let thermalState = device["thermalState"] as? String,
            ["unknown", "nominal", "fair", "serious", "critical"].contains(thermalState),
            device["thermalStatusCode"] is NSNumber,
            let memoryPressureState = device["memoryPressureState"] as? String,
            ["unknown", "normal", "warning", "critical"].contains(memoryPressureState),
            let availableMemoryBytes = (device["availableMemoryBytes"] as? NSNumber)?.doubleValue,
            availableMemoryBytes.isFinite,
            availableMemoryBytes >= 0,
            let memoryThresholdBytes = (device["memoryThresholdBytes"] as? NSNumber)?.uint64Value,
            memoryThresholdBytes == liveCasterMemoryWarningThresholdBytes,
            device["batteryLevelPercent"] is NSNumber,
            (device["charging"] is Bool || device["charging"] is NSNumber),
            (device["lowPowerMode"] is Bool || device["lowPowerMode"] is NSNumber),
            let powerSource = device["powerSource"] as? String,
            ["unknown", "battery", "wired", "wireless"].contains(powerSource),
            let sampledAt = (device["sampledAt"] as? NSNumber)?.doubleValue,
            sampledAt > 0,
            sampledAt <= nowMillis + 5_000,
            nowMillis - sampledAt <= broadcastRuntimeStateStaleMillis
        else {
            return nil
        }
        return device
    }

    private static func nativeRuntimeMap(
        _ runtimeState: [String: Any],
        status: LiveCasterStatus,
        stale: Bool,
        message: String,
        streamKey: String,
        publishURL: String
    ) -> [String: Any] {
        let stats = runtimeState.dictionaryValue("stats")
        let videoEncoder = runtimeState.dictionaryValue("videoEncoder")
        let bitrateAdaptation = videoEncoder.dictionaryValue("bitrateAdaptation")
        let audioEncoder = runtimeState.dictionaryValue("audioEncoder")
        let audioEncoderRecovery = audioEncoder.dictionaryValue("recovery")
        let micEffects = audioEncoder.dictionaryValue("micEffects")
        let monitor = micEffects.dictionaryValue("monitor")
        let broadcastMixer = runtimeState.dictionaryValue("broadcastMixer")
        let broadcastMic = broadcastMixer.dictionaryValue("mic")
        let broadcastAppAudio = broadcastMixer.dictionaryValue("appAudio")
        let broadcastChatReadout = broadcastMixer.dictionaryValue("chatReadout")
        let publisher = runtimeState.dictionaryValue("publisher")
        let continuity = runtimeState.dictionaryValue("continuity")
        let avSync = publisher.dictionaryValue("avSync")
        let sceneComposition = runtimeState.dictionaryValue("sceneComposition")
        let device = validExtensionDeviceResourceMap(runtimeState, stale: stale) ?? deviceResourceMap()
        let runtimeStatus = redactSensitiveText(runtimeState.stringValue("status", fallback: status.rawValue), streamKey: streamKey, publishURL: publishURL)
        let publisherState = redactSensitiveText(publisher.stringValue("state"), streamKey: streamKey, publishURL: publishURL)
        let encoderProbe = nativeEncoderProbeMap(
            runtimeState,
            videoEncoder: videoEncoder,
            audioEncoder: audioEncoder,
            stale: stale
        )
        let skippedCount = sceneComposition.intValue("skippedCount")
        let appliedCount = sceneComposition.intValue("appliedCount")
        let stillImageAssetMissingCount = sceneComposition.intValue("stillImageAssetMissingCount")
        let parseFailed = sceneComposition.boolValue("parseFailed")
        let compositionStatus: String
        if parseFailed {
            compositionStatus = "failed"
        } else if skippedCount > 0 || stillImageAssetMissingCount > 0 {
            compositionStatus = "pending"
        } else if appliedCount > 0 {
            compositionStatus = "applied"
        } else if !sceneComposition.isEmpty {
            compositionStatus = "screen-only"
        } else {
            compositionStatus = "unknown"
        }

        return [
            "platform": "ios",
            "runtimeStatus": runtimeStatus,
            "updatedAt": runtimeState.doubleValue("updatedAt"),
            "stale": stale,
            "elapsedSeconds": stats.intValue("elapsedSeconds"),
            "videoFrames": stats.intValue("videoFrames"),
            "encodedBytes": videoEncoder.intValue("encodedBytes", fallback: publisher.intValue("videoBytesSent")),
            "droppedFrames": stats.intValue("droppedSamples") + publisher.intValue("droppedVideoFrames"),
            "device": device,
            "encoderProbe": encoderProbe,
            "publisher": [
                "state": publisherState,
                "videoEncoderBackend": videoEncoder.stringValue("backend", fallback: "none"),
                "audioEncoderBackend": audioEncoder.stringValue("backend", fallback: "none"),
                "reconnectAttempts": publisher.intValue("reconnectAttempts"),
                "cumulativeReconnectCount": publisher.intValue("cumulativeReconnectCount"),
                "sentVideoFrames": publisher.intValue("videoMessagesSent"),
                "sentAudioFrames": publisher.intValue("audioMessagesSent"),
                "currentPublishVideoFrames": publisher.intValue("currentPublishVideoMessagesSent"),
                "currentPublishAudioFrames": publisher.intValue("currentPublishAudioMessagesSent"),
                "publishGeneration": publisher.intValue("publishGeneration"),
                "droppedVideoFrames": publisher.intValue("droppedVideoFrames"),
                "droppedAudioFrames": publisher.intValue("droppedAudioFrames"),
                "bytesWritten": publisher.intValue("bytesWritten", fallback: publisher.intValue("videoBytesSent")),
                "videoFrameIntervalSampleCount": stats.intValue("videoFrameIntervalSampleCount"),
                "videoFrameIntervalAverageMs": stats.doubleValue("videoFrameIntervalAverageMs"),
                "videoFrameIntervalMaxMs": stats.doubleValue("videoFrameIntervalMaxMs"),
                "videoFrameIntervalJitterMs": stats.doubleValue("videoFrameIntervalJitterMs"),
                "cacheSize": publisher.intValue("cacheSize"),
                "itemsInCache": publisher.intValue("itemsInCache"),
                "congested": publisher.boolValue("congested"),
                "bitrateAdaptation": [
                    "status": bitrateAdaptation.stringValue("status", fallback: "unknown"),
                    "initialTargetKbps": bitrateAdaptation.intValue("initialTargetKbps"),
                    "requestedTargetKbps": bitrateAdaptation.intValue("requestedTargetKbps"),
                    "appliedTargetKbps": bitrateAdaptation.intValue("appliedTargetKbps"),
                    "minimumAppliedKbps": bitrateAdaptation.intValue("minimumAppliedKbps"),
                    "updateCount": bitrateAdaptation.intValue("updateCount"),
                    "failureCount": bitrateAdaptation.intValue("failureCount"),
                    "lastUpdatedAt": bitrateAdaptation.doubleValue("lastUpdatedAt"),
                    "controlOwner": bitrateAdaptation.stringValue("controlOwner", fallback: "none"),
                    "controllerState": bitrateAdaptation.stringValue("controllerState", fallback: "idle"),
                    "baselineTargetKbps": bitrateAdaptation.intValue("baselineTargetKbps"),
                    "effectiveTargetKbps": bitrateAdaptation.intValue("effectiveTargetKbps"),
                    "floorTargetKbps": bitrateAdaptation.intValue("floorTargetKbps"),
                    "pendingTargetKbps": bitrateAdaptation.intValue("pendingTargetKbps"),
                    "automaticReductionCount": bitrateAdaptation.intValue("automaticReductionCount"),
                    "automaticRestorationCount": bitrateAdaptation.intValue("automaticRestorationCount"),
                    "pressureSampleCount": bitrateAdaptation.intValue("pressureSampleCount"),
                    "healthySampleCount": bitrateAdaptation.intValue("healthySampleCount"),
                    "cooldownRemainingMs": bitrateAdaptation.intValue("cooldownRemainingMs"),
                    "recoveryEligibleInMs": bitrateAdaptation.intValue("recoveryEligibleInMs"),
                    "publishGeneration": bitrateAdaptation.intValue("publishGeneration"),
                    "cumulativeReconnectCount": bitrateAdaptation.intValue("cumulativeReconnectCount"),
                    "lastDecisionAt": bitrateAdaptation.doubleValue("lastDecisionAt"),
                    "lastDecisionReason": redactSensitiveText(
                        bitrateAdaptation.stringValue("lastDecisionReason"),
                        streamKey: streamKey,
                        publishURL: publishURL
                    )
                ],
                "lastError": redactSensitiveText(
                    publisher.stringValue("lastError", fallback: runtimeState.stringValue("error")),
                    streamKey: streamKey,
                    publishURL: publishURL
                )
            ],
            "continuity": [
                "status": continuity.stringValue("status", fallback: "unknown"),
                "videoStalled": continuity.boolValue("videoStalled"),
                "audioStalled": continuity.boolValue("audioStalled"),
                "videoLastAdvancedAt": continuity.doubleValue("videoLastAdvancedAt"),
                "audioLastAdvancedAt": continuity.doubleValue("audioLastAdvancedAt"),
                "videoStallDurationMs": continuity.intValue("videoStallDurationMs"),
                "audioStallDurationMs": continuity.intValue("audioStallDurationMs"),
                "videoStallCount": continuity.intValue("videoStallCount"),
                "audioStallCount": continuity.intValue("audioStallCount"),
                "maxVideoStallDurationMs": continuity.intValue("maxVideoStallDurationMs"),
                "maxAudioStallDurationMs": continuity.intValue("maxAudioStallDurationMs"),
                "stallThresholdMs": continuity.intValue("stallThresholdMs", fallback: 5_000)
            ],
            "avSync": [
                "status": avSync.stringValue("status", fallback: "unknown"),
                "latestVideoTimestampMs": avSync.intValue("latestVideoTimestampMs"),
                "latestAudioTimestampMs": avSync.intValue("latestAudioTimestampMs"),
                "skewMs": avSync.intValue("skewMs"),
                "maxAbsSkewMs": avSync.intValue("maxAbsSkewMs"),
                "sampleCount": avSync.intValue("sampleCount"),
                "outOfSyncSampleCount": avSync.intValue("outOfSyncSampleCount"),
                "outOfSyncIncidentCount": avSync.intValue("outOfSyncIncidentCount"),
                "criticalIncidentCount": avSync.intValue("criticalIncidentCount"),
                "consecutiveOutOfSyncSamples": avSync.intValue("consecutiveOutOfSyncSamples"),
                "maxConsecutiveOutOfSyncSamples": avSync.intValue("maxConsecutiveOutOfSyncSamples"),
                "warningThresholdMs": avSync.intValue("warningThresholdMs", fallback: 150),
                "criticalThresholdMs": avSync.intValue("criticalThresholdMs", fallback: 500),
                "critical": avSync.boolValue("critical")
            ],
            "composition": [
                "status": compositionStatus,
                "runtimeCompositorBackend": sceneComposition.stringValue("runtimeCompositorBackend", fallback: "none"),
                "runtimeCompositedFrameCount": sceneComposition.intValue("runtimeCompositedFrameCount"),
                "runtimeDroppedFrameCount": sceneComposition.intValue("runtimeDroppedFrameCount"),
                "runtimeCompositionFailureCount": sceneComposition.intValue("runtimeCompositionFailureCount"),
                "liveRenderGraphReloadCount": sceneComposition.intValue("liveRenderGraphReloadCount"),
                "liveRenderGraphRejectedUpdateCount": sceneComposition.intValue("liveRenderGraphRejectedUpdateCount"),
                "appliedCount": appliedCount,
                "appliedKinds": sceneComposition.stringArrayValue("appliedKinds").map {
                    redactSensitiveText($0, streamKey: streamKey, publishURL: publishURL)
                },
                "skippedCount": skippedCount,
                "skippedKinds": sceneComposition.stringArrayValue("skippedKinds").map {
                    redactSensitiveText($0, streamKey: streamKey, publishURL: publishURL)
                },
                "stillImageAssetCount": sceneComposition.intValue("stillImageAssetCount"),
                "stillImageAssetLoadedCount": sceneComposition.intValue("stillImageAssetLoadedCount"),
                "stillImageAssetMissingCount": stillImageAssetMissingCount,
                "stillImageAssetMissingKinds": sceneComposition.stringArrayValue("stillImageAssetMissingKinds").map {
                    redactSensitiveText($0, streamKey: streamKey, publishURL: publishURL)
                },
                "stillImageAssetDecodedCount": sceneComposition.intValue("stillImageAssetDecodedCount"),
                "stillImageAssetDecodedPixelCount": sceneComposition.intValue("stillImageAssetDecodedPixelCount"),
                "stillImageAssetCompositedCount": sceneComposition.intValue("stillImageAssetCompositedCount"),
                "stillImageAssetCompositedPixelCount": sceneComposition.intValue("stillImageAssetCompositedPixelCount"),
                "stillImageAssetAppGroupCount": sceneComposition.intValue("stillImageAssetAppGroupCount"),
                "stillImageAssetAppGroupLoadedCount": sceneComposition.intValue("stillImageAssetAppGroupLoadedCount"),
                "stillImageAssetAppGroupDecodedCount": sceneComposition.intValue("stillImageAssetAppGroupDecodedCount"),
                "stillImageAssetAppGroupDecodedPixelCount": sceneComposition.intValue("stillImageAssetAppGroupDecodedPixelCount"),
                "stillImageAssetAppGroupCompositedCount": sceneComposition.intValue("stillImageAssetAppGroupCompositedCount"),
                "stillImageAssetAppGroupCompositedPixelCount": sceneComposition.intValue("stillImageAssetAppGroupCompositedPixelCount"),
                "live2dSourceCount": sceneComposition.intValue("live2dSourceCount"),
                "live2dPosePayloadCount": sceneComposition.intValue("live2dPosePayloadCount"),
                "live2dActivePoseCount": sceneComposition.intValue("live2dActivePoseCount"),
                "live2dMissingPoseCount": sceneComposition.intValue("live2dMissingPoseCount"),
                "live2dRuntimeStatuses": sceneComposition.stringArrayValue("live2dRuntimeStatuses").map {
                    redactSensitiveText($0, streamKey: streamKey, publishURL: publishURL)
                },
                "vrmSourceCount": sceneComposition.intValue("vrmSourceCount"),
                "vrmPosePayloadCount": sceneComposition.intValue("vrmPosePayloadCount"),
                "vrmActivePoseCount": sceneComposition.intValue("vrmActivePoseCount"),
                "vrmMissingPoseCount": sceneComposition.intValue("vrmMissingPoseCount"),
                "vrmModelUriCount": sceneComposition.intValue("vrmModelUriCount"),
                "vrmModelVersions": sceneComposition.stringArrayValue("vrmModelVersions").map {
                    redactSensitiveText($0, streamKey: streamKey, publishURL: publishURL)
                },
                "vrmHumanoidBoneCount": sceneComposition.intValue("vrmHumanoidBoneCount"),
                "vrmExpressionCount": sceneComposition.intValue("vrmExpressionCount"),
                "vrmMeshPrimitiveCount": sceneComposition.intValue("vrmMeshPrimitiveCount"),
                "vrmSkinnedMeshPrimitiveCount": sceneComposition.intValue("vrmSkinnedMeshPrimitiveCount"),
                "vrmSkinJointCount": sceneComposition.intValue("vrmSkinJointCount"),
                "vrmPositionAccessorCount": sceneComposition.intValue("vrmPositionAccessorCount"),
                "vrmVertexCount": sceneComposition.intValue("vrmVertexCount"),
                "vrmIndexCount": sceneComposition.intValue("vrmIndexCount"),
                "vrmBoundsAccessorCount": sceneComposition.intValue("vrmBoundsAccessorCount"),
                "vrmSkinningAttributePrimitiveCount": sceneComposition.intValue("vrmSkinningAttributePrimitiveCount"),
                "vrmTrianglePrimitiveCount": sceneComposition.intValue("vrmTrianglePrimitiveCount"),
                "vrmUnsupportedPrimitiveModeCount": sceneComposition.intValue("vrmUnsupportedPrimitiveModeCount"),
                "vrmNormalAccessorCount": sceneComposition.intValue("vrmNormalAccessorCount"),
                "vrmTexcoordAccessorCount": sceneComposition.intValue("vrmTexcoordAccessorCount"),
                "vrmMorphTargetCount": sceneComposition.intValue("vrmMorphTargetCount"),
                "vrmMaterialCount": sceneComposition.intValue("vrmMaterialCount"),
                "vrmTextureCount": sceneComposition.intValue("vrmTextureCount"),
                "vrmImageCount": sceneComposition.intValue("vrmImageCount"),
                "vrmUnsupportedImageMimeCount": sceneComposition.intValue("vrmUnsupportedImageMimeCount"),
                "vrmTransparentMaterialCount": sceneComposition.intValue("vrmTransparentMaterialCount"),
                "vrmPoseBoneCount": sceneComposition.intValue("vrmPoseBoneCount"),
                "vrmPoseBoneAppliedCount": sceneComposition.intValue("vrmPoseBoneAppliedCount"),
                "vrmPoseBoneUnsupportedCount": sceneComposition.intValue("vrmPoseBoneUnsupportedCount"),
                "vrmPoseExpressionCount": sceneComposition.intValue("vrmPoseExpressionCount"),
                "vrmPoseExpressionAppliedCount": sceneComposition.intValue("vrmPoseExpressionAppliedCount"),
                "vrmPoseExpressionUnsupportedCount": sceneComposition.intValue("vrmPoseExpressionUnsupportedCount"),
                "vrmRuntimeStatuses": sceneComposition.stringArrayValue("vrmRuntimeStatuses").map {
                    redactSensitiveText($0, streamKey: streamKey, publishURL: publishURL)
                },
                "vrmRendererStatus": sceneComposition.stringValue("vrmRendererStatus", fallback: sceneComposition.intValue("vrmSourceCount") > 0 ? "unavailable" : "not-required"),
                "vrmRendererBackend": sceneComposition.stringValue("vrmRendererBackend", fallback: "none"),
                "vrmModelLoadedCount": sceneComposition.intValue("vrmModelLoadedCount"),
                "vrmRenderedSourceCount": sceneComposition.intValue("vrmRenderedSourceCount"),
                "vrmRenderMissingCount": sceneComposition.intValue("vrmRenderMissingCount"),
                "vrmRenderFailureCount": sceneComposition.intValue("vrmRenderFailureCount"),
                "message": redactSensitiveText(sceneComposition.stringValue("message"), streamKey: streamKey, publishURL: publishURL)
            ],
            "audioProcessing": [
                "micEffectsEnabled": micEffects.boolValue("enabled"),
                "micEffectsPresetId": micEffects.stringValue("presetId", fallback: "clean"),
                "micEffectsProcessedFrames": micEffects.intValue("processedFrames"),
                "micEffectsProcessedSamples": micEffects.intValue("processedSamples"),
                "micEffectsGatedSamples": micEffects.intValue("gatedSamples"),
                "micEffectsLimitedSamples": micEffects.intValue("limitedSamples"),
                "micRmsLevel": audioEncoder.doubleValue("micRmsLevel"),
                "micPeakLevel": audioEncoder.doubleValue("micPeakLevel"),
                "micSampleCount": audioEncoder.intValue("micSampleCount"),
                "micClippedSampleCount": audioEncoder.intValue("micClippedSampleCount"),
                "micLevelUpdatedAt": audioEncoder.doubleValue("micLevelUpdatedAt"),
                "appAudioRmsLevel": audioEncoder.doubleValue("appAudioRmsLevel"),
                "appAudioPeakLevel": audioEncoder.doubleValue("appAudioPeakLevel"),
                "appAudioSampleCount": audioEncoder.intValue("appAudioSampleCount"),
                "appAudioClippedSampleCount": audioEncoder.intValue("appAudioClippedSampleCount"),
                "appAudioLevelUpdatedAt": audioEncoder.doubleValue("appAudioLevelUpdatedAt"),
                "mixedAudioRmsLevel": audioEncoder.doubleValue("mixedAudioRmsLevel"),
                "mixedAudioPeakLevel": audioEncoder.doubleValue("mixedAudioPeakLevel"),
                "mixedAudioSampleCount": audioEncoder.intValue("mixedAudioSampleCount"),
                "mixedAudioClippedSampleCount": audioEncoder.intValue("mixedAudioClippedSampleCount"),
                "mixedAudioLevelUpdatedAt": audioEncoder.doubleValue("mixedAudioLevelUpdatedAt"),
                "encoderRecoveryAttemptCount": audioEncoderRecovery.intValue("attemptCount"),
                "encoderRecoverySuccessCount": audioEncoderRecovery.intValue("successCount"),
                "encoderRecoveryFailureCount": audioEncoderRecovery.intValue("failureCount"),
                "encoderRecoverySuppressedInputBufferCount": audioEncoderRecovery.intValue("suppressedInputBufferCount"),
                "encoderRecoveryDroppedInputFrameCount": audioEncoderRecovery.intValue("droppedInputFrameCount"),
                "encoderRecoveryDiscardedQueuedFrameCount": audioEncoderRecovery.intValue("discardedQueuedFrameCount"),
                "encoderRecoveryConsecutiveFailureCount": audioEncoderRecovery.intValue("consecutiveFailureCount"),
                "encoderRecoveryPending": audioEncoderRecovery.boolValue("pending"),
                "encoderRecoveryRetryAfterMs": audioEncoderRecovery.intValue("retryAfterMs"),
                "encoderRecoveryLastStatus": audioEncoderRecovery.intValue("lastStatus"),
                "encoderRecoveryLastReason": audioEncoderRecovery.stringValue("lastReason"),
                "encoderRecoveryLastRecoveryAt": audioEncoderRecovery.doubleValue("lastRecoveryAt"),
                "monitorEnabled": monitor.boolValue("enabled"),
                "monitorRunning": monitor.boolValue("running"),
                "monitorVolume": monitor.doubleValue("volume"),
                "monitorHeadphonesOnly": monitor.boolValue("headphonesOnly", fallback: true),
                "monitorRoute": monitor.stringValue("route", fallback: "unknown"),
                "monitorOutputName": monitor.stringValue("outputName", fallback: "Unknown"),
                "monitorHeadphonesConnected": monitor.boolValue("headphonesConnected"),
                "monitorWrittenFrames": monitor.intValue("writtenFrames"),
                "monitorDroppedFrames": monitor.intValue("droppedFrames"),
                "monitorWrittenBuffers": monitor.intValue("writtenBuffers"),
                "monitorDroppedBuffers": monitor.intValue("droppedBuffers"),
                "monitorEstimatedLatencyMs": monitor.intValue("estimatedLatencyMs"),
                "monitorLatencySource": monitor.stringValue("latencySource"),
                "monitorLastError": redactSensitiveText(
                    monitor.stringValue("lastError"),
                    streamKey: streamKey,
                    publishURL: publishURL
                ),
                "monitorLifecycleEventCount": monitor.intValue("lifecycleEventCount"),
                "monitorRouteChangeCount": monitor.intValue("routeChangeCount"),
                "monitorInterruptionCount": monitor.intValue("interruptionCount"),
                "monitorRecoveryCount": monitor.intValue("recoveryCount"),
                "monitorRecoveryFailureCount": monitor.intValue("recoveryFailureCount"),
                "monitorLastRecoveryReason": monitor.stringValue("lastRecoveryReason"),
                "monitorLastRecoveryAt": monitor.doubleValue("lastRecoveryAt"),
                "monitorSuspended": monitor.boolValue("suspended"),
                "broadcastMicVolume": broadcastMic.doubleValue("volume", fallback: 1),
                "broadcastMicMuted": broadcastMic.boolValue("muted"),
                "broadcastAppAudioVolume": broadcastAppAudio.doubleValue("volume", fallback: 0.85),
                "broadcastAppAudioMuted": broadcastAppAudio.boolValue("muted"),
                "broadcastChatReadoutVolume": broadcastChatReadout.doubleValue("volume", fallback: 0.85),
                "broadcastChatReadoutMuted": broadcastChatReadout.boolValue("muted")
            ],
            "message": redactSensitiveText(message, streamKey: streamKey, publishURL: publishURL)
        ]
    }

    private static func nativeEncoderProbeMap(
        _ runtimeState: [String: Any],
        videoEncoder: [String: Any],
        audioEncoder: [String: Any],
        stale: Bool
    ) -> [String: Any] {
        let videoBackend = videoEncoder.stringValue("backend", fallback: "none")
        let audioBackend = audioEncoder.stringValue("backend", fallback: "none")
        let videoWidth = videoEncoder.intValue("outputWidth")
        let videoHeight = videoEncoder.intValue("outputHeight")
        let videoFpsValue = videoEncoder.doubleValue("outputNominalFrameRate")
        let sessionExpectedFrameRate = videoEncoder.doubleValue("sessionExpectedFrameRate")
        let videoFps = videoFpsValue.isFinite &&
            videoFpsValue > 0 &&
            videoFpsValue <= 240 &&
            videoFpsValue == videoFpsValue.rounded()
            ? Int(videoFpsValue)
            : 0
        let audioSampleRateValue = audioEncoder.doubleValue("sampleRate")
        let audioSampleRate = audioSampleRateValue.isFinite &&
            audioSampleRateValue > 0 &&
            audioSampleRateValue <= 384_000 &&
            audioSampleRateValue == audioSampleRateValue.rounded()
            ? Int(audioSampleRateValue)
            : 0
        let audioChannelCount = audioEncoder.intValue("channelCount")
        let videoLastStatus = videoEncoder.intValue("lastStatus")
        let audioLastStatus = audioEncoder.intValue("lastStatus")
        let videoFailureCount = videoEncoder.intValue("failureCount")
        let audioFailureCount = audioEncoder.intValue("failureCount")
        let videoEncodedOutputCount = videoEncoder.intValue("encodedFrames")
        let audioEncodedOutputCount = audioEncoder.intValue("encodedFrames")
        let videoEncoderInstanceVerified = videoEncoder.boolValue("activeEncoderInstanceVerified")
        let audioEncoderInstanceVerified = audioEncoder.boolValue("activeEncoderInstanceVerified")
        let videoConfigured = !stale &&
            videoBackend == "videotoolbox-h264" &&
            videoEncoderInstanceVerified &&
            videoEncoder.boolValue("outputFormatIsH264") &&
            sessionExpectedFrameRate == videoFpsValue &&
            videoEncoder.intValue("consecutiveOutputCadenceMatchCount") >= 2 &&
            videoEncodedOutputCount > 0 &&
            videoFailureCount == 0 &&
            videoLastStatus == 0 &&
            videoWidth > 0 &&
            videoHeight > 0 &&
            videoFps > 0
        let audioConfigured = !stale &&
            audioBackend == "audiotoolbox-aac" &&
            audioEncoderInstanceVerified &&
            audioEncodedOutputCount > 0 &&
            audioFailureCount == 0 &&
            audioLastStatus == 0 &&
            audioSampleRate > 0 &&
            audioChannelCount > 0
        let failed = !stale && (
            runtimeState.stringValue("status") == LiveCasterStatus.failed.rawValue ||
            videoFailureCount > 0 ||
            audioFailureCount > 0 ||
            videoLastStatus != 0 ||
            audioLastStatus != 0
        )
        let probeStatus = failed ? "fail" : (videoConfigured && audioConfigured ? "pass" : "unknown")
        let activeEncoderInstancesVerified = videoEncoderInstanceVerified &&
            audioEncoderInstanceVerified &&
            videoConfigured &&
            audioConfigured
        let probeMessage: String
        if probeStatus == "pass" {
            probeMessage = "Active VideoToolbox H.264 output format, accepted frame-rate property, and AudioToolbox AAC output were verified on their producing encoder instances."
        } else if probeStatus == "fail" {
            probeMessage = "The active iOS encoder reported a configuration or encode failure."
        } else if stale {
            probeMessage = "The iOS encoder output-format evidence is stale."
        } else {
            probeMessage = "Waiting for encoded video and audio frames to prove the active output format."
        }

        return [
            "status": probeStatus,
            "checkedAt": runtimeState.doubleValue("updatedAt"),
            "activeEncoderInstancesVerified": activeEncoderInstancesVerified,
            "videoEncodedOutputCount": videoEncodedOutputCount,
            "audioEncodedOutputCount": audioEncodedOutputCount,
            "videoBackend": videoBackend,
            "audioBackend": audioBackend,
            "videoCodecName": "VideoToolbox H.264",
            "audioCodecName": "AudioToolbox AAC",
            "videoMime": "video/avc",
            "audioMime": "audio/mp4a-latm",
            "videoConfigured": videoConfigured,
            "audioConfigured": audioConfigured,
            "videoColorFormat": "CVPixelBuffer",
            "videoBitrateMode": "average",
            "videoWidth": videoWidth,
            "videoHeight": videoHeight,
            "videoFps": videoFps,
            "audioSampleRate": audioSampleRate,
            "audioChannelCount": audioChannelCount,
            "message": probeMessage
        ]
    }

    private func redactSensitiveTextLocked(_ value: String) -> String {
        Self.redactSensitiveText(
            value,
            streamKey: preparedConfiguration?.streamKey ?? "",
            publishURL: preparedConfiguration?.publishURL ?? ""
        )
    }

    private static func redactSensitiveText(_ value: String, streamKey: String, publishURL: String) -> String {
        guard !value.isEmpty else {
            return value
        }

        let secrets = [publishURL, streamKey].filter { $0.count >= 4 }
        var redacted = secrets.reduce(value) { nextValue, secret in
            nextValue.replacingOccurrences(of: secret, with: "[redacted]")
        }
        redacted = redacted.replacingOccurrences(
            of: #"\b(Authorization\s*:\s*)(Bearer|OAuth)\s+[^\s,;]+"#,
            with: "$1$2 [redacted]",
            options: [.regularExpression, .caseInsensitive]
        )
        redacted = redacted.replacingOccurrences(
            of: #"\b(Bearer|OAuth)\s+[A-Za-z0-9._~+/=-]{12,}"#,
            with: "$1 [redacted]",
            options: [.regularExpression, .caseInsensitive]
        )
        return redacted
    }

    private static func isRuntimeStateFresh(_ runtimeState: [String: Any]) -> Bool {
        let updatedAt = runtimeState.doubleValue("updatedAt")
        guard updatedAt > 0 else {
            return false
        }
        return Date().timeIntervalSince1970 * 1000 - updatedAt <= broadcastRuntimeStateStaleMillis
    }

    private func snapshotLocked() -> [String: Any] {
        let hostElapsed = startedAt.map { Int(Date().timeIntervalSince($0)).coerceAtLeast(0) } ?? 0
        let elapsed = Swift.max(hostElapsed, health.elapsedSeconds)
        var nextHealth = health
        nextHealth.elapsedSeconds = elapsed
        let healthMap = nextHealth.asDictionary()
        var stateMap: [String: Any] = [
            "status": status.rawValue,
            "startedAt": startedAt.map { $0.timeIntervalSince1970 * 1000 } ?? 0,
            "health": healthMap
        ]
        if status == .failed {
            stateMap["error"] = health.message
        }
        var snapshot: [String: Any] = [
            "platform": "ios",
            "state": stateMap,
            "health": healthMap
        ]
        if let nativeRuntime {
            snapshot["nativeRuntime"] = nativeRuntime
        }
        return snapshot
    }

    private func emitSnapshot(_ snapshot: [String: Any]) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.hasListeners else {
                return
            }
            self.sendEvent(withName: "LiveCasterSnapshot", body: snapshot)
        }
    }
}

private extension Int {
    func coerceAtLeast(_ minimum: Int) -> Int {
        Swift.max(self, minimum)
    }
}

private extension Dictionary where Key == String, Value == Any {
    func dictionaryValue(_ key: String) -> [String: Any] {
        if let dictionary = self[key] as? [String: Any] {
            return dictionary
        }
        if let dictionary = self[key] as? NSDictionary {
            var output: [String: Any] = [:]
            dictionary.forEach { key, value in
                guard let stringKey = key as? String else {
                    return
                }
                output[stringKey] = value
            }
            return output
        }
        return [:]
    }

    func stringValue(_ key: String, fallback: String = "") -> String {
        if let stringValue = self[key] as? String {
            return stringValue
        }
        if let numberValue = self[key] as? NSNumber {
            return numberValue.stringValue
        }
        return fallback
    }

    func intValue(_ key: String, fallback: Int = 0) -> Int {
        if let numberValue = self[key] as? NSNumber {
            return numberValue.intValue
        }
        if let stringValue = self[key] as? String, let intValue = Int(stringValue) {
            return intValue
        }
        return fallback
    }

    func boolValue(_ key: String, fallback: Bool = false) -> Bool {
        if let boolValue = self[key] as? Bool {
            return boolValue
        }
        if let numberValue = self[key] as? NSNumber {
            return numberValue.boolValue
        }
        if let stringValue = self[key] as? String {
            return stringValue == "true" || stringValue == "1"
        }
        return fallback
    }

    func stringArrayValue(_ key: String) -> [String] {
        if let stringArray = self[key] as? [String] {
            return stringArray
        }
        if let array = self[key] as? [Any] {
            return array.compactMap { item in
                if let stringValue = item as? String {
                    return stringValue
                }
                if let numberValue = item as? NSNumber {
                    return numberValue.stringValue
                }
                return nil
            }
        }
        return []
    }

    func doubleValue(_ key: String, fallback: Double = 0) -> Double {
        if let numberValue = self[key] as? NSNumber {
            return numberValue.doubleValue
        }
        if let stringValue = self[key] as? String, let doubleValue = Double(stringValue) {
            return doubleValue
        }
        return fallback
    }
}

private extension String {
    func trimmingLeadingSlashes() -> String {
        var output = self
        while output.hasPrefix("/") {
            output.removeFirst()
        }
        return output
    }

    func trimmingTrailingSlashes() -> String {
        var output = self
        while output.hasSuffix("/") {
            output.removeLast()
        }
        return output
    }
}
