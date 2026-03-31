import { query } from "@anthropic-ai/claude-agent-sdk";
import { logger } from "./logger.js";

function buildPrompt(event) {
  const body = event.body;
  const diffText = (body.diffs || [])
    .map((item, index) => {
      return [
        `### Diff ${index + 1}`,
        `file_path: ${item.file_path}`,
        `old_path: ${item.old_path}`,
        `new_path: ${item.new_path}`,
        item.diff,
      ].join("\n");
    })
    .join("\n\n");

  return `
你现在是一个严格的代码评审代理。请在当前仓库目录中 review 指定 commit。

要求：
1. 优先使用当前项目内的 CLAUDE.md、.claude/skills、slash commands 等项目级能力。
2. 重点检查正确性、兼容性、回归风险、异常处理、可维护性和测试缺失。
3. 必要时可以读取当前仓库文件，结合 diff 上下文分析，而不是只看提交说明。
4. 不要修改任何代码。
5. 最终只输出一个 JSON 对象，不要输出 Markdown，不要输出代码块。

评分规则：
- score 范围 0-100，100 表示可直接合并
- 低于 70 视为需要群内提醒

JSON Schema:
{
  "score": 0,
  "summary": "一句话总结",
  "risks": ["风险1"],
  "must_fix": ["必须修复项"],
  "nice_to_have": ["建议优化项"],
  "should_alert": false
}

提交信息：
- repo: ${body.repo.key}
- author: ${body.author.name} <${body.author.email}>
- committed_at: ${body.commit.committed_at}
- commit_url: ${body.commit.url}
- message:
${body.commit.message}

diff 内容：
${diffText || "(no diff provided)"}
`.trim();
}

function extractJsonObject(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Claude response does not contain valid JSON");
  }
}

function collectTextFromMessage(message) {
  if (!message || !Array.isArray(message.content)) {
    return "";
  }
  return message.content
    .filter((block) => typeof block?.text === "string")
    .map((block) => block.text)
    .join("\n");
}

export async function reviewCommitWithClaude(config, event, repoPath) {
  const prompt = buildPrompt(event);
  const outputs = [];

  for await (const message of query({
    prompt,
    options: {
      cwd: repoPath,
      maxTurns: config.claude.maxTurns,
      allowedTools: config.claude.allowedTools,
      permissionMode: "dontAsk",
      settingSources: ["project"],
      systemPrompt:
        "You are a principal engineer performing commit review. Be skeptical, concrete, and concise.",
    },
  })) {
    const text = collectTextFromMessage(message);
    if (text) {
      outputs.push(text);
    }
  }

  const raw = outputs.join("\n").trim();
  logger.info("claude review finished", {
    repo: event.body.repo.key,
    author: event.body.author.email,
    preview: raw.slice(0, 500),
  });

  const parsed = extractJsonObject(raw);
  return {
    raw,
    score: Number(parsed.score ?? 0),
    summary: parsed.summary || "",
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    mustFix: Array.isArray(parsed.must_fix) ? parsed.must_fix : [],
    niceToHave: Array.isArray(parsed.nice_to_have) ? parsed.nice_to_have : [],
    shouldAlert:
      typeof parsed.should_alert === "boolean"
        ? parsed.should_alert
        : Number(parsed.score ?? 0) < config.claude.minScore,
  };
}
