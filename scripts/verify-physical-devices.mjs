import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { argv, cwd, exit, platform } from "node:process";

export const physicalDevicePreflightDefaultPath = ".artifacts/physical-device-preflight.json";
export const physicalDevicePreflightArtifactGroup = "physical-device-preflight";
export const physicalDevicePreflightType = "physical-device-preflight";

const modes = new Set(["all", "ios", "android"]);

export function createPhysicalDevicePreflightReport({
  mode = "all",
  androidAdbOutput = "",
  androidCommand = commandPass(),
  androidRuntimeProperties = {},
  androidRuntimeCommands = {},
  iosXctraceOutput = "",
  iosCommand = commandPass()
} = {}) {
  if (!modes.has(mode)) {
    throw new Error(`Unsupported physical device preflight mode: ${mode}`);
  }

  const checks = [];
  const platforms = {};

  if (mode === "all" || mode === "android") {
    const android = validateAndroidPhysicalDevices(androidAdbOutput, androidCommand, {
      runtimeProperties: androidRuntimeProperties,
      runtimeCommands: androidRuntimeCommands
    });
    checks.push(...android.checks);
    platforms.android = android.summary;
  }

  if (mode === "all" || mode === "ios") {
    const ios = validateIosPhysicalDevices(iosXctraceOutput, iosCommand);
    checks.push(...ios.checks);
    platforms.ios = ios.summary;
  }

  return {
    reportVersion: 1,
    app: "MobileLiveCaster",
    type: physicalDevicePreflightType,
    generatedAt: new Date().toISOString(),
    git: gitSnapshot(),
    status: checks.every((check) => check.status === "pass") ? "ready" : "blocked",
    mode,
    checks,
    platforms
  };
}

export function runPhysicalDevicePreflight({ mode = "all", commandRunner = runCommand } = {}) {
  const androidResult =
    mode === "all" || mode === "android" ? commandRunner("adb", ["devices", "-l"]) : commandPass();
  const androidRuntimeProperties = {};
  const androidRuntimeCommands = {};
  if (androidResult.ok && (mode === "all" || mode === "android")) {
    for (const record of parseAndroidAdbDeviceRecords(androidResult.stdout).devices) {
      const result = commandRunner("adb", ["-s", record.rawId, "shell", "getprop"]);
      androidRuntimeCommands[record.rawId] = result;
      androidRuntimeProperties[record.rawId] = result.stdout;
    }
  }
  const iosResult =
    mode === "all" || mode === "ios"
      ? platform === "darwin"
        ? commandRunner("xcrun", ["xctrace", "list", "devices"])
        : commandFail("xcrun is only available on macOS hosts.")
      : commandPass();

  return createPhysicalDevicePreflightReport({
    mode,
    androidAdbOutput: androidResult.stdout,
    androidCommand: androidResult,
    androidRuntimeProperties,
    androidRuntimeCommands,
    iosXctraceOutput: iosResult.stdout,
    iosCommand: iosResult
  });
}

export function parseAndroidAdbDevices(output) {
  const parsed = parseAndroidAdbDeviceRecords(output);
  return {
    devices: parsed.devices.map((record) => record.summary),
    rejected: parsed.rejected.map((record) => record.summary)
  };
}

export function parseAndroidGetprop(output) {
  const properties = {};
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    const bracketMatch = /^\[([^\]]+)\]:\s+\[(.*)\]$/u.exec(line);
    if (bracketMatch) {
      properties[bracketMatch[1]] = bracketMatch[2];
      continue;
    }
    const [key, ...valueParts] = line.split(/\s+/);
    if (key && valueParts.length > 0) {
      properties[key] = valueParts.join(" ");
    }
  }
  return properties;
}

function parseAndroidAdbDeviceRecords(output) {
  const devices = [];
  const rejected = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.toLowerCase().startsWith("list of devices")) {
      continue;
    }
    const parts = line.split(/\s+/);
    if (parts.length < 2) {
      continue;
    }
    const [serial, state, ...metadataParts] = parts;
    const metadata = parseKeyValueParts(metadataParts);
    const summary = androidDeviceSummary(serial, state, metadata);
    if (state !== "device") {
      rejected.push({ rawId: serial, metadata, summary: { ...summary, reason: `adb state is ${state}` } });
      continue;
    }
    if (isAndroidEmulatorLike(serial, metadata)) {
      rejected.push({
        rawId: serial,
        metadata,
        summary: { ...summary, reason: "emulator or generic Android system image" }
      });
      continue;
    }
    devices.push({ rawId: serial, metadata, summary });
  }
  return { devices, rejected };
}

export function parseIosXctraceDevices(output) {
  const devices = [];
  const rejected = [];
  let section = "";

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const sectionMatch = /^==\s+(.+?)\s+==$/u.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1].toLowerCase();
      continue;
    }
    const parsed = parseXctraceDeviceLine(line);
    if (!parsed) {
      continue;
    }
    if (/^(Mac|MacBook|Mac mini|Mac Studio|iMac)\b/i.test(parsed.name)) {
      continue;
    }
    const isIosDevice = /\b(iPhone|iPad|iPod)\b/i.test(parsed.name);
    if (!isIosDevice) {
      continue;
    }
    const summary = iosDeviceSummary(parsed);
    if (section.includes("simulator") || parsed.state.toLowerCase().includes("simulator")) {
      rejected.push({ ...summary, reason: "iOS Simulator" });
      continue;
    }
    if (parsed.state && /unavailable|disconnected|offline/i.test(parsed.state)) {
      rejected.push({ ...summary, reason: parsed.state });
      continue;
    }
    if (section === "devices" || section === "") {
      devices.push(summary);
    }
  }

  return { devices, rejected };
}

export function writePhysicalDevicePreflightReport(report, reportPath, { root = cwd() } = {}) {
  assertWritableReportPath(reportPath, root);
  const absolutePath = resolve(root, reportPath);
  const artifactPath = relative(root, absolutePath);
  report.artifactPath = artifactPath;
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`);
  return artifactPath;
}

export function collectPhysicalDevicePreflightArtifactRecords({ reportPath = "" } = {}) {
  if (!reportPath || !lstatExisting(reportPath)) {
    return [];
  }
  return [createArtifactRecord(physicalDevicePreflightArtifactGroup, reportPath)];
}

export function validatePhysicalDevicePreflightReport(report, { reportPath, currentCommit = "", allowDirty = false, maxAgeHours = 24 } = {}) {
  const failures = [];
  if (report?.app !== "MobileLiveCaster" || report?.type !== physicalDevicePreflightType || report?.reportVersion !== 1) {
    failures.push("Physical device preflight is not a MobileLiveCaster physical-device-preflight reportVersion 1 file.");
    return failures;
  }
  if (report.status !== "ready") {
    failures.push(`Physical device preflight status must be ready, got ${JSON.stringify(report.status)}.`);
  }
  if (report.mode !== "all") {
    failures.push(`Physical device preflight mode must be all for commercial release evidence, got ${JSON.stringify(report.mode)}.`);
  }
  const ageHours = ageInHours(report.generatedAt, new Date());
  if (ageHours === null) {
    failures.push("Physical device preflight generatedAt timestamp is missing or invalid.");
  } else if (ageHours > maxAgeHours) {
    failures.push(`Physical device preflight is ${ageHours}h old, above the ${maxAgeHours}h release gate.`);
  }
  validatePreflightGit(report.git, { label: "Physical device preflight", currentCommit, allowDirty }, failures);
  failures.push(...unsafeIdentityFieldFailures(report));
  for (const platformName of ["android", "ios"]) {
    const platformSummary = report.platforms?.[platformName];
    const devices = Array.isArray(platformSummary?.devices) ? platformSummary.devices : [];
    if (devices.length === 0) {
      failures.push(`Physical device preflight is missing ready ${platformName} physical-device proof.`);
    }
  }
  if (reportPath) {
    const reportRecordPath = workspaceRelativePath(reportPath, cwd());
    if (!reportRecordPath) {
      failures.push(`Physical device preflight artifact path must be workspace-relative: ${reportPath}.`);
    } else {
      try {
        const artifacts = collectPhysicalDevicePreflightArtifactRecords({ reportPath });
        if (artifacts.length === 0) {
          failures.push(`Physical device preflight artifact file does not exist: ${reportPath}.`);
        }
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  return failures;
}

function validateAndroidPhysicalDevices(output, command, { runtimeProperties = {}, runtimeCommands = {} } = {}) {
  if (!command.ok) {
    return {
      checks: [fail("Android physical device", command.detail)],
      summary: { devices: [], rejected: [], tool: command.tool }
    };
  }

  const parsed = parseAndroidAdbDeviceRecords(output);
  const devices = [];
  const rejected = parsed.rejected.map((record) => record.summary);
  for (const record of parsed.devices) {
    const proof = evaluateAndroidRuntimePhysicalProof(
      runtimeProperties[record.rawId] || "",
      runtimeCommands[record.rawId] || commandFail("Android runtime property probe was not run.", "adb")
    );
    if (!proof.ok) {
      rejected.push({ ...record.summary, reason: proof.reason });
      continue;
    }
    devices.push({
      ...record.summary,
      runtimeProof: proof.summary
    });
  }
  const checks = [];
  if (devices.length === 0) {
    const rejectedDetail = rejectedDeviceDetail(rejected);
    checks.push(
      fail(
        "Android physical device",
        rejectedDetail
          ? `No connected physical Android device is ready. Rejected: ${rejectedDetail}.`
          : "No connected physical Android device is ready."
      )
    );
  } else {
    checks.push(pass("Android physical device", `${parsed.devices.length} connected physical Android device(s) ready.`));
  }
  return {
    checks,
    summary: {
      devices,
      rejected,
      tool: command.tool
    }
  };
}

function evaluateAndroidRuntimePhysicalProof(output, command) {
  if (!command.ok) {
    return { ok: false, reason: command.detail, summary: null };
  }
  const properties = parseAndroidGetprop(output);
  const qemuValues = [properties["ro.kernel.qemu"], properties["ro.boot.qemu"]]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  if (qemuValues.some((value) => value === "1" || value === "true" || value === "yes")) {
    return { ok: false, reason: "Android runtime reports qemu/emulator mode", summary: null };
  }
  if (!qemuValues.some((value) => value === "0" || value === "false" || value === "no")) {
    return { ok: false, reason: "Android runtime qemu properties are unavailable", summary: null };
  }
  const hardware = String(properties["ro.hardware"] || "").trim();
  if (!hardware) {
    return { ok: false, reason: "Android runtime hardware property is unavailable", summary: null };
  }
  if (/^(ranchu|goldfish|vbox|qemu|android_x86)$/i.test(hardware)) {
    return { ok: false, reason: `Android runtime hardware is ${hardware}`, summary: null };
  }
  return {
    ok: true,
    reason: "",
    summary: {
      qemu: false,
      hardware
    }
  };
}

function validateIosPhysicalDevices(output, command) {
  if (!command.ok) {
    return {
      checks: [fail("iOS physical device", command.detail)],
      summary: { devices: [], rejected: [], tool: command.tool }
    };
  }

  const parsed = parseIosXctraceDevices(output);
  const checks = [];
  if (parsed.devices.length === 0) {
    const rejectedDetail = rejectedDeviceDetail(parsed.rejected);
    checks.push(
      fail(
        "iOS physical device",
        rejectedDetail
          ? `No connected physical iOS device is ready. Rejected: ${rejectedDetail}.`
          : "No connected physical iOS device is ready."
      )
    );
  } else {
    checks.push(pass("iOS physical device", `${parsed.devices.length} connected physical iOS device(s) ready.`));
  }
  return {
    checks,
    summary: {
      devices: parsed.devices,
      rejected: parsed.rejected,
      tool: command.tool
    }
  };
}

function runCommand(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error) {
    return commandFail(result.error.message, command);
  }
  if ((result.status ?? 1) !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `${command} exited with ${result.status}`;
    return commandFail(detail, command);
  }
  return commandPass(command, result.stdout);
}

function createArtifactRecord(group, path) {
  const recordPath = workspaceRelativePath(path, cwd());
  if (!recordPath) {
    throw new Error(`Physical device preflight artifact path must be workspace-relative: ${path}.`);
  }
  assertRegularSourceFile(path, "Physical device preflight artifact");
  const absolutePath = resolve(recordPath);
  const content = readFileSync(absolutePath);
  return {
    group,
    path: recordPath,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function commandPass(tool = "", stdout = "") {
  return { ok: true, tool, stdout, detail: "command succeeded" };
}

function commandFail(detail, tool = "") {
  return { ok: false, tool, stdout: "", detail };
}

function parseKeyValueParts(parts) {
  const metadata = {};
  for (const part of parts) {
    const separator = part.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    metadata[part.slice(0, separator)] = part.slice(separator + 1);
  }
  return metadata;
}

function androidDeviceSummary(serial, state, metadata) {
  return {
    idHash: hashDeviceId(serial),
    state,
    product: metadata.product || "",
    model: metadata.model || "",
    device: metadata.device || "",
    transport: metadata.transport_id ? "adb" : ""
  };
}

function iosDeviceSummary(device) {
  return {
    idHash: hashDeviceId(device.identifier),
    family: iosDeviceFamily(device.name),
    osVersion: device.osVersion,
    state: device.state
  };
}

function iosDeviceFamily(name) {
  const match = /\b(iPhone|iPad|iPod)\b/i.exec(name);
  return match ? match[1] : "iOS device";
}

function parseXctraceDeviceLine(line) {
  const match = /^(.+?)\s+\(([^()]+)\)\s+\(([0-9A-Fa-f-]{8,})\)(?:\s+\(([^()]+)\))?$/u.exec(line);
  if (!match) {
    return null;
  }
  return {
    name: match[1].trim(),
    osVersion: match[2].trim(),
    identifier: match[3].trim(),
    state: (match[4] || "").trim()
  };
}

function isAndroidEmulatorLike(serial, metadata) {
  const haystack = [serial, metadata.product, metadata.model, metadata.device]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /(^|\s)(emulator-|sdk_gphone|sdk_phone|generic_x86|generic_x64|aosp_|ranchu|goldfish|genymotion|vbox)/i.test(
    haystack
  );
}

function rejectedDeviceDetail(rejected) {
  return rejected
    .map((device) => `${device.idHash}:${device.reason || device.state || "rejected"}`)
    .slice(0, 5)
    .join(", ");
}

function unsafeIdentityFieldFailures(report) {
  const failures = [];
  const unsafeKeyPattern = /^(rawid|raw[_-]?id|serial|identifier|udid|deviceid|device[_-]?id|name)$/i;
  const visit = (value, path) => {
    if (!value || typeof value !== "object") {
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (unsafeKeyPattern.test(key)) {
        failures.push(`Physical device preflight contains unsafe raw identity field ${nextPath}.`);
      }
      visit(nested, nextPath);
    }
  };
  visit(report?.platforms, "platforms");
  for (const platformName of ["android", "ios"]) {
    for (const collectionName of ["devices", "rejected"]) {
      const entries = report?.platforms?.[platformName]?.[collectionName];
      if (!Array.isArray(entries)) {
        continue;
      }
      for (const [index, entry] of entries.entries()) {
        if (!/^[a-f0-9]{12}$/i.test(String(entry?.idHash || ""))) {
          failures.push(`Physical device preflight ${platformName}.${collectionName}[${index}] is missing a safe 12-character idHash.`);
        }
      }
    }
  }
  return failures;
}

function hashDeviceId(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function pass(label, detail) {
  return { label, status: "pass", detail };
}

function fail(label, detail) {
  return { label, status: "fail", detail };
}

function assertWritableReportPath(path, root) {
  const relativePath = workspaceRelativePath(path, root);
  if (!relativePath) {
    throw new Error(`Physical device preflight report path must be workspace-relative: ${path}`);
  }
  assertNoSymlinkedParentDirectories(relativePath, "Physical device preflight report", root);
  const stat = lstatExisting(resolve(root, relativePath));
  if (stat?.isSymbolicLink()) {
    throw new Error(`Physical device preflight report must not be a symbolic link: ${relativePath}`);
  }
  if (stat?.isDirectory()) {
    throw new Error(`Physical device preflight report must not be a directory: ${relativePath}`);
  }
}

function assertRegularSourceFile(path, label) {
  assertNoSymlinkedParentDirectories(path, label, cwd());
  const stat = lstatExisting(path);
  if (!stat) {
    throw new Error(`${label} does not exist: ${path}`);
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${path}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} must point to a file: ${path}`);
  }
}

function assertNoSymlinkedParentDirectories(path, label, root) {
  const parts = path.split(sep).filter(Boolean);
  let currentPath = root;
  for (const part of parts.slice(0, -1)) {
    currentPath = join(currentPath, part);
    const stat = lstatExisting(currentPath);
    if (!stat) {
      return;
    }
    const displayPath = relative(root, currentPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} path parent must not be a symbolic link: ${displayPath}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`${label} path parent must point to a directory: ${displayPath}`);
    }
  }
}

function workspaceRelativePath(path, root) {
  const absolutePath = resolve(root, path);
  const relativePath = relative(root, absolutePath);
  if (relativePath === "") {
    return ".";
  }
  if (relativePath.startsWith("..") || relativePath === ".." || relativePath.includes(`..${sep}`) || isAbsolute(relativePath)) {
    return null;
  }
  return relativePath;
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

function gitSnapshot() {
  const statusShort = commandOutput("git", ["status", "--short"]);
  return {
    commit: commandOutput("git", ["rev-parse", "HEAD"]) || null,
    branch: commandOutput("git", ["branch", "--show-current"]) || null,
    dirty: Boolean(statusShort),
    statusShort
  };
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

function validatePreflightGit(git, { label, currentCommit, allowDirty }, failures) {
  const commit = typeof git?.commit === "string" ? git.commit.trim() : "";
  if (!commit) {
    failures.push(`${label} git commit is missing.`);
  } else if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(commit)) {
    failures.push(`${label} git commit must be a full 40- or 64-character hexadecimal object id.`);
  } else if (currentCommit && commit !== currentCommit) {
    failures.push(`${label} commit ${commit} does not match current commit ${currentCommit}.`);
  }
  if (git?.dirty !== true && git?.dirty !== false) {
    failures.push(`${label} git dirty state is missing.`);
  } else if (git.dirty && !allowDirty) {
    failures.push(`${label} was generated from a dirty worktree.`);
  }
}

function parseArgs(args) {
  const options = {
    mode: "all",
    json: false,
    reportJson: ""
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--android-only") {
      options.mode = "android";
    } else if (arg === "--ios-only") {
      options.mode = "ios";
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--report-json") {
      const value = args[index + 1]?.trim();
      if (!value) {
        throw new Error("--report-json requires a workspace-relative path.");
      }
      options.reportJson = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printTextReport(report) {
  console.log("MobileLiveCaster Physical Device Preflight");
  console.log(`Status: ${report.status}`);
  console.log(`Scope: ${report.mode}`);
  for (const check of report.checks) {
    console.log(`- ${check.status}: ${check.label} - ${check.detail}`);
  }
  for (const [name, platformSummary] of Object.entries(report.platforms)) {
    for (const device of platformSummary.devices) {
      const label = name === "android" ? device.model || device.product || "Android device" : device.family || "iOS device";
      console.log(`  ${name}: ${label} (${device.idHash})`);
    }
  }
}

function run() {
  try {
    const options = parseArgs(argv.slice(2));
    const report = runPhysicalDevicePreflight({ mode: options.mode });
    if (options.reportJson) {
      writePhysicalDevicePreflightReport(report, options.reportJson);
    }
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printTextReport(report);
      if (options.reportJson) {
        console.log(`Report: ${report.artifactPath}`);
      }
    }
    return report.status === "ready" ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.url === `file://${argv[1]}`) {
  exit(run());
}
