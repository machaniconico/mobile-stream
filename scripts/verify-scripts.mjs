import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { execPath, exit } from "node:process";

const scripts = readdirSync("scripts")
  .filter((entry) => entry.endsWith(".mjs"))
  .map((entry) => join("scripts", entry))
  .sort();

const failures = [];

for (const script of scripts) {
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
