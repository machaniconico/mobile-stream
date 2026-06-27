import { lstatSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { cwd } from "node:process";

export function assertWritableRegularPath(path, label) {
  const absolutePath = resolve(path);
  assertNoSymlinkedParentDirectories(absolutePath, label);
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

export function assertWritableDirectoryPath(path, label) {
  const absolutePath = resolve(path);
  assertNoSymlinkedParentDirectories(absolutePath, label);
  const stat = lstatExisting(absolutePath);
  if (!stat) {
    return absolutePath;
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} output must not be a symbolic link: ${absolutePath}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`${label} output must point to a directory: ${absolutePath}`);
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
