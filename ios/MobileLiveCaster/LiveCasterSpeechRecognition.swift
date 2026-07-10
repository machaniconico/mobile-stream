import AVFoundation
import Foundation
import React
import Speech

@objc(LiveCasterSpeechRecognition)
final class LiveCasterSpeechRecognition: RCTEventEmitter {
    private let audioEngine = AVAudioEngine()
    private let stateQueue = DispatchQueue(label: "MobileLiveCaster.speechRecognition.state")
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var inputTapInstalled = false
    private var stopRequested = true
    private var hasListeners = false
    private var currentLanguage = Locale.current.identifier.replacingOccurrences(of: "_", with: "-")
    private var currentInterimResults = true
    private var restartWorkItem: DispatchWorkItem?

    @objc
    override static func requiresMainQueueSetup() -> Bool {
        false
    }

    override func supportedEvents() -> [String]! {
        ["LiveCaptionCue", "LiveCaptionStatus"]
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    @objc(start:interimResults:resolver:rejecter:)
    func start(
        _ language: String,
        interimResults: Bool,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let normalizedLanguage = Self.normalizeLanguage(language, fallback: currentLanguage)
        requestPermissions { [weak self] allowed, message in
            guard let self else {
                resolve(false)
                return
            }
            self.stateQueue.async {
                guard allowed else {
                    self.stopRequested = true
                    self.stopRecognitionLocked(cancelTask: true)
                    let errorMessage = message ?? "Speech recognition and microphone permission are required for live captions."
                    self.emitStatus("error", message: errorMessage)
                    reject("speech_permission_denied", errorMessage, nil)
                    return
                }

                self.currentLanguage = normalizedLanguage
                self.currentInterimResults = interimResults
                self.stopRequested = false
                do {
                    try self.startRecognitionLocked()
                    self.emitStatus("listening")
                    resolve(true)
                } catch {
                    self.stopRequested = true
                    self.stopRecognitionLocked(cancelTask: true)
                    let errorMessage = error.localizedDescription
                    self.emitStatus("error", message: errorMessage)
                    reject((error as? SpeechRecognitionError)?.code ?? "speech_recognition_start_failed", errorMessage, error)
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
                resolve(true)
                return
            }
            self.stopRequested = true
            self.stopRecognitionLocked(cancelTask: true)
            self.emitStatus("idle")
            resolve(true)
        }
    }

    private func requestPermissions(completion: @escaping (Bool, String?) -> Void) {
        let group = DispatchGroup()
        var speechAuthorized = false
        var microphoneAuthorized = false

        group.enter()
        SFSpeechRecognizer.requestAuthorization { status in
            speechAuthorized = status == .authorized
            group.leave()
        }

        group.enter()
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            microphoneAuthorized = granted
            group.leave()
        }

        group.notify(queue: stateQueue) {
            if speechAuthorized && microphoneAuthorized {
                completion(true, nil)
            } else if !speechAuthorized {
                completion(false, "Speech recognition permission is required for live captions.")
            } else {
                completion(false, "Microphone permission is required for live captions.")
            }
        }
    }

    private func startRecognitionLocked() throws {
        stopRecognitionLocked(cancelTask: true)

        let locale = Locale(identifier: currentLanguage)
        guard let recognizer = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer() else {
            throw SpeechRecognitionError.unsupported
        }
        guard recognizer.isAvailable else {
            throw SpeechRecognitionError.unavailable
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = currentInterimResults
        recognitionRequest = request

        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.playAndRecord, mode: .measurement, options: [.allowBluetoothHFP, .defaultToSpeaker, .mixWithOthers])
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        if recordingFormat.sampleRate <= 0 || recordingFormat.channelCount == 0 {
            throw SpeechRecognitionError.audioInputUnavailable
        }
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak request] buffer, _ in
            request?.append(buffer)
        }
        inputTapInstalled = true
        audioEngine.prepare()
        try audioEngine.start()

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            self?.handleRecognitionResult(result, error: error)
        }
    }

    private func handleRecognitionResult(_ result: SFSpeechRecognitionResult?, error: Error?) {
        if let result {
            emitCue(
                text: result.bestTranscription.formattedString,
                confidence: Self.averageConfidence(result),
                isFinal: result.isFinal
            )
        }

        if let error {
            emitStatus("error", message: error.localizedDescription)
        }

        if result?.isFinal == true || error != nil {
            stateQueue.async { [weak self] in
                guard let self else {
                    return
                }
                self.stopRecognitionLocked(cancelTask: false)
                if !self.stopRequested {
                    self.scheduleRestartLocked()
                }
            }
        }
    }

    private func scheduleRestartLocked() {
        restartWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            guard let self else {
                return
            }
            do {
                try self.startRecognitionLocked()
                self.emitStatus("listening")
            } catch {
                self.emitStatus("error", message: error.localizedDescription)
            }
        }
        restartWorkItem = workItem
        stateQueue.asyncAfter(deadline: .now() + 0.35, execute: workItem)
    }

    private func stopRecognitionLocked(cancelTask: Bool) {
        restartWorkItem?.cancel()
        restartWorkItem = nil

        if audioEngine.isRunning {
            audioEngine.stop()
        }
        if inputTapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            inputTapInstalled = false
        }

        recognitionRequest?.endAudio()
        recognitionRequest = nil
        if cancelTask {
            recognitionTask?.cancel()
        } else {
            recognitionTask?.finish()
        }
        recognitionTask = nil
    }

    private func emitCue(text: String, confidence: Double, isFinal: Bool) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else {
            return
        }
        emitEvent(
            name: "LiveCaptionCue",
            body: [
                "text": clean,
                "language": currentLanguage,
                "confidence": max(0, min(1, confidence.isFinite ? confidence : 1)),
                "isFinal": isFinal,
                "timestampMs": Date().timeIntervalSince1970 * 1000
            ]
        )
    }

    private func emitStatus(_ status: String, message: String? = nil) {
        var body: [String: Any] = ["status": status]
        if let message, !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            body["message"] = message
        }
        emitEvent(name: "LiveCaptionStatus", body: body)
    }

    private func emitEvent(name: String, body: Any) {
        guard hasListeners else {
            return
        }
        DispatchQueue.main.async { [weak self] in
            self?.sendEvent(withName: name, body: body)
        }
    }

    private static func averageConfidence(_ result: SFSpeechRecognitionResult) -> Double {
        let segments = result.bestTranscription.segments
        guard !segments.isEmpty else {
            return 1
        }
        let total = segments.reduce(0.0) { partial, segment in
            partial + Double(segment.confidence)
        }
        return total / Double(segments.count)
    }

    private static func normalizeLanguage(_ language: String, fallback: String) -> String {
        let clean = language.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "_", with: "-")
        return clean.range(of: #"^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$"#, options: .regularExpression) == nil ? fallback : clean
    }
}

private enum SpeechRecognitionError: LocalizedError {
    case unsupported
    case unavailable
    case audioInputUnavailable

    var code: String {
        switch self {
        case .unsupported:
            return "speech_recognition_unsupported"
        case .unavailable:
            return "speech_recognition_unavailable"
        case .audioInputUnavailable:
            return "speech_audio_input_unavailable"
        }
    }

    var errorDescription: String? {
        switch self {
        case .unsupported:
            return "iOS speech recognition is not available on this device."
        case .unavailable:
            return "iOS speech recognition is currently unavailable."
        case .audioInputUnavailable:
            return "Microphone audio input is unavailable for live captions."
        }
    }
}
