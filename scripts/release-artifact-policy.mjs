import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";

const staticReleaseConfigArtifactPaths = [
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  ".github/workflows/ci.yml",
  ".github/workflows/auto-merge.yml",
  "scripts/release-artifact-policy.mjs",
  "scripts/release-store-build.mjs",
  "scripts/archive-ios-release.mjs",
  "scripts/create-store-submission-draft.mjs",
  "scripts/import-store-real-device-screenshots.mjs",
  "scripts/create-release-evidence-package.mjs",
  "scripts/create-ios-export-options.mjs",
  "scripts/export-ios-release.mjs",
  "scripts/ios-release-config.mjs",
  "scripts/verify-release-candidate.mjs",
  "scripts/verify-release-config.mjs",
  "scripts/verify-commercial-release-bundle.mjs",
  "scripts/verify-store-release-env.mjs",
  "scripts/verify-distribution-artifacts.mjs",
  "scripts/verify-platform-dashboard-evidence.mjs",
  "scripts/verify-store-submission-checklist.mjs",
  "scripts/verify-store-submission-approval.mjs",
  "scripts/verify-release-report.mjs",
  "scripts/release-url-policy.mjs",
  "scripts/verify-repo-automation.mjs",
  "scripts/verify-scripts.mjs",
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

export const productionNativeSourcePaths = [
  ...collectSourceFiles("android/app/src/main/java", [".kt", ".java"]),
  ...collectSourceFiles("ios/MobileLiveCaster", [".swift", ".m", ".mm"]),
  ...collectSourceFiles("ios/MobileLiveCasterBroadcastUpload", [".swift", ".m", ".mm"])
].sort((left, right) => left.localeCompare(right));

export const releaseConfigArtifactPaths = [...new Set([...staticReleaseConfigArtifactPaths, ...productionNativeSourcePaths])].sort(
  (left, right) => left.localeCompare(right)
);

export const requiredReleaseGateLabels = [
  "Verify clean git worktree",
  "Verify release automation scripts",
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

function collectSourceFiles(relativePath, extensions) {
  const absoluteDirectory = join(cwd(), relativePath);
  if (!existsSync(absoluteDirectory) || !statSync(absoluteDirectory).isDirectory()) {
    return [];
  }
  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((dirent) => {
    const childPath = `${relativePath}/${dirent.name}`;
    if (dirent.isDirectory()) {
      return collectSourceFiles(childPath, extensions);
    }
    if (!dirent.isFile() || !extensions.some((extension) => childPath.endsWith(extension))) {
      return [];
    }
    return [childPath];
  });
}
