import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bridge = readFileSync("ios/MobileLiveCaster/LiveCasterBridge.swift", "utf8");
const credentialStore = readFileSync("ios/MobileLiveCaster/LiveCasterBroadcastCredentialStore.swift", "utf8");
const broadcastHandler = readFileSync("ios/MobileLiveCasterBroadcastUpload/SampleHandler.swift", "utf8");
const xcodeProject = readFileSync("ios/MobileLiveCaster.xcodeproj/project.pbxproj", "utf8");

describe("iOS broadcast credential handoff", () => {
  it("keeps RTMP credentials out of the App Group configuration payload", () => {
    const payload = swiftFunctionBlock(
      bridge,
      "func payload(renderGraphJSON: String, handoffID: String, expiresAt: Double)"
    );

    expect(payload).not.toContain('"serverUrl"');
    expect(payload).not.toContain('"streamKey"');
    expect(payload).not.toContain('"publishUrl"');
    expect(payload).toContain('"handoffId"');
    expect(payload).toContain('"expiresAt"');
    expect(payload).toContain('"destinationName"');
    expect(payload).toContain('"renderGraph"');
  });

  it("stores expiring publish URLs in generation-scoped shared Keychain items", () => {
    expect(credentialStore).toContain('accessGroup = "group.com.mobilelivecaster.app"');
    expect(credentialStore).toContain("kSecAttrAccessGroup");
    expect(credentialStore).toContain("kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly");
    expect(credentialStore).toContain("SecItemUpdate");
    expect(credentialStore).toContain('accountPrefix = "publish-url."');
    expect(credentialStore).toContain('case handoffID = "handoffId"');
    expect(credentialStore).toContain('case publishURL = "publishUrl"');
    expect(credentialStore).toContain("static func consumePublishURL(");
    expect(credentialStore).toContain("try clear(handoffID: normalizedHandoffID)");
    expect(credentialStore).toContain("static func clearExpiredCredentials(");
    expect(bridge).toContain("let handoffID = UUID().uuidString.lowercased()");
  });

  it("updates non-secret metadata without recreating consumed credentials", () => {
    const metadataWriter = swiftFunctionBlock(bridge, "func saveConfigurationMetadata(");

    expect(metadataWriter).not.toContain("savePublishURL");
    expect(metadataWriter).toContain("configuration.payload(");
    expect(bridge).toContain("saveConfigurationMetadata(");
  });

  it("clears only the active generation after confirmed stop, expiry, failure, and completion", () => {
    const stop = swiftFunctionBlock(bridge, "func stop(");
    const confirmedStop = swiftFunctionBlock(bridge, "private func completeStopAcknowledgementLocked()");

    expect(stop).toContain("saveControlAction(.stop, handoffID: handoffID)");
    expect(stop).toContain("pendingStopHandoffID = handoffID");
    expect(stop).not.toContain("clearBroadcastHandoffLocked()");
    expect(confirmedStop).toContain("if broadcastHandoffID == handoffID");
    expect(confirmedStop).toContain("try clearBroadcastHandoffLocked()");
    expect(bridge).toContain("scheduleCredentialCleanupLocked(");
    expect(broadcastHandler).toContain("expectedHandoffID: String");
    expect(broadcastHandler).toContain("expectedHandoffID != handoffID");
    expect(broadcastHandler).toContain("activeHandoffID = handoffID");
    expect(broadcastHandler).toContain("clearCredential(handoffID: handoffID)");
    const extensionCredentialClear = swiftFunctionBlock(broadcastHandler, "static func clearCredential(handoffID: String)");
    expect(extensionCredentialClear).not.toContain("removeObject");
    expect(extensionCredentialClear).toContain("LiveCasterBroadcastCredentialStore.clear(handoffID: handoffID)");
    expect(broadcastHandler).toContain("override func broadcastFinished()");
    expect(broadcastHandler).toContain('setupInfo["publishUrl"] = publishURL as NSString');
  });

  it("pins cleanup to the generation captured before any throwing load", () => {
    const broadcastStarted = swiftFunctionBlock(
      broadcastHandler,
      "override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?)"
    );

    expect(broadcastStarted).toContain("let requestedHandoffID = BroadcastSharedStore.currentHandoffID()");
    expect(broadcastStarted).toContain("loadConfigurationSetupInfo(expectedHandoffID: handoffID)");
    expect(broadcastStarted).toContain("clearCredential(handoffID: requestedHandoffID)");
    expect(broadcastStarted.match(/currentHandoffID\(\)/g)).toHaveLength(1);
  });

  it("compiles the shared store into both iOS targets", () => {
    const sourceMemberships = xcodeProject.match(/LiveCasterBroadcastCredentialStore\.swift in Sources/g) ?? [];
    expect(sourceMemberships).toHaveLength(4);
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
