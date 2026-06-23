# Implementation Status

## Implemented Now

- TypeScript app scaffold with Vite.
- OBS-like scene/source/render graph domain model.
- Persisted scene normalization with clamped canvas/source/transform/avatar runtime values.
- Stream profile model for RTMP and RTMPS destinations, including YouTube Live, Twitch Auto, Twitch Tokyo, and Custom presets.
- Commercial-start readiness checks for endpoint, protocol, stream key, quality, and scene safety.
- RTMP/RTMPS destination normalization for pasted YouTube/Twitch full publish URLs across shared profile handling and native endpoint assembly.
- Shared Go Live preflight model for launch blocking, warning surfacing, engine-state duplicate-start protection, and failed-start operation logging.
- Go Live platform-state preflight for platform-visible YouTube streams, requiring a bound broadcast/stream before launch after commercial validation, blocking completed broadcasts, warning on already-live broadcasts, warning when YouTube/Twitch dashboard status is stale or unchecked, and blocking Twitch starts when the channel status is already live.
- Stream diagnostics model for redacted publish URL, endpoint parsing, upload target estimate, readiness issues, live telemetry health checks, and sanitized diagnostic reports.
- Face-tracking production diagnostics for prepared PNGTuber assets, simulated/native-camera input risk, tracking runtime state, active motion count, preflight warnings, support reports, and commercial validation checklist evidence.
- Native composition readiness/diagnostics model that distinguishes native-supported avatar/image/solid/text overlays from underlay ordering, Live2D production gaps, and iOS Broadcast Upload Extension still-image asset access risks before device RTMP publishing.
- Stream health history model for average/min bitrate and FPS, dropped-frame/reconnect trend summaries, diagnostics checks, and report export.
- Post-stream session summary model for completed session outcome, warning/failure/recovery counts, health summary, lip-sync/audio-meter sample summary, spoken-chat success/failure counts, and next-stream recommendations.
- Durable completed stream session summary persistence for Web localStorage and React Native native storage, with corrupt payload recovery and retention limiting.
- Completed stream session history management in Web and React Native diagnostics, including local history clearing for privacy/support resets.
- Completed stream session history trend analysis for clean-rate, stability, average duration, recovery totals, and next-stream recommendations across diagnostics, support bundles, Web, and React Native.
- Completed stream session summaries retain safe native runtime evidence, including publisher state, compositor status, still-image asset loaded/missing counts, congestion, queue size, sent/dropped frame counts, and bytes, without storing raw native error messages.
- Commercial pre-release validation checklist for configuration readiness, RTMPS transport, private ingest smoke tests, destination dashboard checks, physical-device evidence, retained session baselines, and support-bundle evidence across diagnostics, support bundles, Web, and React Native.
- Private RTMP(S) validation runbook for setup, native start, mic FX/headphone monitor checks, YouTube/Twitch chat readout checks, stable monitor hold, destination dashboard check, clean stop, and retained evidence recording across diagnostics, support bundles, Web, and React Native.
- Physical validation evidence recording for iOS/Android private RTMP(S) runs, including retained pass/warn/fail run history, stable monitor-hold bitrate/FPS/drop/reconnect proof, mic FX/headphone monitor snapshots, native self-monitor write/drop proof, device output-route/headphone safety, lip-sync/audio-meter sample summaries, YouTube/Twitch chat readout snapshots, spoken-chat success/failure counts, Web localStorage, mobile native storage, diagnostics integration, support bundle summaries, and Web/React Native recorder UI.
- Release-candidate validation evidence gating for freshness, current destination/protocol matching, same-build iOS/Android coverage, stable monitor-hold proof, native publisher/compositor proof, fresh YouTube/Twitch dashboard checked-at proof, stale evidence warnings, and support-bundle eligible/stale run counts.
- Physical validation runs retain safe native runtime evidence from the current native publisher/compositor or the latest completed session; validation only passes when iOS and Android retained evidence include sent video/audio frames, bytes written, clean compositor state, and fully loaded still-image assets.
- Physical validation runs retain stable monitor-hold proof; validation only passes when each platform has at least 60 seconds and 3 samples of stable bitrate/FPS telemetry with zero drops and zero reconnects.
- Physical validation runs retain mic FX/headphone monitor route, native self-monitor write/drop proof, and chat readout evidence; audio validation only passes when native monitor write/drop proof is present with written frames, written buffers, zero drops, and headphone route proof.
- Physical validation runs retain safe YouTube/Twitch dashboard evidence, including YouTube broadcast/stream/health status, Twitch live/offline status, and per-run dashboard freshness snapshots; unhealthy, stale, or unchecked dashboard states downgrade retained validation outcomes.
- Release-candidate checklist and private validation runbook require fresh YouTube/Twitch dashboard checked-at evidence before treating destination dashboard validation as complete.
- Live quality advisor model for maintaining, monitoring, lowering quality, reconnecting, or stopping based on active incidents, history, and recovery state, with safe suggested-quality application in Web and React Native.
- Shared quality automation guard for Web and React Native that raises live-session quality alerts, records quality automation events, and automatically applies a safer next-stream target only after the encoder is no longer live.
- Live quality update API for Mock, Android, and iOS, allowing same-resolution bitrate/FPS pressure relief while Android stays live, while iOS refreshes the App Group quality target for the next ReplayKit broadcast restart.
- Completed session summaries, physical validation evidence, diagnostics, validation panels, and support bundles retain live quality automation evidence, including live bitrate/FPS updates, next-start target changes, and failed native quality updates.
- Private validation runbook includes a weak-network quality stress fallback step, requiring retained live quality-update or next-start fallback evidence before the runbook can be complete, and blocking when native quality updates fail.
- Public launch checklist surfaces incomplete private validation runbook evidence, including missing weak-network quality stress proof, as a pre-launch commercial-evidence warning for YouTube Public and Twitch starts.
- Redacted support bundle export combining preflight, diagnostics, scene composition, native still-image asset load evidence, stream target, and safe profile summaries for support triage.
- Stream quality incident model for active bitrate/FPS/drop/reconnect problems, recommendations, UI surfacing, and report export.
- Shared stream recovery policy model for retry budget, bounded exponential backoff, degraded telemetry detection, failed-engine recovery advice, and sanitized report export.
- Shared app-level automatic recovery scheduler for Web and React Native, including failed-engine reconnect, critical telemetry hold time, retry budget enforcement, and timer deduplication.
- Web and React Native automatic recovery respects the public launch checklist for unstarted failed-stream recovery while still allowing active live/reconnecting sessions to recover without being blocked by transient dashboard/chat/audio evidence changes.
- Shared stream session event log for status transitions, manual operations, automatic recovery actions, support diagnostics, and redacted report export.
- Stream key redaction and no-secret browser persistence.
- Sensitive OAuth/API error message redaction before user-facing status display.
- OAuth, stream-key, platform publishing, and YouTube chat API calls fail closed with sanitized HTTP/unreadable-JSON errors when upstream responses are empty, non-JSON, or unavailable, while retaining status code, retryability, and `Retry-After` metadata for diagnostics and safe app status retry guidance.
- Native Android/iOS status and publisher-runtime message redaction for publish URLs, stream keys, and bearer tokens before app display.
- In-app stream key clear/replacement controls for browser and mobile setup screens.
- Mic effect profile model with presets, gain, noise gate, compression, and headphone monitor settings.
- Shared audio-route safety model for speaker/receiver/wired/USB/Bluetooth/AirPlay/HDMI output state, monitor-route diagnostics, and Go Live preflight blocking when headphones-only monitoring is routed to speakers.
- Chat/comment read-aloud domain model with queueing, muted words, duplicate suppression, queue limits, URL redaction, and speech text shaping.
- Platform chat adapter model for YouTube LiveChatMessages responses and Twitch EventSub chat notifications.
- Platform chat adapter settings persisted with the shared studio profile on web and mobile.
- OAuth chat authorization layer for YouTube PKCE authorization-code callbacks, Twitch implicit callbacks, and Twitch Device Code Flow, with tokens kept out of persisted profiles.
- Secure mobile OAuth credential persistence through Keychain/Android Keystore-backed native storage.
- YouTube/Twitch OAuth refresh-token rotation and hourly Twitch token validation scheduling for mobile chat authorization, with bounded background retry scheduling for retryable secure-storage sync failures and `Retry-After`.
- Web and React Native platform API operations use a visible shared single-flight guard to reject and UI-lock overlapping stream-key, publishing, broadcast lifecycle, OAuth exchange, and mobile secure-storage maintenance requests while showing the active operation label.
- Platform-specific OAuth credential store for retaining YouTube and Twitch credentials at the same time, with legacy single-credential mobile storage migration.
- OAuth credential health checks for retained platform, scope, and expiry evidence before chat readout, platform-visible Go Live checks, and YouTube broadcast Test/Live/Complete lifecycle controls.
- OAuth/API-backed platform stream key controls: YouTube reusable stream creation for key rotation and Twitch Helix current-key sync.
- OAuth/API-backed platform publishing controls: YouTube scheduled Live Broadcast creation, stream binding, broadcast/ingest health refresh, and test/live/complete lifecycle transitions; Twitch channel title/category/language metadata update plus live/offline status refresh.
- Platform publishing status refreshes retain YouTube/Twitch dashboard checked-at timestamps across profile storage, diagnostics, support bundles, and Web/React Native setup screens.
- Diagnostics reports and support bundles surface YouTube/Twitch dashboard status freshness so release-candidate evidence can prove whether platform checks were current.
- Web and React Native diagnostics panels show current and retained dashboard freshness so stale/missing YouTube/Twitch checks are visible before recording release evidence.
- Web and React Native Go Live areas show a shared public launch checklist covering destination/scene, platform dashboard freshness, chat readout, mic FX headphone monitoring, commercial evidence, and encoder state, with YouTube Public and Twitch starts locked when checklist failures remain while private/unlisted validation starts stay available.
- Web and React Native start handlers recompute the shared public launch checklist immediately before native/mock engine prepare/start, so unsafe YouTube Public and Twitch starts are rejected even if invoked outside the disabled Go Live button path.
- Diagnostics reports and support bundles retain the shared public launch checklist, start-lock state, pass/warn/fail counts, and operator actions for release-candidate audit trails.
- YouTube Public broadcast Live transitions reuse the shared public launch checklist and block public-visibility failures such as chat/audio/evidence readiness while ignoring the expected already-live local encoder item.
- YouTube Live broadcast lifecycle transition preflight for Test/Live/Complete actions, including public-validation gating, local encoder state checks, active ingest checks, fresh dashboard-status checks, health checks, and local-stream-stop protection before completing a broadcast across Web and React Native.
- OAuth-token chat connection layer for YouTube live chat polling and Twitch IRC WebSocket ingestion.
- Platform API controls refresh expiring YouTube/Twitch OAuth credentials before stream-key, broadcast, and channel operations on Web and React Native.
- Mobile OAuth callback URL scheme registration and React Native callback capture for chat authorization.
- Avatar runtime model for PNGTuber/Live2D expression, lip sync, and auto blink.
- Still-image VTuber face tracking runtime with native-camera frames on mobile, simulated frames on web, neutral calibration, dead-zone filtering, jump limiting, lost-face return tuning, and iOS/Android native compositor 2.5D motion scaling.
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
  - chat reader panel with test comments, platform adapter ingest, safety controls, speech settings, stream-stop chat auto-disconnect/readout silence, and queued/recent comment privacy reset
  - Go Live, Stop, Reconnect mock controls
- React Native mobile readiness panel, Go Live preflight banner, and invalid-profile blocking.
- React Native mobile stream diagnostics panel using the shared diagnostics model, including health history, quality advisor, last-session summary, sanitized report sharing, and support bundle sharing.
- Web and React Native diagnostics show last-session native runtime evidence for post-stream support triage.
- Web and React Native validation evidence panels show latest-run monitor-hold and native runtime evidence so release-candidate records can prove the stable private stream and native publisher/compositor path.
- Web and React Native validation evidence panels show latest-run mic FX/headphone monitor route, native self-monitor write/drop proof, and chat readout evidence so release-candidate records can prove voice monitoring and spoken chat behavior.
- Web and React Native validation evidence panels show latest-run platform dashboard evidence so release-candidate records can prove destination-side ingest health.
- React Native mobile active stream quality incident panel with operator recommendations.
- React Native mobile stream session event timeline using the shared diagnostics model.
- React Native mobile chat reader panel with test comments, platform adapter ingest, safety controls, and speech settings.
- iOS ReplayKit Broadcast Upload Extension target registered in the Xcode project.
- iOS app-side Broadcast Picker startup bridge with App Group configuration handoff.
- iOS commercial bundle identifiers and App Group alignment for the host app and ReplayKit Broadcast Upload Extension.
- iOS Broadcast Upload Extension runtime state reporting through App Group storage.
- iOS host app runtime telemetry polling from the Broadcast Upload Extension, feeding bitrate, FPS, drops, reconnect attempts, errors, composition status, and still-image asset loaded/missing counts into the React Native snapshot.
- iOS Broadcast Upload Extension VideoToolbox H.264 encoder.
- iOS Broadcast Upload Extension AudioToolbox AAC encoder with app/mic PCM mixing.
- iOS Broadcast Upload Extension microphone DSP applies the shared mic effects profile to ReplayKit microphone PCM before AAC mixing, including input gain, noise gate, compression, bright/robot presets, soft limiting, and runtime processing evidence.
- iOS Broadcast Upload Extension RTMP/RTMPS publisher foundation with H.264/AAC packetization.
- iOS RTMP publisher reconnect backoff state with bounded retry attempts.
- iOS ReplayKit Broadcast Upload Extension compositor for PNGTuber still-image/fallback, text, image, and solid overlays on encoded frames, with App Group runtime composition status and still-image asset load/miss evidence.
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
- Android `LiveCasterNative.getAudioRoute()` reports current output route and headphone connection state for monitor-safety preflight.
- iOS Broadcast Upload Extension headphone-gated self-monitor playback for processed ReplayKit microphone PCM with runtime route, write, and drop evidence.
- Android microphone/notification runtime permission preflight before MediaProjection launch.
- Android release signing fail-closed configuration using `MLC_RELEASE_*` keystore inputs instead of debug signing for release artifacts.
- Native release-configuration audit script covering Android release signing, streaming permissions, OAuth callback schemes, iOS usage descriptions, iOS privacy manifest packaging, and ReplayKit Broadcast Upload Extension bundle identifiers, Debug/Release entitlements, extension-only settings, and matching App Group setup.
- Android Keystore-backed encrypted mobile profile storage for stream keys.
- Mobile stream key clearing by overwriting the secure native profile with a cleared key.
- Durable mobile-side scene persistence through Android SharedPreferences and iOS atomic Application Support JSON storage.
- Android TextToSpeech native module for chat read-aloud.
- iOS Keychain-backed mobile profile storage exposed to React Native.
- iOS AVSpeechSynthesizer native module for chat read-aloud.
- iOS `LiveCasterNative.getAudioRoute()` reports `AVAudioSession` output route and headphone connection state for monitor-safety preflight.
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
- Apple Developer account-backed iOS production archive/export validation for Broadcast Upload Extension provisioning.
- Android end-to-end physical device validation against a real RTMP/RTMPS endpoint.
- Android physical-device tuning for mic monitor latency and Bluetooth route behavior.
- iOS physical-device tuning for mic monitor latency and Bluetooth route behavior.
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
