import ARKit
import AVFoundation
import Foundation
import React
import Vision

@objc(LiveCasterFaceTracker)
final class LiveCasterFaceTracker: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, ARSessionDelegate {
    private let arSession = ARSession()
    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "MobileLiveCaster.faceTracker.session")
    private let visionQueue = DispatchQueue(label: "MobileLiveCaster.faceTracker.vision")
    private let frameQueue = DispatchQueue(label: "MobileLiveCaster.faceTracker.frame")
    private var configured = false
    private var processingFrame = false
    private var usingARKit = false
    private var latestFrame: [String: Double]?

    override init() {
        super.init()
        arSession.delegate = self
        arSession.delegateQueue = sessionQueue
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        false
    }

    @objc(start:resolver:rejecter:)
    func start(
        _ optionsJson: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            startAuthorized(resolve: resolve, reject: reject)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                guard granted else {
                    reject("camera_permission_denied", "Camera permission is required for face tracking", nil)
                    return
                }
                self?.startAuthorized(resolve: resolve, reject: reject)
            }
        default:
            reject("camera_permission_denied", "Camera permission is required for face tracking", nil)
        }
    }

    @objc(stop:rejecter:)
    func stop(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        sessionQueue.async { [weak self] in
            self?.arSession.pause()
            self?.session.stopRunning()
            self?.usingARKit = false
            self?.setLatestFrame(nil)
            resolve(true)
        }
    }

    @objc(getLatestFrame:rejecter:)
    func getLatestFrame(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        frameQueue.async { [weak self] in
            resolve(self?.latestFrame)
        }
    }

    private func startAuthorized(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        sessionQueue.async { [weak self] in
            guard let self else {
                reject("face_tracker_unavailable", "Face tracker is unavailable", nil)
                return
            }

            do {
                if ARFaceTrackingConfiguration.isSupported {
                    startARKit()
                } else if !configured {
                    try configureSession()
                }
                if !usingARKit && !session.isRunning {
                    session.startRunning()
                }
                resolve(true)
            } catch {
                reject("face_tracker_start_failed", error.localizedDescription, error)
            }
        }
    }

    private func startARKit() {
        let configuration = ARFaceTrackingConfiguration()
        configuration.isLightEstimationEnabled = false
        session.stopRunning()
        arSession.run(configuration, options: [.resetTracking, .removeExistingAnchors])
        usingARKit = true
    }

    private func configureSession() throws {
        session.beginConfiguration()
        session.sessionPreset = .vga640x480

        guard
            let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
                ?? AVCaptureDevice.default(for: .video)
        else {
            session.commitConfiguration()
            throw FaceTrackerError.cameraUnavailable
        }

        let input = try AVCaptureDeviceInput(device: device)
        guard session.canAddInput(input) else {
            session.commitConfiguration()
            throw FaceTrackerError.cameraInputUnavailable
        }
        session.addInput(input)

        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
        ]
        output.setSampleBufferDelegate(self, queue: visionQueue)
        guard session.canAddOutput(output) else {
            session.commitConfiguration()
            throw FaceTrackerError.cameraOutputUnavailable
        }
        session.addOutput(output)
        output.connection(with: .video)?.videoOrientation = .portrait
        output.connection(with: .video)?.isVideoMirrored = true

        configured = true
        session.commitConfiguration()
    }

    func captureOutput(
        _ output: AVCaptureOutput,
        didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        guard !processingFrame else {
            return
        }
        processingFrame = true

        let request = VNDetectFaceLandmarksRequest { [weak self] request, _ in
            defer { self?.processingFrame = false }
            guard let observation = request.results?.compactMap({ $0 as? VNFaceObservation }).first else {
                self?.setLatestFrame(Self.lostFrame())
                return
            }
            self?.setLatestFrame(Self.frame(from: observation))
        }

        let handler = VNImageRequestHandler(cmSampleBuffer: sampleBuffer, orientation: .leftMirrored)
        do {
            try handler.perform([request])
        } catch {
            setLatestFrame(Self.lostFrame())
            processingFrame = false
        }
    }

    func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
        guard usingARKit else {
            return
        }
        guard let faceAnchor = anchors.compactMap({ $0 as? ARFaceAnchor }).first else {
            setLatestFrame(Self.lostFrame())
            return
        }
        setLatestFrame(Self.frame(from: faceAnchor))
    }

    private func setLatestFrame(_ frame: [String: Double]?) {
        frameQueue.async { [weak self] in
            self?.latestFrame = frame
        }
    }

    private static func frame(from anchor: ARFaceAnchor) -> [String: Double] {
        let pose = eulerAngles(from: anchor.transform)
        let leftBlink = blend(anchor, .eyeBlinkLeft)
        let rightBlink = blend(anchor, .eyeBlinkRight)
        let smile = (blend(anchor, .mouthSmileLeft) + blend(anchor, .mouthSmileRight)) * 0.5
        let browRaise = (
            blend(anchor, .browInnerUp) * 0.5
                + blend(anchor, .browOuterUpLeft) * 0.25
                + blend(anchor, .browOuterUpRight) * 0.25
        )
        let mouthOpen = clamp(
            blend(anchor, .jawOpen)
                + blend(anchor, .mouthFunnel) * 0.35
                + blend(anchor, .mouthPucker) * 0.2,
            min: 0,
            max: 1
        )

        return [
            "yaw": clamp(pose.yaw / 0.75, min: -1, max: 1),
            "pitch": clamp(pose.pitch / 0.65, min: -1, max: 1),
            "roll": clamp(pose.roll / 0.75, min: -1, max: 1),
            "mouthOpen": mouthOpen,
            "leftBlink": clamp(leftBlink, min: 0, max: 1),
            "rightBlink": clamp(rightBlink, min: 0, max: 1),
            "smile": clamp(smile, min: 0, max: 1),
            "browRaise": clamp(browRaise, min: 0, max: 1),
            "confidence": 0.98,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]
    }

    private static func frame(from observation: VNFaceObservation) -> [String: Double] {
        let yaw = clamp(observation.yaw?.doubleValue ?? centerOffset(observation.boundingBox.midX), min: -1, max: 1)
        let roll = clamp((observation.roll?.doubleValue ?? 0) / .pi, min: -1, max: 1)
        let pitch = estimatedPitch(observation)
        let mouthOpen = mouthOpenness(observation.landmarks?.outerLips)
        let leftBlink = blinkValue(observation.landmarks?.leftEye)
        let rightBlink = blinkValue(observation.landmarks?.rightEye)
        let smile = smileValue(observation.landmarks?.outerLips)
        let browRaise = clamp(max(0, -pitch) * 0.6 + 0.18, min: 0, max: 1)

        return [
            "yaw": yaw,
            "pitch": pitch,
            "roll": roll,
            "mouthOpen": mouthOpen,
            "leftBlink": leftBlink,
            "rightBlink": rightBlink,
            "smile": smile,
            "browRaise": browRaise,
            "confidence": Double(observation.confidence),
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]
    }

    private static func estimatedPitch(_ observation: VNFaceObservation) -> Double {
        if #available(iOS 15.0, *), let pitch = observation.pitch?.doubleValue {
            return clamp(pitch / .pi, min: -1, max: 1)
        }
        return clamp(centerOffset(observation.boundingBox.midY) * -0.85, min: -1, max: 1)
    }

    private static func mouthOpenness(_ region: VNFaceLandmarkRegion2D?) -> Double {
        guard let region, region.pointCount > 2 else {
            return 0.18
        }
        let bounds = boundsFor(region.normalizedPoints)
        return clamp((bounds.height / max(bounds.width, 0.01) - 0.22) * 1.8, min: 0, max: 1)
    }

    private static func blinkValue(_ region: VNFaceLandmarkRegion2D?) -> Double {
        guard let region, region.pointCount > 2 else {
            return 0
        }
        let bounds = boundsFor(region.normalizedPoints)
        return clamp(1 - (bounds.height / max(bounds.width, 0.01)) * 4.2, min: 0, max: 1)
    }

    private static func smileValue(_ region: VNFaceLandmarkRegion2D?) -> Double {
        guard let region, region.pointCount > 2 else {
            return 0.25
        }
        let bounds = boundsFor(region.normalizedPoints)
        return clamp((bounds.width - bounds.height * 1.7) * 1.9 + 0.25, min: 0, max: 1)
    }

    private static func boundsFor(_ points: [CGPoint]) -> CGRect {
        let xs = points.map(\.x)
        let ys = points.map(\.y)
        let minX = xs.min() ?? 0
        let maxX = xs.max() ?? 0
        let minY = ys.min() ?? 0
        let maxY = ys.max() ?? 0
        return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
    }

    private static func centerOffset(_ value: CGFloat) -> Double {
        Double((value - 0.5) * 2)
    }

    private static func blend(_ anchor: ARFaceAnchor, _ key: ARFaceAnchor.BlendShapeLocation) -> Double {
        anchor.blendShapes[key]?.doubleValue ?? 0
    }

    private static func eulerAngles(from transform: simd_float4x4) -> (yaw: Double, pitch: Double, roll: Double) {
        let q = simd_quatf(transform)
        let x = Double(q.imag.x)
        let y = Double(q.imag.y)
        let z = Double(q.imag.z)
        let w = Double(q.real)
        let roll = atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y))
        let pitchInput = clamp(2 * (w * y - z * x), min: -1, max: 1)
        let pitch = asin(pitchInput)
        let yaw = atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
        return (yaw: yaw, pitch: pitch, roll: roll)
    }

    private static func lostFrame() -> [String: Double] {
        [
            "yaw": 0,
            "pitch": 0,
            "roll": 0,
            "mouthOpen": 0,
            "leftBlink": 0,
            "rightBlink": 0,
            "smile": 0,
            "browRaise": 0,
            "confidence": 0,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]
    }

    private static func clamp(_ value: Double, min: Double, max: Double) -> Double {
        Swift.max(min, Swift.min(max, value.isFinite ? value : min))
    }

    private enum FaceTrackerError: LocalizedError {
        case cameraUnavailable
        case cameraInputUnavailable
        case cameraOutputUnavailable

        var errorDescription: String? {
            switch self {
            case .cameraUnavailable:
                return "Front camera is unavailable"
            case .cameraInputUnavailable:
                return "Camera input cannot be attached"
            case .cameraOutputUnavailable:
                return "Camera output cannot be attached"
            }
        }
    }
}
