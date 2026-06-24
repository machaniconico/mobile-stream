import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { cwd, env } from "node:process";
import { chromium } from "playwright-core";

const target = process.env.MLC_URL ?? "http://localhost:5173/";
const outDir = new URL("../.artifacts/", import.meta.url);
const reportPath = env.MLC_UI_REPORT_JSON ?? ".artifacts/ui-verification.json";
const startedAt = new Date().toISOString();

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 900 }
];
const requiredTextChecks = ["MobileLiveCaster", "Sources", "Go Live", "Live Setup", "PNGTuber", "RTMPS", "Face input", "Head range"];
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
    dirty: Boolean(commandOutput("git", ["status", "--short"])),
    statusShort: commandOutput("git", ["status", "--short"]) || ""
  },
  viewports: [],
  error: null
};

await mkdir(outDir, { recursive: true });

let browser = null;

try {
  browser = await chromium.launch({
    channel: "chrome",
    headless: true
  });

  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    await page.goto(target, { waitUntil: "networkidle" });

    const checks = [];

    for (const text of requiredTextChecks) {
      await waitForRequiredText(page, text, viewport.name);
      const count = await page.getByText(text, { exact: false }).count();
      if (count === 0) {
        throw new Error(`Missing text "${text}" at ${viewport.name}`);
      }
      checks.push({ text, count });
    }

    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    if (horizontalOverflow) {
      throw new Error(`Horizontal overflow detected at ${viewport.name}`);
    }

    const screenshotPath = new URL(`mobile-live-caster-${viewport.name}.png`, outDir).pathname;
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });
    const screenshot = artifactRecord(screenshotPath);
    report.viewports.push({
      ...viewport,
      requiredTextChecks: checks,
      horizontalOverflow: false,
      screenshot
    });

    await page.close();
  }
  finishReport("passed");
} catch (error) {
  finishReport("failed", error);
  throw error;
} finally {
  if (browser) {
    await browser.close();
  }
  writeReport(reportPath, report);
}

console.log(`UI verification passed for ${viewports.map((viewport) => viewport.name).join(", ")} at ${target}`);
console.log(`UI verification report written to ${reportPath}.`);

function finishReport(status, error = null) {
  report.status = status;
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.parse(report.finishedAt) - Date.parse(report.startedAt);
  report.error = error ? (error instanceof Error ? error.message : String(error)) : null;
}

function artifactRecord(path) {
  const absolutePath = resolve(path);
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
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
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
