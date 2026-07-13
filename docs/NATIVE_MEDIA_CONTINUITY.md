# Native Media Continuity

MobileLiveCaster monitors whether the native RTMP publisher continues sending video and audio after it reaches the published state. This catches a frozen encoder or publisher path that can otherwise look connected at the transport level.

## Runtime contract

The `continuity` runtime payload reports:

- current status: `inactive`, `warming-up`, `healthy`, `video-stalled`, `audio-stalled`, `both-stalled`, or `unknown`
- independent video/audio stalled flags and current stall durations
- epoch-millisecond timestamps for the last observed counter advancement
- retained video/audio incident counts and longest observed stall durations
- the active stall threshold, currently 5,000 milliseconds

iOS observes ReplayKit publisher video/audio message counters. Android observes sent-frame counters from the direct MediaCodec publisher or RootEncoder publisher. Only timestamps and counters cross the native bridge; media payloads are not retained.

## State policy

- Monitoring becomes active only while the session is live and the RTMP publisher state is `published`.
- Prepare, pause, reconnect, and stopped states reset the current baseline without erasing retained incident history.
- The first published sample starts a new warm-up baseline, so a slow connection does not create an immediate false stall.
- A changed counter, including a counter reset after reconnect, is treated as forward activity and starts a new baseline.
- A channel that does not advance for five seconds enters its channel-specific stalled state. The incident count increments once per transition and the maximum duration grows until recovery.
- A one-second native heartbeat samples publisher counters independently of media/FPS/bitrate callbacks, so a fully wedged publisher still advances the watchdog clock.
- Existing native runtime freshness checks remain responsible for detecting the native service or ReplayKit extension itself becoming unavailable.

## Commercial evidence

Current stalls, recovered stall incidents, and missing continuity telemetry produce operator warnings and make retained native runtime evidence non-passing. Completed sessions and physical validation runs preserve this evidence, and both Web and React Native diagnostics show the status, incident totals, and maximum durations.

Production approval still requires private RTMPS tests on physical iOS and Android devices. Verify uninterrupted motion and audio at the destination dashboard, then exercise a controlled reconnect to confirm that publish transitions re-baseline without a false incident.
