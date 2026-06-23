import { describe, expect, it } from "vitest";
import type { PlatformPublishingFreshness } from "./platformPublishingFreshness";
import { createDefaultStudioProfile } from "./profiles";
import {
  createPublicLaunchChecklist,
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
    expect(checklist.passCount).toBe(6);
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

  it("warns when dashboard evidence is stale", () => {
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
    expect(checklist.canStart).toBe(true);
    expect(checklist.items.find((item) => item.id === "platform-dashboard")).toMatchObject({
      status: "warn"
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
});
