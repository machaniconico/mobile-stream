package com.mobilelivecaster.streaming

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioRecordingConfiguration
import android.media.AudioRouting
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.max

internal data class AndroidMicrophoneAudioCaptureSnapshot(
    val status: String,
    val backend: String,
    val sampleRate: Int,
    val lifecycleEventCount: Long,
    val routeChangeCount: Long,
    val interruptionCount: Long,
    val recoveryCount: Long,
    val recoveryFailureCount: Long,
    val unrecoveredEventCount: Long,
    val fallbackFrames: Long,
    val lastRecoveryReason: String,
    val lastRecoveryAt: Long,
    val suspended: Boolean,
    val lastError: String
)

internal enum class AndroidMicrophoneFailureAction {
    RETRY,
    FATAL
}

internal object AndroidMicrophoneFailurePolicy {
    private const val ERROR_BAD_VALUE = -2

    fun forReadResult(result: Int): AndroidMicrophoneFailureAction =
        if (result == ERROR_BAD_VALUE) {
            AndroidMicrophoneFailureAction.FATAL
        } else {
            AndroidMicrophoneFailureAction.RETRY
        }

    fun forThrowable(error: Throwable): AndroidMicrophoneFailureAction {
        if (error is Error) return AndroidMicrophoneFailureAction.FATAL
        var current: Throwable? = error
        while (current != null) {
            if (
                current is SecurityException ||
                current is UnsupportedOperationException ||
                current is IllegalArgumentException ||
                current is AndroidMicrophoneConfigurationException
            ) {
                return AndroidMicrophoneFailureAction.FATAL
            }
            current = current.cause
        }
        return AndroidMicrophoneFailureAction.RETRY
    }
}

internal class AndroidMicrophonePcmBuffer(
    capacityBytes: Int,
    private val frameSizeBytes: Int,
    private val maxReadAheadChunks: Int
) {
    init {
        require(frameSizeBytes > 0) { "Microphone PCM frame size must be positive" }
        require(maxReadAheadChunks > 0) { "Microphone read-ahead chunk count must be positive" }
    }

    private val ringBuffer = PcmByteRingBuffer(capacityBytes, frameSizeBytes)

    fun write(source: ByteArray, length: Int): Int = ringBuffer.write(source, length)

    fun readInto(destination: ByteArray): Int {
        val alignedRequestedBytes = destination.size - destination.size % frameSizeBytes
        if (alignedRequestedBytes == 0) return 0
        val trimLimit = (alignedRequestedBytes.toLong() * maxReadAheadChunks)
            .coerceAtMost(Int.MAX_VALUE.toLong())
            .toInt()
        ringBuffer.trimTo(trimLimit)
        return ringBuffer.read(destination, alignedRequestedBytes)
    }

    fun clear() = ringBuffer.clear()

    fun sizeBytes(): Int = ringBuffer.sizeBytes()
}

internal class AndroidMicrophoneAudioCapture(
    context: Context,
    private val sampleRate: Int,
    private val channelMask: Int,
    private val readBufferSizeBytes: Int,
    private val onFatalError: (String) -> Unit
) {
    companion object {
        private const val BACKEND = "android-audiorecord-microphone"
        private const val MAX_BUFFERED_AUDIO_MILLIS = 300L
        private const val MAX_READ_AHEAD_CHUNKS = 3
        private const val SUPERVISOR_POLL_MILLIS = 20L
        private const val ZERO_READ_POLL_MILLIS = 5L
    }

    init {
        require(sampleRate > 0) { "Microphone sample rate must be positive" }
        require(channelMask != 0) { "Microphone channel mask must be configured" }
        require(readBufferSizeBytes > 0) { "Microphone read buffer must be positive" }
    }

    private val appContext = context.applicationContext
    private val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val frameSizeBytes = microphoneFrameSizeBytes(channelMask)
    private val running = AtomicBoolean(false)
    private val fatalErrorReported = AtomicBoolean(false)
    private val fallbackFrames = AtomicLong(0L)
    private val lifecycleGeneration = AtomicLong(0L)
    private val recordGeneration = AtomicLong(0L)
    private val recoveryState = AndroidAudioCaptureRecoveryState()
    private val ownerReleaseState = AndroidNativeOwnerReleaseState()
    private val workerFatalError = AtomicReference<Error?>(null)
    private val pcmBuffer = AndroidMicrophonePcmBuffer(
        capacityBytes = microphoneRingCapacityBytes(
            sampleRate,
            frameSizeBytes,
            MAX_BUFFERED_AUDIO_MILLIS
        ),
        frameSizeBytes = frameSizeBytes,
        maxReadAheadChunks = MAX_READ_AHEAD_CHUNKS
    )
    private val recordLock = Any()
    private val readerLock = Any()
    private val modeListenerLock = Any()
    private var activeRecord: MicrophoneAudioRecordHandle? = null
    private var readerThread: Thread? = null
    private var modeChangedListener: MicrophoneModeChangedRegistration? = null
    @Volatile private var lastError = ""

    fun start() {
        if (running.get()) return
        synchronized(readerLock) {
            if (readerThread?.isAlive == true) {
                lastError = "Previous microphone reader is still stopping"
                return
            }
        }
        if (!running.compareAndSet(false, true)) return
        val sessionGeneration = lifecycleGeneration.incrementAndGet()
        fatalErrorReported.set(false)
        fallbackFrames.set(0L)
        lastError = ""
        pcmBuffer.clear()
        recoveryState.activate(capturing = false)
        registerAudioModeListener(sessionGeneration)
        recoveryState.requestInitialCapture()

        val thread = Thread(
            { readLoop(sessionGeneration) },
            "MLC-Microphone-Audio"
        )
        synchronized(readerLock) {
            readerThread = thread
        }
        thread.start()
    }

    /** Returns immediately with only PCM that the dedicated reader has already captured. */
    fun readInto(destination: ByteArray): Int {
        if (!running.get() || recoveryState.snapshot().status == "failed") return 0
        return pcmBuffer.readInto(destination)
    }

    fun snapshot(): AndroidMicrophoneAudioCaptureSnapshot {
        val recovery = recoveryState.snapshot()
        return AndroidMicrophoneAudioCaptureSnapshot(
            status = recovery.status,
            backend = BACKEND,
            sampleRate = sampleRate,
            lifecycleEventCount = recovery.lifecycleEventCount,
            routeChangeCount = recovery.routeChangeCount,
            interruptionCount = recovery.interruptionCount,
            recoveryCount = recovery.recoveryCount,
            recoveryFailureCount = recovery.recoveryFailureCount,
            unrecoveredEventCount = recovery.unrecoveredEventCount,
            fallbackFrames = fallbackFrames.get(),
            lastRecoveryReason = recovery.lastRecoveryReason,
            lastRecoveryAt = recovery.lastRecoveryAt,
            suspended = recovery.suspended,
            lastError = lastError
        )
    }

    fun recordFallbackFrames(frames: Int) {
        if (frames > 0) fallbackFrames.addAndGet(frames.toLong())
    }

    fun ownerReleaseFailure(): Throwable? = workerFatalError.get() ?: ownerReleaseState.failure()

    fun stop() {
        running.set(false)
        lifecycleGeneration.incrementAndGet()
        unregisterAudioModeListener()
        recoveryState.deactivate()
        pcmBuffer.clear()

        val thread = synchronized(readerLock) { readerThread }
        thread?.interrupt()
        pcmBuffer.clear()
    }

    fun awaitStopped(deadlineNanos: Long): Boolean {
        val thread = synchronized(readerLock) { readerThread } ?: return true
        if (Thread.currentThread() === thread) return false
        joinThreadUntil(thread, deadlineNanos)
        return !thread.isAlive
    }

    private fun readLoop(sessionGeneration: Long) {
        val readBuffer = ByteArray(alignToFrame(readBufferSizeBytes, frameSizeBytes))
        try {
            while (isSessionActive(sessionGeneration)) {
                val handle = ensureAudioRecord(sessionGeneration)
                if (handle == null) {
                    waitForSupervisor(sessionGeneration, SUPERVISOR_POLL_MILLIS)
                    continue
                }

                val result = try {
                    handle.record.read(
                        readBuffer,
                        0,
                        readBuffer.size,
                        AudioRecord.READ_NON_BLOCKING
                    )
                } catch (error: Throwable) {
                    if (error is Error) {
                        workerFatalError.compareAndSet(null, error)
                        if (isSessionActive(sessionGeneration) && isCurrentRecord(handle)) {
                            reportFatalError("capture-fatal-error", safeMessage(error), error)
                        }
                        throw error
                    }
                    if (!isSessionActive(sessionGeneration) || !isCurrentRecord(handle)) break
                    handleReadException(handle, error)
                    continue
                }

                if (!isSessionActive(sessionGeneration)) break
                if (!isCurrentRecord(handle)) continue
                when {
                    result > 0 -> handlePositiveRead(handle, readBuffer, result)
                    result == 0 -> {
                        val request = recoveryState.recordReadResult(0)
                        if (request != null) requestRecordReplacement(handle)
                        waitForSupervisor(sessionGeneration, ZERO_READ_POLL_MILLIS)
                    }
                    else -> handleNegativeRead(handle, result)
                }
            }
        } catch (error: Error) {
            workerFatalError.compareAndSet(null, error)
            throw error
        } finally {
            detachRecordForSession(sessionGeneration)?.let(::releaseRecord)
            synchronized(readerLock) {
                if (readerThread === Thread.currentThread()) readerThread = null
            }
        }
    }

    private fun handlePositiveRead(
        handle: MicrophoneAudioRecordHandle,
        source: ByteArray,
        bytesRead: Int
    ) {
        val request = recoveryState.recordReadResult(bytesRead)
        if (request != null) {
            requestRecordReplacement(handle)
            return
        }
        if (recoveryState.snapshot().status != "capturing" || !isCurrentRecord(handle)) return
        pcmBuffer.write(source, bytesRead)
    }

    private fun handleNegativeRead(handle: MicrophoneAudioRecordHandle, result: Int) {
        lastError = "Microphone AudioRecord read failed ($result)"
        val action = AndroidMicrophoneFailurePolicy.forReadResult(result)
        val request = recoveryState.recordReadResult(result)
        if (action == AndroidMicrophoneFailureAction.FATAL) {
            reportFatalError("capture-bad-value", lastError)
        } else if (request != null) {
            requestRecordReplacement(handle)
        } else if (recoveryState.snapshot().status != "capturing") {
            requestRecordReplacement(handle)
        }
    }

    private fun handleReadException(handle: MicrophoneAudioRecordHandle, error: Throwable) {
        lastError = safeMessage(error)
        if (AndroidMicrophoneFailurePolicy.forThrowable(error) == AndroidMicrophoneFailureAction.FATAL) {
            reportFatalError(fatalReason(error), lastError)
            return
        }
        val request = recoveryState.recordReadException()
        if (request != null) requestRecordReplacement(handle)
    }

    private fun ensureAudioRecord(sessionGeneration: Long): MicrophoneAudioRecordHandle? {
        if (!isSessionActive(sessionGeneration)) return null
        val current = synchronized(recordLock) { activeRecord }
        if (current != null) {
            val recording = try {
                current.record.state == AudioRecord.STATE_INITIALIZED &&
                    current.record.recordingState == AudioRecord.RECORDSTATE_RECORDING
            } catch (_: Exception) {
                false
            }
            if (recording) return current
            recoveryState.recordStopped()
            pcmBuffer.clear()
            detachRecord(current)?.let(::releaseRecord)
        }

        val request = recoveryState.pendingRecovery() ?: return null
        return createAndStartAudioRecord(sessionGeneration, request)
    }

    @SuppressLint("MissingPermission")
    private fun createAndStartAudioRecord(
        sessionGeneration: Long,
        request: AndroidAudioCaptureRecoveryRequest
    ): MicrophoneAudioRecordHandle? {
        pcmBuffer.clear()
        var unattachedRecord: AudioRecord? = null
        var handle: MicrophoneAudioRecordHandle? = null
        var attached = false
        try {
            val record = createAudioRecord().also { unattachedRecord = it }
            if (!isSessionActive(sessionGeneration) || recoveryState.pendingRecovery() != request) {
                releaseUnstartedRecord(record)
                return null
            }

            handle = createHandle(record, sessionGeneration)
            unattachedRecord = null
            if (!attachRecord(handle)) {
                releaseRecord(handle)
                return null
            }
            attached = true
            registerRecordCallbacks(handle)
            if (!isCurrentRecord(handle)) return null

            record.startRecording()
            if (!isCurrentRecord(handle)) return null
            if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
                throw AndroidMicrophoneRetryableException(
                    "Microphone AudioRecord did not enter recording state"
                )
            }

            val routeId = try {
                record.routedDevice?.id
            } catch (_: Exception) {
                null
            }
            if (!recoveryState.recordRecoverySuccess(request, routeId)) {
                detachRecord(handle)?.let(::releaseRecord)
                return null
            }
            lastError = ""
            recordCurrentSilenced(handle)
            return if (isCurrentRecord(handle)) handle else null
        } catch (error: Throwable) {
            if (error is Error) workerFatalError.compareAndSet(null, error)
            val activeHandle = handle
            if (activeHandle != null) {
                if (attached) {
                    detachRecord(activeHandle)?.let(::releaseRecord)
                } else {
                    releaseRecord(activeHandle)
                }
            } else {
                unattachedRecord?.let(::releaseUnstartedRecord)
            }
            if (error is Error) {
                if (isSessionActive(sessionGeneration)) {
                    reportFatalError("capture-fatal-error", safeMessage(error), error)
                }
                throw error
            }
            if (isSessionActive(sessionGeneration)) handleStartFailure(request, error)
            return null
        }
    }

    @SuppressLint("MissingPermission")
    private fun createAudioRecord(): AudioRecord {
        val audioFormat = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(sampleRate)
            .setChannelMask(channelMask)
            .build()
        val minimumBufferSize = AudioRecord.getMinBufferSize(
            sampleRate,
            channelMask,
            AudioFormat.ENCODING_PCM_16BIT
        )
        if (minimumBufferSize == AudioRecord.ERROR_BAD_VALUE) {
            throw AndroidMicrophoneConfigurationException(
                "Microphone sample rate or channel configuration is unsupported"
            )
        }
        if (minimumBufferSize <= 0) {
            throw AndroidMicrophoneRetryableException(
                "Microphone AudioRecord buffer size is unavailable ($minimumBufferSize)"
            )
        }

        val record = AudioRecord.Builder()
            .setAudioSource(MediaRecorder.AudioSource.MIC)
            .setAudioFormat(audioFormat)
            .setBufferSizeInBytes(max(minimumBufferSize, readBufferSizeBytes * 4))
            .build()
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            releaseUnstartedRecord(record)
            throw AndroidMicrophoneRetryableException(
                "Microphone AudioRecord initialization failed"
            )
        }
        return record
    }

    private fun createHandle(
        record: AudioRecord,
        sessionGeneration: Long
    ): MicrophoneAudioRecordHandle {
        val generation = recordGeneration.incrementAndGet()
        val routingListener = AudioRouting.OnRoutingChangedListener { routing ->
            if (routing !== record || !isCurrentRecord(record, generation, sessionGeneration)) return@OnRoutingChangedListener
            val routeId = try {
                record.routedDevice?.id
            } catch (_: Exception) {
                null
            }
            recoveryState.recordRoute(routeId)
        }
        val recordingCallback = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            object : AudioManager.AudioRecordingCallback() {
                override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {
                    if (!isCurrentRecord(record, generation, sessionGeneration)) return
                    val configuration = try {
                        record.activeRecordingConfiguration
                    } catch (_: Exception) {
                        null
                    } ?: return
                    handleClientSilenced(record, generation, configuration.isClientSilenced)
                }
            }
        } else {
            null
        }
        return MicrophoneAudioRecordHandle(
            record = record,
            routingListener = routingListener,
            recordingCallback = recordingCallback,
            generation = generation,
            sessionGeneration = sessionGeneration
        )
    }

    private fun registerRecordCallbacks(handle: MicrophoneAudioRecordHandle) {
        handle.record.addOnRoutingChangedListener(
            handle.routingListener,
            Handler(Looper.getMainLooper())
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && handle.recordingCallback != null) {
            handle.record.registerAudioRecordingCallback(
                appContext.mainExecutor,
                handle.recordingCallback
            )
        }
    }

    private fun recordCurrentSilenced(handle: MicrophoneAudioRecordHandle) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || !isCurrentRecord(handle)) return
        val configuration = try {
            handle.record.activeRecordingConfiguration
        } catch (_: Exception) {
            null
        } ?: return
        handleClientSilenced(handle.record, handle.generation, configuration.isClientSilenced)
    }

    private fun handleClientSilenced(record: AudioRecord, generation: Long, silenced: Boolean) {
        synchronized(recordLock) { activeRecord }
            ?.takeIf { it.record === record && it.generation == generation }
            ?: return
        recoveryState.recordSilenced(silenced)
        pcmBuffer.clear()
    }

    private fun handleStartFailure(
        request: AndroidAudioCaptureRecoveryRequest,
        error: Throwable
    ) {
        lastError = safeMessage(error)
        if (AndroidMicrophoneFailurePolicy.forThrowable(error) == AndroidMicrophoneFailureAction.FATAL) {
            reportFatalError(fatalReason(error), lastError)
            return
        }
        recoveryState.recordRecoveryFailure(request)
        if (recoveryState.snapshot().status == "failed") {
            reportFatalError(
                "capture-recovery-circuit-open",
                "$lastError (microphone recovery retry limit reached)"
            )
        }
    }

    private fun requestRecordReplacement(handle: MicrophoneAudioRecordHandle) {
        pcmBuffer.clear()
        detachRecord(handle)?.let(::releaseRecord)
    }

    private fun attachRecord(handle: MicrophoneAudioRecordHandle): Boolean = synchronized(recordLock) {
        if (
            !isSessionActive(handle.sessionGeneration) ||
            activeRecord != null ||
            recoveryState.pendingRecovery() == null
        ) {
            return@synchronized false
        }
        activeRecord = handle
        true
    }

    private fun detachRecord(expected: MicrophoneAudioRecordHandle? = null): MicrophoneAudioRecordHandle? =
        synchronized(recordLock) {
            val current = activeRecord ?: return@synchronized null
            if (expected != null && current !== expected) return@synchronized null
            activeRecord = null
            current
        }

    private fun detachRecordForSession(sessionGeneration: Long): MicrophoneAudioRecordHandle? =
        synchronized(recordLock) {
            val current = activeRecord ?: return@synchronized null
            if (current.sessionGeneration != sessionGeneration) return@synchronized null
            activeRecord = null
            current
        }

    private fun isCurrentRecord(handle: MicrophoneAudioRecordHandle): Boolean = synchronized(recordLock) {
        isSessionActive(handle.sessionGeneration) && activeRecord === handle
    }

    private fun isCurrentRecord(
        record: AudioRecord,
        generation: Long,
        sessionGeneration: Long
    ): Boolean = synchronized(recordLock) {
        isSessionActive(sessionGeneration) &&
            activeRecord?.record === record &&
            activeRecord?.generation == generation &&
            activeRecord?.sessionGeneration == sessionGeneration
    }

    private fun isSessionActive(sessionGeneration: Long): Boolean =
        running.get() && lifecycleGeneration.get() == sessionGeneration

    private fun registerAudioModeListener(sessionGeneration: Long) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        val listener = AudioManager.OnModeChangedListener { mode ->
            if (isSessionActive(sessionGeneration)) handleAudioModeChanged(mode)
        }
        val registered = try {
            synchronized(modeListenerLock) {
                if (!isSessionActive(sessionGeneration)) return@synchronized false
                audioManager.addOnModeChangedListener(appContext.mainExecutor, listener)
                modeChangedListener = MicrophoneModeChangedRegistration(listener, sessionGeneration)
                true
            }
        } catch (error: Exception) {
            lastError = safeMessage(error)
            false
        }
        if (registered && isSessionActive(sessionGeneration)) {
            val mode = try {
                audioManager.mode
            } catch (_: Exception) {
                AudioManager.MODE_NORMAL
            }
            handleAudioModeChanged(mode)
        }
    }

    private fun unregisterAudioModeListener() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        val registration = synchronized(modeListenerLock) {
            modeChangedListener.also { modeChangedListener = null }
        } ?: return
        ownerReleaseState.execute(
            { audioManager.removeOnModeChangedListener(registration.listener) }
        )
    }

    private fun handleAudioModeChanged(mode: Int) {
        val policySilenced = mode != AudioManager.MODE_NORMAL
        recoveryState.recordPolicySilenced(policySilenced)
        pcmBuffer.clear()
    }

    private fun reportFatalError(reason: String, message: String, ownerError: Error? = null) {
        ownerError?.let { workerFatalError.compareAndSet(null, it) }
        val resolvedMessage = message.ifBlank { "Microphone capture failed" }.take(160)
        lastError = resolvedMessage
        recoveryState.recordFatal(reason)
        running.set(false)
        lifecycleGeneration.incrementAndGet()
        pcmBuffer.clear()
        var fatalSideEffectError: Error? = ownerError
        try {
            unregisterAudioModeListener()
        } catch (error: Error) {
            workerFatalError.compareAndSet(null, error)
            if (fatalSideEffectError == null) {
                fatalSideEffectError = error
            } else if (fatalSideEffectError !== error) {
                fatalSideEffectError.addSuppressed(error)
            }
        }
        synchronized(readerLock) { readerThread }?.interrupt()
        if (fatalErrorReported.compareAndSet(false, true)) {
            try {
                onFatalError(resolvedMessage)
            } catch (error: Error) {
                workerFatalError.compareAndSet(null, error)
                if (fatalSideEffectError == null) {
                    fatalSideEffectError = error
                } else if (fatalSideEffectError !== error) {
                    fatalSideEffectError.addSuppressed(error)
                }
            } catch (_: Exception) {
                // Native owner failures remain authoritative.
            }
        }
        if (ownerError == null) fatalSideEffectError?.let { throw it }
    }

    private fun releaseRecord(handle: MicrophoneAudioRecordHandle) {
        ownerReleaseState.execute(
            {
                if (handle.record.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                    handle.record.stop()
                }
            },
            {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && handle.recordingCallback != null) {
                    handle.record.unregisterAudioRecordingCallback(handle.recordingCallback)
                }
            },
            { handle.record.removeOnRoutingChangedListener(handle.routingListener) },
            { handle.record.release() }
        )
    }

    private fun releaseUnstartedRecord(record: AudioRecord) {
        ownerReleaseState.execute(
            {
                if (record.recordingState == AudioRecord.RECORDSTATE_RECORDING) record.stop()
            },
            { record.release() }
        )
    }

    private fun waitForSupervisor(sessionGeneration: Long, delayMillis: Long) {
        if (!isSessionActive(sessionGeneration)) return
        try {
            Thread.sleep(delayMillis)
        } catch (_: InterruptedException) {
            // stop() interrupts the reader after invalidating its session generation.
        }
    }

    private fun joinThreadUntil(thread: Thread, deadlineNanos: Long) {
        val remainingNanos = deadlineNanos - System.nanoTime()
        if (remainingNanos <= 0L) return
        val millis = remainingNanos / 1_000_000L
        val nanos = (remainingNanos % 1_000_000L).toInt()
        try {
            thread.join(millis, nanos)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        }
    }

    private fun fatalReason(error: Throwable): String = when {
        error.hasCause<SecurityException>() || error.hasCause<UnsupportedOperationException>() ->
            "capture-permission-denied"
        error.hasCause<IllegalArgumentException>() ||
            error.hasCause<AndroidMicrophoneConfigurationException>() ->
            "capture-invalid-configuration"
        else -> "capture-fatal-error"
    }

    private fun safeMessage(error: Throwable): String =
        (error.message ?: error.javaClass.simpleName).take(160)
}

private class AndroidMicrophoneConfigurationException(message: String) : IllegalArgumentException(message)

private class AndroidMicrophoneRetryableException(message: String) : IllegalStateException(message)

private class MicrophoneAudioRecordHandle(
    val record: AudioRecord,
    val routingListener: AudioRouting.OnRoutingChangedListener,
    val recordingCallback: AudioManager.AudioRecordingCallback?,
    val generation: Long,
    val sessionGeneration: Long
)

private data class MicrophoneModeChangedRegistration(
    val listener: AudioManager.OnModeChangedListener,
    val sessionGeneration: Long
)

private fun microphoneFrameSizeBytes(channelMask: Int): Int {
    val channelCount = when (channelMask) {
        AudioFormat.CHANNEL_IN_MONO -> 1
        AudioFormat.CHANNEL_IN_STEREO -> 2
        else -> Integer.bitCount(channelMask).coerceAtLeast(1)
    }
    return channelCount * 2
}

private fun microphoneRingCapacityBytes(
    sampleRate: Int,
    frameSizeBytes: Int,
    durationMillis: Long
): Int =
    ((sampleRate.toLong() * frameSizeBytes * durationMillis) / 1_000L)
        .coerceAtLeast(frameSizeBytes.toLong())
        .coerceAtMost(Int.MAX_VALUE.toLong())
        .toInt()

private fun alignToFrame(byteCount: Int, frameSizeBytes: Int): Int =
    (byteCount - byteCount % frameSizeBytes).coerceAtLeast(frameSizeBytes)

private inline fun <reified T : Throwable> Throwable.hasCause(): Boolean {
    var current: Throwable? = this
    while (current != null) {
        if (current is T) return true
        current = current.cause
    }
    return false
}
