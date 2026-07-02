import { describe, expect, it } from "vitest";
import { assessPlatformPublishingFreshness } from "./platformPublishingFreshness";

describe("platformPublishingFreshness", () => {
  it("marks checked-at timestamps too far in the future as invalid", () => {
    const freshness = assessPlatformPublishingFreshness(
      {
        platform: "youtube-live",
        youtube: {
          statusCheckedAt: "2026-06-23T01:00:00.000Z"
        }
      },
      new Date("2026-06-23T00:00:00.000Z")
    );

    expect(freshness).toMatchObject({
      status: "invalid",
      ageMinutes: null,
      summary: "YouTube dashboard status timestamp is invalid."
    });
  });

  it("allows small future clock skew as fresh", () => {
    const freshness = assessPlatformPublishingFreshness(
      {
        platform: "twitch",
        twitch: {
          statusCheckedAt: "2026-06-23T00:01:30.000Z"
        }
      },
      new Date("2026-06-23T00:00:00.000Z")
    );

    expect(freshness).toMatchObject({
      status: "fresh",
      ageMinutes: 0
    });
  });
});
