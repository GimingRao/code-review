import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter } from "node:path";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { extractCommitSha } from "./commit.js";
import { hasRepoChecklist, resolveRepoChecklistPath } from "./config.js";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatReportFileName(date = new Date()) {
  return `CodeReview-${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}.md`;
}

function buildPrompt(event, checklist) {
  const body = event.body;
  const commitId = extractCommitSha(event);
  const repoKey = body.repo?.key || "unknown";
  const commitMessage = body.commit?.message?.trim() || "";
  const author = body.author?.email || body.author?.name || "unknown";

  return `
请严格使用 Skill：generic-code-review 完成单次提交审查。
你当前所在目录就是待审查的业务仓库，且仓库已经被检出到目标提交。
不要分析当前这个 Worker 工程本身，不要解释审查流程、工具调用、系统配置，也不要输出“我将如何审查”之类的过程说明。
如果无法基于当前仓库内容和目标提交形成结论，直接说明阻塞原因，不要编造结论。

审查范围：
- repo_key: ${repoKey}
- commit_id: ${commitId}
- author: ${author}
- commit_message: ${commitMessage || "(empty)"}

输出要求：
- 直接输出最终 Markdown 审查报告
- 先给出问题清单，按严重程度排序
- 每个问题必须包含：严重级别、文件路径、原因、影响
- 如果没有发现明确问题，明确写“未发现明确缺陷”，并补充剩余风险或测试缺口
- 不要输出与代码审查无关的背景介绍、流程介绍、运行机制说明、工具列表、环境配置说明

仓库专属 CheckList：
来源：${checklist.source}
${checklist.content}
`.trim();
}

function buildClaudeCliArgs(config, prompt) {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--model",
    "sonnet",
    "--permission-mode",
    "bypassPermissions",
    "--dangerously-skip-permissions",
    "--setting-sources",
    "user,project",
  ];

  if (config.claude.allowedTools.length > 0) {
    args.push("--allowedTools", config.claude.allowedTools.join(","));
  }

  args.push(
    "--append-system-prompt",
    "You are a staff-plus software architect executing a strict single-commit code review on the checked-out target repository. Be precise, evidence-driven, and boundary-aware. Output only the final Markdown review report in Chinese. Do not describe workflow, tool usage, or system setup.",
  );

  args.push(prompt);

  return args;
}

function buildClaudeEnv() {
  return {
    ...process.env,
    ANTHROPIC_AUTH_TOKEN: process.env.ZHIPU_API_KEY || "",
    ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic",
    API_TIMEOUT_MS: "3000000",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-4.5-air",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-4.7",
    ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-5.1",
  };
}

function resolveClaudeExecutable() {
  const pathValue = process.env.PATH || "";
  const pathEntries = pathValue.split(delimiter).filter(Boolean);
  const candidateNames = process.platform === "win32"
    ? ["claude.cmd", "claude.exe", "claude.bat", "claude"]
    : ["claude"];

  for (const entry of pathEntries) {
    for (const candidateName of candidateNames) {
      const candidatePath = join(entry, candidateName);
      if (existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return process.platform === "win32" ? "claude.cmd" : "claude";
}

function resolveClaudeCommand() {
  const executablePath = resolveClaudeExecutable();
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(executablePath)) {
    const cliPath = join(dirname(executablePath), "node_modules", "@anthropic-ai", "claude-code", "cli.js");
    if (existsSync(cliPath)) {
      return {
        file: process.execPath,
        argsPrefix: [cliPath],
        label: `${process.execPath} ${cliPath}`,
      };
    }
  }

  return {
    file: executablePath,
    argsPrefix: [],
    label: executablePath,
  };
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_.,:/=@+-]+$/.test(value)) {
    return value;
  }
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function parseClaudeCliResult(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Claude CLI returned non-JSON output: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (parsed?.type !== "result") {
    throw new Error("Claude CLI returned a non-result message");
  }

  if (parsed.is_error) {
    throw new Error(typeof parsed.result === "string" && parsed.result.trim()
      ? parsed.result.trim()
      : `Claude CLI failed: ${parsed.subtype || "unknown"}`);
  }

  if (typeof parsed.result !== "string" || !parsed.result.trim()) {
    throw new Error("Claude CLI returned empty report");
  }

  return parsed.result.trim();
}

async function executeClaudeCli(command, args, options) {
  if (process.platform === "win32" && command.file.toLowerCase().endsWith("node.exe")) {
    return execFileAsync(command.file, [...command.argsPrefix, ...args], options);
  }

  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command.file)) {
    const commandLine = [command.file, ...args].map(shellQuote).join(" ");
    return execFileAsync("cmd.exe", ["/d", "/s", "/c", commandLine], options);
  }

  return execFileAsync(command.file, [...command.argsPrefix, ...args], options);
}

async function generateReviewReport(config, prompt, workspace) {
  logger.info("starting Claude review", {
    repoPath: workspace.repoPath,
    worktreePath: workspace.worktreePath,
    commitSha: workspace.commitSha,
  });

  const args = buildClaudeCliArgs(config, prompt);
  const claudeCommand = resolveClaudeCommand();

  try {
    const { stdout, stderr } = await executeClaudeCli(claudeCommand, args, {
      cwd: workspace.worktreePath,
      env: buildClaudeEnv(),
      timeout: 3_000_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stderr?.trim()) {
      logger.info("Claude CLI stderr", {
        repoPath: workspace.repoPath,
        worktreePath: workspace.worktreePath,
        commitSha: workspace.commitSha,
        stderr: stderr.trim(),
      });
    }

    return parseClaudeCliResult(stdout);
  } catch (error) {
    logger.error("Claude CLI review execution failed", {
      repo: workspace.repoKey,
      repoPath: workspace.repoPath,
      worktreePath: workspace.worktreePath,
      commitSha: workspace.commitSha,
      claudeExecutable: claudeCommand.label,
      error: error instanceof Error ? error.stack : String(error),
    });
    throw error;
  }
}

function loadChecklist(config, event) {
  const repoKey = event.body.repo.key;
  if (!hasRepoChecklist(config, repoKey)) {
    return {
      source: "未配置仓库专属 CheckList.md",
      content: [
        "- 检查功能正确性、边界条件、异常处理和回归风险",
        "- 检查接口兼容性、数据一致性、幂等性和事务完整性",
        "- 检查日志、监控、错误提示、测试覆盖和可维护性",
      ].join("\n"),
    };
  }

  const checklistPath = resolveRepoChecklistPath(config, repoKey);
  if (!existsSync(checklistPath)) {
    throw new Error(`Configured checklist file does not exist for ${repoKey}: ${checklistPath}`);
  }

  const content = readFileSync(checklistPath, "utf8").trim();
  if (!content) {
    throw new Error(`Configured checklist file is empty for ${repoKey}: ${checklistPath}`);
  }

  return {
    source: checklistPath,
    content,
  };
}

export async function reviewCommitWithClaude(config, event, workspace) {
  const checklist = loadChecklist(config, event);
  const prompt = buildPrompt(event, checklist);
  const report = await generateReviewReport(config, prompt, workspace);

  const outDir = join(process.cwd(), "ai", "CodeReview", "Reports");
  mkdirSync(outDir, { recursive: true });

  const reportPath = join(outDir, formatReportFileName(new Date()));

  writeFileSync(reportPath, report, "utf-8");

  logger.info("review report saved", {
    repo: event.body.repo.key,
    author: event.body.author.email,
    repoPath: workspace.repoPath,
    worktreePath: workspace.worktreePath,
    commitSha: workspace.commitSha,
    reportPath,
    checklistSource: checklist.source,
  });

  return {
    raw: report,
    reportPath,
    checklistSource: checklist.source,
    summary: "",
    risks: [],
    mustFix: [],
    niceToHave: [],
    score: 0,
    shouldAlert: false,
  };
}
