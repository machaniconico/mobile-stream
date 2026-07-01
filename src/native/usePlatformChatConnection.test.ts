import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TWITCH_CHAT_CONNECTION_LOST_MESSAGE } from "./usePlatformChatConnection";

describe("usePlatformChatConnection", () => {
  it("uses one Twitch socket failure message for error and close events", () => {
    const source = readFileSync(new URL("./usePlatformChatConnection.ts", import.meta.url), "utf8");

    expect(TWITCH_CHAT_CONNECTION_LOST_MESSAGE).toBe("Twitch chat connection lost.");
    expect(source.match(/createPlatformChatConnectionState\("failed", TWITCH_CHAT_CONNECTION_LOST_MESSAGE\)/g)).toHaveLength(2);
    expect(source).not.toContain("Twitch chat socket error.");
    expect(source).not.toContain("Twitch chat socket closed.");
  });
});
