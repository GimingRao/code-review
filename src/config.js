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

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
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

export function loadConfig() {
  const configPath = path.resolve(process.cwd(), "config.yaml");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing config file: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = YAML.parse(raw) || {};
  const userMapFile = path.resolve(process.cwd(), parsed.feishu?.userMapFile || "./feishu-users.json");
  const userMap = loadJsonFile(userMapFile, {});

  const repoBaseDir = requireField(parsed, "repo.baseDir");
  fs.mkdirSync(repoBaseDir, { recursive: true });

  return {
    anthropicApiKey: parsed.anthropicApiKey || "",
    kafka: {
      brokers: parseStringArray(requireField(parsed, "kafka.brokers")),
      clientId: parsed.kafka?.clientId || "commit-review-bot",
      groupId: parsed.kafka?.groupId || "commit-review-bot",
      topic: parsed.kafka?.topic || "code-events",
      ssl: parseBoolean(parsed.kafka?.ssl, false),
      sasl: parseBoolean(parsed.kafka?.sasl?.enabled, false)
        ? {
            mechanism: parsed.kafka?.sasl?.mechanism || "plain",
            username: parsed.kafka?.sasl?.username || "",
            password: parsed.kafka?.sasl?.password || "",
          }
        : undefined,
    },
    repo: {
      baseDir: repoBaseDir,
      defaultRewrite: {
        from: parsed.repo?.defaultRewrite?.from || "",
        to: parsed.repo?.defaultRewrite?.to || "",
      },
      repos: parseObject(parsed.repo?.repos),
    },
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
  const repoConfig = config.repo.repos[repoKey];
  if (repoConfig?.localPath) {
    return repoConfig.localPath;
  }
  return path.join(config.repo.baseDir, repoKey);
}

export function resolveRepoConfig(config, repoKey) {
  return parseObject(config.repo.repos[repoKey]);
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
