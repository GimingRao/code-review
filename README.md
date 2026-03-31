# Code Review Worker

一个基于 Kafka 的提交评审脚本：

1. 消费 `code-events` 主题中的 `git.commit` 事件
2. 拉取或更新对应仓库，并 checkout 到指定 commit
3. 调用 Claude Agent SDK，让它在仓库上下文中结合项目内 `CLAUDE.md` / `.claude/skills` 做 review
4. 解析评分
5. 评分低于阈值时，通过飞书机器人在群里提醒对应提交人

## 设计说明

- Claude 评审运行在目标代码仓库目录下
- 开启 `settingSources: ['project']`，让 SDK 读取项目级 skills 和记忆文件
- 默认放开 `Skill, Read, Glob, Grep, Bash`，让 Claude 能主动调用项目 skills
- 脚本要求 Claude 输出严格 JSON，便于自动化解析
- 飞书 `@` 使用 `FEISHU_USER_ID_MAP_JSON` 做邮箱到飞书用户 ID 的映射

## 安装

```bash
npm install
cp .env.example .env
```

## 关键配置

- `REPO_BASE_DIR`: 本地仓库根目录，脚本会在这里维护 checkout
- `REPO_PATH_MAP_JSON`: repo key 到本地路径的映射，优先级高于自动 clone
- `REPO_URL_REWRITE_FROM` / `REPO_URL_REWRITE_TO`: 用于把 webhook 里的 HTTP 地址改写成可 clone 的地址
- `CLAUDE_REVIEW_MIN_SCORE`: 低于该分数触发飞书告警
- `FEISHU_USER_ID_MAP_JSON`: `{"邮箱":"飞书user_id/open_id"}`

## 运行

```bash
npm start
```

## Claude 输出格式

脚本会要求 Claude 输出如下 JSON：

```json
{
  "score": 0,
  "summary": "",
  "risks": [],
  "must_fix": [],
  "nice_to_have": [],
  "should_alert": false
}
```

## 注意

- 这里默认使用 Anthropic 官方 Agent SDK 包：`@anthropic-ai/claude-agent-sdk`
- 当前版本把飞书提醒实现为群机器人 webhook；如果你们后续要做更精确的用户查找，可以再接飞书通讯录 API
