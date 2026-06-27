import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const testDir = ".artifacts/archive-ios-release-test";
const validReleaseEnv = {
  MLC_IOS_TEAM_ID: "ABCDE12345",
  MLC_IOS_EXPORT_PATH: `${testDir}/export`,
  MLC_IOS_EXPORT_OPTIONS_PATH: `${testDir}/ExportOptions.plist`
};

describe("iOS release archive runner", () => {
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("rejects a symlinked iOS archive path", () => {
    const realArchivePath = `${testDir}/real-archive.xcarchive`;
    const linkArchivePath = `${testDir}/archive-link.xcarchive`;
    mkdirSync(realArchivePath, { recursive: true });
    symlinkSync(resolve(realArchivePath), linkArchivePath, "dir");

    const result = runArchiver({ MLC_IOS_ARCHIVE_PATH: linkArchivePath });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`iOS archive output must not be a symbolic link: ${resolve(linkArchivePath)}`);
    expect(existsSync(`${realArchivePath}/Products`)).toBe(false);
  });

  it("rejects a symlinked iOS archive parent", () => {
    const realParent = `${testDir}/real-parent`;
    const linkParent = `${testDir}/link-parent`;
    mkdirSync(realParent, { recursive: true });
    symlinkSync(resolve(realParent), linkParent, "dir");

    const result = runArchiver({ MLC_IOS_ARCHIVE_PATH: `${linkParent}/MobileLiveCaster.xcarchive` });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`iOS archive path parent must not be a symbolic link: ${linkParent}`);
    expect(existsSync(`${realParent}/MobileLiveCaster.xcarchive`)).toBe(false);
  });

  it("rejects an iOS archive path that points to a file", () => {
    const filePath = `${testDir}/archive-file.xcarchive`;
    mkdirSync(testDir, { recursive: true });
    writeFileSync(filePath, "not a directory");

    const result = runArchiver({ MLC_IOS_ARCHIVE_PATH: filePath });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`iOS archive output must point to a directory: ${resolve(filePath)}`);
  });
});

function runArchiver(envPatch) {
  return spawnSync(process.execPath, ["scripts/archive-ios-release.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...validReleaseEnv,
      ...envPatch
    }
  });
}
