import Foundation
import AVFoundation
import React
import ReplayKit
import UIKit

private let liveCasterAppGroup = "group.com.mobilelivecaster.app"
private let liveCasterBroadcastExtensionId = "com.mobilelivecaster.app.BroadcastUpload"
private let broadcastConfigurationKey = "MobileLiveCaster.broadcastConfiguration.v1"
private let broadcastControlKey = "MobileLiveCaster.broadcastControl.v1"
private let broadcastRuntimeStateKey = "MobileLiveCaster.broadcastRuntimeState.v1"
private let broadcastRuntimeStateStaleMillis: Double = 10_000

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

    func payload(renderGraphJSON: String) -> [String: Any] {
        let now = Date().timeIntervalSince1970 * 1000
        return [
            "schemaVersion": 1,
            "createdAt": now,
            "expiresAt": now + 10 * 60 * 1000,
            "preferredExtension": liveCasterBroadcastExtensionId,
            "destinationName": destinationName,
            "serverUrl": serverURL,
            "streamKey": streamKey,
            "publishUrl": publishURL,
            "width": width,
            "height": height,
            "fps": fps,
            "videoBitrateKbps": videoBitrateKbps,
            "audioBitrateKbps": audioBitrateKbps,
            "micEffects": micEffects.payload,
            "broadcastMixer": broadcastMixer.payload,
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

final class LiveCasterSharedStore {
    private var defaults: UserDefaults? {
        UserDefaults(suiteName: liveCasterAppGroup)
    }

    func saveConfiguration(_ configuration: LiveCasterPreparedConfiguration, renderGraphJSON: String) throws {
        guard let defaults else {
            throw LiveCasterNativeError.sharedStoreUnavailable
        }
        defaults.set(configuration.payload(renderGraphJSON: renderGraphJSON), forKey: broadcastConfigurationKey)
        defaults.synchronize()
    }

    func loadRuntimeState() -> [String: Any]? {
        defaults?.dictionary(forKey: broadcastRuntimeStateKey)
    }

    func clearRuntimeState() {
        guard let defaults else {
            return
        }
        defaults.removeObject(forKey: broadcastRuntimeStateKey)
        defaults.synchronize()
    }

    func saveControlAction(_ action: String) {
        guard let defaults else {
            return
        }
        defaults.set(
            [
                "action": action,
                "requestedAt": Date().timeIntervalSince1970 * 1000
            ],
            forKey: broadcastControlKey
        )
        defaults.synchronize()
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
    private var lastRuntimeUpdatedAt: Double = 0
    private var nativeRuntime: [String: Any]?

    deinit {
        runtimePoller?.cancel()
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
            do {
                let configuration = try LiveCasterPreparedConfiguration(profileJSON: profileJson)
                self.stopRuntimePollingLocked()
                self.sharedStore.clearRuntimeState()
                try self.sharedStore.saveConfiguration(configuration, renderGraphJSON: nextRenderGraphJSON)
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
            guard self.preparedConfiguration != nil else {
                self.failLocked(LiveCasterNativeError.profileMissing.localizedDescription)
                reject(LiveCasterNativeError.profileMissing.code, LiveCasterNativeError.profileMissing.localizedDescription, nil)
                return
            }

            self.status = .preparing
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
                        self.status = .live
                        self.startedAt = Date()
                        self.health.message = "Broadcast picker opened; confirm Start Broadcast in iOS"
                        self.startRuntimePollingLocked()
                        let snapshot = self.snapshotLocked()
                        self.emitSnapshot(snapshot)
                        resolve(snapshot)
                    }
                } catch {
                    self.stateQueue.async {
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
        rejecter reject: RCTPromiseRejectBlock
    ) {
        stateQueue.async { [weak self] in
            guard let self else {
                resolve(nil)
                return
            }
            self.sharedStore.saveControlAction("stop")
            self.stopRuntimePollingLocked()
            self.status = .idle
            self.startedAt = nil
            self.lastRuntimeUpdatedAt = 0
            self.nativeRuntime = nil
            self.health = LiveCasterHealth(message: "Stop requested; end iOS system broadcast if it is still active")
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
                        self.status = .live
                        self.startedAt = self.startedAt ?? Date()
                        self.health.message = "Broadcast picker reopened"
                        self.startRuntimePollingLocked()
                        let snapshot = self.snapshotLocked()
                        self.emitSnapshot(snapshot)
                        resolve(snapshot)
                    }
                } catch {
                    self.stateQueue.async {
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
            if let preparedConfiguration = self.preparedConfiguration {
                try? self.sharedStore.saveConfiguration(preparedConfiguration, renderGraphJSON: nextRenderGraphJSON)
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
                try self.sharedStore.saveConfiguration(nextConfiguration, renderGraphJSON: self.renderGraphJSON)
                self.health.fps = nextConfiguration.fps
                self.health.message =
                    self.status == .live || self.status == .reconnecting
                    ? "Quality target updated for the next iOS broadcast restart"
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
            if status == .live || status == .preparing || status == .reconnecting {
                health.message = "Waiting for iOS broadcast extension telemetry"
                emitSnapshot(snapshotLocked())
            }
            return
        }

        if !Self.isRuntimeStateFresh(runtimeState), status == .live || status == .preparing || status == .reconnecting {
            health.message = "iOS broadcast extension telemetry is stale"
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
        guard allowStale || Self.isRuntimeStateFresh(runtimeState) else {
            return false
        }

        applyRuntimeStateLocked(runtimeState)
        if status == .live || status == .preparing || status == .reconnecting {
            startRuntimePollingLocked()
        }
        if shouldEmitSnapshot {
            emitSnapshot(snapshotLocked())
        }
        return true
    }

    private func applyRuntimeStateLocked(_ runtimeState: [String: Any]) {
        let updatedAt = runtimeState.doubleValue("updatedAt")
        let shouldRefreshCounters = updatedAt == 0 || updatedAt != lastRuntimeUpdatedAt
        if updatedAt > 0 {
            lastRuntimeUpdatedAt = updatedAt
        }

        let runtimeStatus = runtimeState.stringValue("status", fallback: status.rawValue)
        status = LiveCasterStatus(runtimeStatus: runtimeStatus) ?? status
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

        if status == .failed {
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
        let audioEncoder = runtimeState.dictionaryValue("audioEncoder")
        let micEffects = audioEncoder.dictionaryValue("micEffects")
        let monitor = micEffects.dictionaryValue("monitor")
        let broadcastMixer = runtimeState.dictionaryValue("broadcastMixer")
        let broadcastMic = broadcastMixer.dictionaryValue("mic")
        let broadcastAppAudio = broadcastMixer.dictionaryValue("appAudio")
        let broadcastChatReadout = broadcastMixer.dictionaryValue("chatReadout")
        let publisher = runtimeState.dictionaryValue("publisher")
        let sceneComposition = runtimeState.dictionaryValue("sceneComposition")
        let runtimeStatus = redactSensitiveText(runtimeState.stringValue("status", fallback: status.rawValue), streamKey: streamKey, publishURL: publishURL)
        let publisherState = redactSensitiveText(publisher.stringValue("state"), streamKey: streamKey, publishURL: publishURL)
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
            "publisher": [
                "state": publisherState,
                "reconnectAttempts": publisher.intValue("reconnectAttempts"),
                "sentVideoFrames": publisher.intValue("videoMessagesSent"),
                "sentAudioFrames": publisher.intValue("audioMessagesSent"),
                "droppedVideoFrames": publisher.intValue("droppedVideoFrames"),
                "droppedAudioFrames": publisher.intValue("droppedAudioFrames"),
                "bytesWritten": publisher.intValue("bytesWritten", fallback: publisher.intValue("videoBytesSent")),
                "cacheSize": 0,
                "itemsInCache": 0,
                "congested": false,
                "lastError": redactSensitiveText(
                    publisher.stringValue("lastError", fallback: runtimeState.stringValue("error")),
                    streamKey: streamKey,
                    publishURL: publishURL
                )
            ],
            "composition": [
                "status": compositionStatus,
                "appliedCount": appliedCount,
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
                "vrmMorphTargetCount": sceneComposition.intValue("vrmMorphTargetCount"),
                "vrmMaterialCount": sceneComposition.intValue("vrmMaterialCount"),
                "vrmTextureCount": sceneComposition.intValue("vrmTextureCount"),
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
