import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("native text overlay rendering", () => {
  it("treats live caption overlays as subtitle-like text on Android", () => {
    const source = readFileSync("android/app/src/main/java/com/mobilelivecaster/streaming/AndroidSceneCompositor.kt", "utf8");

    expect(source).toContain('val isSubtitleLike = mode == "subtitle" || mode == "caption"');
    expect(source).toContain('node.payload.optInt("maxLines", if (isSubtitleLike) 2 else 1)');
    expect(source).toContain("val bitmapHeight = if (isSubtitleLike) 280 else 220");
  });

  it("treats live caption overlays as subtitle-like text in the iOS ReplayKit compositor", () => {
    const source = readFileSync("ios/MobileLiveCasterBroadcastUpload/SampleHandler.swift", "utf8");

    expect(source).toContain('let isSubtitleLike = mode == "subtitle" || mode == "caption"');
    expect(source).toContain('fallback: isSubtitleLike ? 2 : 1');
    expect(source).toContain("paragraphStyle.lineBreakMode = isSubtitleLike ? .byWordWrapping : .byTruncatingTail");
    expect(source).toContain("weight: isSubtitleLike ? .bold : .semibold");
  });
});
