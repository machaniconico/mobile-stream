import Foundation

enum LiveCasterStatus: String {
    case idle
    case preparing
    case live
    case reconnecting
    case stopping
    case failed
}

struct LiveCasterHealth {
    var bitrateKbps: Int = 0
    var droppedFrames: Int = 0
    var fps: Int = 0
    var message: String = "Ready"
}

final class LiveCasterBridge {
    private(set) var status: LiveCasterStatus = .idle
    private(set) var health = LiveCasterHealth()

    func prepare(renderGraphJSON: String, profileJSON: String) {
        status = .preparing
        health.message = "Preparing broadcast pipeline"
    }

    func start() {
        status = .live
        health.message = "Live"
    }

    func stop() {
        status = .stopping
        health.message = "Stopping"
    }

    func reconnect() {
        status = .reconnecting
        health.message = "Reconnecting"
    }

    func fail(_ message: String) {
        status = .failed
        health.message = message
    }
}
