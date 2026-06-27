export function validateManifestGitProvenance(
  git,
  { label, currentCommit = "", allowDirty = true, allowCommitMismatch = true },
  failures
) {
  const manifestCommit = stringValue(git?.commit);
  const current = stringValue(currentCommit);

  if (!manifestCommit) {
    failures.push(`${label} git commit is missing.`);
  } else if (!isFullGitObjectId(manifestCommit)) {
    failures.push(`${label} git commit must be a full 40- or 64-character hexadecimal object id.`);
  } else if (!allowCommitMismatch) {
    if (!current) {
      failures.push(`${label} current git commit could not be resolved.`);
    } else if (!isFullGitObjectId(current)) {
      failures.push(`${label} current git commit is not a full 40- or 64-character hexadecimal object id.`);
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

function isFullGitObjectId(value) {
  return /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(value);
}
