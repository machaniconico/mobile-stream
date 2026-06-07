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
- Android microphone/notification runtime permission preflight before MediaProjection launch.
- Android Keystore-backed encrypted mobile profile storage for stream keys.
- iOS Keychain-backed mobile profile storage exposed to React Native.
- Durable mobile-side profile persistence through the secure native store.
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
- First-party VideoToolbox/MediaCodec encoder implementations outside RootEncoder.
- Live2D Cubism SDK integration.
- Durable mobile-side scene persistence.
- iOS Broadcast Upload Extension Xcode target registration.
- In-app settings management for clearing or rotating stored stream keys.

## Local Environment Notes

- Xcode is available.
- JDK 17 is installed through Homebrew.
- CocoaPods is installed through Homebrew.
- Watchman is installed through Homebrew.
- Android Studio already exists in `/Applications/Android Studio.app`.
- Android command line tools are installed through Homebrew.

## Next Slice

1. Run Android on a physical device against a private RTMPS endpoint and tune bitrate/fps behavior.
2. Add durable mobile scene persistence through platform storage.
3. Add in-app key clear/rotation controls.
4. Register the iOS Broadcast Upload Extension target once app group storage and render graph serialization are stable.
5. Implement the iOS RTMP/RTMPS publisher path.
