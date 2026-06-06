# MobileLiveCaster

MobileLiveCaster is an OBS-like mobile VTuber streaming studio concept for iOS and Android.

The current implementation is a verified TypeScript/Vite prototype that defines the core scene model, stream profile model, avatar runtime, mock streaming engine, and an interactive Studio UI. Native iOS/Android capture and publishing are represented by skeletons so the app can grow toward ReplayKit, MediaProjection, and RTMP/RTMPS without rewriting the UI contract.

## Current Prototype

- OBS-like scene/source stack.
- Screen, PNGTuber, Live2D, image, solid, and text source records.
- Layer visibility, lock, ordering, and transform controls.
- RTMP/RTMPS destination profile.
- Quality presets.
- Voice lip-sync meter and expression buttons.
- Mock Go Live, Stop, and Reconnect controls.
- iOS ReplayKit Broadcast Upload Extension skeleton.
- Android MediaProjection service skeleton.

## Commands

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

## Native Direction

- iOS screen capture: ReplayKit Broadcast Upload Extension.
- Android screen capture: MediaProjection foreground service.
- Encoding: VideoToolbox on iOS, MediaCodec on Android.
- Streaming: RTMP/RTMPS publisher behind `src/native/LiveCasterNative.ts`.
- Avatar rendering: PNGTuber first, Live2D after licensing and runtime validation.

## Status

See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).
