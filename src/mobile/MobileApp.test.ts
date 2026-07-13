import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("MobileApp OAuth credential state", () => {
  it("clears stored OAuth credentials from the current state and persists the same store", () => {
    const source = readFileSync(new URL("./MobileApp.tsx", import.meta.url), "utf8");

    expect(source).toContain("const platformChatOAuthCredentialsRef = useRef(platformChatOAuthCredentials);");
    expect(source).toContain("setPlatformChatOAuthCredentials((current) => {");
    expect(source).toContain("nextCredentials = platform ? removePlatformChatOAuthCredential(current, platform) : createEmptyPlatformChatOAuthCredentialStore()");
    expect(source).toContain("await saveSecureOAuthCredentials(nextCredentials)");
    expect(source).not.toContain("...platformChatOAuthCredentials,\n          [platform]: null");
  });

  it("does not silently ignore secure-storage failures when clearing OAuth credentials", () => {
    const source = readFileSync(new URL("./MobileApp.tsx", import.meta.url), "utf8");

    expect(source).toContain("let secureStoreUpdateFailed = false;");
    expect(source).toContain("secureStoreUpdateFailed = true;");
    expect(source).toContain("saved OAuth credentials may still exist on this device");
    expect(source).not.toContain("Secure storage update failed: ${");
    expect(source).not.toContain("await saveSecureOAuthCredentials(nextCredentials).catch(() => undefined)");
    expect(source).not.toContain("await clearSecureOAuthCredential().catch(() => undefined)");
  });

  it("hooks Discord announcement autopost to native platform-visible live success signals", () => {
    const source = readFileSync(new URL("./MobileApp.tsx", import.meta.url), "utf8");

    expect(source).toContain("runStreamAnnouncementAutoPost(result.profile, \"youtube-live-transition\")");
    expect(source).toContain("runStreamAnnouncementAutoPost(result.profile, \"twitch-status-refresh\")");
    expect(source).toContain("createStreamAnnouncementAutoPostDecision({");
    expect(source).toContain("enginePlatform: engineSnapshot.platform");
    expect(source).toContain("const activeSessionKeys = new Set([");
    expect(source).toContain("...streamAnnouncementAutoPostedSessionKeys.current");
    expect(source).toContain("...streamAnnouncementAutoPostPendingSessionKeys.current");
    expect(source).toContain("postedSessionKeys: activeSessionKeys");
    expect(source.indexOf("streamAnnouncementAutoPostPendingSessionKeys.current.add(decision.sessionKey)")).toBeLessThan(
      source.indexOf("const result = await postDiscordStreamAnnouncement({")
    );
    expect(source.indexOf("streamAnnouncementAutoPostedSessionKeys.current.add(decision.sessionKey)")).toBeGreaterThan(
      source.indexOf("const result = await postDiscordStreamAnnouncement({")
    );
    expect(source).toContain("streamAnnouncementAutoPostPendingSessionKeys.current.delete(decision.sessionKey)");
    expect(source).toContain("formatStreamAnnouncementAuditMessage(preview, result.message)");
    expect(source).not.toContain("Content: ${preview.text}");
  });

  it("gates live quality changes by the active native encoder capability", () => {
    const source = readFileSync(new URL("./MobileApp.tsx", import.meta.url), "utf8");

    expect(source).toContain('snapshot.platform === "android"');
    expect(source).toContain("videoBitrate: true");
    expect(source).toContain("audioBitrate: false");
    expect(source).toContain('fps: profile.androidPublisherMode === "rootencoder"');
    expect(source).toContain("{ videoBitrate: true, audioBitrate: false, fps: false }");
  });

  it("records native PCM meter evidence instead of face-motion samples", () => {
    const source = readFileSync(new URL("./MobileApp.tsx", import.meta.url), "utf8");

    expect(source).toContain('"native-pcm"');
    expect(source).toContain("audio?.micRmsLevel");
    expect(source).toContain("audio?.micPeakLevel");
    expect(source).toContain("audio?.micLevelUpdatedAt");
    expect(source).not.toContain('recordAudioLevelSample(nextAvatar.mouthOpen');
    expect(source).not.toContain('recordAudioLevelSample(level, "manual")');
  });
});
