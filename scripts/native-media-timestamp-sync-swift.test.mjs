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

describe("iOS media timestamp sync tracker", () => {
  it.skipIf(!swiftSdk)("executes normalization, drift, critical, recovery, and generation behavior", () => {
    const workspace = resolve(import.meta.dirname, "..");
    const trackerSource = join(
      workspace,
      "ios/MobileLiveCasterBroadcastUpload/MediaTimestampTracker.swift",
    );
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "mobile-live-caster-av-sync-"));
    const mainSource = join(temporaryDirectory, "main.swift");
    const executable = join(temporaryDirectory, "av-sync-tests");

    writeFileSync(
      mainSource,
      `import Foundation

func require(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() {
        fputs("FAILED: \\(message)\\n", stderr)
        exit(1)
    }
}

do {
    var tracker = BroadcastMediaTimestampTracker()
    require(tracker.recordVideo(timestampMs: 9_000).status == "warming-up", "single track must warm up")
    let baseline = tracker.recordAudio(timestampMs: 9_000)
    require(baseline.status == "in-sync" && baseline.skewMs == 0, "shared timeline baseline must align")
    tracker.recordVideo(timestampMs: 10_000)
    let aligned = tracker.recordAudio(timestampMs: 9_990)
    require(aligned.status == "in-sync" && aligned.skewMs == 10, "small drift must remain healthy")
}

do {
    var tracker = BroadcastMediaTimestampTracker()
    tracker.recordVideo(timestampMs: 0)
    tracker.recordAudio(timestampMs: 0)
    tracker.recordVideo(timestampMs: 700)
    tracker.recordAudio(timestampMs: 10)
    tracker.recordVideo(timestampMs: 710)
    tracker.recordAudio(timestampMs: 20)
    tracker.recordVideo(timestampMs: 720)
    let critical = tracker.recordAudio(timestampMs: 30)
    require(critical.status == "video-leading" && critical.critical, "sustained 500ms drift must be critical")
    require(critical.outOfSyncIncidentCount == 1 && critical.criticalIncidentCount == 1, "incidents must count transitions")
    tracker.recordVideo(timestampMs: 730)
    let recovered = tracker.recordAudio(timestampMs: 710)
    require(recovered.status == "in-sync" && !recovered.critical, "catch-up must recover current status")
    require(recovered.maxAbsSkewMs == 690 && recovered.criticalIncidentCount == 1, "recovery must retain evidence")

    tracker.startGeneration()
    require(tracker.snapshot().status == "warming-up", "new publish generation must warm up")
    tracker.recordVideo(timestampMs: 5_000_000)
    let republished = tracker.recordAudio(timestampMs: 5_000_000)
    require(republished.status == "in-sync" && republished.skewMs == 0, "new generation must use fresh origins")
    require(republished.criticalIncidentCount == 1, "generation reset must retain session incidents")

    tracker.reset()
    require(tracker.snapshot().sampleCount == 0 && tracker.snapshot().criticalIncidentCount == 0, "session reset must clear history")
}

do {
    var tracker = BroadcastMediaTimestampTracker()
    tracker.recordVideo(timestampMs: 0)
    tracker.recordAudio(timestampMs: 800)
    tracker.recordVideo(timestampMs: 100)
    tracker.recordAudio(timestampMs: 900)
    tracker.recordVideo(timestampMs: 200)
    let offset = tracker.recordAudio(timestampMs: 1_000)
    require(offset.status == "audio-leading" && offset.skewMs == -800, "shared timeline must retain start offset")
    require(offset.critical && offset.criticalIncidentCount == 1, "persistent start offset must become critical")
}

print("iOS media timestamp sync behavioral tests passed")
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
      expect(execution.stdout).toContain("iOS media timestamp sync behavioral tests passed");
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
