# MobileLiveCaster — VTuber MVP Specification

## Identity

- **Pitch**: Build a mobile OBS-like VTuber live streaming studio for iPhone and Android that captures the device screen, composites controllable avatar sources, and streams to RTMP/RTMPS destinations.
- **Target**: VTubers and game streamers who want to stream from a phone without using a PC.

## Reference Benchmark

PRISM Live Studio Mobile currently emphasizes camera live, screen casting, VTuber/avatar streaming, live chat, camera effects, animated text, media/web overlays, and mobile-to-PC connect features. Its official mobile page also describes multistreaming to platforms such as YouTube, Twitch, Facebook, SOOP, NAVER services, and RTMP URLs, with up to 1080p/60fps and multi-channel streaming gated behind PRISM Plus in the FAQ.

Store listings as of June 6, 2026 also describe camera/screen/VTuber modes, login-based account integration, real-time chat widgets, media and web overlays, beauty/camera effects, background music, 1080p/60fps, simulcasting, camera pro controls, chroma key, background streaming, and live info editing.

Sources:

- https://prismlive.com/en_us/mobile.html
- https://guide.prismlive.com/mobile/overview
- https://apps.apple.com/us/app/prism-live-streaming-app/id1319056339
- https://play.google.com/store/apps/details?id=com.prism.live

## Product Strategy

The product direction is "how close can a mobile VTuber app get to the useful parts of PC OBS?" The answer should be: close in mental model and day-to-day workflow, but deliberately constrained in extension points, source count, and heavy filters so the app remains reliable on phones.

Build the product in layers:

1. **OBS-like scene system**: scenes, ordered sources, layer visibility, transforms, crop/fit/fill, lock/hide controls.
2. **Streaming core**: screen capture, avatar compositing, encode, mux, RTMP/RTMPS publish, reconnect, bitrate/FPS health.
3. **VTuber engine**: PNGTuber, Live2D, voice lip sync, auto blink, expression buttons, avatar position/size controls.
4. **Creator workflow**: destination setup, live setup screen, go-live state, profiles, local presets.
5. **Advanced creator tools**: face tracking, VRM, multiple avatars, hand/full-body tracking, OAuth, comments, subscriptions.

Do not start by cloning every PRISM feature. The first useful product is a stable one-destination VTuber stream with enough avatar control to feel like a mobile studio instead of a bare screen recorder.

## OBS Parity Direction

### MVP OBS-Like Features

- **Scenes**: at least one editable scene, with data model support for multiple scenes even if the first UI only exposes one or two.
- **Sources**: screen capture source, PNGTuber source, Live2D source, solid/color background source, image source, and optional text label source.
- **Layer stack**: source ordering, visibility toggles, lock/unlock, basic naming.
- **Transforms**: position, size, scale, fit/fill, rotation if cheap, reset transform.
- **Audio mixer v1**: microphone level meter, mute/unmute, gain slider, lip-sync input meter.
- **Profiles/presets**: RTMP destination profile, stream quality preset, avatar preset, scene preset.
- **Studio controls**: go live, stop, reconnect, stream health, elapsed time, dropped frames, bitrate.
- **Quick controls**: expression buttons act like OBS hotkeys/stream deck buttons for avatar state.

### Post-MVP OBS-Like Features

- Multiple scenes with scene switching.
- Scene duplication and templates.
- Transitions between scenes.
- Source filters such as color correction, chroma key, crop, mask, and opacity.
- Browser/web source if platform performance is acceptable.
- More complete audio mixer: multiple channels, monitoring, compressor/limiter/noise gate.
- Macro/action buttons for expression, scene switch, mute, and overlay visibility.
- Remote control or companion web panel.

### Out Of Scope Compared With PC OBS

- PC OBS plugin compatibility.
- Arbitrary third-party native plugins.
- Unlimited source count.
- Heavy desktop-grade filter chains.
- Full dockable desktop UI.
- Capture of every app's internal audio on every device; OS policy limits this.
- Full parity with OBS Studio Mode in the first release.

## Tech Stack

- **App shell**: React Native bare workflow for shared UI and navigation.
- **iOS native module**: Swift, AVFoundation, ReplayKit/Broadcast Upload Extension, VideoToolbox, AudioToolbox.
- **Android native module**: Kotlin, CameraX, MediaProjection, MediaCodec, AudioRecord/AudioPlaybackCapture where allowed.
- **Streaming protocol MVP**: RTMP and RTMPS.
- **VTuber runtime MVP**: PNGTuber renderer plus Live2D runtime integration. Confirm Live2D Cubism SDK licensing before distribution.
- **Backend MVP**: none required for custom RTMP. Add backend later for accounts, relay/multistream, remote config, subscription, and analytics.
- **Local storage**: encrypted local storage for non-secret settings; never store raw stream keys without platform-secure storage.

Official implementation references to consult before coding:

- Apple AVFoundation capture sessions: https://developer.apple.com/documentation/avfoundation/setting-up-a-capture-session
- Apple ReplayKit: https://developer.apple.com/documentation/replaykit
- Android MediaProjection: https://developer.android.com/guide/topics/large-screens/media-projection-large-screens
- Android MediaProjection API: https://developer.android.com/reference/android/media/projection/MediaProjection
- Android CameraX architecture: https://developer.android.com/media/camera/camerax/architecture

## MVP Features

- iOS and Android support.
- RTMP and RTMPS destination support: stream URL, stream key, title label, save/load destination.
- Screen capture as the primary video source.
- Android screen capture through MediaProjection.
- iOS screen broadcasting through ReplayKit Broadcast Upload Extension.
- OBS-like scene/source data model for screen, avatar, image/background, and text sources.
- PNGTuber avatar mode.
- Live2D avatar mode.
- Voice-driven lip sync from microphone input.
- Automatic blinking.
- Expression buttons for switching avatar expressions.
- Avatar position and size adjustment over the captured screen.
- Basic audio mixer controls: microphone meter, mute, gain, and lip-sync meter.
- Local profiles for destination, quality, avatar, and scene settings.
- Live setup screen: resolution, FPS, bitrate, orientation, audio source, avatar preset.
- Go-live controls: start, stop, reconnect, elapsed time, bitrate, dropped frames, connection status.
- Permissions and privacy UX for microphone, notification, screen capture, and storage.

## Platform-Specific Requirements

### iOS

- Screen broadcasting requires ReplayKit and a Broadcast Upload Extension; this is not equivalent to in-app screen capture.
- The Broadcast Upload Extension must receive screen and audio sample buffers, composite the VTuber avatar if feasible within extension constraints, encode, and publish via RTMP/RTMPS.
- Hardware encoding should use VideoToolbox where possible.
- Background behavior is constrained; design for OS-visible broadcast flows and clear user consent.
- App Store review needs clear privacy explanations for microphone, screen recording, and network streaming.
- Expect tighter memory and runtime constraints than the main app; the OBS-like editor UI lives in the host app, while the extension should run a compact broadcast pipeline.

### Android

- Screen broadcasting uses MediaProjection and must request user consent for each projection session.
- The Android streaming service must composite MediaProjection frames with PNGTuber/Live2D avatar output before encoding and RTMP/RTMPS publishing.
- Android 14+ projection behavior and one-time token rules must be handled carefully.
- Hardware encoding should use MediaCodec.
- Audio capture from other apps is permission and policy constrained; game/system audio support varies by Android version and app opt-in.
- Use a foreground service for long-running screen streaming and keep the OBS-like editor separate from the critical streaming service state.

## Post-MVP Features

- iOS face tracking.
- VRM avatar mode.
- Multiple avatars in one scene.
- Hand tracking.
- Full-body tracking.
- OAuth integrations for YouTube, Twitch, Facebook, and other platforms.
- Comment retrieval and chat overlays.
- Multistream through a cloud relay.
- Web widget overlay.
- OBS-like source filters.
- Multiple scenes and transitions.
- Stream deck-style macro buttons.
- Remote control or companion web panel.
- Background music library.
- Cloud account sync.
- Paid plan and watermark controls.

## Non-Goals For MVP

- Full PRISM feature parity.
- iOS face tracking.
- VRM support.
- Multiple avatars.
- Hand tracking.
- Full-body tracking.
- OAuth connection to streaming platforms.
- Comment retrieval.
- Free built-in multistream without a relay.
- Guest calling/interview mode.
- Desktop companion app.
- PC OBS plugin compatibility.
- Arbitrary native plugin system.
- Unlimited desktop-style source/filter chains.
- AI script extraction.
- Marketplace of effects/templates.

## Architecture Notes

- Keep UI state separate from streaming engine state. The streaming engine should expose a small event API: `idle`, `preparing`, `live`, `reconnecting`, `stopping`, `failed`.
- Treat the outgoing program feed as the single source of truth: captured screen plus VTuber avatar are composed before encode.
- The MVP may use native composition first if React Native view capture is too slow or unstable.
- Build a test RTMP target early, such as a local RTMP server or a private unlisted stream key, before polishing UI.
- Keep avatar state deterministic and small: selected model, expression, position, scale, lip-sync level, blink state.
- Build the audio lip-sync path as amplitude/viseme-lite first; do not depend on face tracking for MVP.
- Model scenes as serializable documents so the UI can behave like OBS while the native pipeline receives a compact render graph.
- Apply hard mobile limits to OBS-like flexibility: source count caps, resolution caps, filter caps, and thermal/battery health warnings.

## Open Questions

- Final app branding beyond MobileLiveCaster.
- Whether Live2D assets are user-imported, bundled samples, or both.
- Whether PNGTuber input supports two images only or multiple mouth/eye states.
- Whether RTMPS certificate validation and custom CA behavior need user controls.
- How many scenes and sources are allowed on low-end devices.
- Whether the app should expose "simple mode" and "OBS mode" separately.
- Whether the first market is Japan, global English, or both.
- Whether monetization is subscriptions, one-time purchase, watermark removal, or none.

## Next Implementation Plan

1. Choose final scaffold: React Native bare or fully native iOS/Android apps.
2. Define the OBS-like scene/source/profile document schema before UI implementation.
3. Scaffold repo and create iOS/Android native streaming module boundaries.
4. Build Android MediaProjection capture and a local preview/composition path.
5. Build iOS ReplayKit Broadcast Upload Extension skeleton.
6. Add RTMP/RTMPS publish pipeline to one test endpoint.
7. Add PNGTuber rendering, voice lip sync, auto blink, expression buttons, and transform controls.
8. Add the first OBS-like editor: source list, visibility, lock, transform, mixer, and profile controls.
9. Add Live2D runtime integration after licensing and sample-model validation.
10. Verify on one physical iPhone and one physical Android device.
