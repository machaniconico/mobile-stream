package com.mobilelivecaster.streaming

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
    val sampledAt: Long = 0
) {
    fun asWritableMap(): WritableMap = Arguments.createMap().apply {
        putString("thermalState", thermalState)
        putInt("thermalStatusCode", thermalStatusCode)
        putInt("batteryLevelPercent", batteryLevelPercent)
        putBoolean("charging", charging)
        putBoolean("lowPowerMode", lowPowerMode)
        putString("powerSource", powerSource)
        putDouble("sampledAt", sampledAt.toDouble())
    }
}

class DeviceResourceMonitor(context: Context) {
    private data class BatterySnapshot(
        val levelPercent: Int,
        val charging: Boolean,
        val powerSource: String
    )

    private val applicationContext = context.applicationContext
    private val powerManager = applicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
    private var lastSnapshot: NativeRuntimeDevice? = null

    @Synchronized
    fun snapshot(): NativeRuntimeDevice {
        val previous = lastSnapshot
        val thermalStatusCode = readThermalStatusCode() ?: previous?.thermalStatusCode ?: -1
        val battery = readBatterySnapshot()
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
