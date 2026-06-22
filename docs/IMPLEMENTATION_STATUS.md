# Implementation Status

## Implemented Now

- TypeScript app scaffold with Vite.
- OBS-like scene/source/render graph domain model.
- Persisted scene normalization with clamped canvas/source/transform/avatar runtime values.
- Stream profile model for RTMP and RTMPS destinations, including YouTube Live, Twitch Auto, Twitch Tokyo, and Custom presets.
- Commercial-start readiness checks for endpoint, protocol, stream key, quality, and scene safety.
- Stream diagnostics model for redacted publish URL, endpoint parsing, upload target estimate, readiness issues, live telemetry health checks, and sanitized diagnostic reports.
- Stream key redaction and no-secret browser persistence.
- In-app stream key clear/replacement controls for browser and mobile setup screens.
- Mic effect profile model with presets, gain, noise gate, compression, and headphone monitor settings.
- Chat/comment read-aloud domain model with queueing, muted words, duplicate suppression, queue limits, URL redaction, and speech text shaping.
- Platform chat adapter model for YouTube LiveChatMessages responses and Twitch EventSub chat notifications.
- Platform chat adapter settings persisted with the shared studio profile on web and mobile.
- OAuth chat authorization layer for YouTube PKCE authorization-code callbacks and Twitch implicit callbacks, with tokens kept out of persisted profiles.
- OAuth-token chat connection layer for YouTube live chat polling and Twitch IRC WebSocket ingestion.
- Mobile OAuth callback URL scheme registration and React Native callback capture for chat authorization.
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
  - stream diagnostics panel with endpoint/quality/telemetry checks and JSON report export
  - quality profiles
  - chat reader panel with test comments, platform adapter ingest, safety controls, and speech settings
  - Go Live, Stop, Reconnect mock controls
- React Native mobile readiness panel and Go Live blocking for invalid profiles.
- React Native mobile stream diagnostics panel using the shared diagnostics model, including sanitized report sharing.
- React Native mobile chat reader panel with test comments, platform adapter ingest, safety controls, and speech settings.
- iOS ReplayKit Broadcast Upload Extension target registered in the Xcode project.
- iOS app-side Broadcast Picker startup bridge with App Group configuration handoff.
- iOS Broadcast Upload Extension runtime state reporting through App Group storage.
- iOS Broadcast Upload Extension VideoToolbox H.264 encoder.
- iOS Broadcast Upload Extension AudioToolbox AAC encoder with app/mic PCM mixing.
- iOS Broadcast Upload Extension RTMP/RTMPS publisher foundation with H.264/AAC packetization.
- iOS RTMP publisher reconnect backoff state with bounded retry attempts.
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
- Mobile stream key clearing by overwriting the secure native profile with a cleared key.
- Durable mobile-side scene persistence through Android SharedPreferences and iOS atomic Application Support JSON storage.
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

- iOS end-to-end physical device validation against a real RTMP/RTMPS endpoint.
- iOS YouTube Live/Twitch RTMP ingest validation with real stream keys.
- iOS Broadcast Upload Extension production signing/provisioning validation.
- Android end-to-end physical device validation against a real RTMP/RTMPS endpoint.
- Android physical-device tuning for mic monitor latency and Bluetooth route behavior.
- Native compositor.
- First-party VideoToolbox/MediaCodec encoder implementations outside RootEncoder.
- Live2D Cubism SDK integration.
- Secure refresh-token storage and refresh scheduling for OAuth-backed live chat.
- OAuth/API-backed platform stream key rotation.

## Local Environment Notes

- Xcode is available.
- JDK 17 is installed through Homebrew.
- CocoaPods is installed through Homebrew.
- Watchman is installed through Homebrew.
- Android Studio already exists in `/Applications/Android Studio.app`.
- Android command line tools are installed through Homebrew.

## Next Slice

1. Run iOS and Android on physical devices against a private RTMPS endpoint and tune bitrate/fps/audio sync behavior.
2. Validate YouTube Live and Twitch ingest with real stream keys on both platforms.
3. Add secure refresh-token storage/rotation for OAuth-backed YouTube chat and hourly Twitch token validation.
4. Add OAuth/API-backed platform stream key rotation.
