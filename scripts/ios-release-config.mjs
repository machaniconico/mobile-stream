export const iosReleaseDefaults = Object.freeze({
  workspace: "ios/MobileLiveCaster.xcworkspace",
  scheme: "MobileLiveCaster",
  configuration: "Release",
  sdk: "iphoneos",
  destination: "generic/platform=iOS",
  archivePath: ".artifacts/ios/MobileLiveCaster.xcarchive",
  exportPath: ".artifacts/ios/export",
  exportOptionsPath: ".artifacts/ios/ExportOptions.plist",
  exportMethod: "app-store-connect",
  exportDestination: "export",
  hostBundleId: "com.mobilelivecaster.app",
  broadcastBundleId: "com.mobilelivecaster.app.BroadcastUpload"
});

export const iosReleaseEnv = Object.freeze({
  teamId: "MLC_IOS_TEAM_ID",
  hostProfileName: "MLC_IOS_APP_PROFILE_NAME",
  broadcastProfileName: "MLC_IOS_BROADCAST_PROFILE_NAME",
  archivePath: "MLC_IOS_ARCHIVE_PATH",
  exportPath: "MLC_IOS_EXPORT_PATH",
  exportOptionsPath: "MLC_IOS_EXPORT_OPTIONS_PATH",
  exportMethod: "MLC_IOS_EXPORT_METHOD",
  exportDestination: "MLC_IOS_EXPORT_DESTINATION",
  authKeyPath: "MLC_APP_STORE_CONNECT_KEY_PATH",
  authKeyId: "MLC_APP_STORE_CONNECT_KEY_ID",
  authKeyIssuerId: "MLC_APP_STORE_CONNECT_ISSUER_ID"
});

export function iosReleasePaths(env = process.env) {
  return {
    archivePath: env[iosReleaseEnv.archivePath] || iosReleaseDefaults.archivePath,
    exportPath: env[iosReleaseEnv.exportPath] || iosReleaseDefaults.exportPath,
    exportOptionsPath: env[iosReleaseEnv.exportOptionsPath] || iosReleaseDefaults.exportOptionsPath
  };
}

export function missingIosExportEnv(env = process.env) {
  return [iosReleaseEnv.teamId, iosReleaseEnv.hostProfileName, iosReleaseEnv.broadcastProfileName].filter(
    (name) => !env[name]?.trim()
  );
}

export function appStoreConnectAuthArgs(env = process.env) {
  const authNames = [iosReleaseEnv.authKeyPath, iosReleaseEnv.authKeyId, iosReleaseEnv.authKeyIssuerId];
  const presentAuthNames = authNames.filter((name) => env[name]?.trim());

  if (presentAuthNames.length > 0 && presentAuthNames.length !== authNames.length) {
    throw new Error(`Set all App Store Connect auth env vars together: ${authNames.join(", ")}`);
  }

  if (presentAuthNames.length === 0) {
    return [];
  }

  return [
    "-authenticationKeyPath",
    env[iosReleaseEnv.authKeyPath],
    "-authenticationKeyID",
    env[iosReleaseEnv.authKeyId],
    "-authenticationKeyIssuerID",
    env[iosReleaseEnv.authKeyIssuerId]
  ];
}

export function renderIosExportOptionsPlist(env = process.env) {
  const missing = missingIosExportEnv(env);
  if (missing.length > 0) {
    throw new Error(`Missing required iOS release env vars: ${missing.join(", ")}`);
  }

  const method = env[iosReleaseEnv.exportMethod] || iosReleaseDefaults.exportMethod;
  const destination = env[iosReleaseEnv.exportDestination] || iosReleaseDefaults.exportDestination;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>destination</key>
  <string>${escapeXml(destination)}</string>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>method</key>
  <string>${escapeXml(method)}</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>${escapeXml(iosReleaseDefaults.hostBundleId)}</key>
    <string>${escapeXml(env[iosReleaseEnv.hostProfileName])}</string>
    <key>${escapeXml(iosReleaseDefaults.broadcastBundleId)}</key>
    <string>${escapeXml(env[iosReleaseEnv.broadcastProfileName])}</string>
  </dict>
  <key>signingStyle</key>
  <string>manual</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>teamID</key>
  <string>${escapeXml(env[iosReleaseEnv.teamId])}</string>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
`;
}

export function iosArchiveArgs(env = process.env) {
  const teamId = env[iosReleaseEnv.teamId]?.trim();
  if (!teamId) {
    throw new Error(`Missing required iOS release env var: ${iosReleaseEnv.teamId}`);
  }

  const paths = iosReleasePaths(env);
  return [
    "-workspace",
    iosReleaseDefaults.workspace,
    "-scheme",
    iosReleaseDefaults.scheme,
    "-configuration",
    iosReleaseDefaults.configuration,
    "-sdk",
    iosReleaseDefaults.sdk,
    "-destination",
    iosReleaseDefaults.destination,
    "-archivePath",
    paths.archivePath,
    "-allowProvisioningUpdates",
    ...appStoreConnectAuthArgs(env),
    `DEVELOPMENT_TEAM=${teamId}`,
    "CODE_SIGN_STYLE=Automatic",
    "CODE_SIGN_IDENTITY=Apple Distribution",
    "archive"
  ];
}

export function iosExportArgs(env = process.env) {
  const paths = iosReleasePaths(env);
  return [
    "-exportArchive",
    "-archivePath",
    paths.archivePath,
    "-exportPath",
    paths.exportPath,
    "-exportOptionsPlist",
    paths.exportOptionsPath,
    "-allowProvisioningUpdates",
    ...appStoreConnectAuthArgs(env)
  ];
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
