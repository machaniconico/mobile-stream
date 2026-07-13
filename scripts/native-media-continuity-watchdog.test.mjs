import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("native media continuity watchdog", () => {
  it("tracks both Android publisher paths with a strict five-second stall threshold", () => {
    const moduleSource = readFileSync(
      "android/app/src/main/java/com/mobilelivecaster/streaming/LiveCasterModule.kt",
      "utf8",
    );
    const serviceSource = readFileSync(
      "android/app/src/main/java/com/mobilelivecaster/streaming/MediaProjectionService.kt",
      "utf8",
    );
    const trackerTest = readFileSync(
      "android/app/src/test/java/com/mobilelivecaster/streaming/MediaContinuityTrackerTest.kt",
      "utf8",
    );

    expect(moduleSource).toContain("data class NativeRuntimeContinuity(");
    expect(moduleSource).toContain('putMap("continuity", it.asWritableMap())');
    expect(serviceSource).toContain("private val mediaContinuityTracker = MediaContinuityTracker()");
    expect(serviceSource).toContain("private val stallThresholdMs: Long = 5_000L");
    expect(serviceSource).toContain("private var wasActive = false");
    expect(serviceSource).toContain('return snapshot("warming-up", 0L, 0L)');
    expect(serviceSource).toContain('if (genericStream?.isStreaming == true) "connecting" else ""');
    expect(serviceSource).toContain("CONTINUITY_HEARTBEAT_INTERVAL_MS = 1_000L");
    expect(serviceSource).toContain("continuityHandler.postDelayed(this, CONTINUITY_HEARTBEAT_INTERVAL_MS)");
    expect(serviceSource).toMatch(/stopContinuityHeartbeat\(\)\s+captureFinalContinuitySample\(\)\s+releaseStreamResources\(\)/);
    expect(serviceSource).toContain("mediaContinuityTracker.reset()");
    expect(serviceSource).toContain("snapshot?.sentVideoFrames");
    expect(serviceSource).toContain("client?.getSentVideoFrames()");
    expect(serviceSource.match(/continuity = continuity/g)?.length).toBeGreaterThanOrEqual(2);
    expect(serviceSource).toContain('videoStalled && audioStalled -> "both-stalled"');
    expect(trackerTest).toContain("detectsIndependentStallsAndRetainsRecoveryEvidence");
    expect(trackerTest).toContain("reconnectAndCounterResetCreateANewBaselineWithoutFalseIncidents");
    expect(trackerTest).toContain("detectsVideoOnlyStallWhileAudioContinues");
    expect(trackerTest).toContain("finalSampleExtendsMaximumAndNewSessionResetClearsHistory");
  });

  it("retains iOS publisher and continuity evidence through normal ReplayKit stop", () => {
    const handler = readFileSync("ios/MobileLiveCasterBroadcastUpload/SampleHandler.swift", "utf8");
    const tracker = readFileSync(
      "ios/MobileLiveCasterBroadcastUpload/MediaContinuityTracker.swift",
      "utf8",
    );
    const bridge = readFileSync("ios/MobileLiveCaster/LiveCasterBridge.swift", "utf8");
    const stopMethod = handler.slice(handler.indexOf("    func stop() {"), handler.indexOf("    func consumeVideo("));

    expect(tracker).toContain("struct BroadcastMediaContinuityTracker");
    expect(tracker).toContain("stallThresholdMs: Int = 5_000");
    expect(tracker).toContain("private var wasActive = false");
    expect(tracker).toContain('return snapshot(status: "warming-up", videoDurationMs: 0, audioDurationMs: 0)');
    expect(tracker).toContain("struct BroadcastMediaContinuityHeartbeatGate");
    expect(handler).toContain("mediaContinuityTracker.reset()");
    expect(handler).toContain('DispatchQueue(label: "MobileLiveCaster.broadcast.media-continuity")');
    expect(handler).toContain("timer.schedule(deadline: .now() + 1, repeating: 1");
    expect(handler).toContain("BroadcastSharedStore.saveContinuitySnapshot(continuitySnapshot)");
    expect(handler).toContain("setMediaContinuityEnabled(false)");
    expect(handler).toContain("setMediaContinuityEnabled(true)");
    expect(handler).toContain("let finalPublisherStats = publisher?.statsAfterDrainingPendingMedia()");
    expect(handler).toContain("_ = drain.wait(timeout: .now() + 1)");
    expect(handler).toContain("let finalContinuitySnapshot = mediaContinuityLock.performLocked {");
    expect(handler).toContain("publisherStats: finalPublisherStats");
    expect(handler).toContain("continuitySnapshot: finalContinuitySnapshot");
    expect(handler).toContain('payload["continuity"] = continuitySnapshot.asDictionary()');
    expect(stopMethod.indexOf("stopMediaContinuityHeartbeat()")).toBeLessThan(
      stopMethod.indexOf("videoEncoder?.finish()"),
    );
    expect(stopMethod.indexOf("videoEncoder?.finish()")).toBeLessThan(
      stopMethod.indexOf("let finalPublisherStats = publisher?.statsAfterDrainingPendingMedia()"),
    );
    expect(bridge).toContain('let continuity = runtimeState.dictionaryValue("continuity")');
    expect(bridge).toContain('"maxVideoStallDurationMs": continuity.intValue("maxVideoStallDurationMs")');
  });

  it("normalizes continuity telemetry in both React Native adapters", () => {
    const android = readFileSync("src/mobile/AndroidLiveCaster.ts", "utf8");
    const ios = readFileSync("src/mobile/IOSLiveCaster.ts", "utf8");

    expect(android).toContain("continuity: normalizeNativeRuntimeContinuity(runtime.continuity)");
    expect(ios).toContain("continuity: normalizeNativeRuntimeContinuity(runtime.continuity)");
  });
});
