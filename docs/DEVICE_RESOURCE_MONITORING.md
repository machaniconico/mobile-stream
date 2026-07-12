# Device Resource Monitoring

Last verified: 2026-07-13

MobileLiveCaster samples operating-system resource signals while the native publisher is active and includes them in native runtime diagnostics and support bundles.

## Telemetry

- Normalized thermal state: `unknown`, `nominal`, `fair`, `serious`, or `critical`.
- Battery capacity from 0 to 100 percent, or `-1` when the operating system cannot report it.
- Charging state and power source: battery, wired, wireless, or unknown.
- iOS Low Power Mode or Android power-save mode.
- Capture timestamp for evidence freshness.

## Safety Policy

| Signal | App response |
| --- | --- |
| Fair thermal pressure | Warn, improve airflow, and monitor FPS. |
| Serious thermal pressure | Treat as a critical quality incident and arm a lower 30 fps target. Apply it live only when every changed encoder setting is supported; otherwise require a safe restart. |
| Critical thermal pressure | Alert the operator to stop and cool the device; do not assume an automatic quality change is sufficient. |
| Battery 11-20%, not externally powered | Warn and recommend stable power before a long stream. |
| Battery 10% or lower, not externally powered | Stop-first alert because shutdown risk is immediate. |
| Power-saving mode | Warn that CPU/GPU performance may be reduced and recommend a 30 fps target. |

Unknown or malformed native values are never normalized to a healthy reading. Battery warnings are suppressed when the operating system reports wired/wireless power or active charging.

## Official Sources

- Apple ProcessInfo thermal state: https://developer.apple.com/documentation/foundation/processinfo/thermalstate-swift.property
- Apple Low Power Mode: https://developer.apple.com/documentation/foundation/processinfo/islowpowermodeenabled
- Apple UIDevice battery level: https://developer.apple.com/documentation/uikit/uidevice/batterylevel
- Android PowerManager thermal status: https://developer.android.com/reference/android/os/PowerManager#getCurrentThermalStatus()
- Android BatteryManager: https://developer.android.com/reference/android/os/BatteryManager

These signals are operational safeguards, not a substitute for long-duration physical-device validation under the intended case, charger, room temperature, network, scene complexity, and encoder settings.
