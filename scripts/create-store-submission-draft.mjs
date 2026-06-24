import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { argv, cwd, exit } from "node:process";
import { pathToFileURL } from "node:url";
import { createStoreSubmissionChecklist, storeSubmissionChecklistPath } from "./verify-store-submission-checklist.mjs";

const defaultOutputDir = ".artifacts/store";
const defaultMetadataFilename = "submission-metadata.json";

export function createStoreSubmissionDraft({
  outputDir = defaultOutputDir,
  metadataPath = "",
  manifestPath = storeSubmissionChecklistPath,
  iosScreenshot = "",
  androidScreenshot = "",
  uiEvidenceJson = "",
  supportUrl = "https://mobilelivecaster.app/support",
  privacyPolicyUrl = "https://mobilelivecaster.app/privacy",
  supportEmail = "support@mobilelivecaster.app",
  releaseNotes = "Initial public release candidate with mobile VTuber streaming tools.",
  locale = "ja-JP"
} = {}) {
  const relativeOutputDir = workspaceRelativePath(outputDir);
  if (!relativeOutputDir) {
    throw new Error(`Store submission output directory must be inside the workspace: ${outputDir}`);
  }

  const screenshotSources = resolveScreenshotSources({ iosScreenshot, androidScreenshot, uiEvidenceJson });
  const screenshotsDir = join(relativeOutputDir, "screenshots");
  mkdirSync(resolve(screenshotsDir), { recursive: true });

  const iosScreenshotPath = copyScreenshot({
    sourcePath: screenshotSources.ios,
    outputPath: join(screenshotsDir, "ios-store.png"),
    label: "iOS"
  });
  const androidScreenshotPath = copyScreenshot({
    sourcePath: screenshotSources.android,
    outputPath: join(screenshotsDir, "android-store.png"),
    label: "Android"
  });

  const relativeMetadataPath = workspaceRelativePath(metadataPath || join(relativeOutputDir, defaultMetadataFilename));
  if (!relativeMetadataPath) {
    throw new Error(`Store submission metadata path must be inside the workspace: ${metadataPath}`);
  }

  const metadata = createMetadata({
    iosScreenshotPath,
    androidScreenshotPath,
    supportUrl,
    privacyPolicyUrl,
    supportEmail,
    releaseNotes,
    locale
  });

  mkdirSync(dirname(resolve(relativeMetadataPath)), { recursive: true });
  writeFileSync(resolve(relativeMetadataPath), `${JSON.stringify(metadata, null, 2)}\n`);

  const checklist = createStoreSubmissionChecklist({
    metadataPath: relativeMetadataPath,
    manifestPath
  });

  return {
    metadataPath: relativeMetadataPath,
    manifestPath: checklist.manifestPath,
    screenshots: [iosScreenshotPath, androidScreenshotPath],
    checklist: checklist.manifest
  };
}

function resolveScreenshotSources({ iosScreenshot, androidScreenshot, uiEvidenceJson }) {
  const uiEvidenceScreenshot = uiEvidenceJson ? mobileScreenshotFromUiEvidence(uiEvidenceJson) : "";
  const ios = iosScreenshot || uiEvidenceScreenshot;
  const android = androidScreenshot || uiEvidenceScreenshot;
  if (!ios) {
    throw new Error("Provide --ios-screenshot <png> or --ui-evidence-json <json>.");
  }
  if (!android) {
    throw new Error("Provide --android-screenshot <png> or --ui-evidence-json <json>.");
  }
  return { ios, android };
}

function mobileScreenshotFromUiEvidence(path) {
  const relativePath = workspaceRelativePath(path);
  const readPath = relativePath || path;
  if (!existsSync(resolve(readPath))) {
    throw new Error(`UI evidence JSON does not exist: ${path}`);
  }
  const evidence = JSON.parse(readFileSync(resolve(readPath), "utf8"));
  if (evidence?.app !== "MobileLiveCaster" || evidence?.type !== "browser-ui-verification" || evidence?.status !== "passed") {
    throw new Error("UI evidence JSON must be a passing MobileLiveCaster browser-ui-verification report.");
  }
  const mobile = (Array.isArray(evidence.viewports) ? evidence.viewports : []).find((viewport) => viewport?.name === "mobile");
  const screenshotPath = mobile?.screenshot?.path;
  if (!screenshotPath) {
    throw new Error("UI evidence JSON does not contain a mobile screenshot path.");
  }
  return screenshotPath;
}

function copyScreenshot({ sourcePath, outputPath, label }) {
  const relativeSourcePath = workspaceRelativePath(sourcePath);
  const readPath = relativeSourcePath || sourcePath;
  if (!existsSync(resolve(readPath))) {
    throw new Error(`${label} store screenshot source does not exist: ${sourcePath}`);
  }
  if (!statSync(resolve(readPath)).isFile()) {
    throw new Error(`${label} store screenshot source must point to a file: ${sourcePath}`);
  }
  if (extname(readPath) !== ".png") {
    throw new Error(`${label} store screenshot source must be a PNG file: ${sourcePath}`);
  }
  const content = readFileSync(resolve(readPath));
  if (!isPng(content)) {
    throw new Error(`${label} store screenshot source is not a PNG file: ${sourcePath}`);
  }

  const relativeOutputPath = workspaceRelativePath(outputPath);
  if (!relativeOutputPath) {
    throw new Error(`${label} store screenshot output must be inside the workspace: ${outputPath}`);
  }
  mkdirSync(dirname(resolve(relativeOutputPath)), { recursive: true });
  copyFileSync(resolve(readPath), resolve(relativeOutputPath));
  return relativeOutputPath;
}

function createMetadata({
  iosScreenshotPath,
  androidScreenshotPath,
  supportUrl,
  privacyPolicyUrl,
  supportEmail,
  releaseNotes,
  locale
}) {
  return {
    app: "MobileLiveCaster",
    appStore: {
      name: "MobileLiveCaster",
      subtitle: "VTuber Live Studio",
      description:
        "MobileLiveCaster helps creators prepare mobile VTuber streams with PNGTuber controls, mic monitoring, chat readout checks, and release evidence before going live.",
      keywords: "VTuber,live,streaming,RTMP,avatar",
      supportUrl,
      privacyPolicyUrl,
      category: "Photo & Video",
      releaseNotes,
      reviewContactEmail: supportEmail,
      ageRatingNotes: "No gambling, no user-generated storefront, and no mature content is bundled.",
      appPrivacyNotes:
        "Stream settings are user-provided, stream keys stay in secure device storage, and release evidence redacts sensitive values."
    },
    playStore: {
      name: "MobileLiveCaster",
      shortDescription: "Mobile VTuber streaming studio",
      fullDescription:
        "MobileLiveCaster helps creators prepare mobile RTMPS streams with PNGTuber controls, mic processing, chat readout checks, and release validation evidence.",
      privacyPolicyUrl,
      supportEmail,
      category: "Video Players & Editors",
      releaseNotes,
      dataSafetyNotes:
        "Stream keys stay in secure device storage, OAuth tokens are redacted from support evidence, and the app does not sell personal data.",
      contentRatingNotes: "No gambling, no monetized loot, and no mature content is bundled."
    },
    screenshots: [
      { platform: "ios", device: "iPhone 15 Pro Max", path: iosScreenshotPath, locale, role: "main" },
      { platform: "android", device: "Pixel 8 Pro", path: androidScreenshotPath, locale, role: "main" }
    ]
  };
}

function workspaceRelativePath(path) {
  if (!path) {
    return "";
  }
  const absolutePath = resolve(path);
  const relativePath = relative(cwd(), absolutePath);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return "";
  }
  return relativePath;
}

function isPng(content) {
  return (
    content.length >= 8 &&
    content[0] === 0x89 &&
    content[1] === 0x50 &&
    content[2] === 0x4e &&
    content[3] === 0x47 &&
    content[4] === 0x0d &&
    content[5] === 0x0a &&
    content[6] === 0x1a &&
    content[7] === 0x0a
  );
}

function parseArgs(args) {
  const options = {
    outputDir: defaultOutputDir,
    metadataPath: "",
    manifestPath: storeSubmissionChecklistPath,
    iosScreenshot: "",
    androidScreenshot: "",
    uiEvidenceJson: "",
    supportUrl: "https://mobilelivecaster.app/support",
    privacyPolicyUrl: "https://mobilelivecaster.app/privacy",
    supportEmail: "support@mobilelivecaster.app",
    releaseNotes: "Initial public release candidate with mobile VTuber streaming tools.",
    locale: "ja-JP",
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--output-dir") {
      options.outputDir = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.slice("--output-dir=".length);
    } else if (arg === "--metadata-out") {
      options.metadataPath = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--metadata-out=")) {
      options.metadataPath = arg.slice("--metadata-out=".length);
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
    } else if (arg === "--ui-evidence-json") {
      options.uiEvidenceJson = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--ui-evidence-json=")) {
      options.uiEvidenceJson = arg.slice("--ui-evidence-json=".length);
    } else if (arg === "--support-url") {
      options.supportUrl = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--support-url=")) {
      options.supportUrl = arg.slice("--support-url=".length);
    } else if (arg === "--privacy-policy-url") {
      options.privacyPolicyUrl = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--privacy-policy-url=")) {
      options.privacyPolicyUrl = arg.slice("--privacy-policy-url=".length);
    } else if (arg === "--support-email") {
      options.supportEmail = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--support-email=")) {
      options.supportEmail = arg.slice("--support-email=".length);
    } else if (arg === "--release-notes") {
      options.releaseNotes = args[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--release-notes=")) {
      options.releaseNotes = arg.slice("--release-notes=".length);
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
      "  npm run release:store-submission-draft -- --ios-screenshot <png> --android-screenshot <png>",
      "  npm run release:store-submission-draft -- --ui-evidence-json .artifacts/ui-verification.json",
      "",
      "Writes .artifacts/store/submission-metadata.json and .artifacts/store-submission-checklist.json for release audit.",
      "Use explicit real-device screenshots for final store submission evidence; UI evidence fallback is useful for draft checks."
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

    const result = createStoreSubmissionDraft(options);
    console.log(`Wrote store submission metadata: ${result.metadataPath}`);
    console.log(`Wrote store submission checklist: ${result.manifestPath}`);
    console.log(`Screenshots: ${result.screenshots.map((path) => basename(path)).join(", ")}`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  exit(run());
}
