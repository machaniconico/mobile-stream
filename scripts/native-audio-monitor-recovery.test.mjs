import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const iosBroadcast = readFileSync(
  "ios/MobileLiveCasterBroadcastUpload/SampleHandler.swift",
  "utf8"
);
const iosBridge = readFileSync("ios/MobileLiveCaster/LiveCasterBridge.swift", "utf8");
const androidEffect = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/MicProcessingEffect.kt",
  "utf8"
);
const androidRecovery = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/AudioMonitorRecoveryState.kt",
  "utf8"
);
const androidRuntime = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/LiveCasterModule.kt",
  "utf8"
);
const nativeRuntime = readFileSync("src/domain/nativeRuntime.ts", "utf8");
const sessionSummary = readFileSync("src/domain/streamSessionSummary.ts", "utf8");
const diagnostics = readFileSync("src/domain/streamDiagnostics.ts", "utf8");
const supportBundle = readFileSync("src/domain/supportBundle.ts", "utf8");

const recoveryKeys = [
  "monitorLifecycleEventCount",
  "monitorRouteChangeCount",
  "monitorInterruptionCount",
  "monitorRecoveryCount",
  "monitorRecoveryFailureCount",
  "monitorLastRecoveryReason",
  "monitorLastRecoveryAt",
  "monitorSuspended"
];

describe("native audio monitor recovery", () => {
  it("rebuilds the iOS monitor after interruptions, route changes, and media-service resets", () => {
    expect(iosBroadcast).toContain("AVAudioSession.interruptionNotification");
    expect(iosBroadcast).toContain("AVAudioSession.routeChangeNotification");
    expect(iosBroadcast).toContain("AVAudioSession.mediaServicesWereResetNotification");
    expect(iosBroadcast).toContain("recoveryState.recordInterruptionBegan()");
    expect(iosBroadcast).toContain("recoveryState.recordInterruptionEnded(");
    expect(iosBroadcast).toContain("recoveryState.recordRouteChange(");
    expect(iosBroadcast).toContain("recoveryState.recordMediaServicesReset()");
    expect(iosBroadcast).toContain("recoveryState.recordEngineStopped()");
    expect(iosBroadcast).toContain("case .rebuild(let reason):");
    expect(iosBroadcast).toContain("finishAudioGraph()");
    expect(iosBroadcast).toContain("try AVAudioSession.sharedInstance().setActive(true)");
  });

  it("bounds iOS recovery retries and unregisters notification observers", () => {
    expect(iosBroadcast).toContain("retryAfterUptime = nowUptime + 0.5");
    expect(iosBroadcast).toContain("if pendingRecoveryReason != nil, nowUptime < retryAfterUptime");
    expect(iosBroadcast).toContain("notificationTokens.forEach(NotificationCenter.default.removeObserver)");
    expect(iosBroadcast).not.toContain("try? AVAudioSession.sharedInstance().setActive(true)");
  });

  it("recreates Android AudioTrack output on device and playback lifecycle changes", () => {
    expect(androidEffect).toContain("object : AudioDeviceCallback()");
    expect(androidEffect).toContain("registerAudioDeviceCallback(audioDeviceCallback, null)");
    expect(androidEffect).toContain("unregisterAudioDeviceCallback(audioDeviceCallback)");
    expect(androidEffect).toContain("monitorRecoveryState.recordAudioDevicesAdded(");
    expect(androidEffect).toContain("monitorRecoveryState.recordAudioDevicesRemoved(");
    expect(androidEffect).toContain('"audio-track-stopped"');
    expect(androidEffect).toContain("monitorRecoveryState.recordObservedOutputDeviceChange()");
    expect(androidEffect).toContain("releaseMonitorTrackLocked()");
    expect(androidEffect).toContain("resolveHeadphoneRoute(track)");
    expect(androidEffect).toContain("track.write(silence, 0, silence.size, AudioTrack.WRITE_BLOCKING)");
    expect(androidEffect).toContain("routedDevice?.isHeadphoneOutput() != true");
    expect(androidEffect).toContain('recordObservedOutputDeviceChange("unsafe-output-route")');
    expect(androidEffect).toContain("MONITOR_CREATE_RETRY_DELAY_MS = 500L");
    expect(androidEffect).not.toContain("requestAudioFocus");
    expect(androidRecovery).toContain("pendingRecovery?.generation != request.generation");
  });

  it("retains recovery telemetry through native runtime, session history, and support exports", () => {
    recoveryKeys.forEach((key) => {
      expect(iosBridge).toContain(`\"${key}\"`);
      expect(androidRuntime).toContain(`\"${key}\"`);
      expect(nativeRuntime).toContain(key);
      expect(sessionSummary).toContain(key);
    });
    expect(diagnostics).toContain("monitorLastRecoveryReason: redactStreamKeyOccurrences(");
    expect(supportBundle).toContain("Audio monitor recovery: events");
  });
});
