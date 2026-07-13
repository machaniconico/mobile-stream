import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/MediaProjectionService.kt",
  "utf8"
);
const session = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/LiveCasterModule.kt",
  "utf8"
);
const callbackGuard = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/PublisherCallbackSessionGuard.kt",
  "utf8"
);

describe("Android native publish state contract", () => {
  it("promotes the session to live only from connection success", () => {
    const genericStart = kotlinBlock(service, "private fun startStreamFromSession(");
    const directStart = kotlinBlock(service, "private fun startDirectMediaCodecStream(");
    const connectionSuccess = kotlinBlock(service, "private fun handleConnectionSuccess(");
    const markLiveCalls = service.match(/LiveCasterSession\.markLive\(/g) ?? [];

    expect(genericStart).not.toContain("LiveCasterSession.markLive(");
    expect(directStart).not.toContain("LiveCasterSession.markLive(");
    expect(genericStart).toContain("LiveCasterStatus.Live -> Unit");
    expect(directStart).toContain("LiveCasterStatus.Live -> Unit");
    expect(markLiveCalls).toHaveLength(1);
    expect(connectionSuccess).toContain("publishGenerationTracker");
    expect(connectionSuccess).toContain(".startGeneration(sentVideoFrames, sentAudioFrames)");
    expect(connectionSuccess).toContain('LiveCasterSession.markLive(liveMessage("Live"))');
    expect(connectionSuccess.indexOf(".startGeneration(")).toBeLessThan(
      connectionSuccess.indexOf("LiveCasterSession.markLive(")
    );
  });

  it("invalidates old publish evidence while reconnecting", () => {
    const reconnect = kotlinBlock(service, "private fun reconnectStream(");
    const scheduleReconnect = kotlinBlock(service, "private fun scheduleReconnect(");
    const connectionStarted = kotlinBlock(service, "private fun handleConnectionStarted(");
    const disconnect = kotlinBlock(service, "private fun handleDisconnect(");
    const stateResolver = kotlinBlock(service, "internal fun resolveNativePublisherState(");

    expect(reconnect).toContain("publishGenerationTracker.invalidate()");
    expect(reconnect.match(/LiveCasterSession\.status != LiveCasterStatus\.Live/g)).toHaveLength(2);
    expect(scheduleReconnect).toContain("publishGenerationTracker.invalidate()");
    expect(connectionStarted).toContain("publishGenerationTracker.invalidate()");
    expect(disconnect).toContain("publishGenerationTracker.invalidate()");
    expect(stateResolver).toContain("sessionStatus == LiveCasterStatus.Reconnecting -> \"reconnecting\"");
    expect(stateResolver).toContain(
      "sessionStatus == LiveCasterStatus.Preparing && observedState == \"published\" -> \"connecting\""
    );
  });

  it("exports and preserves current publish generation counters", () => {
    const publisher = kotlinBlock(session, "data class NativeRuntimePublisher(");
    const updateRuntime = kotlinBlock(session, "fun updateNativeRuntime(");
    const directRuntime = kotlinBlock(service, "private fun updateNativeRuntimeFromDirectStream(");
    const genericRuntime = kotlinBlock(service, "private fun updateNativeRuntimeFromStream(");

    for (const field of [
      "publishGeneration",
      "currentPublishVideoFrames",
      "currentPublishAudioFrames"
    ]) {
      expect(publisher).toContain(`val ${field}:`);
      expect(publisher).toContain(`\"${field}\"`);
      expect(updateRuntime).toContain(`${field}:`);
      expect(updateRuntime).toContain(`${field} = ${field} ?: publisher.${field}`);
      expect(directRuntime).toContain(`${field} = publishEvidence.${field}`);
      expect(genericRuntime).toContain(`${field} = publishEvidence.${field}`);
    }
  });

  it("resets publish generation with each new native session", () => {
    const resetCounters = kotlinBlock(service, "private fun resetNativeRuntimeCounters(");

    expect(resetCounters).toContain("publishGenerationTracker.reset()");
  });

  it("serializes publisher and FPS callbacks with the continuity heartbeat", () => {
    const genericStart = kotlinBlock(service, "private fun startStreamFromSession(");
    const beginCallbacks = kotlinBlock(service, "private fun beginPublisherCallbackSession(");
    const dispatchCallback = kotlinBlock(service, "private fun dispatchPublisherCallback(callback:");

    expect(service).toContain("private val continuityHandler = Handler(Looper.getMainLooper())");
    expect(genericStart).toContain("dispatchPublisherCallback(callbackToken)");
    expect(beginCallbacks).toContain("callbackDispatcher = { callback -> dispatchPublisherCallback(callback) }");
    expect(dispatchCallback).toContain("Looper.myLooper() == Looper.getMainLooper()");
    expect(dispatchCallback).toContain("continuityHandler.post { callback() }");
    expect(callbackGuard).toContain("callbackDispatcher {");
    expect(callbackGuard).toContain("guard.dispatch(token, callback)");
  });
});

function kotlinBlock(kotlinText, signature) {
  const signatureIndex = kotlinText.indexOf(signature);
  expect(signatureIndex).toBeGreaterThanOrEqual(0);
  const openingBraceIndex = kotlinText.indexOf("{", signatureIndex + signature.length);
  expect(openingBraceIndex).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let index = openingBraceIndex; index < kotlinText.length; index += 1) {
    if (kotlinText[index] === "{") {
      depth += 1;
    } else if (kotlinText[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return kotlinText.slice(signatureIndex, index + 1);
      }
    }
  }
  throw new Error(`unterminated Kotlin block ${signature}`);
}
