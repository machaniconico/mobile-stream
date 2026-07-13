# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# RootEncoder 2.5.4 exposes only a fire-and-forget RTMP disconnect. The direct
# publisher reflects this suspend overload so stop completion can await ownership release.
-keepclassmembers class com.pedro.rtmp.rtmp.RtmpClient {
    private java.lang.Object disconnect(boolean, kotlin.coroutines.Continuation);
}
