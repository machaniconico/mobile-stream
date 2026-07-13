import Foundation

struct BroadcastMediaTimestampSnapshot: Equatable {
    let status: String
    let latestVideoTimestampMs: Int
    let latestAudioTimestampMs: Int
    let skewMs: Int
    let maxAbsSkewMs: Int
    let sampleCount: Int
    let outOfSyncSampleCount: Int
    let outOfSyncIncidentCount: Int
    let criticalIncidentCount: Int
    let consecutiveOutOfSyncSamples: Int
    let maxConsecutiveOutOfSyncSamples: Int
    let warningThresholdMs: Int
    let criticalThresholdMs: Int
    let critical: Bool

    func asDictionary() -> [String: Any] {
        [
            "status": status,
            "latestVideoTimestampMs": latestVideoTimestampMs,
            "latestAudioTimestampMs": latestAudioTimestampMs,
            "skewMs": skewMs,
            "maxAbsSkewMs": maxAbsSkewMs,
            "sampleCount": sampleCount,
            "outOfSyncSampleCount": outOfSyncSampleCount,
            "outOfSyncIncidentCount": outOfSyncIncidentCount,
            "criticalIncidentCount": criticalIncidentCount,
            "consecutiveOutOfSyncSamples": consecutiveOutOfSyncSamples,
            "maxConsecutiveOutOfSyncSamples": maxConsecutiveOutOfSyncSamples,
            "warningThresholdMs": warningThresholdMs,
            "criticalThresholdMs": criticalThresholdMs,
            "critical": critical
        ]
    }
}

struct BroadcastMediaTimestampTracker: Equatable {
    private let warningThresholdMs: Int
    private let criticalThresholdMs: Int
    private let criticalConsecutiveSamples: Int
    private var generationOriginTimestampMs: Int?
    private var hasVideoTimestamp = false
    private var hasAudioTimestamp = false
    private var latestVideoTimestampMs = 0
    private var latestAudioTimestampMs = 0
    private var videoRevision = 0
    private var audioRevision = 0
    private var lastSampleVideoRevision = 0
    private var lastSampleAudioRevision = 0
    private var sampleCount = 0
    private var outOfSyncSampleCount = 0
    private var outOfSyncIncidentCount = 0
    private var criticalIncidentCount = 0
    private var consecutiveOutOfSyncSamples = 0
    private var maxConsecutiveOutOfSyncSamples = 0
    private var consecutiveCriticalSamples = 0
    private var maxAbsSkewMs = 0
    private var wasOutOfSync = false
    private var wasCritical = false

    init(
        warningThresholdMs: Int = 150,
        criticalThresholdMs: Int = 500,
        criticalConsecutiveSamples: Int = 3
    ) {
        self.warningThresholdMs = max(1, warningThresholdMs)
        self.criticalThresholdMs = max(self.warningThresholdMs, criticalThresholdMs)
        self.criticalConsecutiveSamples = max(1, criticalConsecutiveSamples)
    }

    mutating func reset() {
        generationOriginTimestampMs = nil
        hasVideoTimestamp = false
        hasAudioTimestamp = false
        latestVideoTimestampMs = 0
        latestAudioTimestampMs = 0
        videoRevision = 0
        audioRevision = 0
        lastSampleVideoRevision = 0
        lastSampleAudioRevision = 0
        sampleCount = 0
        outOfSyncSampleCount = 0
        outOfSyncIncidentCount = 0
        criticalIncidentCount = 0
        consecutiveOutOfSyncSamples = 0
        maxConsecutiveOutOfSyncSamples = 0
        consecutiveCriticalSamples = 0
        maxAbsSkewMs = 0
        wasOutOfSync = false
        wasCritical = false
    }

    mutating func startGeneration() {
        generationOriginTimestampMs = nil
        hasVideoTimestamp = false
        hasAudioTimestamp = false
        latestVideoTimestampMs = 0
        latestAudioTimestampMs = 0
        videoRevision = 0
        audioRevision = 0
        lastSampleVideoRevision = 0
        lastSampleAudioRevision = 0
        consecutiveOutOfSyncSamples = 0
        consecutiveCriticalSamples = 0
        wasOutOfSync = false
        wasCritical = false
    }

    mutating func recordVideo(timestampMs: Int) -> BroadcastMediaTimestampSnapshot {
        let normalized = max(0, timestampMs)
        let origin = generationOriginTimestampMs ?? normalized
        if generationOriginTimestampMs == nil { generationOriginTimestampMs = normalized }
        hasVideoTimestamp = true
        latestVideoTimestampMs = max(latestVideoTimestampMs, normalized - origin)
        videoRevision += 1
        recordSampleIfReady()
        return snapshot()
    }

    mutating func recordAudio(timestampMs: Int) -> BroadcastMediaTimestampSnapshot {
        let normalized = max(0, timestampMs)
        let origin = generationOriginTimestampMs ?? normalized
        if generationOriginTimestampMs == nil { generationOriginTimestampMs = normalized }
        hasAudioTimestamp = true
        latestAudioTimestampMs = max(latestAudioTimestampMs, normalized - origin)
        audioRevision += 1
        recordSampleIfReady()
        return snapshot()
    }

    func snapshot() -> BroadcastMediaTimestampSnapshot {
        let ready = hasVideoTimestamp && hasAudioTimestamp
        let skewMs = ready ? latestVideoTimestampMs - latestAudioTimestampMs : 0
        let absoluteSkewMs = abs(skewMs)
        let critical = ready && consecutiveCriticalSamples >= criticalConsecutiveSamples
        let status: String
        let confirmedOutOfSync = consecutiveOutOfSyncSamples >= criticalConsecutiveSamples
        if !ready {
            status = "warming-up"
        } else if absoluteSkewMs <= warningThresholdMs || !confirmedOutOfSync {
            status = "in-sync"
        } else if skewMs > 0 {
            status = "video-leading"
        } else {
            status = "audio-leading"
        }
        return BroadcastMediaTimestampSnapshot(
            status: status,
            latestVideoTimestampMs: latestVideoTimestampMs,
            latestAudioTimestampMs: latestAudioTimestampMs,
            skewMs: skewMs,
            maxAbsSkewMs: maxAbsSkewMs,
            sampleCount: sampleCount,
            outOfSyncSampleCount: outOfSyncSampleCount,
            outOfSyncIncidentCount: outOfSyncIncidentCount,
            criticalIncidentCount: criticalIncidentCount,
            consecutiveOutOfSyncSamples: consecutiveOutOfSyncSamples,
            maxConsecutiveOutOfSyncSamples: maxConsecutiveOutOfSyncSamples,
            warningThresholdMs: warningThresholdMs,
            criticalThresholdMs: criticalThresholdMs,
            critical: critical
        )
    }

    private mutating func recordSampleIfReady() {
        guard hasVideoTimestamp, hasAudioTimestamp else { return }
        guard videoRevision > lastSampleVideoRevision, audioRevision > lastSampleAudioRevision else { return }
        lastSampleVideoRevision = videoRevision
        lastSampleAudioRevision = audioRevision
        let absoluteSkewMs = abs(latestVideoTimestampMs - latestAudioTimestampMs)
        sampleCount += 1
        maxAbsSkewMs = max(maxAbsSkewMs, absoluteSkewMs)
        let outOfSync = absoluteSkewMs > warningThresholdMs
        if outOfSync {
            outOfSyncSampleCount += 1
            consecutiveOutOfSyncSamples += 1
            maxConsecutiveOutOfSyncSamples = max(maxConsecutiveOutOfSyncSamples, consecutiveOutOfSyncSamples)
        } else {
            consecutiveOutOfSyncSamples = 0
        }
        let confirmedOutOfSync = outOfSync && consecutiveOutOfSyncSamples >= criticalConsecutiveSamples
        if absoluteSkewMs >= criticalThresholdMs {
            consecutiveCriticalSamples += 1
        } else {
            consecutiveCriticalSamples = 0
        }
        let critical = consecutiveCriticalSamples >= criticalConsecutiveSamples
        if confirmedOutOfSync && !wasOutOfSync { outOfSyncIncidentCount += 1 }
        if critical && !wasCritical { criticalIncidentCount += 1 }
        wasOutOfSync = confirmedOutOfSync
        wasCritical = critical
    }
}
