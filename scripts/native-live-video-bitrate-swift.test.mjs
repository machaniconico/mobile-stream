import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const swiftSdkLookup = spawnSync("xcrun", ["--sdk", "macosx", "--show-sdk-path"], { encoding: "utf8" });
const swiftSdk = swiftSdkLookup.status === 0 ? swiftSdkLookup.stdout.trim() : "";

describe("native live video bitrate tracker Swift source", () => {
  it.skipIf(!swiftSdk)("executes reduction, restoration, and failure evidence behavior", () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "mlc-live-bitrate-"));
    const trackerSource = "ios/MobileLiveCasterBroadcastUpload/LiveVideoBitrateTracker.swift";
    const mainSource = join(temporaryDirectory, "main.swift");
    const executable = join(temporaryDirectory, "tracker-test");

    writeFileSync(
      mainSource,
      `import Foundation

var tracker = LiveVideoBitrateTracker()
tracker.reset(initialTargetKbps: 6000)
tracker.recordRequested(targetKbps: 4300)
tracker.recordApplied(targetKbps: 4300, updatedAt: 2000)
let reduced = tracker.snapshot
precondition(reduced.status == "reduced")
precondition(reduced.updateCount == 1)
precondition(reduced.minimumAppliedKbps == 4300)

tracker.recordApplied(targetKbps: 6000, updatedAt: 3000)
let restored = tracker.snapshot
precondition(restored.status == "restored")
precondition(restored.updateCount == 2)
precondition(restored.minimumAppliedKbps == 4300)

tracker.recordFailure(targetKbps: 3200, updatedAt: 4000)
let failed = tracker.snapshot
precondition(failed.status == "failed")
precondition(failed.requestedTargetKbps == 3200)
precondition(failed.appliedTargetKbps == 6000)
precondition(failed.failureCount == 1)
print("ok")
`
    );

    try {
      const compile = spawnSync(
        "xcrun",
        ["swiftc", "-sdk", swiftSdk, trackerSource, mainSource, "-o", executable],
        { encoding: "utf8" }
      );
      expect(compile.status, compile.stderr || compile.stdout).toBe(0);
      const run = spawnSync(executable, [], { encoding: "utf8" });
      expect(run.status, run.stderr || run.stdout).toBe(0);
      expect(run.stdout.trim()).toBe("ok");
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("keeps the production source in the extension build target", () => {
    const project = readFileSync("ios/MobileLiveCaster.xcodeproj/project.pbxproj", "utf8");
    expect(project).toContain("LiveVideoBitrateTracker.swift in Sources");
  });

  it("wires live VideoToolbox updates and a bounded RTMP media queue", () => {
    const handler = readFileSync("ios/MobileLiveCasterBroadcastUpload/SampleHandler.swift", "utf8");
    expect(handler).toContain("func updateBitrate(targetKbps: Int) throws");
    expect(handler).toContain("kVTCompressionPropertyKey_AverageBitRate");
    expect(handler).toContain("kVTEncodeFrameOptionKey_ForceKeyFrame");
    expect(handler).toContain("static let congestionItems = 90");
    expect(handler).toContain("static let maximumItems = 180");
    expect(handler).toContain("guard let pendingMediaID = admitPendingMedia(byteCount: frame.byteCount, protected: frame.isKeyframe)");
    expect(handler).toContain("guard let pendingMediaID = admitPendingMedia(byteCount: frame.aacPayload.count, protected: true)");
    expect(handler).toContain("completePendingMedia(id: pendingMediaID)");
    expect(handler).toContain("pendingMediaEntries.firstIndex(where: { $0.id == id })");
  });
});
