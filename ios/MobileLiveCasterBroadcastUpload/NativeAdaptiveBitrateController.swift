import Foundation

struct NativeAdaptiveBitrateSample {
    let nowElapsedMs: Double
    let nowWallMs: Double
    let active: Bool
    let publishGeneration: Int
    let congested: Bool
    let queuedItems: Int
    let cacheSize: Int
    let measuredBitrateKbps: Int
    let useMeasuredBitrate: Bool
    let droppedVideoFrames: Int
    let cumulativeReconnectCount: Int
}

struct NativeAdaptiveBitrateDecision: Equatable {
    let type: String
    let targetKbps: Int
    let reason: String
}

struct NativeAdaptiveBitrateSnapshot: Equatable {
    let controlOwner: String
    let controllerState: String
    let baselineTargetKbps: Int
    let effectiveTargetKbps: Int
    let floorTargetKbps: Int
    let pendingTargetKbps: Int
    let automaticReductionCount: Int
    let automaticRestorationCount: Int
    let pressureSampleCount: Int
    let healthySampleCount: Int
    let cooldownRemainingMs: Int
    let recoveryEligibleInMs: Int
    let publishGeneration: Int
    let cumulativeReconnectCount: Int
    let lastDecisionAt: Double
    let lastDecisionReason: String

    func asDictionary() -> [String: Any] {
        [
            "controlOwner": controlOwner,
            "controllerState": controllerState,
            "baselineTargetKbps": baselineTargetKbps,
            "effectiveTargetKbps": effectiveTargetKbps,
            "floorTargetKbps": floorTargetKbps,
            "pendingTargetKbps": pendingTargetKbps,
            "automaticReductionCount": automaticReductionCount,
            "automaticRestorationCount": automaticRestorationCount,
            "pressureSampleCount": pressureSampleCount,
            "healthySampleCount": healthySampleCount,
            "cooldownRemainingMs": cooldownRemainingMs,
            "recoveryEligibleInMs": recoveryEligibleInMs,
            "publishGeneration": publishGeneration,
            "cumulativeReconnectCount": cumulativeReconnectCount,
            "lastDecisionAt": lastDecisionAt,
            "lastDecisionReason": lastDecisionReason
        ]
    }
}

struct NativeAdaptiveBitrateController {
    static let startupGraceMs = 10_000.0
    static let reductionCooldownMs = 8_000.0
    static let recoveryCooldownMs = 20_000.0
    static let recoveryAfterRepublishMs = 30_000.0
    static let pressureSamples = 3
    static let criticalPressureSamples = 2
    static let healthySamples = 30
    static let absoluteMinimumKbps = 900

    private var controllerState = "idle"
    private var baselineTargetKbps = 0
    private var effectiveTargetKbps = 0
    private var floorTargetKbps = 0
    private var pendingTargetKbps = 0
    private var pendingBaselineTargetKbps: Int?
    private var pendingDecisionType: String?
    private var automaticReductionCount = 0
    private var automaticRestorationCount = 0
    private var pressureSampleCount = 0
    private var criticalPressureSampleCount = 0
    private var healthySampleCount = 0
    private var cooldownUntilMs = 0.0
    private var recoveryEligibleMs = 0.0
    private var publishedAtMs = 0.0
    private var publishGeneration = 0
    private var cumulativeReconnectCount = 0
    private var reconnectPressurePending = false
    private var lastDroppedVideoFrames = 0
    private var lastDecisionAt = 0.0
    private var lastDecisionReason = ""

    mutating func reset(baselineKbps: Int, nowElapsedMs: Double = 0) {
        baselineTargetKbps = normalizeTarget(baselineKbps)
        effectiveTargetKbps = baselineTargetKbps
        floorTargetKbps = floorForBaseline(baselineTargetKbps)
        pendingTargetKbps = 0
        pendingBaselineTargetKbps = nil
        pendingDecisionType = nil
        automaticReductionCount = 0
        automaticRestorationCount = 0
        pressureSampleCount = 0
        criticalPressureSampleCount = 0
        healthySampleCount = 0
        cooldownUntilMs = 0
        recoveryEligibleMs = max(0, nowElapsedMs)
        publishedAtMs = 0
        publishGeneration = 0
        cumulativeReconnectCount = 0
        reconnectPressurePending = false
        lastDroppedVideoFrames = 0
        lastDecisionAt = 0
        lastDecisionReason = ""
        controllerState = "idle"
    }

    mutating func requestBaselineChange(_ baselineKbps: Int) {
        let target = normalizeTarget(baselineKbps)
        pendingTargetKbps = target
        pendingBaselineTargetKbps = target
        pendingDecisionType = nil
        reconnectPressurePending = false
        clearWindows()
        controllerState = "cooldown"
    }

    mutating func recordApplied(_ targetKbps: Int) {
        let normalizedTarget = normalizeTarget(targetKbps)
        let confirmsPendingTarget = normalizedTarget == pendingTargetKbps
        if confirmsPendingTarget, let confirmedBaseline = pendingBaselineTargetKbps {
            baselineTargetKbps = confirmedBaseline
            floorTargetKbps = floorForBaseline(confirmedBaseline)
        }
        let target = min(baselineTargetKbps, max(floorTargetKbps, normalizedTarget))
        let appliedDecisionType = confirmsPendingTarget ? pendingDecisionType : nil
        effectiveTargetKbps = target
        if appliedDecisionType == "reduce" {
            automaticReductionCount += 1
        } else if appliedDecisionType == "restore" {
            automaticRestorationCount += 1
        }
        pendingTargetKbps = 0
        pendingBaselineTargetKbps = nil
        pendingDecisionType = nil
        controllerState = effectiveTargetKbps < baselineTargetKbps ? "reduced" : "observing"
    }

    mutating func recordFailure(_ reason: String, nowWallMs: Double) {
        pendingTargetKbps = 0
        pendingBaselineTargetKbps = nil
        pendingDecisionType = nil
        reconnectPressurePending = false
        clearWindows()
        controllerState = "failed"
        lastDecisionAt = max(lastDecisionAt, nowWallMs)
        lastDecisionReason = String(reason.prefix(160))
    }

    mutating func evaluate(_ sample: NativeAdaptiveBitrateSample) -> NativeAdaptiveBitrateDecision? {
        guard controllerState != "failed" else { return nil }
        let nowElapsedMs = max(0, sample.nowElapsedMs)
        let nowWallMs = max(0, sample.nowWallMs)
        let droppedVideoFrames = max(0, sample.droppedVideoFrames)
        let droppedIncrease = max(0, droppedVideoFrames - lastDroppedVideoFrames)
        let reconnectIncrease = max(0, sample.cumulativeReconnectCount - cumulativeReconnectCount)
        if reconnectIncrease > 0 {
            reconnectPressurePending = true
        }
        lastDroppedVideoFrames = droppedVideoFrames
        cumulativeReconnectCount = max(cumulativeReconnectCount, sample.cumulativeReconnectCount)

        guard sample.active else {
            clearWindows()
            controllerState = effectiveTargetKbps < baselineTargetKbps ? "reduced" : "idle"
            return nil
        }
        if sample.publishGeneration != publishGeneration {
            publishGeneration = max(0, sample.publishGeneration)
            publishedAtMs = nowElapsedMs
            recoveryEligibleMs = nowElapsedMs + Self.recoveryAfterRepublishMs
            clearWindows()
            controllerState = "startup"
            return nil
        }
        guard nowElapsedMs - publishedAtMs >= Self.startupGraceMs, pendingTargetKbps == 0 else {
            clearWindows()
            controllerState = pendingTargetKbps > 0 ? "cooldown" : "startup"
            return nil
        }

        let queueRatio = normalizedQueueRatio(items: sample.queuedItems, capacity: sample.cacheSize)
        let measuredRatio = sample.useMeasuredBitrate && sample.measuredBitrateKbps > 0 && effectiveTargetKbps > 0
            ? Double(sample.measuredBitrateKbps) / Double(effectiveTargetKbps)
            : 1
        let reconnectPressure = reconnectPressurePending
        let pressured = sample.congested || queueRatio >= 0.5 || measuredRatio < 0.65 || droppedIncrease > 0 || reconnectPressure
        let critical = queueRatio >= 0.8 || measuredRatio < 0.4 || droppedIncrease >= 3 || reconnectPressure
        if pressured {
            pressureSampleCount += 1
            criticalPressureSampleCount = critical ? criticalPressureSampleCount + 1 : 0
            healthySampleCount = 0
            controllerState = "pressure"
            let holdReady = pressureSampleCount >= Self.pressureSamples || criticalPressureSampleCount >= Self.criticalPressureSamples
            if holdReady, nowElapsedMs >= cooldownUntilMs, effectiveTargetKbps > floorTargetKbps {
                let target = max(floorTargetKbps, roundToHundred(Double(effectiveTargetKbps) * 0.8))
                if target < effectiveTargetKbps {
                    return decide(
                        "reduce",
                        target,
                        pressureReason(sample, queueRatio, measuredRatio, droppedIncrease, reconnectPressure ? 1 : 0),
                        nowElapsedMs,
                        nowWallMs
                    )
                }
            }
            if holdReady, nowElapsedMs >= cooldownUntilMs, effectiveTargetKbps <= floorTargetKbps {
                reconnectPressurePending = false
            }
            return nil
        }

        clearPressure()
        let measuredHealthy = !sample.useMeasuredBitrate ||
            (sample.measuredBitrateKbps > 0 && measuredRatio >= 0.85)
        guard effectiveTargetKbps < baselineTargetKbps, queueRatio <= 0.1, measuredHealthy else {
            healthySampleCount = 0
            controllerState = effectiveTargetKbps < baselineTargetKbps ? "reduced" : "observing"
            return nil
        }
        healthySampleCount += 1
        controllerState = "recovering"
        guard healthySampleCount >= Self.healthySamples, nowElapsedMs >= recoveryEligibleMs, nowElapsedMs >= cooldownUntilMs else {
            return nil
        }
        let target = min(baselineTargetKbps, max(effectiveTargetKbps + 100, roundToHundred(Double(effectiveTargetKbps) * 1.1)))
        return target > effectiveTargetKbps
            ? decide(
                "restore",
                target,
                "Native publisher remained uncongested through the recovery hold.",
                nowElapsedMs,
                nowWallMs
            )
            : nil
    }

    func snapshot(nowElapsedMs: Double) -> NativeAdaptiveBitrateSnapshot {
        NativeAdaptiveBitrateSnapshot(
            controlOwner: "native",
            controllerState: controllerState,
            baselineTargetKbps: baselineTargetKbps,
            effectiveTargetKbps: effectiveTargetKbps,
            floorTargetKbps: floorTargetKbps,
            pendingTargetKbps: pendingTargetKbps,
            automaticReductionCount: automaticReductionCount,
            automaticRestorationCount: automaticRestorationCount,
            pressureSampleCount: pressureSampleCount,
            healthySampleCount: healthySampleCount,
            cooldownRemainingMs: max(0, Int(cooldownUntilMs - nowElapsedMs)),
            recoveryEligibleInMs: max(0, Int(recoveryEligibleMs - nowElapsedMs)),
            publishGeneration: publishGeneration,
            cumulativeReconnectCount: cumulativeReconnectCount,
            lastDecisionAt: lastDecisionAt,
            lastDecisionReason: lastDecisionReason
        )
    }

    private mutating func decide(
        _ type: String,
        _ targetKbps: Int,
        _ reason: String,
        _ nowElapsedMs: Double,
        _ nowWallMs: Double
    ) -> NativeAdaptiveBitrateDecision {
        pendingTargetKbps = targetKbps
        pendingBaselineTargetKbps = nil
        pendingDecisionType = type
        if type == "reduce" {
            cooldownUntilMs = nowElapsedMs + Self.reductionCooldownMs
        } else {
            cooldownUntilMs = nowElapsedMs + Self.recoveryCooldownMs
        }
        reconnectPressurePending = false
        lastDecisionAt = max(lastDecisionAt, nowWallMs)
        lastDecisionReason = String(reason.prefix(160))
        clearWindows()
        controllerState = "cooldown"
        return NativeAdaptiveBitrateDecision(type: type, targetKbps: targetKbps, reason: lastDecisionReason)
    }

    private mutating func clearWindows() {
        clearPressure()
        healthySampleCount = 0
    }

    private mutating func clearPressure() {
        pressureSampleCount = 0
        criticalPressureSampleCount = 0
    }

    private func normalizeTarget(_ value: Int) -> Int { roundToHundred(Double(max(0, value))) }
    private func floorForBaseline(_ baseline: Int) -> Int {
        min(baseline, max(Self.absoluteMinimumKbps, roundToHundred(Double(baseline) * 0.35)))
    }
    private func roundToHundred(_ value: Double) -> Int { max(0, Int((value / 100).rounded()) * 100) }
    private func normalizedQueueRatio(items: Int, capacity: Int) -> Double {
        capacity > 0 ? min(1, max(0, Double(items) / Double(capacity))) : 0
    }
    private func pressureReason(
        _ sample: NativeAdaptiveBitrateSample,
        _ queueRatio: Double,
        _ measuredRatio: Double,
        _ droppedIncrease: Int,
        _ reconnectIncrease: Int
    ) -> String {
        if reconnectIncrease > 0 { return "A transport reconnect occurred during the active session." }
        if droppedIncrease > 0 { return "\(droppedIncrease) new publisher video frame drop(s) were observed." }
        if sample.congested || queueRatio >= 0.5 { return "Publisher queue pressure reached \(Int((queueRatio * 100).rounded()))%." }
        if measuredRatio < 0.65 { return "Measured send bitrate stayed at \(Int((measuredRatio * 100).rounded()))% of target." }
        return "Sustained native publisher pressure was observed."
    }
}
