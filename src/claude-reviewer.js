import { unstable_v2_prompt } from "@anthropic-ai/claude-agent-sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
5. 输出一份 Markdown 格式的评审报告，结构如下：

# Code Review Report

## 提交信息
（repo / author / committed_at / commit_url / message）

## 概述
一句话总结本次提交的变更内容和影响范围。

## 风险项
逐一列出潜在风险，每条包含：
- 风险描述
- 影响范围
- 建议处理方式

## 必须修复
列出阻断性或高优先级问题。

## 建议优化
列出非阻断性的改进建议。

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

function buildClaudeOptions(config, repoPath) {
  return {
    cwd: repoPath,
    env: {
      ...process.env,
      ANTHROPIC_AUTH_TOKEN: process.env.ZHIPU_API_KEY || "",
      ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic",
      API_TIMEOUT_MS: "3000000",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-4.5-air",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-4.7",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-5.1",
    },
    maxTurns: config.claude.maxTurns,
    allowedTools: config.claude.allowedTools,
    permissionMode: "dontAsk",
    settingSources: ["project"],
    systemPrompt:
      "You are a principal engineer performing commit review. Be skeptical, concrete, and concise. Output a Markdown report.",
  };
}

async function generateReviewReport(config, prompt, repoPath) {
  const result = await unstable_v2_prompt(prompt, buildClaudeOptions(config, repoPath));
  if (result?.type !== "result") {
    throw new Error("Claude SDK returned a non-result message");
  }

  if (result.subtype !== "success") {
    const details = Array.isArray(result.errors) && result.errors.length > 0
      ? result.errors.join(" | ")
      : "unknown Claude execution error";
    throw new Error(`Claude review failed: ${result.subtype} - ${details}`);
  }

  if (typeof result.result !== "string" || !result.result.trim()) {
    throw new Error("Claude review returned empty report");
  }

  return result.result.trim();
}

export async function reviewCommitWithClaude(config, event, repoPath) {
  const prompt = buildPrompt(event);
  const report = await generateReviewReport(config, prompt, repoPath);

  const outDir = join(process.cwd(), "out");
  mkdirSync(outDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const repoSlug = (event.body.repo.key || "unknown").replace(/[\/\\]/g, "_");
  const reportPath = join(outDir, `${timestamp}-${repoSlug}.md`);

  writeFileSync(reportPath, report, "utf-8");

  logger.info("review report saved", {
    repo: event.body.repo.key,
    author: event.body.author.email,
    reportPath,
  });

  return {
    raw: report,
    reportPath,
    summary: "",
    risks: [],
    mustFix: [],
    niceToHave: [],
    score: 0,
    shouldAlert: false,
  };
}
