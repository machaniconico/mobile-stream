package com.mobilelivecaster.streaming

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import kotlin.math.roundToInt

data class NativeRuntimeDevice(
    val thermalState: String = "unknown",
    val thermalStatusCode: Int = -1,
    val batteryLevelPercent: Int = -1,
    val charging: Boolean = false,
    val lowPowerMode: Boolean = false,
    val powerSource: String = "unknown",
    val memoryPressureState: String = "unknown",
    val availableMemoryBytes: Long = -1,
    val memoryThresholdBytes: Long = -1,
    val sampledAt: Long = 0
) {
    fun asWritableMap(): WritableMap = Arguments.createMap().apply {
        putString("thermalState", thermalState)
        putInt("thermalStatusCode", thermalStatusCode)
        putInt("batteryLevelPercent", batteryLevelPercent)
        putBoolean("charging", charging)
        putBoolean("lowPowerMode", lowPowerMode)
        putString("powerSource", powerSource)
        putString("memoryPressureState", memoryPressureState)
        putDouble("availableMemoryBytes", availableMemoryBytes.toDouble())
        putDouble("memoryThresholdBytes", memoryThresholdBytes.toDouble())
        putDouble("sampledAt", sampledAt.toDouble())
    }
}

internal data class MemoryTelemetry(
    val memoryPressureState: String = "unknown",
    val availableMemoryBytes: Long = -1,
    val memoryThresholdBytes: Long = -1
)

internal fun classifyMemoryTelemetry(
    availableMemoryBytes: Long,
    memoryThresholdBytes: Long,
    lowMemory: Boolean
): MemoryTelemetry {
    if (availableMemoryBytes < 0 || memoryThresholdBytes < 0) {
        return MemoryTelemetry()
    }
    if (lowMemory || availableMemoryBytes <= memoryThresholdBytes) {
        return MemoryTelemetry(
            memoryPressureState = "critical",
            availableMemoryBytes = availableMemoryBytes,
            memoryThresholdBytes = memoryThresholdBytes
        )
    }
    val warningThreshold = (availableMemoryBytes / 2) + (availableMemoryBytes % 2)
    val memoryPressureState = if (memoryThresholdBytes >= warningThreshold) "warning" else "normal"
    return MemoryTelemetry(
        memoryPressureState = memoryPressureState,
        availableMemoryBytes = availableMemoryBytes,
        memoryThresholdBytes = memoryThresholdBytes
    )
}

internal fun sampleMemoryTelemetry(memoryInfo: ActivityManager.MemoryInfo?): MemoryTelemetry {
    val info = memoryInfo ?: return MemoryTelemetry()
    return classifyMemoryTelemetry(
        availableMemoryBytes = info.availMem,
        memoryThresholdBytes = info.threshold,
        lowMemory = info.lowMemory
    )
}

class DeviceResourceMonitor(context: Context) {
    private data class BatterySnapshot(
        val levelPercent: Int,
        val charging: Boolean,
        val powerSource: String
    )

    private val applicationContext = context.applicationContext
    private val powerManager = applicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
    private val activityManager = applicationContext.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    private var lastSnapshot: NativeRuntimeDevice? = null

    @Synchronized
    fun snapshot(): NativeRuntimeDevice {
        val previous = lastSnapshot
        val thermalStatusCode = readThermalStatusCode() ?: previous?.thermalStatusCode ?: -1
        val battery = readBatterySnapshot()
        val memory = readMemoryTelemetry()
        val next = NativeRuntimeDevice(
            thermalState = normalizeThermalState(thermalStatusCode),
            thermalStatusCode = thermalStatusCode,
            batteryLevelPercent = battery?.levelPercent ?: previous?.batteryLevelPercent ?: -1,
            charging = battery?.charging ?: previous?.charging ?: false,
            lowPowerMode = runCatching { powerManager?.isPowerSaveMode }
                .getOrNull()
                ?: previous?.lowPowerMode
                ?: false,
            powerSource = battery?.powerSource ?: previous?.powerSource ?: "unknown",
            memoryPressureState = memory.memoryPressureState,
            availableMemoryBytes = memory.availableMemoryBytes,
            memoryThresholdBytes = memory.memoryThresholdBytes,
            sampledAt = System.currentTimeMillis()
        )
        lastSnapshot = next
        return next
    }

    private fun readThermalStatusCode(): Int? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return null
        }
        return runCatching { powerManager?.currentThermalStatus }.getOrNull()
    }

    private fun readBatterySnapshot(): BatterySnapshot? {
        val intent = runCatching {
            applicationContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        }.getOrNull() ?: return null
        val batteryPresent = intent.getBooleanExtra(BatteryManager.EXTRA_PRESENT, true)
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        val levelPercent = if (batteryPresent && level >= 0 && scale > 0) {
            (level * 100f / scale).roundToInt().coerceIn(0, 100)
        } else {
            -1
        }
        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, BatteryManager.BATTERY_STATUS_UNKNOWN)
        val plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1)
        return BatterySnapshot(
            levelPercent = levelPercent,
            charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL,
            powerSource = normalizePowerSource(plugged)
        )
    }

    private fun readMemoryTelemetry(): MemoryTelemetry {
        val manager = activityManager ?: return MemoryTelemetry()
        val info = runCatching { ActivityManager.MemoryInfo().also(manager::getMemoryInfo) }.getOrNull()
        return sampleMemoryTelemetry(info)
    }

    private fun normalizeThermalState(statusCode: Int): String = when (statusCode) {
        PowerManager.THERMAL_STATUS_NONE -> "nominal"
        PowerManager.THERMAL_STATUS_LIGHT,
        PowerManager.THERMAL_STATUS_MODERATE -> "fair"
        PowerManager.THERMAL_STATUS_SEVERE -> "serious"
        PowerManager.THERMAL_STATUS_CRITICAL,
        PowerManager.THERMAL_STATUS_EMERGENCY,
        PowerManager.THERMAL_STATUS_SHUTDOWN -> "critical"
        else -> "unknown"
    }

    private fun normalizePowerSource(plugged: Int): String = when (plugged) {
        0 -> "battery"
        BatteryManager.BATTERY_PLUGGED_AC,
        BatteryManager.BATTERY_PLUGGED_USB -> "wired"
        BatteryManager.BATTERY_PLUGGED_WIRELESS -> "wireless"
        else -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && plugged == BatteryManager.BATTERY_PLUGGED_DOCK) {
            "wired"
        } else {
            "unknown"
        }
    }
}
