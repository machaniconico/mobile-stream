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

  it("samples iOS thermal, battery, charging, and Low Power Mode on the safe queue", () => {
    expect(iosBridge).toContain("ProcessInfo.processInfo");
    expect(iosBridge).toContain("processInfo.thermalState");
    expect(iosBridge).toContain("processInfo.isLowPowerModeEnabled");
    expect(iosBridge).toContain("device.isBatteryMonitoringEnabled = true");
    expect(iosBridge).toContain("DispatchQueue.main.sync(execute: sample)");
    expect(iosBridge).toContain('"device": deviceResourceMap()');
  });
});
