import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("MobileStudioScreen subtitle and text controls", () => {
  const source = readFileSync(new URL("./MobileStudioScreen.tsx", import.meta.url), "utf8");

  it("exposes live-operation controls for manual subtitle and text display", () => {
    expect(source).toContain('placeholder="配信に表示する字幕・テキスト"');
    expect(source).toContain('label="Show text"');
    expect(source).toContain('label="Queue text"');
    expect(source).toContain('label="Pin text"');
    expect(source).toContain('label="Hide text"');
    expect(source).toContain("showTimedTextOverlay(scene, {");
    expect(source).toContain("queueTimedTextOverlay(scene, {");
    expect(source).toContain("showPersistentTextOverlay(scene, {");
    expect(source).toContain("hideTextOverlays(scene, { sourceId: targetSourceId })");
    expect(source).toContain("status.queuedPreviewText");
    expect(source).toContain("次: {queuedPreviewText || \"待機なし\"}");
    expect(source).toContain("createQuickTextOverlayDeck(quickTextDeckInput");
    expect(source).toContain("applyQuickTextOverlayDeckCue(scene, cue, quickTextPresetAction");
    expect(source).toContain("updateQuickTextOverlayDeckInput(scene, input)");
    expect(source).toContain('text="Text deck"');
    expect(source).toContain("quickTextDeck.map");
  });

  it("keeps preset decks and selected text-source editing available on mobile", () => {
    expect(source).toContain("quickTextOverlayPresetGroups.map");
    expect(source).toContain("<TextOverlayStatusStrip status={textOverlayRuntimeStatus} />");
    expect(source).toContain("createTextOverlayPresetSource(presetId)");
    expect(source).toContain('text="Preset style"');
    expect(source).toContain('text="Timer"');
    expect(source).toContain('label="Show now"');
    expect(source).toContain('label="Show sec"');
  });

  it("surfaces announcement redaction and truncation warnings on mobile", () => {
    expect(source).toContain("streamAnnouncementPreview.sensitiveValueRemoved");
    expect(source).toContain("streamAnnouncementPreview.truncated");
    expect(source).toContain("announcement shortened to Discord limit");
  });

  it("exposes preset and custom stream quality controls with accessible selection state", () => {
    expect(source).toContain('text="Quality presets"');
    expect(source).toContain("orientedQualityResolutionOptions.map");
    expect(source).toContain('label="Video bitrate (kbps)"');
    expect(source).toContain('label="Audio bitrate (kbps)"');
    expect(source).toContain("applyCustomQualitySettings(profile, update)");
    expect(source).toContain('accessibilityRole="radio"');
    expect(source).toContain("accessibilityState={{ selected, disabled: setupLocked }}");
  });

  it("switches between accessible landscape and portrait stream output", () => {
    expect(source).toContain("getQualityOrientation(profile.quality)");
    expect(source).toContain("getQualityResolutionOptions(qualityOrientation)");
    expect(source).toContain("applyQualityOrientation(profile, orientation)");
    expect(source).toContain('accessibilityLabel={`${orientation} stream orientation`}');
    expect(source).toContain('orientation === "landscape" ? "16:9" : "9:16"');
    expect(source).toContain("quality={profile.quality}");
    expect(source).toContain("portrait && styles.previewStagePortrait");
    expect(source).toContain("aspectRatio: quality.width / quality.height");
  });

  it("shows native device resource telemetry in diagnostics", () => {
    expect(source).toContain("deviceResourceMetricLabel");
    expect(source).toContain('label="Device resources"');
    expect(source).toContain("batteryLevelPercent");
    expect(source).toContain("lowPowerMode");
  });

  it("labels real PCM evidence in mobile audio diagnostics", () => {
    expect(source).toContain("audioSilenceGuard.evidenceSource");
    expect(source).toContain("nativeClippedSamplePercent");
    expect(source).toContain('label="Audio silence"');
  });

  it("shows and applies the active platform quality recommendation", () => {
    expect(source).toContain("createPlatformQualityRecommendation(profile)");
    expect(source).toContain("platformQualityRecommendation.platformLabel} target");
    expect(source).toContain("platformQualityRecommendation.status === \"matched\"");
    expect(source).toContain("applyPlatformQualityRecommendation(profile)");
    expect(source).toContain("platformQualityRecommendation.changes.map");
    expect(source).toContain('accessibilityRole="summary"');
  });
});
