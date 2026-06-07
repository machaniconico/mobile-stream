import AVFoundation
import Foundation
import React

@objc(LiveCasterSpeech)
final class LiveCasterSpeech: NSObject, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private var activeRequest: SpeechRequest?
    private var requestQueue: [SpeechRequest] = []

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        false
    }

    @objc(speak:rate:pitch:volume:resolver:rejecter:)
    func speak(
        _ text: String,
        rate: NSNumber,
        pitch: NSNumber,
        volume: NSNumber,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            resolve(false)
            return
        }

        requestQueue.append(
            SpeechRequest(
                text: String(text.prefix(400)),
                rate: rate.doubleValue,
                pitch: pitch.doubleValue,
                volume: volume.doubleValue,
                resolve: resolve
            )
        )
        drainQueue()
    }

    @objc(stop:rejecter:)
    func stop(
        _ resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        requestQueue.forEach { request in request.resolve(false) }
        requestQueue.removeAll()
        synthesizer.stopSpeaking(at: .immediate)
        activeRequest?.resolve(false)
        activeRequest = nil
        resolve(true)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        activeRequest?.resolve(true)
        activeRequest = nil
        drainQueue()
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        activeRequest?.resolve(false)
        activeRequest = nil
        drainQueue()
    }

    private func drainQueue() {
        guard activeRequest == nil, !synthesizer.isSpeaking, !requestQueue.isEmpty else {
            return
        }

        let request = requestQueue.removeFirst()
        activeRequest = request

        let utterance = AVSpeechUtterance(string: request.text)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * Float(clamp(request.rate, min: 0.5, max: 1.5))
        utterance.pitchMultiplier = Float(clamp(request.pitch, min: 0.5, max: 1.5))
        utterance.volume = Float(clamp(request.volume, min: 0, max: 1))
        utterance.voice = AVSpeechSynthesisVoice(language: Locale.preferredLanguages.first ?? "en-US")
        synthesizer.speak(utterance)
    }

    private func clamp(_ value: Double, min: Double, max: Double) -> Double {
        Swift.max(min, Swift.min(max, value.isFinite ? value : min))
    }

    private struct SpeechRequest {
        let text: String
        let rate: Double
        let pitch: Double
        let volume: Double
        let resolve: RCTPromiseResolveBlock
    }
}
