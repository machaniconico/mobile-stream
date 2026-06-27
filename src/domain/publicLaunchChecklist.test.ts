import { describe, expect, it } from "vitest";
import type { PlatformPublishingFreshness } from "./platformPublishingFreshness";
import { createDefaultStudioProfile } from "./profiles";
import {
  createPublicLaunchChecklist,
  formatPublicLaunchChecklistBlockMessage,
  type PublicLaunchChecklistInput
} from "./publicLaunchChecklist";
import type { StreamStartPreflightReport } from "./streamStartPreflight";

const readyPreflight: StreamStartPreflightReport = {
  canStart: true,
  status: "ready",
  summary: "Launch preflight is ready.",
  primaryAction: "Start the stream when you are ready.",
  blocks: [],
  warnings: [],
  issues: []
};

const freshDashboard: PlatformPublishingFreshness = {
  status: "fresh",
  platformLabel: "YouTube",
  checkedAt: "2026-06-23T00:05:00.000Z",
  ageMinutes: 5,
  summary: "YouTube dashboard status was checked 5 minutes ago.",
  recommendation: "Keep this fresh dashboard snapshot with the release-candidate validation run."
};

const readyDiagnostics = (): PublicLaunchChecklistInput["diagnostics"] => ({
  target: {
    platform: "YouTube Live",
    presetName: "YouTube Live",
    protocol: "rtmps",
    host: "a.rtmp.youtube.com",
    application: "live2",
    publishUrlPreview: "rtmps://a.rtmp.youtube.com/live2",
    streamKeyPreview: "redacted",
    secureTransport: true
  },
  telemetry: {
    enginePlatform: "ios",
    streamStatus: "idle",
    bitrateKbps: 0,
    fps: 0,
    droppedFrames: 0,
    reconnectAttempts: 0,
    elapsedSeconds: 0,
    message: ""
  },
  audio: {
    micEffectsEnabled: true,
    presetId: "broadcast",
    inputGainDb: 0,
    compression: 0.5,
    monitorEnabled: true,
    monitorVolume: 0.5,
    monitorHeadphonesOnly: true,
    monitorSafety: {
      status: "pass",
      route: "wired-headphones",
      outputName: "Wired headphones",
      headphonesConnected: true,
      stale: false,
      checkedAt: "2026-06-23T00:05:00.000Z",
      summary: "Headphones-only monitor is routed to Wired headphones.",
      recommendation: "Keep headphones connected while monitoring."
    }
  },
  faceTracking: {
    status: "pass",
    enabled: true,
    inputMode: "native-camera",
    rigMode: "still-image-2d",
    runtimeStatus: "tracking",
    visibleAvatarCount: 1,
    visiblePngTuberCount: 1,
    visibleLive2DCount: 0,
    preparedPngTuberCount: 1,
    activeMotionCount: 1,
    summary: "Face tracking is ready with 1 prepared PNGTuber source.",
    recommendation: "Keep this tracker state with the next private iOS/Android validation run."
  },
  chatReadout: {
    platformChatEnabled: true,
    readerEnabled: true,
    connectionPhase: "connected",
    connectionLabel: "YouTube Live chat",
    connectionMessage: "YouTube Live chat is connected."
  },
  platformPublishing: {
    platform: "youtube-live",
    status: "pass",
    summary: "YouTube broadcast is bound and healthy.",
    recommendation: "Keep the bound broadcast unchanged.",
    youtube: {
      hasBroadcastId: true,
      hasStreamId: true,
      broadcastStatus: "testing",
      streamStatus: "active",
      healthStatus: "good",
      healthIssueCount: 0,
      statusCheckedAt: "2026-06-23T00:05:00.000Z"
    },
    twitch: null
  },
  validation: {
    status: "ready",
    summary: "Commercial validation is ready.",
    recommendedNextStep: "Retain release-candidate evidence.",
    passCount: 8,
    warningCount: 0,
    failCount: 0,
    pendingCount: 0,
    items: []
  },
  validationRunbook: {
    status: "complete",
    summary: "Private RTMP(S) validation runbook is complete for this target.",
    nextAction: "Export diagnostics and support bundle for the retained release-candidate validation run.",
    passCount: 10,
    warningCount: 0,
    failCount: 0,
    pendingCount: 0,
    items: []
  }
});

const youtubePublicProfile = (): NonNullable<PublicLaunchChecklistInput["profile"]> => ({
  ...createDefaultStudioProfile(),
  platformPublishing: {
    ...createDefaultStudioProfile().platformPublishing,
    privacyStatus: "public"
  }
});

const youtubePrivateProfile = (): NonNullable<PublicLaunchChecklistInput["profile"]> => ({
  ...createDefaultStudioProfile(),
  platformPublishing: {
    ...createDefaultStudioProfile().platformPublishing,
    privacyStatus: "private"
  }
});

const twitchProfile = (): NonNullable<PublicLaunchChecklistInput["profile"]> => ({
  ...createDefaultStudioProfile(),
  destination: {
    ...createDefaultStudioProfile().destination,
    platform: "twitch"
  }
});

describe("public launch checklist", () => {
  it("marks a fully proven public launch as ready", () => {
    const checklist = createPublicLaunchChecklist({
      preflight: readyPreflight,
      diagnostics: readyDiagnostics(),
      platformPublishingFreshness: freshDashboard,
      profile: youtubePublicProfile()
    });

    expect(checklist.status).toBe("ready");
    expect(checklist.canStart).toBe(true);
    expect(checklist.startLock).toMatchObject({ applies: true, blocked: false });
    expect(checklist.passCount).toBe(7);
    expect(checklist.summary).toBe("Public launch checklist is ready.");
  });

  it("carries hard Go Live preflight blocks into the public checklist", () => {
    const destinationBlock: StreamStartPreflightReport["blocks"][number] = {
      code: "readiness-stream-key-required",
      severity: "block",
      area: "destination",
      label: "Stream key",
      message: "Stream key is required.",
      recommendation: "Paste the destination stream key."
    };
    const checklist = createPublicLaunchChecklist({
      preflight: {
        ...readyPreflight,
        canStart: false,
        status: "blocked",
        blocks: [destinationBlock],
        issues: [destinationBlock]
      },
      diagnostics: readyDiagnostics(),
      platformPublishingFreshness: freshDashboard,
      profile: youtubePublicProfile()
    });

    expect(checklist.status).toBe("blocked");
    expect(checklist.canStart).toBe(false);
    expect(checklist.items.find((item) => item.id === "destination")).toMatchObject({
      status: "fail",
      action: "Paste the destination stream key."
    });
  });

  it("warns when spoken chat is not enabled even if basic launch can start", () => {
    const diagnostics = readyDiagnostics();
    const checklist = createPublicLaunchChecklist({
      preflight: readyPreflight,
      diagnostics: {
        ...diagnostics,
        chatReadout: {
          ...diagnostics.chatReadout,
          readerEnabled: false
        }
      },
      platformPublishingFreshness: freshDashboard
    });

    expect(checklist.status).toBe("warning");
    expect(checklist.canStart).toBe(true);
    expect(checklist.items.find((item) => item.id === "chat-readout")).toMatchObject({
      status: "warn",
      label: "Chat readout"
    });
  });

  it("blocks public launch when chat safety warnings remain", () => {
    const chatSafetyWarning: StreamStartPreflightReport["warnings"][number] = {
      code: "chat-reader-url-redaction-disabled",
      severity: "warning",
      area: "chat",
      label: "Chat safety",
      message: "Chat readout URL redaction is turned off.",
      recommendation: "Turn URL redaction on before public streams."
    };
    const checklist = createPublicLaunchChecklist({
      preflight: {
        ...readyPreflight,
        status: "warning",
        warnings: [chatSafetyWarning],
        issues: [chatSafetyWarning]
      },
      diagnostics: readyDiagnostics(),
      platformPublishingFreshness: freshDashboard,
      profile: twitchProfile()
    });

    expect(checklist.status).toBe("warning");
    expect(checklist.canStart).toBe(false);
    expect(checklist.startLock).toMatchObject({ applies: true, blocked: true });
    expect(checklist.items.find((item) => item.id === "chat-readout")).toMatchObject({
      status: "warn",
      detail: "Chat readout URL redaction is turned off."
    });
  });

  it("blocks public launch when avatar tracking warnings remain", () => {
    const avatarWarning: StreamStartPreflightReport["warnings"][number] = {
      code: "avatar-face-tracking-not-production-ready",
      severity: "warning",
      area: "avatar",
      label: "Avatar tracking",
      message: "Face tracking is using simulated input.",
      recommendation: "Switch to native camera input before public launch."
    };
    const checklist = createPublicLaunchChecklist({
      preflight: {
        ...readyPreflight,
        status: "warning",
        warnings: [avatarWarning],
        issues: [avatarWarning]
      },
      diagnostics: readyDiagnostics(),
      platformPublishingFreshness: freshDashboard,
      profile: youtubePublicProfile()
    });

    expect(checklist.status).toBe("warning");
    expect(checklist.canStart).toBe(false);
    expect(checklist.startLock).toMatchObject({ applies: true, blocked: true });
    expect(checklist.items.find((item) => item.id === "avatar-tracking")).toMatchObject({
      status: "warn",
      detail: "Face tracking is using simulated input.",
      action: "Switch to native camera input before public launch."
    });
  });

  it("blocks public launch when the platform dashboard timestamp is invalid", () => {
    const checklist = createPublicLaunchChecklist({
      preflight: readyPreflight,
      diagnostics: readyDiagnostics(),
      platformPublishingFreshness: {
        ...freshDashboard,
        status: "invalid",
        summary: "YouTube dashboard status timestamp is invalid.",
        recommendation: "Refresh YouTube status before release."
      },
      profile: youtubePublicProfile()
    });

    expect(checklist.status).toBe("blocked");
    expect(checklist.canStart).toBe(false);
    expect(checklist.startLock).toMatchObject({ applies: true, blocked: true });
    expect(checklist.items.find((item) => item.id === "platform-dashboard")).toMatchObject({
      status: "fail",
      action: "Refresh YouTube status before release."
    });
  });

  it("locks public launch when dashboard evidence is stale", () => {
    const checklist = createPublicLaunchChecklist({
      preflight: readyPreflight,
      diagnostics: readyDiagnostics(),
      platformPublishingFreshness: {
        ...freshDashboard,
        status: "stale",
        ageMinutes: 24,
        summary: "YouTube dashboard status is 24 minutes old.",
        recommendation: "Refresh YouTube status within 10 minutes of launch."
      },
      profile: youtubePublicProfile()
    });

    expect(checklist.status).toBe("warning");
    expect(checklist.canStart).toBe(false);
    expect(checklist.startLock).toMatchObject({
      applies: true,
      blocked: true,
      summary: "Public start lock is active because launch warnings remain.",
      action: "Refresh YouTube status within 10 minutes of launch."
    });
    expect(checklist.items.find((item) => item.id === "platform-dashboard")).toMatchObject({
      status: "warn"
    });
  });

  it("locks public launch when validation passed but the private runbook is not complete", () => {
    const diagnostics = readyDiagnostics();
    const checklist = createPublicLaunchChecklist({
      preflight: readyPreflight,
      diagnostics: {
        ...diagnostics,
        validationRunbook: {
          ...diagnostics.validationRunbook,
          status: "record",
          summary: "1 validation step remains before release evidence is complete.",
          nextAction:
            "Run a controlled weak-network private stream and retain live quality update or next-start fallback evidence.",
          passCount: 9,
          warningCount: 1,
          pendingCount: 0
        }
      },
      platformPublishingFreshness: freshDashboard,
      profile: youtubePublicProfile()
    });

    expect(checklist.status).toBe("warning");
    expect(checklist.canStart).toBe(false);
    expect(checklist.startLock).toMatchObject({
      applies: true,
      blocked: true,
      summary: "Public start lock is active because launch warnings remain.",
      action: expect.stringContaining("controlled weak-network")
    });
    expect(checklist.items.find((item) => item.id === "commercial-evidence")).toMatchObject({
      status: "warn",
      detail: "1 validation step remains before release evidence is complete.",
      action: expect.stringContaining("controlled weak-network")
    });
  });

  it("locks public launch when spoken chat readout is disabled", () => {
    const diagnostics = readyDiagnostics();
    const checklist = createPublicLaunchChecklist({
      preflight: readyPreflight,
      diagnostics: {
        ...diagnostics,
        chatReadout: {
          ...diagnostics.chatReadout,
          readerEnabled: false
        }
      },
      platformPublishingFreshness: freshDashboard,
      profile: youtubePublicProfile()
    });

    expect(checklist.status).toBe("warning");
    expect(checklist.canStart).toBe(false);
    expect(checklist.startLock).toMatchObject({
      applies: true,
      blocked: true,
      action: "Turn on chat readout and verify one sample message is queued and spoken."
    });
  });

  it("locks public launch when headphone mic monitoring is muted", () => {
    const diagnostics = readyDiagnostics();
    const checklist = createPublicLaunchChecklist({
      preflight: readyPreflight,
      diagnostics: {
        ...diagnostics,
        audio: {
          ...diagnostics.audio,
          monitorVolume: 0
        }
      },
      platformPublishingFreshness: freshDashboard,
      profile: twitchProfile()
    });

    expect(checklist.status).toBe("warning");
    expect(checklist.canStart).toBe(false);
    expect(checklist.startLock).toMatchObject({
      applies: true,
      blocked: true,
      action: "Raise monitor volume to an audible level and confirm the processed voice in headphones."
    });
  });

  it("does not lock private validation starts when the public checklist has a fail", () => {
    const checklist = createPublicLaunchChecklist({
      preflight: readyPreflight,
      diagnostics: readyDiagnostics(),
      platformPublishingFreshness: {
        ...freshDashboard,
        status: "invalid",
        summary: "YouTube dashboard status timestamp is invalid.",
        recommendation: "Refresh YouTube status before release."
      },
      profile: youtubePrivateProfile()
    });

    expect(checklist.status).toBe("blocked");
    expect(checklist.canStart).toBe(true);
    expect(checklist.startLock).toMatchObject({ applies: false, blocked: false });
  });

  it("locks Twitch starts when public checklist failures remain", () => {
    const checklist = createPublicLaunchChecklist({
      preflight: readyPreflight,
      diagnostics: readyDiagnostics(),
      platformPublishingFreshness: {
        ...freshDashboard,
        status: "invalid",
        summary: "Twitch dashboard status timestamp is invalid.",
        recommendation: "Refresh Twitch status before release."
      },
      profile: twitchProfile()
    });

    expect(checklist.status).toBe("blocked");
    expect(checklist.canStart).toBe(false);
    expect(checklist.startLock).toMatchObject({ applies: true, blocked: true });
  });

  it("locks public starts when the mobile app is using the mock engine", () => {
    const diagnostics = readyDiagnostics();
    const checklist = createPublicLaunchChecklist({
      preflight: readyPreflight,
      diagnostics: {
        ...diagnostics,
        telemetry: {
          ...diagnostics.telemetry,
          enginePlatform: "mock"
        }
      },
      platformPublishingFreshness: freshDashboard,
      profile: youtubePublicProfile()
    });

    expect(checklist.status).toBe("blocked");
    expect(checklist.canStart).toBe(false);
    expect(checklist.startLock).toMatchObject({ applies: true, blocked: true });
    expect(checklist.items.find((item) => item.id === "engine")).toMatchObject({
      status: "fail",
      detail: "Native streaming engine is not active; current engine platform is mock."
    });

    const twitchChecklist = createPublicLaunchChecklist({
      preflight: readyPreflight,
      diagnostics: {
        ...diagnostics,
        telemetry: {
          ...diagnostics.telemetry,
          enginePlatform: "mock"
        }
      },
      platformPublishingFreshness: freshDashboard,
      profile: twitchProfile()
    });

    expect(twitchChecklist.canStart).toBe(false);
    expect(twitchChecklist.items.find((item) => item.id === "engine")).toMatchObject({ status: "fail" });
  });

  it("locks public starts when engine platform evidence is missing", () => {
    const diagnostics = readyDiagnostics();
    const checklist = createPublicLaunchChecklist({
      preflight: readyPreflight,
      diagnostics: {
        ...diagnostics,
        telemetry: {
          ...diagnostics.telemetry,
          enginePlatform: "unknown"
        }
      },
      platformPublishingFreshness: freshDashboard,
      profile: youtubePublicProfile()
    });

    expect(checklist.canStart).toBe(false);
    expect(checklist.items.find((item) => item.id === "engine")).toMatchObject({
      status: "fail",
      detail: "Native streaming engine is not active; current engine platform is unknown."
    });
  });

  it("keeps private validation starts available on the mock engine", () => {
    const diagnostics = readyDiagnostics();
    const checklist = createPublicLaunchChecklist({
      preflight: readyPreflight,
      diagnostics: {
        ...diagnostics,
        telemetry: {
          ...diagnostics.telemetry,
          enginePlatform: "mock"
        }
      },
      platformPublishingFreshness: freshDashboard,
      profile: youtubePrivateProfile()
    });

    expect(checklist.status).toBe("ready");
    expect(checklist.canStart).toBe(true);
    expect(checklist.startLock).toMatchObject({ applies: false, blocked: false });
  });

  it("formats a start-layer block message for unsafe public starts", () => {
    const checklist = createPublicLaunchChecklist({
      preflight: readyPreflight,
      diagnostics: readyDiagnostics(),
      platformPublishingFreshness: {
        ...freshDashboard,
        status: "invalid",
        summary: "YouTube dashboard status timestamp is invalid.",
        recommendation: "Refresh YouTube status before release."
      },
      profile: youtubePublicProfile()
    });

    expect(formatPublicLaunchChecklistBlockMessage(checklist)).toContain("Public launch lock blocked");
    expect(formatPublicLaunchChecklistBlockMessage(checklist)).toContain("Platform dashboard");
    expect(formatPublicLaunchChecklistBlockMessage(checklist)).toContain("Refresh YouTube status before release.");
  });
});
