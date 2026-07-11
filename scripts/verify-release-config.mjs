import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { cwd, exit } from "node:process";
import { productionNativeSourcePaths, releaseConfigArtifactPaths } from "./release-artifact-policy.mjs";
import {
  iosArchiveArgs,
  iosExportArgs,
  iosReleaseDefaults,
  iosReleaseEnv,
  renderIosExportOptionsPlist
} from "./ios-release-config.mjs";

const root = cwd();

const files = {
  packageJson: read("package.json"),
  gitleaksConfig: read(".gitleaks.toml"),
  gitleaksBaseline: read(".gitleaks-baseline.json"),
  releaseArtifactPolicyScript: read("scripts/release-artifact-policy.mjs"),
  androidGradle: read("android/app/build.gradle"),
  androidManifest: read("android/app/src/main/AndroidManifest.xml"),
  iosInfo: read("ios/MobileLiveCaster/Info.plist"),
  iosPrivacy: read("ios/MobileLiveCaster/PrivacyInfo.xcprivacy"),
  iosEntitlements: read("ios/MobileLiveCaster/MobileLiveCaster.entitlements"),
  broadcastInfo: read("ios/MobileLiveCasterBroadcastUpload/Info.plist"),
  broadcastEntitlements: read("ios/MobileLiveCasterBroadcastUpload/MobileLiveCasterBroadcastUpload.entitlements"),
  xcodeProject: read("ios/MobileLiveCaster.xcodeproj/project.pbxproj"),
  storeReleaseBuildScript: read("scripts/release-store-build.mjs"),
  physicalDevicesScript: read("scripts/verify-physical-devices.mjs"),
  storeSubmissionDraftScript: read("scripts/create-store-submission-draft.mjs"),
  storeRealDeviceScreenshotsScript: read("scripts/import-store-real-device-screenshots.mjs"),
  releaseCandidateScript: read("scripts/verify-release-candidate.mjs"),
  releaseReportScript: read("scripts/verify-release-report.mjs"),
  gitleaksHistoryScript: read("scripts/verify-gitleaks-history.mjs"),
  sourceSecretsScript: read("scripts/verify-source-secrets.mjs"),
  androidNativeVerificationScript: read("scripts/verify-android-native.mjs"),
  iosNativeVerificationScript: read("scripts/verify-ios-native.mjs"),
  releaseEvidencePackageScript: read("scripts/create-release-evidence-package.mjs"),
  browserUiRequiredTextScript: read("scripts/browser-ui-required-text.mjs"),
  verifyUiScript: read("scripts/verify-ui.mjs"),
  commercialReleaseBundleScript: read("scripts/verify-commercial-release-bundle.mjs"),
  releaseUrlPolicyScript: read("scripts/release-url-policy.mjs"),
  iosReleaseConfigScript: read("scripts/ios-release-config.mjs"),
  createIosExportOptionsScript: read("scripts/create-ios-export-options.mjs"),
  archiveIosReleaseScript: read("scripts/archive-ios-release.mjs"),
  exportIosReleaseScript: read("scripts/export-ios-release.mjs"),
  storeReleaseEnvScript: read("scripts/verify-store-release-env.mjs"),
  distributionArtifactsScript: read("scripts/verify-distribution-artifacts.mjs"),
  dashboardEvidenceScript: read("scripts/verify-platform-dashboard-evidence.mjs"),
  storeSubmissionScript: read("scripts/verify-store-submission-checklist.mjs"),
  releaseGitProvenanceScript: read("scripts/release-git-provenance.mjs"),
  storeSubmissionApprovalScript: read("scripts/verify-store-submission-approval.mjs"),
  readme: read("README.md"),
  implementationStatus: read("docs/IMPLEMENTATION_STATUS.md"),
  sceneDomain: read("src/domain/scene.ts"),
  sceneDomainTest: read("src/domain/scene.test.ts"),
  chatReaderDomain: read("src/domain/chatReader.ts"),
  chatReaderDomainTest: read("src/domain/chatReader.test.ts"),
  platformStreamKeysDomain: read("src/domain/platformStreamKeys.ts"),
  platformStreamKeysDomainTest: read("src/domain/platformStreamKeys.test.ts"),
  streamAnnouncementDomain: read("src/domain/streamAnnouncement.ts"),
  streamAnnouncementDomainTest: read("src/domain/streamAnnouncement.test.ts"),
  streamAnnouncementAutoPostDomain: read("src/domain/streamAnnouncementAutoPost.ts"),
  streamAnnouncementAutoPostDomainTest: read("src/domain/streamAnnouncementAutoPost.test.ts"),
  sensitiveTextDomain: read("src/domain/sensitiveText.ts"),
  sensitiveTextDomainTest: read("src/domain/sensitiveText.test.ts"),
  diagnosticSecretsDomain: read("src/domain/diagnosticSecrets.ts"),
  localStoreDomain: read("src/storage/localStore.ts"),
  secureProfileStoreDomain: read("src/mobile/secureProfileStore.ts"),
  webApp: read("src/app/App.tsx"),
  mobileApp: read("src/mobile/MobileApp.tsx"),
  webLiveSetupScreen: read("src/screens/LiveSetupScreen.tsx"),
  webStudioScreen: read("src/screens/StudioScreen.tsx"),
  mobileStudioScreen: read("src/mobile/MobileStudioScreen.tsx"),
  webStyles: read("src/styles.css"),
  supportBundleDomain: read("src/domain/supportBundle.ts"),
  commercialReleaseGateDomain: read("src/domain/commercialReleaseGate.ts"),
  streamDiagnosticsDomain: read("src/domain/streamDiagnostics.ts"),
  publicLaunchChecklistDomain: read("src/domain/publicLaunchChecklist.ts"),
  streamValidationEvidenceDomain: read("src/domain/streamValidationEvidence.ts"),
  liveCasterBridge: read("ios/MobileLiveCaster/LiveCasterBridge.swift"),
  liveCasterSpeech: read("ios/MobileLiveCaster/LiveCasterSpeech.swift"),
  broadcastCredentialStore: read("ios/MobileLiveCaster/LiveCasterBroadcastCredentialStore.swift"),
  diagnosticHistoryStore: read("ios/MobileLiveCaster/LiveCasterDiagnosticHistoryStore.swift"),
  broadcastHandler: read("ios/MobileLiveCasterBroadcastUpload/SampleHandler.swift"),
  androidDiagnosticHistoryCipher: read("android/app/src/main/java/com/mobilelivecaster/streaming/DiagnosticHistoryCipher.kt"),
  androidSceneStore: read("android/app/src/main/java/com/mobilelivecaster/streaming/SceneStoreModule.kt")
};

const productionNativeSourceFiles = [
  ...productionNativeSourcePaths.map((path) => ({ path, content: read(path) }))
];
const staleNativeScaffoldSourcePaths = collectOptionalSourceFiles("native", [".kt", ".java", ".swift", ".m", ".mm"]);

const iosReleaseConfig = {
  hostBundleId: iosReleaseDefaults.hostBundleId,
  hostEntitlementsPath: "MobileLiveCaster/MobileLiveCaster.entitlements",
  hostInfoPlistPath: "MobileLiveCaster/Info.plist",
  broadcastBundleId: iosReleaseDefaults.broadcastBundleId,
  broadcastEntitlementsPath: "MobileLiveCasterBroadcastUpload/MobileLiveCasterBroadcastUpload.entitlements",
  broadcastInfoPlistPath: "MobileLiveCasterBroadcastUpload/Info.plist",
  appGroupId: "group.com.mobilelivecaster.app"
};

const checks = [
  check("Android release signing uses production inputs", () => {
    expectIncludes(files.androidGradle, "MLC_RELEASE_STORE_FILE");
    expectIncludes(files.androidGradle, "MLC_RELEASE_STORE_PASSWORD");
    expectIncludes(files.androidGradle, "MLC_RELEASE_KEY_ALIAS");
    expectIncludes(files.androidGradle, "MLC_RELEASE_KEY_PASSWORD");
    expectIncludes(files.androidGradle, "Android release signing is not configured");
    expectIncludes(files.androidGradle, "signingConfig signingConfigs.release");
    expectNotIncludes(releaseBlock(files.androidGradle), "signingConfigs.debug");
    expectIncludes(files.packageJson, '"verify:physical-devices": "node scripts/verify-physical-devices.mjs"');
    expectIncludes(
      files.packageJson,
      '"verify:gitleaks-history": "node scripts/verify-gitleaks-history.mjs --report-json=.artifacts/gitleaks-history-scan.json"'
    );
    expectIncludes(
      files.packageJson,
      '"verify:source-secrets": "node scripts/verify-source-secrets.mjs --report-json=.artifacts/source-secret-scan.json"'
    );
    expectIncludes(files.packageJson, '"verify:store-release-env": "node scripts/verify-store-release-env.mjs"');
    expectIncludes(files.packageJson, '"verify:distribution-artifacts": "node scripts/verify-distribution-artifacts.mjs --verify"');
    expectIncludes(files.packageJson, '"verify:dashboard-evidence": "node scripts/verify-platform-dashboard-evidence.mjs --verify"');
    expectIncludes(files.packageJson, '"verify:store-submission": "node scripts/verify-store-submission-checklist.mjs --verify"');
    expectIncludes(files.packageJson, '"verify:store-submission-final": "node scripts/verify-store-submission-checklist.mjs --verify --require-real-device-screenshots"');
    expectIncludes(files.packageJson, '"verify:store-submission-approval": "node scripts/verify-store-submission-approval.mjs"');
    expectIncludes(files.packageJson, '"verify:evidence-package": "node scripts/create-release-evidence-package.mjs --verify"');
    expectIncludes(files.packageJson, '"release:distribution-manifest": "node scripts/verify-distribution-artifacts.mjs --write"');
    expectIncludes(files.packageJson, '"release:dashboard-evidence": "node scripts/verify-platform-dashboard-evidence.mjs --write"');
    expectIncludes(files.packageJson, '"release:store-submission-draft": "node scripts/create-store-submission-draft.mjs"');
    expectIncludes(files.packageJson, '"release:store-real-device-screenshots": "node scripts/import-store-real-device-screenshots.mjs"');
    expectIncludes(files.packageJson, '"release:store-submission-checklist": "node scripts/verify-store-submission-checklist.mjs --write"');
    expectIncludes(files.packageJson, '"release:evidence-package": "node scripts/create-release-evidence-package.mjs --write"');
    expectIncludes(files.packageJson, '"release:store": "node scripts/release-store-build.mjs"');
    expectIncludes(files.packageJson, '"android:bundleRelease": "bash -lc');
    expectIncludes(files.packageJson, '"android:verify-release-env": "node scripts/verify-store-release-env.mjs --android-only"');
    expectIncludes(files.storeReleaseEnvScript, "MLC_RELEASE_STORE_FILE");
    expectIncludes(files.storeReleaseEnvScript, "MLC_RELEASE_KEY_ALIAS");
    expectIncludes(files.storeReleaseEnvScript, "must point outside the repository");
    expectIncludes(files.storeReleaseEnvScript, "not committed");
    expectIncludes(files.physicalDevicesScript, "physical-device-preflight");
    expectIncludes(files.physicalDevicesScript, "adb");
    expectIncludes(files.physicalDevicesScript, "xcrun");
    expectIncludes(files.physicalDevicesScript, "xctrace");
    expectIncludes(files.physicalDevicesScript, "ro.kernel.qemu");
    expectIncludes(files.physicalDevicesScript, "ro.boot.qemu");
    expectIncludes(files.physicalDevicesScript, "ro.hardware");
    expectIncludes(files.physicalDevicesScript, "emulator or generic Android system image");
    expectIncludes(files.physicalDevicesScript, "iOS Simulator");
    expectIncludes(files.physicalDevicesScript, "must not be a symbolic link");
    expectIncludes(files.physicalDevicesScript, "createPhysicalDeviceValidationRunbook");
    expectIncludes(files.physicalDevicesScript, "validatePhysicalDeviceValidationRunbook");
    expectIncludes(files.physicalDevicesScript, "android-canvas-mediacodec");
    expectIncludes(files.physicalDevicesScript, "ios-replaykit-coregraphics");
    expectIncludes(files.physicalDevicesScript, "YouTube Live and Twitch ingest validation");
    expectIncludes(files.distributionArtifactsScript, "androidAab");
    expectIncludes(files.distributionArtifactsScript, ".aab");
    expectIncludes(files.distributionArtifactsScript, "sha256");
    expectIncludes(files.distributionArtifactsScript, "validateManifestGitProvenance");
    expectIncludes(files.distributionArtifactsScript, "currentCommit = \"\"");
    expectIncludes(files.releaseGitProvenanceScript, "git commit is missing");
    expectIncludes(files.releaseGitProvenanceScript, "full 40- or 64-character hexadecimal object id");
    expectIncludes(files.releaseGitProvenanceScript, "git dirty state is missing");
    expectIncludes(files.releaseGitProvenanceScript, "does not match current commit");
    expectIncludes(files.storeReleaseBuildScript, "android:verify-release-env");
    expectIncludes(files.storeReleaseBuildScript, "android:bundleRelease");
    expectIncludes(files.storeReleaseBuildScript, "createDistributionManifest");
    expectIncludes(files.storeReleaseBuildScript, "store-release-orchestration");
    expectIncludes(files.storeReleaseBuildScript, "--report-json");
    expectIncludes(files.storeReleaseBuildScript, "Store release report written to");
    expectIncludes(files.storeReleaseBuildScript, "validateManifestGitProvenance");
    expectIncludes(files.storeReleaseBuildScript, "distributionManifestSummary");
    expectIncludes(files.storeReleaseBuildScript, "validateStoreReleaseReport");
    expectIncludes(files.storeReleaseBuildScript, "collectStoreReleaseArtifactRecords");
    expectIncludes(files.releaseCandidateScript, "--store-release-report-json");
    expectIncludes(files.releaseCandidateScript, "--physical-device-preflight-json");
    expectIncludes(files.releaseCandidateScript, "Verify store release orchestration report");
    expectIncludes(files.releaseCandidateScript, "Verify physical device preflight");
    expectIncludes(files.releaseCandidateScript, "Verify existing release artifact path safety");
    expectIncludes(files.releaseCandidateScript, "Verify gitleaks history scan");
    expectIncludes(files.releaseCandidateScript, '["run", "verify:gitleaks-history"]');
    expectIncludes(files.releaseCandidateScript, "Verify source and bundle secret scan");
    expectIncludes(files.releaseCandidateScript, '["run", "verify:source-secrets"]');
    expectIncludes(files.releaseCandidateScript, "assertExistingReleaseArtifactPathsSafe");
    expectIncludes(files.releaseCandidateScript, "Verify store submission evidence requirements");
    expectIncludes(files.releaseCandidateScript, "Verify store submission handoff evidence integrity");
    expectIncludes(files.releaseCandidateScript, "storeSubmissionChecklistPath");
    expectIncludes(files.releaseCandidateScript, "distributionArtifactManifestPath");
    expectIncludes(files.releaseCandidateScript, "dashboardEvidenceManifestPath");
    expectIncludes(files.releaseCandidateScript, "Distribution artifact manifest is required");
    expectIncludes(files.releaseCandidateScript, "Dashboard evidence manifest is required");
    expectIncludes(files.releaseCandidateScript, "Dashboard evidence status JSON");
    expectIncludes(files.releaseCandidateScript, "validateManifestGitProvenance");
    expectIncludes(files.releaseCandidateScript, "requireRealDeviceScreenshots: true");
    expectIncludes(files.releaseCandidateScript, "Store release orchestration report is required");
    expectIncludes(files.releaseCandidateScript, "Physical device preflight report is required");
    expectIncludes(files.releaseCandidateScript, "collectPhysicalDevicePreflightArtifactRecords");
    expectIncludes(files.releaseCandidateScript, "validatePhysicalDevicePreflightReport");
    expectIncludes(files.releaseCandidateScript, "isLoopbackHttpUrl");
    expectIncludes(files.releaseCandidateScript, "--ui-url must be a loopback http(s) URL");
    expectIncludes(files.releaseCandidateScript, "UI evidence target must be a loopback http(s) URL.");
    expectIncludes(files.releaseReportScript, "Browser UI evidence target must be a loopback http(s) URL.");
    expectIncludes(files.releaseReportScript, "validatePhysicalDevicePreflightReport");
    expectIncludes(files.releaseReportScript, "physicalDevicePreflightArtifactGroup");
    expectIncludes(files.releaseReportScript, "Physical-device preflight gate runbook");
    expectIncludes(files.releaseReportScript, "validateManifestGitProvenance");
    expectIncludes(files.releaseReportScript, "validateDistributionArtifactsInReport(report, artifacts, options, fail)");
    expectIncludes(files.releaseReportScript, "validateDashboardEvidenceInReport(report, artifacts, options, fail)");
    expectIncludes(files.releaseReportScript, "validateStoreSubmissionInReport(report, artifacts, options, fail)");
    expectIncludes(files.releaseReportScript, "Browser UI evidence");
    expectIncludes(files.releaseReportScript, "Browser UI evidence is not a MobileLiveCaster browser-ui-verification reportVersion 1 file.");
    expectIncludes(files.releaseReportScript, "Browser UI evidence finishedAt timestamp is missing or invalid.");
    expectIncludes(files.releaseReportScript, "Browser UI evidence for ${viewport.name} is missing text");
    expectIncludes(files.releaseReportScript, "Browser UI evidence for ${viewport.name} is missing Quick Text interaction proof.");
    expectIncludes(files.releaseReportScript, "Browser UI verification is missing evidence artifact");
    expectIncludes(files.releaseReportScript, "defaultBrowserUiEvidencePath");
    expectIncludes(files.releaseReportScript, "requiredBrowserUiTextChecks");
    expectIncludes(files.releaseReportScript, "validateEvidenceQuickTextInteraction");
    expectIncludes(files.releaseReportScript, "previewText");
    expectIncludes(files.releaseCandidateScript, "requiredBrowserUiTextChecks");
    expectIncludes(files.releaseCandidateScript, "validateUiQuickTextInteraction");
    expectIncludes(files.releaseCandidateScript, "previewText");
    expectIncludes(files.releaseEvidencePackageScript, "requiredBrowserUiTextChecks");
    expectIncludes(files.releaseEvidencePackageScript, "validatePackagedUiEvidenceQuickTextInteraction");
    expectIncludes(files.releaseEvidencePackageScript, "previewText");
    expectIncludes(files.verifyUiScript, "requiredBrowserUiTextChecks");
    expectIncludes(files.verifyUiScript, "verifyQuickTextInteraction");
    expectIncludes(files.verifyUiScript, "Quick Text status preview did not show proof text");
    expectIncludes(files.verifyUiScript, "assertMobileLiveCasterTarget");
    expectIncludes(files.verifyUiScript, "Set MLC_URL to this repository's dev server");
    expectIncludes(files.browserUiRequiredTextScript, "requiredBrowserUiTextChecks");
    expectIncludes(files.browserUiRequiredTextScript, '"Quick text"');
    expectIncludes(files.browserUiRequiredTextScript, '"Text deck"');
    expectIncludes(files.browserUiRequiredTextScript, '"Custom deck"');
    expectIncludes(files.browserUiRequiredTextScript, '"Preset action"');
    expectIncludes(files.browserUiRequiredTextScript, '"Queue text"');
    expectIncludes(files.browserUiRequiredTextScript, '"Pin text"');
    expectIncludes(files.browserUiRequiredTextScript, '"Hide text"');
    expectIncludes(files.releaseUrlPolicyScript, "isLoopbackHttpUrl");
    expectIncludes(files.releaseUrlPolicyScript, "localhost");
    expectIncludes(files.releaseUrlPolicyScript, "127.0.0.1");
    expectIncludes(files.releaseUrlPolicyScript, "[::1]");
    expectIncludes(files.releaseArtifactPolicyScript, "scripts/release-url-policy.mjs");
    expectIncludes(files.releaseArtifactPolicyScript, "scripts/verify-physical-devices.mjs");
    expectIncludes(files.releaseArtifactPolicyScript, "productionNativeSourcePaths");
    expectIncludes(files.releaseArtifactPolicyScript, "android/app/src/main/java");
    expectIncludes(files.releaseArtifactPolicyScript, "ios/MobileLiveCasterBroadcastUpload");
    expectIncludes(files.releaseArtifactPolicyScript, '"Build Android native debug app"');
    expectIncludes(files.releaseArtifactPolicyScript, '"Build iOS native simulator app"');
    expectIncludes(files.releaseArtifactPolicyScript, 'sourceSecretScanArtifactGroup = "security"');
    expectIncludes(files.releaseArtifactPolicyScript, 'sourceSecretScanArtifactPath = ".artifacts/source-secret-scan.json"');
    expectIncludes(files.releaseArtifactPolicyScript, 'gitleaksHistoryBaselinePath = ".gitleaks-baseline.json"');
    expectIncludes(files.releaseArtifactPolicyScript, 'gitleaksHistoryScanArtifactPath = ".artifacts/gitleaks-history-scan.json"');
    expectIncludes(files.releaseArtifactPolicyScript, '"security", "android", "ios"');
    expectIncludes(files.releaseArtifactPolicyScript, '"scripts/verify-gitleaks-history.mjs"');
    expectIncludes(files.releaseArtifactPolicyScript, '".gitleaks.toml"');
    expectIncludes(files.releaseArtifactPolicyScript, '".gitleaks-baseline.json"');
    expectIncludes(files.gitleaksConfig, "useDefault = true");
    expectIncludes(files.gitleaksHistoryScript, "gitleaks-history-scan");
    expectIncludes(files.gitleaksHistoryScript, "expectedGitleaksBaselineFindings");
    expectIncludes(files.gitleaksHistoryScript, 'expectedGitleaksVersion = "8.30.1"');
    expectIncludes(files.gitleaksHistoryScript, "expectedBaselineSha256");
    expectIncludes(files.gitleaksHistoryScript, "validateManifestGitProvenance");
    expectIncludes(files.gitleaksHistoryScript, "expectedGitCommit");
    expectIncludes(files.gitleaksHistoryScript, "baseline SHA-256");
    expectIncludes(files.gitleaksHistoryScript, "--is-shallow-repository");
    expectIncludes(files.gitleaksHistoryScript, "full git history checkout");
    expectIncludes(files.gitleaksHistoryScript, "shallowRepository");
    expectIncludes(files.gitleaksHistoryScript, "Gitleaks baseline validation failed");
    expectIncludes(files.gitleaksBaseline, "REDACTED");
    expectIncludes(files.gitleaksBaseline, "07acf4a10f14ed7491a9f97c71cb41a74c5a7c84:src/domain/readiness.test.ts:generic-api-key:19");
    expectIncludes(files.releaseReportScript, "validateGitleaksHistoryScanReport");
    expectIncludes(files.releaseReportScript, "expectedBaselineSha256: fileSha256(gitleaksHistoryBaselinePath)");
    expectIncludes(files.releaseReportScript, "expectedGitCommit: report?.git?.commit");
    expectIncludes(files.releaseEvidencePackageScript, "Package is missing gitleaks history scan artifact");
    expectIncludes(files.releaseEvidencePackageScript, "Package is missing gitleaks baseline artifact");
    expectIncludes(files.releaseArtifactPolicyScript, '"scripts/verify-android-native.mjs"');
    expectIncludes(files.releaseArtifactPolicyScript, '"scripts/verify-ios-native.mjs"');
    expectIncludes(files.releaseCandidateScript, "sourceSecretScanArtifactGroup");
    expectIncludes(files.releaseCandidateScript, "sourceSecretScanArtifactPath");
    expectIncludes(files.releaseReportScript, "validateSourceSecretScanArtifactInReport");
    expectIncludes(files.releaseReportScript, "Source secret scan artifact must report zero findings.");
    expectIncludes(files.releaseReportScript, "Source secret scan artifact");
    expectIncludes(files.releaseReportScript, "validateManifestGitProvenance");
    expectIncludes(files.releaseReportScript, "Source secret scan artifact generatedAt is before the release report startedAt.");
    expectIncludes(files.releaseEvidencePackageScript, "validatePackagedSourceSecretScanArtifact");
    expectIncludes(files.releaseEvidencePackageScript, "sourceSecretScanArtifactPath");
    expectIncludes(files.releaseEvidencePackageScript, "Package source secret scan artifact must report zero findings.");
    expectIncludes(files.releaseEvidencePackageScript, "Package source secret scan");
    expectIncludes(files.releaseEvidencePackageScript, "Package source secret scan generatedAt is before the release report startedAt.");
    expectIncludes(files.sourceSecretsScript, "type: \"source-secret-scan\"");
    expectIncludes(files.sourceSecretsScript, "git:");
    expectIncludes(files.sourceSecretsScript, "rev-parse");
    expectIncludes(files.sourceSecretsScript, "statusShort");
    expectIncludes(files.sourceSecretsScript, "findingCount: findings.length");
    expectIncludes(files.sourceSecretsScript, "--report-json=");
    expectIncludes(files.sourceSecretsScript, "credential-header-token");
    expectIncludes(files.sourceSecretsScript, "twitch-irc-oauth-token");
    expectIncludes(files.sourceSecretsScript, "api_key");
    expectIncludes(files.sourceSecretsScript, "oauth_token");
    expectIncludes(files.sourceSecretsScript, "rtmp-publish-url-key");
    expectIncludes(files.releaseCandidateScript, "collectAndroidNativeVerificationArtifactRecords");
    expectIncludes(files.releaseCandidateScript, "collectIosNativeVerificationArtifactRecords");
    expectIncludes(files.releaseCandidateScript, "Release candidate self-verification failed:");
    expectIncludes(files.releaseCandidateScript, "validateReport(report");
    expectIncludes(files.releaseReportScript, "validateAndroidNativeVerificationArtifacts");
    expectIncludes(files.releaseReportScript, "validateIosNativeVerificationArtifacts");
    expectIncludes(files.releaseEvidencePackageScript, "inspectAndroidDebugApkFile");
    expectIncludes(files.androidNativeVerificationScript, "inspectAndroidDebugApkFile");
    expectIncludes(files.androidNativeVerificationScript, "rmSync(resolve(apkPath)");
    expectIncludes(files.androidNativeVerificationScript, "./gradlew assembleDebug");
    expectIncludes(files.distributionArtifactsScript, "AndroidManifest.xml");
    expectIncludes(files.distributionArtifactsScript, "classes.dex");
    expectIncludes(files.iosNativeVerificationScript, "validateIosNativeVerificationReport");
    expectIncludes(files.iosNativeVerificationScript, "iosNativeVerificationRecordedFiles");
    expectIncludes(files.iosNativeVerificationScript, "rmSync(derivedDataPath");
    expectIncludes(files.iosNativeVerificationScript, "collectBundleFileRecords");
    expectIncludes(files.iosNativeVerificationScript, "MobileLiveCaster.debug.dylib");
    expectIncludes(files.iosNativeVerificationScript, "embedded and standalone ReplayKit executable hashes do not match");
    expectIncludes(files.releaseCandidateScript, "runCommercialSupportBundleGate(report, options);");
    expectIncludes(files.supportBundleDomain, "bundleVersion: 55");
    expectIncludes(files.supportBundleDomain, "nativeCompositionCaptionOverlayCount");
    expectIncludes(files.supportBundleDomain, "textOverlayRenderVisibleSourceCount");
    expectIncludes(files.supportBundleDomain, "textOverlayQueuedTimedManualSourceCount");
    expectIncludes(files.supportBundleDomain, "textOverlayExpiredTimedManualSourceCount");
    expectIncludes(files.supportBundleDomain, "sceneFingerprint: string");
    expectIncludes(files.supportBundleDomain, "androidPublisherMode: StudioProfile");
    expectIncludes(files.streamDiagnosticsDomain, "Evidence Android publisher mode");
    expectIncludes(files.streamValidationEvidenceDomain, "androidPublisherMode: StreamDiagnostics");
    expectIncludes(files.streamValidationEvidenceDomain, "androidPublisherModeAndroidPass");
    expectIncludes(files.commercialReleaseGateDomain, "const minimumSupportBundleVersion = 55");
    expectIncludes(files.commercialReleaseGateDomain, "scene-fingerprint-missing");
    expectIncludes(files.commercialReleaseGateDomain, "validation-evidence-manifest-scene-fingerprint");
    expectIncludes(files.commercialReleaseGateDomain, "native-caption-overlay-summary-missing");
    expectIncludes(files.commercialReleaseGateDomain, "textOverlayQueuedTimedManualSourceCount");
    expectIncludes(files.commercialReleaseGateDomain, "textOverlayExpiredTimedManualSourceCount");
    expectIncludes(files.commercialReleaseGateDomain, "android-publisher-mode-not-commercial");
    expectIncludes(files.commercialReleaseGateDomain, "validation-evidence-manifest-android-publisher-mode");
    expectIncludes(files.commercialReleaseBundleScript, "const minimumSupportBundleVersion = 55");
    expectIncludes(files.commercialReleaseBundleScript, "--allow-warnings is not supported for commercial release approval");
    expectIncludes(files.commercialReleaseBundleScript, "warningCount === 0");
    expectIncludes(files.commercialReleaseBundleScript, "scene-fingerprint-missing");
    expectIncludes(files.commercialReleaseBundleScript, "textOverlayQueuedTimedManualSourceCount");
    expectIncludes(files.commercialReleaseBundleScript, "textOverlayExpiredTimedManualSourceCount");
    expectIncludes(files.commercialReleaseBundleScript, "validation-evidence-manifest-scene-fingerprint");
    expectIncludes(files.commercialReleaseBundleScript, "native-caption-overlay-summary-missing");
    expectIncludes(files.commercialReleaseBundleScript, "android-publisher-mode-not-commercial");
    expectIncludes(files.commercialReleaseBundleScript, "validation-evidence-manifest-android-publisher-mode");
    expectIncludes(files.commercialReleaseBundleScript, "hasAndroidMediaCodecCompositorProof(run)");
    expectIncludes(files.commercialReleaseGateDomain, "stream-rehearsal-not-ready");
    expectIncludes(files.commercialReleaseBundleScript, "stream-rehearsal-not-ready");
    expectIncludes(files.commercialReleaseGateDomain, "validation-evidence-manifest-scope");
    expectIncludes(files.commercialReleaseBundleScript, "validation-evidence-manifest-scope");
    expectIncludes(files.streamValidationEvidenceDomain, "nativeRuntimeSentVideoFrames");
    expectIncludes(files.streamValidationEvidenceDomain, "nativeRuntimeVideoEncoderBackend");
    expectIncludes(files.streamValidationEvidenceDomain, "nativeRuntimeAudioEncoderBackend");
    expectIncludes(files.streamValidationEvidenceDomain, "nativeRuntimeStillImageAssetLoadedCount");
    expectIncludes(files.streamValidationEvidenceDomain, "nativeRuntimeStillImageAssetDecodedPixelCount");
    expectIncludes(files.streamValidationEvidenceDomain, "nativeRuntimeStillImageAssetCompositedPixelCount");
    expectIncludes(files.streamValidationEvidenceDomain, "nativeRuntimeStillImageAssetAppGroupCompositedPixelCount");
    expectIncludes(files.streamValidationEvidenceDomain, "nativeRuntimeLive2dPosePayloadCount");
    expectIncludes(files.streamValidationEvidenceDomain, "hasNativeRuntimeLive2DPoseProof");
    expectIncludes(files.supportBundleDomain, "nativeRuntimeLive2dPosePayloadCount");
    expectIncludes(files.commercialReleaseGateDomain, "hasManifestLive2DPoseProof");
    expectIncludes(files.commercialReleaseBundleScript, "hasLive2DPoseProof");
    expectIncludes(files.streamValidationEvidenceDomain, "isProductionVrmRendererBackend");
    expectIncludes(files.commercialReleaseGateDomain, "hasManifestIosAppGroupStillImageProof");
    expectIncludes(files.commercialReleaseBundleScript, "hasIosAppGroupStillImageProof");
    expectIncludes(files.commercialReleaseGateDomain, "isManifestNativeRuntimePass");
    expectIncludes(files.commercialReleaseGateDomain, "isProductionNativeVideoEncoderBackend");
    expectIncludes(files.commercialReleaseBundleScript, "isProductionNativeAudioEncoderBackend");
    expectIncludes(files.commercialReleaseBundleScript, "validation-evidence-manifest-native-runtime");
    expectIncludes(files.commercialReleaseGateDomain, "isProductionVrmRendererBackend");
    expectIncludes(files.commercialReleaseBundleScript, "isProductionVrmRendererBackend");
    expectIncludes(files.streamValidationEvidenceDomain, "monitorHoldSampleCount");
    expectIncludes(files.streamValidationEvidenceDomain, "monitorHoldDroppedFrameIncrease");
    expectIncludes(files.commercialReleaseGateDomain, "isManifestMonitorHoldPass");
    expectIncludes(files.commercialReleaseBundleScript, "validation-evidence-manifest-monitor-hold");
    expectIncludes(files.streamValidationEvidenceDomain, "audioNativeMonitorWrittenFrames");
    expectIncludes(files.streamValidationEvidenceDomain, "audioNativeMonitorRouteMatchesOutput");
    expectIncludes(files.streamValidationEvidenceDomain, "audioMonitorLatencyStatus");
    expectIncludes(files.streamValidationEvidenceDomain, "audioMonitorLatencyBudgetMs");
    expectIncludes(files.streamValidationEvidenceDomain, "audioMonitorLatencySource");
    expectIncludes(files.streamValidationEvidenceDomain, "audioMonitorTuningNote");
    expectIncludes(files.commercialReleaseGateDomain, "isManifestAudioPass");
    expectIncludes(files.commercialReleaseGateDomain, "audioNativeMonitorRouteMatchesOutput");
    expectIncludes(files.commercialReleaseBundleScript, "validation-evidence-manifest-audio-monitor");
    expectIncludes(files.commercialReleaseBundleScript, "audioNativeMonitorRouteMatchesOutput");
    expectIncludes(files.streamValidationEvidenceDomain, "faceTrackingRigSemanticSegmentScore");
    expectIncludes(files.commercialReleaseGateDomain, "faceTrackingRigSemanticSegmentScore");
    expectIncludes(files.commercialReleaseBundleScript, "faceTrackingRigSemanticSegmentScore");
    expectIncludes(files.streamValidationEvidenceDomain, "faceTrackingRigEyeMouthSegmentScore");
    expectIncludes(files.streamValidationEvidenceDomain, "faceTrackingRigHorizontalAnchorScore");
    expectIncludes(files.commercialReleaseGateDomain, "faceTrackingRigEyeMouthSegmentScore");
    expectIncludes(files.commercialReleaseGateDomain, "faceTrackingRigHorizontalAnchorScore");
    expectIncludes(files.commercialReleaseBundleScript, "faceTrackingRigEyeMouthSegmentScore");
    expectIncludes(files.commercialReleaseBundleScript, "faceTrackingRigHorizontalAnchorScore");
    expectIncludes(files.streamValidationEvidenceDomain, "chatReadoutSpokenMessageCount");
    expectIncludes(files.streamValidationEvidenceDomain, "chatReadoutSpeechFailureCount");
    expectIncludes(files.commercialReleaseGateDomain, "isManifestChatReadoutPass");
    expectIncludes(files.commercialReleaseBundleScript, "validation-evidence-manifest-chat-readout");
    expectIncludes(files.publicLaunchChecklistDomain, "latestChatReadout");
    expectIncludes(files.publicLaunchChecklistDomain, "chatReadoutIosPass");
    expectIncludes(files.publicLaunchChecklistDomain, "chatReadoutAndroidPass");
    expectIncludes(files.streamValidationEvidenceDomain, "qualityAutomationLiveUpdateCount");
    expectIncludes(files.streamValidationEvidenceDomain, "qualityAutomationFailureCount");
    expectIncludes(files.commercialReleaseGateDomain, "isManifestQualityAutomationPass");
    expectIncludes(files.commercialReleaseBundleScript, "validation-evidence-quality-automation-gap");
    expectIncludes(files.streamValidationEvidenceDomain, "platformPublishingCheckedAt");
    expectIncludes(files.streamValidationEvidenceDomain, "platformPublishingObservedAgeMinutes");
    expectIncludes(files.streamValidationEvidenceDomain, "platformPublishingYoutubeHasBroadcastId");
    expectIncludes(files.streamValidationEvidenceDomain, "platformPublishingTwitchChannelLanguage");
    expectIncludes(files.commercialReleaseGateDomain, "isManifestPlatformIdentityPass");
    expectIncludes(files.commercialReleaseBundleScript, "validation-evidence-manifest-platform-dashboard");
    expectIncludes(files.sourceSecretsScript, "Source secret scan failed");
    expectIncludes(files.sourceSecretsScript, "discord-webhook-url");
    expectIncludes(files.sourceSecretsScript, "authorization-header-token");
    expectIncludes(files.sourceSecretsScript, "rtmp-publish-url-key");
    expectIncludes(files.sourceSecretsScript, ".artifacts/rn");
    expectBefore(
      files.releaseCandidateScript,
      "runCommercialSupportBundleGate(report, options);",
      "for (const [label, args] of sourceGates)"
    );
    expectBefore(
      files.releaseCandidateScript,
      '["Bundle React Native JavaScript", ["run", "verify:rn"]]',
      '["Verify source and bundle secret scan", ["run", "verify:source-secrets"]]'
    );
    expectBefore(
      files.releaseCandidateScript,
      '["Verify source and bundle secret scan", ["run", "verify:source-secrets"]]',
      '["Build Android native debug app", ["run", "verify:android-native"]]'
    );
    expectIncludes(files.releaseEvidencePackageScript, "storeReleaseReportArtifactGroup");
    expectIncludes(files.releaseEvidencePackageScript, "storeReleaseReportType");
    expectIncludes(files.releaseEvidencePackageScript, "Verify store release orchestration report");
    expectIncludes(files.releaseEvidencePackageScript, "Package store release report");
    expectIncludes(files.storeReleaseBuildScript, "cannot be used as commercial release evidence");
    expectIncludes(files.releaseEvidencePackageScript, "cannot be used as commercial release evidence");
    expectIncludes(files.releaseEvidencePackageScript, "validateCommercialPackageableReleaseReport");
    expectIncludes(files.releaseEvidencePackageScript, "cannot be used as commercial package evidence");
    expectIncludes(files.releaseEvidencePackageScript, "clean git worktree gate is missing from commercial package evidence");
    expectIncludes(files.releaseEvidencePackageScript, "clean git worktree gate must be passed for commercial package evidence");
    expectIncludes(files.releaseEvidencePackageScript, "uiEvidenceSourceFromReport");
    expectIncludes(files.releaseEvidencePackageScript, ".artifacts/ui-verification.json");
    expectIncludes(files.releaseEvidencePackageScript, "Packaged release report is missing browser UI evidence JSON metadata.");
    expectIncludes(files.releaseEvidencePackageScript, "validatePackagedUiEvidence");
    expectIncludes(files.releaseEvidencePackageScript, "validateManifestGitProvenance");
    expectIncludes(files.releaseEvidencePackageScript, "validatePackageManifestGitAgainstReport");
    expectIncludes(files.releaseEvidencePackageScript, "Package manifest");
    expectIncludes(files.releaseEvidencePackageScript, "Package distribution manifest");
    expectIncludes(files.releaseEvidencePackageScript, "Package dashboard evidence manifest");
    expectIncludes(files.releaseEvidencePackageScript, "Package store submission checklist");
    expectIncludes(files.releaseEvidencePackageScript, "validatePackagedPhysicalDevicePreflightArtifactPath");
    expectIncludes(files.releaseEvidencePackageScript, "Package manifest generatedAt timestamp is missing or invalid");
    expectIncludes(files.releaseEvidencePackageScript, "Release evidence package contains unmanifested file");
    expectIncludes(files.releaseEvidencePackageScript, "Package browser UI evidence is not a MobileLiveCaster browser-ui-verification reportVersion 1 file.");
    expectIncludes(files.releaseEvidencePackageScript, "Package browser UI evidence target must be a loopback http(s) URL.");
    expectIncludes(files.releaseEvidencePackageScript, "currentCommit: reportCommit");
    expectIncludes(files.releaseEvidencePackageScript, "currentCommit: expectedCommit");
    expectIncludes(files.releaseEvidencePackageScript, "Package browser UI evidence for ${viewport.name} is missing text");
    expectIncludes(files.releaseEvidencePackageScript, "Package browser UI evidence for ${viewport.name} is missing Quick Text interaction proof.");
    expectIncludes(files.releaseEvidencePackageScript, "structurally valid PNG file");
    expectIncludes(files.dashboardEvidenceScript, "youtubeScreenshot");
    expectIncludes(files.dashboardEvidenceScript, "twitchScreenshot");
    expectIncludes(files.dashboardEvidenceScript, "platform-dashboard-evidence-manifest");
    expectIncludes(files.dashboardEvidenceScript, "validateManifestGitProvenance");
    expectIncludes(files.dashboardEvidenceScript, "currentCommit = \"\"");
    expectIncludes(files.dashboardEvidenceScript, "readPngEvidence");
    expectIncludes(files.dashboardEvidenceScript, "dashboardScreenshotMinimumShortEdge");
    expectIncludes(files.dashboardEvidenceScript, "Dashboard evidence screenshot dimensions mismatch");
    expectIncludes(files.dashboardEvidenceScript, "statusSummary");
    expectIncludes(files.dashboardEvidenceScript, "must include YouTube broadcastStatus");
    expectIncludes(files.dashboardEvidenceScript, "YouTube broadcastId");
    expectIncludes(files.dashboardEvidenceScript, "must include Twitch liveStatus");
    expectIncludes(files.dashboardEvidenceScript, "Twitch broadcasterId");
    expectIncludes(files.storeSubmissionScript, "store-submission-checklist-manifest");
    expectIncludes(files.storeSubmissionScript, "validateManifestGitProvenance");
    expectIncludes(files.storeSubmissionScript, "currentCommit = \"\"");
    expectIncludes(files.storeSubmissionScript, "readPngEvidence");
    expectIncludes(files.storeSubmissionScript, "privacyPolicyUrl");
    expectIncludes(files.storeSubmissionScript, "dataSafetyNotes");
    expectIncludes(files.storeSubmissionScript, "authToken");
    expectIncludes(files.storeSubmissionScript, "bearer_token");
    expectIncludes(files.storeSubmissionScript, "credential header");
    expectIncludes(files.storeSubmissionScript, "x-api-key");
    expectIncludes(files.storeSubmissionScript, "reviewDocuments");
    expectIncludes(files.storeSubmissionScript, "requireRealDeviceScreenshots");
    expectIncludes(files.storeSubmissionScript, "sha256");
    expectIncludes(files.storeSubmissionDraftScript, "createStoreSubmissionChecklist");
    expectIncludes(files.storeSubmissionDraftScript, "uiEvidenceJson");
    expectIncludes(files.storeSubmissionDraftScript, "submission-metadata.json");
    expectIncludes(files.storeSubmissionDraftScript, "submission-review.md");
    expectIncludes(files.storeRealDeviceScreenshotsScript, "importStoreRealDeviceScreenshots");
    expectIncludes(files.storeRealDeviceScreenshotsScript, "requireRealDeviceScreenshots: true");
    expectIncludes(files.storeRealDeviceScreenshotsScript, "source: \"realDevice\"");
    expectIncludes(files.storeRealDeviceScreenshotsScript, "iosOsVersion");
    expectIncludes(files.storeRealDeviceScreenshotsScript, "appBuild");
    expectIncludes(files.storeSubmissionScript, "must include the real device OS version");
    expectIncludes(files.storeSubmissionScript, "must include the app build/version used for capture");
    expectIncludes(files.storeSubmissionScript, "finalScreenshotMinimumShortEdge");
    expectIncludes(files.storeSubmissionScript, "Store submission screenshot dimensions mismatch");
    expectIncludes(files.storeSubmissionApprovalScript, "validateStoreSubmissionApproval");
    expectIncludes(files.storeSubmissionApprovalScript, "requireRealDeviceScreenshots");
    expectIncludes(files.storeSubmissionApprovalScript, "distributionArtifactManifestPath");
    expectIncludes(files.storeSubmissionApprovalScript, "dashboardEvidenceManifestPath");
    expectIncludes(files.storeSubmissionApprovalScript, "storeReleaseReportArtifactGroup");
    expectIncludes(files.storeSubmissionApprovalScript, "validateStoreReleaseReportInReleaseReport");
    expectIncludes(files.storeSubmissionApprovalScript, "for (const failure of validateReport(report, options))");
    expectIncludes(files.storeSubmissionApprovalScript, "allowDirty: false");
    expectIncludes(files.storeSubmissionApprovalScript, "allowCommitMismatch: false");
    expectIncludes(files.storeSubmissionApprovalScript, "validateCommercialApprovableReleaseReport");
    expectIncludes(files.storeSubmissionApprovalScript, "cannot be used for store submission approval");
    expectIncludes(files.storeSubmissionApprovalScript, "Release report was generated with --allow-warnings");
    expectIncludes(files.storeSubmissionApprovalScript, "clean git worktree gate must be passed for store submission approval");
    expectIncludes(files.storeSubmissionApprovalScript, "validateDashboardStatusFreshness");
    expectIncludes(files.storeSubmissionApprovalScript, "validateStoreScreenshotFreshness");
    expectIncludes(files.storeSubmissionApprovalScript, "maxAgeHours: options.maxAgeHours");
    expectIncludes(files.storeSubmissionApprovalScript, "Store submission approval requires store-release orchestration report");
    expectIncludes(files.storeSubmissionApprovalScript, "distribution artifact evidence");
    expectIncludes(files.storeSubmissionApprovalScript, "YouTube dashboard status JSON");
    expectIncludes(files.storeSubmissionApprovalScript, "Release report is missing store submission artifact");
    expectIncludes(files.storeSubmissionApprovalScript, "validationEvidenceConsistentAppBuild");
    expectIncludes(files.storeSubmissionApprovalScript, "does not match validation evidence build");
    expectIncludes(files.releaseEvidencePackageScript, "release-evidence-package-manifest");
    expectIncludes(files.releaseEvidencePackageScript, "validateReleaseEvidencePackage");
    expectIncludes(files.releaseEvidencePackageScript, "supportBundle");
    expectIncludes(files.releaseEvidencePackageScript, "privacyScan");
    expectIncludes(files.releaseEvidencePackageScript, "requiredCommercialPackageArtifacts");
    expectIncludes(files.releaseEvidencePackageScript, "distributionArtifactManifestPath");
    expectIncludes(files.releaseEvidencePackageScript, "dashboardEvidenceManifestPath");
    expectIncludes(files.releaseEvidencePackageScript, "storeSubmissionChecklistPath");
    expectIncludes(files.releaseEvidencePackageScript, "Packaged release report is missing required commercial artifact group");
    expectIncludes(files.releaseEvidencePackageScript, "validatePackagedCommercialManifests");
    expectIncludes(files.releaseEvidencePackageScript, "Package dashboard evidence screenshot");
    expectIncludes(files.releaseEvidencePackageScript, "validatePackagedDashboardEvidenceFreshness");
    expectIncludes(files.releaseEvidencePackageScript, "validatePackagedStoreSubmissionScreenshots");
    expectIncludes(files.releaseEvidencePackageScript, "validationEvidenceConsistentAppBuild");
    expectIncludes(files.releaseEvidencePackageScript, "createCommercialReleaseGate");
    expectIncludes(files.releaseEvidencePackageScript, "allowWarnings: false");
    expectIncludes(files.releaseEvidencePackageScript, "Package support bundle commercial release gate");
    expectIncludes(files.releaseReportScript, "createCommercialReleaseGate");
    expectIncludes(files.releaseReportScript, "allowWarnings: false");
    expectIncludes(files.releaseReportScript, "Release report support bundle commercial release gate");
    expectIncludes(files.releaseEvidencePackageScript, "dashboardScreenshotStatusMaxSkewMinutes");
    expectIncludes(files.releaseEvidencePackageScript, "Package ${label} references artifact not present in package");
    expectIncludes(files.releaseEvidencePackageScript, "Package ${label} metadata mismatch");
    expectIncludes(files.releaseEvidencePackageScript, "sensitiveJsonPattern");
    expectIncludes(files.releaseEvidencePackageScript, "api_key");
    expectIncludes(files.releaseEvidencePackageScript, "sensitiveHeaderPattern");
    expectIncludes(files.releaseEvidencePackageScript, "contains a sensitive header value");
    expectIncludes(files.releaseEvidencePackageScript, "isGeneratedReactNativeBundlePath");
    expectIncludes(files.releaseEvidencePackageScript, "artifacts/.artifacts/rn/");
    expectIncludes(files.releaseEvidencePackageScript, "endsWith(\".jsbundle\")");
    expectIncludes(files.commercialReleaseGateDomain, "api_key");
    expectIncludes(files.commercialReleaseGateDomain, "sensitiveHeaderPattern");
    expectIncludes(files.commercialReleaseGateDomain, "twitchIrcOauthPattern");
    expectIncludes(files.commercialReleaseGateDomain, "rtmpPublishUrlPattern");
    expectIncludes(files.commercialReleaseBundleScript, "api_key");
    expectIncludes(files.commercialReleaseBundleScript, "sensitiveHeaderPattern");
    expectIncludes(files.commercialReleaseBundleScript, "twitchIrcOauthPattern");
    expectIncludes(files.commercialReleaseBundleScript, "rtmpPublishUrlPattern");
    expectIncludes(files.sensitiveTextDomain, "twitchIrcOauthPattern");
    expectIncludes(files.sensitiveTextDomain, "rtmpPublishUrlPattern");
    expectIncludes(files.sensitiveTextDomainTest, "redacts Twitch IRC oauth commands and RTMP publish URL stream keys");
  }),
  check("Quick text preset actions are locked for Web and React Native release builds", () => {
    expectIncludes(files.sceneDomain, 'export type QuickTextOverlayPresetAction = "show" | "queue" | "pin";');
    expectIncludes(files.sceneDomain, "quickTextOverlayPresetActions");
    expectIncludes(files.sceneDomain, 'action: "show"');
    expectIncludes(files.sceneDomain, 'action: "queue"');
    expectIncludes(files.sceneDomain, 'action: "pin"');
    expectIncludes(files.sceneDomain, "queueQuickTextOverlayPreset");
    expectIncludes(files.sceneDomain, "pinQuickTextOverlayPreset");
    expectIncludes(files.sceneDomain, "applyQuickTextOverlayPreset");
    expectIncludes(files.sceneDomain, "return queueQuickTextOverlayPreset(scene, presetId, request);");
    expectIncludes(files.sceneDomain, "return pinQuickTextOverlayPreset(scene, presetId, request);");
    expectIncludes(files.sceneDomain, "return showQuickTextOverlayPreset(scene, presetId, request);");
    expectIncludes(files.sceneDomainTest, "queues and pins quick text presets for scripted subtitle operation");
    expectIncludes(files.sceneDomainTest, "applies quick text preset actions through a shared action API");
    expectIncludes(files.sceneDomainTest, 'expect(quickTextOverlayPresetActions.map((option) => option.action)).toEqual(["show", "queue", "pin"])');
    expectIncludes(files.webStudioScreen, 'useState<QuickTextOverlayPresetAction>("show")');
    expectIncludes(files.mobileStudioScreen, 'useState<QuickTextOverlayPresetAction>("show")');
    expectIncludes(files.webStudioScreen, "applyQuickTextOverlayPreset(scene, presetId, quickTextPresetAction,");
    expectIncludes(files.mobileStudioScreen, "applyQuickTextOverlayPreset(scene, presetId, quickTextPresetAction,");
    expectIncludes(files.webStudioScreen, "quickTextOverlayPresetActions.map");
    expectIncludes(files.mobileStudioScreen, "quickTextOverlayPresetActions.map");
    expectIncludes(files.webStudioScreen, "Preset action");
    expectIncludes(files.mobileStudioScreen, "Preset action");
    expectIncludes(files.webStudioScreen, "onClick={() => setQuickTextPresetAction(option.action)}");
    expectIncludes(files.mobileStudioScreen, "onPress={() => setQuickTextPresetAction(option.action)}");
    expectIncludes(files.webStyles, "quick-text-action-buttons");
    expectIncludes(files.readme, "preset action switching for immediate display, queued display, or pinned display");
    expectIncludes(files.implementationStatus, "preset action switching for immediate, queued, or pinned display");
  }),
  check("Stream timer text overlays and chat pinning are locked for Web and React Native builds", () => {
    expectIncludes(files.sceneDomain, 'export type TextSourceTimerMode = "none" | "countdown" | "uptime";');
    expectIncludes(files.sceneDomain, '"starting-soon-countdown"');
    expectIncludes(files.sceneDomain, '"uptime-badge"');
    expectIncludes(files.sceneDomain, "formatTimerOverlayText");
    expectIncludes(files.sceneDomain, "streamStartedAtMs");
    expectIncludes(files.sceneDomain, "timerCompleteText");
    expectIncludes(files.sceneDomainTest, "formats countdown and uptime timer overlay text at duration boundaries");
    expectIncludes(files.sceneDomainTest, "switches completed countdown timers to editable complete text");
    expectIncludes(files.sceneDomainTest, "renders timer text overlays through normal text payloads without persisting current values");
    expectIncludes(files.chatReaderDomain, "pinnedMessage: PinnedChatMessage | null");
    expectIncludes(files.chatReaderDomain, "pinChatMessage");
    expectIncludes(files.chatReaderDomain, "unpinChatMessage");
    expectIncludes(files.chatReaderDomain, "pinned: true");
    expectIncludes(files.chatReaderDomainTest, "pins a recent comment at the top of the chat overlay and unpins it");
    expectIncludes(files.chatReaderDomainTest, "clears pinned comments with the chat reader session");
    expectIncludes(files.chatReaderDomainTest, "redacts pinned comment urls through the same overlay selector");
    expectIncludes(files.webApp, "streamStartedAtMs");
    expectIncludes(files.mobileApp, "streamStartedAtMs");
    expectIncludes(files.webStudioScreen, "Starting Soon countdown");
    expectIncludes(files.mobileStudioScreen, "Starting Soon countdown");
    expectIncludes(files.webStudioScreen, "textSourceTimerModes.map");
    expectIncludes(files.mobileStudioScreen, "textSourceTimerModes.map");
    expectIncludes(files.webStudioScreen, "onChatCommentPin");
    expectIncludes(files.mobileStudioScreen, "onChatCommentPin");
    expectIncludes(files.webStyles, "chat-overlay-visual span.pinned");
    expectIncludes(files.readme, "starting-soon countdown timers, uptime badges");
    expectIncludes(files.readme, "session-only recent-comment pinning");
    expectIncludes(files.implementationStatus, "starting-soon countdown timers, uptime badges");
    expectIncludes(files.implementationStatus, "session-only pinned message snapshots rendered at the top");
  }),
  check("Platform stream key UX keeps Twitch reset scope explicit", () => {
    expectIncludes(files.platformStreamKeysDomain, "getPlatformStreamKeyOperationInfo");
    expectIncludes(files.platformStreamKeysDomain, "resolvePlatformStreamKeyOperationPlatform");
    expectIncludes(files.platformStreamKeysDomain, "resolvePlatformStreamKeyStatusMessage");
    expectIncludes(files.platformStreamKeysDomain, "Twitch stream key sync idle; Helix can retrieve the current key but does not expose public reset or rotation.");
    expectIncludes(files.platformStreamKeysDomain, "Reset or rotate the key in Twitch Creator Dashboard, then sync the current Helix key here.");
    expectIncludes(files.platformStreamKeysDomain, "Twitch stream key synced from Helix. Reset or rotate it in Twitch Creator Dashboard, then sync again.");
    expectIncludes(files.platformStreamKeysDomainTest, "describes Twitch stream key sync as Helix-only and dashboard-rotated");
    expectIncludes(files.platformStreamKeysDomainTest, "resolves stream-key operations from the destination before the chat platform fallback");
    expectIncludes(files.platformStreamKeysDomainTest, "shows the current platform idle status instead of stale status from a previous platform");
    expectIncludes(files.webApp, "getPlatformStreamKeyOperationInfo(platform)");
    expectIncludes(files.mobileApp, "getPlatformStreamKeyOperationInfo(platform)");
    expectIncludes(files.webApp, "resolvePlatformStreamKeyStatusMessage(platformStreamKeyStatus, profile)");
    expectIncludes(files.mobileApp, "resolvePlatformStreamKeyStatusMessage(platformStreamKeyStatus, profile)");
    expectIncludes(files.webStudioScreen, "streamKeyOperationPlatform={resolvePlatformStreamKeyOperationPlatform(profile)}");
    expectIncludes(files.mobileStudioScreen, "streamKeyOperationPlatform={resolvePlatformStreamKeyOperationPlatform(profile)}");
    expectIncludes(files.webStudioScreen, "streamKeyOperationInfo.description");
    expectIncludes(files.mobileStudioScreen, "streamKeyOperationInfo.description");
    expectIncludes(files.readme, "Twitch stream-key controls are Helix sync-only");
    expectIncludes(files.implementationStatus, "Twitch stream-key handling is explicitly Helix sync-only");
  }),
  check("Stream announcement sharing is locked for Web and React Native builds", () => {
    expectIncludes(files.streamAnnouncementDomain, "createStreamAnnouncementText");
    expectIncludes(files.streamAnnouncementDomain, "createStreamAnnouncementPreview");
    expectIncludes(files.streamAnnouncementDomain, "normalizeStreamAnnouncementSettings");
    expectIncludes(files.streamAnnouncementDomain, "redactSensitiveText");
    expectIncludes(files.streamAnnouncementDomain, "https://www.youtube.com/watch?v=");
    expectIncludes(files.streamAnnouncementDomain, "https://www.twitch.tv/");
    expectIncludes(files.streamAnnouncementDomainTest, "expands title, platform, and YouTube broadcast watch URL placeholders");
    expectIncludes(files.streamAnnouncementDomainTest, "creates Twitch channel URLs from OAuth login values");
    expectIncludes(files.streamAnnouncementDomainTest, "redacts stream keys and OAuth-shaped secrets from unsafe templates");
    expectIncludes(files.webApp, "streamAnnouncementPromptNonce");
    expectIncludes(files.mobileApp, "streamAnnouncementPromptNonce");
    expectIncludes(files.webStudioScreen, "navigator.share");
    expectIncludes(files.webStudioScreen, "clipboard.writeText");
    expectIncludes(files.webStudioScreen, "Share announcement");
    expectIncludes(files.mobileStudioScreen, "Share.share({ message: streamAnnouncementPreview.text })");
    expectIncludes(files.mobileStudioScreen, "Share announcement");
    expectIncludes(files.webStudioScreen, "sensitive value removed");
    expectIncludes(files.mobileStudioScreen, "sensitive value removed");
    expectIncludes(files.webStudioScreen, "streamAnnouncementPromptVisible");
    expectIncludes(files.mobileStudioScreen, "streamAnnouncementPromptVisible");
    expectIncludes(files.webStyles, "stream-announcement-prompt");
    expectIncludes(files.readme, "one-tap stream announcement sharing");
    expectIncludes(files.implementationStatus, "one-tap stream announcement sharing");
    expectIncludes(files.streamAnnouncementDomain, "autoPostEnabled");
    expectIncludes(files.streamAnnouncementDomain, "discordWebhookUrl");
    expectIncludes(files.streamAnnouncementAutoPostDomain, "postDiscordStreamAnnouncement");
    expectIncludes(files.streamAnnouncementAutoPostDomain, "createStreamAnnouncementAutoPostDecision");
    expectIncludes(files.streamAnnouncementAutoPostDomain, "https://discord.com/api/webhooks/{id}/{token}");
    expectIncludes(files.streamAnnouncementAutoPostDomain, "getPlatformHttpFailureMetadata");
    expectIncludes(files.streamAnnouncementAutoPostDomainTest, "respects Retry-After and retries a retryable non-2xx response once");
    expectIncludes(files.streamAnnouncementAutoPostDomainTest, "fires only for platform-visible live success and dedupes per stream session");
    expectIncludes(files.diagnosticSecretsDomain, "discordWebhookUrl");
    expectIncludes(files.diagnosticSecretsDomain, "platformChatOAuthFlow?.codeVerifier");
    expectIncludes(files.diagnosticSecretsDomain, "twitchDeviceOAuthFlow?.userCode");
    expectIncludes(files.localStoreDomain, "stripSensitiveProfileData(profile)");
    expectIncludes(files.secureProfileStoreDomain, "saveProfile(JSON.stringify(normalizeStudioProfile(profile)))");
    expectIncludes(files.mobileApp, "const persistedDiagnosticSecrets = useMemo");
    expectIncludes(files.mobileApp, "saveMobileStreamSessionSummaries(summaries, persistedDiagnosticSecrets)");
    expectIncludes(files.mobileApp, "saveMobileStreamValidationRuns(streamValidationRuns, persistedDiagnosticSecrets)");
    expectIncludes(files.webApp, "runStreamAnnouncementAutoPost(result.profile, \"youtube-live-transition\")");
    expectIncludes(files.mobileApp, "runStreamAnnouncementAutoPost(result.profile, \"youtube-live-transition\")");
    expectIncludes(files.webStudioScreen, "streamAnnouncementAutoPostStatus");
    expectIncludes(files.mobileStudioScreen, "streamAnnouncementAutoPostStatus");
    expectIncludes(files.webLiveSetupScreen, "Discord webhook URL");
    expectIncludes(files.mobileStudioScreen, "Discord webhook URL");
    expectIncludes(files.webLiveSetupScreen, "Test post");
    expectIncludes(files.mobileStudioScreen, "Test post");
    expectIncludes(files.readme, "Discord webhook auto-posting");
    expectIncludes(files.implementationStatus, "Discord webhook auto-posting");
  }),
  check("Android streaming permissions are declared", () => {
    [
      "android.permission.INTERNET",
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
      "android.permission.FOREGROUND_SERVICE_MICROPHONE"
    ].forEach((permission) => expectIncludes(files.androidManifest, permission));
    expectIncludes(files.androidManifest, 'android:foregroundServiceType="mediaProjection|microphone"');
    expectIncludes(files.androidManifest, 'android:usesCleartextTraffic="${usesCleartextTraffic}"');
  }),
  check("Android release disables cleartext traffic", () => {
    expectIncludes(debugBlock(files.androidGradle), 'manifestPlaceholders = [usesCleartextTraffic: "true"]');
    expectIncludes(releaseBlock(files.androidGradle), 'manifestPlaceholders = [usesCleartextTraffic: "false"]');
  }),
  check("Android OAuth callback schemes are registered", () => {
    expectIncludes(files.androidManifest, 'android:scheme="mobilelivecaster" android:host="oauth"');
    expectIncludes(files.androidManifest, 'android:scheme="com.mobilelivecaster.app"');
    expectNotIncludes(files.androidManifest, "com.example.mobilelivecaster");
  }),
  check("iOS privacy usage descriptions are present", () => {
    expectIncludes(files.iosInfo, "NSCameraUsageDescription");
    expectIncludes(files.iosInfo, "NSMicrophoneUsageDescription");
    expectIncludes(files.iosInfo, "Camera access is used to track your face");
    expectIncludes(files.iosInfo, "Microphone access is used for stream audio");
    expectIncludes(files.iosInfo, "NSAllowsArbitraryLoads");
    expectIncludes(files.iosInfo, "<false/>");
  }),
  check("iOS OAuth callback schemes are registered", () => {
    expectIncludes(files.iosInfo, "mobilelivecaster");
    expectIncludes(files.iosInfo, "com.mobilelivecaster.app");
    expectNotIncludes(files.iosInfo, "com.example.mobilelivecaster");
  }),
  check("iOS commercial identifiers replace React Native defaults", () => {
    expectIosTargetBuildSettings({
      bundleId: iosReleaseConfig.hostBundleId,
      entitlementsPath: iosReleaseConfig.hostEntitlementsPath,
      infoPlistPath: iosReleaseConfig.hostInfoPlistPath
    });
    expectIosTargetBuildSettings({
      bundleId: iosReleaseConfig.broadcastBundleId,
      entitlementsPath: iosReleaseConfig.broadcastEntitlementsPath,
      infoPlistPath: iosReleaseConfig.broadcastInfoPlistPath,
      requiredSettings: {
        APPLICATION_EXTENSION_API_ONLY: "YES",
        PRODUCT_BUNDLE_PACKAGE_TYPE: "XPC!",
        SKIP_INSTALL: "YES"
      }
    });
    expectIosReleaseSigningSettings(iosReleaseConfig.hostBundleId);
    expectIosReleaseSigningSettings(iosReleaseConfig.broadcastBundleId);
    expectNotIncludes(allNativeConfigText(), "org.reactjs.native.example");
    expectNotIncludes(allNativeConfigText(), "group.org.reactjs.native.example");
  }),
  check("iOS production archive/export automation covers Broadcast Upload Extension provisioning", () => {
    expectIncludes(files.packageJson, '"ios:export-options": "node scripts/create-ios-export-options.mjs"');
    expectIncludes(files.packageJson, '"ios:archive:release": "bash -lc');
    expectIncludes(files.packageJson, '"ios:export:release": "bash -lc');
    expectIncludes(files.packageJson, '"ios:verify-release-env": "node scripts/verify-store-release-env.mjs --ios-only"');
    expectIncludes(files.iosReleaseConfigScript, "app-store-connect");
    expectIncludes(files.iosReleaseConfigScript, "provisioningProfiles");
    expectIncludes(files.storeReleaseEnvScript, "iosReleaseEnv.broadcastProfileName");
    expectIncludes(files.storeReleaseEnvScript, "iosReleaseEnv.authKeyPath");
    expectIncludes(files.storeReleaseEnvScript, "iosReleaseEnv.authKeyIssuerId");
    expectIncludes(files.createIosExportOptionsScript, "renderIosExportOptionsPlist");
    expectIncludes(files.archiveIosReleaseScript, "iosArchiveArgs");
    expectIncludes(files.exportIosReleaseScript, "iosExportArgs");
    expectIncludes(files.distributionArtifactsScript, "iosIpa");
    expectIncludes(files.distributionArtifactsScript, ".ipa");
    expectIncludes(files.distributionArtifactsScript, "distribution-artifact-manifest");
    expectIncludes(files.distributionArtifactsScript, "minimumDistributionArtifactBytes");
    expectIncludes(files.distributionArtifactsScript, "ZIP end-of-central-directory");
    expectIncludes(files.distributionArtifactsScript, "requiredZipEntries");
    expectIncludes(files.distributionArtifactsScript, "Payload/*.app/Info.plist");
    expectIncludes(files.storeReleaseBuildScript, "ios:verify-release-env");
    expectIncludes(files.storeReleaseBuildScript, "ios:archive:release");
    expectIncludes(files.storeReleaseBuildScript, "ios:export:release");

    const releaseEnv = {
      [iosReleaseEnv.teamId]: "ABCDE12345",
      [iosReleaseEnv.hostProfileName]: "MobileLiveCaster App Store Profile",
      [iosReleaseEnv.broadcastProfileName]: "MobileLiveCaster Broadcast App Store Profile"
    };
    const exportOptions = renderIosExportOptionsPlist(releaseEnv);
    expectIncludes(exportOptions, "<string>app-store-connect</string>");
    expectIncludes(exportOptions, "<string>manual</string>");
    expectIncludes(exportOptions, `<key>${iosReleaseConfig.hostBundleId}</key>`);
    expectIncludes(exportOptions, `<key>${iosReleaseConfig.broadcastBundleId}</key>`);
    expectIncludes(exportOptions, "<key>stripSwiftSymbols</key>");
    expectIncludes(exportOptions, "<key>uploadSymbols</key>");
    expectArrayIncludes(iosArchiveArgs(releaseEnv), "-allowProvisioningUpdates");
    expectArrayIncludes(iosArchiveArgs(releaseEnv), "CODE_SIGN_STYLE=Automatic");
    expectArrayIncludes(iosArchiveArgs(releaseEnv), "CODE_SIGN_IDENTITY=Apple Distribution");
    expectArrayIncludes(iosExportArgs(releaseEnv), "-exportArchive");
    expectArrayIncludes(iosExportArgs(releaseEnv), "-exportOptionsPlist");
  }),
  check("Native store version metadata is aligned", () => {
    const defaultConfig = androidDefaultConfigBlock(files.androidGradle);
    const androidVersionName = gradleStringSetting(defaultConfig, "versionName");
    const androidVersionCode = gradleNumberSetting(defaultConfig, "versionCode");
    expectIncludes(files.androidGradle, 'namespace "com.mobilelivecaster"');
    expectIncludes(defaultConfig, 'applicationId "com.mobilelivecaster"');
    expectIncludes(files.iosInfo, "<string>$(MARKETING_VERSION)</string>");
    expectIncludes(files.iosInfo, "<string>$(CURRENT_PROJECT_VERSION)</string>");
    expectIncludes(files.broadcastInfo, "<string>$(MARKETING_VERSION)</string>");
    expectIncludes(files.broadcastInfo, "<string>$(CURRENT_PROJECT_VERSION)</string>");

    for (const bundleId of [iosReleaseConfig.hostBundleId, iosReleaseConfig.broadcastBundleId]) {
      for (const config of iosTargetBuildConfigurations(bundleId)) {
        expectEqual(config.settings.MARKETING_VERSION, androidVersionName, `${bundleId} ${config.name} marketing version`);
        expectEqual(
          config.settings.CURRENT_PROJECT_VERSION,
          String(androidVersionCode),
          `${bundleId} ${config.name} build number`
        );
      }
    }
  }),
  check("iOS App Group entitlements are aligned for host and Broadcast Upload Extension", () => {
    const hostGroups = plistArrayStrings(files.iosEntitlements, "com.apple.security.application-groups");
    const broadcastGroups = plistArrayStrings(files.broadcastEntitlements, "com.apple.security.application-groups");
    expectSameMembers(hostGroups, [iosReleaseConfig.appGroupId], "host app groups");
    expectSameMembers(broadcastGroups, [iosReleaseConfig.appGroupId], "broadcast extension app groups");
    expectIncludes(files.liveCasterBridge, `liveCasterAppGroup = "${iosReleaseConfig.appGroupId}"`);
    expectIncludes(files.liveCasterBridge, `liveCasterBroadcastExtensionId = "${iosReleaseConfig.broadcastBundleId}"`);
    expectIncludes(files.broadcastHandler, `broadcastAppGroup = "${iosReleaseConfig.appGroupId}"`);
  }),
  check("iOS broadcast credentials use the shared Keychain instead of App Group UserDefaults", () => {
    const handoffPayload = swiftFunctionBlock(
      files.liveCasterBridge,
      "func payload(renderGraphJSON: String, handoffID: String, expiresAt: Double)"
    );
    expectNotIncludes(handoffPayload, '"serverUrl"');
    expectNotIncludes(handoffPayload, '"streamKey"');
    expectNotIncludes(handoffPayload, '"publishUrl"');
    expectIncludes(files.broadcastCredentialStore, `accessGroup = "${iosReleaseConfig.appGroupId}"`);
    expectIncludes(files.broadcastCredentialStore, "kSecAttrAccessGroup");
    expectIncludes(files.broadcastCredentialStore, "kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly");
    expectIncludes(files.broadcastCredentialStore, "SecItemUpdate");
    expectIncludes(files.broadcastCredentialStore, 'accountPrefix = "publish-url."');
    expectIncludes(files.broadcastCredentialStore, 'case handoffID = "handoffId"');
    expectIncludes(files.broadcastCredentialStore, 'case publishURL = "publishUrl"');
    expectIncludes(files.broadcastCredentialStore, "static func consumePublishURL(");
    expectIncludes(files.broadcastCredentialStore, "static func clearExpiredCredentials(");
    expectIncludes(files.liveCasterBridge, "let handoffID = UUID().uuidString.lowercased()");
    const metadataWriter = swiftFunctionBlock(files.liveCasterBridge, "func saveConfigurationMetadata(");
    expectNotIncludes(metadataWriter, "savePublishURL");
    expectIncludes(files.liveCasterBridge, "scheduleCredentialCleanupLocked(");
    expectIncludes(files.broadcastHandler, 'setupInfo["publishUrl"] = publishURL as NSString');
    expectIncludes(files.broadcastHandler, "expectedHandoffID != handoffID");
    expectIncludes(files.broadcastHandler, "clearCredential(handoffID: handoffID)");
    const broadcastStarted = swiftFunctionBlock(
      files.broadcastHandler,
      "override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?)"
    );
    expectIncludes(broadcastStarted, "let requestedHandoffID = BroadcastSharedStore.currentHandoffID()");
    expectIncludes(broadcastStarted, "clearCredential(handoffID: requestedHandoffID)");
    const currentHandoffReads = broadcastStarted.match(/currentHandoffID\(\)/g) ?? [];
    expectEqual(currentHandoffReads.length, 1, "broadcast start handoff snapshot reads");
    const extensionCredentialClear = swiftFunctionBlock(
      files.broadcastHandler,
      "static func clearCredential(handoffID: String)"
    );
    expectNotIncludes(extensionCredentialClear, "removeObject");
    const sourceMemberships = files.xcodeProject.match(/LiveCasterBroadcastCredentialStore\.swift in Sources/g) ?? [];
    expectEqual(sourceMemberships.length, 4, "shared credential store Xcode source memberships");
  }),
  check("Native diagnostic histories use authenticated device-bound encryption", () => {
    expectIncludes(files.diagnosticHistoryStore, "AES.GCM.seal");
    expectIncludes(files.diagnosticHistoryStore, "AES.GCM.open");
    expectIncludes(files.diagnosticHistoryStore, "kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly");
    expectIncludes(files.diagnosticHistoryStore, ".completeFileProtectionUntilFirstUserAuthentication");
    expectIncludes(files.diagnosticHistoryStore, "isExcludedFromBackup = true");
    expectIncludes(files.xcodeProject, "LiveCasterDiagnosticHistoryStore.swift in Sources");
    expectIncludes(files.androidDiagnosticHistoryCipher, 'TRANSFORMATION = "AES/GCM/NoPadding"');
    expectIncludes(files.androidDiagnosticHistoryCipher, ".setKeySize(256)");
    expectIncludes(files.androidDiagnosticHistoryCipher, ".setRandomizedEncryptionRequired(true)");
    expectIncludes(files.androidSceneStore, "SESSION_SUMMARIES_ENCRYPTED");
    expectIncludes(files.androidSceneStore, "VALIDATION_RUNS_ENCRYPTED");
    expectNotIncludes(files.androidSceneStore, "putString(SESSION_SUMMARIES_JSON, summariesJson)");
    expectNotIncludes(files.androidSceneStore, "putString(VALIDATION_RUNS_JSON, runsJson)");
  }),
  check("iOS speech synthesis is serialized on the main queue", () => {
    expectIncludes(files.liveCasterSpeech, "AVSpeechSynthesizerDelegate, @unchecked Sendable");
    expectIncludes(files.liveCasterSpeech, "static func requiresMainQueueSetup() -> Bool");
    expectIncludes(files.liveCasterSpeech, "performOnMain");
    expectIncludes(files.liveCasterSpeech, "dispatchPrecondition(condition: .onQueue(.main))");
    expectIncludes(files.liveCasterSpeech, "DispatchQueue.main.async");
  }),
  check("iOS React Native bundle phase declares intentional every-build execution", () => {
    expectIncludes(files.xcodeProject, "alwaysOutOfDate = 1;");
    expectIncludes(files.xcodeProject, "Bundle React Native code and images");
  }),
  check("iOS privacy manifest is packaged and non-tracking", () => {
    expectIncludes(files.iosPrivacy, "NSPrivacyTracking");
    expectIncludes(files.iosPrivacy, "<false/>");
    expectIncludes(files.iosPrivacy, "NSPrivacyAccessedAPICategoryFileTimestamp");
    expectIncludes(files.iosPrivacy, "NSPrivacyAccessedAPICategoryUserDefaults");
    expectIncludes(files.xcodeProject, "PrivacyInfo.xcprivacy in Resources");
  }),
  check("ReplayKit broadcast extension is configured", () => {
    expectIncludes(files.broadcastInfo, "com.apple.broadcast-services-upload");
    expectIncludes(files.broadcastInfo, "RPBroadcastProcessModeSampleBuffer");
    expectIncludes(files.broadcastInfo, "NSMicrophoneUsageDescription");
  }),
  check("Production native sources do not contain unresolved implementation markers", () => {
    if (productionNativeSourceFiles.length === 0) {
      throw new Error("missing production native source files");
    }
    for (const sourcePath of productionNativeSourcePaths) {
      expectArrayIncludes(releaseConfigArtifactPaths, sourcePath);
    }
    expectArrayIncludes(releaseConfigArtifactPaths, "ios/MobileLiveCasterBroadcastUpload/SampleHandler.swift");
    expectArrayIncludes(releaseConfigArtifactPaths, "android/app/src/main/java/com/mobilelivecaster/streaming/MediaProjectionService.kt");

    const unresolvedImplementationPattern = /\b(?:TODO|FIXME)\b|Not implemented|not implemented/g;
    for (const sourceFile of productionNativeSourceFiles) {
      const matches = [...sourceFile.content.matchAll(unresolvedImplementationPattern)];
      if (matches.length > 0) {
        throw new Error(`${sourceFile.path} contains unresolved implementation marker ${JSON.stringify(matches[0][0])}`);
      }
    }
  }),
  check("Legacy native scaffold sources are not present", () => {
    if (staleNativeScaffoldSourcePaths.length > 0) {
      throw new Error(`remove duplicate native scaffold source ${staleNativeScaffoldSourcePaths[0]}`);
    }
  })
];

const failures = checks.flatMap((result) => (result.ok ? [] : [`${result.name}: ${result.error.message}`]));

if (failures.length > 0) {
  console.error("Release configuration verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  exit(1);
}

console.log(`Release configuration verification passed (${checks.length} checks).`);

function read(relativePath) {
  assertRegularSourceFile(relativePath, "Release configuration file");
  return readFileSync(join(root, relativePath), "utf8");
}

function collectOptionalSourceFiles(relativePath, extensions) {
  const directory = join(root, relativePath);
  if (!existsSync(directory)) {
    return [];
  }
  assertRegularDirectory(relativePath, "Release configuration source directory");
  return readdirSync(directory, { withFileTypes: true }).flatMap((dirent) => {
    const childPath = `${relativePath}/${dirent.name}`;
    const childStat = lstatSync(join(root, childPath));
    if (childStat.isSymbolicLink()) {
      throw new Error(`Release configuration source path must not be a symbolic link: ${childPath}`);
    }
    if (childStat.isDirectory()) {
      return collectOptionalSourceFiles(childPath, extensions);
    }
    if (!childStat.isFile() || !extensions.some((extension) => childPath.endsWith(extension))) {
      return [];
    }
    return [childPath];
  });
}

function assertRegularSourceFile(path, label) {
  assertNoSymlinkedParentDirectories(path, label);
  const stat = lstatSync(join(root, path));
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${path}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} must point to a file: ${path}`);
  }
}

function assertRegularDirectory(path, label) {
  assertNoSymlinkedParentDirectories(path, label);
  const stat = lstatSync(join(root, path));
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${path}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`${label} must point to a directory: ${path}`);
  }
}

function assertNoSymlinkedParentDirectories(path, label) {
  const relativePath = workspaceRelativePath(path);
  if (!relativePath) {
    return;
  }
  const parts = relativePath.split(sep).filter(Boolean);
  let currentPath = root;
  for (const part of parts.slice(0, -1)) {
    currentPath = join(currentPath, part);
    const stat = lstatExisting(currentPath);
    if (!stat) {
      return;
    }
    const displayPath = relative(root, currentPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} path parent must not be a symbolic link: ${displayPath}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`${label} path parent must point to a directory: ${displayPath}`);
    }
  }
}

function workspaceRelativePath(path) {
  const absolutePath = resolve(root, path);
  const relativePath = relative(root, absolutePath);
  if (relativePath === "") {
    return ".";
  }
  if (relativePath.startsWith("..") || relativePath === ".." || relativePath.includes(`..${sep}`)) {
    return null;
  }
  return relativePath;
}

function lstatExisting(path) {
  try {
    return lstatSync(resolve(path));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function check(name, assertion) {
  try {
    assertion();
    return { name, ok: true };
  } catch (error) {
    return { name, ok: false, error };
  }
}

function expectIncludes(value, needle) {
  if (!value.includes(needle)) {
    throw new Error(`missing ${JSON.stringify(needle)}`);
  }
}

function expectNotIncludes(value, needle) {
  if (value.includes(needle)) {
    throw new Error(`unexpected ${JSON.stringify(needle)}`);
  }
}

function expectBefore(value, firstNeedle, secondNeedle) {
  const firstIndex = value.indexOf(firstNeedle);
  const secondIndex = value.indexOf(secondNeedle);
  if (firstIndex === -1) {
    throw new Error(`missing ${JSON.stringify(firstNeedle)}`);
  }
  if (secondIndex === -1) {
    throw new Error(`missing ${JSON.stringify(secondNeedle)}`);
  }
  if (firstIndex >= secondIndex) {
    throw new Error(`${JSON.stringify(firstNeedle)} must appear before ${JSON.stringify(secondNeedle)}`);
  }
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function expectArrayIncludes(values, expected) {
  if (!values.includes(expected)) {
    throw new Error(`missing array value ${JSON.stringify(expected)}`);
  }
}

function expectSameMembers(actual, expected, label) {
  const normalizedActual = [...actual].sort();
  const normalizedExpected = [...expected].sort();
  if (
    normalizedActual.length !== normalizedExpected.length ||
    normalizedActual.some((value, index) => value !== normalizedExpected[index])
  ) {
    throw new Error(`${label} expected ${JSON.stringify(normalizedExpected)}, got ${JSON.stringify(normalizedActual)}`);
  }
}

function plistArrayStrings(plistText, key) {
  const keyPattern = escapeRegExp(`<key>${key}</key>`);
  const match = plistText.match(new RegExp(`${keyPattern}\\s*<array>([\\s\\S]*?)</array>`));
  if (!match) {
    throw new Error(`missing plist array ${JSON.stringify(key)}`);
  }

  return [...match[1].matchAll(/<string>(.*?)<\/string>/g)].map((result) => result[1]);
}

function expectIosTargetBuildSettings({ bundleId, entitlementsPath, infoPlistPath, requiredSettings = {} }) {
  const configs = iosTargetBuildConfigurations(bundleId);

  for (const config of configs) {
    expectEqual(config.settings.CODE_SIGN_ENTITLEMENTS, entitlementsPath, `${bundleId} ${config.name} entitlements`);
    expectEqual(config.settings.INFOPLIST_FILE, infoPlistPath, `${bundleId} ${config.name} Info.plist`);
    for (const [settingName, expectedValue] of Object.entries(requiredSettings)) {
      expectEqual(config.settings[settingName], expectedValue, `${bundleId} ${config.name} ${settingName}`);
    }
  }
}

function expectIosReleaseSigningSettings(bundleId) {
  const releaseConfig = iosTargetBuildConfigurations(bundleId).find((config) => config.name === "Release");
  expectEqual(releaseConfig.settings.CODE_SIGN_STYLE, "Automatic", `${bundleId} Release code signing style`);
  expectEqual(releaseConfig.settings.DEVELOPMENT_TEAM, "$(MLC_IOS_TEAM_ID)", `${bundleId} Release development team`);
  expectEqual(
    releaseConfig.settings["CODE_SIGN_IDENTITY[sdk=iphoneos*]"],
    "Apple Distribution",
    `${bundleId} Release signing identity`
  );
}

function iosTargetBuildConfigurations(bundleId) {
  const configs = xcodeBuildConfigurations(files.xcodeProject).filter(
    (config) => config.settings.PRODUCT_BUNDLE_IDENTIFIER === bundleId
  );
  const debugConfig = configs.find((config) => config.name === "Debug");
  const releaseConfig = configs.find((config) => config.name === "Release");

  if (!debugConfig || !releaseConfig) {
    throw new Error(`missing Debug/Release build settings for ${bundleId}`);
  }

  return [debugConfig, releaseConfig];
}

function xcodeBuildConfigurations(projectText) {
  const sectionStart = projectText.indexOf("/* Begin XCBuildConfiguration section */");
  const sectionEnd = projectText.indexOf("/* End XCBuildConfiguration section */");
  if (sectionStart === -1 || sectionEnd === -1 || sectionEnd <= sectionStart) {
    throw new Error("missing XCBuildConfiguration section");
  }

  const section = projectText.slice(sectionStart, sectionEnd);
  const regex = /\t\t([A-F0-9]+) \/\* (Debug|Release) \*\/ = \{\n([\s\S]*?)\n\t\t\};/g;
  return [...section.matchAll(regex)].map((match) => ({
    id: match[1],
    name: match[2],
    settings: xcodeBuildSettings(match[3])
  }));
}

function xcodeBuildSettings(configurationText) {
  const settings = {};
  const regex = /^\s*("[^"]+"|[A-Z0-9_]+) = (.+?);$/gm;
  for (const match of configurationText.matchAll(regex)) {
    settings[stripPbxScalar(match[1])] = stripPbxScalar(match[2]);
  }
  return settings;
}

function stripPbxScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function releaseBlock(gradleText) {
  return buildTypeBlock(gradleText, "release");
}

function debugBlock(gradleText) {
  return buildTypeBlock(gradleText, "debug");
}

function androidDefaultConfigBlock(gradleText) {
  return extractGradleBlock(gradleText, "defaultConfig {", "Android defaultConfig");
}

function buildTypeBlock(gradleText, name) {
  const buildTypes = extractGradleBlock(gradleText, "buildTypes {", "buildTypes");
  return extractGradleBlock(buildTypes, `${name} {`, `${name} build type`);
}

function gradleStringSetting(blockText, name) {
  const match = blockText.match(new RegExp(`^\\s*${escapeRegExp(name)}\\s+"([^"]+)"`, "m"));
  if (!match) {
    throw new Error(`missing Gradle string setting ${name}`);
  }
  return match[1];
}

function gradleNumberSetting(blockText, name) {
  const match = blockText.match(new RegExp(`^\\s*${escapeRegExp(name)}\\s+(\\d+)\\b`, "m"));
  if (!match) {
    throw new Error(`missing Gradle number setting ${name}`);
  }
  return Number(match[1]);
}

function extractGradleBlock(gradleText, marker, label) {
  const start = gradleText.indexOf(marker);
  if (start === -1) {
    throw new Error(`missing ${label}`);
  }

  let depth = 0;
  for (let index = start; index < gradleText.length; index += 1) {
    const char = gradleText[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return gradleText.slice(start, index + 1);
      }
    }
  }

  throw new Error(`unterminated ${label}`);
}

function allNativeConfigText() {
  return [
    files.androidManifest,
    files.iosInfo,
    files.iosEntitlements,
    files.broadcastInfo,
    files.broadcastEntitlements,
    files.xcodeProject,
    files.liveCasterBridge,
    files.broadcastCredentialStore,
    files.broadcastHandler
  ].join("\n");
}

function swiftFunctionBlock(swiftText, signature) {
  const signatureIndex = swiftText.indexOf(signature);
  if (signatureIndex === -1) {
    throw new Error(`missing Swift function ${signature}`);
  }
  const openingBraceIndex = swiftText.indexOf("{", signatureIndex + signature.length);
  if (openingBraceIndex === -1) {
    throw new Error(`missing opening brace for Swift function ${signature}`);
  }

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
