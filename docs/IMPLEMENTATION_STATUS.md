# Implementation Status

## Implemented Now

- TypeScript app scaffold with Vite.
- OBS-like scene/source/render graph domain model.
- Stream profile model for RTMP and RTMPS destinations.
- Avatar runtime model for PNGTuber/Live2D expression, lip sync, and auto blink.
- Stream state machine for idle, preparing, live, reconnecting, stopping, and failed states.
- Mock live engine for UI development without native capture.
- Browser-preview Studio UI:
  - source stack
  - source visibility and lock controls
  - transform sliders
  - program preview
  - mic/lip-sync meter
  - expression buttons
  - RTMP/RTMPS setup
  - quality profiles
  - Go Live, Stop, Reconnect mock controls
- iOS ReplayKit Broadcast Upload Extension skeleton.
- Android MediaProjection service skeleton.

## Not Implemented Yet

- Real RTMP/RTMPS native publisher.
- Real screen capture in a packaged iOS/Android app.
- Native compositor.
- VideoToolbox and MediaCodec encoder integration.
- Live2D Cubism SDK integration.
- Secure platform storage for stream keys.
- React Native bare app packaging.

## Local Environment Notes

- Xcode is available.
- Java/JDK is not installed, so Android builds are currently blocked.
- Watchman is not installed, so React Native local development will need setup before device builds.

## Next Slice

1. Move this verified TypeScript app shell into a React Native bare scaffold.
2. Keep `src/domain` as shared app logic.
3. Replace `MockLiveCaster` with platform native modules behind the same interface.
4. Build Android MediaProjection capture first, because it is easier to iterate than iOS Broadcast Upload Extension constraints.
5. Build iOS ReplayKit extension once app group storage and render graph serialization are stable.
