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

describe("native audio level metering", () => {
  it("measures Android encoder-bound microphone PCM after effects and mixer gain", () => {
    expect(androidEffect).toContain("val levelStats = applyVolume(processed, currentMixer.mic.effectiveVolume(), measureLevel = true)");
    expect(androidEffect).toContain("accumulateMicLevelWindow(levelStats)");
    expect(androidEffect).toContain("micLevelWindowTargetSampleCount");
    expect(androidEffect).toContain("micLevelWindowSquaredLevelSum / micLevelWindowSampleCount.toDouble()");
    expect(androidEffect).toContain("@Volatile");
    expect(androidService).toContain("microphoneSource.setAudioEffect(effect)");
    expect(androidDirectStream).toContain("micProcessingEffect?.process(readBuffer.copyOf(bytesRead))");
    levelKeys.forEach((key) => expect(androidSession).toContain(`putDouble(\"${key}\"`));
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
