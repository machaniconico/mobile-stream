import { describe, expect, it } from "vitest";
import { validateManifestGitProvenance } from "./release-git-provenance.mjs";

const commitA = "a".repeat(40);
const commitB = "b".repeat(40);

describe("release git provenance validation", () => {
  it("requires manifest commit and dirty-state provenance even when development mismatch flags are enabled", () => {
    const failures = [];

    validateManifestGitProvenance(
      { commit: "", dirty: undefined },
      {
        label: "Release manifest",
        currentCommit: "",
        allowDirty: true,
        allowCommitMismatch: true
      },
      failures
    );

    expect(failures).toEqual(["Release manifest git commit is missing.", "Release manifest git dirty state is missing."]);
  });

  it("rejects dirty commercial manifests unless dirty evidence is explicitly allowed", () => {
    const failures = [];

    validateManifestGitProvenance(
      { commit: commitA, dirty: true },
      {
        label: "Release manifest",
        currentCommit: commitA,
        allowDirty: false,
        allowCommitMismatch: false
      },
      failures
    );

    expect(failures).toEqual(["Release manifest was generated from a dirty worktree."]);
  });

  it("rejects commit mismatch unless mismatch evidence is explicitly allowed", () => {
    const strictFailures = [];
    const allowedFailures = [];

    validateManifestGitProvenance(
      { commit: commitA, dirty: false },
      {
        label: "Release manifest",
        currentCommit: commitB,
        allowDirty: false,
        allowCommitMismatch: false
      },
      strictFailures
    );
    validateManifestGitProvenance(
      { commit: commitA, dirty: false },
      {
        label: "Release manifest",
        currentCommit: commitB,
        allowDirty: false,
        allowCommitMismatch: true
      },
      allowedFailures
    );

    expect(strictFailures).toEqual([`Release manifest commit ${commitA} does not match current commit ${commitB}.`]);
    expect(allowedFailures).toEqual([]);
  });

  it("rejects abbreviated or placeholder commit ids", () => {
    const failures = [];

    validateManifestGitProvenance(
      { commit: "abc123", dirty: false },
      {
        label: "Release manifest",
        currentCommit: "",
        allowDirty: true,
        allowCommitMismatch: true
      },
      failures
    );

    expect(failures).toEqual(["Release manifest git commit must be a full 40- or 64-character hexadecimal object id."]);
  });
});
