package com.mobilelivecaster.streaming

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class LiveCasterPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        when (name) {
            LiveCasterNativeModule.NAME -> LiveCasterNativeModule(reactContext)
            SecureProfileStoreModule.NAME -> SecureProfileStoreModule(reactContext)
            else -> null
        }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
        mapOf(
            LiveCasterNativeModule.NAME to ReactModuleInfo(
                LiveCasterNativeModule.NAME,
                LiveCasterNativeModule::class.java.name,
                false,
                false,
                false,
                ReactModuleInfo.classIsTurboModule(LiveCasterNativeModule::class.java)
            ),
            SecureProfileStoreModule.NAME to ReactModuleInfo(
                SecureProfileStoreModule.NAME,
                SecureProfileStoreModule::class.java.name,
                false,
                false,
                false,
                ReactModuleInfo.classIsTurboModule(SecureProfileStoreModule::class.java)
            )
        )
    }
}
