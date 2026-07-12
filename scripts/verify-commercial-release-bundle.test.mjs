import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const fixturePath = ".artifacts/verify-commercial-release-bundle-test/support-bundle.json";

describe("commercial release bundle verifier CLI", () => {
  afterEach(() => {
    rmSync(".artifacts/verify-commercial-release-bundle-test", { recursive: true, force: true });
  });

  it("passes a redacted commercial support bundle", () => {
    writeBundle({
      diagnostics: {
        api: {
          youtubeAccessToken: "[redacted]",
          twitchOauthToken: "[redacted]",
          serialized: '{"apiKey":"[redacted]","nestedClientSecret":"[redacted]"}'
        }
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Can release: yes");
  });

  it("rejects warning-approved commercial support-bundle verification", () => {
    writeBundle();

    const result = spawnSync(
      process.execPath,
      ["scripts/verify-commercial-release-bundle.mjs", fixturePath, "--max-age-hours=24", "--allow-warnings"],
      {
        encoding: "utf8"
      }
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage:");
    expect(result.stderr).toContain("--allow-warnings is not supported for commercial release approval.");
    expect(result.stdout).not.toContain("Can release: yes");
  });

  it("blocks v21 support bundles without platform dashboard manifest proof", () => {
    writeBundle({
      app: {
        name: "MobileLiveCaster",
        reportVersion: 1,
        bundleVersion: 21
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Support bundle v21 is older than the required v55.");
  });

  it("blocks v54 support bundles because native caption overlay proof requires v55", () => {
    writeBundle({
      app: {
        name: "MobileLiveCaster",
        reportVersion: 1,
        bundleVersion: 54
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Support bundle v54 is older than the required v55.");
  });

  it("blocks support bundles without public launch confirmation summary evidence", () => {
    writeBundle({
      summary: {
        publicLaunchConfirmationEventCount: undefined
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Public launch confirmation audit");
  });

  it("blocks support bundles generated after the verifier time", () => {
    writeBundle({
      generatedAt: new Date(Date.now() + 60_000).toISOString()
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[FAIL] Support bundle freshness");
    expect(result.stdout).toContain("The support bundle generatedAt timestamp is in the future.");
  });

  it("blocks support bundles whose latest public launch confirmation was cancelled", () => {
    writeBundle({
      summary: {
        publicLaunchConfirmationEventCount: 2,
        publicLaunchLastConfirmationStatus: "cancelled",
        publicLaunchLastConfirmationAt: "2026-06-23T11:28:00.000Z",
        publicLaunchLastConfirmationMessage:
          "YouTube Public launch confirmation was cancelled by the operator. Target: YouTube Live, app privacy public, dashboard privacy public, broadcast selected, stream selected, broadcast status testing. Checklist: 9 pass / 0 warn / 0 fail, Public launch checklist is ready."
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Public launch confirmation audit");
    expect(result.stdout).toContain("The latest public launch confirmation was cancelled by the operator.");
  });

  it("blocks public launch confirmation events without target and checklist audit evidence", () => {
    writeBundle({
      summary: {
        publicLaunchConfirmationEventCount: 1,
        publicLaunchLastConfirmationStatus: "confirmed",
        publicLaunchLastConfirmationAt: "2026-06-23T11:28:00.000Z",
        publicLaunchLastConfirmationMessage: "YouTube Public launch confirmation was accepted by the operator."
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Public launch confirmation audit");
    expect(result.stdout).toContain("The support bundle is missing valid public launch confirmation summary evidence.");
  });

  it("blocks public launch confirmation events without clean checklist counts", () => {
    writeBundle({
      summary: {
        publicLaunchConfirmationEventCount: 1,
        publicLaunchLastConfirmationStatus: "confirmed",
        publicLaunchLastConfirmationAt: "2026-06-23T11:28:00.000Z",
        publicLaunchLastConfirmationMessage:
          "YouTube Public launch confirmation was accepted by the operator. Target: YouTube Live, app privacy public, dashboard privacy public, broadcast selected, stream selected, broadcast status testing. Checklist: 8 pass / 1 warn / 0 fail, Public launch checklist still has warnings."
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Public launch confirmation audit");
    expect(result.stdout).toContain("The support bundle is missing valid public launch confirmation summary evidence.");
  });

  it("blocks public launch confirmation events recorded after the support bundle was generated", () => {
    writeBundle({
      generatedAt: "2026-06-23T11:30:00.000Z",
      summary: {
        publicLaunchConfirmationEventCount: 1,
        publicLaunchLastConfirmationStatus: "confirmed",
        publicLaunchLastConfirmationAt: "2026-06-23T11:31:00.000Z",
        publicLaunchLastConfirmationMessage:
          "YouTube Public launch confirmation was accepted by the operator. Target: YouTube Live, app privacy public, dashboard privacy public, broadcast selected, stream selected, broadcast status testing. Checklist: 9 pass / 0 warn / 0 fail, Public launch checklist is ready."
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Public launch confirmation audit");
    expect(result.stdout).toContain("The support bundle is missing valid public launch confirmation summary evidence.");
  });

  it("accepts confirmed public launch events with retained target and checklist audit evidence", () => {
    writeBundle({
      summary: {
        publicLaunchConfirmationEventCount: 1,
        publicLaunchLastConfirmationStatus: "confirmed",
        publicLaunchLastConfirmationAt: "2026-06-23T11:28:00.000Z",
        publicLaunchLastConfirmationMessage:
          "YouTube Public launch confirmation was accepted by the operator. Target: YouTube Live, app privacy public, dashboard privacy public, broadcast selected, stream selected, broadcast status testing. Checklist: 9 pass / 0 warn / 0 fail, Public launch checklist is ready."
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Can release: yes");
    expect(result.stdout).not.toContain("Public launch confirmation audit");
    expect(result.stdout).not.toContain("The latest public launch confirmation was cancelled");
  });

  it("blocks v55 support bundles without scene fingerprint evidence", () => {
    writeBundle({
      summary: {
        sceneFingerprint: undefined
      },
      scene: {}
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Scene fingerprint");
    expect(result.stdout).toContain("Support bundle v55 is missing scene composition fingerprint evidence.");
  });

  it("blocks v55 support bundles with mismatched scene fingerprints", () => {
    writeBundle({
      summary: {
        sceneFingerprint: "scene1-summary"
      },
      scene: {
        fingerprint: "scene1-scene"
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Summary and scene fingerprint values do not match.");
  });

  it("blocks v55 support bundles when retained validation runs are from another scene", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { sceneFingerprint: "scene1-other" }),
          manifestRun("android", "svr1-android", { sceneFingerprint: "scene1-other" })
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Validation evidence manifest");
    expect(result.stdout).toContain("do not match the current scene fingerprint scene1-ready");
  });

  it("blocks v55 support bundles without native caption overlay summary evidence", () => {
    writeBundle({
      summary: {
        nativeCompositionCaptionOverlayCount: undefined
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Native caption overlay evidence");
    expect(result.stdout).toContain("missing native caption overlay count summary evidence");
  });

  it("blocks text overlay warning evidence", () => {
    writeBundle({
      summary: {
        textOverlayStatus: "warn",
        textOverlayLayoutRiskIssueCount: 1,
        textOverlaySummary: "1 visible text overlay may clip or be unreadable on mobile output.",
        textOverlayRecommendation: "Increase the text box before public launch."
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[FAIL] Text overlay evidence");
    expect(result.stdout).toContain("Text overlay evidence");
    expect(result.stdout).toContain("Can release: no");
    expect(result.stdout).not.toContain("release warning");
  });

  it("blocks queued or expired timed text overlay evidence", () => {
    writeBundle({
      summary: {
        textOverlayStatus: "pass",
        textOverlayQueuedTimedManualSourceCount: 1,
        textOverlayExpiredTimedManualSourceCount: 1,
        textOverlaySummary: "1 timed text overlay is queued and 1 has expired.",
        textOverlayRecommendation: "Start or hide timed text overlays before launch."
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[FAIL] Text overlay evidence");
    expect(result.stdout).toContain("1 timed text overlay is queued and 1 has expired.");
    expect(result.stdout).toContain("Can release: no");
  });

  it("blocks live caption warning evidence", () => {
    writeBundle({
      summary: {
        liveCaptionStatus: "warn",
        liveCaptionEnabled: true,
        liveCaptionRecognitionStatus: "listening",
        liveCaptionVisibleRuntimeSourceCount: 1,
        liveCaptionActiveCueCount: 0,
        liveCaptionFinalCueCount: 0,
        liveCaptionTranscriptCount: 0,
        liveCaptionSummary: "Live captions are listening, but no final caption cue has been confirmed in this session.",
        liveCaptionRecommendation: "Speak a short test phrase before public launch."
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[FAIL] Live caption evidence");
    expect(result.stdout).toContain("Live caption evidence");
    expect(result.stdout).toContain("Can release: no");
    expect(result.stdout).not.toContain("release warning");
  });

  it("blocks chat overlay warning evidence", () => {
    writeBundle({
      summary: {
        chatOverlayStatus: "warn",
        chatOverlayOpaqueBackgroundIssueCount: 1,
        chatOverlayLayoutRiskIssueCount: 1,
        chatOverlaySummary: "1 visible chat overlay may clip comments or cover gameplay.",
        chatOverlayRecommendation: "Keep the chat overlay transparent and increase the chat box before launch."
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[FAIL] Chat overlay evidence");
    expect(result.stdout).toContain("Chat overlay evidence");
    expect(result.stdout).toContain("Can release: no");
    expect(result.stdout).not.toContain("release warning");
  });

  it("blocks public launch checklist warnings", () => {
    writeBundle({
      summary: {
        publicLaunchStatus: "warning",
        publicLaunchWarningCount: 1
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[FAIL] Public launch checklist");
    expect(result.stdout).toContain("platform-visible starts are locked");
    expect(result.stdout).toContain("Can release: no");
    expect(result.stdout).not.toContain("release warning");
  });

  it("blocks Go Live preflight warnings", () => {
    writeBundle({
      summary: {
        preflightStatus: "warning",
        launchWarningCount: 1
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[FAIL] Go Live preflight");
    expect(result.stdout).toContain("clean preflight");
    expect(result.stdout).toContain("Can release: no");
    expect(result.stdout).not.toContain("release warning");
  });

  it("blocks commercial validation warnings and pending items", () => {
    writeBundle({
      summary: {
        validationWarningCount: 1,
        validationPendingCount: 1
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[FAIL] Commercial validation");
    expect(result.stdout).toContain("Resolve every commercial validation warning");
    expect(result.stdout).toContain("Can release: no");
    expect(result.stdout).not.toContain("release warning");
  });

  it("blocks launch rehearsal warnings", () => {
    writeBundle({
      summary: {
        rehearsalWarningCount: 1,
        rehearsalSummary: "Private rehearsal has one warning.",
        rehearsalPrimaryAction: "Repeat the rehearsal until every warning is resolved."
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[FAIL] Launch rehearsal");
    expect(result.stdout).toContain("Private rehearsal has one warning.");
    expect(result.stdout).toContain("Can release: no");
    expect(result.stdout).not.toContain("release warning");
  });

  it("blocks support bundles with failed completed stream-session evidence", () => {
    writeBundle({
      diagnostics: {
        session: sessionDiagnostics({
          historySummary: {
            stability: "unstable",
            failureCount: 1,
            totalFailureEvents: 2
          },
          lastSummary: {
            outcome: "fail",
            failureCount: 1,
            recoveryEventCount: 0,
            operationFailureCount: 1,
            platformApiFailureCount: 0,
            qualityUpdateFailureCount: 0,
            chatReconnectFailureCount: 0,
            chatSpeechFailureCount: 0
          }
        })
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[FAIL] Stream session recovery evidence");
    expect(result.stdout).toContain("stream session evidence is not clean");
    expect(result.stdout).toContain("Can release: no");
  });

  it("blocks support bundles with recovery events before commercial release", () => {
    writeBundle({
      diagnostics: {
        session: sessionDiagnostics({
          historySummary: {
            stability: "watch",
            totalRecoveryEvents: 1
          },
          lastSummary: {
            outcome: "warn",
            failureCount: 0,
            recoveryEventCount: 1,
            operationFailureCount: 0,
            platformApiFailureCount: 0,
            qualityUpdateFailureCount: 0,
            chatReconnectFailureCount: 0,
            chatSpeechFailureCount: 0
          }
        })
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[FAIL] Stream session recovery evidence");
    expect(result.stdout).toContain("Recent stream session evidence includes 1 recovery event(s); latest session includes 1.");
    expect(result.stdout).toContain("Can release: no");
  });

  it("blocks prefix-named token and API key leaks", () => {
    writeBundle({
      diagnostics: {
        api: {
          youtubeAccessToken: "youtube-access-token-secret",
          twitchOauthToken: "twitch-oauth-token-secret",
          serialized:
            '{"apiKey":"platform-api-key-secret","api_key":"platform-snake-api-key-secret","nestedClientSecret":"client-secret-value","oauth_token":"platform-snake-oauth-token-secret"} customOauthToken=custom-oauth-token-secret',
          headers:
            "X-API-Key: support-header-api-key-secret Client-Secret: support-header-client-secret OAuth-Token: support-header-oauth-token"
        }
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Support bundle privacy");
    expect(result.stdout).toContain("unredacted sensitive value");
  });

  it("blocks unredacted credential-bearing OAuth and webhook URLs", () => {
    writeBundle({
      diagnostics: {
        oauth: {
          callbackUrl: "mobilelivecaster://oauth/youtube?code=oauth-code-secret&state=oauth-state-secret",
          authorizationUrl:
            "https://accounts.google.com/o/oauth2/v2/auth?client_id=yt-client&redirect_uri=com.mobilelivecaster.app%3A%2Foauth%2Fyoutube&response_type=code&state=authorization-state-secret&code_challenge=pkce-challenge-secret&code_challenge_method=S256",
          activationUrl: "https://www.twitch.tv/activate?public=true&device-code=ABCD-EFGH",
          webhookUrl:
            "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz.ABCDEFGHIJKLMNOPQRSTUVWXYZ_1234567890"
        }
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Support bundle privacy");
    expect(result.stdout).toContain("unredacted sensitive value");
  });

  it("blocks unredacted Twitch IRC oauth tokens and RTMP publish URLs", () => {
    writeBundle({
      diagnostics: {
        ingest: {
          twitchIrc: "PASS oauth:token-token-1234",
          publishUrl: "rtmps://a.rtmps.youtube.com/live2/abcd-efgh-ijkl-mnop-qrst"
        }
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Support bundle privacy");
    expect(result.stdout).toContain("unredacted sensitive value");
  });

  it("blocks structured credential headers in release support bundles", () => {
    writeBundle({
      diagnostics: {
        api: {
          structuredHeaders:
            '{"X-API-Key":"alpha-alpha-alpha-1234"} headers["Client-Secret"] = "bravo-bravo-bravo-1234";'
        }
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Support bundle privacy");
    expect(result.stdout).toContain("unredacted sensitive value");
  });

  it("blocks high-signal API keys and token shapes in release support bundles", () => {
    const openAiKey = ["sk", "-proj-", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"].join("");
    const jwtToken = [
      "eyJhbGciOiJIUzI1NiJ9",
      "eyJzdWIiOiJyZWxlYXNlLWJ1bmRsZSJ9",
      "c2lnbmF0dXJlMTIzNDU2Nzg5MA"
    ].join(".");
    writeBundle({
      diagnostics: {
        api: {
          keys: `${openAiKey} ${jwtToken}`
        }
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Support bundle privacy");
    expect(result.stdout).toContain("unredacted sensitive value");
  });

  it("blocks private key material in release support bundles", () => {
    const privateKeyBlock = [
      ["-----BEGIN ", "PRIVATE KEY-----"].join(""),
      "not-a-real-key",
      ["-----END ", "PRIVATE KEY-----"].join("")
    ].join("\n");
    writeBundle({
      diagnostics: {
        api: {
          keyBlock: privateKeyBlock
        }
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Support bundle privacy");
    expect(result.stdout).toContain("unredacted sensitive value");
  });

  it("blocks unredacted contact details in release support bundles", () => {
    writeBundle({
      diagnostics: {
        chat: {
          lastOverlayText: "email viewer@example.com phone 090-1234-5678 invite discord.gg/privateRoom"
        }
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Support bundle privacy");
    expect(result.stdout).toContain("unredacted contact pattern");
  });

  it("blocks unredacted protocol-less links in release support bundles", () => {
    writeBundle({
      diagnostics: {
        destination: {
          ingestEndpoint: "rtmps://live.example.com/app"
        },
        chat: {
          lastOverlayText: "shared www.example.org/private and example.tv/show"
        }
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Support bundle privacy");
    expect(result.stdout).toContain("unredacted protocol-less link pattern");
  });

  it("allows retained ingest host fields in release support bundles", () => {
    writeBundle({
      target: {
        host: "a.rtmps.youtube.com"
      },
      profile: {
        androidPublisherMode: "mediacodec",
        destination: {
          platform: "youtube-live",
          protocol: "rtmps",
          host: "a.rtmps.youtube.com"
        }
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Can release: yes");
  });

  it("blocks retained validation runs without physical-device proof", () => {
    writeBundle({
      summary: {
        validationEvidencePhysicalDeviceAndroidPass: false,
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios"),
          manifestRun("android", "svr1-android-emulator", {
            physicalDevice: false,
            physicalDeviceStatus: "fail"
          })
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Physical validation coverage");
    expect(result.stdout).toContain("physical device identity");
  });

  it("blocks avatar-motion claims when retained manifests lack fresh tracking runtime proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { faceTrackingRuntimeFresh: false }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("fresh tracking runtime, ready native face landmarks");
  });

  it("blocks avatar-motion claims when retained manifests lack motion attenuation proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            faceTrackingLandmarkMotionScale: 0,
            faceTrackingFaceControlScale: 0
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("motion/control attenuation-scale proof");
  });

  it("blocks native runtime claims when retained manifests lack native frame proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { nativeRuntimeSentVideoFrames: 0 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("production video/audio encoder backends");
  });

  it("blocks native runtime claims when retained manifests use non-production encoder backends", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("android", "svr1-android", {
            nativeRuntimeVideoEncoderBackend: "rootencoder",
            nativeRuntimeAudioEncoderBackend: "rootencoder"
          }),
          manifestRun("ios", "svr1-ios")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("production video/audio encoder backends");
  });

  it("blocks native runtime claims when retained manifests have rejected live render-graph updates", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeLiveRenderGraphReloadCount: 2,
            nativeRuntimeLiveRenderGraphRejectedUpdateCount: 1
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("live render-graph update proof");
  });

  it("blocks native runtime claims when retained manifests have compositor frame drops", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeDroppedFrameCount: 1
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("zero compositor drops/failures");
  });

  it("blocks native runtime claims when retained manifests show publisher congestion or queued frames", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeCongested: true,
            nativeRuntimeQueuedItems: 0,
            nativeRuntimeCacheSize: 8
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const congestedResult = runVerifier();

    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeCongested: false,
            nativeRuntimeQueuedItems: 3,
            nativeRuntimeCacheSize: 8
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const queuedResult = runVerifier();

    expect(congestedResult.status).toBe(1);
    expect(congestedResult.stdout).toContain("non-congested publisher state");
    expect(queuedResult.status).toBe(1);
    expect(queuedResult.stdout).toContain("empty native publisher queue");
  });

  it("blocks native runtime claims when retained manifests show publisher video or audio drops", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeDroppedVideoFrames: 1,
            nativeRuntimeDroppedAudioFrames: 0
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const videoDropResult = runVerifier();

    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeDroppedVideoFrames: 0,
            nativeRuntimeDroppedAudioFrames: 1
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const audioDropResult = runVerifier();

    expect(videoDropResult.status).toBe(1);
    expect(videoDropResult.stdout).toContain("zero publisher video/audio drops");
    expect(audioDropResult.status).toBe(1);
    expect(audioDropResult.stdout).toContain("zero publisher video/audio drops");
  });

  it("blocks native runtime claims when retained manifests have missing compositor assets", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeStillImageAssetLoadedCount: 0,
            nativeRuntimeStillImageAssetMissingCount: 1
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("loaded, decoded, and composited still-image assets");
  });

  it("blocks native runtime claims when retained manifests lack decoded still-image proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeStillImageAssetCount: 1,
            nativeRuntimeStillImageAssetLoadedCount: 1,
            nativeRuntimeStillImageAssetMissingCount: 0,
            nativeRuntimeStillImageAssetDecodedCount: 0,
            nativeRuntimeStillImageAssetDecodedPixelCount: 0,
            nativeRuntimeStillImageAssetCompositedCount: 0,
            nativeRuntimeStillImageAssetCompositedPixelCount: 0
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("loaded, decoded, and composited still-image assets");
  });

  it("blocks native runtime claims when retained manifests lack composited still-image proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeStillImageAssetCount: 1,
            nativeRuntimeStillImageAssetLoadedCount: 1,
            nativeRuntimeStillImageAssetMissingCount: 0,
            nativeRuntimeStillImageAssetDecodedCount: 1,
            nativeRuntimeStillImageAssetDecodedPixelCount: 921_600,
            nativeRuntimeStillImageAssetCompositedCount: 0,
            nativeRuntimeStillImageAssetCompositedPixelCount: 0
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("loaded, decoded, and composited still-image assets");
  });

  it("blocks iOS native runtime claims when retained manifests lack App Group still-image proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeStillImageAssetAppGroupCount: 0,
            nativeRuntimeStillImageAssetAppGroupLoadedCount: 0,
            nativeRuntimeStillImageAssetAppGroupDecodedCount: 0,
            nativeRuntimeStillImageAssetAppGroupDecodedPixelCount: 0,
            nativeRuntimeStillImageAssetAppGroupCompositedCount: 0,
            nativeRuntimeStillImageAssetAppGroupCompositedPixelCount: 0
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("native publisher/compositor overlay telemetry");
  });

  it("blocks native runtime claims when retained manifests lack applied overlay proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeCompositionAppliedCount: 0,
            nativeRuntimeCompositionSkippedCount: 0,
            nativeRuntimeStillImageAssetCount: 1,
            nativeRuntimeStillImageAssetLoadedCount: 1,
            nativeRuntimeStillImageAssetMissingCount: 0
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("applied/skipped native overlay proof");
  });

  it("blocks native runtime claims when retained manifests only prove still-image overlays", () => {
    writeBundle({
      summary: {
        nativeCompositionNativeOverlayCount: 4,
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeCompositionAppliedCount: 1,
            nativeRuntimeCompositionSkippedCount: 0,
            nativeRuntimeStillImageAssetCount: 1,
            nativeRuntimeStillImageAssetLoadedCount: 1,
            nativeRuntimeStillImageAssetMissingCount: 0,
            nativeRuntimeStillImageAssetDecodedCount: 1,
            nativeRuntimeStillImageAssetDecodedPixelCount: 921_600,
            nativeRuntimeStillImageAssetCompositedCount: 1,
            nativeRuntimeStillImageAssetCompositedPixelCount: 921_600
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("applied/skipped native overlay proof");
  });

  it("blocks native runtime claims when retained manifests omit text, caption, and chat overlay kinds", () => {
    writeBundle({
      summary: {
        nativeCompositionNativeOverlayCount: 4,
        nativeCompositionTextOverlayCount: 2,
        nativeCompositionCaptionOverlayCount: 1,
        nativeCompositionChatOverlayCount: 1,
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeCompositionAppliedCount: 4,
            nativeRuntimeCompositionAppliedKinds: ["image", "image", "pngtuber", "solid"],
            nativeRuntimeCompositionSkippedCount: 0,
            nativeRuntimeStillImageAssetCount: 1,
            nativeRuntimeStillImageAssetLoadedCount: 1,
            nativeRuntimeStillImageAssetMissingCount: 0,
            nativeRuntimeStillImageAssetDecodedCount: 1,
            nativeRuntimeStillImageAssetDecodedPixelCount: 921_600,
            nativeRuntimeStillImageAssetCompositedCount: 1,
            nativeRuntimeStillImageAssetCompositedPixelCount: 921_600
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("applied/skipped native overlay proof");
  });

  it("blocks native runtime claims when retained manifests report subtitle overlays as generic text", () => {
    writeBundle({
      summary: {
        nativeCompositionNativeOverlayCount: 4,
        nativeCompositionTextOverlayCount: 2,
        nativeCompositionCaptionOverlayCount: 1,
        nativeCompositionChatOverlayCount: 1,
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeCompositionAppliedCount: 4,
            nativeRuntimeCompositionAppliedKinds: ["chat", "pngtuber", "text", "text"],
            nativeRuntimeCompositionSkippedCount: 0,
            nativeRuntimeStillImageAssetCount: 1,
            nativeRuntimeStillImageAssetLoadedCount: 1,
            nativeRuntimeStillImageAssetMissingCount: 0,
            nativeRuntimeStillImageAssetDecodedCount: 1,
            nativeRuntimeStillImageAssetDecodedPixelCount: 921_600,
            nativeRuntimeStillImageAssetCompositedCount: 1,
            nativeRuntimeStillImageAssetCompositedPixelCount: 921_600
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("applied/skipped native overlay proof");
  });

  it("blocks native runtime claims when retained VRM manifests lack renderer proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeVrmSourceCount: 1,
            nativeRuntimeVrmPosePayloadCount: 1,
            nativeRuntimeVrmActivePoseCount: 1,
            nativeRuntimeVrmRendererStatus: "unavailable",
            nativeRuntimeVrmModelLoadedCount: 1,
            nativeRuntimeVrmRenderedSourceCount: 0,
            nativeRuntimeVrmRenderMissingCount: 1
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("production VRM renderer/backend/model geometry/texture/pose proof");
  });

  it("blocks native runtime claims when retained VRM manifests use a non-production renderer backend", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeVrmSourceCount: 1,
            nativeRuntimeVrmPosePayloadCount: 1,
            nativeRuntimeVrmActivePoseCount: 1,
            nativeRuntimeVrmMissingPoseCount: 0,
            nativeRuntimeVrmRendererStatus: "ready",
            nativeRuntimeVrmRendererBackend: "native-test",
            nativeRuntimeVrmModelLoadedCount: 1,
            nativeRuntimeVrmHumanoidBoneCount: 55,
            nativeRuntimeVrmExpressionCount: 8,
            nativeRuntimeVrmMeshPrimitiveCount: 4,
            nativeRuntimeVrmSkinnedMeshPrimitiveCount: 4,
            nativeRuntimeVrmSkinJointCount: 55,
            nativeRuntimeVrmPositionAccessorCount: 4,
            nativeRuntimeVrmVertexCount: 12_480,
            nativeRuntimeVrmBoundsAccessorCount: 4,
            nativeRuntimeVrmSkinningAttributePrimitiveCount: 4,
            nativeRuntimeVrmTrianglePrimitiveCount: 4,
            nativeRuntimeVrmUnsupportedPrimitiveModeCount: 0,
            nativeRuntimeVrmTexcoordAccessorCount: 4,
            nativeRuntimeVrmMaterialCount: 3,
            nativeRuntimeVrmTextureCount: 3,
            nativeRuntimeVrmImageCount: 3,
            nativeRuntimeVrmUnsupportedImageMimeCount: 0,
            nativeRuntimeVrmPoseBoneUnsupportedCount: 0,
            nativeRuntimeVrmPoseExpressionUnsupportedCount: 0,
            nativeRuntimeVrmRenderedSourceCount: 1,
            nativeRuntimeVrmRenderMissingCount: 0,
            nativeRuntimeVrmRenderFailureCount: 0
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("production VRM renderer/backend/model geometry/texture/pose proof");
  });

  it("blocks native runtime claims when retained VRM manifests lack model geometry or texture proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            nativeRuntimeVrmSourceCount: 1,
            nativeRuntimeVrmPosePayloadCount: 1,
            nativeRuntimeVrmActivePoseCount: 1,
            nativeRuntimeVrmMissingPoseCount: 0,
            nativeRuntimeVrmRendererStatus: "ready",
            nativeRuntimeVrmRendererBackend: "metal",
            nativeRuntimeVrmModelLoadedCount: 1,
            nativeRuntimeVrmHumanoidBoneCount: 55,
            nativeRuntimeVrmExpressionCount: 8,
            nativeRuntimeVrmMeshPrimitiveCount: 4,
            nativeRuntimeVrmSkinnedMeshPrimitiveCount: 4,
            nativeRuntimeVrmSkinJointCount: 55,
            nativeRuntimeVrmPositionAccessorCount: 4,
            nativeRuntimeVrmVertexCount: 12_480,
            nativeRuntimeVrmBoundsAccessorCount: 0,
            nativeRuntimeVrmSkinningAttributePrimitiveCount: 4,
            nativeRuntimeVrmTrianglePrimitiveCount: 4,
            nativeRuntimeVrmUnsupportedPrimitiveModeCount: 0,
            nativeRuntimeVrmTexcoordAccessorCount: 0,
            nativeRuntimeVrmMaterialCount: 0,
            nativeRuntimeVrmTextureCount: 0,
            nativeRuntimeVrmImageCount: 3,
            nativeRuntimeVrmUnsupportedImageMimeCount: 0,
            nativeRuntimeVrmPoseBoneUnsupportedCount: 0,
            nativeRuntimeVrmPoseExpressionUnsupportedCount: 0,
            nativeRuntimeVrmRenderedSourceCount: 1,
            nativeRuntimeVrmRenderMissingCount: 0,
            nativeRuntimeVrmRenderFailureCount: 0
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("production VRM renderer/backend/model geometry/texture/pose proof");
  });

  it("blocks monitor-hold claims when retained manifests lack stable duration proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { monitorHoldDurationSeconds: 59 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("stable duration, sample count");
  });

  it("blocks monitor-hold claims when retained manifests lack bitrate or FPS telemetry proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            monitorHoldAverageBitrateKbps: 0,
            monitorHoldMinimumBitrateKbps: 0,
            monitorHoldAverageFps: 0,
            monitorHoldMinimumFps: 0
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("positive bitrate/FPS telemetry");
  });

  it("uses the latest eligible platform row for monitor-hold manifest proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunCount: 3,
        validationEvidenceEligibleRunCount: 3,
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios-older", { createdAt: "2026-06-23T09:00:00.000Z" }),
          manifestRun("ios", "svr1-ios-latest", {
            createdAt: "2026-06-23T10:00:00.000Z",
            monitorHoldDurationSeconds: 59
          }),
          manifestRun("android", "svr1-android", { createdAt: "2026-06-23T10:00:00.000Z" })
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("stable duration, sample count");
  });

  it("blocks manifest count mismatches", () => {
    writeBundle({
      summary: {
        validationEvidenceRunCount: 2,
        validationEvidenceEligibleRunCount: 3,
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios-older", { createdAt: "2026-06-23T09:00:00.000Z", eligible: false, fresh: false }),
          manifestRun("ios", "svr1-ios-latest"),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[FAIL] Validation evidence manifest");
    expect(result.stdout).toContain("Manifest has 3 run(s), but the summary reports 2.");
    expect(result.stdout).toContain("Can release: no");
    expect(result.stdout).not.toContain("release warning");
  });

  it("blocks retained stale runs hidden by summary count tampering", () => {
    writeBundle({
      summary: {
        validationEvidenceRunCount: 3,
        validationEvidenceEligibleRunCount: 2,
        validationEvidenceStaleRunCount: 0,
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios"),
          manifestRun("android", "svr1-android"),
          manifestRun("ios", "svr1-ios-stale", { eligible: false, fresh: false })
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[FAIL] Validation evidence manifest");
    expect(result.stdout).toContain("stale run count summary=0 manifest=1");
    expect(result.stdout).toContain("Can release: no");
  });

  it("blocks retained manifest runs dated after support bundle generation", () => {
    const generatedAt = new Date(Date.now() - 120_000).toISOString();
    writeBundle({
      generatedAt,
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { createdAt: new Date(Date.now() - 60_000).toISOString() }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[FAIL] Validation evidence manifest");
    expect(result.stdout).toContain("manifest run(s) are dated after support bundle generatedAt");
    expect(result.stdout).toContain("Can release: no");
  });

  it("blocks retained manifest runs dated after the verifier time", () => {
    const generatedAt = new Date().toISOString();
    writeBundle({
      generatedAt,
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { createdAt: new Date(Date.now() + 60_000).toISOString() }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[FAIL] Validation evidence manifest");
    expect(result.stdout).toContain("manifest run(s) are dated after the verifier time");
    expect(result.stdout).toContain("Can release: no");
  });

  it("blocks validation build claims not backed by latest manifest rows", () => {
    writeBundle({
      summary: {
        validationEvidenceConsistentAppBuild: "rc-1",
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { appBuild: "rc-2" }),
          manifestRun("android", "svr1-android", { appBuild: "rc-2" })
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[FAIL] Validation evidence manifest");
    expect(result.stdout).toContain("summary build rc-1 is not backed");
    expect(result.stdout).toContain("Can release: no");
  });

  it("blocks stale retained validation runs", () => {
    writeBundle({
      summary: {
        validationEvidenceRunCount: 3,
        validationEvidenceEligibleRunCount: 2,
        validationEvidenceStaleRunCount: 1,
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios"),
          manifestRun("android", "svr1-android"),
          manifestRun("ios", "svr1-ios-stale", { eligible: false, fresh: false })
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("[FAIL] Physical validation evidence");
    expect(result.stdout).toContain("1 stale retained validation run(s) remain in the bundle.");
    expect(result.stdout).toContain("Can release: no");
    expect(result.stdout).not.toContain("release warning");
  });

  it("keeps monitor-hold manifest failures blocking when manifest count mismatches are present", () => {
    writeBundle({
      summary: {
        validationEvidenceRunCount: 2,
        validationEvidenceEligibleRunCount: 3,
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios-older", { createdAt: "2026-06-23T09:00:00.000Z" }),
          manifestRun("ios", "svr1-ios-latest", {
            createdAt: "2026-06-23T10:00:00.000Z",
            monitorHoldDurationSeconds: 59
          }),
          manifestRun("android", "svr1-android", { createdAt: "2026-06-23T10:00:00.000Z" })
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Can release: no");
    expect(result.stdout).toContain("stable duration, sample count");
    expect(result.stdout).not.toContain("release warning");
  });

  it("blocks monitor-hold claims when retained manifests keep drops or reconnects", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            monitorHoldDroppedFrameIncrease: 1,
            monitorHoldObservedReconnectAttempts: 1
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("zero dropped frames, and zero reconnects");
  });

  it("blocks audio claims when retained manifests lack native monitor write proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { audioNativeMonitorWrittenFrames: 0 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("native monitor write/drop proof");
  });

  it("blocks audio claims when retained manifests keep monitor drops or miss headphone proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            audioNativeMonitorHeadphonesConnected: false,
            audioNativeMonitorDroppedFrames: 1
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("headphone route proof");
  });

  it("blocks audio claims when monitor proof is not routed to headphones", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            audioMonitorHeadphonesOnly: false,
            audioOutputRoute: "speaker",
            audioNativeMonitorRoute: "speaker",
            audioNativeMonitorRouteMatchesOutput: true,
            audioNativeMonitorHeadphonesConnected: false
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("headphone route proof");
  });

  it("blocks audio claims when Bluetooth monitor evidence lacks tuning review", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            audioBluetoothRoute: true,
            audioBluetoothTuningReviewed: false
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("mic/headphone evidence");
  });

  it("blocks audio claims when retained monitor latency lacks a measurement source", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            audioMonitorLatencySource: ""
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("latency source");
  });

  it("blocks Bluetooth audio claims when retained tuning note is missing", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            audioBluetoothRoute: true,
            audioBluetoothTuningReviewed: true,
            audioMonitorTuningNote: ""
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Bluetooth tuning notes");
  });

  it("blocks audio claims when retained monitor latency exceeds the route budget", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            audioMonitorLatencyMs: 260,
            audioMonitorLatencyBudgetMs: 180
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("latency source/budget");
  });

  it("blocks avatar-motion claims when retained manifests keep still-image rig issues", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { faceTrackingRigIssueCount: 1 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("ready high-fidelity PNGTuber rig plus semantic/eye-mouth/horizontal-anchor segment proof");
  });

  it("blocks avatar-motion claims when retained manifests keep low still-image rig quality", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            faceTrackingRigQualityScore: 72,
            faceTrackingRigQualityGrade: "review"
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("ready high-fidelity PNGTuber rig plus semantic/eye-mouth/horizontal-anchor segment proof");
  });

  it("blocks avatar-motion claims when retained manifests keep low still-image high-fidelity rig proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            faceTrackingRigHighFidelityScore: 72,
            faceTrackingRigHighFidelityGrade: "review"
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("ready high-fidelity PNGTuber rig plus semantic/eye-mouth/horizontal-anchor segment proof");
  });

  it("blocks avatar-motion claims when retained manifests keep low semantic segment proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            faceTrackingRigSemanticSegmentScore: 72
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("semantic/eye-mouth/horizontal-anchor segment proof");
  });

  it("blocks avatar-motion claims when retained manifests keep low eye-mouth segment proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            faceTrackingRigEyeMouthSegmentScore: 72
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("semantic/eye-mouth/horizontal-anchor segment proof");
  });

  it("blocks avatar-motion claims when retained manifests keep low horizontal anchor proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            faceTrackingRigHorizontalAnchorScore: 72
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("semantic/eye-mouth/horizontal-anchor segment proof");
  });

  it("blocks avatar-motion claims when retained manifests omit still-image rig quality proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          withoutRigQuality(manifestRun("ios", "svr1-ios")),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("ready high-fidelity PNGTuber rig plus semantic/eye-mouth/horizontal-anchor segment proof");
  });

  it("blocks chat readout claims when retained manifests have no spoken chat success", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { chatReadoutSpokenMessageCount: 0 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("connected platform chat, enabled reader, spoken-message success");
  });

  it("blocks chat readout claims when retained manifests lack connected platform chat proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { chatReadoutConnectionPhase: "idle" }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("connected platform chat, enabled reader, spoken-message success");
  });

  it("blocks chat readout claims when retained manifests keep speech failures", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { chatReadoutSpeechFailureCount: 1 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("connected platform chat, enabled reader, spoken-message success");
  });

  it("blocks retained manifests without controlled weak-network quality automation proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            qualityAutomationLiveUpdateCount: 0,
            qualityAutomationNextTargetCount: 0
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("controlled weak-network quality automation evidence for iOS");
  });

  it("blocks quality automation proof retained under a normal network profile", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { networkProfile: "private test" }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("controlled weak-network quality automation evidence for iOS");
  });

  it("blocks platform dashboard claims when retained manifests lack destination identity proof", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { platformPublishingYoutubeHasBroadcastId: false }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("YouTube identity/state/privacy/bound-stream proof");
  });

  it("blocks YouTube platform dashboard claims when retained privacy proof mismatches the profile", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { platformPublishingYoutubeBroadcastPrivacyStatus: "private" }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("YouTube identity/state/privacy/bound-stream proof");
  });

  it("blocks YouTube platform dashboard claims when retained bound-stream proof mismatches the profile", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { platformPublishingYoutubeBoundStreamId: "other-stream" }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("YouTube identity/state/privacy/bound-stream proof");
  });

  it("blocks Twitch platform dashboard claims when retained manifests lack channel metadata proof", () => {
    writeBundle({
      profile: {
        androidPublisherMode: "mediacodec",
        destination: {
          platform: "twitch",
          protocol: "rtmps"
        }
      },
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            targetPlatform: "Twitch",
            platformPublishingPlatform: "twitch",
            platformPublishingTwitchLiveStatus: "live",
            platformPublishingTwitchStartedAt: "2026-06-23T10:58:00.000Z",
            platformPublishingTwitchHasCategoryId: true,
            platformPublishingTwitchViewerCount: 1
          }),
          manifestRun("android", "svr1-android", {
            targetPlatform: "Twitch",
            platformPublishingPlatform: "twitch",
            platformPublishingTwitchLiveStatus: "live",
            platformPublishingTwitchStartedAt: "2026-06-23T10:58:00.000Z",
            platformPublishingTwitchHasCategoryId: true,
            platformPublishingTwitchViewerCount: 1
          })
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Twitch dashboard status and Twitch title/category/language metadata");
  });

  it("blocks support bundles that still select the RootEncoder compatibility publisher", () => {
    writeBundle({
      profile: {
        androidPublisherMode: "rootencoder",
        destination: {
          platform: "youtube-live",
          protocol: "rtmps"
        }
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Android publisher mode");
    expect(result.stdout).toContain("rootencoder");
  });

  it("blocks support bundles whose Android validation manifest used the RootEncoder compatibility publisher", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios"),
          manifestRun("android", "svr1-android", { androidPublisherMode: "rootencoder" })
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Android validation manifest row");
    expect(result.stdout).toContain("rootencoder");
  });

  it("blocks platform dashboard claims when retained manifests keep unhealthy destination state", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { platformPublishingYoutubeHealthIssueCount: 1 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("fresh checked-at proof");
  });

  it("blocks platform dashboard claims when retained manifests keep stale freshness age", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { platformPublishingFreshnessAgeMinutes: 11 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("fresh checked-at proof");
  });

  it("blocks fresh platform publishing evidence without checked-at timestamp proof", () => {
    writeBundle({
      summary: {
        platformPublishingFreshnessStatus: "fresh",
        platformPublishingFreshnessCheckedAt: "",
        platformPublishingFreshnessAgeMinutes: 1,
        platformPublishingFreshnessSummary: "YouTube dashboard status was checked 1 minutes ago.",
        platformPublishingFreshnessRecommendation: "Refresh YouTube status within 10 minutes of release approval."
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Platform publishing freshness");
  });

  it("blocks fresh platform publishing evidence checked after the verifier time", () => {
    const generatedAt = new Date().toISOString();
    writeBundle({
      generatedAt,
      summary: {
        platformPublishingFreshnessStatus: "fresh",
        platformPublishingFreshnessCheckedAt: new Date(Date.now() + 60_000).toISOString(),
        platformPublishingFreshnessAgeMinutes: 0,
        platformPublishingFreshnessSummary: "YouTube dashboard status was checked 0 minutes ago.",
        platformPublishingFreshnessRecommendation: "Refresh YouTube status within 10 minutes of release approval."
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Platform publishing freshness");
  });

  it("blocks first-party platform dashboard manifests marked not-applicable", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            platformPublishingFreshnessStatus: "not-applicable",
            platformPublishingFreshnessAgeMinutes: null,
            platformPublishingCheckedAt: ""
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("fresh checked-at proof");
  });

  it("blocks same-run platform ingest claims when retained manifests lack native send proof", () => {
    writeBundle({
      summary: {
        validationEvidenceNativeRuntimeIosPass: false,
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { nativeRuntimeSentVideoFrames: 0 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("same-run native send telemetry");
  });

  it("blocks same-run platform ingest claims when Android compositor proof is missing", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios"),
          manifestRun("android", "svr1-android", { nativeRuntimeCompositorBackend: "none" })
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("native publisher/compositor overlay telemetry");
  });

  it("blocks same-run platform ingest claims when dashboard timing does not match the retained run", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", {
            platformPublishingCheckedAt: "2026-06-23T10:30:00.000Z",
            platformPublishingFreshnessAgeMinutes: 1
          }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("same-run native send telemetry");
  });

  it("blocks same-run platform ingest claims when retained observed dashboard age is inconsistent", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { platformPublishingObservedAgeMinutes: 7 }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("same-run native send telemetry");
  });

  it("blocks release when the launch rehearsal is not ready", () => {
    writeBundle({
      summary: {
        rehearsalStatus: "needs-run",
        rehearsalCanPromoteToPublic: false,
        rehearsalSummary: "Rehearsal still needs 2 checks.",
        rehearsalPrimaryAction: "Start a private rehearsal stream.",
        rehearsalPendingCount: 2
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Launch rehearsal");
    expect(result.stdout).toContain("Rehearsal still needs 2 checks.");
  });

  it("blocks release when a ready launch rehearsal carries a low score", () => {
    writeBundle({
      summary: {
        rehearsalScore: 82,
        rehearsalGrade: "C",
        rehearsalWeakAreaCount: 1
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Launch rehearsal");
    expect(result.stdout).toContain("Launch rehearsal score is 82/100 grade C.");
  });


  it("blocks manifest rows marked in-scope for another destination", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { targetPlatform: "Twitch" }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("current destination scope YouTube Live/RTMPS");
  });

  it("blocks manifest rows marked in-scope for another RTMP transport", () => {
    writeBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun("ios", "svr1-ios", { transport: "rtmp" }),
          manifestRun("android", "svr1-android")
        ]
      }
    });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("current destination scope YouTube Live/RTMPS");
  });

  it("rejects symlinked support bundles before reading linked targets", () => {
    const outsideBundlePath = ".artifacts/verify-commercial-release-bundle-test/outside-support-bundle.json";
    mkdirSync(dirname(fixturePath), { recursive: true });
    writeFileSync(outsideBundlePath, JSON.stringify(createBundle(), null, 2));
    symlinkSync(resolve(outsideBundlePath), fixturePath);

    const result = runVerifier();

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`Support bundle must not be a symbolic link: ${fixturePath}`);
    expect(result.stdout).not.toContain("Can release: yes");
  });

  it("rejects dangling symlinked support bundles", () => {
    const missingBundlePath = ".artifacts/verify-commercial-release-bundle-test/missing-support-bundle.json";
    mkdirSync(dirname(fixturePath), { recursive: true });
    symlinkSync(resolve(missingBundlePath), fixturePath);

    const result = runVerifier();

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`Support bundle must not be a symbolic link: ${fixturePath}`);
  });

  it("rejects support bundles under symlinked workspace parents", () => {
    const realParent = ".artifacts/verify-commercial-release-bundle-test/real-parent";
    const linkParent = ".artifacts/verify-commercial-release-bundle-test/link-parent";
    const linkedBundlePath = `${linkParent}/support-bundle.json`;
    mkdirSync(realParent, { recursive: true });
    writeFileSync(`${realParent}/support-bundle.json`, JSON.stringify(createBundle(), null, 2));
    symlinkSync(resolve(realParent), linkParent, "dir");

    const result = runVerifier(linkedBundlePath);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`Support bundle path parent must not be a symbolic link: ${linkParent}`);
    expect(result.stdout).not.toContain("Can release: yes");
  });

  it("rejects support bundle paths that point to directories", () => {
    mkdirSync(fixturePath, { recursive: true });

    const result = runVerifier();

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`Support bundle must point to a file: ${fixturePath}`);
  });
});

const runVerifier = (path = fixturePath) =>
  spawnSync(process.execPath, ["scripts/verify-commercial-release-bundle.mjs", path, "--max-age-hours=24"], {
    encoding: "utf8"
  });

const writeBundle = (patch = {}) => {
  mkdirSync(dirname(fixturePath), { recursive: true });
  writeFileSync(fixturePath, JSON.stringify(createBundle(patch), null, 2));
};

const sessionDiagnostics = ({ historySummary = {}, lastSummary = null } = {}) => ({
  events: [],
  summaries: [],
  historySummary: {
    totalSessions: 1,
    cleanCount: 1,
    warningCount: 0,
    failureCount: 0,
    cleanRate: 100,
    averageDurationSeconds: 300,
    totalWarningEvents: 0,
    totalFailureEvents: 0,
    totalRecoveryEvents: 0,
    totalPlatformApiEvents: 0,
    totalPlatformApiFailures: 0,
    totalQualityEvents: 0,
    totalQualityLiveUpdates: 0,
    totalQualityNextTargets: 0,
    totalQualityUpdateFailures: 0,
    totalChatEvents: 0,
    totalChatReconnectEvents: 0,
    totalChatReconnectFailures: 0,
    totalChatSpeechStarted: 0,
    totalChatSpeechSpoken: 0,
    totalChatSpeechFailures: 0,
    stability: "watch",
    summary: "Recent stream history needs watch: 100% clean across 1 sessions.",
    recommendation: "Capture at least three clean sessions before treating this setup as a baseline.",
    ...historySummary
  },
  lastSummary: lastSummary
    ? {
        id: "session-1",
        startedAt: "2026-06-23T11:00:00.000Z",
        endedAt: "2026-06-23T11:05:00.000Z",
        endReason: "stopped",
        outcome: "clean",
        durationSeconds: 300,
        eventCount: 0,
        warningCount: 0,
        failureCount: 0,
        recoveryEventCount: 0,
        operationFailureCount: 0,
        platformApiEventCount: 0,
        platformApiFailureCount: 0,
        qualityEventCount: 0,
        qualityLiveUpdateCount: 0,
        qualityNextTargetCount: 0,
        qualityUpdateFailureCount: 0,
        chatEventCount: 0,
        chatReconnectEventCount: 0,
        chatReconnectFailureCount: 0,
        chatSpeechStartedCount: 0,
        chatSpeechSpokenCount: 0,
        chatSpeechFailureCount: 0,
        summary: "Clean session.",
        recommendation: "Keep this profile as a known-good baseline.",
        ...lastSummary
      }
    : null
});

const createBundle = (patch = {}) => {
  const generatedAt = patch.generatedAt ?? new Date().toISOString();
  const generatedAtMs = Date.parse(String(generatedAt));
  const platformPublishingFreshnessCheckedAt = Number.isFinite(generatedAtMs)
    ? new Date(generatedAtMs - 60_000).toISOString()
    : "2026-06-23T11:29:00.000Z";
  const summary = {
    preflightStatus: "ready",
    publicLaunchStatus: "ready",
    publicLaunchCanStart: true,
    publicLaunchWarningCount: 0,
    publicLaunchFailCount: 0,
    publicLaunchStartLockBlocked: false,
    publicLaunchStartLockSummary: "Public start lock is clear.",
    publicLaunchStartLockAction: "Go Live while dashboard freshness remains current.",
    publicLaunchConfirmationEventCount: 0,
    publicLaunchLastConfirmationStatus: "none",
    publicLaunchLastConfirmationAt: null,
    publicLaunchLastConfirmationMessage: "",
    sceneFingerprint: "scene1-ready",
    textOverlayStatus: "pass",
    textOverlaySourceCount: 2,
    textOverlayVisibleSourceCount: 2,
    textOverlayManualSourceCount: 2,
    textOverlayVisibleManualSourceCount: 2,
    textOverlayRuntimeCaptionSourceCount: 0,
    textOverlayVisibleRuntimeCaptionSourceCount: 0,
    textOverlayRenderVisibleSourceCount: 2,
    textOverlayActiveTimedManualSourceCount: 0,
    textOverlayQueuedTimedManualSourceCount: 0,
    textOverlayExpiredTimedManualSourceCount: 0,
    textOverlayPersistentManualSourceCount: 2,
    textOverlayEmptyVisibleManualSourceCount: 0,
    textOverlayTransparentVisibleSourceCount: 1,
    textOverlaySensitiveContentIssueCount: 0,
    textOverlayDominantBackdropIssueCount: 0,
    textOverlayLayoutRiskIssueCount: 0,
    textOverlaySafeAreaIssueCount: 0,
    textOverlayAvatarOverlapIssueCount: 0,
    textOverlaySummary: "2/2 text overlays on program output.",
    textOverlayRecommendation: "Keep text overlays unchanged.",
    chatOverlayStatus: "pass",
    chatOverlaySourceCount: 1,
    chatOverlayVisibleSourceCount: 1,
    chatOverlayTransparentVisibleSourceCount: 1,
    chatOverlayUrlRedactionDisabledCount: 0,
    chatOverlayOpaqueBackgroundIssueCount: 0,
    chatOverlayLayoutRiskIssueCount: 0,
    chatOverlaySafeAreaIssueCount: 0,
    chatOverlayAvatarOverlapIssueCount: 0,
    chatOverlaySummary: "1/1 chat overlay visible.",
    chatOverlayRecommendation: "Keep chat overlay settings unchanged.",
    nativeCompositionNativeOverlayCount: 4,
    nativeCompositionStillImageOverlayCount: 1,
    nativeCompositionTextOverlayCount: 2,
    nativeCompositionCaptionOverlayCount: 1,
    nativeCompositionChatOverlayCount: 1,
    liveCaptionStatus: "info",
    liveCaptionEnabled: false,
    liveCaptionRecognitionStatus: "unavailable",
    liveCaptionRuntimeSourceCount: 0,
    liveCaptionVisibleRuntimeSourceCount: 0,
    liveCaptionActiveCueCount: 0,
    liveCaptionFinalCueCount: 0,
    liveCaptionTranscriptCount: 0,
    liveCaptionSummary: "Live captions are disabled.",
    liveCaptionRecommendation: "Enable live captions when subtitles are part of the launch plan.",
    launchBlockCount: 0,
    launchWarningCount: 0,
    validationStatus: "ready",
    validationWarningCount: 0,
    validationFailCount: 0,
    validationPendingCount: 0,
    validationRunbookStatus: "complete",
    validationRunbookNextAction: "Archive this support bundle.",
    rehearsalStatus: "ready",
    rehearsalCanPromoteToPublic: true,
    rehearsalScore: 100,
    rehearsalGrade: "A",
    rehearsalWeakAreaCount: 0,
    rehearsalSummary: "Rehearsal is ready to promote to a platform-visible launch.",
    rehearsalPrimaryAction: "Export a support bundle and keep the rehearsed profile unchanged.",
    rehearsalPendingCount: 0,
    rehearsalWarningCount: 0,
    rehearsalFailCount: 0,
    validationEvidenceStatus: "ready",
    validationEvidenceFingerprint: "sve1-ready",
    validationEvidenceLatestRunFingerprint: "svr1-android",
    validationEvidenceRunCount: 2,
    validationEvidenceEligibleRunCount: 2,
    validationEvidenceStaleRunCount: 0,
    validationEvidenceIosPass: true,
    validationEvidenceAndroidPass: true,
    validationEvidencePhysicalDeviceIosPass: true,
    validationEvidencePhysicalDeviceAndroidPass: true,
    validationEvidenceAppBuildMismatch: false,
    validationEvidenceConsistentAppBuild: "rc-1",
    validationEvidenceNativeRuntimeIosPass: true,
    validationEvidenceNativeRuntimeAndroidPass: true,
    validationEvidenceMonitorHoldIosPass: true,
    validationEvidenceMonitorHoldAndroidPass: true,
    validationEvidenceFaceTrackingIosPass: true,
    validationEvidenceFaceTrackingAndroidPass: true,
    validationEvidenceAudioIosPass: true,
    validationEvidenceAudioAndroidPass: true,
    validationEvidenceChatReadoutIosPass: true,
    validationEvidenceChatReadoutAndroidPass: true,
    validationEvidencePlatformPublishingIosPass: true,
    validationEvidencePlatformPublishingAndroidPass: true,
    validationEvidencePlatformIngestIosPass: true,
    validationEvidencePlatformIngestAndroidPass: true,
    platformPublishingFreshnessStatus: "fresh",
    platformPublishingFreshnessCheckedAt,
    platformPublishingFreshnessAgeMinutes: 1,
    platformPublishingFreshnessSummary: "YouTube dashboard status was checked 1 minutes ago.",
    platformPublishingFreshnessRecommendation: "Keep this fresh dashboard snapshot with the release-candidate validation run.",
    validationEvidenceRunManifest: [
      manifestRun("ios", "svr1-ios"),
      manifestRun("android", "svr1-android")
    ]
  };

  return {
    app: {
      name: "MobileLiveCaster",
      reportVersion: 1,
      bundleVersion: 55
    },
    generatedAt,
    profile: {
      androidPublisherMode: "mediacodec",
      destination: {
        platform: "youtube-live",
        protocol: "rtmps"
      },
      platformPublishing: {
        privacyStatus: "public",
        youtubeBroadcastBoundStreamId: "stream-1"
      }
    },
    scene: {
      fingerprint: "scene1-ready"
    },
    ...patch,
    summary: {
      ...summary,
      ...(patch.summary ?? {})
    }
  };
};

const manifestRun = (devicePlatform, fingerprint, patch = {}) => ({
  id: `validation-${devicePlatform}`,
  fingerprint,
  createdAt: "2026-06-23T11:00:00.000Z",
  ageDays: 0,
  fresh: true,
  matchesScope: true,
  eligible: true,
  devicePlatform,
  androidPublisherMode: devicePlatform === "android" ? "mediacodec" : null,
  deviceName: devicePlatform === "ios" ? "iPhone 15 Pro" : "Pixel 8 Pro",
  osVersion: devicePlatform === "ios" ? "iOS 18.5" : "Android 15",
  physicalDevice: true,
  physicalDeviceStatus: "pass",
  appBuild: "rc-1",
  networkProfile: "controlled weak-network throttle 2mbps",
  sceneFingerprint: "scene1-ready",
  targetPlatform: "YouTube Live",
  transport: "rtmps",
  result: "pass",
  nativeRuntimePlatform: devicePlatform,
  nativeRuntimeStatus: "pass",
  nativeRuntimeVideoEncoderBackend: devicePlatform === "ios" ? "videotoolbox-h264" : "mediacodec-h264",
  nativeRuntimeAudioEncoderBackend: devicePlatform === "ios" ? "audiotoolbox-aac" : "mediacodec-aac",
  nativeRuntimeCongested: false,
  nativeRuntimeQueuedItems: 0,
  nativeRuntimeCacheSize: 0,
  nativeRuntimeDroppedVideoFrames: 0,
  nativeRuntimeDroppedAudioFrames: 0,
  nativeRuntimeCompositionStatus: "applied",
  nativeRuntimeCompositionAppliedCount: 4,
  nativeRuntimeCompositionAppliedKinds: ["caption", "chat", "pngtuber", "text"],
  nativeRuntimeCompositionSkippedCount: 0,
  nativeRuntimeCompositionSkippedKinds: [],
  nativeRuntimeSentVideoFrames: 120,
  nativeRuntimeSentAudioFrames: 190,
  nativeRuntimeBytesWritten: 2_200_000,
  nativeRuntimeVideoFrameIntervalSampleCount: 119,
  nativeRuntimeVideoFrameIntervalAverageMs: 33.3,
  nativeRuntimeVideoFrameIntervalMaxMs: 42,
  nativeRuntimeVideoFrameIntervalJitterMs: 8.7,
  nativeRuntimeStillImageAssetCount: 1,
  nativeRuntimeStillImageAssetLoadedCount: 1,
  nativeRuntimeStillImageAssetMissingCount: 0,
  nativeRuntimeStillImageAssetDecodedCount: 1,
  nativeRuntimeStillImageAssetDecodedPixelCount: 921_600,
  nativeRuntimeStillImageAssetCompositedCount: 1,
  nativeRuntimeStillImageAssetCompositedPixelCount: 921_600,
  nativeRuntimeCompositorBackend: devicePlatform === "android" ? "android-canvas-mediacodec" : "ios-replaykit-coregraphics",
  nativeRuntimeCompositedFrameCount: 120,
  nativeRuntimeDroppedFrameCount: 0,
  nativeRuntimeCompositionFailureCount: 0,
  nativeRuntimeLiveRenderGraphReloadCount: 0,
  nativeRuntimeLiveRenderGraphRejectedUpdateCount: 0,
  nativeRuntimeStillImageAssetAppGroupCount: devicePlatform === "ios" ? 1 : 0,
  nativeRuntimeStillImageAssetAppGroupLoadedCount: devicePlatform === "ios" ? 1 : 0,
  nativeRuntimeStillImageAssetAppGroupDecodedCount: devicePlatform === "ios" ? 1 : 0,
  nativeRuntimeStillImageAssetAppGroupDecodedPixelCount: devicePlatform === "ios" ? 921_600 : 0,
  nativeRuntimeStillImageAssetAppGroupCompositedCount: devicePlatform === "ios" ? 1 : 0,
  nativeRuntimeStillImageAssetAppGroupCompositedPixelCount: devicePlatform === "ios" ? 921_600 : 0,
  nativeRuntimeVrmSourceCount: 0,
  nativeRuntimeVrmPosePayloadCount: 0,
  nativeRuntimeVrmActivePoseCount: 0,
  nativeRuntimeVrmMissingPoseCount: 0,
  nativeRuntimeVrmRendererStatus: "not-required",
  nativeRuntimeVrmRendererBackend: "none",
  nativeRuntimeVrmModelLoadedCount: 0,
  nativeRuntimeVrmModelVersions: [],
  nativeRuntimeVrmHumanoidBoneCount: 0,
  nativeRuntimeVrmExpressionCount: 0,
  nativeRuntimeVrmMeshPrimitiveCount: 0,
  nativeRuntimeVrmSkinnedMeshPrimitiveCount: 0,
  nativeRuntimeVrmSkinJointCount: 0,
  nativeRuntimeVrmPositionAccessorCount: 0,
  nativeRuntimeVrmVertexCount: 0,
  nativeRuntimeVrmIndexCount: 0,
  nativeRuntimeVrmBoundsAccessorCount: 0,
  nativeRuntimeVrmSkinningAttributePrimitiveCount: 0,
  nativeRuntimeVrmTrianglePrimitiveCount: 0,
  nativeRuntimeVrmUnsupportedPrimitiveModeCount: 0,
  nativeRuntimeVrmNormalAccessorCount: 0,
  nativeRuntimeVrmTexcoordAccessorCount: 0,
  nativeRuntimeVrmMorphTargetCount: 0,
  nativeRuntimeVrmMaterialCount: 0,
  nativeRuntimeVrmTextureCount: 0,
  nativeRuntimeVrmImageCount: 0,
  nativeRuntimeVrmUnsupportedImageMimeCount: 0,
  nativeRuntimeVrmTransparentMaterialCount: 0,
  nativeRuntimeVrmPoseBoneCount: 0,
  nativeRuntimeVrmPoseBoneAppliedCount: 0,
  nativeRuntimeVrmPoseBoneUnsupportedCount: 0,
  nativeRuntimeVrmPoseExpressionCount: 0,
  nativeRuntimeVrmPoseExpressionAppliedCount: 0,
  nativeRuntimeVrmPoseExpressionUnsupportedCount: 0,
  nativeRuntimeVrmRenderedSourceCount: 0,
  nativeRuntimeVrmRenderMissingCount: 0,
  nativeRuntimeVrmRenderFailureCount: 0,
  monitorHoldStatus: "pass",
  monitorHoldSampleCount: 3,
  monitorHoldDurationSeconds: 65,
  monitorHoldStability: "stable",
  monitorHoldAverageBitrateKbps: 4_400,
  monitorHoldMinimumBitrateKbps: 4_100,
  monitorHoldAverageFps: 29.8,
  monitorHoldMinimumFps: 29.2,
  monitorHoldDroppedFrameIncrease: 0,
  monitorHoldObservedReconnectAttempts: 0,
  faceTrackingStatus: "pass",
  faceTrackingRuntimeFresh: true,
  faceTrackingRuntimeAgeMs: 120,
  faceTrackingFaceLandmarkConfidence: 0.82,
  faceTrackingFaceLandmarkReady: true,
  faceTrackingLandmarkMotionScale: 0.892,
  faceTrackingFaceControlScale: 0.892,
  faceTrackingPreparedPngTuberCount: 1,
  faceTrackingVisibleVrmCount: 0,
  faceTrackingNativeVrmRendererReady: false,
  faceTrackingActiveMotionCount: 1,
  faceTrackingRigIssueCount: 0,
  faceTrackingRigQualityScore: 100,
  faceTrackingRigQualityGrade: "ready",
  faceTrackingRigPartSeparationScore: 100,
  faceTrackingRigDepthContinuityScore: 100,
  faceTrackingRigSemanticSegmentScore: 100,
  faceTrackingRigEyeMouthSegmentScore: 100,
  faceTrackingRigHorizontalAnchorScore: 100,
  faceTrackingRigHighFidelityScore: 100,
  faceTrackingRigHighFidelityGrade: "ready",
  audioStatus: "pass",
  audioOutputRoute: "wired-headphones",
  audioMonitorHeadphonesOnly: true,
  audioNativeMonitorRoute: "wired-headphones",
  audioNativeMonitorRouteMatchesOutput: true,
  audioNativeMonitorHeadphonesConnected: true,
  audioNativeMonitorWrittenFrames: 24576,
  audioNativeMonitorDroppedFrames: 0,
  audioNativeMonitorWrittenBuffers: 48,
  audioNativeMonitorDroppedBuffers: 0,
  audioMonitorLatencyStatus: "pass",
  audioMonitorLatencyMs: 92,
  audioMonitorLatencyBudgetMs: 180,
  audioMonitorLatencySource: "native-route-monitor",
  audioMonitorTuningNote: "Wired monitor route measured under release load.",
  audioBluetoothRoute: false,
  audioBluetoothTuningReviewed: false,
  chatReadoutStatus: "pass",
  chatReadoutPlatformChatEnabled: true,
  chatReadoutReaderEnabled: true,
  chatReadoutConnectionPhase: "connected",
  chatReadoutConnectionLabel: "Connected",
  chatReadoutSpokenMessageCount: 1,
  chatReadoutSpeechFailureCount: 0,
  qualityAutomationStatus: "pass",
  qualityAutomationLiveUpdateCount: 1,
  qualityAutomationNextTargetCount: 0,
  qualityAutomationFailureCount: 0,
  platformPublishingPlatform: "youtube-live",
  platformPublishingStatus: "pass",
  platformPublishingFreshnessStatus: "fresh",
  platformPublishingCheckedAt: "2026-06-23T10:59:00.000Z",
  platformPublishingFreshnessAgeMinutes: 1,
  platformPublishingObservedAgeMinutes: 1,
  platformPublishingYoutubeHasBroadcastId: true,
  platformPublishingYoutubeHasStreamId: true,
  platformPublishingYoutubeBroadcastStatus: "live",
  platformPublishingYoutubeBoundStreamId: "stream-1",
  platformPublishingYoutubeBroadcastPrivacyStatus: "public",
  platformPublishingYoutubeStreamStatus: "active",
  platformPublishingYoutubeHealthStatus: "ok",
  platformPublishingYoutubeHealthIssueCount: 0,
  platformPublishingTwitchLiveStatus: "",
  platformPublishingTwitchStartedAt: "",
  platformPublishingTwitchHasCategoryId: false,
  platformPublishingTwitchChannelTitle: "",
  platformPublishingTwitchChannelCategory: "",
  platformPublishingTwitchChannelCategoryId: "",
  platformPublishingTwitchChannelLanguage: "",
  platformPublishingTwitchViewerCount: 0,
  summary: "Validation run retained.",
  recommendation: "Keep this run with release evidence.",
  ...patch
});

const withoutRigIssueCount = (run) => {
  const { faceTrackingRigIssueCount: _faceTrackingRigIssueCount, ...rest } = run;
  return rest;
};

const withoutRigQuality = (run) => {
  const {
    faceTrackingRigQualityScore: _faceTrackingRigQualityScore,
    faceTrackingRigQualityGrade: _faceTrackingRigQualityGrade,
    faceTrackingRigPartSeparationScore: _faceTrackingRigPartSeparationScore,
    faceTrackingRigDepthContinuityScore: _faceTrackingRigDepthContinuityScore,
    faceTrackingRigSemanticSegmentScore: _faceTrackingRigSemanticSegmentScore,
    faceTrackingRigEyeMouthSegmentScore: _faceTrackingRigEyeMouthSegmentScore,
    faceTrackingRigHorizontalAnchorScore: _faceTrackingRigHorizontalAnchorScore,
    faceTrackingRigHighFidelityScore: _faceTrackingRigHighFidelityScore,
    faceTrackingRigHighFidelityGrade: _faceTrackingRigHighFidelityGrade,
    ...rest
  } = run;
  return rest;
};
