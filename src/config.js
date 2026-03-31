import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function parseNumber(value, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

function parseJsonMap(name) {
  const raw = process.env[name];
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("must be a JSON object");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Invalid JSON in ${name}: ${error.message}`);
  }
}

export function loadConfig() {
  const repoBaseDir = requireEnv("REPO_BASE_DIR");
  fs.mkdirSync(repoBaseDir, { recursive: true });

  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    kafka: {
      brokers: requireEnv("KAFKA_BROKERS").split(",").map((item) => item.trim()).filter(Boolean),
      clientId: process.env.KAFKA_CLIENT_ID || "commit-review-bot",
      groupId: process.env.KAFKA_GROUP_ID || "commit-review-bot",
      topic: process.env.KAFKA_TOPIC || "code-events",
      ssl: parseBoolean(process.env.KAFKA_SSL, false),
      sasl: process.env.KAFKA_USERNAME
        ? {
            mechanism: "plain",
            username: process.env.KAFKA_USERNAME,
            password: process.env.KAFKA_PASSWORD || "",
          }
        : undefined,
    },
    repo: {
      baseDir: repoBaseDir,
      pathMap: parseJsonMap("REPO_PATH_MAP_JSON"),
      rewriteFrom: process.env.REPO_URL_REWRITE_FROM || "",
      rewriteTo: process.env.REPO_URL_REWRITE_TO || "",
    },
    claude: {
      maxTurns: parseNumber(process.env.CLAUDE_MAX_TURNS, 8),
      minScore: parseNumber(process.env.CLAUDE_REVIEW_MIN_SCORE, 70),
      allowedTools: (process.env.CLAUDE_ALLOWED_TOOLS || "Skill,Read,Glob,Grep,Bash")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    },
    feishu: {
      webhookUrl: process.env.FEISHU_WEBHOOK_URL || "",
      idMap: parseJsonMap("FEISHU_USER_ID_MAP_JSON"),
      atIdType: process.env.FEISHU_AT_ID_TYPE || "user_id",
    },
  };
}

export function resolveRepoPath(config, repoKey) {
  const configuredPath = config.repo.pathMap[repoKey];
  if (configuredPath) {
    return configuredPath;
  }
  return path.join(config.repo.baseDir, repoKey);
}
