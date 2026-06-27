import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { argv, env, exit } from "node:process";
import { assertWritableRegularPath } from "./ios-release-path-safety.mjs";
import { iosReleasePaths, renderIosExportOptionsPlist } from "./ios-release-config.mjs";

export function createIosExportOptions({ args = argv.slice(2), envVars = env } = {}) {
  const parsed = parseArgs(args);
  const paths = iosReleasePaths(envVars);
  const outputPath = parsed.outputPath || paths.exportOptionsPath;
  return writeIosExportOptionsPlist(outputPath, envVars);
}

export function writeIosExportOptionsPlist(outputPath, envVars = env) {
  const absoluteOutputPath = resolve(outputPath);
  assertWritableRegularPath(absoluteOutputPath, "iOS export options");
  const plist = renderIosExportOptionsPlist(envVars);
  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(absoluteOutputPath, plist);
  return absoluteOutputPath;
}

function parseArgs(args) {
  const parsed = { outputPath: null };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--output") {
      parsed.outputPath = args[index + 1] || null;
      index += 1;
    } else if (arg.startsWith("--output=")) {
      parsed.outputPath = arg.slice("--output=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (parsed.outputPath === "") {
    throw new Error("--output requires a non-empty path");
  }

  return parsed;
}

function run() {
  try {
    const outputPath = createIosExportOptions();
    console.log(`Wrote iOS export options: ${outputPath}`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.url === `file://${argv[1]}`) {
  exit(run());
}
