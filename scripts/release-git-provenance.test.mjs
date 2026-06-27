import { describe, expect, it } from "vitest";
import { validateManifestGitProvenance } from "./release-git-provenance.mjs";

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
      { commit: "abc123", dirty: true },
      {
        label: "Release manifest",
        currentCommit: "abc123",
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
      { commit: "abc123", dirty: false },
      {
        label: "Release manifest",
        currentCommit: "def456",
        allowDirty: false,
        allowCommitMismatch: false
      },
      strictFailures
    );
    validateManifestGitProvenance(
      { commit: "abc123", dirty: false },
      {
        label: "Release manifest",
        currentCommit: "def456",
        allowDirty: false,
        allowCommitMismatch: true
      },
      allowedFailures
    );

    expect(strictFailures).toEqual(["Release manifest commit abc123 does not match current commit def456."]);
    expect(allowedFailures).toEqual([]);
  });
});
