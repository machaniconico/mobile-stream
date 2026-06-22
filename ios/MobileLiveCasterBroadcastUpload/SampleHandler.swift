import AudioToolbox
import CoreMedia
import Foundation
import Network
import os
import ReplayKit
import VideoToolbox

private let broadcastAppGroup = "group.org.reactjs.native.example.MobileLiveCaster"
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

        if let placeholderRange = normalizedServerURL.range(of: "{stream_key}", options: [.caseInsensitive]) {
            return normalizedServerURL.replacingCharacters(in: placeholderRange, with: normalizedStreamKey)
        }

        if normalizedServerURL.hasSuffix("/\(normalizedStreamKey)") {
            return normalizedServerURL
        }

        return "\(normalizedServerURL)/\(normalizedStreamKey)"
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
        publisherStats: BroadcastRTMPPublisherStats?
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

enum BroadcastAudioSource: String, Equatable {
    case app
    case microphone
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
    private let target: RTMPPublishTarget
    private let queue = DispatchQueue(label: "MobileLiveCaster.broadcast.rtmp.publisher")
    private let callbackQueue = DispatchQueue(label: "MobileLiveCaster.broadcast.rtmp.network")
    private let statsLock = NSLock()
    private var currentStats = BroadcastRTMPPublisherStats()
    private var connection: NWConnection?
    private var stopped = false
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
    }

    func start() {
        queue.async { [weak self] in
            self?.connectAndPublish()
        }
    }

    func stop() {
        queue.async { [weak self] in
            guard let self else {
                return
            }
            stopped = true
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

    private func connectAndPublish() {
        do {
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
                self.currentStats.recordPublishedStream(streamId)
            }
        } catch {
            statsLock.performLocked {
                self.currentStats.fail(error.localizedDescription)
            }
            connection?.cancel()
            connection = nil
        }
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
        nextConnection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                semaphore.signal()
            case .failed(let error):
                connectedError = error
                semaphore.signal()
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
            statsLock.performLocked {
                self.currentStats.fail(error.localizedDescription)
            }
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
            statsLock.performLocked {
                self.currentStats.fail(error.localizedDescription)
            }
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
    private var currentStats = BroadcastAudioEncoderStats()

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
        converter = nil
        inputSignature = nil
        audioSpecificConfig = Data()
    }

    private func encodeLocked(_ sampleBuffer: CMSampleBuffer, source: BroadcastAudioSource) throws {
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
        guard !inputData.isEmpty else {
            return
        }

        let inputPacketCount = UInt32(max(CMSampleBufferGetNumSamples(sampleBuffer), 0))
        guard inputPacketCount > 0 else {
            return
        }

        let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let duration = CMSampleBufferGetDuration(sampleBuffer)
        let frames = try encodeInputData(
            inputData,
            source: source,
            converter: converter,
            inputPacketCount: inputPacketCount,
            inputChannelCount: inputFormat.mChannelsPerFrame,
            presentationTimeSeconds: presentationTime.isValid ? CMTimeGetSeconds(presentationTime) : 0,
            durationSeconds: duration.isValid && duration.isNumeric ? CMTimeGetSeconds(duration) : 0
        )

        frames.forEach { frame in
            statsLock.performLocked {
                self.currentStats.record(frame)
            }
            onEncodedFrame(frame)
        }
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

final class BroadcastUploadPipeline {
    private let logger = Logger(subsystem: "MobileLiveCaster", category: "BroadcastUpload")
    private(set) var state: BroadcastUploadState = .idle
    private(set) var configuration: BroadcastUploadConfiguration?
    private(set) var stats = BroadcastUploadStats()
    private var videoEncoder: BroadcastVideoEncoder?
    private var audioEncoder: BroadcastAudioEncoder?
    private var publisher: BroadcastRTMPPublisher?

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
            configuration = nextConfiguration
            publisher = nextPublisher
            videoEncoder = nextVideoEncoder
            audioEncoder = nextAudioEncoder
            stats.start()
            state = .running
            nextPublisher.start()
            logger.info(
                "Broadcast upload started destination=\(nextConfiguration.destinationName, privacy: .public) scheme=\(nextConfiguration.transportScheme, privacy: .public) size=\(nextConfiguration.width)x\(nextConfiguration.height) fps=\(nextConfiguration.fps)"
            )
            saveRuntimeState()
            return .success(())
        } catch {
            publisher?.stop()
            publisher = nil
            audioEncoder?.finish()
            audioEncoder = nil
            videoEncoder?.finish()
            videoEncoder = nil
            configuration = nil
            state = .failed(error.localizedDescription)
            logger.error("Broadcast upload failed to start: \(error.localizedDescription, privacy: .public)")
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
        do {
            try videoEncoder?.encode(sampleBuffer)
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
            publisherStats: publisher?.stats
        )
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
