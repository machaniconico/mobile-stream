import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { argv, cwd, env, exit } from "node:process";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { requiredBrowserUiTextChecks } from "./browser-ui-required-text.mjs";

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 900 }
];
if (isDirectRun()) {
  exit(await run());
}

async function run() {
  try {
    const result = await verifyUi();
    console.log(`UI verification passed for ${result.viewports.map((viewport) => viewport.name).join(", ")} at ${result.target}`);
    console.log(`UI verification report written to ${result.reportPath}.`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export async function verifyUi({
  target = env.MLC_URL ?? "http://localhost:5173/",
  artifactDir = env.MLC_UI_ARTIFACT_DIR ?? new URL("../.artifacts/", import.meta.url).pathname,
  reportPath = env.MLC_UI_REPORT_JSON ?? ".artifacts/ui-verification.json",
  browserLauncher = chromium
} = {}) {
  const startedAt = new Date().toISOString();
  const absoluteArtifactDir = resolve(artifactDir);
  const absoluteReportPath = assertWritableRegularPath(reportPath, "UI verification report");
  const screenshotPaths = Object.fromEntries(
    viewports.map((viewport) => [
      viewport.name,
      assertWritableRegularPath(resolve(absoluteArtifactDir, `mobile-live-caster-${viewport.name}.png`), "UI verification screenshot")
    ])
  );
  const statusShort = commandOutput("git", ["status", "--short"]);
  const report = {
    reportVersion: 1,
    app: "MobileLiveCaster",
    type: "browser-ui-verification",
    status: "running",
    target,
    startedAt,
    finishedAt: null,
    durationMs: null,
    browser: {
      channel: "chrome",
      headless: true
    },
    git: {
      commit: commandOutput("git", ["rev-parse", "HEAD"]) || null,
      branch: commandOutput("git", ["branch", "--show-current"]) || null,
      dirty: Boolean(statusShort),
      statusShort
    },
    viewports: [],
    error: null
  };

  await mkdir(absoluteArtifactDir, { recursive: true });

  let browser = null;

  try {
    browser = await browserLauncher.launch({
      channel: "chrome",
      headless: true
    });

    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      await page.goto(target, { waitUntil: "networkidle" });
      const targetIdentity = await assertMobileLiveCasterTarget(page, viewport.name, target);
      const rigQualityProgressBarCount = await selectPngTuberSourceForUiProof(page, viewport.name);

      const checks = [];

      for (const text of requiredBrowserUiTextChecks) {
        await waitForRequiredText(page, text, viewport.name);
        const count = await page.getByText(text, { exact: false }).count();
        if (count === 0) {
          throw new Error(`Missing text "${text}" at ${viewport.name}`);
        }
        checks.push({ text, count });
      }

      const quickTextInteraction = await verifyQuickTextInteraction(page, viewport.name);
      const qualityInteraction = await verifyQualityInteraction(page, viewport.name);
      const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      if (horizontalOverflow) {
        throw new Error(`Horizontal overflow detected at ${viewport.name}`);
      }

      const screenshotPath = assertWritableRegularPath(screenshotPaths[viewport.name], "UI verification screenshot");
      await page.screenshot({
        path: screenshotPath,
        fullPage: true
      });
      const screenshot = artifactRecord(screenshotPath);
      report.viewports.push({
        ...viewport,
        targetIdentity,
        requiredTextChecks: checks,
        quickTextInteraction,
        qualityInteraction,
        horizontalOverflow: false,
        rigQualityProgressBarCount,
        screenshot
      });

      await page.close();
    }
    finishReport(report, "passed");
  } catch (error) {
    finishReport(report, "failed", error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
    writeReport(absoluteReportPath, report);
  }

  return {
    target,
    reportPath: absoluteReportPath,
    viewports,
    report
  };
}

async function assertMobileLiveCasterTarget(page, viewportName, target) {
  const title = normalizeTextForReport(await page.title().catch(() => ""));
  if (title !== "MobileLiveCaster") {
    throw new Error(
      `UI target ${target} at ${viewportName} is not MobileLiveCaster (document title: ${title || "missing"}). Set MLC_URL to this repository's dev server before collecting browser UI evidence.`
    );
  }
  await waitForRequiredText(page, "MobileLiveCaster", viewportName);
  return {
    app: "MobileLiveCaster",
    documentTitle: title
  };
}

async function selectPngTuberSourceForUiProof(page, viewportName) {
  const sourceRow = page.locator(".source-row").filter({ hasText: "PNGTuber" }).first();
  await sourceRow.waitFor({ timeout: 10_000 });
  await sourceRow.click();
  await waitForRequiredText(page, "Rig quality", viewportName);
  const progressBarCount = await page.locator('.avatar-rig-quality [role="progressbar"]').count();
  if (progressBarCount < 3) {
    throw new Error(`Rig quality panel is missing score bars at ${viewportName}`);
  }
  return progressBarCount;
}

function normalizeTextForReport(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function verifyQuickTextInteraction(page, viewportName) {
  const proofText = `ui-proof-${viewportName}`;
  const input = page.locator(".quick-subtitle-field input").first();
  await input.waitFor({ timeout: 10_000 });
  await input.fill(proofText);
  await page.locator("button").filter({ hasText: "Show text" }).first().click();
  await waitForRequiredText(page, proofText, viewportName);

  const programText = page.locator(".program-source.text").filter({ hasText: proofText }).first();
  await programText.waitFor({ timeout: 10_000 });
  const programTextContent = (await programText.innerText()).trim();
  if (!programTextContent.includes(proofText)) {
    throw new Error(`Quick Text program overlay did not show proof text at ${viewportName}.`);
  }

  const preview = page.locator(".quick-text-status-preview").first();
  await preview.waitFor({ timeout: 10_000 });
  const previewText = (await preview.innerText()).trim();
  if (!previewText.includes(proofText)) {
    throw new Error(`Quick Text status preview did not show proof text at ${viewportName}.`);
  }

  return {
    text: proofText,
    programText: programTextContent,
    previewText
  };
}

async function verifyQualityInteraction(page, viewportName) {
  const setupPanel = page.locator(".control-panel").filter({ hasText: "Live Setup" }).first();
  await setupPanel.waitFor({ timeout: 10_000 });

  const preset = setupPanel.locator("label.field").filter({ hasText: "Quality preset" }).locator("select").first();
  await preset.selectOption("quality-sharp");
  await setupPanel.locator(".quality-readout").getByText("1920x1080", { exact: true }).waitFor({ timeout: 10_000 });

  const customSettings = setupPanel.locator(".quality-custom-settings");
  const resolution = customSettings.locator("select").nth(0);
  const frameRate = customSettings.locator("select").nth(1);
  const videoBitrate = customSettings.locator('input[type="range"]').nth(0);
  const audioBitrate = customSettings.locator('input[type="range"]').nth(1);

  await resolution.selectOption("540p");
  await frameRate.selectOption("60");
  await setRangeInputValue(videoBitrate, 5000);
  await setRangeInputValue(audioBitrate, 192);

  const expectedValues = ["960x540", "60 fps", "5000 kbps", "192 kbps", "6490 kbps"];
  await page.waitForFunction(
    (values) => {
      const panels = Array.from(document.querySelectorAll(".control-panel"));
      const panel = panels.find((item) => item.textContent?.includes("Live Setup"));
      const readout = panel?.querySelector(".quality-readout")?.textContent ?? "";
      return values.every((value) => readout.includes(value));
    },
    expectedValues,
    { timeout: 10_000 }
  );

  const presetValue = await preset.inputValue();
  if (presetValue !== "quality-custom") {
    throw new Error(`Custom quality did not replace the preset selection at ${viewportName}.`);
  }

  const customReadout = normalizeTextForReport(await setupPanel.locator(".quality-readout").innerText());
  const recommendation = setupPanel.locator(".platform-quality-recommendation");
  await recommendation.getByText("TUNE", { exact: true }).waitFor({ timeout: 10_000 });
  const recommendationBeforeApply = normalizeTextForReport(await recommendation.innerText());
  for (const value of ["960x540", "60 fps", "Video 6000 kbps", "Audio 128 kbps", "Upload 7660 kbps"]) {
    if (!recommendationBeforeApply.includes(value)) {
      throw new Error(`Platform quality recommendation is missing "${value}" at ${viewportName}.`);
    }
  }

  await recommendation.locator(".platform-quality-action").click();
  const recommendedValues = ["960x540", "60 fps", "6000 kbps", "128 kbps", "7660 kbps"];
  await page.waitForFunction(
    (values) => {
      const panels = Array.from(document.querySelectorAll(".control-panel"));
      const panel = panels.find((item) => item.textContent?.includes("Live Setup"));
      const readout = panel?.querySelector(".quality-readout")?.textContent ?? "";
      const recommendationText = panel?.querySelector(".platform-quality-recommendation")?.textContent ?? "";
      return values.every((value) => readout.includes(value)) && recommendationText.includes("MATCHED");
    },
    recommendedValues,
    { timeout: 10_000 }
  );

  const recommendedReadout = normalizeTextForReport(await setupPanel.locator(".quality-readout").innerText());
  return {
    presetProof: "quality-sharp",
    customPresetValue: presetValue,
    custom: {
      resolution: "960x540",
      fps: 60,
      videoBitrateKbps: 5000,
      audioBitrateKbps: 192,
      estimatedUploadKbps: 6490,
      readout: customReadout
    },
    recommendation: {
      statusBeforeApply: "adjust",
      statusAfterApply: "matched",
      resolution: "960x540",
      fps: 60,
      videoBitrateKbps: 6000,
      audioBitrateKbps: 128,
      estimatedUploadKbps: 7660,
      readout: recommendedReadout
    }
  };
}

async function setRangeInputValue(locator, value) {
  await locator.evaluate((element, nextValue) => {
    const input = element;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, String(nextValue));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

function finishReport(report, status, error = null) {
  report.status = status;
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.parse(report.finishedAt) - Date.parse(report.startedAt);
  report.error = error ? (error instanceof Error ? error.message : String(error)) : null;
}

function artifactRecord(path) {
  const absolutePath = resolve(path);
  assertRegularSourceFile(absolutePath, "UI evidence screenshot");
  const content = readFileSync(absolutePath);
  return {
    path: relative(cwd(), absolutePath),
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

async function waitForRequiredText(page, text, viewportName) {
  try {
    await page.waitForFunction((needle) => document.body.innerText.includes(needle), text, { timeout: 10_000 });
  } catch {
    throw new Error(`Missing text "${text}" at ${viewportName}`);
  }
}

function writeReport(path, value) {
  const absolutePath = assertWritableRegularPath(path, "UI verification report");
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

function assertRegularSourceFile(path, label) {
  assertNoSymlinkedParentDirectories(path, label);
  const stat = lstatSync(resolve(path));
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${path}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} must point to a file: ${path}`);
  }
}

function assertWritableRegularPath(path, label) {
  assertNoSymlinkedParentDirectories(path, label);
  const absolutePath = resolve(path);
  const stat = lstatExisting(absolutePath);
  if (!stat) {
    return absolutePath;
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} output must not be a symbolic link: ${absolutePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} output must point to a file: ${absolutePath}`);
  }
  return absolutePath;
}

function assertNoSymlinkedParentDirectories(path, label) {
  const relativePath = workspaceRelativePath(path);
  if (!relativePath) {
    return;
  }
  const parts = relativePath.split(sep).filter(Boolean);
  let currentPath = cwd();
  for (const part of parts.slice(0, -1)) {
    currentPath = join(currentPath, part);
    const stat = lstatExisting(currentPath);
    if (!stat) {
      return;
    }
    const displayPath = relative(cwd(), currentPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} path parent must not be a symbolic link: ${displayPath}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`${label} path parent must point to a directory: ${displayPath}`);
    }
  }
}

function workspaceRelativePath(path) {
  const absolutePath = resolve(path);
  const relativePath = relative(cwd(), absolutePath);
  if (relativePath === "") {
    return ".";
  }
  if (relativePath.startsWith("..") || relativePath === ".." || relativePath.includes(`..${sep}`)) {
    return null;
  }
  return relativePath;
}

function lstatExisting(path) {
  try {
    return lstatSync(resolve(path));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function isDirectRun() {
  return Boolean(argv[1] && import.meta.url === pathToFileURL(argv[1]).href);
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.status !== 0 || result.error) {
    return "";
  }
  return result.stdout.trim();
}
