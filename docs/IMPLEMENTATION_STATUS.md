# Implementation Status

## Implemented Now

- TypeScript app scaffold with Vite.
- OBS-like scene/source/render graph domain model.
- Stream profile model for RTMP and RTMPS destinations.
- Commercial-start readiness checks for endpoint, protocol, stream key, quality, and scene safety.
- Stream key redaction and no-secret browser persistence.
- Avatar runtime model for PNGTuber/Live2D expression, lip sync, and auto blink.
- Stream state machine for idle, preparing, live, reconnecting, stopping, and failed states.
- Mock live engine for UI development without native capture.
- Browser-preview Studio UI:
  - source stack
  - source visibility and lock controls
  - transform sliders
  - program preview
  - mic/lip-sync meter
  - expression buttons
  - RTMP/RTMPS setup
  - readiness panel with blocking errors and warnings
  - quality profiles
  - Go Live, Stop, Reconnect mock controls
- React Native mobile readiness panel and Go Live blocking for invalid profiles.
- iOS ReplayKit Broadcast Upload Extension skeleton.
- Android MediaProjection service skeleton.
- Android `LiveCasterNative` React Native module registered in the host app.
- Android MediaProjection consent flow from React Native.
- Android foreground streaming service with `mediaProjection|microphone` service type.
- Android RTMP/RTMPS publishing path through RootEncoder, using screen capture and microphone input.
- React Native bare app scaffold generated from React Native 0.85.3.
- Standard `ios/` and `android/` projects for the MobileLiveCaster host app.
- React Native mobile Studio UI that reuses `src/domain` and the mock stream engine.
- Metro bundle verification for both iOS and Android.
- Homebrew React Native environment installed: JDK 17, Watchman, CocoaPods, Android command line tools.
- Android SDK packages installed: `platforms;android-36`, `build-tools;36.0.0`, `ndk;27.1.12297006`, `platform-tools`.
- Android `assembleDebug` build succeeds.
- iOS `pod install` succeeds and generated `MobileLiveCaster.xcworkspace`.
- iOS Simulator Debug build succeeds through `xcodebuild`.

## Not Implemented Yet

- iOS RTMP/RTMPS native publisher.
- iOS screen capture in a packaged app.
- Android end-to-end physical device validation against a real RTMP/RTMPS endpoint.
- Native compositor.
- VideoToolbox and MediaCodec encoder integration.
- Live2D Cubism SDK integration.
- Secure platform storage for stream keys.
- Durable mobile-side scene/profile persistence.
- iOS Broadcast Upload Extension Xcode target registration.
- Android MediaProjection runtime permission and foreground notification flow.

## Local Environment Notes

- Xcode is available.
- JDK 17 is installed through Homebrew.
- CocoaPods is installed through Homebrew.
- Watchman is installed through Homebrew.
- Android Studio already exists in `/Applications/Android Studio.app`.
- Android command line tools are installed through Homebrew.

## Next Slice

1. Run Android on a physical device against a private RTMPS endpoint and tune bitrate/fps behavior.
2. Add Android runtime permission UI for microphone and notification permission.
3. Add secure platform storage for stream keys with Keychain/Keystore.
4. Add durable mobile scene/profile persistence.
5. Register the iOS Broadcast Upload Extension target once app group storage and render graph serialization are stable.
