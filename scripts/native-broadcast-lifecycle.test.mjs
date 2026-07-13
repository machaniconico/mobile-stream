import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sdkLookup = spawnSync("xcrun", ["--sdk", "macosx", "--show-sdk-path"], { encoding: "utf8" });
const swiftSdk = sdkLookup.status === 0 ? sdkLookup.stdout.trim() : "";

describe("native broadcast lifecycle", () => {
  it("keeps Android MediaProjection single-use while reconnecting only the publisher", () => {
    const service = readFileSync(
      "android/app/src/main/java/com/mobilelivecaster/streaming/MediaProjectionService.kt",
      "utf8"
    );
    const session = readFileSync(
      "android/app/src/main/java/com/mobilelivecaster/streaming/LiveCasterModule.kt",
      "utf8"
    );
    const direct = readFileSync(
      "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidMediaCodecDirectStream.kt",
      "utf8"
    );
    const publisher = readFileSync(
      "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidMediaCodecRtmpPublisher.kt",
      "utf8"
    );
    const reconnect = functionBlock(service, "private fun reconnectStream()");
    const directReconnect = reconnect.slice(
      reconnect.indexOf("if (directStream != null)"),
      reconnect.indexOf("if (stream == null || endpoint == null)")
    );

    expect(session).toContain("fun consumeCaptureConsent(): LiveCasterCaptureConsent?");
    expect(service).toContain("val captureConsent = LiveCasterSession.consumeCaptureConsent()");
    expect(service).toContain("projection.registerCallback(callback, continuityHandler)");
    expect(service).toContain("handleUnexpectedMediaProjectionStop()");
    expect(directReconnect).toContain("directStream.reconnectPublisher()");
    expect(directReconnect).not.toContain("directStream.stop()");
    expect(directReconnect).not.toContain("startStreamFromSession(resetReconnectAttempts = false)");
    expect(directReconnect).not.toContain("avSyncAccumulator.retain");
    expect(direct).toContain("publisher.reconnect(currentProfile.endpoint)");
    const publisherReconnect = functionBlock(publisher, "fun reconnect(endpoint: String)");
    expect(publisherReconnect).toContain("client.reConnect(0L, endpoint)");
    expect(publisherReconnect).not.toContain("disconnect()");
    expect(publisherReconnect).not.toContain("connect(endpoint)");
  });

  it("keeps iOS stop pending until the matching extension handoff confirms shutdown", () => {
    const bridge = readFileSync("ios/MobileLiveCaster/LiveCasterBridge.swift", "utf8");
    const extension = readFileSync("ios/MobileLiveCasterBroadcastUpload/SampleHandler.swift", "utf8");
    const project = readFileSync("ios/MobileLiveCaster.xcodeproj/project.pbxproj", "utf8");
    const snapshot = functionBlock(bridge, "func getSnapshot(");
    const prepare = functionBlock(bridge, "func prepare(");
    const start = functionBlock(bridge, "func start(");
    const stop = bridge.slice(bridge.indexOf("@objc(stop:rejecter:)"), bridge.indexOf("@objc(reconnect:rejecter:)"));
    const reconnect = functionBlock(bridge, "func reconnect(");
    const stopTimeout = functionBlock(bridge, "private func scheduleStopAcknowledgementTimeoutLocked(");
    const broadcastFinished = functionBlock(extension, "override func broadcastFinished()");

    const pendingStopGuard = prepare.indexOf("guard self.pendingStopHandoffID == nil else");
    const prepareOperation = prepare.indexOf("do {");
    expect(pendingStopGuard).toBeGreaterThanOrEqual(0);
    expect(pendingStopGuard).toBeLessThan(prepareOperation);
    expect(prepare.slice(pendingStopGuard, prepareOperation)).toContain("reject(error.code, error.localizedDescription, error)");
    expect(snapshot).toContain("restorePersistedBroadcastStateLocked()");
    expect(prepare).toContain("!self.hasActiveBroadcastHandoffLocked()");
    expect(start.indexOf("guard self.pendingStopHandoffID == nil else")).toBeLessThan(
      start.indexOf("beginBroadcastHandoffLocked")
    );
    expect(reconnect.indexOf("guard self.pendingStopHandoffID == nil else")).toBeLessThan(
      reconnect.indexOf("beginBroadcastHandoffLocked")
    );
    expect(stop.indexOf("restorePersistedBroadcastStateLocked()")).toBeLessThan(
      stop.indexOf("guard let handoffID = self.broadcastHandoffID")
    );
    expect(stop).toContain("saveControlAction(.stop, handoffID: handoffID)");
    expect(stop).toContain("self.pendingStopHandoffID = handoffID");
    expect(stop).toContain("self.status = .stopping");
    expect(stop).toContain("scheduleStopAcknowledgementTimeoutLocked(handoffID: handoffID)");
    expect(bridge).toContain("if status == .idle, pendingStopHandoffID != nil");
    expect(bridge).toContain("completeStopAcknowledgementLocked()");
    expect(bridge).toContain("func loadPersistedBroadcastHandoff()");
    expect(stopTimeout).toContain("hasFreshActiveRuntimeLocked(handoffID: handoffID)");
    expect(stopTimeout).toContain("recoverUnresponsiveStopLocked(handoffID: handoffID)");
    expect(extension).toContain("LiveCasterBroadcastControlStore.consume(expectedHandoffID: handoffID)");
    expect(extension).toContain("self.pipeline.stop()");
    expect(extension).toContain("self.finishBroadcastWithError(error)");
    expect(broadcastFinished).toContain("if let handoffID");
    expect(broadcastFinished).toContain("LiveCasterBroadcastControlStore.clear(handoffID: handoffID)");
    expect(broadcastFinished).not.toContain("clear(handoffID: nil)");
    expect(project.match(/LiveCasterBroadcastControlStore\.swift in Sources/g)).toHaveLength(4);
  });

  it("keeps Stop available as a retry after a failed native lifecycle operation", () => {
    const webStudio = readFileSync("src/screens/StudioScreen.tsx", "utf8");
    const mobileStudio = readFileSync("src/mobile/MobileStudioScreen.tsx", "utf8");

    expect(webStudio).toContain('const canStop = isLive || snapshot.state.status === "failed";');
    expect(webStudio).toContain("operationBusy || isBusy || !canStop");
    expect(mobileStudio).toContain('const canStop = isLive || snapshot.state.status === "failed";');
    expect(mobileStudio).toContain("operationBusy || isBusy || !canStop");
  });

  it.skipIf(!swiftSdk)("rejects stale, mismatched, malformed, and future-dated iOS stop commands", () => {
    const directory = mkdtempSync(join(tmpdir(), "mlc-broadcast-control-"));
    const main = join(directory, "main.swift");
    const executable = join(directory, "test");
    writeFileSync(main, swiftProgram);
    try {
      const compile = spawnSync(
        "xcrun",
        [
          "swiftc",
          "-sdk",
          swiftSdk,
          "ios/MobileLiveCaster/LiveCasterBroadcastControlStore.swift",
          main,
          "-o",
          executable
        ],
        { encoding: "utf8" }
      );
      expect(compile.status, compile.stderr || compile.stdout).toBe(0);
      const run = spawnSync(executable, [], { encoding: "utf8" });
      expect(run.status, run.stderr || run.stdout).toBe(0);
      expect(run.stdout.trim()).toBe("ok");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

const functionBlock = (source, signature) => {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated function: ${signature}`);
};

const swiftProgram = `import Foundation

let handoffID = "11111111-1111-4111-8111-111111111111"
let requestID = "22222222-2222-4222-8222-222222222222"
let now = 1_700_000_000_000.0

func payload(
    handoff: String = handoffID,
    requestedAt: Double = now - 1_000,
    expiresAt: Double = now + 10_000,
    action: String = "stop",
    schemaVersion: Int = 1
) -> [String: Any] {
    [
        "schemaVersion": schemaVersion,
        "action": action,
        "handoffId": handoff,
        "requestId": requestID,
        "requestedAt": requestedAt,
        "expiresAt": expiresAt
    ]
}

let valid = LiveCasterBroadcastControlStore.decode(payload(), expectedHandoffID: handoffID, nowMillis: now)
precondition(valid?.action == .stop)
precondition(valid?.handoffID == handoffID)
precondition(LiveCasterBroadcastControlStore.decode(payload(), expectedHandoffID: "33333333-3333-4333-8333-333333333333", nowMillis: now) == nil)
precondition(LiveCasterBroadcastControlStore.decode(payload(expiresAt: now - 1), expectedHandoffID: handoffID, nowMillis: now) == nil)
precondition(LiveCasterBroadcastControlStore.decode(payload(requestedAt: now + 6_000), expectedHandoffID: handoffID, nowMillis: now) == nil)
precondition(LiveCasterBroadcastControlStore.decode(payload(action: "reconnect"), expectedHandoffID: handoffID, nowMillis: now) == nil)
precondition(LiveCasterBroadcastControlStore.decode(payload(schemaVersion: 2), expectedHandoffID: handoffID, nowMillis: now) == nil)
print("ok")
`;
