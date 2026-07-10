import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { argv, cwd, exit } from "node:process";
import { pathToFileURL } from "node:url";
import {
  gitleaksHistoryBaselinePath,
  gitleaksHistoryRawReportPath,
  gitleaksHistoryScanArtifactPath
} from "./release-artifact-policy.mjs";

export const expectedGitleaksBaselineFindings = [
  {
    RuleID: "generic-api-key",
    File: "src/domain/readiness.test.ts",
    Commit: "07acf4a10f14ed7491a9f97c71cb41a74c5a7c84",
    StartLine: 19,
    Fingerprint: "07acf4a10f14ed7491a9f97c71cb41a74c5a7c84:src/domain/readiness.test.ts:generic-api-key:19"
  },
  {
    RuleID: "generic-api-key",
    File: "src/domain/readiness.test.ts",
    Commit: "07acf4a10f14ed7491a9f97c71cb41a74c5a7c84",
    StartLine: 50,
    Fingerprint: "07acf4a10f14ed7491a9f97c71cb41a74c5a7c84:src/domain/readiness.test.ts:generic-api-key:50"
  },
  {
    RuleID: "generic-api-key",
    File: "src/domain/readiness.test.ts",
    Commit: "801c776904f1bcec9863e59924537f45d0bbc0e1",
    StartLine: 21,
    Fingerprint: "801c776904f1bcec9863e59924537f45d0bbc0e1:src/domain/readiness.test.ts:generic-api-key:21"
  },
  {
    RuleID: "generic-api-key",
    File: "src/domain/readiness.test.ts",
    Commit: "801c776904f1bcec9863e59924537f45d0bbc0e1",
    StartLine: 38,
    Fingerprint: "801c776904f1bcec9863e59924537f45d0bbc0e1:src/domain/readiness.test.ts:generic-api-key:38"
  }
];
export const expectedGitleaksVersion = "8.30.1";

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    exit(1);
  });
}

async function main() {
  const options = parseArgs(argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const baselineFindings = validateGitleaksBaselineFile(options.baselinePath);
  const gitleaksVersion = commandOutput("gitleaks", ["version"]);
  if (!gitleaksVersion) {
    throw new Error("gitleaks is required for history scanning. Install gitleaks and rerun npm run verify:gitleaks-history.");
  }
  if (gitleaksVersion !== expectedGitleaksVersion) {
    throw new Error(`Gitleaks history scan requires gitleaks ${expectedGitleaksVersion}, got ${gitleaksVersion}.`);
  }
  const shallowRepository = readShallowRepositoryStatus();
  if (shallowRepository !== false) {
    throw new Error(
      shallowRepository === true
        ? "Gitleaks history scan requires a full git history checkout; the current repository is shallow."
        : "Gitleaks history scan could not determine whether the current repository is shallow."
    );
  }

  assertWritableRegularPath(options.reportJson, "gitleaks history scan report");
  assertWritableRegularPath(options.rawReportJson, "raw gitleaks history report");
  mkdirSync(dirname(resolve(options.reportJson)), { recursive: true });
  mkdirSync(dirname(resolve(options.rawReportJson)), { recursive: true });

  const result = spawnSync(
    "gitleaks",
    [
      "detect",
      "--no-banner",
      "--redact",
      "--source",
      ".",
      "--baseline-path",
      options.baselinePath,
      "--report-format",
      "json",
      "--report-path",
      options.rawReportJson
    ],
    { encoding: "utf8" }
  );
  const rawFindings = readJsonArrayIfPresent(options.rawReportJson);
  const generatedAt = new Date().toISOString();
  const report = createGitleaksHistoryScanReport({
    status: result.status === 0 && rawFindings.length === 0 ? "passed" : "failed",
    generatedAt,
    gitleaksVersion,
    shallowRepository,
    baselinePath: options.baselinePath,
    baselineFindings,
    rawReportPath: options.rawReportJson,
    rawFindings
  });
  writeFileSync(resolve(options.reportJson), `${JSON.stringify(report, null, 2)}\n`);

  if (report.status !== "passed") {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `${rawFindings.length} findings retained`;
    throw new Error(`Gitleaks history scan failed:\n${detail}`);
  }

  console.log(
    `Gitleaks history scan passed (${report.scannedCommits} commits, ${report.baselineFingerprintCount} fixed baseline finding(s)).`
  );
}

function parseArgs(args) {
  const parsed = {
    baselinePath: gitleaksHistoryBaselinePath,
    reportJson: gitleaksHistoryScanArtifactPath,
    rawReportJson: gitleaksHistoryRawReportPath,
    help: false
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg.startsWith("--baseline-path=")) {
      parsed.baselinePath = arg.slice("--baseline-path=".length);
    } else if (arg.startsWith("--report-json=")) {
      parsed.reportJson = arg.slice("--report-json=".length);
    } else if (arg.startsWith("--raw-report-json=")) {
      parsed.rawReportJson = arg.slice("--raw-report-json=".length);
    } else {
      printUsage();
      throw new Error(`\nUnknown argument: ${arg}`);
    }
  }

  return parsed;
}

export function createGitleaksHistoryScanReport({
  status,
  generatedAt = new Date().toISOString(),
  gitleaksVersion,
  shallowRepository = readShallowRepositoryStatus(),
  baselinePath = gitleaksHistoryBaselinePath,
  baselineFindings,
  rawReportPath = gitleaksHistoryRawReportPath,
  rawFindings = []
}) {
  const baselineFingerprints = baselineFindings.map((finding) => finding.Fingerprint).sort((left, right) => left.localeCompare(right));
  return {
    reportVersion: 1,
    app: "MobileLiveCaster",
    type: "gitleaks-history-scan",
    status,
    generatedAt,
    gitleaksVersion,
    git: {
      commit: commandOutput("git", ["rev-parse", "HEAD"]),
      dirty: commandOutput("git", ["status", "--short"]).length > 0,
      statusShort: commandOutput("git", ["status", "--short"]),
      shallowRepository
    },
    scannedCommits: Number(commandOutput("git", ["rev-list", "--count", "HEAD"])) || 0,
    baselinePath,
    baselineSha256: fileSha256(baselinePath),
    baselineFingerprintCount: baselineFingerprints.length,
    baselineFingerprints,
    rawReportPath,
    findingCount: rawFindings.length,
    findings: rawFindings.map(sanitizeGitleaksFinding)
  };
}

export function validateGitleaksBaselineFile(path = gitleaksHistoryBaselinePath) {
  assertRegularSourceFile(path, "gitleaks baseline");
  const entries = JSON.parse(readFileSync(resolve(path), "utf8"));
  return validateGitleaksBaselineEntries(entries);
}

export function validateGitleaksBaselineEntries(entries) {
  const failures = [];
  if (!Array.isArray(entries)) {
    throw new Error("Gitleaks baseline must be a JSON array.");
  }
  if (entries.length !== expectedGitleaksBaselineFindings.length) {
    failures.push(`Gitleaks baseline must contain exactly ${expectedGitleaksBaselineFindings.length} fixed findings.`);
  }

  const byFingerprint = new Map(entries.map((entry) => [entry?.Fingerprint, entry]));
  for (const expected of expectedGitleaksBaselineFindings) {
    const entry = byFingerprint.get(expected.Fingerprint);
    if (!entry) {
      failures.push(`Gitleaks baseline is missing ${expected.Fingerprint}.`);
      continue;
    }
    for (const key of ["RuleID", "File", "Commit", "StartLine", "Fingerprint"]) {
      if (entry[key] !== expected[key]) {
        failures.push(`Gitleaks baseline ${expected.Fingerprint} has unexpected ${key}.`);
      }
    }
    if (entry.Secret !== "REDACTED" || !String(entry.Match || "").includes("REDACTED")) {
      failures.push(`Gitleaks baseline ${expected.Fingerprint} is not redacted.`);
    }
  }

  for (const entry of entries) {
    if (!expectedGitleaksBaselineFindings.some((expected) => expected.Fingerprint === entry?.Fingerprint)) {
      failures.push(`Gitleaks baseline contains an unapproved finding ${JSON.stringify(entry?.Fingerprint || null)}.`);
    }
  }

  const serialized = JSON.stringify(entries);
  if (/(?:AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|rtmps?:\/\/[^\s"]+\/[A-Za-z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/u.test(serialized)) {
    failures.push("Gitleaks baseline contains an unredacted secret-like value.");
  }

  if (failures.length > 0) {
    throw new Error(["Gitleaks baseline validation failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  }

  return entries;
}

export function validateGitleaksHistoryScanReport(scan, options = {}) {
  const failures = [];
  if (scan?.app !== "MobileLiveCaster" || scan?.type !== "gitleaks-history-scan" || scan?.reportVersion !== 1) {
    failures.push("Gitleaks history scan artifact is not a MobileLiveCaster gitleaks-history-scan reportVersion 1 file.");
  }
  if (scan?.status !== "passed") {
    failures.push(`Gitleaks history scan artifact must be passed, got ${JSON.stringify(scan?.status)}.`);
  }
  if (!Number.isInteger(scan?.findingCount) || scan.findingCount !== 0 || (Array.isArray(scan?.findings) && scan.findings.length > 0)) {
    failures.push("Gitleaks history scan artifact must report zero unbaselined findings.");
  }
  if (scan?.baselinePath !== (options.expectedBaselinePath || gitleaksHistoryBaselinePath)) {
    failures.push("Gitleaks history scan artifact used an unexpected baseline path.");
  }
  if (scan?.baselineFingerprintCount !== expectedGitleaksBaselineFindings.length) {
    failures.push("Gitleaks history scan artifact has unexpected baseline fingerprint count.");
  }
  const expectedFingerprints = expectedGitleaksBaselineFindings.map((finding) => finding.Fingerprint).sort();
  const actualFingerprints = Array.isArray(scan?.baselineFingerprints) ? [...scan.baselineFingerprints].sort() : [];
  if (JSON.stringify(actualFingerprints) !== JSON.stringify(expectedFingerprints)) {
    failures.push("Gitleaks history scan artifact baseline fingerprints do not match the approved baseline.");
  }
  if (scan?.gitleaksVersion !== expectedGitleaksVersion) {
    failures.push(`Gitleaks history scan artifact must use gitleaks ${expectedGitleaksVersion}.`);
  }
  if (typeof scan?.baselineSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(scan.baselineSha256)) {
    failures.push("Gitleaks history scan artifact is missing valid baseline SHA-256 evidence.");
  } else if (options.expectedBaselineSha256 && scan.baselineSha256 !== options.expectedBaselineSha256) {
    failures.push("Gitleaks history scan artifact baseline SHA-256 does not match the approved baseline file.");
  }
  if (scan?.git?.shallowRepository !== false) {
    failures.push("Gitleaks history scan artifact must be generated from a full git history checkout.");
  }
  if (!Number.isInteger(scan?.scannedCommits) || scan.scannedCommits <= 0) {
    failures.push("Gitleaks history scan artifact is missing scanned commit evidence.");
  }
  const generatedAt = Date.parse(String(scan?.generatedAt || ""));
  if (!Number.isFinite(generatedAt)) {
    failures.push("Gitleaks history scan artifact generatedAt timestamp is missing or invalid.");
  }
  const releaseStartedAt = Date.parse(String(options.releaseStartedAt || ""));
  const releaseFinishedAt = Date.parse(String(options.releaseFinishedAt || ""));
  if (Number.isFinite(releaseStartedAt) && Number.isFinite(generatedAt) && generatedAt < releaseStartedAt) {
    failures.push("Gitleaks history scan artifact generatedAt is before the release report startedAt.");
  }
  if (Number.isFinite(releaseFinishedAt) && Number.isFinite(generatedAt) && generatedAt > releaseFinishedAt) {
    failures.push("Gitleaks history scan artifact generatedAt is after the release report finishedAt.");
  }
  return failures;
}

function sanitizeGitleaksFinding(finding) {
  return {
    RuleID: finding?.RuleID || "",
    File: finding?.File || "",
    StartLine: finding?.StartLine || 0,
    Commit: finding?.Commit || "",
    Fingerprint: finding?.Fingerprint || "",
    Secret: finding?.Secret ? "REDACTED" : ""
  };
}

function readJsonArrayIfPresent(path) {
  if (!existsSync(resolve(path))) {
    return [];
  }
  const parsed = JSON.parse(readFileSync(resolve(path), "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.status !== 0 || result.error) {
    return "";
  }
  return result.stdout.trim();
}

function readShallowRepositoryStatus() {
  const value = commandOutput("git", ["rev-parse", "--is-shallow-repository"]);
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

function fileSha256(path) {
  assertRegularSourceFile(path, "gitleaks baseline");
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function assertRegularSourceFile(path, label) {
  const relativePath = workspaceRelativePath(path);
  if (!relativePath) {
    throw new Error(`${label} path must be workspace-relative: ${path}`);
  }
  assertNoSymlinkedParentDirectories(relativePath, label);
  const stat = lstatSync(resolve(relativePath));
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${relativePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} must point to a file: ${relativePath}`);
  }
}

function assertWritableRegularPath(path, label) {
  const relativePath = workspaceRelativePath(path);
  if (!relativePath) {
    throw new Error(`${label} path must be workspace-relative: ${path}`);
  }
  assertNoSymlinkedParentDirectories(relativePath, label);
  if (!existsSync(resolve(relativePath))) {
    return;
  }
  const stat = lstatSync(resolve(relativePath));
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${relativePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} must point to a file: ${relativePath}`);
  }
}

function assertNoSymlinkedParentDirectories(path, label) {
  const parts = path.split(sep).filter(Boolean);
  let currentPath = cwd();
  for (const part of parts.slice(0, -1)) {
    currentPath = `${currentPath}${sep}${part}`;
    const stat = existsSync(currentPath) ? lstatSync(currentPath) : null;
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

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run verify:gitleaks-history",
      "  node scripts/verify-gitleaks-history.mjs [--baseline-path=.gitleaks-baseline.json] [--report-json=.artifacts/gitleaks-history-scan.json] [--raw-report-json=.artifacts/gitleaks-history-raw.json]"
    ].join("\n")
  );
}

function isDirectRun() {
  return Boolean(argv[1]) && import.meta.url === pathToFileURL(argv[1]).href;
}
