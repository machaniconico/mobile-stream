import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { env, exit } from "node:process";
import { writeIosExportOptionsPlist } from "./create-ios-export-options.mjs";
import { assertWritableDirectoryPath } from "./ios-release-path-safety.mjs";
import { iosExportArgs, iosReleasePaths } from "./ios-release-config.mjs";

function run() {
  try {
    const paths = iosReleasePaths(env);
    const exportPath = assertWritableDirectoryPath(paths.exportPath, "iOS export directory");
    mkdirSync(exportPath, { recursive: true });
    writeIosExportOptionsPlist(paths.exportOptionsPath, env);

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
