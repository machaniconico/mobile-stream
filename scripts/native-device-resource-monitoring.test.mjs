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
});
