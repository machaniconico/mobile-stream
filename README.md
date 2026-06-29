# MobileLiveCaster

MobileLiveCaster is an OBS-like mobile VTuber streaming studio concept for iOS and Android.

The current implementation includes a verified TypeScript/Vite prototype and a React Native bare app. Both share the core scene model, stream profile model, avatar runtime, and live-engine contract. Android has a native MediaProjection/RTMP path behind that contract, and iOS now includes a ReplayKit Broadcast Upload Extension path with VideoToolbox H.264, AudioToolbox AAC, and an in-extension RTMP/RTMPS publisher foundation.

## Current Prototype

- OBS-like multi-scene/source stack with Main, Starting Soon, Break, and Privacy Shield scene presets, live scene switching, and cut/fade transition settings.
- Screen, PNGTuber, Live2D, VRM/VRoid, image, solid, and text source records, including Live2D Cubism `model3.json` and VRM/GLB URI persistence for model-package preparation.
- Layer visibility, lock, ordering, and transform controls.
- RTMP/RTMPS destination profiles with YouTube Live, Twitch Auto, Twitch Tokyo, and Custom presets.
- OAuth/API-backed platform stream key controls: YouTube can create a new reusable Live Stream and apply its RTMPS key; Twitch can sync the current Helix stream key.
- OAuth/API-backed publishing controls: YouTube can create, bind, refresh status, test, start, and complete scheduled Live Broadcasts; Twitch can update title, category, broadcaster language, and refresh live/offline status.
- Web and mobile platform API operations run through a visible single-flight guard to disable duplicate stream-key, broadcast, channel metadata, and OAuth exchange requests from rapid repeated taps while showing the active operation, and retain started/succeeded/failed/skipped audit events in session history.
- Platform API controls refresh expiring YouTube/Twitch OAuth credentials before stream-key, broadcast, and channel operations; mobile secure-storage OAuth maintenance schedules bounded background retries from retryable API failures and `Retry-After`.
- Commercial-start readiness checks for endpoint, protocol, stream key, quality, and scene safety.
- Platform-visible Go Live checks block visible Live2D or VRM/VRoid preview-only scenes until native Live2D Cubism or VRM rendering is integrated and validated; private validation starts still surface this as a warning.
- Platform-visible Go Live checks also block native compositor mismatch risks such as preview-only source ordering, missing screen capture, and PNGTuber/image assets that are not readable by the iOS ReplayKit Broadcast Upload Extension through App Group storage.
- Public YouTube and Twitch start preflight/checklist locks block warnings as well as failures, including stale dashboard evidence, disabled/unsafe chat readout, avatar tracking that is disabled/simulated/lost/stale/not moving, unsafe/muted mic monitoring, incomplete commercial evidence, and mock-engine fallback, so a release build cannot silently treat an unverified setup as a real platform-visible stream.
- Public YouTube and Twitch starts require an explicit final operator confirmation after the public launch checklist passes, with accepted/cancelled confirmation events retained in the stream session audit trail.
- Private RTMP(S) validation runbook that walks setup, native start, mic FX/headphone monitor checks, chat readout checks, monitor hold, dashboard check, clean stop, and evidence recording.
- Pre-launch rehearsal scoring grades the current target, private ingest, runbook, feature proof, and retained release evidence on a 100-point scale before a platform-visible launch.
- Physical validation evidence now retains stable monitor-hold bitrate/FPS history, mic FX/headphone monitor snapshots, native self-monitor write/drop proof, device output-route/headphone safety, lip-sync/audio-meter sample summaries, YouTube/Twitch chat readout snapshots, spoken-chat success/failure counts, native publisher/compositor telemetry, fresh YouTube/Twitch dashboard checked-at proof, dashboard broadcast/stream/channel identity and YouTube privacy proof, same-run platform ingest proof that combines native sent video/audio frames with destination receiving state, stable run/evidence fingerprints, and a retained-run manifest for support-bundle audit correlation, and downgrades retained pass attempts when stable hold, native publisher/compositor proof, native self-monitor proof, audio monitoring, chat readout validation, destination dashboard validation, or same-run ingest handoff validation is incomplete.
- Audio Peak Guard uses native mic limiter counters and retained audio-meter peak/clipping summaries to warn or block public-stream readiness when mic gain is likely to clip.
- Audio Silence Guard watches current live mic-activity samples and warns when the mic channel is in the broadcast mix but retained activity is missing, silent, or very low.
- Physical validation native-runtime proof must match the current scene's native composition requirements, so a screen-only runtime snapshot cannot approve a PNGTuber/image overlay scene for release evidence.
- Commercial release gate for saved support bundle JSON, checking freshness, public launch lock state, current YouTube/Twitch publishing-status freshness, private validation runbook completion, iOS/Android same-build evidence coverage, retained-run manifests, manifest/summary integrity, and feature proof before release approval.
- Commercial release support-bundle privacy gate that blocks release approval if OAuth tokens, stream keys, client secrets, device codes, or Authorization headers are still unredacted in exported evidence.
- Release-candidate verification command that chains store-submission handoff evidence requirements and integrity checks when store-submission evidence exists, fail-fast commercial support-bundle approval before expensive source gates, browser UI verification, React Native bundle generation, and source gates into one local approval step with a JSON audit report that hashes generated artifacts, release-configuration inputs, and production Android/iOS native source files.
- Saved release-candidate report audit that revalidates the archived report, support-bundle SHA-256 and commercial release gate at the report timestamp, UI evidence schema/freshness/text checks, generated artifact hashes, release-configuration/native-source input hashes, clean git state, and required gate outcomes before using a report for commercial approval.
- Store submission draft/checklist tooling that creates App Store / Play Console metadata and a human review Markdown from real-device screenshots or canonical workspace UI evidence, hashes iOS/Android store screenshots, verifies privacy/data-safety fields, rejects secret-like text, and is included in release-candidate reports when present; final store-submission approval now requires a clean non-development RC report plus physical device/OS screenshot labels, distribution artifacts, YouTube/Twitch dashboard evidence, and store-release orchestration evidence in the same RC report.
- Release evidence package creation that copies a passed clean RC report, support bundle, dedicated UI evidence JSON from either skipped or in-process browser UI gates, UI/RN/web artifacts, distribution manifests, dashboard evidence, and store-submission evidence into a standalone hash-verified archive directory for handoff or store-submission audit, rejects development-only dirty-worktree or commit-mismatch RC reports, re-runs the archived support bundle's commercial release gate at the RC report timestamp with the report's warning-approval setting, revalidates package generation time, package/report/UI full git commit and dirty-state provenance, packaged AAB/IPA ZIP content, packaged dashboard PNG/status JSON content, packaged real-device store screenshot PNG content/device/OS labels, packaged store metadata/review content, and packaged UI evidence schema/freshness/text/screenshot metadata, fails closed when commercial distribution/dashboard/store-submission artifact groups or manifest-referenced payloads are missing and when unmanifested package files are present, and runs a package-level scan for unredacted OAuth tokens, stream keys, client secrets, device codes, and Authorization headers in text evidence.
- Dashboard, store-submission, and browser UI evidence screenshots must be structurally valid PNG files, including valid chunk CRCs, IHDR/IDAT/IEND structure, non-interlaced image data, and IDAT byte counts matching the declared dimensions.
- Store release orchestration can write a machine-readable `store-release-orchestration` report with git commit/dirty-state provenance, planned/executed build steps, step outcomes, and distribution manifest SHA-256 evidence, and release-candidate verification requires and revalidates distribution, dashboard, final store-submission, and store-release handoff evidence before approving RC runs that include store-submission evidence.
- Release configuration verification scans production Android/iOS native source files and fails when unresolved `TODO`, `FIXME`, or `Not implemented` markers are present in the build-target source tree.
- Production native implementation is tracked only in the build-target `android/` and `ios/` projects, and release configuration verification rejects stale duplicate scaffold sources under `native/`.
- Release automation script syntax verification is part of CI and the local release-candidate gate, so broken `.mjs` release tooling is caught before commercial approval.
- Browser UI verification writes JSON evidence with desktop/mobile screenshot hashes, and release-candidate UI skips require that evidence before approval.
- Android build-type network policy keeps cleartext traffic enabled only for debug development and disables it for release artifacts.
- Native store version audit keeps Android application metadata, iOS host app versioning, and the ReplayKit Broadcast Upload Extension versioning aligned before release approval.
- Web bundle code-splitting and bundle-size verification so the browser studio shell stays below the release chunk limit.
- Repository automation safety checks and opt-in-only PR auto-merge through an explicit `automerge` label.
- Physical validation audio evidence also records measured or native-estimated processed-mic monitor latency, the latency source, and Bluetooth route review notes, and prevents audio evidence from passing when latency is missing or above the route budget.
- RTMP/RTMPS publish URL normalization that can split pasted YouTube/Twitch full publish URLs into endpoint and stream key before start.
- Stream diagnostics panel with redacted publish URL, upload target estimate, live telemetry checks, platform API audit counts, avatar tracking validation with runtime freshness, mic FX/headphone monitor route validation, chat readout validation, native runtime validation evidence, native compositor still-image asset load evidence, platform dashboard validation evidence including YouTube broadcast privacy, YouTube bound-stream, and Twitch title/category/language mismatch checks, and sanitized report export/share.
- Face-tracking production diagnostics for prepared PNGTuber assets, native-camera readiness, tracking runtime state, active avatar motion, support bundles, and commercial validation checks.
- Native composition readiness and diagnostics for native-supported avatar/text/chat/image/solid overlays, underlay ordering, Live2D/VRM production gaps, iOS Broadcast Upload Extension still-image asset access risks before device RTMP publishing, runtime loaded/missing asset evidence, VRM pose-payload delivery evidence, native VRM/GLB model-header load evidence, native VRM version/humanoid-bone/expression metadata evidence, native VRM pose-to-model bone/expression compatibility evidence, and explicit VRM renderer backend/model-loaded/rendered-source evidence.
- Live2D Cubism model-package readiness checks for missing, remote, relative, or unsupported `model3.json` URIs plus a shared `model3.json` manifest validator for Moc, texture, expression, motion, physics, and unsafe reference checks; native Cubism rendering remains gated until SDK integration and physical validation are complete.
- VRM/VRoid model-package readiness checks for missing, remote, relative, unsupported, or non-`.vrm`/`.glb` model URIs plus shared and native binary GLB validators that detect VRM 1.0 and VRM 0.x extensions, humanoid bone mappings, and expression/blendshape metadata; React Native can now pick/prepare local `.vrm`/`.glb` files into native-readable storage and device runtime telemetry verifies GLB/VRM header loading, VRM version, humanoid bone count, expression count, and pose bone/expression compatibility, while native VRM rendering remains gated until 3D renderer integration and physical validation are complete.
- VRM/VRoid runtime pose mapping converts shared face-tracking motion, lip-sync, blink, look direction, and expression buttons into native-consumable humanoid bone rotations, VRM expression weights, look-at values, and root offsets in the render graph, native runtime telemetry, pose-to-model compatibility checks, validation evidence, renderer-readiness checks, and support bundle summaries.
- Mobile PNGTuber/image still-image and VRM/GLB model picking/preparation that copies local assets into native-readable storage before streaming.
- Stream key redaction and no-secret browser persistence.
- Physical validation run persistence redacts supplied stream-key candidates plus OAuth/API tokens, device codes, client secrets, and Authorization headers before writing Web localStorage or mobile native storage.
- Sensitive OAuth/API error message redaction before user-facing status display.
- OAuth, stream-key, publishing, and YouTube chat API calls convert empty or non-JSON upstream responses into sanitized HTTP/unreadable-JSON errors with retryability and `Retry-After` metadata that is surfaced as safe retry guidance in app status messages.
- Native Android/iOS status and publisher-runtime messages redact publish URLs, stream keys, and bearer tokens before app display.
- Keychain/Android Keystore-backed mobile profile storage for stream keys.
- In-app stream key clear and replacement controls.
- Durable multi-scene persistence on web, iOS, and Android with transition settings, legacy single-scene migration, and persisted-scene normalization.
- Quality presets.
- Voice lip-sync meter and expression buttons.
- Still-image VTuber face tracking with native-camera input on mobile, simulated input on web, calibration, dead-zone filtering, jump limiting, lost-face return tuning, image-aspect-aware geometry rig inference, production rig-line diagnostics, native 2.5D motion scaling, tunable illustration rig regions, lightweight pseudo mesh deformation, hair/body follow-through, and eye/mouth deformation in the iOS/Android compositor.
- IRIAM-style single-illustration animation is now covered by the still-image 2.5D tracker foundation plus image-aspect-aware geometry auto rigging and tunable lightweight pseudo deformation; true image-segmentation-based mesh/depth rigging, explicit face/body part extraction, and physical-device tuning against native-camera tracking remain commercial-grade continuous improvements.
- Mic effect presets with gain, noise gate, compression, and Android PCM processing.
- Broadcast audio mixer profile for mic, captured app audio, and chat readout channels, with per-channel volume/mute controls, start/diagnostics silent-mix checks, Android mic-output gain/mute, and iOS ReplayKit app/mic mix gain.
- Privacy Shield emergency control switches to a blackout scene, mutes all broadcast audio channels, stops chat readout, records a safety audit event, and pushes the safe scene/profile to the native engine when a stream is active.
- Headphone-only mic monitor settings for hearing the processed mic signal locally, with native iOS/Android output-route detection and Go Live blocking when monitoring would route to speakers.
- Chat/comment read-aloud queue with test comments, muted words, command-message skipping, duplicate suppression, per-viewer rate limiting, excessive-caps spam blocking, optional link blocking, queue limits, URL redaction, speech controls, queued/recent comment privacy reset, and stream-stop chat auto-disconnect/readout silence.
- Transparent-background chat/comment overlay source for web preview and native iOS/Android compositors, fed from recent YouTube/Twitch/manual chat history with URL redaction and per-source message length limits, without persisting comment text in the scene; readiness/preflight now warn when a visible chat overlay uses a non-transparent background that could cover gameplay or avatar overlays.
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
- Android native GL overlay compositor for visible PNGTuber still-image, text, chat, image, and solid scene sources on top of MediaProjection capture.
- iOS ReplayKit Broadcast Upload Extension compositor for visible PNGTuber still-image, text, chat, image, and solid overlays on top of captured frames, with runtime still-image asset load/miss evidence.
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
npm run verify:distribution-artifacts
npm run verify:dashboard-evidence
npm run verify:store-submission
npm run verify:store-submission-final
npm run verify:store-submission-approval -- /path/to/release-candidate-verification.json
npm run verify:evidence-package -- /path/to/release-evidence-package
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
npm run release:store -- --dry-run
npm run release:distribution-manifest -- --android-aab android/app/build/outputs/bundle/release/app-release.aab --ios-ipa .artifacts/ios/export/MobileLiveCaster.ipa
npm run release:dashboard-evidence -- --youtube-screenshot .artifacts/dashboard/youtube.png --youtube-screenshot-captured-at <iso> --twitch-screenshot .artifacts/dashboard/twitch.png --twitch-screenshot-captured-at <iso> --youtube-json .artifacts/dashboard/youtube.json --twitch-json .artifacts/dashboard/twitch.json
npm run release:store-submission-draft -- --ios-screenshot .artifacts/store/ios-real-device.png --android-screenshot .artifacts/store/android-real-device.png
npm run release:store-real-device-screenshots -- --ios-screenshot .artifacts/store/ios-real-device.png --android-screenshot .artifacts/store/android-real-device.png --ios-os-version "iOS 18.5" --android-os-version "Android 15" --app-build "1.0.0 (15)"
npm run release:store-submission-checklist -- --metadata .artifacts/store/submission-metadata.json
npm run release:evidence-package -- /path/to/release-candidate-verification.json --output .artifacts/release-evidence/build-001
```

`npm run verify:rn` builds Metro JS bundles for iOS and Android. It does not require a simulator, device, Android Studio, or CocoaPods.

`npm run verify:scripts` syntax-checks the release automation `.mjs` scripts that CI and the release-candidate gate depend on.

`npm run verify:repo-automation` audits GitHub Actions release gates and checks that CI keeps release automation script verification, native release checks, tests, build, bundle-size, RN bundle coverage, and PR auto-merge remains explicit opt-in through the `automerge` label.

`npm run verify:web-bundle-size` checks the built web assets in `dist/assets` and fails if the studio shell loses code-splitting or any JavaScript chunk exceeds the release limit. Run `npm run build` first.

`npm run verify:store-release-env` checks the local store-distribution environment without building or printing secret values. It validates iOS team/profile/App Store Connect API-key inputs, Android release keystore inputs, absolute signing-file paths, rejects symlinked signing material, and keeps signing material outside the repository even after resolving real paths. Use `npm run ios:verify-release-env` or `npm run android:verify-release-env` for platform-specific checks.

`npm run ios:export-options` writes an App Store Connect export-options plist for the host app and ReplayKit Broadcast Upload Extension. Set `MLC_IOS_TEAM_ID`, `MLC_IOS_APP_PROFILE_NAME`, and `MLC_IOS_BROADCAST_PROFILE_NAME` first; optionally set `MLC_APP_STORE_CONNECT_KEY_PATH`, `MLC_APP_STORE_CONNECT_KEY_ID`, and `MLC_APP_STORE_CONNECT_ISSUER_ID` when `xcodebuild` should authenticate with App Store Connect outside Xcode Accounts.

`npm run ios:archive:release` creates the Release device archive with Apple Distribution signing and provisioning updates enabled. `npm run ios:export:release` regenerates export options and exports the archive using explicit provisioning profiles for both the host app and Broadcast Upload Extension.

`npm run android:bundleRelease` creates the signed Android App Bundle for store distribution after `MLC_RELEASE_STORE_FILE`, `MLC_RELEASE_STORE_PASSWORD`, `MLC_RELEASE_KEY_ALIAS`, and `MLC_RELEASE_KEY_PASSWORD` pass `npm run android:verify-release-env`.

`npm run release:distribution-manifest -- --android-aab <path> --ios-ipa <path>` writes `.artifacts/distribution-artifacts.json` with workspace-relative `.aab` / `.ipa` paths, byte counts, ZIP entry proof, SHA-256 hashes, and git commit/dirty-state provenance. `npm run verify:distribution-artifacts` verifies hashes, minimum artifact size, ZIP container signatures, Android App Bundle entries, iOS IPA `Payload/*.app/Info.plist` structure, and required git provenance before release approval. When the manifest exists, `npm run verify:release-candidate` includes it and the referenced binaries in the saved release report.

`npm run release:dashboard-evidence -- --youtube-screenshot <png> --youtube-screenshot-captured-at <iso> --twitch-screenshot <png> --twitch-screenshot-captured-at <iso>` writes `.artifacts/platform-dashboard-evidence.json` with hashes, PNG dimensions, capture timestamps, and git provenance for YouTube/Twitch dashboard screenshots and optional status JSON files. `npm run verify:dashboard-evidence` verifies those files, structural PNG validity, dimension metadata, non-placeholder screenshot size, screenshot `capturedAt`, status `checkedAt`, required git provenance, screenshot/status timestamp skew within 10 minutes when both are present, YouTube broadcast/stream/channel identity, YouTube broadcast/stream state, Twitch broadcaster/stream identity, and Twitch live state before release-candidate reports include them.

`npm run release:store-submission-draft -- --ios-screenshot <png> --android-screenshot <png>` writes `.artifacts/store/submission-metadata.json`, `.artifacts/store/submission-review.md`, copies the store screenshots into `.artifacts/store/screenshots/`, and writes `.artifacts/store-submission-checklist.json`. Explicit screenshot inputs are marked as `realDevice`. For draft checks, `--ui-evidence-json <json>` can seed both platform screenshots from a passing `npm run verify:ui` report and marks them as `uiEvidenceDraft`; UI evidence JSON and its embedded mobile screenshot path must be canonical workspace-relative paths.

`npm run release:store-real-device-screenshots -- --ios-screenshot <png> --android-screenshot <png> --ios-os-version <version> --android-os-version <version> --app-build <version/build>` upgrades an existing store-submission draft to final screenshot evidence. It preserves the edited App Store / Play Console listing metadata, requires canonical workspace-relative metadata/review/screenshot record paths, copies the supplied real-device PNGs into `.artifacts/store/screenshots/`, rewrites screenshot source labels to `realDevice`, records OS version, app build, and capture timestamp evidence, refreshes `.artifacts/store/submission-review.md`, regenerates `.artifacts/store-submission-checklist.json`, and runs the final real-device screenshot check before returning success.

`npm run release:store-submission-checklist -- --metadata <json>` writes `.artifacts/store-submission-checklist.json` with hashes, PNG dimensions, and git provenance for App Store / Play Console metadata and iOS/Android store screenshots declared in that metadata. `npm run verify:store-submission` verifies required listing/privacy/data-safety fields, screenshot integrity, structural PNG validity, dimensions, required git provenance, and secret-like text before release approval. `npm run verify:store-submission-final` additionally requires real-device source labels, specific physical device/OS labels that reject Simulator/Emulator/browser/test-device evidence, OS version, app build, capture timestamp evidence, and non-placeholder screenshot dimensions for each screenshot. When the checklist exists, `npm run verify:release-candidate` includes it and referenced metadata/screenshots in the saved release report.

`npm run verify:store-submission-final` runs the same store-submission checks and also requires every screenshot to be marked `realDevice` with a physical device/OS label, so UI-evidence draft, Simulator, Emulator, browser, and generic test-device screenshots cannot accidentally pass final App Store / Play Console submission approval.

`npm run verify:store-submission-approval -- <release-candidate-report.json>` is the final local store-submission approval gate. It rejects RC reports generated from a dirty worktree, with `--allow-dirty`, with `--allow-commit-mismatch`, or without a passed clean-git gate, then verifies the saved RC report, Android `.aab` / iOS `.ipa` distribution artifact evidence, fresh YouTube/Twitch dashboard screenshot plus status JSON evidence, store-release orchestration report evidence, the final store-submission checklist, real-device screenshot source labels, screenshot capture freshness, screenshot app-build alignment with the support bundle's physical validation build, and that every store-submission metadata/review/screenshot artifact is captured in the RC report. `--allow-dirty` on this command is only for local development inspection of current workspace files and does not make development-only RC reports approvable.

`npm run release:store` orchestrates the store-distribution path: platform release environment checks, Android App Bundle generation, iOS archive/export, and distribution manifest creation. Use `--dry-run` to inspect the exact steps, `--android-only` / `--ios-only` for platform-specific releases, and `--report-json <path>` to archive a machine-readable store-release orchestration report with git commit/dirty-state provenance, step outcomes, and distribution manifest SHA-256 evidence. Reports generated with `--skip-env` or `--skip-build` are development-only, reports with missing git provenance are rejected, stale reports outside the release max-age window are rejected, and those cases are blocked from commercial RC/report/package approval. Pass a full report into `npm run verify:release-candidate` with `--store-release-report-json=<path>` to include it in the RC report and release evidence package.

`npm run verify:release-config` audits native store-release configuration, including Android release signing fail-closed behavior, Android App Bundle release automation, release cleartext-traffic blocking, Android/iOS store version alignment, streaming permissions, OAuth callback schemes, iOS usage descriptions, the iOS privacy manifest, unresolved implementation markers in production native sources, iOS production archive/export automation, and the ReplayKit Broadcast Upload Extension bundle/entitlements/App Group/provisioning setup.

`npm run verify:commercial-release-bundle -- /path/to/support-bundle.json` checks a saved support bundle before release approval. It fails unless the bundle is fresh, schema v27+, public-launch ready, private launch rehearsal ready with an A-grade score when score evidence is present, runbook complete, free of unredacted sensitive evidence, backed by passing same-build iOS/Android validation evidence for the current destination and RTMP(S) protocol, including platform-matched native video/audio frame and byte proof, stable monitor-hold sample/duration/drop/reconnect proof, controlled weak-network quality automation proof, loaded compositor still-image assets, mic/headphone native monitor write/drop and latency proof, fresh avatar-tracking runtime proof, zero retained still-image rig issues, spoken chat readout success, zero chat speech failures, fresh YouTube/Twitch dashboard identity/state proof including Twitch title/category/language metadata, and same-run platform ingest proof, and whose retained-run manifest independently supports the summary's eligible-run, stale-run, same-build, destination/protocol scope, and per-platform feature claims. Use `--allow-warnings` only after explicitly approving remaining warnings.

`npm run verify:release-candidate -- /path/to/support-bundle.json` is the local commercial release-candidate approval command. It fails on uncommitted source changes, requires `.artifacts/distribution-artifacts.json`, `.artifacts/platform-dashboard-evidence.json`, and `--store-release-report-json` when `.artifacts/store-submission-checklist.json` exists, revalidates those handoff manifests against the current commit, requires Android and iOS distribution artifacts, requires YouTube/Twitch dashboard screenshots plus fresh status JSON within the release age window, requires screenshot capture timestamps to match status JSON checks within 10 minutes, requires final real-device store screenshots, runs the commercial support-bundle gate before expensive source gates, then runs release automation script verification, repository automation checks, native release-config checks, unit tests, web/RN typechecks, the web build, web bundle-size verification, iOS/Android Metro bundles, and browser UI verification before writing `.artifacts/release-candidate-verification.json` with the support-bundle SHA-256, git commit, dirty-state, gate outcomes, timings, generated web/RN/UI artifact hashes, release-configuration input hashes, production native-source hashes, optional store-release orchestration report evidence, and failure reason if any. Skipped browser UI evidence must include git commit and dirty-state provenance for the same commit. Use `--report-json=/path/to/report.json` to choose the evidence path, `--store-release-report-json=/path/to/store-release-orchestration.json` after `npm run release:store -- --report-json ...`, `--ui-url=http://127.0.0.1:5173/` only when a loopback preview server is already running (`localhost`, `127.0.0.1`, or `[::1]`), `--allow-dirty` only for development-only evidence before commit, and `--skip-ui --ui-evidence-json=/path/to/ui-verification.json` only when Chrome is unavailable inside the RC command and `npm run verify:ui` has already produced passing loopback preview evidence for the same commit.

`npm run verify:release-report -- /path/to/release-candidate-verification.json` audits a saved RC report before release approval. It fails unless the report is passed, fresh, clean, tied to the current commit, includes git commit/dirty-state provenance, is backed by passing required gates, still matches the support bundle, loopback UI evidence with valid schema, fresh timestamp, git provenance, required text checks, generated web/RN/UI artifacts, release-configuration inputs, and production native-source inputs by SHA-256, and the saved support bundle's commercial release gate still passes at the report timestamp with the report's warning-approval setting. Use `--allow-dirty` or `--allow-commit-mismatch` only for development-only report inspection.

`npm run release:evidence-package -- /path/to/release-candidate-verification.json --output <dir>` creates a standalone release evidence package directory with the RC report, support bundle, and every hashed artifact recorded by the report. It rejects RC reports generated from a dirty worktree, with `--allow-dirty`, with `--allow-commit-mismatch`, or without a passed clean-git gate; `--allow-dirty` on this command only tolerates the current workspace while inspecting source files and does not make development-only RC reports packageable. `npm run verify:evidence-package -- <dir>` rechecks the package manifest, copied file hashes, absence of unmanifested package files, package generatedAt timing, package/report/UI full git commit and dirty-state provenance, the packaged RC report's commercial package eligibility, the packaged support bundle's commercial release gate at the RC report timestamp with the report's warning-approval setting, required commercial distribution/dashboard/store-submission artifact groups, manifest-referenced payload coverage, packaged AAB/IPA ZIP structure and required entries, packaged dashboard PNG/status JSON content plus screenshot/status timestamp integrity and freshness against the RC report, packaged real-device store-submission screenshot PNG content/metadata/freshness, packaged store-submission metadata schema/reference integrity, non-empty review Markdown, and support-bundle validation-build alignment, optional packaged store-release orchestration report evidence, and text-evidence privacy scan; `--verify-sources` additionally confirms the original workspace files still match the archived evidence.

GitHub Actions runs the required `test` status check on pull requests and `main` pushes. The gate installs from `package-lock.json`, verifies repository automation safety, verifies native release configuration, runs unit tests, typechecks web and React Native code, builds the web prototype, verifies web bundle size, and bundles React Native JavaScript for iOS and Android.

## Native Direction

- iOS screen capture: ReplayKit Broadcast Upload Extension.
- Android screen capture: MediaProjection foreground service.
- Encoding: VideoToolbox on iOS, MediaCodec on Android.
- Streaming: RTMP/RTMPS publisher behind `src/native/LiveCasterNative.ts`.
- Go Live readiness: fail closed before native capture starts, with UI-visible blocking reasons.
- Stream diagnostics: endpoint, transport security, stream key presence, scene visibility, avatar tracking readiness/motion/runtime-freshness proof, bitrate/FPS/drop/reconnect telemetry, stable monitor-hold proof, mic FX/headphone monitor route readiness, native publisher/compositor proof, native self-monitor write/drop proof, measured/native-estimated monitor latency evidence, audio-meter sample evidence, live audio-silence guard evidence, chat readout connection/readiness, spoken-chat success/failure evidence, native still-image asset loaded/missing evidence, private validation runbook state, estimated upload target, post-stream session evidence, physical validation audio/chat/avatar evidence, physical validation native-runtime evidence, platform dashboard evidence, and sanitized export/share reports are available before, during, and after live sessions.
- Secret storage: browser persistence strips stream keys; mobile persistence uses Keychain/Android Keystore-backed native storage.
- Stream key management: users can clear the stored key in-app and paste a replacement key without changing the destination preset.
- Scene storage: web uses localStorage; Android uses app SharedPreferences; iOS writes an atomic scene collection JSON file under Application Support, while legacy single-scene JSON is migrated on load.
- Chat reader: YouTube/Twitch payload adapters can feed the shared queue; current UI includes manual/test comments, platform adapter test ingest, OAuth authorization/callback controls, Twitch device-code authorization, network connect controls, command-message skipping, URL redaction, stream-stop chat auto-disconnect/readout silence, queued/recent comment privacy reset, and native/browser TTS output. Public launch preflight warns when URL redaction or command skipping is disabled. Browser OAuth remains session-only; mobile credentials are stored through Keychain/Android Keystore-backed native storage.
- Platform stream key management: YouTube OAuth uses Live Streaming API `liveStreams.insert` to rotate by creating a new reusable stream; Twitch OAuth uses Helix Get Stream Key to sync the current key because Twitch does not expose a public reset endpoint.
- Platform publishing management: YouTube OAuth uses Live Streaming API `liveBroadcasts.insert`, `liveBroadcasts.bind`, `liveBroadcasts.list`, `liveStreams.list`, and `liveBroadcasts.transition` for scheduled broadcast setup, ingest health refresh, and lifecycle control; Twitch OAuth uses Helix `PATCH /channels`, category search, `GET /channels`, and `GET /streams` for channel metadata and live/offline status.
- Avatar rendering: native PNGTuber overlays on iOS/Android first; Live2D model-package validation and VRM/VRoid model-package plus runtime pose mapping, pose-to-model compatibility telemetry, pose-delivery telemetry, and renderer-readiness contracts are in place, with native Cubism and VRM rendering after licensing/renderer integration and runtime validation.

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
