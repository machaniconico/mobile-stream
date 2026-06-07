# MobileLiveCaster

MobileLiveCaster is an OBS-like mobile VTuber streaming studio concept for iOS and Android.

The current implementation includes a verified TypeScript/Vite prototype and a React Native bare app. Both share the core scene model, stream profile model, avatar runtime, and live-engine contract. Android now has a native MediaProjection/RTMP path behind that contract, while iOS remains staged around ReplayKit skeletons.

## Current Prototype

- OBS-like scene/source stack.
- Screen, PNGTuber, Live2D, image, solid, and text source records.
- Layer visibility, lock, ordering, and transform controls.
- RTMP/RTMPS destination profiles with YouTube Live, Twitch Auto, Twitch Tokyo, and Custom presets.
- Commercial-start readiness checks for endpoint, protocol, stream key, quality, and scene safety.
- Stream key redaction and no-secret browser persistence.
- Keychain/Android Keystore-backed mobile profile storage for stream keys.
- Quality presets.
- Voice lip-sync meter and expression buttons.
- Chat/comment read-aloud queue with test comments, muted words, and speech controls.
- Mock Go Live, Stop, and Reconnect controls.
- iOS ReplayKit Broadcast Upload Extension skeleton.
- Android MediaProjection service skeleton.
- React Native host app scaffold with standard `ios/` and `android/` projects.
- React Native mobile Studio screen using the shared domain model and mock engine.
- Android native bridge for MediaProjection consent, foreground service streaming, H.264/AAC encoding, and RTMP/RTMPS publishing through RootEncoder.
- Android publish URLs are assembled from the selected server URL plus the stored stream key at start time.
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
- Secret storage: browser persistence strips stream keys; mobile persistence uses Keychain/Android Keystore-backed native storage.
- Chat reader: platform chat APIs can feed the shared queue; current UI includes manual/test comments and native/browser TTS output.
- Avatar rendering: PNGTuber first, Live2D after licensing and runtime validation.

Android device streaming now routes through `LiveCasterNative` when the native module is linked. iOS and non-device development still fall back to the mock engine.

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
