import { existsSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { argv, cwd, env, exit } from "node:process";
import { iosReleaseEnv } from "./ios-release-config.mjs";

export const androidReleaseEnv = Object.freeze({
  storeFile: "MLC_RELEASE_STORE_FILE",
  storePassword: "MLC_RELEASE_STORE_PASSWORD",
  keyAlias: "MLC_RELEASE_KEY_ALIAS",
  keyPassword: "MLC_RELEASE_KEY_PASSWORD"
});

const storeReleaseModes = new Set(["all", "ios", "android"]);

export function validateStoreReleaseEnv({ envVars = env, root = cwd(), mode = "all" } = {}) {
  if (!storeReleaseModes.has(mode)) {
    throw new Error(`Unsupported store release env mode: ${mode}`);
  }

  const checks = [];
  if (mode === "all" || mode === "ios") {
    checks.push(...validateIosStoreEnv(envVars));
  }
  if (mode === "all" || mode === "android") {
    checks.push(...validateAndroidStoreEnv(envVars, root));
  }

  return {
    ok: checks.every((check) => check.status === "pass"),
    mode,
    checks
  };
}

function validateIosStoreEnv(envVars) {
  const checks = [];
  requireValue(checks, envVars, iosReleaseEnv.teamId, {
    label: "iOS Apple Developer team",
    validate: (value) => (/^[A-Z0-9]{10}$/.test(value) ? null : `${iosReleaseEnv.teamId} must be a 10-character Apple team ID.`)
  });
  requireValue(checks, envVars, iosReleaseEnv.hostProfileName, {
    label: "iOS host app provisioning profile"
  });
  requireValue(checks, envVars, iosReleaseEnv.broadcastProfileName, {
    label: "iOS Broadcast Upload Extension provisioning profile"
  });

  const authNames = [iosReleaseEnv.authKeyPath, iosReleaseEnv.authKeyId, iosReleaseEnv.authKeyIssuerId];
  const presentAuthNames = authNames.filter((name) => hasValue(envVars[name]));
  if (presentAuthNames.length === 0) {
    checks.push(pass("iOS App Store Connect API key", "not configured; Xcode account credentials may be used"));
  } else if (presentAuthNames.length !== authNames.length) {
    checks.push(fail("iOS App Store Connect API key", `Set all of ${authNames.join(", ")} together.`));
  } else {
    requireAbsoluteExistingFile(checks, envVars[iosReleaseEnv.authKeyPath], {
      label: "iOS App Store Connect API key file",
      envName: iosReleaseEnv.authKeyPath,
      allowInsideRepo: false
    });
    requireValue(checks, envVars, iosReleaseEnv.authKeyId, {
      label: "iOS App Store Connect API key ID"
    });
    requireValue(checks, envVars, iosReleaseEnv.authKeyIssuerId, {
      label: "iOS App Store Connect issuer ID"
    });
  }

  return checks;
}

function validateAndroidStoreEnv(envVars, root) {
  const checks = [];
  const storeFile = envVars[androidReleaseEnv.storeFile];
  requireAbsoluteExistingFile(checks, storeFile, {
    label: "Android release keystore",
    envName: androidReleaseEnv.storeFile,
    root,
    allowInsideRepo: false
  });
  requireValue(checks, envVars, androidReleaseEnv.storePassword, {
    label: "Android release store password",
    minLength: 8
  });
  requireValue(checks, envVars, androidReleaseEnv.keyAlias, {
    label: "Android release key alias"
  });
  requireValue(checks, envVars, androidReleaseEnv.keyPassword, {
    label: "Android release key password",
    minLength: 8
  });
  return checks;
}

function requireValue(checks, envVars, envName, { label, minLength = 1, validate = null }) {
  const value = envVars[envName]?.trim() || "";
  if (!value) {
    checks.push(fail(label, `${envName} is required.`));
    return;
  }
  if (looksLikePlaceholder(value)) {
    checks.push(fail(label, `${envName} still looks like a placeholder.`));
    return;
  }
  if (value.length < minLength) {
    checks.push(fail(label, `${envName} is too short for release use.`));
    return;
  }
  const validationMessage = validate?.(value);
  if (validationMessage) {
    checks.push(fail(label, validationMessage));
    return;
  }
  checks.push(pass(label, "configured"));
}

function requireAbsoluteExistingFile(checks, value, { label, envName, root = cwd(), allowInsideRepo }) {
  const pathValue = value?.trim() || "";
  if (!pathValue) {
    checks.push(fail(label, `${envName} is required.`));
    return;
  }
  if (looksLikePlaceholder(pathValue)) {
    checks.push(fail(label, `${envName} still looks like a placeholder.`));
    return;
  }
  if (!isAbsolute(pathValue)) {
    checks.push(fail(label, `${envName} must be an absolute path outside the repository.`));
    return;
  }

  const absolutePath = resolve(pathValue);
  if (!existsSync(absolutePath)) {
    checks.push(fail(label, `${envName} does not point to an existing file.`));
    return;
  }
  if (!statSync(absolutePath).isFile()) {
    checks.push(fail(label, `${envName} must point to a file.`));
    return;
  }
  if (!allowInsideRepo && isPathInside(root, absolutePath)) {
    checks.push(fail(label, `${envName} must point outside the repository so signing material is not committed.`));
    return;
  }

  checks.push(pass(label, `file found (${basename(absolutePath)})`));
}

function hasValue(value) {
  return Boolean(value?.trim());
}

function looksLikePlaceholder(value) {
  return /^(change-?me|example|placeholder|replace-?me|todo|your[-_ ]|xxx|test[-_ ]?secret)/i.test(value.trim());
}

function isPathInside(root, absolutePath) {
  const relativePath = relative(resolve(root), absolutePath);
  return Boolean(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

function pass(label, detail) {
  return { label, status: "pass", detail };
}

function fail(label, detail) {
  return { label, status: "fail", detail };
}

function parseArgs(args) {
  const options = {
    mode: "all",
    json: false
  };

  for (const arg of args) {
    if (arg === "--ios-only") {
      options.mode = "ios";
    } else if (arg === "--android-only") {
      options.mode = "android";
    } else if (arg === "--json") {
      options.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printTextReport(result) {
  console.log("MobileLiveCaster Store Release Environment");
  console.log(`Status: ${result.ok ? "ready" : "blocked"}`);
  console.log(`Scope: ${result.mode}`);
  for (const check of result.checks) {
    const marker = check.status === "pass" ? "pass" : "fail";
    console.log(`- ${marker}: ${check.label} - ${check.detail}`);
  }
}

function run() {
  try {
    const options = parseArgs(argv.slice(2));
    const result = validateStoreReleaseEnv({ mode: options.mode });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printTextReport(result);
    }
    return result.ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.url === `file://${argv[1]}`) {
  exit(run());
}
