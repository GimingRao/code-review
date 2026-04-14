import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

function requireField(object, fieldPath) {
  const value = fieldPath.split(".").reduce((current, key) => current?.[key], object);
  if (!value) {
    throw new Error(`Missing required config field: ${fieldPath}`);
  }
  return value;
}

function parseNumber(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

function parseObject(value, fallback = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  return value;
}

function parseStringArray(value, fallback = []) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function parseRepoConfig(repoConfig) {
  const localPaths = parseObject(repoConfig?.localPaths);
  const checklistPaths = parseObject(repoConfig?.checklistPaths);
  const reviewWorkspaceRoot = typeof repoConfig?.reviewWorkspaceRoot === "string"
    ? repoConfig.reviewWorkspaceRoot.trim()
    : "";

  const repoKeys = new Set([
    ...Object.keys(localPaths),
    ...Object.keys(checklistPaths),
  ]);

  const repositories = {};
  for (const repoKey of repoKeys) {
    const localPath = typeof localPaths[repoKey] === "string"
      ? localPaths[repoKey].trim()
      : "";
    const checklistPath = typeof checklistPaths[repoKey] === "string"
      ? checklistPaths[repoKey].trim()
      : "";

    repositories[repoKey] = {
      localPath,
      checklistPath: checklistPath
        ? path.resolve(process.cwd(), checklistPath)
        : "",
    };
  }

  return {
    localPaths,
    checklistPaths,
    reviewWorkspaceRoot: reviewWorkspaceRoot
      ? path.resolve(process.cwd(), reviewWorkspaceRoot)
      : path.resolve(process.cwd(), "ai", "CodeReview", "Worktrees"),
    repositories,
  };
}

export function loadConfig() {
  const configPath = path.resolve(process.cwd(), "config.yaml");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing config file: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = YAML.parse(raw) || {};
  const userMapFile = path.resolve(process.cwd(), parsed.feishu?.userMapFile || "./feishu-users.json");
  const userMap = loadJsonFile(userMapFile, {});
  const repo = parseRepoConfig(parsed.repo);

  return {
    anthropicApiKey: parsed.anthropicApiKey || "",
    kafka: {
      brokers: parseStringArray(requireField(parsed, "kafka.brokers")),
      clientId: parsed.kafka?.clientId || "commit-review-bot",
      groupId: parsed.kafka?.groupId || "commit-review-bot",
      topic: parsed.kafka?.topic || "code-events",
    },
    repo,
    claude: {
      maxTurns: parseNumber(parsed.claude?.maxTurns, 8),
      minScore: parseNumber(parsed.claude?.minScore, 70),
      allowedTools: parseStringArray(parsed.claude?.allowedTools, ["Skill", "Read", "Glob", "Grep", "Bash"]),
    },
    feishu: {
      webhookUrl: parsed.feishu?.webhookUrl || "",
      atIdType: parsed.feishu?.atIdType || "user_id",
      userMapFile,
      userMap: parseObject(userMap),
    },
  };
}

export function resolveRepoPath(config, repoKey) {
  const repoPath = config.repo.repositories[repoKey]?.localPath;
  if (typeof repoPath === "string" && repoPath.trim()) {
    return repoPath;
  }
  throw new Error(`Missing local repo path mapping for repo: ${repoKey}`);
}

export function hasRepoPath(config, repoKey) {
  const repoPath = config.repo.repositories[repoKey]?.localPath;
  return typeof repoPath === "string" && !!repoPath.trim();
}

export function resolveRepoChecklistPath(config, repoKey) {
  const checklistPath = config.repo.repositories[repoKey]?.checklistPath;
  if (typeof checklistPath === "string" && checklistPath.trim()) {
    return checklistPath;
  }
  throw new Error(`Missing checklist path mapping for repo: ${repoKey}`);
}

export function hasRepoChecklist(config, repoKey) {
  const checklistPath = config.repo.repositories[repoKey]?.checklistPath;
  return typeof checklistPath === "string" && !!checklistPath.trim();
}

export function resolveReviewWorkspaceRoot(config) {
  return config.repo.reviewWorkspaceRoot;
}

function loadJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON file ${filePath}: ${error.message}`);
  }
}
