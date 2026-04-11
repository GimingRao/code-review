# Code Review Worker

一个基于 Kafka 的提交评审脚本：

1. 消费 `code-events` 主题中的 `git.commit` 事件
2. 根据 Kafka 消息中的 `repo.key` 定位本地仓库，并 checkout 到指定 commit
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
cp feishu-users.example.json feishu-users.json
```

## 关键配置

- 所有运行配置统一写在项目根目录的 `config.yaml`
- `kafka.brokers`: Kafka broker 列表
- `repo.localPaths.<repoKey>`: Kafka 事件中的 `repo.key` 到本地仓库路径的映射
- `claude.minScore`: 低于该分数触发飞书告警
- `feishu.userMapFile`: 飞书用户映射 JSON 文件路径

## 运行

```bash
npm start
```

运行配置请直接编辑项目根目录下的 `config.yaml`。
飞书用户映射示例见 [feishu-users.example.json](/Users/giming/code/code-review/feishu-users.example.json)。

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
- 飞书邮箱映射 JSON 使用 `email -> user info` 结构，当前实际只用到 `id` 和 `name`
- 不再自动 clone 仓库，目标仓库必须已经存在于本地，并在 `repo.localPaths` 中配置映射
