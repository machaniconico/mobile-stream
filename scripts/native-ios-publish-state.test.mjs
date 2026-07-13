import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const broadcastHandler = readFileSync(
  "ios/MobileLiveCasterBroadcastUpload/SampleHandler.swift",
  "utf8"
);
const bridge = readFileSync("ios/MobileLiveCaster/LiveCasterBridge.swift", "utf8");

describe("iOS native publish state contract", () => {
  it("requires a published publisher with both video and audio evidence before reporting live", () => {
    const effectiveState = swiftFunctionBlock(
      broadcastHandler,
      "static func effectiveRuntimeState("
    );

    expect(effectiveState).toContain("case .failed:");
    expect(effectiveState).toContain('return ("failed", publisherStats.lastError)');
    expect(effectiveState).toContain("case .reconnecting:");
    expect(effectiveState).toContain('return ("reconnecting", nil)');
    expect(effectiveState).toContain("case .published:");
    expect(effectiveState).toContain(
      "publisherStats.currentPublishVideoMessagesSent > 0 &&"
    );
    expect(effectiveState).toContain("publisherStats.currentPublishAudioMessagesSent > 0");
    expect(effectiveState).not.toContain("publisherStats.videoMessagesSent > 0");
    expect(effectiveState).not.toContain("publisherStats.audioMessagesSent > 0");
    expect(effectiveState).toContain('return ("live", nil)');
    expect(effectiveState).toContain('("preparing", nil)');
  });

  it("requires the RTMP server publish-start acknowledgement before marking published", () => {
    const connectAndPublish = swiftFunctionBlock(
      broadcastHandler,
      "private func connectAndPublish("
    );
    const publishStart = swiftFunctionBlock(
      broadcastHandler,
      "private func waitForPublishStart("
    );

    expect(connectAndPublish.indexOf("try waitForPublishStart()")).toBeLessThan(
      connectAndPublish.indexOf("self.currentStats.recordPublishedStream(streamId)")
    );
    expect(publishStart).toContain('code == "NetStream.Publish.Start"');
    expect(publishStart).toContain('values[0] == .string("_error")');
    expect(publishStart).toContain('code.hasPrefix("NetStream.Publish.")');
    expect(publishStart).toContain("BroadcastRTMPPublisherError.commandRejected");
  });

  it("resets media evidence for each RTMP publish generation", () => {
    const publisherStats = swiftFunctionBlock(
      broadcastHandler,
      "struct BroadcastRTMPPublisherStats"
    );
    const recordPublishedStream = swiftFunctionBlock(
      publisherStats,
      "mutating func recordPublishedStream("
    );
    const recordVideoMessage = swiftFunctionBlock(
      publisherStats,
      "mutating func recordVideoMessage("
    );
    const recordAudioMessage = swiftFunctionBlock(
      publisherStats,
      "mutating func recordAudioMessage("
    );
    const publisherDictionary = swiftFunctionBlock(publisherStats, "func asDictionary()");

    expect(publisherStats).toContain("private(set) var publishGeneration: Int = 0");
    expect(publisherStats).toContain("private(set) var currentPublishVideoMessagesSent: Int = 0");
    expect(publisherStats).toContain("private(set) var currentPublishAudioMessagesSent: Int = 0");
    expect(recordPublishedStream).toContain("publishGeneration += 1");
    expect(recordPublishedStream).toContain("currentPublishVideoMessagesSent = 0");
    expect(recordPublishedStream).toContain("currentPublishAudioMessagesSent = 0");
    expect(recordVideoMessage).toContain("currentPublishVideoMessagesSent += 1");
    expect(recordAudioMessage).toContain("currentPublishAudioMessagesSent += 1");
    expect(publisherDictionary).toContain('"publishGeneration": publishGeneration');
    expect(publisherDictionary).toContain(
      '"currentPublishVideoMessagesSent": currentPublishVideoMessagesSent'
    );
    expect(publisherDictionary).toContain(
      '"currentPublishAudioMessagesSent": currentPublishAudioMessagesSent'
    );
  });

  it("forwards current publish generation evidence through the iOS bridge", () => {
    const nativeRuntimeMap = swiftFunctionBlock(bridge, "private static func nativeRuntimeMap(");

    expect(nativeRuntimeMap).toContain(
      '"currentPublishVideoFrames": publisher.intValue("currentPublishVideoMessagesSent")'
    );
    expect(nativeRuntimeMap).toContain(
      '"currentPublishAudioFrames": publisher.intValue("currentPublishAudioMessagesSent")'
    );
    expect(nativeRuntimeMap).toContain(
      '"publishGeneration": publisher.intValue("publishGeneration")'
    );
  });

  it("rejects runtime telemetry written by an older broadcast handoff", () => {
    const sharedStoreSave = swiftFunctionBlock(
      broadcastHandler,
      "static func saveRuntimeState("
    );
    const pollRuntime = swiftFunctionBlock(bridge, "private func pollRuntimeStateLocked(");
    const refreshRuntime = swiftFunctionBlock(
      bridge,
      "private func refreshRuntimeStateFromStoreLocked("
    );
    const handoffMatch = swiftFunctionBlock(
      bridge,
      "private func runtimeStateMatchesCurrentHandoffLocked("
    );

    expect(sharedStoreSave).toContain('payload["handoffId"] = effectiveHandoffID');
    expect(pollRuntime).toContain("runtimeStateMatchesCurrentHandoffLocked(runtimeState)");
    expect(refreshRuntime).toContain("runtimeStateMatchesCurrentHandoffLocked(runtimeState)");
    expect(handoffMatch).toContain("guard let expectedHandoffID = broadcastHandoffID");
    expect(handoffMatch).toContain('runtimeState.stringValue("handoffId") == expectedHandoffID');
  });

  it("retains the attempted handoff id when extension startup fails", () => {
    const pipelineStart = swiftFunctionBlock(broadcastHandler, "func start(setupInfo:");
    const pipelineSave = swiftFunctionBlock(
      broadcastHandler,
      "private func saveRuntimeState("
    );
    const sharedStoreSave = swiftFunctionBlock(
      broadcastHandler,
      "static func saveRuntimeState("
    );

    expect(pipelineStart).toContain('let attemptedHandoffID = setupInfo["handoffId"] as? String');
    expect(pipelineStart).toContain("saveRuntimeState(handoffID: attemptedHandoffID)");
    expect(pipelineSave).toContain("handoffID: handoffID");
    expect(sharedStoreSave).toContain("configuration?.handoffID ?? handoffID");
    expect(sharedStoreSave).toContain('payload["handoffId"] = effectiveHandoffID');
  });

  it("persists publisher terminal failure through the periodic runtime-state save path", () => {
    const sharedStoreSave = swiftFunctionBlock(
      broadcastHandler,
      "static func saveRuntimeState("
    );
    const pipelineSave = swiftFunctionBlock(
      broadcastHandler,
      "private func saveRuntimeState("
    );
    const connectionFailure = swiftFunctionBlock(
      broadcastHandler,
      "private func handleConnectionFailure("
    );
    const consumeVideo = swiftFunctionBlock(broadcastHandler, "func consumeVideo(");

    expect(connectionFailure).toContain("ReconnectPolicy.maxAttempts");
    expect(connectionFailure).toContain("self.currentStats.fail(message)");
    expect(pipelineSave).toContain("let effectivePublisherStats = overridePublisherStats ?? publisher?.stats");
    expect(pipelineSave).toContain("publisherStats: effectivePublisherStats");
    expect(sharedStoreSave).toContain(
      "effectiveRuntimeState(state: state, publisherStats: publisherStats)"
    );
    expect(sharedStoreSave).toContain('payload["error"] = error');
    expect(consumeVideo).toContain("saveRuntimeState()");
  });

  it("atomically refreshes publisher status and current-generation media on every heartbeat", () => {
    const heartbeat = swiftFunctionBlock(
      broadcastHandler,
      "private func startMediaContinuityHeartbeat("
    );

    expect(broadcastHandler).not.toContain("static func saveContinuitySnapshot(");
    expect(broadcastHandler).toContain(
      "BroadcastUploadPipeline(mediaContinuityQueue: pipelineQueue)"
    );
    expect(heartbeat).toContain("self.mediaContinuityHeartbeatGate.isCurrent(generation)");
    const persistenceIndex = heartbeat.indexOf("let persistenceState =");
    const freshPublisherIndex = heartbeat.indexOf(
      "let publisherStats = publisher.stats",
      persistenceIndex
    );
    expect(persistenceIndex).toBeGreaterThan(heartbeat.indexOf("self.evaluateAdaptiveBitrate("));
    expect(freshPublisherIndex).toBeGreaterThan(persistenceIndex);
    expect(heartbeat.indexOf("self.mediaContinuityTracker.record(", persistenceIndex)).toBeGreaterThan(
      freshPublisherIndex
    );
    expect(heartbeat).toContain("self.saveRuntimeState(");
    expect(heartbeat).toContain("publisherStats: persistenceState.publisherStats");
    expect(heartbeat).toContain(
      "continuitySnapshot: persistenceState.continuitySnapshot"
    );
    expect(heartbeat).not.toContain("BroadcastSharedStore.saveContinuitySnapshot(");
  });

  it("keeps start preparing until extension runtime telemetry promotes it", () => {
    const start = swiftFunctionBlock(bridge, "func start(");
    const applyRuntimeState = swiftFunctionBlock(
      bridge,
      "private func applyRuntimeStateLocked("
    );

    expect(start).toContain("self.status = .preparing");
    expect(start).toContain("self.startedAt = nil");
    expect(start).toContain("self.startRuntimePollingLocked()");
    expect(start).not.toContain("self.status = .live");
    expect(start).not.toContain("self.startedAt = Date()");
    expect(applyRuntimeState).toContain("LiveCasterStatus(runtimeStatus: runtimeStatus)");
    expect(applyRuntimeState).toContain("if status == .live, startedAt == nil");
    expect(applyRuntimeState).toContain("startedAt = Date()");
  });

  it("keeps reconnect polling in reconnecting until live telemetry arrives", () => {
    const reconnect = swiftFunctionBlock(bridge, "func reconnect(");
    const applyRuntimeState = swiftFunctionBlock(
      bridge,
      "private func applyRuntimeStateLocked("
    );

    expect(reconnect).toContain("self.status = .reconnecting");
    expect(reconnect).toContain("self.startRuntimePollingLocked()");
    expect(reconnect).not.toContain("self.status = .live");
    expect(reconnect).not.toContain("self.startedAt = self.startedAt ?? Date()");
    expect(applyRuntimeState).toContain(
      "status == .reconnecting && reportedStatus == .preparing"
    );
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
