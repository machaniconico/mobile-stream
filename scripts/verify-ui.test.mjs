import { readFileSync, rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { verifyUi } from "./verify-ui.mjs";

const fixtureRoot = ".artifacts/verify-ui-target-test";

describe("browser UI verification target identity", () => {
  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("fails fast when MLC_URL points at a different app", async () => {
    const browserState = { closed: false };
    const reportPath = `${fixtureRoot}/ui-report.json`;

    await expect(
      verifyUi({
        target: "http://127.0.0.1:5173/",
        artifactDir: `${fixtureRoot}/screenshots`,
        reportPath,
        browserLauncher: createWrongAppBrowserLauncher(browserState)
      })
    ).rejects.toThrow(
      "UI target http://127.0.0.1:5173/ at desktop is not MobileLiveCaster (document title: FX Chart Analyzer)."
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    expect(browserState.closed).toBe(true);
    expect(report).toMatchObject({
      app: "MobileLiveCaster",
      type: "browser-ui-verification",
      status: "failed",
      target: "http://127.0.0.1:5173/",
      viewports: []
    });
    expect(report.error).toContain("Set MLC_URL to this repository's dev server");
  });
});

const createWrongAppBrowserLauncher = (state) => ({
  launch: async () => ({
    newPage: async () => ({
      goto: async () => undefined,
      title: async () => "FX Chart Analyzer"
    }),
    close: async () => {
      state.closed = true;
    }
  })
});
