import { lstatSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { argv, cwd, exit } from "node:process";
import { pathToFileURL } from "node:url";

const defaultCiPath = ".github/workflows/ci.yml";
const defaultIosNativePath = ".github/workflows/ios-native.yml";
const defaultAutoMergePath = ".github/workflows/auto-merge.yml";

if (isDirectRun()) {
  exit(run());
}

function run() {
  let result;
  try {
    result = verifyRepoAutomation();
  } catch (error) {
    console.error("Repository automation verification failed:");
    console.error(`- ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  if (result.failures.length > 0) {
    console.error("Repository automation verification failed:");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    return 1;
  }

  console.log(`Repository automation verification passed (${result.checks.length} checks).`);
  return 0;
}

export function verifyRepoAutomation({
  ciPath = defaultCiPath,
  iosNativePath = defaultIosNativePath,
  autoMergePath = defaultAutoMergePath
} = {}) {
  const files = {
    ci: read(ciPath, "CI workflow"),
    iosNative: read(iosNativePath, "iOS native workflow"),
    autoMerge: read(autoMergePath, "Auto-merge workflow")
  };

  const checks = [
    check("CI keeps the required commercial gate job name", () => {
      expectIncludes(files.ci, "name: test");
    }),
    check("CI keeps enough timeout for Android native builds", () => {
      expectIncludes(files.ci, "timeout-minutes: 40");
    }),
    check("CI limits default token permissions", () => {
      expectIncludes(files.ci, "permissions:\n  contents: read");
    }),
    check("CI installs locked dependencies", () => {
      expectIncludes(files.ci, "npm ci");
    }),
    check("CI provisions Java and Android SDK for native builds", () => {
      expectIncludes(files.ci, "actions/setup-java@v4");
      expectIncludes(files.ci, "java-version: 17");
      expectIncludes(files.ci, 'sdkmanager "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006"');
    }),
    check("CI runs repository automation safety audit", () => {
      expectIncludes(files.ci, "npm run verify:repo-automation");
    }),
    check("CI verifies release automation scripts", () => {
      expectIncludes(files.ci, "npm run verify:scripts");
    }),
    check("CI runs native release configuration audit", () => {
      expectIncludes(files.ci, "npm run verify:release-config");
    }),
    check("CI runs unit tests, typecheck, web build, bundle size, and RN bundles", () => {
      ["npm test", "npm run typecheck", "npm run build", "npm run verify:web-bundle-size", "npm run verify:rn"].forEach(
        (command) => expectIncludes(files.ci, command)
      );
    }),
    check("CI builds the Android native debug app", () => {
      expectIncludes(files.ci, "npm run verify:android-native");
    }),
    check("iOS native workflow runs on macOS with locked dependencies", () => {
      expectIncludes(files.iosNative, "name: ios-native");
      expectIncludes(files.iosNative, "runs-on: macos-latest");
      expectIncludes(files.iosNative, "node-version: 22.11.0");
      expectIncludes(files.iosNative, "ruby/setup-ruby@v1");
      expectIncludes(files.iosNative, "bundler-cache: true");
      expectIncludes(files.iosNative, "npm ci");
    }),
    check("iOS native workflow installs pods and builds the simulator app", () => {
      expectIncludes(files.iosNative, "bundle exec pod install --project-directory=ios");
      expectIncludes(files.iosNative, "npm run verify:ios-native");
    }),
    check("iOS native workflow limits default token permissions", () => {
      expectIncludes(files.iosNative, "permissions:\n  contents: read");
    }),
    check("Auto-merge is explicit opt-in only", () => {
      expectIncludes(files.autoMerge, "types: [opened, reopened, synchronize, ready_for_review, labeled, unlabeled]");
      expectIncludes(files.autoMerge, "contains(github.event.pull_request.labels.*.name, 'automerge')");
      expectIncludes(files.autoMerge, "!github.event.pull_request.draft");
      expectIncludes(files.autoMerge, "gh pr merge --auto --squash");
    })
  ];

  return {
    checks,
    failures: checks.flatMap((result) => (result.ok ? [] : [`${result.name}: ${result.error.message}`]))
  };
}

function read(path, label) {
  assertRegularSourceFile(path, label);
  return readFileSync(resolve(path), "utf8");
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
