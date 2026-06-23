import AudioToolbox
import CoreGraphics
import CoreImage
import CoreMedia
import CoreVideo
import Foundation
import Network
import os
import ReplayKit
import UIKit
import VideoToolbox

private let broadcastAppGroup = "group.com.mobilelivecaster.app"
private let broadcastConfigurationKey = "MobileLiveCaster.broadcastConfiguration.v1"
private let broadcastRuntimeStateKey = "MobileLiveCaster.broadcastRuntimeState.v1"

final class SampleHandler: RPBroadcastSampleHandler {
    private let pipeline = BroadcastUploadPipeline()

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        switch pipeline.start(setupInfo: setupInfo ?? [:]) {
        case .success:
            break
        case .failure(let error):
            finishBroadcastWithError(BroadcastUploadError.asNSError(error))
        }
    }

    override func broadcastPaused() {
        pipeline.pause()
    }

    override func broadcastResumed() {
        pipeline.resume()
    }

    override func broadcastFinished() {
        pipeline.stop()
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        switch sampleBufferType {
        case .video:
            pipeline.consumeVideo(sampleBuffer)
        case .audioApp:
            pipeline.consumeAppAudio(sampleBuffer)
        case .audioMic:
            pipeline.consumeMicrophone(sampleBuffer)
        @unknown default:
            pipeline.dropUnknownSample()
        }
    }
}

enum BroadcastUploadState: Equatable {
    case idle
    case starting
    case running
    case paused
    case stopped
    case failed(String)

    var acceptsSamples: Bool {
        self == .running
    }

    var sharedStatus: String {
        switch self {
        case .idle:
            return "idle"
        case .starting:
            return "preparing"
        case .running:
            return "live"
        case .paused:
            return "paused"
        case .stopped:
            return "idle"
        case .failed:
            return "failed"
        }
    }
}

enum BroadcastUploadError: LocalizedError, Equatable {
    case missingDestination
    case invalidDestination

    var errorDescription: String? {
        switch self {
        case .missingDestination:
            return "Broadcast destination is missing. Open MobileLiveCaster and configure an RTMP or RTMPS destination."
        case .invalidDestination:
            return "Broadcast destination must be a valid RTMP or RTMPS URL."
        }
    }

    var code: Int {
        switch self {
        case .missingDestination:
            return 1001
        case .invalidDestination:
            return 1002
        }
    }

    static func asNSError(_ error: Error) -> NSError {
        let uploadError = error as? BroadcastUploadError
        return NSError(
            domain: "MobileLiveCaster.BroadcastUpload",
            code: uploadError?.code ?? -1,
            userInfo: [NSLocalizedDescriptionKey: error.localizedDescription]
        )
    }
}

enum BroadcastVideoEncoderError: LocalizedError, Equatable {
    case pixelBufferMissing
    case sessionCreateFailed(OSStatus)
    case propertySetFailed(String, OSStatus)
    case encodeFailed(OSStatus)

    var errorDescription: String? {
        switch self {
        case .pixelBufferMissing:
            return "ReplayKit video sample did not contain a pixel buffer"
        case .sessionCreateFailed(let status):
            return "VideoToolbox encoder could not be created: \(status)"
        case .propertySetFailed(let property, let status):
            return "VideoToolbox property \(property) could not be set: \(status)"
        case .encodeFailed(let status):
            return "VideoToolbox frame encode failed: \(status)"
        }
    }

    var statusCode: OSStatus? {
        switch self {
        case .pixelBufferMissing:
            return nil
        case .sessionCreateFailed(let status), .propertySetFailed(_, let status), .encodeFailed(let status):
            return status
        }
    }
}

enum BroadcastAudioEncoderError: LocalizedError, Equatable {
    case dataBufferMissing
    case formatDescriptionMissing
    case unsupportedInputFormat(AudioFormatID)
    case unsupportedSampleRate(Double)
    case converterCreateFailed(OSStatus)
    case propertySetFailed(String, OSStatus)
    case encodeFailed(OSStatus)

    var errorDescription: String? {
        switch self {
        case .dataBufferMissing:
            return "ReplayKit audio sample did not contain a data buffer"
        case .formatDescriptionMissing:
            return "ReplayKit audio sample did not contain an audio format description"
        case .unsupportedInputFormat(let formatID):
            return "ReplayKit audio input format is not supported: \(formatID)"
        case .unsupportedSampleRate(let sampleRate):
            return "AAC audio sample rate is not supported: \(sampleRate)"
        case .converterCreateFailed(let status):
            return "AudioToolbox AAC converter could not be created: \(status)"
        case .propertySetFailed(let property, let status):
            return "AudioToolbox property \(property) could not be set: \(status)"
        case .encodeFailed(let status):
            return "AudioToolbox AAC encode failed: \(status)"
        }
    }

    var statusCode: OSStatus? {
        switch self {
        case .dataBufferMissing, .formatDescriptionMissing, .unsupportedInputFormat, .unsupportedSampleRate:
            return nil
        case .converterCreateFailed(let status), .propertySetFailed(_, let status), .encodeFailed(let status):
            return status
        }
    }
}

struct BroadcastUploadConfiguration: Equatable {
    let publishURL: URL
    let destinationName: String
    let width: Int
    let height: Int
    let fps: Int
    let videoBitrateKbps: Int
    let audioBitrateKbps: Int
    let renderGraphJSON: String?

    var transportScheme: String {
        publishURL.scheme?.lowercased() ?? ""
    }

    var usesSecureTransport: Bool {
        transportScheme == "rtmps"
    }

    init(setupInfo: [String: NSObject]) throws {
        let resolvedURL = try Self.resolvePublishURL(setupInfo: setupInfo)
        publishURL = resolvedURL
        destinationName = Self.stringValue(["destinationName", "presetName", "platform"], in: setupInfo) ?? "RTMP"
        width = Self.clampedInt(["width", "videoWidth"], in: setupInfo, defaultValue: 1280, range: 360...3840)
        height = Self.clampedInt(["height", "videoHeight"], in: setupInfo, defaultValue: 720, range: 360...2160)
        fps = Self.clampedInt(["fps", "frameRate"], in: setupInfo, defaultValue: 30, range: 15...60)
        videoBitrateKbps = Self.clampedInt(["videoBitrateKbps", "bitrateKbps"], in: setupInfo, defaultValue: 4500, range: 800...20000)
        audioBitrateKbps = Self.clampedInt(["audioBitrateKbps"], in: setupInfo, defaultValue: 128, range: 64...320)
        renderGraphJSON = Self.stringValue(["renderGraph", "renderGraphJSON"], in: setupInfo)
    }

    private static func resolvePublishURL(setupInfo: [String: NSObject]) throws -> URL {
        if let publishURL = stringValue(["publishUrl", "publishURL", "rtmpUrl", "rtmpURL"], in: setupInfo) {
            return try parsePublishURL(publishURL)
        }

        guard let serverURL = stringValue(["serverUrl", "serverURL"], in: setupInfo) else {
            throw BroadcastUploadError.missingDestination
        }

        let streamKey = stringValue(["streamKey"], in: setupInfo) ?? ""
        return try parsePublishURL(buildPublishURL(serverURL: serverURL, streamKey: streamKey))
    }

    private static func parsePublishURL(_ rawValue: String) throws -> URL {
        let normalized = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard
            !normalized.isEmpty,
            let url = URL(string: normalized),
            let scheme = url.scheme?.lowercased(),
            scheme == "rtmp" || scheme == "rtmps",
            url.host?.isEmpty == false
        else {
            throw BroadcastUploadError.invalidDestination
        }

        return url
    }

    private static func buildPublishURL(serverURL: String, streamKey: String) -> String {
        let normalizedServerURL = serverURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingTrailingSlashes()
        let normalizedStreamKey = streamKey.trimmingCharacters(in: .whitespacesAndNewlines).trimmingLeadingSlashes()

        guard !normalizedStreamKey.isEmpty else {
            return normalizedServerURL
        }

        if let splitURL = splitPublishURL(normalizedStreamKey) {
            return buildPublishURL(serverURL: splitURL.serverURL, streamKey: splitURL.streamKey)
        }

        if let placeholderRange = normalizedServerURL.range(of: "{stream_key}", options: [.caseInsensitive]) {
            return normalizedServerURL.replacingCharacters(in: placeholderRange, with: normalizedStreamKey)
        }

        if normalizedServerURL.hasSuffix("/\(normalizedStreamKey)") {
            return normalizedServerURL
        }

        return "\(normalizedServerURL)/\(normalizedStreamKey)"
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

    private static func stringValue(_ keys: [String], in setupInfo: [String: NSObject]) -> String? {
        for key in keys {
            guard let value = setupInfo[key] else {
                continue
            }

            if let stringValue = value as? String {
                let normalized = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
                return normalized.isEmpty ? nil : normalized
            }

            if let stringValue = value as? NSString {
                let normalized = String(stringValue).trimmingCharacters(in: .whitespacesAndNewlines)
                return normalized.isEmpty ? nil : normalized
            }

            if let numberValue = value as? NSNumber {
                return numberValue.stringValue
            }
        }

        return nil
    }

    private static func clampedInt(
        _ keys: [String],
        in setupInfo: [String: NSObject],
        defaultValue: Int,
        range: ClosedRange<Int>
    ) -> Int {
        guard let rawValue = stringValue(keys, in: setupInfo), let parsedValue = Int(rawValue) else {
            return defaultValue
        }

        return min(max(parsedValue, range.lowerBound), range.upperBound)
    }
}

struct BroadcastUploadStats: Equatable {
    private(set) var startedAt: Date?
    private(set) var stoppedAt: Date?
    private(set) var videoFrames: Int = 0
    private(set) var appAudioBuffers: Int = 0
    private(set) var microphoneBuffers: Int = 0
    private(set) var droppedSamples: Int = 0
    private(set) var unknownSamples: Int = 0
    private(set) var lastVideoPresentationTimeSeconds: Double?
    private(set) var lastAudioPresentationTimeSeconds: Double?
    private(set) var videoEncodeFailures: Int = 0
    private(set) var lastVideoEncodeStatus: Int32 = 0
    private(set) var audioEncodeFailures: Int = 0
    private(set) var lastAudioEncodeStatus: Int32 = 0

    var elapsedSeconds: Int {
        guard let startedAt else {
            return 0
        }

        let endDate = stoppedAt ?? Date()
        return max(0, Int(endDate.timeIntervalSince(startedAt)))
    }

    mutating func start() {
        startedAt = Date()
        stoppedAt = nil
        videoFrames = 0
        appAudioBuffers = 0
        microphoneBuffers = 0
        droppedSamples = 0
        unknownSamples = 0
        lastVideoPresentationTimeSeconds = nil
        lastAudioPresentationTimeSeconds = nil
        videoEncodeFailures = 0
        lastVideoEncodeStatus = 0
        audioEncodeFailures = 0
        lastAudioEncodeStatus = 0
    }

    mutating func stop() {
        stoppedAt = Date()
    }

    mutating func recordVideo(_ sampleBuffer: CMSampleBuffer) {
        videoFrames += 1
        lastVideoPresentationTimeSeconds = sampleTimeSeconds(sampleBuffer)
    }

    mutating func recordAppAudio(_ sampleBuffer: CMSampleBuffer) {
        appAudioBuffers += 1
        lastAudioPresentationTimeSeconds = sampleTimeSeconds(sampleBuffer)
    }

    mutating func recordMicrophone(_ sampleBuffer: CMSampleBuffer) {
        microphoneBuffers += 1
        lastAudioPresentationTimeSeconds = sampleTimeSeconds(sampleBuffer)
    }

    mutating func dropSample() {
        droppedSamples += 1
    }

    mutating func dropUnknownSample() {
        unknownSamples += 1
    }

    mutating func recordVideoEncodeFailure(_ error: BroadcastVideoEncoderError) {
        videoEncodeFailures += 1
        lastVideoEncodeStatus = error.statusCode ?? -1
    }

    mutating func recordAudioEncodeFailure(_ error: BroadcastAudioEncoderError) {
        audioEncodeFailures += 1
        lastAudioEncodeStatus = error.statusCode ?? -1
    }

    func asDictionary() -> [String: Any] {
        [
            "elapsedSeconds": elapsedSeconds,
            "videoFrames": videoFrames,
            "appAudioBuffers": appAudioBuffers,
            "microphoneBuffers": microphoneBuffers,
            "droppedSamples": droppedSamples,
            "unknownSamples": unknownSamples,
            "lastVideoPresentationTimeSeconds": lastVideoPresentationTimeSeconds ?? 0,
            "lastAudioPresentationTimeSeconds": lastAudioPresentationTimeSeconds ?? 0,
            "videoEncodeFailures": videoEncodeFailures,
            "lastVideoEncodeStatus": lastVideoEncodeStatus,
            "audioEncodeFailures": audioEncodeFailures,
            "lastAudioEncodeStatus": lastAudioEncodeStatus
        ]
    }

    private func sampleTimeSeconds(_ sampleBuffer: CMSampleBuffer) -> Double? {
        let time = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        guard time.isValid && time.timescale != 0 else {
            return nil
        }

        return CMTimeGetSeconds(time)
    }
}

struct BroadcastUploadSnapshot: Equatable {
    let state: BroadcastUploadState
    let destinationName: String?
    let transportScheme: String?
    let usesSecureTransport: Bool
    let videoSize: CGSize?
    let fps: Int?
    let videoBitrateKbps: Int?
    let audioBitrateKbps: Int?
    let stats: BroadcastUploadStats
    let videoEncoderStats: BroadcastVideoEncoderStats?
    let audioEncoderStats: BroadcastAudioEncoderStats?
    let publisherStats: BroadcastRTMPPublisherStats?
}

final class BroadcastSharedStore {
    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: broadcastAppGroup)
    }

    static func loadConfigurationSetupInfo() -> [String: NSObject]? {
        guard let payload = defaults?.dictionary(forKey: broadcastConfigurationKey) else {
            return nil
        }

        let now = Date().timeIntervalSince1970 * 1000
        if let expiresAt = payload["expiresAt"] as? NSNumber, expiresAt.doubleValue < now {
            return nil
        }

        var setupInfo: [String: NSObject] = [:]
        for (key, value) in payload {
            if let object = value as? NSObject {
                setupInfo[key] = object
            }
        }
        return setupInfo
    }

    static func saveRuntimeState(
        state: BroadcastUploadState,
        configuration: BroadcastUploadConfiguration?,
        stats: BroadcastUploadStats,
        videoEncoderStats: BroadcastVideoEncoderStats?,
        audioEncoderStats: BroadcastAudioEncoderStats?,
        publisherStats: BroadcastRTMPPublisherStats?,
        sceneCompositionSummary: BroadcastSceneCompositionSummary?
    ) {
        guard let defaults else {
            return
        }

        var payload: [String: Any] = [
            "status": state.sharedStatus,
            "updatedAt": Date().timeIntervalSince1970 * 1000,
            "stats": stats.asDictionary()
        ]

        if let videoEncoderStats {
            payload["videoEncoder"] = videoEncoderStats.asDictionary()
        }

        if let audioEncoderStats {
            payload["audioEncoder"] = audioEncoderStats.asDictionary()
        }

        if let publisherStats {
            payload["publisher"] = publisherStats.asDictionary()
        }

        if let sceneCompositionSummary {
            payload["sceneComposition"] = sceneCompositionSummary.asDictionary()
        }

        if case .failed(let message) = state {
            payload["error"] = message
        }

        if let configuration {
            payload["destinationName"] = configuration.destinationName
            payload["transportScheme"] = configuration.transportScheme
            payload["usesSecureTransport"] = configuration.usesSecureTransport
            payload["width"] = configuration.width
            payload["height"] = configuration.height
            payload["fps"] = configuration.fps
            payload["videoBitrateKbps"] = configuration.videoBitrateKbps
            payload["audioBitrateKbps"] = configuration.audioBitrateKbps
        }

        defaults.set(payload, forKey: broadcastRuntimeStateKey)
        defaults.synchronize()
    }
}

struct BroadcastEncodedVideoFrame {
    let presentationTimeSeconds: Double
    let durationSeconds: Double
    let isKeyframe: Bool
    let byteCount: Int
    let parameterSets: [Data]
    let avccPayload: Data
    let annexBNALUnits: [Data]
}

enum BroadcastAudioSource: String, Equatable, Hashable {
    case app
    case microphone
    case mixed
}

struct BroadcastEncodedAudioFrame {
    let source: BroadcastAudioSource
    let presentationTimeSeconds: Double
    let durationSeconds: Double
    let sampleRate: Double
    let channelCount: Int
    let byteCount: Int
    let audioSpecificConfig: Data
    let aacPayload: Data
}

private struct BroadcastPCMAudioFrame {
    let source: BroadcastAudioSource
    let presentationTimeSeconds: Double
    let durationSeconds: Double
    let sampleRate: Double
    let channelCount: Int
    let samples: [Float]

    var frameCount: Int {
        guard channelCount > 0 else {
            return 0
        }
        return samples.count / channelCount
    }
}

struct BroadcastVideoEncoderStats: Equatable {
    private(set) var encodedFrames: Int = 0
    private(set) var keyframes: Int = 0
    private(set) var encodedBytes: Int = 0
    private(set) var lastPresentationTimeSeconds: Double = 0
    private(set) var lastStatus: Int32 = 0

    mutating func record(_ frame: BroadcastEncodedVideoFrame) {
        encodedFrames += 1
        if frame.isKeyframe {
            keyframes += 1
        }
        encodedBytes += frame.byteCount
        lastPresentationTimeSeconds = frame.presentationTimeSeconds
        lastStatus = 0
    }

    mutating func recordStatus(_ status: OSStatus) {
        lastStatus = status
    }

    func asDictionary() -> [String: Any] {
        [
            "encodedFrames": encodedFrames,
            "keyframes": keyframes,
            "encodedBytes": encodedBytes,
            "lastPresentationTimeSeconds": lastPresentationTimeSeconds,
            "lastStatus": lastStatus
        ]
    }
}

struct BroadcastAudioEncoderStats: Equatable {
    private(set) var encodedFrames: Int = 0
    private(set) var appFrames: Int = 0
    private(set) var microphoneFrames: Int = 0
    private(set) var mixedFrames: Int = 0
    private(set) var encodedBytes: Int = 0
    private(set) var sampleRate: Double = 0
    private(set) var channelCount: Int = 0
    private(set) var lastPresentationTimeSeconds: Double = 0
    private(set) var lastStatus: Int32 = 0

    mutating func record(_ frame: BroadcastEncodedAudioFrame) {
        encodedFrames += 1
        switch frame.source {
        case .app:
            appFrames += 1
        case .microphone:
            microphoneFrames += 1
        case .mixed:
            mixedFrames += 1
        }
        encodedBytes += frame.byteCount
        sampleRate = frame.sampleRate
        channelCount = frame.channelCount
        lastPresentationTimeSeconds = frame.presentationTimeSeconds
        lastStatus = 0
    }

    mutating func recordStatus(_ status: OSStatus) {
        lastStatus = status
    }

    func asDictionary() -> [String: Any] {
        [
            "encodedFrames": encodedFrames,
            "appFrames": appFrames,
            "microphoneFrames": microphoneFrames,
            "mixedFrames": mixedFrames,
            "encodedBytes": encodedBytes,
            "sampleRate": sampleRate,
            "channelCount": channelCount,
            "lastPresentationTimeSeconds": lastPresentationTimeSeconds,
            "lastStatus": lastStatus
        ]
    }
}

enum BroadcastRTMPPublisherState: String, Equatable {
    case idle
    case connecting
    case handshaking
    case publishing
    case published
    case reconnecting
    case stopped
    case failed
}

struct BroadcastRTMPPublisherStats: Equatable {
    private(set) var state: BroadcastRTMPPublisherState = .idle
    private(set) var videoMessagesSent: Int = 0
    private(set) var videoBytesSent: Int = 0
    private(set) var droppedVideoFrames: Int = 0
    private(set) var audioMessagesSent: Int = 0
    private(set) var audioBytesSent: Int = 0
    private(set) var droppedAudioFrames: Int = 0
    private(set) var bytesWritten: Int = 0
    private(set) var streamId: Int = 0
    private(set) var lastTimestampMs: Int = 0
    private(set) var reconnectAttempts: Int = 0
    private(set) var nextReconnectDelayMs: Int = 0
    private(set) var lastError: String = ""

    mutating func updateState(_ nextState: BroadcastRTMPPublisherState) {
        state = nextState
        if nextState != .failed {
            lastError = ""
        }
    }

    mutating func recordPublishedStream(_ nextStreamId: Int) {
        streamId = nextStreamId
        state = .published
    }

    mutating func recordVideoMessage(bytes: Int, timestampMs: Int) {
        videoMessagesSent += 1
        videoBytesSent += bytes
        lastTimestampMs = timestampMs
    }

    mutating func recordAudioMessage(bytes: Int, timestampMs: Int) {
        audioMessagesSent += 1
        audioBytesSent += bytes
        lastTimestampMs = timestampMs
    }

    mutating func recordDroppedVideoFrame() {
        droppedVideoFrames += 1
    }

    mutating func recordDroppedAudioFrame() {
        droppedAudioFrames += 1
    }

    mutating func recordReconnectAttempt(_ attempt: Int, delayMs: Int, reason: String) {
        state = .reconnecting
        reconnectAttempts = attempt
        nextReconnectDelayMs = delayMs
        lastError = reason
    }

    mutating func recordReconnectSuccess() {
        reconnectAttempts = 0
        nextReconnectDelayMs = 0
        lastError = ""
    }

    mutating func recordBytesWritten(_ count: Int) {
        bytesWritten += count
    }

    mutating func fail(_ message: String) {
        state = .failed
        lastError = message
    }

    func asDictionary() -> [String: Any] {
        [
            "state": state.rawValue,
            "videoMessagesSent": videoMessagesSent,
            "videoBytesSent": videoBytesSent,
            "droppedVideoFrames": droppedVideoFrames,
            "audioMessagesSent": audioMessagesSent,
            "audioBytesSent": audioBytesSent,
            "droppedAudioFrames": droppedAudioFrames,
            "bytesWritten": bytesWritten,
            "streamId": streamId,
            "lastTimestampMs": lastTimestampMs,
            "reconnectAttempts": reconnectAttempts,
            "nextReconnectDelayMs": nextReconnectDelayMs,
            "lastError": lastError
        ]
    }
}

enum BroadcastRTMPPublisherError: LocalizedError {
    case invalidPublishURL
    case connectionFailed(String)
    case connectionTimeout
    case readTimeout(Int)
    case writeTimeout
    case writeFailed(String)
    case handshakeFailed
    case commandRejected(String)
    case createStreamFailed
    case publisherStopped

    var errorDescription: String? {
        switch self {
        case .invalidPublishURL:
            return "RTMP publish URL must include host, application path, and stream name"
        case .connectionFailed(let message):
            return "RTMP connection failed: \(message)"
        case .connectionTimeout:
            return "RTMP connection timed out"
        case .readTimeout(let count):
            return "RTMP read timed out while waiting for \(count) bytes"
        case .writeTimeout:
            return "RTMP write timed out"
        case .writeFailed(let message):
            return "RTMP write failed: \(message)"
        case .handshakeFailed:
            return "RTMP handshake failed"
        case .commandRejected(let message):
            return "RTMP command was rejected: \(message)"
        case .createStreamFailed:
            return "RTMP createStream did not return a valid stream id"
        case .publisherStopped:
            return "RTMP publisher is stopped"
        }
    }
}

private struct RTMPPublishTarget {
    let host: String
    let port: UInt16
    let scheme: String
    let appName: String
    let streamName: String
    let tcURL: String

    init(url: URL) throws {
        guard
            let host = url.host,
            let scheme = url.scheme?.lowercased(),
            scheme == "rtmp" || scheme == "rtmps"
        else {
            throw BroadcastRTMPPublisherError.invalidPublishURL
        }

        let segments = url.path.split(separator: "/").map(String.init)
        guard segments.count >= 2 else {
            throw BroadcastRTMPPublisherError.invalidPublishURL
        }

        self.host = host
        port = UInt16(url.port ?? (scheme == "rtmps" ? 443 : 1935))
        self.scheme = scheme
        appName = segments.dropLast().joined(separator: "/")
        if let query = url.query, !query.isEmpty {
            streamName = "\(segments.last ?? "")?\(query)"
        } else {
            streamName = segments.last ?? ""
        }

        let explicitPort = url.port.map { ":\($0)" } ?? ""
        tcURL = "\(scheme)://\(host)\(explicitPort)/\(appName)"
    }
}

private enum RTMPAMF0Value: Equatable {
    case number(Double)
    case bool(Bool)
    case string(String)
    case object([String: RTMPAMF0Value])
    case null
    case unsupported
}

private struct RTMPMessage {
    let typeId: UInt8
    let streamId: UInt32
    let timestamp: Int
    let payload: Data
}

private struct RTMPIncomingChunk {
    var timestamp: Int = 0
    var messageLength: Int = 0
    var typeId: UInt8 = 0
    var streamId: UInt32 = 0
    var payload = Data()
}

final class BroadcastRTMPPublisher {
    private enum ReconnectPolicy {
        static let maxAttempts = 5
        static let initialDelayMilliseconds = 1_500
        static let maxDelayMilliseconds = 15_000
    }

    private let target: RTMPPublishTarget
    private let publishURL: String
    private let queue = DispatchQueue(label: "MobileLiveCaster.broadcast.rtmp.publisher")
    private let callbackQueue = DispatchQueue(label: "MobileLiveCaster.broadcast.rtmp.network")
    private let statsLock = NSLock()
    private var currentStats = BroadcastRTMPPublisherStats()
    private var connection: NWConnection?
    private var reconnectWorkItem: DispatchWorkItem?
    private var stopped = false
    private var reconnectAttempts = 0
    private var outboundChunkSize = 128
    private var inboundChunkSize = 128
    private var incomingChunks: [Int: RTMPIncomingChunk] = [:]
    private var messageStreamId: UInt32 = 0
    private var sentAVCSequenceHeader = false
    private var sentAACSequenceHeader = false
    private var lastAACAudioSpecificConfig: Data?
    private var firstMediaPresentationTimeSeconds: Double?

    var stats: BroadcastRTMPPublisherStats {
        statsLock.performLocked {
            self.currentStats
        }
    }

    init(configuration: BroadcastUploadConfiguration) throws {
        target = try RTMPPublishTarget(url: configuration.publishURL)
        publishURL = configuration.publishURL.absoluteString
    }

    func start() {
        queue.async { [weak self] in
            self?.connectAndPublish(resetReconnectAttempts: true)
        }
    }

    func stop() {
        queue.async { [weak self] in
            guard let self else {
                return
            }
            stopped = true
            reconnectWorkItem?.cancel()
            reconnectWorkItem = nil
            statsLock.performLocked {
                self.currentStats.updateState(.stopped)
            }
            connection?.cancel()
            connection = nil
        }
    }

    func publishVideoFrame(_ frame: BroadcastEncodedVideoFrame) {
        queue.async { [weak self] in
            self?.publishVideoFrameLocked(frame)
        }
    }

    func publishAudioFrame(_ frame: BroadcastEncodedAudioFrame) {
        queue.async { [weak self] in
            self?.publishAudioFrameLocked(frame)
        }
    }

    private func connectAndPublish(resetReconnectAttempts: Bool) {
        do {
            reconnectWorkItem = nil
            if resetReconnectAttempts {
                reconnectAttempts = 0
            }
            resetConnectionState()
            try connect()
            try performHandshake()
            statsLock.performLocked {
                self.currentStats.updateState(.publishing)
            }
            try sendSetChunkSize(4096)
            outboundChunkSize = 4096
            try sendConnect()
            try waitForCommandResult(transactionId: 1)
            try sendCommand(name: "releaseStream", transactionId: 2, commandObject: .null, arguments: [.string(target.streamName)], messageStreamId: 0)
            try sendCommand(name: "FCPublish", transactionId: 3, commandObject: .null, arguments: [.string(target.streamName)], messageStreamId: 0)
            try sendCommand(name: "createStream", transactionId: 4, commandObject: .null, arguments: [], messageStreamId: 0)
            let streamId = try waitForCreateStreamResult(transactionId: 4)
            messageStreamId = UInt32(streamId)
            try sendCommand(name: "publish", transactionId: 5, commandObject: .null, arguments: [.string(target.streamName), .string("live")], messageStreamId: messageStreamId)
            statsLock.performLocked {
                self.currentStats.recordReconnectSuccess()
                self.currentStats.recordPublishedStream(streamId)
            }
        } catch {
            handleConnectionFailure(error)
        }
    }

    private func handleConnectionFailure(_ error: Error) {
        connection?.cancel()
        connection = nil
        resetConnectionState()

        guard !stopped else {
            return
        }
        guard reconnectWorkItem == nil else {
            return
        }
        guard reconnectAttempts < ReconnectPolicy.maxAttempts else {
            let message = sanitizeError("Connection lost after \(ReconnectPolicy.maxAttempts) reconnect attempts: \(error.localizedDescription)")
            statsLock.performLocked {
                self.currentStats.fail(message)
            }
            return
        }

        reconnectAttempts += 1
        let delayMs = min(
            ReconnectPolicy.maxDelayMilliseconds,
            ReconnectPolicy.initialDelayMilliseconds * (1 << max(0, reconnectAttempts - 1))
        )
        let reconnectReason = sanitizeError(error.localizedDescription)
        statsLock.performLocked {
            self.currentStats.recordReconnectAttempt(reconnectAttempts, delayMs: delayMs, reason: reconnectReason)
        }

        let workItem = DispatchWorkItem { [weak self] in
            self?.connectAndPublish(resetReconnectAttempts: false)
        }
        reconnectWorkItem?.cancel()
        reconnectWorkItem = workItem
        queue.asyncAfter(deadline: .now() + .milliseconds(delayMs), execute: workItem)
    }

    private func sanitizeError(_ message: String) -> String {
        let secrets = [publishURL, target.streamName].filter { $0.count >= 4 }
        var redacted = secrets.reduce(message) { nextValue, secret in
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

    private func resetConnectionState() {
        outboundChunkSize = 128
        inboundChunkSize = 128
        incomingChunks = [:]
        messageStreamId = 0
        sentAVCSequenceHeader = false
        sentAACSequenceHeader = false
        lastAACAudioSpecificConfig = nil
        firstMediaPresentationTimeSeconds = nil
    }

    private func connect() throws {
        guard !stopped else {
            throw BroadcastRTMPPublisherError.publisherStopped
        }

        statsLock.performLocked {
            self.currentStats.updateState(.connecting)
        }

        let parameters = target.scheme == "rtmps" ? NWParameters.tls : NWParameters.tcp
        guard let port = NWEndpoint.Port(rawValue: target.port) else {
            throw BroadcastRTMPPublisherError.invalidPublishURL
        }

        let nextConnection = NWConnection(host: NWEndpoint.Host(target.host), port: port, using: parameters)
        connection = nextConnection

        let semaphore = DispatchSemaphore(value: 0)
        var connectedError: Error?
        var connectionReady = false
        nextConnection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                connectionReady = true
                semaphore.signal()
            case .failed(let error):
                if connectionReady {
                    self?.queue.async {
                        guard self?.connection === nextConnection else {
                            return
                        }
                        self?.handleConnectionFailure(error)
                    }
                } else {
                    connectedError = error
                    semaphore.signal()
                }
            default:
                break
            }
        }
        nextConnection.start(queue: callbackQueue)

        guard semaphore.wait(timeout: .now() + 10) == .success else {
            throw BroadcastRTMPPublisherError.connectionTimeout
        }
        if let connectedError {
            throw BroadcastRTMPPublisherError.connectionFailed(connectedError.localizedDescription)
        }
    }

    private func performHandshake() throws {
        statsLock.performLocked {
            self.currentStats.updateState(.handshaking)
        }

        var c0c1 = Data([3])
        c0c1.appendUInt32BE(UInt32(Date().timeIntervalSince1970))
        c0c1.appendUInt32BE(0)
        var seed: UInt32 = 0x4D4C4331
        for _ in 0..<(1536 - 8) {
            seed = 1103515245 &* seed &+ 12345
            c0c1.append(UInt8((seed >> 16) & 0xff))
        }
        try write(c0c1)

        let s0s1s2 = try readExactly(3073)
        guard s0s1s2.first == 3, s0s1s2.count == 3073 else {
            throw BroadcastRTMPPublisherError.handshakeFailed
        }
        try write(Data(s0s1s2[1...1536]))
    }

    private func sendSetChunkSize(_ size: Int) throws {
        var payload = Data()
        payload.appendUInt32BE(UInt32(size))
        try sendMessage(typeId: 1, streamId: 0, timestamp: 0, chunkStreamId: 2, payload: payload)
    }

    private func sendConnect() throws {
        try sendCommand(
            name: "connect",
            transactionId: 1,
            commandObject: .object([
                "app": .string(target.appName),
                "type": .string("nonprivate"),
                "flashVer": .string("FMLE/3.0 (compatible; MobileLiveCaster)"),
                "tcUrl": .string(target.tcURL),
                "fpad": .bool(false),
                "capabilities": .number(15),
                "audioCodecs": .number(3575),
                "videoCodecs": .number(252),
                "videoFunction": .number(1),
                "objectEncoding": .number(0)
            ]),
            arguments: [],
            messageStreamId: 0
        )
    }

    private func sendCommand(
        name: String,
        transactionId: Double,
        commandObject: RTMPAMF0Value,
        arguments: [RTMPAMF0Value],
        messageStreamId: UInt32
    ) throws {
        var payload = Data()
        payload.appendAMF0(.string(name))
        payload.appendAMF0(.number(transactionId))
        payload.appendAMF0(commandObject)
        arguments.forEach { payload.appendAMF0($0) }
        try sendMessage(typeId: 20, streamId: messageStreamId, timestamp: 0, chunkStreamId: 3, payload: payload)
    }

    private func waitForCommandResult(transactionId: Double) throws {
        while true {
            let message = try readMessage()
            guard message.typeId == 20 || message.typeId == 17 else {
                continue
            }
            var reader = RTMPAMF0Reader(data: message.typeId == 17 ? Data(message.payload.dropFirst()) : message.payload)
            let values = reader.readAll()
            guard values.count >= 2 else {
                continue
            }
            if values[0] == .string("_error") {
                throw BroadcastRTMPPublisherError.commandRejected(String(describing: values))
            }
            if values[0] == .string("_result"), values[1] == .number(transactionId) {
                return
            }
        }
    }

    private func waitForCreateStreamResult(transactionId: Double) throws -> Int {
        while true {
            let message = try readMessage()
            guard message.typeId == 20 || message.typeId == 17 else {
                continue
            }
            var reader = RTMPAMF0Reader(data: message.typeId == 17 ? Data(message.payload.dropFirst()) : message.payload)
            let values = reader.readAll()
            guard values.count >= 4 else {
                continue
            }
            if values[0] == .string("_error") {
                throw BroadcastRTMPPublisherError.commandRejected(String(describing: values))
            }
            if values[0] == .string("_result"), values[1] == .number(transactionId), case .number(let streamId) = values[3] {
                let parsed = Int(streamId)
                guard parsed > 0 else {
                    throw BroadcastRTMPPublisherError.createStreamFailed
                }
                return parsed
            }
        }
    }

    private func readMessage() throws -> RTMPMessage {
        while true {
            let basicHeader = try readBasicHeader()
            let previous = incomingChunks[basicHeader.chunkStreamId] ?? RTMPIncomingChunk()
            var chunk = previous

            switch basicHeader.format {
            case 0:
                let header = try readExactly(11)
                chunk.timestamp = Int(header.readUInt24BE(at: 0))
                chunk.messageLength = Int(header.readUInt24BE(at: 3))
                chunk.typeId = header[6]
                chunk.streamId = header.readUInt32LE(at: 7)
                chunk.payload = Data()
            case 1:
                let header = try readExactly(7)
                chunk.timestamp += Int(header.readUInt24BE(at: 0))
                chunk.messageLength = Int(header.readUInt24BE(at: 3))
                chunk.typeId = header[6]
                chunk.payload = Data()
            case 2:
                let header = try readExactly(3)
                chunk.timestamp += Int(header.readUInt24BE(at: 0))
                chunk.payload = Data()
            default:
                break
            }

            let remaining = chunk.messageLength - chunk.payload.count
            let bytesToRead = max(0, min(inboundChunkSize, remaining))
            if bytesToRead > 0 {
                chunk.payload.append(try readExactly(bytesToRead))
            }
            incomingChunks[basicHeader.chunkStreamId] = chunk

            guard chunk.messageLength > 0, chunk.payload.count >= chunk.messageLength else {
                continue
            }

            incomingChunks[basicHeader.chunkStreamId]?.payload = Data()
            let message = RTMPMessage(typeId: chunk.typeId, streamId: chunk.streamId, timestamp: chunk.timestamp, payload: chunk.payload)
            if message.typeId == 1, message.payload.count >= 4 {
                inboundChunkSize = Int(message.payload.readUInt32BE(at: 0))
                continue
            }
            return message
        }
    }

    private func readBasicHeader() throws -> (format: UInt8, chunkStreamId: Int) {
        let first = try readExactly(1)[0]
        let format = first >> 6
        var chunkStreamId = Int(first & 0x3f)
        if chunkStreamId == 0 {
            chunkStreamId = Int(try readExactly(1)[0]) + 64
        } else if chunkStreamId == 1 {
            let bytes = try readExactly(2)
            chunkStreamId = Int(bytes[0]) + Int(bytes[1]) * 256 + 64
        }
        return (format, chunkStreamId)
    }

    private func publishVideoFrameLocked(_ frame: BroadcastEncodedVideoFrame) {
        guard stats.state == .published, messageStreamId > 0 else {
            statsLock.performLocked {
                self.currentStats.recordDroppedVideoFrame()
            }
            return
        }

        do {
            if !sentAVCSequenceHeader {
                guard frame.isKeyframe, try sendAVCSequenceHeader(frame) else {
                    statsLock.performLocked {
                        self.currentStats.recordDroppedVideoFrame()
                    }
                    return
                }
                sentAVCSequenceHeader = true
            }

            let timestampMs = relativeTimestampMs(frame.presentationTimeSeconds)
            var payload = Data()
            payload.append((frame.isKeyframe ? UInt8(1) : UInt8(2)) << 4 | 7)
            payload.append(1)
            payload.appendUInt24BE(0)
            payload.append(frame.avccPayload)
            try sendMessage(typeId: 9, streamId: messageStreamId, timestamp: timestampMs, chunkStreamId: 6, payload: payload)
            statsLock.performLocked {
                self.currentStats.recordVideoMessage(bytes: payload.count, timestampMs: timestampMs)
            }
        } catch {
            handleConnectionFailure(error)
        }
    }

    private func publishAudioFrameLocked(_ frame: BroadcastEncodedAudioFrame) {
        guard stats.state == .published, messageStreamId > 0 else {
            statsLock.performLocked {
                self.currentStats.recordDroppedAudioFrame()
            }
            return
        }

        do {
            if !sentAACSequenceHeader || lastAACAudioSpecificConfig != frame.audioSpecificConfig {
                try sendAACSequenceHeader(frame)
                sentAACSequenceHeader = true
                lastAACAudioSpecificConfig = frame.audioSpecificConfig
            }

            let timestampMs = relativeTimestampMs(frame.presentationTimeSeconds)
            var payload = Data()
            payload.append(aacAudioHeader(channelCount: frame.channelCount))
            payload.append(1)
            payload.append(frame.aacPayload)
            try sendMessage(typeId: 8, streamId: messageStreamId, timestamp: timestampMs, chunkStreamId: 4, payload: payload)
            statsLock.performLocked {
                self.currentStats.recordAudioMessage(bytes: payload.count, timestampMs: timestampMs)
            }
        } catch {
            handleConnectionFailure(error)
        }
    }

    private func sendAVCSequenceHeader(_ frame: BroadcastEncodedVideoFrame) throws -> Bool {
        guard
            let sps = frame.parameterSets.first(where: { ($0.first.map { $0 & 0x1f } ?? 0) == 7 }),
            let pps = frame.parameterSets.first(where: { ($0.first.map { $0 & 0x1f } ?? 0) == 8 }),
            sps.count >= 4
        else {
            return false
        }

        var config = Data()
        config.append(1)
        config.append(sps[1])
        config.append(sps[2])
        config.append(sps[3])
        config.append(0xff)
        config.append(0xe1)
        config.appendUInt16BE(UInt16(sps.count))
        config.append(sps)
        config.append(1)
        config.appendUInt16BE(UInt16(pps.count))
        config.append(pps)

        var payload = Data()
        payload.append(0x17)
        payload.append(0)
        payload.appendUInt24BE(0)
        payload.append(config)
        try sendMessage(typeId: 9, streamId: messageStreamId, timestamp: 0, chunkStreamId: 6, payload: payload)
        return true
    }

    private func sendAACSequenceHeader(_ frame: BroadcastEncodedAudioFrame) throws {
        var payload = Data()
        payload.append(aacAudioHeader(channelCount: frame.channelCount))
        payload.append(0)
        payload.append(frame.audioSpecificConfig)
        try sendMessage(typeId: 8, streamId: messageStreamId, timestamp: 0, chunkStreamId: 4, payload: payload)
    }

    private func aacAudioHeader(channelCount: Int) -> UInt8 {
        let soundFormatAAC = UInt8(10 << 4)
        let soundRate44k = UInt8(3 << 2)
        let soundSize16Bit = UInt8(1 << 1)
        let soundTypeStereo = UInt8(channelCount > 1 ? 1 : 0)
        return soundFormatAAC | soundRate44k | soundSize16Bit | soundTypeStereo
    }

    private func relativeTimestampMs(_ presentationTimeSeconds: Double) -> Int {
        if firstMediaPresentationTimeSeconds == nil {
            firstMediaPresentationTimeSeconds = presentationTimeSeconds
        }
        let base = firstMediaPresentationTimeSeconds ?? presentationTimeSeconds
        return max(0, Int((presentationTimeSeconds - base) * 1000))
    }

    private func sendMessage(typeId: UInt8, streamId: UInt32, timestamp: Int, chunkStreamId: UInt8, payload: Data) throws {
        let extendedTimestamp = timestamp >= 0x00ff_ffff
        var remaining = payload
        var firstChunk = true

        while !remaining.isEmpty || firstChunk {
            var chunk = Data()
            chunk.append((firstChunk ? UInt8(0) : UInt8(0xc0)) | chunkStreamId)
            if firstChunk {
                chunk.appendUInt24BE(UInt32(extendedTimestamp ? 0x00ff_ffff : timestamp))
                chunk.appendUInt24BE(UInt32(payload.count))
                chunk.append(typeId)
                chunk.appendUInt32LE(streamId)
                if extendedTimestamp {
                    chunk.appendUInt32BE(UInt32(timestamp))
                }
            } else if extendedTimestamp {
                chunk.appendUInt32BE(UInt32(timestamp))
            }

            let payloadCount = min(outboundChunkSize, remaining.count)
            if payloadCount > 0 {
                chunk.append(remaining.prefix(payloadCount))
                remaining.removeFirst(payloadCount)
            }
            try write(chunk)
            firstChunk = false
        }
    }

    private func write(_ data: Data) throws {
        guard let connection, !stopped else {
            throw BroadcastRTMPPublisherError.publisherStopped
        }

        let semaphore = DispatchSemaphore(value: 0)
        var writeError: Error?
        connection.send(content: data, completion: .contentProcessed { error in
            writeError = error
            semaphore.signal()
        })
        guard semaphore.wait(timeout: .now() + 10) == .success else {
            throw BroadcastRTMPPublisherError.writeTimeout
        }
        if let writeError {
            throw BroadcastRTMPPublisherError.writeFailed(writeError.localizedDescription)
        }
        statsLock.performLocked {
            self.currentStats.recordBytesWritten(data.count)
        }
    }

    private func readExactly(_ count: Int) throws -> Data {
        guard count > 0 else {
            return Data()
        }
        guard let connection else {
            throw BroadcastRTMPPublisherError.publisherStopped
        }

        var output = Data()
        while output.count < count {
            let semaphore = DispatchSemaphore(value: 0)
            var chunk = Data()
            var readError: Error?
            let requested = count - output.count
            connection.receive(minimumIncompleteLength: 1, maximumLength: requested) { data, _, _, error in
                if let data {
                    chunk = data
                }
                readError = error
                semaphore.signal()
            }

            guard semaphore.wait(timeout: .now() + 10) == .success else {
                throw BroadcastRTMPPublisherError.readTimeout(count)
            }
            if let readError {
                throw BroadcastRTMPPublisherError.connectionFailed(readError.localizedDescription)
            }
            guard !chunk.isEmpty else {
                throw BroadcastRTMPPublisherError.connectionFailed("Remote host closed the connection")
            }
            output.append(chunk)
        }
        return output
    }
}

private struct BroadcastAudioInputSignature: Equatable {
    let sampleRate: Double
    let channelCount: UInt32
    let formatID: AudioFormatID
    let formatFlags: AudioFormatFlags
    let bytesPerPacket: UInt32
    let framesPerPacket: UInt32
    let bytesPerFrame: UInt32
    let bitsPerChannel: UInt32
}

private struct BroadcastAudioConverterInputContext {
    let data: UnsafeRawPointer
    let dataSize: UInt32
    let channelCount: UInt32
    let packetCount: UInt32
    var consumed = false
}

private let audioConverterInputCallback: AudioConverterComplexInputDataProc = { _, ioNumberDataPackets, ioData, _, userData in
    guard let userData else {
        ioNumberDataPackets.pointee = 0
        return kAudio_ParamError
    }

    let context = userData.assumingMemoryBound(to: BroadcastAudioConverterInputContext.self)
    guard !context.pointee.consumed else {
        ioNumberDataPackets.pointee = 0
        return noErr
    }

    ioNumberDataPackets.pointee = context.pointee.packetCount
    ioData.pointee.mNumberBuffers = 1
    ioData.pointee.mBuffers = AudioBuffer(
        mNumberChannels: context.pointee.channelCount,
        mDataByteSize: context.pointee.dataSize,
        mData: UnsafeMutableRawPointer(mutating: context.pointee.data)
    )
    context.pointee.consumed = true
    return noErr
}

private final class BroadcastAudioPCMConverter {
    private let outputFormat: AudioStreamBasicDescription
    private var converter: AudioConverterRef?
    private var inputSignature: BroadcastAudioInputSignature?

    init(outputFormat: AudioStreamBasicDescription) {
        self.outputFormat = outputFormat
    }

    deinit {
        finish()
    }

    func finish() {
        if let converter {
            AudioConverterDispose(converter)
        }
        converter = nil
        inputSignature = nil
    }

    func convert(sampleBuffer: CMSampleBuffer) throws -> BroadcastPCMAudioFrame {
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer) else {
            throw BroadcastAudioEncoderError.formatDescriptionMissing
        }
        guard let inputFormatPointer = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription) else {
            throw BroadcastAudioEncoderError.formatDescriptionMissing
        }
        var inputFormat = inputFormatPointer.pointee
        try configureConverterIfNeeded(inputFormat: &inputFormat)

        guard let converter else {
            throw BroadcastAudioEncoderError.converterCreateFailed(kAudio_ParamError)
        }
        guard let dataBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else {
            throw BroadcastAudioEncoderError.dataBufferMissing
        }

        let inputData = Self.copyBlockBufferData(dataBuffer)
        let inputPacketCount = UInt32(max(CMSampleBufferGetNumSamples(sampleBuffer), 0))
        guard !inputData.isEmpty, inputPacketCount > 0 else {
            return BroadcastPCMAudioFrame(
                source: .mixed,
                presentationTimeSeconds: 0,
                durationSeconds: 0,
                sampleRate: outputFormat.mSampleRate,
                channelCount: Int(outputFormat.mChannelsPerFrame),
                samples: []
            )
        }

        let outputFrameCapacity = max(
            1,
            Int(ceil(Double(inputPacketCount) * outputFormat.mSampleRate / max(inputFormat.mSampleRate, 1))) + 2048
        )
        let outputBufferSize = max(outputFrameCapacity * Int(outputFormat.mBytesPerFrame), Int(outputFormat.mBytesPerFrame))
        var outputData = Data(count: outputBufferSize)

        let samples = try inputData.withUnsafeBytes { inputBytes -> [Float] in
            guard let inputBaseAddress = inputBytes.baseAddress else {
                return []
            }
            var inputContext = BroadcastAudioConverterInputContext(
                data: inputBaseAddress,
                dataSize: UInt32(inputData.count),
                channelCount: inputFormat.mChannelsPerFrame,
                packetCount: inputPacketCount
            )

            return try outputData.withUnsafeMutableBytes { outputBytes -> [Float] in
                guard let outputBaseAddress = outputBytes.baseAddress else {
                    return []
                }

                var outputBufferList = AudioBufferList(
                    mNumberBuffers: 1,
                    mBuffers: AudioBuffer(
                        mNumberChannels: outputFormat.mChannelsPerFrame,
                        mDataByteSize: UInt32(outputBufferSize),
                        mData: outputBaseAddress
                    )
                )
                var outputPacketCount = UInt32(outputFrameCapacity)
                let convertStatus = AudioConverterFillComplexBuffer(
                    converter,
                    audioConverterInputCallback,
                    &inputContext,
                    &outputPacketCount,
                    &outputBufferList,
                    nil
                )
                guard convertStatus == noErr else {
                    throw BroadcastAudioEncoderError.encodeFailed(convertStatus)
                }

                let validByteCount = Int(outputBufferList.mBuffers.mDataByteSize)
                guard validByteCount > 0 else {
                    return []
                }

                let convertedData = Data(bytes: outputBaseAddress, count: validByteCount)
                return convertedData.withUnsafeBytes { convertedBytes in
                    let floatBuffer = convertedBytes.bindMemory(to: Float.self)
                    return Array(floatBuffer.prefix(validByteCount / MemoryLayout<Float>.size))
                }
            }
        }

        let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let duration = CMSampleBufferGetDuration(sampleBuffer)
        return BroadcastPCMAudioFrame(
            source: .mixed,
            presentationTimeSeconds: presentationTime.isValid ? CMTimeGetSeconds(presentationTime) : 0,
            durationSeconds: duration.isValid && duration.isNumeric ? CMTimeGetSeconds(duration) : 0,
            sampleRate: outputFormat.mSampleRate,
            channelCount: Int(outputFormat.mChannelsPerFrame),
            samples: samples
        )
    }

    private func configureConverterIfNeeded(inputFormat: inout AudioStreamBasicDescription) throws {
        guard inputFormat.mFormatID == kAudioFormatLinearPCM else {
            throw BroadcastAudioEncoderError.unsupportedInputFormat(inputFormat.mFormatID)
        }

        let signature = BroadcastAudioInputSignature(
            sampleRate: inputFormat.mSampleRate,
            channelCount: inputFormat.mChannelsPerFrame,
            formatID: inputFormat.mFormatID,
            formatFlags: inputFormat.mFormatFlags,
            bytesPerPacket: inputFormat.mBytesPerPacket,
            framesPerPacket: inputFormat.mFramesPerPacket,
            bytesPerFrame: inputFormat.mBytesPerFrame,
            bitsPerChannel: inputFormat.mBitsPerChannel
        )

        guard signature != inputSignature else {
            return
        }

        var nextOutputFormat = outputFormat
        var nextConverter: AudioConverterRef?
        let createStatus = AudioConverterNew(&inputFormat, &nextOutputFormat, &nextConverter)
        guard createStatus == noErr, let nextConverter else {
            throw BroadcastAudioEncoderError.converterCreateFailed(createStatus)
        }

        if let converter {
            AudioConverterDispose(converter)
        }
        converter = nextConverter
        inputSignature = signature
    }

    private static func copyBlockBufferData(_ blockBuffer: CMBlockBuffer) -> Data {
        let dataLength = CMBlockBufferGetDataLength(blockBuffer)
        guard dataLength > 0 else {
            return Data()
        }

        var data = Data(count: dataLength)
        data.withUnsafeMutableBytes { destination in
            guard let baseAddress = destination.baseAddress else {
                return
            }
            CMBlockBufferCopyDataBytes(blockBuffer, atOffset: 0, dataLength: dataLength, destination: baseAddress)
        }
        return data
    }
}

final class BroadcastAudioEncoder {
    private let configuration: BroadcastUploadConfiguration
    private let onEncodedFrame: (BroadcastEncodedAudioFrame) -> Void
    private let encoderLock = NSLock()
    private let statsLock = NSLock()
    private var converter: AudioConverterRef?
    private var inputSignature: BroadcastAudioInputSignature?
    private var outputFormat = AudioStreamBasicDescription()
    private var maxOutputPacketSize: UInt32 = 4096
    private var audioSpecificConfig = Data()
    private var mixerInputFormat: AudioStreamBasicDescription?
    private var sourceConverters: [BroadcastAudioSource: BroadcastAudioPCMConverter] = [:]
    private var appPCMQueue: [Float] = []
    private var microphonePCMQueue: [Float] = []
    private var mixerNextPresentationTimeSeconds: Double?
    private var currentStats = BroadcastAudioEncoderStats()
    private let mixerChannelCount = 2
    private let mixerFramesPerAACPacket = 1024
    private let mixerSoloFlushFrameThreshold = 2048
    private let appGain: Float = 0.85
    private let microphoneGain: Float = 1.0

    var stats: BroadcastAudioEncoderStats {
        statsLock.performLocked {
            self.currentStats
        }
    }

    init(
        configuration: BroadcastUploadConfiguration,
        onEncodedFrame: @escaping (BroadcastEncodedAudioFrame) -> Void
    ) {
        self.configuration = configuration
        self.onEncodedFrame = onEncodedFrame
    }

    deinit {
        finish()
    }

    func encode(_ sampleBuffer: CMSampleBuffer, source: BroadcastAudioSource) throws {
        encoderLock.lock()
        defer { encoderLock.unlock() }

        do {
            try encodeLocked(sampleBuffer, source: source)
        } catch let error as BroadcastAudioEncoderError {
            if let status = error.statusCode {
                statsLock.performLocked {
                    self.currentStats.recordStatus(status)
                }
            }
            throw error
        }
    }

    func finish() {
        encoderLock.lock()
        defer { encoderLock.unlock() }

        if let converter {
            AudioConverterDispose(converter)
        }
        sourceConverters.values.forEach { $0.finish() }
        converter = nil
        inputSignature = nil
        audioSpecificConfig = Data()
        mixerInputFormat = nil
        sourceConverters = [:]
        appPCMQueue.removeAll(keepingCapacity: false)
        microphonePCMQueue.removeAll(keepingCapacity: false)
        mixerNextPresentationTimeSeconds = nil
    }

    private func encodeLocked(_ sampleBuffer: CMSampleBuffer, source: BroadcastAudioSource) throws {
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer) else {
            throw BroadcastAudioEncoderError.formatDescriptionMissing
        }
        guard let inputFormatPointer = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription) else {
            throw BroadcastAudioEncoderError.formatDescriptionMissing
        }
        var inputFormat = inputFormatPointer.pointee
        try configureMixerIfNeeded(sampleRate: inputFormat.mSampleRate)
        guard let mixerInputFormat else {
            throw BroadcastAudioEncoderError.converterCreateFailed(kAudio_ParamError)
        }

        let pcmConverter = try sourcePCMConverter(for: source, outputFormat: mixerInputFormat)
        let pcmFrame = try pcmConverter.convert(sampleBuffer: sampleBuffer)
        guard pcmFrame.frameCount > 0 else {
            return
        }

        if mixerNextPresentationTimeSeconds == nil {
            mixerNextPresentationTimeSeconds = pcmFrame.presentationTimeSeconds
        }
        appendPCMFrame(pcmFrame, source: source)
        let frames = try drainMixer()

        frames.forEach { frame in
            statsLock.performLocked {
                self.currentStats.record(frame)
            }
            onEncodedFrame(frame)
        }
    }

    private func configureMixerIfNeeded(sampleRate: Double) throws {
        guard mixerInputFormat == nil else {
            return
        }

        let resolvedSampleRate = sampleRate > 0 ? sampleRate : 44100
        let bytesPerFrame = UInt32(mixerChannelCount * MemoryLayout<Float>.size)
        mixerInputFormat = AudioStreamBasicDescription(
            mSampleRate: resolvedSampleRate,
            mFormatID: kAudioFormatLinearPCM,
            mFormatFlags: AudioFormatFlags(kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked),
            mBytesPerPacket: bytesPerFrame,
            mFramesPerPacket: 1,
            mBytesPerFrame: bytesPerFrame,
            mChannelsPerFrame: UInt32(mixerChannelCount),
            mBitsPerChannel: UInt32(MemoryLayout<Float>.size * 8),
            mReserved: 0
        )
    }

    private func sourcePCMConverter(
        for source: BroadcastAudioSource,
        outputFormat: AudioStreamBasicDescription
    ) throws -> BroadcastAudioPCMConverter {
        if let converter = sourceConverters[source] {
            return converter
        }

        let converter = BroadcastAudioPCMConverter(outputFormat: outputFormat)
        sourceConverters[source] = converter
        return converter
    }

    private func appendPCMFrame(_ frame: BroadcastPCMAudioFrame, source: BroadcastAudioSource) {
        switch source {
        case .app:
            appPCMQueue.append(contentsOf: frame.samples)
        case .microphone:
            microphonePCMQueue.append(contentsOf: frame.samples)
        case .mixed:
            break
        }
    }

    private func drainMixer() throws -> [BroadcastEncodedAudioFrame] {
        guard let mixerInputFormat else {
            return []
        }

        var outputFrames: [BroadcastEncodedAudioFrame] = []
        let chunkSamples = mixerFramesPerAACPacket * mixerChannelCount

        while true {
            let appFrames = appPCMQueue.count / mixerChannelCount
            let microphoneFrames = microphonePCMQueue.count / mixerChannelCount
            let bothReady = appFrames >= mixerFramesPerAACPacket && microphoneFrames >= mixerFramesPerAACPacket
            let appSoloReady = appFrames >= mixerSoloFlushFrameThreshold && microphoneFrames < mixerFramesPerAACPacket
            let microphoneSoloReady = microphoneFrames >= mixerSoloFlushFrameThreshold && appFrames < mixerFramesPerAACPacket

            guard bothReady || appSoloReady || microphoneSoloReady else {
                break
            }

            let includeApp = bothReady || appSoloReady
            let includeMicrophone = bothReady || microphoneSoloReady
            let appSamples = includeApp
                ? dequeueSamples(from: &appPCMQueue, sampleCount: chunkSamples)
                : [Float](repeating: 0, count: chunkSamples)
            let microphoneSamples = includeMicrophone
                ? dequeueSamples(from: &microphonePCMQueue, sampleCount: chunkSamples)
                : [Float](repeating: 0, count: chunkSamples)

            var mixedSamples = [Float](repeating: 0, count: chunkSamples)
            for index in 0..<chunkSamples {
                let mixed = appSamples[index] * appGain + microphoneSamples[index] * microphoneGain
                mixedSamples[index] = Swift.min(Float(1), Swift.max(Float(-1), mixed))
            }

            outputFrames.append(contentsOf: try encodeMixedSamples(mixedSamples, inputFormat: mixerInputFormat))
        }

        return outputFrames
    }

    private func dequeueSamples(from queue: inout [Float], sampleCount: Int) -> [Float] {
        var output = [Float](repeating: 0, count: sampleCount)
        let copiedSampleCount = min(sampleCount, queue.count)
        if copiedSampleCount > 0 {
            output.replaceSubrange(0..<copiedSampleCount, with: queue.prefix(copiedSampleCount))
            queue.removeFirst(copiedSampleCount)
        }
        return output
    }

    private func encodeMixedSamples(
        _ samples: [Float],
        inputFormat: AudioStreamBasicDescription
    ) throws -> [BroadcastEncodedAudioFrame] {
        var mutableInputFormat = inputFormat
        try configureConverterIfNeeded(inputFormat: &mutableInputFormat)
        guard let converter else {
            throw BroadcastAudioEncoderError.converterCreateFailed(kAudio_ParamError)
        }

        let presentationTimeSeconds = mixerNextPresentationTimeSeconds ?? 0
        let durationSeconds = inputFormat.mSampleRate > 0
            ? Double(mixerFramesPerAACPacket) / inputFormat.mSampleRate
            : 0
        mixerNextPresentationTimeSeconds = presentationTimeSeconds + durationSeconds

        let inputData = samples.withUnsafeBufferPointer { bufferPointer -> Data in
            guard let baseAddress = bufferPointer.baseAddress else {
                return Data()
            }
            return Data(bytes: baseAddress, count: samples.count * MemoryLayout<Float>.size)
        }

        return try encodeInputData(
            inputData,
            source: .mixed,
            converter: converter,
            inputPacketCount: UInt32(mixerFramesPerAACPacket),
            inputChannelCount: UInt32(mixerChannelCount),
            presentationTimeSeconds: presentationTimeSeconds,
            durationSeconds: durationSeconds
        )
    }

    private func configureConverterIfNeeded(inputFormat: inout AudioStreamBasicDescription) throws {
        guard inputFormat.mFormatID == kAudioFormatLinearPCM else {
            throw BroadcastAudioEncoderError.unsupportedInputFormat(inputFormat.mFormatID)
        }

        let outputChannelCount = UInt32(max(1, min(Int(inputFormat.mChannelsPerFrame), 2)))
        let signature = BroadcastAudioInputSignature(
            sampleRate: inputFormat.mSampleRate,
            channelCount: outputChannelCount,
            formatID: inputFormat.mFormatID,
            formatFlags: inputFormat.mFormatFlags,
            bytesPerPacket: inputFormat.mBytesPerPacket,
            framesPerPacket: inputFormat.mFramesPerPacket,
            bytesPerFrame: inputFormat.mBytesPerFrame,
            bitsPerChannel: inputFormat.mBitsPerChannel
        )

        guard signature != inputSignature else {
            return
        }

        guard let nextAudioSpecificConfig = Self.makeAudioSpecificConfig(
            sampleRate: inputFormat.mSampleRate,
            channelCount: Int(outputChannelCount)
        ) else {
            throw BroadcastAudioEncoderError.unsupportedSampleRate(inputFormat.mSampleRate)
        }

        var nextOutputFormat = AudioStreamBasicDescription(
            mSampleRate: inputFormat.mSampleRate,
            mFormatID: kAudioFormatMPEG4AAC,
            mFormatFlags: 0,
            mBytesPerPacket: 0,
            mFramesPerPacket: 1024,
            mBytesPerFrame: 0,
            mChannelsPerFrame: outputChannelCount,
            mBitsPerChannel: 0,
            mReserved: 0
        )
        var outputFormatSize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        let formatStatus = AudioFormatGetProperty(
            kAudioFormatProperty_FormatInfo,
            0,
            nil,
            &outputFormatSize,
            &nextOutputFormat
        )
        guard formatStatus == noErr else {
            throw BroadcastAudioEncoderError.converterCreateFailed(formatStatus)
        }

        var nextConverter: AudioConverterRef?
        let createStatus = AudioConverterNew(&inputFormat, &nextOutputFormat, &nextConverter)
        guard createStatus == noErr, let nextConverter else {
            throw BroadcastAudioEncoderError.converterCreateFailed(createStatus)
        }

        var bitrate = UInt32(configuration.audioBitrateKbps * 1000)
        let bitrateStatus = AudioConverterSetProperty(
            nextConverter,
            kAudioConverterEncodeBitRate,
            UInt32(MemoryLayout<UInt32>.size),
            &bitrate
        )
        guard bitrateStatus == noErr else {
            AudioConverterDispose(nextConverter)
            throw BroadcastAudioEncoderError.propertySetFailed("EncodeBitRate", bitrateStatus)
        }

        var nextMaxOutputPacketSize: UInt32 = 0
        var packetSizePropertySize = UInt32(MemoryLayout<UInt32>.size)
        let packetSizeStatus = AudioConverterGetProperty(
            nextConverter,
            kAudioConverterPropertyMaximumOutputPacketSize,
            &packetSizePropertySize,
            &nextMaxOutputPacketSize
        )
        if packetSizeStatus != noErr || nextMaxOutputPacketSize == 0 {
            nextMaxOutputPacketSize = 4096
        }

        if let converter {
            AudioConverterDispose(converter)
        }
        converter = nextConverter
        inputSignature = signature
        outputFormat = nextOutputFormat
        maxOutputPacketSize = nextMaxOutputPacketSize
        audioSpecificConfig = nextAudioSpecificConfig
    }

    private func encodeInputData(
        _ inputData: Data,
        source: BroadcastAudioSource,
        converter: AudioConverterRef,
        inputPacketCount: UInt32,
        inputChannelCount: UInt32,
        presentationTimeSeconds: Double,
        durationSeconds: Double
    ) throws -> [BroadcastEncodedAudioFrame] {
        let framesPerPacket = max(Int(outputFormat.mFramesPerPacket), 1)
        let outputPacketCapacity = max(1, min(32, Int(inputPacketCount) / framesPerPacket + 2))
        let outputBufferSize = max(Int(maxOutputPacketSize) * outputPacketCapacity, 1024)
        var outputData = Data(count: outputBufferSize)
        var packetDescriptions = [AudioStreamPacketDescription](
            repeating: AudioStreamPacketDescription(mStartOffset: 0, mVariableFramesInPacket: 0, mDataByteSize: 0),
            count: outputPacketCapacity
        )

        return try inputData.withUnsafeBytes { inputBytes -> [BroadcastEncodedAudioFrame] in
            guard let inputBaseAddress = inputBytes.baseAddress else {
                return []
            }
            var inputContext = BroadcastAudioConverterInputContext(
                data: inputBaseAddress,
                dataSize: UInt32(inputData.count),
                channelCount: inputChannelCount,
                packetCount: inputPacketCount
            )

            return try outputData.withUnsafeMutableBytes { outputBytes -> [BroadcastEncodedAudioFrame] in
                guard let outputBaseAddress = outputBytes.baseAddress else {
                    return []
                }

                var outputBufferList = AudioBufferList(
                    mNumberBuffers: 1,
                    mBuffers: AudioBuffer(
                        mNumberChannels: outputFormat.mChannelsPerFrame,
                        mDataByteSize: UInt32(outputBufferSize),
                        mData: outputBaseAddress
                    )
                )
                var outputPacketCount = UInt32(outputPacketCapacity)
                let encodeStatus = packetDescriptions.withUnsafeMutableBufferPointer { packetDescriptionBuffer in
                    AudioConverterFillComplexBuffer(
                        converter,
                        audioConverterInputCallback,
                        &inputContext,
                        &outputPacketCount,
                        &outputBufferList,
                        packetDescriptionBuffer.baseAddress
                    )
                }
                guard encodeStatus == noErr else {
                    throw BroadcastAudioEncoderError.encodeFailed(encodeStatus)
                }

                let validByteCount = Int(outputBufferList.mBuffers.mDataByteSize)
                guard outputPacketCount > 0, validByteCount > 0 else {
                    return []
                }

                let encodedBytes = Data(bytes: outputBaseAddress, count: validByteCount)
                let packetDuration = outputFormat.mSampleRate > 0
                    ? Double(framesPerPacket) / outputFormat.mSampleRate
                    : durationSeconds
                var frames: [BroadcastEncodedAudioFrame] = []

                for packetIndex in 0..<Int(outputPacketCount) {
                    let description = packetDescriptions[packetIndex]
                    let packetOffset = description.mDataByteSize > 0 ? Int(description.mStartOffset) : 0
                    let packetSize = description.mDataByteSize > 0 ? Int(description.mDataByteSize) : validByteCount
                    guard packetSize > 0, packetOffset >= 0, packetOffset + packetSize <= encodedBytes.count else {
                        continue
                    }

                    frames.append(
                        BroadcastEncodedAudioFrame(
                            source: source,
                            presentationTimeSeconds: presentationTimeSeconds + Double(packetIndex) * packetDuration,
                            durationSeconds: packetDuration,
                            sampleRate: outputFormat.mSampleRate,
                            channelCount: Int(outputFormat.mChannelsPerFrame),
                            byteCount: packetSize,
                            audioSpecificConfig: audioSpecificConfig,
                            aacPayload: encodedBytes.subdata(in: packetOffset..<(packetOffset + packetSize))
                        )
                    )

                    if description.mDataByteSize == 0 {
                        break
                    }
                }

                return frames
            }
        }
    }

    private static func makeAudioSpecificConfig(sampleRate: Double, channelCount: Int) -> Data? {
        let sampleRateIndexes: [Int: UInt8] = [
            96000: 0,
            88200: 1,
            64000: 2,
            48000: 3,
            44100: 4,
            32000: 5,
            24000: 6,
            22050: 7,
            16000: 8,
            12000: 9,
            11025: 10,
            8000: 11,
            7350: 12
        ]

        guard let sampleRateIndex = sampleRateIndexes[Int(sampleRate.rounded())] else {
            return nil
        }

        let objectTypeAACLC = UInt16(2)
        let channelConfig = UInt16(max(1, min(channelCount, 7)))
        let config = (objectTypeAACLC << 11) | (UInt16(sampleRateIndex) << 7) | (channelConfig << 3)
        return Data([UInt8((config >> 8) & 0xff), UInt8(config & 0xff)])
    }

    private static func copyBlockBufferData(_ blockBuffer: CMBlockBuffer) -> Data {
        let dataLength = CMBlockBufferGetDataLength(blockBuffer)
        guard dataLength > 0 else {
            return Data()
        }

        var data = Data(count: dataLength)
        data.withUnsafeMutableBytes { destination in
            guard let baseAddress = destination.baseAddress else {
                return
            }
            CMBlockBufferCopyDataBytes(blockBuffer, atOffset: 0, dataLength: dataLength, destination: baseAddress)
        }
        return data
    }
}

private let videoCompressionOutputCallback: VTCompressionOutputCallback = { refcon, _, status, _, sampleBuffer in
    guard let refcon else {
        return
    }
    let encoder = Unmanaged<BroadcastVideoEncoder>.fromOpaque(refcon).takeUnretainedValue()
    encoder.handleOutput(status: status, sampleBuffer: sampleBuffer)
}

final class BroadcastVideoEncoder {
    private let configuration: BroadcastUploadConfiguration
    private let onEncodedFrame: (BroadcastEncodedVideoFrame) -> Void
    private var session: VTCompressionSession?
    private let statsLock = NSLock()
    private var currentStats = BroadcastVideoEncoderStats()

    var stats: BroadcastVideoEncoderStats {
        statsLock.performLocked {
            currentStats
        }
    }

    init(
        configuration: BroadcastUploadConfiguration,
        onEncodedFrame: @escaping (BroadcastEncodedVideoFrame) -> Void
    ) throws {
        self.configuration = configuration
        self.onEncodedFrame = onEncodedFrame
        try configureSession()
    }

    func encode(_ sampleBuffer: CMSampleBuffer) throws {
        guard let session else {
            throw BroadcastVideoEncoderError.sessionCreateFailed(kVTInvalidSessionErr)
        }
        guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            throw BroadcastVideoEncoderError.pixelBufferMissing
        }

        let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let duration = normalizedDuration(CMSampleBufferGetDuration(sampleBuffer))
        let status = VTCompressionSessionEncodeFrame(
            session,
            imageBuffer: imageBuffer,
            presentationTimeStamp: presentationTime.isValid ? presentationTime : CMTime(value: 0, timescale: 1),
            duration: duration,
            frameProperties: nil,
            sourceFrameRefcon: nil,
            infoFlagsOut: nil
        )
        guard status == noErr else {
            statsLock.performLocked {
                currentStats.recordStatus(status)
            }
            throw BroadcastVideoEncoderError.encodeFailed(status)
        }
    }

    func finish() {
        guard let session else {
            return
        }
        VTCompressionSessionCompleteFrames(session, untilPresentationTimeStamp: .invalid)
        VTCompressionSessionInvalidate(session)
        self.session = nil
    }

    fileprivate func handleOutput(status: OSStatus, sampleBuffer: CMSampleBuffer?) {
        guard status == noErr else {
            statsLock.performLocked {
                currentStats.recordStatus(status)
            }
            return
        }
        guard let sampleBuffer, CMSampleBufferDataIsReady(sampleBuffer), let encodedFrame = Self.makeEncodedFrame(sampleBuffer) else {
            return
        }

        statsLock.performLocked {
            currentStats.record(encodedFrame)
        }
        onEncodedFrame(encodedFrame)
    }

    private func configureSession() throws {
        var nextSession: VTCompressionSession?
        let createStatus = VTCompressionSessionCreate(
            allocator: kCFAllocatorDefault,
            width: Int32(configuration.width),
            height: Int32(configuration.height),
            codecType: kCMVideoCodecType_H264,
            encoderSpecification: nil,
            imageBufferAttributes: nil,
            compressedDataAllocator: nil,
            outputCallback: videoCompressionOutputCallback,
            refcon: Unmanaged.passUnretained(self).toOpaque(),
            compressionSessionOut: &nextSession
        )

        guard createStatus == noErr, let nextSession else {
            throw BroadcastVideoEncoderError.sessionCreateFailed(createStatus)
        }

        session = nextSession
        try setProperty(kVTCompressionPropertyKey_RealTime, kCFBooleanTrue, name: "RealTime")
        try setProperty(kVTCompressionPropertyKey_AllowFrameReordering, kCFBooleanFalse, name: "AllowFrameReordering")
        try setProperty(kVTCompressionPropertyKey_ProfileLevel, kVTProfileLevel_H264_Baseline_AutoLevel, name: "ProfileLevel")
        try setProperty(
            kVTCompressionPropertyKey_AverageBitRate,
            NSNumber(value: configuration.videoBitrateKbps * 1000),
            name: "AverageBitRate"
        )
        try setProperty(kVTCompressionPropertyKey_MaxKeyFrameInterval, NSNumber(value: configuration.fps * 2), name: "MaxKeyFrameInterval")
        try setProperty(kVTCompressionPropertyKey_ExpectedFrameRate, NSNumber(value: configuration.fps), name: "ExpectedFrameRate")

        VTCompressionSessionPrepareToEncodeFrames(nextSession)
    }

    private func setProperty(_ key: CFString, _ value: CFTypeRef, name: String) throws {
        guard let session else {
            throw BroadcastVideoEncoderError.sessionCreateFailed(kVTInvalidSessionErr)
        }
        let status = VTSessionSetProperty(session, key: key, value: value)
        guard status == noErr else {
            throw BroadcastVideoEncoderError.propertySetFailed(name, status)
        }
    }

    private func normalizedDuration(_ duration: CMTime) -> CMTime {
        if duration.isValid && duration.isNumeric && duration.value > 0 {
            return duration
        }
        return CMTime(value: 1, timescale: CMTimeScale(max(configuration.fps, 1)))
    }

    private static func makeEncodedFrame(_ sampleBuffer: CMSampleBuffer) -> BroadcastEncodedVideoFrame? {
        guard let dataBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else {
            return nil
        }

        let isKeyframe = isKeyframe(sampleBuffer)
        let parameterSets = isKeyframe ? h264ParameterSets(sampleBuffer) : []
        let sampleData = copyBlockBufferData(dataBuffer)
        let nalUnitHeaderLength = h264NALUnitHeaderLength(sampleBuffer) ?? 4
        let annexB = annexBNALUnits(from: sampleData, nalUnitHeaderLength: nalUnitHeaderLength)
        let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let duration = CMSampleBufferGetDuration(sampleBuffer)

        return BroadcastEncodedVideoFrame(
            presentationTimeSeconds: presentationTime.isValid ? CMTimeGetSeconds(presentationTime) : 0,
            durationSeconds: duration.isValid && duration.isNumeric ? CMTimeGetSeconds(duration) : 0,
            isKeyframe: isKeyframe,
            byteCount: sampleData.count + parameterSets.reduce(0) { $0 + $1.count },
            parameterSets: parameterSets,
            avccPayload: sampleData,
            annexBNALUnits: annexB
        )
    }

    private static func copyBlockBufferData(_ blockBuffer: CMBlockBuffer) -> Data {
        let dataLength = CMBlockBufferGetDataLength(blockBuffer)
        guard dataLength > 0 else {
            return Data()
        }

        var data = Data(count: dataLength)
        data.withUnsafeMutableBytes { destination in
            guard let baseAddress = destination.baseAddress else {
                return
            }
            CMBlockBufferCopyDataBytes(blockBuffer, atOffset: 0, dataLength: dataLength, destination: baseAddress)
        }
        return data
    }

    private static func isKeyframe(_ sampleBuffer: CMSampleBuffer) -> Bool {
        guard
            let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[CFString: Any]],
            let firstAttachment = attachments.first
        else {
            return true
        }
        return !(firstAttachment[kCMSampleAttachmentKey_NotSync] as? Bool ?? false)
    }

    private static func h264ParameterSets(_ sampleBuffer: CMSampleBuffer) -> [Data] {
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer) else {
            return []
        }

        var parameterSets: [Data] = []
        var parameterSetCount = 0
        var nalUnitHeaderLength: Int32 = 0
        var index = 0

        while true {
            var parameterSetPointer: UnsafePointer<UInt8>?
            var parameterSetSize = 0
            let status = CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
                formatDescription,
                parameterSetIndex: index,
                parameterSetPointerOut: &parameterSetPointer,
                parameterSetSizeOut: &parameterSetSize,
                parameterSetCountOut: &parameterSetCount,
                nalUnitHeaderLengthOut: &nalUnitHeaderLength
            )

            guard status == noErr, let parameterSetPointer, parameterSetSize > 0 else {
                break
            }

            parameterSets.append(Data(bytes: parameterSetPointer, count: parameterSetSize))
            index += 1
            if parameterSetCount > 0 && index >= parameterSetCount {
                break
            }
        }

        return parameterSets
    }

    private static func h264NALUnitHeaderLength(_ sampleBuffer: CMSampleBuffer) -> Int? {
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer) else {
            return nil
        }

        var nalUnitHeaderLength: Int32 = 0
        let status = CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
            formatDescription,
            parameterSetIndex: 0,
            parameterSetPointerOut: nil,
            parameterSetSizeOut: nil,
            parameterSetCountOut: nil,
            nalUnitHeaderLengthOut: &nalUnitHeaderLength
        )
        guard status == noErr, nalUnitHeaderLength > 0 else {
            return nil
        }

        return Int(nalUnitHeaderLength)
    }

    private static func annexBNALUnits(from avccData: Data, nalUnitHeaderLength: Int) -> [Data] {
        guard nalUnitHeaderLength > 0 else {
            return []
        }

        var units: [Data] = []
        var offset = 0
        while offset + nalUnitHeaderLength <= avccData.count {
            var nalLength = 0
            for byteIndex in 0..<nalUnitHeaderLength {
                nalLength = (nalLength << 8) | Int(avccData[offset + byteIndex])
            }
            offset += nalUnitHeaderLength
            guard nalLength > 0, offset + nalLength <= avccData.count else {
                break
            }

            var unit = Data([0, 0, 0, 1])
            unit.append(avccData[offset..<(offset + nalLength)])
            units.append(unit)
            offset += nalLength
        }
        return units
    }
}

struct BroadcastSceneCompositionSummary: Equatable {
    let appliedCount: Int
    let skippedCount: Int
    let skippedKinds: [String]
    let parseFailed: Bool

    static let screenOnly = BroadcastSceneCompositionSummary(
        appliedCount: 0,
        skippedCount: 0,
        skippedKinds: [],
        parseFailed: false
    )

    var message: String {
        if parseFailed {
            return "Native composition skipped: invalid render graph"
        }
        if appliedCount == 0 && skippedCount == 0 {
            return "Native composition screen-only"
        }
        if skippedCount == 0 {
            return "Native overlays applied: \(appliedCount)"
        }
        if appliedCount == 0 {
            return "Native overlays pending: \(skippedKinds.joined(separator: "/"))"
        }
        return "Native overlays applied: \(appliedCount), pending: \(skippedKinds.joined(separator: "/"))"
    }

    func asDictionary() -> [String: Any] {
        [
            "appliedCount": appliedCount,
            "skippedCount": skippedCount,
            "skippedKinds": skippedKinds,
            "parseFailed": parseFailed,
            "message": message
        ]
    }
}

private struct BroadcastRenderTransform {
    let x: CGFloat
    let y: CGFloat
    let width: CGFloat
    let height: CGFloat
    let rotation: CGFloat
    let opacity: CGFloat

    static let identity = BroadcastRenderTransform(
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
        opacity: 1
    )

    init(
        x: CGFloat,
        y: CGFloat,
        width: CGFloat,
        height: CGFloat,
        rotation: CGFloat,
        opacity: CGFloat
    ) {
        self.x = Self.clamp(x, 0, 1)
        self.y = Self.clamp(y, 0, 1)
        self.width = Self.clamp(width, 0.01, 1)
        self.height = Self.clamp(height, 0.01, 1)
        self.rotation = Self.clamp(rotation, -180, 180)
        self.opacity = Self.clamp(opacity, 0, 1)
    }

    init(dictionary: [String: Any]?) {
        self.init(
            x: Self.cgFloatValue(dictionary?["x"], fallback: 0),
            y: Self.cgFloatValue(dictionary?["y"], fallback: 0),
            width: Self.cgFloatValue(dictionary?["width"], fallback: 1),
            height: Self.cgFloatValue(dictionary?["height"], fallback: 1),
            rotation: Self.cgFloatValue(dictionary?["rotation"], fallback: 0),
            opacity: Self.cgFloatValue(dictionary?["opacity"], fallback: 1)
        )
    }

    private static func cgFloatValue(_ value: Any?, fallback: CGFloat) -> CGFloat {
        if let numberValue = value as? NSNumber {
            return CGFloat(truncating: numberValue)
        }
        if let stringValue = value as? String, let doubleValue = Double(stringValue) {
            return CGFloat(doubleValue)
        }
        return fallback
    }

    private static func clamp(_ value: CGFloat, _ lowerBound: CGFloat, _ upperBound: CGFloat) -> CGFloat {
        min(max(value, lowerBound), upperBound)
    }
}

private struct BroadcastRenderNode {
    let id: String
    let kind: String
    let order: Int
    let transform: BroadcastRenderTransform
    let payload: [String: Any]
}

private struct BroadcastPngTuberMotion {
    let offsetX: CGFloat
    let offsetY: CGFloat
    let rotation: CGFloat
    let scaleX: CGFloat
    let scaleY: CGFloat

    init(
        offsetX: CGFloat = 0,
        offsetY: CGFloat = 0,
        rotation: CGFloat = 0,
        scaleX: CGFloat = 1,
        scaleY: CGFloat = 1
    ) {
        self.offsetX = offsetX
        self.offsetY = offsetY
        self.rotation = rotation
        self.scaleX = scaleX
        self.scaleY = scaleY
    }
}

final class BroadcastSceneCompositor {
    private let ciContext = CIContext(options: nil)
    private let targetWidth: Int
    private let targetHeight: Int
    private let overlayNodes: [BroadcastRenderNode]
    private var cachedImages: [String: UIImage] = [:]
    let summary: BroadcastSceneCompositionSummary

    init(configuration: BroadcastUploadConfiguration) {
        targetWidth = configuration.width
        targetHeight = configuration.height

        guard let renderGraphJSON = configuration.renderGraphJSON, !renderGraphJSON.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            overlayNodes = []
            summary = .screenOnly
            return
        }

        guard let renderNodes = Self.parseRenderGraph(renderGraphJSON) else {
            overlayNodes = []
            summary = BroadcastSceneCompositionSummary(
                appliedCount: 0,
                skippedCount: 0,
                skippedKinds: [],
                parseFailed: true
            )
            return
        }

        let primaryScreenOrder = renderNodes
            .filter { $0.kind == "screen" }
            .map(\.order)
            .min()
        let underlays = renderNodes.filter { node in
            node.kind != "screen" && primaryScreenOrder.map { node.order <= $0 } == true
        }
        let overlays = renderNodes
            .filter { node in
                node.kind != "screen" && (primaryScreenOrder == nil || node.order > primaryScreenOrder!)
            }
            .sorted { $0.order < $1.order }
        let supportedKinds: Set<String> = ["pngtuber", "text", "solid", "image"]
        let supportedOverlays = overlays.filter { supportedKinds.contains($0.kind) }
        let skippedNodes = underlays + overlays.filter { !supportedKinds.contains($0.kind) }

        overlayNodes = supportedOverlays
        summary = BroadcastSceneCompositionSummary(
            appliedCount: supportedOverlays.count,
            skippedCount: skippedNodes.count,
            skippedKinds: Array(Set(skippedNodes.map(\.kind))).sorted(),
            parseFailed: false
        )
    }

    func compose(_ sampleBuffer: CMSampleBuffer) -> CMSampleBuffer {
        guard !overlayNodes.isEmpty, let inputPixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            return sampleBuffer
        }
        guard let outputPixelBuffer = Self.makePixelBuffer(width: targetWidth, height: targetHeight) else {
            return sampleBuffer
        }

        renderInput(inputPixelBuffer, to: outputPixelBuffer)
        guard drawOverlays(to: outputPixelBuffer) else {
            return sampleBuffer
        }
        return Self.makeSampleBuffer(pixelBuffer: outputPixelBuffer, sourceSampleBuffer: sampleBuffer) ?? sampleBuffer
    }

    private func renderInput(_ inputPixelBuffer: CVPixelBuffer, to outputPixelBuffer: CVPixelBuffer) {
        let sourceImage = CIImage(cvPixelBuffer: inputPixelBuffer)
        let sourceExtent = sourceImage.extent
        let xScale = CGFloat(targetWidth) / max(sourceExtent.width, 1)
        let yScale = CGFloat(targetHeight) / max(sourceExtent.height, 1)
        let scaledImage = sourceImage.transformed(by: CGAffineTransform(scaleX: xScale, y: yScale))
        ciContext.render(
            scaledImage,
            to: outputPixelBuffer,
            bounds: CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight),
            colorSpace: CGColorSpaceCreateDeviceRGB()
        )
    }

    private func drawOverlays(to pixelBuffer: CVPixelBuffer) -> Bool {
        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        defer {
            CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
        }

        guard
            let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer),
            let context = CGContext(
                data: baseAddress,
                width: targetWidth,
                height: targetHeight,
                bitsPerComponent: 8,
                bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue
            )
        else {
            return false
        }

        context.translateBy(x: 0, y: CGFloat(targetHeight))
        context.scaleBy(x: 1, y: -1)
        let canvasSize = CGSize(width: targetWidth, height: targetHeight)
        overlayNodes.forEach { draw($0, in: context, canvasSize: canvasSize) }
        return true
    }

    private func draw(_ node: BroadcastRenderNode, in context: CGContext, canvasSize: CGSize) {
        let rect = rect(for: node, canvasSize: canvasSize)
        guard rect.width > 0, rect.height > 0, node.transform.opacity > 0 else {
            return
        }

        context.saveGState()
        context.setAlpha(node.transform.opacity)
        context.translateBy(x: rect.midX, y: rect.midY)
        context.rotate(by: rotation(for: node) * .pi / 180)
        let localRect = CGRect(x: -rect.width / 2, y: -rect.height / 2, width: rect.width, height: rect.height)

        switch node.kind {
        case "pngtuber":
            drawPngTuber(node, in: context, rect: localRect)
        case "text":
            drawText(node, in: context, rect: localRect)
        case "solid":
            drawSolid(node, in: context, rect: localRect)
        case "image":
            drawImage(node, in: context, rect: localRect)
        default:
            break
        }

        context.restoreGState()
    }

    private func rect(for node: BroadcastRenderNode, canvasSize: CGSize) -> CGRect {
        let transform = node.transform
        let isPngTuber = node.kind == "pngtuber"
        let motion = isPngTuber ? pngTuberMotion(for: node) : BroadcastPngTuberMotion()
        let scaledWidth = min(max(transform.width * motion.scaleX, 0.01), 1)
        let scaledHeight = min(max(transform.height * motion.scaleY, 0.01), 1)
        let centeredX = transform.x + motion.offsetX + (transform.width - scaledWidth) * 0.5
        let centeredY = transform.y + motion.offsetY + (transform.height - scaledHeight) * 0.5

        return CGRect(
            x: min(max(centeredX, 0), 1) * canvasSize.width,
            y: min(max(centeredY, 0), 1) * canvasSize.height,
            width: scaledWidth * canvasSize.width,
            height: scaledHeight * canvasSize.height
        )
    }

    private func rotation(for node: BroadcastRenderNode) -> CGFloat {
        let transformRotation = node.transform.rotation
        guard node.kind == "pngtuber" else {
            return transformRotation
        }
        return min(max(transformRotation + pngTuberMotion(for: node).rotation, -180), 180)
    }

    private func pngTuberMotion(for node: BroadcastRenderNode) -> BroadcastPngTuberMotion {
        let headYaw = min(max(node.payload.cgFloatValue("headYaw"), -1), 1)
        let headPitch = min(max(node.payload.cgFloatValue("headPitch"), -1), 1)
        let headRoll = min(max(node.payload.cgFloatValue("headRoll"), -1), 1)
        let bodyLean = min(max(node.payload.cgFloatValue("bodyLean"), -1), 1)
        let breathing = min(max(node.payload.cgFloatValue("breathing"), -1), 1)
        let bodyBounce = min(max(node.payload.cgFloatValue("bodyBounce"), -1), 1)
        return BroadcastPngTuberMotion(
            offsetX: min(max(node.payload.cgFloatValue("headX"), -1), 1) * 0.025,
            offsetY: (min(max(node.payload.cgFloatValue("headY"), -1), 1) + breathing - bodyBounce) * 0.025,
            rotation: bodyLean * 10 + headRoll * 10 + headYaw * 4,
            scaleX: min(max(1 - abs(headYaw) * 0.08, 0.88), 1.02),
            scaleY: min(max(1 - abs(headPitch) * 0.04 + breathing * 0.5, 0.9), 1.04)
        )
    }

    private func drawPngTuber(_ node: BroadcastRenderNode, in context: CGContext, rect: CGRect) {
        if let image = image(for: node.payload.stringValue("imageUri")) {
            UIGraphicsPushContext(context)
            image.draw(in: rect)
            UIGraphicsPopContext()
            return
        }

        let expression = node.payload.stringValue("expression", fallback: "neutral")
        let mouthOpen = min(max(node.payload.cgFloatValue("mouthOpen"), 0), 1)
        let blink = min(max(node.payload.cgFloatValue("blink"), 0), 1)
        let bodyColor: UIColor
        switch expression {
        case "happy":
            bodyColor = UIColor(red: 34 / 255, green: 197 / 255, blue: 94 / 255, alpha: 1)
        case "angry":
            bodyColor = UIColor(red: 251 / 255, green: 113 / 255, blue: 133 / 255, alpha: 1)
        case "surprised":
            bodyColor = UIColor(red: 56 / 255, green: 189 / 255, blue: 248 / 255, alpha: 1)
        default:
            bodyColor = UIColor(red: 139 / 255, green: 92 / 255, blue: 246 / 255, alpha: 1)
        }

        let bodyRect = mapBlueprintRect(CGRect(x: 190, y: 540, width: 340, height: 360), into: rect)
        context.setFillColor(UIColor(red: 45 / 255, green: 212 / 255, blue: 191 / 255, alpha: 0.92).cgColor)
        context.addPath(CGPath(roundedRect: bodyRect, cornerWidth: bodyRect.width * 0.4, cornerHeight: bodyRect.height * 0.32, transform: nil))
        context.fillPath()

        let headRect = mapBlueprintRect(CGRect(x: 135, y: 135, width: 450, height: 475), into: rect)
        context.setFillColor(bodyColor.cgColor)
        context.addPath(CGPath(ellipseIn: headRect, transform: nil))
        context.fillPath()
        context.setStrokeColor(UIColor(white: 0.98, alpha: 0.86).cgColor)
        context.setLineWidth(max(rect.width, rect.height) * 0.012)
        context.addPath(CGPath(ellipseIn: headRect, transform: nil))
        context.strokePath()

        context.setFillColor(UIColor(white: 0.98, alpha: 1).cgColor)
        let eyeHeight = max(42 * (1 - blink), 5)
        context.addPath(CGPath(ellipseIn: mapBlueprintRect(CGRect(x: 255, y: 330, width: 50, height: eyeHeight), into: rect), transform: nil))
        context.fillPath()
        context.addPath(CGPath(ellipseIn: mapBlueprintRect(CGRect(x: 415, y: 330, width: 50, height: eyeHeight), into: rect), transform: nil))
        context.fillPath()

        context.setFillColor(UIColor(red: 24 / 255, green: 24 / 255, blue: 31 / 255, alpha: 1).cgColor)
        let mouthHeight = 18 + mouthOpen * 86
        context.addPath(CGPath(ellipseIn: mapBlueprintRect(CGRect(x: 320, y: 442, width: 80, height: mouthHeight), into: rect), transform: nil))
        context.fillPath()

        UIGraphicsPushContext(context)
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.alignment = .center
        NSString(string: "PNGTuber").draw(
            in: mapBlueprintRect(CGRect(x: 0, y: 892, width: 720, height: 60), into: rect),
            withAttributes: [
                .font: UIFont.systemFont(ofSize: max(10, rect.height * 0.045), weight: .semibold),
                .foregroundColor: UIColor(white: 0.98, alpha: 0.82),
                .paragraphStyle: paragraphStyle
            ]
        )
        UIGraphicsPopContext()
    }

    private func drawText(_ node: BroadcastRenderNode, in context: CGContext, rect: CGRect) {
        let text = node.payload.stringValue("text").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            return
        }
        UIGraphicsPushContext(context)
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.alignment = .left
        paragraphStyle.lineBreakMode = .byTruncatingTail
        NSString(string: String(text.prefix(240))).draw(
            in: rect,
            withAttributes: [
                .font: UIFont.systemFont(
                    ofSize: min(max(node.payload.cgFloatValue("fontSize", fallback: 36), 8), 220),
                    weight: .semibold
                ),
                .foregroundColor: Self.color(node.payload.stringValue("color"), fallback: .white),
                .paragraphStyle: paragraphStyle
            ]
        )
        UIGraphicsPopContext()
    }

    private func drawSolid(_ node: BroadcastRenderNode, in context: CGContext, rect: CGRect) {
        context.setFillColor(Self.color(node.payload.stringValue("color"), fallback: .clear).cgColor)
        context.fill(rect)
    }

    private func drawImage(_ node: BroadcastRenderNode, in context: CGContext, rect: CGRect) {
        guard let image = image(for: node.payload.stringValue("uri")) else {
            return
        }
        UIGraphicsPushContext(context)
        image.draw(in: rect)
        UIGraphicsPopContext()
    }

    private func image(for rawURI: String) -> UIImage? {
        let trimmedURI = rawURI.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedURI.isEmpty else {
            return nil
        }
        if let cachedImage = cachedImages[trimmedURI] {
            return cachedImage
        }

        let image: UIImage?
        if let url = URL(string: trimmedURI), url.isFileURL {
            image = UIImage(contentsOfFile: url.path)
        } else if trimmedURI.hasPrefix("/") {
            image = UIImage(contentsOfFile: trimmedURI)
        } else {
            image = nil
        }

        if let image {
            cachedImages[trimmedURI] = image
        }
        return image
    }

    private func mapBlueprintRect(_ blueprintRect: CGRect, into targetRect: CGRect) -> CGRect {
        CGRect(
            x: targetRect.minX + (blueprintRect.minX / 720) * targetRect.width,
            y: targetRect.minY + (blueprintRect.minY / 960) * targetRect.height,
            width: (blueprintRect.width / 720) * targetRect.width,
            height: (blueprintRect.height / 960) * targetRect.height
        )
    }

    private static func parseRenderGraph(_ renderGraphJSON: String) -> [BroadcastRenderNode]? {
        guard let data = renderGraphJSON.data(using: .utf8) else {
            return nil
        }
        do {
            guard let root = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                return nil
            }
            return root.enumerated().map { index, rawNode in
                BroadcastRenderNode(
                    id: (rawNode["id"] as? String) ?? "node-\(index)",
                    kind: (rawNode["kind"] as? String) ?? "unknown",
                    order: (rawNode["order"] as? NSNumber)?.intValue ?? index,
                    transform: BroadcastRenderTransform(dictionary: rawNode["transform"] as? [String: Any]),
                    payload: rawNode["payload"] as? [String: Any] ?? [:]
                )
            }
        } catch {
            return nil
        }
    }

    private static func makePixelBuffer(width: Int, height: Int) -> CVPixelBuffer? {
        let attributes: [CFString: Any] = [
            kCVPixelBufferCGImageCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true,
            kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary
        ]
        var pixelBuffer: CVPixelBuffer?
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault,
            width,
            height,
            kCVPixelFormatType_32BGRA,
            attributes as CFDictionary,
            &pixelBuffer
        )
        guard status == noErr else {
            return nil
        }
        return pixelBuffer
    }

    private static func makeSampleBuffer(
        pixelBuffer: CVPixelBuffer,
        sourceSampleBuffer: CMSampleBuffer
    ) -> CMSampleBuffer? {
        var formatDescription: CMVideoFormatDescription?
        let formatStatus = CMVideoFormatDescriptionCreateForImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescriptionOut: &formatDescription
        )
        guard formatStatus == noErr, let formatDescription else {
            return nil
        }

        var timing = CMSampleTimingInfo(
            duration: CMSampleBufferGetDuration(sourceSampleBuffer),
            presentationTimeStamp: CMSampleBufferGetPresentationTimeStamp(sourceSampleBuffer),
            decodeTimeStamp: CMSampleBufferGetDecodeTimeStamp(sourceSampleBuffer)
        )
        var outputSampleBuffer: CMSampleBuffer?
        let sampleStatus = CMSampleBufferCreateReadyWithImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescription: formatDescription,
            sampleTiming: &timing,
            sampleBufferOut: &outputSampleBuffer
        )
        guard sampleStatus == noErr else {
            return nil
        }
        return outputSampleBuffer
    }

    private static func color(_ rawValue: String, fallback: UIColor) -> UIColor {
        var hex = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        if hex.hasPrefix("#") {
            hex.removeFirst()
        }
        guard hex.count == 6 || hex.count == 8, let intValue = UInt64(hex, radix: 16) else {
            return fallback
        }

        if hex.count == 8 {
            let red = CGFloat((intValue >> 24) & 0xff) / 255
            let green = CGFloat((intValue >> 16) & 0xff) / 255
            let blue = CGFloat((intValue >> 8) & 0xff) / 255
            let alpha = CGFloat(intValue & 0xff) / 255
            return UIColor(red: red, green: green, blue: blue, alpha: alpha)
        }

        let red = CGFloat((intValue >> 16) & 0xff) / 255
        let green = CGFloat((intValue >> 8) & 0xff) / 255
        let blue = CGFloat(intValue & 0xff) / 255
        return UIColor(red: red, green: green, blue: blue, alpha: 1)
    }
}

final class BroadcastUploadPipeline {
    private let logger = Logger(subsystem: "MobileLiveCaster", category: "BroadcastUpload")
    private(set) var state: BroadcastUploadState = .idle
    private(set) var configuration: BroadcastUploadConfiguration?
    private(set) var stats = BroadcastUploadStats()
    private var videoEncoder: BroadcastVideoEncoder?
    private var audioEncoder: BroadcastAudioEncoder?
    private var publisher: BroadcastRTMPPublisher?
    private var sceneCompositor: BroadcastSceneCompositor?

    var isRunning: Bool {
        state.acceptsSamples
    }

    var snapshot: BroadcastUploadSnapshot {
        BroadcastUploadSnapshot(
            state: state,
            destinationName: configuration?.destinationName,
            transportScheme: configuration?.transportScheme,
            usesSecureTransport: configuration?.usesSecureTransport ?? false,
            videoSize: configuration.map { CGSize(width: $0.width, height: $0.height) },
            fps: configuration?.fps,
            videoBitrateKbps: configuration?.videoBitrateKbps,
            audioBitrateKbps: configuration?.audioBitrateKbps,
            stats: stats,
            videoEncoderStats: videoEncoder?.stats,
            audioEncoderStats: audioEncoder?.stats,
            publisherStats: publisher?.stats
        )
    }

    func start(setupInfo: [String: NSObject]) -> Result<Void, Error> {
        state = .starting
        let effectiveSetupInfo = BroadcastSharedStore.loadConfigurationSetupInfo()?.merging(setupInfo) { _, explicitValue in
            explicitValue
        } ?? setupInfo

        do {
            let nextConfiguration = try BroadcastUploadConfiguration(setupInfo: effectiveSetupInfo)
            let nextPublisher = try BroadcastRTMPPublisher(configuration: nextConfiguration)
            let nextVideoEncoder = try BroadcastVideoEncoder(configuration: nextConfiguration) { encodedFrame in
                nextPublisher.publishVideoFrame(encodedFrame)
            }
            let nextAudioEncoder = BroadcastAudioEncoder(configuration: nextConfiguration) { encodedFrame in
                nextPublisher.publishAudioFrame(encodedFrame)
            }
            let nextSceneCompositor = BroadcastSceneCompositor(configuration: nextConfiguration)
            configuration = nextConfiguration
            publisher = nextPublisher
            videoEncoder = nextVideoEncoder
            audioEncoder = nextAudioEncoder
            sceneCompositor = nextSceneCompositor
            stats.start()
            state = .running
            nextPublisher.start()
            logger.info(
                "Broadcast upload started destination=\(nextConfiguration.destinationName, privacy: .public) scheme=\(nextConfiguration.transportScheme, privacy: .public) size=\(nextConfiguration.width)x\(nextConfiguration.height) fps=\(nextConfiguration.fps) composition=\(nextSceneCompositor.summary.message, privacy: .public)"
            )
            saveRuntimeState()
            return .success(())
        } catch {
            let message = sanitizeError(error.localizedDescription)
            publisher?.stop()
            publisher = nil
            audioEncoder?.finish()
            audioEncoder = nil
            videoEncoder?.finish()
            videoEncoder = nil
            sceneCompositor = nil
            configuration = nil
            state = .failed(message)
            logger.error("Broadcast upload failed to start: \(message, privacy: .public)")
            saveRuntimeState()
            return .failure(error)
        }
    }

    func pause() {
        guard state == .running else {
            return
        }

        state = .paused
        logger.info("Broadcast upload paused")
        saveRuntimeState()
    }

    func resume() {
        guard state == .paused else {
            return
        }

        state = .running
        logger.info("Broadcast upload resumed")
        saveRuntimeState()
    }

    func stop() {
        guard state != .idle && state != .stopped else {
            return
        }

        stats.stop()
        videoEncoder?.finish()
        videoEncoder = nil
        audioEncoder?.finish()
        audioEncoder = nil
        sceneCompositor = nil
        publisher?.stop()
        publisher = nil
        state = .stopped
        logger.info("Broadcast upload stopped frames=\(self.stats.videoFrames) dropped=\(self.stats.droppedSamples)")
        saveRuntimeState()
    }

    func consumeVideo(_ sampleBuffer: CMSampleBuffer) {
        guard state.acceptsSamples else {
            stats.dropSample()
            return
        }

        stats.recordVideo(sampleBuffer)
        let sampleForEncoding = sceneCompositor?.compose(sampleBuffer) ?? sampleBuffer
        do {
            try videoEncoder?.encode(sampleForEncoding)
        } catch let error as BroadcastVideoEncoderError {
            stats.recordVideoEncodeFailure(error)
            logger.error("Video encode failed: \(error.localizedDescription, privacy: .public)")
        } catch {
            stats.recordVideoEncodeFailure(.encodeFailed(-1))
            logger.error("Video encode failed: \(error.localizedDescription, privacy: .public)")
        }
        if stats.videoFrames == 1 || stats.videoFrames % max(configuration?.fps ?? 30, 1) == 0 {
            saveRuntimeState()
        }
    }

    func consumeAppAudio(_ sampleBuffer: CMSampleBuffer) {
        guard state.acceptsSamples else {
            stats.dropSample()
            return
        }

        stats.recordAppAudio(sampleBuffer)
        encodeAudio(sampleBuffer, source: .app)
    }

    func consumeMicrophone(_ sampleBuffer: CMSampleBuffer) {
        guard state.acceptsSamples else {
            stats.dropSample()
            return
        }

        stats.recordMicrophone(sampleBuffer)
        encodeAudio(sampleBuffer, source: .microphone)
    }

    func dropUnknownSample() {
        stats.dropUnknownSample()
        saveRuntimeState()
    }

    private func saveRuntimeState() {
        BroadcastSharedStore.saveRuntimeState(
            state: state,
            configuration: configuration,
            stats: stats,
            videoEncoderStats: videoEncoder?.stats,
            audioEncoderStats: audioEncoder?.stats,
            publisherStats: publisher?.stats,
            sceneCompositionSummary: sceneCompositor?.summary
        )
    }

    private func sanitizeError(_ message: String) -> String {
        Self.redactSensitiveText(message, configuration: configuration)
    }

    private static func redactSensitiveText(_ value: String, configuration: BroadcastUploadConfiguration?) -> String {
        guard !value.isEmpty else {
            return value
        }

        let streamName = configuration?.publishURL.path.split(separator: "/").last.map(String.init) ?? ""
        let publishURL = configuration?.publishURL.absoluteString ?? ""
        let secrets = [publishURL, streamName].filter { $0.count >= 4 }
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

    private func encodeAudio(_ sampleBuffer: CMSampleBuffer, source: BroadcastAudioSource) {
        do {
            try audioEncoder?.encode(sampleBuffer, source: source)
        } catch let error as BroadcastAudioEncoderError {
            stats.recordAudioEncodeFailure(error)
            logger.error("Audio encode failed source=\(source.rawValue, privacy: .public): \(error.localizedDescription, privacy: .public)")
        } catch {
            stats.recordAudioEncodeFailure(.encodeFailed(-1))
            logger.error("Audio encode failed source=\(source.rawValue, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }

        let audioBuffers = stats.appAudioBuffers + stats.microphoneBuffers
        if audioBuffers == 1 || audioBuffers % 50 == 0 {
            saveRuntimeState()
        }
    }
}

private extension Dictionary where Key == String, Value == Any {
    func stringValue(_ key: String, fallback: String = "") -> String {
        if let stringValue = self[key] as? String {
            return stringValue
        }
        if let numberValue = self[key] as? NSNumber {
            return numberValue.stringValue
        }
        return fallback
    }

    func cgFloatValue(_ key: String, fallback: CGFloat = 0) -> CGFloat {
        if let numberValue = self[key] as? NSNumber {
            return CGFloat(truncating: numberValue)
        }
        if let stringValue = self[key] as? String, let doubleValue = Double(stringValue) {
            return CGFloat(doubleValue)
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

private extension NSLock {
    func performLocked<T>(_ body: () -> T) -> T {
        lock()
        defer { unlock() }
        return body()
    }
}

private struct RTMPAMF0Reader {
    private let data: Data
    private var offset = 0

    init(data: Data) {
        self.data = data
    }

    mutating func readAll() -> [RTMPAMF0Value] {
        var values: [RTMPAMF0Value] = []
        while offset < data.count {
            values.append(readValue())
        }
        return values
    }

    private mutating func readValue() -> RTMPAMF0Value {
        guard let marker = readByte() else {
            return .unsupported
        }

        switch marker {
        case 0x00:
            return readDouble().map(RTMPAMF0Value.number) ?? .unsupported
        case 0x01:
            return .bool((readByte() ?? 0) != 0)
        case 0x02:
            return readString().map(RTMPAMF0Value.string) ?? .unsupported
        case 0x03:
            return .object(readObject())
        case 0x05, 0x06:
            return .null
        default:
            return .unsupported
        }
    }

    private mutating func readObject() -> [String: RTMPAMF0Value] {
        var object: [String: RTMPAMF0Value] = [:]
        while offset + 3 <= data.count {
            if data[offset] == 0, data[offset + 1] == 0, data[offset + 2] == 0x09 {
                offset += 3
                break
            }
            guard let key = readObjectKey() else {
                break
            }
            object[key] = readValue()
        }
        return object
    }

    private mutating func readObjectKey() -> String? {
        guard offset + 2 <= data.count else {
            return nil
        }
        let length = Int(data.readUInt16BE(at: offset))
        offset += 2
        guard offset + length <= data.count else {
            return nil
        }
        defer { offset += length }
        return String(data: data[offset..<(offset + length)], encoding: .utf8)
    }

    private mutating func readString() -> String? {
        guard offset + 2 <= data.count else {
            return nil
        }
        let length = Int(data.readUInt16BE(at: offset))
        offset += 2
        guard offset + length <= data.count else {
            return nil
        }
        defer { offset += length }
        return String(data: data[offset..<(offset + length)], encoding: .utf8)
    }

    private mutating func readDouble() -> Double? {
        guard offset + 8 <= data.count else {
            return nil
        }
        var bits: UInt64 = 0
        for byte in data[offset..<(offset + 8)] {
            bits = (bits << 8) | UInt64(byte)
        }
        offset += 8
        return Double(bitPattern: bits)
    }

    private mutating func readByte() -> UInt8? {
        guard offset < data.count else {
            return nil
        }
        defer { offset += 1 }
        return data[offset]
    }
}

private extension Data {
    mutating func appendUInt16BE(_ value: UInt16) {
        append(UInt8((value >> 8) & 0xff))
        append(UInt8(value & 0xff))
    }

    mutating func appendUInt24BE(_ value: UInt32) {
        append(UInt8((value >> 16) & 0xff))
        append(UInt8((value >> 8) & 0xff))
        append(UInt8(value & 0xff))
    }

    mutating func appendUInt32BE(_ value: UInt32) {
        append(UInt8((value >> 24) & 0xff))
        append(UInt8((value >> 16) & 0xff))
        append(UInt8((value >> 8) & 0xff))
        append(UInt8(value & 0xff))
    }

    mutating func appendUInt32LE(_ value: UInt32) {
        append(UInt8(value & 0xff))
        append(UInt8((value >> 8) & 0xff))
        append(UInt8((value >> 16) & 0xff))
        append(UInt8((value >> 24) & 0xff))
    }

    mutating func appendDoubleBE(_ value: Double) {
        let bits = value.bitPattern
        append(UInt8((bits >> 56) & 0xff))
        append(UInt8((bits >> 48) & 0xff))
        append(UInt8((bits >> 40) & 0xff))
        append(UInt8((bits >> 32) & 0xff))
        append(UInt8((bits >> 24) & 0xff))
        append(UInt8((bits >> 16) & 0xff))
        append(UInt8((bits >> 8) & 0xff))
        append(UInt8(bits & 0xff))
    }

    mutating func appendAMF0(_ value: RTMPAMF0Value) {
        switch value {
        case .number(let number):
            append(0x00)
            appendDoubleBE(number)
        case .bool(let bool):
            append(0x01)
            append(bool ? 1 : 0)
        case .string(let string):
            append(0x02)
            appendAMF0StringBody(string)
        case .object(let object):
            append(0x03)
            object.keys.sorted().forEach { key in
                appendAMF0StringBody(key)
                appendAMF0(object[key] ?? .null)
            }
            append(contentsOf: [0x00, 0x00, 0x09])
        case .null:
            append(0x05)
        case .unsupported:
            append(0x05)
        }
    }

    mutating func appendAMF0StringBody(_ string: String) {
        let bytes = Array(string.utf8)
        appendUInt16BE(UInt16(Swift.min(bytes.count, Int(UInt16.max))))
        append(contentsOf: bytes.prefix(Int(UInt16.max)))
    }

    func readUInt16BE(at offset: Int) -> UInt16 {
        guard offset + 1 < count else {
            return 0
        }
        return (UInt16(self[offset]) << 8) | UInt16(self[offset + 1])
    }

    func readUInt24BE(at offset: Int) -> UInt32 {
        guard offset + 2 < count else {
            return 0
        }
        return (UInt32(self[offset]) << 16) | (UInt32(self[offset + 1]) << 8) | UInt32(self[offset + 2])
    }

    func readUInt32BE(at offset: Int) -> UInt32 {
        guard offset + 3 < count else {
            return 0
        }
        return (UInt32(self[offset]) << 24)
            | (UInt32(self[offset + 1]) << 16)
            | (UInt32(self[offset + 2]) << 8)
            | UInt32(self[offset + 3])
    }

    func readUInt32LE(at offset: Int) -> UInt32 {
        guard offset + 3 < count else {
            return 0
        }
        return UInt32(self[offset])
            | (UInt32(self[offset + 1]) << 8)
            | (UInt32(self[offset + 2]) << 16)
            | (UInt32(self[offset + 3]) << 24)
    }
}
