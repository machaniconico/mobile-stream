import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  androidNativeDebugArtifactPath,
  androidNativeVerificationArtifactPath,
  collectReleaseSourceFiles,
  iosNativeVerificationArtifactPath,
  releaseConfigArtifactPaths,
  requiredReleaseArtifactGroups,
  requiredReleaseGateLabels
} from "./release-artifact-policy.mjs";

const fixtureRoot = ".artifacts/release-artifact-policy-test";

describe("release artifact policy source collection", () => {
  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("collects regular release source files by extension", () => {
    mkdirSync(`${fixtureRoot}/source/nested`, { recursive: true });
    writeFileSync(`${fixtureRoot}/source/Main.kt`, "class Main\n");
    writeFileSync(`${fixtureRoot}/source/nested/Bridge.java`, "class Bridge {}\n");
    writeFileSync(`${fixtureRoot}/source/nested/readme.txt`, "ignored\n");

    expect(collectReleaseSourceFiles(`${fixtureRoot}/source`, [".kt", ".java"])).toEqual([
      `${fixtureRoot}/source/Main.kt`,
      `${fixtureRoot}/source/nested/Bridge.java`
    ]);
  });

  it("requires the existing artifact path safety gate in saved release reports", () => {
    expect(requiredReleaseGateLabels).toContain("Verify existing release artifact path safety");
  });

  it("requires native build gates, artifact groups, and verifier source evidence", () => {
    expect(requiredReleaseGateLabels).toContain("Verify source and bundle secret scan");
    expect(requiredReleaseGateLabels).toContain("Build Android native debug app");
    expect(requiredReleaseGateLabels).toContain("Build iOS native simulator app");
    expect(requiredReleaseArtifactGroups).toEqual(expect.arrayContaining(["android", "ios"]));
    expect(androidNativeDebugArtifactPath).toBe("android/app/build/outputs/apk/debug/app-debug.apk");
    expect(androidNativeVerificationArtifactPath).toBe(".artifacts/android-native-verification.json");
    expect(iosNativeVerificationArtifactPath).toBe(".artifacts/ios-native-verification.json");
    expect(releaseConfigArtifactPaths).toContain("scripts/verify-ios-native.mjs");
    expect(releaseConfigArtifactPaths).toContain("scripts/verify-source-secrets.mjs");
  });

  it("rejects symlinked release source directories", () => {
    const realSourceDir = `${fixtureRoot}/real-source`;
    const linkSourceDir = `${fixtureRoot}/source-link`;
    mkdirSync(realSourceDir, { recursive: true });
    writeFileSync(`${realSourceDir}/Main.kt`, "class Main\n");
    symlinkSync(resolve(realSourceDir), linkSourceDir, "dir");

    expect(() => collectReleaseSourceFiles(linkSourceDir, [".kt"])).toThrow(
      `Release source directory must not be a symbolic link: ${linkSourceDir}`
    );
  });

  it("rejects symlinked release source files before including linked targets", () => {
    const outsideSource = `${fixtureRoot}/outside.kt`;
    const sourceDir = `${fixtureRoot}/source`;
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(outsideSource, "class Outside\n");
    symlinkSync(resolve(outsideSource), `${sourceDir}/Main.kt`);

    expect(() => collectReleaseSourceFiles(sourceDir, [".kt"])).toThrow(
      `Release source path must not be a symbolic link: ${sourceDir}/Main.kt`
    );
  });

  it("rejects dangling symlinked release source files", () => {
    const missingSource = `${fixtureRoot}/missing.kt`;
    const sourceDir = `${fixtureRoot}/source`;
    mkdirSync(sourceDir, { recursive: true });
    symlinkSync(resolve(missingSource), `${sourceDir}/Main.kt`);

    expect(() => collectReleaseSourceFiles(sourceDir, [".kt"])).toThrow(
      `Release source path must not be a symbolic link: ${sourceDir}/Main.kt`
    );
  });

  it("rejects release source paths under symlinked workspace parents", () => {
    const realParent = `${fixtureRoot}/real-parent`;
    const linkParent = `${fixtureRoot}/link-parent`;
    mkdirSync(`${realParent}/source`, { recursive: true });
    writeFileSync(`${realParent}/source/Main.kt`, "class Main\n");
    symlinkSync(resolve(realParent), linkParent, "dir");

    expect(() => collectReleaseSourceFiles(`${linkParent}/source`, [".kt"])).toThrow(
      `Release source directory path parent must not be a symbolic link: ${linkParent}`
    );
  });
});
