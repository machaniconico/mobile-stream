package com.mobilelivecaster.streaming

data class LiveCasterHealth(
    val bitrateKbps: Int = 0,
    val droppedFrames: Int = 0,
    val fps: Int = 0,
    val message: String = "Ready"
)

enum class LiveCasterStatus {
    Idle,
    Preparing,
    Live,
    Reconnecting,
    Stopping,
    Failed
}

class LiveCasterModule {
    var status: LiveCasterStatus = LiveCasterStatus.Idle
        private set

    var health: LiveCasterHealth = LiveCasterHealth()
        private set

    fun prepare(renderGraphJson: String, profileJson: String) {
        status = LiveCasterStatus.Preparing
        health = health.copy(message = "Preparing screen capture")
        // TODO: Hand renderGraphJson/profileJson to MediaProjectionService.
    }

    fun start() {
        status = LiveCasterStatus.Live
        health = health.copy(message = "Live")
        // TODO: Start foreground service after MediaProjection consent is granted.
    }

    fun stop() {
        status = LiveCasterStatus.Stopping
        health = health.copy(message = "Stopping")
        // TODO: Stop encoder, muxer, publisher, and foreground service.
    }

    fun reconnect() {
        status = LiveCasterStatus.Reconnecting
        health = health.copy(message = "Reconnecting")
        // TODO: Re-open RTMP/RTMPS publisher without losing current scene state.
    }
}
