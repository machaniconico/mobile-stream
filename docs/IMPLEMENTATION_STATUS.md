# Implementation Status

## Implemented Now

- TypeScript app scaffold with Vite.
- OBS-like scene/source/render graph domain model.
- Stream profile model for RTMP and RTMPS destinations, including YouTube Live, Twitch Auto, Twitch Tokyo, and Custom presets.
- Commercial-start readiness checks for endpoint, protocol, stream key, quality, and scene safety.
- Stream key redaction and no-secret browser persistence.
- Mic effect profile model with presets, gain, noise gate, compression, and headphone monitor settings.
- Chat/comment read-aloud domain model with queueing, muted words, URL redaction, and speech text shaping.
- Avatar runtime model for PNGTuber/Live2D expression, lip sync, and auto blink.
- Stream state machine for idle, preparing, live, reconnecting, stopping, and failed states.
- Mock live engine for UI development without native capture.
- Browser-preview Studio UI:
  - source stack
  - source visibility and lock controls
  - transform sliders
  - program preview
  - mic/lip-sync meter
  - mic effect and monitor controls
  - expression buttons
  - YouTube Live/Twitch/Custom RTMP setup
  - readiness panel with blocking errors and warnings
  - quality profiles
  - chat reader panel with test comments and speech settings
  - Go Live, Stop, Reconnect mock controls
- React Native mobile readiness panel and Go Live blocking for invalid profiles.
- React Native mobile chat reader panel with test comments and speech settings.
- iOS ReplayKit Broadcast Upload Extension skeleton.
- Android MediaProjection service skeleton.
- Android `LiveCasterNative` React Native module registered in the host app.
- Android MediaProjection consent flow from React Native.
- Android foreground streaming service with `mediaProjection|microphone` service type.
- Android RTMP/RTMPS publishing path through RootEncoder, using screen capture and microphone input.
- Android publish endpoint assembly from the app's server URL and stream key fields.
- Android microphone PCM effect path through RootEncoder `CustomAudioEffect`.
- Android headphone-only mic monitor playback through `AudioTrack`.
- Android microphone/notification runtime permission preflight before MediaProjection launch.
- Android Keystore-backed encrypted mobile profile storage for stream keys.
- Android TextToSpeech native module for chat read-aloud.
- iOS Keychain-backed mobile profile storage exposed to React Native.
- iOS AVSpeechSynthesizer native module for chat read-aloud.
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
- Android physical-device tuning for mic monitor latency and Bluetooth route behavior.
- Native compositor.
- First-party VideoToolbox/MediaCodec encoder implementations outside RootEncoder.
- Live2D Cubism SDK integration.
- YouTube/Twitch/platform comment API ingestion.
- OAuth-backed live chat connection.
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
3. Add YouTube/Twitch chat adapters behind the shared chat queue.
4. Add in-app key clear/rotation controls.
5. Register the iOS Broadcast Upload Extension target once app group storage and render graph serialization are stable.
