import { describe, expect, it } from "vitest";
import {
  createCommercialReleaseGate,
  formatCommercialReleaseGate
} from "./commercialReleaseGate";
import type { SupportBundle } from "./supportBundle";

const now = new Date("2026-06-23T12:00:00.000Z");

describe("commercial release gate", () => {
  it("passes a fresh support bundle with complete release evidence", () => {
    const bundle = supportBundle();
    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("ready");
    expect(gate.canRelease).toBe(true);
    expect(gate.issueCounts).toEqual({ warningCount: 0, failureCount: 0 });
    expect(gate.sceneFingerprint).toBe("scene1-ready");
    expect(gate.evidenceFingerprint).toBe("sve1-ready");
    expect(gate.latestRunFingerprint).toBe("svr1-android");
    expect(formatCommercialReleaseGate(gate)).toContain("Can release: yes");
    expect(formatCommercialReleaseGate(gate)).toContain("Scene fingerprint: scene1-ready");
  });

  it("blocks support bundles without public launch confirmation summary evidence", () => {
    const bundle = supportBundle();
    delete (bundle.summary as Partial<SupportBundle["summary"]>).publicLaunchConfirmationEventCount;
    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "public-launch-confirmation-evidence"
      })
    );
  });

  it("blocks v54 support bundles because native caption overlay proof requires v55", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        app: {
          name: "MobileLiveCaster",
          reportVersion: 1,
          bundleVersion: 54
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "bundle-version",
        detail: "Support bundle v54 is older than the required v55."
      })
    );
  });

  it("blocks v55 support bundles without scene fingerprint evidence", () => {
    const bundle = supportBundle();
    delete (bundle.summary as Partial<SupportBundle["summary"]>).sceneFingerprint;
    delete (bundle.scene as Partial<SupportBundle["scene"]>).fingerprint;
    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "scene-fingerprint-missing"
      })
    );
  });

  it("blocks v55 support bundles with mismatched scene fingerprints", () => {
    const bundle = supportBundle({
      summary: {
        sceneFingerprint: "scene1-summary"
      }
    });
    bundle.scene.fingerprint = "scene1-scene";
    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "scene-fingerprint-mismatch"
      })
    );
  });

  it("blocks v55 support bundles when retained validation runs are from another scene", () => {
    const bundle = supportBundle({
      summary: {
        validationEvidenceRunManifest: [
          manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios", sceneFingerprint: "scene1-other" }),
          manifestRun({ devicePlatform: "android", fingerprint: "svr1-android", sceneFingerprint: "scene1-other" })
        ]
      }
    });
    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-scene-fingerprint"
      })
    );
  });

  it("blocks support bundles without v55 text overlay evidence", () => {
    const bundle = supportBundle();
    delete (bundle.summary as Partial<SupportBundle["summary"]>).textOverlayStatus;
    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "text-overlay-evidence-missing"
      })
    );
  });

  it("blocks support bundles without v55 chat overlay evidence", () => {
    const bundle = supportBundle();
    delete (bundle.summary as Partial<SupportBundle["summary"]>).chatOverlayStatus;
    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "chat-overlay-evidence-missing"
      })
    );
  });

  it("blocks support bundles without v55 live caption evidence", () => {
    const bundle = supportBundle();
    delete (bundle.summary as Partial<SupportBundle["summary"]>).liveCaptionStatus;
    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "live-caption-evidence-missing"
      })
    );
  });

  it("blocks v55 support bundles without native caption overlay summary evidence", () => {
    const bundle = supportBundle();
    delete (bundle.summary as Partial<SupportBundle["summary"]>).nativeCompositionCaptionOverlayCount;
    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "native-caption-overlay-summary-missing"
      })
    );
  });

  it("blocks release when text overlay evidence reports sensitive visible content", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          textOverlayStatus: "fail",
          textOverlaySensitiveContentIssueCount: 1,
          textOverlaySummary: "1 visible text overlay may expose credentials.",
          textOverlayRecommendation: "Remove credentials from visible text overlays before launch."
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "text-overlay-evidence-failed"
      })
    );
  });

  it("blocks release when text overlay evidence still has readability or placement warnings", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          textOverlayStatus: "warn",
          textOverlayLayoutRiskIssueCount: 1,
          textOverlaySummary: "1 visible text overlay may clip or be unreadable on mobile output.",
          textOverlayRecommendation: "Increase the text box before public launch."
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "text-overlay-evidence-incomplete",
        severity: "fail"
      })
    );
  });

  it("blocks release when chat overlay evidence reports layout or transparency risk", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          chatOverlayStatus: "warn",
          chatOverlayOpaqueBackgroundIssueCount: 1,
          chatOverlayLayoutRiskIssueCount: 1,
          chatOverlaySummary: "1 visible chat overlay may clip comments or be unreadable.",
          chatOverlayRecommendation: "Increase the chat box before launch."
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "chat-overlay-evidence-incomplete",
        severity: "fail"
      })
    );
  });

  it("blocks release when enabled live captions still need final cue evidence", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          liveCaptionStatus: "warn",
          liveCaptionEnabled: true,
          liveCaptionRecognitionStatus: "listening",
          liveCaptionFinalCueCount: 0,
          liveCaptionSummary: "Live captions are listening, but no final caption cue has been confirmed in this session.",
          liveCaptionRecommendation: "Speak a short test phrase before public launch."
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "live-caption-evidence-incomplete"
      })
    );
  });

  it("blocks native runtime claims without video frame interval proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              nativeRuntimeVideoFrameIntervalSampleCount: 0,
              nativeRuntimeVideoFrameIntervalAverageMs: 0,
              nativeRuntimeVideoFrameIntervalMaxMs: 0
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity"
      })
    );
  });

  it("blocks native runtime claims without valid live render-graph update counters", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              nativeRuntimeLiveRenderGraphReloadCount: Number.NaN,
              nativeRuntimeLiveRenderGraphRejectedUpdateCount: Number.NaN
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS native runtime proof")
      })
    );
  });

  it("blocks native runtime claims when live render-graph updates were rejected", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              nativeRuntimeLiveRenderGraphReloadCount: 2,
              nativeRuntimeLiveRenderGraphRejectedUpdateCount: 1
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS native runtime proof")
      })
    );
  });

  it("blocks native runtime claims when native compositor dropped frames", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              nativeRuntimeDroppedFrameCount: 1
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS native runtime proof")
      })
    );
  });

  it("blocks native runtime claims when retained manifests show publisher congestion or queued frames", () => {
    const congestedGate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              nativeRuntimeCongested: true
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );
    const queuedGate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              nativeRuntimeQueuedItems: 2,
              nativeRuntimeCacheSize: 8
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );
    const {
      nativeRuntimeCongested: _nativeRuntimeCongested,
      nativeRuntimeQueuedItems: _nativeRuntimeQueuedItems,
      nativeRuntimeCacheSize: _nativeRuntimeCacheSize,
      ...iosRunWithoutPublisherBackpressure
    } = manifestRun({
      devicePlatform: "ios",
      fingerprint: "svr1-ios"
    });
    const missingProofGate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            iosRunWithoutPublisherBackpressure as ValidationManifestRun,
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(congestedGate.status).toBe("blocked");
    expect(congestedGate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS native runtime proof")
      })
    );
    expect(queuedGate.status).toBe("blocked");
    expect(queuedGate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS native runtime proof")
      })
    );
    expect(missingProofGate.status).toBe("blocked");
    expect(missingProofGate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS native runtime proof")
      })
    );
  });

  it("blocks native runtime claims when retained manifests show publisher video or audio drops", () => {
    const droppedVideoGate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              nativeRuntimeDroppedVideoFrames: 1
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );
    const droppedAudioGate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              nativeRuntimeDroppedAudioFrames: 1
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );
    const {
      nativeRuntimeDroppedVideoFrames: _nativeRuntimeDroppedVideoFrames,
      nativeRuntimeDroppedAudioFrames: _nativeRuntimeDroppedAudioFrames,
      ...iosRunWithoutPublisherDrops
    } = manifestRun({
      devicePlatform: "ios",
      fingerprint: "svr1-ios"
    });
    const missingProofGate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            iosRunWithoutPublisherDrops as ValidationManifestRun,
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    for (const gate of [droppedVideoGate, droppedAudioGate, missingProofGate]) {
      expect(gate.status).toBe("blocked");
      expect(gate.issues).toContainEqual(
        expect.objectContaining({
          code: "validation-evidence-manifest-integrity",
          detail: expect.stringContaining("iOS native runtime proof")
        })
      );
    }
  });

  it("blocks iOS native runtime claims without App Group still-image compositor proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              nativeRuntimeStillImageAssetAppGroupCount: 0,
              nativeRuntimeStillImageAssetAppGroupLoadedCount: 0,
              nativeRuntimeStillImageAssetAppGroupDecodedCount: 0,
              nativeRuntimeStillImageAssetAppGroupDecodedPixelCount: 0,
              nativeRuntimeStillImageAssetAppGroupCompositedCount: 0,
              nativeRuntimeStillImageAssetAppGroupCompositedPixelCount: 0
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity"
      })
    );
  });

  it("blocks iOS native runtime claims without ReplayKit compositor frame proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              nativeRuntimeCompositorBackend: "none",
              nativeRuntimeCompositedFrameCount: 0
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity"
      })
    );
  });

  it("blocks stale bundles and incomplete physical validation proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        generatedAt: "2026-06-21T00:00:00.000Z",
        summary: {
          validationEvidenceStatus: "partial",
          validationEvidenceAndroidPass: false,
          validationEvidenceAudioAndroidPass: false,
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios" }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android", eligible: false, result: "warn" })
          ]
        }
      }),
      { now, maxBundleAgeHours: 24 }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "bundle-stale",
        "validation-evidence-not-ready",
        "validation-evidence-coverage",
        "validation-evidence-manifest-incomplete",
        "validation-evidence-feature-gap"
      ])
    );
  });

  it("blocks release when current platform publishing status is stale even if retained evidence is complete", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          platformPublishingFreshnessStatus: "stale",
          platformPublishingFreshnessAgeMinutes: 30,
          platformPublishingFreshnessSummary: "YouTube dashboard status is 30 minutes old.",
          platformPublishingFreshnessRecommendation: "Refresh YouTube status within 10 minutes of release approval."
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "platform-publishing-freshness",
          severity: "fail",
          label: "Platform publishing freshness",
          detail: "YouTube dashboard status is 30 minutes old."
        })
      ])
    );
    expect(formatCommercialReleaseGate(gate)).toContain("Refresh YouTube status within 10 minutes");
  });

  it("blocks stale retained validation runs", () => {
    const bundle = supportBundle({
      summary: {
        validationEvidenceRunCount: 3,
        validationEvidenceStaleRunCount: 1,
        validationEvidenceRunManifest: [
          manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios" }),
          manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" }),
          manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios-stale", eligible: false, fresh: false })
        ]
      }
    });

    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-stale-retained-runs",
        severity: "fail"
      })
    );
    expect(gate.primaryAction).toContain("Clear old retained validation evidence");
  });

  it("blocks public launch checklist warnings", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          publicLaunchStatus: "warning",
          publicLaunchWarningCount: 1
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "public-launch-incomplete",
        severity: "fail"
      })
    );
  });

  it("blocks Go Live preflight warnings", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          preflightStatus: "warning",
          launchWarningCount: 1
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "preflight-incomplete",
        severity: "fail"
      })
    );
  });

  it("blocks commercial validation warnings and pending items", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationWarningCount: 1,
          validationPendingCount: 1
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "commercial-validation-incomplete",
        severity: "fail"
      })
    );
  });

  it("blocks launch rehearsal warnings", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          rehearsalWarningCount: 1,
          rehearsalSummary: "Private rehearsal has one warning.",
          rehearsalPrimaryAction: "Repeat the rehearsal until every warning is resolved."
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "stream-rehearsal-incomplete",
        severity: "fail"
      })
    );
  });

  it("blocks retained manifest count mismatches", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunCount: 2,
          validationEvidenceEligibleRunCount: 3,
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios" }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" }),
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios-extra", eligible: false, fresh: false })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-count-mismatch",
        severity: "fail"
      })
    );
  });

  it("blocks old support bundle schema versions without retained-run manifests", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        app: {
          name: "MobileLiveCaster",
          reportVersion: 1,
          bundleVersion: 12
        },
        summary: {
          validationEvidenceRunManifest: []
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["bundle-version", "validation-evidence-manifest-missing"])
    );
  });

  it("blocks commercial release when Android direct MediaCodec mode is not selected", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({ androidPublisherMode: "rootencoder" }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "android-publisher-mode-not-commercial",
        detail: expect.stringContaining("rootencoder")
      })
    );
  });

  it("blocks commercial release when Android validation manifest lacks direct MediaCodec publisher proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios" }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android", androidPublisherMode: "rootencoder" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-android-publisher-mode",
        detail: expect.stringContaining("rootencoder")
      })
    );
  });

  it("blocks v20 support bundles that do not carry monitor-hold manifest proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        app: {
          name: "MobileLiveCaster",
          reportVersion: 1,
          bundleVersion: 20
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues.map((issue) => issue.code)).toContain("bundle-version");
  });

  it("blocks commercial release when launch rehearsal has not passed", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          rehearsalStatus: "needs-run",
          rehearsalCanPromoteToPublic: false,
          rehearsalSummary: "Rehearsal still needs 2 checks.",
          rehearsalPrimaryAction: "Start a private or unlisted rehearsal stream from a physical device.",
          rehearsalPendingCount: 2
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "stream-rehearsal-not-ready",
          severity: "fail",
          detail: "Rehearsal still needs 2 checks."
        })
      ])
    );
  });

  it("blocks commercial release when a ready rehearsal carries a low score", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          rehearsalScore: 82,
          rehearsalGrade: "C",
          rehearsalWeakAreaCount: 1
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "stream-rehearsal-score-low",
          severity: "fail",
          detail: "Launch rehearsal score is 82/100 grade C."
        })
      ])
    );
  });


  it("blocks monitor-hold summary claims when the manifest lacks stable duration proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios", monitorHoldDurationSeconds: 59 }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS stable monitor-hold proof")
      })
    );
  });

  it("blocks monitor-hold summary claims when the manifest has drops or reconnects", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              monitorHoldDroppedFrameIncrease: 1,
              monitorHoldObservedReconnectAttempts: 1
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS stable monitor-hold proof")
      })
    );
  });

  it("blocks avatar-motion summary claims when the manifest lacks fresh tracking runtime proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios", faceTrackingRuntimeFresh: false }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS avatar-motion proof")
      })
    );
  });

  it("blocks avatar-motion summary claims when the manifest lacks native face landmark proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRunWithoutFaceLandmarkProof({ devicePlatform: "ios", fingerprint: "svr1-ios" }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS avatar-motion proof")
      })
    );
  });

  it("blocks avatar-motion summary claims when the manifest has weak native face landmarks", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              faceTrackingFaceLandmarkConfidence: 0.4,
              faceTrackingFaceLandmarkReady: false
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS avatar-motion proof")
      })
    );
  });

  it("blocks avatar-motion summary claims when the manifest lacks explicit PNGTuber or VRM avatar proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              faceTrackingPreparedPngTuberCount: 0,
              faceTrackingVisibleVrmCount: 0,
              faceTrackingNativeVrmRendererReady: false
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS avatar-motion proof")
      })
    );
  });

  it("allows avatar-motion summary claims when VRM-only manifest proof includes native renderer evidence", () => {
    const vrmProof = {
      faceTrackingPreparedPngTuberCount: 0,
      faceTrackingVisibleVrmCount: 1,
      faceTrackingNativeVrmRendererReady: true,
      nativeRuntimeStillImageAssetCount: 0,
      nativeRuntimeStillImageAssetLoadedCount: 0,
      nativeRuntimeStillImageAssetDecodedCount: 0,
      nativeRuntimeStillImageAssetDecodedPixelCount: 0,
      nativeRuntimeStillImageAssetCompositedCount: 0,
      nativeRuntimeStillImageAssetCompositedPixelCount: 0,
      nativeRuntimeVrmSourceCount: 1,
      nativeRuntimeVrmPosePayloadCount: 1,
      nativeRuntimeVrmActivePoseCount: 1,
      nativeRuntimeVrmMissingPoseCount: 0,
      nativeRuntimeVrmRendererStatus: "ready" as const,
      nativeRuntimeVrmRendererBackend: "metal",
      nativeRuntimeVrmModelLoadedCount: 1,
      nativeRuntimeVrmModelVersions: ["1.0"],
      nativeRuntimeVrmHumanoidBoneCount: 54,
      nativeRuntimeVrmExpressionCount: 12,
      nativeRuntimeVrmMeshPrimitiveCount: 4,
      nativeRuntimeVrmSkinnedMeshPrimitiveCount: 4,
      nativeRuntimeVrmSkinJointCount: 54,
      nativeRuntimeVrmPositionAccessorCount: 4,
      nativeRuntimeVrmVertexCount: 24000,
      nativeRuntimeVrmSkinningAttributePrimitiveCount: 4,
      nativeRuntimeVrmTrianglePrimitiveCount: 4,
      nativeRuntimeVrmUnsupportedPrimitiveModeCount: 0,
      nativeRuntimeVrmTexcoordAccessorCount: 4,
      nativeRuntimeVrmImageCount: 2,
      nativeRuntimeVrmUnsupportedImageMimeCount: 0,
      nativeRuntimeVrmPoseBoneCount: 54,
      nativeRuntimeVrmPoseBoneAppliedCount: 54,
      nativeRuntimeVrmPoseBoneUnsupportedCount: 0,
      nativeRuntimeVrmPoseExpressionCount: 2,
      nativeRuntimeVrmPoseExpressionAppliedCount: 2,
      nativeRuntimeVrmPoseExpressionUnsupportedCount: 0,
      nativeRuntimeVrmRenderedSourceCount: 1,
      nativeRuntimeVrmRenderMissingCount: 0,
      nativeRuntimeVrmRenderFailureCount: 0
    };
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              ...vrmProof,
              nativeRuntimeVrmRendererBackend: "metal"
            }),
            manifestRun({
              devicePlatform: "android",
              fingerprint: "svr1-android",
              ...vrmProof,
              nativeRuntimeVrmRendererBackend: "opengl-es"
            })
          ]
        }
      }),
      { now }
    );

    expect(gate.issues).not.toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity"
      })
    );
    expect(gate.status).toBe("ready");
  });

  it("blocks VRM-only manifest proof when renderer backend is not production evidence", () => {
    const vrmProof = {
      faceTrackingPreparedPngTuberCount: 0,
      faceTrackingVisibleVrmCount: 1,
      faceTrackingNativeVrmRendererReady: true,
      nativeRuntimeStillImageAssetCount: 0,
      nativeRuntimeStillImageAssetLoadedCount: 0,
      nativeRuntimeStillImageAssetDecodedCount: 0,
      nativeRuntimeStillImageAssetDecodedPixelCount: 0,
      nativeRuntimeStillImageAssetCompositedCount: 0,
      nativeRuntimeStillImageAssetCompositedPixelCount: 0,
      nativeRuntimeVrmSourceCount: 1,
      nativeRuntimeVrmPosePayloadCount: 1,
      nativeRuntimeVrmActivePoseCount: 1,
      nativeRuntimeVrmMissingPoseCount: 0,
      nativeRuntimeVrmRendererStatus: "ready" as const,
      nativeRuntimeVrmRendererBackend: "native-test",
      nativeRuntimeVrmModelLoadedCount: 1,
      nativeRuntimeVrmModelVersions: ["1.0"],
      nativeRuntimeVrmHumanoidBoneCount: 54,
      nativeRuntimeVrmExpressionCount: 12,
      nativeRuntimeVrmMeshPrimitiveCount: 4,
      nativeRuntimeVrmSkinnedMeshPrimitiveCount: 4,
      nativeRuntimeVrmSkinJointCount: 54,
      nativeRuntimeVrmPositionAccessorCount: 4,
      nativeRuntimeVrmVertexCount: 24000,
      nativeRuntimeVrmSkinningAttributePrimitiveCount: 4,
      nativeRuntimeVrmTrianglePrimitiveCount: 4,
      nativeRuntimeVrmUnsupportedPrimitiveModeCount: 0,
      nativeRuntimeVrmTexcoordAccessorCount: 4,
      nativeRuntimeVrmImageCount: 2,
      nativeRuntimeVrmUnsupportedImageMimeCount: 0,
      nativeRuntimeVrmPoseBoneUnsupportedCount: 0,
      nativeRuntimeVrmPoseExpressionUnsupportedCount: 0,
      nativeRuntimeVrmRenderedSourceCount: 1,
      nativeRuntimeVrmRenderMissingCount: 0,
      nativeRuntimeVrmRenderFailureCount: 0
    };
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios", ...vrmProof }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android", ...vrmProof })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS native runtime proof")
      })
    );
  });

  it("blocks native-runtime summary claims when the manifest lacks native frame proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios", nativeRuntimeSentVideoFrames: 0 }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS native runtime proof")
      })
    );
  });

  it("blocks native-runtime summary claims when the manifest uses non-production encoder backends", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "android",
              fingerprint: "svr1-android",
              nativeRuntimeVideoEncoderBackend: "rootencoder",
              nativeRuntimeAudioEncoderBackend: "rootencoder"
            }),
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("Android native runtime proof")
      })
    );
  });

  it("blocks native-runtime summary claims when the manifest has missing compositor assets", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              nativeRuntimeStillImageAssetLoadedCount: 0,
              nativeRuntimeStillImageAssetMissingCount: 1
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS native runtime proof")
      })
    );
  });

  it("blocks native-runtime summary claims when still-image compositor assets are not decoded", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              nativeRuntimeStillImageAssetCount: 1,
              nativeRuntimeStillImageAssetLoadedCount: 1,
              nativeRuntimeStillImageAssetMissingCount: 0,
              nativeRuntimeStillImageAssetDecodedCount: 0,
              nativeRuntimeStillImageAssetDecodedPixelCount: 0,
              nativeRuntimeStillImageAssetCompositedCount: 0,
              nativeRuntimeStillImageAssetCompositedPixelCount: 0
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS native runtime proof")
      })
    );
  });

  it("blocks native-runtime summary claims when still-image compositor assets are not composited", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              nativeRuntimeStillImageAssetCount: 1,
              nativeRuntimeStillImageAssetLoadedCount: 1,
              nativeRuntimeStillImageAssetMissingCount: 0,
              nativeRuntimeStillImageAssetDecodedCount: 1,
              nativeRuntimeStillImageAssetDecodedPixelCount: 921_600,
              nativeRuntimeStillImageAssetCompositedCount: 0,
              nativeRuntimeStillImageAssetCompositedPixelCount: 0
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS native runtime proof")
      })
    );
  });

  it("blocks native-runtime summary claims when the manifest lacks applied overlay proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              nativeRuntimeCompositionAppliedCount: 0,
              nativeRuntimeCompositionSkippedCount: 0,
              nativeRuntimeStillImageAssetCount: 1,
              nativeRuntimeStillImageAssetLoadedCount: 1,
              nativeRuntimeStillImageAssetMissingCount: 0
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS native runtime proof")
      })
    );
  });

  it("blocks native-runtime summary claims when the manifest only proves still-image overlays", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          nativeCompositionNativeOverlayCount: 4,
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
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
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS native runtime proof")
      })
    );
  });

  it("blocks native-runtime summary claims when the manifest omits text, caption, and chat overlay kinds", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          nativeCompositionNativeOverlayCount: 4,
          nativeCompositionTextOverlayCount: 2,
          nativeCompositionCaptionOverlayCount: 1,
          nativeCompositionChatOverlayCount: 1,
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
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
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS native runtime proof")
      })
    );
  });

  it("blocks native-runtime summary claims when the manifest reports subtitle overlays as generic text", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          nativeCompositionNativeOverlayCount: 4,
          nativeCompositionTextOverlayCount: 2,
          nativeCompositionCaptionOverlayCount: 1,
          nativeCompositionChatOverlayCount: 1,
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
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
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS native runtime proof")
      })
    );
  });

  it("blocks native-runtime summary claims when the manifest lacks VRM renderer proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              nativeRuntimeVrmSourceCount: 1,
              nativeRuntimeVrmPosePayloadCount: 1,
              nativeRuntimeVrmActivePoseCount: 1,
              nativeRuntimeVrmRendererStatus: "unavailable",
              nativeRuntimeVrmModelLoadedCount: 1,
              nativeRuntimeVrmRenderedSourceCount: 0,
              nativeRuntimeVrmRenderMissingCount: 1
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS native runtime proof")
      })
    );
  });

  it("blocks audio summary claims when the manifest lacks native monitor write proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios", audioNativeMonitorWrittenFrames: 0 }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS mic/headphone proof")
      })
    );
  });

  it("blocks audio summary claims when the manifest has monitor drops or missing headphone proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              audioNativeMonitorHeadphonesConnected: false,
              audioNativeMonitorDroppedFrames: 1
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS mic/headphone proof")
      })
    );
  });

  it("blocks audio summary claims when the app output route and native monitor route do not match", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              audioOutputRoute: "wired-headphones",
              audioNativeMonitorRoute: "bluetooth-a2dp",
              audioNativeMonitorRouteMatchesOutput: false
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS mic/headphone proof")
      })
    );
  });

  it("blocks audio summary claims when Bluetooth monitor evidence lacks a tuning review", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              audioBluetoothRoute: true,
              audioBluetoothTuningReviewed: false
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS mic/headphone proof")
      })
    );
  });

  it("blocks audio summary claims when retained monitor latency lacks a measurement source", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              audioMonitorLatencySource: ""
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS mic/headphone proof")
      })
    );
  });

  it("blocks Bluetooth audio summary claims when retained tuning note is missing", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              audioBluetoothRoute: true,
              audioBluetoothTuningReviewed: true,
              audioMonitorTuningNote: ""
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS mic/headphone proof")
      })
    );
  });

  it("blocks audio summary claims when retained monitor latency exceeds the route budget", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              audioMonitorLatencyMs: 260,
              audioMonitorLatencyBudgetMs: 180
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS mic/headphone proof")
      })
    );
  });

  it("blocks avatar-motion summary claims when the manifest retains still-image rig issues", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios", faceTrackingRigIssueCount: 1 }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS avatar-motion proof")
      })
    );
  });

  it("blocks avatar-motion summary claims when the manifest omits still-image rig quality proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRunWithoutRigQuality({ devicePlatform: "ios", fingerprint: "svr1-ios" }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS avatar-motion proof")
      })
    );
  });

  it("blocks avatar-motion summary claims when the manifest has low still-image high-fidelity rig proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              faceTrackingRigHighFidelityScore: 78,
              faceTrackingRigHighFidelityGrade: "review"
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS avatar-motion proof")
      })
    );
  });

  it("blocks avatar-motion summary claims when the manifest has low semantic segment proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              faceTrackingRigSemanticSegmentScore: 78
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS avatar-motion proof")
      })
    );
  });

  it("blocks avatar-motion summary claims when the manifest has low eye-mouth segment proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              faceTrackingRigEyeMouthSegmentScore: 78
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS avatar-motion proof")
      })
    );
  });

  it("blocks avatar-motion summary claims when the manifest has low horizontal anchor proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              faceTrackingRigHorizontalAnchorScore: 78
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS avatar-motion proof")
      })
    );
  });

  it("blocks chat-readout summary claims when the manifest has no spoken chat success", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios", chatReadoutSpokenMessageCount: 0 }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS spoken chat-readout proof")
      })
    );
  });

  it("blocks chat-readout summary claims when the manifest keeps speech failures", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios", chatReadoutSpeechFailureCount: 1 }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS spoken chat-readout proof")
      })
    );
  });

  it("blocks release when retained manifests lack controlled weak-network quality automation proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              qualityAutomationLiveUpdateCount: 0,
              qualityAutomationNextTargetCount: 0
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-quality-automation-gap",
        detail: expect.stringContaining("iOS")
      })
    );
  });

  it("blocks platform dashboard summary claims when the manifest lacks destination identity proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              platformPublishingYoutubeHasBroadcastId: false
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS platform dashboard proof")
      })
    );
  });

  it("blocks Twitch platform dashboard claims when the manifest lacks channel metadata proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        destination: {
          platform: "twitch",
          protocol: "rtmps"
        },
        summary: {
          platformPublishingFreshnessSummary: "Twitch dashboard status was checked 1 minutes ago.",
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              targetPlatform: "Twitch",
              platformPublishingPlatform: "twitch",
              platformPublishingTwitchLiveStatus: "live",
              platformPublishingTwitchStartedAt: "2026-06-23T10:58:00.000Z",
              platformPublishingTwitchHasCategoryId: true,
              platformPublishingTwitchViewerCount: 1
            }),
            manifestRun({
              devicePlatform: "android",
              fingerprint: "svr1-android",
              targetPlatform: "Twitch",
              platformPublishingPlatform: "twitch",
              platformPublishingTwitchLiveStatus: "live",
              platformPublishingTwitchStartedAt: "2026-06-23T10:58:00.000Z",
              platformPublishingTwitchHasCategoryId: true,
              platformPublishingTwitchViewerCount: 1
            })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("platform dashboard proof")
      })
    );
  });

  it("blocks platform dashboard summary claims when the manifest keeps unhealthy destination state", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              platformPublishingYoutubeHealthIssueCount: 1
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS platform dashboard proof")
      })
    );
  });

  it("blocks platform dashboard summary claims when the manifest freshness age exceeds the release window", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              platformPublishingFreshnessAgeMinutes: 11
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS platform dashboard proof")
      })
    );
  });

  it("blocks same-run platform ingest claims when the manifest lacks native send proof", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceNativeRuntimeIosPass: false,
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              nativeRuntimeSentVideoFrames: 0
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS same-run platform ingest proof")
      })
    );
  });

  it("blocks same-run platform ingest claims when dashboard timing does not match the retained run", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              platformPublishingCheckedAt: "2026-06-23T10:30:00.000Z",
              platformPublishingFreshnessAgeMinutes: 1
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS same-run platform ingest proof")
      })
    );
  });

  it("blocks same-run platform ingest claims when retained observed dashboard age is inconsistent", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({
              devicePlatform: "ios",
              fingerprint: "svr1-ios",
              platformPublishingObservedAgeMinutes: 7
            }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "validation-evidence-manifest-integrity",
        detail: expect.stringContaining("iOS same-run platform ingest proof")
      })
    );
  });

  it("blocks bundles whose retained runs are not physical-device evidence", () => {
    const bundle = supportBundle({
      summary: {
        validationEvidencePhysicalDeviceAndroidPass: false,
        validationEvidenceRunManifest: [
          manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios" }),
          manifestRun({
            devicePlatform: "android",
            fingerprint: "svr1-android-emulator",
            physicalDevice: false,
            physicalDeviceStatus: "fail"
          })
        ]
      }
    });

    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "validation-evidence-coverage",
        "validation-evidence-manifest-incomplete",
        "validation-evidence-feature-gap"
      ])
    );
    expect(formatCommercialReleaseGate(gate)).toContain("physical device identity");
  });

  it("blocks summary claims backed only by stale or out-of-scope manifest rows", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios-stale", eligible: true, fresh: false }),
            manifestRun({
              devicePlatform: "android",
              fingerprint: "svr1-android-out-of-scope",
              eligible: true,
              matchesScope: false
            })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["validation-evidence-manifest-incomplete", "validation-evidence-manifest-integrity"])
    );
    expect(formatCommercialReleaseGate(gate)).toContain("eligible run count summary=2 manifest=0");
  });

  it("blocks manifest rows that are marked in-scope for a different destination", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios", targetPlatform: "Twitch" }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "validation-evidence-manifest-scope",
          severity: "fail",
          detail: expect.stringContaining("current destination scope YouTube Live/RTMPS")
        })
      ])
    );
  });

  it("blocks manifest rows that are marked in-scope for a different transport", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios", transport: "rtmp" }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "validation-evidence-manifest-scope",
          severity: "fail",
          detail: expect.stringContaining("current destination scope YouTube Live/RTMPS")
        })
      ])
    );
  });

  it("blocks summary feature claims not backed by the latest manifest row", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios" }),
            manifestRun({
              devicePlatform: "android",
              fingerprint: "svr1-android-chat-warn",
              chatReadoutStatus: "warn"
            })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "validation-evidence-manifest-integrity",
          severity: "fail",
          detail: expect.stringContaining("Android spoken chat-readout proof is claimed by summary but not backed")
        })
      ])
    );
  });

  it("blocks hidden same-build summary claims when manifest app builds differ", () => {
    const gate = createCommercialReleaseGate(
      supportBundle({
        summary: {
          validationEvidenceRunManifest: [
            manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios", appBuild: "rc-1" }),
            manifestRun({ devicePlatform: "android", fingerprint: "svr1-android", appBuild: "rc-2" })
          ]
        }
      }),
      { now }
    );

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "validation-evidence-manifest-integrity",
          severity: "fail",
          detail: expect.stringContaining("summary build rc-1 is not backed")
        })
      ])
    );
  });

  it("blocks support bundles that contain unredacted sensitive data", () => {
    const bundle = supportBundle();
    const mutableBundle = bundle as unknown as {
      diagnostics: {
        api: {
          lastError: string;
          streamKey: string;
          youtubeAccessToken: string;
          twitchOauthToken: string;
          serialized: string;
        };
      };
    };
    mutableBundle.diagnostics = {
      api: {
        lastError: "Authorization: Bearer youtube-access-token-secret failed after code=oauth-code-secret",
        streamKey: "rtmp-live-secret-key",
        youtubeAccessToken: "youtube-access-token-secret",
        twitchOauthToken: "twitch-oauth-token-secret",
        serialized: '{"apiKey":"platform-api-key-secret","nestedClientSecret":"client-secret-value"} customOauthToken=custom-oauth-token-secret'
      }
    };

    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues.map((issue) => issue.code)).toContain("support-bundle-sensitive-data");
    expect(formatCommercialReleaseGate(gate)).toContain("Support bundle privacy");
  });

  it("allows support bundles with redacted sensitive placeholders", () => {
    const bundle = supportBundle();
    const mutableBundle = bundle as unknown as {
      diagnostics: {
        api: {
          lastError: string;
          streamKey: string;
          youtubeAccessToken: string;
          twitchOauthToken: string;
          serialized: string;
        };
      };
    };
    mutableBundle.diagnostics = {
      api: {
        lastError: "Authorization: Bearer [redacted] failed after code=[redacted]",
        streamKey: "[redacted]",
        youtubeAccessToken: "[redacted]",
        twitchOauthToken: "[redacted]",
        serialized: '{"apiKey":"[redacted]","nestedClientSecret":"[redacted]"} customOauthToken=[redacted]'
      }
    };

    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("ready");
    expect(gate.canRelease).toBe(true);
    expect(gate.issues.map((issue) => issue.code)).not.toContain("support-bundle-sensitive-data");
  });

  it("blocks support bundles that contain unredacted contact details", () => {
    const bundle = supportBundle();
    const mutableBundle = bundle as unknown as {
      diagnostics: {
        chat: {
          lastOverlayText: string;
        };
      };
    };
    mutableBundle.diagnostics = {
      chat: {
        lastOverlayText: "email viewer@example.com phone 090-1234-5678 invite discord.gg/privateRoom"
      }
    };

    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "support-bundle-sensitive-data",
          detail: expect.stringContaining("unredacted contact pattern")
        })
      ])
    );
  });

  it("blocks support bundles that contain unredacted protocol-less links without blocking RTMPS endpoints", () => {
    const bundle = supportBundle();
    const mutableBundle = bundle as unknown as {
      diagnostics: {
        destination: {
          ingestEndpoint: string;
        };
        chat: {
          lastOverlayText: string;
        };
      };
    };
    mutableBundle.diagnostics = {
      destination: {
        ingestEndpoint: "rtmps://live.example.com/app"
      },
      chat: {
        lastOverlayText: "shared www.example.org/private and example.tv/show"
      }
    };

    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("blocked");
    expect(gate.canRelease).toBe(false);
    expect(gate.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "support-bundle-sensitive-data",
          detail: expect.stringContaining("unredacted protocol-less link pattern")
        })
      ])
    );
  });

  it("allows support bundles that retain RTMPS endpoints without protocol-less private links", () => {
    const bundle = supportBundle();
    const mutableBundle = bundle as unknown as {
      diagnostics: {
        destination: {
          ingestEndpoint: string;
        };
      };
    };
    mutableBundle.diagnostics = {
      destination: {
        ingestEndpoint: "rtmps://live.example.com/app"
      }
    };

    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("ready");
    expect(gate.canRelease).toBe(true);
    expect(gate.issues.map((issue) => issue.code)).not.toContain("support-bundle-sensitive-data");
  });

  it("allows retained ingest host fields without allowing protocol-less private paths elsewhere", () => {
    const bundle = supportBundle();
    const mutableBundle = bundle as unknown as {
      target: { host: string };
      profile: { destination: { host: string } };
    };
    mutableBundle.target = { host: "a.rtmps.youtube.com" };
    mutableBundle.profile.destination.host = "a.rtmps.youtube.com";

    const gate = createCommercialReleaseGate(bundle, { now });

    expect(gate.status).toBe("ready");
    expect(gate.canRelease).toBe(true);
    expect(gate.issues.map((issue) => issue.code)).not.toContain("support-bundle-sensitive-data");
  });
});

const supportBundle = ({
  app = {
    name: "MobileLiveCaster" as const,
    reportVersion: 1 as const,
    bundleVersion: 55 as const
  },
  generatedAt = "2026-06-23T11:30:00.000Z",
  destination = {
    platform: "youtube-live" as const,
    protocol: "rtmps"
  },
  androidPublisherMode = "mediacodec" as const,
  summary = {}
}: {
  app?: {
    name: "MobileLiveCaster";
    reportVersion: 1;
    bundleVersion: number;
  };
  generatedAt?: string;
  destination?: {
    platform: SupportBundle["profile"]["destination"]["platform"];
    protocol: SupportBundle["profile"]["destination"]["protocol"];
  };
  androidPublisherMode?: SupportBundle["profile"]["androidPublisherMode"];
  summary?: Partial<SupportBundle["summary"]>;
} = {}): SupportBundle =>
  ({
    app,
    generatedAt,
    profile: {
      androidPublisherMode,
      destination
    },
    summary: {
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
      textOverlayEmptyVisibleManualSourceCount: 0,
      textOverlayTransparentVisibleSourceCount: 1,
      textOverlaySensitiveContentIssueCount: 0,
      textOverlayDominantBackdropIssueCount: 0,
      textOverlayLayoutRiskIssueCount: 0,
      textOverlaySafeAreaIssueCount: 0,
      textOverlayAvatarOverlapIssueCount: 0,
      textOverlayLabelSourceCount: 1,
      textOverlaySubtitleSourceCount: 1,
      textOverlayTickerSourceCount: 0,
      textOverlayCaptionSourceCount: 0,
      textOverlaySummary: "2/2 text overlays visible: 2 manual and 0 live-caption sources.",
      textOverlayRecommendation: "Keep text positions, transparency, font size, and outline settings unchanged.",
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
      liveCaptionLanguage: "",
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
      platformPublishingFreshnessAgeMinutes: 1,
      platformPublishingFreshnessSummary: "YouTube dashboard status was checked 1 minutes ago.",
      platformPublishingFreshnessRecommendation: "Keep this fresh dashboard snapshot with the release-candidate validation run.",
      validationEvidenceRunManifest: [
        manifestRun({ devicePlatform: "ios", fingerprint: "svr1-ios" }),
        manifestRun({ devicePlatform: "android", fingerprint: "svr1-android" })
      ],
      ...summary
    },
    scene: {
      fingerprint: "scene1-ready"
    }
  }) as SupportBundle;

type ValidationManifestRun = SupportBundle["summary"]["validationEvidenceRunManifest"][number];

const manifestRunWithoutRigQuality = (
  patch: Parameters<typeof manifestRun>[0]
): ValidationManifestRun => {
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
    ...run
  } = manifestRun(patch);
  return run as ValidationManifestRun;
};

const manifestRunWithoutFaceLandmarkProof = (
  patch: Parameters<typeof manifestRun>[0]
): ValidationManifestRun => {
  const {
    faceTrackingFaceLandmarkConfidence: _faceTrackingFaceLandmarkConfidence,
    faceTrackingFaceLandmarkReady: _faceTrackingFaceLandmarkReady,
    ...run
  } = manifestRun(patch);
  return run as ValidationManifestRun;
};

const manifestRun = ({
  devicePlatform,
  fingerprint,
  eligible = true,
  result = "pass",
  physicalDevice = true,
  physicalDeviceStatus = "pass",
  fresh = true,
  matchesScope = true,
  appBuild = "rc-1",
  sceneFingerprint = "scene1-ready",
  targetPlatform = "YouTube Live",
  transport = "rtmps",
  nativeRuntimePlatform,
  androidPublisherMode = devicePlatform === "android" ? "mediacodec" : null,
  nativeRuntimeStatus = "pass",
  nativeRuntimeVideoEncoderBackend = devicePlatform === "ios" ? "videotoolbox-h264" : "mediacodec-h264",
  nativeRuntimeAudioEncoderBackend = devicePlatform === "ios" ? "audiotoolbox-aac" : "mediacodec-aac",
  nativeRuntimeEncoderProbeStatus = "missing",
  nativeRuntimeEncoderProbeVideoBackend = "none",
  nativeRuntimeEncoderProbeAudioBackend = "none",
  nativeRuntimeCongested = false,
  nativeRuntimeQueuedItems = 0,
  nativeRuntimeCacheSize = 0,
  nativeRuntimeDroppedVideoFrames = 0,
  nativeRuntimeDroppedAudioFrames = 0,
  nativeRuntimeCompositionStatus = "applied",
  nativeRuntimeCompositionAppliedCount = 4,
  nativeRuntimeCompositionAppliedKinds = ["caption", "chat", "pngtuber", "text"],
  nativeRuntimeCompositionSkippedCount = 0,
  nativeRuntimeCompositionSkippedKinds = [],
  nativeRuntimeSentVideoFrames = 120,
  nativeRuntimeSentAudioFrames = 190,
  nativeRuntimeBytesWritten = 2_200_000,
  nativeRuntimeVideoFrameIntervalSampleCount = 119,
  nativeRuntimeVideoFrameIntervalAverageMs = 33.3,
  nativeRuntimeVideoFrameIntervalMaxMs = 42,
  nativeRuntimeVideoFrameIntervalJitterMs = 8.7,
  nativeRuntimeStillImageAssetCount = 1,
  nativeRuntimeStillImageAssetLoadedCount = 1,
  nativeRuntimeStillImageAssetMissingCount = 0,
  nativeRuntimeStillImageAssetDecodedCount = 1,
  nativeRuntimeStillImageAssetDecodedPixelCount = 921_600,
  nativeRuntimeStillImageAssetCompositedCount = 1,
  nativeRuntimeStillImageAssetCompositedPixelCount = 921_600,
  nativeRuntimeCompositorBackend =
    devicePlatform === "android" ? "android-canvas-mediacodec" : "ios-replaykit-coregraphics",
  nativeRuntimeCompositedFrameCount = 120,
  nativeRuntimeDroppedFrameCount = 0,
  nativeRuntimeCompositionFailureCount = 0,
  nativeRuntimeLiveRenderGraphReloadCount = 0,
  nativeRuntimeLiveRenderGraphRejectedUpdateCount = 0,
  nativeRuntimeStillImageAssetAppGroupCount = devicePlatform === "ios" ? 1 : 0,
  nativeRuntimeStillImageAssetAppGroupLoadedCount = devicePlatform === "ios" ? 1 : 0,
  nativeRuntimeStillImageAssetAppGroupDecodedCount = devicePlatform === "ios" ? 1 : 0,
  nativeRuntimeStillImageAssetAppGroupDecodedPixelCount = devicePlatform === "ios" ? 921_600 : 0,
  nativeRuntimeStillImageAssetAppGroupCompositedCount = devicePlatform === "ios" ? 1 : 0,
  nativeRuntimeStillImageAssetAppGroupCompositedPixelCount = devicePlatform === "ios" ? 921_600 : 0,
  nativeRuntimeLive2dSourceCount = 0,
  nativeRuntimeLive2dPosePayloadCount = 0,
  nativeRuntimeLive2dActivePoseCount = 0,
  nativeRuntimeLive2dMissingPoseCount = 0,
  nativeRuntimeLive2dRuntimeStatuses = [],
  nativeRuntimeVrmSourceCount = 0,
  nativeRuntimeVrmPosePayloadCount = 0,
  nativeRuntimeVrmActivePoseCount = 0,
  nativeRuntimeVrmMissingPoseCount = 0,
  nativeRuntimeVrmRendererStatus = "not-required",
  nativeRuntimeVrmRendererBackend = "none",
  nativeRuntimeVrmModelLoadedCount = 0,
  nativeRuntimeVrmModelVersions = [],
  nativeRuntimeVrmHumanoidBoneCount = 0,
  nativeRuntimeVrmExpressionCount = 0,
  nativeRuntimeVrmMeshPrimitiveCount = 0,
  nativeRuntimeVrmSkinnedMeshPrimitiveCount = 0,
  nativeRuntimeVrmSkinJointCount = 0,
  nativeRuntimeVrmPositionAccessorCount = 0,
  nativeRuntimeVrmVertexCount = 0,
  nativeRuntimeVrmIndexCount = 0,
  nativeRuntimeVrmBoundsAccessorCount = 0,
  nativeRuntimeVrmSkinningAttributePrimitiveCount = 0,
  nativeRuntimeVrmTrianglePrimitiveCount = 0,
  nativeRuntimeVrmUnsupportedPrimitiveModeCount = 0,
  nativeRuntimeVrmNormalAccessorCount = 0,
  nativeRuntimeVrmTexcoordAccessorCount = 0,
  nativeRuntimeVrmMorphTargetCount = 0,
  nativeRuntimeVrmMaterialCount = 0,
  nativeRuntimeVrmTextureCount = 0,
  nativeRuntimeVrmImageCount = 0,
  nativeRuntimeVrmUnsupportedImageMimeCount = 0,
  nativeRuntimeVrmTransparentMaterialCount = 0,
  nativeRuntimeVrmPoseBoneCount = 0,
  nativeRuntimeVrmPoseBoneAppliedCount = 0,
  nativeRuntimeVrmPoseBoneUnsupportedCount = 0,
  nativeRuntimeVrmPoseExpressionCount = 0,
  nativeRuntimeVrmPoseExpressionAppliedCount = 0,
  nativeRuntimeVrmPoseExpressionUnsupportedCount = 0,
  nativeRuntimeVrmRenderedSourceCount = 0,
  nativeRuntimeVrmRenderMissingCount = 0,
  nativeRuntimeVrmRenderFailureCount = 0,
  monitorHoldStatus = "pass",
  monitorHoldSampleCount = 3,
  monitorHoldDurationSeconds = 65,
  monitorHoldStability = "stable",
  monitorHoldAverageBitrateKbps = 4_400,
  monitorHoldMinimumBitrateKbps = 4_100,
  monitorHoldAverageFps = 29.8,
  monitorHoldMinimumFps = 29.2,
  monitorHoldDroppedFrameIncrease = 0,
  monitorHoldObservedReconnectAttempts = 0,
  faceTrackingStatus = "pass",
  faceTrackingRuntimeFresh = true,
  faceTrackingRuntimeAgeMs = 120,
  faceTrackingFaceLandmarkConfidence = 0.82,
  faceTrackingFaceLandmarkReady = true,
  faceTrackingPreparedPngTuberCount = 1,
  faceTrackingVisibleVrmCount = 0,
  faceTrackingNativeVrmRendererReady = false,
  faceTrackingActiveMotionCount = 1,
  faceTrackingRigIssueCount = 0,
  faceTrackingRigQualityScore = 100,
  faceTrackingRigQualityGrade = "ready",
  faceTrackingRigPartSeparationScore = 100,
  faceTrackingRigDepthContinuityScore = 100,
  faceTrackingRigSemanticSegmentScore = 100,
  faceTrackingRigEyeMouthSegmentScore = 100,
  faceTrackingRigHorizontalAnchorScore = 100,
  faceTrackingRigHighFidelityScore = 100,
  faceTrackingRigHighFidelityGrade = "ready",
  audioStatus = "pass",
  audioOutputRoute = "wired-headphones",
  audioMonitorHeadphonesOnly = true,
  audioNativeMonitorRoute = "wired-headphones",
  audioNativeMonitorRouteMatchesOutput = true,
  audioNativeMonitorHeadphonesConnected = true,
  audioNativeMonitorWrittenFrames = 24_576,
  audioNativeMonitorDroppedFrames = 0,
  audioNativeMonitorWrittenBuffers = 48,
  audioNativeMonitorDroppedBuffers = 0,
  audioMonitorLatencyStatus = "pass",
  audioMonitorLatencyMs = 92,
  audioMonitorLatencyBudgetMs = 180,
  audioMonitorLatencySource = "native-route-monitor",
  audioMonitorTuningNote = "Wired monitor route measured under release load.",
  audioBluetoothRoute = false,
  audioBluetoothTuningReviewed = false,
  chatReadoutStatus = "pass",
  chatReadoutSpokenMessageCount = 1,
  chatReadoutSpeechFailureCount = 0,
  qualityAutomationStatus = "pass",
  qualityAutomationLiveUpdateCount = 1,
  qualityAutomationNextTargetCount = 0,
  qualityAutomationFailureCount = 0,
  platformPublishingPlatform = "youtube-live",
  platformPublishingStatus = "pass",
  platformPublishingFreshnessStatus = "fresh",
  platformPublishingCheckedAt = "2026-06-23T10:59:00.000Z",
  platformPublishingFreshnessAgeMinutes = 1,
  platformPublishingObservedAgeMinutes = 1,
  platformPublishingYoutubeHasBroadcastId = true,
  platformPublishingYoutubeHasStreamId = true,
  platformPublishingYoutubeBroadcastStatus = "live",
  platformPublishingYoutubeStreamStatus = "active",
  platformPublishingYoutubeHealthStatus = "ok",
  platformPublishingYoutubeHealthIssueCount = 0,
  platformPublishingTwitchLiveStatus = "",
  platformPublishingTwitchStartedAt = "",
  platformPublishingTwitchHasCategoryId = false,
  platformPublishingTwitchChannelTitle = "",
  platformPublishingTwitchChannelCategory = "",
  platformPublishingTwitchChannelCategoryId = "",
  platformPublishingTwitchChannelLanguage = "",
  platformPublishingTwitchViewerCount = 0
}: {
  devicePlatform: "ios" | "android";
  fingerprint: string;
  eligible?: ValidationManifestRun["eligible"];
  result?: ValidationManifestRun["result"];
  physicalDevice?: ValidationManifestRun["physicalDevice"];
  physicalDeviceStatus?: ValidationManifestRun["physicalDeviceStatus"];
  fresh?: ValidationManifestRun["fresh"];
  matchesScope?: ValidationManifestRun["matchesScope"];
  appBuild?: ValidationManifestRun["appBuild"];
  targetPlatform?: ValidationManifestRun["targetPlatform"];
  transport?: ValidationManifestRun["transport"];
  nativeRuntimePlatform?: ValidationManifestRun["nativeRuntimePlatform"];
  androidPublisherMode?: ValidationManifestRun["androidPublisherMode"];
  nativeRuntimeStatus?: ValidationManifestRun["nativeRuntimeStatus"];
  nativeRuntimeVideoEncoderBackend?: ValidationManifestRun["nativeRuntimeVideoEncoderBackend"];
  nativeRuntimeAudioEncoderBackend?: ValidationManifestRun["nativeRuntimeAudioEncoderBackend"];
  nativeRuntimeEncoderProbeStatus?: ValidationManifestRun["nativeRuntimeEncoderProbeStatus"];
  nativeRuntimeEncoderProbeVideoBackend?: ValidationManifestRun["nativeRuntimeEncoderProbeVideoBackend"];
  nativeRuntimeEncoderProbeAudioBackend?: ValidationManifestRun["nativeRuntimeEncoderProbeAudioBackend"];
  nativeRuntimeCongested?: ValidationManifestRun["nativeRuntimeCongested"];
  nativeRuntimeQueuedItems?: ValidationManifestRun["nativeRuntimeQueuedItems"];
  nativeRuntimeCacheSize?: ValidationManifestRun["nativeRuntimeCacheSize"];
  nativeRuntimeDroppedVideoFrames?: ValidationManifestRun["nativeRuntimeDroppedVideoFrames"];
  nativeRuntimeDroppedAudioFrames?: ValidationManifestRun["nativeRuntimeDroppedAudioFrames"];
  nativeRuntimeCompositionStatus?: ValidationManifestRun["nativeRuntimeCompositionStatus"];
  nativeRuntimeCompositionAppliedCount?: ValidationManifestRun["nativeRuntimeCompositionAppliedCount"];
  nativeRuntimeCompositionAppliedKinds?: ValidationManifestRun["nativeRuntimeCompositionAppliedKinds"];
  nativeRuntimeCompositionSkippedCount?: ValidationManifestRun["nativeRuntimeCompositionSkippedCount"];
  nativeRuntimeCompositionSkippedKinds?: ValidationManifestRun["nativeRuntimeCompositionSkippedKinds"];
  nativeRuntimeSentVideoFrames?: ValidationManifestRun["nativeRuntimeSentVideoFrames"];
  nativeRuntimeSentAudioFrames?: ValidationManifestRun["nativeRuntimeSentAudioFrames"];
  nativeRuntimeBytesWritten?: ValidationManifestRun["nativeRuntimeBytesWritten"];
  nativeRuntimeVideoFrameIntervalSampleCount?: ValidationManifestRun["nativeRuntimeVideoFrameIntervalSampleCount"];
  nativeRuntimeVideoFrameIntervalAverageMs?: ValidationManifestRun["nativeRuntimeVideoFrameIntervalAverageMs"];
  nativeRuntimeVideoFrameIntervalMaxMs?: ValidationManifestRun["nativeRuntimeVideoFrameIntervalMaxMs"];
  nativeRuntimeVideoFrameIntervalJitterMs?: ValidationManifestRun["nativeRuntimeVideoFrameIntervalJitterMs"];
  nativeRuntimeStillImageAssetCount?: ValidationManifestRun["nativeRuntimeStillImageAssetCount"];
  nativeRuntimeStillImageAssetLoadedCount?: ValidationManifestRun["nativeRuntimeStillImageAssetLoadedCount"];
  nativeRuntimeStillImageAssetMissingCount?: ValidationManifestRun["nativeRuntimeStillImageAssetMissingCount"];
  nativeRuntimeStillImageAssetDecodedCount?: ValidationManifestRun["nativeRuntimeStillImageAssetDecodedCount"];
  nativeRuntimeStillImageAssetDecodedPixelCount?: ValidationManifestRun["nativeRuntimeStillImageAssetDecodedPixelCount"];
  nativeRuntimeStillImageAssetCompositedCount?: ValidationManifestRun["nativeRuntimeStillImageAssetCompositedCount"];
  nativeRuntimeStillImageAssetCompositedPixelCount?: ValidationManifestRun["nativeRuntimeStillImageAssetCompositedPixelCount"];
  nativeRuntimeCompositorBackend?: ValidationManifestRun["nativeRuntimeCompositorBackend"];
  nativeRuntimeCompositedFrameCount?: ValidationManifestRun["nativeRuntimeCompositedFrameCount"];
  nativeRuntimeDroppedFrameCount?: ValidationManifestRun["nativeRuntimeDroppedFrameCount"];
  nativeRuntimeCompositionFailureCount?: ValidationManifestRun["nativeRuntimeCompositionFailureCount"];
  nativeRuntimeLiveRenderGraphReloadCount?: ValidationManifestRun["nativeRuntimeLiveRenderGraphReloadCount"];
  nativeRuntimeLiveRenderGraphRejectedUpdateCount?: ValidationManifestRun["nativeRuntimeLiveRenderGraphRejectedUpdateCount"];
  nativeRuntimeStillImageAssetAppGroupCount?: ValidationManifestRun["nativeRuntimeStillImageAssetAppGroupCount"];
  nativeRuntimeStillImageAssetAppGroupLoadedCount?: ValidationManifestRun["nativeRuntimeStillImageAssetAppGroupLoadedCount"];
  nativeRuntimeStillImageAssetAppGroupDecodedCount?: ValidationManifestRun["nativeRuntimeStillImageAssetAppGroupDecodedCount"];
  nativeRuntimeStillImageAssetAppGroupDecodedPixelCount?: ValidationManifestRun["nativeRuntimeStillImageAssetAppGroupDecodedPixelCount"];
  nativeRuntimeStillImageAssetAppGroupCompositedCount?: ValidationManifestRun["nativeRuntimeStillImageAssetAppGroupCompositedCount"];
  nativeRuntimeStillImageAssetAppGroupCompositedPixelCount?: ValidationManifestRun["nativeRuntimeStillImageAssetAppGroupCompositedPixelCount"];
  nativeRuntimeLive2dSourceCount?: ValidationManifestRun["nativeRuntimeLive2dSourceCount"];
  nativeRuntimeLive2dPosePayloadCount?: ValidationManifestRun["nativeRuntimeLive2dPosePayloadCount"];
  nativeRuntimeLive2dActivePoseCount?: ValidationManifestRun["nativeRuntimeLive2dActivePoseCount"];
  nativeRuntimeLive2dMissingPoseCount?: ValidationManifestRun["nativeRuntimeLive2dMissingPoseCount"];
  nativeRuntimeLive2dRuntimeStatuses?: ValidationManifestRun["nativeRuntimeLive2dRuntimeStatuses"];
  nativeRuntimeVrmSourceCount?: ValidationManifestRun["nativeRuntimeVrmSourceCount"];
  nativeRuntimeVrmPosePayloadCount?: ValidationManifestRun["nativeRuntimeVrmPosePayloadCount"];
  nativeRuntimeVrmActivePoseCount?: ValidationManifestRun["nativeRuntimeVrmActivePoseCount"];
  nativeRuntimeVrmMissingPoseCount?: ValidationManifestRun["nativeRuntimeVrmMissingPoseCount"];
  nativeRuntimeVrmRendererStatus?: ValidationManifestRun["nativeRuntimeVrmRendererStatus"];
  nativeRuntimeVrmRendererBackend?: ValidationManifestRun["nativeRuntimeVrmRendererBackend"];
  nativeRuntimeVrmModelLoadedCount?: ValidationManifestRun["nativeRuntimeVrmModelLoadedCount"];
  nativeRuntimeVrmModelVersions?: ValidationManifestRun["nativeRuntimeVrmModelVersions"];
  nativeRuntimeVrmHumanoidBoneCount?: ValidationManifestRun["nativeRuntimeVrmHumanoidBoneCount"];
  nativeRuntimeVrmExpressionCount?: ValidationManifestRun["nativeRuntimeVrmExpressionCount"];
  nativeRuntimeVrmMeshPrimitiveCount?: ValidationManifestRun["nativeRuntimeVrmMeshPrimitiveCount"];
  nativeRuntimeVrmSkinnedMeshPrimitiveCount?: ValidationManifestRun["nativeRuntimeVrmSkinnedMeshPrimitiveCount"];
  nativeRuntimeVrmSkinJointCount?: ValidationManifestRun["nativeRuntimeVrmSkinJointCount"];
  nativeRuntimeVrmPositionAccessorCount?: ValidationManifestRun["nativeRuntimeVrmPositionAccessorCount"];
  nativeRuntimeVrmVertexCount?: ValidationManifestRun["nativeRuntimeVrmVertexCount"];
  nativeRuntimeVrmIndexCount?: ValidationManifestRun["nativeRuntimeVrmIndexCount"];
  nativeRuntimeVrmBoundsAccessorCount?: ValidationManifestRun["nativeRuntimeVrmBoundsAccessorCount"];
  nativeRuntimeVrmSkinningAttributePrimitiveCount?: ValidationManifestRun["nativeRuntimeVrmSkinningAttributePrimitiveCount"];
  nativeRuntimeVrmTrianglePrimitiveCount?: ValidationManifestRun["nativeRuntimeVrmTrianglePrimitiveCount"];
  nativeRuntimeVrmUnsupportedPrimitiveModeCount?: ValidationManifestRun["nativeRuntimeVrmUnsupportedPrimitiveModeCount"];
  nativeRuntimeVrmNormalAccessorCount?: ValidationManifestRun["nativeRuntimeVrmNormalAccessorCount"];
  nativeRuntimeVrmTexcoordAccessorCount?: ValidationManifestRun["nativeRuntimeVrmTexcoordAccessorCount"];
  nativeRuntimeVrmMorphTargetCount?: ValidationManifestRun["nativeRuntimeVrmMorphTargetCount"];
  nativeRuntimeVrmMaterialCount?: ValidationManifestRun["nativeRuntimeVrmMaterialCount"];
  nativeRuntimeVrmTextureCount?: ValidationManifestRun["nativeRuntimeVrmTextureCount"];
  nativeRuntimeVrmImageCount?: ValidationManifestRun["nativeRuntimeVrmImageCount"];
  nativeRuntimeVrmUnsupportedImageMimeCount?: ValidationManifestRun["nativeRuntimeVrmUnsupportedImageMimeCount"];
  nativeRuntimeVrmTransparentMaterialCount?: ValidationManifestRun["nativeRuntimeVrmTransparentMaterialCount"];
  nativeRuntimeVrmPoseBoneCount?: ValidationManifestRun["nativeRuntimeVrmPoseBoneCount"];
  nativeRuntimeVrmPoseBoneAppliedCount?: ValidationManifestRun["nativeRuntimeVrmPoseBoneAppliedCount"];
  nativeRuntimeVrmPoseBoneUnsupportedCount?: ValidationManifestRun["nativeRuntimeVrmPoseBoneUnsupportedCount"];
  nativeRuntimeVrmPoseExpressionCount?: ValidationManifestRun["nativeRuntimeVrmPoseExpressionCount"];
  nativeRuntimeVrmPoseExpressionAppliedCount?: ValidationManifestRun["nativeRuntimeVrmPoseExpressionAppliedCount"];
  nativeRuntimeVrmPoseExpressionUnsupportedCount?: ValidationManifestRun["nativeRuntimeVrmPoseExpressionUnsupportedCount"];
  nativeRuntimeVrmRenderedSourceCount?: ValidationManifestRun["nativeRuntimeVrmRenderedSourceCount"];
  nativeRuntimeVrmRenderMissingCount?: ValidationManifestRun["nativeRuntimeVrmRenderMissingCount"];
  nativeRuntimeVrmRenderFailureCount?: ValidationManifestRun["nativeRuntimeVrmRenderFailureCount"];
  monitorHoldStatus?: ValidationManifestRun["monitorHoldStatus"];
  monitorHoldSampleCount?: ValidationManifestRun["monitorHoldSampleCount"];
  monitorHoldDurationSeconds?: ValidationManifestRun["monitorHoldDurationSeconds"];
  monitorHoldStability?: ValidationManifestRun["monitorHoldStability"];
  monitorHoldAverageBitrateKbps?: ValidationManifestRun["monitorHoldAverageBitrateKbps"];
  monitorHoldMinimumBitrateKbps?: ValidationManifestRun["monitorHoldMinimumBitrateKbps"];
  monitorHoldAverageFps?: ValidationManifestRun["monitorHoldAverageFps"];
  monitorHoldMinimumFps?: ValidationManifestRun["monitorHoldMinimumFps"];
  monitorHoldDroppedFrameIncrease?: ValidationManifestRun["monitorHoldDroppedFrameIncrease"];
  monitorHoldObservedReconnectAttempts?: ValidationManifestRun["monitorHoldObservedReconnectAttempts"];
  faceTrackingStatus?: ValidationManifestRun["faceTrackingStatus"];
  faceTrackingRuntimeFresh?: ValidationManifestRun["faceTrackingRuntimeFresh"];
  faceTrackingRuntimeAgeMs?: ValidationManifestRun["faceTrackingRuntimeAgeMs"];
  faceTrackingFaceLandmarkConfidence?: ValidationManifestRun["faceTrackingFaceLandmarkConfidence"];
  faceTrackingFaceLandmarkReady?: ValidationManifestRun["faceTrackingFaceLandmarkReady"];
  faceTrackingPreparedPngTuberCount?: ValidationManifestRun["faceTrackingPreparedPngTuberCount"];
  faceTrackingVisibleVrmCount?: ValidationManifestRun["faceTrackingVisibleVrmCount"];
  faceTrackingNativeVrmRendererReady?: ValidationManifestRun["faceTrackingNativeVrmRendererReady"];
  faceTrackingActiveMotionCount?: ValidationManifestRun["faceTrackingActiveMotionCount"];
  faceTrackingRigIssueCount?: ValidationManifestRun["faceTrackingRigIssueCount"];
  faceTrackingRigQualityScore?: ValidationManifestRun["faceTrackingRigQualityScore"];
  faceTrackingRigQualityGrade?: ValidationManifestRun["faceTrackingRigQualityGrade"];
  faceTrackingRigPartSeparationScore?: ValidationManifestRun["faceTrackingRigPartSeparationScore"];
  faceTrackingRigDepthContinuityScore?: ValidationManifestRun["faceTrackingRigDepthContinuityScore"];
  faceTrackingRigSemanticSegmentScore?: ValidationManifestRun["faceTrackingRigSemanticSegmentScore"];
  faceTrackingRigEyeMouthSegmentScore?: ValidationManifestRun["faceTrackingRigEyeMouthSegmentScore"];
  faceTrackingRigHorizontalAnchorScore?: ValidationManifestRun["faceTrackingRigHorizontalAnchorScore"];
  faceTrackingRigHighFidelityScore?: ValidationManifestRun["faceTrackingRigHighFidelityScore"];
  faceTrackingRigHighFidelityGrade?: ValidationManifestRun["faceTrackingRigHighFidelityGrade"];
  audioStatus?: ValidationManifestRun["audioStatus"];
  audioOutputRoute?: ValidationManifestRun["audioOutputRoute"];
  audioMonitorHeadphonesOnly?: ValidationManifestRun["audioMonitorHeadphonesOnly"];
  audioNativeMonitorRoute?: ValidationManifestRun["audioNativeMonitorRoute"];
  audioNativeMonitorRouteMatchesOutput?: ValidationManifestRun["audioNativeMonitorRouteMatchesOutput"];
  audioNativeMonitorHeadphonesConnected?: ValidationManifestRun["audioNativeMonitorHeadphonesConnected"];
  audioNativeMonitorWrittenFrames?: ValidationManifestRun["audioNativeMonitorWrittenFrames"];
  audioNativeMonitorDroppedFrames?: ValidationManifestRun["audioNativeMonitorDroppedFrames"];
  audioNativeMonitorWrittenBuffers?: ValidationManifestRun["audioNativeMonitorWrittenBuffers"];
  audioNativeMonitorDroppedBuffers?: ValidationManifestRun["audioNativeMonitorDroppedBuffers"];
  audioMonitorLatencyStatus?: ValidationManifestRun["audioMonitorLatencyStatus"];
  audioMonitorLatencyMs?: ValidationManifestRun["audioMonitorLatencyMs"];
  audioMonitorLatencyBudgetMs?: ValidationManifestRun["audioMonitorLatencyBudgetMs"];
  audioMonitorLatencySource?: ValidationManifestRun["audioMonitorLatencySource"];
  audioMonitorTuningNote?: ValidationManifestRun["audioMonitorTuningNote"];
  audioBluetoothRoute?: ValidationManifestRun["audioBluetoothRoute"];
  audioBluetoothTuningReviewed?: ValidationManifestRun["audioBluetoothTuningReviewed"];
  chatReadoutStatus?: ValidationManifestRun["chatReadoutStatus"];
  chatReadoutSpokenMessageCount?: ValidationManifestRun["chatReadoutSpokenMessageCount"];
  chatReadoutSpeechFailureCount?: ValidationManifestRun["chatReadoutSpeechFailureCount"];
  qualityAutomationStatus?: ValidationManifestRun["qualityAutomationStatus"];
  qualityAutomationLiveUpdateCount?: ValidationManifestRun["qualityAutomationLiveUpdateCount"];
  qualityAutomationNextTargetCount?: ValidationManifestRun["qualityAutomationNextTargetCount"];
  qualityAutomationFailureCount?: ValidationManifestRun["qualityAutomationFailureCount"];
  platformPublishingPlatform?: ValidationManifestRun["platformPublishingPlatform"];
  platformPublishingStatus?: ValidationManifestRun["platformPublishingStatus"];
  platformPublishingFreshnessStatus?: ValidationManifestRun["platformPublishingFreshnessStatus"];
  platformPublishingCheckedAt?: ValidationManifestRun["platformPublishingCheckedAt"];
  platformPublishingFreshnessAgeMinutes?: ValidationManifestRun["platformPublishingFreshnessAgeMinutes"];
  platformPublishingObservedAgeMinutes?: ValidationManifestRun["platformPublishingObservedAgeMinutes"];
  platformPublishingYoutubeHasBroadcastId?: ValidationManifestRun["platformPublishingYoutubeHasBroadcastId"];
  platformPublishingYoutubeHasStreamId?: ValidationManifestRun["platformPublishingYoutubeHasStreamId"];
  platformPublishingYoutubeBroadcastStatus?: ValidationManifestRun["platformPublishingYoutubeBroadcastStatus"];
  platformPublishingYoutubeStreamStatus?: ValidationManifestRun["platformPublishingYoutubeStreamStatus"];
  platformPublishingYoutubeHealthStatus?: ValidationManifestRun["platformPublishingYoutubeHealthStatus"];
  platformPublishingYoutubeHealthIssueCount?: ValidationManifestRun["platformPublishingYoutubeHealthIssueCount"];
  platformPublishingTwitchLiveStatus?: ValidationManifestRun["platformPublishingTwitchLiveStatus"];
  platformPublishingTwitchStartedAt?: ValidationManifestRun["platformPublishingTwitchStartedAt"];
  platformPublishingTwitchHasCategoryId?: ValidationManifestRun["platformPublishingTwitchHasCategoryId"];
  platformPublishingTwitchChannelTitle?: ValidationManifestRun["platformPublishingTwitchChannelTitle"];
  platformPublishingTwitchChannelCategory?: ValidationManifestRun["platformPublishingTwitchChannelCategory"];
  platformPublishingTwitchChannelCategoryId?: ValidationManifestRun["platformPublishingTwitchChannelCategoryId"];
  platformPublishingTwitchChannelLanguage?: ValidationManifestRun["platformPublishingTwitchChannelLanguage"];
  platformPublishingTwitchViewerCount?: ValidationManifestRun["platformPublishingTwitchViewerCount"];
  sceneFingerprint?: ValidationManifestRun["sceneFingerprint"];
}): ValidationManifestRun => ({
  id: `validation-${devicePlatform}`,
  fingerprint,
  createdAt: "2026-06-23T11:00:00.000Z",
  ageDays: 0,
  fresh,
  matchesScope,
  eligible,
  devicePlatform,
  androidPublisherMode,
  deviceName: devicePlatform === "ios" ? "iPhone 15 Pro" : "Pixel 8 Pro",
  osVersion: devicePlatform === "ios" ? "iOS 18.5" : "Android 15",
  physicalDevice,
  physicalDeviceStatus,
  appBuild,
  networkProfile: "private test",
  sceneFingerprint,
  targetPlatform,
  transport,
  result,
  nativeRuntimePlatform: nativeRuntimePlatform ?? devicePlatform,
  nativeRuntimeStatus,
  nativeRuntimeVideoEncoderBackend,
  nativeRuntimeAudioEncoderBackend,
  nativeRuntimeEncoderProbeStatus,
  nativeRuntimeEncoderProbeVideoBackend,
  nativeRuntimeEncoderProbeAudioBackend,
  nativeRuntimeCongested,
  nativeRuntimeQueuedItems,
  nativeRuntimeCacheSize,
  nativeRuntimeDroppedVideoFrames,
  nativeRuntimeDroppedAudioFrames,
  nativeRuntimeCompositionStatus,
  nativeRuntimeCompositionAppliedCount,
  nativeRuntimeCompositionAppliedKinds,
  nativeRuntimeCompositionSkippedCount,
  nativeRuntimeCompositionSkippedKinds,
  nativeRuntimeSentVideoFrames,
  nativeRuntimeSentAudioFrames,
  nativeRuntimeBytesWritten,
  nativeRuntimeVideoFrameIntervalSampleCount,
  nativeRuntimeVideoFrameIntervalAverageMs,
  nativeRuntimeVideoFrameIntervalMaxMs,
  nativeRuntimeVideoFrameIntervalJitterMs,
  nativeRuntimeStillImageAssetCount,
  nativeRuntimeStillImageAssetLoadedCount,
  nativeRuntimeStillImageAssetMissingCount,
  nativeRuntimeStillImageAssetDecodedCount,
  nativeRuntimeStillImageAssetDecodedPixelCount,
  nativeRuntimeStillImageAssetCompositedCount,
  nativeRuntimeStillImageAssetCompositedPixelCount,
  nativeRuntimeCompositorBackend,
  nativeRuntimeCompositedFrameCount,
  nativeRuntimeDroppedFrameCount,
  nativeRuntimeCompositionFailureCount,
  nativeRuntimeLiveRenderGraphReloadCount,
  nativeRuntimeLiveRenderGraphRejectedUpdateCount,
  nativeRuntimeStillImageAssetAppGroupCount,
  nativeRuntimeStillImageAssetAppGroupLoadedCount,
  nativeRuntimeStillImageAssetAppGroupDecodedCount,
  nativeRuntimeStillImageAssetAppGroupDecodedPixelCount,
  nativeRuntimeStillImageAssetAppGroupCompositedCount,
  nativeRuntimeStillImageAssetAppGroupCompositedPixelCount,
  nativeRuntimeLive2dSourceCount,
  nativeRuntimeLive2dPosePayloadCount,
  nativeRuntimeLive2dActivePoseCount,
  nativeRuntimeLive2dMissingPoseCount,
  nativeRuntimeLive2dRuntimeStatuses,
  nativeRuntimeVrmSourceCount,
  nativeRuntimeVrmPosePayloadCount,
  nativeRuntimeVrmActivePoseCount,
  nativeRuntimeVrmMissingPoseCount,
  nativeRuntimeVrmRendererStatus,
  nativeRuntimeVrmRendererBackend,
  nativeRuntimeVrmModelLoadedCount,
  nativeRuntimeVrmModelVersions,
  nativeRuntimeVrmHumanoidBoneCount,
  nativeRuntimeVrmExpressionCount,
  nativeRuntimeVrmMeshPrimitiveCount,
  nativeRuntimeVrmSkinnedMeshPrimitiveCount,
  nativeRuntimeVrmSkinJointCount,
  nativeRuntimeVrmPositionAccessorCount,
  nativeRuntimeVrmVertexCount,
  nativeRuntimeVrmIndexCount,
  nativeRuntimeVrmBoundsAccessorCount,
  nativeRuntimeVrmSkinningAttributePrimitiveCount,
  nativeRuntimeVrmTrianglePrimitiveCount,
  nativeRuntimeVrmUnsupportedPrimitiveModeCount,
  nativeRuntimeVrmNormalAccessorCount,
  nativeRuntimeVrmTexcoordAccessorCount,
  nativeRuntimeVrmMorphTargetCount,
  nativeRuntimeVrmMaterialCount,
  nativeRuntimeVrmTextureCount,
  nativeRuntimeVrmImageCount,
  nativeRuntimeVrmUnsupportedImageMimeCount,
  nativeRuntimeVrmTransparentMaterialCount,
  nativeRuntimeVrmPoseBoneCount,
  nativeRuntimeVrmPoseBoneAppliedCount,
  nativeRuntimeVrmPoseBoneUnsupportedCount,
  nativeRuntimeVrmPoseExpressionCount,
  nativeRuntimeVrmPoseExpressionAppliedCount,
  nativeRuntimeVrmPoseExpressionUnsupportedCount,
  nativeRuntimeVrmRenderedSourceCount,
  nativeRuntimeVrmRenderMissingCount,
  nativeRuntimeVrmRenderFailureCount,
  monitorHoldStatus,
  monitorHoldSampleCount,
  monitorHoldDurationSeconds,
  monitorHoldStability,
  monitorHoldAverageBitrateKbps,
  monitorHoldMinimumBitrateKbps,
  monitorHoldAverageFps,
  monitorHoldMinimumFps,
  monitorHoldDroppedFrameIncrease,
  monitorHoldObservedReconnectAttempts,
  faceTrackingStatus,
  faceTrackingRuntimeFresh,
  faceTrackingRuntimeAgeMs,
  faceTrackingFaceLandmarkConfidence,
  faceTrackingFaceLandmarkReady,
  faceTrackingPreparedPngTuberCount,
  faceTrackingVisibleVrmCount,
  faceTrackingNativeVrmRendererReady,
  faceTrackingActiveMotionCount,
  faceTrackingRigIssueCount,
  faceTrackingRigQualityScore,
  faceTrackingRigQualityGrade,
  faceTrackingRigPartSeparationScore,
  faceTrackingRigDepthContinuityScore,
  faceTrackingRigSemanticSegmentScore,
  faceTrackingRigEyeMouthSegmentScore,
  faceTrackingRigHorizontalAnchorScore,
  faceTrackingRigHighFidelityScore,
  faceTrackingRigHighFidelityGrade,
  audioStatus,
  audioOutputRoute,
  audioMonitorHeadphonesOnly,
  audioNativeMonitorRoute,
  audioNativeMonitorRouteMatchesOutput,
  audioNativeMonitorHeadphonesConnected,
  audioNativeMonitorWrittenFrames,
  audioNativeMonitorDroppedFrames,
  audioNativeMonitorWrittenBuffers,
  audioNativeMonitorDroppedBuffers,
  audioMonitorLatencyStatus,
  audioMonitorLatencyMs,
  audioMonitorLatencyBudgetMs,
  audioMonitorLatencySource,
  audioMonitorTuningNote,
  audioBluetoothRoute,
  audioBluetoothTuningReviewed,
  chatReadoutStatus,
  chatReadoutSpokenMessageCount,
  chatReadoutSpeechFailureCount,
  qualityAutomationStatus,
  qualityAutomationLiveUpdateCount,
  qualityAutomationNextTargetCount,
  qualityAutomationFailureCount,
  platformPublishingPlatform,
  platformPublishingStatus,
  platformPublishingFreshnessStatus,
  platformPublishingCheckedAt,
  platformPublishingFreshnessAgeMinutes,
  platformPublishingObservedAgeMinutes,
  platformPublishingYoutubeHasBroadcastId,
  platformPublishingYoutubeHasStreamId,
  platformPublishingYoutubeBroadcastStatus,
  platformPublishingYoutubeStreamStatus,
  platformPublishingYoutubeHealthStatus,
  platformPublishingYoutubeHealthIssueCount,
  platformPublishingTwitchLiveStatus,
  platformPublishingTwitchStartedAt,
  platformPublishingTwitchHasCategoryId,
  platformPublishingTwitchChannelTitle,
  platformPublishingTwitchChannelCategory,
  platformPublishingTwitchChannelCategoryId,
  platformPublishingTwitchChannelLanguage,
  platformPublishingTwitchViewerCount,
  summary: "Validation run retained.",
  recommendation: "Keep this run with release evidence."
});
