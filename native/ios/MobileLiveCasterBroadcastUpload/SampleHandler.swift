import ReplayKit

final class SampleHandler: RPBroadcastSampleHandler {
    private let pipeline = BroadcastUploadPipeline()

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        pipeline.start(setupInfo: setupInfo ?? [:])
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
            break
        }
    }
}

final class BroadcastUploadPipeline {
    private(set) var isRunning = false

    func start(setupInfo: [String: NSObject]) {
        isRunning = true
        // TODO: Decode scene/profile from shared app group storage, initialize compositor,
        // VideoToolbox encoder, and RTMP/RTMPS publisher.
    }

    func pause() {
        // TODO: Pause outgoing publish while keeping ReplayKit session state valid.
    }

    func resume() {
        // TODO: Resume encoder and publisher.
    }

    func stop() {
        isRunning = false
        // TODO: Flush encoder and close network publisher.
    }

    func consumeVideo(_ sampleBuffer: CMSampleBuffer) {
        guard isRunning else {
            return
        }
        // TODO: Composite screen frame with PNGTuber/Live2D render output.
    }

    func consumeAppAudio(_ sampleBuffer: CMSampleBuffer) {
        guard isRunning else {
            return
        }
        // TODO: Mix app audio when available and policy-compliant.
    }

    func consumeMicrophone(_ sampleBuffer: CMSampleBuffer) {
        guard isRunning else {
            return
        }
        // TODO: Feed lip-sync meter and audio encoder.
    }
}
