import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const fixtureRoot = join(tmpdir(), "mlc-store-release-env-test");
const repoKeystorePath = ".artifacts/verify-store-release-env-test/release.keystore";

describe("store release environment verifier", () => {
  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(".artifacts/verify-store-release-env-test", { recursive: true, force: true });
  });

  it("passes with iOS profiles, optional App Store Connect auth, and Android keystore outside the repo", () => {
    const envPatch = createReadyEnv();
    const result = runVerifier(envPatch);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Status: ready");
    expect(result.stdout).toContain("iOS Broadcast Upload Extension provisioning profile");
    expect(result.stdout).toContain("Android release keystore");
    expect(result.stdout).not.toContain(envPatch.MLC_RELEASE_STORE_PASSWORD);
    expect(result.stdout).not.toContain(envPatch.MLC_RELEASE_KEY_PASSWORD);
    expect(result.stdout).not.toContain(envPatch.MLC_IOS_TEAM_ID);
    expect(result.stderr).toBe("");
  });

  it("fails closed when required release values are missing", () => {
    const result = runVerifier({
      MLC_IOS_TEAM_ID: "ABCDE12345",
      MLC_IOS_APP_PROFILE_NAME: "MobileLiveCaster App Store Profile"
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Status: blocked");
    expect(result.stdout).toContain("MLC_IOS_BROADCAST_PROFILE_NAME");
    expect(result.stdout).toContain("MLC_RELEASE_STORE_FILE");
    expect(result.stdout).not.toContain("secret");
  });

  it("rejects Android release keystores stored inside the repository", () => {
    mkdirSync(".artifacts/verify-store-release-env-test", { recursive: true });
    writeFileSync(repoKeystorePath, "fake-keystore");

    const result = runVerifier({
      ...createReadyEnv(),
      MLC_RELEASE_STORE_FILE: `${process.cwd()}/${repoKeystorePath}`
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("MLC_RELEASE_STORE_FILE must point outside the repository");
  });

  it("rejects Android release keystore symlinks before accepting linked signing material", () => {
    const envPatch = createReadyEnv();
    const symlinkKeystorePath = join(fixtureRoot, "release-link.keystore");
    symlinkSync(envPatch.MLC_RELEASE_STORE_FILE, symlinkKeystorePath);

    const result = runVerifier(
      {
        ...envPatch,
        MLC_RELEASE_STORE_FILE: symlinkKeystorePath
      },
      ["--android-only"]
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("MLC_RELEASE_STORE_FILE must not point to a symbolic link.");
    expect(result.stdout).not.toContain(envPatch.MLC_RELEASE_STORE_PASSWORD);
  });

  it("rejects Android release keystores reached through a symlinked parent into the repository", () => {
    const repoKeystoreDir = ".artifacts/verify-store-release-env-test/repo-keystore-dir";
    const repoKeystore = `${repoKeystoreDir}/release.keystore`;
    const linkedParent = join(fixtureRoot, "repo-keystore-dir-link");
    mkdirSync(repoKeystoreDir, { recursive: true });
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(repoKeystore, "fake-keystore");
    symlinkSync(process.cwd() + "/" + repoKeystoreDir, linkedParent, "dir");

    const result = runVerifier(
      {
        ...createReadyEnv(),
        MLC_RELEASE_STORE_FILE: `${linkedParent}/release.keystore`
      },
      ["--android-only"]
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("MLC_RELEASE_STORE_FILE must point outside the repository");
  });

  it("rejects iOS App Store Connect API key symlinks", () => {
    const envPatch = createReadyEnv();
    const authKeyLink = join(fixtureRoot, "AuthKey_link.p8");
    symlinkSync(envPatch.MLC_APP_STORE_CONNECT_KEY_PATH, authKeyLink);

    const result = runVerifier({
      ...envPatch,
      MLC_APP_STORE_CONNECT_KEY_PATH: authKeyLink
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("MLC_APP_STORE_CONNECT_KEY_PATH must not point to a symbolic link.");
    expect(result.stdout).not.toContain(envPatch.MLC_APP_STORE_CONNECT_KEY_PATH);
  });

  it("can scope checks to Android-only environments", () => {
    const envPatch = createReadyEnv();
    const result = runVerifier(
      {
        MLC_RELEASE_STORE_FILE: envPatch.MLC_RELEASE_STORE_FILE,
        MLC_RELEASE_STORE_PASSWORD: envPatch.MLC_RELEASE_STORE_PASSWORD,
        MLC_RELEASE_KEY_ALIAS: envPatch.MLC_RELEASE_KEY_ALIAS,
        MLC_RELEASE_KEY_PASSWORD: envPatch.MLC_RELEASE_KEY_PASSWORD
      },
      ["--android-only"]
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Scope: android");
    expect(result.stdout).not.toContain("MLC_IOS_TEAM_ID");
  });
});

function runVerifier(envPatch, args = []) {
  return spawnSync(process.execPath, ["scripts/verify-store-release-env.mjs", ...args], {
    encoding: "utf8",
    env: scrubReleaseEnv(envPatch)
  });
}

function createReadyEnv() {
  mkdirSync(fixtureRoot, { recursive: true });
  const keystorePath = join(fixtureRoot, "release.keystore");
  const authKeyPath = join(fixtureRoot, "AuthKey_ABC123DEFG.p8");
  writeFileSync(keystorePath, "fake-keystore");
  writeFileSync(authKeyPath, "fake-private-key");

  return {
    MLC_IOS_TEAM_ID: "ABCDE12345",
    MLC_IOS_APP_PROFILE_NAME: "MobileLiveCaster App Store Profile",
    MLC_IOS_BROADCAST_PROFILE_NAME: "MobileLiveCaster Broadcast App Store Profile",
    MLC_APP_STORE_CONNECT_KEY_PATH: authKeyPath,
    MLC_APP_STORE_CONNECT_KEY_ID: "ABC123DEFG",
    MLC_APP_STORE_CONNECT_ISSUER_ID: "11111111-2222-3333-4444-555555555555",
    MLC_RELEASE_STORE_FILE: keystorePath,
    MLC_RELEASE_STORE_PASSWORD: "store-secret-pass",
    MLC_RELEASE_KEY_ALIAS: "mobile-live-caster-release",
    MLC_RELEASE_KEY_PASSWORD: "key-secret-pass"
  };
}

function scrubReleaseEnv(envPatch) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(MLC_IOS_|MLC_APP_STORE_CONNECT_|MLC_RELEASE_)/.test(key)) {
      delete env[key];
    }
  }
  return { ...env, ...envPatch };
}
