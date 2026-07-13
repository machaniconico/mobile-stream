import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const sdkLookup = spawnSync("xcrun", ["--sdk", "macosx", "--show-sdk-path"], { encoding: "utf8" });
const swiftSdk = sdkLookup.status === 0 ? sdkLookup.stdout.trim() : "";

describe("native adaptive bitrate Swift policy", () => {
  it.skipIf(!swiftSdk)("executes reduction, cooldown, republish hold, and recovery", () => {
    const directory = mkdtempSync(join(tmpdir(), "mlc-adaptive-bitrate-"));
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
          "ios/MobileLiveCasterBroadcastUpload/NativeAdaptiveBitrateController.swift",
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

  it("keeps both native implementations on the same production thresholds", () => {
    const swift = readFileSync("ios/MobileLiveCasterBroadcastUpload/NativeAdaptiveBitrateController.swift", "utf8");
    const kotlin = readFileSync("android/app/src/main/java/com/mobilelivecaster/streaming/NativeAdaptiveBitrateController.kt", "utf8");
    expect(swift).toContain("static let startupGraceMs = 10_000.0");
    expect(swift).toContain("static let pressureSamples = 3");
    expect(swift).toContain("static let healthySamples = 30");
    expect(swift).toContain('let thermalCritical = thermalState == "critical"');
    expect(swift).toContain('let thermalSerious = thermalState == "serious"');
    expect(swift).toContain("let thermalSafetyTargetKbps = [thermalFloorTargetKbps, effectiveTargetKbps, pendingTargetKbps]");
    expect(kotlin).toContain("const val STARTUP_GRACE_MS = 10_000L");
    expect(kotlin).toContain("const val PRESSURE_SAMPLES = 3");
    expect(kotlin).toContain("const val HEALTHY_SAMPLES = 30");
    expect(kotlin).toContain('val thermalCritical = thermalState == "critical"');
    expect(kotlin).toContain('val thermalSerious = thermalState == "serious"');
    expect(kotlin).toContain("val thermalSafetyTargetKbps = listOfNotNull(");
  });

  it("keeps native ownership wired through both publishers, telemetry, and the commercial gate", () => {
    const android = readFileSync(
      "android/app/src/main/java/com/mobilelivecaster/streaming/MediaProjectionService.kt",
      "utf8"
    );
    const directAndroid = readFileSync(
      "android/app/src/main/java/com/mobilelivecaster/streaming/AndroidMediaCodecDirectStream.kt",
      "utf8"
    );
    const ios = readFileSync("ios/MobileLiveCasterBroadcastUpload/SampleHandler.swift", "utf8");
    const mobileApp = readFileSync("src/mobile/MobileApp.tsx", "utf8");
    const commercialGate = readFileSync("src/domain/commercialReleaseGate.ts", "utf8");

    expect(android).toContain("runAdaptiveBitrateHeartbeat()");
    expect(android).toContain("adaptiveBitrateController.evaluate(");
    expect(android).toContain("useMeasuredBitrate = false");
    expect(android).toContain("adaptiveBitrateController.requestBaselineChange(requestedTargetKbps)");
    expect(android).toContain("trackerSnapshot.appliedTargetKbps == controllerSnapshot.pendingTargetKbps");
    expect(android).toContain("trackerSnapshot.appliedRequestGeneration == trackerSnapshot.requestGeneration");
    expect(directAndroid).toContain("executeNativeVideoBitrateUpdate(");
    expect(directAndroid).toContain("if (result.bitrateApplied)");
    expect(android).toContain("directStream.updateProfile(effectiveProfile, requestGeneration)");
    expect(directAndroid).toContain("requestGeneration = command.requestGeneration");
    expect(directAndroid).toContain("lastNonFatalError = safeMessage(error)");
    expect(android).toContain("activeStream.setVideoBitrateOnFly(effectiveProfile.videoBitrate)");
    expect(android).toContain("profile.copy(videoBitrate = effectiveTargetKbps * 1_000)");
    expect(android).toContain("thermalState = deviceSnapshot.thermalState");
    expect(android).toContain("isNativeAdaptiveBitrateActive(");
    expect(directAndroid).toContain("publisherDroppedVideoFrames = publisherSnapshot.droppedVideoFrames");

    expect(ios).toContain("startMediaContinuityHeartbeat(publisher: nextPublisher, videoEncoder: nextVideoEncoder)");
    expect(ios).toContain("adaptiveBitrateController.evaluate(sample)");
    expect(ios).toContain("useMeasuredBitrate: false");
    expect(ios).toContain("ProcessInfo.processInfo.systemUptime * 1_000");
    expect(ios).toContain("adaptiveBitrateController.requestBaselineChange(targetKbps, thermalState: thermalState)");
    expect(ios).toContain("private let videoBitrateUpdateLock = NSLock()");
    expect(ios).toContain("try videoEncoder.updateBitrate(targetKbps: decision.targetKbps)");
    expect(ios).toContain("try videoEncoder.updateBitrate(targetKbps: effectiveTargetKbps)");
    expect(ios).toContain("cumulativeReconnectCount += 1");
    expect(ios).toContain("bitrateAdaptationSnapshot: adaptiveBitrateSnapshot()");
    expect(ios).toContain("thermalState: deviceResourceSnapshot.thermalState");

    expect(mobileApp).toContain("deferNativeOwnedBitrateDecision(");
    expect(commercialGate).toContain('run?.nativeRuntimeControlOwner === "native"');
    expect(commercialGate).toContain("automaticReductionCount > 0");
    expect(commercialGate).toContain("isZeroFiniteNumber(run?.nativeRuntimePendingTargetKbps)");
  });
});

const swiftProgram = `import Foundation

func sample(
    _ second: Int,
    generation: Int = 1,
    active: Bool = true,
    congested: Bool = false,
    queued: Int = 0,
    bitrate: Int = 3400,
    useMeasuredBitrate: Bool = true,
    reconnectCount: Int? = nil,
    wallMs: Double? = nil,
    thermalState: String = "nominal"
) -> NativeAdaptiveBitrateSample {
    NativeAdaptiveBitrateSample(
        nowElapsedMs: Double(second * 1000),
        nowWallMs: wallMs ?? 1_700_000_000_000 + Double(second * 1000),
        active: active,
        publishGeneration: generation,
        congested: congested,
        queuedItems: queued,
        cacheSize: 180,
        measuredBitrateKbps: bitrate,
        useMeasuredBitrate: useMeasuredBitrate,
        droppedVideoFrames: 0,
        cumulativeReconnectCount: reconnectCount ?? generation - 1,
        thermalState: thermalState
    )
}

var controller = NativeAdaptiveBitrateController()
controller.reset(baselineKbps: 3500)
precondition(controller.evaluate(sample(0, generation: 1)) == nil)
precondition(controller.evaluate(sample(10, congested: true, queued: 100)) == nil)
precondition(controller.evaluate(sample(11, congested: true, queued: 100)) == nil)
let reduction = controller.evaluate(sample(12, congested: true, queued: 100))
precondition(reduction?.type == "reduce")
precondition(reduction?.targetKbps == 2800)
precondition(controller.snapshot(nowElapsedMs: 12000).effectiveTargetKbps == 3500)
precondition(controller.snapshot(nowElapsedMs: 12000).automaticReductionCount == 0)
controller.recordApplied(2800)
precondition(controller.snapshot(nowElapsedMs: 12000).automaticReductionCount == 1)

precondition(controller.evaluate(sample(20, generation: 2, bitrate: 2700, reconnectCount: 0)) == nil)
for second in 30...49 {
    precondition(controller.evaluate(sample(second, generation: 2, bitrate: 2700, reconnectCount: 0)) == nil)
}
var recovery: NativeAdaptiveBitrateDecision?
for second in 50...59 {
    recovery = controller.evaluate(sample(second, generation: 2, bitrate: 2700, reconnectCount: 0)) ?? recovery
}
precondition(recovery?.type == "restore")
precondition(recovery?.targetKbps == 3100)

var reconnectController = NativeAdaptiveBitrateController()
reconnectController.reset(baselineKbps: 3500)
precondition(reconnectController.evaluate(sample(0, generation: 1, reconnectCount: 0)) == nil)
precondition(reconnectController.evaluate(sample(12, generation: 1, active: false, reconnectCount: 1)) == nil)
precondition(reconnectController.evaluate(sample(20, generation: 2, reconnectCount: 1)) == nil)
precondition(reconnectController.evaluate(sample(30, generation: 2, reconnectCount: 1)) == nil)
precondition(reconnectController.evaluate(sample(31, generation: 2, reconnectCount: 1))?.targetKbps == 2800)

var lowMotionController = NativeAdaptiveBitrateController()
lowMotionController.reset(baselineKbps: 3500)
precondition(lowMotionController.evaluate(sample(0, generation: 1)) == nil)
for second in 10...20 {
    precondition(lowMotionController.evaluate(sample(second, bitrate: 400, useMeasuredBitrate: false)) == nil)
}
precondition(lowMotionController.snapshot(nowElapsedMs: 20000).effectiveTargetKbps == 3500)

var seriousThermalController = NativeAdaptiveBitrateController()
seriousThermalController.reset(baselineKbps: 3500)
precondition(seriousThermalController.evaluate(sample(0, generation: 1)) == nil)
precondition(seriousThermalController.evaluate(sample(10, thermalState: "serious")) == nil)
let thermalReduction = seriousThermalController.evaluate(sample(11, thermalState: "serious"))
precondition(thermalReduction?.targetKbps == 2800)
precondition(thermalReduction?.reason == "The device reported sustained serious thermal pressure.")
seriousThermalController.recordApplied(2800)
for second in 12...50 {
    precondition(seriousThermalController.evaluate(sample(second, bitrate: 2700, thermalState: "fair")) == nil)
}
precondition(seriousThermalController.snapshot(nowElapsedMs: 50000).effectiveTargetKbps == 2800)

var criticalThermalController = NativeAdaptiveBitrateController()
criticalThermalController.reset(baselineKbps: 3500)
let thermalEmergency = criticalThermalController.evaluate(sample(0, generation: 1, thermalState: "critical"))
precondition(thermalEmergency?.targetKbps == 1200)
precondition(thermalEmergency?.reason == "The device reported critical thermal pressure; bitrate was reduced to the safety floor.")

var pendingThermalController = NativeAdaptiveBitrateController()
pendingThermalController.reset(baselineKbps: 3500)
pendingThermalController.requestBaselineChange(2500)
let supersedingEmergency = pendingThermalController.evaluate(sample(0, generation: 1, thermalState: "critical"))
precondition(supersedingEmergency?.targetKbps == 900)
pendingThermalController.recordApplied(2500)
precondition(pendingThermalController.snapshot(nowElapsedMs: 1000).pendingTargetKbps == 900)
precondition(pendingThermalController.snapshot(nowElapsedMs: 1000).effectiveTargetKbps == 3500)
pendingThermalController.recordApplied(900)
precondition(pendingThermalController.snapshot(nowElapsedMs: 2000).baselineTargetKbps == 2500)
precondition(pendingThermalController.snapshot(nowElapsedMs: 2000).effectiveTargetKbps == 900)

var pendingThermalSecond = 30
for _ in 0..<16 {
    let snapshot = pendingThermalController.snapshot(nowElapsedMs: Double(pendingThermalSecond * 1000))
    if snapshot.effectiveTargetKbps >= snapshot.baselineTargetKbps { break }
    var pendingThermalRecovery: NativeAdaptiveBitrateDecision?
    for _ in 0..<30 {
        pendingThermalRecovery = pendingThermalController.evaluate(
            sample(
                pendingThermalSecond,
                bitrate: snapshot.effectiveTargetKbps,
                useMeasuredBitrate: false
            )
        ) ?? pendingThermalRecovery
        pendingThermalSecond += 1
    }
    precondition(pendingThermalRecovery != nil)
    precondition(pendingThermalRecovery!.targetKbps <= 2500)
    pendingThermalController.recordApplied(pendingThermalRecovery!.targetKbps)
}
precondition(pendingThermalController.snapshot(nowElapsedMs: Double(pendingThermalSecond * 1000)).effectiveTargetKbps == 2500)

var elevatedBaselineThermalController = NativeAdaptiveBitrateController()
elevatedBaselineThermalController.reset(baselineKbps: 3500)
precondition(elevatedBaselineThermalController.evaluate(sample(0, generation: 1, thermalState: "critical"))?.targetKbps == 1200)
elevatedBaselineThermalController.recordApplied(1200)
elevatedBaselineThermalController.requestBaselineChange(6000)
precondition(elevatedBaselineThermalController.evaluate(sample(1, thermalState: "critical"))?.targetKbps == 1200)
elevatedBaselineThermalController.recordApplied(1200)
let elevatedBaselineThermalSnapshot = elevatedBaselineThermalController.snapshot(nowElapsedMs: 2000)
precondition(elevatedBaselineThermalSnapshot.baselineTargetKbps == 6000)
precondition(elevatedBaselineThermalSnapshot.floorTargetKbps == 2100)
precondition(elevatedBaselineThermalSnapshot.effectiveTargetKbps == 1200)

var immediateManualThermalController = NativeAdaptiveBitrateController()
immediateManualThermalController.reset(baselineKbps: 3500)
precondition(immediateManualThermalController.evaluate(sample(0, generation: 1, thermalState: "critical"))?.targetKbps == 1200)
immediateManualThermalController.recordApplied(1200)
let immediateManualThermalTarget = immediateManualThermalController.requestBaselineChange(6000, thermalState: "critical")
precondition(immediateManualThermalTarget == 1200)
immediateManualThermalController.recordApplied(immediateManualThermalTarget)
let immediateManualThermalSnapshot = immediateManualThermalController.snapshot(nowElapsedMs: 2000)
precondition(immediateManualThermalSnapshot.baselineTargetKbps == 6000)
precondition(immediateManualThermalSnapshot.effectiveTargetKbps == 1200)

var pendingManualThermalController = NativeAdaptiveBitrateController()
pendingManualThermalController.reset(baselineKbps: 3500)
precondition(pendingManualThermalController.evaluate(sample(0, generation: 1, thermalState: "critical"))?.targetKbps == 1200)
precondition(pendingManualThermalController.requestBaselineChange(6000, thermalState: "critical") == 1200)
precondition(pendingManualThermalController.evaluate(sample(1, thermalState: "critical")) == nil)
precondition(pendingManualThermalController.snapshot(nowElapsedMs: 1000).pendingTargetKbps == 1200)
pendingManualThermalController.recordApplied(1200)
let pendingManualThermalSnapshot = pendingManualThermalController.snapshot(nowElapsedMs: 2000)
precondition(pendingManualThermalSnapshot.baselineTargetKbps == 6000)
precondition(pendingManualThermalSnapshot.floorTargetKbps == 2100)
precondition(pendingManualThermalSnapshot.effectiveTargetKbps == 1200)
precondition(pendingManualThermalSnapshot.pendingTargetKbps == 0)

var baselineController = NativeAdaptiveBitrateController()
baselineController.reset(baselineKbps: 3500)
baselineController.requestBaselineChange(2500)
precondition(baselineController.snapshot(nowElapsedMs: 1000).baselineTargetKbps == 3500)
precondition(baselineController.snapshot(nowElapsedMs: 1000).effectiveTargetKbps == 3500)
precondition(baselineController.snapshot(nowElapsedMs: 1000).pendingTargetKbps == 2500)
baselineController.recordFailure("encoder rejected target", nowWallMs: 1_700_000_002_000)
precondition(baselineController.snapshot(nowElapsedMs: 2000).baselineTargetKbps == 3500)
precondition(baselineController.snapshot(nowElapsedMs: 2000).effectiveTargetKbps == 3500)

var confirmedBaselineController = NativeAdaptiveBitrateController()
confirmedBaselineController.reset(baselineKbps: 3500)
confirmedBaselineController.requestBaselineChange(2500)
confirmedBaselineController.recordApplied(2500)
precondition(confirmedBaselineController.snapshot(nowElapsedMs: 2000).baselineTargetKbps == 2500)
precondition(confirmedBaselineController.snapshot(nowElapsedMs: 2000).effectiveTargetKbps == 2500)

var monotonicController = NativeAdaptiveBitrateController()
monotonicController.reset(baselineKbps: 3500)
precondition(monotonicController.evaluate(sample(0, generation: 1, wallMs: 5_000)) == nil)
precondition(monotonicController.evaluate(sample(10, congested: true, queued: 100, wallMs: 4_000)) == nil)
precondition(monotonicController.evaluate(sample(11, congested: true, queued: 100, wallMs: 3_000)) == nil)
precondition(monotonicController.evaluate(sample(12, congested: true, queued: 100, wallMs: 2_000))?.targetKbps == 2800)
precondition(monotonicController.snapshot(nowElapsedMs: 12000).lastDecisionAt == 2_000)
print("ok")
`;
