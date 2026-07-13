import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const probe = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidMediaCodecProbe.kt",
  "utf8"
);
const directStream = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidMediaCodecDirectStream.kt",
  "utf8"
);
const runtime = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/LiveCasterModule.kt",
  "utf8"
);
const service = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/MediaProjectionService.kt",
  "utf8"
);

describe("Android native encoder output-format evidence", () => {
  it("retains capability/configuration checks as preflight only", () => {
    expect(probe).toContain("videoCapabilities.isSizeSupported(profile.width, profile.height)");
    expect(probe).toContain("videoCapabilities.areSizeAndRateSupported(");
    expect(probe).toContain("profile.width,\n                profile.height,\n                profile.fps.toDouble()");
    expect(probe).toContain("MediaFormat.createVideoFormat(VIDEO_MIME, profile.width, profile.height)");
    expect(probe).toContain("setInteger(MediaFormat.KEY_FRAME_RATE, profile.fps)");
    expect(probe).toContain("codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)");
    expect(service).toContain("val encoderPreflight = AndroidMediaCodecProbe.inspect(streamProfile)");
    expect(service).not.toContain("encoderProbe = encoderPreflight");
    expect(service).not.toContain("encoderProbe = NativeRuntimeEncoderProbe(");
  });

  it("reads video and audio formats from the active streaming codec instances", () => {
    expect(directStream).toContain("outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED");
    expect(directStream).toContain("val outputFormat = encoder.outputFormat");
    expect(directStream).toContain("recordVideoOutputFormat(encoder, outputFormat)");
    expect(directStream).toContain("recordAudioOutputFormat(encoder, encoder.outputFormat)");
    expect(directStream).toContain("width = outputFormat.positiveInt(MediaFormat.KEY_WIDTH)");
    expect(directStream).toContain("height = outputFormat.positiveInt(MediaFormat.KEY_HEIGHT)");
    expect(directStream).toContain("fps = outputFormat.positiveDouble(MediaFormat.KEY_FRAME_RATE)");
    expect(directStream).toContain("sampleRate = outputFormat.positiveInt(MediaFormat.KEY_SAMPLE_RATE)");
    expect(directStream).toContain("channelCount = outputFormat.positiveInt(MediaFormat.KEY_CHANNEL_COUNT)");
    expect(directStream).not.toContain("videoWidth = currentProfile.width");
    expect(directStream).not.toContain("videoHeight = currentProfile.height");
    expect(directStream).not.toContain("videoFps = currentProfile.fps");
  });

  it("preserves fractional output fps through exact-match proof", () => {
    expect(directStream).toContain("private var videoFps = 0.0");
    expect(directStream).toContain("getFloat(key).toDouble()");
    expect(directStream).toContain("videoFps == requestedVideoFps.toDouble()");
    expect(directStream).toContain("videoFps = videoFps.roundToInt()");
  });

  it("requires configure, start, output format, and encoded output from each same codec", () => {
    expect(directStream).toContain("recordVideoConfigured(encoder, codecName(encoder))");
    expect(directStream).toContain("recordVideoStarted(encoder)");
    expect(directStream).toContain("recordAudioConfigured(activeAudioEncoder, codecName(activeAudioEncoder))");
    expect(directStream).toContain("recordAudioStarted(activeAudioEncoder)");
    expect(directStream).toContain("encoderProbeState.recordVideoEncodedOutput(encoder)");
    expect(directStream).toContain("encoderProbeState.recordAudioEncodedOutput(encoder)");
    expect(directStream).toContain("videoCodecIdentity !== codecIdentity");
    expect(directStream).toContain("audioCodecIdentity !== codecIdentity");
    expect(directStream).toContain("videoEncodedOutputCount > 0L");
    expect(directStream).toContain("audioEncodedOutputCount > 0L");
    expect(directStream).toContain("val activeEncoderInstancesVerified =");
    expect(directStream).toContain("!activeEncoderIdentityMismatch");
    expect(directStream).toContain("activeEncoderInstancesVerified &&");
    expect(directStream).toContain("activeEncoderIdentityMismatch = true");
    expect(directStream).toContain("publisherConfigured &&");
    expect(directStream).toContain('passed -> "pass"');
    expect(runtime).toContain('putBoolean("activeEncoderInstancesVerified", activeEncoderInstancesVerified)');
    expect(runtime).toContain('putDouble("videoEncodedOutputCount", videoEncodedOutputCount.toDouble())');
    expect(runtime).toContain('putDouble("audioEncodedOutputCount", audioEncodedOutputCount.toDouble())');
    expect(runtime).toContain('putBoolean("videoConfigured", videoConfigured)');
    expect(runtime).toContain('putBoolean("audioConfigured", audioConfigured)');
    expect(runtime).toContain('putInt("videoWidth", videoWidth)');
    expect(runtime).toContain('putInt("videoHeight", videoHeight)');
    expect(runtime).toContain('putInt("videoFps", videoFps)');
  });

  it("exports a stopped current probe and retains the last passing active probe for the session", () => {
    const encoderProbeAssignments = service.match(/encoderProbe\s*=/g) ?? [];
    const genericRuntimeUpdate = service.slice(
      service.indexOf("private fun updateNativeRuntimeFromStream("),
      service.indexOf("private fun stopStreamAfterFailure(")
    );
    const activeProbeCapture = service.indexOf("val activeEncoderProbe = try {");
    const directStreamStop = service.indexOf("directStream.stop {", activeProbeCapture);
    const stoppedProbeWrite = service.indexOf(
      "encoderProbe = finalSnapshot.encoderProbe",
      directStreamStop
    );

    expect(encoderProbeAssignments).toHaveLength(3);
    expect(service).toContain("encoderProbe = snapshot?.encoderProbe");
    expect(service).toContain("encoderProbe = finalSnapshot.encoderProbe");
    expect(service).toContain("encoderProbe = activeEncoderProbe");
    expect(service).toContain('lastActiveEncoderProbe = activeEncoderProbe?.takeIf { it.status == "pass" }');
    expect(activeProbeCapture).toBeGreaterThanOrEqual(0);
    expect(activeProbeCapture).toBeLessThan(directStreamStop);
    expect(directStreamStop).toBeLessThan(stoppedProbeWrite);
    expect(genericRuntimeUpdate).not.toContain("encoderProbe =");
    expect(directStream).toContain("encoderProbeState.recordStopped()");
    expect(directStream).toContain("resolvedError.isNotBlank() ||");
    expect(directStream).toContain("stopped ||");
    expect(directStream).toContain("definitiveFormatFailure ||");
    expect(directStream).toContain("publisherVideoBackend == AndroidMediaCodecRtmpPublisher.VIDEO_BACKEND");
    expect(directStream).toContain("publisherAudioBackend == AndroidMediaCodecRtmpPublisher.AUDIO_BACKEND");
    expect(runtime).toContain('encoderProbe?.let { putMap("encoderProbe", it.asWritableMap()) }');
    expect(runtime).toContain(
      'lastActiveEncoderProbe?.let { putMap("lastActiveEncoderProbe", it.asWritableMap()) }'
    );
    expect(runtime).toContain("lastActiveEncoderProbe = lastActiveEncoderProbe ?: current?.lastActiveEncoderProbe");
    expect(runtime).toContain("lastActiveEncoderProbe = current.lastActiveEncoderProbe");
  });
});
