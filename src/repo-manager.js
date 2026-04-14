import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extractCommitSha } from "./commit.js";
import { resolveRepoPath, resolveReviewWorkspaceRoot } from "./config.js";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

function sanitizePathSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function isPathInside(parentPath, targetPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(targetPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function runGit(args, cwd) {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout, stderr };
}

async function resolveHeadCommit(cwd) {
  const { stdout } = await runGit(["rev-parse", "HEAD"], cwd);
  return stdout.trim();
}

async function listGitWorktrees(repoPath) {
  const { stdout } = await runGit(["worktree", "list", "--porcelain"], repoPath);
  const entries = [];
  let current = null;

  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) {
      if (current?.path) {
        entries.push(current);
      }
      current = null;
      continue;
    }

    if (line.startsWith("worktree ")) {
      if (current?.path) {
        entries.push(current);
      }
      current = { path: line.slice("worktree ".length).trim() };
      continue;
    }

    if (!current) {
      continue;
    }

    const separatorIndex = line.indexOf(" ");
    if (separatorIndex === -1) {
      current[line] = true;
      continue;
    }

    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1).trim();
    current[key] = value;
  }

  if (current?.path) {
    entries.push(current);
  }

  return entries;
}

async function isWorktreeRegistered(repoPath, worktreePath) {
  const worktrees = await listGitWorktrees(repoPath);
  return worktrees.some((entry) => path.resolve(entry.path) === path.resolve(worktreePath));
}

function buildWorktreePath(config, repoKey, commitSha, reviewId) {
  const workspaceRoot = resolveReviewWorkspaceRoot(config);
  const repoSegment = sanitizePathSegment(repoKey);
  const commitSegment = sanitizePathSegment(commitSha.slice(0, 12));
  const reviewSegment = sanitizePathSegment(reviewId);
  return path.join(workspaceRoot, `${repoSegment}-${commitSegment}-${reviewSegment}`);
}

export async function prepareReviewWorkspace(config, event, reviewId) {
  const repoKey = event.body.repo.key;
  const commitSha = extractCommitSha(event);
  const repoPath = resolveRepoPath(config, repoKey);
  const gitDir = path.join(repoPath, ".git");
  const worktreePath = buildWorktreePath(config, repoKey, commitSha, reviewId);
  const workspace = {
    repoKey,
    repoPath,
    commitSha,
    reviewId,
    worktreePath,
    workspaceRoot: resolveReviewWorkspaceRoot(config),
  };
  let worktreeCreated = false;

  if (!fs.existsSync(repoPath)) {
    throw new Error(`Local repository path does not exist for ${repoKey}: ${repoPath}`);
  }
  if (!fs.existsSync(gitDir)) {
    throw new Error(`Local repository path is not a git repo for ${repoKey}: ${repoPath}`);
  }

  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

  try {
    logger.info("fetching repository", { repoKey, repoPath, commitSha });
    await runGit(["fetch", "origin", "--tags", "--prune"], repoPath);
    await runGit(["rev-parse", "--verify", `${commitSha}^{commit}`], repoPath);

    logger.info("creating review worktree", {
      repoKey,
      repoPath,
      commitSha,
      worktreePath,
      reviewId,
    });
    await runGit(["worktree", "add", "--detach", worktreePath, commitSha], repoPath);
    worktreeCreated = true;

    const headCommit = await resolveHeadCommit(worktreePath);
    if (headCommit !== commitSha) {
      throw new Error(`Review worktree HEAD ${headCommit} does not match target commit ${commitSha}`);
    }

    return workspace;
  } catch (error) {
    if (worktreeCreated) {
      try {
        await cleanupReviewWorkspace(workspace);
      } catch (cleanupError) {
        logger.error("failed to rollback review worktree after prepare error", {
          repoKey,
          repoPath,
          commitSha,
          worktreePath,
          reviewId,
          error: cleanupError instanceof Error ? cleanupError.stack : String(cleanupError),
        });
      }
    }
    throw error;
  }
}

export async function cleanupReviewWorkspace(workspace) {
  if (!workspace?.repoPath || !workspace?.worktreePath) {
    return;
  }

  const worktreePath = path.resolve(workspace.worktreePath);
  const repoPath = path.resolve(workspace.repoPath);
  const workspaceRoot = workspace.workspaceRoot ? path.resolve(workspace.workspaceRoot) : null;
  const pathExists = fs.existsSync(worktreePath);
  const registered = await isWorktreeRegistered(repoPath, worktreePath);

  if (!pathExists && !registered) {
    return;
  }

  logger.info("cleaning review worktree", {
    repoKey: workspace.repoKey,
    repoPath,
    worktreePath,
    commitSha: workspace.commitSha,
    reviewId: workspace.reviewId,
    registered,
    pathExists,
  });

  let removeError = null;
  if (registered || pathExists) {
    try {
      await runGit(["worktree", "remove", "--force", worktreePath], repoPath);
    } catch (error) {
      removeError = error;
    }
  }

  await runGit(["worktree", "prune"], repoPath);

  const stillRegistered = await isWorktreeRegistered(repoPath, worktreePath);
  const stillExists = fs.existsSync(worktreePath);

  if (stillExists && !stillRegistered && workspaceRoot && isPathInside(workspaceRoot, worktreePath)) {
    fs.rmSync(worktreePath, { recursive: true, force: true });
  }

  await runGit(["worktree", "prune"], repoPath);

  const finalRegistered = await isWorktreeRegistered(repoPath, worktreePath);
  const finalExists = fs.existsSync(worktreePath);

  if (removeError || finalRegistered || finalExists) {
    const reasons = [];
    if (removeError) {
      reasons.push(removeError instanceof Error ? removeError.stack || removeError.message : String(removeError));
    }
    if (finalRegistered) {
      reasons.push(`worktree is still registered: ${worktreePath}`);
    }
    if (finalExists) {
      reasons.push(`worktree path still exists: ${worktreePath}`);
    }
    throw new Error(reasons.join("; "));
  }
}

export async function cleanupStaleReviewWorktrees(config) {
  const workspaceRoot = resolveReviewWorkspaceRoot(config);
  const repoEntries = Object.entries(config.repo.repositories || {})
    .map(([repoKey, repoConfig]) => ({
      repoKey,
      repoPath: repoConfig?.localPath,
    }))
    .filter((entry) => typeof entry.repoPath === "string" && entry.repoPath.trim());

  const registeredWorkspacePaths = new Set();

  for (const { repoPath } of repoEntries) {
    if (!fs.existsSync(repoPath)) {
      continue;
    }

    try {
      await runGit(["worktree", "prune"], repoPath);
      const worktrees = await listGitWorktrees(repoPath);
      for (const entry of worktrees) {
        if (isPathInside(workspaceRoot, entry.path)) {
          registeredWorkspacePaths.add(path.resolve(entry.path));
        }
      }
    } catch (error) {
      logger.error("failed to inspect repo worktrees during startup cleanup", {
        repoPath,
        error: error instanceof Error ? error.stack : String(error),
      });
    }
  }

  for (const { repoKey, repoPath } of repoEntries) {
    if (!fs.existsSync(repoPath)) {
      continue;
    }

    let worktrees = [];
    try {
      worktrees = await listGitWorktrees(repoPath);
    } catch (error) {
      logger.error("failed to list repo worktrees during startup cleanup", {
        repoKey,
        repoPath,
        error: error instanceof Error ? error.stack : String(error),
      });
      continue;
    }

    for (const worktree of worktrees) {
      if (!isPathInside(workspaceRoot, worktree.path)) {
        continue;
      }

      const workspace = {
        repoKey,
        repoPath,
        worktreePath: worktree.path,
        workspaceRoot,
      };

      try {
        await cleanupReviewWorkspace(workspace);
        logger.info("removed stale review worktree during startup cleanup", {
          repoKey,
          repoPath,
          worktreePath: worktree.path,
        });
      } catch (error) {
        logger.error("failed to remove stale review worktree during startup cleanup", {
          repoKey,
          repoPath,
          worktreePath: worktree.path,
          error: error instanceof Error ? error.stack : String(error),
        });
      }
    }
  }

  if (!fs.existsSync(workspaceRoot)) {
    return;
  }

  for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryPath = path.resolve(workspaceRoot, entry.name);
    if (registeredWorkspacePaths.has(entryPath)) {
      continue;
    }

    if (!isPathInside(workspaceRoot, entryPath)) {
      continue;
    }

    try {
      fs.rmSync(entryPath, { recursive: true, force: true });
      logger.info("removed orphaned review workspace directory", {
        worktreePath: entryPath,
      });
    } catch (error) {
      logger.error("failed to remove orphaned review workspace directory", {
        worktreePath: entryPath,
        error: error instanceof Error ? error.stack : String(error),
      });
    }
  }
}

export { runGit, listGitWorktrees };
