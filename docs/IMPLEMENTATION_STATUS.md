# Implementation Status

## Implemented Now

- TypeScript app scaffold with Vite.
- OBS-like scene/source/render graph domain model.
- Persisted scene normalization with clamped canvas/source/transform/avatar runtime values.
- Stream profile model for RTMP and RTMPS destinations, including YouTube Live, Twitch Auto, Twitch Tokyo, and Custom presets.
- Commercial-start readiness checks for endpoint, protocol, stream key, quality, and scene safety.
- Shared Go Live preflight model for launch blocking, warning surfacing, engine-state duplicate-start protection, and failed-start operation logging.
- Stream diagnostics model for redacted publish URL, endpoint parsing, upload target estimate, readiness issues, live telemetry health checks, and sanitized diagnostic reports.
- Native composition readiness/diagnostics model that distinguishes native-supported avatar/image/solid/text overlays from underlay ordering, Live2D production gaps, and iOS Broadcast Upload Extension still-image asset access risks before device RTMP publishing.
- Stream health history model for average/min bitrate and FPS, dropped-frame/reconnect trend summaries, diagnostics checks, and report export.
- Post-stream session summary model for completed session outcome, warning/failure/recovery counts, health summary, and next-stream recommendations.
- Durable completed stream session summary persistence for Web localStorage and React Native native storage, with corrupt payload recovery and retention limiting.
- Completed stream session history management in Web and React Native diagnostics, including local history clearing for privacy/support resets.
- Completed stream session history trend analysis for clean-rate, stability, average duration, recovery totals, and next-stream recommendations across diagnostics, support bundles, Web, and React Native.
- Completed stream session summaries retain safe native runtime evidence, including publisher state, compositor status, congestion, queue size, sent/dropped frame counts, and bytes, without storing raw native error messages.
- Commercial pre-release validation checklist for configuration readiness, RTMPS transport, private ingest smoke tests, destination dashboard checks, physical-device evidence, retained session baselines, and support-bundle evidence across diagnostics, support bundles, Web, and React Native.
- Physical validation evidence recording for iOS/Android private RTMP(S) runs, including retained pass/warn/fail run history, Web localStorage, mobile native storage, diagnostics integration, support bundle summaries, and Web/React Native recorder UI.
- Release-candidate validation evidence gating for freshness, current destination/protocol matching, same-build iOS/Android coverage, stale evidence warnings, and support-bundle eligible/stale run counts.
- Physical validation runs retain safe native runtime evidence from the current native publisher/compositor or the latest completed session, and native warn/fail states automatically downgrade retained validation outcomes.
- Physical validation runs retain safe YouTube/Twitch dashboard evidence, including YouTube broadcast/stream/health status and Twitch live/offline status, and unhealthy dashboard states downgrade retained validation outcomes.
- Live quality advisor model for maintaining, monitoring, lowering quality, reconnecting, or stopping based on active incidents, history, and recovery state, with safe suggested-quality application in Web and React Native.
- Redacted support bundle export combining preflight, diagnostics, scene composition, stream target, and safe profile summaries for support triage.
- Stream quality incident model for active bitrate/FPS/drop/reconnect problems, recommendations, UI surfacing, and report export.
- Shared stream recovery policy model for retry budget, bounded exponential backoff, degraded telemetry detection, failed-engine recovery advice, and sanitized report export.
- Shared app-level automatic recovery scheduler for Web and React Native, including failed-engine reconnect, critical telemetry hold time, retry budget enforcement, and timer deduplication.
- Shared stream session event log for status transitions, manual operations, automatic recovery actions, support diagnostics, and redacted report export.
- Stream key redaction and no-secret browser persistence.
- In-app stream key clear/replacement controls for browser and mobile setup screens.
- Mic effect profile model with presets, gain, noise gate, compression, and headphone monitor settings.
- Chat/comment read-aloud domain model with queueing, muted words, duplicate suppression, queue limits, URL redaction, and speech text shaping.
- Platform chat adapter model for YouTube LiveChatMessages responses and Twitch EventSub chat notifications.
- Platform chat adapter settings persisted with the shared studio profile on web and mobile.
- OAuth chat authorization layer for YouTube PKCE authorization-code callbacks, Twitch implicit callbacks, and Twitch Device Code Flow, with tokens kept out of persisted profiles.
- Secure mobile OAuth credential persistence through Keychain/Android Keystore-backed native storage.
- YouTube/Twitch OAuth refresh-token rotation and hourly Twitch token validation scheduling for mobile chat authorization.
- OAuth/API-backed platform stream key controls: YouTube reusable stream creation for key rotation and Twitch Helix current-key sync.
- OAuth/API-backed platform publishing controls: YouTube scheduled Live Broadcast creation, stream binding, broadcast/ingest health refresh, and test/live/complete lifecycle transitions; Twitch channel title/category/language metadata update plus live/offline status refresh.
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
  - Go Live preflight banner with blocking reasons and operator recommendations
  - readiness panel with blocking errors and warnings
  - stream diagnostics panel with endpoint/quality/telemetry/history/quality-advisor/last-session checks, suggested-quality apply, JSON report export, and support bundle export
  - active stream quality incident panel with operator recommendations
  - stream session event timeline for live support diagnostics
  - quality profiles
  - chat reader panel with test comments, platform adapter ingest, safety controls, and speech settings
  - Go Live, Stop, Reconnect mock controls
- React Native mobile readiness panel, Go Live preflight banner, and invalid-profile blocking.
- React Native mobile stream diagnostics panel using the shared diagnostics model, including health history, quality advisor, last-session summary, sanitized report sharing, and support bundle sharing.
- Web and React Native diagnostics show last-session native runtime evidence for post-stream support triage.
- Web and React Native validation evidence panels show latest-run native runtime evidence so release-candidate records can prove the native publisher/compositor path.
- Web and React Native validation evidence panels show latest-run platform dashboard evidence so release-candidate records can prove destination-side ingest health.
- React Native mobile active stream quality incident panel with operator recommendations.
- React Native mobile stream session event timeline using the shared diagnostics model.
- React Native mobile chat reader panel with test comments, platform adapter ingest, safety controls, and speech settings.
- iOS ReplayKit Broadcast Upload Extension target registered in the Xcode project.
- iOS app-side Broadcast Picker startup bridge with App Group configuration handoff.
- iOS commercial bundle identifiers and App Group alignment for the host app and ReplayKit Broadcast Upload Extension.
- iOS Broadcast Upload Extension runtime state reporting through App Group storage.
- iOS host app runtime telemetry polling from the Broadcast Upload Extension, feeding bitrate, FPS, drops, reconnect attempts, errors, and composition status into the React Native snapshot.
- iOS Broadcast Upload Extension VideoToolbox H.264 encoder.
- iOS Broadcast Upload Extension AudioToolbox AAC encoder with app/mic PCM mixing.
- iOS Broadcast Upload Extension RTMP/RTMPS publisher foundation with H.264/AAC packetization.
- iOS RTMP publisher reconnect backoff state with bounded retry attempts.
- iOS ReplayKit Broadcast Upload Extension compositor for PNGTuber still-image/fallback, text, image, and solid overlays on encoded frames, with App Group runtime composition status.
- iOS native-compositor preflight diagnostics warn when PNGTuber/image overlays use missing, host-sandbox file-backed, relative, content, http(s), data, or otherwise unsupported still-image asset URIs that the Broadcast Upload Extension cannot reliably load.
- iOS mobile still-image asset picker/preparation copies selected PNGTuber/image source files into the shared App Group container and stores a ReplayKit-extension-readable `file://` URI in the scene.
- Android MediaProjection service skeleton.
- Android `LiveCasterNative` React Native module registered in the host app.
- Android MediaProjection consent flow from React Native.
- Android foreground streaming service with `mediaProjection|microphone` service type.
- Android RTMP/RTMPS publishing path through RootEncoder, using screen capture and microphone input.
- Android publish endpoint assembly from the app's server URL and stream key fields.
- Android native GL overlay compositor for PNGTuber still-image, text, image, and solid scene sources on top of MediaProjection capture, with applied/pending overlay status in stream health messages.
- Android mobile still-image asset picker/preparation copies selected content/file/path PNGTuber/image source assets into app-internal storage and stores a stable `file://` URI for native GL overlay rendering.
- Android microphone PCM effect path through RootEncoder `CustomAudioEffect`.
- Android headphone-only mic monitor playback through `AudioTrack`.
- Android microphone/notification runtime permission preflight before MediaProjection launch.
- Android release signing fail-closed configuration using `MLC_RELEASE_*` keystore inputs instead of debug signing for release artifacts.
- Native release-configuration audit script covering Android release signing, streaming permissions, OAuth callback schemes, iOS usage descriptions, iOS privacy manifest packaging, and ReplayKit Broadcast Upload Extension setup.
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
- React Native mobile source controls can pick or prepare PNGTuber/image still-image assets for native compositor storage before streaming.
- GitHub Actions `test` status check for PRs and `main` pushes, covering native release-configuration audit, unit tests, web/RN typecheck, web build, and iOS/Android React Native JavaScript bundling.
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
- iOS physical-device evidence that App Group-copied PNGTuber/image assets render correctly inside the Broadcast Upload Extension compositor.
- First-party VideoToolbox/MediaCodec encoder implementations outside RootEncoder.
- Live2D Cubism SDK integration.
- Twitch stream key reset/rotation through API. Twitch currently exposes stream key retrieval through Helix, not a public reset endpoint.

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
3. Validate iOS native compositor output on a physical device and tune frame latency after private endpoint validation.
4. Validate YouTube broadcast status refresh and lifecycle transitions with a real account and active ingest stream.
5. Tune app-level recovery thresholds against measured physical-device ingest behavior.
