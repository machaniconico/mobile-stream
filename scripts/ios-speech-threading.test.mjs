import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const speechSource = readFileSync("ios/MobileLiveCaster/LiveCasterSpeech.swift", "utf8");

describe("iOS speech synthesizer threading", () => {
  it("constructs on the main queue and serializes mutable speech state there", () => {
    expect(speechSource).toContain("AVSpeechSynthesizerDelegate, @unchecked Sendable");
    expect(speechSource).toContain("static func requiresMainQueueSetup() -> Bool {\n        true");
    expect(speechSource).toContain("performOnMain { [weak self] in");
    expect(speechSource).toContain("dispatchPrecondition(condition: .onQueue(.main))");
    expect(speechSource).toContain("DispatchQueue.main.async(execute: work)");
  });

  it("clears the active request before stopSpeaking can trigger cancellation", () => {
    const clearIndex = speechSource.indexOf("self.activeRequest = nil");
    const stopIndex = speechSource.indexOf("self.synthesizer.stopSpeaking(at: .immediate)");
    expect(clearIndex).toBeGreaterThan(-1);
    expect(stopIndex).toBeGreaterThan(clearIndex);
  });
});
