import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { argv, cwd, exit } from "node:process";
import { pathToFileURL } from "node:url";
import { renderSubmissionReview } from "./create-store-submission-draft.mjs";
import {
  createStoreSubmissionChecklist,
  storeSubmissionChecklistPath,
  validateStoreSubmissionChecklist
} from "./verify-store-submission-checklist.mjs";
import { readPngEvidence } from "./png-evidence.mjs";

const defaultMetadataPath = ".artifacts/store/submission-metadata.json";
const defaultReviewPath = ".artifacts/store/submission-review.md";
const defaultLocale = "ja-JP";
const defaultDevices = {
  ios: "iPhone 15 Pro Max",
  android: "Pixel 8 Pro"
};

export function importStoreRealDeviceScreenshots({
  metadataPath = defaultMetadataPath,
  reviewPath = "",
  manifestPath = storeSubmissionChecklistPath,
  iosScreenshot = "",
  androidScreenshot = "",
  iosDevice = "",
  androidDevice = "",
  iosOsVersion = "",
  androidOsVersion = "",
  appBuild = "",
  capturedAt = "",
  locale = ""
} = {}) {
  if (!iosScreenshot) {
    throw new Error("Provide --ios-screenshot <png> captured from a real iOS device.");
  }
  if (!androidScreenshot) {
    throw new Error("Provide --android-screenshot <png> captured from a real Android device.");
  }

  const relativeMetadataPath = workspaceOperatorPath(metadataPath);
  if (!relativeMetadataPath) {
    throw new Error(`Store submission metadata path must be inside the workspace without parent traversal: ${metadataPath}`);
  }
  if (!existsSync(resolve(relativeMetadataPath))) {
    throw new Error(`Store submission metadata does not exist: ${relativeMetadataPath}`);
  }
  assertRegularSourceFile(relativeMetadataPath, "Store submission metadata");

  const metadata = readJsonFile(relativeMetadataPath, "store submission metadata");
  if (metadata?.app !== "MobileLiveCaster") {
    throw new Error("Store submission metadata must be for MobileLiveCaster.");
  }

  const relativeManifestPath = writableOperatorPath(manifestPath, "Store submission checklist");
  const metadataDir = dirname(relativeMetadataPath);
  const screenshotDir = join(metadataDir, "screenshots");
  const iosExisting = screenshotForPlatform(metadata, "ios");
  const androidExisting = screenshotForPlatform(metadata, "android");
  const iosOutputPath = writableRecordPath(iosExisting?.path || join(screenshotDir, "ios-store.png"), "iOS store screenshot");
  const androidOutputPath = writableRecordPath(
    androidExisting?.path || join(screenshotDir, "android-store.png"),
    "Android store screenshot"
  );
  const reviewCandidate = reviewPath || submissionReviewPath(metadata) || defaultReviewPathForMetadata(relativeMetadataPath);
  const relativeReviewPath = reviewPath
    ? writableOperatorPath(reviewCandidate, "Store submission review")
    : writableRecordPath(reviewCandidate, "Store submission review");
  const capture = resolveCaptureMetadata({
    iosExisting,
    androidExisting,
    iosOsVersion,
    androidOsVersion,
    appBuild,
    capturedAt
  });
  const imported = {
    ios: copyScreenshot({
      sourcePath: iosScreenshot,
      outputPath: iosOutputPath,
      label: "iOS"
    }),
    android: copyScreenshot({
      sourcePath: androidScreenshot,
      outputPath: androidOutputPath,
      label: "Android"
    })
  };

  const effectiveLocale = locale || iosExisting?.locale || androidExisting?.locale || defaultLocale;
  metadata.screenshots = [
    screenshotRecord({
      existing: iosExisting,
      platform: "ios",
      device: iosDevice || iosExisting?.device || defaultDevices.ios,
      path: imported.ios,
      locale: effectiveLocale,
      osVersion: capture.iosOsVersion,
      appBuild: capture.appBuild,
      capturedAt: capture.capturedAt
    }),
    screenshotRecord({
      existing: androidExisting,
      platform: "android",
      device: androidDevice || androidExisting?.device || defaultDevices.android,
      path: imported.android,
      locale: effectiveLocale,
      osVersion: capture.androidOsVersion,
      appBuild: capture.appBuild,
      capturedAt: capture.capturedAt
    })
  ];

  assertWritableRegularPath(relativeReviewPath, "Store submission review");
  metadata.reviewDocuments = [{ kind: "submissionReview", path: relativeReviewPath }];

  mkdirSync(dirname(resolve(relativeMetadataPath)), { recursive: true });
  writeFileSync(resolve(relativeMetadataPath), `${JSON.stringify(metadata, null, 2)}\n`);
  mkdirSync(dirname(resolve(relativeReviewPath)), { recursive: true });
  writeFileSync(resolve(relativeReviewPath), renderSubmissionReview(metadata, { metadataPath: relativeMetadataPath }));

  const checklist = createStoreSubmissionChecklist({
    metadataPath: relativeMetadataPath,
    manifestPath: relativeManifestPath
  });
  const failures = validateStoreSubmissionChecklist(checklist.manifest, {
    manifestPath: checklist.manifestPath,
    requireRealDeviceScreenshots: true
  });
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }

  return {
    metadataPath: relativeMetadataPath,
    reviewPath: relativeReviewPath,
    manifestPath: checklist.manifestPath,
    screenshots: [imported.ios, imported.android],
    checklist: checklist.manifest
  };
}

function resolveCaptureMetadata({ iosExisting, androidExisting, iosOsVersion, androidOsVersion, appBuild, capturedAt }) {
  const resolved = {
    iosOsVersion: stringValue(iosOsVersion) || stringValue(iosExisting?.osVersion),
    androidOsVersion: stringValue(androidOsVersion) || stringValue(androidExisting?.osVersion),
    appBuild: stringValue(appBuild) || stringValue(iosExisting?.appBuild) || stringValue(androidExisting?.appBuild),
    capturedAt: stringValue(capturedAt) || stringValue(iosExisting?.capturedAt) || stringValue(androidExisting?.capturedAt) || new Date().toISOString()
  };

  if (!resolved.iosOsVersion) {
    throw new Error("Provide --ios-os-version <version> for final iOS store screenshot evidence.");
  }
  if (!resolved.androidOsVersion) {
    throw new Error("Provide --android-os-version <version> for final Android store screenshot evidence.");
  }
  if (!resolved.appBuild) {
    throw new Error("Provide --app-build <version/build> for final store screenshot evidence.");
  }
  if (!isValidDateTime(resolved.capturedAt)) {
    throw new Error(`Store screenshot captured-at timestamp must be a valid date-time: ${resolved.capturedAt}`);
  }

  return resolved;
}

function screenshotRecord({ existing, platform, device, path, locale, osVersion, appBuild, capturedAt }) {
  return {
    ...(existing || {}),
    platform,
    device,
    path,
    locale,
    role: existing?.role || "main",
    osVersion,
    appBuild,
    capturedAt,
    source: "realDevice"
  };
}

function screenshotForPlatform(metadata, platform) {
  return (Array.isArray(metadata?.screenshots) ? metadata.screenshots : []).find(
    (screenshot) => screenshot?.platform === platform
  );
}

function submissionReviewPath(metadata) {
  return (Array.isArray(metadata?.reviewDocuments) ? metadata.reviewDocuments : []).find(
    (document) => document?.kind === "submissionReview"
  )?.path;
}

function defaultReviewPathForMetadata(metadataPath) {
  const metadataDir = dirname(metadataPath);
  return metadataDir === "." ? defaultReviewPath : join(metadataDir, "submission-review.md");
}

function copyScreenshot({ sourcePath, outputPath, label }) {
  const relativeSourcePath = workspaceRelativePath(sourcePath);
  const readPath = relativeSourcePath || sourcePath;
  if (!existsSync(resolve(readPath))) {
    throw new Error(`${label} real-device screenshot source does not exist: ${sourcePath}`);
  }
  assertRegularSourceFile(readPath, `${label} real-device screenshot source`);
  if (extname(readPath) !== ".png") {
    throw new Error(`${label} real-device screenshot source must be a PNG file: ${sourcePath}`);
  }
  const content = readFileSync(resolve(readPath));
  const pngEvidence = readPngEvidence(content);
  if (!pngEvidence.valid) {
    throw new Error(`${label} real-device screenshot source is not a structurally valid PNG file: ${sourcePath} (${pngEvidence.reason})`);
  }

  const relativeOutputPath = workspaceRecordPath(outputPath);
  if (!relativeOutputPath) {
    throw new Error(`${label} store screenshot output must be canonical workspace-relative: ${outputPath}`);
  }
  assertWritableRegularPath(relativeOutputPath, `${label} store screenshot`);
  mkdirSync(dirname(resolve(relativeOutputPath)), { recursive: true });
  if (resolve(readPath) !== resolve(relativeOutputPath)) {
    copyFileSync(resolve(readPath), resolve(relativeOutputPath));
  }
  return relativeOutputPath;
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

function assertWritableRegularPath(path, label) {
  assertNoSymlinkedParentDirectories(path, label);
  const stat = lstatExisting(path);
  if (!stat) {
    return;
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} output must not be a symbolic link: ${path}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} output must point to a file: ${path}`);
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

function readJsonFile(path, label) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function workspaceRelativePath(path) {
  if (!path) {
    return "";
  }
  const absolutePath = resolve(path);
  const relativePath = relative(cwd(), absolutePath);
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    return "";
  }
  return relativePath;
}

function workspaceRecordPath(path) {
  if (typeof path !== "string") {
    return "";
  }
  const relativePath = workspaceRelativePath(path);
  return relativePath === path ? relativePath : "";
}

function workspaceOperatorPath(path) {
  if (typeof path !== "string" || !path.trim() || hasParentTraversal(path)) {
    return "";
  }
  return workspaceRelativePath(path);
}

function writableRecordPath(path, label) {
  const relativePath = workspaceRecordPath(path);
  if (!relativePath) {
    throw new Error(`${label} path must be canonical workspace-relative: ${path || "-"}`);
  }
  assertWritableRegularPath(relativePath, label);
  return relativePath;
}

function writableOperatorPath(path, label) {
  const relativePath = workspaceOperatorPath(path);
  if (!relativePath) {
    throw new Error(`${label} path must be inside the workspace without parent traversal: ${path || "-"}`);
  }
  assertWritableRegularPath(relativePath, label);
  return relativePath;
}

function hasParentTraversal(path) {
  return path.split(/[\\/]+/).includes("..");
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidDateTime(value) {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function parseArgs(args) {
  const options = {
    metadataPath: defaultMetadataPath,
    reviewPath: "",
    manifestPath: storeSubmissionChecklistPath,
    iosScreenshot: "",
    androidScreenshot: "",
    iosDevice: "",
    androidDevice: "",
    iosOsVersion: "",
    androidOsVersion: "",
    appBuild: "",
    capturedAt: "",
    locale: "",
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--metadata") {
      options.metadataPath = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--metadata=")) {
      options.metadataPath = arg.slice("--metadata=".length);
    } else if (arg === "--review-out") {
      options.reviewPath = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--review-out=")) {
      options.reviewPath = arg.slice("--review-out=".length);
    } else if (arg === "--manifest") {
      options.manifestPath = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--manifest=")) {
      options.manifestPath = arg.slice("--manifest=".length);
    } else if (arg === "--ios-screenshot") {
      options.iosScreenshot = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--ios-screenshot=")) {
      options.iosScreenshot = arg.slice("--ios-screenshot=".length);
    } else if (arg === "--android-screenshot") {
      options.androidScreenshot = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--android-screenshot=")) {
      options.androidScreenshot = arg.slice("--android-screenshot=".length);
    } else if (arg === "--ios-device") {
      options.iosDevice = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--ios-device=")) {
      options.iosDevice = arg.slice("--ios-device=".length);
    } else if (arg === "--android-device") {
      options.androidDevice = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--android-device=")) {
      options.androidDevice = arg.slice("--android-device=".length);
    } else if (arg === "--ios-os-version") {
      options.iosOsVersion = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--ios-os-version=")) {
      options.iosOsVersion = arg.slice("--ios-os-version=".length);
    } else if (arg === "--android-os-version") {
      options.androidOsVersion = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--android-os-version=")) {
      options.androidOsVersion = arg.slice("--android-os-version=".length);
    } else if (arg === "--app-build") {
      options.appBuild = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--app-build=")) {
      options.appBuild = arg.slice("--app-build=".length);
    } else if (arg === "--captured-at") {
      options.capturedAt = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--captured-at=")) {
      options.capturedAt = arg.slice("--captured-at=".length);
    } else if (arg === "--locale") {
      options.locale = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--locale=")) {
      options.locale = arg.slice("--locale=".length);
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run release:store-real-device-screenshots -- --ios-screenshot <png> --android-screenshot <png> --ios-os-version <version> --android-os-version <version> --app-build <version/build>",
      "",
      "Imports final real-device App Store / Play Console screenshots into existing store-submission metadata,",
      "records device OS/build capture metadata, rewrites the review document, and regenerates .artifacts/store-submission-checklist.json."
    ].join("\n")
  );
}

function run() {
  try {
    const options = parseArgs(argv.slice(2));
    if (options.help) {
      printUsage();
      return 0;
    }

    const result = importStoreRealDeviceScreenshots(options);
    console.log(`Updated store submission metadata: ${result.metadataPath}`);
    console.log(`Updated store submission review: ${result.reviewPath}`);
    console.log(`Wrote store submission checklist: ${result.manifestPath}`);
    console.log(`Real-device screenshots: ${result.screenshots.map((path) => basename(path)).join(", ")}`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  exit(run());
}
