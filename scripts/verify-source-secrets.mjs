import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { cwd, exit } from "node:process";

const defaultScanRoots = [
  "src",
  "android/app/src/main",
  "ios/MobileLiveCaster",
  "ios/MobileLiveCasterBroadcastUpload",
  "scripts",
  "package.json",
  "package-lock.json",
  "dist",
  ".artifacts/rn"
];

const ignoredDirectoryNames = new Set([
  ".git",
  ".gradle",
  "Pods",
  "node_modules",
  "DerivedData",
  "build",
  "reports",
  "coverage",
  "ios-assets",
  "android-assets"
]);

const scannableExtensions = new Set([
  ".c",
  ".cpp",
  ".css",
  ".gradle",
  ".h",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".m",
  ".mjs",
  ".mm",
  ".plist",
  ".pro",
  ".properties",
  ".sh",
  ".swift",
  ".ts",
  ".tsx",
  ".xml",
  ".xcprivacy"
]);

const ignoredFileNamePatterns = [
  /\.test\.[cm]?[jt]sx?$/u,
  /\.test\.mjs$/u,
  /-test-fixtures\.mjs$/u,
  /png-test-fixtures\.mjs$/u
];

const allowedSecretValueFragments = [
  "[redacted]",
  "<redacted>",
  "redacted",
  "placeholder",
  "example",
  "dummy",
  "sample",
  "fake",
  "test",
  "token",
  "secret",
  "stream-key",
  "your-",
  "{",
  "..."
];

const secretRules = [
  {
    id: "private-key-block",
    description: "private key material",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----/giu
  },
  {
    id: "discord-webhook-url",
    description: "Discord webhook URL",
    pattern: /https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d{8,}\/[A-Za-z0-9_-]{24,}/gu
  },
  {
    id: "github-token",
    description: "GitHub token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,}\b/gu
  },
  {
    id: "google-api-key",
    description: "Google API key",
    pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/gu
  },
  {
    id: "openai-api-key",
    description: "OpenAI API key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/gu
  },
  {
    id: "jwt",
    description: "JWT-like token",
    pattern: /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/gu
  },
  {
    id: "authorization-header-token",
    description: "Authorization bearer/oauth token",
    pattern: /(?:\bAuthorization\b|["']Authorization["'])\s*[:=]\s*["']?(?:Bearer|OAuth)\s+([A-Za-z0-9._~+/=-]{20,})\b/giu,
    captureGroup: 1
  },
  {
    id: "rtmp-publish-url-key",
    description: "RTMP publish URL with embedded stream key",
    pattern: /\brtmps?:\/\/[^\s"'`<>]+\/(?:live|live2|app|ingest|rtmp)\/([A-Za-z0-9_-]{16,})(?:[/?#\s"'`<>]|$)/giu,
    captureGroup: 1
  },
  {
    id: "assigned-sensitive-value",
    description: "assigned credential-like value",
    pattern:
      /\b(?:apiKey|clientSecret|discordWebhookUrl|oauthToken|refreshToken|streamKey|twitchOauthToken|youtubeAccessToken)\b\s*[:=]\s*["']([^"'\n]{20,})["']/giu,
    captureGroup: 1
  }
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  const result = scanForSourceSecrets({
    roots: options.roots.length > 0 ? options.roots : defaultScanRoots
  });

  if (options.reportJson) {
    writeJsonReport(options.reportJson, result);
  }

  if (result.findings.length > 0) {
    console.error("Source secret scan failed:");
    for (const finding of result.findings) {
      console.error(`- ${finding.file}:${finding.line}:${finding.column} ${finding.ruleId}: ${finding.preview}`);
    }
    exit(1);
  }

  console.log(`Source secret scan passed (${result.scannedFiles.length} files, ${result.scannedBytes} bytes).`);
}

export function scanForSourceSecrets({ roots = defaultScanRoots } = {}) {
  const scannedFiles = collectScanFiles(roots);
  const findings = [];
  let scannedBytes = 0;

  for (const file of scannedFiles) {
    const content = readFileSync(resolve(file), "utf8");
    scannedBytes += Buffer.byteLength(content);
    findings.push(...scanTextForSourceSecrets(content, file));
  }

  return {
    reportVersion: 1,
    app: "MobileLiveCaster",
    type: "source-secret-scan",
    status: findings.length === 0 ? "passed" : "failed",
    generatedAt: new Date().toISOString(),
    scannedFiles,
    scannedBytes,
    findingCount: findings.length,
    findings
  };
}

export function scanTextForSourceSecrets(content, file = "<memory>") {
  const findings = [];
  for (const rule of secretRules) {
    rule.pattern.lastIndex = 0;
    for (const match of content.matchAll(rule.pattern)) {
      const secretValue = rule.captureGroup ? match[rule.captureGroup] || "" : match[0] || "";
      if (isAllowedSecretValue(secretValue)) {
        continue;
      }
      const location = locateMatch(content, match.index || 0);
      findings.push({
        ruleId: rule.id,
        description: rule.description,
        file,
        line: location.line,
        column: location.column,
        fingerprint: createHash("sha256").update(`${rule.id}:${file}:${location.line}:${secretValue}`).digest("hex").slice(0, 16),
        preview: redactPreview(match[0])
      });
    }
  }
  return findings;
}

function collectScanFiles(roots) {
  return [...new Set(roots.flatMap((root) => collectRootScanFiles(root)))].sort((left, right) => left.localeCompare(right));
}

function collectRootScanFiles(root) {
  const relativeRoot = normalizeWorkspacePath(root);
  if (!relativeRoot || !existsSync(resolve(relativeRoot))) {
    return [];
  }
  assertNoSymlinkedParentDirectories(relativeRoot, "Secret scan path");
  return collectPathScanFiles(relativeRoot);
}

function collectPathScanFiles(path) {
  const stat = lstatSync(resolve(path));
  if (stat.isSymbolicLink()) {
    throw new Error(`Secret scan path must not be a symbolic link: ${path}`);
  }
  if (stat.isDirectory()) {
    if (ignoredDirectoryNames.has(path.split("/").at(-1) || "")) {
      return [];
    }
    return readdirSync(resolve(path))
      .flatMap((entry) => collectPathScanFiles(`${path}/${entry}`))
      .sort((left, right) => left.localeCompare(right));
  }
  if (!stat.isFile() || !isScannableFile(path)) {
    return [];
  }
  return [path];
}

function isScannableFile(path) {
  const normalized = path.replaceAll("\\", "/");
  if (ignoredFileNamePatterns.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  if (normalized.endsWith(".jsbundle")) {
    return true;
  }
  return scannableExtensions.has(extname(normalized));
}

function isAllowedSecretValue(value) {
  const normalized = String(value).trim().toLowerCase();
  if (normalized.length < 20) {
    return true;
  }
  return allowedSecretValueFragments.some((fragment) => normalized.includes(fragment));
}

function locateMatch(content, index) {
  const prefix = content.slice(0, index);
  const lines = prefix.split("\n");
  return {
    line: lines.length,
    column: (lines.at(-1)?.length || 0) + 1
  };
}

function redactPreview(value) {
  const text = String(value).replace(/\s+/gu, " ").trim();
  if (text.length <= 18) {
    return "[redacted]";
  }
  return `${text.slice(0, 8)}...[redacted]...${text.slice(-6)}`;
}

function parseArgs(args) {
  const options = {
    roots: [],
    reportJson: ""
  };
  for (const arg of args) {
    if (arg.startsWith("--report-json=")) {
      options.reportJson = arg.slice("--report-json=".length);
    } else if (arg.startsWith("--root=")) {
      options.roots.push(arg.slice("--root=".length));
    } else {
      options.roots.push(arg);
    }
  }
  return options;
}

function writeJsonReport(path, result) {
  const destination = normalizeWorkspacePath(path);
  if (!destination) {
    throw new Error(`Secret scan report must stay inside the workspace: ${path}`);
  }
  mkdirSync(dirname(resolve(destination)), { recursive: true });
  writeFileSync(resolve(destination), `${JSON.stringify(result, null, 2)}\n`);
}

function normalizeWorkspacePath(path) {
  const absolutePath = resolve(path);
  const relativePath = relative(cwd(), absolutePath);
  if (relativePath === "") {
    return ".";
  }
  if (relativePath.startsWith("..") || relativePath === ".." || relativePath.includes(`..${sep}`)) {
    return null;
  }
  return relativePath.replaceAll("\\", "/");
}

function assertNoSymlinkedParentDirectories(path, label) {
  const relativePath = normalizeWorkspacePath(path);
  if (!relativePath) {
    return;
  }
  const parts = relativePath.split("/").filter(Boolean);
  let currentPath = cwd();
  for (const part of parts.slice(0, -1)) {
    currentPath = join(currentPath, part);
    if (!existsSync(currentPath)) {
      return;
    }
    const stat = lstatSync(currentPath);
    const displayPath = relative(cwd(), currentPath).replaceAll("\\", "/");
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} parent must not be a symbolic link: ${displayPath}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`${label} parent must point to a directory: ${displayPath}`);
    }
  }
}
