import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd, exit } from "node:process";

const root = cwd();

const files = {
  androidGradle: read("android/app/build.gradle"),
  androidManifest: read("android/app/src/main/AndroidManifest.xml"),
  iosInfo: read("ios/MobileLiveCaster/Info.plist"),
  iosPrivacy: read("ios/MobileLiveCaster/PrivacyInfo.xcprivacy"),
  iosEntitlements: read("ios/MobileLiveCaster/MobileLiveCaster.entitlements"),
  broadcastInfo: read("ios/MobileLiveCasterBroadcastUpload/Info.plist"),
  broadcastEntitlements: read("ios/MobileLiveCasterBroadcastUpload/MobileLiveCasterBroadcastUpload.entitlements"),
  xcodeProject: read("ios/MobileLiveCaster.xcodeproj/project.pbxproj"),
  liveCasterBridge: read("ios/MobileLiveCaster/LiveCasterBridge.swift"),
  broadcastHandler: read("ios/MobileLiveCasterBroadcastUpload/SampleHandler.swift")
};

const iosReleaseConfig = {
  hostBundleId: "com.mobilelivecaster.app",
  hostEntitlementsPath: "MobileLiveCaster/MobileLiveCaster.entitlements",
  hostInfoPlistPath: "MobileLiveCaster/Info.plist",
  broadcastBundleId: "com.mobilelivecaster.app.BroadcastUpload",
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
    expectNotIncludes(allNativeConfigText(), "org.reactjs.native.example");
    expectNotIncludes(allNativeConfigText(), "group.org.reactjs.native.example");
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

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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
  const configs = xcodeBuildConfigurations(files.xcodeProject).filter(
    (config) => config.settings.PRODUCT_BUNDLE_IDENTIFIER === bundleId
  );
  const debugConfig = configs.find((config) => config.name === "Debug");
  const releaseConfig = configs.find((config) => config.name === "Release");

  if (!debugConfig || !releaseConfig) {
    throw new Error(`missing Debug/Release build settings for ${bundleId}`);
  }

  for (const config of [debugConfig, releaseConfig]) {
    expectEqual(config.settings.CODE_SIGN_ENTITLEMENTS, entitlementsPath, `${bundleId} ${config.name} entitlements`);
    expectEqual(config.settings.INFOPLIST_FILE, infoPlistPath, `${bundleId} ${config.name} Info.plist`);
    for (const [settingName, expectedValue] of Object.entries(requiredSettings)) {
      expectEqual(config.settings[settingName], expectedValue, `${bundleId} ${config.name} ${settingName}`);
    }
  }
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
  const regex = /^\s*([A-Z0-9_]+) = (.+?);$/gm;
  for (const match of configurationText.matchAll(regex)) {
    settings[match[1]] = stripPbxScalar(match[2]);
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
  const marker = "release {";
  const start = gradleText.indexOf(marker);
  if (start === -1) {
    throw new Error("missing release build type");
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

  throw new Error("unterminated release build type");
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
