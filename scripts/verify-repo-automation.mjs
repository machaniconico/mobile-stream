import { readFileSync } from "node:fs";
import { exit } from "node:process";

const files = {
  ci: read(".github/workflows/ci.yml"),
  autoMerge: read(".github/workflows/auto-merge.yml")
};

const checks = [
  check("CI keeps the required commercial gate job name", () => {
    expectIncludes(files.ci, "name: test");
  }),
  check("CI installs locked dependencies", () => {
    expectIncludes(files.ci, "npm ci");
  }),
  check("CI runs repository automation safety audit", () => {
    expectIncludes(files.ci, "npm run verify:repo-automation");
  }),
  check("CI runs native release configuration audit", () => {
    expectIncludes(files.ci, "npm run verify:release-config");
  }),
  check("CI runs unit tests, typecheck, web build, bundle size, and RN bundles", () => {
    ["npm test", "npm run typecheck", "npm run build", "npm run verify:web-bundle-size", "npm run verify:rn"].forEach(
      (command) => expectIncludes(files.ci, command)
    );
  }),
  check("Auto-merge is explicit opt-in only", () => {
    expectIncludes(files.autoMerge, "types: [opened, reopened, synchronize, ready_for_review, labeled, unlabeled]");
    expectIncludes(files.autoMerge, "contains(github.event.pull_request.labels.*.name, 'automerge')");
    expectIncludes(files.autoMerge, "!github.event.pull_request.draft");
    expectIncludes(files.autoMerge, "gh pr merge --auto --squash");
  })
];

const failures = checks.flatMap((result) => (result.ok ? [] : [`${result.name}: ${result.error.message}`]));

if (failures.length > 0) {
  console.error("Repository automation verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  exit(1);
}

console.log(`Repository automation verification passed (${checks.length} checks).`);

function read(path) {
  return readFileSync(path, "utf8");
}

function check(name, assertion) {
  try {
    assertion();
    return { name, ok: true };
  } catch (error) {
    return { name, ok: false, error };
  }
}

function expectIncludes(value, needle) {
  if (!value.includes(needle)) {
    throw new Error(`missing ${JSON.stringify(needle)}`);
  }
}
