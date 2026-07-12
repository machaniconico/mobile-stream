# Native Audio Metering

MobileLiveCaster uses encoder-path PCM measurements for production audio diagnostics. Native streams do not treat avatar mouth motion or a manual lip-sync control as proof that the broadcast contains sound.

## Runtime contract

The `audioProcessing` runtime payload reports RMS level, peak level, PCM sample count, clipped-sample count, and epoch-millisecond update time for an approximately one-second native measurement window on these channels:

| Channel | iOS | Android |
| --- | --- | --- |
| Microphone | After mic effects and broadcast mic gain | After mic effects and broadcast mic gain |
| Captured app audio | ReplayKit app PCM after broadcast app gain | Not reported by the current microphone encoder path |
| Final mixed output | ReplayKit app/mic mix after output clamping | Not reported by the current microphone encoder path |

Only scalar measurements and counters cross the native bridge. PCM content is not persisted or included in diagnostics/support bundles.

## Guard policy

- Native iOS/Android sessions require current `native-pcm` microphone evidence. Face-tracking and manual lip-sync samples cannot make the native silence guard pass.
- The first 15 seconds are a warm-up window.
- Fewer than three current meter observations, stale native telemetry, zero activity, or a peak below the configured low-level thresholds produces an operator warning.
- The peak guard prefers the latest final mixed-output clipping window on iOS and the latest microphone clipping window otherwise.
- A microphone timestamp older than three seconds is stale even if video/runtime telemetry is still updating. Silence analysis retains only the latest five seconds of meter observations.
- Any measured clipping produces a warning. Clipping at or above 1% of measured PCM samples is a failure requiring gain reduction before continuing publicly.

## Release validation

Run a private spoken segment on physical iOS and Android devices with the intended microphone, headset, effects preset, and mixer levels. Retain diagnostics showing current native PCM samples, non-stale timestamps, a stable active percentage, and zero clipped PCM samples before approving a production release.
