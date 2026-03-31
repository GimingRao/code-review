import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { startConsumer } from "./kafka-consumer.js";
import { ensureRepoCheckout } from "./repo-manager.js";
import { reviewCommitWithClaude } from "./claude-reviewer.js";
import { notifyLowScore } from "./feishu.js";

async function handleCommitEvent(config, event, metadata) {
  const reviewId = event?.body?.event_id || `${metadata.topic}-${metadata.partition}-${metadata.offset}`;
  logger.info("processing commit event", {
    reviewId,
    metadata,
    repo: event?.body?.repo?.key,
    author: event?.body?.author?.email,
  });

  const { repoPath } = await ensureRepoCheckout(config, event);
  const review = await reviewCommitWithClaude(config, event, repoPath);

  logger.info("review completed", {
    reviewId,
    repo: event.body.repo.key,
    author: event.body.author.email,
    score: review.score,
    threshold: config.claude.minScore,
    shouldAlert: review.shouldAlert,
  });

  if (review.shouldAlert || review.score < config.claude.minScore) {
    await notifyLowScore(config, event, review);
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
