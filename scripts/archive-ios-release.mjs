import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { env, exit } from "node:process";
import { iosArchiveArgs, iosReleasePaths } from "./ios-release-config.mjs";

function run() {
  try {
    const paths = iosReleasePaths(env);
    mkdirSync(dirname(paths.archivePath), { recursive: true });
    const args = iosArchiveArgs(env);
    const result = spawnSync("xcodebuild", args, { stdio: "inherit" });
    if (result.error) {
      throw result.error;
    }
    return result.status ?? 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

exit(run());
