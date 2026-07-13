# Native RTMP A/V Timestamp Sync

MobileLiveCaster measures video/audio timestamp drift at the native RTMP publisher boundary. This detects encoder or mux timeline drift that frame-count continuity checks cannot detect.

## Coverage

| Platform | Publisher path | Evidence |
| --- | --- | --- |
| iOS | ReplayKit Broadcast Upload Extension | VideoToolbox and AudioToolbox RTMP timestamps |
| Android | Direct MediaCodec publisher | H.264 and AAC `MediaCodec.BufferInfo.presentationTimeUs` values |
| Android | RootEncoder compatibility publisher | Unavailable; not accepted as commercial A/V sync evidence |

iOS compares the shared ReplayKit media timeline directly. Android maps each codec's first raw timestamp onto one monotonic publish-generation clock using the packet observation time, preserving track start offset while removing unrelated MediaCodec clock origins. Reconnects create new current-generation baselines without deleting incidents or maxima already observed in the session.

An A/V sample is recorded only after both tracks have advanced since the previous sample. Bursts of multiple packets from one track therefore cannot manufacture consecutive violations by repeatedly comparing against one stale packet from the other track.

## Status Rules

- `warming-up`: one or both RTMP media tracks have not produced a timestamp.
- `in-sync`: drift is within 150 ms, or a larger transient has not persisted for three consecutive paired samples.
- `video-leading`: normalized video time leads audio by more than 150 ms for three consecutive paired samples.
- `audio-leading`: normalized audio time leads video by more than 150 ms for three consecutive paired samples.
- `critical`: absolute drift is at least 500 ms for three consecutive paired samples, tracked independently from warning-level persistence.

The tracker retains current signed skew, maximum absolute skew, sample counts, out-of-sync samples, confirmed incidents, critical incidents, and longest consecutive violation. A single scheduling transient is retained in maximum/sample telemetry but does not become an incident.

## Release Evidence

Commercial validation requires both iOS and Android retained runs to contain:

- production native video/audio encoder backends;
- paired A/V timestamp sample counts of at least two samples per retained monitor-hold second, with a minimum of three;
- current `in-sync` status, current skew no greater than 150 ms, and maximum observed skew no greater than 150 ms;
- zero out-of-sync samples and zero retained consecutive violations;
- zero confirmed out-of-sync incidents;
- zero critical incidents.

The evidence is retained in the native runtime snapshot, completed session summary, physical-validation manifest, support bundle, Web diagnostics, and React Native diagnostics.

This telemetry proves native encoder/mux timeline alignment. It does not replace physical endpoint validation of total glass-to-glass latency or subjective lip sync after platform transcoding. Validate those separately on YouTube Live and Twitch with a clap/flash reference and retained dashboard evidence.
