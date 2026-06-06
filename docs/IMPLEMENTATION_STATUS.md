# Implementation Status

## Implemented Now

- TypeScript app scaffold with Vite.
- OBS-like scene/source/render graph domain model.
- Stream profile model for RTMP and RTMPS destinations.
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
  - quality profiles
  - Go Live, Stop, Reconnect mock controls
- iOS ReplayKit Broadcast Upload Extension skeleton.
- Android MediaProjection service skeleton.
- React Native bare app scaffold generated from React Native 0.85.3.
- Standard `ios/` and `android/` projects for the MobileLiveCaster host app.
- React Native mobile Studio UI that reuses `src/domain` and the mock stream engine.
- Metro bundle verification for both iOS and Android.

## Not Implemented Yet

- Real RTMP/RTMPS native publisher.
- Real screen capture in a packaged iOS/Android app.
- Native compositor.
- VideoToolbox and MediaCodec encoder integration.
- Live2D Cubism SDK integration.
- Secure platform storage for stream keys.
- React Native bare app packaging.
- iOS Broadcast Upload Extension Xcode target registration.
- Android MediaProjection runtime permission and foreground notification flow.

## Local Environment Notes

- Xcode is available.
- Java/JDK is not installed, so Android builds are currently blocked.
- CocoaPods is not installed, so iOS dependency installation is currently blocked.
- Watchman is not installed, so React Native local development will need setup before device builds.
- The React Native JavaScript bundle can be generated for iOS and Android without Java/JDK.

## Next Slice

1. Install JDK 17, Android Studio/SDK, Watchman, and CocoaPods.
2. Run the React Native app on iOS simulator/device.
3. Run the React Native app on Android emulator/device.
4. Replace `MockLiveCaster` with platform native modules behind the same interface.
5. Build Android MediaProjection capture first, because it is easier to iterate than iOS Broadcast Upload Extension constraints.
6. Register the iOS Broadcast Upload Extension target once app group storage and render graph serialization are stable.
