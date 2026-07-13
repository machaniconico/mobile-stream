import Foundation

struct BroadcastMediaContinuitySnapshot: Equatable {
    let status: String
    let videoStalled: Bool
    let audioStalled: Bool
    let videoLastAdvancedAt: Double
    let audioLastAdvancedAt: Double
    let videoStallDurationMs: Int
    let audioStallDurationMs: Int
    let videoStallCount: Int
    let audioStallCount: Int
    let maxVideoStallDurationMs: Int
    let maxAudioStallDurationMs: Int
    let stallThresholdMs: Int

    func asDictionary() -> [String: Any] {
        [
            "status": status,
            "videoStalled": videoStalled,
            "audioStalled": audioStalled,
            "videoLastAdvancedAt": videoLastAdvancedAt,
            "audioLastAdvancedAt": audioLastAdvancedAt,
            "videoStallDurationMs": videoStallDurationMs,
            "audioStallDurationMs": audioStallDurationMs,
            "videoStallCount": videoStallCount,
            "audioStallCount": audioStallCount,
            "maxVideoStallDurationMs": maxVideoStallDurationMs,
            "maxAudioStallDurationMs": maxAudioStallDurationMs,
            "stallThresholdMs": stallThresholdMs
        ]
    }
}

struct BroadcastMediaContinuityHeartbeatGate {
    private(set) var generation = 0
    private(set) var enabled = false

    mutating func start() -> Int {
        generation += 1
        enabled = true
        return generation
    }

    mutating func stop() {
        enabled = false
        generation += 1
    }

    mutating func setEnabled(_ nextEnabled: Bool) {
        enabled = nextEnabled
    }

    func isCurrent(_ expectedGeneration: Int) -> Bool {
        generation == expectedGeneration
    }
}

struct BroadcastMediaContinuityTracker {
    private let stallThresholdMs: Int
    private let uptime: () -> TimeInterval
    private let wallClockMs: () -> Double
    private var initialized = false
    private var wasActive = false
    private var activeSinceUptime = 0.0
    private var lastVideoMessages: Int?
    private var lastAudioMessages: Int?
    private var lastVideoAdvancedUptime = 0.0
    private var lastAudioAdvancedUptime = 0.0
    private var videoLastAdvancedAt = 0.0
    private var audioLastAdvancedAt = 0.0
    private var videoStalled = false
    private var audioStalled = false
    private var videoStallCount = 0
    private var audioStallCount = 0
    private var maxVideoStallDurationMs = 0
    private var maxAudioStallDurationMs = 0

    init(
        stallThresholdMs: Int = 5_000,
        uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime },
        wallClockMs: @escaping () -> Double = { Date().timeIntervalSince1970 * 1000 }
    ) {
        self.stallThresholdMs = max(1_000, stallThresholdMs)
        self.uptime = uptime
        self.wallClockMs = wallClockMs
    }

    mutating func reset() {
        let nowUptime = uptime()
        let nowWallMs = wallClockMs()
        initialized = true
        wasActive = false
        activeSinceUptime = nowUptime
        lastVideoMessages = nil
        lastAudioMessages = nil
        lastVideoAdvancedUptime = nowUptime
        lastAudioAdvancedUptime = nowUptime
        videoLastAdvancedAt = nowWallMs
        audioLastAdvancedAt = nowWallMs
        videoStalled = false
        audioStalled = false
        videoStallCount = 0
        audioStallCount = 0
        maxVideoStallDurationMs = 0
        maxAudioStallDurationMs = 0
    }

    mutating func record(
        videoMessages: Int?,
        audioMessages: Int?,
        active: Bool
    ) -> BroadcastMediaContinuitySnapshot {
        if !initialized { reset() }
        let nowUptime = uptime()
        let nowWallMs = wallClockMs()

        if !active {
            wasActive = false
            lastVideoMessages = videoMessages ?? lastVideoMessages
            lastAudioMessages = audioMessages ?? lastAudioMessages
            activeSinceUptime = nowUptime
            lastVideoAdvancedUptime = nowUptime
            lastAudioAdvancedUptime = nowUptime
            videoLastAdvancedAt = nowWallMs
            audioLastAdvancedAt = nowWallMs
            videoStalled = false
            audioStalled = false
            return snapshot(status: "inactive", videoDurationMs: 0, audioDurationMs: 0)
        }

        if !wasActive {
            wasActive = true
            activeSinceUptime = nowUptime
            lastVideoMessages = videoMessages
            lastAudioMessages = audioMessages
            lastVideoAdvancedUptime = nowUptime
            lastAudioAdvancedUptime = nowUptime
            videoLastAdvancedAt = nowWallMs
            audioLastAdvancedAt = nowWallMs
            videoStalled = false
            audioStalled = false
            return snapshot(status: "warming-up", videoDurationMs: 0, audioDurationMs: 0)
        }

        if let videoMessages {
            if lastVideoMessages == nil || videoMessages != lastVideoMessages {
                lastVideoAdvancedUptime = nowUptime
                videoLastAdvancedAt = nowWallMs
                videoStalled = false
            }
            lastVideoMessages = videoMessages
        }
        if let audioMessages {
            if lastAudioMessages == nil || audioMessages != lastAudioMessages {
                lastAudioAdvancedUptime = nowUptime
                audioLastAdvancedAt = nowWallMs
                audioStalled = false
            }
            lastAudioMessages = audioMessages
        }

        let videoDurationMs = max(0, Int((nowUptime - lastVideoAdvancedUptime) * 1000))
        let audioDurationMs = max(0, Int((nowUptime - lastAudioAdvancedUptime) * 1000))
        let nextVideoStalled = videoDurationMs >= stallThresholdMs
        let nextAudioStalled = audioDurationMs >= stallThresholdMs
        if nextVideoStalled && !videoStalled { videoStallCount += 1 }
        if nextAudioStalled && !audioStalled { audioStallCount += 1 }
        videoStalled = nextVideoStalled
        audioStalled = nextAudioStalled
        if nextVideoStalled { maxVideoStallDurationMs = max(maxVideoStallDurationMs, videoDurationMs) }
        if nextAudioStalled { maxAudioStallDurationMs = max(maxAudioStallDurationMs, audioDurationMs) }

        let warmingUp = Int((nowUptime - activeSinceUptime) * 1000) < stallThresholdMs &&
            (lastVideoMessages ?? 0) <= 0 &&
            (lastAudioMessages ?? 0) <= 0
        let status: String
        if videoStalled && audioStalled {
            status = "both-stalled"
        } else if videoStalled {
            status = "video-stalled"
        } else if audioStalled {
            status = "audio-stalled"
        } else if warmingUp {
            status = "warming-up"
        } else {
            status = "healthy"
        }
        return snapshot(status: status, videoDurationMs: videoDurationMs, audioDurationMs: audioDurationMs)
    }

    private func snapshot(status: String, videoDurationMs: Int, audioDurationMs: Int) -> BroadcastMediaContinuitySnapshot {
        BroadcastMediaContinuitySnapshot(
            status: status,
            videoStalled: videoStalled,
            audioStalled: audioStalled,
            videoLastAdvancedAt: videoLastAdvancedAt,
            audioLastAdvancedAt: audioLastAdvancedAt,
            videoStallDurationMs: videoDurationMs,
            audioStallDurationMs: audioDurationMs,
            videoStallCount: videoStallCount,
            audioStallCount: audioStallCount,
            maxVideoStallDurationMs: maxVideoStallDurationMs,
            maxAudioStallDurationMs: maxAudioStallDurationMs,
            stallThresholdMs: stallThresholdMs
        )
    }
}
