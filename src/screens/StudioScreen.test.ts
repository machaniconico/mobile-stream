import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("web stream announcement UI", () => {
  const studioSource = readFileSync(new URL("./StudioScreen.tsx", import.meta.url), "utf8");
  const setupSource = readFileSync(new URL("./LiveSetupScreen.tsx", import.meta.url), "utf8");

  it("surfaces redaction and truncation warnings in live and setup previews", () => {
    expect(studioSource).toContain("streamAnnouncementPreview.sensitiveValueRemoved");
    expect(studioSource).toContain("streamAnnouncementPreview.truncated");
    expect(studioSource).toContain("announcement shortened to Discord limit");
    expect(setupSource).toContain("streamAnnouncementPreview.sensitiveValueRemoved");
    expect(setupSource).toContain("streamAnnouncementPreview.truncated");
    expect(setupSource).toContain("announcement shortened to Discord limit");
  });

  it("exposes professional custom stream quality controls in live setup", () => {
    expect(setupSource).toContain("orientedQualityResolutionOptions.map");
    expect(setupSource).toContain('type="range"');
    expect(setupSource).toContain("qualitySettingsLimits.videoBitrateKbps");
    expect(setupSource).toContain("qualitySettingsLimits.audioBitrateKbps");
    expect(setupSource).toContain("applyCustomQualitySettings(profile, update)");
    expect(setupSource).toContain("Upload target");
  });

  it("switches between landscape and portrait stream output", () => {
    expect(setupSource).toContain("getQualityOrientation(profile.quality)");
    expect(setupSource).toContain("getQualityResolutionOptions(qualityOrientation)");
    expect(setupSource).toContain("applyQualityOrientation(profile, orientation)");
    expect(setupSource).toContain('role="radiogroup" aria-label="stream orientation"');
    expect(setupSource).toContain("RectangleVertical");
    expect(studioSource).toContain("quality={profile.quality}");
    expect(studioSource).toContain('program-stage ${portrait ? "portrait" : "landscape"}');
    expect(studioSource).toContain('aspectRatio: `${quality.width} / ${quality.height}`');
  });

  it("shows native device resource telemetry in diagnostics", () => {
    expect(studioSource).toContain("deviceResourceMetricLabel");
    expect(studioSource).toContain("Device resources");
    expect(studioSource).toContain("batteryLevelPercent");
    expect(studioSource).toContain("lowPowerMode");
  });

  it("shows and applies the active platform quality recommendation", () => {
    expect(setupSource).toContain("createPlatformQualityRecommendation(profile)");
    expect(setupSource).toContain("platform-quality-recommendation");
    expect(setupSource).toContain("applyPlatformQualityRecommendation(profile)");
    expect(setupSource).toContain("platformQualityRecommendation.changes.map");
    expect(setupSource).toContain("Apply ${platformQualityRecommendation.platformLabel} target");
  });
});
