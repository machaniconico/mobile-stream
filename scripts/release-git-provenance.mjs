export function validateManifestGitProvenance(
  git,
  { label, currentCommit = "", allowDirty = true, allowCommitMismatch = true },
  failures
) {
  const manifestCommit = stringValue(git?.commit);
  const current = stringValue(currentCommit);

  if (!manifestCommit) {
    failures.push(`${label} git commit is missing.`);
  } else if (!allowCommitMismatch) {
    if (!current) {
      failures.push(`${label} current git commit could not be resolved.`);
    } else if (current !== manifestCommit) {
      failures.push(`${label} commit ${manifestCommit} does not match current commit ${current}.`);
    }
  }

  if (git?.dirty !== true && git?.dirty !== false) {
    failures.push(`${label} git dirty state is missing.`);
  } else if (!allowDirty && git.dirty === true) {
    failures.push(`${label} was generated from a dirty worktree.`);
  }
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}
