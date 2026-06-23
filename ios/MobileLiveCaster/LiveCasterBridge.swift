import Foundation
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
            self.sharedStore.clearRuntimeState()
            self.lastRuntimeUpdatedAt = 0
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
            self.stopRuntimePollingLocked()
            self.status = .idle
            self.startedAt = nil
            self.lastRuntimeUpdatedAt = 0
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
        stopRuntimePollingLocked()
        status = .failed
        health.message = message
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
        let publisherState = publisher.stringValue("state")
        let compositionMessage = sceneComposition.stringValue("message")
        let errorMessage = runtimeState.stringValue("error", fallback: publisher.stringValue("lastError"))

        health = LiveCasterHealth(
            bitrateKbps: bitrateKbps,
            droppedFrames: droppedFrames,
            fps: measuredFps,
            elapsedSeconds: elapsedSeconds,
            reconnectAttempts: reconnectAttempts,
            message: Self.runtimeHealthMessage(
                status: status,
                runtimeStatus: runtimeStatus,
                publisherState: publisherState,
                compositionMessage: compositionMessage,
                errorMessage: errorMessage,
                refreshedCounters: shouldRefreshCounters
            )
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

private extension Dictionary where Key == String, Value == Any {
    func dictionaryValue(_ key: String) -> [String: Any] {
        self[key] as? [String: Any] ?? [:]
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
