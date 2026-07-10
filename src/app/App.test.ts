import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("App OAuth credential state", () => {
  it("remembers OAuth credentials with a functional state update", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain("const platformChatOAuthCredentialsRef = useRef(platformChatOAuthCredentials);");
    expect(source).toContain("const optimisticCredentials = upsertPlatformChatOAuthCredential(platformChatOAuthCredentialsRef.current, credential)");
    expect(source).toContain("setPlatformChatOAuthCredentials((current) => {");
    expect(source).toContain("upsertPlatformChatOAuthCredential(current, credential)");
    expect(source).toContain("createPlatformChatAuthFromCredentialStore(optimisticCredentials)");
    expect(source).not.toContain("upsertPlatformChatOAuthCredential(platformChatOAuthCredentials, credential)");
  });

  it("hooks Discord announcement autopost to platform-visible live success signals", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

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
});
