import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const androidEffect = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/MicProcessingEffect.kt",
  "utf8"
);
const androidSession = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/LiveCasterModule.kt",
  "utf8"
);
const androidService = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/MediaProjectionService.kt",
  "utf8"
);
const androidDirectStream = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidMediaCodecDirectStream.kt",
  "utf8"
);
const androidPlaybackCapture = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidPlaybackAudioCapture.kt",
  "utf8"
);
const androidPcmMixer = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/Pcm16AudioMixer.kt",
  "utf8"
);
const androidSpeech = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/LiveCasterSpeechModule.kt",
  "utf8"
);
const iosBroadcast = readFileSync(
  "ios/MobileLiveCasterBroadcastUpload/SampleHandler.swift",
  "utf8"
);
const iosBridge = readFileSync("ios/MobileLiveCaster/LiveCasterBridge.swift", "utf8");
const mobileApp = readFileSync("src/mobile/MobileApp.tsx", "utf8");
const silenceGuard = readFileSync("src/domain/streamAudioSilenceGuard.ts", "utf8");

const levelKeys = [
  "micRmsLevel",
  "micPeakLevel",
  "micSampleCount",
  "micClippedSampleCount",
  "micLevelUpdatedAt",
  "appAudioRmsLevel",
  "appAudioPeakLevel",
  "appAudioSampleCount",
  "appAudioClippedSampleCount",
  "appAudioLevelUpdatedAt",
  "mixedAudioRmsLevel",
  "mixedAudioPeakLevel",
  "mixedAudioSampleCount",
  "mixedAudioClippedSampleCount",
  "mixedAudioLevelUpdatedAt"
];
const playbackCaptureKeys = [
  "playbackCaptureStatus",
  "playbackCaptureBackend",
  "playbackCaptureSampleRate",
  "playbackCapturedFrames",
  "playbackDroppedFrames",
  "playbackUnderrunFrames",
  "playbackBufferedFrames"
];

describe("native audio level metering", () => {
  it("measures Android encoder-bound microphone, app, and mixed PCM", () => {
    expect(androidEffect).toContain("val levelStats = applyVolume(processed, currentMixer.mic.effectiveVolume(), measureLevel = true)");
    expect(androidEffect).toContain("accumulateMicLevelWindow(levelStats)");
    expect(androidEffect).toContain("currentMixer.appAudio.effectiveVolume()");
    expect(androidEffect).toContain("accumulateAppAudioLevelWindow(levelStats)");
    expect(androidEffect).toContain("Pcm16AudioMixer.mix(micBuffer, appAudioBuffer)");
    expect(androidEffect).toContain("accumulateMixedAudioLevelWindow(result.levels)");
    expect(androidEffect).toContain("micLevelWindowTargetSampleCount");
    expect(androidEffect).toContain("micLevelWindowSquaredLevelSum / micLevelWindowSampleCount.toDouble()");
    expect(androidEffect).toContain("@Volatile");
    expect(androidService).toContain("microphoneSource.setAudioEffect(effect)");
    expect(androidDirectStream).toContain("Pcm16AudioMixer.upmixMonoToStereo(micReadBuffer, micReadBuffer.size)");
    expect(androidDirectStream).toContain("microphoneAudioCapture?.recordFallbackFrames(");
    expect(androidDirectStream).toContain("LockSupport.parkNanos(delayNanos)");
    expect(androidDirectStream).toContain("effect?.processAppAudio(");
    expect(androidDirectStream).toContain("effect?.mixForBroadcast(processedMic, processedAppAudio)");
    expect(androidDirectStream).toContain("AUDIO_OUTPUT_CHANNEL_COUNT = 2");
    expect(androidDirectStream).toContain("audioProcessing = audioProcessingSnapshot()");
    expect(androidDirectStream).toContain("playbackUnderrunFrames = playback?.underrunFrames ?: 0L");
    levelKeys.forEach((key) => expect(androidSession).toContain(`putDouble(\"${key}\"`));
    playbackCaptureKeys.forEach((key) => expect(androidSession).toContain(`\"${key}\"`));
  });

  it("captures Android game/media playback with MediaProjection and a bounded buffer", () => {
    expect(androidPlaybackCapture).toContain("AudioPlaybackCaptureConfiguration.Builder(mediaProjection)");
    expect(androidPlaybackCapture).toContain("addMatchingUsage(AudioAttributes.USAGE_GAME)");
    expect(androidPlaybackCapture).toContain("addMatchingUsage(AudioAttributes.USAGE_MEDIA)");
    expect(androidPlaybackCapture).not.toContain("excludeUid(");
    expect(androidPlaybackCapture).toContain("setAudioPlaybackCaptureConfig(captureConfiguration)");
    expect(androidPlaybackCapture).toContain("PcmByteRingBuffer(");
    expect(androidPlaybackCapture).toContain("MAX_BUFFERED_AUDIO_MILLIS = 500");
    expect(androidPlaybackCapture).toContain("MAX_READ_AHEAD_CHUNKS = 3");
    expect(androidPcmMixer).toContain("fun upmixMonoToStereo(");
    expect(androidPcmMixer).toContain("fun mix(mic: ByteArray, appAudio: ByteArray)");
    expect(androidSpeech).toContain("setUsage(AudioAttributes.USAGE_MEDIA)");
    expect(androidSpeech).toContain("setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)");
  });

  it("measures iOS app, microphone, and final mixed PCM under the stats lock", () => {
    expect(iosBroadcast).toContain("struct BroadcastAudioLevelMeasurement");
    expect(iosBroadcast).toContain("struct BroadcastAudioLevelWindow");
    expect(iosBroadcast).toContain("weightedSquareSum += rmsLevel * rmsLevel * Double(measurement.sampleCount)");
    expect(iosBroadcast).toContain("guard let completedMeasurement = micLevelWindow.append(measurement)");
    expect(iosBroadcast).toContain("updatedAt: lastMeasurementAt ?? 0");
    expect(iosBroadcast).toContain("lastMeasurementAt = nil");
    expect(iosBroadcast).toContain("self.currentStats.recordAppAudioLevel(levelMeasurement)");
    expect(iosBroadcast).toContain("self.currentStats.recordMicrophoneLevel(levelMeasurement)");
    expect(iosBroadcast).toContain("self.currentStats.recordMixedAudioLevel(levelMeasurement)");
    expect(iosBroadcast).toContain("if !mixed.isFinite || abs(mixed) >= 1");
    expect(iosBroadcast).toContain("levelGain: appGain");
    expect(iosBroadcast).toContain("statsLock.performLocked");
    levelKeys.forEach((key) => expect(iosBridge).toContain(`\"${key}\"`));
  });

  it("retains final iOS PCM evidence when the broadcast pipeline stops", () => {
    expect(iosBroadcast).toContain("let finalAudioEncoderStats = audioEncoder?.stats");
    expect(iosBroadcast).toContain("audioEncoderStats: finalAudioEncoderStats");
    expect(iosBroadcast).toContain("overrideAudioEncoderStats ?? audioEncoder?.stats");
  });

  it("uses native PCM evidence instead of avatar mouth motion on mobile", () => {
    expect(mobileApp).toContain('"native-pcm"');
    expect(mobileApp).toContain("audio?.micRmsLevel");
    expect(mobileApp).toContain("audio?.micPeakLevel");
    expect(mobileApp).not.toContain("recordAudioLevelSample(nextAvatar.mouthOpen");
    expect(silenceGuard).toContain('sample.source === "native-pcm"');
    expect(silenceGuard).toContain("nativePcmRequired");
  });
});
