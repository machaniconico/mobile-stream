import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const swiftSdkLookup =
  process.platform === "darwin"
    ? spawnSync("xcrun", ["--sdk", "macosx", "--show-sdk-path"], { encoding: "utf8" })
    : { status: 1, stdout: "" };
const swiftSdk = swiftSdkLookup.status === 0 ? swiftSdkLookup.stdout.trim() : "";

describe("iOS media continuity state machine", () => {
  it.skipIf(!swiftSdk)("executes tracker and heartbeat-generation transitions with an injected clock", () => {
    const workspace = resolve(import.meta.dirname, "..");
    const trackerSource = join(
      workspace,
      "ios/MobileLiveCasterBroadcastUpload/MediaContinuityTracker.swift",
    );
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "mobile-live-caster-continuity-"));
    const mainSource = join(temporaryDirectory, "main.swift");
    const executable = join(temporaryDirectory, "continuity-tests");

    writeFileSync(
      mainSource,
      `import Foundation

func require(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() {
        fputs("FAILED: \\(message)\\n", stderr)
        exit(1)
    }
}

final class TestClock {
    var uptime = 0.0
    var wallMs = 1_780_000_000_000.0

    func advance(milliseconds: Int) {
        uptime += Double(milliseconds) / 1000
        wallMs += Double(milliseconds)
    }
}

func makeTracker(_ clock: TestClock) -> BroadcastMediaContinuityTracker {
    BroadcastMediaContinuityTracker(
        stallThresholdMs: 5_000,
        uptime: { clock.uptime },
        wallClockMs: { clock.wallMs }
    )
}

do {
    let clock = TestClock()
    var tracker = makeTracker(clock)
    tracker.reset()
    require(tracker.record(videoMessages: 1, audioMessages: 1, active: true).status == "warming-up", "publish must warm up")
    clock.advance(milliseconds: 5_000)
    let stalled = tracker.record(videoMessages: 1, audioMessages: 1, active: true)
    require(stalled.status == "both-stalled", "total wedge must stall both channels")
    require(stalled.videoStallCount == 1 && stalled.audioStallCount == 1, "stall transitions must count once")
    clock.advance(milliseconds: 2_000)
    let videoRecovered = tracker.record(videoMessages: 2, audioMessages: 1, active: true)
    require(videoRecovered.status == "audio-stalled", "video recovery must retain the audio stall")
    require(videoRecovered.maxAudioStallDurationMs == 7_000, "maximum audio stall must keep growing")
}

do {
    let clock = TestClock()
    var tracker = makeTracker(clock)
    tracker.reset()
    tracker.record(videoMessages: 100, audioMessages: 100, active: true)
    clock.advance(milliseconds: 12_000)
    let paused = tracker.record(videoMessages: 100, audioMessages: 100, active: false)
    require(paused.status == "inactive", "pause/reconnect must disable current stalls")
    require(paused.videoStallCount == 0 && paused.audioStallCount == 0, "pause must not invent incidents")
    clock.advance(milliseconds: 8_000)
    let resumed = tracker.record(videoMessages: 1, audioMessages: 1, active: true)
    require(resumed.status == "warming-up", "resume and counter reset must create a new baseline")
    require(resumed.videoStallCount == 0 && resumed.audioStallCount == 0, "counter reset must not create incidents")
}

do {
    let clock = TestClock()
    var tracker = makeTracker(clock)
    tracker.reset()
    tracker.record(videoMessages: 5, audioMessages: 5, active: true)
    clock.advance(milliseconds: 6_000)
    tracker.record(videoMessages: 5, audioMessages: 5, active: true)
    clock.advance(milliseconds: 14_000)
    let finalSample = tracker.record(videoMessages: 5, audioMessages: 5, active: true)
    require(finalSample.maxVideoStallDurationMs == 20_000, "final sample must extend video maximum")
    require(finalSample.maxAudioStallDurationMs == 20_000, "final sample must extend audio maximum")

    tracker.reset()
    let newSession = tracker.record(videoMessages: nil, audioMessages: nil, active: false)
    require(newSession.videoStallCount == 0 && newSession.audioStallCount == 0, "new session must clear incidents")
}

do {
    var gate = BroadcastMediaContinuityHeartbeatGate()
    let firstGeneration = gate.start()
    require(gate.enabled && gate.isCurrent(firstGeneration), "started heartbeat must be current")
    gate.setEnabled(false)
    require(!gate.enabled && gate.isCurrent(firstGeneration), "pause must retain generation while disabling sampling")
    gate.setEnabled(true)
    gate.stop()
    require(!gate.enabled && !gate.isCurrent(firstGeneration), "queued heartbeat must be rejected after stop")
    let nextGeneration = gate.start()
    require(nextGeneration != firstGeneration && gate.isCurrent(nextGeneration), "new session must use a new generation")
}

print("iOS media continuity behavioral tests passed")
`,
      "utf8",
    );

    try {
      const targetArchitecture = process.arch === "arm64" ? "arm64" : "x86_64";
      const compilation = spawnSync(
        "xcrun",
        [
          "--sdk",
          "macosx",
          "swiftc",
          "-sdk",
          swiftSdk,
          "-target",
          `${targetArchitecture}-apple-macosx15.0`,
          trackerSource,
          mainSource,
          "-o",
          executable,
        ],
        { cwd: workspace, encoding: "utf8" },
      );
      expect(compilation.status, compilation.stderr || compilation.stdout).toBe(0);

      const execution = spawnSync(executable, [], { cwd: workspace, encoding: "utf8" });
      expect(execution.status, execution.stderr || execution.stdout).toBe(0);
      expect(execution.stdout).toContain("iOS media continuity behavioral tests passed");
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
