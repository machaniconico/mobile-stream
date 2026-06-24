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
- Web and mobile platform API operations run through a visible single-flight guard to disable duplicate stream-key, broadcast, channel metadata, and OAuth exchange requests from rapid repeated taps while showing the active operation, and retain started/succeeded/failed/skipped audit events in session history.
- Platform API controls refresh expiring YouTube/Twitch OAuth credentials before stream-key, broadcast, and channel operations; mobile secure-storage OAuth maintenance schedules bounded background retries from retryable API failures and `Retry-After`.
- Commercial-start readiness checks for endpoint, protocol, stream key, quality, and scene safety.
- Private RTMP(S) validation runbook that walks setup, native start, mic FX/headphone monitor checks, chat readout checks, monitor hold, dashboard check, clean stop, and evidence recording.
- Physical validation evidence now retains stable monitor-hold bitrate/FPS history, mic FX/headphone monitor snapshots, native self-monitor write/drop proof, device output-route/headphone safety, lip-sync/audio-meter sample summaries, YouTube/Twitch chat readout snapshots, spoken-chat success/failure counts, native publisher/compositor telemetry, fresh YouTube/Twitch dashboard checked-at proof, stable run/evidence fingerprints, and a retained-run manifest for support-bundle audit correlation, and downgrades retained pass attempts when stable hold, native publisher/compositor proof, native self-monitor proof, audio monitoring, chat readout validation, or destination dashboard validation is incomplete.
- Commercial release gate for saved support bundle JSON, checking freshness, public launch lock state, private validation runbook completion, iOS/Android same-build evidence coverage, retained-run manifests, and feature proof before release approval.
- Commercial release support-bundle privacy gate that blocks release approval if OAuth tokens, stream keys, client secrets, device codes, or Authorization headers are still unredacted in exported evidence.
- Release-candidate verification command that chains source gates, browser UI verification, React Native bundle generation, and the commercial support-bundle gate into one local approval step with a JSON audit report that hashes generated artifacts and release-configuration inputs.
- Saved release-candidate report audit that revalidates the archived report, support-bundle SHA-256, UI evidence, generated artifact hashes, release-configuration input hashes, clean git state, and required gate outcomes before using a report for commercial approval.
- Release automation script syntax verification is part of CI and the local release-candidate gate, so broken `.mjs` release tooling is caught before commercial approval.
- Browser UI verification writes JSON evidence with desktop/mobile screenshot hashes, and release-candidate UI skips require that evidence before approval.
- Android build-type network policy keeps cleartext traffic enabled only for debug development and disables it for release artifacts.
- Native store version audit keeps Android application metadata, iOS host app versioning, and the ReplayKit Broadcast Upload Extension versioning aligned before release approval.
- Web bundle code-splitting and bundle-size verification so the browser studio shell stays below the release chunk limit.
- Repository automation safety checks and opt-in-only PR auto-merge through an explicit `automerge` label.
- Physical validation audio evidence also records measured or native-estimated processed-mic monitor latency, the latency source, and Bluetooth route review notes, and prevents audio evidence from passing when latency is missing or above the route budget.
- RTMP/RTMPS publish URL normalization that can split pasted YouTube/Twitch full publish URLs into endpoint and stream key before start.
- Stream diagnostics panel with redacted publish URL, upload target estimate, live telemetry checks, platform API audit counts, mic FX/headphone monitor route validation, chat readout validation, native runtime validation evidence, native compositor still-image asset load evidence, platform dashboard validation evidence, and sanitized report export/share.
- Face-tracking production diagnostics for prepared PNGTuber assets, native-camera readiness, tracking runtime state, active avatar motion, support bundles, and commercial validation checks.
- Native composition readiness and diagnostics for native-supported avatar/text/image/solid overlays, underlay ordering, Live2D gaps, iOS Broadcast Upload Extension still-image asset access risks before device RTMP publishing, and runtime loaded/missing asset evidence.
- Mobile PNGTuber/image still-image picking and preparation that copies local assets into native-readable storage before streaming.
- Stream key redaction and no-secret browser persistence.
- Physical validation run persistence redacts supplied stream-key candidates plus OAuth/API tokens, device codes, client secrets, and Authorization headers before writing Web localStorage or mobile native storage.
- Sensitive OAuth/API error message redaction before user-facing status display.
- OAuth, stream-key, publishing, and YouTube chat API calls convert empty or non-JSON upstream responses into sanitized HTTP/unreadable-JSON errors with retryability and `Retry-After` metadata that is surfaced as safe retry guidance in app status messages.
- Native Android/iOS status and publisher-runtime messages redact publish URLs, stream keys, and bearer tokens before app display.
- Keychain/Android Keystore-backed mobile profile storage for stream keys.
- In-app stream key clear and replacement controls.
- Durable scene persistence on web, iOS, and Android with persisted-scene normalization.
- Quality presets.
- Voice lip-sync meter and expression buttons.
- Still-image VTuber face tracking with native-camera input on mobile, simulated input on web, calibration, dead-zone filtering, jump limiting, lost-face return tuning, and native 2.5D motion scaling in the iOS/Android compositor.
- Mic effect presets with gain, noise gate, compression, and Android PCM processing.
- Headphone-only mic monitor settings for hearing the processed mic signal locally, with native iOS/Android output-route detection and Go Live blocking when monitoring would route to speakers.
- Chat/comment read-aloud queue with test comments, muted words, duplicate suppression, queue limits, speech controls, queued/recent comment privacy reset, and stream-stop chat auto-disconnect/readout silence.
- YouTube LiveChatMessages and Twitch EventSub chat payload adapters feeding the shared read-aloud queue.
- Durable platform chat adapter settings through the shared profile store.
- OAuth chat authorization controls for YouTube PKCE authorization-code callbacks, Twitch implicit callbacks, and Twitch Device Code Flow, feeding YouTube live chat polling and Twitch IRC WebSocket ingestion.
- Keychain/Android Keystore-backed mobile OAuth credential storage, with YouTube/Twitch refresh-token rotation and periodic Twitch token validation.
- Mobile OAuth callback deep links for `mobilelivecaster://oauth/*` and `com.mobilelivecaster.app:/oauth/*`.
- Mock Go Live, Stop, and Reconnect controls.
- iOS ReplayKit Broadcast Upload Extension target and startup bridge.
- iOS Broadcast Upload Extension H.264/AAC encode path with app/mic audio mixing.
- iOS RTMP/RTMPS publisher foundation with reconnect backoff state.
- iOS host app telemetry bridge that polls Broadcast Upload Extension runtime state for FPS, bitrate, drops, reconnects, errors, native composition status, self-monitor latency estimates, and still-image asset loaded/missing counts.
- Android MediaProjection service skeleton.
- React Native host app scaffold with standard `ios/` and `android/` projects.
- React Native mobile Studio screen using the shared domain model and mock engine.
- Android native bridge for MediaProjection consent, foreground service streaming, H.264/AAC encoding, and RTMP/RTMPS publishing through RootEncoder.
- Android publish URLs are assembled from the selected server URL plus the stored stream key at start time.
- Android native GL overlay compositor for visible PNGTuber still-image, text, image, and solid scene sources on top of MediaProjection capture.
- iOS ReplayKit Broadcast Upload Extension compositor for visible PNGTuber still-image, text, image, and solid overlays on top of captured frames, with runtime still-image asset load/miss evidence.
- Android microphone effects are applied before AAC encoding, with optional headphone monitor playback and native monitor-buffer latency estimates.
- Android start-time microphone/notification runtime permission preflight.
- Native chat speech output through Android TextToSpeech and iOS AVSpeechSynthesizer.
- Native iOS/Android audio-route bridge reports speaker, receiver, wired, USB, Bluetooth, AirPlay, HDMI, or unknown output state for monitor-safety diagnostics.

## Commands

```bash
npm install
npm run dev
npm run mobile:start
npm test
npm run typecheck
npm run build
npm run verify:scripts
npm run verify:repo-automation
npm run verify:web-bundle-size
npm run verify:rn
npm run verify:release-config
npm run verify:store-release-env
npm run verify:commercial-release-bundle -- /path/to/support-bundle.json
npm run verify:release-candidate -- /path/to/support-bundle.json
npm run verify:release-report -- /path/to/release-candidate-verification.json
npm run android:assembleDebug
npm run android:assembleRelease
npm run android:bundleRelease
npm run ios:pods
npm run ios:build:simulator
npm run ios:verify-release-env
npm run android:verify-release-env
npm run ios:export-options
npm run ios:archive:release
npm run ios:export:release
```

`npm run verify:rn` builds Metro JS bundles for iOS and Android. It does not require a simulator, device, Android Studio, or CocoaPods.

`npm run verify:scripts` syntax-checks the release automation `.mjs` scripts that CI and the release-candidate gate depend on.

`npm run verify:repo-automation` audits GitHub Actions release gates and checks that CI keeps release automation script verification, native release checks, tests, build, bundle-size, RN bundle coverage, and PR auto-merge remains explicit opt-in through the `automerge` label.

`npm run verify:web-bundle-size` checks the built web assets in `dist/assets` and fails if the studio shell loses code-splitting or any JavaScript chunk exceeds the release limit. Run `npm run build` first.

`npm run verify:store-release-env` checks the local store-distribution environment without building or printing secret values. It validates iOS team/profile/App Store Connect API-key inputs, Android release keystore inputs, absolute signing-file paths, and keeps signing material outside the repository. Use `npm run ios:verify-release-env` or `npm run android:verify-release-env` for platform-specific checks.

`npm run ios:export-options` writes an App Store Connect export-options plist for the host app and ReplayKit Broadcast Upload Extension. Set `MLC_IOS_TEAM_ID`, `MLC_IOS_APP_PROFILE_NAME`, and `MLC_IOS_BROADCAST_PROFILE_NAME` first; optionally set `MLC_APP_STORE_CONNECT_KEY_PATH`, `MLC_APP_STORE_CONNECT_KEY_ID`, and `MLC_APP_STORE_CONNECT_ISSUER_ID` when `xcodebuild` should authenticate with App Store Connect outside Xcode Accounts.

`npm run ios:archive:release` creates the Release device archive with Apple Distribution signing and provisioning updates enabled. `npm run ios:export:release` regenerates export options and exports the archive using explicit provisioning profiles for both the host app and Broadcast Upload Extension.

`npm run android:bundleRelease` creates the signed Android App Bundle for store distribution after `MLC_RELEASE_STORE_FILE`, `MLC_RELEASE_STORE_PASSWORD`, `MLC_RELEASE_KEY_ALIAS`, and `MLC_RELEASE_KEY_PASSWORD` pass `npm run android:verify-release-env`.

`npm run verify:release-config` audits native store-release configuration, including Android release signing fail-closed behavior, Android App Bundle release automation, release cleartext-traffic blocking, Android/iOS store version alignment, streaming permissions, OAuth callback schemes, iOS usage descriptions, the iOS privacy manifest, iOS production archive/export automation, and the ReplayKit Broadcast Upload Extension bundle/entitlements/App Group/provisioning setup.

`npm run verify:commercial-release-bundle -- /path/to/support-bundle.json` checks a saved support bundle before release approval. It fails unless the bundle is fresh, schema v13+, public-launch ready, runbook complete, free of unredacted sensitive evidence, and backed by passing same-build iOS/Android validation evidence. Use `--allow-warnings` only after explicitly approving remaining warnings.

`npm run verify:release-candidate -- /path/to/support-bundle.json` is the local commercial release-candidate approval command. It fails on uncommitted source changes, runs release automation script verification, repository automation checks, native release-config checks, unit tests, web/RN typechecks, the web build, web bundle-size verification, iOS/Android Metro bundles, browser UI verification, and the commercial support-bundle gate, then writes `.artifacts/release-candidate-verification.json` with the support-bundle SHA-256, git commit, dirty-state, gate outcomes, timings, generated web/RN/UI artifact hashes, release-configuration input hashes, and failure reason if any. Use `--report-json=/path/to/report.json` to choose the evidence path, `--ui-url=http://127.0.0.1:5173/` when a preview server is already running, `--allow-dirty` only for development-only evidence before commit, and `--skip-ui --ui-evidence-json=/path/to/ui-verification.json` only when Chrome is unavailable inside the RC command and `npm run verify:ui` has already produced passing evidence for the same commit.

`npm run verify:release-report -- /path/to/release-candidate-verification.json` audits a saved RC report before release approval. It fails unless the report is passed, fresh, clean, tied to the current commit, backed by passing required gates, and still matches the support bundle, UI evidence, generated web/RN/UI artifacts, and release-configuration inputs by SHA-256. Use `--allow-dirty` or `--allow-commit-mismatch` only for development-only report inspection.

GitHub Actions runs the required `test` status check on pull requests and `main` pushes. The gate installs from `package-lock.json`, verifies repository automation safety, verifies native release configuration, runs unit tests, typechecks web and React Native code, builds the web prototype, verifies web bundle size, and bundles React Native JavaScript for iOS and Android.

## Native Direction

- iOS screen capture: ReplayKit Broadcast Upload Extension.
- Android screen capture: MediaProjection foreground service.
- Encoding: VideoToolbox on iOS, MediaCodec on Android.
- Streaming: RTMP/RTMPS publisher behind `src/native/LiveCasterNative.ts`.
- Go Live readiness: fail closed before native capture starts, with UI-visible blocking reasons.
- Stream diagnostics: endpoint, transport security, stream key presence, scene visibility, bitrate/FPS/drop/reconnect telemetry, stable monitor-hold proof, mic FX/headphone monitor route readiness, native publisher/compositor proof, native self-monitor write/drop proof, measured/native-estimated monitor latency evidence, audio-meter sample evidence, chat readout connection/readiness, spoken-chat success/failure evidence, native still-image asset loaded/missing evidence, private validation runbook state, estimated upload target, post-stream session evidence, physical validation audio/chat evidence, physical validation native-runtime evidence, platform dashboard evidence, and sanitized export/share reports are available before, during, and after live sessions.
- Secret storage: browser persistence strips stream keys; mobile persistence uses Keychain/Android Keystore-backed native storage.
- Stream key management: users can clear the stored key in-app and paste a replacement key without changing the destination preset.
- Scene storage: web uses localStorage; Android uses app SharedPreferences; iOS writes an atomic scene JSON file under Application Support.
- Chat reader: YouTube/Twitch payload adapters can feed the shared queue; current UI includes manual/test comments, platform adapter test ingest, OAuth authorization/callback controls, Twitch device-code authorization, network connect controls, stream-stop chat auto-disconnect/readout silence, queued/recent comment privacy reset, and native/browser TTS output. Browser OAuth remains session-only; mobile credentials are stored through Keychain/Android Keystore-backed native storage.
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

Android release artifacts require a production keystore stored outside the repository. Provide these as Gradle properties or environment variables before running release tasks:

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
