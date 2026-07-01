import { describe, expect, it } from "vitest";
import { requiredBrowserUiTextChecks } from "./browser-ui-required-text.mjs";

describe("browser UI required text checks", () => {
  it("locks release evidence text for core streaming and Quick Text controls", () => {
    expect(requiredBrowserUiTextChecks).toEqual([
      "MobileLiveCaster",
      "Sources",
      "Go Live",
      "Live Setup",
      "PNGTuber",
      "RTMPS",
      "Face input",
      "Head range",
      "Rig quality",
      "Subtitle",
      "Quick text",
      "Preset action",
      "Queue text",
      "Pin text",
      "Hide text"
    ]);
  });
});
