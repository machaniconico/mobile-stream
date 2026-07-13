import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bridge = readFileSync("ios/MobileLiveCaster/LiveCasterBridge.swift", "utf8");

describe("iOS host runtime-state contract", () => {
  it("fails closed when live lacks current publish-generation media evidence", () => {
    const effectiveStatus = swiftFunctionBlock(
      bridge,
      "private static func effectiveRuntimeStatus("
    );

    expect(effectiveStatus).toContain("guard reportedStatus == .live else");
    expect(effectiveStatus).toContain("return reportedStatus");
    expect(effectiveStatus).toContain('let publisherState = publisher.stringValue("state")');
    expect(effectiveStatus).toContain('case "failed":\n            return .failed');
    expect(effectiveStatus).toContain('case "reconnecting":\n            return .reconnecting');
    expect(effectiveStatus.indexOf('case "failed":')).toBeLessThan(
      effectiveStatus.indexOf("let hasCurrentPublishEvidence =")
    );
    expect(effectiveStatus.indexOf('case "reconnecting":')).toBeLessThan(
      effectiveStatus.indexOf("let hasCurrentPublishEvidence =")
    );
    expect(effectiveStatus).toContain('publisherState == "published"');
    expect(effectiveStatus).toContain('publisher.intValue("publishGeneration") > 0');
    expect(effectiveStatus).toContain(
      'publisher.intValue("currentPublishVideoMessagesSent") > 0'
    );
    expect(effectiveStatus).toContain(
      'publisher.intValue("currentPublishAudioMessagesSent") > 0'
    );
    expect(effectiveStatus).toContain("hasCurrentPublishEvidence ? .live : .preparing");
    expect(effectiveStatus).not.toContain('publisher.intValue("videoMessagesSent")');
    expect(effectiveStatus).not.toContain('publisher.intValue("audioMessagesSent")');
  });

  it("guards both persisted restoration and runtime polling without replacing other states", () => {
    const restore = swiftFunctionBlock(
      bridge,
      "private func restorePersistedBroadcastStateLocked()"
    );
    const apply = swiftFunctionBlock(bridge, "private func applyRuntimeStateLocked(");

    expect(restore).toContain("Self.effectiveRuntimeStatus(");
    expect(restore).toContain("runtimeState: matchingRuntimeState");
    expect(apply).toContain("Self.effectiveRuntimeStatus(");
    expect(apply).toContain("runtimeState: runtimeState");
    expect(apply).toContain("if reportedStatus == .idle && stopAcknowledged");
    expect(apply).toContain("reportedStatus == .failed || stopAcknowledgementTimedOut");
    expect(apply).toContain("status == .reconnecting && reportedStatus == .preparing");
  });
});

function swiftFunctionBlock(swiftText, signature) {
  const signatureIndex = swiftText.indexOf(signature);
  expect(signatureIndex).toBeGreaterThanOrEqual(0);
  const openingBraceIndex = swiftText.indexOf("{", signatureIndex + signature.length);
  expect(openingBraceIndex).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let index = openingBraceIndex; index < swiftText.length; index += 1) {
    if (swiftText[index] === "{") {
      depth += 1;
    } else if (swiftText[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return swiftText.slice(signatureIndex, index + 1);
      }
    }
  }
  throw new Error(`unterminated Swift function ${signature}`);
}
