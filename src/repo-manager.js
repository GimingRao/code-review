import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveRepoPath } from "./config.js";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

async function runGit(args, cwd) {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout, stderr };
}

export async function ensureRepoCheckout(config, event) {
  const repoKey = event.body.repo.key;
  const commitSha = extractCommitSha(event.body.commit.url);
  const repoPath = resolveRepoPath(config, repoKey);
  const gitDir = path.join(repoPath, ".git");

  if (!fs.existsSync(repoPath)) {
    throw new Error(`Local repository path does not exist for ${repoKey}: ${repoPath}`);
  }
  if (!fs.existsSync(gitDir)) {
    throw new Error(`Local repository path is not a git repo for ${repoKey}: ${repoPath}`);
  }

  logger.info("fetching repository", { repoKey, repoPath });
  await runGit(["fetch", "origin", "--tags", "--prune"], repoPath);

  logger.info("checking out commit", { repoKey, commitSha, repoPath });
  await runGit(["checkout", "--force", commitSha], repoPath);

  return { repoPath, commitSha };
}

function extractCommitSha(commitUrl) {
  const match = commitUrl.match(/\/commit\/([a-f0-9]{7,40})$/i);
  if (match) {
    return match[1];
  }
  throw new Error(`Unable to extract commit sha from URL: ${commitUrl}`);
}
