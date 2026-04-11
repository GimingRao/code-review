import { hasRepoPath, loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { startConsumer } from "./kafka-consumer.js";
import { ensureRepoCheckout } from "./repo-manager.js";
import { reviewCommitWithClaude } from "./claude-reviewer.js";

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

  const { repoPath } = await ensureRepoCheckout(config, event);
  const review = await reviewCommitWithClaude(config, event, repoPath);

  logger.info("review completed", {
    reviewId,
    repo: repoKey,
    author: event.body.author.email,
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
