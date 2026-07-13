# Native Audio Metering

MobileLiveCaster uses encoder-path PCM measurements for production audio diagnostics. Native streams do not treat avatar mouth motion or a manual lip-sync control as proof that the broadcast contains sound.

## Runtime contract

The `audioProcessing` runtime payload reports RMS level, peak level, PCM sample count, clipped-sample count, and epoch-millisecond update time for an approximately one-second native measurement window on these channels:

| Channel | iOS | Android |
| --- | --- | --- |
| Microphone | After mic effects and broadcast mic gain | After mic effects and broadcast mic gain |
| Captured app audio | ReplayKit app PCM after broadcast app gain | Android 10+ MediaProjection playback PCM after broadcast app gain on the direct MediaCodec path |
| Final mixed output | ReplayKit app/mic mix after output clamping | Direct MediaCodec app/mic stereo mix after soft limiting |

Only scalar measurements and counters cross the native bridge. PCM content is not persisted or included in diagnostics/support bundles.

## Guard policy

- Native iOS/Android sessions require current `native-pcm` microphone evidence. Face-tracking and manual lip-sync samples cannot make the native silence guard pass.
- The first 15 seconds are a warm-up window.
- Fewer than three current meter observations, stale native telemetry, zero activity, or a peak below the configured low-level thresholds produces an operator warning.
- The peak guard prefers the latest final mixed-output clipping window when one is available and falls back to the latest microphone clipping window.
- A microphone timestamp older than three seconds is stale even if video/runtime telemetry is still updating. Silence analysis retains only the latest five seconds of meter observations.
- Any measured clipping produces a warning. Clipping at or above 1% of measured PCM samples is a failure requiring gain reduction before continuing publicly.

## Release validation

Run a private spoken segment on physical iOS and Android devices with the intended microphone, headset, effects preset, and mixer levels. On Android 10+, also play eligible game/media audio and one comment-readout utterance while using the direct MediaCodec publisher. Retain diagnostics showing current mic/app/final-mix PCM samples, a non-zero app peak, non-stale timestamps, a stable active percentage, and zero clipped final-mix samples before approving a production release. Android apps may opt out of playback capture, so validate each intended game on a physical device.
