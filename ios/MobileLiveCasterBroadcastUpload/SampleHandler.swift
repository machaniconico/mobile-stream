import CoreMedia
import Foundation
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
            "lastVideoEncodeStatus": lastVideoEncodeStatus
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
        videoEncoderStats: BroadcastVideoEncoderStats?
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
    let annexBNALUnits: [Data]
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
            videoEncoderStats: videoEncoder?.stats
        )
    }

    func start(setupInfo: [String: NSObject]) -> Result<Void, Error> {
        state = .starting
        let effectiveSetupInfo = BroadcastSharedStore.loadConfigurationSetupInfo()?.merging(setupInfo) { _, explicitValue in
            explicitValue
        } ?? setupInfo

        do {
            let nextConfiguration = try BroadcastUploadConfiguration(setupInfo: effectiveSetupInfo)
            let nextVideoEncoder = try BroadcastVideoEncoder(configuration: nextConfiguration) { _ in }
            configuration = nextConfiguration
            videoEncoder = nextVideoEncoder
            stats.start()
            state = .running
            logger.info(
                "Broadcast upload started destination=\(nextConfiguration.destinationName, privacy: .public) scheme=\(nextConfiguration.transportScheme, privacy: .public) size=\(nextConfiguration.width)x\(nextConfiguration.height) fps=\(nextConfiguration.fps)"
            )
            saveRuntimeState()
            return .success(())
        } catch {
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
        saveRuntimeState()
    }

    private func saveRuntimeState() {
        BroadcastSharedStore.saveRuntimeState(
            state: state,
            configuration: configuration,
            stats: stats,
            videoEncoderStats: videoEncoder?.stats
        )
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
