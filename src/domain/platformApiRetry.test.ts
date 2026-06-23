import { describe, expect, it } from "vitest";
import { createPlatformApiRetrySchedule, formatPlatformApiRetryDelay } from "./platformApiRetry";

describe("platformApiRetry", () => {
  it("does not schedule non-retryable errors", () => {
    expect(
      createPlatformApiRetrySchedule(
        Object.assign(new Error("Unauthorized"), {
          retryable: false,
          retryAfterMs: 10000
        })
      )
    ).toEqual({
      retryable: false,
      delayMs: null,
      retryAfterMs: 10000,
      label: null
    });
  });

  it("uses retry-after metadata when present", () => {
    expect(
      createPlatformApiRetrySchedule(
        Object.assign(new Error("Rate limited"), {
          retryable: true,
          retryAfterMs: 9000
        })
      )
    ).toMatchObject({
      retryable: true,
      delayMs: 9000,
      retryAfterMs: 9000,
      label: "9s"
    });
  });

  it("uses a fallback delay for retryable errors without retry-after metadata", () => {
    expect(
      createPlatformApiRetrySchedule(
        Object.assign(new Error("Temporarily unavailable"), {
          retryable: true,
          retryAfterMs: null
        }),
        { fallbackDelayMs: 45000 }
      )
    ).toMatchObject({
      retryable: true,
      delayMs: 45000,
      retryAfterMs: null,
      label: "45s"
    });
  });

  it("can represent retryable errors without an automatic fallback", () => {
    expect(
      createPlatformApiRetrySchedule(
        Object.assign(new Error("Temporarily unavailable"), {
          retryable: true
        }),
        { fallbackDelayMs: null }
      )
    ).toEqual({
      retryable: true,
      delayMs: null,
      retryAfterMs: null,
      label: null
    });
  });

  it("clamps scheduled retry delays for background jobs", () => {
    expect(
      createPlatformApiRetrySchedule(
        Object.assign(new Error("Long maintenance"), {
          retryable: true,
          retryAfterMs: 900000
        }),
        { maxDelayMs: 300000 }
      )
    ).toMatchObject({
      retryable: true,
      delayMs: 300000,
      label: "5m"
    });
  });

  it("formats long retry delays", () => {
    expect(formatPlatformApiRetryDelay(7200000)).toBe("2h");
    expect(formatPlatformApiRetryDelay(7500000)).toBe("2h 5m");
  });
});
