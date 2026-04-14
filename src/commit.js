export function extractCommitSha(event) {
  const commit = event.body.commit || {};
  const commitId = commit.id || commit.hash || commit.sha;
  if (typeof commitId === "string" && commitId.trim()) {
    return commitId.trim();
  }

  const commitUrl = commit.url || "";
  const match = commitUrl.match(/\/commit\/([a-f0-9]{7,40})$/i);
  if (match) {
    return match[1];
  }

  throw new Error(`Unable to extract commit sha from event: ${JSON.stringify(commit)}`);
}
