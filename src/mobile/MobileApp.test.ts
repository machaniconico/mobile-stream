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

  it("hooks Discord announcement autopost to native platform-visible live success signals", () => {
    const source = readFileSync(new URL("./MobileApp.tsx", import.meta.url), "utf8");

    expect(source).toContain("runStreamAnnouncementAutoPost(result.profile, \"youtube-live-transition\")");
    expect(source).toContain("runStreamAnnouncementAutoPost(result.profile, \"twitch-status-refresh\")");
    expect(source).toContain("createStreamAnnouncementAutoPostDecision({");
    expect(source).toContain("enginePlatform: engineSnapshot.platform");
    expect(source).toContain("postedSessionKeys: streamAnnouncementAutoPostedSessionKeys.current");
  });
});
