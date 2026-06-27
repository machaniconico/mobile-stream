import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const fixtureRoot = ".artifacts/verify-web-bundle-size-test";
const assetsDir = `${fixtureRoot}/assets`;

describe("web bundle size verifier", () => {
  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("passes when the web bundle remains code-split under the release limit", () => {
    writeAssets({
      "index-a.js": "console.log('index');",
      "StudioScreen-b.js": "console.log('studio');"
    });

    const result = runVerifier();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Web bundle size verification passed (2 JS chunks");
  });

  it("rejects a symlinked assets directory before trusting linked chunks", () => {
    const realAssetsDir = `${fixtureRoot}/real-assets`;
    const linkAssetsDir = `${fixtureRoot}/assets-link`;
    mkdirSync(realAssetsDir, { recursive: true });
    writeFileSync(`${realAssetsDir}/index-a.js`, "console.log('outside index');");
    writeFileSync(`${realAssetsDir}/StudioScreen-b.js`, "console.log('outside studio');");
    symlinkSync(resolve(realAssetsDir), linkAssetsDir, "dir");

    const result = runVerifier(linkAssetsDir);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`Web bundle assets directory must not be a symbolic link: ${linkAssetsDir}`);
    expect(result.stdout).not.toContain("Web bundle size verification passed");
  });

  it("rejects symlinked JavaScript chunks before measuring linked files", () => {
    const outsideChunk = `${fixtureRoot}/outside.js`;
    writeAssets({
      "index-a.js": "console.log('index');"
    });
    writeFileSync(outsideChunk, "console.log('outside studio');");
    symlinkSync(resolve(outsideChunk), `${assetsDir}/StudioScreen-b.js`);

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Web bundle JavaScript chunk must not be a symbolic link: ${assetsDir}/StudioScreen-b.js`);
    expect(result.stdout).not.toContain("Web bundle size verification passed");
  });

  it("rejects dangling symlinked JavaScript chunks", () => {
    const missingChunk = `${fixtureRoot}/missing.js`;
    writeAssets({
      "index-a.js": "console.log('index');"
    });
    symlinkSync(resolve(missingChunk), `${assetsDir}/StudioScreen-b.js`);

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Web bundle JavaScript chunk must not be a symbolic link: ${assetsDir}/StudioScreen-b.js`);
  });

  it("rejects JavaScript chunk paths that point to directories", () => {
    writeAssets({
      "index-a.js": "console.log('index');"
    });
    mkdirSync(`${assetsDir}/StudioScreen-b.js`, { recursive: true });

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Web bundle JavaScript chunk must point to a file: ${assetsDir}/StudioScreen-b.js`);
  });
});

function writeAssets(files) {
  mkdirSync(assetsDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(`${assetsDir}/${name}`, content);
  }
}

function runVerifier(path = assetsDir) {
  return spawnSync(process.execPath, ["scripts/verify-web-bundle-size.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      MLC_WEB_ASSETS_DIR: path
    }
  });
}
