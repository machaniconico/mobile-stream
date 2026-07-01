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
});
