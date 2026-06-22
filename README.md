# MobileLiveCaster

MobileLiveCaster is an OBS-like mobile VTuber streaming studio concept for iOS and Android.

The current implementation includes a verified TypeScript/Vite prototype and a React Native bare app. Both share the core scene model, stream profile model, avatar runtime, and live-engine contract. Android has a native MediaProjection/RTMP path behind that contract, and iOS now includes a ReplayKit Broadcast Upload Extension path with VideoToolbox H.264, AudioToolbox AAC, and an in-extension RTMP/RTMPS publisher foundation.

## Current Prototype

- OBS-like scene/source stack.
- Screen, PNGTuber, Live2D, image, solid, and text source records.
- Layer visibility, lock, ordering, and transform controls.
- RTMP/RTMPS destination profiles with YouTube Live, Twitch Auto, Twitch Tokyo, and Custom presets.
- Commercial-start readiness checks for endpoint, protocol, stream key, quality, and scene safety.
- Stream diagnostics panel with redacted publish URL, upload target estimate, live telemetry checks, and sanitized report export/share.
- Stream key redaction and no-secret browser persistence.
- Keychain/Android Keystore-backed mobile profile storage for stream keys.
- In-app stream key clear and replacement controls.
- Durable scene persistence on web, iOS, and Android with persisted-scene normalization.
- Quality presets.
- Voice lip-sync meter and expression buttons.
- Mic effect presets with gain, noise gate, compression, and Android PCM processing.
- Headphone-only mic monitor settings for hearing the processed mic signal locally.
- Chat/comment read-aloud queue with test comments, muted words, duplicate suppression, queue limits, and speech controls.
- YouTube LiveChatMessages and Twitch EventSub chat payload adapters feeding the shared read-aloud queue.
- Durable platform chat adapter settings through the shared profile store.
- OAuth chat authorization controls for YouTube PKCE authorization-code callbacks and Twitch implicit callbacks, feeding YouTube live chat polling and Twitch IRC WebSocket ingestion.
- Keychain/Android Keystore-backed mobile OAuth credential storage, with YouTube refresh-token rotation and periodic Twitch token validation.
- Mobile OAuth callback deep links for `mobilelivecaster://oauth/*` and `com.example.mobilelivecaster:/oauth/*`.
- Mock Go Live, Stop, and Reconnect controls.
- iOS ReplayKit Broadcast Upload Extension target and startup bridge.
- iOS Broadcast Upload Extension H.264/AAC encode path with app/mic audio mixing.
- iOS RTMP/RTMPS publisher foundation with reconnect backoff state.
- Android MediaProjection service skeleton.
- React Native host app scaffold with standard `ios/` and `android/` projects.
- React Native mobile Studio screen using the shared domain model and mock engine.
- Android native bridge for MediaProjection consent, foreground service streaming, H.264/AAC encoding, and RTMP/RTMPS publishing through RootEncoder.
- Android publish URLs are assembled from the selected server URL plus the stored stream key at start time.
- Android microphone effects are applied before AAC encoding, with optional headphone monitor playback.
- Android start-time microphone/notification runtime permission preflight.
- Native chat speech output through Android TextToSpeech and iOS AVSpeechSynthesizer.

## Commands

```bash
npm install
npm run dev
npm run mobile:start
npm test
npm run typecheck
npm run build
npm run verify:rn
npm run android:assembleDebug
npm run ios:pods
npm run ios:build:simulator
```

`npm run verify:rn` builds Metro JS bundles for iOS and Android. It does not require a simulator, device, Android Studio, or CocoaPods.

## Native Direction

- iOS screen capture: ReplayKit Broadcast Upload Extension.
- Android screen capture: MediaProjection foreground service.
- Encoding: VideoToolbox on iOS, MediaCodec on Android.
- Streaming: RTMP/RTMPS publisher behind `src/native/LiveCasterNative.ts`.
- Go Live readiness: fail closed before native capture starts, with UI-visible blocking reasons.
- Stream diagnostics: endpoint, transport security, stream key presence, scene visibility, bitrate/FPS/drop/reconnect telemetry, estimated upload target, and sanitized export/share reports are available before and during live sessions.
- Secret storage: browser persistence strips stream keys; mobile persistence uses Keychain/Android Keystore-backed native storage.
- Stream key management: users can clear the stored key in-app and paste a replacement key without changing the destination preset.
- Scene storage: web uses localStorage; Android uses app SharedPreferences; iOS writes an atomic scene JSON file under Application Support.
- Chat reader: YouTube/Twitch payload adapters can feed the shared queue; current UI includes manual/test comments, platform adapter test ingest, OAuth authorization/callback controls, network connect controls, and native/browser TTS output. Browser OAuth remains session-only; mobile credentials are stored through Keychain/Android Keystore-backed native storage.
- Avatar rendering: PNGTuber first, Live2D after licensing and runtime validation.

Android device streaming routes through `LiveCasterNative` when the native module is linked. iOS app-side setup can launch the Broadcast Upload Extension picker and pass App Group configuration into the extension. Non-device development still falls back to the mock engine.

## Device Builds

iOS:

```bash
cd ios
bundle install
bundle exec pod install
cd ..
npm run mobile:ios
```

Android requires a JDK and Android SDK:

```bash
npm run mobile:android
```

The local setup expects:

- JDK 17 at `/opt/homebrew/opt/openjdk@17`
- Android SDK at `~/Library/Android/sdk`
- Watchman from Homebrew
- CocoaPods from Homebrew

The helper script [scripts/rn-env.sh](scripts/rn-env.sh) exports the required environment variables for project commands.

## Status

See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).
