package com.mobilelivecaster.streaming

import kotlin.math.abs

internal class MediaTimestampTracker(
    private val warningThresholdMs: Long = 150L,
    private val criticalThresholdMs: Long = 500L,
    private val criticalConsecutiveSamples: Long = 3L,
    private val monotonicClockMs: () -> Long = { System.nanoTime() / 1_000_000L }
) {
    private var generationEpochObservedAtMs: Long? = null
    private var firstVideoTimestampMs: Long? = null
    private var firstAudioTimestampMs: Long? = null
    private var firstVideoObservedAtMs: Long? = null
    private var firstAudioObservedAtMs: Long? = null
    private var latestVideoTimestampMs = 0L
    private var latestAudioTimestampMs = 0L
    private var videoRevision = 0L
    private var audioRevision = 0L
    private var lastSampleVideoRevision = 0L
    private var lastSampleAudioRevision = 0L
    private var sampleCount = 0L
    private var outOfSyncSampleCount = 0L
    private var outOfSyncIncidentCount = 0L
    private var criticalIncidentCount = 0L
    private var consecutiveOutOfSyncSamples = 0L
    private var maxConsecutiveOutOfSyncSamples = 0L
    private var consecutiveCriticalSamples = 0L
    private var maxAbsSkewMs = 0L
    private var wasOutOfSync = false
    private var wasCritical = false

    init {
        require(warningThresholdMs > 0L) { "A/V sync warning threshold must be positive" }
        require(criticalThresholdMs >= warningThresholdMs) { "A/V sync critical threshold must not be below warning" }
        require(criticalConsecutiveSamples > 0L) { "A/V sync critical sample count must be positive" }
    }

    @Synchronized
    fun reset() {
        generationEpochObservedAtMs = null
        firstVideoTimestampMs = null
        firstAudioTimestampMs = null
        firstVideoObservedAtMs = null
        firstAudioObservedAtMs = null
        latestVideoTimestampMs = 0L
        latestAudioTimestampMs = 0L
        videoRevision = 0L
        audioRevision = 0L
        lastSampleVideoRevision = 0L
        lastSampleAudioRevision = 0L
        sampleCount = 0L
        outOfSyncSampleCount = 0L
        outOfSyncIncidentCount = 0L
        criticalIncidentCount = 0L
        consecutiveOutOfSyncSamples = 0L
        maxConsecutiveOutOfSyncSamples = 0L
        consecutiveCriticalSamples = 0L
        maxAbsSkewMs = 0L
        wasOutOfSync = false
        wasCritical = false
    }

    @Synchronized
    fun startGeneration() {
        generationEpochObservedAtMs = null
        firstVideoTimestampMs = null
        firstAudioTimestampMs = null
        firstVideoObservedAtMs = null
        firstAudioObservedAtMs = null
        latestVideoTimestampMs = 0L
        latestAudioTimestampMs = 0L
        videoRevision = 0L
        audioRevision = 0L
        lastSampleVideoRevision = 0L
        lastSampleAudioRevision = 0L
        consecutiveOutOfSyncSamples = 0L
        consecutiveCriticalSamples = 0L
        wasOutOfSync = false
        wasCritical = false
    }

    @Synchronized
    fun recordVideo(timestampMs: Long, observedAtMs: Long = monotonicClockMs()): NativeRuntimeAvSync {
        val normalized = timestampMs.coerceAtLeast(0L)
        val observed = observedAtMs.coerceAtLeast(0L)
        val epoch = generationEpochObservedAtMs ?: observed.also { generationEpochObservedAtMs = it }
        val baseline = firstVideoTimestampMs ?: normalized.also { firstVideoTimestampMs = it }
        val observedBaseline = firstVideoObservedAtMs ?: observed.also { firstVideoObservedAtMs = it }
        latestVideoTimestampMs = ((observedBaseline - epoch) + (normalized - baseline)).coerceAtLeast(latestVideoTimestampMs)
        videoRevision += 1L
        recordSampleIfReady()
        return snapshot()
    }

    @Synchronized
    fun recordAudio(timestampMs: Long, observedAtMs: Long = monotonicClockMs()): NativeRuntimeAvSync {
        val normalized = timestampMs.coerceAtLeast(0L)
        val observed = observedAtMs.coerceAtLeast(0L)
        val epoch = generationEpochObservedAtMs ?: observed.also { generationEpochObservedAtMs = it }
        val baseline = firstAudioTimestampMs ?: normalized.also { firstAudioTimestampMs = it }
        val observedBaseline = firstAudioObservedAtMs ?: observed.also { firstAudioObservedAtMs = it }
        latestAudioTimestampMs = ((observedBaseline - epoch) + (normalized - baseline)).coerceAtLeast(latestAudioTimestampMs)
        audioRevision += 1L
        recordSampleIfReady()
        return snapshot()
    }

    @Synchronized
    fun snapshot(): NativeRuntimeAvSync {
        val ready = firstVideoTimestampMs != null && firstAudioTimestampMs != null
        val skewMs = if (ready) latestVideoTimestampMs - latestAudioTimestampMs else 0L
        val absSkewMs = abs(skewMs)
        val critical = ready && consecutiveCriticalSamples >= criticalConsecutiveSamples
        val confirmedOutOfSync = consecutiveOutOfSyncSamples >= criticalConsecutiveSamples
        val status = when {
            !ready -> "warming-up"
            absSkewMs <= warningThresholdMs || !confirmedOutOfSync -> "in-sync"
            skewMs > 0L -> "video-leading"
            else -> "audio-leading"
        }
        return NativeRuntimeAvSync(
            status = status,
            latestVideoTimestampMs = latestVideoTimestampMs,
            latestAudioTimestampMs = latestAudioTimestampMs,
            skewMs = skewMs,
            maxAbsSkewMs = maxAbsSkewMs,
            sampleCount = sampleCount,
            outOfSyncSampleCount = outOfSyncSampleCount,
            outOfSyncIncidentCount = outOfSyncIncidentCount,
            criticalIncidentCount = criticalIncidentCount,
            consecutiveOutOfSyncSamples = consecutiveOutOfSyncSamples,
            maxConsecutiveOutOfSyncSamples = maxConsecutiveOutOfSyncSamples,
            warningThresholdMs = warningThresholdMs,
            criticalThresholdMs = criticalThresholdMs,
            critical = critical
        )
    }

    private fun recordSampleIfReady() {
        if (firstVideoTimestampMs == null || firstAudioTimestampMs == null) return
        if (videoRevision <= lastSampleVideoRevision || audioRevision <= lastSampleAudioRevision) return
        lastSampleVideoRevision = videoRevision
        lastSampleAudioRevision = audioRevision
        val absSkewMs = abs(latestVideoTimestampMs - latestAudioTimestampMs)
        sampleCount += 1L
        maxAbsSkewMs = maxOf(maxAbsSkewMs, absSkewMs)
        val outOfSync = absSkewMs > warningThresholdMs
        if (outOfSync) {
            outOfSyncSampleCount += 1L
            consecutiveOutOfSyncSamples += 1L
            maxConsecutiveOutOfSyncSamples = maxOf(maxConsecutiveOutOfSyncSamples, consecutiveOutOfSyncSamples)
        } else {
            consecutiveOutOfSyncSamples = 0L
        }
        val confirmedOutOfSync = outOfSync && consecutiveOutOfSyncSamples >= criticalConsecutiveSamples
        if (absSkewMs >= criticalThresholdMs) {
            consecutiveCriticalSamples += 1L
        } else {
            consecutiveCriticalSamples = 0L
        }
        val critical = consecutiveCriticalSamples >= criticalConsecutiveSamples
        if (confirmedOutOfSync && !wasOutOfSync) outOfSyncIncidentCount += 1L
        if (critical && !wasCritical) criticalIncidentCount += 1L
        wasOutOfSync = confirmedOutOfSync
        wasCritical = critical
    }
}

internal class NativeRuntimeAvSyncAccumulator {
    private var retained: NativeRuntimeAvSync? = null

    @Synchronized
    fun reset() {
        retained = null
    }

    @Synchronized
    fun retain(snapshot: NativeRuntimeAvSync) {
        retained = merge(retained, snapshot)
    }

    @Synchronized
    fun combine(current: NativeRuntimeAvSync?): NativeRuntimeAvSync? = merge(retained, current)

    private fun merge(
        previous: NativeRuntimeAvSync?,
        current: NativeRuntimeAvSync?
    ): NativeRuntimeAvSync? {
        if (previous == null) return current
        if (current == null) return previous
        return current.copy(
            maxAbsSkewMs = maxOf(previous.maxAbsSkewMs, current.maxAbsSkewMs),
            sampleCount = previous.sampleCount + current.sampleCount,
            outOfSyncSampleCount = previous.outOfSyncSampleCount + current.outOfSyncSampleCount,
            outOfSyncIncidentCount = previous.outOfSyncIncidentCount + current.outOfSyncIncidentCount,
            criticalIncidentCount = previous.criticalIncidentCount + current.criticalIncidentCount,
            maxConsecutiveOutOfSyncSamples = maxOf(
                previous.maxConsecutiveOutOfSyncSamples,
                current.maxConsecutiveOutOfSyncSamples
            )
        )
    }
}
