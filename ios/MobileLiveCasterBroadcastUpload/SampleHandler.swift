import CoreMedia
import Foundation
import os
import ReplayKit

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
}

final class BroadcastUploadPipeline {
    private let logger = Logger(subsystem: "MobileLiveCaster", category: "BroadcastUpload")
    private(set) var state: BroadcastUploadState = .idle
    private(set) var configuration: BroadcastUploadConfiguration?
    private(set) var stats = BroadcastUploadStats()

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
            stats: stats
        )
    }

    func start(setupInfo: [String: NSObject]) -> Result<Void, Error> {
        state = .starting

        do {
            let nextConfiguration = try BroadcastUploadConfiguration(setupInfo: setupInfo)
            configuration = nextConfiguration
            stats.start()
            state = .running
            logger.info(
                "Broadcast upload started destination=\(nextConfiguration.destinationName, privacy: .public) scheme=\(nextConfiguration.transportScheme, privacy: .public) size=\(nextConfiguration.width)x\(nextConfiguration.height) fps=\(nextConfiguration.fps)"
            )
            return .success(())
        } catch {
            configuration = nil
            state = .failed(error.localizedDescription)
            logger.error("Broadcast upload failed to start: \(error.localizedDescription, privacy: .public)")
            return .failure(error)
        }
    }

    func pause() {
        guard state == .running else {
            return
        }

        state = .paused
        logger.info("Broadcast upload paused")
    }

    func resume() {
        guard state == .paused else {
            return
        }

        state = .running
        logger.info("Broadcast upload resumed")
    }

    func stop() {
        guard state != .idle && state != .stopped else {
            return
        }

        stats.stop()
        state = .stopped
        logger.info("Broadcast upload stopped frames=\(self.stats.videoFrames) dropped=\(self.stats.droppedSamples)")
    }

    func consumeVideo(_ sampleBuffer: CMSampleBuffer) {
        guard state.acceptsSamples else {
            stats.dropSample()
            return
        }

        stats.recordVideo(sampleBuffer)
    }

    func consumeAppAudio(_ sampleBuffer: CMSampleBuffer) {
        guard state.acceptsSamples else {
            stats.dropSample()
            return
        }

        stats.recordAppAudio(sampleBuffer)
    }

    func consumeMicrophone(_ sampleBuffer: CMSampleBuffer) {
        guard state.acceptsSamples else {
            stats.dropSample()
            return
        }

        stats.recordMicrophone(sampleBuffer)
    }

    func dropUnknownSample() {
        stats.dropUnknownSample()
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
