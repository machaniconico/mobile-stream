import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const fixtureRoot = ".artifacts/verify-ui-path-safety-test";

describe("browser UI verification path safety", () => {
  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("rejects symlinked UI verification report outputs before launching the browser", () => {
    const reportPath = `${fixtureRoot}/ui-report.json`;
    const outsideReport = `${fixtureRoot}/outside-report.json`;
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(outsideReport, "unchanged");
    symlinkSync(resolve(outsideReport), reportPath);

    const result = runVerifyUi({ MLC_UI_REPORT_JSON: reportPath });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`UI verification report output must not be a symbolic link: ${resolve(reportPath)}`);
    expect(readFileSync(outsideReport, "utf8")).toBe("unchanged");
  });

  it("rejects UI verification reports under symlinked workspace parents", () => {
    const realParent = `${fixtureRoot}/real-parent`;
    const linkParent = `${fixtureRoot}/link-parent`;
    const reportPath = `${linkParent}/ui-report.json`;
    mkdirSync(realParent, { recursive: true });
    symlinkSync(resolve(realParent), linkParent, "dir");

    const result = runVerifyUi({ MLC_UI_REPORT_JSON: reportPath });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`UI verification report path parent must not be a symbolic link: ${linkParent}`);
    expect(existsSync(`${realParent}/ui-report.json`)).toBe(false);
  });

  it("rejects symlinked UI screenshot outputs before launching the browser", () => {
    const artifactDir = `${fixtureRoot}/ui-artifacts`;
    const reportPath = `${fixtureRoot}/ui-report.json`;
    const screenshotPath = `${artifactDir}/mobile-live-caster-desktop.png`;
    const outsideScreenshot = `${fixtureRoot}/outside-desktop.png`;
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(outsideScreenshot, "unchanged");
    symlinkSync(resolve(outsideScreenshot), screenshotPath);

    const result = runVerifyUi({
      MLC_UI_ARTIFACT_DIR: artifactDir,
      MLC_UI_REPORT_JSON: reportPath
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`UI verification screenshot output must not be a symbolic link: ${resolve(screenshotPath)}`);
    expect(readFileSync(outsideScreenshot, "utf8")).toBe("unchanged");
    expect(existsSync(reportPath)).toBe(false);
  });

  it("rejects UI screenshots under symlinked artifact directories", () => {
    const realArtifactDir = `${fixtureRoot}/real-artifacts`;
    const linkArtifactDir = `${fixtureRoot}/link-artifacts`;
    const reportPath = `${fixtureRoot}/ui-report.json`;
    mkdirSync(realArtifactDir, { recursive: true });
    symlinkSync(resolve(realArtifactDir), linkArtifactDir, "dir");

    const result = runVerifyUi({
      MLC_UI_ARTIFACT_DIR: linkArtifactDir,
      MLC_UI_REPORT_JSON: reportPath
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`UI verification screenshot path parent must not be a symbolic link: ${linkArtifactDir}`);
    expect(existsSync(`${realArtifactDir}/mobile-live-caster-desktop.png`)).toBe(false);
    expect(existsSync(reportPath)).toBe(false);
  });
});

function runVerifyUi(envPatch) {
  return spawnSync(process.execPath, ["scripts/verify-ui.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      MLC_URL: "http://127.0.0.1:9/",
      MLC_UI_ARTIFACT_DIR: `${fixtureRoot}/default-artifacts`,
      MLC_UI_REPORT_JSON: `${fixtureRoot}/default-report.json`,
      ...envPatch
    }
  });
}
