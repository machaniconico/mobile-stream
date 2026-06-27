import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const testDir = ".artifacts/export-ios-release-test";
const validReleaseEnv = {
  MLC_IOS_TEAM_ID: "ABCDE12345",
  MLC_IOS_APP_PROFILE_NAME: "MobileLiveCaster App Store Profile",
  MLC_IOS_BROADCAST_PROFILE_NAME: "MobileLiveCaster Broadcast App Store Profile",
  MLC_IOS_ARCHIVE_PATH: `${testDir}/MobileLiveCaster.xcarchive`,
  MLC_IOS_EXPORT_OPTIONS_PATH: `${testDir}/ExportOptions.plist`
};

describe("iOS release export runner", () => {
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("rejects a symlinked iOS export directory", () => {
    const realExportDir = `${testDir}/real-export`;
    const linkExportDir = `${testDir}/export-link`;
    mkdirSync(realExportDir, { recursive: true });
    symlinkSync(resolve(realExportDir), linkExportDir, "dir");

    const result = runExporter({ MLC_IOS_EXPORT_PATH: linkExportDir });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`iOS export directory output must not be a symbolic link: ${resolve(linkExportDir)}`);
    expect(existsSync(`${realExportDir}/ExportOptions.plist`)).toBe(false);
  });

  it("rejects a symlinked iOS export directory parent", () => {
    const realParent = `${testDir}/real-parent`;
    const linkParent = `${testDir}/link-parent`;
    mkdirSync(realParent, { recursive: true });
    symlinkSync(resolve(realParent), linkParent, "dir");

    const result = runExporter({ MLC_IOS_EXPORT_PATH: `${linkParent}/export` });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`iOS export directory path parent must not be a symbolic link: ${linkParent}`);
    expect(existsSync(`${realParent}/export`)).toBe(false);
  });

  it("rejects an iOS export directory path that points to a file", () => {
    const filePath = `${testDir}/export-file`;
    mkdirSync(testDir, { recursive: true });
    writeFileSync(filePath, "not a directory");

    const result = runExporter({ MLC_IOS_EXPORT_PATH: filePath });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`iOS export directory output must point to a directory: ${resolve(filePath)}`);
  });
});

function runExporter(envPatch) {
  return spawnSync(process.execPath, ["scripts/export-ios-release.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...validReleaseEnv,
      ...envPatch
    }
  });
}
