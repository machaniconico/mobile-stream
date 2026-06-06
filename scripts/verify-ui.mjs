import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const target = process.env.MLC_URL ?? "http://localhost:5173/";
const outDir = new URL("../.artifacts/", import.meta.url);

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 900 }
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  headless: true
});

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    await page.goto(target, { waitUntil: "networkidle" });

    const checks = ["MobileLiveCaster", "Sources", "Go Live", "Live Setup", "PNGTuber", "RTMPS"];

    for (const text of checks) {
      const count = await page.getByText(text, { exact: false }).count();
      if (count === 0) {
        throw new Error(`Missing text "${text}" at ${viewport.name}`);
      }
    }

    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    if (horizontalOverflow) {
      throw new Error(`Horizontal overflow detected at ${viewport.name}`);
    }

    await page.screenshot({
      path: new URL(`mobile-live-caster-${viewport.name}.png`, outDir).pathname,
      fullPage: true
    });

    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`UI verification passed for ${viewports.map((viewport) => viewport.name).join(", ")} at ${target}`);
