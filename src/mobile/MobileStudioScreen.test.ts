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
});
