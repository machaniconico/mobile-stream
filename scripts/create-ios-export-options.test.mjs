import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const outputPath = ".artifacts/create-ios-export-options-test/ExportOptions.plist";
const validReleaseEnv = {
  MLC_IOS_TEAM_ID: "ABCDE12345",
  MLC_IOS_APP_PROFILE_NAME: "MobileLiveCaster App Store Profile",
  MLC_IOS_BROADCAST_PROFILE_NAME: "MobileLiveCaster Broadcast App Store Profile"
};

describe("iOS export options generator", () => {
  afterEach(() => {
    rmSync(".artifacts/create-ios-export-options-test", { recursive: true, force: true });
  });

  it("writes App Store Connect export options for host and Broadcast Upload Extension profiles", () => {
    const result = runGenerator(validReleaseEnv);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Wrote iOS export options");

    const plist = readFileSync(outputPath, "utf8");
    expect(plist).toContain("<string>app-store-connect</string>");
    expect(plist).toContain("<string>manual</string>");
    expect(plist).toContain("<key>com.mobilelivecaster.app</key>");
    expect(plist).toContain("<string>MobileLiveCaster App Store Profile</string>");
    expect(plist).toContain("<key>com.mobilelivecaster.app.BroadcastUpload</key>");
    expect(plist).toContain("<string>MobileLiveCaster Broadcast App Store Profile</string>");
    expect(plist).toContain("<key>stripSwiftSymbols</key>");
    expect(plist).toContain("<key>uploadSymbols</key>");
  });

  it("fails closed when a Broadcast Upload Extension provisioning profile is missing", () => {
    const result = runGenerator({
      MLC_IOS_TEAM_ID: "ABCDE12345",
      MLC_IOS_APP_PROFILE_NAME: "MobileLiveCaster App Store Profile"
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("MLC_IOS_BROADCAST_PROFILE_NAME");
  });

  it("rejects a symlinked export options output path", () => {
    const targetPath = ".artifacts/create-ios-export-options-test/target.plist";
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(targetPath, "untouched");
    symlinkSync(resolve(targetPath), outputPath);

    const result = runGenerator(validReleaseEnv);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`iOS export options output must not be a symbolic link: ${resolve(outputPath)}`);
    expect(readFileSync(targetPath, "utf8")).toBe("untouched");
  });

  it("rejects a dangling symlinked export options output path", () => {
    const targetPath = ".artifacts/create-ios-export-options-test/missing-target.plist";
    mkdirSync(dirname(outputPath), { recursive: true });
    symlinkSync(resolve(targetPath), outputPath);

    const result = runGenerator(validReleaseEnv);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`iOS export options output must not be a symbolic link: ${resolve(outputPath)}`);
    expect(existsSync(targetPath)).toBe(false);
  });

  it("rejects a symlinked export options output parent", () => {
    const realParent = ".artifacts/create-ios-export-options-test/real-parent";
    const linkParent = ".artifacts/create-ios-export-options-test/link-parent";
    const linkedOutputPath = `${linkParent}/ExportOptions.plist`;
    mkdirSync(realParent, { recursive: true });
    symlinkSync(resolve(realParent), linkParent, "dir");

    const result = runGenerator(validReleaseEnv, { output: linkedOutputPath });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`iOS export options path parent must not be a symbolic link: ${linkParent}`);
    expect(existsSync(`${realParent}/ExportOptions.plist`)).toBe(false);
  });
});

function runGenerator(envPatch, { output = outputPath } = {}) {
  return spawnSync(process.execPath, ["scripts/create-ios-export-options.mjs", "--output", output], {
    encoding: "utf8",
    env: {
      ...process.env,
      MLC_IOS_TEAM_ID: "",
      MLC_IOS_APP_PROFILE_NAME: "",
      MLC_IOS_BROADCAST_PROFILE_NAME: "",
      ...envPatch
    }
  });
}
