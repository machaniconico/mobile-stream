import { describe, expect, it } from "vitest";
import {
  appendStreamSessionEvent,
  createStreamAnnouncementAutoPostEvent,
  createStreamChatEvent,
  createStreamChatReconnectEvent,
  createStreamOperationEvent,
  createStreamPlatformApiOperationEvent,
  createStreamQualityAutomationEvent,
  createStreamRecoveryEvent,
  createStreamSafetyEvent,
  createStreamStatusEvent,
  maxStreamSessionEvents,
  type StreamSessionEvent,
  type StreamSessionSnapshot
} from "./streamSessionLog";
import { createStreamRecoveryAutomationDecision } from "./streamRecovery";
import { createDefaultStudioProfile } from "./profiles";
import { initialStreamState, type StreamHealth } from "./streamState";

const quality = createDefaultStudioProfile().quality;
const health = (update: Partial<StreamHealth> = {}): StreamHealth => ({
  ...initialStreamState.health,
  ...update
});
const snapshot = (status: StreamSessionSnapshot["state"]["status"], update: Partial<StreamHealth> = {}): StreamSessionSnapshot => ({
  state: { status },
  health: health(update)
});

describe("stream session log", () => {
  it("keeps the newest bounded events", () => {
    const events = Array.from({ length: maxStreamSessionEvents + 5 }).reduce<StreamSessionEvent[]>(
      (current, _, index) =>
        appendStreamSessionEvent(current, {
          id: `event-${index}`,
          at: new Date(index).toISOString(),
          kind: "status",
          severity: "info",
          title: `Event ${index}`,
          message: `Message ${index}`
        }),
      []
    );

    expect(events).toHaveLength(maxStreamSessionEvents);
    expect(events[0].id).toBe("event-5");
    expect(events.at(-1)?.id).toBe(`event-${maxStreamSessionEvents + 4}`);
  });

  it("creates status transition events and ignores unchanged states", () => {
    const started = createStreamStatusEvent(null, snapshot("idle"), new Date("2026-06-23T00:00:00.000Z"));
    const unchanged = createStreamStatusEvent(snapshot("live"), snapshot("live"), new Date("2026-06-23T00:00:01.000Z"));
    const failed = createStreamStatusEvent(
      snapshot("live"),
      snapshot("failed", { message: "RTMP handshake failed" }),
      new Date("2026-06-23T00:00:02.000Z")
    );

    expect(started?.title).toBe("Stream idle");
    expect(unchanged).toBeNull();
    expect(failed?.severity).toBe("fail");
    expect(failed?.message).toContain("live -> failed");
  });

  it("creates stream operation events", () => {
    const started = createStreamOperationEvent("start", "started", "Starting stream", new Date("2026-06-23T00:00:00.000Z"));
    const failed = createStreamOperationEvent("reconnect", "failed", "Reconnect failed", new Date("2026-06-23T00:00:01.000Z"));
    const cancelled = createStreamOperationEvent("start", "cancelled", "Public launch confirmation cancelled.", new Date("2026-06-23T00:00:02.000Z"));

    expect(started.title).toBe("Start started");
    expect(started.severity).toBe("info");
    expect(failed.title).toBe("Reconnect failed");
    expect(failed.severity).toBe("fail");
    expect(cancelled.title).toBe("Start cancelled");
    expect(cancelled.severity).toBe("info");
  });

  it("creates platform API operation audit events", () => {
    const started = createStreamPlatformApiOperationEvent(
      {
        label: "Platform stream key sync",
        phase: "started"
      },
      new Date("2026-06-23T00:00:00.000Z")
    );
    const failed = createStreamPlatformApiOperationEvent(
      {
        label: "YouTube broadcast live",
        phase: "failed",
        message: "YouTube broadcast transition failed with HTTP 503.",
        retryDelayLabel: "30s"
      },
      new Date("2026-06-23T00:00:01.000Z")
    );
    const skipped = createStreamPlatformApiOperationEvent(
      {
        label: "OAuth callback exchange",
        phase: "skipped",
        message: "OAuth callback exchange skipped because Twitch device OAuth polling is already running."
      },
      new Date("2026-06-23T00:00:02.000Z")
    );

    expect(started).toMatchObject({
      kind: "platform-api",
      severity: "info",
      title: "Platform stream key sync started",
      message: "Platform stream key sync started."
    });
    expect(failed).toMatchObject({
      severity: "fail",
      title: "YouTube broadcast live failed"
    });
    expect(failed.message).toContain("Retry guidance: wait 30s.");
    expect(skipped).toMatchObject({
      severity: "warn",
      title: "OAuth callback exchange skipped"
    });
  });

  it("creates Discord announcement autopost audit events", () => {
    const posted = createStreamAnnouncementAutoPostEvent(
      {
        phase: "posted",
        message: "Discord announcement posted. Content: Live now!"
      },
      new Date("2026-06-23T00:00:00.000Z")
    );
    const failed = createStreamAnnouncementAutoPostEvent(
      {
        phase: "failed",
        message: "Discord webhook post failed with HTTP 429. Retry after 3s."
      },
      new Date("2026-06-23T00:00:01.000Z")
    );

    expect(posted).toMatchObject({
      kind: "announcement",
      severity: "info",
      title: "Discord announcement posted"
    });
    expect(failed).toMatchObject({
      kind: "announcement",
      severity: "warn",
      title: "Discord announcement failed"
    });
  });

  it("creates privacy shield safety events", () => {
    const armed = createStreamSafetyEvent(
      "privacy-shield-armed",
      " Privacy Shield switched to blackout. \n Audio muted. ",
      new Date("2026-06-23T00:00:00.000Z")
    );
    const failed = createStreamSafetyEvent(
      "privacy-shield-failed",
      "Native update failed.",
      new Date("2026-06-23T00:00:01.000Z")
    );

    expect(armed).toMatchObject({
      kind: "safety",
      severity: "warn",
      title: "Privacy shield armed",
      message: "Privacy Shield switched to blackout. Audio muted."
    });
    expect(failed).toMatchObject({
      kind: "safety",
      severity: "fail",
      title: "Privacy shield failed"
    });
  });

  it("creates public launch safety confirmation events", () => {
    const confirmed = createStreamSafetyEvent(
      "public-launch-confirmed",
      "YouTube Public launch confirmation accepted.",
      new Date("2026-06-23T00:00:00.000Z")
    );
    const cancelled = createStreamSafetyEvent(
      "public-launch-cancelled",
      "Twitch launch confirmation cancelled.",
      new Date("2026-06-23T00:00:01.000Z")
    );

    expect(confirmed).toMatchObject({
      kind: "safety",
      severity: "info",
      title: "Public launch confirmed"
    });
    expect(cancelled).toMatchObject({
      kind: "safety",
      severity: "warn",
      title: "Public launch cancelled"
    });
  });

  it("creates chat auto-connect events", () => {
    const started = createStreamChatEvent(
      "auto-connect-started",
      "Starting YouTube chat readout connection.",
      "info",
      new Date("2026-06-23T00:00:00.000Z")
    );
    const skipped = createStreamChatEvent(
      "auto-connect-skipped",
      "Platform chat auto-connect skipped because chat readout is off.",
      "warn",
      new Date("2026-06-23T00:00:01.000Z")
    );
    const stopped = createStreamChatEvent(
      "auto-disconnect-stopped",
      "Stopping stream disconnected platform chat readout.",
      "info",
      new Date("2026-06-23T00:00:02.000Z")
    );

    expect(started.kind).toBe("chat");
    expect(started.title).toBe("Chat auto-connect started");
    expect(started.severity).toBe("info");
    expect(skipped.title).toBe("Chat auto-connect skipped");
    expect(skipped.severity).toBe("warn");
    expect(stopped.title).toBe("Chat auto-disconnect stopped");
    expect(stopped.severity).toBe("info");
  });

  it("creates chat reconnect events from reconnect decisions", () => {
    const scheduled = createStreamChatReconnectEvent(
      {
        command: "schedule-reconnect",
        key: "chat-1",
        delayMs: 2000,
        reason: "Twitch chat socket closed.",
        severity: "warn",
        attemptsUsed: 2,
        maxAttempts: 5,
        state: {
          attemptsUsed: 2,
          lastFailureKey: "chat-1",
          scheduledKey: "chat-1",
          exhaustedKey: null
        }
      },
      new Date("2026-06-23T00:00:02.000Z")
    );
    const exhausted = createStreamChatReconnectEvent(
      {
        command: "give-up",
        key: "chat-1",
        delayMs: null,
        reason: "Platform chat reconnect stopped after 5 failed attempts.",
        severity: "fail",
        attemptsUsed: 5,
        maxAttempts: 5,
        state: {
          attemptsUsed: 5,
          lastFailureKey: "chat-1",
          scheduledKey: null,
          exhaustedKey: "chat-1"
        }
      },
      new Date("2026-06-23T00:00:03.000Z")
    );

    expect(scheduled).toMatchObject({
      kind: "chat",
      severity: "warn",
      title: "Chat reconnect scheduled"
    });
    expect(scheduled?.message).toContain("Retrying chat in 2s (2/5).");
    expect(exhausted).toMatchObject({
      kind: "chat",
      severity: "fail",
      title: "Chat reconnect exhausted"
    });
  });

  it("creates recovery events for scheduled reconnect and exhausted retry budget", () => {
    const scheduledDecision = createStreamRecoveryAutomationDecision({
      snapshot: snapshot("failed", { reconnectAttempts: 2 }),
      quality,
      canStart: true,
      operationInFlight: false,
      now: 1000
    });
    const exhaustedDecision = createStreamRecoveryAutomationDecision({
      snapshot: snapshot("live", {
        bitrateKbps: Math.round(quality.videoBitrateKbps * 0.2),
        fps: quality.fps - 15,
        elapsedSeconds: 30,
        reconnectAttempts: 5
      }),
      quality,
      canStart: true,
      operationInFlight: false,
      now: 1000
    });

    const scheduled = createStreamRecoveryEvent(scheduledDecision, new Date("2026-06-23T00:00:00.000Z"));
    const exhausted = createStreamRecoveryEvent(exhaustedDecision, new Date("2026-06-23T00:00:01.000Z"));

    expect(scheduled?.title).toBe("Auto recovery scheduled");
    expect(scheduled?.message).toContain("Attempts 2/5");
    expect(exhausted?.title).toBe("Auto recovery stopped stream");
    expect(exhausted?.severity).toBe("fail");
  });

  it("creates quality automation events and ignores idle decisions", () => {
    const idle = createStreamQualityAutomationEvent(
      {
        command: "none",
        key: null,
        severity: "info",
        title: "Quality automation idle",
        summary: "Current quality target is acceptable.",
        reason: "",
        action: "Keep the current quality target.",
        currentTarget: {
          profileId: quality.id,
          profileName: quality.name,
          width: quality.width,
          height: quality.height,
          fps: quality.fps,
          videoBitrateKbps: quality.videoBitrateKbps,
          audioBitrateKbps: quality.audioBitrateKbps,
          estimatedUploadKbps: 4535
        },
        suggestedTarget: null
      },
      new Date("2026-06-23T00:00:00.000Z")
    );
    const event = createStreamQualityAutomationEvent(
      {
        command: "apply-next-target",
        key: "quality-lower",
        severity: "warn",
        title: "Auto quality target lowered",
        summary: "Next stream target will use Balanced 720p.",
        reason: "Bitrate critical.",
        action: "The safer target can be applied for the next start.",
        currentTarget: {
          profileId: "quality-sharp",
          profileName: "Sharp 1080p",
          width: 1920,
          height: 1080,
          fps: 60,
          videoBitrateKbps: 6500,
          audioBitrateKbps: 160,
          estimatedUploadKbps: 8325
        },
        suggestedTarget: {
          profileId: quality.id,
          profileName: quality.name,
          width: quality.width,
          height: quality.height,
          fps: quality.fps,
          videoBitrateKbps: quality.videoBitrateKbps,
          audioBitrateKbps: quality.audioBitrateKbps,
          estimatedUploadKbps: 4535
        }
      },
      new Date("2026-06-23T00:00:01.000Z")
    );

    expect(idle).toBeNull();
    expect(event).toMatchObject({
      kind: "quality",
      severity: "warn",
      title: "Auto quality target lowered"
    });
    expect(event?.message).toContain("Bitrate critical");
  });
});
