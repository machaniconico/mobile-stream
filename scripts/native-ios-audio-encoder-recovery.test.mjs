import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sdkResult =
  process.platform === "darwin"
    ? spawnSync("xcrun", ["--sdk", "macosx", "--show-sdk-path"], { encoding: "utf8" })
    : { status: 1, stdout: "" };
const swiftSdk = sdkResult.status === 0 ? sdkResult.stdout.trim() : "";

describe("iOS audio encoder recovery", () => {
  it.skipIf(!swiftSdk)("executes bounded retry, backoff, suppression, and recovery transitions", () => {
    const workspace = resolve(import.meta.dirname, "..");
    const trackerSource = join(workspace, "ios/MobileLiveCasterBroadcastUpload/AudioEncoderRecoveryTracker.swift");
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "mobile-live-caster-audio-recovery-"));
    const mainSource = join(temporaryDirectory, "main.swift");
    const executable = join(temporaryDirectory, "audio-recovery-tests");

    writeFileSync(
      mainSource,
      `import Foundation

func require(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() { fputs("FAILED: \\(message)\\n", stderr); exit(1) }
}

final class TestClock {
    var uptime = 0.0
    var wallMs = 1_780_000_000_000.0
    func advance(milliseconds: Int) { uptime += Double(milliseconds) / 1_000; wallMs += Double(milliseconds) }
}

let clock = TestClock()
var tracker = BroadcastAudioEncoderRecoveryTracker(
    baseBackoffMs: 100,
    maximumBackoffMs: 800,
    uptime: { clock.uptime },
    wallClockMs: { clock.wallMs }
)
require(tracker.canProcessInput(), "new tracker must accept input")
tracker.beginAttempt(status: -1, reason: "encode-\\u{0007}-1")
require(tracker.snapshot().lastReason == "encode- -1", "reason must remove control characters")
tracker.recordFailure(status: -2, reason: "retry-failed", droppedInputFrames: 480)
require(tracker.snapshot().retryAfterMs == 100, "first failure must arm 100ms backoff")
require(!tracker.canProcessInput(), "backoff must suppress immediate input")
tracker.recordSuppressedInput(droppedInputFrames: 480)
tracker.recordDiscardedQueuedFrames(960)
require(tracker.snapshot().droppedInputFrameCount == 960, "dropped input frames must be retained")
require(tracker.snapshot().discardedQueuedFrameCount == 960, "queued PCM loss must be retained separately")
clock.advance(milliseconds: 100)
tracker.beginAttempt(status: -2, reason: "retry-failed")
tracker.recordFailure(status: -3, reason: "retry-failed-again", droppedInputFrames: 480)
require((200 ... 201).contains(tracker.snapshot().retryAfterMs), "consecutive failures must double backoff")
for status in [-4, -5, -6] {
    clock.advance(milliseconds: tracker.snapshot().retryAfterMs)
    tracker.beginAttempt(status: Int32(status), reason: "repeat")
    tracker.recordFailure(status: Int32(status), reason: "repeat", droppedInputFrames: 0)
}
require(tracker.snapshot().retryAfterMs == 800, "backoff must stop at the configured ceiling")
clock.advance(milliseconds: 800)
tracker.beginAttempt(status: -6, reason: String(repeating: "x", count: 200))
tracker.recordSuccess()
let recovered = tracker.snapshot()
require(recovered.successCount == 1, "successful retry must be counted")
require(!recovered.pending && recovered.retryAfterMs == 0, "success must clear pending backoff")
require(recovered.consecutiveFailureCount == 0, "success must reset consecutive failures")
require(recovered.lastReason.count == 160, "reason must be bounded")
print("iOS audio encoder recovery behavioral tests passed")
`,
      "utf8",
    );

    try {
      const architecture = process.arch === "arm64" ? "arm64" : "x86_64";
      const compilation = spawnSync(
        "xcrun",
        ["--sdk", "macosx", "swiftc", "-sdk", swiftSdk, "-target", `${architecture}-apple-macosx15.0`, trackerSource, mainSource, "-o", executable],
        { encoding: "utf8" },
      );
      expect(compilation.status, compilation.stderr || compilation.stdout).toBe(0);
      const execution = spawnSync(executable, [], { encoding: "utf8" });
      expect(execution.status, execution.stderr || execution.stdout).toBe(0);
      expect(execution.stdout).toContain("iOS audio encoder recovery behavioral tests passed");
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("keeps implementation, telemetry, and Xcode wiring together", () => {
    const handler = readFileSync("ios/MobileLiveCasterBroadcastUpload/SampleHandler.swift", "utf8");
    const bridge = readFileSync("ios/MobileLiveCaster/LiveCasterBridge.swift", "utf8");
    const project = readFileSync("ios/MobileLiveCaster.xcodeproj/project.pbxproj", "utf8");
    expect(project).toContain("AudioEncoderRecoveryTracker.swift in Sources");
    expect(handler).toContain("private var recoveryTracker = BroadcastAudioEncoderRecoveryTracker()");
    expect(handler).toContain("AudioConverterReset(converter)");
    expect(handler).toContain("sourceConverter.reset()");
    expect(handler).toContain("recoveryTracker.recordSuppressedInput");
    expect(handler).toContain("invalidateConvertersLocked()");
    expect(handler).toContain('"recovery": [');
    expect(bridge).toContain('let audioEncoderRecovery = audioEncoder.dictionaryValue("recovery")');
    expect(bridge).toContain('"encoderRecoveryPending": audioEncoderRecovery.boolValue("pending")');
  });
});
