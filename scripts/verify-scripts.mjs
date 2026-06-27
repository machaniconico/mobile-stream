import { spawnSync } from "node:child_process";
import { lstatSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { cwd, execPath, exit } from "node:process";

const scriptsDir = "scripts";
let scripts = [];

const failures = [];

try {
  assertRegularDirectory(scriptsDir, "Release automation scripts directory");
  scripts = readdirSync(scriptsDir)
    .filter((entry) => entry.endsWith(".mjs"))
    .map((entry) => join(scriptsDir, entry))
    .sort();
} catch (error) {
  failures.push({
    script: scriptsDir,
    message: error instanceof Error ? error.message : String(error)
  });
}

for (const script of scripts) {
  try {
    assertRegularSourceFile(script, "Release automation script");
  } catch (error) {
    failures.push({
      script,
      message: error instanceof Error ? error.message : String(error)
    });
    continue;
  }

  const result = spawnSync(execPath, ["--check", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0 || result.error) {
    failures.push({
      script,
      message: result.error?.message || result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`
    });
  }
}

if (failures.length > 0) {
  console.error("Release automation script verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure.script}: ${failure.message}`);
  }
  exit(1);
}

console.log(`Release automation script verification passed (${scripts.length} scripts).`);

function assertRegularDirectory(path, label) {
  assertNoSymlinkedParentDirectories(path, label);
  const stat = lstatSync(resolve(path));
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${path}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`${label} must point to a directory: ${path}`);
  }
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
