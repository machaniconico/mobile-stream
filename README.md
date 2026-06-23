# MobileLiveCaster

MobileLiveCaster is an OBS-like mobile VTuber streaming studio concept for iOS and Android.

The current implementation includes a verified TypeScript/Vite prototype and a React Native bare app. Both share the core scene model, stream profile model, avatar runtime, and live-engine contract. Android has a native MediaProjection/RTMP path behind that contract, and iOS now includes a ReplayKit Broadcast Upload Extension path with VideoToolbox H.264, AudioToolbox AAC, and an in-extension RTMP/RTMPS publisher foundation.

## Current Prototype

- OBS-like scene/source stack.
- Screen, PNGTuber, Live2D, image, solid, and text source records.
- Layer visibility, lock, ordering, and transform controls.
- RTMP/RTMPS destination profiles with YouTube Live, Twitch Auto, Twitch Tokyo, and Custom presets.
- OAuth/API-backed platform stream key controls: YouTube can create a new reusable Live Stream and apply its RTMPS key; Twitch can sync the current Helix stream key.
- OAuth/API-backed publishing controls: YouTube can create, bind, refresh status, test, start, and complete scheduled Live Broadcasts; Twitch can update title, category, broadcaster language, and refresh live/offline status.
- Commercial-start readiness checks for endpoint, protocol, stream key, quality, and scene safety.
- Stream diagnostics panel with redacted publish URL, upload target estimate, live telemetry checks, native runtime validation evidence, platform dashboard validation evidence, and sanitized report export/share.
- Native composition readiness and diagnostics for native-supported avatar/text/image/solid overlays, underlay ordering, Live2D gaps, and iOS Broadcast Upload Extension still-image asset access risks before device RTMP publishing.
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
- OAuth chat authorization controls for YouTube PKCE authorization-code callbacks, Twitch implicit callbacks, and Twitch Device Code Flow, feeding YouTube live chat polling and Twitch IRC WebSocket ingestion.
- Keychain/Android Keystore-backed mobile OAuth credential storage, with YouTube/Twitch refresh-token rotation and periodic Twitch token validation.
- Mobile OAuth callback deep links for `mobilelivecaster://oauth/*` and `com.mobilelivecaster.app:/oauth/*`.
- Mock Go Live, Stop, and Reconnect controls.
- iOS ReplayKit Broadcast Upload Extension target and startup bridge.
- iOS Broadcast Upload Extension H.264/AAC encode path with app/mic audio mixing.
- iOS RTMP/RTMPS publisher foundation with reconnect backoff state.
- iOS host app telemetry bridge that polls Broadcast Upload Extension runtime state for FPS, bitrate, drops, reconnects, errors, and native composition status.
- Android MediaProjection service skeleton.
- React Native host app scaffold with standard `ios/` and `android/` projects.
- React Native mobile Studio screen using the shared domain model and mock engine.
- Android native bridge for MediaProjection consent, foreground service streaming, H.264/AAC encoding, and RTMP/RTMPS publishing through RootEncoder.
- Android publish URLs are assembled from the selected server URL plus the stored stream key at start time.
- Android native GL overlay compositor for visible PNGTuber still-image, text, image, and solid scene sources on top of MediaProjection capture.
- iOS ReplayKit Broadcast Upload Extension compositor for visible PNGTuber still-image, text, image, and solid overlays on top of captured frames.
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
npm run verify:release-config
npm run android:assembleDebug
npm run android:assembleRelease
npm run ios:pods
npm run ios:build:simulator
```

`npm run verify:rn` builds Metro JS bundles for iOS and Android. It does not require a simulator, device, Android Studio, or CocoaPods.

`npm run verify:release-config` audits native store-release configuration, including Android release signing fail-closed behavior, streaming permissions, OAuth callback schemes, iOS usage descriptions, the iOS privacy manifest, and the ReplayKit Broadcast Upload Extension setup.

GitHub Actions runs the required `test` status check on pull requests and `main` pushes. The gate installs from `package-lock.json`, verifies native release configuration, runs unit tests, typechecks web and React Native code, builds the web prototype, and bundles React Native JavaScript for iOS and Android.

## Native Direction

- iOS screen capture: ReplayKit Broadcast Upload Extension.
- Android screen capture: MediaProjection foreground service.
- Encoding: VideoToolbox on iOS, MediaCodec on Android.
- Streaming: RTMP/RTMPS publisher behind `src/native/LiveCasterNative.ts`.
- Go Live readiness: fail closed before native capture starts, with UI-visible blocking reasons.
- Stream diagnostics: endpoint, transport security, stream key presence, scene visibility, bitrate/FPS/drop/reconnect telemetry, native publisher/compositor evidence, estimated upload target, post-stream session evidence, physical validation native-runtime evidence, platform dashboard evidence, and sanitized export/share reports are available before, during, and after live sessions.
- Secret storage: browser persistence strips stream keys; mobile persistence uses Keychain/Android Keystore-backed native storage.
- Stream key management: users can clear the stored key in-app and paste a replacement key without changing the destination preset.
- Scene storage: web uses localStorage; Android uses app SharedPreferences; iOS writes an atomic scene JSON file under Application Support.
- Chat reader: YouTube/Twitch payload adapters can feed the shared queue; current UI includes manual/test comments, platform adapter test ingest, OAuth authorization/callback controls, Twitch device-code authorization, network connect controls, and native/browser TTS output. Browser OAuth remains session-only; mobile credentials are stored through Keychain/Android Keystore-backed native storage.
- Platform stream key management: YouTube OAuth uses Live Streaming API `liveStreams.insert` to rotate by creating a new reusable stream; Twitch OAuth uses Helix Get Stream Key to sync the current key because Twitch does not expose a public reset endpoint.
- Platform publishing management: YouTube OAuth uses Live Streaming API `liveBroadcasts.insert`, `liveBroadcasts.bind`, `liveBroadcasts.list`, `liveStreams.list`, and `liveBroadcasts.transition` for scheduled broadcast setup, ingest health refresh, and lifecycle control; Twitch OAuth uses Helix `PATCH /channels`, category search, `GET /channels`, and `GET /streams` for channel metadata and live/offline status.
- Avatar rendering: native PNGTuber overlays on iOS/Android first, Live2D after licensing and runtime validation.

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

Android release artifacts require a production keystore. Provide these as Gradle properties or environment variables before running release tasks:

```bash
MLC_RELEASE_STORE_FILE=/absolute/path/to/release.keystore
MLC_RELEASE_STORE_PASSWORD=...
MLC_RELEASE_KEY_ALIAS=...
MLC_RELEASE_KEY_PASSWORD=...
```

Release builds fail closed when those values are missing, so debug keystores cannot be used accidentally for store artifacts.

The local setup expects:

- JDK 17 at `/opt/homebrew/opt/openjdk@17`
- Android SDK at `~/Library/Android/sdk`
- Watchman from Homebrew
- CocoaPods from Homebrew

The helper script [scripts/rn-env.sh](scripts/rn-env.sh) exports the required environment variables for project commands.

## Status

See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).
