import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { verifyRepoAutomation } from "./verify-repo-automation.mjs";

const fixtureRoot = ".artifacts/verify-repo-automation-test";
const ciPath = `${fixtureRoot}/ci.yml`;
const autoMergePath = `${fixtureRoot}/auto-merge.yml`;

describe("repository automation verifier", () => {
  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("passes repository automation fixtures that keep commercial gates enabled", () => {
    writeWorkflowFixtures();

    const result = verifyRepoAutomation({ ciPath, autoMergePath });

    expect(result.failures).toEqual([]);
    expect(result.checks).toHaveLength(11);
  });

  it("rejects CI fixtures that drop Android native build coverage", () => {
    writeWorkflowFixtures({ ci: ciFixture().replace("  - run: npm run verify:android-native", "") });

    const result = verifyRepoAutomation({ ciPath, autoMergePath });

    expect(result.failures).toContain(
      'CI builds the Android native debug app: missing "npm run verify:android-native"'
    );
  });

  it("rejects symlinked CI workflow files before reading linked targets", () => {
    const outsideCi = `${fixtureRoot}/outside-ci.yml`;
    writeWorkflowFixtures({ ci: null });
    writeFileSync(outsideCi, ciFixture());
    symlinkSync(resolve(outsideCi), ciPath);

    expect(() => verifyRepoAutomation({ ciPath, autoMergePath })).toThrow(
      `CI workflow must not be a symbolic link: ${ciPath}`
    );
  });

  it("rejects dangling symlinked CI workflow files", () => {
    const missingCi = `${fixtureRoot}/missing-ci.yml`;
    writeWorkflowFixtures({ ci: null });
    symlinkSync(resolve(missingCi), ciPath);

    expect(() => verifyRepoAutomation({ ciPath, autoMergePath })).toThrow(
      `CI workflow must not be a symbolic link: ${ciPath}`
    );
  });

  it("rejects auto-merge workflows under symlinked parents", () => {
    const realParent = `${fixtureRoot}/real-parent`;
    const linkParent = `${fixtureRoot}/link-parent`;
    const linkedAutoMergePath = `${linkParent}/auto-merge.yml`;
    writeWorkflowFixtures();
    mkdirSync(realParent, { recursive: true });
    writeFileSync(`${realParent}/auto-merge.yml`, autoMergeFixture());
    symlinkSync(resolve(realParent), linkParent, "dir");

    expect(() => verifyRepoAutomation({ ciPath, autoMergePath: linkedAutoMergePath })).toThrow(
      `Auto-merge workflow path parent must not be a symbolic link: ${linkParent}`
    );
  });

  it("rejects workflow paths that point to directories", () => {
    writeWorkflowFixtures({ ci: null });
    mkdirSync(ciPath, { recursive: true });

    expect(() => verifyRepoAutomation({ ciPath, autoMergePath })).toThrow(`CI workflow must point to a file: ${ciPath}`);
  });
});

function writeWorkflowFixtures({ ci = ciFixture(), autoMerge = autoMergeFixture() } = {}) {
  mkdirSync(fixtureRoot, { recursive: true });
  if (ci !== null) {
    writeFileSync(ciPath, ci);
  }
  if (autoMerge !== null) {
    writeFileSync(autoMergePath, autoMerge);
  }
}

function ciFixture() {
  return [
    "permissions:",
    "  contents: read",
    "name: test",
    "timeout-minutes: 40",
    "steps:",
    "  - uses: actions/setup-java@v4",
    "    with:",
    "      java-version: 17",
    '  - run: sdkmanager "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006"',
    "  - run: npm ci",
    "  - run: npm run verify:repo-automation",
    "  - run: npm run verify:scripts",
    "  - run: npm run verify:release-config",
    "  - run: npm test",
    "  - run: npm run typecheck",
    "  - run: npm run build",
    "  - run: npm run verify:web-bundle-size",
    "  - run: npm run verify:rn",
    "  - run: npm run verify:android-native"
  ].join("\n");
}

function autoMergeFixture() {
  return [
    "on:",
    "  pull_request:",
    "    types: [opened, reopened, synchronize, ready_for_review, labeled, unlabeled]",
    "jobs:",
    "  enable-auto-merge:",
    "    if: contains(github.event.pull_request.labels.*.name, 'automerge') && !github.event.pull_request.draft",
    "    steps:",
    "      - run: gh pr merge --auto --squash"
  ].join("\n");
}
