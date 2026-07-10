import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const swiftCipher = readFileSync("ios/MobileLiveCaster/LiveCasterDiagnosticHistoryStore.swift", "utf8");
const swiftStore = readFileSync("ios/MobileLiveCaster/LiveCasterSceneStore.swift", "utf8");
const xcodeProject = readFileSync("ios/MobileLiveCaster.xcodeproj/project.pbxproj", "utf8");
const androidCipher = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/DiagnosticHistoryCipher.kt",
  "utf8"
);
const androidStore = readFileSync(
  "android/app/src/main/java/com/mobilelivecaster/streaming/SceneStoreModule.kt",
  "utf8"
);

describe("native diagnostic history encryption", () => {
  it("uses authenticated AES-256-GCM with a device-only iOS Keychain key", () => {
    expect(swiftCipher).toContain("import CryptoKit");
    expect(swiftCipher).toContain("AES.GCM.seal");
    expect(swiftCipher).toContain("AES.GCM.open");
    expect(swiftCipher).toContain("authenticating: authenticatedData");
    expect(swiftCipher).toContain("SymmetricKey(size: .bits256)");
    expect(swiftCipher).toContain("kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly");
    expect(swiftCipher).toContain(".completeFileProtectionUntilFirstUserAuthentication");
    expect(swiftCipher).toContain("resourceValues.isExcludedFromBackup = true");
  });

  it("migrates and removes the iOS plaintext files without fallback after encrypted data exists", () => {
    expect(swiftStore).toContain('legacyFileName: "mobile-live-caster-session-summaries.json"');
    expect(swiftStore).toContain('legacyFileName: "mobile-live-caster-validation-runs.json"');
    expect(swiftStore).toContain("sessionSummariesStore.save(summariesJson)");
    expect(swiftStore).toContain("validationRunsStore.save(runsJson)");
    expect(swiftCipher).toContain("if let encryptedURL, FileManager.default.fileExists(atPath: encryptedURL.path)");
    expect(swiftCipher).toContain("try removeLegacyFile()");
    expect(xcodeProject).toContain("LiveCasterDiagnosticHistoryStore.swift in Sources");
  });

  it("uses Android Keystore AES-GCM with randomized IVs and authenticated purpose data", () => {
    expect(androidCipher).toContain('KEYSTORE_PROVIDER = "AndroidKeyStore"');
    expect(androidCipher).toContain('TRANSFORMATION = "AES/GCM/NoPadding"');
    expect(androidCipher).toContain("KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT");
    expect(androidCipher).toContain(".setBlockModes(KeyProperties.BLOCK_MODE_GCM)");
    expect(androidCipher).toContain(".setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)");
    expect(androidCipher).toContain(".setKeySize(256)");
    expect(androidCipher).toContain(".setRandomizedEncryptionRequired(true)");
    expect(androidCipher).toContain("cipher.updateAAD(authenticatedData(purpose))");
    expect(androidCipher).toContain("GCMParameterSpec(GCM_TAG_BITS, iv)");
  });

  it("moves Android histories to encrypted preference keys and deletes legacy plaintext", () => {
    expect(androidStore).toContain('SESSION_SUMMARIES_ENCRYPTED = "session_summaries_encrypted_v1"');
    expect(androidStore).toContain('VALIDATION_RUNS_ENCRYPTED = "validation_runs_encrypted_v1"');
    expect(androidStore).toContain("diagnosticHistoryCipher.encrypt(legacy, purpose)");
    expect(androidStore).toContain("diagnosticHistoryCipher.decrypt(encrypted, purpose)");
    expect(androidStore).toContain("putString(encryptedKey, envelope).remove(legacyKey).commit()");
    expect(androidStore).not.toContain("putString(SESSION_SUMMARIES_JSON, summariesJson)");
    expect(androidStore).not.toContain("putString(VALIDATION_RUNS_JSON, runsJson)");
  });
});
