package com.mobilelivecaster.streaming

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.view.Surface

object AndroidMediaCodecProbe {
    private const val VIDEO_MIME = MediaFormat.MIMETYPE_VIDEO_AVC
    private const val AUDIO_MIME = MediaFormat.MIMETYPE_AUDIO_AAC
    private const val VIDEO_BACKEND = "mediacodec-h264"
    private const val AUDIO_BACKEND = "mediacodec-aac"
    private const val AUDIO_SAMPLE_RATE = 44_100
    private const val AUDIO_CHANNEL_COUNT = 2

    fun inspect(profile: LiveCasterProfile): NativeRuntimeEncoderProbe = runCatching {
        inspectCodecs(profile)
    }.getOrElse { error ->
        NativeRuntimeEncoderProbe(
            status = "fail",
            checkedAt = System.currentTimeMillis(),
            videoBackend = "none",
            audioBackend = "none",
            videoMime = VIDEO_MIME,
            audioMime = AUDIO_MIME,
            videoWidth = profile.width,
            videoHeight = profile.height,
            videoFps = profile.fps,
            audioSampleRate = AUDIO_SAMPLE_RATE,
            audioChannelCount = AUDIO_CHANNEL_COUNT,
            message = "MediaCodec encoder probe failed before configuration: ${safeMessage(error)}"
        )
    }

    private fun inspectCodecs(profile: LiveCasterProfile): NativeRuntimeEncoderProbe {
        val video = inspectVideo(profile)
        val audio = inspectAudio(profile)
        val passed = video.configured && audio.configured
        val failures = listOf(video.message, audio.message).filter { it.isNotBlank() && !it.startsWith("Configured") }

        return NativeRuntimeEncoderProbe(
            status = if (passed) "pass" else "fail",
            checkedAt = System.currentTimeMillis(),
            videoBackend = if (video.configured) VIDEO_BACKEND else "none",
            audioBackend = if (audio.configured) AUDIO_BACKEND else "none",
            videoCodecName = video.codecName,
            audioCodecName = audio.codecName,
            videoMime = VIDEO_MIME,
            audioMime = AUDIO_MIME,
            videoConfigured = video.configured,
            audioConfigured = audio.configured,
            videoColorFormat = video.colorFormat,
            videoBitrateMode = video.bitrateMode,
            videoWidth = profile.width,
            videoHeight = profile.height,
            videoFps = profile.fps,
            audioSampleRate = AUDIO_SAMPLE_RATE,
            audioChannelCount = AUDIO_CHANNEL_COUNT,
            message = if (passed) {
                "Configured first-party MediaCodec H.264/AAC encoders for the requested stream profile."
            } else {
                "MediaCodec encoder probe failed: ${failures.joinToString("; ").ifBlank { "unknown failure" }}"
            }
        )
    }

    private fun inspectVideo(profile: LiveCasterProfile): CodecProbeResult {
        val codecInfo = findEncoder(VIDEO_MIME)
            ?: return CodecProbeResult(message = "No MediaCodec H.264 encoder is available")
        return runCatching {
            val capabilities = codecInfo.getCapabilitiesForType(VIDEO_MIME)
            val colorFormat = capabilities.colorFormats.firstOrNull {
                it == MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface
            } ?: return CodecProbeResult(
                codecName = codecInfo.name,
                message = "MediaCodec H.264 encoder ${codecInfo.name} does not expose surface input"
            )
            val videoCapabilities = capabilities.videoCapabilities ?: return CodecProbeResult(
                codecName = codecInfo.name,
                colorFormat = colorFormatName(colorFormat),
                message = "MediaCodec H.264 encoder ${codecInfo.name} does not expose video capabilities"
            )
            val sizeSupported = videoCapabilities.isSizeSupported(profile.width, profile.height)
            val rateSupported = videoCapabilities.areSizeAndRateSupported(
                profile.width,
                profile.height,
                profile.fps.toDouble()
            )
            val bitrateSupported = videoCapabilities.bitrateRange.contains(profile.videoBitrate)
            if (!sizeSupported || !rateSupported || !bitrateSupported) {
                return CodecProbeResult(
                    codecName = codecInfo.name,
                    colorFormat = colorFormatName(colorFormat),
                    bitrateMode = supportedBitrateMode(capabilities),
                    message = "MediaCodec H.264 encoder ${codecInfo.name} does not support ${profile.width}x${profile.height}@${profile.fps} ${profile.videoBitrate}bps"
                )
            }

            val bitrateMode = supportedBitrateMode(capabilities)
            configureVideoEncoder(codecInfo.name, profile, bitrateMode)
            CodecProbeResult(
                codecName = codecInfo.name,
                configured = true,
                colorFormat = colorFormatName(colorFormat),
                bitrateMode = bitrateMode,
                message = "Configured MediaCodec H.264 encoder ${codecInfo.name}"
            )
        }.getOrElse { error ->
            CodecProbeResult(
                codecName = codecInfo.name,
                message = "MediaCodec H.264 encoder ${codecInfo.name} configure failed: ${safeMessage(error)}"
            )
        }
    }

    private fun inspectAudio(profile: LiveCasterProfile): CodecProbeResult {
        val codecInfo = findEncoder(AUDIO_MIME)
            ?: return CodecProbeResult(message = "No MediaCodec AAC encoder is available")
        return runCatching {
            val capabilities = codecInfo.getCapabilitiesForType(AUDIO_MIME)
            val audioCapabilities = capabilities.audioCapabilities ?: return CodecProbeResult(
                codecName = codecInfo.name,
                message = "MediaCodec AAC encoder ${codecInfo.name} does not expose audio capabilities"
            )
            val sampleRateSupported = audioCapabilities.isSampleRateSupported(AUDIO_SAMPLE_RATE)
            val channelCountSupported = audioCapabilities.maxInputChannelCount >= AUDIO_CHANNEL_COUNT
            val bitrateSupported = audioCapabilities.bitrateRange.contains(profile.audioBitrate)
            if (!sampleRateSupported || !channelCountSupported || !bitrateSupported) {
                return CodecProbeResult(
                    codecName = codecInfo.name,
                    message = "MediaCodec AAC encoder ${codecInfo.name} does not support ${AUDIO_SAMPLE_RATE}Hz/${AUDIO_CHANNEL_COUNT}ch ${profile.audioBitrate}bps"
                )
            }

            configureAudioEncoder(codecInfo.name, profile)
            CodecProbeResult(
                codecName = codecInfo.name,
                configured = true,
                message = "Configured MediaCodec AAC encoder ${codecInfo.name}"
            )
        }.getOrElse { error ->
            CodecProbeResult(
                codecName = codecInfo.name,
                message = "MediaCodec AAC encoder ${codecInfo.name} configure failed: ${safeMessage(error)}"
            )
        }
    }

    private fun findEncoder(mime: String): MediaCodecInfo? =
        MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.firstOrNull { codecInfo ->
            codecInfo.isEncoder && codecInfo.supportedTypes.any { it.equals(mime, ignoreCase = true) }
        }

    private fun configureVideoEncoder(codecName: String, profile: LiveCasterProfile, bitrateMode: String) {
        var codec: MediaCodec? = null
        var surface: Surface? = null
        try {
            val format = MediaFormat.createVideoFormat(VIDEO_MIME, profile.width, profile.height).apply {
                setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
                setInteger(MediaFormat.KEY_BIT_RATE, profile.videoBitrate)
                setInteger(MediaFormat.KEY_FRAME_RATE, profile.fps)
                setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
                bitrateModeValue(bitrateMode)?.let { setInteger(MediaFormat.KEY_BITRATE_MODE, it) }
            }
            codec = MediaCodec.createByCodecName(codecName)
            codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            surface = codec.createInputSurface()
        } finally {
            runCatching { surface?.release() }
            runCatching { codec?.release() }
        }
    }

    private fun configureAudioEncoder(codecName: String, profile: LiveCasterProfile) {
        var codec: MediaCodec? = null
        try {
            val format = MediaFormat.createAudioFormat(AUDIO_MIME, AUDIO_SAMPLE_RATE, AUDIO_CHANNEL_COUNT).apply {
                setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
                setInteger(MediaFormat.KEY_BIT_RATE, profile.audioBitrate)
            }
            codec = MediaCodec.createByCodecName(codecName)
            codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        } finally {
            runCatching { codec?.release() }
        }
    }

    private fun supportedBitrateMode(capabilities: MediaCodecInfo.CodecCapabilities): String {
        val encoderCapabilities = capabilities.encoderCapabilities ?: return "default"
        return when {
            encoderCapabilities.isBitrateModeSupported(MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR) -> "cbr"
            encoderCapabilities.isBitrateModeSupported(MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR) -> "vbr"
            encoderCapabilities.isBitrateModeSupported(MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CQ) -> "cq"
            else -> "default"
        }
    }

    private fun bitrateModeValue(mode: String): Int? = when (mode) {
        "cbr" -> MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR
        "vbr" -> MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR
        "cq" -> MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CQ
        else -> null
    }

    private fun colorFormatName(format: Int): String = when (format) {
        MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface -> "surface"
        else -> format.toString()
    }

    private fun safeMessage(error: Throwable): String = (error.message ?: error.javaClass.simpleName).take(160)

    private data class CodecProbeResult(
        val codecName: String = "",
        val configured: Boolean = false,
        val colorFormat: String = "",
        val bitrateMode: String = "",
        val message: String = ""
    )
}
