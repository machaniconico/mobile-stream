package com.mobilelivecaster.streaming

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.AudioRecordingConfiguration
import android.media.AudioRouting
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.annotation.RequiresApi
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.max

internal data class AndroidPlaybackAudioCaptureSnapshot(
    val status: String,
    val backend: String,
    val sampleRate: Int,
    val capturedFrames: Long,
    val droppedFrames: Long,
    val underrunFrames: Long,
    val bufferedFrames: Int,
    val lifecycleEventCount: Long,
    val routeChangeCount: Long,
    val interruptionCount: Long,
    val recoveryCount: Long,
    val recoveryFailureCount: Long,
    val unrecoveredEventCount: Long,
    val lastRecoveryReason: String,
    val lastRecoveryAt: Long,
    val suspended: Boolean,
    val lastError: String
)

internal data class AndroidPlaybackAudioReadResult(
    val bytesRead: Int?,
    val failureMessage: String
)

internal fun readAndroidPlaybackAudioSafely(read: () -> Int): AndroidPlaybackAudioReadResult =
    try {
        AndroidPlaybackAudioReadResult(bytesRead = read(), failureMessage = "")
    } catch (error: Exception) {
        AndroidPlaybackAudioReadResult(bytesRead = null, failureMessage = safePlaybackAudioCaptureMessage(error))
    }

private fun safePlaybackAudioCaptureMessage(error: Throwable): String =
    (error.message ?: error.javaClass.simpleName).take(160)

internal class AndroidPlaybackAudioCapture private constructor(
    context: Context,
    private val audioRecordFactory: (() -> AudioRecord)?,
    initialAudioRecord: AudioRecord?,
    private val sampleRate: Int,
    private val frameSizeBytes: Int,
    private val readBufferSizeBytes: Int,
    initialStatus: String,
    initialError: String,
    private val onFatalError: (String) -> Unit
) {
    companion object {
        private const val BACKEND = "android-audio-playback-capture"
        private const val MAX_BUFFERED_AUDIO_MILLIS = 500
        private const val MAX_READ_AHEAD_CHUNKS = 3

        @SuppressLint("MissingPermission")
        fun create(
            context: Context,
            mediaProjection: MediaProjection,
            sampleRate: Int,
            channelMask: Int,
            channelCount: Int,
            readBufferSizeBytes: Int,
            onFatalError: (String) -> Unit = {}
        ): AndroidPlaybackAudioCapture {
            val frameSizeBytes = channelCount * 2
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                return AndroidPlaybackAudioCapture(
                    context = context,
                    audioRecordFactory = null,
                    initialAudioRecord = null,
                    sampleRate = sampleRate,
                    frameSizeBytes = frameSizeBytes,
                    readBufferSizeBytes = readBufferSizeBytes,
                    initialStatus = "unsupported",
                    initialError = "Playback audio capture requires Android 10 or newer.",
                    onFatalError = onFatalError
                )
            }
            val recordFactory = {
                createApi29AudioRecord(mediaProjection, sampleRate, channelMask, channelCount, readBufferSizeBytes)
            }
            return AndroidPlaybackAudioCapture(
                context = context,
                audioRecordFactory = recordFactory,
                initialAudioRecord = null,
                sampleRate = sampleRate,
                frameSizeBytes = frameSizeBytes,
                readBufferSizeBytes = readBufferSizeBytes,
                initialStatus = "ready",
                initialError = "",
                onFatalError = onFatalError
            )
        }

        @RequiresApi(Build.VERSION_CODES.Q)
        @SuppressLint("MissingPermission")
        private fun createApi29AudioRecord(
            mediaProjection: MediaProjection,
            sampleRate: Int,
            channelMask: Int,
            channelCount: Int,
            readBufferSizeBytes: Int
        ): AudioRecord {
            val captureConfiguration = AudioPlaybackCaptureConfiguration.Builder(mediaProjection)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .build()
            val format = AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(sampleRate)
                .setChannelMask(channelMask)
                .build()
            val minimumBufferSize = AudioRecord.getMinBufferSize(
                sampleRate,
                channelMask,
                AudioFormat.ENCODING_PCM_16BIT
            )
            require(minimumBufferSize > 0) { "Playback AudioRecord buffer size is unavailable" }
            val record = AudioRecord.Builder()
                .setAudioFormat(format)
                .setBufferSizeInBytes(max(minimumBufferSize, readBufferSizeBytes * 4))
                .setAudioPlaybackCaptureConfig(captureConfiguration)
                .build()
            return record
        }
    }

    private val appContext = context.applicationContext
    private val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val running = AtomicBoolean(false)
    private val capturedFrames = AtomicLong(0L)
    private val droppedFrames = AtomicLong(0L)
    private val underrunFrames = AtomicLong(0L)
    private val lifecycleGeneration = AtomicLong(0L)
    private val ringBuffer = PcmByteRingBuffer(
        capacityBytes = ((sampleRate.toLong() * frameSizeBytes * MAX_BUFFERED_AUDIO_MILLIS) / 1_000L).toInt(),
        frameSizeBytes = frameSizeBytes
    )
    private val recoveryState = AndroidAudioCaptureRecoveryState()
    private val ownerReleaseState = AndroidNativeOwnerReleaseState()
    private val workerFatalError = AtomicReference<Error?>(null)
    private val recordLock = Any()
    private val readerLock = Any()
    private val modeListenerLock = Any()
    private var initialRecord: AudioRecord? = initialAudioRecord
    private var activeRecord: PlaybackAudioRecordHandle? = null
    @Volatile private var started = false
    @Volatile private var statusBeforeStart = initialStatus
    @Volatile private var lastError = initialError
    @Volatile private var frameworkSilenced = false
    @Volatile private var audioModeSilenced = false
    private var readerThread: Thread? = null
    private var modeChangedListener: PlaybackModeChangedRegistration? = null
    private val fatalErrorReported = AtomicBoolean(false)

    fun start() {
        if (audioRecordFactory == null) return
        if (running.get()) return
        synchronized(readerLock) {
            if (readerThread?.isAlive == true) {
                lastError = "Previous playback reader is still stopping"
                return
            }
        }
        if (!running.compareAndSet(false, true)) {
            return
        }
        val sessionGeneration = lifecycleGeneration.incrementAndGet()
        fatalErrorReported.set(false)
        started = true
        capturedFrames.set(0L)
        droppedFrames.set(0L)
        underrunFrames.set(0L)
        ringBuffer.clear()
        lastError = ""
        recoveryState.activate(capturing = false)
        registerAudioModeListener(sessionGeneration)
        recordCaptureSilenceState()
        recoveryState.requestInitialCapture()
        val thread = Thread({ readLoop(sessionGeneration) }, "MLC-Playback-Audio")
        synchronized(readerLock) {
            readerThread = thread
        }
        thread.start()
    }

    fun readInto(destination: ByteArray, requestedBytes: Int): Int {
        val alignedRequestedBytes = requestedBytes
            .coerceIn(0, destination.size)
            .let { it - it % frameSizeBytes }
        if (alignedRequestedBytes == 0) {
            return 0
        }
        destination.fill(0, 0, alignedRequestedBytes)
        val trimmedBytes = ringBuffer.trimTo(alignedRequestedBytes * MAX_READ_AHEAD_CHUNKS)
        if (trimmedBytes > 0) {
            droppedFrames.addAndGet((trimmedBytes / frameSizeBytes).toLong())
        }
        val bytesRead = ringBuffer.read(destination, alignedRequestedBytes)
        if (bytesRead < alignedRequestedBytes) {
            underrunFrames.addAndGet(((alignedRequestedBytes - bytesRead) / frameSizeBytes).toLong())
        }
        return bytesRead
    }

    fun snapshot(): AndroidPlaybackAudioCaptureSnapshot {
        val recovery = recoveryState.snapshot()
        return AndroidPlaybackAudioCaptureSnapshot(
            status = when {
                audioRecordFactory == null -> statusBeforeStart
                !started -> statusBeforeStart
                else -> recovery.status
            },
            backend = if (audioRecordFactory == null) "none" else BACKEND,
            sampleRate = sampleRate,
            capturedFrames = capturedFrames.get(),
            droppedFrames = droppedFrames.get(),
            underrunFrames = underrunFrames.get(),
            bufferedFrames = ringBuffer.sizeBytes() / frameSizeBytes,
            lifecycleEventCount = recovery.lifecycleEventCount,
            routeChangeCount = recovery.routeChangeCount,
            interruptionCount = recovery.interruptionCount,
            recoveryCount = recovery.recoveryCount,
            recoveryFailureCount = recovery.recoveryFailureCount,
            unrecoveredEventCount = recovery.unrecoveredEventCount,
            lastRecoveryReason = recovery.lastRecoveryReason,
            lastRecoveryAt = recovery.lastRecoveryAt,
            suspended = recovery.suspended,
            lastError = lastError
        )
    }

    fun ownerReleaseFailure(): Throwable? = workerFatalError.get() ?: ownerReleaseState.failure()

    fun stop() {
        running.set(false)
        lifecycleGeneration.incrementAndGet()
        recoveryState.deactivate()
        unregisterAudioModeListener()
        synchronized(readerLock) { readerThread }?.interrupt()
        ringBuffer.clear()
        if (statusBeforeStart != "unsupported") statusBeforeStart = "stopped"
    }

    fun awaitStopped(deadlineNanos: Long): Boolean {
        val thread = synchronized(readerLock) { readerThread }
        if (thread != null) {
            if (Thread.currentThread() === thread) return false
            joinThreadUntil(thread, deadlineNanos)
            if (thread.isAlive) return false
        }
        releaseInitialRecord()
        return true
    }

    private fun readLoop(sessionGeneration: Long) {
        val readBuffer = ByteArray(readBufferSizeBytes)
        try {
            while (isSessionActive(sessionGeneration)) {
                val record = ensureAudioRecord(sessionGeneration)
                if (record == null) {
                    waitForReader(sessionGeneration, 20L)
                    continue
                }
                val readResult = try {
                    readAndroidPlaybackAudioSafely {
                        record.read(readBuffer, 0, readBuffer.size, AudioRecord.READ_NON_BLOCKING)
                    }
                } catch (error: Error) {
                    reportFatalError(error)
                    throw error
                }
                if (!isSessionActive(sessionGeneration) || !isCurrentRecord(record, sessionGeneration)) break
                val bytesRead = readResult.bytesRead
                if (bytesRead == null) {
                    handleReadFailure(record, recoveryState.recordReadException(), readResult.failureMessage)
                    continue
                }
                if (bytesRead > 0) {
                    val pending = recoveryState.recordReadResult(bytesRead)
                    if (pending != null) {
                        ringBuffer.clear()
                        detachRecord(record)?.let(::releaseRecord)
                        continue
                    }
                    if (recoveryState.snapshot().status != "capturing") {
                        continue
                    }
                    val alignedBytesRead = bytesRead - bytesRead % frameSizeBytes
                    if (alignedBytesRead > 0) {
                        capturedFrames.addAndGet((alignedBytesRead / frameSizeBytes).toLong())
                        val discardedBytes = ringBuffer.write(readBuffer, alignedBytesRead)
                        if (discardedBytes > 0) {
                            droppedFrames.addAndGet((discardedBytes / frameSizeBytes).toLong())
                        }
                    }
                    continue
                }
                if (bytesRead == 0) {
                    val pending = recoveryState.recordReadResult(0)
                    if (pending != null) detachRecord(record)?.let(::releaseRecord)
                    waitForReader(sessionGeneration, 5L)
                    continue
                }
                handleReadFailure(
                    record,
                    recoveryState.recordReadResult(bytesRead),
                    "Playback AudioRecord read failed ($bytesRead)"
                )
            }
        } catch (error: Error) {
            workerFatalError.compareAndSet(null, error)
            throw error
        } finally {
            detachRecordForSession(sessionGeneration)?.let(::releaseRecord)
            releaseInitialRecord()
            synchronized(readerLock) {
                if (readerThread === Thread.currentThread()) readerThread = null
            }
        }
    }

    private fun ensureAudioRecord(sessionGeneration: Long): AudioRecord? {
        if (!isSessionActive(sessionGeneration)) return null
        if (recoveryState.snapshot().status == "failed") {
            detachRecordForSession(sessionGeneration)?.let(::releaseRecord)
            return null
        }
        val current = synchronized(recordLock) { activeRecord }
        if (current != null) {
            val recording = try {
                current.record.state == AudioRecord.STATE_INITIALIZED &&
                    current.record.recordingState == AudioRecord.RECORDSTATE_RECORDING
            } catch (_: Exception) {
                false
            }
            if (!recording) {
                recoveryState.recordStopped()
                detachRecord(current.record)?.let(::releaseRecord)
            }
        }

        val request = recoveryState.pendingRecovery()
        synchronized(recordLock) { activeRecord }?.let { handle ->
            if (request == null) return handle.record
            detachRecord(handle.record)?.let(::releaseRecord)
        }
        if (request == null || !isSessionActive(sessionGeneration)) return null

        val factory = audioRecordFactory ?: return null
        return try {
            val record = synchronized(recordLock) {
                initialRecord.also { initialRecord = null }
            } ?: factory()
            val handle = startAudioRecord(record, sessionGeneration)
            if (!attachRecord(handle)) {
                releaseRecord(handle)
                null
            } else if (recoveryState.recordRecoverySuccess(request, handle.routedDeviceId)) {
                ringBuffer.clear()
                lastError = ""
                recordCurrentSilenced(handle.record)
                handle.record
            } else {
                detachRecord(handle.record)?.let(::releaseRecord)
                null
            }
        } catch (error: Throwable) {
            lastError = safePlaybackAudioCaptureMessage(error)
            if (error is Error) {
                reportFatalError(error)
                throw error
            }
            recoveryState.recordRecoveryFailure(request)
            null
        }
    }

    private fun handleReadFailure(
        record: AudioRecord,
        request: AndroidAudioCaptureRecoveryRequest?,
        message: String
    ) {
        lastError = message.take(160)
        if (request != null || recoveryState.snapshot().status == "failed") {
            ringBuffer.clear()
            detachRecord(record)?.let(::releaseRecord)
        }
    }

    private fun startAudioRecord(record: AudioRecord, sessionGeneration: Long): PlaybackAudioRecordHandle {
        val routingListener = AudioRouting.OnRoutingChangedListener { routing ->
            if (routing === record && isCurrentRecord(record, sessionGeneration)) {
                val routeId = try {
                    record.routedDevice?.id
                } catch (_: Exception) {
                    null
                }
                recoveryState.recordRoute(routeId)
            }
        }
        val recordingCallback = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            object : AudioManager.AudioRecordingCallback() {
                override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {
                    if (!isCurrentRecord(record, sessionGeneration)) return
                    val configuration = try {
                        record.activeRecordingConfiguration
                    } catch (_: Exception) {
                        null
                    } ?: return
                    frameworkSilenced = configuration.isClientSilenced
                    recoveryState.recordSilenced(frameworkSilenced)
                }
            }
        } else {
            null
        }
        val handle = PlaybackAudioRecordHandle(
            record = record,
            routingListener = routingListener,
            recordingCallback = recordingCallback,
            routedDeviceId = null,
            sessionGeneration = sessionGeneration
        )
        try {
            require(record.state == AudioRecord.STATE_INITIALIZED) {
                "Playback AudioRecord initialization failed"
            }
            record.addOnRoutingChangedListener(routingListener, Handler(Looper.getMainLooper()))
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && recordingCallback != null) {
                record.registerAudioRecordingCallback(appContext.mainExecutor, recordingCallback)
            }
            record.startRecording()
            require(record.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                "Playback AudioRecord did not enter recording state"
            }
            val routeId = try {
                record.routedDevice?.id
            } catch (_: Exception) {
                null
            }
            return handle.copy(routedDeviceId = routeId)
        } catch (error: Throwable) {
            releaseRecord(handle)
            throw error
        }
    }

    private fun attachRecord(handle: PlaybackAudioRecordHandle): Boolean = synchronized(recordLock) {
        if (!isSessionActive(handle.sessionGeneration) || activeRecord != null) return@synchronized false
        activeRecord = handle
        true
    }

    private fun detachRecord(expected: AudioRecord? = null): PlaybackAudioRecordHandle? = synchronized(recordLock) {
        val current = activeRecord ?: return@synchronized null
        if (expected != null && current.record !== expected) return@synchronized null
        activeRecord = null
        current
    }

    private fun detachRecordForSession(sessionGeneration: Long): PlaybackAudioRecordHandle? = synchronized(recordLock) {
        val current = activeRecord ?: return@synchronized null
        if (current.sessionGeneration != sessionGeneration) return@synchronized null
        activeRecord = null
        current
    }

    private fun isCurrentRecord(record: AudioRecord, sessionGeneration: Long): Boolean = synchronized(recordLock) {
        isSessionActive(sessionGeneration) &&
            activeRecord?.record === record &&
            activeRecord?.sessionGeneration == sessionGeneration
    }

    private fun recordCurrentSilenced(record: AudioRecord) {
        val sessionGeneration = synchronized(recordLock) {
            activeRecord?.takeIf { it.record === record }?.sessionGeneration
        } ?: return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || !isCurrentRecord(record, sessionGeneration)) return
        val configuration = try {
            record.activeRecordingConfiguration
        } catch (_: Exception) {
            null
        } ?: return
        frameworkSilenced = configuration.isClientSilenced
        recoveryState.recordSilenced(frameworkSilenced)
    }

    private fun registerAudioModeListener(sessionGeneration: Long) {
        audioModeSilenced = try {
            audioManager.mode != AudioManager.MODE_NORMAL
        } catch (_: Exception) {
            false
        }
        recoveryState.recordPolicySilenced(audioModeSilenced)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        val listener = AudioManager.OnModeChangedListener { mode ->
            if (!isSessionActive(sessionGeneration)) return@OnModeChangedListener
            audioModeSilenced = mode != AudioManager.MODE_NORMAL
            recoveryState.recordPolicySilenced(audioModeSilenced)
        }
        try {
            synchronized(modeListenerLock) {
                if (!isSessionActive(sessionGeneration) || modeChangedListener != null) return@synchronized
                audioManager.addOnModeChangedListener(appContext.mainExecutor, listener)
                modeChangedListener = PlaybackModeChangedRegistration(listener, sessionGeneration)
            }
        } catch (error: Exception) {
            lastError = safePlaybackAudioCaptureMessage(error)
        }
    }

    private fun unregisterAudioModeListener() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            synchronized(modeListenerLock) {
                modeChangedListener.also { modeChangedListener = null }
            }?.let { registration ->
                ownerReleaseState.execute(
                    { audioManager.removeOnModeChangedListener(registration.listener) }
                )
            }
        }
        frameworkSilenced = false
        audioModeSilenced = false
    }

    private fun recordCaptureSilenceState() {
        recoveryState.recordSilenced(frameworkSilenced)
        recoveryState.recordPolicySilenced(audioModeSilenced)
    }

    private fun releaseRecord(handle: PlaybackAudioRecordHandle) {
        ownerReleaseState.execute(
            { handle.record.removeOnRoutingChangedListener(handle.routingListener) },
            {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && handle.recordingCallback != null) {
                    handle.record.unregisterAudioRecordingCallback(handle.recordingCallback)
                }
            },
            {
                if (handle.record.recordingState == AudioRecord.RECORDSTATE_RECORDING) handle.record.stop()
            },
            { handle.record.release() }
        )
    }

    private fun isSessionActive(sessionGeneration: Long): Boolean =
        running.get() && lifecycleGeneration.get() == sessionGeneration

    private fun waitForReader(sessionGeneration: Long, delayMillis: Long) {
        if (!isSessionActive(sessionGeneration)) return
        try {
            Thread.sleep(delayMillis)
        } catch (_: InterruptedException) {
            // stop() invalidates the session before interrupting the reader.
        }
    }

    private fun releaseUnstartedRecord(record: AudioRecord) {
        ownerReleaseState.execute(
            {
                if (record.recordingState == AudioRecord.RECORDSTATE_RECORDING) record.stop()
            },
            { record.release() }
        )
    }

    private fun releaseInitialRecord() {
        synchronized(recordLock) {
            initialRecord.also { initialRecord = null }
        }?.let(::releaseUnstartedRecord)
    }

    private fun reportFatalError(error: Error) {
        workerFatalError.compareAndSet(null, error)
        val message = safePlaybackAudioCaptureMessage(error)
        lastError = message
        recoveryState.recordFatal("capture-fatal-error")
        running.set(false)
        lifecycleGeneration.incrementAndGet()
        ringBuffer.clear()
        try {
            unregisterAudioModeListener()
        } catch (cleanupError: Error) {
            workerFatalError.compareAndSet(null, cleanupError)
            if (cleanupError !== error) error.addSuppressed(cleanupError)
        }
        synchronized(readerLock) { readerThread }?.interrupt()
        if (fatalErrorReported.compareAndSet(false, true)) {
            try {
                onFatalError(message)
            } catch (callbackError: Error) {
                if (callbackError !== error) error.addSuppressed(callbackError)
            } catch (_: Exception) {
                // The original fatal owner error remains authoritative.
            }
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

}

private data class PlaybackAudioRecordHandle(
    val record: AudioRecord,
    val routingListener: AudioRouting.OnRoutingChangedListener,
    val recordingCallback: AudioManager.AudioRecordingCallback?,
    val routedDeviceId: Int?,
    val sessionGeneration: Long
)

private data class PlaybackModeChangedRegistration(
    val listener: AudioManager.OnModeChangedListener,
    val sessionGeneration: Long
)

internal class PcmByteRingBuffer(capacityBytes: Int, private val frameSizeBytes: Int) {
    init {
        require(frameSizeBytes > 0) { "PCM frame size must be positive" }
        require(capacityBytes >= frameSizeBytes) { "PCM ring capacity must contain at least one frame" }
    }

    private val buffer = ByteArray(capacityBytes - capacityBytes % frameSizeBytes)
    private var readIndex = 0
    private var writeIndex = 0
    private var bufferedBytes = 0

    @Synchronized
    fun write(source: ByteArray, length: Int): Int {
        var alignedLength = length.coerceIn(0, source.size)
        alignedLength -= alignedLength % frameSizeBytes
        if (alignedLength == 0) {
            return 0
        }

        var discardedBytes = 0
        var sourceOffset = 0
        if (alignedLength >= buffer.size) {
            discardedBytes = bufferedBytes + alignedLength - buffer.size
            sourceOffset = alignedLength - buffer.size
            alignedLength = buffer.size
            readIndex = 0
            writeIndex = 0
            bufferedBytes = 0
        } else {
            val overflowBytes = (bufferedBytes + alignedLength - buffer.size).coerceAtLeast(0)
            if (overflowBytes > 0) {
                discard(overflowBytes)
                discardedBytes += overflowBytes
            }
        }

        copyIntoRing(source, sourceOffset, alignedLength)
        bufferedBytes += alignedLength
        return discardedBytes
    }

    @Synchronized
    fun read(destination: ByteArray, length: Int): Int {
        var bytesToRead = minOf(length.coerceAtLeast(0), destination.size, bufferedBytes)
        bytesToRead -= bytesToRead % frameSizeBytes
        if (bytesToRead == 0) {
            return 0
        }
        val firstLength = minOf(bytesToRead, buffer.size - readIndex)
        buffer.copyInto(destination, 0, readIndex, readIndex + firstLength)
        val remainingLength = bytesToRead - firstLength
        if (remainingLength > 0) {
            buffer.copyInto(destination, firstLength, 0, remainingLength)
        }
        readIndex = (readIndex + bytesToRead) % buffer.size
        bufferedBytes -= bytesToRead
        return bytesToRead
    }

    @Synchronized
    fun trimTo(maxBytes: Int): Int {
        val alignedMaxBytes = maxBytes.coerceAtLeast(0).let { it - it % frameSizeBytes }
        val bytesToDiscard = (bufferedBytes - alignedMaxBytes).coerceAtLeast(0)
        discard(bytesToDiscard)
        return bytesToDiscard
    }

    @Synchronized
    fun sizeBytes(): Int = bufferedBytes

    @Synchronized
    fun clear() {
        readIndex = 0
        writeIndex = 0
        bufferedBytes = 0
    }

    private fun copyIntoRing(source: ByteArray, sourceOffset: Int, length: Int) {
        val firstLength = minOf(length, buffer.size - writeIndex)
        source.copyInto(buffer, writeIndex, sourceOffset, sourceOffset + firstLength)
        val remainingLength = length - firstLength
        if (remainingLength > 0) {
            source.copyInto(buffer, 0, sourceOffset + firstLength, sourceOffset + length)
        }
        writeIndex = (writeIndex + length) % buffer.size
    }

    private fun discard(length: Int) {
        val alignedLength = minOf(length - length % frameSizeBytes, bufferedBytes)
        if (alignedLength <= 0) {
            return
        }
        readIndex = (readIndex + alignedLength) % buffer.size
        bufferedBytes -= alignedLength
    }
}
