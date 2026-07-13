import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bridge = readFileSync("ios/MobileLiveCaster/LiveCasterBridge.swift", "utf8");
const broadcastExtension = readFileSync(
  "ios/MobileLiveCasterBroadcastUpload/SampleHandler.swift",
  "utf8"
);

describe("iOS host runtime-state contract", () => {
  it("fails closed when live lacks current publish-generation media evidence", () => {
    const effectiveStatus = swiftFunctionBlock(
      bridge,
      "private static func effectiveRuntimeStatus("
    );

    expect(effectiveStatus).toContain("guard reportedStatus == .live else");
    expect(effectiveStatus).toContain("return reportedStatus");
    expect(effectiveStatus).toContain('let publisherState = publisher.stringValue("state")');
    expect(effectiveStatus).toContain('case "failed":\n            return .failed');
    expect(effectiveStatus).toContain('case "reconnecting":\n            return .reconnecting');
    expect(effectiveStatus.indexOf('case "failed":')).toBeLessThan(
      effectiveStatus.indexOf("let hasCurrentPublishEvidence =")
    );
    expect(effectiveStatus.indexOf('case "reconnecting":')).toBeLessThan(
      effectiveStatus.indexOf("let hasCurrentPublishEvidence =")
    );
    expect(effectiveStatus).toContain('publisherState == "published"');
    expect(effectiveStatus).toContain('publisher.intValue("publishGeneration") > 0');
    expect(effectiveStatus).toContain(
      'publisher.intValue("currentPublishVideoMessagesSent") > 0'
    );
    expect(effectiveStatus).toContain(
      'publisher.intValue("currentPublishAudioMessagesSent") > 0'
    );
    expect(effectiveStatus).toContain("hasCurrentPublishEvidence ? .live : .preparing");
    expect(effectiveStatus).not.toContain('publisher.intValue("videoMessagesSent")');
    expect(effectiveStatus).not.toContain('publisher.intValue("audioMessagesSent")');
  });

  it("guards both persisted restoration and runtime polling without replacing other states", () => {
    const restore = swiftFunctionBlock(
      bridge,
      "private func restorePersistedBroadcastStateLocked()"
    );
    const apply = swiftFunctionBlock(bridge, "private func applyRuntimeStateLocked(");

    expect(restore).toContain("Self.effectiveRuntimeStatus(");
    expect(restore).toContain("runtimeState: matchingRuntimeState");
    expect(apply).toContain("Self.effectiveRuntimeStatus(");
    expect(apply).toContain("runtimeState: runtimeState");
    expect(apply).toContain("if reportedStatus == .idle && stopAcknowledged");
    expect(apply).toContain("reportedStatus == .failed || stopAcknowledgementTimedOut");
    expect(apply).toContain("status == .reconnecting && reportedStatus == .preparing");
  });

  it("exports fail-closed active encoder output-format proof", () => {
    const nativeRuntimeMap = swiftFunctionBlock(
      bridge,
      "private static func nativeRuntimeMap("
    );
    const encoderProbe = swiftFunctionBlock(
      bridge,
      "private static func nativeEncoderProbeMap("
    );
    const videoStatsRecord = swiftFunctionBlock(
      broadcastExtension,
      "mutating func record(_ frame: BroadcastEncodedVideoFrame, encoderInstanceID: String)"
    );
    const audioStatsRecord = swiftFunctionBlock(
      broadcastExtension,
      "mutating func record(_ frame: BroadcastEncodedAudioFrame)"
    );
    const videoOutput = swiftFunctionBlock(
      broadcastExtension,
      "fileprivate func handleOutput(status: OSStatus, sampleBuffer: CMSampleBuffer?)"
    );
    const audioOutput = swiftFunctionBlock(
      broadcastExtension,
      "private func encodeInputData("
    );
    const videoFrameParser = swiftFunctionBlock(
      broadcastExtension,
      "private static func makeEncodedFrame("
    );
    const annexBParser = swiftFunctionBlock(
      broadcastExtension,
      "private static func annexBNALUnits("
    );

    expect(nativeRuntimeMap).toContain("let encoderProbe = nativeEncoderProbeMap(");
    expect(nativeRuntimeMap).toContain('"encoderProbe": encoderProbe');
    expect(encoderProbe).toContain('videoBackend == "videotoolbox-h264"');
    expect(encoderProbe).toContain('audioBackend == "audiotoolbox-aac"');
    expect(encoderProbe).toContain('let videoEncodedOutputCount = videoEncoder.intValue("encodedFrames")');
    expect(encoderProbe).toContain('let audioEncodedOutputCount = audioEncoder.intValue("encodedFrames")');
    expect(encoderProbe).toContain("videoEncodedOutputCount > 0");
    expect(encoderProbe).toContain("audioEncodedOutputCount > 0");
    expect(encoderProbe).toContain('let videoFailureCount = videoEncoder.intValue("failureCount")');
    expect(encoderProbe).toContain('let audioFailureCount = audioEncoder.intValue("failureCount")');
    expect(encoderProbe).toContain("videoFailureCount == 0");
    expect(encoderProbe).toContain("audioFailureCount == 0");
    expect(encoderProbe).toContain("videoFailureCount > 0 ||");
    expect(encoderProbe).toContain("audioFailureCount > 0 ||");
    expect(encoderProbe).toContain('let videoWidth = videoEncoder.intValue("outputWidth")');
    expect(encoderProbe).toContain('let videoHeight = videoEncoder.intValue("outputHeight")');
    expect(encoderProbe).toContain('let videoFpsValue = videoEncoder.doubleValue("outputNominalFrameRate")');
    expect(encoderProbe).toContain(
      'let sessionExpectedFrameRate = videoEncoder.doubleValue("sessionExpectedFrameRate")'
    );
    expect(encoderProbe).not.toContain('runtimeState.intValue("width")');
    expect(encoderProbe).not.toContain('runtimeState.intValue("height")');
    expect(encoderProbe).not.toContain('runtimeState.intValue("fps")');
    expect(encoderProbe).toContain(
      'let videoEncoderInstanceVerified = videoEncoder.boolValue("activeEncoderInstanceVerified")'
    );
    expect(encoderProbe).toContain(
      'let audioEncoderInstanceVerified = audioEncoder.boolValue("activeEncoderInstanceVerified")'
    );
    expect(encoderProbe).toContain('videoEncoder.boolValue("outputFormatIsH264")');
    expect(encoderProbe).toContain("sessionExpectedFrameRate == videoFpsValue");
    expect(encoderProbe).toContain(
      'videoEncoder.intValue("consecutiveOutputCadenceMatchCount") >= 2'
    );
    expect(encoderProbe).toContain('let probeStatus = failed ? "fail" : (videoConfigured && audioConfigured ? "pass" : "unknown")');
    expect(encoderProbe).toContain("let activeEncoderInstancesVerified = videoEncoderInstanceVerified &&");
    expect(encoderProbe).toContain('"activeEncoderInstancesVerified": activeEncoderInstancesVerified');
    expect(encoderProbe).toContain('"videoEncodedOutputCount": videoEncodedOutputCount');
    expect(encoderProbe).toContain('"audioEncodedOutputCount": audioEncodedOutputCount');
    expect(encoderProbe).toContain('"videoConfigured": videoConfigured');
    expect(encoderProbe).toContain('"audioConfigured": audioConfigured');
    expect(encoderProbe).toContain('"videoWidth": videoWidth');
    expect(encoderProbe).toContain('"videoHeight": videoHeight');
    expect(encoderProbe).toContain('"videoFps": videoFps');
    expect(encoderProbe).toContain('"audioSampleRate": audioSampleRate');
    expect(encoderProbe).toContain('"audioChannelCount": audioChannelCount');

    expect(broadcastExtension).toContain("CMVideoFormatDescriptionGetDimensions(formatDescription)");
    expect(broadcastExtension).toContain("CMFormatDescriptionGetMediaSubType(formatDescription)");
    expect(broadcastExtension).toContain("VTSessionCopyProperty(");
    expect(broadcastExtension).toContain("guard let presentationTime = scheduledPresentationTime(");
    expect(broadcastExtension).toContain("let duration = targetFrameDuration");
    expect(broadcastExtension).toContain("outputNominalFrameRate == sessionExpectedFrameRate");
    expect(broadcastExtension).toContain("consecutiveOutputCadenceMatchCount >= 2");
    expect(broadcastExtension).toContain("outputEncoderInstanceID == encoderInstanceID");
    expect(broadcastExtension).toContain(
      "currentStats.record(encodedFrame, encoderInstanceID: encoderInstanceID)"
    );
    expect(broadcastExtension).toContain(
      "currentStats.configureActiveEncoder(instanceID: converterInstanceID)"
    );
    expect(broadcastExtension).toContain("encoderInstanceID: activeConverterInstanceID");
    expect(broadcastExtension).toContain("failureCount == 0");
    expect(broadcastExtension).toContain("failureCount += 1");
    expect(videoStatsRecord).not.toContain("lastStatus = 0");
    expect(audioStatsRecord).not.toContain("lastStatus = 0");
    expect(videoOutput).toContain("currentStats.recordStatus(-1)");
    expect(audioOutput).toContain("throw BroadcastAudioEncoderError.encodeFailed(kAudio_ParamError)");
    expect(audioOutput).not.toContain("return []");
    expect(broadcastExtension).toContain("kAudioConverterPrimeMethod");
    expect(broadcastExtension).toContain("UInt32(kConverterPrimeMethod_None)");
    expect(videoFrameParser).toContain("!sampleData.isEmpty");
    expect(videoFrameParser).toContain("CMFormatDescriptionGetMediaSubType(formatDescription) == kCMVideoCodecType_H264");
    expect(videoFrameParser).toContain("duration.value > 0");
    expect(annexBParser).toContain("return nil");
    expect(annexBParser).toContain("offset == avccData.count, !units.isEmpty");
  });
});

function swiftFunctionBlock(swiftText, signature) {
  const signatureIndex = swiftText.indexOf(signature);
  expect(signatureIndex).toBeGreaterThanOrEqual(0);
  const openingBraceIndex = swiftText.indexOf("{", signatureIndex + signature.length);
  expect(openingBraceIndex).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let index = openingBraceIndex; index < swiftText.length; index += 1) {
    if (swiftText[index] === "{") {
      depth += 1;
    } else if (swiftText[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return swiftText.slice(signatureIndex, index + 1);
      }
    }
  }
  throw new Error(`unterminated Swift function ${signature}`);
}
