import AudioToolbox
import Foundation
import VideoToolbox

struct LiveCasterEncoderPreflightConfiguration {
    let width: Int
    let height: Int
    let fps: Int
    let videoBitrateKbps: Int
    let audioBitrateKbps: Int
}

struct LiveCasterEncoderPreflightResult: Equatable {
    let passed: Bool
    let checkedAt: Double
    let videoConfigured: Bool
    let audioConfigured: Bool
    let hardwareVideoEncoderRequired: Bool
    let hardwareVideoEncoderVerified: Bool
    let failedStage: String
    let status: Int32
    let message: String
}

enum LiveCasterEncoderPreflight {
    private static let audioSampleRate = 44_100.0
    private static let audioChannelCount: UInt32 = 2

    static func inspect(
        _ configuration: LiveCasterEncoderPreflightConfiguration,
        now: () -> Double = { Date().timeIntervalSince1970 * 1_000 }
    ) -> LiveCasterEncoderPreflightResult {
        let checkedAt = now()
        let video = inspectVideo(configuration)
        guard video.configured else {
            return failureResult(
                configuration,
                checkedAt: checkedAt,
                videoConfigured: false,
                audioConfigured: false,
                hardwareVideoEncoderRequired: video.hardwareAccelerationRequired,
                hardwareVideoEncoderVerified: video.hardwareAccelerationVerified,
                failure: video
            )
        }

        let audio = inspectAudio(configuration)
        guard audio.configured else {
            return failureResult(
                configuration,
                checkedAt: checkedAt,
                videoConfigured: true,
                audioConfigured: false,
                hardwareVideoEncoderRequired: video.hardwareAccelerationRequired,
                hardwareVideoEncoderVerified: video.hardwareAccelerationVerified,
                failure: audio
            )
        }

        return LiveCasterEncoderPreflightResult(
            passed: true,
            checkedAt: checkedAt,
            videoConfigured: true,
            audioConfigured: true,
            hardwareVideoEncoderRequired: video.hardwareAccelerationRequired,
            hardwareVideoEncoderVerified: video.hardwareAccelerationVerified,
            failedStage: "",
            status: noErr,
            message: "iOS \(video.hardwareAccelerationVerified ? "hardware " : "")H.264/AAC configuration preflight passed for \(configuration.width)x\(configuration.height)@\(configuration.fps)fps."
        )
    }

    private static func inspectVideo(
        _ configuration: LiveCasterEncoderPreflightConfiguration
    ) -> ProbeStepResult {
        var session: VTCompressionSession?
        let encoderSpecification: CFDictionary?
        let hardwareAccelerationRequired: Bool
        if #available(iOS 17.4, tvOS 17.4, macOS 10.9, *) {
            encoderSpecification = [
                kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder: kCFBooleanTrue as Any
            ] as CFDictionary
            hardwareAccelerationRequired = true
        } else {
            encoderSpecification = nil
            hardwareAccelerationRequired = false
        }
        func videoFailure(stage: String, status: OSStatus) -> ProbeStepResult {
            ProbeStepResult(
                hardwareAccelerationRequired: hardwareAccelerationRequired,
                stage: stage,
                status: status
            )
        }
        let createStatus = VTCompressionSessionCreate(
            allocator: kCFAllocatorDefault,
            width: Int32(configuration.width),
            height: Int32(configuration.height),
            codecType: kCMVideoCodecType_H264,
            encoderSpecification: encoderSpecification,
            imageBufferAttributes: nil,
            compressedDataAllocator: nil,
            outputCallback: preflightVideoOutputCallback,
            refcon: nil,
            compressionSessionOut: &session
        )
        guard createStatus == noErr, let session else {
            return videoFailure(stage: "video-session-create", status: createStatus)
        }
        defer { VTCompressionSessionInvalidate(session) }

        let properties: [(CFString, CFTypeRef, String)] = [
            (kVTCompressionPropertyKey_RealTime, kCFBooleanTrue, "video-realtime"),
            (kVTCompressionPropertyKey_AllowFrameReordering, kCFBooleanFalse, "video-frame-reordering"),
            (kVTCompressionPropertyKey_ProfileLevel, kVTProfileLevel_H264_Baseline_AutoLevel, "video-profile-level"),
            (
                kVTCompressionPropertyKey_AverageBitRate,
                NSNumber(value: configuration.videoBitrateKbps * 1_000),
                "video-bitrate"
            ),
            (kVTCompressionPropertyKey_ExpectedFrameRate, NSNumber(value: configuration.fps), "video-frame-rate"),
            (
                kVTCompressionPropertyKey_MaxKeyFrameInterval,
                NSNumber(value: configuration.fps * 2),
                "video-keyframe-interval"
            )
        ]
        for (key, value, stage) in properties {
            let status = VTSessionSetProperty(session, key: key, value: value)
            guard status == noErr else {
                return videoFailure(stage: stage, status: status)
            }
        }

        let prepareStatus = VTCompressionSessionPrepareToEncodeFrames(session)
        guard prepareStatus == noErr else {
            return videoFailure(stage: "video-prepare", status: prepareStatus)
        }
        var hardwareAccelerationVerified = false
        if #available(iOS 17.4, tvOS 17.4, macOS 10.9, *) {
            let hardwareAcceleration = copyBooleanProperty(
                session,
                key: kVTCompressionPropertyKey_UsingHardwareAcceleratedVideoEncoder
            )
            guard hardwareAcceleration.status == noErr, hardwareAcceleration.value else {
                return videoFailure(
                    stage: "video-hardware-encoder",
                    status: hardwareAcceleration.status == noErr
                        ? kVTVideoEncoderNotAvailableNowErr
                        : hardwareAcceleration.status
                )
            }
            hardwareAccelerationVerified = true
        }
        return ProbeStepResult(
            configured: true,
            hardwareAccelerationRequired: hardwareAccelerationRequired,
            hardwareAccelerationVerified: hardwareAccelerationVerified
        )
    }

    private static func inspectAudio(
        _ configuration: LiveCasterEncoderPreflightConfiguration
    ) -> ProbeStepResult {
        let bytesPerFrame = UInt32(MemoryLayout<Float>.size) * audioChannelCount
        var inputFormat = AudioStreamBasicDescription(
            mSampleRate: audioSampleRate,
            mFormatID: kAudioFormatLinearPCM,
            mFormatFlags: AudioFormatFlags(kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked),
            mBytesPerPacket: bytesPerFrame,
            mFramesPerPacket: 1,
            mBytesPerFrame: bytesPerFrame,
            mChannelsPerFrame: audioChannelCount,
            mBitsPerChannel: UInt32(MemoryLayout<Float>.size * 8),
            mReserved: 0
        )
        var outputFormat = AudioStreamBasicDescription(
            mSampleRate: audioSampleRate,
            mFormatID: kAudioFormatMPEG4AAC,
            mFormatFlags: 0,
            mBytesPerPacket: 0,
            mFramesPerPacket: 1_024,
            mBytesPerFrame: 0,
            mChannelsPerFrame: audioChannelCount,
            mBitsPerChannel: 0,
            mReserved: 0
        )
        var formatSize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        let formatStatus = AudioFormatGetProperty(
            kAudioFormatProperty_FormatInfo,
            0,
            nil,
            &formatSize,
            &outputFormat
        )
        guard formatStatus == noErr else {
            return ProbeStepResult(stage: "audio-format", status: formatStatus)
        }

        var converter: AudioConverterRef?
        let createStatus = AudioConverterNew(&inputFormat, &outputFormat, &converter)
        guard createStatus == noErr, let converter else {
            return ProbeStepResult(stage: "audio-converter-create", status: createStatus)
        }
        defer { AudioConverterDispose(converter) }

        var bitrate = UInt32(configuration.audioBitrateKbps * 1_000)
        let bitrateStatus = AudioConverterSetProperty(
            converter,
            kAudioConverterEncodeBitRate,
            UInt32(MemoryLayout<UInt32>.size),
            &bitrate
        )
        guard bitrateStatus == noErr else {
            return ProbeStepResult(stage: "audio-bitrate", status: bitrateStatus)
        }

        var primeMethod = UInt32(kConverterPrimeMethod_None)
        let primeStatus = AudioConverterSetProperty(
            converter,
            kAudioConverterPrimeMethod,
            UInt32(MemoryLayout<UInt32>.size),
            &primeMethod
        )
        guard primeStatus == noErr else {
            return ProbeStepResult(stage: "audio-prime-method", status: primeStatus)
        }

        var maximumPacketSize: UInt32 = 0
        var packetSize = UInt32(MemoryLayout<UInt32>.size)
        let packetStatus = AudioConverterGetProperty(
            converter,
            kAudioConverterPropertyMaximumOutputPacketSize,
            &packetSize,
            &maximumPacketSize
        )
        guard packetStatus == noErr, maximumPacketSize > 0 else {
            return ProbeStepResult(
                stage: "audio-output-packet-size",
                status: packetStatus == noErr ? kAudio_ParamError : packetStatus
            )
        }
        return ProbeStepResult(configured: true)
    }

    private static func failureResult(
        _ configuration: LiveCasterEncoderPreflightConfiguration,
        checkedAt: Double,
        videoConfigured: Bool,
        audioConfigured: Bool,
        hardwareVideoEncoderRequired: Bool,
        hardwareVideoEncoderVerified: Bool,
        failure: ProbeStepResult
    ) -> LiveCasterEncoderPreflightResult {
        LiveCasterEncoderPreflightResult(
            passed: false,
            checkedAt: checkedAt,
            videoConfigured: videoConfigured,
            audioConfigured: audioConfigured,
            hardwareVideoEncoderRequired: hardwareVideoEncoderRequired,
            hardwareVideoEncoderVerified: hardwareVideoEncoderVerified,
            failedStage: failure.stage,
            status: failure.status,
            message: "iOS encoder configuration preflight failed at \(failure.stage) with status \(failure.status) for \(configuration.width)x\(configuration.height)@\(configuration.fps)fps."
        )
    }

    @available(iOS 17.4, tvOS 17.4, macOS 10.9, *)
    private static func copyBooleanProperty(
        _ session: VTCompressionSession,
        key: CFString
    ) -> (status: OSStatus, value: Bool) {
        var unmanagedValue: Unmanaged<CFTypeRef>?
        let status = withUnsafeMutablePointer(to: &unmanagedValue) { valuePointer in
            VTSessionCopyProperty(
                session,
                key: key,
                allocator: kCFAllocatorDefault,
                valueOut: UnsafeMutableRawPointer(valuePointer)
            )
        }
        guard
            status == noErr,
            let value = unmanagedValue?.takeRetainedValue() as? NSNumber
        else {
            return (status, false)
        }
        return (status, value.boolValue)
    }
}

private struct ProbeStepResult {
    let configured: Bool
    let hardwareAccelerationRequired: Bool
    let hardwareAccelerationVerified: Bool
    let stage: String
    let status: Int32

    init(
        configured: Bool = false,
        hardwareAccelerationRequired: Bool = false,
        hardwareAccelerationVerified: Bool = false,
        stage: String = "",
        status: Int32 = noErr
    ) {
        self.configured = configured
        self.hardwareAccelerationRequired = hardwareAccelerationRequired
        self.hardwareAccelerationVerified = hardwareAccelerationVerified
        self.stage = stage
        self.status = status
    }
}

private let preflightVideoOutputCallback: VTCompressionOutputCallback = { _, _, _, _, _ in }
