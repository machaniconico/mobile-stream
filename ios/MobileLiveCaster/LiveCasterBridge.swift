import Foundation
import React
import ReplayKit
import UIKit

private let liveCasterAppGroup = "group.org.reactjs.native.example.MobileLiveCaster"
private let liveCasterBroadcastExtensionId = "org.reactjs.native.example.MobileLiveCaster.BroadcastUpload"
private let broadcastConfigurationKey = "MobileLiveCaster.broadcastConfiguration.v1"
private let broadcastControlKey = "MobileLiveCaster.broadcastControl.v1"

enum LiveCasterStatus: String {
    case idle
    case preparing
    case live
    case reconnecting
    case stopping
    case failed
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
        let normalizedStreamKey = rawStreamKey.trimmingCharacters(in: .whitespacesAndNewlines).trimmingLeadingSlashes()
        guard !normalizedStreamKey.isEmpty else {
            throw LiveCasterNativeError.streamKeyMissing
        }

        let endpoint = Self.buildPublishURL(serverURL: rawServerURL, streamKey: normalizedStreamKey)
        guard
            let url = URL(string: endpoint),
            let scheme = url.scheme?.lowercased(),
            scheme == "rtmp" || scheme == "rtmps",
            url.host?.isEmpty == false
        else {
            throw LiveCasterNativeError.invalidDestination
        }

        destinationName = Self.stringValue(destination["presetId"], fallback: "custom-rtmps")
        serverURL = rawServerURL.trimmingCharacters(in: .whitespacesAndNewlines)
        streamKey = normalizedStreamKey
        publishURL = endpoint
        width = Self.intValue(quality["width"], fallback: 1280, range: 360...3840)
        height = Self.intValue(quality["height"], fallback: 720, range: 360...2160)
        fps = Self.intValue(quality["fps"], fallback: 30, range: 15...60)
        videoBitrateKbps = Self.intValue(quality["videoBitrateKbps"], fallback: 4500, range: 800...20000)
        audioBitrateKbps = Self.intValue(quality["audioBitrateKbps"], fallback: 128, range: 64...320)
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
            "renderGraph": renderGraphJSON
        ]
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
            resolve(self.snapshotLocked())
        }
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
                try self.sharedStore.saveConfiguration(configuration, renderGraphJSON: nextRenderGraphJSON)
                self.preparedConfiguration = configuration
                self.renderGraphJSON = nextRenderGraphJSON
                self.startedAt = nil
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
                self.failLocked(error.localizedDescription)
                reject((error as? LiveCasterNativeError)?.code ?? "prepare_failed", error.localizedDescription, error)
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
                        let snapshot = self.snapshotLocked()
                        self.emitSnapshot(snapshot)
                        resolve(snapshot)
                    }
                } catch {
                    self.stateQueue.async {
                        self.failLocked(error.localizedDescription)
                        reject((error as? LiveCasterNativeError)?.code ?? "start_failed", error.localizedDescription, error)
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
            self.status = .idle
            self.startedAt = nil
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
                        let snapshot = self.snapshotLocked()
                        self.emitSnapshot(snapshot)
                        resolve(snapshot)
                    }
                } catch {
                    self.stateQueue.async {
                        self.failLocked(error.localizedDescription)
                        reject((error as? LiveCasterNativeError)?.code ?? "reconnect_failed", error.localizedDescription, error)
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

    private func failLocked(_ message: String) {
        status = .failed
        health.message = message
        startedAt = nil
        let snapshot = snapshotLocked()
        emitSnapshot(snapshot)
    }

    private func snapshotLocked() -> [String: Any] {
        let elapsed = startedAt.map { Int(Date().timeIntervalSince($0)).coerceAtLeast(0) } ?? 0
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
        return [
            "platform": "ios",
            "state": stateMap,
            "health": healthMap
        ]
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
