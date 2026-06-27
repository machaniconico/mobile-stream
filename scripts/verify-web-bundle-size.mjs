import { lstatSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { cwd, env, exit } from "node:process";

const assetsDir = env.MLC_WEB_ASSETS_DIR || "dist/assets";
const maxJsChunkBytes = 500_000;
const expectedMinimumJsChunks = 2;

let entries;
try {
  assertRegularDirectory(assetsDir, "Web bundle assets directory");
  entries = readdirSync(assetsDir);
} catch (error) {
  console.error(`Web bundle size verification failed: could not read ${assetsDir}. Run npm run build first.`);
  console.error(error instanceof Error ? error.message : String(error));
  exit(2);
}

let jsChunks;
try {
  jsChunks = entries
    .filter((entry) => entry.endsWith(".js"))
    .map((entry) => {
      const path = join(assetsDir, entry);
      const stat = assertRegularSourceFile(path, "Web bundle JavaScript chunk");
      return {
        file: path,
        bytes: stat.size
      };
    })
    .sort((left, right) => right.bytes - left.bytes);
} catch (error) {
  console.error("Web bundle size verification failed:");
  console.error(`- ${error instanceof Error ? error.message : String(error)}`);
  exit(1);
}

const failures = [];

if (jsChunks.length < expectedMinimumJsChunks) {
  failures.push(
    `Expected at least ${expectedMinimumJsChunks} JavaScript chunks so the studio UI remains code-split, found ${jsChunks.length}.`
  );
}

for (const chunk of jsChunks) {
  if (chunk.bytes > maxJsChunkBytes) {
    failures.push(`${chunk.file} is ${formatBytes(chunk.bytes)}, above the ${formatBytes(maxJsChunkBytes)} release limit.`);
  }
}

if (failures.length > 0) {
  console.error("Web bundle size verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(`Chunks: ${jsChunks.map((chunk) => `${chunk.file} ${formatBytes(chunk.bytes)}`).join(", ") || "-"}`);
  exit(1);
}

console.log(
  `Web bundle size verification passed (${jsChunks.length} JS chunks, largest ${formatBytes(jsChunks[0]?.bytes ?? 0)}).`
);

function formatBytes(bytes) {
  return `${(bytes / 1_000).toFixed(2)} kB`;
}

function assertRegularDirectory(path, label) {
  assertNoSymlinkedParentDirectories(path, label);
  const stat = lstatSync(resolve(path));
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${path}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`${label} must point to a directory: ${path}`);
  }
  return stat;
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
  return stat;
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
