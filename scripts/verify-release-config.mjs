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
    expectIncludes(files.xcodeProject, "PRODUCT_BUNDLE_IDENTIFIER = com.mobilelivecaster.app;");
    expectIncludes(files.xcodeProject, "PRODUCT_BUNDLE_IDENTIFIER = com.mobilelivecaster.app.BroadcastUpload;");
    expectIncludes(files.xcodeProject, "CODE_SIGN_ENTITLEMENTS = MobileLiveCaster/MobileLiveCaster.entitlements;");
    expectIncludes(files.xcodeProject, "CODE_SIGN_ENTITLEMENTS = MobileLiveCasterBroadcastUpload/MobileLiveCasterBroadcastUpload.entitlements;");
    expectIncludes(files.iosEntitlements, "group.com.mobilelivecaster.app");
    expectIncludes(files.broadcastEntitlements, "group.com.mobilelivecaster.app");
    expectIncludes(files.liveCasterBridge, 'liveCasterAppGroup = "group.com.mobilelivecaster.app"');
    expectIncludes(files.liveCasterBridge, 'liveCasterBroadcastExtensionId = "com.mobilelivecaster.app.BroadcastUpload"');
    expectIncludes(files.broadcastHandler, 'broadcastAppGroup = "group.com.mobilelivecaster.app"');
    expectNotIncludes(allNativeConfigText(), "org.reactjs.native.example");
    expectNotIncludes(allNativeConfigText(), "group.org.reactjs.native.example");
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
