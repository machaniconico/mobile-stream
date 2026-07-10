import AVFoundation
import Foundation
import React

@objc(LiveCasterSpeech)
final class LiveCasterSpeech: NSObject, AVSpeechSynthesizerDelegate, @unchecked Sendable {
    private let synthesizer = AVSpeechSynthesizer()
    private var activeRequest: SpeechRequest?
    private var requestQueue: [SpeechRequest] = []

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        true
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

        let request = SpeechRequest(
            text: String(text.prefix(400)),
            rate: rate.doubleValue,
            pitch: pitch.doubleValue,
            volume: volume.doubleValue,
            resolve: resolve
        )
        performOnMain { [weak self] in
            guard let self else {
                request.resolve(false)
                return
            }
            self.requestQueue.append(request)
            self.drainQueue()
        }
    }

    @objc(stop:rejecter:)
    func stop(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock
    ) {
        performOnMain { [weak self] in
            guard let self else {
                resolve(false)
                return
            }
            self.requestQueue.forEach { request in request.resolve(false) }
            self.requestQueue.removeAll()
            let activeRequest = self.activeRequest
            self.activeRequest = nil
            self.synthesizer.stopSpeaking(at: .immediate)
            activeRequest?.resolve(false)
            resolve(true)
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        performOnMain { [weak self] in
            self?.completeActiveRequest(true)
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        performOnMain { [weak self] in
            self?.completeActiveRequest(false)
        }
    }

    private func drainQueue() {
        dispatchPrecondition(condition: .onQueue(.main))
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

    private func completeActiveRequest(_ completed: Bool) {
        dispatchPrecondition(condition: .onQueue(.main))
        activeRequest?.resolve(completed)
        activeRequest = nil
        drainQueue()
    }

    private func performOnMain(_ work: @escaping @Sendable () -> Void) {
        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
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
