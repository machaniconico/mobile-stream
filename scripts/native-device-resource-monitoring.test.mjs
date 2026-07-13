import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const androidMonitor = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/DeviceResourceMonitor.kt",
  "utf8"
);
const androidSession = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/LiveCasterModule.kt",
  "utf8"
);
const androidService = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/MediaProjectionService.kt",
  "utf8"
);
const iosBridge = readFileSync("ios/MobileLiveCaster/LiveCasterBridge.swift", "utf8");
const iosBroadcastExtension = readFileSync("ios/MobileLiveCasterBroadcastUpload/SampleHandler.swift", "utf8");

describe("native device resource monitoring", () => {
  it("samples Android thermal, battery, charging, and power-save state", () => {
    expect(androidMonitor).toContain("currentThermalStatus");
    expect(androidMonitor).toContain("Intent.ACTION_BATTERY_CHANGED");
    expect(androidMonitor).toContain("BatteryManager.EXTRA_LEVEL");
    expect(androidMonitor).toContain("isPowerSaveMode");
    expect(androidMonitor).toContain('PowerManager.THERMAL_STATUS_SEVERE -> "serious"');
    expect(androidMonitor).toContain('PowerManager.THERMAL_STATUS_SHUTDOWN -> "critical"');
  });

  it("publishes Android memory pressure without treating a missing service as critical", () => {
    for (const field of ["memoryPressureState", "availableMemoryBytes", "memoryThresholdBytes"]) {
      expect(androidMonitor).toContain(`put${field === "memoryPressureState" ? "String" : "Double"}("${field}"`);
    }
    expect(androidMonitor).toContain("ActivityManager.MemoryInfo().also(manager::getMemoryInfo)");
    expect(androidMonitor).toContain("val manager = activityManager ?: return MemoryTelemetry()");
    expect(androidMonitor).toContain("if (lowMemory || availableMemoryBytes <= memoryThresholdBytes)");
    expect(androidMonitor).toContain('memoryPressureState = "critical"');
    expect(androidMonitor).toContain('if (memoryThresholdBytes >= warningThreshold) "warning" else "normal"');
    expect(androidService).toContain("memoryPressureState = deviceSnapshot.memoryPressureState");
  });

  it("attaches fresh Android device telemetry to both publisher paths and preserves the final sample", () => {
    expect(androidService.match(/device = deviceResourceMonitor\.snapshot\(\)/g)).toHaveLength(3);
    expect(androidSession).toContain("val device: NativeRuntimeDevice? = null");
    expect(androidSession).toContain('device?.let { putMap("device", it.asWritableMap()) }');
    expect(androidSession).toContain("device = device ?: current?.device");
    expect(androidSession).toContain("nativeRuntime = nativeRuntime?.copy(");
  });

  it("samples iOS owner-process resources on the safe queue and prefers extension telemetry", () => {
    expect(iosBroadcastExtension).toContain("ProcessInfo.processInfo");
    expect(iosBroadcastExtension).toContain("processInfo.thermalState");
    expect(iosBroadcastExtension).toContain("processInfo.isLowPowerModeEnabled");
    expect(iosBroadcastExtension).toContain("UIDevice.current.isBatteryMonitoringEnabled = true");
    expect(iosBroadcastExtension).toContain("UIDevice.batteryLevelDidChangeNotification");
    expect(iosBroadcastExtension).toContain("UIDevice.batteryStateDidChangeNotification");
    expect(iosBroadcastExtension).toContain("let battery = batteryLock.performLocked { batterySnapshot }");
    expect(iosBroadcastExtension).not.toContain("DispatchQueue.main.sync");
    expect(iosBroadcastExtension).toContain('payload["device"] = deviceResourceSnapshot.asDictionary()');
    expect(iosBridge).toContain("validExtensionDeviceResourceMap(runtimeState, stale: stale) ?? deviceResourceMap()");
    expect(iosBridge).toContain("nowMillis - sampledAt <= broadcastRuntimeStateStaleMillis");
    expect(iosBridge).toContain('"device": device');
  });

  it("publishes the iOS memory-pressure contract from the extension and host fallback", () => {
    for (const field of ["memoryPressureState", "availableMemoryBytes", "memoryThresholdBytes"]) {
      expect(iosBroadcastExtension).toContain(`"${field}":`);
      expect(iosBridge).toContain(`"${field}":`);
    }
    expect(iosBroadcastExtension).toContain("UInt64(os_proc_available_memory())");
    expect(iosBridge).toContain("UInt64(os_proc_available_memory())");
    expect(iosBroadcastExtension).toContain("memoryCriticalThresholdBytes: UInt64 = 64 * 1_024 * 1_024");
    expect(iosBroadcastExtension).toContain("memoryWarningThresholdBytes: UInt64 = 128 * 1_024 * 1_024");
    expect(iosBridge).toContain("liveCasterMemoryCriticalThresholdBytes: UInt64 = 64 * 1_024 * 1_024");
    expect(iosBridge).toContain("liveCasterMemoryWarningThresholdBytes: UInt64 = 128 * 1_024 * 1_024");
    expect(iosBroadcastExtension).toContain("MemoryPressureState.worse(eventState, availableMemoryState)");
    expect(iosBridge).toContain('["unknown", "normal", "warning", "critical"].contains(memoryPressureState)');
    expect(iosBridge).toContain("memoryThresholdBytes == liveCasterMemoryWarningThresholdBytes");

    const extensionPolicyStart = iosBroadcastExtension.indexOf("if availableMemoryBytes == 0");
    const extensionPolicyEnd = iosBroadcastExtension.indexOf("let eventState", extensionPolicyStart);
    const extensionPolicy = iosBroadcastExtension.slice(extensionPolicyStart, extensionPolicyEnd);
    expect(extensionPolicy).toContain("availableMemoryState = .unknown");
    expect(extensionPolicy).toContain("availableMemoryBytes <= Self.memoryCriticalThresholdBytes");
    expect(extensionPolicy).toContain("availableMemoryState = .critical");
    expect(extensionPolicy).toContain("availableMemoryBytes <= Self.memoryWarningThresholdBytes");
    expect(extensionPolicy).toContain("availableMemoryState = .warning");
    expect(extensionPolicy).toContain("availableMemoryState = .normal");
    expect(extensionPolicy.indexOf("availableMemoryState = .unknown")).toBeLessThan(
      extensionPolicy.indexOf("availableMemoryState = .critical")
    );
    expect(extensionPolicy.indexOf("availableMemoryState = .critical")).toBeLessThan(
      extensionPolicy.indexOf("availableMemoryState = .warning")
    );
    expect(extensionPolicy.indexOf("availableMemoryState = .warning")).toBeLessThan(
      extensionPolicy.indexOf("availableMemoryState = .normal")
    );

    const hostPolicyStart = iosBridge.indexOf("if availableMemoryBytes == 0");
    const hostPolicyEnd = iosBridge.indexOf("let device = UIDevice.current", hostPolicyStart);
    const hostPolicy = iosBridge.slice(hostPolicyStart, hostPolicyEnd);
    expect(hostPolicy).toContain('memoryPressureState = "unknown"');
    expect(hostPolicy).toContain("availableMemoryBytes <= liveCasterMemoryCriticalThresholdBytes");
    expect(hostPolicy).toContain('memoryPressureState = "critical"');
    expect(hostPolicy).toContain("availableMemoryBytes <= liveCasterMemoryWarningThresholdBytes");
    expect(hostPolicy).toContain('memoryPressureState = "warning"');
    expect(hostPolicy).toContain('memoryPressureState = "normal"');
    expect(hostPolicy.indexOf('memoryPressureState = "unknown"')).toBeLessThan(
      hostPolicy.indexOf('memoryPressureState = "critical"')
    );
    expect(hostPolicy.indexOf('memoryPressureState = "critical"')).toBeLessThan(
      hostPolicy.indexOf('memoryPressureState = "warning"')
    );
    expect(hostPolicy.indexOf('memoryPressureState = "warning"')).toBeLessThan(
      hostPolicy.indexOf('memoryPressureState = "normal"')
    );
  });

  it("owns the iOS memory-pressure source lifecycle without retaining the monitor", () => {
    expect(iosBroadcastExtension).toContain("DispatchSource.makeMemoryPressureSource(");
    expect(iosBroadcastExtension).toContain("eventMask: [.normal, .warning, .critical]");
    expect(iosBroadcastExtension).toContain("source.setEventHandler { [weak self] in");
    expect(iosBroadcastExtension).toContain("source.activate()");
    expect(iosBroadcastExtension).toContain("source?.cancel()");
    expect(iosBroadcastExtension).toContain("startMemoryPressureMonitoring()");
    expect(iosBroadcastExtension).toContain("stopMemoryPressureMonitoring()");

    const startOnMainIndex = iosBroadcastExtension.indexOf("private func startOnMainQueue()");
    const stopOnMainIndex = iosBroadcastExtension.indexOf("private func stopOnMainQueue()");
    const refreshBatteryIndex = iosBroadcastExtension.indexOf("private func refreshBatteryOnMainQueue()");
    const sourceStartIndex = iosBroadcastExtension.indexOf("private func startMemoryPressureMonitoring()");
    const sourceStopIndex = iosBroadcastExtension.indexOf("private func stopMemoryPressureMonitoring()");
    const eventHandlerIndex = iosBroadcastExtension.indexOf("private func recordMemoryPressureEvent()");
    const mainStart = iosBroadcastExtension.slice(startOnMainIndex, stopOnMainIndex);
    const mainStop = iosBroadcastExtension.slice(stopOnMainIndex, refreshBatteryIndex);
    const sourceStart = iosBroadcastExtension.slice(sourceStartIndex, sourceStopIndex);
    const sourceStop = iosBroadcastExtension.slice(sourceStopIndex, eventHandlerIndex);
    expect(mainStart.match(/startMemoryPressureMonitoring\(\)/g)).toHaveLength(1);
    expect(mainStart.indexOf("started = true")).toBeLessThan(mainStart.indexOf("startMemoryPressureMonitoring()"));
    expect(mainStop.match(/stopMemoryPressureMonitoring\(\)/g)).toHaveLength(1);
    expect(mainStop.indexOf("stopMemoryPressureMonitoring()")).toBeLessThan(mainStop.indexOf("started = false"));
    expect(sourceStart.match(/source\.activate\(\)/g)).toHaveLength(1);
    expect(sourceStart.indexOf("memoryPressureSource = source")).toBeLessThan(sourceStart.indexOf("source.activate()"));
    expect(sourceStop.match(/source\?\.cancel\(\)/g)).toHaveLength(1);
    expect(sourceStop.indexOf("memoryPressureSource = nil")).toBeLessThan(sourceStop.indexOf("source?.cancel()"));
    expect(iosBroadcastExtension.match(/source\.activate\(\)/g)).toHaveLength(1);
    expect(iosBroadcastExtension.match(/source\?\.cancel\(\)/g)).toHaveLength(1);
  });

  it("passes iOS memory pressure into native adaptive bitrate samples and manual baselines", () => {
    const samples = iosBroadcastExtension.match(/NativeAdaptiveBitrateSample\([\s\S]*?\n\s*\)/g) ?? [];
    const manualBaselines =
      iosBroadcastExtension.match(/adaptiveBitrateController\.requestBaselineChange\([\s\S]*?\n\s*\)/g) ?? [];
    expect(samples).toHaveLength(1);
    expect(samples[0]).toContain("memoryPressureState: deviceResourceSnapshot.memoryPressureState");
    expect(manualBaselines).toHaveLength(2);
    for (const call of manualBaselines) {
      expect(call).toContain("memoryPressureState: deviceResourceSnapshot.memoryPressureState");
    }
  });
});
