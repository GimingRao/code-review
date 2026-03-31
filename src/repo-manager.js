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

function rewriteRepoUrl(config, repoUrl) {
  if (config.repo.rewriteFrom && config.repo.rewriteTo) {
    return repoUrl.replace(config.repo.rewriteFrom, config.repo.rewriteTo);
  }
  return repoUrl;
}

export async function ensureRepoCheckout(config, event) {
  const repoKey = event.body.repo.key;
  const repoUrl = rewriteRepoUrl(config, event.body.repo.url);
  const commitSha = extractCommitSha(event.body.commit.url);
  const repoPath = resolveRepoPath(config, repoKey);
  const repoParent = path.dirname(repoPath);

  fs.mkdirSync(repoParent, { recursive: true });

  if (!fs.existsSync(path.join(repoPath, ".git"))) {
    logger.info("cloning repository", { repoKey, repoPath, repoUrl });
    await runGit(["clone", repoUrl, repoPath], config.repo.baseDir);
  } else {
    logger.info("fetching repository", { repoKey, repoPath });
    await runGit(["fetch", "--all", "--tags", "--prune"], repoPath);
  }

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
