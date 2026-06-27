import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd, exit } from "node:process";
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
  storeSubmissionDraftScript: read("scripts/create-store-submission-draft.mjs"),
  storeRealDeviceScreenshotsScript: read("scripts/import-store-real-device-screenshots.mjs"),
  releaseCandidateScript: read("scripts/verify-release-candidate.mjs"),
  releaseReportScript: read("scripts/verify-release-report.mjs"),
  releaseEvidencePackageScript: read("scripts/create-release-evidence-package.mjs"),
  releaseUrlPolicyScript: read("scripts/release-url-policy.mjs"),
  iosReleaseConfigScript: read("scripts/ios-release-config.mjs"),
  createIosExportOptionsScript: read("scripts/create-ios-export-options.mjs"),
  archiveIosReleaseScript: read("scripts/archive-ios-release.mjs"),
  exportIosReleaseScript: read("scripts/export-ios-release.mjs"),
  storeReleaseEnvScript: read("scripts/verify-store-release-env.mjs"),
  distributionArtifactsScript: read("scripts/verify-distribution-artifacts.mjs"),
  dashboardEvidenceScript: read("scripts/verify-platform-dashboard-evidence.mjs"),
  storeSubmissionScript: read("scripts/verify-store-submission-checklist.mjs"),
  storeSubmissionApprovalScript: read("scripts/verify-store-submission-approval.mjs"),
  liveCasterBridge: read("ios/MobileLiveCaster/LiveCasterBridge.swift"),
  broadcastHandler: read("ios/MobileLiveCasterBroadcastUpload/SampleHandler.swift")
};

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
    expectIncludes(files.distributionArtifactsScript, "androidAab");
    expectIncludes(files.distributionArtifactsScript, ".aab");
    expectIncludes(files.distributionArtifactsScript, "sha256");
    expectIncludes(files.storeReleaseBuildScript, "android:verify-release-env");
    expectIncludes(files.storeReleaseBuildScript, "android:bundleRelease");
    expectIncludes(files.storeReleaseBuildScript, "createDistributionManifest");
    expectIncludes(files.storeReleaseBuildScript, "store-release-orchestration");
    expectIncludes(files.storeReleaseBuildScript, "--report-json");
    expectIncludes(files.storeReleaseBuildScript, "Store release report written to");
    expectIncludes(files.storeReleaseBuildScript, "distributionManifestSummary");
    expectIncludes(files.storeReleaseBuildScript, "validateStoreReleaseReport");
    expectIncludes(files.storeReleaseBuildScript, "collectStoreReleaseArtifactRecords");
    expectIncludes(files.releaseCandidateScript, "--store-release-report-json");
    expectIncludes(files.releaseCandidateScript, "Verify store release orchestration report");
    expectIncludes(files.releaseCandidateScript, "Verify store submission evidence requirements");
    expectIncludes(files.releaseCandidateScript, "Verify store submission handoff evidence integrity");
    expectIncludes(files.releaseCandidateScript, "storeSubmissionChecklistPath");
    expectIncludes(files.releaseCandidateScript, "distributionArtifactManifestPath");
    expectIncludes(files.releaseCandidateScript, "dashboardEvidenceManifestPath");
    expectIncludes(files.releaseCandidateScript, "Distribution artifact manifest is required");
    expectIncludes(files.releaseCandidateScript, "Dashboard evidence manifest is required");
    expectIncludes(files.releaseCandidateScript, "Dashboard evidence status JSON");
    expectIncludes(files.releaseCandidateScript, "requireRealDeviceScreenshots: true");
    expectIncludes(files.releaseCandidateScript, "Store release orchestration report is required");
    expectIncludes(files.releaseCandidateScript, "isLoopbackHttpUrl");
    expectIncludes(files.releaseCandidateScript, "--ui-url must be a loopback http(s) URL");
    expectIncludes(files.releaseCandidateScript, "UI evidence target must be a loopback http(s) URL.");
    expectIncludes(files.releaseReportScript, "Browser UI evidence target must be a loopback http(s) URL.");
    expectIncludes(files.releaseReportScript, "Browser UI evidence is not a MobileLiveCaster browser-ui-verification reportVersion 1 file.");
    expectIncludes(files.releaseReportScript, "Browser UI evidence finishedAt timestamp is missing or invalid.");
    expectIncludes(files.releaseReportScript, "Browser UI evidence for ${viewport.name} is missing text");
    expectIncludes(files.releaseReportScript, "Browser UI verification is missing evidence artifact");
    expectIncludes(files.releaseReportScript, "defaultBrowserUiEvidencePath");
    expectIncludes(files.releaseReportScript, "requiredUiTextChecks");
    expectIncludes(files.releaseUrlPolicyScript, "isLoopbackHttpUrl");
    expectIncludes(files.releaseUrlPolicyScript, "localhost");
    expectIncludes(files.releaseUrlPolicyScript, "127.0.0.1");
    expectIncludes(files.releaseUrlPolicyScript, "[::1]");
    expectIncludes(files.releaseArtifactPolicyScript, "scripts/release-url-policy.mjs");
    expectIncludes(files.releaseCandidateScript, "runCommercialSupportBundleGate(report, options);");
    expectBefore(
      files.releaseCandidateScript,
      "runCommercialSupportBundleGate(report, options);",
      "for (const [label, args] of sourceGates)"
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
    expectIncludes(files.releaseEvidencePackageScript, "Package browser UI evidence is not a MobileLiveCaster browser-ui-verification reportVersion 1 file.");
    expectIncludes(files.releaseEvidencePackageScript, "Package browser UI evidence target must be a loopback http(s) URL.");
    expectIncludes(files.releaseEvidencePackageScript, "Package browser UI evidence for ${viewport.name} is missing text");
    expectIncludes(files.dashboardEvidenceScript, "youtubeScreenshot");
    expectIncludes(files.dashboardEvidenceScript, "twitchScreenshot");
    expectIncludes(files.dashboardEvidenceScript, "platform-dashboard-evidence-manifest");
    expectIncludes(files.dashboardEvidenceScript, "dashboardScreenshotMinimumShortEdge");
    expectIncludes(files.dashboardEvidenceScript, "Dashboard evidence screenshot dimensions mismatch");
    expectIncludes(files.dashboardEvidenceScript, "statusSummary");
    expectIncludes(files.dashboardEvidenceScript, "must include YouTube broadcastStatus");
    expectIncludes(files.dashboardEvidenceScript, "YouTube broadcastId");
    expectIncludes(files.dashboardEvidenceScript, "must include Twitch liveStatus");
    expectIncludes(files.dashboardEvidenceScript, "Twitch broadcasterId");
    expectIncludes(files.storeSubmissionScript, "store-submission-checklist-manifest");
    expectIncludes(files.storeSubmissionScript, "privacyPolicyUrl");
    expectIncludes(files.storeSubmissionScript, "dataSafetyNotes");
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
    expectIncludes(files.storeSubmissionApprovalScript, "validateCommercialApprovableReleaseReport");
    expectIncludes(files.storeSubmissionApprovalScript, "cannot be used for store submission approval");
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
    expectIncludes(files.releaseEvidencePackageScript, "releaseReport?.options?.allowWarnings");
    expectIncludes(files.releaseEvidencePackageScript, "Package support bundle commercial release gate");
    expectIncludes(files.releaseReportScript, "createCommercialReleaseGate");
    expectIncludes(files.releaseReportScript, "report?.options?.allowWarnings");
    expectIncludes(files.releaseReportScript, "Release report support bundle commercial release gate");
    expectIncludes(files.releaseEvidencePackageScript, "dashboardScreenshotStatusMaxSkewMinutes");
    expectIncludes(files.releaseEvidencePackageScript, "Package ${label} references artifact not present in package");
    expectIncludes(files.releaseEvidencePackageScript, "Package ${label} metadata mismatch");
    expectIncludes(files.releaseEvidencePackageScript, "sensitiveJsonPattern");
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
  return readFileSync(join(root, relativePath), "utf8");
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
    files.broadcastHandler
  ].join("\n");
}
