import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { env, exit } from "node:process";
import { iosExportArgs, iosReleasePaths, renderIosExportOptionsPlist } from "./ios-release-config.mjs";

function run() {
  try {
    const paths = iosReleasePaths(env);
    mkdirSync(dirname(paths.exportOptionsPath), { recursive: true });
    mkdirSync(paths.exportPath, { recursive: true });
    writeFileSync(paths.exportOptionsPath, renderIosExportOptionsPlist(env));

    const result = spawnSync("xcodebuild", iosExportArgs(env), { stdio: "inherit" });
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
