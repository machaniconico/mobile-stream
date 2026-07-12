# Stream Quality Guidance

Last verified: 2026-07-13

MobileLiveCaster currently sends one H.264 video track and one AAC audio track over RTMP or RTMPS. The in-app platform targets are conservative, single-encode operator defaults for landscape 16:9 or portrait 9:16 output up to 1080p. They are recommendations, not proof that a specific account, device, network, or ingest session will accept the stream.

## Platform Targets

| Platform | Output | 30 fps video | 60 fps video | Audio |
| --- | --- | ---: | ---: | ---: |
| YouTube Live | 540p or 720p, landscape or portrait | 4000 kbps | 6000 kbps | 128 kbps |
| YouTube Live | 1080p, landscape or portrait | 10000 kbps | 12000 kbps | 128 kbps |
| Twitch | 540p or 720p, landscape or portrait | 3000 kbps | 4500 kbps | 96 kbps |
| Twitch | 1080p, landscape or portrait | 4500 kbps | 6000 kbps | 96 kbps |

The 540p targets intentionally reuse each platform's 720p guidance as a stability ceiling. Applying a platform target keeps the selected 30/60 fps mode and maps nonstandard dimensions to 960x540, 1280x720, or 1920x1080 for landscape and 540x960, 720x1280, or 1080x1920 for portrait.

## Start Checks

- Twitch video above 6000 kbps produces a readiness warning.
- Twitch AAC audio above 160 kbps blocks start.
- Twitch output whose long edge exceeds 1920 or short edge exceeds 1080 produces a readiness warning.
- Twitch portrait output warns that one classic RTMP track does not enable Twitch Dual Format or Enhanced Broadcasting.
- YouTube output whose long edge exceeds 1920 or short edge exceeds 1080 produces a warning because it is outside this app's physically tested mobile H.264 recommendation matrix, even though YouTube supports higher resolutions with other targets.
- Device encoder capability probes, stable private-ingest evidence, and physical-device validation remain authoritative for commercial release.

## Official Sources

- YouTube Live encoder settings: https://support.google.com/youtube/answer/2853702?hl=en
- YouTube vertical live streams: https://support.google.com/youtube/answer/13822251?hl=en
- Twitch broadcasting guidelines: https://help.twitch.tv/s/article/broadcasting-guidelines?language=en_US
- Twitch Enhanced Broadcasting: https://help.twitch.tv/s/article/multiple-encodes
- Twitch Dual Format Streaming: https://help.twitch.tv/s/article/dual-format-vertical-video

YouTube can surface vertical live streams in its vertical live feed. Twitch Enhanced Broadcasting can negotiate multiple encodes and Dual Format output with higher aggregate bandwidth. MobileLiveCaster does not claim Twitch Enhanced Broadcasting or Dual Format support; its current Twitch portrait target is one classic single-encode RTMP track.
