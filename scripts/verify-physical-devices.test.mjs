import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { describe, expect, it, afterEach } from "vitest";
import {
  createPhysicalDevicePreflightReport,
  collectPhysicalDevicePreflightArtifactRecords,
  parseAndroidAdbDevices,
  parseAndroidGetprop,
  parseIosXctraceDevices,
  physicalDevicePreflightType,
  runPhysicalDevicePreflight,
  validatePhysicalDevicePreflightReport,
  writePhysicalDevicePreflightReport
} from "./verify-physical-devices.mjs";

const fixtureRoot = ".artifacts/verify-physical-devices-test";

describe("physical device preflight verifier", () => {
  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("accepts ready physical Android devices and rejects emulators or unauthorized devices", () => {
    const parsed = parseAndroidAdbDevices(`List of devices attached
R58M123456B device product:r0q model:SM_S901B device:r0q transport_id:4
emulator-5554 device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64xa transport_id:1
ZY224ABC unauthorized usb:338690048X product:payton model:moto_x4 device:payton
`);

    expect(parsed.devices).toHaveLength(1);
    expect(parsed.devices[0]).toMatchObject({
      state: "device",
      product: "r0q",
      model: "SM_S901B",
      device: "r0q"
    });
    expect(parsed.devices[0].idHash).toMatch(/^[a-f0-9]{12}$/);
    expect(parsed.devices[0].idHash).not.toContain("R58M123456B");
    expect(parsed.rejected).toHaveLength(2);
    expect(parsed.rejected.map((device) => device.reason)).toEqual([
      "emulator or generic Android system image",
      "adb state is unauthorized"
    ]);
  });

  it("parses Android runtime getprop output used for physical-device proof", () => {
    expect(
      parseAndroidGetprop(`[ro.kernel.qemu]: [0]
[ro.boot.qemu]: [0]
[ro.hardware]: [qcom]
`)
    ).toMatchObject({
      "ro.kernel.qemu": "0",
      "ro.boot.qemu": "0",
      "ro.hardware": "qcom"
    });
  });

  it("accepts ready physical iOS devices and rejects Simulators or unavailable devices", () => {
    const parsed = parseIosXctraceDevices(`== Devices ==
MacBook Pro (15.5) (00000000-0000-0000-0000-000000000000)
Macha iPhone (17.5.1) (00008110-001234560E91801E)
QA iPad (18.0) (00008101-000000000000001E) (unavailable)
== Simulators ==
iPhone 16 Pro (18.0) (B50D8051-8C22-4E18-A95B-C3AFB39F9451)
`);

    expect(parsed.devices).toHaveLength(1);
    expect(parsed.devices[0]).toMatchObject({
      family: "iPhone",
      osVersion: "17.5.1",
      state: ""
    });
    expect(JSON.stringify(parsed)).not.toContain("Macha iPhone");
    expect(parsed.devices[0].idHash).toMatch(/^[a-f0-9]{12}$/);
    expect(parsed.rejected).toHaveLength(2);
    expect(parsed.rejected.map((device) => device.reason)).toEqual(["unavailable", "iOS Simulator"]);
  });

  it("creates a ready all-platform report only when Android and iOS physical devices are present", () => {
    const report = createPhysicalDevicePreflightReport({
      androidAdbOutput: `List of devices attached
R58M123456B device product:r0q model:SM_S901B device:r0q transport_id:4
`,
      androidRuntimeProperties: {
        R58M123456B: `[ro.kernel.qemu]: [0]
[ro.boot.qemu]: [0]
[ro.hardware]: [qcom]
`
      },
      androidRuntimeCommands: {
        R58M123456B: { ok: true, tool: "adb", stdout: "", detail: "command succeeded" }
      },
      iosXctraceOutput: `== Devices ==
Macha iPhone (17.5.1) (00008110-001234560E91801E)
== Simulators ==
iPhone 16 Pro (18.0) (B50D8051-8C22-4E18-A95B-C3AFB39F9451)
`
    });

    expect(report.type).toBe(physicalDevicePreflightType);
    expect(report.status).toBe("ready");
    expect(report.host).toMatchObject({
      platform: expect.any(String),
      arch: expect.any(String),
      nodeVersion: expect.stringMatching(/^v/)
    });
    expect(report.toolEvidence).toMatchObject({
      android: {
        deviceList: {
          invocation: "adb devices -l",
          ok: true
        },
        version: {
          invocation: "adb version"
        }
      },
      ios: {
        deviceList: {
          invocation: "xcrun xctrace list devices",
          ok: true
        },
        version: {
          invocation: "xcrun xctrace version"
        }
      }
    });
    expect(report.checks).toEqual([
      {
        label: "Android physical device",
        status: "pass",
        detail: "1 connected physical Android device(s) ready."
      },
      {
        label: "iOS physical device",
        status: "pass",
        detail: "1 connected physical iOS device(s) ready."
      }
    ]);
  });

  it("blocks Android candidates when runtime qemu proof is missing or reports emulator hardware", () => {
    const missingProof = createPhysicalDevicePreflightReport({
      mode: "android",
      androidAdbOutput: `List of devices attached
R58M123456B device product:r0q model:SM_S901B device:r0q transport_id:4
`
    });

    expect(missingProof.status).toBe("blocked");
    expect(missingProof.platforms.android.rejected[0].reason).toBe("Android runtime property probe was not run.");

    const emulatorProof = createPhysicalDevicePreflightReport({
      mode: "android",
      androidAdbOutput: `List of devices attached
R58M123456B device product:r0q model:SM_S901B device:r0q transport_id:4
`,
      androidRuntimeProperties: {
        R58M123456B: `[ro.kernel.qemu]: [1]
[ro.hardware]: [ranchu]
`
      },
      androidRuntimeCommands: {
        R58M123456B: { ok: true, tool: "adb", stdout: "", detail: "command succeeded" }
      }
    });

    expect(emulatorProof.status).toBe("blocked");
    expect(emulatorProof.platforms.android.rejected[0].reason).toBe("Android runtime reports qemu/emulator mode");
  });

  it("blocks reports when only virtual or unavailable devices are detected", () => {
    const report = createPhysicalDevicePreflightReport({
      androidAdbOutput: `List of devices attached
emulator-5554 device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64xa transport_id:1
`,
      iosXctraceOutput: `== Devices ==
QA iPad (18.0) (00008101-000000000000001E) (unavailable)
== Simulators ==
iPhone 16 Pro (18.0) (B50D8051-8C22-4E18-A95B-C3AFB39F9451)
`
    });

    expect(report.status).toBe("blocked");
    expect(report.checks[0].detail).toContain("No connected physical Android device is ready.");
    expect(report.checks[0].detail).toContain("emulator or generic Android system image");
    expect(report.checks[1].detail).toContain("No connected physical iOS device is ready.");
    expect(report.checks[1].detail).toContain("unavailable");
  });

  it("writes report artifacts only to non-symlinked workspace-relative paths", () => {
    const report = createPhysicalDevicePreflightReport({
      mode: "android",
      androidAdbOutput: `List of devices attached
R58M123456B device product:r0q model:SM_S901B device:r0q transport_id:4
`,
      androidRuntimeProperties: {
        R58M123456B: `[ro.kernel.qemu]: [0]
[ro.hardware]: [qcom]
`
      },
      androidRuntimeCommands: {
        R58M123456B: { ok: true, tool: "adb", stdout: "", detail: "command succeeded" }
      }
    });
    const reportPath = `${fixtureRoot}/physical-device-preflight.json`;

    expect(writePhysicalDevicePreflightReport(report, reportPath)).toBe(reportPath);
    expect(JSON.parse(readFileSync(reportPath, "utf8")).artifactPath).toBe(reportPath);

    const outsidePath = `${fixtureRoot}/outside.json`;
    const symlinkPath = `${fixtureRoot}/link.json`;
    writeFileSync(outsidePath, "{}");
    symlinkSync("outside.json", symlinkPath);

    expect(() => writePhysicalDevicePreflightReport(report, symlinkPath)).toThrow(
      `Physical device preflight report must not be a symbolic link: ${symlinkPath}`
    );

    const outsideDir = `${fixtureRoot}/outside-dir`;
    const linkedDir = `${fixtureRoot}/linked-dir`;
    mkdirSync(outsideDir, { recursive: true });
    symlinkSync("outside-dir", linkedDir, "dir");
    expect(() => writePhysicalDevicePreflightReport(report, `${linkedDir}/report.json`)).toThrow(
      `Physical device preflight report path parent must not be a symbolic link: ${linkedDir}`
    );
  });

  it("validates and collects commercial physical-device preflight artifacts", () => {
    const report = createPhysicalDevicePreflightReport({
      androidAdbOutput: `List of devices attached
R58M123456B device product:r0q model:SM_S901B device:r0q transport_id:4
`,
      androidRuntimeProperties: {
        R58M123456B: `[ro.kernel.qemu]: [0]
[ro.hardware]: [qcom]
`
      },
      androidRuntimeCommands: {
        R58M123456B: { ok: true, tool: "adb", stdout: "", detail: "command succeeded" }
      },
      iosXctraceOutput: `== Devices ==
Release iPhone (17.5.1) (00008110-001234560E91801E)
`
    });
    const reportPath = `${fixtureRoot}/physical-device-preflight.json`;
    writePhysicalDevicePreflightReport(report, reportPath);

    expect(
      validatePhysicalDevicePreflightReport(report, {
        reportPath,
        currentCommit: report.git.commit,
        allowDirty: true
      })
    ).toEqual([]);
    expect(collectPhysicalDevicePreflightArtifactRecords({ reportPath })).toEqual([
      expect.objectContaining({
        group: "physical-device-preflight",
        path: reportPath,
        bytes: expect.any(Number),
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    ]);
  });

  it("records sanitized host and tool-version evidence when run through device tools", () => {
    const report = runPhysicalDevicePreflight({
      hostPlatform: "darwin",
      commandRunner: (command, args) => {
        const invocation = [command, ...args].join(" ");
        if (invocation === "adb version") {
          return {
            ok: true,
            tool: "adb",
            stdout:
              "Android Debug Bridge version 1.0.41\nVersion 37.0.0-14910828\nInstalled as /Users/macha/Library/Android/sdk/platform-tools/adb\n",
            detail: "command succeeded"
          };
        }
        if (invocation === "adb devices -l") {
          return {
            ok: true,
            tool: "adb",
            stdout: "List of devices attached\nR58M123456B device product:r0q model:SM_S901B device:r0q transport_id:4\n",
            detail: "command succeeded"
          };
        }
        if (invocation === "adb -s R58M123456B shell getprop") {
          return {
            ok: true,
            tool: "adb",
            stdout: "[ro.kernel.qemu]: [0]\n[ro.boot.qemu]: [0]\n[ro.hardware]: [qcom]\n",
            detail: "command succeeded"
          };
        }
        if (invocation === "xcrun xctrace list devices") {
          return {
            ok: true,
            tool: "xcrun",
            stdout: "== Devices ==\nRelease iPhone (17.5.1) (00008110-001234560E91801E)\n",
            detail: "command succeeded"
          };
        }
        if (invocation === "xcrun xctrace version") {
          return {
            ok: true,
            tool: "xcrun",
            stdout: "xctrace version 16.0 (17F42)\n",
            detail: "command succeeded"
          };
        }
        return { ok: false, tool: command, stdout: "", detail: `unexpected ${invocation}` };
      }
    });

    expect(report.status).toBe("ready");
    expect(report.toolEvidence.android.version).toMatchObject({
      ok: true,
      version: "Android Debug Bridge version 1.0.41 / Version 37.0.0-14910828"
    });
    expect(JSON.stringify(report.toolEvidence.android.version)).not.toContain("/Users/macha");
    expect(report.toolEvidence.ios.version).toMatchObject({
      ok: true,
      version: "xctrace version 16.0 (17F42)"
    });
  });

  it("rejects commercial preflight reports without host and tool evidence", () => {
    const report = createPhysicalDevicePreflightReport({
      androidAdbOutput: `List of devices attached
R58M123456B device product:r0q model:SM_S901B device:r0q transport_id:4
`,
      androidRuntimeProperties: {
        R58M123456B: `[ro.kernel.qemu]: [0]
[ro.boot.qemu]: [0]
[ro.hardware]: [qcom]
`
      },
      androidRuntimeCommands: {
        R58M123456B: { ok: true, tool: "adb", stdout: "", detail: "command succeeded" }
      },
      iosXctraceOutput: `== Devices ==
Release iPhone (17.5.1) (00008110-001234560E91801E)
`
    });
    delete report.host;
    delete report.toolEvidence;

    expect(validatePhysicalDevicePreflightReport(report, { currentCommit: report.git.commit, allowDirty: true })).toEqual(
      expect.arrayContaining([
        "Physical device preflight host evidence is missing.",
        "Physical device preflight tool evidence is missing."
      ])
    );
  });
});
