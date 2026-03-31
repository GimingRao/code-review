import { logger } from "./logger.js";

function buildMention(config, email, fallbackName) {
  const mappedId = config.feishu.idMap[email];
  if (!mappedId) {
    return fallbackName || email;
  }

  return `<at user_id="${mappedId}">${fallbackName || email}</at>`;
}

export async function notifyLowScore(config, event, review) {
  if (!config.feishu.webhookUrl) {
    logger.warn("feishu webhook is not configured, skipping notification");
    return;
  }

  const author = event.body.author;
  const mention = buildMention(config, author.email, author.name);
  const commit = event.body.commit;
  const lines = [
    `${mention} 这次提交的自动评审分数较低，请关注。`,
    `仓库: ${event.body.repo.key}`,
    `作者: ${author.name} <${author.email}>`,
    `评分: ${review.score}`,
    `总结: ${review.summary || "无"}`,
    `Commit: ${commit.url}`,
  ];

  if (review.mustFix.length > 0) {
    lines.push(`必须修复: ${review.mustFix.join("；")}`);
  }

  if (review.risks.length > 0) {
    lines.push(`风险: ${review.risks.join("；")}`);
  }

  const response = await fetch(config.feishu.webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      msg_type: "text",
      content: {
        text: lines.join("\n"),
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Feishu webhook failed: ${response.status} ${body}`);
  }

  logger.info("feishu notification sent", {
    repo: event.body.repo.key,
    author: author.email,
    score: review.score,
  });
}
