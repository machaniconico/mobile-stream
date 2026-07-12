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
    expect(setupSource).toContain("qualityResolutionOptions.map");
    expect(setupSource).toContain('type="range"');
    expect(setupSource).toContain("qualitySettingsLimits.videoBitrateKbps");
    expect(setupSource).toContain("qualitySettingsLimits.audioBitrateKbps");
    expect(setupSource).toContain("applyCustomQualitySettings(profile, update)");
    expect(setupSource).toContain("Upload target");
  });
});
