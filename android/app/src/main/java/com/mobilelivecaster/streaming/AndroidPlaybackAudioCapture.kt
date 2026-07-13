package com.mobilelivecaster.streaming

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.os.Build
import androidx.annotation.RequiresApi
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.max

internal data class AndroidPlaybackAudioCaptureSnapshot(
    val status: String,
    val backend: String,
    val sampleRate: Int,
    val capturedFrames: Long,
    val droppedFrames: Long,
    val underrunFrames: Long,
    val bufferedFrames: Int,
    val lastError: String
)

internal data class AndroidPlaybackAudioReadResult(
    val bytesRead: Int?,
    val failureMessage: String
)

internal fun readAndroidPlaybackAudioSafely(read: () -> Int): AndroidPlaybackAudioReadResult =
    try {
        AndroidPlaybackAudioReadResult(bytesRead = read(), failureMessage = "")
    } catch (error: Throwable) {
        AndroidPlaybackAudioReadResult(bytesRead = null, failureMessage = safePlaybackAudioCaptureMessage(error))
    }

private fun safePlaybackAudioCaptureMessage(error: Throwable): String =
    (error.message ?: error.javaClass.simpleName).take(160)

internal class AndroidPlaybackAudioCapture private constructor(
    private val audioRecord: AudioRecord?,
    private val sampleRate: Int,
    private val frameSizeBytes: Int,
    private val readBufferSizeBytes: Int,
    initialStatus: String,
    initialError: String
) {
    companion object {
        private const val BACKEND = "android-audio-playback-capture"
        private const val MAX_BUFFERED_AUDIO_MILLIS = 500
        private const val MAX_READ_AHEAD_CHUNKS = 3

        @SuppressLint("MissingPermission")
        fun create(
            mediaProjection: MediaProjection,
            sampleRate: Int,
            channelMask: Int,
            channelCount: Int,
            readBufferSizeBytes: Int
        ): AndroidPlaybackAudioCapture {
            val frameSizeBytes = channelCount * 2
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                return AndroidPlaybackAudioCapture(
                    audioRecord = null,
                    sampleRate = sampleRate,
                    frameSizeBytes = frameSizeBytes,
                    readBufferSizeBytes = readBufferSizeBytes,
                    initialStatus = "unsupported",
                    initialError = "Playback audio capture requires Android 10 or newer."
                )
            }
            return createApi29(
                mediaProjection,
                sampleRate,
                channelMask,
                channelCount,
                readBufferSizeBytes
            )
        }

        @RequiresApi(Build.VERSION_CODES.Q)
        @SuppressLint("MissingPermission")
        private fun createApi29(
            mediaProjection: MediaProjection,
            sampleRate: Int,
            channelMask: Int,
            channelCount: Int,
            readBufferSizeBytes: Int
        ): AndroidPlaybackAudioCapture {
            val frameSizeBytes = channelCount * 2
            return try {
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
                require(record.state == AudioRecord.STATE_INITIALIZED) {
                    "Playback AudioRecord initialization failed"
                }
                AndroidPlaybackAudioCapture(
                    audioRecord = record,
                    sampleRate = sampleRate,
                    frameSizeBytes = frameSizeBytes,
                    readBufferSizeBytes = readBufferSizeBytes,
                    initialStatus = "ready",
                    initialError = ""
                )
            } catch (error: Throwable) {
                AndroidPlaybackAudioCapture(
                    audioRecord = null,
                    sampleRate = sampleRate,
                    frameSizeBytes = frameSizeBytes,
                    readBufferSizeBytes = readBufferSizeBytes,
                    initialStatus = "failed",
                    initialError = safePlaybackAudioCaptureMessage(error)
                )
            }
        }
    }

    private val running = AtomicBoolean(false)
    private val capturedFrames = AtomicLong(0L)
    private val droppedFrames = AtomicLong(0L)
    private val underrunFrames = AtomicLong(0L)
    private val ringBuffer = PcmByteRingBuffer(
        capacityBytes = ((sampleRate.toLong() * frameSizeBytes * MAX_BUFFERED_AUDIO_MILLIS) / 1_000L).toInt(),
        frameSizeBytes = frameSizeBytes
    )
    @Volatile private var status = initialStatus
    @Volatile private var lastError = initialError
    private var readerThread: Thread? = null

    fun start() {
        val record = audioRecord ?: return
        if (!running.compareAndSet(false, true)) {
            return
        }
        try {
            record.startRecording()
            require(record.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                "Playback AudioRecord did not enter recording state"
            }
            status = "capturing"
            lastError = ""
            readerThread = Thread(::readLoop, "MLC-Playback-Audio").also { it.start() }
        } catch (error: Throwable) {
            running.set(false)
            status = "failed"
            lastError = safePlaybackAudioCaptureMessage(error)
            runCatching { record.release() }
        }
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

    fun snapshot(): AndroidPlaybackAudioCaptureSnapshot = AndroidPlaybackAudioCaptureSnapshot(
        status = status,
        backend = if (audioRecord == null) "none" else BACKEND,
        sampleRate = sampleRate,
        capturedFrames = capturedFrames.get(),
        droppedFrames = droppedFrames.get(),
        underrunFrames = underrunFrames.get(),
        bufferedFrames = ringBuffer.sizeBytes() / frameSizeBytes,
        lastError = lastError
    )

    fun stop() {
        running.set(false)
        audioRecord?.let { record ->
            runCatching {
                if (record.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                    record.stop()
                }
            }
        }
        readerThread?.let { thread ->
            if (Thread.currentThread() !== thread) {
                runCatching { thread.join(700) }
            }
        }
        readerThread = null
        audioRecord?.let { record -> runCatching { record.release() } }
        ringBuffer.clear()
        if (status != "failed" && status != "unsupported") {
            status = "stopped"
        }
    }

    private fun readLoop() {
        val record = audioRecord ?: return
        val readBuffer = ByteArray(readBufferSizeBytes)
        while (running.get()) {
            val readResult = readAndroidPlaybackAudioSafely {
                record.read(readBuffer, 0, readBuffer.size, AudioRecord.READ_BLOCKING)
            }
            val bytesRead = readResult.bytesRead
            if (bytesRead == null) {
                if (running.get()) {
                    status = "failed"
                    lastError = readResult.failureMessage
                }
                running.set(false)
                break
            }
            if (bytesRead > 0) {
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
            if (!running.get()) {
                break
            }
            if (bytesRead == 0) {
                Thread.yield()
                continue
            }
            if (bytesRead < 0) {
                status = "failed"
                lastError = "Playback AudioRecord read failed ($bytesRead)"
            }
            running.set(false)
        }
    }
}

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
