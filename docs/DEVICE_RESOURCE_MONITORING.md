# Device Resource Monitoring

Last verified: 2026-07-13

MobileLiveCaster samples operating-system resource signals inside the native publisher owner while streaming and includes them in native runtime diagnostics and support bundles. Android samples in the MediaProjection foreground service; iOS samples in the ReplayKit Broadcast Upload Extension, so thermal and memory-pressure evidence and safety control remain active when the host app is suspended.

## Telemetry

- Normalized thermal state: `unknown`, `nominal`, `fair`, `serious`, or `critical`.
- Normalized memory-pressure state: `unknown`, `normal`, `warning`, or `critical`, plus available-memory and policy-threshold bytes when reported.
- Battery capacity from 0 to 100 percent, or `-1` when the operating system cannot report it.
- Charging state and power source: battery, wired, wireless, or unknown.
- iOS Low Power Mode or Android power-save mode.
- Capture timestamp for evidence freshness.

## Safety Policy

| Signal | App response |
| --- | --- |
| Fair thermal pressure | Warn, improve airflow, and monitor FPS. |
| Serious thermal pressure | After two consecutive owner-process samples, reduce video bitrate by 20% in bounded steps and block recovery until pressure clears; also arm a lower 30 fps target for the next safe restart. |
| Critical thermal pressure | Immediately reduce video bitrate to the safety floor, alert the operator to stop and cool the device, and do not assume the automatic reduction is sufficient. |
| Warning memory pressure | After two consecutive owner-process samples, reduce video bitrate by 20% in bounded steps, block recovery while pressure remains, warn the operator to close background apps, and prefer a 30 fps restart target. |
| Critical memory pressure | Immediately reduce video bitrate to the safety floor and issue a stop-first alert so the operator can close other apps and restart with fewer scene sources before the publisher process is terminated. |
| Battery 11-20%, not externally powered | Warn and recommend stable power before a long stream. |
| Battery 10% or lower, not externally powered | Stop-first alert because shutdown risk is immediate. |
| Power-saving mode | Warn that CPU/GPU performance may be reduced and recommend a 30 fps target. |

Unknown or malformed native values are never normalized to a healthy reading. A reduced bitrate can recover only after 30 healthy publisher samples with thermal and memory pressure no longer elevated. Battery warnings are suppressed when the operating system reports wired/wireless power or active charging.

Android classifies `ActivityManager.MemoryInfo.lowMemory` or available memory at/below the system threshold as critical, and available memory within twice that threshold as warning. iOS combines `DispatchSourceMemoryPressure` events with `os_proc_available_memory()` sampling, using 128 MiB as the warning threshold and 64 MiB as the critical threshold; the more severe signal wins.

## Official Sources

- Apple ProcessInfo thermal state: https://developer.apple.com/documentation/foundation/processinfo/thermalstate-swift.property
- Apple Low Power Mode: https://developer.apple.com/documentation/foundation/processinfo/islowpowermodeenabled
- Apple UIDevice battery level: https://developer.apple.com/documentation/uikit/uidevice/batterylevel
- Apple DispatchSourceMemoryPressure: https://developer.apple.com/documentation/dispatch/dispatchsourcememorypressure
- Apple process available memory: https://developer.apple.com/documentation/os/1646461-os_proc_available_memory
- Android PowerManager thermal status: https://developer.android.com/reference/android/os/PowerManager#getCurrentThermalStatus()
- Android ActivityManager.MemoryInfo: https://developer.android.com/reference/android/app/ActivityManager.MemoryInfo
- Android BatteryManager: https://developer.android.com/reference/android/os/BatteryManager

These signals are operational safeguards, not a substitute for long-duration physical-device validation under the intended case, charger, room temperature, network, scene complexity, and encoder settings.
