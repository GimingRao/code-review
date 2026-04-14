import { hasRepoPath, loadConfig, resolveReviewWorkspaceRoot } from "./config.js";
import { logger } from "./logger.js";
import { startConsumer } from "./kafka-consumer.js";
import { cleanupReviewWorkspace, cleanupStaleReviewWorktrees, prepareReviewWorkspace } from "./repo-manager.js";
import { reviewCommitWithClaude } from "./claude-reviewer.js";

const activeWorkspaces = new Map();

function trackWorkspace(config, workspace) {
  activeWorkspaces.set(workspace.reviewId, {
    ...workspace,
    workspaceRoot: resolveReviewWorkspaceRoot(config),
  });
}

function untrackWorkspace(reviewId) {
  activeWorkspaces.delete(reviewId);
}

async function cleanupActiveWorkspaces(reason) {
  const workspaces = Array.from(activeWorkspaces.values());
  if (!workspaces.length) {
    return;
  }

  logger.warn("cleaning active review workspaces before shutdown", {
    reason,
    count: workspaces.length,
  });

  await Promise.allSettled(workspaces.map(async (workspace) => {
    try {
      await cleanupReviewWorkspace(workspace);
    } catch (error) {
      logger.error("failed to cleanup active workspace during shutdown", {
        reason,
        reviewId: workspace.reviewId,
        repo: workspace.repoKey,
        worktreePath: workspace.worktreePath,
        error: error instanceof Error ? error.stack : String(error),
      });
    } finally {
      activeWorkspaces.delete(workspace.reviewId);
    }
  }));
}

function registerShutdownHandlers() {
  const shutdown = async (signal) => {
    try {
      await cleanupActiveWorkspaces(signal);
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT").catch((error) => {
      logger.error("shutdown cleanup failed", {
        signal: "SIGINT",
        error: error instanceof Error ? error.stack : String(error),
      });
      process.exit(1);
    });
  });

  process.on("SIGTERM", () => {
    shutdown("SIGTERM").catch((error) => {
      logger.error("shutdown cleanup failed", {
        signal: "SIGTERM",
        error: error instanceof Error ? error.stack : String(error),
      });
      process.exit(1);
    });
  });
}

async function handleCommitEvent(config, event, metadata) {
  const reviewId = event?.body?.event_id || `${metadata.topic}-${metadata.partition}-${metadata.offset}`;
  const repoKey = event?.body?.repo?.key;
  logger.info("processing commit event", {
    reviewId,
    metadata,
    repo: repoKey,
    author: event?.body?.author?.email,
  });

  if (!hasRepoPath(config, repoKey)) {
    logger.warn("skipping event for unmapped repo", {
      reviewId,
      metadata,
      repo: repoKey,
    });
    return;
  }

  const workspace = await prepareReviewWorkspace(config, event, reviewId);
  trackWorkspace(config, workspace);

  try {
    const review = await reviewCommitWithClaude(config, event, workspace);

    logger.info("review completed", {
      reviewId,
      repo: repoKey,
      author: event.body.author.email,
      commitSha: workspace.commitSha,
      worktreePath: workspace.worktreePath,
      reportPath: review.reportPath,
      checklistSource: review.checklistSource,
      score: review.score,
      threshold: config.claude.minScore,
      shouldAlert: review.shouldAlert,
      report: {
        summary: review.summary,
        risks: review.risks,
        mustFix: review.mustFix,
        niceToHave: review.niceToHave,
        raw: review.raw,
      },
    });
  } finally {
    try {
      await cleanupReviewWorkspace({
        ...workspace,
        workspaceRoot: resolveReviewWorkspaceRoot(config),
      });
    } catch (cleanupError) {
      logger.error("failed to cleanup review workspace", {
        reviewId,
        repo: repoKey,
        commitSha: workspace.commitSha,
        worktreePath: workspace.worktreePath,
        error: cleanupError instanceof Error ? cleanupError.stack : String(cleanupError),
      });
    } finally {
      untrackWorkspace(reviewId);
    }
  }
}

async function main() {
  const config = loadConfig();

  process.on("unhandledRejection", (error) => {
    logger.error("unhandled rejection", {
      error: error instanceof Error ? error.stack : String(error),
    });
  });

  process.on("uncaughtException", (error) => {
    logger.error("uncaught exception", {
      error: error.stack,
    });
    process.exitCode = 1;
  });

  registerShutdownHandlers();
  await cleanupStaleReviewWorktrees(config);

  await startConsumer(config, async (event, metadata) => {
    try {
      await handleCommitEvent(config, event, metadata);
    } catch (error) {
      logger.error("failed to process event", {
        metadata,
        error: error instanceof Error ? error.stack : String(error),
      });
    }
  });
}

main().catch((error) => {
  logger.error("fatal error", {
    error: error instanceof Error ? error.stack : String(error),
  });
  process.exit(1);
});
