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
});
