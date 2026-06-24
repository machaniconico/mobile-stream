import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { argv, exit } from "node:process";

const minimumSupportBundleVersion = 15;
const defaultMaxBundleAgeHours = 24;
const redactedMarker = "[redacted]";
const sensitivePropertyNames = new Set([
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "codeverifier",
  "devicecode",
  "clientsecret",
  "streamkey",
  "authorization",
  "oauthtoken",
  "authtoken",
  "bearertoken",
  "apikey"
]);
const sensitivePropertySuffixes = [
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "codeverifier",
  "devicecode",
  "clientsecret",
  "streamkey",
  "authorization",
  "oauthtoken",
  "authtoken",
  "bearertoken",
  "apikey",
  "secret"
];
const sensitiveAssignmentPattern =
  /\b([A-Za-z0-9_.-]*(?:access_token|refresh_token|id_token|code|code_verifier|device_code|client_secret|stream_key|accessToken|refreshToken|idToken|codeVerifier|deviceCode|clientSecret|streamKey|oauthToken|authToken|bearerToken|apiKey|secret))=([^&#\s"']+)/gi;
const sensitiveJsonPattern =
  /["']([A-Za-z0-9_.-]*(?:access_token|refresh_token|id_token|code_verifier|device_code|client_secret|stream_key|accessToken|refreshToken|idToken|codeVerifier|deviceCode|clientSecret|streamKey|oauthToken|authToken|bearerToken|apiKey|authorization|secret))["']\s*:\s*["']([^"']+)["']/gi;
const authorizationHeaderPattern = /\bAuthorization\s*:\s*(Bearer|OAuth)\s+([^\s,;]+)/gi;
const bearerTokenPattern = /\b(Bearer|OAuth)\s+([A-Za-z0-9._~+/=-]{12,})/g;

const args = argv.slice(2);
const filePath = args.find((arg) => !arg.startsWith("--"));
const allowWarnings = args.includes("--allow-warnings");
const maxAgeArg = args.find((arg) => arg.startsWith("--max-age-hours="));
const maxBundleAgeHours = maxAgeArg ? Number(maxAgeArg.split("=")[1]) : defaultMaxBundleAgeHours;

if (!filePath || !Number.isFinite(maxBundleAgeHours) || maxBundleAgeHours < 1) {
  console.error(
    "Usage: npm run verify:commercial-release-bundle -- <support-bundle.json> [--max-age-hours=24] [--allow-warnings]"
  );
  exit(2);
}

let bundle;
try {
  bundle = JSON.parse(readFileSync(filePath, "utf8"));
} catch (error) {
  console.error(`Commercial release bundle verification failed: could not read ${filePath}`);
  console.error(error instanceof Error ? error.message : String(error));
  exit(2);
}

const gate = createGate(bundle, {
  now: new Date(),
  maxBundleAgeHours,
  allowWarnings
});

console.log(`MobileLiveCaster Commercial Release Gate (${basename(filePath)})`);
console.log(`Status: ${gate.status}`);
console.log(`Can release: ${gate.canRelease ? "yes" : "no"}`);
console.log(`Bundle age: ${gate.bundleAgeHours === null ? "-" : `${gate.bundleAgeHours}h`}`);
console.log(`Evidence fingerprint: ${text(bundle?.summary?.validationEvidenceFingerprint) || "-"}`);
console.log(`Latest run fingerprint: ${text(bundle?.summary?.validationEvidenceLatestRunFingerprint) || "-"}`);
console.log(`Summary: ${gate.summary}`);
console.log(`Primary action: ${gate.primaryAction}`);
for (const issue of gate.issues) {
  console.log(`- [${issue.severity.toUpperCase()}] ${issue.label}: ${issue.detail} Action: ${issue.action}`);
}

if (!gate.canRelease) {
  exit(1);
}

function createGate(bundle, { now, maxBundleAgeHours, allowWarnings }) {
  const issues = [
    bundleIdentityIssue(bundle),
    supportBundleRedactionIssue(bundle),
    bundleAgeIssue(bundle, now, maxBundleAgeHours),
    summaryIssue(bundle),
    preflightIssue(bundle),
    publicLaunchIssue(bundle),
    validationIssue(bundle),
    validationRunbookIssue(bundle),
    validationEvidenceIssue(bundle),
    validationCoverageIssue(bundle),
    validationManifestIssue(bundle),
    validationFeatureIssue(bundle),
    staleEvidenceIssue(bundle)
  ].filter(Boolean);
  const warningCount = issues.filter((issue) => issue.severity === "warn").length;
  const failureCount = issues.filter((issue) => issue.severity === "fail").length;
  const status = failureCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "ready";
  const canRelease = failureCount === 0 && (allowWarnings || warningCount === 0);
  return {
    canRelease,
    status,
    bundleAgeHours: ageInHours(bundle?.generatedAt, now),
    issues,
    summary: gateSummary(status, canRelease, warningCount, failureCount),
    primaryAction:
      canRelease
        ? "Archive this support bundle with the release-candidate build before publishing."
        : issues.find((issue) => issue.severity === "fail")?.action ??
          issues[0]?.action ??
          "Review release warnings before publishing."
  };
}

function bundleIdentityIssue(bundle) {
  if (bundle?.app?.name !== "MobileLiveCaster" || bundle?.app?.reportVersion !== 1) {
    return fail(
      "bundle-identity",
      "Support bundle",
      "The file is not a MobileLiveCaster reportVersion 1 support bundle.",
      "Export a fresh MobileLiveCaster support bundle from the release candidate build."
    );
  }
  if (!Number.isFinite(Number(bundle.app.bundleVersion)) || Number(bundle.app.bundleVersion) < minimumSupportBundleVersion) {
    return fail(
      "bundle-version",
      "Support bundle",
      `Support bundle v${bundle.app.bundleVersion} is older than the required v${minimumSupportBundleVersion}.`,
      "Export a fresh support bundle so validation fingerprints and retained-run manifest evidence are included."
    );
  }
  return null;
}

function bundleAgeIssue(bundle, now, maxBundleAgeHours) {
  const ageHours = ageInHours(bundle?.generatedAt, now);
  if (ageHours === null) {
    return fail(
      "bundle-generated-at-invalid",
      "Support bundle freshness",
      "The support bundle generatedAt timestamp is invalid.",
      "Export a fresh support bundle from the release candidate build."
    );
  }
  if (ageHours > maxBundleAgeHours) {
    return fail(
      "bundle-stale",
      "Support bundle freshness",
      `The support bundle is ${ageHours}h old, above the ${maxBundleAgeHours}h release gate.`,
      "Export a fresh support bundle immediately before release approval."
    );
  }
  return null;
}

function summaryIssue(bundle) {
  if (!bundle?.summary || typeof bundle.summary !== "object") {
    return fail(
      "bundle-summary-missing",
      "Support bundle",
      "The support bundle summary is missing.",
      "Export a fresh support bundle from the release candidate build."
    );
  }
  return null;
}

function preflightIssue(bundle) {
  const summary = bundle?.summary ?? {};
  if (summary.preflightStatus === "blocked" || number(summary.launchBlockCount) > 0) {
    return fail(
      "preflight-blocked",
      "Go Live preflight",
      `${number(summary.launchBlockCount)} launch blocker(s) remain.`,
      "Resolve Go Live preflight blockers and export a new support bundle."
    );
  }
  if (summary.preflightStatus === "warning" || number(summary.launchWarningCount) > 0) {
    return warn(
      "preflight-warning",
      "Go Live preflight",
      `${number(summary.launchWarningCount)} launch warning(s) remain.`,
      "Review preflight warnings and either resolve them or approve release with warnings explicitly."
    );
  }
  return null;
}

function publicLaunchIssue(bundle) {
  const summary = bundle?.summary ?? {};
  if (
    summary.publicLaunchCanStart !== true ||
    summary.publicLaunchStatus === "blocked" ||
    number(summary.publicLaunchFailCount) > 0 ||
    summary.publicLaunchStartLockBlocked === true
  ) {
    return fail(
      "public-launch-blocked",
      "Public launch checklist",
      text(summary.publicLaunchStartLockSummary) || `${number(summary.publicLaunchFailCount)} public launch blocker(s) remain.`,
      text(summary.publicLaunchStartLockAction) || "Resolve public launch checklist blockers and export a fresh support bundle."
    );
  }
  if (summary.publicLaunchStatus === "warning" || number(summary.publicLaunchWarningCount) > 0) {
    return warn(
      "public-launch-warning",
      "Public launch checklist",
      `${number(summary.publicLaunchWarningCount)} public launch warning(s) remain.`,
      "Review dashboard, chat, mic monitor, and evidence warnings before approving release."
    );
  }
  return null;
}

function validationIssue(bundle) {
  const summary = bundle?.summary ?? {};
  if (summary.validationStatus !== "ready" || number(summary.validationFailCount) > 0) {
    return fail(
      "commercial-validation-not-ready",
      "Commercial validation",
      `Commercial validation is ${summary.validationStatus || "-"} with ${number(summary.validationFailCount)} failure(s).`,
      "Complete the commercial validation checklist on the release candidate build."
    );
  }
  if (number(summary.validationWarningCount) > 0 || number(summary.validationPendingCount) > 0) {
    return warn(
      "commercial-validation-warning",
      "Commercial validation",
      `${number(summary.validationWarningCount)} warning(s) and ${number(summary.validationPendingCount)} pending validation item(s) remain.`,
      "Review remaining validation items before approving release with warnings."
    );
  }
  return null;
}

function validationRunbookIssue(bundle) {
  const summary = bundle?.summary ?? {};
  if (summary.validationRunbookStatus !== "complete") {
    return fail(
      "validation-runbook-incomplete",
      "Private validation runbook",
      `Private validation runbook is ${summary.validationRunbookStatus || "-"}.`,
      text(summary.validationRunbookNextAction) || "Complete the private RTMP(S) validation runbook."
    );
  }
  return null;
}

function validationEvidenceIssue(bundle) {
  const summary = bundle?.summary ?? {};
  if (summary.validationEvidenceStatus !== "ready") {
    return fail(
      "validation-evidence-not-ready",
      "Physical validation evidence",
      `Physical validation evidence is ${summary.validationEvidenceStatus || "-"}.`,
      "Retain fresh passing iOS and Android private RTMP(S) validation runs for this build."
    );
  }
  if (!text(summary.validationEvidenceFingerprint) || !text(summary.validationEvidenceLatestRunFingerprint)) {
    return fail(
      "validation-evidence-fingerprint-missing",
      "Physical validation evidence",
      "Validation evidence fingerprints are missing.",
      "Export a fresh support bundle after recording release-candidate validation evidence."
    );
  }
  return null;
}

function validationCoverageIssue(bundle) {
  const summary = bundle?.summary ?? {};
  if (
    summary.validationEvidenceIosPass !== true ||
    summary.validationEvidenceAndroidPass !== true ||
    summary.validationEvidencePhysicalDeviceIosPass !== true ||
    summary.validationEvidencePhysicalDeviceAndroidPass !== true ||
    summary.validationEvidenceAppBuildMismatch === true ||
    !text(summary.validationEvidenceConsistentAppBuild)
  ) {
    return fail(
      "validation-evidence-coverage",
      "Physical validation coverage",
      `Coverage iOS ${summary.validationEvidenceIosPass ? "pass" : "missing"} / Android ${
        summary.validationEvidenceAndroidPass ? "pass" : "missing"
      } / physical iOS ${summary.validationEvidencePhysicalDeviceIosPass ? "pass" : "missing"} / Android ${
        summary.validationEvidencePhysicalDeviceAndroidPass ? "pass" : "missing"
      } / build ${text(summary.validationEvidenceConsistentAppBuild) || (summary.validationEvidenceAppBuildMismatch ? "mismatch" : "-")}.`,
      "Record fresh passing physical-device iOS and Android validation runs on the same release-candidate app build."
    );
  }
  return null;
}

function validationManifestIssue(bundle) {
  const summary = bundle?.summary ?? {};
  const manifest = summary.validationEvidenceRunManifest;
  if (!Array.isArray(manifest) || manifest.length === 0) {
    return fail(
      "validation-evidence-manifest-missing",
      "Validation evidence manifest",
      "The retained validation run manifest is missing.",
      "Export a support bundle v15 or newer after retaining release-candidate validation runs."
    );
  }
  const eligiblePlatforms = new Set(
    manifest
      .filter(
        (run) =>
          run?.eligible === true &&
          run?.result === "pass" &&
          run?.physicalDevice === true &&
          run?.physicalDeviceStatus === "pass"
      )
      .map((run) => run.devicePlatform)
  );
  if (!eligiblePlatforms.has("ios") || !eligiblePlatforms.has("android")) {
    return fail(
      "validation-evidence-manifest-incomplete",
      "Validation evidence manifest",
      "The manifest does not include eligible passing physical-device iOS and Android runs.",
      "Record and retain passing physical-device validation runs for both iOS and Android on the current build."
    );
  }
  if (manifest.length !== number(summary.validationEvidenceRunCount)) {
    return warn(
      "validation-evidence-manifest-count-mismatch",
      "Validation evidence manifest",
      `Manifest has ${manifest.length} run(s), but the summary reports ${number(summary.validationEvidenceRunCount)}.`,
      "Export a fresh support bundle so retained run counts and manifest rows match."
    );
  }
  return null;
}

function validationFeatureIssue(bundle) {
  const summary = bundle?.summary ?? {};
  const missing = [
    summary.validationEvidencePhysicalDeviceIosPass !== true || summary.validationEvidencePhysicalDeviceAndroidPass !== true
      ? "physical device identity"
      : "",
    summary.validationEvidenceNativeRuntimeIosPass !== true || summary.validationEvidenceNativeRuntimeAndroidPass !== true
      ? "native publisher/compositor"
      : "",
    summary.validationEvidenceMonitorHoldIosPass !== true || summary.validationEvidenceMonitorHoldAndroidPass !== true
      ? "stable monitor hold"
      : "",
    summary.validationEvidenceFaceTrackingIosPass !== true || summary.validationEvidenceFaceTrackingAndroidPass !== true
      ? "avatar motion"
      : "",
    summary.validationEvidenceAudioIosPass !== true || summary.validationEvidenceAudioAndroidPass !== true
      ? "mic FX/headphone monitor"
      : "",
    summary.validationEvidenceChatReadoutIosPass !== true || summary.validationEvidenceChatReadoutAndroidPass !== true
      ? "chat readout"
      : "",
    summary.validationEvidencePlatformPublishingIosPass !== true || summary.validationEvidencePlatformPublishingAndroidPass !== true
      ? "platform dashboard"
      : ""
  ].filter(Boolean);
  if (missing.length === 0) {
    return null;
  }
  return fail(
    "validation-evidence-feature-gap",
    "Physical validation feature proof",
    `Missing passing evidence for ${missing.join(", ")}.`,
    "Repeat private validation until both iOS and Android runs include all release-candidate feature proof."
  );
}

function staleEvidenceIssue(bundle) {
  const staleRunCount = number(bundle?.summary?.validationEvidenceStaleRunCount);
  if (staleRunCount <= 0) {
    return null;
  }
  return warn(
    "validation-evidence-stale-retained-runs",
    "Physical validation evidence",
    `${staleRunCount} stale retained validation run(s) remain in the bundle.`,
    "Clear old retained validation evidence after exporting any support records that still need it."
  );
}

function supportBundleRedactionIssue(bundle) {
  const findings = findSensitiveBundleFindings(bundle);
  if (findings.length === 0) {
    return null;
  }
  const examples = findings
    .slice(0, 3)
    .map((finding) => `${finding.path} ${finding.reason}`)
    .join("; ");
  return fail(
    "support-bundle-sensitive-data",
    "Support bundle privacy",
    `Support bundle contains ${findings.length} unredacted sensitive value(s): ${examples}.`,
    "Fix redaction, export a fresh support bundle, and do not archive the leaking evidence."
  );
}

function gateSummary(status, canRelease, warningCount, failureCount) {
  if (canRelease) {
    return status === "warning"
      ? `${warningCount} release warning${warningCount === 1 ? "" : "s"} accepted.`
      : "Commercial release gate is ready.";
  }
  if (failureCount > 0) {
    return `${failureCount} commercial release blocker${failureCount === 1 ? "" : "s"} remain.`;
  }
  return `${warningCount} commercial release warning${warningCount === 1 ? "" : "s"} require approval.`;
}

function fail(code, label, detail, action) {
  return { code, severity: "fail", label, detail, action };
}

function warn(code, label, detail, action) {
  return { code, severity: "warn", label, detail, action };
}

function ageInHours(value, now) {
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  const ageMs = now.getTime() - timestamp;
  if (ageMs < 0) {
    return null;
  }
  return Math.floor(ageMs / 3_600_000);
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function findSensitiveBundleFindings(value) {
  const findings = [];
  const seen = new WeakSet();

  const visit = (entry, path, key) => {
    if (findings.length >= 10) {
      return;
    }

    if (typeof entry === "string") {
      if (key && isSensitivePropertyName(key) && !isSafeSensitiveValue(entry)) {
        findings.push({ path, reason: `stores ${key}` });
      }
      findings.push(...findSensitiveStringFindings(entry, path).slice(0, 10 - findings.length));
      return;
    }

    if (entry === null || typeof entry !== "object") {
      if (key && isSensitivePropertyName(key) && entry !== null && entry !== undefined) {
        findings.push({ path, reason: `stores non-redacted ${key}` });
      }
      return;
    }

    if (seen.has(entry)) {
      return;
    }
    seen.add(entry);

    if (Array.isArray(entry)) {
      entry.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }

    for (const [childKey, childValue] of Object.entries(entry)) {
      visit(childValue, `${path}.${childKey}`, childKey);
    }
  };

  visit(value, "bundle");
  return findings;
}

function findSensitiveStringFindings(value, path) {
  if (!value || !hasSensitiveTextLeak(value)) {
    return [];
  }
  return [{ path, reason: "contains an unredacted token pattern" }];
}

function hasSensitiveTextLeak(value) {
  return (
    hasUnredactedMatch(value, sensitiveAssignmentPattern) ||
    hasUnredactedMatch(value, sensitiveJsonPattern) ||
    hasUnredactedMatch(value, authorizationHeaderPattern) ||
    hasUnredactedMatch(value, bearerTokenPattern)
  );
}

function hasUnredactedMatch(value, pattern) {
  pattern.lastIndex = 0;
  for (const match of value.matchAll(pattern)) {
    const candidate = match[2] ?? "";
    if (!isSafeSensitiveValue(candidate)) {
      return true;
    }
  }
  return false;
}

function isSafeSensitiveValue(value) {
  const trimmed = value.trim();
  return !trimmed || trimmed.includes(redactedMarker);
}

function normalizePropertyName(value) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSensitivePropertyName(value) {
  const normalized = normalizePropertyName(value);
  return sensitivePropertyNames.has(normalized) || sensitivePropertySuffixes.some((suffix) => normalized.endsWith(suffix));
}
