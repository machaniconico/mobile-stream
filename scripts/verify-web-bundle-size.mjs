import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { exit } from "node:process";

const assetsDir = "dist/assets";
const maxJsChunkBytes = 500_000;
const expectedMinimumJsChunks = 2;

let entries;
try {
  entries = readdirSync(assetsDir);
} catch (error) {
  console.error(`Web bundle size verification failed: could not read ${assetsDir}. Run npm run build first.`);
  console.error(error instanceof Error ? error.message : String(error));
  exit(2);
}

const jsChunks = entries
  .filter((entry) => entry.endsWith(".js"))
  .map((entry) => {
    const path = join(assetsDir, entry);
    return {
      file: path,
      bytes: statSync(path).size
    };
  })
  .sort((left, right) => right.bytes - left.bytes);

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
