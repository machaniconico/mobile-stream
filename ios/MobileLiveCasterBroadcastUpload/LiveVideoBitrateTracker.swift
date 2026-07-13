import Foundation

struct LiveVideoBitrateSnapshot: Equatable {
    let status: String
    let initialTargetKbps: Int
    let requestedTargetKbps: Int
    let appliedTargetKbps: Int
    let minimumAppliedKbps: Int
    let updateCount: Int
    let failureCount: Int
    let lastUpdatedAt: Double

    func asDictionary() -> [String: Any] {
        [
            "status": status,
            "initialTargetKbps": initialTargetKbps,
            "requestedTargetKbps": requestedTargetKbps,
            "appliedTargetKbps": appliedTargetKbps,
            "minimumAppliedKbps": minimumAppliedKbps,
            "updateCount": updateCount,
            "failureCount": failureCount,
            "lastUpdatedAt": lastUpdatedAt
        ]
    }
}

struct LiveVideoBitrateTracker: Equatable {
    private(set) var initialTargetKbps = 0
    private(set) var requestedTargetKbps = 0
    private(set) var appliedTargetKbps = 0
    private(set) var minimumAppliedKbps = 0
    private(set) var updateCount = 0
    private(set) var failureCount = 0
    private(set) var lastUpdatedAt: Double = 0

    mutating func reset(initialTargetKbps: Int) {
        let target = normalize(initialTargetKbps)
        self.initialTargetKbps = target
        requestedTargetKbps = target
        appliedTargetKbps = target
        minimumAppliedKbps = target
        updateCount = 0
        failureCount = 0
        lastUpdatedAt = 0
    }

    mutating func recordRequested(targetKbps: Int) {
        requestedTargetKbps = normalize(targetKbps)
    }

    mutating func recordApplied(targetKbps: Int, updatedAt: Double = Date().timeIntervalSince1970 * 1000) {
        let target = normalize(targetKbps)
        if initialTargetKbps <= 0 {
            reset(initialTargetKbps: target)
            return
        }
        let changed = target != appliedTargetKbps
        requestedTargetKbps = target
        if changed {
            updateCount += 1
        }
        appliedTargetKbps = target
        minimumAppliedKbps = minimumAppliedKbps > 0 ? min(minimumAppliedKbps, target) : target
        if changed {
            lastUpdatedAt = max(lastUpdatedAt, updatedAt)
        }
    }

    mutating func recordFailure(targetKbps: Int, updatedAt: Double = Date().timeIntervalSince1970 * 1000) {
        requestedTargetKbps = normalize(targetKbps)
        failureCount += 1
        lastUpdatedAt = max(lastUpdatedAt, updatedAt)
    }

    var snapshot: LiveVideoBitrateSnapshot {
        LiveVideoBitrateSnapshot(
            status: status,
            initialTargetKbps: initialTargetKbps,
            requestedTargetKbps: requestedTargetKbps,
            appliedTargetKbps: appliedTargetKbps,
            minimumAppliedKbps: minimumAppliedKbps,
            updateCount: updateCount,
            failureCount: failureCount,
            lastUpdatedAt: lastUpdatedAt
        )
    }

    private var status: String {
        if initialTargetKbps <= 0 || appliedTargetKbps <= 0 {
            return "unknown"
        }
        if failureCount > 0 {
            return "failed"
        }
        if appliedTargetKbps < initialTargetKbps {
            return "reduced"
        }
        return updateCount > 0 ? "restored" : "steady"
    }

    private func normalize(_ value: Int) -> Int {
        max(0, value)
    }
}
