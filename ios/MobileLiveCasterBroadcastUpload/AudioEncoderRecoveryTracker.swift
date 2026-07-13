import Foundation

struct BroadcastAudioEncoderRecoverySnapshot: Equatable {
    let attemptCount: Int
    let successCount: Int
    let failureCount: Int
    let suppressedInputBufferCount: Int
    let droppedInputFrameCount: Int
    let discardedQueuedFrameCount: Int
    let consecutiveFailureCount: Int
    let pending: Bool
    let retryAfterMs: Int
    let lastStatus: Int32
    let lastReason: String
    let lastRecoveryAt: Double
}

struct BroadcastAudioEncoderRecoveryTracker {
    private let baseBackoffMs: Int
    private let maximumBackoffMs: Int
    private let uptime: () -> TimeInterval
    private let wallClockMs: () -> Double
    private var attemptCount = 0
    private var successCount = 0
    private var failureCount = 0
    private var suppressedInputBufferCount = 0
    private var droppedInputFrameCount = 0
    private var discardedQueuedFrameCount = 0
    private var consecutiveFailureCount = 0
    private var pending = false
    private var nextAttemptUptime: TimeInterval?
    private var lastStatus: Int32 = 0
    private var lastReason = ""
    private var lastRecoveryAt: Double = 0

    init(
        baseBackoffMs: Int = 100,
        maximumBackoffMs: Int = 2_000,
        uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime },
        wallClockMs: @escaping () -> Double = { Date().timeIntervalSince1970 * 1_000 }
    ) {
        self.baseBackoffMs = max(1, baseBackoffMs)
        self.maximumBackoffMs = max(self.baseBackoffMs, maximumBackoffMs)
        self.uptime = uptime
        self.wallClockMs = wallClockMs
    }

    var hasPendingRecovery: Bool { pending }

    func canProcessInput() -> Bool {
        guard let nextAttemptUptime else { return true }
        return uptime() >= nextAttemptUptime
    }

    mutating func beginAttempt(status: Int32, reason: String) {
        attemptCount += 1
        pending = true
        nextAttemptUptime = nil
        lastStatus = status
        lastReason = Self.normalizedReason(reason)
        lastRecoveryAt = wallClockMs()
    }

    mutating func recordSuccess() {
        successCount += 1
        consecutiveFailureCount = 0
        pending = false
        nextAttemptUptime = nil
        lastStatus = 0
        lastRecoveryAt = wallClockMs()
    }

    mutating func recordFailure(status: Int32, reason: String, droppedInputFrames: Int) {
        failureCount += 1
        consecutiveFailureCount += 1
        pending = true
        droppedInputFrameCount += max(0, droppedInputFrames)
        lastStatus = status
        lastReason = Self.normalizedReason(reason)
        lastRecoveryAt = wallClockMs()
        nextAttemptUptime = uptime() + Double(nextBackoffMs()) / 1_000
    }

    mutating func recordSuppressedInput(droppedInputFrames: Int) {
        suppressedInputBufferCount += 1
        droppedInputFrameCount += max(0, droppedInputFrames)
    }

    mutating func recordDiscardedQueuedFrames(_ frameCount: Int) {
        discardedQueuedFrameCount += max(0, frameCount)
    }

    func snapshot() -> BroadcastAudioEncoderRecoverySnapshot {
        BroadcastAudioEncoderRecoverySnapshot(
            attemptCount: attemptCount,
            successCount: successCount,
            failureCount: failureCount,
            suppressedInputBufferCount: suppressedInputBufferCount,
            droppedInputFrameCount: droppedInputFrameCount,
            discardedQueuedFrameCount: discardedQueuedFrameCount,
            consecutiveFailureCount: consecutiveFailureCount,
            pending: pending,
            retryAfterMs: retryAfterMs(),
            lastStatus: lastStatus,
            lastReason: lastReason,
            lastRecoveryAt: lastRecoveryAt
        )
    }

    private func nextBackoffMs() -> Int {
        let exponent = min(max(consecutiveFailureCount - 1, 0), 10)
        let multiplier = 1 << exponent
        guard baseBackoffMs <= maximumBackoffMs / multiplier else {
            return maximumBackoffMs
        }
        return min(maximumBackoffMs, baseBackoffMs * multiplier)
    }

    private func retryAfterMs() -> Int {
        guard let nextAttemptUptime else { return 0 }
        return max(0, Int(ceil((nextAttemptUptime - uptime()) * 1_000)))
    }

    private static func normalizedReason(_ reason: String) -> String {
        var sanitized = ""
        sanitized.reserveCapacity(min(reason.utf8.count, 160))
        for scalar in reason.unicodeScalars {
            sanitized += CharacterSet.controlCharacters.contains(scalar) ? " " : String(scalar)
        }
        return String(sanitized.trimmingCharacters(in: .whitespacesAndNewlines).prefix(160))
    }
}
