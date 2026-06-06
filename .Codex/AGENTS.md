# MobileLiveCaster

- App goal: iPhone/Android VTuber live streaming app: a mobile OBS-like studio inspired by PRISM Live Studio.
- Keep this file minimal; put detailed requirements in `.Codex/SPEC.md`.
- Preferred stack: React Native bare app shell plus native iOS Swift and Android Kotlin streaming modules.
- Avoid Expo managed-only assumptions; ReplayKit, Broadcast Upload Extension, MediaProjection, hardware encoders, and background audio require native targets.
- MVP first: RTMP/RTMPS screen streaming with PNGTuber, Live2D, voice lip sync, auto blink, expression buttons, and avatar transform controls.
- Use an OBS-like mental model where practical: scenes, sources, layers, transforms, mixer, profiles, and go-live controls.
- Treat iOS face tracking, VRM, multiple avatars, hand/full-body tracking, OAuth, and comment retrieval as non-MVP.
- Never commit secrets, stream keys, OAuth client secrets, or signing materials.
- Tests: important logic only at first; add device/integration checks for capture and streaming paths.
- Commands: `npm run dev`, `npm run mobile:start`, `npm test`, `npm run typecheck`, `npm run build`, `npm run verify:ui`, `npm run verify:rn`.
- Agent failures log: (empty)
