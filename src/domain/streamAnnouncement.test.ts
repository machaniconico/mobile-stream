import { describe, expect, it } from "vitest";
import { applyDestinationPreset, createDefaultStudioProfile, markDestinationCustom } from "./profiles";
import {
  createStreamAnnouncementPreview,
  createStreamAnnouncementText,
  defaultStreamAnnouncementTemplate,
  normalizeStreamAnnouncementSettings,
  streamAnnouncementContentMaxLength,
  streamAnnouncementTemplateMaxLength
} from "./streamAnnouncement";

describe("stream announcements", () => {
  it("expands title, platform, and YouTube broadcast watch URL placeholders", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        title: "Morning build stream",
        youtubeBroadcastId: "yt-broadcast-123"
      }
    };

    expect(createStreamAnnouncementText({ profile }, "{platform}: {title} {url}")).toBe(
      "YouTube: Morning build stream https://www.youtube.com/watch?v=yt-broadcast-123"
    );
  });

  it("collapses empty title and URL placeholders without leaving extra whitespace or blank lines", () => {
    const profile = applyDestinationPreset(createDefaultStudioProfile(), "twitch-auto");

    expect(createStreamAnnouncementText({ profile }, "Live now!\n{title}   {url}\n{platform}")).toBe("Live now!\nTwitch");
  });

  it("creates Twitch channel URLs from OAuth login values", () => {
    const profile = {
      ...applyDestinationPreset(createDefaultStudioProfile(), "twitch-auto"),
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        twitchChannelTitle: "Late-night drawing"
      }
    };

    expect(createStreamAnnouncementText({ profile, twitchLogin: "@Macha_Channel" }, "{title} on {platform} {url}")).toBe(
      "Late-night drawing on Twitch https://www.twitch.tv/macha_channel"
    );
  });

  it("omits custom RTMP URLs while keeping the destination preset name", () => {
    const baseProfile = createDefaultStudioProfile();
    const profile = {
      ...baseProfile,
      destination: markDestinationCustom(baseProfile.destination, {
        serverUrl: "rtmps://private-ingest.example/live"
      })
    };

    expect(createStreamAnnouncementText({ profile }, "{platform} {title} {url}")).toBe("Custom RTMPS");
  });

  it("redacts stream keys and OAuth-shaped secrets from unsafe templates", () => {
    const streamKey = "live-secret-stream-key-123";
    const profile = {
      ...createDefaultStudioProfile(),
      destination: {
        ...createDefaultStudioProfile().destination,
        streamKey
      },
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        title: "Safe title",
        youtubeBroadcastId: "yt-broadcast-123"
      }
    };

    const preview = createStreamAnnouncementPreview(
      { profile },
      `Live {title} ${streamKey} access_token=unsafe-oauth-token`
    );

    expect(preview.sensitiveValueRemoved).toBe(true);
    expect(preview.text).toContain("[redacted]");
    expect(preview.text).toContain("access_token=[redacted]");
    expect(preview.text).not.toContain(streamKey);
    expect(preview.text).not.toContain("unsafe-oauth-token");
  });

  it("keeps final announcement text within the Discord content limit", () => {
    const profile = {
      ...createDefaultStudioProfile(),
      platformPublishing: {
        ...createDefaultStudioProfile().platformPublishing,
        title: "A".repeat(streamAnnouncementContentMaxLength + 200),
        youtubeBroadcastId: "yt-broadcast-123"
      }
    };

    const preview = createStreamAnnouncementPreview({ profile }, "{title}");

    expect(preview.text).toHaveLength(streamAnnouncementContentMaxLength);
    expect(preview.truncated).toBe(true);
  });

  it("normalizes editable template settings for profile persistence", () => {
    const normalized = normalizeStreamAnnouncementSettings({
      template: `Watch\u0000 ${"A".repeat(streamAnnouncementTemplateMaxLength + 20)}`,
      promptAfterGoLive: false,
      autoPostEnabled: true,
      discordWebhookUrl:
        "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz.ABCDEFGHIJKLMNOPQRSTUVWXYZ_1234567890"
    });

    expect(normalized.template).toHaveLength(streamAnnouncementTemplateMaxLength);
    expect(normalized.template).not.toContain("\u0000");
    expect(normalized.promptAfterGoLive).toBe(false);
    expect(normalized.autoPostEnabled).toBe(true);
    expect(normalized.discordWebhookUrl).toContain("https://discord.com/api/webhooks/123456789012345678/");
    expect(normalizeStreamAnnouncementSettings({ template: "   " }).template).toBe(defaultStreamAnnouncementTemplate);
    expect(normalizeStreamAnnouncementSettings(null).promptAfterGoLive).toBe(true);
    expect(normalizeStreamAnnouncementSettings({ autoPostEnabled: true, discordWebhookUrl: "not a webhook" }).discordWebhookUrl).toBe("");
  });
});
