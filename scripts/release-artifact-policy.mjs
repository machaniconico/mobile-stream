export const releaseConfigArtifactPaths = [
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  ".github/workflows/ci.yml",
  ".github/workflows/auto-merge.yml",
  "scripts/release-artifact-policy.mjs",
  "scripts/verify-release-candidate.mjs",
  "scripts/verify-release-config.mjs",
  "scripts/verify-commercial-release-bundle.mjs",
  "scripts/verify-release-report.mjs",
  "scripts/verify-repo-automation.mjs",
  "scripts/verify-ui.mjs",
  "scripts/verify-web-bundle-size.mjs",
  "android/app/build.gradle",
  "android/app/proguard-rules.pro",
  "android/app/src/main/AndroidManifest.xml",
  "ios/MobileLiveCaster.xcodeproj/project.pbxproj",
  "ios/MobileLiveCaster.xcodeproj/xcshareddata/xcschemes/MobileLiveCaster.xcscheme",
  "ios/MobileLiveCaster/Info.plist",
  "ios/MobileLiveCaster/MobileLiveCaster.entitlements",
  "ios/MobileLiveCaster/PrivacyInfo.xcprivacy",
  "ios/MobileLiveCasterBroadcastUpload/Info.plist",
  "ios/MobileLiveCasterBroadcastUpload/MobileLiveCasterBroadcastUpload.entitlements"
];

export const requiredReleaseGateLabels = [
  "Verify clean git worktree",
  "Verify repository automation safety",
  "Verify native release configuration",
  "Run unit tests",
  "Typecheck web and React Native",
  "Build web prototype",
  "Verify web bundle size",
  "Bundle React Native JavaScript",
  "Verify commercial release support bundle"
];

export const requiredReleaseArtifactGroups = ["release-config", "web", "react-native", "ui"];
